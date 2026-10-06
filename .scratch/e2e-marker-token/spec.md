# An e2e run that skips the `setup` project drives the app with an EXPIRED session — spec (2026-10-05)

**Found while verifying the V31 map-and-distance slice.** Two spec failures that
looked like product regressions were neither: the marker's Supabase access token
had expired, and nothing in the harness noticed.

> ## ⚠️ CORRECTION, 2026-10-05 late — the trigger below was first recorded WRONG, and this title was too
>
> This file originally said *"a FILTERED e2e run"* and explained it as "a filtered
> run matches zero tests in the `setup` project, and Playwright does not fail a
> dependency that selected nothing". **That is false on Playwright 1.63, and it was
> measured:** a project DEPENDENCY runs in full and unfiltered, so
> `npx playwright test e2e/zip-radius.e2e.ts` DOES run the setup project — with a
> deliberately stale `marker-state.json` in place, that plain filtered command
> **refreshed the marker and passed 4/4** (`✓ 1 [setup] › e2e/auth.setup.ts …`,
> then `4 passed`).
>
> **The real trigger is `--no-deps`**, which deletes the dependency edge, **or any
> second config that pins chromium's storageState and drops the setup project** —
> the `playwright.private.config.ts` shape. And that is not a hypothetical: the
> V31 session's actual command was
> `--config playwright.private.config.ts --project=chromium --no-deps e2e/places-map-view.e2e.ts`,
> as its own `.scratch/map-and-distance/STOP-token-expired.md` says — *"`--no-deps`
> + the private config's pinned storageState means the `setup` project never
> runs"*. The original claim was inferred from a filtered command's line count
> instead of measured, and it sent this slice's first fix in the wrong direction.
>
> **The fix landed anyway** (`7045b98`, §3 below): the guard does not care HOW the
> setup project was skipped — it asks whether the session the run is about to trust
> is still alive, which covers `--no-deps`, the private-config shape and anything
> else that produces the same state.

## 1. The defect, measured

Supabase access tokens live **3600 s** (`exp − iat`). `e2e/auth.setup.ts` signs
up a fresh marker and rewrites `e2e/.auth/marker-state.json`, but an invocation
that skips that project (see the correction above: `--no-deps`, or a second config
that pins `chromium`'s storageState) runs `chromium` against whatever storageState
file the last FULL run left behind.

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
indistinguishable from a flake is a failure nobody diagnoses"*). Every run that
skips the setup project more than an hour after a full run is affected — i.e. every
`--no-deps` run and every run under a private config that pins chromium's
storageState, which is how a slice's own verification was often done before the
V32 `E2E_BASE_URL` change made a plain filtered run the normal path (and a plain
filtered run is safe: it runs the setup project, per the correction at the top).

## 3. The fix — ✅ SHIPPED `7045b98`, and it is the option the measurement forced

**Option 2 was built, and option 1 was ruled out on evidence.** Option 1 (force
`setup` from the config) CANNOT fix the measured instance: `--no-deps` deletes the
dependency edge, so no `projects`/`testMatch` change brings the setup project back.
It would also have had to edit `playwright.config.ts`, which is
`config-guard`-protected (`scripts/guards/config-guard.sh`), so `npm run verify`
would fail without `ALLOW_CONFIG_CHANGE`.

What shipped:

- **`src/lib/markerToken.ts`** (+ a 29-test sibling) — `isMarkerTokenExpired` /
  `diagnoseMarkerToken` / `findStoredMarkerSession`. It fails CLOSED: an absent
  file, a non-JWT token or a missing numeric `exp` each report expired, with their
  own `reason`. Pure, no browser, no disk.
- **`e2e/fixtures.ts`** — a `test.beforeEach` registered at module load (all 69
  spec files import it, so no per-spec edit) that throws **before the first
  navigation**: *"marker session expired — … This is a HARNESS failure, not a
  product one: no spec has run yet, so nothing here is a regression in src/.
  re-run with e2e/auth.setup.ts named, or run the full suite."* The `setup` project
  is exempt, because it IS the remedy.
- Gate on the commit: **82 files / 2462 tests / 86 warnings / 0 errors / GUARDS PASS**.

**And the controls are recorded because a guard nobody has seen fire is not a
guard** (both reproduced by the orchestrator, not taken from the builder):
`--no-deps` with a tampered `exp` → **EXIT 1, 3 failed in ~350–450 ms each with
that message and ZERO product-shaped failures**; and the plain filtered run with
the same stale file → **EXIT 0, the setup project ran, 4 passed**. The tampered
file was restored byte-for-byte (`sha256 2ece0e93…843f`, verified).

Do NOT widen the token lifetime, and do NOT commit a refreshed
`marker-state.json` — it is gitignored and machine-local.

## 4. Acceptance criteria

1. With an expired `e2e/.auth/marker-state.json`, a run that SKIPS the setup
   project (`npx playwright test e2e/zip-radius.e2e.ts --no-deps`, or under a
   config that pins chromium's storageState without the setup dependency) exits
   NON-ZERO with a message naming the expiry, the file and the remedy — it never
   reports a product-shaped failure. ✅ Measured: EXIT 1, 3 failed, zero
   product-shaped failures.
2. With a fresh token, that same run behaves exactly as it does today (✅ 3
   passed), AND a plain filtered run with a STALE token still works by refreshing
   the marker, because Playwright runs a project dependency unfiltered (✅ setup
   ran, 4 passed).
3. A unit test pins the decision (a pure `isMarkerTokenExpired(state, now)`
   seam with a sibling test — no browser needed).
4. `npm run verify` exits 0.

**Blocked by:** none.

**Status:** ready-for-agent
