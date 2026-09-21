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
V16 t06 item 1: complete (c6000e9 + 893d53b). Feed gets a PERSISTENT radius
  picker (feed-radius-filter) above the list, rendering in all three list states;
  reuses updateHomeZipRadius + refresh() so the refetch is free via the load
  effect's contextKey. RadiusEmptyState gains showEscapes (default true) and the
  FEED passes false -- coexist but never simultaneously, since on the feed's
  empty branch the picker and the escapes would be two near-identical radius
  rows one line apart. New pure seam radiusChoices(radiusMiles) + 7 tests,
  including an off-ladder insert guard (a <select> whose value matches no
  <option> lies about the state it drives).
  THIRD LANE FOUND A CRITICAL MISS: I had updated feed-ended-out.e2e.ts and
  claimed the coverage was handled, but e2e/feed-empty-state.e2e.ts ALSO drove
  the escape buttons (widen.click() + stored-radius assertions) and would have
  timed out. ocr found it by searching for other consumers of the removed
  control; I had only checked the spec I already knew about. Fixed by driving
  the new picker; both specs rerun 7/7 green. Also interpolated the hardcoded
  '35 mi' ceiling label.
  Gate: build 0, 924/924 (26 files), lint 0 errors, targeted e2e 7/7.
V16: REMAINING WORK IS ALL FOUNDER-BLOCKED. t03 item 1 (Ages chips) and t07
  items 2-4 (map zoom policy, 1-mile migration, Airbnb redesign). Both blockers
  now carry a coordinator recommendation + the cost-if-wrong in the spec:
  Ages -> (ii) derive from kids [option (iii) is IMPOSSIBLE: the More options
  disclosure was deleted in V13]; map -> (b) fit the radius circle [no safe
  interim default, so undispatched].
V16: CORRECTION (round 8) — I had OVER-CLASSIFIED the blockers. Re-read the
  accepted decisions table and separated "accepted, just not yet built" from
  "genuinely unruled":
  * t07 item 3 (1-mile) — Q1 WAS ACCEPTED ("widen to 1-35, one migration").
    Never blocked; I mis-filed it. DISPATCHED round 8.
  * t07 item 4 (distance dropdown) — Q4 WAS ACCEPTED (keep both, demote the
    dropdown to a compact control). Not blocked.
  * t07 items 5-7 (Airbnb redesign) — Q5 ACCEPTED (defects now, redesign to its
    own spec+batch). Not blocked; deliberately deferred by decision, not by
    missing input.
  * t07 item 2 (map zoom / blue blob) — GENUINELY UNRULED (a/b/c).
  * t03 item 1 (Ages chips) — GENUINELY UNRULED (i/ii); option (iii) is
    impossible.
  LESSON: "blocked" means "no ruling exists", NOT "no code written yet". I was
  reporting accepted decisions as blockers, which understates how much is
  actually dispatchable.
V16 t07 item 4: complete (1d15859 + 6c1c07b). Browse distance control DEMOTED
  (Q4: kept, not removed -- Set location = origin, dropdown = range). Moved from
  a full-width form row into the filter-chip row as an inline pill. Presentation
  only: `git diff -w` proves the value/onChange/option VALUES are byte-identical.
  ocr found THREE things; the best was an INCOMPLETE PLURAL FIX: the Set
  location modal still rendered "Radius: 1 miles" (slider min={1}), the third
  site of the same bug I had fixed at two. Also extracted the nested ternary
  into pure distanceSelectValue/distanceChoiceFromValue + 4 round-trip tests
  (the mapping was untestable inline). Gate: build 0, 932/932, lint 0 errors,
  targeted e2e places+feed-empty-state 12/12.
V16: factory hardening this round — .scratch/check-push-range.sh makes the
  auto-push "clean range" check MECHANICAL. The rule already listed
  supabase/.temp/; I violated it anyway by typing the check from memory and
  omitting that path. The script was TESTED against a reproduction of the real
  leak (fails, exit 1, names the pattern) and against a legitimate
  supabase/migrations/ file (passes). AGENTS.md now bans `git add -A <dir>`.
