# The first-run tour's first step must ring the Drop Ins nav icon — spec (2026-10-05)

**Status:** ready-for-agent. Root cause FOUND with the founder's own words, and the
fix is four files and one constant.

## The founder's report, VERBATIM

This is not the handover's paraphrase. It is the human's own message, recovered
from the previous session's transcript (`~/.dsh/sessions/--home-jmeisburg-Projects-playdate-app--/session-db9c0116-…`, user message seq **2823**):

> *"Also, I caught one more thing. After you create an account and it does the
> tooltips and lightboxes different things, the first thing at lightboxes should be
> the drop-in icon on the bottom left of the app, but it doesn't do that at
> lightboxes something else randomly."*

⚠️ **The handover paraphrased this as "the first tooltip must spotlight the Post /
drop-in affordance" and suspected "a stale target after Post moved out of the
tab bar". BOTH halves of that are wrong**, and they sent the search in the wrong
direction:

- He does **not** mean the Post `+` (which is the nav's CENTRE, and which step 3
  already rings correctly).
- He means **the Drop Ins icon at the BOTTOM LEFT** — the first nav tab
  (`nav-tab-drop-ins`), which is the bottom bar's leftmost control below `md`.
- There is **no stale target**: all five target ids exist and are unique (§ measurement).

## What the code does (measured, not read)

The step's LABEL is already right — `TOUR_LINES[0]` is `'Drop Ins'`,
*"browse drop-ins within your radius, soonest first, and say you're going"*. Only
its TARGET is wrong: `TOOLTIP_TARGET_TEST_IDS.feed === 'feed-section-header'`
(`src/lib/firstRunTooltips.ts:111`), i.e. the feed's **"Near you" `<h1>` at the
TOP of the page**, not the nav icon at the bottom left.

A probe (`e2e/zz-tour-probe.e2e.ts`, run at 390×844 and 1280×720, 2026-10-05)
printed, for every step, the ring's box and what `elementFromPoint` finds at the
ring's CENTRE:

| step | label | declared target | what the ring actually covers | ring == target |
|---|---|---|---|---|
| 0 | Drop Ins | `feed-section-header` | `h1` "Near you / Drop-ins around your area" at **y 65–135** | yes |
| 1 | Inbox | `nav-tab-inbox` | the nav tab at y 786 | yes |
| 2 | Post a drop-in | `feed-post-drop-in` | the raised `+`, 56×56 at y 758 | yes |
| 3 | Places | `nav-tab-places` | the nav tab | yes |
| 4 | Profile | `nav-tab-profile` | the nav tab | yes |

So the mechanism is correct and the FIRST step is the only one that rings
something other than a nav control — which is exactly the founder's *"it
spotlights something else randomly"*: a parent sees a ring around a static
heading at the top of the page while the other four rings are the nav.

## The fix

**1. `src/lib/firstRunTooltips.ts`**

- `TOOLTIP_TARGET_TEST_IDS`: change the `feed` key to **`dropIns:
  'nav-tab-drop-ins'`** — rename the key, do not leave a key called `feed` that
  points at the nav; the old name is what let the wrong target look right.
- `LABEL_TO_TARGET['Drop Ins']` → `'dropIns'`, and the fallback in
  `tooltipTargetForLabel` (`?? 'feed'`) → `?? 'dropIns'`.
- Rewrite the docblock at `:101-109` to RECORD THE REVERSAL, with the founder's
  words verbatim and why the old choice was defensible but wrong: r3-7 pointed at
  the feed's header reasoning "the feed IS the Drop Ins tab", and the founder
  overruled it — the first lightbox must ring the icon a parent can press, in the
  place they will look for it (bottom-left below `md`; the left rail's first item
  above `md` — the SAME testid in both layouts, so the fix is layout-neutral).

**2. `src/lib/firstRunTooltips.test.ts`**

- `:94` and `:102`: `'feed'` → `'dropIns'`; the `:86` comment likewise.
- **ADD the regression pin**, which is the point of the slice: the first step's
  target resolves to the nav's bottom-left control —
  `expect(TOOLTIP_TARGET_TEST_IDS.dropIns).toBe('nav-tab-drop-ins')` and
  `expect(TOOLTIPS_STEPS[0].target).toBe('dropIns')`. One assertion per fact, both
  in the existing `target binding` describe.

**3. `e2e/first-run-tooltips.e2e.ts`**

- **ADD a browser assertion that the FIRST ring is the first nav tab**, measured
  as the ring's box against `nav-tab-drop-ins`'s own box (the ring is the target's
  rect ± 4px — `FirstRunTooltips.tsx:150-155`). This is the founder's rule pinned
  where it can actually fail.
- **REWRITE the now-false comments** in the pass-through test (~`:135-142` and
  ~`:24-30` of its header): they say *"the tour's step 1 card sits by the feed's
  header — far from the nav"* and *"Step 1's target is the feed header, so the
  card cannot sit on the nav in either layout."* With the fix the card sits 12px
  ABOVE the nav (`placeTooltip`'s gap, side `'above'`), so the tap still reaches
  `nav-tab-inbox` — but the reason changed, and a comment that lies is this
  repo's most expensive defect class.

**4. Nothing else.** Do NOT reorder `TOUR_LINES`. The order is the nav's order and
is pinned against `App.tsx` by `firstRunTour.test.ts`; the founder's complaint is
about the TARGET, not the sequence.

## Acceptance criteria

1. `npm run verify` exits 0 and the test count GROWS (the new pin is at least one
   test). Baseline on 2026-10-05: `79 files / 2364 tests / 86 warnings / 0 errors /
   GUARDS PASS`.
2. `e2e/first-run-tooltips.e2e.ts` passes on a private port, including a new
   assertion that step 1's ring box equals `nav-tab-drop-ins`'s box ±4px at
   390×844.
3. Step 1 still shows the `'Drop Ins'` line and its detail; Escape, Skip, the
   pass-through tap and the once-per-tab dismissal are unchanged and still assert.
4. `TOOLTIP_TARGET_TEST_IDS` has no key left named `feed`.

## Verification recipe (private port, FRESH TOKEN)

```bash
npm run verify
npx vite preview --port 4191 --strictPort &
# ⚠️ NAME e2e/auth.setup.ts: a filtered run selects no test in the `setup`
# project, so the run reuses the last FULL run's session — and a Supabase access
# token lives 3600 s, so the app 401s `PGRST303 "JWT expired"` and the failures
# look like product defects.
E2E_BASE_URL=http://localhost:4191 npx playwright test e2e/auth.setup.ts e2e/first-run-tooltips.e2e.ts
# kill the :4191 listener BY PORT; never add a playwright.private.config.ts
```

## Why this is not a product-argument

It does not change what the tour teaches, its order, or its copy. It changes which
element the FIRST ring is drawn around, from a heading to the control the step's
own label names. A one-constant fix with a founder-quoted rationale.
