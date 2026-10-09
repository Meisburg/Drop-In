SENTINEL: V33-5-CARD-COUNTS-P7T3

**Slice v33-5 — the card counts parents and kids, and says the ages once.**
Plan of record: `plan.md` §4 "v33-5".

Repo: `~/Projects/playdate-app`. Base: HEAD (`40b1f06`). **Do not push.**

📌 **WORK ECONOMICALLY — this lane's window is ~98k.** Read only the files and
regions this brief names. Edit first, verify after. Do not survey the repo.

Report to **`.scratch/v33-5-report.md`**. Reply with only:

```
Sentinel: V33-5-CARD-COUNTS-P7T3
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-5-report.md
```

---

## 1 — The annotation, and what the card does today

> *"Putting the ages of the kids here looks weird to me. … I guess I'd like to
> just easily see how many kids are going to be there. How many parents are going
> to be there. I guess [you] could provide an age range of the kids because
> there's going to be multiple people there. It's not realistic that you list all
> the ages out of the kids."* — `muyed1t6`

Measured, so you do not have to rediscover it:

- `src/components/DropInCard.tsx:517-526` renders **`card-age-range`** — the
  **host's** kids' ages ("Ages 3–6") — above the place line.
- `:573-626` is the going line: the circle stack, the `+N` overflow, then
  `goingLine.label`.
- `buildGoingLine` (`src/lib/feed.ts:1531`) → `goingCountsLabel` (`:1567-1578`)
  already renders **`3 going · 2 kids (ages 2–5)`**: the parent count, the kid
  count and the **attendee** band all exist. The word **"going"** is the problem
  (V6's own note: *"it only says like one going as in like the parent"*), and the
  card shows **two** age signals at once, which is what he is pointing at.

## 2 — What to change

**a. `goingCountsLabel` (`src/lib/feed.ts:1567`) names both counts explicitly.**
Parents and kids as **words** — e.g. `3 parents · 2 kids (ages 2–5)`, `1 parent ·
1 kid (age 4)`, and the band simply absent when it is unknown (the failed-read
case must keep a truthful label: `3 parents · 2 kids`, never a fabricated age).
Singular/plural both correct; a zero-kid case keeps reading as today's
`N going` equivalent — **there is no "0 kids" state**, say parents only.

**b. One age range per card, decided in `lib/`, rendered by the `.tsx`.** Add the
decision as a pure seam in `src/lib/feed.ts` (beside `cardAgeRangeLabel`) that
answers *which* age line this card shows:

- **the going line renders** (someone is going) → it carries the counts **and the
  attendee band**, and `card-age-range` is **suppressed** — no duplicate ages;
- **nobody is going / the pings were never read** → `card-age-range` stands alone
  as the host's intended ages, the only age signal a fresh post has.

Give the seam a docblock naming the founder's sentence and **a sibling test whose
`it(...)` names the defect it detects** (two age ranges on one card).

**c. Update, in the same diff, every spec that pins the old strings** —
`e2e/feed-ages.e2e.ts` and `e2e/card-circles.e2e.ts` are the known ones
(they assert the label and the `card-age-range` line); `scripts/guards/stale-locator-guard.mjs`
fails if a located string moves without its spec. Search only inside `e2e/` for
the strings you change.

**Out of scope:** the circle stack, the `+N` chip, the card's layout, the place
line, `metBeforeLabel`, the detail page. This is the count copy and the one age
range.

## 3 — Acceptance criteria

1. A card with RSVPs reads parents **and** kids as words with the attendee band;
   a card whose band read failed reads the counts **without** an age claim.
2. **No card renders two age ranges**: assert on the rendered DOM that exactly one
   of `card-age-range` / the band is present — and that the assertion **waits for
   paint** (an absence asserted before the page paints is vacuous; that exact
   vacuity was caught in this repo before).
3. A card with **no** RSVPs still shows the host's intended ages (its own
   assertion — the branch that keeps `card-age-range`).
4. **Mutation-prove the new absence assertion has teeth**: scratch-comment the
   suppression so both lines render, show the spec **failing**, revert, and show
   `git diff` clean of `src/` except your intended change.
5. Singular/plural correct at 0/1/2 (asserted), and a zero-kid card never says
   "0 kids".
6. The signed-out and signed-in card paths both still render (no new leak): the
   change adds no data to what a signed-out viewer sees.
7. `git diff` touches only `src/lib/feed.ts`, `src/lib/feed.test.ts`,
   `src/components/DropInCard.tsx` and the specs you updated.

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
typecheck:e2e ✓, test ✓ (**92 files / 2697 tests**, growing with yours), lint ✓
(**0 errors**), a11y:focus PASS ✓, steering-lint ✗ with **only those findings**,
`guards` **PASS**. **Do not touch `AGENTS.md` or `docs/agents/*`.** Any other
failure = stop, BLOCKED.

Then, on a private port you own in **4210–4218** (mint the marker ON that port
first; kill the server by port or PID — never `pkill -f`):

```bash
E2E_BASE_URL=http://localhost:4213 npx playwright test e2e/auth.setup.ts
E2E_BASE_URL=http://localhost:4213 npx playwright test e2e/feed-ages.e2e.ts e2e/card-circles.e2e.ts --reporter=list
```

## 5 — Landmines

- Stage **by path only**; never `git add .` / `-A`. Never stage, revert or edit
  `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`.
- Pre-existing e2e failures never to claim: `feed-empty-state.e2e.ts:301`,
  `places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
- Ambiguous or blocked? `Status: BLOCKED` with the one question.
