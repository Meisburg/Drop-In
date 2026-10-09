SENTINEL: V33-7B-WINDOW-CONTROL-M6R3

**Slice v33-7b — the Start/End control, presented as ONE window (polish half).**

⚠️ **YOUR OWN WORKTREE — unique path:**
```bash
cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/window-control-m6r3 -b window-control-m6r3 HEAD
cd /tmp/pd-wt/window-control-m6r3 && npm install --silent 2>/dev/null || true
```
Everything runs in `/tmp/pd-wt/window-control-m6r3`; commit on branch
`window-control-m6r3`; **never touch the main worktree or another lane's path**;
never push.

## Context: the defect half already shipped

`v33-7a` (commit `aebdb84`) fixed the real defect: `validatePlaydateForm` used to
refuse any window that was not 60/90/120/180 minutes ("Pick a duration."), and it now
accepts **any positive whole number of minutes on the app's 30-minute grid, up to 24
hours** via `isPostableDuration` (`src/lib/feed.ts`; `isDuration` is kept as *chip*
membership). A 30-minute window posts — proven by reading `start_at`/`ends_at` back.

## What is left (the founder's `muyefjzq`, second half)

> *"There's got to be a more elegant and refined way to show off setting your start
> time and your end time. And I don't want them to be linked together because people
> can make it as long or as short as they want it to be."*

**One control that reads as a WINDOW, not a duration.** In
`src/components/PlaydateFormFields.tsx` (**branch 1 / `/new` only** —
`whenBlock` `:545`, `endBlock` `:612-636`):

1. **Start and End presented as one window** (one section, the two steppers reading
   as a pair), not two unrelated questions.
2. **Stepping one value never SILENTLY moves the other.** The single remaining
   coupling is the invariant a window must satisfy — `end > start`. When a step
   would violate it, the other value moves to preserve a **30-minute minimum
   window**, and the UI **says so** (a one-line note). Nothing moves invisibly.
3. **No copy anywhere implies a fixed length** — no "1h", no "How long", no
   "Ends …" line on `/new`.
4. **`/edit` (branches 2/3) keeps `durationBlock` byte-identical.** Do not touch the
   location-first page or `/edit`'s markup.
5. The window arithmetic stays a **`lib/` decision** (`src/lib/feed.ts` —
   `stepTimeMinutes` and the `(end − start) mod 1440` rule). If you add a pure
   helper ("apply a step to a window and return the next window plus whether the
   other end moved"), it lives in `src/lib/` with a **sibling test that names the
   defect it detects** (a silent drag), not the mechanism.

**Read only:** `src/components/PlaydateFormFields.tsx`, the window helpers in
`src/lib/feed.ts` + `src/lib/feed.test.ts`, and the specs that step the end control
(`e2e/post-fast.e2e.ts` and friends). Edit first, verify after.

## Acceptance

1. At 390px, Start and End read as one window: assert their boxes are in one band and
   the section has a single heading.
2. Stepping the End past the Start (or vice versa) **shows the note** and the other
   value moves — asserted on the rendered text, then its absence in the ordinary
   case.
3. **A 30-minute window is still postable** end to end on `/new` (the v33-7a
   behaviour is not regressed — read `start_at`/`ends_at` back and quote the span).
4. No copy on the `/new` form states or implies an hour or a fixed length (asserted
   by absence of the old strings).
5. `/edit` renders its existing markup unchanged — its specs pass untouched.
6. Every control keeps ≥44px and its existing testids (`end-time-label`, the start
   control's names); any spec whose locator or geometry moves changes **in the same
   diff** (`stale-locator-guard`).

## Gate

```bash
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # GUARDS: PASS
```
Expected red: `steering-lint` naming another lane's `docs/agents/*` only. Then
`e2e/post-fast.e2e.ts` (+ any spec you touched) on a **private port 4210–4218**
(mint the marker there; kill by port/PID, never `pkill -f`). Stage **by path only**.
Report to `.scratch/v33-7b-report.md`; reply:

```
Sentinel: V33-7B-WINDOW-CONTROL-M6R3
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-7b-report.md
```
