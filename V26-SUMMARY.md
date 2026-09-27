# V26 — the post-drop-in review prompt: close-out

> **STATUS: SHIPPED AND DEPLOYED (2026-09-27).** The human chose the
> orchestrator's recommendation — add the *"skip parents who already reviewed
> this place"* exclusion (Slice 4) **before** going live — and every slice (1–4)
> is built, reviewed, verified, committed, pushed, and the `send-push` Edge
> Function is **deployed and proven live**. The first post-deploy cron tick
> reported `reviewDueCreated: 0` with a real in-window candidate present, so the
> go-live notified **zero families**.

Plan `plan.md` (Slices 1–4 + Interfaces), per-event log
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
3. **A parent who already reviewed this place is NOT prompted again** (Slice 4,
   chosen 2026-09-27 over "deploy as-is").

## What shipped

| Slice | Commit | What it is |
|---|---|---|
| 1 | `d23e57f` (+`1681e8f` merge) | The `review_due` kind exists in all seven places that describe the one `notification_log` kind CHECK; migration `0055` **applied live, twice, read back**. No producer yet. |
| 2 | `7e53c22` | The **pure** scan decision: `_shared/reviewScan.ts` predicate + row mapper, the `src/lib` re-export seam, and the sibling test. No clock read, no client, no I/O — `now` is a parameter. |
| 3 | `e64d298` | `catchUpReviewDue` wired into the 5-minute scan, mirroring `catchUpStartingSoon` step for step. |
| 4 | `40ffa83` | **Added by human decision.** Rule **(f)**: a required `alreadyReviewed` fact on the pure predicate, and the bounded `reviews (place_id, author_profile_id)` read in `catchUpReviewDue` that injects it. No migration, no route, no copy change. |
| record | `128c47a`, `971ec76`, `c520b95`, `cbf5b4a`, `59db9e8`, `108c41e`, `50aeab1` | task-state and plan records, the escalation ledger, the go-live rehearsal, and this close-out. |

> The `50aeab1..40ffa83` push also carried a separate workspace-maintenance
> commit `eca5a70` ("orca: adopt Orca…", touching `.harness-base`, `AGENTS.md`,
> `docs/agents/orca.md`) that landed locally mid-session; the fast-forward
> necessarily includes it, and `check-push-range.sh` confirmed the whole 8-file
> range clean.

## Slice 4 and the go-live — the live proof

**What rule (f) prevents.** The single real candidate the first live run would
have notified was drop-in `04a073f4…` *"Drop-in at Green Lake Park (East)"*
(ended `2026-09-26 14:30 UTC`) — and its one pinger is **the same profile that
already wrote that place's review**. Without the skip, the feature's first-ever
notification would have been a prompt to *edit* a review that parent already
left, delivered by email. Rule (f) makes that case silent.

**Blast radius measured read-only, before the deploy**
(`.scratch/v26/live-blast-radius.txt`, taken 14:16Z while the candidate was
in-window): exactly **1** finished place-backed ping inside the 24-hour window,
`already_reviewed = 1`, `would_notify = 0`.

**The deploy.** `npx supabase@2.118.0 functions deploy send-push --project-ref
ayzvjwxbxyrcgyoeaxuk`, browserless, authenticated by the `.env` token. The
read-only `~/.npm` and `~/.supabase` paths were routed into the workspace for
the command (a sandbox artifact, not a repo change). Three independent signals
prove it landed (`.scratch/v26/post-deploy-signals.txt`):

| signal | BEFORE | AFTER |
|---|---|---|
| `version` | `5` | **`6`** |
| `updated_at` | `1790450713441` (2026-09-26T19:25:13Z) | **`1790518786972`** (2026-09-27T14:19:46Z) |
| `ezbr_sha256` | `8d25f1f8…` | **`2ebf8ceb982aff073c66a7034e2d4b4aa44bc3c386b363d2e3d09a22617758e8`** |

`verify_jwt: true`, `status: ACTIVE` unchanged.

**The first post-deploy tick — the falsifiable proof**
(`.scratch/v26/live-tick.txt`). Cron `send-push-every-5-minutes` ran at
`2026-09-27 14:20:00.109Z`, **13 seconds after the deploy finished**, and its
service-role response was:

