SENTINEL: V33-7A-POSTABLE-DURATION-K2V5

**Slice v33-7a — a window's length is free on the app's own grid (the DEFECT
half).** Split from v33-7 by the operator: ship the defect first, the control
polish is **v33-7b** and is NOT in your scope.

Repo: `~/Projects/playdate-app`. Base: HEAD (`71de45e`). **Do not push.**

📌 **WORK ECONOMICALLY.** A previous session spent fifty minutes *surveying* this
codebase with greps and reads and made **zero edits**. The facts you need are in
this brief. **Read only the files listed in §2 and only the regions named.** Do
not grep the repo, do not read other pages, do not look for related work. **Make
the edit, then verify.**

Report to **`.scratch/v33-7-report.md`** (append; if it exists, add a "7a"
section). Reply with only:

```
Sentinel: V33-7A-POSTABLE-DURATION-K2V5
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-7-report.md
```

---

## 1 — The defect (measured; reproduce it RED first)

`/new`'s End stepper writes `durationMinutes = (end − start) mod 1440`
(`PlaydateFormFields.tsx:612-636`). Then `validatePlaydateForm`
(`src/lib/feed.ts:1010`) requires `isDuration(...)`, and `isDuration`
(`src/lib/feed.ts:1078`) is **chip membership** over
`PLAYDATE_DURATIONS_MINUTES = [60, 90, 120, 180]` (`:971`).

So a parent who sets a **30-minute** window — or 2.5 hours — is refused at submit
with **"Pick a duration."** That is the founder's `muyefjzq`: *"I don't want it to
be telling people it has to be an hour."*

**Step 0:** write the failing unit test first (a 30-minute duration expected to be
valid) and quote the red run.

## 2 — The change, and it is small

**`src/lib/feed.ts`:**

1. Add `export function isPostableDuration(minutes: number): boolean` beside
   `isDuration`, meaning *a positive whole number of minutes on the form's own
   step grid, up to 24 hours*:
   - `Number.isInteger(minutes) && minutes > 0`
   - `minutes % TIME_STEP_MINUTES === 0` (`TIME_STEP_MINUTES = 30`, `:974`)
   - `minutes <= 24 * 60`
   Docblock: say WHY it exists (the founder's sentence, the reachable-but-refused
   30 minutes) and how it differs from `isDuration` (chips membership — the chip
   row's selected state still needs exactly that).
2. `:1010` — validation uses `isPostableDuration`.
3. `:1259`, `:1417`, `:3241` — the three parse/snap gates: replace `isDuration`
   with `isPostableDuration` so a **stored 30-minute window reads back as 30**,
   not 0. Keep the `: 0` fallback shape; only the predicate changes.
4. **Do not rename or delete `isDuration`.** `PLAYDATE_DURATIONS_MINUTES` is
   untouched. Grep for `isDuration(` callers only inside the files named in §3 —
   do not chase the repo.

**`src/pages/NewPlaydatePage.tsx`:** `:184` and `:506` — same substitution, and
the comments there that say "one of the form's own options" must say what the
code now does.

**`src/lib/feed.test.ts`:** the block at `:1285-1291`
(`it('requires a duration chip')`). **Neither existing assertion may be deleted**:
`0` and `45` must still fail. Add, in the same block or its own:
`30`, `150`, `1440` pass; `0`, `20`, `45`, `1470`, `2880` and a non-integer fail;
and `isDuration` still reports the four chips only (so the change did not widen
chip membership by accident). Rename the `it(...)` description so it describes
what it now asserts — a test named "requires a duration chip" while asserting
free lengths is the comment-lies defect this repo hunts.

**Out of scope:** `PlaydateFormFields.tsx`, the `/new` layout, any copy change,
the steppers, `/edit`'s branch-2/3 markup, migrations.

## 3 — Acceptance criteria

1. Red-first proven: the 30-minute test fails before the change (quote it).
2. `validatePlaydateForm` accepts `30`, `150`, `1440` and still refuses `0`,
   `45` (each its own assertion).
3. A stored/derived off-chip duration round-trips: 30 stays 30 through the
   parse/snap path — its own test naming the defect.
4. `isDuration` retains chip-membership semantics.
5. **End-to-end proof, real browser, real DB:** on a private port (4210–4218),
   open `/new`, pick a start and step the End **once** (a 30-minute window),
   submit, and **read the row's `start_at` and `ends_at` back from the live DB**,
   quoting both timestamps and their 30-minute span. Mint the e2e marker on that
   port first (`e2e/auth.setup.ts`). A temporary spec or a one-off Playwright
   script is fine — **delete the temporary file before committing**, or keep it
   only if it is a genuine spec of this behaviour and passes in the suite.
6. `git diff` touches only: `src/lib/feed.ts`, `src/lib/feed.test.ts`,
   `src/pages/NewPlaydatePage.tsx`, and (if you keep one) a spec file.

## 4 — Verification (quote raw output)

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # GUARDS: PASS, exit 0
```

**⚠️ `steering-lint` (and therefore `verify`) exits 1 for a reason that is NOT
yours:** another lane added untracked docs under `docs/agents/`
(`parallel-development.md`, `compute-split.md`, `fleet-capacity.md`) and has not
pointed to them from `AGENTS.md`. Expected green-for-you shape: build ✓,
typecheck:e2e ✓, test ✓ (**91 files / 2689 tests**, growing with yours: +3 or
more), lint ✓ (**0 errors**), a11y:focus PASS ✓, steering-lint ✗ with **only
those findings**, `guards` **PASS**. **Do not touch `AGENTS.md` or
`docs/agents/*`.** Any other failure = stop, BLOCKED.

Then `E2E_BASE_URL=http://localhost:<your-port> npx playwright test
e2e/post-fast.e2e.ts e2e/feed-empty-state.e2e.ts --reporter=list`. Kill your
server **by port or PID** (`fuser -k <port>/tcp`) — never `pkill -f`.

## 5 — Landmines

- Stage **by path only**; never `git add .` / `-A`. Never stage, revert or edit
  `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`
  (other lanes').
- Pre-existing e2e failures never to claim: `feed-empty-state.e2e.ts:301`,
  `places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
- **No migration.** If a DB constraint refuses a 30-minute or 2.5-hour window,
  report `Status: BLOCKED` with the exact constraint text.
- This is a **founder-requested behaviour change** — the report opens by saying
  so in his words.
