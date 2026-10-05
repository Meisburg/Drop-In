# Implementation Plan: V31 — what the first screen offers

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below must be executable without interpretation. If a slice cannot state its
> acceptance criteria and verification command, it is not ready.
>
> The default slice gate is `npm run verify` (build + test + lint + a11y:focus +
> steering-lint + guards). Anything extra is pinned per slice.
>
> V30's plan is preserved **byte-identically** at `plan-v30-backup.md`
> (sha256 `1bc75f05…`, matching `plan.md` at `bab820e`) and is **not** edited.

**Bottom line:** three slices and **no new capability**. The first screen stops
offering only the one thing a brand-new parent cannot do; the nightly lane's one
unexplained failure gets a cause instead of a shrug; and a config number stops
contradicting the assertion that pins it. **No migration. No new route. No new
table. No SQL.**

- **Base:** `ba4cfe4` on `master` (three docs/script commits ahead of
  `origin/master` at `bab820e`); tracked tree clean.
- **Gate measured THIS TURN, not remembered:** `npm run verify` → **exit 0** on
  the clean tree at `ba4cfe4` — **75 test files / 2192 tests passed**, **86 lint
  warnings / 0 errors**, **GUARDS: PASS** (factory-guard: 185 checks).
  **Baseline that must not regress: 75 / 2192 / 86 / 0.**
- **Source of truth:** `research/first-open-validation/2026-10-05-simulated-panel.md`
  (the evidence behind v31-1, *with its tier stated*), `task-state.md:30-35`
  (the nightly lane's classifications), `docs/agents/compute-policy.md` (the
  55-vs-52 contradiction and the assertion that blocks it).

---

## 1. What this revision is

| Slice | Item | Size | Risk |
|---|---|---|---|
| **v31-1** | The empty feed offers what's around | small | new copy + one door; a **simulated** panel stands behind it |
| **v31-2** | The nightly lane's one unexplained failure has a cause | small | diagnosis-first; the honest outcome may be a finding, not a fix |
| **v31-3** | The compute config and its pinned assertion agree | tiny | a config number and a test assertion must move together |

---

## 2. The measured state of the base

### 2.1 Why v31-1 exists, and the tier of its evidence

The founder's 2026-10-05 decisions, in order:

1. A **simulated** five-archetype panel was run against the pre-registered
   first-open instrument (`2026-10-05-simulated-panel.md`). **It is not the
   pre-registered test**, which is still unrun. Its own numbers do not clear the
   bar it claims to clear: **B1 = 2/5 against a 3+ threshold**, and the kit's
   interpretation rule (`2026-09-29-parent-test-scoring.md:52`) is a conjunction
   (B1 3+ **and** B2 < 3) that these numbers do not satisfy.
2. What DID fire is **W** — any-of-five, on P3 and P4 reaching for browse
   unprompted. W is the pre-registered bar whose remedy is *"first screen
   changes"*.
3. **The founder chose to act on the simulation anyway, because the change is
   cheap and reversible** — and the panel is evidence *against* the shape the
   next-batch brief had queued ("You'd be the first parent here"), which needs a
   V27 reversal. **This slice needs no V27 reversal: it adds no post CTA.**

**The measured premise, from the tree rather than the panel:** the empty feed
offers **only** radius escapes. It has **no door to `/browse`** inside it
(`FeedPage.tsx:1371-1375`; the only browse door is the shell's nav tab,
`App.tsx:502`), and `RadiusEmptyState` renders a filled primary action on **no**
feed screen. The panel's parents reached for `Places` from the nav while the
state in front of them offered three ways to widen a radius.

**One honesty note the panel does not carry:** `/browse` is **also**
radius-filtered (`places.ts:2162-2169`; `PlaceDirectory.tsx:1183-1184` renders
the same empty state when the radius is the reason). So this slice makes the
first screen offer the *places* directory, which is likelier to hold something
than the drop-in feed (239 seeded places vs ~14 real drop-ins statewide) — it
does **not** promise a full screen, and the copy must not promise one either.