```json
{"ok":true,"startingSoonCreated":0,"reviewDueCreated":0,"rows":0,"sent":0,"failed":0,"skipped":0,"pruned":0}
```

The presence of the `reviewDueCreated` key at all proves the invocation ran the
**new** bundle: the previously-deployed v5 predated Slice 3 and had no review
scan. At that instant the Green Lake candidate was still inside the window, yet
the scan created **zero** rows — the skip rule working live. The same tick also
exercised the `place_id is null` wall: two place-less finished drop-ins with
pingers were inside the window and produced nothing. `notification_log`
`review_due` rows after the go-live: **0** — no notification was created, so no
push and no email reached any family.

## Gate — fresh, at close

| Lane | Result |
|---|---|
| `npm run verify` (Slice 4, final tree) | **EXIT=0**, 56 files / **1785 tests**, 78 warnings / 0 errors, `GUARDS: PASS` — reproduced independently by the verifier (`.scratch/v26/s4-verify-verifier.txt`) and again by the fix round (`s4-verify-fix1.txt`) |
| `deno check` | **EXIT=0** both functions |
| Reviewer (agent) | **NEEDS_CHANGES → fixed → green.** One blocking finding, comment-only: `reviewScan.test.ts:10` said "five rejection rules" while the same diff added a sixth. Fixed and re-gated. |
| `ocr` | **0 findings on the product files**; its one low finding is `.scratch` JSON gitignore hygiene, **parked** (untracked scratch, mechanically excluded by `check-push-range.sh`). |
| Rule (f) mutation check | **killed the named test** (`.scratch/v26/mutation/f-already-reviewed.txt`) |
| Migration `0055` | applied live **twice** (both HTTP 201) + three read-backs |
| Edge Function deploy | **DONE 2026-09-27** — v5→v6, hash changed, first tick `reviewDueCreated:0` |
| Pre-push hook gate | **PASS** — `50aeab1..40ffa83`, 8-file clean range, full gate green |

## Acceptance criteria — what is live-proven, and what is not

- **Criterion 1 ("one invocation inserts exactly one row") is AMENDED by
  Slice 4:** with rule (f), the only real in-window candidate is skipped, so the
  correct live result is **zero** rows. Observed: zero. Proven.
- **Criterion 2 (second invocation inserts zero / idempotence):** the unique key
  `(profile_id, kind, playdate_id)` plus `ignoreDuplicates` is unchanged and was
  already proven for `starting_soon`; with zero rows created there is nothing to
  double. The 14:20 tick's `reviewDueCreated:0` against the same candidate the
  prior `notification_log` state held no row for is consistent.
- **Criterion 3 (a `cancelled` finished drop-in → zero rows): PROVEN against the
  live schema with ZERO persistence** (`.scratch/v26/live-criterion3-rollback.txt`).
  A `cancelled`, place-backed, finished drop-in with a ping was inserted **inside
  an explicit transaction and then rolled back**: the scan's exact predicate
  returned **`cancelled_candidates = 0`** while an identical `status = 'on'`
  control returned **`on_control_candidates = 1`**, so the status wall is what
  discriminated. A post-rollback check found **0 playdates, 0 pings,
  0 notifications** left behind. This exercises the live schema and the exact
  `.eq('playdate.status','on')` / window / `place_id is not null` predicate the
  deployed function runs.
- **Criterion 4 (`place_id is null` → zero rows): PROVEN LIVE, by real data, no
  fixture.** Two place-less finished drop-ins with pingers were inside the
  window during the 14:20 tick; the scan's `.not('place_id','is',null)` filtered
  them and `reviewDueCreated` was 0.
- **Criterion 5 (`starting_soon` count undisturbed):** the tick reported
  `startingSoonCreated:0` alongside, with no error — both counts present.
- **Criterion 6 (the row drains):** vacuously satisfied — zero rows created
  means nothing to drain; no push and no email was sent. This is the intended
  outcome of the human's decision, not a gap.
- **Criterion 7 (fixture cleanup):** no fixture was seeded, so nothing to clean.

## The e2e lane (Slices 1–3, unchanged)

