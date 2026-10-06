# Browser-lane etiquette

Founder rule, 2026-09-21. Read this **before starting any browser lane** —
playwright e2e, the playtest lane, `mobile-audit.mjs`, `design-detect.mjs`,
`verify-pwa.mjs`, `verify-splash.mjs`, or anything that launches Chrome.

**The human is on this box while agents run.** A browser lane that eats CPU for
ten minutes is an interruption even when it is invisible. These rules are not
about visible windows (those were already banned) — they are about **load**.

## 1. Headless, always, and explicitly

Every browser this repo starts passes `--headless=new`, a dedicated
`--user-data-dir`, and its own `--remote-debugging-port`. Never attach to, drive,
or kill the human's own Chrome (a Wayland `--ozone-platform=wayland` profile
under `~/.config/google-chrome` or `/tmp/opencode/chrome-cdp` is almost always
theirs — leave it alone).

## 2. Full e2e is a BATCH-END lane, not a per-slice one

`npm run test:e2e` is ~90 specs against a live database and takes **8–10 minutes**
of real CPU. Run it ONCE per batch, when the human is away, and say so in the
report.

### Which audit sees which half

The two audit lanes split on **credentials**, and the split is the thing to
remember, because a check on the wrong half is a check that can never pass:

| Lane | Sees | Measures |
|---|---|---|
| `scripts/mobile-audit.mjs` | signed OUT | 7 phone/landscape viewports × `/login`, `/reset-password`, `/playdate/:id`, `/browse`; overflow, text controls, 44px targets, contrast, the one-screen fold |
| `scripts/layout-width-check.mjs` | signed OUT | 7 widths on one route; overflow + the content column's phone measure. **Not the nav** — a signed-out route has none |
| `scripts/signed-in-audit.mjs` | signed IN | feed, post form, profile, settings × 3 widths; overflow, real sub-44 targets, missing `alt`, console errors, **and the shell**: nav present, named, ≥44px, bottom bar below `md` / left rail at `md` up |

`signed-in-audit.mjs` needs `e2e/.auth/marker-state.json` (the e2e suite's own
`auth.setup` writes it; run the suite once). **Without it the lane exits 2 saying
`NOT MEASURED`** — it does not quietly measure nothing and call it a pass. It
prints every sub-44 element it EXCUSED, with the reason, so an over-broad
exemption is visible rather than green.

Both audits are proven able to fail: forcing the theme radio's label to 20px and
a nav target to 20px each turn `signed-in-audit` red.

## 3. During a slice, run TARGETED specs only

Name the files the change can reach:

```bash
npx playwright test e2e/that-spec.e2e.ts
```

That is seconds, not minutes, and it is what actually catches a regression in the
slice's blast radius.

## 4. Never run a browser lane in the foreground of a long turn

Background it with output redirected to a file, then read the file. The full
suite exceeds the default 600s tool timeout and will be killed mid-run otherwise.

## 5. Deprioritize it

Wrap heavy lanes in `nice -n 19` so the human's work always wins the CPU. There
is no latency requirement on a check.

## 6. Release what you start

Kill the playtest Chrome and any preview server when the lane finishes — kill the
**LISTENER by port**, not by `pkill -f` (which matches the agent's own shell and
kills the wrong thing).

## 7. NEVER open a real URL in the human's browser

Several scripts in this repo drive the human's OWN Chrome over CDP to reach a
logged-in session: `scripts/apply-migration.mjs`, `scripts/cdp-sql-runner.py`,
`scripts/sweep-e2e-markers.mjs`, `scripts/migrate-kid-photos.mjs`. They call
`page.goto('https://supabase.com/dashboard')`, which **visibly navigates the
window the human is working in.** On a machine where the human is mid-task that
is indistinguishable from a browser hijack.

- Confirm with the human BEFORE running any of them, and say which URL will
  appear and in which window.
- **Prefer the browserless path: `bash scripts/db-sql.sh`.** It uses
  `SUPABASE_ACCESS_TOKEN` from `.env` against `api.supabase.com` and needs no
  browser at all. `apply-migration.mjs` has NO API fallback — it always harvests
  its token from CDP Chrome, so it always touches the human's window. Use
  `db-sql.sh` unless there is a specific reason not to.
- If you did not start a browser, do not assume a URL that appeared is yours —
  say so plainly and let the human identify it, rather than guessing or
  apologising for something you did not do.

### Identifying whose Chrome is whose

Before touching a CDP Chrome, check who owns it:

```bash
ps -o pid,etime,args -p "$(ss -ltnp | grep 9222 | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
```

A `--ozone-platform=wayland --user-data-dir=/tmp/opencode/chrome-cdp` process
with a long elapsed time is **the human's** — it is their real desktop browser,
and on 2026-09-21 it held Todoist, Notion, GitHub and a Supabase SQL editor.
Leave it alone; use `db-sql.sh` instead.

## The rule of thumb

**If a check takes longer than the human's patience, it is a batch-end check.**
Targeted runs during slices; full runs at the boundary. And if a check would put
pixels on the human's screen, it is not a check — it is an interruption, and it
needs their explicit yes first.