**A stale premise, corrected so it is not inherited:** the pre-registered kit's
"current first screen" description (`2026-09-29-parent-test-scoring.md:10`) names
a secondary **"See what's around" → browse** control. **No such control exists in
the tree today** (`grep -rn "See what's around" src/` → nothing). The kit
describes a screen the app does not have, which is why this slice ADDS the door
rather than reordering one.

---

## 3. v31-1 — The empty feed offers what's around

- **Objective:** on an empty feed, the parent's first offered action is the
  places directory, with the radius escapes kept as secondary; Browse's own
  empty state is unchanged.
- **Files in scope:** `src/lib/feed.ts`, `src/lib/feed.test.ts`,
  `src/components/RadiusEmptyState.tsx`, `src/pages/FeedPage.tsx`,
  `e2e/feed-empty-state.e2e.ts`.
- **Approach:** one new prop on the shared `RadiusEmptyState` (`showBrowseCta`,
  default **false**), so Browse — which IS browse — never renders a door to
  itself and keeps its default post CTA. `FeedPage` passes it. The door is a
  `Link to="/browse"` and is the state's **only filled control**; the escapes
  stay secondary buttons below it. **`showPostCta` stays `false`** — V27's ruling
  ("the raised nav `+` is the persistent post action") is not touched. Copy lands
  in `src/lib/feed.ts` as pinned consts/functions with a sibling test (the build
  law: React renders, `lib/` decides), beside `emptyRadiusCopy` and
  `radiusEscapes`: a headline rendered **above** the honest count, and the door's
  label. Neither names a number, and neither names a place category (the
  taxonomy guard judges registered consts only, and `lib/feed.ts` is not
  registered — so this is a deliberate avoidance, not a guard pass).
- **Acceptance criteria:**
  - On the feed's empty state, a `Link` to `/browse` renders with the pinned
    label, carries its own testid, and meets the 44px tap floor (`min-h-11`).
  - It renders **above** the radius escapes and is the state's only
    primary-styled control; the escapes remain enabled secondary buttons.
  - Browse's empty state renders **no** door to `/browse` and keeps its post CTA.
  - The feed's empty state still renders **no** "Post a drop-in" link, still
    names the real radius, and still never says "today" — the existing
    assertions stand unmodified.
  - The new copy is pinned by a sibling test in `src/lib/feed.test.ts`: the exact
    label string, and that the headline contains **no digit**.
- **Verification command:** `npm run verify`; `npx playwright test
  e2e/feed-empty-state.e2e.ts`.
- **Budget:** one local builder context; a door and two copy consts.
- **Depends on:** nothing.

---

## 4. v31-2 — The nightly lane's one unexplained failure has a cause

- **Objective:** the fourth nightly failure gets a cause with raw output, or a
  recorded finding that names what was established and what would settle it.
- **Problem:** `.github/workflows/e2e-scheduled.yml` has failed every night since
  2026-09-28. Of the last run's four failures, three are classified
  (`task-state.md:31-33`). The fourth — `e2e/push-subscribe.e2e.ts:489`,
  *"Notifications are on"* — is **unexplained**, and the record says so in those
  words (`task-state.md:34`): *"needs a real diagnosis rather than a shrug."*
- **Files in scope:** `e2e/push-subscribe.e2e.ts` (and, only if the cause is
  there, the component or lib it drives); `docs/agents/ci.md`; `task-state.md`.
- **Approach:** diagnosis first, and the deliverable is a **cause with raw
  output**, not a code change. The live DB makes state-dependence the leading
  hypothesis: a real user's `push_subscriptions` row, a leftover fixture, or the
  test's position relative to the specs that sign a marker out. If the cause is
  in our spec or code, fix it in this slice; if the cause is environmental (the
  nightly runner differs from this machine), record the finding in `ci.md` and
  leave the fix to the lane's own batch. **Both outcomes close this slice; a
  shrug does not.**
- **Acceptance criteria:**
  - The assertion at `:489` is quoted with its file:line and the state it depends
    on, each dependency cited to the code that provides it.
  - The spec is run and the raw outcome recorded verbatim (command + observed
    result), pass or fail. **A local pass is stated as "rules X in/out", never as
    a fix.**
  - At least one competing hypothesis is **ruled out by evidence**, not by
    assertion.
  - If a defect is found in the repo, it is fixed and the spec re-run green; if
    not, the finding lands in `docs/agents/ci.md` with the next check that would
    settle it — and `task-state.md`'s "unexplained" label is replaced with what
    was actually established.
