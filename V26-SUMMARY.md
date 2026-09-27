# V26 — the post-drop-in review prompt: close-out

> **STATUS: all three slices CODE COMPLETE, reviewed, verified, committed and pushed, and every lane in the batch's intended evidence set has now run.** ONE ITEM REMAINS AND IT IS NOT AN ENGINEERING ONE: Slice 3's live proof requires deploying `send-push`, and deploying IS the go-live (an active 5-minute cron → one real family, as a real email, irreversibly). That needs the human's authorization. Everything else in this document is final.

Plan `plan.md` (Slices 1–3 + Interfaces), per-event log
`.scratch/v26/ledger.md`, state `task-state.md`.

## What this batch was

A founder idea: *"after somebody attends a drop-in they should be given the
opportunity to give feedback on that place — five stars one through five and
also a write a comment."* Grounding it before planning changed the whole shape:
**the stars-and-comment half already shipped** (`reviews`, migration `0052`,
with `ReviewForm` and an aggregate line on place pages, browse cards and map
pins). So the entire batch is **the prompt**, not the review.

Three decisions were taken by the human and are binding:
1. The prompt writes **the same `reviews` row** the place page writes — no new
   table, no new form.
2. A drop-in with `place_id is null` **prompts nothing**.
3. (Pending) whether to add a *"skip parents who already reviewed this place"*
   filter before going live — recommended by the orchestrator.

## What shipped

| Slice | Commit | What it is |
|---|---|---|
| 1 | `d23e57f` (+`1681e8f` merge) | The `review_due` kind exists in all seven places that describe the one `notification_log` kind CHECK; migration `0055` **applied live, twice, read back**. No producer yet. |
| 2 | `7e53c22` | The **pure** scan decision: `_shared/reviewScan.ts` predicate + row mapper, the `src/lib` re-export seam, and the sibling test. No clock read, no client, no I/O — `now` is a parameter. |
| 3 | `e64d298` | `catchUpReviewDue` wired into the 5-minute scan, mirroring `catchUpStartingSoon` step for step. **Not deployed.** |
| record | `128c47a`, `971ec76`, `c520b95` (pushed) + `59db9e8`, `108c41e`, `cbf5b4a` (held at close, docs-only) | task-state and plan records, the escalation ledger, and the go-live rehearsal. |

## Gate — fresh, at close

| Lane | Result |
|---|---|
| `npm run verify` (build + vitest + oxlint + a11y-focus + steering-lint + guards) | **EXIT=0**, 56 files / **1784 tests**, 78 warnings / 0 errors, `GUARDS: PASS` — reproduced independently by two lanes |
| Targeted e2e (`e2e/push-subscribe.e2e.ts`) | **9 passed** |
| **Full e2e suite** | **149 passed / 2 failed / 1 skipped (12.0m), `EXIT=1` — both failures explained, neither V26's.** Isolated re-run of exactly those two: **3 passed (13.6s)**, exit 0. V26's entire diff is 7 files with **zero** map/places/feed matches, so the tests cannot reach a file this batch changed; failure 1 is additionally the `aria-current` assertion `task-state.md:1962` records as ~1-in-3 flaky **at both ends of the range**. See "The e2e lane" below. |
| `deno check` | **EXIT=0** (both Edge Functions type-check) |
| **`deno test`** | **6 passed / 0 failed** — the first time this lane ran in V26 |
| Migration `0055` | applied live **twice** (both HTTP 201) + three read-backs |
| **Playtest lane** | **PASS — 9/9 routes, 0 uncaught JS errors**, every route's armed `must_contain` satisfied, screenshots saved. Both processes released **by port**; 9444 and 4173 confirmed free. |
| Edge Function deploy | **NOT DONE BY DESIGN** — it is the go-live |

**Lanes deliberately NOT run, with reasons** (the repo's warning is that a lane
in a pointer table quietly stops running, so omissions are stated):
`mobile-audit.mjs`, `dark-mode-check.mjs`, the theme contract, `verify-pwa.mjs`,
`verify-splash.mjs` — **V26 changed zero rendered UI**: no `.tsx`, no CSS, no
route, no control. The full e2e suite is the stronger UI signal and has now run.

## The e2e lane — 149 passed / 2 failed / 1 skipped, and why neither failure is V26's

This is recorded at length because the honest line is **"not green, with both
failures explained"**, not "pass".

