import json, sys, time, urllib.request
import websockets.sync.client as wsclient

PROJECT = 'ayzvjwxbxyrcgyoeaxuk'
BROWSER_WS = json.load(urllib.request.urlopen('http://127.0.0.1:9222/json/version'))['webSocketDebuggerUrl']

class CDP:
    def __init__(self):
        self.ws = wsclient.connect(BROWSER_WS, timeout=60)
        self.mid = 0
    def send(self, method, session_id=None, **params):
        self.mid += 1
        msg = {'id': self.mid, 'method': method, 'params': params}
        if session_id: msg['sessionId'] = session_id
        self.ws.send(json.dumps(msg))
        while True:
            r = json.loads(self.ws.recv())
            if r.get('id') == self.mid:
                if 'error' in r: raise RuntimeError(r['error'])
                return r.get('result', {})
    def eval(self, sid, expr, await_promise=False):
        r = self.send('Runtime.evaluate', session_id=sid, expression=expr,
                      returnByValue=True, awaitPromise=await_promise)
        if r.get('exceptionDetails'):
            raise RuntimeError(json.dumps(r['exceptionDetails'])[:500])
        return r.get('result', {}).get('value')

def find_sql_tab():
    tabs = json.load(urllib.request.urlopen('http://127.0.0.1:9222/json'))
    for t in tabs:
        if t.get('type') == 'page' and f'/project/{PROJECT}/sql/' in t.get('url', ''):
            return t
    return None

def main():
    sql = sys.argv[1]
    cdp = CDP()
    tab = find_sql_tab()
    if tab:
        tid = tab['id']
    else:
        created = cdp.send('Target.createTarget', url=f'https://supabase.com/dashboard/project/{PROJECT}/sql/new')
        tid = created['targetId']
        time.sleep(10)
    cdp.send('Target.activateTarget', targetId=tid)
    attached = cdp.send('Target.attachToTarget', targetId=tid, flatten=True)
    sid = attached['sessionId']
    time.sleep(3)

    set_expr = """
(async () => {
  for (let i = 0; i < 40; i++) {
    if (window.monaco) break;
    await new Promise(r => setTimeout(r, 500));
  }
  if (!window.monaco) return 'NO_MONACO';
  const eds = window.monaco.editor.getEditors();
  if (!eds.length) return 'NO_EDITOR';
  eds[0].focus();
  eds[0].setValue(%s);
  return 'SET_OK';
})()
""" % json.dumps(sql)
    val = cdp.eval(sid, set_expr, await_promise=True)
    print('set:', val)
    if val != 'SET_OK':
        sys.exit(1)

    print('run:', cdp.eval(sid, """
(() => {
  const run = [...document.querySelectorAll('button')].find(b => /run/i.test(b.textContent) && !b.disabled);
  if (!run) return 'NO_RUN_BTN';
  run.click();
  return 'CLICKED:' + run.textContent.trim();
})()
"""))
    time.sleep(8)

    # destructive-op confirm if it appeared
    print('confirm:', cdp.eval(sid, """
(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => /run query|confirm/i.test(b.textContent) && !b.disabled);
  if (!btns.length) return 'NO_CONFIRM';
  btns[btns.length - 1].click();
  return 'CONFIRMED';
})()
"""))
    time.sleep(6)
    tail = cdp.eval(sid, "document.body.innerText.slice(-2500)")
    print('--- RESULT TAIL ---')
    print(tail)

main()