V16: REMAINING-WORK INVENTORY (round 11) — verified by reading every ticket, not
  by memory. Of the 26 triaged items:
  SHIPPED: t01 (copy), t02 (reaction), t03 item 3 (duplicate rows), t04
    (profile), t05 (UserPage), t06 item 1 (feed radius picker), t07 items 1, 3, 4
    (modal z-index, 1-mile, dropdown demotion), t08 (ocr lane).
  DROPPED AS ALREADY-CORRECT (4): t03 item 2 (section order already right),
    t05 item 3 (Message button already existed), t06 item 1's escapes (partly
    built), t02's obvious diagnosis (was the emoji, not the fill).
  STILL UNBUILT (3):
    * t06 item 2 (ZIP setter on the feed) — NOT BLOCKED. Reuses the existing
      validating updateHomeZipRadius; the refetch is free via contextKey.
      DISPATCHED round 11. I had been leaving this out of the unbuilt list.
    * t03 item 1 (Ages chips) — BLOCKED: founder ruling i/ii.
    * t07 item 2 (map zoom / blue blob) — BLOCKED: founder ruling a/b/c.
  DEFERRED BY DECISION: t07 items 5-7 (Airbnb redesign) — founder decision Q5
    says it gets its own spec + batch. Not blocked, not this batch.
  NEEDS A CREDENTIAL: migration 0045 apply — .env has only the anon key, which
    cannot run DDL; the existing script extracts a token from the human's own
    logged-in Chrome (opens a window). Options given: A (run script, tab
    appears), B (paste a sbp_ token, no browser), C (human runs the SQL).
  LESSON (second time this batch): I keep under-counting dispatchable work by
  treating "no ruling recorded yet" and "not yet built" as the same thing. Only
  i/ii and a/b/c are genuine blockers.
V16 t06 item 2: complete (6664274 + 9d88ec1). Feed gets a "Where you are" ZIP
  row: current zip label (or "No home zip set yet."), 5-digit input, Save.
  Reuses updateHomeZipRadius and passes the CURRENT radius through unchanged so
  changing the zip cannot reset it; refetch free via contextKey.
  THE BUILDER FOUND A REAL DEAD END: with t06.1 suppressing the escapes and the
  escapes already disabled without a zip, a viewer with no home_zip on the Feed
  had NO radius control, NO escapes, and NO zip control -- only "Post a drop-in".
  Three suppressions stacking. The zip row closes it (enabled in that state).
  ocr then found TWO defects in the INTERACTION between this batch's two new
  controls -- the class per-slice review misses:
   (1) a FALSE ERROR: an empty draft over a saved zip reached the validator and
       printed "Add your home zip." under "Showing drop-ins near 98107". Fixed
       as the pure tested seam feedZipSaveIsNoop (5 branches).
   (2) a WRITE RACE: both controls PATCH home_zip AND radius_miles in one
       statement but guarded only their own busy flag, so overlapping writes
       could silently discard the loser's change. Fixed on both sides.
  Gate: build 0, 940/940, lint 0 errors, targeted e2e 7/7.
V16: with this, EVERY non-blocked item is shipped. Genuinely blocked: t03 item 1
  (Ages i/ii) and t07 item 2 (map a/b/c). Deferred by decision Q5: the Airbnb
  redesign. Needs a credential: migration 0045 apply.
V16: BATCH-END PLAYTEST LANE RUN (round 12) — PASS, 8 routes, 0 uncaught JS
  errors, 8 screenshots. The lane covers the public routes only.
  ALSO CAUGHT MYSELF SHIPPING FALSE COVERAGE: I added /u/:handle to routes.json
  to close a real gap (t05 changed that page heavily and the lane did not cover
  it). The run said PASS 9 routes -- but the SCREENSHOT WAS THE LOGIN PAGE. The
  playtest script has no auth support, so an auth-gated route just redirects and
  the entry passes while asserting nothing. Reverted; routes.json is unchanged.
  The route IS covered, by ten e2e specs under the marker storageState. Recorded
  the trap in docs/agents/playtest-lane.md so the next agent does not re-add it.
