# A filtered e2e run drives the app with an EXPIRED session — spec (2026-10-05)

**Found while verifying the V31 map-and-distance slice.** Two spec failures that
looked like product regressions were neither: the marker's Supabase access token
had expired, and nothing in the harness noticed.

## 1. The defect, measured

Supabase access tokens live **3600 s** (`exp − iat`). `e2e/auth.setup.ts` signs
up a fresh marker and rewrites `e2e/.auth/marker-state.json`, but
`playwright.config.ts` selects that spec with `testMatch: '**/auth.setup.ts'` —
so a **filtered** run matches zero tests in the `setup` project, and Playwright
does not fail a dependency that selected nothing. `chromium` then runs against
whatever storageState file the last FULL run left behind.

Evidence, 2026-10-05 21:20 local:

```console
e2e/.auth/marker-state.json  mtime 20:09:33   token exp 2026-10-06T04:09:30Z
spec run began               21:17           now       2026-10-06T04:20Z
```

The token expired ~11 minutes before the run. The app's profile read 401s, so:

- `e2e/places-map-view.e2e.ts:1467` threw its own guard — *"the marker home_zip
  could not be read over REST"* (`readMarkerHomeZip` saw `!res.ok`);
- `e2e/places-map-view.e2e.ts:1745` failed with `dCommitted === "M0 0"` — no
  `home_zip` means no home pin, so `radiusPreviewCircle` projects nothing.

**Neither is a product defect.** Both are the session.

## 2. Why it matters more than one red spec

The failure signature is *indistinguishable from a flake or a regression*: the
spec times out, or a geometry assertion sees an empty path. This repo has spent
multiple batches chasing exactly that shape (`RELEASE-CHECKLIST.md:277-278`
records a "named known flake"; V31's own record says *"a failure whose symptom is
indistinguishable from a flake is a failure nobody diagnoses"*). Every filtered
local run more than an hour after a full run is affected, which is most of them,
because a slice's own verification is filtered by definition.

## 3. The fix (small, and it must fail LOUDLY)

Pick ONE, in this order of preference:

1. **Make the config force the setup project when the token is stale.** Read
   `e2e/.auth/marker-state.json` at config load (it is already resolved there as
   `markerState`), decode the `access_token`'s `exp`, and if it is in the past
   (or the file is absent) add `'setup'` to the selected projects — the `theme`
   and `config-guard` precedents show a config may read the filesystem.
2. **Fail fast in `e2e/fixtures.ts`.** A shared guard that any spec's first
   authenticated call goes through: if the token is expired, throw
   `marker session expired — re-run with e2e/auth.setup.ts named, or run the full
   suite`. Loud beats silent, and it costs one decode.

Do NOT widen the token lifetime, and do NOT commit a refreshed
`marker-state.json` — it is gitignored and machine-local.

## 4. Acceptance criteria

1. With an expired `e2e/.auth/marker-state.json`, a filtered run
   (`npx playwright test e2e/places-map-view.e2e.ts`) either refreshes the marker
   automatically or exits non-zero with a message naming the expiry and the
   remedy — it never reports a product-shaped failure.
2. With a fresh token, the same filtered run behaves exactly as it does today.
3. A unit test pins the decision (a pure `isMarkerTokenExpired(state, now)`
   seam with a sibling test — no browser needed).
4. `npm run verify` exits 0.

**Blocked by:** none.

**Status:** ready-for-agent
