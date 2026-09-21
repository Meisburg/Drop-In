# V16 ledger — plan: .scratch/v16/spec.md

Batch opened 2026-09-21. Base commit at batch start: `aafb0a4`.
Per-ticket gate: `npm run build && npm run test`.
Batch gate: full suite + lint + playtest lane.

One line per event. This file survives compaction — trust it and `git log`
over recollection. A commit named here exists in git even if no context
remembers making it.

---

V16: batch opened (base aafb0a4) — 7 tickets in .scratch/v16/spec.md
V16: facts established by explorer subagent f23f7452 — no owner modal (it is a
  Link to /u/:handle → UserPage.tsx); kid photos owner-only by construction;
  5 notification toggles already exist; radius CHECK blocks 1 mile;
  likes cap is UI-only (LIKES_MAX_LENGTH, no migration needed)
V16: founder decision round complete ("accept all") — Q1 widen radius CHECK to
  1–35; Q2 notification discoverability not new kinds; Q3 kid photos on
  /u/:handle when isOwnProfile only; Q4 reorder UserPage.tsx only; Q5 defects
  now, redesign separate; Q6 measurable rules + route screenshots; Q7 merge
  three attendee toggles
V16 t01: dispatched (base aafb0a4) — copy removals + one rewrite; agent 79a305f2
V16 t01: complete (commit 9050706) — copy changes; gates build 0 + 898/898 +
  lint 0 errors; playtest PASS 8 routes 0 JS errors; login copy confirmed in
  screenshot route_login.png. SPEC DEFECT found: the founder's Login string
  never existed on /login (git log -S empty; it lives only at InboxPage.tsx:682
  from 29625a4) — builder returned BLOCKED rather than inventing copy.
  Ruling: replaced the /login brand line instead.
V16 t08: ocr wired as third review lane (open-code-review v1.12.8, npm global).
  Custom provider 'ninfer' -> local NInfer /v1, protocol openai, model
  qwen3.8-27b. PROVED it works: reviewed b259d6a..9050706, 6 files, 212,798
  tokens, 1m20s, tool use (13 code_search + 11 file_read + 4 file_find).
  It found 1 REAL defect on its first run: the committed absolute symlink at
  .opencode/skills/verification-before-completion (mode 120000) would dangle
  on every other checkout. FIXED by vendoring the SKILL.md as real content
  (mode 100644, matching i-have-adhd).
  Ruling: ocr is a COMPLEMENT, not a replacement — its own README trades
  recall for precision, and it reviews code only (skips .md/config as
  unsupported_ext).
V16: playtest lane PASS on the t01 tree (8 routes, 0 uncaught JS errors).
  Tooling note: Chrome must be launched with --remote-allow-origins='*' or
  CDP handshake 403s; script needs `uv run --with websocket-client`.
V16 t02: complete (commits 192f5f0 + 70e2c6e, pushed f57c5d7..70e2c6e) —
  reaction thumb is now an inline SVG honoring currentColor (the emoji ignored
  CSS color). Class decision extracted to PURE reactionButtonClasses /
  reactionCountLabel in src/lib/db.ts (planPing split), 8 sibling tests,
  red-green verified (reverting failed 3 tests). THIRD LANE EARNED ITS KEEP:
  ocr found reactionCountLabel called twice (guard + render) -> hoisted to a
  const in 70e2c6e. Gate: build 0, 905/905, lint 0 errors, playtest PASS 8
  routes. Founder's diagnosis confirmed right, obvious cause wrong — the
  button FILL was never the problem.
V16 t03: CODE-VERIFIED, NOT YET DISPATCHED — item 2 (section order) is ALREADY
  CORRECT (PlaydateFormFields.tsx:608 kids, :652 Details) -> dropped. Item 1
  (remove Ages chips) is NOT A SAFE DELETION: the chips are the ONLY way to set
  a stated age range (NewPlaydatePage.tsx:865-866 -> playdates.age_min/age_max,
  migration 0037), so removing them means no post can ever carry a stated
  range again. NEEDS FOUNDER RULING (i/ii/iii in spec). Item 3 (duplicate row
  overflow) DIAGNOSED: w-fit at NewPlaydatePage.tsx:754-755 fights the column
  flex container at :953.
V16 t03: item 3 SHIPPED as commit 22c00d3 — duplicate-row pills no longer
  overflow. Root cause was w-fit fighting an already-column flex container;
  w-full lets the pill grow to contain wrapped text with the 44px floor intact.
  Builder explicitly verified truncation was NOT acceptable (would silently drop
  the date; nothing else in the DOM repeats the label). THIRD LANE: ocr clean,
  0 findings (47k tokens, 27s). Gate: build 0, 905/905, playtest PASS 8 routes.
V16 t03: items 1 and 2 NOT in that commit. Item 2 (section order) was already
  correct -> dropped. Item 1 (Ages chips) is BLOCKED on a founder ruling:
  removing the chips kills the only path that writes playdates.age_min/age_max
  (migration 0037), so no post could ever carry a stated age range again.
  Options in spec: (i) remove outright, (ii) derive from selected kids,
  (iii) move behind More options.