V16: NON-BLOCKED WORK IS NOW EXHAUSTED. Remaining: t03 item 1 (Ages i/ii),
  t07 item 2 (map a/b/c), migration 0045 apply (needs a credential). Deferred by
  decision Q5: the Airbnb redesign.
V16: *** LIVE PRODUCTION INCONSISTENCY — FOUND ROUND 13, NEEDS MIGRATION 0045 ***
  Verified against the DEPLOYED bundle, not inferred:
    live entry asset  /assets/index-CQ4p4YVb.js  (816,901 bytes)
    local built asset /assets/index-BKVu1wLU.js  (different -> live is behind,
      but Vercel has auto-deployed MOST of this batch)
  LIVE and confirmed present in the served bundle: t01 login copy ("See what
  families are up to in your area"), t06.1 feed radius picker
  (feed-radius-filter), t06.2 zip setter ("No home zip set yet"), t04 profile
  unify ("Your photo & name"), t01 settings heading.
  AND the live bundle ships the radius ladder as [1,2,5,10,20,35].
  BUT the live DATABASE still carries `profiles_radius_miles_chk` = between 2
  and 35, because 0045 is NOT applied.
  CONSEQUENCE, on production right now: the deployed UI OFFERS "Within 1 mile"
  and the DB REJECTS the write. The JS validator passes it (RADIUS_MIN_MILES is
  already 1), so the failure comes back from Postgres as an error, which
  handleRadiusChoice catches and shows as a red line -- a graceful failure, but
  the user is offered an option that cannot be saved.
  THIS REORDERS THE REMAINING WORK: applying 0045 is no longer a tidy-up, it is
  the fix for a live defect. It needs a credential (options A/B/C in the ledger
  above).
  NOT a defect in the shipped code: the code and the migration are consistent
  with each other. The gap is purely that the DB half of a two-part change has
  not landed. That is what the batch-end apply step exists for, and why the
  migration shipped with its UI in the same slice.
V16 t09: complete (ae09937 + d24ba3b). A rejected radius write now renders
  English, not a raw PostgREST CHECK string. Pure radiusSaveErrorMessage in
  lib/feed.ts, used by ALL FOUR surfaces that perform this write.
  FOUND BY VERIFYING THE DEPLOYED BUNDLE, not by reading code: Vercel already
  shipped the 1-mile UI while the DB still rejects it, so real users could hit
  this. Nothing in src/ handled SQLSTATE 23514.
  TWO BUGS INSIDE THE FIX ITSELF, both caught before ship:
   (a) the builder's FIRST attempt had the branches in the wrong order --
       supabase-js wraps the PostgREST body in an `Error`, so a passthrough
       keyed on instanceof Error swallowed the CHECK case and re-rendered the
       raw SQL. Its own red test caught it; a test now pins the order.
   (b) MY commit claimed "three copies of the branch" -- ocr found a FOURTH
       call site: OnboardingPage writes through the same function, offers the
       same 1-mile option, and still inlined err.message. Now routed through
       the mapper too.
V16: the generic fallback is now subject-neutral ("Could not save your
  location") because ONE mapper serves radius + zip + escape + onboarding; the
  old radius-specific wording misattributed a zip failure.
V16: gate on this tree — build 0, 948/948 unit (26 files), lint 0 errors,
  targeted e2e 5/5. Migration 0045 STILL NEEDS A CREDENTIAL; t09 makes the
  transient failure legible but does NOT remove it.
V16: LIVE PRODUCTION RE-VERIFIED (round 15) — Vercel deployed again, entry asset
  moved CQ4p4YVb -> index-wZsbF7if.js (817,110 bytes). Confirmed present in the
  SERVED bundle:
    t01 login copy ("See what families are up to in your area")     LIVE
    t06.1 feed radius picker (feed-radius-filter)                   LIVE
    t06.2 zip setter ("No home zip set yet")                        LIVE
    t04 profile unify ("Your photo & name")                         LIVE
    t09 friendly CHECK copy ("That radius isn't allowed yet. Pick
        between 1 and 35 miles.")                                   LIVE
  AND the live radius ladder is still [1,2,5,10,20,35].
  SO THE LIVE STATE IS NOW: the UI offers 1 mile, the DB still rejects it, and
  the rejection renders ENGLISH instead of raw SQL. t09 did its job — the
  failure is legible, not fixed. 0045 remains the actual fix.
  TOOLING NOTE: grepping the bundle for a straight quote MISSED the t09 copy
  until I used the curly apostrophe — the bundle uses U+2019. This is the exact
  trap docs/agents/playtest-lane.md already records for must_contain needles.
V16: AUDIT AXIS 3 (round 23) — commit/ledger/deploy integrity. Result: CLEAN.
  * Every commit NAMED in this ledger is on origin/master (the 3 that first
    looked unpushed were SUBAGENT ids caught by a too-greedy sha regex, not
    commits — worth recording so the next audit does not re-raise them).
  * 54 commits in the aafb0a4..origin/master range.
  * Deploy sync: the live asset (index-wZsbF7if.js) is BEHIND the final tree
    (index-3n-_HuUV.js), and that is HARMLESS — verified rather than assumed:
    `git diff --name-only 5cb6901..HEAD` shows the five commits after the last
    deploy touch ONLY e2e specs, src/lib/feed.test.ts, and .scratch docs. ZERO
    product code. So production matches the shipped product exactly; the
    difference is tests and planning artifacts, which never ship.
  * t09 (the user-facing fix for the 1-mile rejection) IS live.
V16: AUDIT AXES NOW COVERED — e2e coverage per testid (rounds 19-21), unit
  coverage per new exported function (round 22), commit/ledger/deploy integrity
  (round 23). All three are clean except the two known blocked tickets and the
  0045 apply. The remaining V16 work genuinely requires the founder.
V16: CONCURRENT SESSION DETECTED (round 24) — another agent refactored the docs
  and installed a git hook while this batch was running. NOT MINE; left
  uncommitted deliberately.
  WHAT THEY CHANGED (file mtimes 11:40-12:16, uncommitted):
   * AGENTS.md condensed 217 lines -> 27 changed, with detail moved out:
     `npm run verify` is now the declared single gate (build+test+lint), a slice
     budget section (98k local window), and a "read on demand" doc index.
   * NEW docs/agents/: auto-push.md, browser-lanes.md, coordinator.md,
     model-routing.md, course-review-2026-09-21.md. All four referenced docs
     EXIST (verified).
   * NEW scripts/install-git-hooks.sh + a REAL .git/hooks/pre-push that enforces
     the auto-push rule: it blocks on machine-local artifacts in the range, and
     runs the gate unless FAST_PUSH=1.
   * package.json: added `typecheck` (tsc -b --noEmit) and `verify`.
  VERIFIED, not assumed:
   * `npm run verify` exits 0; 952 tests; lint 0 errors.
   * `npm run typecheck` correctly exits 2 on a planted type error and 0 on a
     clean tree. (My first reading said "exit 0 on error" — that was MY
     measurement bug: piping through `tail` masks the exit code. Worth recording
     because that is exactly the class of error this batch has been hunting.)
   * The pre-push hook RUNS and PASSES on this tree: "PASS — gated push to
     origin/master is clean and green."
  MY V16 WORK SURVIVED THE REWRITE: Review lanes / escalating fix loop / build
  law / ocr are all still in AGENTS.md; browser-lane etiquette moved into
  docs/agents/browser-lanes.md (12 matching rules there).
  DELIBERATELY NOT COMMITTED: another session's in-flight refactor is not mine
  to commit or fold into a V16 slice. Flagged to the human instead. Note their
  change and mine both touch AGENTS.md, so a commit now would either absorb
  their WIP or conflict with it.
V16: CONCURRENT SESSION STILL ACTIVE (round 25). Their refactor kept GROWING:
  plan.template.md, task-state.template.md and scripts/pre-push are newly
  touched since round 24, and five files changed within the last 5 minutes.
  SO I DID NOT COMMIT THEIR WORK — a second writer is live in this repo, and
  staging their in-flight edits into a V16 slice would be wrong.

  WHAT I VERIFIED INSTEAD (the safe, useful work available):
   * ALL 11 V16-shipped product files are byte-identical to HEAD: stacking.ts,
     feed.ts, db.ts, FeedPage, UserPage, ProfilePage, BrowsePage, InboxPage,
     ImageLightbox, feed-empty-state.e2e.ts, dm.e2e.ts. Nothing of mine was
     disturbed by the other session.
   * One scare investigated and cleared: src/lib/stacking.ts showed a fresh
     mtime, but `git diff` proves it is UNMODIFIED — the timestamp moved from a
     build/read, not an edit. Checked rather than assumed, because a silent edit
     to a shipped file would be the worst possible finding.
   * `npm run verify` exits 0 WITH their changes present: 952/952, lint 0 errors.
     So the concurrent refactor does not break the product or the gate.
   * Their hook design is clean: scripts/pre-push is the TRACKED source and
     .git/hooks/pre-push the installed copy — byte-identical (3178 bytes each),
     so the install is reproducible rather than a mystery file in .git/.

  RULING: do not touch AGENTS.md or package.json while another writer is active
  in them. My round-24 edit attempt failed for exactly this reason (the file
  changed under me), which is the system working.
V16: CONCURRENT WRITER CONFIRMED LIVE, MID-EXPERIMENT (round 26).
  `.scratch/playtest/routes.json` CHANGED TWICE WHILE I WAS READING IT:
   * first read: a version adding real must_contain needles AND a `_comment`
     entry explaining the auth-gate trap (better than my version — it encodes
     the round-12 lesson in the file itself)
   * that version had a LATENT BUG I verified and then watched disappear:
     `scripts/playtest_check.py:80` does `rt["path"]` unconditionally, so any
     entry without a `path` key raises KeyError. I REPRODUCED IT (`KeyError:
     'path'`) and confirmed their own lane would have crashed on the next run.
   * second read, minutes later: the `_comment` entry was GONE and a deliberate
     `THIS-STRING-DOES-NOT-EXIST` probe was in its place on `/` — i.e. THEY were
     testing the lane's failure detection at the same moment.
   * third read: 8 clean entries, probe removed. They had already moved on.
  CONCLUSION: they are not just leaving edits behind, they are actively working
  in this file. Two consequences:
   1. My round-25 ruling to not commit their WIP was correct and should be held.
   2. I must not "fix" files they are editing either — I nearly patched the
      KeyError, which was theirs to fix and which they did fix themselves.
  WHAT I DID INSTEAD: verified the lane RUNS against their current file and
  reported honestly (one failure was MY missing --out dir, not their bug —
  recorded so it is not mistaken for a regression). Released the preview server
  and Chrome I had started for the check.
  NOTE FOR THE NEXT AUDIT: run the playtest lane fresh before trusting
  routes.json; it is under active edit by another writer.
V16: CONCURRENT WRITER FINISHED AND COMMITTED (round 28) — c6762ad "Factory:
  enforce the gate, prune the steering layer, arm the playtest lane".
  The tree is CLEAN again and the second writer has stopped.
  WHAT THEY LANDED (15 files, 1128 insertions):
   * scripts/pre-push + install-git-hooks.sh — a REAL git hook that refuses a
     push on a dirty range (never skippable) or a red gate (FAST_PUSH=1). They
     verified it in a throwaway repo against supabase/.temp/linked-project.json
     -- the exact leak this batch made -- and confirmed FAST_PUSH cannot bypass
     the range check.
   * npm run verify = build && test && lint && steering-lint; npm run typecheck.
   * AGENTS.md 3,150 -> 1,660 words; always-on payload 3,221 tokens = 3% of the
     98k window; four docs extracted behind when-to-read pointers.
   * .scratch/context-load.sh measures the payload and flags pointer rot.
   * routes.json armed with real must_contain needles.
  IT DOES NOT CONFLICT WITH V16: `git show --name-only c6762ad` touches NO src/
  or e2e/ file. All four V16 factory sections (ocr, Review lanes, escalating fix
  loop, build law) are still present in the rewritten AGENTS.md.
  VERIFIED AFTER THEIR COMMIT, on the merged tree:
   * `npm run verify` exit 0 — including their steering-lint ("every steering doc
     is reachable from AGENTS.md").
   * playtest lane PASS, 8 routes, 0 uncaught JS errors, with THEIR armed routes.
   * my task-state record survived (V16 present; the corrected live asset hash
     index-wZsbF7if is intact).
  Their thesis, which matches what this batch kept re-learning: our verification
  stack was excellent and ENTIRELY VOLUNTARY. This batch lost a night to exactly
  that -- a hand-typed range check reported clean while carrying a leaked project
  ref. Now the gate runs whether or not an agent remembers it.
V16: THEIR PRE-PUSH HOOK VERIFIED INDEPENDENTLY (round 29). Reproduced the
  original leak in a throwaway repo (supabase/.temp/linked-project.json inside
  the pushed range) and ran the installed hook against it:
   * it BLOCKED the push, naming the offending path and the pattern;
   * FAST_PUSH=1 could NOT bypass the range check (it skipped only the
     build/test/lint half, exactly as documented);
   * it exits 1 on refusal, which is what makes git actually stop.
  So the protection this batch lacked -- a hand-typed check that reported clean
  while carrying a leaked project ref -- is now machine-enforced.
  ALSO VERIFIED: every V16 rule survived their AGENTS.md rewrite. My first grep
  said "never git add -A" was MISSING; it is NOT -- it moved to
  docs/agents/auto-push.md:49 (capitalised), reachable from AGENTS.md. Pattern
  too strict, not a real gap.
  ONE GENUINE FRAGILITY, recorded not fixed (it is their design call): the hook
  HARD-DEPENDS on `.scratch/check-push-range.sh` and FAILS CLOSED -- if that
  file is absent it refuses EVERY push rather than degrading. The file IS
  tracked and not gitignored, so it survives here; but it lives under .scratch/,
  which the repo treats as scratch and which .gitignore partially covers. A
  cleaner home is scripts/ (its siblings pre-push and install-git-hooks.sh live
  there). Worth flagging to them rather than moving it myself.
  MEASUREMENT ERROR I MADE TWICE: `cmd | tail` masks the exit code, so I twice
  read "exit 0" from something that exits 1. Recorded because this batch has
  been hunting exactly this class of false-negative evidence.
V16: THEIR PRE-PUSH HOOK HAS A REAL GAP — RULE 3 IS UNENFORCED AND FALSELY
  REPORTED AS PASSING (round 30). Reproduced, not inferred.
  THE HOOK ENFORCES RULES 1 AND 2, NOT RULE 3. `docs/agents/auto-push.md:41-43`
  states condition 3 as "Plain `git push origin master`; no force, no amend, no
  rebase" — but the hook never checks ancestry. It DEFINES `ZERO` (line 30) and
  READS `_remote_sha` (line 37) and then uses NEITHER: `grep -c ZERO` returns 1,
  i.e. only its own definition. The data needed to enforce rule 3 is captured and
  discarded.
  PROOF (throwaway repo, hook installed verbatim): fed it a line where the local
  sha is NOT a descendant of the remote sha — a force-push — and it printed
  "PASS — gated push to origin/master is clean and green" and exited 0. Git would
  have proceeded.
  WHY THIS IS THE WORST KIND OF GATE DEFECT: a missing check makes you cautious;
  a check that REPORTS PASS while not performing the check makes you confident.
  It would let a force-push to master through under a green banner, which is
  precisely the failure mode the hook was built to prevent for rules 1 and 2.
  THE FIX IS THREE LINES and uses data already in hand:
      [ "$_remote_sha" != "$ZERO" ] && \
        git merge-base --is-ancestor "$_remote_sha" "$_local_sha" || FAIL=1
  (The ZERO guard matters: a brand-new branch carries an all-zero remote sha and
  is legitimately a fast-forward.)
  NOT FIXED BY ME — deliberately. scripts/pre-push is the other session's new
  file, the design is theirs, and I have already been burned this batch by
  nearly editing a file another writer owned. Recorded here with the exact patch
  so whoever owns it can apply it in one step. If they do not, I will apply it
  next round rather than leave a falsely-green safety gate in place.
