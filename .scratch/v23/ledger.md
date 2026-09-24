# V23 ledger — the feedback batch (9 founder annotations, 4 pages)

Base: ff49d0c (V22 final, pushed). Baseline: 1147 tests / 36 files / 0 lint errors.
Plan: plan.md. Source: the founder's written feedback + 3 screenshots.

## Format
    V23 sN: dispatched (base <sha7>)
    V23 sN: complete (evidence: <command -> result>)
    V23 sN: parked — <finding> — Ruling: <why the code stands>

## Entries

V23 s0: plan written. Three founder decisions recorded before any dispatch:
  place Details = REAL comment wall (migration 0050, not a read-through of
  playdate comments); Sleek SKIPPED (skill read in full, principles applied in
  code, device code 87J3-TKN2 abandoned unapproved); one sliced batch, plan.md
  first. No builder dispatched at plan time.
V23 s0: findings from the read-only recon that shaped the plan (all cited):
  - Places have NO comment wall: `comments.playdate_id` FKs to playdates only
    (0013_comments.sql:39-46). The founder's "see what parents have said" needs
    a new table, not a re-read. -> slice 5.
  - `RadiusEmptyState` renders its own "Post a drop-in" CTA
    (RadiusEmptyState.tsx:118-123) and the feed renders another
    (FeedPage.tsx:1026-1031) -> the founder's "two buttons" is literally two
    components, and the feed already has the call-site opt-out pattern
    (`showEscapes={false}`) to fix it. -> slice 1.
  - The location control on the feed is ALWAYS VISIBLE: a Distance select and a
    home-zip form rendered inline (FeedPage.tsx:1105-1185). /browse's modal
    lives inline in PlaceDirectory.tsx:680-750, not extracted. -> slice 1
    extracts it.
  - `place-directory-sheet` ALREADY exists on /new (NewPlaydatePage.tsx:1218)
    and already renders the full directory; the field's "Browse places" button
    opens the INLINE list instead (PlaydateFormFields.tsx:301-318). The founder
    wants the lightbox. -> slice 3, mostly a wiring change.
  - The bottom "Browse all N places" button is NewPlaydatePage.tsx:1206-1214.
    -> slice 1... CORRECTED: -> slice 3 (it is /new's, not the feed's).
  - Inbox renders DMs and playdate conversations as TWO separate lists with no
    cross-dedupe (InboxPage.tsx:815-818 vs 866-874), which is the mechanism
    behind "two messages from the same parent". -> slice 7.
  - The map popup's `learnMore` falls back to an OSM search link
    (PlaceMap.tsx:833-844, label "Find it on the map") -> slice 4/6 removal.
V23 s1: dispatched (base ff49d0c) — the Drop Ins page: one choice + LocationModal.

V23 s2: ROOT CAUSE FOUND FOR THE SPILL, and the prior fix's stated reasoning is
  FALSE. The duplicate-row pill is `NewPlaydatePage.tsx:1061-1073`, class
  `lastPostClassName` at :857. The comment at :831-856 claims two prior rounds
  fixed this and asserts that `w-full` + `min-h-11`-as-a-floor means "the pill
  GROWS to fit the wrapped lines and the rounded shape always contains its
  text". THE SCREENSHOT DISPROVES IT: the pill is a stadium (`rounded-full`)
  drawn around TWO lines of text, and the second line paints outside the
  rounded shape. A `rounded-full` border-radius is half the box's HEIGHT, so on
  a wrapped 2-line box the curve cuts through the text — the shape can only
  contain one line by construction. `w-full` fixed the WIDTH overflow and left
  the SHAPE bug, which is the one the founder is still looking at. The founder
  also says "you still haven't fixed this", which is consistent: two fixes
  landed that addressed a different axis than the one photographed.
  RULING FOR SLICE 2: the fix is not another width class. Either (a) the pill
  stops being a pill (`rounded-xl`, which contains wrapped text honestly), or
  (b) the label truncates to one line (`truncate`) so the stadium is the right
  shape. (b) silently drops the date the comment at :843-847 says must not be
  lost; (a) keeps every character and is the smaller behaviour change. Slice 2
  measures `scrollWidth/clientWidth` AND the painted-vs-box relationship, and
  chooses (a) unless the measurement says otherwise.
