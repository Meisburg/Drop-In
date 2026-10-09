SENTINEL: MEETUP-EMPTY-STATE-C4K9

Slice meetup-a62da3b6fca2. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/meetup-empty-c4k9 -b meetup-empty-c4k9 HEAD
Work only there; commit on branch meetup-empty-c4k9; never touch main or another lane's path.

THE SPEC (the founder's annotation, paraphrased — it is the spec):
Meetup's SearchResultUiState.EmptyOrError carries {text, actionText, emptyAction,
mapItems} and KEEPS THE MAP RENDERED. Its empty state is not a dead end; it is a CTA
with the map still there. Drop In's empty-radius state is a bare centered card with
NO map and NO location-seeded create. Close exactly those two gaps. Do NOT rebuild
anything else — the count, the widen escapes, the beyond-count, and the Browse door
already ship and must stay exactly as they are.

WHAT ALREADY SHIPS in src/components/RadiusEmptyState.tsx (do NOT touch/change):
  - emptyRadiusCopy(radiusMiles)        — the honest "Nothing within N miles yet."
  - radiusEscapes(radiusMiles)          — the widen buttons (back to default / 20 / 35)
  - emptyRadiusBeyondCopy(count)        — the "N further out" line
  - showBrowseCta                       — the V31 Browse door
  - the post CTA + the no-zip early return (LocationRequiredNotice)

BUILD THESE TWO THINGS:

1. THE MAP STAYS (gap: mapItems). In the FEED's empty-radius render (FeedPage.tsx,
   the `posts.length === 0` branch that renders <RadiusEmptyState>), when the feed
   knows at least one place-with-a-pin, render the feed's EXISTING map band next to /
   above the empty card, so the parent sees WHERE the emptiness is. Reuse the feed's
   existing map band component and its existing pins/gazetteer state — do NOT add a
   new read, a new fetch, or a new map component. If there are no pins, render
   exactly what renders today (the bare card — the "no empty canvas" rule). The
   map band is already keyed off feedPins/feedMapFrame; the empty branch is simply
   the one path that skips it.

2. THE "CREATE ONE HERE" CTA (gap: emptyAction). Add ONE new secondary control to
   the empty state: "Create one here", which navigates to /new seeded with the
   viewer's CURRENT location so the post starts where the parent already is.
   - The prefill path EXISTS: /new already accepts router state
     { state: { place: PlacePrefill } } (App.tsx NewRoute; PlacePrefill in
     src/lib/types.ts: { placeId, place, address, neighborhoodId }). This slice
     seeds that same shape from the viewer's located place when the feed's empty
     state can name one (e.g. the viewer's own zip/home place).
   - If no place can be named, the CTA is NOT rendered (never a control that
     swallows its tap — the same discipline the escapes already follow).
   - Add it as a NEW prop on RadiusEmptyState (default OFF) so Browse's caller
     (PlaceDirectory.tsx) is byte-for-byte unchanged. Only the FEED passes it true.
   - Copy: "Create one here". This is NOT the "Post a drop-in" link V23 removed
     (the raised nav "+" remains the persistent post action). "Create one here"
     is a DIFFERENT action: it carries the viewer's location. Keep showPostCta
     false on the feed exactly as it is.

3. PURITY + TEST: put the prefill derivation in a PURE seam in src/lib/ (next to
   the existing feed helpers) with a SIBLING TEST naming the defect it detects:
   the defect is a "Create one here" CTA that either (a) fires with NO location
   (seeds an empty place) or (b) seeds a place whose placeId does not match the
   named place. Unknown/no place -> the CTA does not render (its own assertion).

NON-NEGOTIABLES:
  - No new DB read or write. No new fetch. No schema. Reuse existing state only.
  - Browse's caller is unchanged (new prop defaults off).
  - Read first: FeedPage.tsx (the empty branch + the map band), PlaceMapLazy,
    RadiusEmptyState.tsx, App.tsx NewRoute, NewPlaydatePage prefill handling,
    src/lib/types.ts PlacePrefill, src/lib/feed.ts.

ACCEPTANCE:
  (a) Feed empty state with >=1 known pin renders BOTH the empty card AND the map band;
  (b) Feed empty state with 0 pins renders the card and NO map (no empty canvas);
  (c) A "Create one here" control renders when the viewer's location can be named,
      and navigating it lands on /new with the place prefilled;
  (d) With no nameable location the control does NOT render;
  (e) Browse's RadiusEmptyState render is unchanged (its existing spec still passes);
  (f) 390px: no horizontal overflow (scrollWidth <= clientWidth + 1).

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be FULLY green — no waivers. Specs on a private port 4210-4218. Stage BY PATH ONLY (never git add -A; the two dirty files vite.config.ts + src/dev/AgentationDev.tsx belong to another session).

Report .scratch/meetup-empty-state-report.md, then reply:
Sentinel: MEETUP-EMPTY-STATE-C4K9
Status: DONE | BLOCKED
Commit: <sha7>
