SENTINEL: V36-T2-EMPTY-STATE-CTAS-W4K9

Slice **T2** (agentation session `meetup-patterns-d8e22536`, P1 — the highest-value item in that batch). OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/empty-state-w4k9 -b empty-state-w4k9 HEAD
Work only there; commit on branch `empty-state-w4k9`; never touch main or another lane's path.

## The ruling

Meetup's `SearchResultUiState.EmptyOrError` carries **`text` + `actionText` + `emptyAction` + `mapItems`** — the empty state is a **call to action with the map still rendered**, never a dead "no results" screen. This is Drop In's stated goal: *"improve experience for new parents with no nearby Drop Ins."*

**Do exactly that, and nothing more.**

## Work

In the drop-in feed's empty branch:
1. Keep the reason **specific**: say the radius and the fact, e.g. *"No drop-ins within 5 miles."* — read the radius from the app's ONE radius constant; do not hard-code a second number (a slice in flight is making that constant 5 miles / 8047 m — if it renders, format through `Intl.NumberFormat`, never a raw ambiguous int).
2. **Two actions, both real:**
   - **Widen the area** — re-queries with the next larger radius preset. It must actually change the number in the sentence (assert the text changes).
   - **Create one here** — navigates to the existing create-a-drop-in route. No new route.
3. **The map stays rendered** under the empty state (`mapItems`), so "there is nothing nearby" is shown, not asserted in prose. If the feed's empty branch currently has no map, use the map component already used by the browse surface; if wiring it is more than a prop, report BLOCKED with what it would take.
4. **Signed-out visitors never see "no drop-ins nearby"** — that is a privacy leak (it reveals local density). The signed-out empty state keeps its existing sign-in prompt.
5. The empty state is **not** shown while loading and **not** shown on error — three distinct states; the error path keeps its own copy.

Read-only: the feed page + its empty branch, the map component, the radius constant, and the spec that asserts the current empty copy. Edit first, verify after.

## Acceptance

1. A viewer with zero nearby drop-ins sees the sentence **with the radius** and **two working actions**;
2. the widen action changes the number in the sentence (its own assertion);
3. create-here lands on the create route;
4. the map is present in the empty state (assert its container);
5. signed-out viewers do **not** see the local-density sentence (its own assertion — this is the safety case);
6. a spec that asserted the old empty copy changes in the **same diff** (`stale-locator-guard`);
7. 390px no overflow; every control ≥44px.

## Gate

```bash
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # GUARDS: PASS
```
Only `steering-lint` naming another lane's `docs/agents/*` may be red. Feed specs on a
**private port 4210–4218** (mint the marker there; kill by port/PID, never `pkill -f`).
Stage **by path only**. Never claim a pre-existing failure as fixed
(`feed-empty-state.e2e.ts:301` is known-red; if your change touches that spec, say so).
Report `.scratch/v36-t2-report.md`, then reply:

```
Sentinel: V36-T2-EMPTY-STATE-CTAS-W4K9
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v36-t2-report.md
```