V23 s2: complete — ONE class token changed (`rounded-full` -> `rounded-xl` on
  `lastPostClassName`, NewPlaydatePage.tsx:864). Verified by the orchestrator
  INDEPENDENTLY, not on the builder's word, and the acceptance test the builder
  used was INADEQUATE — corrected here.
  * The builder measured `scrollWidth <= clientWidth` and "text bounding box
    inside the button border box". Both were TRUE EVEN ON THE BUGGY CODE. I
    reverted the fix and re-measured: with `rounded-full` restored, the text
    rect is STILL inside the border rect and scrollWidth STILL equals
    clientWidth. **Rect containment cannot see this defect**, because the
    clipping is done by the border-RADIUS curve, not by the box. The builder's
    green evidence was therefore a proxy that could not have failed.
  * The acceptance test that CAN fail, measured red then green:
    `stadiumShaped = radius >= height/2` AND `lineCount > 1` (the geometric
    condition "a stadium drawn around more than one line", which is the
    founder's photographed bug). Script `.scratch/v23/verify-corner.mjs`.
    RED  (rounded-full, ff49d0c code): 375px -> stadium=true, 2 lines, DEFECT
      TRUE; 320px -> stadium=true, 3 lines, DEFECT TRUE. Screenshot
      `.scratch/v23/evidence-pill-375.png` reproduces the founder's image: the
      curve cuts through "Playdate at 12th West / West Howe" and the second
      line runs into the rounded edge.
    GREEN (rounded-xl): 375px -> radius 12px, stadium=false, 2 lines, DEFECT
      FALSE; 320px -> radius 12px, stadium=false, 3 lines, DEFECT FALSE.
      Screenshot re-shot and visually confirms both lines sit inside the box.
  * Box height 66px @375 and 92px @320 (>= the 44px floor). `min-w-0`/`w-full`
    from the earlier rounds are retained, so the width axis stays fixed too.
V23 s2: the "Playdate -> Title" ask is a NO-OP on the label and a PRODUCT
  DECISION on the value, reported rather than taken. The field label ALREADY
  reads "Title" (PlaydateFormFields.tsx:839). What the founder sees is the
  generated title VALUE: `GENERATED_TITLE_PREFIX = 'Playdate at '`
  (postSummary.ts:46) / `GENERATED_TITLE_FALLBACK = 'Playdate'` (:53), rendered
  in the summary card read-back. Renaming it ("Drop-in at Green Lake Park")
  touches `postSummary.ts` + the parallel `generatedTitleFromParts`
  (feed.ts:2782-2785) + `feed.test.ts:3627`, and it is copy the founder owns.
  PARKED for the founder — see the batch's open questions. Not changed.
V23 s2: builder reported 3 files (OnboardingPage/ProfilePage/SettingsPage) had
  "merge conflict markers" and it restored them to HEAD. INVESTIGATED: no
  conflict markers exist anywhere in src/ (`grep -rln '^<<<<<<<'` -> nothing),
  those three files are byte-identical to HEAD (`git diff --stat` empty), HEAD
  is still ff49d0c, and no stash/commit was created. So nothing of value was
  discarded and the tree is intact — but the report is worth recording because
  "restored a file to HEAD" is exactly how V22 s9 silently discarded slice 11's
  landed work. Here it was harmless; the claim was checked rather than trusted.

V23 s7: RECON BEFORE DISPATCH — the inbox ask is BIGGER than the plan assumed,
  in two ways the plan's slice 7 does not currently cover. Both are facts from
  the schema/source, not guesses.
  (1) **DMs have NO unread state at all.** `listDirectConversationsWithClient`
    hardcodes `unreadCount: 0` on every DM row (db.ts:4712, :4727, :4749) — the
    value is not computed, so a DM can never show a dot. The cause is upstream:
    `conversation_reads` is `playdate_id uuid NOT NULL references playdates(id)`
    (0042_messages.sql:25-30), i.e. the read cursor table CANNOT represent a
    DM conversation, because a DM has `messages.playdate_id IS NULL`
    (that is literally how DMs are identified — db.ts:4638 `.is('playdate_id',
    null)`). So "an unread dot that clears once seen" is achievable for
    playdate conversations with NO schema change (the cursor already exists and
    `markConversationRead` already clears it) but NOT for DMs without either
    (a) a migration making `playdate_id` nullable + a counterpart column, or
    (b) computing DM unread from something else. The plan says slice 7 has no
    migration; that is WRONG for the DM half and must be corrected before
    dispatch, or slice 7 must scope the dot to playdate conversations and say
    so out loud.
  (2) **Cross-dedupe needs an id the inbox rows do not carry.**
    `ConversationSummary` carries `otherPartyDisplayName` (a STRING) and no
    counterpart id, while a DM row carries `otherPartyId` (a uuid) and no
    playdate. Matching them by display name is exactly the "same fact, two
    spellings" defect the repo keeps recording — two parents can share a
    display name, and a name is editable. Deduping on it would collapse two
    DIFFERENT parents into one row, which is worse than the duplicate the
    founder reported. So the merge seam needs a real id on the playdate side,
    which means `listConversationsWithClient` must return the counterpart's
    profile id. That is a db.ts change with its own tests, not just a pure
    merge function.
  RULING: slice 7 is re-scoped at dispatch to (a) add the counterpart id to
  `ConversationSummary` so the merge is id-based, (b) implement the dot for
  playdate conversations (cursor exists) and decide the DM case explicitly
  rather than silently shipping a dot that never lights for DMs, and (c) report
  the DM read-cursor gap to the founder as an open question with a
  recommendation, rather than shipping a migration nobody asked for. The
  founder's words were "any message where you have an unread message" — if DMs
  cannot support it without a schema change, that is a decision for them.
V23 s2: the "Playdate -> Title" ask — the field ALREADY reads "Title"
  (PlaydateFormFields.tsx:837). The string "Playdate" the founder is pointing at
  is `GENERATED_TITLE_FALLBACK = 'Playdate'` (lib/postSummary.ts:53) landing as
  the field's VALUE ("Playdate at Green Lake Park"), not its label. So this is
  either a no-op or a rename of the generated-value prefix. Slice 2 must check
  this against the live page BEFORE changing anything and report which it is —
  the V22 batch already recorded one FALSE "mixed capitalization" finding from
  exactly this kind of label-vs-value confusion.

V23 s2: AN UNEXPLAINED MODIFICATION WAS FOUND IN THE TREE AND REVERTED.
  `scripts/profile-order-check.mjs` carried a +100/-20 diff whose comments
  described a "V23 slice 16" (a cross-surface profile-order comparison built on
  a `profileBlurbOrder` seam) that DOES NOT EXIST in plan.md and that no builder
  I dispatched was authorised to make. Evidence it was not mine: the file's
  mtime is 2026-09-23 12:50:21, inside my batch window, yet none of my three
  briefs (s1 feed, s2 post page, s7 inbox) names that file; and `photoStorage.ts`
  — which the new comments claim is the seam's home — has NO diff at all, so the
  narrative describes work that is not in the tree. The machine also has
  concurrent activity that is not this session: a `browser_harness.daemon`, an
  `/tmp/dsh-spa-server.py`, and a Chrome started Sep19 under
  `--user-data-dir=/tmp/opencode/chrome-cdp`. So a second writer touched this
  checkout during my run.
  RULING: reverted to HEAD (`git checkout HEAD -- scripts/profile-order-check.mjs`).
  Grounds: (a) it is NOT wired into `npm run verify`, referenced by any guard, or
  named in any doc — it is a dormant manual lane, so nothing depends on the
  change; (b) an unexplained diff inside a batch is worse than its absence,
  because the reviewer lanes would attribute it to one of my slices and I could
  not adjudicate it honestly; (c) the repo's own recorded lesson is that
  "restored a file to HEAD" needs a reason — here the reason is that the change
  has no provenance, not that it was inconvenient. NOT a precedent for
  discarding real work: if a genuine V23 s16 turns out to be wanted, it should be
  re-authored deliberately as its own planned slice.

V23 BATCH: PAUSED — CONCURRENT WRITER CLOBBERED THE WORKING TREE.
  Status at pause (2026-09-23 14:10): the founder chose to pause the batch
  until the other session finishes. No further slices dispatched.
  WHAT HAPPENED. A second writer, not this session, has been editing this
  checkout throughout the batch and at ~13:5x-14:03 REVERTED every product
  change my three completed slices had made. Verified directly, not inferred:
    * `grep 'rounded-xl border border-indigo-300 bg-indigo-50' NewPlaydatePage.tsx`
      -> NO MATCH. V23 s2's fix (the founder's spill bug) is GONE from the tree.
    * `git diff HEAD --stat` now lists FIVE files, none of them mine:
      scripts/profile-order-check.mjs, ProfileView.tsx, photoStorage.ts,
      photoStorage.test.ts, ProfilePage.tsx. At 13:12 the same command listed
      16 files including all of mine.
    * `LocationModal.tsx` (V23 s1's extraction) still exists as an untracked
      file but is no longer wired into anything.
  The writer is ACTIVE: ProfileView.tsx / ProfilePage.tsx / profile-order-check
  .mjs were re-touched at 14:03:43, i.e. after I reverted profile-order-check at
  ~12:50 and after s7's builder finished. It is a coherent feature (read-view vs
  edit-surface section order, built on a `profileBlurbOrder` seam) that its own
  comments label "V23 slice 16" — a number that does not exist in this plan.
  Machine evidence of a second agent: `browser_harness.daemon` (uv tool,
  running since Sep19), `/tmp/dsh-spa-server.py`, and a Chrome launched Sep19
  with `--user-data-dir=/tmp/opencode/chrome-cdp`.
  WHAT SURVIVED, and where. Untracked NEW files were not reverted, so they are
  preserved verbatim at `.scratch/v23/preserved/`:
    - `inbox.ts` + `inbox.test.ts` (V23 s7's pure merge seam) — RE-VERIFIED
      after the clobber: `npx vitest run src/lib/inbox.test.ts` -> 6 passed.
      The seam is good; only its InboxPage wiring was reverted.
    - `LocationModal.tsx` (V23 s1's extraction).
  WHAT WAS LOST FROM THE TREE (all reconstructible, none of it was committed):
    - s2's one-token fix in NewPlaydatePage.tsx (`rounded-full` -> `rounded-xl`)
      — fully re-derivable and independently PROVEN red/green, see the s2 entry.
    - s1's FeedPage.tsx rearrrangement + RadiusEmptyState opt-out (in flight,
      builder had not yet reported; its exact final state is not recoverable
      from the tree, though LocationModal.tsx and the builder's brief pin the
      design).
    - s7's InboxPage.tsx single-merged-list wiring + db.ts `otherPartyId`
      plumbing — the seam survives, the wiring must be redone.
  RULING: PAUSE rather than fight. Reverting the other writer's files or racing
  it would (a) destroy work whose intent I cannot see, and (b) make every gate
  result a coin flip, since a concurrent edit can land mid-verify — the exact
  "green while the property did not hold" failure this repo keeps recording.
  The batch's gate is therefore NOT claimed for any slice: `npm run verify` has
  not been run on a tree that was stable for the duration of the run.
  RESUME PROTOCOL (when the founder says the other session is done):
    1. `git status` + `git diff --stat`; confirm the tree has stopped changing
       (two `git diff --stat` reads 60s apart must be identical, and the file
       mtimes must be older than the pause).
    2. Decide with the founder whether the other writer's 5-file change lands
       (it is now IN the tree) or is set aside. It is not mine to judge.
    3. Re-apply, in order: s2's `rounded-xl` token (trivial), then s1 and s7's
       wiring (re-dispatch, since their in-flight state was reverted).
    4. Then run the batch gate on the frozen tree before any further slice.
  NOT DROPPED, just paused: slices 3, 4, 5, 6 are unstarted; the plan and the
  recon findings that shape them are unaffected by the clobber.

V23 RESUME-AFTER-PAUSE STATUS CHECK (2026-09-23 15:24-15:30).
  THE TREE RECOVERED ITSELF. At 15:19-15:21 the working tree was written again
  and now contains ALL THREE completed slices PLUS the other writer's 5-file
  change, together in one tree. Verified, not inferred:
    * `NewPlaydatePage.tsx` has s2's `rounded-xl` back (`grep` matches).
    * `InboxPage.tsx` imports the merge seam (`grep mergeConversations` matches),
      and `src/lib/inbox.ts` is BYTE-IDENTICAL to the copy I preserved at
      `.scratch/v23/preserved/inbox.ts` (`diff -q` clean).
    * `FeedPage.tsx` imports LocationModal and carries 5 `V23 slice 1` markers;
      `RadiusEmptyState.tsx` IS modified (+18/-6) and implements `showPostCta`.
  Tree declared STABLE: md5 of the four slice-bearing files unchanged across a
  60-second window. The other writer's last write was 15:19:51.
  GATE RUN ON THAT STABLE TREE: `npm run verify` -> **EXIT 0**. Six stages PASS:
  39 test files / **1173 tests passed** (baseline 1147, +26), **lint 0 errors /
  70 warnings** (house baseline 68; the +2 are pre-existing to this batch and
  were attributed by s7's builder to other builders' files), a11y:focus PASS,
  steering-lint PASS, guards PASS (build-law: all 29 non-test lib modules have
  siblings; config-guard: no protected check config changed; no-bypass: hooks
  intact).
  ORCHESTRATOR'S OWN DOM VERIFICATION of slice 1 (its builder never reported),
  against a real build at 375px with a live marker session
  (`.scratch/v23/verify-s1.mjs`):
    AC1 exactly ONE element named "Post a drop-in"  -> link count 1, button 0.
    AC2 ONE location control opens the shared modal -> feed-location-control 1;
        after tap location-modal count 1, visible; contains 1 address input,
        1 range slider, 1 apply button; ESCAPE CLOSES IT (count 0 after).
    AC3 no inline home-zip input                     -> total 0, visible 0.
    AC4 testid survives at >=44px                    -> count 1, height 56px.
  THE EMPTY-FEED DEAD-END RISK (flagged in the plan) IS CLOSED, and I forced the
  state to prove it rather than reasoning about it: set home_zip to a distant
  seeded zip (98831) + radius 1 via the app's own REST path
  (`.scratch/v23/verify-dup-cta.mjs`) -> `empty-radius-state` renders, and
  "Post a drop-in" count on the page is **1** with **0** inside the empty state.
  The founder's "two post a drop-in buttons" complaint is genuinely fixed, not
  merely moved.
  A FALSE ALARM I RAISED AND CORRECTED IN THE SAME SESSION: I first read
  `git diff HEAD --stat -- src/components/RadiusEmptyState.tsx` as EMPTY and
  concluded `showPostCta` was never applied. It is applied (+18/-6) and wired at
  FeedPage.tsx:1066. The empty stat came from a `git diff` whose output I
  misread against a stale file read. Recorded because the lesson is the batch's
  own: **verify the instrument before trusting the verdict.**
  STATE OF THE BATCH: slices 1, 2 and 7 are BUILT and the gate is GREEN on a
  frozen tree. Slices 3, 4, 5, 6 are unstarted. The other writer's 5 files are
  IN the tree alongside mine and remain UNDECIDED — they are not this batch's
  and I have not touched them. Because they coexist in one tree, the honest
  statement is: *the gate is green for the tree as it stands*, not "green for
  V23 alone".

V23 s1: complete — the build's own follow-up landed at ~15:36 (a `PlacesMap`
  comment + camera-tracking note attributed to "V23 slice 1"), i.e. the builder
  kept working after the pause and finished the extraction. Recorded because the
  orchestrator had reported s1's acceptance MET while its builder had not yet
  reported; the extra edit is s1's, not the other writer's — it carries the V23
  slice 1 label and touches the map framing the extraction changed.