- **Verification command:** `npx playwright test e2e/push-subscribe.e2e.ts
  --reporter=list` (raw output captured); `npm run verify` if any source changes.
- **Budget:** one local builder context; a targeted spec, not the suite.
- **Depends on:** nothing. **Out of scope:** the other three failures (each
  already classified; `places-map-view`'s `aria-current` is a product-surface
  question, not a flake) and making the lane blocking.

---

## 5. v31-3 — The compute config and its pinned assertion agree

- **Objective:** the strata-max RAM number is the measured one, and the test that
  encodes its arithmetic moves with it.
- **Problem, already written down and deliberately not fixed silently:**
  `docs/agents/compute-policy.md` records that lowering `factory/config.json`'s
  strata-max `ram_gb` from the documented 55 to the measured **52** fails **4
  assertions** in `scripts/factory/scheduler.test.mjs` (line ~299 pins
  `/RAM: needs 62 GB/` = 55 + task 3 + reserve 4). A code change that must move a
  config **and** its assertion together is its own slice, so it was recorded
  rather than done.
- **Files in scope:** `factory/config.json`, `scripts/factory/scheduler.test.mjs`,
  `docs/agents/compute-policy.md`.
- **Approach:** re-measure the host's actual reservation
  (`systemctl show`/unit config) rather than trusting either number, then move
  the config and every assertion that encodes the old arithmetic **in one diff**,
  with the reason in the commit body. If the re-measurement says 55 is right
  after all, the fix is the **document**: the doc is corrected, the config is not
  touched, and the slice still closes.
- **Acceptance criteria:**
  - The number in `factory/config.json` is justified by a fresh measurement of
    the host, quoted (command + observed value) in the slice's record.
  - Config and assertions move **together**: `node
    scripts/factory/scheduler.test.mjs` and `npm run guards` both exit 0 at the
    new value, and the diff leaves no assertion encoding the old arithmetic.
  - `compute-policy.md`'s open item is closed with a date and the measured value,
    or explicitly re-opened with what is still unknown.
- **Verification command:** `npm run verify` (the guards run inside it);
  `npx vitest run scripts/factory/scheduler.test.mjs` — ⚠️ that file is a
  **vitest** suite, not a plain node script: running it as `node
  scripts/factory/scheduler.test.mjs` dies inside vitest's own loader, which is
  how this line was caught before dispatch.
- **Budget:** one local builder context; a config line and its assertions.
- **Depends on:** nothing.

---

## 5b. v31-5 — The nightly reaches the database with a PROJECT-SCOPED key

- **Objective:** the three V30 moderator specs run in CI on a key whose blast
  radius is this project, not the whole account — and the nightly stops needing
  `SUPABASE_ACCESS_TOKEN`.
