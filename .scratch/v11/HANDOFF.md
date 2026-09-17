# V11 handoff — start here in a fresh session

Written 2026-09-17 at the end of the V11 coordinator session (the founder-feedback batch built end to end, gated, pushed, and deployed). **Everything needed to continue lives in files, not in a chat window** — this page is the index to them.

## Where things stand

| Thing | State |
|---|---|
| V11 (founder-feedback batch: discoverability + setup) | **complete, pushed** — 6 tickets, code `aa7e991`…`e5d1462`, on `master` |
| Live | https://drop-in-mu.vercel.app — **deploy of `a894a77` UNCONFIRMED** (see Open follow-ups, RANKED 0) |
| Migrations | **none in the batch** — UI/copy/form/reorg only; `supabase/` verified untouched |
| Final gate (single-tenant, at HEAD `6f6e9e0`) | build exit 0 · **818/818 unit (24 files)** · **e2e 76 passed / 1 skipped** (pre-existing conditional, `polish.e2e.ts:209`) · lint 0 errors |
| Push | **done 2026-09-17** — `d9239f4..a894a77` master→master, confirmed on origin via `git ls-remote`; `opencode.json` verified absent from the pushed range |
| Dev agent pane | `w4:p12` (tab `w4:tP`), agent `v11dev2` (idle/done) |
| Local HEAD | a few local bookkeeping commits (the task-state ship-status note, this handoff doc + its pointer) are **unpushed** on top of the pushed `origin/master` = `a894a77`. `git log --oneline -5` shows them. Push them (human call) so a fresh checkout includes this doc — until then they are local-only |

## The six tickets (all DONE)

| # | Ticket | Code commit | What shipped |
|---|---|---|---|
| 01 | Radius — "Back to 5 miles" escape | `aa7e991` | `radiusEscapes` two-sided gate (5 < r < 35) + `RadiusEmptyState` |
| 02 | Places — remove "Fits my kid's age" filter | `61a9efa` | `placeFitsKidAges` + `kidAges` off `browsePlaces` + the toggle |
| 03 | Place detail — drop "Ages not listed yet." | `b86a3bf` | the nag line is gone; a place with no age data renders no age line |
| 04 | Restrained section headers | `fc64dd6` | new `SectionHeader` band; `NAV_ICONS` → `src/components/icons.ts` |
| 05 | Post form — WHERE, then WHEN | `456c7b9` | `startBlock` (date + `TimeStepper`) moved into a visible "When" section |
| 06 | Settings reorg | `e5d1462` | new `/settings` owns all editable controls; `/profile` read-only; header gear |

Close commits: t01 `14c8354`, t02 `7ef7fc7`, t03 `62d4843`, t04 `058d923`, t05 `0f8bfc3`, t06 `6f6e9e0`. Full ACs + per-ticket evidence: `.scratch/v11/issues/01`–`06` (each carries a DONE status line with its gate).

## Read these, in this order

1. `AGENTS.md` — the workflow rules (orchestrator/coordinator + the dev-agent Herdr loop, one writer, files are the system of record, the forbidden-files list).
2. `task-state.md` → **Current position** at the top (line 8, the V11 bullet), then the **V11 section** (ticket table, final gate, reviewer verdicts, ship record, open follow-ups).
3. `.scratch/v11/spec.md` — the batch: 3 directives + 3 judgment calls, the out-of-scope list, and the "no migration" check.
4. `.scratch/v11/issues/NN-*.md` — each ticket's pinned mechanics + ACs.
5. `.scratch/v10/spec.md` — the prior batch (V11 was built on the live V10 app). V11 itself needs no migration, so the migration-check procedure doesn't apply here.

## Commands you will need

```bash
# the gate (run it yourself; never trust a builder's numbers alone)
npm run build && npm run test            # the per-ticket gate (no migration in V11)
npm run test:e2e                         # the full live e2e (~5-6 min, live Supabase)

# housekeeping / live verification
node scripts/sweep-e2e-markers.mjs select|delete|verify   # e2e-* marker accounts
node scripts/verify-pwa.mjs <url> ; node scripts/mobile-audit.mjs <url>

# git (the coordinator session may lack a shell — delegate to the dev agent or run locally)
git log --oneline -20                    # confirm the batch commits
git status                               # expect: M opencode.json + untracked .agents/ .scratch/** supabase/.temp/
```