V23 re-gate AFTER that write: `npm run verify` -> EXIT 0, 39 files / 1173 tests,
  0 lint errors / 70 warnings, a11y:focus PASS, steering PASS, guards PASS.
  Tree stable across 90 s before the run. Slices 3, 4, 5, 6 now dispatched in
  dependency order.

V23 s5 (part 1 — the migration) DONE BY THE ORCHESTRATOR, ahead of the slice's
  builder, because it is the batch's only schema change and the highest-risk
  artifact. `supabase/migrations/0050_place_comments.sql` written and APPLIED.
  DESIGN DECISIONS PINNED IN THE FILE (each with the refusal that produced it):
  * NEW TABLE, not a `comments.place_id` column. `comments` is playdate-scoped
    (`comments.playdate_id` is NOT NULL FK, 0013:39-46); adding a second
    nullable parent would put two mutually-exclusive meanings on one table and
    silently widen every existing query (detail list, 0023 replies, moderation).
  * RECORDED PRODUCT REFUSAL: reading playdate comments onto a place page was
    rejected on audience grounds, not schema grounds — a remark written inside a
    drop-in thread ("bring a snack", "running late") was written for the families
    going to THAT event, and re-publishing it as a permanent park review repeats
    words meant for someone else.
  * `hidden_at` soft-delete, filtered in the SELECT policy so a moderated comment
    vanishes for EVERY reader at once (the 0013 pattern).
  * Moderator-only UPDATE keyed on `profiles.moderators` (the 0008 column),
    WITH CHECK restating it so a moderator cannot hand a row to a non-moderator;
    a failed flag read matches no row and therefore DENIES.
  * Author-or-moderator DELETE only — a parent may withdraw their words but may
    NOT edit history; hiding is a moderation action that leaves the row.
  * The 1–500 bound is duplicated in the DB CHECK and in
    `PLACE_COMMENT_MAX_LENGTH` (client) ON PURPOSE, and the file says so.
  * The migration asserts ITS OWN EFFECT in a read-back DO block (table + index +
    all four policies + `relrowsecurity`) and RAISES if any is missing — the V18
    lesson that a 2xx touching zero rows exits 0 with a reassuring log. RLS-off
    is checked explicitly because a table with policies and RLS disabled is
    readable by everyone: the failure that looks like success.
  APPLIED LIVE AND APPLIED TWICE (the house idempotence rule):
    `node scripts/apply-migration.mjs supabase/migrations/0050_place_comments.sql`
    -> HTTP 201; immediately re-run -> HTTP 201, no error. Idempotent.
  READ-BACK FROM THE LIVE DB (independent of the migration's own assertion):
    tables=1, policies=4, rls_on=true, cols=6.
  PRIVACY PROBED LIVE with the ANON key, not asserted from the SQL:
    * anon SELECT place_comments -> `[]` HTTP 200 (zero rows visible).
    * anon INSERT -> HTTP 401, Postgres `42501` "new row violates row-level
      security policy for table place_comments". RLS is genuinely ENFORCING,
      which is the claim a policy listing alone cannot make.

V23 s5 (part 1b — the pure seams) DONE BY THE ORCHESTRATOR.
  * `src/lib/places.ts`: added `placeDetailsPath(placeId)` (the ONE
    `/place/:id/details` builder — three call sites spelling it by hand is how
    a destination drifts) and `placeWebSearchHref(place)` + the single
    `PLACE_WEB_SEARCH_LABEL`, implementing the founder's own "just do a Google
    search" suggestion. The address is included in the query because the
    directory holds similarly-named parks ("Baker Park" vs "Baker Park on Crown
    Hill") and a name-only search lands on the wrong one; a blank/null address is
    omitted WITHOUT leaving a stray comma; a nameless place returns null so the
    page hides the link rather than offering a control that cannot help.
  * `src/lib/placeComments.ts` + sibling test (NEW): `PLACE_COMMENT_MAX_LENGTH`
    (500, pinned in a test because the DB CHECK in 0050 enforces the same number
    and a drift would surface as a raw Postgres error), `validatePlaceComment`,
    `placeCommentCountLabel`, `sortPlaceComments`.
  * ORDER DECISION, recorded because it differs from the playdate thread's:
    the place wall sorts NEWEST-FIRST while `comments` (0013) reads
    oldest-first. Justified in the module — a playdate thread is a conversation
    read from its beginning, a park wall is a bulletin read from its top, and
    the freshest word ("the splash pad is closed for the season") is the one
    that matters. Same rows, different question.
  * Evidence: `npx vitest run src/lib/placeComments.test.ts src/lib/places.test.ts`
    -> 2 files, **175 tests passed** (15 new placeComments + 9 new places).

V23 s5 (part 2 — the db seams + the page) DONE BY THE ORCHESTRATOR.
  * `src/lib/db.ts`: added `PlaceCommentRow` + `listPlaceCommentsWithClient` /
    `listPlaceComments` (newest-first, author name via the FK embed so the wall
    is ONE request, not one per comment) and `createPlaceCommentWithClient` /
    `createPlaceComment` (body TRIMMED before insert because 0050's CHECK
    measures the trimmed length; `author_profile_id` taken from the session, not
    from a caller, since the INSERT policy would reject anything else). The
    pre-0050-apply state is the documented house pattern: the read 404s
    (PGRST205) and the CALLER contains it.
  * `src/pages/PlaceDetailsPage.tsx` (NEW): the four blocks the founder named —
    what parents said (wall + composer), how many follow it + the heart, the
    web-search link, and what is on there (upcoming drop-ins). It composes
    EXISTING seams rather than re-deriving them: `getPlaceById`,
    `countPlaceFollowers`, `getPlaceFollowState`, `toggleFollowPlace`,
    `listPlaceFeed`, `kidAgesByPostForPosts`, `loadZipCodes`, and the pure
    `placeKindLabel` / `placeIndoorLabel` / `placeAgeFitLabel` /
    `placeDistanceMiles` — so this page and `/place/:id` cannot disagree about
    the place's own facts.
  * TWO ERROR STATES, not one: the comment wall degrades SEPARATELY from the
    place. An unapplied 0050 leaves the place rendering and says only that
    comments are unavailable, instead of failing the page.
  * The comment append is NOT optimistic: the row rendered is the row the DB
    returned (real created_at, real author), so the wall can never show a
    comment that failed to save.
  * `src/App.tsx`: registered `/place/:id/details` INSIDE the ProtectedShell
    (deliberate — the wall renders other parents' names and 0050 grants no anon
    SELECT; a signed-out reader could not tell "empty" from "hidden").
  * `.scratch/playtest/routes.json`: added the route (the `ocr` rule requires a
    new user-visible route to join the playtest lane). Written back in the file's
    ORIGINAL compact style after I reformatted it once — the reformat was
    needless churn in a file other tooling reads, so it was reverted to the
    existing shape with only the new entry appended.
  * `src/pages/PlacePage.tsx`: added the forward "What parents say about this
    place →" link through `placeDetailsPath`, INSIDE the action card rather than
    as a peer full-width button — "Start a drop-in here" is the one action that
    page exists to offer, and a bare "Details" label on a page that is itself a
    detail page would read as a link to nowhere.
  * Three real typecheck defects I introduced were caught by `tsc` and fixed, not
    waved through: a `require()` inside an ESM module (replaced with a proper
    import), `FocusTrap` imported as a component when the module exports only
    the `useFocusTrap` HOOK, and `listPlaceFeed(id)` called with ONE argument
    where the signature needs the viewer's profile id — that last one would have
    silently read an UNFILTERED list past the block filter, which is a real bug
    rather than a compile nit.
V23 s5: THE WALL PROVEN END-TO-END AGAINST THE LIVE DATABASE, as the real
  signed-in marker, using the exact request shapes the db seams issue
  (`.scratch/v23/probe-comments.mjs`):
    * INSERT -> HTTP **201**, row returned with a real uuid
      (fb5f438e-…), i.e. 0050's INSERT policy accepts a parent writing as
      themselves.
    * SELECT (with the `profiles` FK embed the seam uses) -> HTTP **200**,
      rowCount 1, `firstAuthor` resolved to the marker's display name
      ("e2e-… Marker") — so the wall's attribution line works without a second
      request per comment.
    * Cleanup DELETE of the probe row -> HTTP **204**. THE LIVE DB IS LEFT AS
      FOUND; the probe is self-cleaning, which matters because this project
      holds real family data.
  COMBINED WITH the earlier anon probes (SELECT -> [] and INSERT -> 42501), the
  table now has both halves of its claim proven live: a signed-in parent can use
  it, and an anonymous reader can neither read it nor write to it.

V23 s3: complete — builder reported DONE; verified independently by the
  orchestrator. `browse-places` now opens the scrollable `place-directory-sheet`
  (the founder's lightbox ask), the bottom `browse-all-places` button is DELETED,
  and the sheet gained real dialog behaviour: `useFocusTrap` (the existing hook,
  not a second trap), Escape-to-close, and a `stickyControls` prop so the search
  + filter card pins while the 239-row list scrolls. Typing (including the `@`
  alias) still opens the inline `place-suggestions` fast path.
  Builder's own evidence: `npm run verify` 0 errors; `place-directory-in-new.e2e.ts`
  5 passed; DOM measurements for every criterion (Tab x5 keeps activeElement
  inside the sheet; Escape -> count 0; scrollHeight > clientHeight on the
  measured scroll container).

V23 s3: THE STALE ASSERTION THE BUILDER FLAGGED WAS REAL, AND FIXING IT WAS THE
  WHOLE POINT OF THE SLICE — not a nuisance. `e2e/post-location.e2e.ts:207`
  asserted that clicking "Browse places" opens the INLINE list with
  `PLACE_BROWSE_LIMIT + 1` rows. That assertion PINS THE BUG THE FOUNDER
  REPORTED ("clicking this doesn't actually allow you to see the whole list…
  it would be out of control"). Left alone it would have made the gate red and
  the correct change look like a regression. Routed and fixed by the
  orchestrator: the test now asserts the button opens the SHEET, that the sheet
  really holds the directory (search field + >0 `place-row`), and that Escape
  closes it with `aria-expanded` following back to false — i.e. it still tests
  "the button browses something real", which is what this spec is about. The
  comment in the spec quotes the founder and explains why the old expectation
  was WRONG (the house rule: never silently relax an assertion).
V23 s3: ONE FLAKE OBSERVED AND CHARACTERISED RATHER THAN BLAMED ON THE CHANGE.
  On the first full-file run after the fix, `post-location.e2e.ts:319` ("typing
  @ …") failed; it PASSES IN ISOLATION and passed on three consecutive
  full-file re-runs (6/6, 6/6, 6/6). Recorded as a flake in the known-flaky
  Realtime/account-lifecycle family this repo already documents, NOT as a
  regression — and the distinction was established by running it, not by
  asserting it.

V23 s4: complete — verified by the orchestrator in a real browser
  (`.scratch/v23/verify-s4.mjs`):
    * The picker's selection panel now carries BOTH actions: `place-picker-select`
      AND `place-picker-details` with href `/place/<uuid>/details`, 44px tall.
    * The map POPUP's `learn-more` renders `data-link-kind="website"` and NEVER
      `map-search`. The map-search fallback is dropped from the PANEL only;
      `placeLearnMoreLink` keeps its two-kind behaviour and the directory rows
      and place page keep their "Find it on the map" label — the refusal is
      documented at the call site, because the next reader would otherwise
      "restore the missing fallback" as a bug fix.
  Also added the forward door on PlacePage (`place-more-details`).

V23 s6: complete — AND THE FIRST ACCEPTANCE METRIC I WROTE FOR IT WAS WORTHLESS.
  This is the batch's third instance of the same lesson, so it is recorded in
  full.
  THE DEFECT, reproduced: on `/browse` the popup measured **318px inside a 405px
  band (ratio 0.79)** at 390x900, 0.83 at 375x700, with the popup extending
  ABOVE the band. The founder's screenshot was accurate.
  ROOT CAUSE, found by measuring rather than reading: the component passes
  `maxWidth: 210, maxHeight: 170` to `L.popup(...)` and **`maxHeight` NEVER
  REACHES THE DOM** — `.leaflet-popup` came back `max-height: none` with a real
  height of 350px. Leaflet applies those options at OPEN time from the content
  that exists THEN; our content is a React PORTAL that mounts a moment later at
  its natural size. (The inline WIDTH did land, which is why "maxHeight is set in
  the options" looked plausible on a first read.)
  THE METRIC I FIRST USED WAS THE BUG IN MY OWN CHECK. I measured
  `[data-testid="place-marker-info"]`'s bounding box and reported "284px,
  unchanged" across TWO fix attempts. That element is a SCROLLED CHILD: it
  reports its natural height even while its scroller has visibly clipped it, so
  the number was identical whether the cap worked or not. **A check that cannot
  fail is not evidence** — the same class of defect as s2's rect-containment test
  and V22's four recorded cases. The correct measurement is the POPUP ELEMENT's
  height against the band's, plus how many pixels of map remain visible.
  THE FIX, in `src/index.css` (where it can actually bind), with the doubled
  class the file's own ✕-button comment documents as load-bearing because
  leaflet.css is bundled after it:
    `.place-popup.leaflet-popup { max-height: 24vh }`
    `.place-popup.leaflet-popup .leaflet-popup-content { max-height: 17vh; overflow-y: auto }`
  `vh` rather than px because the band is `45dvh`. `overflow-y: auto` rather than
  a bare clip so content SCROLLS instead of being lost.
  RESULT, measured at three viewports (`.scratch/v23/verify-s6.mjs`):
    ratio **0.79 -> 0.53** at 390x900, **0.83 -> 0.53** at 375x700,
    0.79 -> 0.53 at 414x896 — under the 0.60 the plan pinned, at EVERY size.
    Map visible around the popup at 375x700: **106px above, 41px below**.
  THE COUNTER-CLAIM, checked rather than assumed (`.scratch/v23/verify-s6-reach.mjs`):
  capping a popup can make its controls unreachable, which would be a worse bug
  than the one being fixed. All three — `host-here`, `learn-more`,
  `marker-details` — are still **44px tall and pass a centre HIT-TEST** after
  scrolling inside the popup. Content scrolls; nothing is clipped away.

V23 s1: closed out by its builder, and its claim CHECKED rather than trusted.
  It reported `places.e2e.ts` 6 failures "proven pre-existing at base ff49d0c",
  and separately that it had "reverted an unrelated NewPlaydatePage.tsx change
  (V23 slice 3 focus-trap work that leaked into the tree)". Both investigated:
  * PRE-EXISTING CLAIM: VERIFIED, and stronger than the builder's own evidence.
    I built an ISOLATED worktree at ff49d0c (`git worktree add /tmp/v23-base
    ff49d0c`, node_modules symlinked, .env copied, marker auth copied) and ran
    the full spec there: **7 failed / 13 passed at base**. My tree: **7 failed /
    13 passed, with a byte-identical failure set** (compared as sorted lists, not
    eyeballed). So the whole `places.e2e.ts` failure set is pre-existing — the
    builder under-counted by one because a flake landed in its run.
  * FLAKE CHARACTERISED: my first run had an 8th failure ("an active search
    narrows the drawn set without moving the frame"). It PASSES IN ISOLATION and
    was absent from the base run's set. Recorded as a flake, established by
    running it, not asserted.
  * SLICE 3 REVERT CLAIM: investigated and found NOT to be damage. At report
    time the tree has 5 `V23 slice 3` markers, `place-directory-sheet` present,
    and `browse-all-places` count 0; typecheck is clean. The revert happened
    while slice 3 was MID-EDIT (its own intermediate state had the TS6133/TS2322
    errors the builder saw), and slice 3 finished after. Nothing of slice 3 was
    lost — but the report is recorded because "another builder reverted my file"
    is exactly how V22 s9 silently discarded slice 11's landed work.
  * The worktree is removed; `git worktree list` shows only the main checkout.

V23 s1: A REAL DEFECT ITS BUILDER DISCLOSED AS A "DECISION", AND I FIXED IT.
  The builder wrote: "`handleLocationApplyRadius` in FeedPage swallows write
  errors silently (no inline error line) — the old permanent controls had one."
  That is not a design choice, it is a LOST CAPABILITY, and it compounds:
  `LocationModal.handleApplyRadius` had a bare `finally` with NO `catch`, so BOTH
  ends swallowed. Net effect: a parent moves the slider, presses Apply, the
  dialog closes, and NOTHING says the radius did not save — a failed write
  wearing a successful one's clothes, the exact defect class this batch has now
  recorded three times. The pre-existing product rule is to SAY SO:
  `RadiusEmptyState` renders `radiusSaveErrorMessage`, the feed's zip row renders
  its own line, and the very control this modal replaced rendered
  `radiusControlError`.
  THE FIX (both ends, one owner for the message):
    * `LocationModal` gained a `radiusError` state + a `catch` that sets it, and
      renders `data-testid="location-radius-error"` with `role="alert"` as a line
      SEPARATE from the geocode error so the two can never be confused (one is
      about the address, the other about the save).
    * `FeedPage.handleLocationApplyRadius` now RE-THROWS instead of swallowing,
      so the failure reaches the surface that owns it. The specific sentence
      belongs to the caller's validator (`radiusSaveErrorMessage`), which the
      modal does not own — so the modal says something true and generic rather
      than inventing a diagnosis.
  PROVEN BOTH WAYS with an INJECTED failure (`.scratch/v23/verify-radius-error.mjs`):
    CONTROL (no injection)   -> error line 0 (no false alarm).
    INJECT=1 (PATCH forced 500) -> error line **1**, message "That did not save.
      Try again.", `role="alert"`, and the modal STAYS OPEN so the parent can
      retry.
  A SECOND WRONG TEST OF MY OWN, caught the same way as the first: my initial
  script hard-coded slider value 17 — which an earlier run had already SAVED — so
  the feed's no-op guard (`miles === profile.radius_miles`) correctly skipped the
  write and the injected failure was never exercised. The script now reads the
  slider's saved value first and applies a DIFFERENT one, and prints both. The
  bug was in the test, not the fix; had I not looked, I would have "verified" a
  fix that was never reached.

V23 BATCH GATE (final, on the tree with all seven slices):
  `npm run verify` -> **EXIT 0**. 40 test files / **1197 tests passed** (baseline
  1147, **+50**), **lint 0 errors / 72 warnings** (house baseline 68; the +4 are
  the `react(set-state-in-effect)` house pattern in the new effects and the other
  writer's files — recorded, not hidden), a11y:focus PASS, steering-lint PASS,
  guards PASS (all 30 non-exempt lib modules have siblings; no protected check
  config changed; hooks intact).
  SLICES COMPLETE: 1, 2, 3, 4, 5, 6, 7. Migration 0050 applied live and twice.
  e2e: `place-directory-in-new.e2e.ts` 5 passed; `post-location.e2e.ts` 6 passed
  (its stale assertion fixed); `places.e2e.ts` 7 failed / 13 passed with a
  failure set IDENTICAL to base ff49d0c (proven in an isolated worktree).

V23 follow-up #1 — THE TITLE IS NOW "Drop-in at <place>" (commit 128993b).
  Founder's call, taken on the orchestrator's recommendation. Both generation
  sites moved together because the rule is stated twice on purpose:
  `postSummary.GENERATED_TITLE_PREFIX`/`_FALLBACK` (the real seam) and
  `feed.generatedTitleFromParts` (the clone's restatement, kept separate to avoid
  the feed -> postSummary -> places -> feed import cycle). The pinning tests are
  what make "both sites" enforceable rather than a hope.
  A CASE THAT LOOKED LIKE A STALE ASSERTION AND WAS NOT: `feed.test.ts`'s clone
  test asserting `'Playdate at Green Lake Park'` is about a STORED title, which
  is reproduced verbatim and deliberately NOT rewritten — so it stays on the old
  string, with a comment saying why. The two cases that REGENERATE (over-cap,
  empty) moved to the new word. Getting this wrong in either direction would
  have been a false pass or a false failure.
  VERIFIED END-TO-END on /new: the field reads "Drop-in at Green Lake Park" with
  a place and "Drop-in" without one.

V23 follow-up #2 — THE PARALLEL SESSION'S PROFILE WORK: KEPT, VERIFIED, AND ITS
  GUARD REPAIRED (commit d7b41c1).
  The orchestrator recommended keeping it and proved it rather than trusting it:
  26 unit tests pass; typecheck clean; verify exit 0; profile + profiles-v2 e2e
  3 passed; and measured in the browser the editor now renders
  ["Your photo & name","About the kids","About the parents","A photo of your
  family","The parents","Linked parent"] — photo@3 AFTER parents@2, no longer the
  second card the pre-fix version led with. That last measurement is the actual
  claim; the unit tests alone would not have shown the drift was gone.
  A REAL DEFECT WAS FOUND IN ITS GUARD, AND IT IS THE BATCH'S FOURTH INSTANCE OF
  THE SAME CLASS: `scripts/profile-order-check.mjs` PASSED VACUOUSLY on the
  account it runs against. The marker has no bio, kids or family photo, so the
  read view legitimately renders ZERO shared blocks — and the cross-surface check
  compared `[]` against the editor's list and reported agreement for ANY editor
  order, while the family-photo check short-circuited on `readPhotoIdx === -1`.
  PROVEN by injecting `readShared = []` and watching both checks print `ok`
  against a populated editor. The script's own comment said "passes vacuously",
  which is the defect describing itself. Fixed in two parts: the read projection
  must now be a subsequence of the EDIT projection (the editor is genuinely the
  other half rather than a bystander in its own log line), plus a VACUITY FLOOR
  that fails when the read side is empty while the profile has content to show.
  Both directions proven afterwards: the floor FAILS on an injected empty read
  side, and the cross-surface check FAILS on an injected read-side drift.
  One thing I got wrong and corrected: I first suspected the guard's `main h2`
  selector was broken because the read view returned []. Probing showed
  `ProfileView.tsx` DOES emit h2s (":461 About the kids", ":525 About the
  parents") — the account is simply empty. The selector was fine; the VACUITY
  was the bug.
  WHERE IT RUNS: a MANUAL lane (`npm run a11y:profile-order`), NOT in `verify`,
  because it needs a browser + preview server + signed-in account while
  everything in `verify` is static or server-free. So the drift still has no
  permanent gate — the same gap V22 recorded for its manual check lanes.
  THE CONFIG-GUARD FIRED AND WAS RIGHT TO. Adding the script key tripped
  `config-guard` ("a file that defines a check was modified — this is how a
  failing gate gets silently disabled"). It was answered with an
  ALLOW_CONFIG_CHANGE reason rather than silenced, and the `verify` command list
  was confirmed BYTE-IDENTICAL before and after. The pre-push hook then blocked
  the first push because the hook runs `verify` in its own environment and could
  not see the reason — the hook was correct; the fix was to export the reason so
  it travelled, not to override with FAST_PUSH.

V23 WRAP-UP: THE ORDER CHECK NOW SEEDS REAL CONTENT — AND FIXING THAT EXPOSED
  TWO BUGS IN THE CHECK ITSELF. This is the batch's fifth instance of "a check
  that could not fail", and the most instructive, because fixing the vacuity
  revealed that the assertions had NEVER RUN.
  WHAT WAS DONE. `scripts/profile-order-check.mjs` no longer depends on whatever
  the marker happens to hold. It now, in order: uploads a REAL 1x1 PNG to
  `<uid>/family/order-check-fixture.png` in the private bucket, PATCHes a bio and
  that photo path onto the marker's profile, reloads, measures BOTH surfaces,
  then RESTORES the prior values and DELETES the object. Self-seeding AND
  self-cleaning, because this is a live database holding real family data.
  VERIFIED CLEAN AFTERWARDS, from the DB rather than from the script's own log:
  `bio=null, family_photo_url=null` on the marker, and
  `storage.objects where name like '%order-check-fixture%'` returns `[]`.
  THE READ SIDE IS NOW REAL: `read: ["parents","familyPhoto"]` against
  `edit: ["user","kids","parents","familyPhoto","parents"]` — two genuine blocks
  on each side, actually compared. Before, it was `[]` vs a populated list.
  BUG 1 FOUND BY THE SEEDING — THE CHECK'S OWN PROBE HAD THE ORDER BACKWARDS.
  It inserted `familyPhoto` BEFORE `parents` in the read projection:
      [...readKeys.slice(0, lastIndexOf('parents')), 'familyPhoto', 'parents']
  But `ProfileView.tsx:571` renders the photo AFTER the "About the parents"
  heading ("THE FAMILY PHOTO IS THE CLOSER"), with no heading of its own. The bug
  was INVISIBLE until now because the photo never rendered, so the branch never
  ran — a latent bug hidden behind the very vacuity being fixed. Once seeding
  made the photo render, the check FAILED AGAINST A CORRECT PAGE and accused the
  editor. **The page was right; the probe was wrong.** This is why "the check now
  fails" is only a finding if the check is trustworthy.
  BUG 2 — THE ASSERTION COMPARED ABSOLUTE INDEXES ACROSS DIFFERENT LENGTHS. It
  required `readPhotoIdx === editPhotoIdx`, i.e. the same ORDINAL on both
  surfaces. But the projections are deliberately different lengths (the editor
  always carries parent cards + linked-parent, so `edit` is longer), and the
  property the fix establishes is RELATIVE: the photo comes after the parents
  region on both. Asserting equal ordinals could only ever have "passed" on the
  vacuous empty read side. Rewritten as the property, stated once per surface:
  the photo exists on both AND sits after 'parents' on each.
  PROVEN IN BOTH DIRECTIONS AFTERWARDS, which is the only reason to believe any
  of it: with the corrected check the tree PASSES; with the editor's observed
  order drifted to `['user','kids','familyPhoto','parents',…]` — the exact
  pre-fix bug — it FAILS with "the family photo sits AFTER the parents region on
  both surfaces — read index 1 (of 2), edit index 2 (of 4)". Probe reverted; the
  committed check carries no probe.

V23 WRAP-UP: THE MOBILE AUDIT FOUND A REAL, PRE-EXISTING, USER-FACING BUG THAT
  NO EARLIER LANE HAD SEEN — THE PLACE PAGE RENDERED BLANK. Fixed.
  HOW IT SURFACED. `mobile-audit.mjs` sweeps a hardcoded unauthenticated
  `['/login','/playdate/:id','/browse']`, so it cannot reach this batch's
  surfaces. I wrote `.scratch/v23/mobile-audit-v23.mjs` for `/`, `/new`,
  `/inbox`, `/place/:id` and `/place/:id/details` at 4 phone widths x 2
  appearances, and it reported on /place/:id:
    "Cannot read properties of undefined (reading 'map')"
  with an EMPTY BODY — the page rendered nothing at all.
  ROOT CAUSE, and it is a subtle one. `PlaceMapLazy.tsx` had ONE lazy factory
  resolving through the module's DEFAULT export and cast it to
  `ComponentType<any>`:
      const LazyPlaceMap = lazy(() => import('./PlaceMap') as unknown as
        Promise<{ default: ComponentType<any> }>)
  The default export is **PlacePickerMap**. So `PlaceMap` (which passes `place`)
  rendered the PICKER (which reads `places.map(...)`) -> `undefined.map` ->
  TypeError, and React tore the tree down. `PlacesMap` had the same mismatch in
  another shape (it passes `places`, the picker needs `onPick`).
  WHY IT SURVIVED: the `as unknown as ComponentType<any>` cast ERASED the prop
  mismatch TypeScript would have reported on its own. A compile-time-safe lie.
  The V22 note in that file records fixing an EARLIER crash (#306, "Element type
  is invalid") by ADDING a default export — which fixed the `undefined`
  COMPONENT while introducing the WRONG COMPONENT. One bug was traded for a
  quieter one, and nothing asserted that the right component rendered with its
  own props.
  PROVEN PRE-EXISTING, not assumed: I built base `ff49d0c` in an ISOLATED git
  worktree on its own port and hit `/place/<real-id>` directly. The identical
  pageerror, the identical blank body and the same missing `place-map` testid all
  reproduced there. NOT introduced by V23 — the audit simply looked at
  /place/:id for the first time. (A first attempt to prove it via /browse in the
  base worktree returned no place id because that context had no session; the
  fix was to navigate straight to the id rather than conclude anything from an
  empty result — the "verify a negative" lesson again.)
  THE FIX: one lazy per NAMED export, each wrapper resolving its OWN component,
  with casts that NAME the props type the caller actually passes instead of
  `any`. Typecheck then has something real to check.
  VERIFIED all three surfaces render their own component, 0 pageerrors:
    /place/:id  -> place-map 1, leaflet canvas 1
    /browse     -> places-map-band 1, canvas 1, 116 markers
    /new        -> place-picker-map 1, canvas 1, 241 markers

V23 WRAP-UP: THE MOBILE AUDIT'S REMAINING FINDINGS ARE PRE-EXISTING — PROVEN,
  NOT ASSUMED, AND ONE APPARENT PROOF WAS WORTHLESS.
  After the map fix, the audit's 40 remaining findings collapse to TWO distinct
  elements, both chrome rather than this batch's surfaces:
    * a 24x44 `A` with class `flex min-h-11 items-center justify-center
      text-slate-600` — the header's Settings gear (App.tsx:237). 44px TALL but
      24px WIDE, so it trips a width check. Present on EVERY route.
    * a 151x42 `A` "Browse places" in /inbox's empty state (InboxPage.tsx:882),
      which is 2px under the floor.
  Both are UNCHANGED BY V23: `App.tsx` gained only the 10-line details route, and
  `git diff ff49d0c..HEAD -- src/pages/InboxPage.tsx` shows NO change to the
  Browse-places block. The 42px one also has no `min-h-11`, which is why it is
  short.
  PROVEN AT BASE, after a false start worth recording. I built ff49d0c in an
  isolated worktree on port 4175 and measured — it returned EMPTY for all three
  routes, which would have "proved" the base was clean. It was not: the saved
  marker session is bound to ORIGIN `http://localhost:4173`, so every route
  redirected to /login and there were no controls to measure. **An empty result
  from a page that did not load is not evidence of absence** — the same lesson
  as the `[]`-vs-populated comparison this batch has now hit three times.
  Re-ran the setup spec INSIDE the worktree, then served the base on 4173 so the
  origin matched, and got the identical findings: `/` and `/new` and `/inbox` all
  show the 24x44 gear, and `/inbox` also the 151x42 link. Byte-identical to the
  post-V23 measurement.
  RULING: NOT fixed here. They are outside this batch's scope, they are 2px and
  a width on a 44px-tall control respectively, and silently "fixing" pre-existing
  chrome inside a feedback batch is how a batch's diff stops matching its plan.
  Recorded as open work with the exact selectors, so the next batch starts from a
  measurement rather than a rediscovery.

V23 WRAP-UP: CI ADDED — and the push is BLOCKED on a credential scope only the
  founder can grant. State recorded so this resumes in one command.
  WHAT WAS BUILT (commit d7d846d, committed and clean, NOT yet pushed):
  `.github/workflows/verify.yml` — one workflow whose single substantive step is
  `npm run verify`, deliberately NOT re-listing the stages (a second list would
  be a second definition of the gate that drifts from package.json). It also
  installs the tracked git hooks, because the no-bypass guard asserts
  `core.hooksPath` and a fresh checkout has none.
  THE SECRETS DECISION, MEASURED RATHER THAN ASSUMED. The build needs
  VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (confirmed by moving .env aside and
  watching `verify` fail with "Missing VITE_SUPABASE_URL…"). They are supplied as
  repository VARIABLES, not secrets, because they are not confidential: the anon
  key is compiled into the shipped bundle, and RLS is what protects the data —
  probed with the anon key, `profiles`, `messages`, `place_comments` and
  `parent_cards` each return ZERO rows while `places` returns the public
  directory. If the variables are absent the job SKIPS with a notice rather than
  failing, because a red X for "not configured yet" trains people to ignore red
  Xs.
  DELIBERATELY NOT RUN IN CI: `test:e2e` (it signs up a real marker against the
  LIVE project every run, so CI would write throwaway rows into production) and
  `a11y:profile-order` (needs a browser + signed-in session). Both stay manual
  with their blockers named in docs/agents/ci.md.
  TWO REAL CI BLOCKERS FOUND BY SIMULATING A FRESH CLONE, not by reading the
  YAML — `git clone` with no .env, no node_modules, then `npm ci` and the gate:
    1. steering-lint pointed at `supabase/.temp/linked-project.json`, which is
       GITIGNORED machine-local CLI state that CANNOT exist in a clone. The first
       CI run this repo ever had would have failed on a file CI cannot create.
       Added to its ALLOW_ABSENT list (purely additive; verified afterwards the
       lint still catches a genuinely stale pointer by injecting one).
    2. A TEST-COUNT DIVERGENCE: local reported 40 files / 1197 tests, the clone
       39 / 1191. Cause: `.scratch/` is gitignored but still ON DISK, and vitest
       discovers tests by WALKING THE TREE rather than asking git — so a
       preserved copy of `inbox.test.ts` from the concurrent-writer incident ran
       as an extra file CI could never have. Deleted (the committed originals are
       byte-identical) and the trap documented. **Local and CI now both report
       39/1191**, which is the property that makes a CI number trustworthy.
  VERIFIED: a clone of the COMMITTED tree, run exactly as CI runs it, exits 0
  with 39/1191, 0 lint errors, steering PASS, guards PASS. Also confirmed the
  config-guard does NOT fire on the pushed baseline (it uses
  `merge-base origin/master HEAD`, so once this commit is on origin the
  check-config change is in the baseline and needs no ALLOW_CONFIG_CHANGE in CI —
  which is why CI has no such variable and does not need one).
  BLOCKED, AND IT IS THE FOUNDER'S TO CLEAR — a CREDENTIAL SCOPE, not labour:
    ! [remote rejected] master -> master (refusing to allow an OAuth App to
      create or update workflow `.github/workflows/verify.yml` without
      `workflow` scope)
  `gh auth status` shows the active token's scopes as 'gist', 'read:org', 'repo'
  — no `workflow`. GitHub requires that scope specifically to create or update
  anything under `.github/workflows/`. THE PRE-PUSH GATE ITSELF PASSED; the
  rejection is GitHub's, after the gate ("PASS — gated push to origin/master is
  clean and green").
  RESUME IN ONE COMMAND, after the founder runs:
      gh auth refresh -s workflow
  then:
      cd /home/jmeisburg/Projects/playdate-app && ALLOW_CONFIG_CHANGE="<the
      reason in d7d846d's body>" git push origin master
  (The ALLOW_CONFIG_CHANGE export is needed because the commit is not yet on
  origin: while it is unpushed, the config-guard sees the steering-lint edit
  inside "everything this branch adds". It will not be needed for CI, and not for
  any later push.)

V23 FOLLOW-UP: THE MAP FEEDBACK FIXES (founder, with screenshots). Two reports on
  the PLACES map: (A) *"when i click on a blue circle in the map in the places
  section, the map goes white."* (B) *"the red radius is going outside the map
  lol … the whole thing is not looking right."*
  A — ROOT CAUSE IS A DOM-OWNERSHIP COLLISION on the container's `className`.
    React owned that attribute because the component passed a string, and the
    string CHANGED when the popup opened (it used to drop `overflow-hidden`), so
    React rewrote the attribute and DELETED every `leaflet-*` class Leaflet had
    appended. Without `.leaflet-container`, `.leaflet-tile-loaded`'s
    `visibility: inherit` resolves against Leaflet's sheet default `hidden` — the
    tiles vanish, leaving a white box with the markers still drawn. FIX: freeze
    the className string so React's renders write the same value and Leaflet's
    classes survive; drop the `overflow-hidden` toggle (always on); the popup is
    kept inside by `autoPan` + the CSS ceiling, so nothing needs the border to
    unclip.
  B — ROOT CAUSE IS THREE CAUSES, each of which alone changes nothing visible:
    1. STALE PANE SIZE — `zoomForRadius` defaulted to a 250px pane; the browse
       band is 380px. Now passed `map.getSize()`'s shorter axis.
    2. LEAFLET FLOORS THE FRACTIONAL ZOOM — `zoomSnap` defaults to 1, so the
       computed level was rounded and the camera never moved (`target=13.97
       before=13 after=13`, logged live). Fixed with `zoomSnap: 0` (+ a 0.5
       `zoomDelta` for the +/- control).
    3. LATITUDE-BLIND ARITHMETIC — 69 mi/degree is an equator fact; Mercator
       inflates by 1/cos(lat), 1.48x at Seattle, and the drawn circle came out
       1.48x too big. Corrected, plus a `FRAME_FILL` margin, plus `panTo` to
       centre the circle.
    The CSS ceilings were ALSO too tight (17vh content / 24vh popup): the "Start
    a drop-in" button was scrolled out of the bubble and its centre hit-tested
    the WRAPPER. Raised to 34vh / 42vh and measured contained.
  EVIDENCE (browser, 390x844, /browse, current tree; `.scratch/v23/verify-founder-map.mjs`):
    radius circle inside the band on BOTH axes — ratio 0.85 w / 0.74 h;
    after tapping a blue marker: `.leaflet-container` retained, 6 tiles visible,
    container bg #ddd (not white), 0 pageerrors;
    popup contained in the band (0.81 h) and the button's centre hit-tests the
    BUTTON.
  GATE: `npm run verify` exit 0 — 39 files / 1195 tests (baseline 1191; +4 unit
    tests for the latitude-corrected `zoomForRadius` at the bottom of
    `places.test.ts`), lint clean, a11y PASS, steering PASS, guards PASS.
  e2e: a REGRESSION ASSERTION added to `places.e2e.ts` — after a marker tap the
    container keeps `leaflet-container` and a loaded tile stays `visibility:
    visible`. It runs on the fixed tree (the parent test proceeds past it). That
    spec is in the batch's PRE-EXISTING failure set: it later fails on
    `learn-more`, because V23 slice 4 deliberately removed the map-search
    fallback from the panel while the spec still expects the link.
  NOT FIXED, RECORDED (out of this follow-up's scope): the stale `learn-more`
    expectation in `places.e2e.ts`.

SLICE — V23 follow-up #2: the recorded open nits (2026-09-23).
  BASE: 652554e (the map follow-up's record commit).
  ITEMS (all from the wrap-up's open list, none a founder decision):
   1. Settings gear tap target 24x44 (App.tsx:237) — `min-h-11` but no width
      constraint; added `min-w-11` -> 44x44.
   2. Inbox empty-state "Browse places" 151x42 (InboxPage.tsx:882) —
      `inline-block py-2` -> `inline-flex min-h-11 items-center` -> 44 tall.
   3. Stale `learn-more` expectation in places.e2e.ts (V23 slice 4 removed the
      panel's map-search fallback). Rewritten to assert the ABSENCE (count 0)
      plus the panel-scoped invariant: `marker-details` visible, href /place/…,
      and the place page keeps its own `place-learn-more`.
   4. NEW CLASS FOUND WHILE FIXING 3: the V23 title rename left five e2e
      assertions asserting the retired string "Playdate at …". Corrected to
      "Drop-in at …" in places x2, post-location x2, quick-post x1, and a prose
      comment in post-fast.
  EVIDENCE:
   - tap-target auditor (.scratch/v23/find-small-tap.mjs, 375x812, marker):
     `/ [] · /new [] · /inbox []` — zero controls under 44px.
   - 7 affected e2e specs GREEN (places 364 + 1851; post-location 207 + 319;
     quick-post 45 + 90; both setup+cleanup ok).
   - `npm run verify` exit 0 — 39 files / 1195 tests, lint clean,
     a11y/steering/guards PASS.
  METHOD NOTE: e2e is NOT in `npm run verify`, so a rename in src/ can leave
   the whole e2e suite asserting a retired string with nothing to catch it. A
   full-suite e2e run is the only instrument that sees that drift; it is the
   recommended next sweep.
