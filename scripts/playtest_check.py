#!/usr/bin/env python3
"""Headless playtest check — drives routes in dedicated headless Chrome via CDP.

Reads a routes JSON: [{"path": "/", "must_contain": []}, ...]
For each route: navigate, wait for load, assert must_contain substrings,
harvest uncaught JS errors, save a screenshot.
Writes verdict.json + verdict.md. Exit 0 = PASS, 1 = FAIL.
Zero visible windows: chrome runs --headless=new on an isolated profile.
"""
import argparse, json, base64, time, urllib.request
import websocket  # websocket-client — run with the interpreter that has it

def http_json(url, method="GET"):
    req = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())

HARVESTER = """
window.__ptErrors = window.__ptErrors || [];
window.addEventListener('error', function(e){ window.__ptErrors.push(String(e.message || e)); });
window.addEventListener('unhandledrejection', function(e){ window.__ptErrors.push('unhandledrejection: ' + String(e.reason)); });
"""

class Page:
    def __init__(self, ws_url, timeout=25):
        self.ws = websocket.create_connection(ws_url, timeout=timeout)
        self.mid = 0

    def _send(self, method, params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                if "error" in msg:
                    raise RuntimeError(f"CDP {method}: {msg['error']}")
                return msg.get("result", {})

    def enable(self):
        self._send("Page.enable", {})
        self._send("Runtime.enable", {})

    def add_init(self):
        self._send("Page.addScriptToEvaluateOnNewDocument", {"source": HARVESTER})

    def navigate(self, url, wait_s=20):
        self._send("Page.navigate", {"url": url})
        deadline = time.time() + wait_s
        while time.time() < deadline:
            try:
                r = self._send("Runtime.evaluate",
                               {"expression": "document.readyState", "returnByValue": True})
                if r.get("result", {}).get("value") == "complete":
                    return True
            except websocket.WebSocketTimeoutException:
                pass
            time.sleep(0.4)
        return False

    def eval_str(self, expr):
        r = self._send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r.get("result", {}).get("value")

    def screenshot(self, path):
        data = self._send("Page.captureScreenshot", {"format": "png"})
        open(path, "wb").write(base64.b64decode(data["data"]))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--routes", required=True)
    a = ap.parse_args()

    version = http_json(f"http://127.0.0.1:{a.port}/json/version")
    routes = json.load(open(a.routes))
    results, ok = [], True
    for rt in routes:
        url = a.base.rstrip("/") + rt["path"]
        tab = http_json(f"http://127.0.0.1:{a.port}/json/new?about:blank", method="PUT")
        p = Page(tab["webSocketDebuggerUrl"])
        entry = {"path": rt["path"], "url": url, "loaded": False, "mounted": None,
                 "must_contain": rt.get("must_contain", []), "missing": [], "errors": [],
                 "screenshot": None}
        try:
            p.enable()
            p.add_init()
            entry["loaded"] = p.navigate(url)
            time.sleep(1.0)  # settle SPA render
            if entry["loaded"]:
                entry["mounted"] = p.eval_str(
                    "(document.body && document.body.innerText ? document.body.innerText.length : 0)")
                text = p.eval_str("document.body.innerText") or ""
                for needle in entry["must_contain"]:
                    if needle not in text:
                        entry["missing"].append(needle)
                errs = p.eval_str("JSON.stringify(window.__ptErrors || [])") or "[]"
                entry["errors"] = json.loads(errs)
                shot = f"{a.out}/route{rt['path'].replace('/', '_') or '_root'}.png"
                p.screenshot(shot)
                entry["screenshot"] = shot
        except Exception as e:
            entry["errors"].append(f"driver: {type(e).__name__}: {e}")
        finally:
            try:
                p.ws.close()
            except Exception:
                pass
        if not entry["loaded"] or entry["mounted"] in (None, 0) or entry["missing"] or entry["errors"]:
            ok = False
        results.append(entry)

    json.dump({"base": a.base, "browser": version.get("Browser"), "pass": ok, "routes": results},
              open(f"{a.out}/verdict.json", "w"), indent=2)
    lines = [f"# Playtest verdict — {a.base}", "", f"**{'PASS' if ok else 'FAIL'}** — {len(results)} routes", ""]
    for r in results:
        status = "ok" if (r["loaded"] and r["mounted"] not in (None, 0)
                          and not r["missing"] and not r["errors"]) else "FAIL"
        lines.append(f"- {r['path']}: {status} (chars={r['mounted']}, errors={len(r['errors'])}, "
                     f"shot={'yes' if r['screenshot'] else 'no'})")
        for m in r["missing"]:
            lines.append(f"  - missing text: {m!r}")
        for e in r["errors"][:5]:
            lines.append(f"  - error: {e}")
    open(f"{a.out}/verdict.md", "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    raise SystemExit(0 if ok else 1)

if __name__ == "__main__":
    main()
