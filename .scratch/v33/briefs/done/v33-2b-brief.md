SENTINEL: V33-2B-FINISH-F9H3

**Slice v33-2, FINISH PASS.** A previous builder session did the work and then
degraded after ~230 steps, leaving everything **uncommitted**. You are a fresh
session. Nothing is on fire; the work is good and needs finishing.

Repo: `~/Projects/playdate-app`. HEAD: `0456f29`. **Do not push.**

**Current tree (uncommitted, and these are the ONLY two files you touch):**

```
 M src/components/PlacePhotoAdmin.tsx     (+224/−101)  — COMPLETE and faithful
 M e2e/place-photo-admin.e2e.ts           (+169)       — INTERRUPTED MID-EDIT
```

**The one known break:** `npm run typecheck:e2e` fails with

```
e2e/place-photo-admin.e2e.ts(59,16): error TS2393: Duplicate function implementation.
e2e/place-photo-admin.e2e.ts(90,16): error TS2393: Duplicate function implementation.
```

`async function readDonorUrl` was inserted twice (a duplicated helper) — the
session was looping on a no-op edit when it died.

Report to **`.scratch/v33-2-report.md`**. Reply with:

```
Sentinel: V33-2B-FINISH-F9H3
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-2-report.md
```

---

## 1 — Read the contract, then the tree

The brief of record is
**`.scratch/v33/briefs/v33-2-brief.md`** (read it: it carries the founder's two
annotations verbatim, the scope, and the acceptance criteria you are finishing
against). `plan.md` §4 "v33-2" is the plan.

Then **read the whole diff of both files** (`git diff`) before changing anything.
The component diff I inspected is correct in shape: the mode picker is gone, the
file input renders first, "Or paste a link" is a field, and
`handleEditCurrent` re-frames the stored photo through the same
`fetchPlacePhotoFile` path. **Do not redesign it.** Confirm it against the
criteria and fix only what is broken or missing.

## 2 — Repair the spec

- **Deduplicate `readDonorUrl`**: exactly one definition, matching what its
  callers expect. `npm run typecheck:e2e` must exit 0.
- Read the spec's diff end to end for any **other** mid-edit damage (a duplicated
  block, a half-replaced assertion, an orphaned comment about a mode step that no
  longer exists). The spec already contains a new block around `:684-718`
  asserting the one-step shape — verify it is coherent and complete.
- The spec still must hold every claim it already made: the crop-cancel
  **no-write** proof, the 2:1 rectangle window, the restore-on-failure path, the
  row-scroll-back, the URL-fallback sentence. **Nothing may be traded away.**

## 3 — Acceptance criteria (the finish is judged on these)

1. The panel shows the **file picker first**; **no mode-selection step** and no
   `photo-mode-url` / `photo-mode-upload` control anywhere.
2. "Or paste a link" renders as a **field** (`input`), visible with no prior
   interaction, and `photo-save-btn` is actionable only when a link is typed.
3. Picking a file opens `crop-photo-dialog` **directly**; confirming writes
   `places.photo_url` — **read the row back from the live DB** and quote the
   output.
4. A typed valid link saves and writes `places.photo_url` the same way — read
   back, quoted.
5. With a photo already stored, **`photo-edit-current-btn`** exists, is labelled
   "Edit photo", opens the crop dialog **on the stored image**, writes the row on
   confirm, and **does not trigger Remove**.
6. Every control keeps a **≥44px** smallest dimension.
7. No stale locator: the spec that clicked the mode buttons is updated **in the
   same diff** (`scripts/guards/stale-locator-guard.mjs`).
8. `git diff` touches **only** those two files.

## 4 — Verification (quote raw output)

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # must print GUARDS: PASS, exit 0
```

**⚠️ `steering-lint` (and therefore `verify`) exits 1 for a reason that is NOT
yours:** another lane created the untracked `docs/agents/parallel-development.md`
at 14:56 and has not yet pointed to it from `AGENTS.md`, so the lint reports
exactly one finding — *"docs/agents/parallel-development.md is not pointed to
from AGENTS.md — unreachable steering"*. **Do not touch it, do not touch
`AGENTS.md`.** The expected green-for-you shape is: build ✓, typecheck:e2e ✓,
test ✓ (**91 files / 2689 tests**, growing with yours), lint ✓ (88 warnings, 0
errors), a11y:focus PASS ✓, steering-lint ✗ **with only that one finding**, and
`guards` **PASS**. Any other failure = stop, report BLOCKED.

Then the spec, **twice**, on a private port you own in **4210–4218**:

```bash
npm run build
npx vite preview --port 4215 --strictPort &
E2E_BASE_URL=http://localhost:4215 npx playwright test e2e/auth.setup.ts   # mint the marker ON this port
E2E_BASE_URL=http://localhost:4215 npx playwright test e2e/place-photo-admin.e2e.ts --reporter=list
```

Kill your server **by port or PID** (`fuser -k 4215/tcp`) — never `pkill -f`.

## 5 — Commit and report

`git add src/components/PlacePhotoAdmin.tsx e2e/place-photo-admin.e2e.ts` —
**by path only, never `git add .` / `-A`.** Message: a `feat(places):` subject in
the repo's style, the founder's two annotations quoted, and:

```
SENTINEL: V33-2B-FINISH-F9H3
```

**Never stage, revert or edit:** `vite.config.ts`, `src/dev/AgentationDev.tsx`,
`CONTEXT.md`, `docs/agents/parallel-development.md` (other lanes').
**Pre-existing failures never to claim:** `feed-empty-state.e2e.ts:301`,
`places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
Blocked or ambiguous → `Status: BLOCKED` with the one question, no guessing.
