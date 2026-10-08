# V35 BATCH STATE — the resume snapshot (2026-10-08, 16:20)

**Written by the Hermes CoS on resume.** Read this, then `.scratch/v33/BATCH-STATE.md`
(the deep V33 history), then `plan.md`.

Repo: `~/Projects/playdate-app`. **Nothing is pushed.** `origin/master` = `5fc5f25`.
Master HEAD after this session's work: **`6394810`**.

---

## 0 — UPDATE (16:45): V33-12 also landed

**`muyc3jnt` (the inbox avatar) shipped**: the committing work was `7b7fc76`,
written 09:34 and never merged; this session gated it, found one assertion that
could never pass (`span.rounded-full` counted reaction pills, not faces), fixed
it with real avatar testids (`882753e`), and merged as **`6394810`**. Gate exit 0,
e2e 2 passed on port 4210, guards PASS. **Pending is now 14.**

---

## 1 — What this resume session did

| Action | Result |
|---|---|
| Committed the stalled **V35-C five-miles** slice | `564d165`, merged `5d97383` |
| Gated + fixed + merged the stalled **V33-12 inbox avatar** | `882753e`, merged `6394810` |
| Resolved **9 shipped annotations** in the toolbar | pending 23 → **14** |
| Fixed 2 real test failures the gate caught (see §3) | 92 files / 2709 tests green |
| Applied migration **0069** twice, read back | `radius_miles` default 1 → **5**, idempotent |
| Resolved **7 shipped annotations** in the toolbar | pending 23 → **16** |

## 2 — V35 series status (all landed on master)

| Slice | Annotation | Commit | Merged |
|---|---|---|---|
| V35-A reviewer avatar | `muzk8c1g` | `ff158dd` | `b9804ae` |
| V35-B interests emoji | `muzjx0we` | `75e359d` | `f981c98` |
| V35-C five miles | `muydy8tg` | `564d165` | `5d97383` |
| V34-C onboarding transition | `muzkg290` | `483d5b6` | `c307839` |
| V34-D place pills | `muzk9fk3` | `026776c` | `48833e8` |
| V33-E first-run tour | `muzkh36s` | `f3a98e5` | `8f7b496` |
| map-popup details door | `muzk0bae` | `b13371b` | `2a632fd` |
| muyfptn4 scope (no code) | `muyfptn4` | `a4e9d2f` | `f9df94d` |

## 3 — ⚠️ The V35-C defect the gate caught (lesson)

The stalled V35-C worktree encoded a **false premise** in two tests: that a radius
*below* the new 5-mile default earns a narrow "Back to 5 miles" escape. The
implementation offers the narrow escape only when `radius > DEFAULT` — below the
default you are already narrower, and "Back to 5" would *widen*. Corrected the two
tests to `[20, 35]` at radii 1 and 2. **Rule: a stalled slice's tests are beliefs
until the gate runs. Run `npm run verify` before committing recovered work.**

## 4 — The 16 genuinely OPEN annotations (the real backlog)

### Needs NO decision — dispatchable now

| Annotation | Ask | Note |
|---|---|---|
| `muyc3jnt` | avatar circle LEFT of the person's name in a message thread | **ruled** (§10c); pattern proven in V35-A; brief not written |
| `muyefjzq` | the start/end time control, more elegant, explicitly NOT linked | **ruled**; brief written `.scratch/v33/briefs/v33-7b-brief.md` |
| `muzk3j1e` | coffee-nearby button renders TWICE (real defect) + the ¼-mile data rule | the duplicate is a tiny fix; the ¼-mile (400 m) rule narrows v32-10's 750 m |
| `muzk5y54` | pill row: wrap and show every pill, even spacing | **supersedes** the browse plan's "scrolls sideways" |
| `muye1a35` / `muyemm3k` | settings: logout to the bottom, away from delete-account | **ruled**; part of the settings slice |

### Needs a DECISION first (do not dispatch a builder)

| Annotation | Ask | The decision |
|---|---|---|
| `muye28ed`, `muydzvu9`, `muyemm3k` | the settings page: every section editable or gone; the "families/places" pair | **ruled** in §10c — the editability rule; needs a brief |
| `muye6aeo` | hero photo above the profile name | tension with the V32 "photos stay after the kids" ruling |
| `muye39z4` | moderator tooling recommendations | ADR + one recommendation, no implementation (§10c) |
| `muydnms9`, `muydpqw0`, `muydrqml`, `muydtkbk`, `muyfmj1g` | the /browse search+filter+sort re-imagining | the design pass; corrected plan exists (`.scratch/v33/plan-browse.md`) |
| `muzka6tz` | a "bathrooms available" pill | needs a DATA decision (OSM `toilets`, Overpass) |

## 5 — Routing (unchanged)

- **One local builder lane** (`ninfer/qwen3.8-27b`), everything else on cloud.
- Before any cloud lane: `~/fleet/bin/ollama-cloud-budget --json` — verdict must
  not be CRIT. Measured 16:15: weekly 43 %, session 43.2 %, **verdict OK**.
- Fresh worktree = **copy `.env` in** (gitignored) or `npm run verify` fails with
  `Cannot find type definition` / 18 files failing to load. Then `npm install`
  (a bare worktree has a 20 K `node_modules` stub).
- Stage **by path only**. Never `pkill -f`. Private e2e port 4210–4218.

## 6 — The next slice, decided

**`muyc3jnt` (v33-12)** — the avatar circle immediately LEFT of the person's name
in a message thread. It is **already ruled**, the pattern is **already proven**
(V35-A shipped the same shape on the review row), and it needs no new decision.
Write the brief from §10c's ruling + the V35-A implementation, then dispatch.

**Then:** `muzk3j1e` (the duplicate coffee button — a real defect, tiny), then the
settings slice (`muye28ed` ruled in §10c), then the /browse design pass against
the corrected plan.