## Known traps (each cost time once)

- **`opencode.json` is always modified and never committed** — the NInfer endpoint + live key. It shows as `M` in `git status`; that is normal. Forbidden to commit (with `supabase/`, `.agents/`, `.scratch/*.cjs`, `supabase/.temp/`).
- **The untracked clutter is expected** — ~25 entries (`.agents/`, `.scratch/**`, `supabase/.temp/`). Never commit, never sweep.
- **The e2e suite hits live Supabase (port 4173)** — a "stale string" failure right after a code change is often a port/contamination artifact, not a real regression (happened on t03: re-cert `rg "Ages not listed" src/` = 0 hits). Re-run the gate before declaring a failure real.
- **Two live-API flakes**: `e2e/guest-list.e2e.ts` and `e2e/post-edit-delete.e2e.ts` sometimes fail on a viewer-signup hiccup and pass in isolation. Re-run alone before reporting a failure as real.
- **Never weaken a test to make it pass.** A broken spec is a finding. Copy-string updates are allowed only when the ticket changes that copy — say so in the report.
- **One writer**: the dev agent (`v11dev2`, pane `w4:p12`) is the only writer in this repo. Re-read a file before editing; keep one writer at a time.
- **The dev agent terminal title is stale** ("OC | V11 ticket 04 section headers") — cosmetic; the pane is idle/done.

## Commit convention (follow it for the next batch)

- One code commit per ticket: `VNN tNN: <imperative summary>` (includes the ticket TODO→DONE flip).
- A separate `task-state:` commit for bookkeeping (task-state.md only).
- The 5-part dev report (per ticket, in the dev agent's output): status, files, commands, risks, open questions.
- **No push without explicit human authorization.** Push = `git push origin master` (Vercel watches `master`).

## Open follow-ups (ranked — founder decision pending)

1. **RANKED 0 (blocks the ship's closure): Vercel production deploy of `a894a77` is unconfirmed.** Founder dashboard check (project behind `drop-in-mu.vercel.app` → Deployments): if no post-push deployment, deploy manually (Production) or connect the GitHub repo for auto-deploys; if a deployment failed, capture the error. Then re-probe for the new entry chunk and close the ship record. The push itself is done — only the live-serve confirmation is pending.
2. **RANKED 1: polish ticket candidate "V11.5"** — t06 finding-(a): stale `/profile`→`/settings` copy pointers at `OnboardingPage.tsx:210/211/223/224/282/338`, `UserPage.tsx:564`, `PlacePage.tsx:408`.
3. **RANKED 2 (cosmetic, optional): t05/t06 comment-only + e2e-doc nits** (stale `e2e/post-location.e2e.ts` comments; t06 reviewer findings (b)–(d)).

## Recommended first moves in a new session

1. `git log --oneline -5` then `npm run build && npm run test` — confirm the baseline before touching anything. The top commits are local, unpushed bookkeeping (task-state ship-status + this handoff); the pushed batch tip is `a894a77` (`origin/master`).
2. Resolve **RANKED 0** with the founder (the Vercel deploy confirmation) — the only thing blocking the ship's closure.
3. Then, per the founder: open **V12** (new feedback), or file the **"V11.5"** polish ticket (RANKED 1) to clean the copy pointers.

**Paste-ready kickoff prompt:**

> Read `.scratch/v11/HANDOFF.md`, then `task-state.md`'s Current position + V11 section, then `.scratch/v11/spec.md`. The V11 batch is complete, pushed, and (pending confirmation) deployed. First: confirm the Vercel production deploy of `a894a77` (RANKED 0) with the founder — dashboard → Deployments → confirm the latest deployment is live, then re-probe the entry chunk and close the ship record. Then, per the founder's call, either open V12 or file a "V11.5" polish ticket for the stale /profile→/settings copy pointers (RANKED 1). Same discipline as V11: builder → independent gate re-run → fresh-context reviewer → commit per ticket → update task-state.md at each close-out. Never weaken a test; report findings instead of papering over them.