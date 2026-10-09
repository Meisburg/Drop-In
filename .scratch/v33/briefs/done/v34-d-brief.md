SENTINEL: V34-D-PLACE-PILLS-P5L9

**Slice `muzk9fk3` — the place page shows the place's own attributes as pills.**

⚠️ **YOUR OWN WORKTREE — unique path:**
```bash
cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/place-pills-p5l9 -b place-pills-p5l9 HEAD
cd /tmp/pd-wt/place-pills-p5l9 && npm install --silent 2>/dev/null || true
```
Everything runs in `/tmp/pd-wt/place-pills-p5l9`; commit on branch
`place-pills-p5l9`; **never touch the main worktree or another lane's path**; never
push.

## The annotation

> *"The same filters that were used on the places page to get to this place could be
> populated here and be shown in the same way in pill form to show like these pills
> represent this place, so like coffee nearby, outdoor, playground."*
> anchored on `/place/:id` (`.mx-auto > .flex > div > .mt-1`)

## The work

On the **place detail page** (`src/pages/PlacePage.tsx`), render the place's own
attributes as **pills**, using the same vocabulary the directory already uses:

- the **kind** (`placeKindLabel`) — "Playground" / "Museum" / …
- **indoor/outdoor** (`placeIndoorLabel`) — "Outdoor" / "Indoor"
- **coffee nearby** — from the stored `places.coffee_nearby` column, and **only
  when it is `true`**. The column is three-valued on purpose (`true` / `false` /
  `null` = never asked): a `null` or `false` place must render **no** coffee pill —
  never "no coffee nearby", never a placeholder.

**Only facts already stored on the place row.** Do **not** add a read, a fetch, or
an Overpass call. If a pill you want needs data the row does not carry, leave it out
and say so in the report.

Reuse the **existing pill anatomy** from the directory row (`whitespace-nowrap`,
`shrink-0`, the same radius/padding/type scale, ≥44px where the pill is tappable).
These pills are **labels, not filters** — on the place page they are not buttons, so
they are not pressable and carry no `aria-pressed`.

**Read only:** `src/pages/PlacePage.tsx`, the label helpers in `src/lib/places.ts`,
and the directory's pill markup for the anatomy. Edit first, verify after.

## Acceptance

1. A place with a kind renders its kind pill; a place with indoor/outdoor renders
   that pill — asserted on the rendered text.
2. **`coffee_nearby === true` renders the coffee pill; `false` and `null` render
   none** — three assertions, because collapsing `false` and `null` is the defect
   the column's design exists to avoid.
3. The pills wrap and never widen the page at 390px (`documentElement.scrollWidth <=
   clientWidth + 1`).
4. Signed-out visitors see the same pills (they are public facts about a place, not
   about a parent).
5. Nothing else on the place page changes (reviews, photos, hero, the moderator's
   edit control all untouched — their specs pass unchanged).
6. `git diff` touches only the place page + its spec (+ a `lib/` seam if you need
   one, with a sibling test).

## Gate

`ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify`,
then the same with `npm run guards` → **GUARDS: PASS**. Only `steering-lint` may be
red (another lane's `docs/agents/*`). Run the place specs (`e2e/place-reviews.e2e.ts`
and, if it exists, the place-page spec) on a **private port 4210–4218** (mint the
marker there; kill by port/PID). Stage **by path only**. Report to
`.scratch/v34-d-report.md`; reply:

```
Sentinel: V34-D-PLACE-PILLS-P5L9
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v34-d-report.md
```
