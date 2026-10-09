SENTINEL: V33-7-WINDOW-NOT-AN-HOUR-D4M7

**Slice v33-7 — the window is not an hour.** Plan of record: `plan.md` §4 "v33-7".
This brief does not replace it.

Repo: `~/Projects/playdate-app`. Base: HEAD (`71de45e`). **Do not push.**

Report to **`.scratch/v33-7-report.md`**. Reply in the pane with only:

```
Sentinel: V33-7-WINDOW-NOT-AN-HOUR-D4M7
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-7-report.md
```

---

## 1 — The founder's annotation, and the DEFECT behind it

> *"There's got to be a more elegant and refined way to show off setting your
> start time and your end time. And I don't want them to be linked together
> because people can make it as long or as short as they want it to be. I don't
> want it to be telling people it has to be an hour."* — `muyefjzq`, on
> `PlaydateFormFields.tsx`

**This is not a polish request. It is a behavioural defect, and here is the
measured proof:**

- `/new` (branch 1) renders `whenBlock` (the start stepper) and `endBlock` (the
  End stepper, `playdateFields` `:612-636`). Stepping the End writes
  `durationMinutes = (end − start) mod 1440`.
- `validatePlaydateForm` (`src/lib/feed.ts:1010`) then requires
  `isDuration(durationMinutes)` — and `isDuration` (`:1078`) is **chip
  membership**: `PLAYDATE_DURATIONS_MINUTES = [60, 90, 120, 180]` (`:971`).
- So a parent who sets a **30-minute** window, or a 2.5-hour one, is refused at
  submit with **"Pick a duration."** The app tells them it has to be an hour —
  his sentence, exactly.

The two controls are also coupled by construction (the end is derived from
start + duration), which is his *"I don't want them to be linked together."*

## 2 — Half 1, THE DEFECT: a window's length is free on the app's own grid

In `src/lib/feed.ts`, add **one new predicate** beside `isDuration` — e.g.
`isPostableDuration(minutes)` — meaning *a positive whole number of minutes on
the form's own step grid, up to 24 hours*:

- `minutes > 0`, `Number.isInteger(minutes)`,
- `minutes % TIME_STEP_MINUTES === 0` (the app's 30-minute grid — the same grid
  `isSteppedTime` already enforces for start times; a 20-minute window is not
  representable anywhere in this app and this slice does not change the grid),
- `minutes <= 24 * 60`.

**`isDuration` KEEPS its meaning** — it stays the *chips* membership test
(`PLAYDATE_DURATIONS_MINUTES`) because that is what the chip row's selected state
needs. Two predicates, two names, and the docblocks say which is which. Do not
rename `isDuration`; do not delete it.

**Every site that used `isDuration` as a sanity gate on a stored/derived length
now uses `isPostableDuration`** — check each and say why in the report:
`src/lib/feed.ts:1010` (validation), `:1259`, `:1417`, `:3241` (the three
parse/snap sites), `src/pages/NewPlaydatePage.tsx:184`, `:506`. A stored
30-minute window must read back as **30**, not be reset to 0.

⚠️ **If a database constraint refuses a long window** (a CHECK on `ends_at` or a
duration bound), **stop and report `Status: BLOCKED` with the exact constraint** —
relaxing it is a migration and a ruling, not your call.

## 3 — Half 2, THE POLISH: one control that presents a WINDOW

In `src/components/PlaydateFormFields.tsx`, the `/new` time block becomes **one
refined control that reads as a window**, not a duration:

- **Start and End on one line/row** (the "When" section), each independently
  steppable. Keep the 30-minute step, the existing testids (`end-time-label`, and
  the start control's existing names) and every ≥44px target.
- **Stepping one value does not silently move the other.** The single coupling
  that remains is the invariant a window must satisfy: `end > start`. When a step
  would violate it, the OTHER value moves to preserve a **30-minute minimum
  window** — and the UI **shows that it moved** (a one-line note), so nothing
  happens silently. That is the only link, and the report names it as such.
- **No copy anywhere states or implies a duration vocabulary** — no "1h", no
  "How long" label, no "Ends …" line on `/new` (the V13 pin), and no chip row in
  the branch-1 flow.
- **`/edit` (branches 2/3) keeps `durationBlock` byte-identical.** This slice
  changes branch 1 only; the location-first page and `/edit` are untouched.
- The **derive** must stay a `lib/` function where it already is
  (`stepTimeMinutes`, the `(end − start) mod 1440` rule): React renders, `lib/`
  decides. If you need a new pure helper ("apply a step to a window and return
  the next window plus whether the other end moved"), put it in `src/lib/` with a
  sibling test that **names the defect it detects** (the 30-minute window being
  refused), not the mechanism.

## 4 — Acceptance criteria

1. **A 30-minute window can be posted end to end on `/new`** — create it against
   the live DB and **read `start_at` / `ends_at` back, quoting the output** so the
   span is visible as 30 minutes. A **150-minute** window likewise.
2. `0` (equal start and end), negative, off-grid (`45`) and `> 24h` lengths are
   still **refused**, each with its own assertion — widening a validator is
   exactly how a bound gets lost. `feed.test.ts:1287-1290` pins `0` and `45` as
   errors; **neither may be deleted** — `0` and `45` must still fail, and new
   assertions must show `30`, `150` and `1440` passing.
3. The four chips still write their presets, and a chip selection still reads as
   selected (`isDuration` unchanged in meaning).
4. Stepping the start or the end **never silently moves the other**; when it
   must, the note renders — asserted.
5. No copy on the `/new` form states or implies an hour or a fixed length.
6. `/edit` and the location-first page are behaviourally unchanged — their specs
   pass untouched.
7. The DB round-trip: an off-chip stored duration (e.g. 30) reads back as 30 and
   is not reset to 0 — its own unit test.

## 5 — Verification (quote raw output)

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # must print GUARDS: PASS, exit 0
```

**⚠️ `steering-lint` (and therefore `verify`) exits 1 for a reason that is NOT
yours:** another lane has added untracked docs under `docs/agents/`
(`parallel-development.md`, `compute-split.md`, `fleet-capacity.md`) and has not
yet pointed to them from `AGENTS.md`. The expected green-for-you shape is:
build ✓, typecheck:e2e ✓, test ✓ (**91 files / 2689 tests**, growing with yours),
lint ✓ (88 warnings, 0 errors — keep it at 0 errors), a11y:focus PASS ✓,
steering-lint ✗ **with only those findings**, `guards` **PASS**. **Do not touch
`AGENTS.md` or anything under `docs/agents/`.** Any other failure = stop, report
BLOCKED.

Then the specs, on a private port you own in **4210–4218** (mint the marker ON
that port first, kill by port/PID — never `pkill -f`):

```bash
E2E_BASE_URL=http://localhost:4217 npx playwright test e2e/auth.setup.ts
E2E_BASE_URL=http://localhost:4217 npx playwright test e2e/post-fast.e2e.ts e2e/feed-empty-state.e2e.ts --reporter=list
```

## 6 — Landmines

- Stage **by path only**; never `git add .` / `-A`. Never stage, revert or edit
  `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, or `docs/agents/*`
  (other lanes'). `factory/decisions.md` is the orchestrator's.
- Pre-existing e2e failures — never claim to fix: `feed-empty-state.e2e.ts:301`,
  `places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
- **No migration without a ruling.** Migrations are applied with
  `bash scripts/db-sql.sh --file <path>` and verified by reading the column back,
  then applied again to prove idempotence. **NEVER `scripts/apply-migration.mjs`**
  (it drives the human's own Chrome window).
- This is a **founder-requested behaviour change**: the report must open by
  saying so, in his words, so the record shows who asked for it.
- Ambiguous or blocked? `Status: BLOCKED` with the one question. Do not guess.
