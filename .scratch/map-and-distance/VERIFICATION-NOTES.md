# V31 map-and-distance — orchestrator verification notes (2026-10-05 ~21:20)

Written while the dispatching session's builder was still mid-verification, so
nothing here is a claim about the final tree. It is the evidence trail for the
two failures the builder saw, and the recipe the orchestrator must use to re-run
the affected specs (neither is a product defect).

## The two failures, and why they are the HARNESS, not the slice

`.scratch/map-and-distance/spec-map-view.log` (21:18:39) — 10 passed / 2 failed:

1. `e2e/places-map-view.e2e.ts:1467` — *"the marker home_zip could not be read
   over REST — a restore would be a guess"* (thrown by the spec's own guard at
   `:1472`).
2. `e2e/places-map-view.e2e.ts:1745` — *"the geocoded centre must reframe the
   drawn circle"*; `dCommitted === "M0 0"`.

**Both are one cause, and it is measured, not inferred.**

```console
$ node -e '…decode both storageState access tokens…'
e2e/.auth/marker-state.json                          origin http://localhost:4180
  token exp 2026-10-06T04:09:30Z   uid 2c3f636e-2fb2-4b5c-9001-c360c50f4a25
.scratch/map-and-distance/marker-state-4191.json      origin http://localhost:4191
  token exp 2026-10-06T04:09:30Z   uid 2c3f636e-2fb2-4b5c-9001-c360c50f4a25
now: 2026-10-06T04:20Z   →  the token EXPIRED ~11 minutes before that spec run
```

The app's profile read 401s, so there is no `home_zip` → no home pin on the map
→ `radiusPreviewCircle` projects nothing → `d="M0 0"`, and the spec's own
`readMarkerHomeZip()` sees `!res.ok` and (correctly) refuses to guess.
The builder's own probe agrees (`probe6.log`, 21:19:34): on ENTRY the home
marker's box is `{w:0,h:0}` and `circleD:"M0 0"`; only after the slider moves
does the circle get a real `d` (off-pane, centred on a frame it cannot compute).

## ⚠️ THE MECHANISM, and it will bite every filtered run

`e2e/auth.setup.ts` signs up a FRESH marker and rewrites
`e2e/.auth/marker-state.json` — but **only when a full-suite run selects it**.
`playwright.config.ts` selects setup by `testMatch: '**/auth.setup.ts'`, so a
FILTERED run such as

```bash
npx playwright test e2e/places-map-view.e2e.ts     # ← selects ZERO setup tests
```

matches no test in the `setup` project, and Playwright does not fail a missing
dependency — it runs `chromium` against **the storageState file left by the last
full run**. Supabase access tokens live **3600 s** (`exp − iat`), so from ~1 hour
after the last full run every filtered run drives the app with an expired
session and produces failures that look like product defects.

`e2e/.auth/marker-state.json`'s mtime proves this: **20:09:33**, hours before the
21:17–21:18 run that failed. The setup project did not run.

**Consequence for verification — always refresh the token in the same
invocation:**

```bash
E2E_BASE_URL=http://localhost:4191 npx playwright test e2e/auth.setup.ts e2e/<the-specs>.e2e.ts
```

Naming `auth.setup.ts` makes the setup project selectable, so the marker is
re-created (fresh 1-hour token) and the specs run against it in the same run.
`playwright.private.config.ts` + the copied `marker-state-4191.json` are the OLD
recipe and are what made the expiry invisible; both are untracked temp files and
must never be committed. The V32 `E2E_BASE_URL` constant is the correct path.

**This is a repo-level defect, not a slice defect, and it is worth its own small
slice** (filed here rather than fixed silently): a filtered run whose
storageState token is expired should FAIL LOUDLY with "run the setup project",
or the config should force the setup project when the token is stale.

## ✅ PROOF, from the app's own error body (added 21:25)

The builder's own re-runs, with `--no-deps` and the private config, produced the
defect's signature verbatim. `.scratch/map-and-distance/spec-places.log`:

```
Error: REST follows?place_id=eq.26a77f22…&select=id → HTTP 401
       {"code":"PGRST303","details":null,"hint":null,"message":"JWT expired"}
Error: playdates insert HTTP 401 {"code":"PGRST303",…,"message":"JWT expired"}
  4 failed (…:2055, …:2279, …:2652, …:2889)   /   19 passed (1.6m)
```

and `.scratch/map-and-distance/spec-map-view2.log`: **11 passed / 1 failed / 1
skipped**, the failure being `:1467`'s home_zip guard. **`:1745` PASSED on the
re-run** — so the circle does draw when the session is usable, which is why
calling that one a product regression would have been wrong.

`JWT expired` is the app's own words for it. None of these five is a code defect.
A fresh-token run of the same specs is the only thing that can settle the slice.

## What is NOT established here

- Whether the final tree is green. That needs the gate + a fresh-token spec run
  AFTER the writer stops, which is the next step.
- Whether the `places.e2e.ts` conversions pass — the builder had not logged that
  spec as of 21:20.