**Failure 1** — `places-map-view.e2e.ts:756`, inside the test beginning at
`:531`: `toHaveAttribute('aria-current','true')` on `places-map-card-0` never
became true after the strip was scrolled to its end (the locator resolved 34
times; the attribute stayed empty). That exact assertion is the one
`task-state.md:1962` documents as **~1-in-3 flaky at both ends of the range
(env/CR, not the slice)**.

**Failure 2** — `places.e2e.ts:2935`: after `.click({ force: true })` on a feed
pin, `place-marker-info` was **not found** at all within 15s. Undocumented, but
the same class: an element that appears only under idle timing.

**Both take exactly one 15 s expect timeout** (`playwright.config.ts` sets
`expect.timeout: 15_000`; the observed durations were 16.4 s and 17.1 s, i.e.
that budget plus setup overhead). `retries` is **unset → 0**, so a `✘` is a
single genuine failed attempt, not a retry artifact. `workers: 1` and
`fullyParallel: false`, so it is not the suite competing with itself.

**Exoneration, two independent ways:**
1. **Isolated re-run — `3 passed (13.6s)`, exit 0** — exactly the auth setup
   plus the two failing tests, on an idle box. Both had burned 15 s each in the
   full run; together they finished in 13.6 s.
2. **Construction:** V26's entire diff is 7 files, and a map-path grep over that
   list returns **0** — no `places`/`Map`/`Browse`/`mapStrip`/`feed` file is
   touched, so the failing tests cannot reach a single file this batch changed.

**A base-commit control was considered and deliberately not run**, with the
reason stated rather than left as a gap: for the guard-test flake the control
was cheap and the mechanism unidentified; here the mechanism is identified
(load-dependent timing), the isolated pass is clean, and the construction
argument is airtight. **It would have been run** if failure 2 had reproduced in
isolation, or if any V26 file were in the map path.

**A correction this section owes the record:** during the run I concluded from a
line-number grep that the failing test asserted no `aria-current`, and I wrote
that "the convenient explanation did not survive checking". **That conclusion
was itself wrong** — I assumed the test at `:531` ended before line 666, and it
is a ~225-line body that reaches `:756`. The recorded flake *is* the explanation
for failure 1. Asserting a boundary from a glance is the same error this batch
recorded against itself everywhere else.

## Defects found in work that had already passed a lane

The three-lane structure paid for itself three separate times, each a *different
kind* of catch:

1. **A gap the gate structurally cannot see.** `e2e/push-subscribe.e2e.ts`
   hardcoded the five kind names while `NotificationsSection` maps
   `NOTIFICATION_KINDS` (now six) — so the sixth toggle **rendered with no
   assertion covering it** and the spec's docstring had become false. Nothing
   under `scripts/` names the kinds; e2e is a separate lane.
2. **A defect the agent reviewer had explicitly blessed.** The SQL twin's
   `review_due` branch yields a **NULL url** for a NULL place id, while
   `notification_log.url` is `not null` and `playdates.place_id` is nullable by
   design — a hard insert failure where the TypeScript twin falls back
   gracefully. `ocr` found it in a branch the human reviewer had ruled
   "documentation is adequate".
3. **An evidence defect no lane reported.** A fix-round report cited the
   **round-1** Deno evidence file as covering a change made **4m56s after** that
   file was written. Caught by comparing `stat` timestamps, not by reading the
   report.

## Claims retracted, and errors that were mine

Recorded because a close-out that only lists successes is not a record:

- **The brief's "keep `security definer`" was wrong** and the builder refused
  it, correctly. `notification_payload` has never been SECURITY DEFINER; those
  flags belong to the trigger functions. Obeying would have been a silent
  privilege escalation on the function that renders notification copy.
- **"Four trigger functions" was wrong** and the builder refused that too. It is
  **three functions producing four kinds** — `0041:178` *replaces* `0032:416`
  rather than adding one. The re-review settled it by enumeration of every
  `insert into public.notification_log`.
- **The "commit-graph rewritten at 20:24" hypothesis was killed.** That mtime is
  the `..` row of `ls -la` for `.git/objects`, not the directory's; `info/` and
  `commit-graphs/` are hours older, mode 444, and no writer is configured.
- **"Real data proves criterion 4 for free" was wrong.** The scan joins *from*
  `going_pings`, and the place-less drop-ins have **no pingers** — so the
  `place_id is not null` filter excludes nothing live and is **unexercised by
  production data**. Criteria 3 *and* 4 both need a fixture.
