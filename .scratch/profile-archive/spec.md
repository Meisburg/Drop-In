# Profile archive: a past list that stops scrolling forever — spec (2026-10-05)

**Founder's ask, verbatim (over impeccable live, on `/profile`'s Past section):**

> *"Critique this past section, because if somebody has hosted a lot of drop-ins,
> it's just going to scroll forever infinitely. I feel like it's not a great user
> experience or to look at. I wonder how do you best show information that keeps
> going on and on and on in a way that is a good user experience."*

## 1. What the code actually does today (read, not assumed)

`src/components/ProfileView.tsx:1054-1075`: the Past section maps `past` to the
**same `DropInCard` the feed uses**, then renders the tail as:

```
{/* The cap's honest tail (never pagination at this volume):
    a plain count of the past rows the 50-row fetch left out. */}
{olderCount > 0 ? <p className="text-xs text-slate-500">+{olderCount} older</p> : null}
```

So the list is **capped at 50 rows by the fetch and the remainder is DEAD TEXT**.
Measured: the section is 5548px tall for ~50 cards, ~111px each. Three separate
defects:

⚠️ **THE CAP IS TWO NUMBERS, AND THE BRIEF MUST DECIDE BOTH** (measured in
`src/lib/db.ts`, 2026-10-05):

- `HOST_POSTS_LIMIT = 50` (`db.ts:2030`) — the fetch reads at most 50 PAST rows,
  per section, and `listPostsByHost` returns them all with the split done in the
  render (`partitionPostsByTime`).
- `olderCount = max(0, pastTotal - pastRows.length)` (`db.ts:2115`) — the rows
  BEYOND that 50. **There is no column, query or door that reaches them today**,
  so "+N older" is not a promise the app can keep at any page size.

So "Show 20 more" pages **only the rows already in hand** (≤50). Pick ONE, and
write the reason in the code:

- **(A) Raise the fetch and page locally** — e.g. `HOST_POSTS_LIMIT` 50 → 200 and
  page 5/20 through it. The dead text goes away for every real host, and the
  beyond-200 remainder keeps an honest one-line count. Cost: one number, and a
  larger first read.
- **(B) Keep 50 and say the truth about the tail** — page the 50, and replace
  "+N older" with a line that names the limit rather than a promise the app
  cannot keep ("Showing your 50 most recent past drop-ins.").
  **Do NOT silently drop the remainder** — that turns a visible dead end into an
  invisible one, which is worse and is the exact defect this slice exists for.

**Default: (A), with (B)'s honest line for whatever is still beyond it.** The
brief prefers it because the founder's complaint is "it's just going to scroll
forever" — the fix is a finite first paint, not a shorter fetch.

The three defects:

1. **The cap is a dead end.** The page says "+N older" and offers no way to see
   them. That is the real defect: it promises content and cannot deliver it.
2. **History wears the card of an invitation.** Every past row carries an avatar,
   "@handle", "No one's going yet", a "More info ›" affordance *and* a full-width
   Google Maps link (`card-maps-link`) — the same 111px furniture an actionable
   upcoming drop-in gets.
3. **No anchors.** One flat run of 50 near-identical cards, so the eye has nothing
   to scroll by.

## 2. The recommendation (ranked, and the order matters)

1. **Make the cap interactive and small.** Render the **5 most recent** past rows
   initially, then a single real control: **"Show 20 more"** (paging the next
   batch in place, `min-h-11`). This is the pattern a person already knows from
   Photos, Mail and Messenger, and it makes the page finite on first paint.
2. **Compact the past row** — history is a line, not a card:
   `Wed, Sep 30 · Green Lake Park (East)` + a right-aligned chevron, ~56px, one
   tap target to the drop-in. Drop from the past row: the avatar/@handle (it is
   the viewer's own profile), "No one's going yet" (nobody went; that is what
   "Ended" already says), the "More info ›" label (the row IS the link) and the
   maps row (a past park is not a destination you navigate to).
   This is already the product's own principle — PRODUCT.md #2: *"Perishable
   content leads … let the past recede quietly."*
3. **Group by month** once there are more than ~15: a `text-xs text-slate-500`
   heading per month with its count, so the list has anchors.
4. **Leave upcoming alone**: it is short, actionable, and deserves the full card.
5. Do NOT reach for virtualization or infinite scroll: at 50-200 rows for one
   parent, the honest paginated tail is simpler, more predictable, and better for
   screen readers.

**Before/after, measured:** 50 past rows today = 5548px of scrolling, and
"+N older" unreachable. After: 5 compact rows ≈ 300px, with one button to bring
the next 20.