**149 passed / 2 failed / 1 skipped (12.0m), `EXIT=1` — both failures explained,
neither V26's.** Isolated re-run of exactly those two: **3 passed (13.6s)**,
exit 0. V26's entire diff is notification-path files with **zero** map/places
matches, so the tests cannot reach a file this batch changed; failure 1 is
additionally the `aria-current` assertion `task-state.md` documents as ~1-in-3
flaky at both ends of the range. See `.scratch/v26/batch-e2e.txt` and the ledger
for the full exoneration.

## Defects found in work that had already passed a lane

1. **A gap the gate structurally cannot see** — `e2e/push-subscribe.e2e.ts`
   hardcoded the five kind names while the app mapped six, so the sixth toggle
   rendered unasserted.
2. **A defect the agent reviewer had explicitly blessed** — the SQL twin's
   `review_due` branch yields a NULL url for a NULL place id while
   `notification_log.url` is `not null`.
3. **An evidence defect no lane reported** — a fix-round report cited a
   Deno evidence file written ~5 minutes *before* the change it claimed to
   cover. Caught by `stat`, not by reading the report.

## Claims retracted, and errors that were mine

- **"keep `security definer`"** was wrong; the builder refused, correctly.
- **"four trigger functions"** was wrong; it is three functions producing four
  kinds.
- **The "commit-graph rewritten" hypothesis** was killed by the verifier.
- **"Real data proves criterion 4 for free"** was originally wrong; it became
  true only after Slice 4's change, and is now proven by the 14:20 tick.
- **A "decisive control" that could not discriminate** — isolated runs at base
  cannot settle a full-suite race.
- **The playtest lane was wrongly omitted** once; re-run, 9/9 routes PASS.

## Deliberately not done

- No in-app "while you were away" review prompt — push/email only.
- No per-drop-in reviews, no attendance verification (`going_pings` records
  intent; there is no check-in). The copy says *"You said you were going"*.
- No anti-nag beyond the per-kind mute, the once-per-drop-in dedupe key, and
  now rule (f).
- No `pg_cron` change: the existing 5-minute job calls the same URL.
- No new route, no new table, no new migration in Slice 4.

## Open — filed rather than dropped

1. **Two leftover `e2e ` fixtures are live in the feed** — place-less finished
   drop-ins `6e2e8877…` (profile `ffa54c4d…`) and `2c6b734b…` (profile
   `ecfa9599…`), both titled `e2e e2e-… Marker inbox rt`, from a prior run.
   They are marker-convention-sweepable but not swept. Not V26's, and not
   touched; surfaced because they are exactly the leak the fixture guard exists
   to prevent. Sweeping them drives the human's Chrome (browser-lane rule), so
   it waits for a yes.
2. **The 24-hour window** (`REVIEW_PROMPT_WINDOW_HOURS = 24`) remains the one
   pin tracing to no human answer.
3. **The review-prompt copy** — a founder read; the non-negotiable half is that
   it must not claim attendance.
4. **A known flake:** `npm run verify` can go spuriously red on
   `scripts/guards/no-bypass-guard.test.mjs` (a git-internal hardlink race).
   Candidate fix: `--no-hardlinks` in `plainClone()`.

## Files

`supabase/migrations/0055_review_prompt.sql` ·
`supabase/functions/_shared/reviewScan.ts` · `src/lib/reviewScan.ts` +
`.test.ts` · `supabase/functions/send-push/index.ts` ·
`supabase/functions/_shared/pushCopy.ts` · `_shared/emailCopy.ts` ·
`src/lib/push.ts` + `.test.ts` · `src/lib/email.test.ts` · `src/lib/db.ts` ·
`e2e/push-subscribe.e2e.ts` · `docs/push-setup.md` · `plan.md` ·
`task-state.md`. Evidence: `.scratch/v26/` (untracked by design), including
`s4-verify.txt`, `s4-verify-verifier.txt`, `s4-verify-fix1.txt`,
`s4-deno*.txt`, `mutation/f-already-reviewed.txt`, `ocr-s4.json`,
`live-blast-radius.txt`, `pre-deploy-baseline.txt`, `post-deploy-signals.txt`,
`post-deploy-cron.txt`, `live-tick.txt`, and `deploy.txt`.
