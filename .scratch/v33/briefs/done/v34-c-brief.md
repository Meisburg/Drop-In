SENTINEL: V34-C-ONBOARD-FINISH-T2F6

**Slice `muzkg290` — clicking Finish jumps into the app jarringly; it wants a transition.**

⚠️ **YOUR OWN WORKTREE — unique path:**
```bash
cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/onb-finish-t2f6 -b onb-finish-t2f6 HEAD
cd /tmp/pd-wt/onb-finish-t2f6 && npm install --silent 2>/dev/null || true
```
Everything runs in `/tmp/pd-wt/onb-finish-t2f6`; commit on branch `onb-finish-t2f6`;
**never touch the main worktree or another lane's path**; never push.

## The annotation

> *"When you click on finish here, I feel like it jumps into the main app really
> quickly and it's like kind of jarring. Maybe there should be some kind of
> animation state or loading state or like building your profile state or
> something."* — anchored on `/onboarding`

## The work

On the onboarding completion path (find the Finish handler; likely
`src/pages/OnboardingPage.tsx` plus whatever `lib/` seam drives completion):

1. Between the tap and the feed landing, render a **state that says what is
   happening** — e.g. *"Building your profile…"* with a restrained, on-brand
   animation (this app is flat-at-rest per DESIGN.md; no bounce, no confetti).
2. **The state must be driven by the real work**, not an artificial sleep: show it
   while the completion writes/auth settle, and hold it for a short, explicit
   minimum so it does not flash (a minimum under ~600ms is fine; **state the number
   you chose and why** in the report).
3. **`prefers-reduced-motion: reduce`**: the copy still appears, nothing animates.
4. **It must not delay or alter the write path** — if the completion fails, the
   error path is unchanged (its own assertion).

**Read only:** the onboarding page, its completion seam, and the specs that walk
signup (`e2e/onboarding-*.e2e.ts`, `e2e/fixtures.ts`'s `finishSignup`). Edit first,
verify after.

## Acceptance

1. A spec that signs up its own viewer sees the completion state between the tap and
   the feed, then lands on the feed exactly as before (assert the state's testid
   appears, then the feed).
2. With reduced motion, the state appears and **no element animates**
   (`animationName === 'none'`).
3. A failed completion still surfaces its existing error and does not show the
   success state (its own assertion).
4. The signup walk's total time does not grow past the minimum you chose —
   **measure it** (report the before/after seconds).
5. Any spec or fixture that walks signup keeps passing (`finishSignup` is used by
   many specs — if its timing changes, they all see it).

## Gate

`ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify`,
then the same with `npm run guards` → **GUARDS: PASS**. Only `steering-lint` may be
red (another lane's `docs/agents/*`). Run the signup specs on a **private port
4210–4218** (mint the marker there; kill by port/PID, never `pkill -f`). Stage **by
path only**. Report to `.scratch/v34-c-report.md`; reply:

```
Sentinel: V34-C-ONBOARD-FINISH-T2F6
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v34-c-report.md
```