## 3. Acceptance criteria

1. The Past section renders **5 rows** on first paint for a host with more than 5.
2. The tail is a real `<button>` ("Show N more"), `min-h-11`, keyboard-reachable,
   that appends the next page and disappears when nothing is left; the dead
   "+N older" text is gone.
3. A past row is a single link containing the date and the place, with no avatar,
   no "No one's going yet", no "More info" label and **no `card-maps-link`**.
4. `data-testid="dropin-card"` still marks every row (the specs and the e2e
   helpers select on it), and `card-when` / `card-place` keep their test ids.
5. A host with **0** past drop-ins and one with exactly 5 render exactly as today
   (no empty button, no extra chrome).
6. With more than ~15 past rows, month headings appear with counts.
7. `npm run verify` stays green and the test count GROWS. **The baseline on
   2026-10-05 is `79 files / 2364 tests / 86 warnings / 0 errors / GUARDS PASS`
   — the number in the paragraph above (75/2226) is STALE; use the measured one.**
   `e2e/profile-posts.e2e.ts` owns this surface and must be updated to the new
   tail and pass.

## 3b. THE COVERAGE RESIDUAL THIS SLICE LEFT — do this next, it is small and it is the founder's own complaint

**Landed as `f1414bd`, and this is the gap it left.** AC1 and AC2 below are pinned
by **22 unit tests over the pure plan** (`src/lib/profileArchive.ts` ↔
`profileArchive.test.ts`) and were **measured once on the built app by a throwaway
probe** (`.scratch/profile-archive/probe-archive.mjs`, 18 seeded rows, deleted
after). **No committed browser spec seeds more than three past rows** — measured:
across `e2e/*.e2e.ts`, the largest `starts_at` count in any spec that creates rows
is 3 — so a regression in the first-paint COUNT or in the button's append/retire
wiring would **not** turn the suite red. That is the same class of gap that hid the
`review_summary` bug until a spec asserted a rated line (see `task-state.md`).

**What to build: one committed spec — `e2e/profile-archive.e2e.ts`.** Seed **6–8
past** drop-ins for the marker's own profile through REST (the marker's OWN JWT,
`e2e/feed-empty-state.e2e.ts` is the precedent), then:

- **AC1 in a browser:** Past renders exactly **5** `dropin-card` rows on first
  paint, and the count is asserted with `toHaveCount(5)` — not "at most".
- **AC2 in a browser:** `past-show-more` exists, is ≥44px, and its label counts
  what is left; ONE click appends the rest, and **the button RETIRES**
  (`toHaveCount(0)`) when nothing is left. The old dead `+N older` text must be
  absent at both moments.
- **The tail's honesty:** with the fetch raised to 200 this will normally show
  nothing, so do not manufacture a `olderNote` case unless it is cheap — the unit
  tests own that line.
- **Cleanup, and prove it:** every row the spec creates is deleted in the spec
  (scoped by the marker's own ids/titles), with a **read-back that asserts the
  count is back to what it was**. A cleanup that reports success and removes
  nothing is the `messages`-DELETE defect this repo already paid for.
- **Month headings are optional here:** the `>15` threshold and the per-heading
  counts are pinned by the unit tests; covering them needs 16+ seeded rows, which
  is more live data than the browser half is worth. Say so in the spec if you skip
  it.

**Do not** change `ProfileView`, `profileArchive.ts` or `db.ts` to make this pass —
if the spec fails, that is the finding. Use the private-port + **fresh-marker**
recipe in §3a, stage only your own files, and do not push.



`playwright.config.ts` sets `reuseExistingServer: true`, and `:4173` belongs to a
sibling checkout — a bare `npx playwright test` measures the WRONG APP.

```bash
npm run verify                                   # the gate
npx vite preview --port 4191 --strictPort &
# ⚠️ NAME THE SETUP SPEC, or the run uses whatever session the last FULL run left
# behind. A filtered run selects no test in the `setup` project, so no fresh
# marker is created — and a Supabase access token lives 3600 s, so the app 401s
# with `PGRST303 "JWT expired"` and the failures look like product defects.
E2E_BASE_URL=http://localhost:4191 npx playwright test \
  e2e/auth.setup.ts e2e/profile-posts.e2e.ts
# kill the :4191 listener BY PORT afterwards; never add a playwright.private.config.ts
```

## Not in scope

- Upcoming's card, the feed's card, or `DropInCard`'s own anatomy (this is the
  profile's past list; if the compact row is worth reusing later, that is its own
  decision).
- Virtualization, infinite scroll, search or filtering the archive.
