SENTINEL: V37-A-EMPTY-FEED-LAUNCHPAD-P4K2

Slice A (v37): the empty feed stops being a dead end — it offers three nearby
playgrounds and the host action, so a new parent who finds no drop-ins still finds
a way to start one. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/empty-launchpad-p4k2 -b empty-launchpad-p4k2 HEAD
Work only there; commit on branch empty-launchpad-p4k2; never touch main or another lane's path.
DO NOT edit AGENTS.md, CONTEXT.md, docs/RELEASE-CHECKLIST.md or vite.config.ts - those are the orchestrator's.

WHY (the founder's own usability review, verbatim):
"The biggest gap is the cold start: the drop-in feed was empty at 1, 20, and 35 miles,
so a new parent may find a park but still not find another family to meet. I'd make
that empty state immediately useful with nearby playgrounds and a clear 'host the
first drop-in' action."

THE DIAGNOSIS (already measured, do not re-derive): the test account showed 234 places
including 151 playgrounds, and ZERO drop-ins. The app has supply of PLACES and no
supply of PEOPLE. So the empty state must not show more content - it must convert the
one parent present into the first host, using the places supply that already exists.

WHAT EXISTS ALREADY - reuse, do not rebuild:
- src/components/RadiusEmptyState.tsx already renders a value-first headline, the
  "Create one here" control (showPostCta / meetup-empty-state), and a door to Places
  (showBrowseCta, V31 v31-1). READ IT FIRST - your change extends its shape.
- The pure seam `createHerePrefill` (src/lib/feedCreateHere.ts) already derives the
  /new prefill from the viewer's own location. REUSE IT; do not write a second one.
- The places read is the SAME read Browse uses - read how BrowsePage.tsx loads places
  (and its radius/kind filter) and reuse that path or its pure helper. Do NOT invent a
  second places query, a second radius helper, or a second kind filter.

WORK:
1. In the FEED's empty state only, show up to THREE nearby PLAYGROUNDS (kind =
   playground - read how PlaceKind names it in src/lib/types.ts; use the existing
   constant, do not hardcode a string you guessed). Each row: the place name and its
   distance, reusing the same distance formatting the browse cards already use.
2. Each row carries the host action: a control that navigates to /new with THAT PLACE
   as the PlacePrefill router state (the same `state.place` shape App.tsx NewRoute
   already consumes). This is the place-page "Start a drop-in here" shape - reuse it.
3. If there are no playgrounds within radius, the playground list does not render and
   the existing state renders unchanged. NEVER an empty list, NEVER a placeholder row.
   The state must never be worse than it is today.
4. Keep the panel's ONE-obvious-action doctrine: the host action at a named playground
   is the PRIMARY control. The existing widen escapes stay secondary. Do not add a
   fourth control.
5. Browse's rendering must stay BYTE-FOR-BYTE unchanged (it passes its own props; the
   feed gates the new behaviour, exactly as showBrowseCta is gated today).
6. No new route. No new query. No synchronous request beyond what the feed already does
   (the places read may be the same read Browse performs; if it is a SECOND request on
   the feed, say so in the report and prefer the lighter option).

ACCEPTANCE: (a) with 0 drop-ins and >=1 playground in radius, the empty state names up
to 3 playgrounds each with its distance; (b) each names a playground that EXISTS in the
same read the browse surfaces use; (c) tapping one lands on /new with that place
prefilled (the prefill is visible in the form); (d) with 0 playgrounds in radius the
old state renders unchanged; (e) Browse is unchanged; (f) 390px, no overflow.

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be fully green. Specs on a private port 4210-4218 (mint marker there; kill by port/PID, never pkill -f). Stage BY PATH ONLY.
Report .scratch/v37-a-report.md, then reply:
Sentinel: V37-A-EMPTY-FEED-LAUNCHPAD-P4K2
Status: DONE | BLOCKED
Commit: <sha7>
