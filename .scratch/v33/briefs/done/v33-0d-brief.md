SENTINEL: V33-0D-OCR-ROUND3-T3W9

**v33-0, FIX ROUND 3/5 — `ocr` round 3, and this is the LAST round on this
slice.** `b28773b` is HEAD and stands. Two findings are real and get fixed; two
are *limitations* and the operator rules they get **documented, not fixed**. All
four are in `e2e/place-filters.e2e.ts`.

Repo: `~/Projects/playdate-app`. **Do not push.** Append a "FIX ROUND 3" section
to `.scratch/v33-0-report.md`; reply with:

```
Sentinel: V33-0D-OCR-ROUND3-T3W9
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-0-report.md
```

---

## FIX 1 (LOW, real) — the kind-chip selector is written twice

`page.locator('[data-testid^="place-kind-chip-"]…)` is spelled once Node-side (the
chip count guard) and again inside the browser `evaluate`. Two copies of one
selector is the drift rule this repo enforces: change the row testid or the chip
prefix and the `:not(...)` exclusion silently stops excluding the scroll
container, and the clip gate falls over in a way nobody sees.

**Fix:** one definition, used by both sides — e.g. a single `KIND_CHIP_SELECTOR`
const (module scope) passed into `page.evaluate` as an argument, the same way the
tolerance already is. The `:not([data-testid="place-kind-chip-row"])` exclusion
must survive the refactor (the scroll container stays exempt — its overflow is
the "still side-scrolls" feature).

## FIX 2 (LOW, real) — the comment says "module-level", the constant is not

The comment claims *"One module-level tolerance"* while `CLIP_TOLERANCE` is
declared **inside the test body**. Either move it to module scope or drop the
word from the comment. **Move it to module scope** — that is what makes it
shareable with the sibling specs that hardcode their own
`scrollWidth <= clientWidth + 1`, which is the drift the comment claims to hunt.
Do not chase those sibling specs in this slice; just make the constant honest and
available.

---

## PARKED 3 (ruled by the operator, do not fix) — the poll is a data-dependent proxy

Correct: the poll passes only if the **live** directory contains at least one
place that is upcoming (`upcomingCount > 0`) or an honest zero (no proof). There
is no DOM signal for the quiet third state (a hosted place with zero upcoming
renders nothing), so a data-independent text assertion does not exist. The
alternatives — waiting on the RPC's network response, or seeding a known place —
either couple the spec to an implementation detail or add a write to a lane that
has none, and this is debt-repair, not a new feature.

**What to do instead:** state the bound in the comment, in one honest sentence —
*"the poll requires ≥1 upcoming-or-honest-zero row in the live directory; a
directory where every place has hosted and has nothing upcoming would false-red
here, which is the price of a text-only signal"* — so the gate's claim matches
what it does. A comment that hides a known limit is the defect; the limit itself
is ruled acceptable.

## PARKED 4 (ruled by the operator, do not fix) — no natural red state

Correct: with today's `shrink-0 whitespace-nowrap` styling, every control the
gate checks is unclippable, so the gate has no natural red against the current
DOM. It is a **regression guard** for a future style change, and its red state is
**mutation-proven** (round 1: `w-24 overflow-hidden` → red, naming every chip).
That is a real guard, not a vacuous one.

**What to do instead:** one sentence in the comment saying so — *"no control here
can clip today by construction (`shrink-0 whitespace-nowrap` inside an
`overflow-x-auto` row); this gate pins that property, and its red is
mutation-proven"*. Nothing else.

---

## Acceptance criteria for this round

1. One selector definition, one tolerance definition, both shared by the Node-side
   guard and the browser-side `evaluate` (passed as arguments).
2. The two parked limits are documented in the comments in the words above.
3. **No behavioural change to the gate**: the round-1 chip mutation
   (`w-24 overflow-hidden`) still turns it **red**, and the chip-row-removal
   mutation still turns the guard **red**. Quote both runs.
4. `npm run verify` exits 0: **91 files / 2689 tests / 88 warnings / 0 errors ·
   GUARDS exit 0**.
5. `e2e/place-filters.e2e.ts` passes **twice in a row** on your private port
   (marker minted there; 4210–4218; kill by port/PID).
6. If any further `ocr`-style concern occurs to you, write it in the report as an
   OPEN FINDING — **do not fix it in this slice.**

## Landmines (unchanged)

Stage by path only — never `git add .`/`-A`; never touch `vite.config.ts`,
`src/dev/AgentationDev.tsx`, `CONTEXT.md`. Pre-existing failures not to claim:
`feed-empty-state.e2e.ts:301`, `places.e2e.ts:2655`, the flake
`places-map-view.e2e.ts:730`.
