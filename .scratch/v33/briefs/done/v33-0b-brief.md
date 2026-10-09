SENTINEL: V33-0B-OCR-ROUND1-J5R4

**v33-0, FIX ROUND 1/5 — `ocr`'s findings.** Resume your own work; you are the
original builder, and this is the same slice.

Your commit `2af490e` is HEAD, unpushed, and it **stands** — the restored gate,
the mutation proof and the polling direction are all accepted. What `ocr` (the
third review lane, Alibaba open-code-review with machine-enforced project rules)
found is that the *fix itself* has the same class of defect it was written to
remove, plus one finding that invalidates the assertion I told you to keep.

**I was wrong in the brief, and this brief corrects me.** I told you *"the
disjunction and the testid stay byte-identical, because the disjunction is
right"*. Finding 1 (below) proves the disjunction is **not** right. The brief
loses; the source wins.

Repo: `~/Projects/playdate-app`. HEAD: `2af490e`. **Do not push.** All work stays
in `e2e/place-filters.e2e.ts`. Report to **`.scratch/v33-0-report.md`** (append a
"FIX ROUND 1" section; do not overwrite the original report) and reply with:

```
Sentinel: V33-0B-OCR-ROUND1-J5R4
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-0-report.md
```

---

## Finding HIGH — the polled assertion is UNREACHABLE, and the source says so

`src/lib/placeSocial.ts:139-146` + `src/components/PlaceDirectory.tsx:1782-1791`
and `:1968-1973` produce **four** states, not three:

| state | renders |
|---|---|
| `upcomingCount > 0` | `plannedCopy` — "N drop-ins planned here" |
| `upcomingCount === 0` and no proof | `inviteLine` — "Be the first to start a drop-in here today!" |
| `upcomingCount === 0` and `dropInProofLine(proof) !== null` | **NEITHER** — "a place that has hosted keeps quiet" |
| `upcomingCount === null` (read not landed) | neither |

The row's own docblock states it: *"4. else nothing"*. The historical proof line
is **not rendered on the row at all** (the distill pass removed it —
`PlaceDirectory.tsx:1905-1918`), so a hosted place with zero upcoming has **no
text** a spec can key on. Therefore
`filter(statesItsCount).length === countTexts.length` can **never** hold once the
directory contains one such place — the spec would time out at 20 s on a
perfectly healthy app, and the more hosting accumulates, the more certain that
becomes. That is a false-red gate, worse than the flake it replaced.

**Fix: assert what is actually true and actually protective.** The invariant worth
protecting is *"the `upcomingStartTimes` read still drives the rows"* (v32-5
deleted the window and could have taken the read with it). The read is one batched
read for the whole directory, so when it lands, states 1 and 2 appear; when it is
lost, `upcomingCount` is `null` for **every** row and **every** row falls to state
4 — the directory goes entirely quiet. So:

- **poll** until at least one row states a positive count **or** the invite line
  (`filter(statesItsCount).length > 0`) — this fails loudly exactly when the read
  is lost, which is the regression the check exists for;
- assert the snapshot covers every row (`countTexts.length === countRows.count()`),
  so a partial snapshot cannot pass;
- ✅ **do not** claim "every row states its count" any more, and delete that
  sentence from the comment. Replace it with the four-state table above, naming
  the quiet third state and its source line. A comment that states something the
  code does not do is the defect class we are removing here.

## Finding MEDIUM — your `.toBe(await countRows.count())` re-introduces the stale snapshot

JS evaluates the `.toBe()` argument **before** the poll starts, so the expected
count is frozen at one instant, while the actual count is re-read every poll. Move
the comparison inside the callback:

```ts
await expect
  .poll(async () => {
    const countTexts = await countRows.evaluateAll((rows) => rows.map((r) => r.textContent ?? ''))
    return countTexts.length > 0 && countTexts.filter(statesItsCount).length > 0
  }, { message: '…', timeout: 20_000 })
  .toBe(true)
```

The whole point of this slice was the timing race; do not leave one inside the
fix.

## Finding LOW — the descendant walk is a no-op as written

`el.querySelectorAll('*')` with `desc.children.length === 0` matches **nothing**
today: the toggle and the chips carry their label as a **bare text node** of the
button, and their only element children are `svg > path` (no text). So the
"walks the descendants" claim in your comment is not verified by the code — the
same class of defect this slice exists to remove. **Drop the `children.length === 0`
restriction** (any descendant with non-whitespace text is a clip candidate); that
also catches a future wrapping `<span class="overflow-hidden">` that clips its
children while the leaf text node measures fine.

## Finding LOW — the two restored geometry gates are one-shot

`clipped` and `widened` are single `page.evaluate` measurements. A late webfont
swap, a transition, or a scrollbar appearing after the count poll can shift
`scrollWidth`/`clientWidth`. They are the acceptance gate itself, so **poll them**
(`expect.poll(() => page.evaluate(...)).toEqual([])` and `.toBe(0)`) so a
transient reflow is retried instead of failing the run.

---

## Acceptance criteria for this round

1. The count assertion **polls a condition inside the callback** (no
   pre-evaluated `.toBe(...)` argument) and **fails when the read is lost** —
   **mutation-proved**: make `planDirectoryList` set `upcomingCount: null` for
   every row (a one-line scratch mutation), show the spec **failing**, then revert
   and show `git diff` clean of `src/`. This is the proof that the new assertion
   has teeth; without it, "at least one row" could be a vacuous pass.
2. The four-state table is in the comment, with the quiet state named as
   *documented behaviour*, quoting `PlaceDirectory.tsx:1786-1791`.
3. The descendant walk drops the leaf-only restriction, and the comment matches
   what the code does.
4. Both geometry gates poll.
5. `npm run verify` exits 0, holding **91 files / 2689 tests / 88 warnings / 0
   errors · GUARDS exit 0**.
6. `e2e/place-filters.e2e.ts` passes **twice in a row** on your private port
   (marker minted on that port; 4210–4218; kill by port/PID, never `pkill -f`).

## Landmines (unchanged)

Stage by path only — **never** `git add .` / `-A`. Never stage or revert
`vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md` (other lanes').
Pre-existing failures to never claim: `feed-empty-state.e2e.ts:301`,
`places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`. The machine
rebooted at 14:09 — no preview servers are running.