- **A "decisive control" that could not discriminate.** The brief asked the
  verifier to run a guard test *at the base commit* as the control for a
  full-suite race; isolated runs at base cannot discriminate that. The
  construction proof settled it instead.
- **The playtest lane was wrongly omitted.** I recorded it as skipped because
  "V26 changed zero UI"; its own doc says ***"A slice is not done on green unit
  tests alone; it must also survive the playtest lane."*** Found only by opening
  the file rather than trusting my summary of it.

## The recurring lesson

**My own wording was the weakest link more often than the implementation was.**
Three separate instructions of mine were wrong on inspection (the `security
definer` brief, the four-functions count, the decisive control), and the
builders and reviewers who refused them were right every time. The lanes earn
their cost not by finding bugs in code but by **disagreeing with the person who
wrote the brief**.

## Deliberately not done

- No in-app "while you were away" review prompt — push/email only.
- No per-drop-in reviews, no attendance verification (`going_pings` records
  intent; there is no check-in). The copy says *"You said you were going"*, never
  "you went".
- No anti-nag beyond the per-kind mute and the once-per-drop-in dedupe key.
- No `pg_cron` change: the existing 5-minute job calls the same URL.
- No new route, so `routes.json` is unchanged.

## Open — filed rather than dropped

1. **⛔ The go-live decision** (the only blocking item). Three answers: *deploy
   as-is* / *add the skip first (recommended)* / *hold*. Recorded as
   `ACTION REQUIRED` in `task-state.md`, which `remind-human.sh` surfaces.
2. **The "skip already-reviewed parents" filter** — recommended before going
   live. The one notification that fires today asks a parent to **edit a review
   they already wrote**, and it arrives as an **email**.
3. **The 24-hour window** (`REVIEW_PROMPT_WINDOW_HOURS = 24`) is the only pin in
   the plan tracing to no human answer.
4. **The review-prompt copy** — a founder read; the non-negotiable half is that
   it must not claim attendance.
5. **A known flake:** `npm run verify` can go spuriously red on
   `scripts/guards/no-bypass-guard.test.mjs` (a git-internal hardlink race in
   that guard's own clone). It can therefore block a legitimate push. Candidate
   fix: `--no-hardlinks` in `plainClone()`. Trigger unidentified; a 80-attempt
   reproduction probe gave 0 failures.
6. **Deploy observability for Slices 2–3:** they change nothing in the app
   bundle, so a BLOCKED Vercel deploy would be invisible by content.

## Verified live before asking for authorization

Everything about the go-live that *can* be known without performing it:

- The target: drop-in `04a073f4-…` *"Drop-in at Green Lake Park (East)"*, ended
  2026-09-26 14:30 UTC, place `7b6ada36-…`, exactly **1** pinger.
- The scan's **exact query**, run read-only against the live API: **HTTP 200,
  exactly 1 candidate**.
- **It will be an email, not a push:** that parent has `push_subscriptions = 0`,
  so the fallback fires. Transport confirmed configured (`SMTP_USER`,
  `SMTP_PASS`, `EMAIL_FROM` present; names only, never values).
- The **exact message**: subject `Drop In: How was "Drop-in at Green Lake Park
  (East)"?`, body `You said you were going — rate the place.`, link
  `https://drop-in-mu.vercel.app/place/7b6ada36-…/details` → **HTTP 200** at a
  place that exists.
- The **deploy command**, rehearsed but not run: one browserless command, no
  `supabase login` needed, with two footguns pinned (name the function or it
  deploys *all* of them; `--project-ref` is mandatory).
- The **landing proof**: `version` 5→6, `updated_at` moves, `ezbr_sha256`
  changes from `8d25f1f8…` — plus a database row count, never the function's own
  `reviewDueCreated`, which reports rows *attempted*.

## Files

`supabase/migrations/0055_review_prompt.sql` ·
`supabase/functions/_shared/reviewScan.ts` · `src/lib/reviewScan.ts` +
`.test.ts` · `supabase/functions/send-push/index.ts` ·
`supabase/functions/_shared/pushCopy.ts` · `_shared/emailCopy.ts` ·
`src/lib/push.ts` + `.test.ts` · `src/lib/email.test.ts` · `src/lib/db.ts` ·
`e2e/push-subscribe.e2e.ts` · `docs/push-setup.md` · `plan.md` ·
`task-state.md`. Evidence: `.scratch/v26/` (untracked by design).
