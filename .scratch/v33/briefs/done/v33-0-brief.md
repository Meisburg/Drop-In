SENTINEL: V33-0-390PX-ASSERTION-M2Q8

**Slice v33-0 — the carried V32 debts.** Plan of record: `plan.md` §4 "v33-0".
This brief does not replace it.

Repo: `~/Projects/playdate-app`. Base: **`25dc518`** (HEAD). Local `master`.
**Do not push.** `origin/master` stays at `5fc5f25`.

Write your full report to **`.scratch/v33-0-report.md`** (the repo, NOT `/tmp` —
the machine rebooted at 14:09 and `/tmp` was wiped; durable paths only). In the
pane, reply with **only** these four lines, the `Sentinel:` line immediately
followed by `Status:`:

```
Sentinel: V33-0-390PX-ASSERTION-M2Q8
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-0-report.md
```

---

## 1 — The two defects, both in `e2e/place-filters.e2e.ts`

**(a) A comment that claims an assertion the file does not make.** At `:100-108`:

> *"The 390px no-ellipsis check is NOT lost with it: the indoor toggle and the
> kind chips carry that assertion now, and both are real controls on the
> surface."*

**It is not carried.** v32-5 deleted the `for` loop that did the
`scrollWidth > clientWidth` check, and what follows asserts only the indoor
toggle's *visibility*, its accessible name and its `aria-pressed`. So the gate
is weaker than it says it is — the one open finding in the batch with that
property. Either restore the check or delete the claim; **restore it**, because
the acceptance criterion it belonged to (*"`/browse` still side-scrolls at 390px
without widening the page"*) is still a real requirement.

**(b) A one-shot snapshot with no wait.** At `:124-131`,
`countRows.evaluateAll(...)` is taken **once**. `settleOnRoute` settles the
route, not the data: if `upcomingStartTimesByPlace` has not resolved, every row's
`upcomingCount` is `null`, the row renders neither string the disjunction
expects, and the assertion fails with no retry. It has passed so far by luck.

## 2 — What to write

**For (a):** the check restores the deleted loop's *substance* for the controls
that exist now:

- the **indoor toggle** (`data-testid="places-indoor-filter"`) and **every kind
  chip** (`data-testid={`place-kind-chip-${chip.kind}`}`, inside
  `place-kind-chip-row`) must each have **no clipped text**: for the element and
  each of its text-bearing descendants, `scrollWidth <= clientWidth + 1`.
- and the **page must not widen**: `document.documentElement.scrollWidth <=
  clientWidth + 1` at 390px. That is the *"without widening the page"* half, and
  it is what the original loop's removal actually took away.
- ⚠️ **Pick the element that owns the text.** A chip whose text sits in a child
  `span` can have `scrollWidth === clientWidth` on the button while the span
  clips. Assert on the text-bearing element, and make the failure message name
  the chip.

Keep the existing assertions in that test (the toggle's visibility, accessible
name and `aria-pressed`; the `places-when-filter` / `places-when-sheet` absence
pins; the "Distance" pill absence) — this slice adds, it does not trade.

**For (b):** make the assertion wait for the read to land rather than
snapshotting once. `expect.poll(...)` over the evaluateAll, or wait for the
condition — the testid and the disjunction (`/\d+ drop-ins? planned here/` OR
`/Be the first to start a drop-in here/`) stay byte-identical, because the
disjunction is right; only the *timing* is wrong. Do not weaken it to "at least
one row states its count".

Also update the comment at `:100-108` so it **states what the code now does**.
A comment that describes the previous attempt is the defect this repo hunts.

## 3 — Acceptance criteria

1. The 390px assertion exists and is **mutation-proved**: temporarily force a
   kind chip (or its text element) to `overflow-hidden` + a narrower width in
   `PlaceDirectory.tsx` (or add a deliberately-widening class), show the spec
   **failing**, then revert the mutation. Quote the red run. A restored check
   that cannot fail is not a restored check.
2. The count assertion **polls**; it passes **twice in a row** on the same tree.
3. `git diff` shows **no** change to `src/` after you revert the mutation — the
   mutation proof is scratch only.
4. No comment in the file states something the code does not do. Re-read the
   whole test block you touched and fix any other stale prose **in this file
   only** (do not sweep other files).
5. The file's test count does not fall.

## 4 — Verification (quote the raw output)

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
```

Baseline that must not regress: **91 files / 2689 tests / 88 warnings / 0
errors · GUARDS exit 0**.

Then the spec, **twice**, on a private port you own in **4210–4218**:

```bash
npm run build
npx vite preview --port 4213 --strictPort &        # your port; pick a free one
E2E_BASE_URL=http://localhost:4213 npx playwright test e2e/auth.setup.ts    # mint the marker ON this port
E2E_BASE_URL=http://localhost:4213 npx playwright test e2e/place-filters.e2e.ts --reporter=list
# …run it a second time…
```

**`npm run verify` does not run Playwright.** Playwright restores `localStorage`
per origin, so a lane pointed at a port its marker was not minted on measures the
app **signed out** — mint first, always.

Kill your server **by port or PID** (`fuser -k 4213/tcp`), never `pkill -f`.

## 5 — Landmines

- **Never `git add .` / `git add -A`.** Stage by path only. **Three** dirty files
  belong to other lanes and must never be staged or reverted:
  `vite.config.ts`, `src/dev/AgentationDev.tsx`, **and `CONTEXT.md`** (a domain
  pass by another lane added Group / Member / Admin / Invite-link terms).
- Pre-existing e2e failures — never claim to fix: `e2e/feed-empty-state.e2e.ts:301`,
  `e2e/places.e2e.ts:2655`, the intermittent live-data flake
  `e2e/places-map-view.e2e.ts:730`.
- The machine **rebooted** minutes ago: no preview servers are running, and
  `:4180` / `:4175` / `:5173` are other lanes' — do not touch them.
- Commit with the sentinel in the message body:
  `SENTINEL: V33-0-390PX-ASSERTION-M2Q8`.
- If anything is ambiguous or blocked: stop and report `Status: BLOCKED` with the
  one question. Do not guess.