- **Problem, measured in the dispatched nightly (`37321138731`, the first run to
  include V30's specs):** `e2e/moderator-door.e2e.ts:35`,
  `e2e/place-photo-admin.e2e.ts:98` and `:176` each fail in ~200ms with
  `scripts/db-sql.sh:34: SUPABASE_ACCESS_TOKEN: FATAL: not set in .env`. They go
  through `runSqlHeadless` (`e2e/fixtures.ts:362`) → `scripts/db-sql.sh` → the
  Supabase **Management API**, whose token is ACCOUNT-level (`sbp_…`) and can run
  arbitrary SQL against every project. The founder's decision (2026-10-05) is the
  narrowest privilege that still runs the coverage: a project-scoped
  service-role key over PostgREST.
- **Files in scope:** `e2e/fixtures.ts`, `e2e/moderator-door.e2e.ts`,
  `e2e/place-photo-admin.e2e.ts`, `.github/workflows/e2e-scheduled.yml`,
  `docs/agents/ci.md`.
- **Approach:** replace the transport, not the specs' intent. The raw-SQL calls
  become typed PostgREST calls authenticated with the project's service-role key
  (`SUPABASE_SERVICE_ROLE_KEY`, read from the repo `.env` FILE exactly as
  `VITE_SUPABASE_URL` is, since that is what the specs read). `scripts/db-sql.sh`
  stays untouched — it is a legitimate migration/read tool and it keeps its
  management token. The three operations are: elevate a profile's
  `moderators` flag, read it back, and read/restore a place's `photo_url`.
- **Acceptance criteria:**
  - **No spec depends on the management token.** The three specs complete with
    `SUPABASE_ACCESS_TOKEN` **unset in the environment** — that is the test, and
    the raw command output is the evidence. `runSqlHeadless` and `sqlLiteral` are
    deleted if they end up with no caller.
  - **A missing service key fails with its own name**, not an opaque fetch error:
    the message names `SUPABASE_SERVICE_ROLE_KEY`.
  - **The key never reaches the client.** It must not be added under any
    `VITE_` prefix, and `dist/assets/*.js` must contain **none of**: the full
    service-role key, its 24-character **signature tail**, the literal
    `service_role`, or the variable name. Measured, not assumed — the app bundle
    is public, and the probes carry CONTROLS (the same probes must HIT for the
    public anon key, or the instrument proves nothing).
    ⚠️ **THIS CRITERION WAS WRONG WHEN FIRST WRITTEN, and the builder refused to
    fudge it — recorded because the mistake is instructive.** It demanded zero
    hits for the key's **first 24 characters**, which is **1** and can never be
    0: a legacy Supabase anon JWT and a legacy service-role JWT share those 24
    characters, because they are the base64url of the same JWT header
    (`{"alg":"HS256","typ":"JWT"}`). A prefix test on two keys that agree on
    their prefix measures the header, not the secret — and the "hit" it finds is
    the **anon** key's own copy, which is *supposed* to be in the bundle. Judge
    the payload and the signature, never the shared header.
  - **Restore semantics survive:** both specs still restore the marker's
    moderator flag and the place's photo **and assert the restore**, which V30
    recorded as the lesson that cost it two strays in the live database.
  - **CI wiring:** `SUPABASE_SERVICE_ROLE_KEY` is a repository **secret** (not a
    variable — it bypasses RLS), written into `.env` by the workflow beside the
    other three, and named by the configuration gate's notice so an unconfigured
    lane SKIPS loudly instead of failing three mysteries.
  - `npm run verify` exit 0.
- **Verification command:** `npx playwright test e2e/moderator-door.e2e.ts
  e2e/place-photo-admin.e2e.ts --reporter=list` with `SUPABASE_ACCESS_TOKEN=`
  forced empty; `npm run verify`; then **re-dispatch the nightly** and read the
  three specs' outcomes out of the CI log.
- **Budget:** one local builder context.
- **Depends on:** v31-2 (the workflow and the gate it edits).

---

## 6. Supersessions and decisions recorded, not implied

- **W is treated as triggered by a SIMULATION, and the record says so.** The
  pre-registered test stays unrun and stays on the founder reminder as
  **validation, not a gate**. A real panel that contradicts the simulated one
  means reverting **one** committed slice (v31-1) — that is the whole exposure.
- **The next-batch brief's "You'd be the first parent here" CTA is not built.**
  It needed a V27 reversal plus the test's evidence. W's remedy is the cheaper,
  V27-compatible door, and the panel argued *against* leading with the CTA.
- **The embedded classic PAT is out of `.git/config`** (origin is SSH now,
  auth proven by `git ls-remote` + a dry-run fetch). Hygiene, recorded in
  `task-state.md`, not a slice.

---

## 7. Ledger

    V31: plan written (base ba4cfe4)
    V31: v31-1 built + verified (feed-empty-state 8 passed, mobile audit exit 0)
    V31: v31-2 root-caused (keyless CI build), fixed (workflow + repo variable)
    V31: v31-3 built + verified (scheduler 42 passed, gate green)
    V31: v31-4 found while gathering evidence (dev injector in dist), fixed at the build
    V31: gate measured — exit 0, 75 files / 2197 tests / 86 warnings / 0 errors / GUARDS PASS