V16 t04: dispatched (base 1c238bd) — agent 77d74e16. Profile page: unify photo
  + display-name cards, fix the kid-likes input (UI-only cap; DB column is
  already `text`, so NO migration), remove the Hosted-drop-ins card after
  verifying nothing orphaned (must check /new's own duplicate picker exists
  before deleting the only past-posts list on /profile).
V16 t04: complete (24defc6 + dac9137, pushed 15fa3a2..dac9137). THREE LANES
  EARNED THEIR COST: ocr found 9 issues in 24defc6 (3.46M tokens, 9m21s) and
  FIVE were real:
  (1) HIGH — feed-ended-out.e2e.ts has TWO tests; t04 migrated only the first,
      so the second still asserted the deleted card and would have timed out.
  (2) A USER-FACING DEAD END: the feed's only archive link pointed at
      PAST_DROP_INS_HREF='/profile', which no longer lists past drop-ins after
      the card removal. FIXED as a function pastDropInsHref(handle) ->
      /u/<handle> with a /profile fallback. This is the best catch of the batch.
  (3) LIKES_MAX_LENGTH had NO test (how a cap bump ships silently) -> 5 new pin
      tests in db-v3.test.ts.
  (4) A stale `>100` stand-in in profileSave.test.ts spuriously blocked
      101-500-char saves -> now imports the constant.
  (5) KidRow.likes doc still said "<=100" -> now refers to the constant.
  Follow-up NOT hidden: queryMyPlaydatesWithClient now has no production
  consumer (dead code kept alive by tests).
  Gate: build 0, 910/910 (+5), lint 0 errors, playtest PASS 8 routes.
V16 t04 content: profile photo+name unified into ONE card (visual unify; save
  wiring untouched), likes is a textarea rows=3 with a 500 cap (NO migration —
  kids.likes is text), Hosted-drop-ins card + its queryMyPlaydatesWithClient
  effect removed.
V16 t05: complete (662cb2d + e2e fixes 603adca). UserPage avatar size="lg"
  (new variant; md default untouched), sections re-ordered via the
  profileBlurbOrder SEAM (kids -> about -> familyPhoto; family photo is now the
  CLOSER) with tests + a new closer-pinning test, kid photos owner-gated via the
  EXISTING useKidPhotoUrls hook (kidPhotoVisibility byte-identical; visitor path
  unchanged), parent photo added, Message button left alone (already existed).
V16: FULL E2E SUITE RUN — 89 passed, 2 FAILED, both in feed-ended-out.e2e.ts
  and both caused by MY OWN t04 archive-door fix. FIXED in 603adca:
  (1) 'Your family' heading locator became ambiguous once t04 renamed the photo
      card heading to 'A photo of your family' -> strict-mode violation. Fixed
      at intent level (navigate to the surface the door really opens).
  (2) the row locator stayed `locator('li')` after the surface moved from
      /profile (<li> rows) to /u/:handle (DropInCard <a> cards). Fixed to the
      same selector the passing blocks in that file already used.
  Rerun: feed-ended-out 4/4 green. LESSON: targeted e2e runs are NOT a
  substitute for the full suite when a change repoints navigation.
V16: e2e lane note — the full suite takes >10 min (89-91 tests, live Supabase)
  and exceeds the default 600s tool cap; run it as a background job.
V16 t07 item 1: complete (ab33fce + d284c32). THE FIRST ATTEMPT WAS WRONG TWICE
  and I stopped the builder before it shipped: it proposed z-[900] after reading
  .leaflet-control{z-index:800}, but (1) the zoom box is WRAPPED in
  .leaflet-top/.leaflet-bottom at z-index 1000, so 900 loses to the real
  ceiling, and (2) 900 is ABOVE the lightbox (z-60), which would have rendered
  a tapped photo BEHIND a dialog. The constraint is a BAND, not a floor:
  Leaflet <=1000 < modal 1100 < lightbox 1200. VERIFIED IN BUILT CSS:
  .z-[1100]{z-index:1100} .z-[1200]{z-index:1200}
  .leaflet-control{z-index:800} .leaflet-top,.leaflet-bottom{z-index:1000}.
  ocr then found the tokens were in db.ts (wrong: forces ImageLightbox to boot
  the whole data layer + Supabase client for a class string) -> moved to
  src/lib/stacking.ts with a sibling test. Gate: build 0, 916/916 (26 files),
  lint 0 errors, targeted e2e polish+places 14/14.
V16: browser-lane etiquette added to AGENTS.md (human works on this machine):
  full e2e is a BATCH-END lane (8-10 min CPU, run once when they are away),
  slices use TARGETED specs only, backgrounded, nice -n 19, released after.
  Rule 7: several repo scripts (apply-migration.mjs, cdp-sql-runner.py,
  sweep-e2e-markers.mjs, migrate-kid-photos.mjs) drive the HUMAN'S OWN Chrome
  to supabase.com/dashboard via page.goto -- confirm first, prefer the API path.
