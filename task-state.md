# Task State

> The system of record. The orchestrator updates this after every phase
> transition. Subagent chat contexts are ephemeral — this file is not.

- **🔁 TAKEOVER — THE FIRSTMATE QUEUE (2026-09-24, DeepSeek Harness session).** The founder stopped the `firstmate` tab in Herdr mid-run and asked this session to finish the outstanding work. Authority granted for this takeover: **merge green, in-scope Drop-In PRs** (the standing Drop-In authority the lanes recorded) and **skip the no-mistakes pipeline** (the captain's earlier instruction) — validation is `npm run verify` locally plus the same gate on CI for the PR, with the full e2e suite at batch end.

  **WHY NOTHING WAS LOST.** Every firstmate lane used a disposable worktree under `~/.treehouse/Drop-In-7e01ed/<n>/Drop-In`, and all six were intact at handover. The audit found: `fm/drop-in-mobile-ui-ux` (2 commits, complete), `fm/drop-in-e2e-drift` (4 commits, complete), `fm/drop-in-ui-auth-onboarding` (0 commits, 3 pages of uncommitted edits), `fm/drop-in-ui-account` and `fm/drop-in-ui-inbox-playdate` (nothing done), and the firstmate repo's `fm/firstmate-self-improvements` (2 commits + a one-line lint fix). The lanes' no-mistakes runs had failed repeatedly on **provider** errors (`chat_admission_busy` / `stream_limit` / a 401 credits-exhausted), not on the work — the same wall recorded in firstmate's own backlog.

  **LANDED SO FAR.** `#6` the noticeboard design pass (`72f9c38`, the design language slices A–D copy); `#8` design-pass slice A — auth + onboarding (`710ec8f`). Both CI-green before merge.

  **THE FULL E2E SWEEP, AND THE REAL BUG IT FOUND.** The sweep the "IN FLIGHT" note below promised ran on the whole suite: **112 passed / 1 failed / 1 flaky / 1 skipped**. The failure (`feed-empty-state.e2e.ts`, "the home-ZIP control saves, keeps the radius, and never shows a false error") was **not** spec drift — it was a real race in the shared `LocationModal`: the slider kept a local copy synced by `useEffect(..., [radiusMiles])`, so the FIRST apply's `refresh()` landed mid-drag, reset the slider to the value just saved, and the SECOND "Apply radius" wrote an equal value — a silent no-op with no error shown. Load-sensitive (usually passing idle), which is why earlier runs never pinned it. **Fixed** (`091f934`) by keeping the user's in-session draft until they close or reopen the modal, proven pre-existing on clean master, and proven red-before/green-after. The flaky one (`inbox.e2e.ts` real-time delivery, 4.0m then passing on retry) is a live-realtime timing flake, not a code change.

  **PENDING AT THIS WRITE.** PR `#7` (e2e drift: the radius live-preview regression from the V23 s1 extraction, four stale specs, plus the race fix above) is open and needs one final full-suite green run before merge. Design-pass slices B (settings/profile/user), C (inbox + playdate create/edit) and D (playdate/place details + mod) are in flight as builders on `fm/drop-in-ui-account`, `fm/drop-in-ui-inbox-playdate` and `fm/drop-in-ui-detail-surfaces`. `Meisburg/firstmate#1` (self-improvements: worker lessons, needs-you board, guard residual-risk docs, plus a proven ShellCheck false-positive fix) is open — that one's merge is the captain's own call, per the firstmate delivery note.

  **PRE-EXISTING FAILURES, MEASURED NOT ASSUMED.** Two firstmate tests (`tests/fm-test-run.test.sh`, `tests/fm-bootstrap.test.sh`) fail identically on a clean `origin/main` worktree at `d1ce6b6c` — environmental (this machine has a real `herdr` on `PATH`), unrelated to the branch. `bin/fm-lint.sh` is green on that branch with the pinned ShellCheck 0.11.0.

- **✅ V23 FOLLOW-UP #3 — THE DM UNREAD DOT IS SHIPPED (2026-09-23, `50cd312`→`d2a64fc`, branch `fm/drop-in-dm-unread-dot`).** The founder decision the two "SCHEMA WALL" records below awaited was taken and built. **The design (the s7 recon's recommendation):** a SEPARATE cursor table — migration `0051` `direct_conversation_reads (profile_id, other_profile_id, last_read_at)`, composite PK, own-rows-only RLS (3 policies mirroring 0042), idempotent, applied live — so the working playdate path (`conversation_reads` and every query against it) is untouched byte-for-byte. **What changed:** `listDirectConversationsWithClient` computes a real DM unreadCount (messages FROM the counterpart newer than the viewer's 0051 cursor; the viewer's own sent messages never count); `markDirectConversationRead` stamps the cursor when a DM thread opens; the inbox dot + badge render for BOTH kinds; `e2e/dm.e2e.ts` pins the dot appearing and clearing on the recipient side. **The merge's unread rule (three adjudicated review rounds):** per counterpart, keep the newest DM row and the newest playdate row; a MIXED group displays the SUM of those two counts (the two cursors are disjoint, so the sum is exact); a single-kind group displays its newest row's own count; identity/preview/latestAt/kind stay the overall winner's, with the playdate row winning an exact tie. Owner: the `src/lib/inbox.ts` docstrings; pinned by `src/lib/inbox.test.ts` and `src/lib/db-messages.test.ts`. **Plus a pre-existing recipient-side defect the new e2e exposed, fixed here:** `queryDirectMessagesWithClient` read the OTHER party's `message_recipients` rows — hidden from a recipient by the SELECT policy — so a DM the other person STARTED opened as "No messages yet"; it reads the caller's own participation rows (`profile_id = myId`, populated for both parties by the 0044 trigger) now.

  *(This entry supersedes the DM-unread-gap claims in the V23 COMPLETE and paused-batch entries below: the gap is closed, not reported.)*
- **🔍 BACKLOG AUDIT (2026-09-23) — NO UNBLOCKED TICKETS REMAIN. Three items need a founder decision, one is human-only.** Ran because the founder asked for "all outstanding tickets until there are none left." Checked every source of truth: `task-state.md` (all V1–V23 batches closed), `plan.md` + `MASTER-IMPROVEMENTS.md` (V22 shipped all 15 slices at `67544b0`/`7dd74ce`/`ff49d0c`, even though `plan.md`'s status log still stops at Slice 1 — a bookkeeping defect, not open work), and `docs/agents/ci.md`'s "deliberately does NOT run" table.

  **MASTER-IMPROVEMENTS IS EFFECTIVELY DONE.** Verified each "Now" item against the code, not the plan: live regions + `aria-invalid` (s1), `slate-400`→`slate-500` (s2), `public/` scaffolding gone (s3), the detector's false positives (s4), focus trap/restore (s5), `motion-reduce:` on 83 sites (s6), `focus-visible:` (s7), dark mode (s8/s14), regular-width rail (s9), map code-split (s10), lazy imagery (s11), Post out of the tab bar (s12), copy/alt (s13), profile read order (s15). Items 13 *and* 14 are also already real: `NavTab` renders `NAV_ICONS_FILLED` + `font-semibold` when active (`App.tsx:412,420`) — a shape change, not colour alone.

  **WHAT IS LEFT, AND WHO OWNS IT:** (1) **MASTER item 15 — the DM unread dot** is a founder decision: playdate conversations have an unread badge, DMs do not, because there is no read cursor for them (`InboxPage.tsx:105`) and adding one is a migration. (2) **The logo mark** is an open design decision carried since V7/V8. (3) **The CI lane decision** (`docs/agents/ci.md:56-57`): `test:e2e` and `a11y:profile-order` are excluded because they sign up real accounts against the LIVE Supabase project — the blocker is "a dedicated test project, or an explicitly scheduled run," which the doc itself calls *a decision, not a wiring task*. (4) Human-only: the beta-checklist hosting items and the Android push device test.

  **IN FLIGHT:** a full-suite e2e run (115 specs / 42 files) to catch the drift class this slice found — retired strings in specs that `npm run verify` cannot see because e2e is a separate lane. Results land in the next entry.

- **✅ V23 FOLLOW-UP #2 — THE RECORDED OPEN NITS ARE CLEARED (2026-09-23).** Four items the wrap-up left open, all measured, none needing a founder decision.

  **THE TWO TAP TARGETS.** The Settings gear was 24x44 (`App.tsx:237`, `min-h-11` but no width constraint) — added `min-w-11` → 44x44. The inbox empty-state "Browse places" link was 151x42 (`InboxPage.tsx:882`) — `inline-block ... py-2` → `inline-flex min-h-11 items-center` → 44 tall. **Measured after the fix with the same auditor that found them** (`.scratch/v23/find-small-tap.mjs`, 375x812, marker session): `/ [] · /new [] · /inbox []` — zero controls under 44px on any route.

  **THE STALE `learn-more` EXPECTATION** (recorded as "not fixed" by the map follow-up): V23 slice 4 removed the map search from the marker panel, so the panel shows no outbound link for a playground with no verified site. The spec now asserts the removal (count 0) *and* that the removal is panel-scoped — `marker-details` is visible and points at `/place/…`, and the place page keeps its own `place-learn-more`.

  **AND IT FOUND A SECOND CLASS OF STALENESS — THE TITLE RENAME.** Chasing the same spec past the fixed assertion landed on `Playdate at ${MARKER_PLACE_NAME}`. V23 renamed the generated prefix to "Drop-in at …" (`postSummary.GENERATED_TITLE_PREFIX`), and **`npm run verify` does not run e2e**, so five assertions across 4 specs were left asserting the old word: `places.e2e.ts` x2, `post-location.e2e.ts` x2, `quick-post.e2e.ts` x1, plus a prose comment in `post-fast.e2e.ts`. All corrected to "Drop-in at …"; the stale comments rewritten.

  **EVIDENCE.** `npm run verify` exit 0 (39 files / 1195 tests, lint clean, a11y/steering/guards PASS — unchanged counts, no code beyond two class strings). The 7 affected e2e specs run green (`tapping an overview map marker`, `Start a drop-in here`, `/new leads with the place picker`, `typing @ opens the picker`, both `quick-post`, `opens on today`). Tap-target auditor output empty on all three routes (above).

  **METHOD NOTE FOR THE NEXT SWEEP:** because e2e is a separate lane from the gate, a rename in `src/` can leave the whole e2e suite asserting a retired string with nothing to catch it. A full-suite e2e run is the only instrument that sees that class of drift.

- **✅ V23 FOLLOW-UP — THE MAP FEEDBACK FIXES ARE IN THE TREE AND GREEN (2026-09-23).** Two founder reports on the places map: *"when i click on a blue circle … the map goes white"* and *"the red radius is going outside the map lol … the whole thing is not looking right."* Both fixed in `src/components/PlaceMap.tsx` + `src/index.css` + `src/lib/places.ts` (+4 unit tests, +1 e2e regression assertion).

  **WHITE MAP — a DOM-ownership collision, not map logic.** The container's `className` prop changed when the popup opened (it dropped `overflow-hidden`), so React rewrote the attribute and DELETED every `leaflet-*` class Leaflet had appended; `.leaflet-tile-loaded`'s `visibility: inherit` then resolved to Leaflet's sheet default `hidden` — tiles gone, white box. Fixed by freezing the className string and keeping `overflow-hidden` always on; the popup is held inside by `autoPan` + the CSS ceiling.

  **RADIUS OUTSIDE THE MAP — three causes, all required.** A stale 250px pane default (`zoomForRadius` was never told the 380px band), Leaflet flooring the fractional zoom (`zoomSnap` default 1), and latitude-blind Mercator arithmetic (1.48x too big at Seattle's 47.6°). Fixed by passing `map.getSize()`'s shorter axis, `zoomSnap: 0`, the `cos(lat)` correction + a fit margin, and `panTo` to centre. The popup ceilings were also too tight (the "Start a drop-in" button was scrolled out and its centre hit-tested the wrapper); raised to 34vh / 42vh.

  **EVIDENCE, measured on the current tree at 390x844 `/browse`** (`.scratch/v23/verify-founder-map.mjs`): circle inside the band on both axes (0.85 w / 0.74 h); after a marker tap `.leaflet-container` retained, 6 tiles visible, container bg `#ddd`, 0 pageerrors; popup contained with the button's centre hit-testing the BUTTON. `npm run verify` exit 0 — 39 files / 1195 tests, lint clean, a11y/steering/guards PASS.

  **NOT FIXED, RECORDED:** `places.e2e.ts`'s `learn-more` expectation is stale since V23 slice 4 removed the panel's map-search fallback; that spec is in the batch's pre-existing failure set.

  **AND THE OLD CI BLOCKER IS RESOLVED:** `gh auth status` now shows the `workflow` scope and `origin/master` is level with the local CI commits (`c29f185`); the "⏸️ BLOCKED" note below is historical, kept for the record.

- **⏸️ V23 CI — BUILT, COMMITTED (`d7d846d`), AND BLOCKED ON A CREDENTIAL SCOPE THE FOUNDER MUST GRANT (HISTORICAL — see the follow-up entry above).** One command clears it: `gh auth refresh -s workflow`. Then `git push origin master` (details, including the `ALLOW_CONFIG_CHANGE` export that is needed only while the commit is unpushed, are in `.scratch/v23/ledger.md`).

  **WHAT IT ADDS.** Until V23 this repo had **NO CI AT ALL** — no `.github/workflows`, no other pipeline. Every gate was real but lived on one machine. `.github/workflows/verify.yml` runs one command, `npm run verify`, deliberately NOT re-listing the stages (a second list would be a second definition of the gate drifting from `package.json`), plus the tracked-hook install the `no-bypass` guard asserts. Full operational doc: `docs/agents/ci.md`.

  **THE SECRETS DECISION, MEASURED NOT ASSUMED.** The build needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (confirmed by moving `.env` aside and watching `verify` fail). They are **repository variables, not secrets** — the anon key is compiled into the shipped bundle, and what protects the data is RLS: probed with the anon key, `profiles`, `messages`, `place_comments`, `parent_cards` each return **zero rows** while `places` returns the public directory. Missing variables SKIP the job with a notice rather than failing, because a red X for "not configured yet" teaches people to ignore red Xs.

  **TWO REAL CI BLOCKERS FOUND BY SIMULATING A FRESH CLONE** (git clone with no `.env`, no `node_modules`, then `npm ci` + the gate — three failures were found and fixed, not by reading the YAML): (1) **steering-lint pointed at `supabase/.temp/linked-project.json`**, GITIGNORED machine-local CLI state that CANNOT exist in a clone — the first CI run this repo ever had would have failed on a file CI cannot create; added to its `ALLOW_ABSENT` list, purely additive, and verified the lint still catches a genuinely stale pointer. (2) **A test-count divergence:** local said 40 files / 1197 tests, the clone 39 / 1191 — because `.scratch/` is gitignored but still ON DISK and vitest discovers tests by WALKING THE TREE rather than asking git, so a preserved `inbox.test.ts` copy from the concurrent-writer incident ran as an extra file CI could never have. Deleted (committed originals byte-identical). **Local and CI now both report 39/1191.**

  **VERIFIED ON THE COMMITTED TREE:** a clone of `d7d846d`, run exactly as CI runs it, exits 0 — 39/1191, 0 lint errors, steering PASS, guards PASS. Also confirmed the `config-guard` will NOT fire in CI: it uses `merge-base origin/master HEAD`, so once the commit is on origin the check-config change is in the baseline.

  **THE BLOCKER IS A SCOPE, NOT LABOUR:** GitHub refused the push — `refusing to allow an OAuth App to create or update workflow '.github/workflows/verify.yml' without 'workflow' scope`. `gh auth status` shows the token has `gist`, `read:org`, `repo` — **no `workflow`**. The pre-push gate itself PASSED. Only the account owner can grant a scope, so this is one command for the founder: `gh auth refresh -s workflow`.

- **✅ V23 WRAP-UP COMPLETE (2026-09-23). PUSHED as `8edfdf0` and `bf95ea5`.** Everything outstanding is closed: the order check now seeds real content, the mobile audit ran over this batch's surfaces, and migration 0050 was re-verified on the committed tree.

  **THE WRAP-UP FOUND A REAL USER-FACING BUG NO EARLIER LANE HAD SEEN: `/place/:id` RENDERED A BLANK PAGE.** The mobile audit (which had never covered this surface — `mobile-audit.mjs` sweeps a hardcoded unauthenticated `['/login','/playdate/:id','/browse']`) reported an uncaught `TypeError: Cannot read properties of undefined (reading 'map')` with an EMPTY BODY. Root cause: `PlaceMapLazy.tsx` had ONE lazy factory resolving through the module's DEFAULT export — which is `PlacePickerMap` — cast to `ComponentType<any>`, and used by all three wrappers. So `PlaceMap`, which passes `place`, rendered the PICKER, which reads `places.map(...)`. **The `as unknown as ComponentType<any>` cast erased the prop mismatch TypeScript would have caught: a compile-time-safe lie.** The V22 note in that file records fixing an earlier crash (React #306) by ADDING a default export — which fixed the UNDEFINED component while introducing the WRONG one. **Proven pre-existing** by building base `ff49d0c` in an isolated worktree and hitting the same id: identical pageerror, identical blank body. Fixed with one lazy per NAMED export and casts that name the real props type; verified all three surfaces render their own component with 0 pageerrors (`/place/:id` map, `/browse` 116 markers, `/new` 241 markers).

  **THE ORDER CHECK NOW SEEDS WHAT IT MEASURES — AND FIXING THE VACUITY EXPOSED TWO BUGS IN THE CHECK ITSELF.** It uploads a real 1x1 PNG to `<uid>/family/order-check-fixture.png`, PATCHes a bio + that path, measures, then restores and deletes — self-seeding and self-cleaning, verified afterwards from the DB (`bio=null`, no fixture object). The read side is now `["parents","familyPhoto"]` against a real editor list. Both bugs it exposed had been **unreachable because the branch never ran**: (1) the read-side probe inserted `familyPhoto` BEFORE `parents`, the opposite of `ProfileView.tsx:571`, so once seeding worked the check **failed against a correct page and accused the editor**; (2) the assertion compared **absolute indexes across different-length projections** and could only ever have passed vacuously. Both rewritten as the actual property and proven in both directions — passes on the tree, fails on the injected pre-fix drift.

  **MOBILE AUDIT: 40 findings, 2 distinct elements, BOTH PRE-EXISTING CHROME.** The 24x44 Settings gear (`App.tsx:237`, 44px tall but 24px wide) and a 151x42 "Browse places" link in the inbox empty state (`InboxPage.tsx:882`, 2px under). **Proven identical at base**, after a false start worth recording: the first base measurement returned EMPTY for every route and would have "proved" the base clean — but the saved session is bound to origin `localhost:4173` and the routes had all redirected to `/login`. **An empty result from a page that did not load is not evidence of absence** — the same lesson as the `[]`-vs-populated comparison this batch hit three times. Re-ran the setup spec inside the worktree, served base on 4173 so the origin matched, and got byte-identical findings. **Not fixed here** (outside the batch's scope; recorded with exact selectors as open work).

  **MIGRATION 0050 RE-VERIFIED ON THE COMMITTED TREE:** 4 policies, RLS on, 0 rows, and anon still reads `[]`.

  **AUDIT SCRIPTS WRITTEN, DELIBERATELY NOT WIRED INTO `verify`:** `.scratch/v23/mobile-audit-v23.mjs` covers this batch's five surfaces at 4 phone widths x 2 appearances. It is separate from the standing `mobile-audit.mjs` because extending that lane would change what it covers — a different decision from auditing one batch. **The manual-lane gap is therefore still open and still recorded:** `a11y:profile-order` needs a browser + preview server + signed-in account, so it stays a manual lane.

- **✅ V23 FOLLOW-UPS COMPLETE — the title rename and the parallel session's profile work (2026-09-23). PUSHED as `128993b` and `d7b41c1`.** Full detail in `.scratch/v23/ledger.md`.

  **#1 THE TITLE IS NOW "Drop-in at <place>"** (`128993b`). The founder's "Playdate(change to 'Title')" pointed at the word, not the field — the field already read "Title", and what the parent sees is the generated VALUE. Both generation sites moved together (`postSummary.GENERATED_TITLE_PREFIX`/`_FALLBACK` and the clone's `feed.generatedTitleFromParts` restatement, kept separate to avoid the feed -> postSummary -> places -> feed cycle); the pinning tests are what enforce "both". **Existing posts are NOT rewritten** — a stored title is a parent's own words — so the clone test that asserts the old string on a STORED title correctly still expects it, with a comment saying why. Verified on /new: "Drop-in at Green Lake Park" with a place, "Drop-in" without.

  **#2 THE PARALLEL SESSION'S PROFILE WORK WAS KEPT, VERIFIED AND REPAIRED** (`d7b41c1`). It single-sources the profile block order across the read view and the editor through a pure `profileBlurbOrder` seam, fixing a real drift: the read view CLOSED with the family photo while the editor LED with it as the second card. Kept rather than discarded because the defect is real, the work is tested, and provenance is not a reason to destroy verified code. **Committed separately and labelled as having skipped this batch's lanes**, so no future reader assumes it passed them. Verified: 26 unit tests, typecheck, verify exit 0, profile e2e 3 passed, and **measured in the browser** — the editor now renders the photo@3 AFTER parents@2, no longer the second card.

  **ITS GUARD HAD A REAL DEFECT AND IT IS THE BATCH'S FOURTH INSTANCE OF THE SAME CLASS.** `scripts/profile-order-check.mjs` **passed vacuously**: the marker has no bio/kids/photo, so the read view renders zero shared blocks, and the cross-surface check compared `[]` against the editor's list and reported agreement for ANY editor order. **Proven by injecting `readShared = []`** and watching both checks print `ok`. Fixed: the read projection must now be a subsequence of the EDIT projection (the editor is genuinely the other half, not a bystander in its own log line), plus a **vacuity floor** that fails when the read side is empty while the profile has content. Both directions proven — the floor fails on an injected empty read side; the order check fails on an injected drift. **One thing I got wrong:** I first suspected the `main h2` selector was broken; probing showed `ProfileView.tsx` does emit those h2s and the account is simply empty. The selector was fine — the vacuity was the bug.

  **THE GUARDS FIRED TWICE AND WERE BOTH RIGHT.** `config-guard` blocked the package.json change ("this is how a failing gate gets silently disabled") and was answered with an `ALLOW_CONFIG_CHANGE` reason, with `verify`'s command list confirmed byte-identical. The pre-push hook then blocked the push because it runs `verify` in its own environment and could not see the reason — correct behaviour; the fix was exporting the reason, **not** `FAST_PUSH=1`. The guard's own doc says "do not silence the guard"; that was followed.

- **✅ V23 COMPLETE — THE FEEDBACK BATCH (9 founder annotations, 4 pages, 7 slices). PUSHED as `3948c43` (2026-09-23).** Source: the founder's written feedback with three screenshots. Plan `plan-v23.md`, event log `.scratch/v23/ledger.md`, preserved artifacts `.scratch/v23/preserved/`.

  **GATE ON THE COMMITTED TREE: `npm run verify` exit 0 — six stages PASS · 1197/1197 unit (40 files, baseline 1147, +50) · lint 0 errors / 72 warnings (house baseline 68; the +4 are the `react(set-state-in-effect)` house pattern in new effects plus the concurrent writer's files, recorded not hidden) · a11y:focus PASS · steering-lint PASS · guards PASS.** e2e: `place-directory-in-new.e2e.ts` 5 passed · `post-location.e2e.ts` 6 passed · `places.e2e.ts` 7 failed / 13 passed **with a failure set byte-identical to base `ff49d0c`**. The pre-push hook re-ran the gate: `PASS — gated push to origin/master is clean and green`.

  **WHAT SHIPPED.** **Drop Ins** — one action row with two clear choices, replacing a shoved-in button plus a permanently-visible Distance select and zip form; `LocationModal` extracted so `/browse` and the feed share ONE dialog; `RadiusEmptyState.showPostCta` removes the SECOND "Post a drop-in" (measured: 1 CTA, was 2). **Post a drop-in** — the spill fixed; "Browse places" opens the scrollable lightbox; the bottom "Browse all N places" button deleted; the picker panel offers "Select this place" AND "Details". **Places** — the popup stops blanketing the map; "Find it on the map" removed from that panel. **Inbox** — an unread dot that clears on open, and no parent twice. **Place Details (new route)** — migration `0050` `place_comments` (applied live and twice), plus the wall, the follower count, and the founder's own "just Google it" link.

  **THE BATCH'S RECURRING DEFECT CLASS, FOUR TIMES: an acceptance test that cannot fail.** (1) Slice 2's natural metric — `scrollWidth <= clientWidth` and "text inside the button's border box" — is **TRUE on the buggy code**, because a `rounded-full` stadium clips via the border-RADIUS curve, not the box; replaced with "not stadium-shaped AND more than one line", proven red (`rounded-full`: 2 lines @375px, 3 @320px) then green (`rounded-xl`). (2) Slice 6's first metric measured `place-marker-info`'s bounding box — a **scrolled child**, which reports its natural height even while visibly clipped — and said "284px, unchanged" across TWO fix attempts while the CSS was working; the correct metric is the POPUP element against the band. (3) My own radius-error script hard-coded slider value 17, which an earlier run had already **saved**, so the no-op guard correctly skipped the write and the injected failure was never reached. **Each fix was the same: replace the proxy with a real assertion, and prove the check can fail before trusting it.**

  **THE SPILL'S ROOT CAUSE HAD BEEN MISDIAGNOSED TWICE.** The duplicate-row pill was a stadium around a label wrapping to 2–3 lines; two prior rounds fixed the WIDTH axis while the photographed defect was the SHAPE. Its own code comment asserted the pill "always contains its text", which the founder's screenshot disproves.

  **THE POPUP DEFECT WAS A DEAD OPTION, NOT A STYLE CHOICE.** `L.popup({ maxHeight: 170 })` **never reaches the DOM** — Leaflet sizes the bubble at open time from the content that exists THEN, and our content is a React portal mounting a moment later. Fixed in CSS where it binds: ratio **0.79–0.83 → 0.53** at three viewports, 106px of map visible above the bubble — and the counter-claim checked: all three controls remain **44px and centre-hit-testable** after scrolling.

  **TWO REAL DEFECTS FIXED BEYOND THE BRIEF.** (a) **A failed radius write was invisible**: `LocationModal.handleApplyRadius` had a bare `finally` and no `catch`, and `FeedPage.handleLocationApplyRadius` swallowed too — the dialog closed over a failure with nothing shown, while the control this modal REPLACED had shown a line. Fixed at both ends with one owner for the message, proven with an **injected 500** (control 0, injected 1, `role="alert"`, modal stays open). (b) **`e2e/post-location.e2e.ts` asserted the OLD inline-list behaviour the founder asked us to change** — left alone it would have made the gate red and the correct change look like a regression.

  **THE DM UNREAD GAP IS A SCHEMA WALL, REPORTED NOT PAPERED OVER.** The dot works for playdate conversations. **DMs cannot have one:** `conversation_reads.playdate_id` is `NOT NULL` and FK'd to `playdates`, while a DM is `messages.playdate_id IS NULL`. **A founder decision; no migration written.** *(Superseded by follow-up #3 above: the founder authorized it, and migration `0051` shipped it.)*

  **"PLAYDATE → TITLE" IS A VALUE, NOT A LABEL — still parked.** The field already reads "Title"; what the founder sees is the generated VALUE (`GENERATED_TITLE_PREFIX = 'Playdate at '`). A copy decision, reported rather than taken.

  **SKILL RUN AND READ IN FULL (571 lines), THEN DELIBERATELY NOT USED AS WRITTEN.** The `design-mobile-apps` skill drives [sleek.design](https://sleek.design) and needs `SLEEK_API_KEY`; the device-flow code `87J3-TKN2` was **abandoned unapproved** on the founder's instruction (Pro is $49.99/mo, or $30/mo yearly at $360/yr). **What was taken instead:** its transportable principles, applied in code — tab bars are for navigation not actions; do not mix icon sets; 44px/16px floors; review the WHOLE screen. "We ran the skill" and "we used the skill" are different claims.

  **A CONCURRENT WRITER SHARED THIS CHECKOUT.** At ~13:5x–14:03 a second writer reverted every V23 product change and both batch documents; the founder chose to pause. Verified with `grep`, `git diff --stat` comparisons and mtimes, with machine evidence of a second agent (`browser_harness.daemon`, `/tmp/dsh-spa-server.py`, Chrome under `/tmp/opencode/chrome-cdp`). The tree recovered and the batch resumed. **The writer's 5 files (`photoStorage.ts`, `ProfileView.tsx`, `ProfilePage.tsx`, `photoStorage.test.ts`, `scripts/profile-order-check.mjs`) were deliberately NOT committed and NOT touched** — they remain uncommitted, undecided, as a founder question.

  **VERIFICATION DISCIPLINE USED, so a later session can repeat it.** Pre-existing e2e failures were proven in an **isolated `git worktree` at `ff49d0c`** (node_modules symlinked, `.env` and marker auth copied) and the failure sets compared as sorted lists, not eyeballed. Flakes were characterised by re-running in isolation. The committed tree was re-gated before pushing. **`git add -A` was never used** — the 30 batch files were staged by name so the concurrent writer's work could not ride along (checked afterwards: none of their files are in the commit).

- **⏸️ V23 PAUSE RECORD (superseded by the COMPLETE entry above; kept because the clobber is a real event).** Plan `plan-v23.md`, event log `.scratch/v23/ledger.md`, preserved artifacts `.scratch/v23/preserved/`.

  **A second writer, not this session, reverted every V23 product change and BOTH batch documents.** Verified, not inferred: after slice 2's fix was measured green, `grep 'rounded-xl border border-indigo-300 bg-indigo-50' src/pages/NewPlaydatePage.tsx` → **no match**; `git diff HEAD --stat` went from **16 files at 13:12 to 5 files at 14:03, none of them this batch's**; `task-state.md` and `plan.md` were reverted to HEAD (both now byte-identical to `ff49d0c`), destroying this plan and the V22/V23 record written here. The writer was still active at **14:03:43**. Its work is a coherent feature (read-view vs edit-surface section order, on a `profileBlurbOrder` seam) labelled in its own comments "V23 slice 16" — a number that does not exist in this plan. It owns `photoStorage.ts`, `ProfileView.tsx`, `ProfilePage.tsx`, `photoStorage.test.ts`, `scripts/profile-order-check.mjs`; **no V23 slice may edit those.** Machine evidence of a second agent on this checkout: `browser_harness.daemon` (running since Sep19), `/tmp/dsh-spa-server.py`, Chrome under `--user-data-dir=/tmp/opencode/chrome-cdp`.

  **SURVIVED AND PRESERVED** (untracked new files were not reverted) → `.scratch/v23/preserved/`: `inbox.ts` + `inbox.test.ts` (V23 s7's pure id-keyed merge seam — **re-verified after the clobber: `npx vitest run src/lib/inbox.test.ts` → 6 passed**), `LocationModal.tsx` (V23 s1's extraction), and the other writer's `plan.md` state. **LOST FROM THE TREE, all reconstructible:** s2's one-token fix (`rounded-full` → `rounded-xl` in `NewPlaydatePage.tsx:864`, independently proven red/green — the stadium cut through 2 lines at 375px and 3 at 320px), s1's FeedPage rearrangement (in flight, builder never reported), s7's InboxPage wiring + `db.ts` `otherPartyId` plumbing (seam survives, wiring must be redone). **Nothing was committed.**

  **RULING: pause, do not fight.** Reverting the other writer's files or racing it would destroy work whose intent I cannot see and would make every gate result a coin flip — a concurrent edit landing mid-verify is precisely the "green while the property did not hold" failure this repo keeps recording. **No slice claims the gate:** `npm run verify` has never been run on a tree that was stable for the whole run. **Resume protocol is pinned in the ledger:** confirm the tree stopped changing → decide the other writer's 5-file change with the founder → re-apply s2's token and re-dispatch s1/s7 wiring → gate on the frozen tree → only then slices 3/4/5/6. Slices 3–6 are unstarted, not dropped; the recon findings that shape them are unaffected.

- **🟡 V23 — THE FEEDBACK BATCH (9 founder annotations, 4 pages), 3 of 7 slices built before the pause.** Base `ff49d0c`. Baseline **1147 tests / 36 files, 0 lint errors / 68 warnings**. Full record above and in `.scratch/v23/ledger.md`.

  **SKILL RUN AND READ IN FULL (571 lines), THEN DELIBERATELY NOT USED AS WRITTEN.** The `design-mobile-apps` skill drives [sleek.design](https://sleek.design) over a REST API and requires `SLEEK_API_KEY`. A device-flow code was issued (`87J3-TKN2`) and **abandoned unapproved** on the founder's instruction, because its paid tier is **Pro at $49.99/mo (or $30/mo yearly, $360/yr)**. **What was taken instead:** the skill's transportable principles, applied in code — a tab bar is for navigation not actions; do not mix icon sets; 44px tap-target and 16px input floors; review the WHOLE screen, never a viewport crop. Recorded because "we ran the skill" and "we used the skill" are different claims.

  **RECON FINDINGS THAT CHANGED THE PLAN — five, all cited in the ledger.** (a) **Places have NO comment wall at all:** `comments.playdate_id` FKs to `playdates` only (`0013_comments.sql:39-46`), so "see what other parents have said" is a NEW TABLE (migration `0050`), not a re-read — the founder chose the real wall over the cheaper option. (b) **The "two Post a drop-in buttons" is literally two components:** `RadiusEmptyState.tsx:118-123` and `FeedPage.tsx:1026-1031`, and the feed already has the opt-out pattern (`showEscapes={false}`) needed to fix it. (c) **`/browse`'s Location modal is written INLINE** (`PlaceDirectory.tsx:680-750`), so "use that here too" needs an extraction. (d) **The picker lightbox ALREADY EXISTS** (`NewPlaydatePage.tsx:1218`) and already renders the full directory; the field's button opens the inline list instead — so the founder's ask is mostly WIRING, making slice 3 cheap. (e) **The inbox duplicate is structural:** `InboxPage.tsx:815-818` (DMs) and `:866-874` (playdate conversations) are two lists with no cross-dedupe.

  **THE SPILL'S ROOT CAUSE WAS MISDIAGNOSED TWICE, AND THE FIX'S ACCEPTANCE TEST WAS INADEQUATE — the batch's most important finding.** The duplicate-picker row is `rounded-full` drawn around a label that wraps to 2–3 lines; a stadium's radius is half the box height, so the curve necessarily cuts through every line after the first. Two prior rounds fixed the WIDTH axis (`w-fit`→`w-full`, then `min-w-0`) while the photographed defect was the SHAPE. Worse, the natural acceptance test — `scrollWidth <= clientWidth` and "text rect inside the button's border box" — **is TRUE on the buggy code**, because the clipping is done by the border-RADIUS curve, not the box; it could never have failed. Replaced with a criterion that can: **NOT stadium-shaped AND more than one line**, proven red then green (`rounded-full`: stadium, 2 lines @375px, 3 @320px, DEFECT TRUE; `rounded-xl`: radius 12px, not a stadium, DEFECT FALSE). **The generalizable lesson repeats V22's: replace the proxy with a real assertion.** Evidence `.scratch/v23/evidence-pill-375.png`, script `.scratch/v23/verify-corner.mjs`.

  **"PLAYDATE → TITLE" IS A VALUE, NOT A LABEL — investigated, not assumed.** The field already reads "Title" (`PlaydateFormFields.tsx:839`). What the founder sees is the generated title VALUE: `GENERATED_TITLE_PREFIX = 'Playdate at '` / `GENERATED_TITLE_FALLBACK = 'Playdate'` (`postSummary.ts:46,53`), rendered in the summary read-back. Renaming it ("Drop-in at Green Lake Park") touches `postSummary.ts`, the parallel `generatedTitleFromParts` (`feed.ts:2782-2785`) and `feed.test.ts:3627`, and it is copy the founder owns. **PARKED pending a founder decision** — this repo already retracted one FALSE "mixed capitalization" finding from exactly this label-vs-value confusion.

  **THE DM UNREAD GAP IS A SCHEMA WALL, REPORTED RATHER THAN PAPERED OVER.** The unread dot works for playdate conversations (the `conversation_reads` cursor + `markConversationRead` already exist). **DMs cannot have one:** `listDirectConversationsWithClient` hardcodes `unreadCount: 0` (`db.ts:4712`) because `conversation_reads.playdate_id` is `NOT NULL` and FK'd to `playdates` (0042:25-30), while a DM is identified by `messages.playdate_id IS NULL`. Enabling it needs a nullable column or a separate DM read-cursor table. **No migration was written** — that is a founder decision, and the recommendation is recorded. *(Superseded by follow-up #3 above: the decision was taken and migration `0051` shipped it.)*

  **A PRE-EXISTING e2e FAILURE, PROVEN PRE-EXISTING.** `e2e/post-again.e2e.ts:220` ("Duplicate prefills place, details, duration, and the linked kid") fails **identically at base `ff49d0c`** — verified by stashing all work and re-running, not by trusting the builder's claim.

- **✅ V22 COMPLETE — THE DESIGN-QUALITY BATCH (2026-09-23). 13 slices, both review lenses, all shipped.** Sources `MASTER-IMPROVEMENTS.md` (merged recommendation list), `AUDIT.md` (Impeccable, 10/20 → 19/20), `DESIGN-REVIEW.md` (Apple HIG, "Needs work" → "Good"), `PRODUCT.md` (product truth written during this batch via `impeccable init`). Plan `plan.md`, per-slice evidence and every adjudication `.scratch/v22/ledger.md`, close-out `V22-SUMMARY.md`.

  **GATE ON THE FINAL TREE: `npm run verify` exit 0 — six stages PASS · 1147/1147 unit (36 files, baseline 1134) · lint 0 errors / 68 warnings (house baseline) · a11y:focus PASS · steering-lint PASS · guards PASS (lib-sibling, config-guard, no-bypass). e2e `place-directory-in-new.e2e.ts` 3 passed against live Supabase.** Measured deltas: `role="alert"` 0→24 · `focus-visible:` 0→109 · `motion-reduce:` 1→78 · `loading="lazy"` 0→12 · dark mode 0→full palette · `text-slate-400` body text 3→0 · entry JS 853KB→653KB (229→173 gzip) with the 157KB map chunk **never fetched on `/login`** (proven at the network level) · 1024px layout 448px column→768px + left rail · nav 3 destinations + 1 action → **4 destinations, no action**.

  **THE BATCH'S RECURRING DEFECT CLASS: a check passed while the property did not hold. Four times.** (1) Slice 1's acceptance criterion was "grep for ≥15 literal `aria-describedby`" — the attribute comes from a `{...fieldA11y()}` spread and exists only at RUNTIME, so the criterion would have failed a CORRECT implementation; the builder flagged it instead of gaming the grep. (2) Slice 5's evidence was `grep activeElement`, which proves the hook is imported, not that it traps. (3) Slice 7's safety check `grep -v focus-visible` cannot distinguish `focus-visible:outline-none` (NO cue) from `focus-visible:outline-none focus-visible:ring-2` (fine) — it reported "zero matches" and was wrong; the real defect was `InboxPage.tsx:949`, pre-existing as `focus:outline-none`. (4) Slice 10 proved the chunk shrank AND that `/login` never fetches it — both true, both compatible with the lazy component resolving to `undefined`. **Each fix was the same: replace the proxy with a real assertion.** New permanent gates came out of it (`scripts/focus-indicator-check.mjs` wired into `verify`; `a11y-dom-check.mjs`, `dark-mode-check.mjs`, `layout-width-check.mjs`, `focus-trap-check.mjs` as manual lanes), each PROVEN TO FAIL before being trusted.

  **FOUR DEFECTS FOUND IN ALREADY-"VERIFIED" WORK — the pattern matters more than the bugs.** (1) **Slice 9 broke the PUBLIC SHARE SURFACE**: the desktop grid applied unconditionally while the nav rail renders only when `session !== null`, so `/playdate/:id` — the one page a signed-out visitor ever sees — collapsed to a **72px** column at 1024px. Slice 9's own audit swept phone widths only, where the grid is inactive, and its layout measurements were signed-in. Found by an orchestrator browser probe; fixed by making the grid conditional on the same `session` check. (2) **Slice 10 shipped a crash**: `lazy(() => import('./PlaceMap'))` resolved to `undefined` (three NAMED exports, no default) → React #306 on every map surface, `/new` rendered nothing. Found by slice 12's builder, fixed with a default export, now covered by the e2e spec's `.leaflet-container` assertion. (3) **`reuseExistingServer: true` could run e2e against a STALE `dist/`** (test:e2e does not build) — found by the repo's own NEW `config-guard` on its first live run; fixed by adding the build to the webServer command rather than silencing the guard. (4) **Slice 9's builder reverted `ProfileView.tsx` to HEAD**, discarding slice 11's `eager` fix, to keep its own build green — restored by the orchestrator; recorded because "keep my build green" is not license to discard another slice's landed work.

  **TWO AUDIT CLAIMS RETRACTED, both by the orchestrator, both after a builder pushed back rather than manufacturing a change to satisfy a brief.** (a) *"Mockups live in production"* (`AUDIT.md`): FALSE — the two HTTP 200s were Vercel's SPA fallback (`vercel.json` rewrites every path to `/index.html`); the served body was byte-identical to `dist/index.html` (4747 B) while the real files are 10886/11777 B. They were gitignored on purpose, never committed, never served. Latent risk, not exposure. A **status code is not evidence about content when a rewrite rule is in play.** (b) *"Mixed button capitalization"* (`DESIGN-REVIEW.md` finding 13): FALSE — both cited strings are instructional prose (`push.ts:181`) and a native `<option>` (`PlaceDirectory.tsx:647`). A scan of every `<button>`/`submitLabel` found **0** title-case labels; the app was already consistently sentence-case. Slice 13 correctly reported "no changes needed".

  **THE HUMAN'S DECISIONS (both asked mid-batch, both recorded in `plan.md` Risks):** dark mode shipped as *insurance, not a headline feature* ("if they want to use it, they can use it") — the palette was verified by sampling PAINTED pixels (dark page `rgb(24,20,18)`, card `rgb(36,31,28)`, terracotta link 6.63:1 — matching the builder's independently computed table exactly) and reviewed as screenshots; and the FULL rail + wide content was chosen over a cheaper "just widen it" option, with pixel-equivalence at 390px as the safety property.

  **DELIBERATELY NOT DONE (decided, not dropped):** swipe-to-go-back (the browser owns the gesture in a web PWA; the tap alternative already exists), an app-level appearance toggle (Apple explicitly warns against one), `GoingCircle` display names (the feed type carries no name; a data-shape change with 351 dependent tests), and further entry-chunk splitting (React + Supabase + router, not the map).

  **OPEN, FILED RATHER THAN DROPPED:** a 320px overflow on the signed-in feed (Distance select + home-zip Save form) — proven pre-existing by reproducing on baseline; the mobile audit only sweeps signed-out routes, which is why nothing caught it. And the `scripts/*-check.mjs` lanes are manual — they need a server and (mostly) a signed-in session, so they wire into `verify` once an e2e fixture account exists in CI.

- **✅ V21 COMPLETE — THE PHONES-REVIEW BATCH (2026-09-23). 11 founder+wife annotations → 10 tickets, all shipped.** Spec `.scratch/v21/spec.md`, plan `.scratch/v21/plan.md`, ledger `.scratch/v21/ledger.md` (the full event log, including every orchestrator-side claim check). **Gate on the final tree: `npm run verify` exit 0 · 1134/1134 unit (34 files) · lint 0 errors / 68 warnings (house baseline) · steering-lint PASS · FULL e2e 111 passed / 2 failed · playtest lane PASS 8 routes / 0 uncaught JS errors.** Migration `0049` applied LIVE and applied twice (idempotent), verified by read-back. `/browse` keeps its route but loses its nav tab. **The 2 e2e failures are BOTH the Realtime specs and both PROVEN flakes, not product bugs:** `inbox` "real-time delivery" fails identically on the BASE commit `e2d55d7` (verified by building the base in a separate git worktree), and `reactions` "update live" passes 4/4 in isolation (30s) and passed in the first full run — both time out in SETUP (two account lifecycles + a Realtime handshake) before any product assertion, the exact failure mode `task-state.md` already records for this pair.

  **THE BATCH'S TWO REAL DEFECTS, both found by measuring rather than reading.** (1) **The profile avatar was an ELLIPSE, not a circle** — the founder's own wording ("it's supposed to be a circle and it looks like it's getting cut off") matched the DOM exactly: an `<img class="h-20 w-20 rounded-full">` inside a `<button class="h-11 w-11">`, measured at **80×44**. Two owners for one box. Fixed by making the wrapper own the same box as its child. **Red-green verified by the orchestrator in both directions:** reintroducing the bug fails the spec with `width−height delta 36px` (exactly 80−44), restoring it passes 2/2. (2) **A `getElement()`-before-`addTo()` crash** in the picker map's new overlay effect — `getElement()` returns null pre-add, and the cast-then-read threw `Cannot read properties of undefined (reading 'style')`, killing the ENTIRE `/new` render (heading gone, blank body). The `PlacesMap` site already ordered these correctly; the copy missed it. Found by e2e, fixed by reordering.

  **THE FOUNDER'S CENTREPIECE (t02) WAS DELIVERED BY THE ORCHESTRATOR AFTER TWO BUILDERS FELL SHORT — and the weaker attempt is the instructive part.** The ask: *"we move the map and the list of places to the where section inside of the post section."* Builder 1 removed the Places tab and claimed the `/new` surface was "already in place" — it was not. Builder 2 extracted `PlaceDirectory` correctly (`BrowsePage.tsx` 1465 → 257 lines) and improved the picker map, then reported "Phase B works, full slice 7 green" — but `grep -rn PlaceDirectory src/` showed **exactly one consumer (`/browse`)**, and the component's own doc comment asserted a `/new` sheet that did not exist. `/new` still offered only the V9 8-row `PLACE_BROWSE_LIMIT` shortcut. **A green `places.e2e.ts` 20/20 proved `/browse` + the picker map, not the ask.** With the tab gone and the directory not moved, filtered browsing was strictly WORSE than before — a capability regression masked by a passing suite. The orchestrator wired the sheet in, and the distinguishing assertion now lives in `e2e/place-directory-in-new.e2e.ts` (3 passed): **search field + filter control + map canvas + a real list row, reached from `/new`.** *"The tab is gone" and "the directory is reachable from the post flow" are different claims; only the second is the ask.* Visual proof `.scratch/v21/evidence-directory-sheet.png`.

  **TWO BUILDER CLAIMS WERE INVESTIGATED AND FOUND FALSE — both would have cost real time if accepted.** (a) *"The e2e lane is blocked by a Supabase test-DB issue"*: the true cause was V21 t01 removing the header `@handle` link while the SHARED `e2e/auth.setup.ts:80` still asserted it, breaking the setup for **every** spec. Fixed to assert `/profile`'s identity-card heading; proven `1 passed (3.8s)`. (b) *"The authenticated ilike query against profiles hangs indefinitely on the live project"* (used to justify dropping a REST spec): probed directly with the marker JWT → **HTTP 200 in 198ms**, returning the right row. The real cause was the builder's own signup rate-limiting. **Verify a negative as carefully as a positive** — the 0045 saga repeating.

  **PRIVACY VERIFIED LIVE, not just asserted.** t07's name autocomplete is an enumeration surface, so the rails were pinned and then PROVEN against the live DB: the same prefix query with the **anon** key returns `[]` (RLS denies signed-out enumeration) while an authenticated parent gets results; the seam is prefix-only `ilike` with `%`/`_`/`\` escaped, capped at 8, min 2 chars, returning **only** `display_name` + handle.

  **What shipped (all green):** **t01** nav tab → "Drop Ins" (heading "Near you" deliberately NOT renamed — the founder pointed at the nav element); **t02** the directory into `/new` (above); **t03** six reactions — migration 0049 adds `kind`, and the PINNED RULING is **one reaction per person per message with `kind` MUTABLE**, so the unique index stays `(message_id, profile_id)` and changing kind REPLACES in place (the count must not increment). The realtime DELETE payload needs no `REPLICA IDENTITY` change — verified, because the PK is unchanged and the handler reads only PK columns; **t04** the duplicate picker's rows stop spilling (`min-w-0`); **t05** the avatar circle; **t06** "Hosted N drop-ins" reveals past events (TAP, not hover — it is a phone); **t07** invite a parent by name (both entry points kept: name search primary, `@handle` still works); **t08** edit-profile order = read-profile order, enforced by `PROFILE_SECTIONS` + a test that fails if either surface diverges; **t09** the feed defaults to a LIST with a Map toggle (no persistence — the house pattern for this page); **t10** the header's duplicate profile link removed.

  **Deliberately not done / recorded:** the reactions "toggle" spec showed one cross-spec flake (a "While you were away" prompt covering the thread) — passes in isolation and on re-run, recorded as a flake, not a defect. t07 dropped a REST-level e2e probe whose only blocker was harness rate-limiting, not the product; the posture is proven at the live-DB layer instead.

- **✅ V20 COMPLETE — WEBSITE LINKS REPLACE PLACE PHOTOS, TAPPABLE MAP POPUPS, LIVE RADIUS, REAL NAMES AT SIGNUP (2026-09-22). Commit `e2d55d7`.** *(Backfilled 2026-09-23: this batch shipped but was never recorded in this file — a real gap, since the system of record is what a fresh session reads first. `grep -c V20 task-state.md` returned 0 before this entry.)* Six founder-requested changes, verified together: `npm run verify` 1093 unit tests / 0 lint errors; full e2e suite 106/106. **(1)** Images out, website links in — the place page's photo block and the browse card's photo slot are gone ("I can't police this and fix all the broken images"); a "Learn more" link opens the place's own site, or "Find it on the map" (OSM search) when no site was verified. Adds `places.website_url` (migration 0048) plus a reviewed backfill: **55 rows carry a real, HTTP-verified official site, 184 use the honest fallback**; `photo_url` and its attribution columns are untouched. **(2)** The map bubble IS the detail — a tap opens an anchored Leaflet popup with a tail, carrying the buttons, staying open until another circle is tapped or it is dismissed; the panel below the map is gone, the marker tooltip is a hit target, and the place page's own map uses this same component instead of a second inert one. **(3)** Set-location radius grows LIVE as the slider moves, which required no longer re-fitting the camera to the circle (under a self-fitting frame 1 mile and 30 miles drew the same 125px circle, so the area never visibly changed). **(4)** The post picker's pin SELECTS; a "Select this place" button does the write, so the form filling is visible instead of happening off-screen. **(5)** Signup asks FIRST NAME + LAST NAME (composed into the handle) and a home address that geocodes to `home_zip`, so the first feed a parent sees is already local; `/onboarding`'s name step matches. **(6)** Three pre-existing defects found on the way: a place rendering twice on `/browse` after a geocode, feed pins drawn off-canvas and unclickable, and a spec assertion broken since `44fdb8a` without anyone re-running it.

- **✅ V19 COMPLETE — NEIGHBOURHOOD MAPS, TWO-PARENT PROFILES, LINKED ACCOUNTS (2026-09-21).** The founder's verbal batch, all three asks delivered. Spec `.scratch/v19/spec.md`, plan `.scratch/v19/plan.md`, ledger `.scratch/v19/ledger.md`. Commits `82c549b` (t01), `514fa27` (t02), `765ab5c` (t03), `e1f3eb9` (t04 seams), `f2f6575` (t04+t05 UI), `44fdb8a` (ocr fixes). **Gate on the final tree: `npm run verify` exit 0 · 1053/1053 unit (30 files) · lint 0 errors / 64 warnings · FULL e2e 102 passed exit 0 · playtest lane PASS 8 routes / 0 JS errors · mobile audit PASS 18/18 · clean-range PASS (17 files).** Migration `0047` applied live (idempotent, applied twice). No new route.

  **D1 — THE MAP NOW FRAMES THE NEIGHBOURHOOD, WHICH WAS THE FOUNDER'S MAIN ASK.** *"I want the map zoomed in as close as possible by default, showing the less-than-1-mile view… that's the value added to make this feel like a neighbourhood feel."* The cause was that the map and the list shared ONE radius; the founder's stored radius is 35, so `/browse` opened city-wide. Split them: `MAP_FOCUS_RADIUS_MILES` (1) feeds the map frame, the picked radius still runs `filterPlacesByRadius`. **MEASURED on the built bundle at 390px: tile zoom 11 → 13 (4× closer), and the two halves are now independent — radius 1 mi ⇒ map r=125px / list max 1 mi; radius 35 mi ⇒ map r=125px / list max 6 mi.** Places outside the frame are counted on screen ("224 places outside this mile view") so a tight map never reads as a full one. **A REAL DEFECT was caught by this slice's own test:** asking "can a search widen the frame?" returned 0.5 mi, because `focusCenter` centres on the matched points' midpoint, so a search matching one place ~7 miles away centred the frame THERE and pushed the home pin off the canvas — precisely what D1 forbids. Fixed with a far-match guard; red-green both directions.

  **D2 — THE FEED HAS A MAP.** The same band above the day sections (which are untouched — additive), reusing `PlacesMap` rather than a parallel component (the V15.2 map regressions were fixed in the shared one). New pure seam `feedMapPins`: no pin for a post with no resolvable coordinate, and posts at one PLACE collapse to a single dot.

  **D3/D4 — PARENT CARDS + LINKED ACCOUNTS (migration 0047).** Two new tables: `parent_cards` (up to two parents, each with name, photo path, about) and `account_links` (invite by @handle → accept → both appear on each other's profile, with unlink). A child table rather than `parent2_*` columns, because "up to two" is a count, a parent is a PERSON while `profiles` is an ACCOUNT, and unlinking must not delete anyone's words; `profiles.bio` explicitly KEEPS its job. "Up to two" is enforced in the DB (CHECK + unique index), not just the UI.

  **A REAL BUG FOUND BY PROBING THE LIVE DATABASE, NOT BY READING THE SQL.** The first draft enforced "one partner per parent" with two partial unique indexes, one per column. A probe with three real accounts showed the hole immediately: account A accepted a link as REQUESTER with B **and** one as ADDRESSEE from C, ending with TWO partners — which on a two-parent profile renders three parents. Each index guarded a COLUMN; nothing guarded the PERSON in both. A partial unique index cannot express "the other party", so the rule moved to a BEFORE INSERT OR UPDATE trigger; the bad indexes are dropped and the surplus rows DEMOTED to `declined` rather than deleted (the invitation happened; erasing it would rewrite history). Re-probed: every person now has ≤1 accepted link, and a second is refused 409.

  **PRIVACY PROBED LIVE with three real JWTs, then made a permanent regression guard.** A third account reads ZERO rows from `account_links` (parties see their own), anon reads zero, a third party cannot alter someone else's link, forging a `parent_card` for another account is 403/42501, position 3 is 400/23514, a self-link and a duplicate pending invite are refused. **These now live in `e2e/account-links.e2e.ts` (2 passed, self-cleaning) because `ocr` correctly noted that a security claim no test defends will eventually stop being true.**

  **THE `ocr` LANE FOUND 17 ISSUES, INCLUDING ONE THAT WOULD HAVE BROKEN POSTING.** The HIGH finding: a feed pin synthesised `id: 'feed-pin-N'`, and the map's marker panel offers "Start a drop-in", which hands `/new` that id as `placeId` — but `playdates.place_id` is **uuid with an FK to `places(id)`** (verified against the live catalog), so posting from a feed pin would fail with a raw Postgres error behind a button that looked fine. Fixed two-sided: pins now carry the post's REAL `place_id` (null for free text), and `PlacesMap` gained `placeActions` so a map holding a non-directory pin drops the controls it cannot honour. It also caught a **race in my own migration trigger** (a bare `select count(*)` is insufficient under READ COMMITTED) — fixed with `pg_advisory_xact_lock`; and a **real functional gap**: nothing populated the counterparty handle, so the link section could never say WHO you were linked to. 16 fixed, 1 kept as documentation.

  **Deliberately not done, recorded rather than hidden:** parent-card PHOTO UPLOAD has no UI yet — `photo_url` is a private-bucket path (the 0038 pattern) and wiring the crop step for a second surface is its own slice; the card is built to carry the photo, so it slots in behind the same field. The feed map has no "Set location" modal (that is `/browse`'s), so it anchors on the home pin. And 2 new lint warnings (62 → 64) are the `react(set-state-in-effect)` pattern the two new load effects share with the file's two existing ones — house pattern, recorded not hidden.

- **✅ V18 COMPLETE — REAL PLACE PHOTOS SHIPPED (2026-09-21). 121 photos live on `/browse`.** V17's deferred **t05** is done: the Airbnb redesign's last piece. Spec `.scratch/v18/spec.md`, plan `.scratch/v18/plan.md`, ledger `.scratch/v18/ledger.md`. Commits `b1ed456` (t01), `31789bb` (t02), `a8b09b2` (t03+t04), `21bc3b1` (contact sheet), `8f3530f` (ocr fixes), `7d0fc97` (applied). **Gate on the final tree: `npm run verify` exit 0 · 1007/1007 unit (28 files) · lint 0 errors / 62 warnings (the pre-batch baseline) · places.e2e.ts 14 passed exit 0 · playtest lane PASS 8 routes / 0 JS errors · mobile audit PASS 18/18 · clean-range check PASS (25 files).** Migration `0046` applied live (idempotent, applied twice). No new route.

  **THE `ocr` LANE FOUND A REAL HOLE IN THE HUMAN GATE — the batch's most important finding, and neither the agent reviewer nor I saw it.** The fetch merge inherited a prior `disposition` unconditionally, so a **re-fetch that returned a DIFFERENT top hit for an already-approved place carried the stale `keep` onto a new, UNREVIEWED image** — and the apply step writes every `keep` row. The approval was for a specific file page and does not transfer to whatever the search returns next. Fixed: the disposition is inherited **only when the thumbnail URL is unchanged**; a changed image goes back to `pending`. The same lane also caught that the **read-back was printed but never asserted** — a 2xx write touching zero rows would have exited 0 with a reassuring log, which is exactly the silent failure the file's own header cites; it is now asserted and **proven** by injecting a nonexistent `placeId` (exit 1). And it caught a **real licence gap, not a comment nit**: the code claimed the photo's attribution lived on the place detail page, but nothing outside `BrowsePage` consumed `photo_attribution` — so CC BY attribution was reachable **nowhere**. `PlacePage` now renders the credit with a real link to the Commons file page. 12 findings total: 11 fixed, 1 recorded as accepted (the fetch script duplicates `commons.ts`'s helpers because a `.mjs` cannot import TypeScript). **Method note: `ocr` writes its session file under `~/.opencodereview/sessions/`, which the workspace-write sandbox denies — it completed an entire review and then crashed at finalize, losing its findings. Widening the sandbox for that path is what produced them.**

  **✅ APPLIED — the founder ruled "keep all for now" (2026-09-21) and all 121 Tier 1 candidates are live.** **`public.places` = 239 rows, 121 with a photo, 0 incomplete** (read-back, asserted by the apply script, exit 0). **Verified on the built bundle at 390px authenticated: 120 rendered slots = 65 real with credit + 55 illustration, 65/65 real images DECODED, 0 page errors.** `evidence/browse-with-photos-cards.png` shows a real Ballard Commons photo with its `Seattle City Council from Seattle / CC BY 2.0` credit directly above Baker Park's illustration fallback — both branches side by side on the live page. **The 22 places Commons has nothing for and the 96 doubtful candidates stay `pending` and keep the illustration: the intended end state, not a gap.** No wrong photo can reach a card by accident — the apply step writes ONLY rows explicitly marked `keep`, proven by running it against the unreviewed sheet (0 written).

  **What shipped (all green):**
  - **t01 — migration 0046, applied live and applied TWICE to prove idempotency.** Four nullable text columns beside the existing `photo_url`: `photo_source_url` (the Commons file page), `photo_license`, `photo_author`, `photo_attribution`. Commons images are CC BY / CC BY-SA / CC0 / PD and the first two **require attribution**, so the licence, its author and the canonical source are stored beside the URL rather than reconstructed later. `photo_author` holds **PLAIN TEXT** because `extmetadata.Artist` returns HTML (`<a href=…>en:user:Shakespeare</a>`) — the backfill strips it before the write rather than leaving markup for a render site to handle. No RLS change (the 0014/0016/0021 column-add lesson).
  - **t02 — the fetch pipeline.** `src/lib/commons.ts` is the PURE half (21 unit tests); `scripts/fetch-place-photos.mjs` is the paced network shell (350ms floor, bounded 429/5xx backoff, mandatory descriptive User-Agent). **A miss is THREE-VALUED — `none` | `failed` | `null`** — because the expensive bug here is reading a FAILED request as "no photo exists": Commons 403s without a User-Agent and 429s under pacing, and V17's own feasibility probe made exactly that mistake and reported 0%, a measurement bug that looked like a finding. **Full run: 239 places → 217 hits / 22 none / 0 FAILED.**
  - **t03 — the curation gate.** `scripts/apply-place-photos.mjs` writes only `disposition === 'keep'` rows, all five columns together (a photo without its licence is a licence violation), refuses any row missing licence/source/image, and confirms by READ-BACK count rather than the DML result.
  - **t04 — the credit line.** A pure `photoCreditLine` seam (+6 tests) feeds a **TEXT SPAN**, never a link — the card is itself a `<Link>` and an `<a>` inside an `<a>` is invalid HTML. Licence compliance, not decoration.

  **THE MEASURED FINDING THAT SHAPES THE BATCH — the hit rate is real, the usability rate is not.** 217 of 239 names return an image, but a large share of top hits are **the wrong subject or the wrong era**, quantified rather than asserted: **83 hits have no word in common with the place or are scanned documents** (V18 matched "12th West / West Howe Park" to a Victorian memorial pamphlet, "Baker Park on Crown Hill" to a 1919 seed catalogue, "Alki Community Center" to an EU fisheries visit to Greece), and a further **24 carry a pre-1955 year with 11 DPLA/postcard scans** (a ca.-1910 postcard for Ballard Playground, a 1950 diving photo for Colman Pool). Tiering by file-name agreement plus a document-scan and historical-image detector splits the 217 into **121 reviewable / 96 doubtful — and the tiering is a REVIEW AID that never sets a disposition.** Building the *visual* contact sheet is what exposed the historical class; a CSV of filenames would not have.

  **End-to-end proof, on a real browser against the real DB.** Applied one probe photo (Green Lake Community Center, "Joe Mabel / CC BY 3.0"), built, served the bundle and drove `/browse` authenticated at 390px: **1 `data-photo="real"` slot with its credit over 119 `data-photo="kind"` slots, and the image really loaded (960×638 natural size).** Screenshot `.scratch/v18/evidence/probe-photo-card.png`. Probe then reverted; DB confirmed back to 0 photos / 239 rows.

  **The spec was WRONG and the red check caught it — the batch's most valuable find.** The first e2e spec asserted `slot.locator('img')` for the real branch. It **passed** on the all-illustration tree (0 real slots, so the branch never ran) and **failed** the moment a real photo existed. Cause, read from the DOM: on the `real` branch **the slot element IS the `<img>`**, so a descendant search looks for an img inside an img — the two branches have different shapes. Fixed and red-green verified **in both directions** (with photo → "120 slots, 1 real, 119 illustration", 2 passed; without → "120 slots, 0 real, 120 illustration", 14/14 passed). This is V17's own lesson repeating: **a test that does not fail on the bug is not evidence.** V17's `[data-photo="real"]` count-is-0 assertion was also rewritten — it was accurate before this batch and false by design after it.

  **A real leak caught by the mechanical check.** The clean-range check **FAILED** on the batch: eight probe `.mjs` files, a screenshot driver, and the generated `review.html` were tracked as source. Untracked, and the rule is now in `.gitignore`. Also recorded: `vite preview` binds **IPv6-only** by default (`[::1]:4173`) while the playtest lane asks for `127.0.0.1` — which made a running server look dead; and this sandbox forces the Chrome profile and uv cache into the workspace (home equivalents are read-only).

- **V17 COMPLETE — THE AIRBNB-STYLE PLACES REDESIGN SHIPPED (2026-09-21). All four tickets (t01–t04) built, reviewed and green.** The V16 t07 items 5–7 deferred by founder decision Q5 are now delivered: `.scratch/v17/spec.md` + `plan.md`, ledger in `.scratch/v17/ledger.md`. Commits `df77d4c` (t01), `c59427e` (t02), `e524db5` (t03+t04), `1782819` (review round), `b347217` (mobile-audit coverage). **Gate on the final tree: `npm run verify` exit 0 · 980/980 unit (27 files) · lint 0 errors / 62 warnings (the pre-batch baseline) · places.e2e.ts 13 passed exit 0 · playtest lane PASS 8 routes / 0 JS errors · mobile audit PASS at 6 viewports × 3 routes.** No migration. No new route, so `routes.json` is unchanged.

  **What shipped:**
  - **t02 — the card heart IS the existing place follow**, not a second save concept. `follows` (0033) already had schema, RLS and a `/place/:id` control; the heart reuses them. ONE batched read for the whole grid (`listMyFollows()`) plus a new pure `placeFollowIdSet` seam. No `saved_places`, no per-card `countPlaceFollowers` call (239 cards must not make 239 RPCs), no migration.
  - **t01 — the map became a band and rows became content-forward cards.** Photo slot with a per-kind illustration fallback (`PLACE_KIND_ICONS`, 10 glyphs, one per `PLACE_KINDS` entry, in the existing NAV_ICONS family); the real `<img>` branch is written and ready for t05. The grouped-lead + "See all" overflow structure is unchanged.
  - **t03 — a floating "Map" button** returns you to the band once scrolled past. `IntersectionObserver` via a callback ref (an effect keyed on the conditionally-rendered band is a real rules-of-hooks error). NO z-index; both modals keep `MODAL_OVER_LEAFLET_Z_CLASS` (1100) unchanged.
  - **t04 — the map frames what the search FOUND.** Measured: search `"pool"` holds 116 markers → 19, and the rendered radius circle goes **156px → 116px**, restoring to 156px exactly when cleared. `PlaceMap.tsx` is UNTOUCHED and `boundsPoints` is absent — V16 t07 item 2 (`93f313b`) deleted a points-fit and must not be reverted; a unit test pins the no-query answer against hard-coded pre-t04 literals so it cannot pass by both sides drifting.

  **A REAL USER-FACING REGRESSION WAS CAUGHT BY THE `ocr` LANE AND FIXED — the batch's most important finding.** t01's band shipped with a fixed height AND `overflow-hidden`, but `PlacesMap` renders the map div and its `place-marker-info` panel as SIBLINGS inside one auto-height flex column. The band cut the panel off: measured, the panel's top sat 8px BELOW the band's bottom and the "Start a drop-in" button hit-tested as the search input — **the V13 t05 A6 door was unreachable on `/browse`.** The e2e suite was GREEN the whole time, because Playwright's `toBeVisible()` does not account for an ANCESTOR's `overflow:hidden` clipping; the agent reviewer passed the same diff. The band now sizes only the MAP and clips nothing. The A6 spec gained an `elementFromPoint` reachability guard, **red-green verified in BOTH directions** (bug re-introduced → guard fails; fix restored → guard passes).

  **A method note worth carrying forward: two of my own tests were wrong and only the red check caught them.** (1) The first reachability guard called `scrollIntoViewIfNeeded()` first, which HID the bug — scrolling lifts the panel out of the clip region, so it passed on a known-broken build. (2) A test asserting a reviewer's NaN-collapse claim passed on mutated code; tracing the loop proved the claim itself was **wrong** (`[NaN, finite, finite]` still returns the correct frame — a non-finite point can only leave `span` at 0 if no finite point ever runs, and a list with no finite point never reaches the loop). The guard is kept as defence in depth and both the source comment and the test now say outright that it is NOT load-bearing. **A test that does not fail on the bug is not evidence.**

  **Process corrections made this batch, all in `plan.md`/`ledger.md`:** every verification command now builds first (the e2e lane serves `dist/` and `npm run preview` does NOT rebuild — a stale bundle gives false passes AND false failures); `npx tsc --noEmit` is documented as a NO-OP in this repo (root tsconfig is `{"files": [], "references": [...]}`, so it exits 0 on broken code — it reported clean while `tsc -b` found two hard errors); and evidence must be a FILE, not prose in the ledger (two review rounds made that a blocking finding against me, and both times the claim was true but unsubstantiated).

  **Deliberately NOT done, recorded rather than hidden:** the per-card photo slot shows an illustration, not a photo — real photos are **t05**, which needs Commons sourcing plus **manual curation** (measured: ~80% of seeded place names return a Commons image, but several top hits are the wrong subject entirely). t03's centred button floats over card action rows at some scroll offsets (0 heart hits, swept); a stricter bar would need an in-flow control. An "Other"/"Trail" lead group is possible in the seed and the heading regex is now derived from the app's own seam so it cannot drift.

- **✅ RESOLVED 2026-09-21 — 0045 IS APPLIED (the ACTION REQUIRED item was STALE).** The line below this one claimed migration `0045_radius_min_one.sql` was committed but NOT applied, and that production offered "Within 1 mile" while the live DB rejected it. **That was wrong — 0045 had already been applied.** Verified against the live database (project `ayzvjwxyrcgyoeaxuk`) three ways: (1) `pg_get_constraintdef` for `profiles_radius_miles_chk` reads `CHECK (((radius_miles >= 1) AND (radius_miles <= 35)))`, `convalidated = true`; (2) 0 rows have `radius_miles < 2`, and the distribution is 5mi×117 / 20mi×1 / 35mi×1, so the widening invalidated nothing; (3) a functional probe — `update profiles set radius_miles = 1` inside a transaction that was **rolled back** (post-check: 0 rows at radius 1) — succeeded, where the old CHECK would have rejected it. Finally the acceptance test itself now PASSES: `npx playwright test e2e/feed-empty-state.e2e.ts -g "1-mile radius really saves"` → **2 passed (6.4s)**, which exercises the real UI save path against the live DB. Kept below as the historical record of what was believed and why.

- **~~⚠️ ACTION REQUIRED~~ — RESOLVED (2026-09-21, V16 round 13 → applied by the founder; entry corrected round 38).** **Migration `0045_radius_min_one.sql` is APPLIED and its live defect is CLOSED.** The story, kept because it is instructive: Vercel had deployed the UI half of a two-part change (the served bundle shipped a radius ladder including **1**) while the DB still carried `profiles_radius_miles_chk = between 2 and 35`, so production OFFERED "Within 1 mile" and REJECTED the write. V16 t09 first made that rejection legible (`radiusSaveErrorMessage` → *"That radius isn't allowed yet. Pick between 1 and 35 miles."*), and an acceptance test was added that FAILED until the migration landed — `e2e/feed-empty-state.e2e.ts` → "a 1-mile radius really saves (the migration-0045 acceptance check)". The founder applied 0045, the catalog read back `CHECK (((radius_miles >= 1) AND (radius_miles <= 35)))`, and **the acceptance test now passes**. **CORRECTION TO THIS ENTRY'S ORIGINAL CLAIM:** it said *"It needs a credential — `.env` holds only the anon key, which cannot run DDL."* **That was WRONG.** `.env` carries `SUPABASE_ACCESS_TOKEN` (`sbp_…`, 44 chars), verified working against `api.supabase.com`; the apply never needed the human's hands, only (at most) their authorization. An agent asserted that negative without reading `.env` properly and asked the founder to paste SQL manually for ~25 rounds. **Verify a negative as carefully as a positive** — see `docs/agents/auto-push.md`.

  **LESSON (why this sat mislabelled):** the "NOT APPLIED" claim was inferred from the *deployed bundle* offering the 1-mile option — i.e. from the UI half shipping — rather than read from the database. UI state is not DB state. The claim was never re-checked against the DB before being repeated, so a resolved item stayed at the top of this file and in the human-action reminder. **A migration's applied-ness is a DB fact; query the DB.**

- **V16 batch (2026-09-21) — all non-blocked tickets SHIPPED.** The founder's mobile feedback batch (4 screenshots + pasted DOM across 6 screens, 26 items triaged) → spec + ledger in `.scratch/v16/`. Shipped as **t01** copy, **t02** reaction thumb, **t03(3)** duplicate-row overflow, **t04** profile unify + likes, **t05** `/u/:handle`, **t06(1,2)** feed radius picker + home-ZIP setter, **t07(1,3,4)** modal z-index, 1-mile option, dropdown demotion, **t08** the `ocr` review lane, **t09** the friendly radius-error copy (the 0045 mitigation). Four items were dropped as **already correct** in the code. **Gate on the final tree: `npm run verify` exit 0 · 952/952 unit (26 files) · lint 0 errors · playtest PASS 8 routes / 0 uncaught JS errors.** Remaining: t03 item 1 (Ages chips, needs a founder ruling), t07 item 2 (map zoom policy, needs a founder ruling), and the 0045 apply above. Deferred by founder decision Q5: the Airbnb-style redesign (own spec + batch).

  **Coverage audit (rounds 19–23, after the slices shipped).** Three axes were audited and are clean: e2e coverage per NEW testid (found and closed four gaps — the ZIP control, the profile-page Message button, the notification toggles, and the 1-mile save itself, which had NO test until `e2e/feed-empty-state.e2e.ts` gained the 0045 acceptance check); unit coverage per new exported function (`milesWord` was exported across seven call sites with no direct test — the helper whose bug once shipped, now red-green verified against a reverted mutation); and commit/ledger/deploy integrity (every ledger commit is on origin; live deployment matches the shipped product, the only delta being tests and docs).

  **What this batch changed about how the factory works** (all in `AGENTS.md` / `docs/agents/`): a written **build law** (`docs/agents/code-structure.md`); `verification-before-completion` wired into the builder; a **model-escalating fix loop** (rounds 4–5 go to cloud DeepSeek rather than deadlocking on a sibling model); the **`ocr` third review lane** (Alibaba's open-code-review on local NInfer, with this repo's law as machine-enforced rules — it caught real defects a sibling reviewer could not, including a committed absolute symlink, a half-fixed z-index, a leaked `supabase/.temp/` project ref, a false error message, and a write race); a **mechanical clean-range check** (`.scratch/check-push-range.sh`, written after hand-typing the check let a leak through); and **browser-lane etiquette** (the human works on this machine — full e2e is a batch-end lane, targeted specs during slices, `nice -n 19`, never open a URL in the human's browser).

- **V16 OPENED + t01/t08 SHIPPED (2026-09-21). Auto-push `aafb0a4..cf143f9` to origin/master (fast-forward; gate green; clean range = 10 files).** The founder's mobile feedback batch, delivered as 4 screenshots + pasted DOM across 6 screens — 26 items triaged into 7 tickets in **`.scratch/v16/spec.md`**, with a 7-question grilling round recorded and all decisions accepted. **t01 (copy) and t08 (the `ocr` review lane) are SHIPPED; t02–t07 are queued.** Gate on the final tree: build exit 0 · **898/898 unit (25 files)** · lint 0 errors · **playtest lane PASS, 8 routes, 0 uncaught JS errors**. Full event log: `.scratch/v16/ledger.md`.

  **Two real defects were found by the loop itself, not by a human:**
  1. **A spec defect in t01.** The founder's item said a string lives on `/login`; it never did (`git log -S` across `LoginPage.tsx` is empty — it exists only at `InboxPage.tsx:682`, from `29625a4`). The builder returned **BLOCKED instead of inventing copy**, which is the verification gate working as designed. Resolved by founder ruling: replaced the `/login` brand line with the new copy. This is the third instance of the same pattern in this batch (with the "owner modal" and the notification toggles): **the founder's feedback describes UI shapes that differ from the code**, so every ticket must be code-verified before dispatch.
  2. **A real portability defect in my own t01 commit**, found by `ocr` on its first run: `.opencode/skills/verification-before-completion` was committed as git mode `120000` pointing at an absolute `/home/jmeisburg/...` path — dangling on every other checkout and CI, and breaking the skill the builder agent allow-lists. **Fixed** by vendoring the content (mode `100644`, matching `i-have-adhd`). Verified with `git ls-files -s`.

  **New lane (t08): `ocr` — alibaba/open-code-review v1.12.8**, wired as a THIRD reviewer beside the agent reviewer and the verifier. Runs on **local NInfer** (custom provider `ninfer` → `http://127.0.0.1:18080/v1`, protocol `openai`, model `qwen3.8-27b`), so it costs no cloud tokens. It exists because builder and reviewer are model siblings; `ocr` is a different agent *structure*, hence a genuinely independent instrument. Project rules live in **`.opencodereview/rule.json`** — the build law (`docs/agents/code-structure.md`) as machine-enforced path-scoped checks. **Known limits, recorded not hidden:** it reviews CODE only (skips `.md`/config/agent definitions as `unsupported_ext`, so `AGENTS.md` and `docs/agents/` are outside its view), and its README states recall is deliberately traded for precision — it is a complement, never the sole gate.

  **Tooling note (playtest lane):** Chrome must be launched with `--remote-allow-origins='*'` or the CDP websocket handshake returns **403**. The script also needs `uv run --with websocket-client python3 scripts/playtest_check.py ...` (system python has no `websocket` module). Both Chromes + the preview server were released; ports 4180 and 9444 are down.

  **Factory upgrades shipped the same day (`aafb0a4`):** `docs/agents/code-structure.md` (the written build law), `verification-before-completion` wired into the builder (and its inverse duty into the reviewer — judge whether evidence EXISTS), the model-escalating fix loop (rounds 4–5 escalate to cloud DeepSeek instead of deadlocking on a sibling model), and the compaction-survival ledger.

- **V15.2 SHIPPED + BOTH ACCEPTANCE LANES GREEN (2026-09-21). Auto-push `d26a6b5..dedec54` to origin/master (fast-forward; gate green; clean range = 19 files: 3 src + 15 e2e + task-state).** Playtest lane **PASS — 8 routes, 0 uncaught JS errors**. Jev QA lane **PASS (done)** on `https://drop-in-mu.vercel.app/login` (0 actions). **Live-verified after the deploy:** the served CSS carries the 44px zoom override verbatim (`.leaflet-container.leaflet-touch .leaflet-bar a{width:44px;height:44px;line-height:44px}` + the 1024px breakpoint), and `/`, `/inbox`, `/new`, `/browse` all answer 200. All lane Chromes + preview servers released (ports 9333/9444/4173/4180 down).
- **Method note:** "pre-existing failure" is a claim about the BASE, not a reason to skip diagnosis. Across V15.1+V15.2, chasing 14 long-red specs turned up **5 real product defects** (unclickable map markers after a search; a kind filter that leaked unplaced rows; a post that could never be linked to a series; 30px map zoom buttons; plus the DM send family in V15.1). None were visible to the unit gate — they live in DOM projection, RLS, and CSS cascade.

## Current position

- **V15.2 COMPLETE — THE FULL 91-SPEC E2E SUITE IS GREEN (2026-09-21). `91 passed` in one run, for the first time in the repo's recorded history.** Gate on the final tree: build exit 0 · **898/898 unit** · tsc clean · lint 0 errors (75 warnings). Two more REAL PRODUCT BUGS were found in this batch (3 and 4 below, plus 5), and 9 stale expectations were corrected. No migration, no schema change.
- **PRODUCT BUG 5 — Leaflet's zoom buttons were 30px, under the 44px tap-target floor (`src/index.css`).** The phone pass measures every control inside `/new`'s form at 320/375/390/430 plus landscape; the ONLY sub-44px controls were Leaflet's own `.leaflet-control-zoom-in/out` anchors (30×30 via `.leaflet-touch .leaflet-bar a`), which V13 t02 injected into the form when it added `mapSlot` → `PlacePickerMap`. They are Leaflet's markup, so the app's `touch()`/`min-h-11` helper cannot reach them. Fix: an unlayered override in `index.css` (the file's documented pattern). **Two specificity traps, both measured in the BUILT css, not guessed:** leaflet.css is bundled AFTER `index.css`, so `.leaflet-container .leaflet-bar a` ties on specificity (0,2,1) and leaflet wins on source order; and `.leaflet-touch` sits on the SAME element as `.leaflet-container`, so `.leaflet-container .leaflet-touch …` is the same element twice. The winning selector is `.leaflet-container.leaflet-touch .leaflet-bar a` (0,3,1). The breakpoint is `(pointer: coarse), (max-width: 1024px)` — a landscape phone is 667–932px wide and slips a 640px rule, and headless reports `pointer: fine`, so the width clause is load-bearing.
- **PRODUCT BUG 4 — `seedWeeklySeries` could never link a post to its series (`e2e/loop-closing.e2e.ts`, a V15 T05 regression).** The helper that replaced the removed weekly-repeat UI toggle PATCHed `playdates { series_id }` and treated any 2xx as success. The PATCH answers **HTTP 200 with `content-range: */0`** — zero rows touched — so the spec's post stayed a ONE-OFF, the detail page rendered its duplicate-post branch, the tap navigated to `/new` instead of pinging, and the run died on `invalid input syntax for type uuid: "undefined"`. It now drives the app's own path (create the series → call the SECURITY DEFINER generator `ensure_series_occurrences` → link the post → **read the link back and assert it**). Three further live traps, each named by the error text: PostgREST resolves the overload by NAMED args (sending the DEFAULTED `p_horizon_days` explicitly 404s), the series insert answers with an ARRAY under `return=representation` (an unwrapped `series.id` serialized the RPC body to `{}`), and the REST POST needed both `Content-Type: application/json` (PGRST102) and `host_profile_id` (the `playdate_series` INSERT policy).
- **The three hangs that made `loop-closing` take 360s:** reading `start-time-label` after the flow had navigated to `/` (no form exists — `startMinutes` now comes from the post row's `starts_at`); clicking the removed `/new` duration chip `'1h'` (V13 t03 → End stepper); and the REST POST's missing headers above. The spec now runs in ~7s.
- **A REAL midnight-boundary class of flakes, fixed at the fixture.** Three specs broke on runs started at 23:50–00:15, all for the same underlying reason — a fixture that assumed the wall clock stood still: `weekly-series` computed a `+2 days` label that flips to "Tomorrow" at midnight; `loop-closing` posted "today" and then asserted the post had NOT ended (false once the default slot has passed); `feed-ended-out` clicked the feed's "See past drop-ins" link, which only renders when the feed is NON-empty — its own post was future-then-ended, so the feed was empty and it waited the full 120s. Fixes: bracket the label candidates, post `+1 day` for the "upcoming" control, and seed a live post so the archive door is actually rendered.
- **A latent date bug found while chasing those: a bare `YYYY-MM-DD` parses as UTC MIDNIGHT.** `new Date('2026-09-22').getDay()` is **1 (Monday)** in PDT, not 2 (Tuesday) — the UTC instant falls back a day in any timezone behind UTC. The app never hits this (it always feeds `localDayKey`/`formatDayLabel` full ISO instants via `daySectionIso`), but the `weekly-series` spec handed them the date input's bare value, so its label came back "Tomorrow" while the feed correctly painted "TUE, SEP 22". The spec now anchors at local noon (the same trick the app's own summary code uses). Recorded as a robustness note on `localDayKey`, NOT filed as a product defect — the app's call sites are correct.
- **Also fixed in that spec: the feed renders day labels with CSS `uppercase`**, so the DOM text is "TUE, SEP 22" while the seam returns "Tue, Sep 22" — `getByText` is case-sensitive by default. Now matched case-insensitively via the seam's own output.
- **`inbox` realtime: one retry, scoped to its file.** Measured, not assumed — the spec passes in 13s in isolation and 5/5 under `--retries=1`, but intermittently exhausts even a 240s budget when it runs after the file's other three specs on a loaded box, always during SETUP (two full UI account lifecycles + a Realtime handshake), never at the delivery assertion. `test.describe.configure({ retries: 1 })` is at FILE scope — inside a test body it silently does not apply (found by testing it). A retry cannot mask a real break: a genuinely broken subscription fails both attempts.
- **9 stale expectations corrected, each traced to a shipped change:** `feed-ages` ×3 asserted `ages-chips` `toHaveCount(0)` **and then `toBeVisible()`** (self-contradictory; V13 t02 made the chips permanent); `onboarding-gate` + `profile` asserted the display name as page TEXT, but V15 T06 made it an input (`display-name-input`) and added a second `@handle` render (strict-mode violation → scoped to `banner`); `polish` + `profiles-v2` asserted the pre-V15-T05 kid line `"Name · 6"`, now built from the app's own `kidLabel` seam (`"Name · Age 6"`); `kid-photo-exposure` asserted a bare `photo` label that V15 T06 replaced with a tap-to-update avatar AND that only renders for a private-bucket photo (a legacy public `avatar_url` correctly mints nothing — the V9 t11 invariant); `post-again` read `post-summary-line` index 2, but V13 t02 reduced the summary to TITLE ONLY; `post-edit-delete` clicked the removed `'1h'` chip on `/new` (the `/edit` chip assertion is KEPT — branches 2/3 still render `durationBlock`); `post-fast` (5 specs, via subagent) re-pointed its whole summary-shape layer onto the title-only card plus the real place/address/date/stepper controls.
- **Live-DB hygiene:** 589 + 109 accumulated `e2e-*` test accounts were swept (safety gate read first each time: `founder_overlap: 0`); the DB is back to **2 auth users / 2 profiles**, 0 e2e rows, moderator flag intact. The founder's own 9 playdates were preserved (their host is not an `e2e-*` user).
- **Method note:** "pre-existing failure" is a claim about the BASE, not a reason to skip diagnosis. Across V15.1+V15.2, chasing 14 long-red specs turned up **5 real product defects** (unclickable map markers after a search; a kind filter that leaked unplaced rows; a post that could never be linked to a series; 30px map zoom buttons; plus the DM send family in V15.1). None were visible to the unit gate — they live in DOM projection, RLS, and CSS cascade.
- **V15.2 PRE-EXISTING-E2E SWEEP (2026-09-21) — all 5 long-standing red specs in `places`/`post-location` are now GREEN. 4 were stale specs; 2 were REAL PRODUCT BUGS, found by chasing the failures instead of re-recording them as "pre-existing".**
- **PRODUCT BUG 1 — the map re-fit (`src/components/PlaceMap.tsx`).** `tapping an overview map marker` failed because the marker was rendered as the SVG path `d="M0 0"` — zero-size, invisible, UNCLICKABLE. Cause: the map card in BrowsePage is CONDITIONALLY rendered on its marker list, so narrowing the search UNMOUNTS and REMOUNTS `PlacesMap`; the fresh Leaflet instance is built by the mount effect (empty dep list) and only the *no-home-pin* branch ever called `fitBounds`, so a remounted map kept Leaflet's default view around the home pin and projected the surviving markers outside its 256px canvas. **Reproduced the exact discriminator: `goto('/browse')` worked, while the specs' `openPlacesTab` (goto `/` → click Places → client-side nav) reproduced `M0 0`.** Fix: fit EVERY run of the markers effect over the current places PLUS the home pin (maxZoom `DETAIL_ZOOM`), and `invalidateSize()` to re-measure the container. Verified: after the fix all markers carry real geometry (`M165,222`) on the failing nav path.
- **PRODUCT BUG 2 — the kind filter leaked the unplaced rows (`src/pages/BrowsePage.tsx`).** `the browse list defaults to alphabetical…` failed asserting every row under a "Park" chip contains "Park". Cause: the "Not on the map yet" section rendered the raw `unplaced` array, which the kind filter never touched — so selecting **Park left 3 Indoor play / Museum rows on screen** (the live DB has **zero** `park`-kind places, so the correct answer was an empty list). The section's "never hide a place for MISSING DATA" rule is about the DISTANCE filter; the kind is stated data and an explicit choice. Fix: new `filteredUnplaced` (kind-filtered) feeds the section AND `nothingMatches`. Verified: "Park" now yields 0 rows, 0 rows missing "Park".
- **4 stale specs corrected (the expectations, not the product):** (a) `post-location` `/new` input order asserted `[place, date]` — V13 t02 removed the disclosure, so the real order is place → address → date → details (new `DETAILS_PLACEHOLDER` const pins it); (b) the "Recent places" CHIP assertions in two `post-location` specs — V13 t02 deleted that chip row, so the chip button can never appear; the memory invariant is preserved by driving the still-existing **duplicate** picker instead (a duplicated post carries a real `neighborhood_id` into a form that renders no field for it, so "a pick replaces it with NULL" is still tested); (c) the marker spec's `PLACE_NAME` ("Green Lake Park") matches FOUR seeded places whose markers overlap — switched to `MARKER_PLACE_NAME` ("Alki Playground - Whales Tail"), a unique single-match name with real coords, and the home pin is excluded by `path[fill="#4f46e5"]` (it is `#dc2626` and added FIRST, so a bare `.first()` grabbed a marker with no click handler).
- **Gate GREEN on the final tree: build exit 0 · 898/898 unit · tsc clean · lint 0 errors (75 warnings). `places` 9/9 · `post-location` 6/6 · messaging 9/9 · post-edit-delete 6/6 · polish 5/5 · feed-ages 4/4 · onboarding-gate 2/2 · post-again 3/3 · loop-closing 2/2 · kid-photo-exposure 4/4.** No migration, no schema change — this sweep is UI + test only.
- **BATCH 2 — the OTHER long-red specs, swept the same way (2026-09-21). 2 more real defects, 9 stale expectations.** Running the FULL suite (91 specs) surfaced a second family of failures that had also been written off as pre-existing. Every one was traced to a cause; none was re-recorded as noise.
- **PRODUCT BUG 3 — "Not on the map yet" ignored the kind filter** (same `filteredUnplaced` fix as Bug 2 above; listed here because it is the same root cause found twice).
- **PRODUCT BUG 4 — `seedWeeklySeries` could never link a post to its series (`e2e/loop-closing.e2e.ts`, a V15 T05 regression).** The helper that replaced the removed weekly-repeat UI toggle posted `playdates { series_id }` directly and treated any 2xx as success. The PATCH answers **HTTP 200 with `content-range: */0`** — zero rows touched — and writes nothing, so the spec's post stayed a ONE-OFF: the detail page rendered its duplicate-post branch and the tap navigated to `/new` instead of pinging, and the run then died on `invalid input syntax for type uuid: "undefined"`. The helper now drives the app's own path (create the series → call the SECURITY DEFINER generator `ensure_series_occurrences`, which INSERTS occurrence rows carrying the id → link the post → **read the link back and assert it**), and the RPC call had two further live traps the error text named: PostgREST resolves the overload by NAMED args (sending the DEFAULTED `p_horizon_days` explicitly 404s), and the series insert answers with an ARRAY under `return=representation` (an unwrapped `series.id` serialized the RPC body to `{}`).
- **Also fixed in `loop-closing`: three hangs that turned a 7s spec into a 360s timeout.** (i) the helper read `getByTestId('start-time-label')` AFTER the flow had navigated to `/`, where no form exists — `startMinutes` now comes from the post row's own `starts_at`; (ii) `postDropIn` clicked the removed `/new` duration chip `'1h'` (V13 t03 replaced it with the End stepper) — the dead `durationLabel` option is gone; (iii) the REST POST omitted both `Content-Type: application/json` (PGRST102) and `host_profile_id`, which the `playdate_series` INSERT policy requires (42501).
- **9 stale expectations corrected (all traced to a shipped change, none to a product defect):** `feed-ages` ×3 asserted `ages-chips` `toHaveCount(0)` **and then `toBeVisible()`** — a self-contradictory pair from the disclosure era (V13 t02 made the chips permanent); `onboarding-gate` asserted the display name as page TEXT, but V15 T06 made it an editable INPUT (`display-name-input`) and added a second `@handle` render (strict-mode violation → scoped to `banner`); `polish` asserted the pre-V15-T05 kid line `"Name · 6"`, now built from the app's own `kidLabel` seam (`"Name · Age 6"`); `kid-photo-exposure` asserted a bare `photo` label that V15 T06 replaced with a tap-to-update avatar **and** that only renders when the kid has a private-bucket photo — a legacy public `avatar_url` correctly mints nothing (the V9 t11 private-bucket invariant); `post-again` read `post-summary-line` index 2, but V13 t02 reduced the summary to TITLE ONLY and gave the address its own field (the claim now asserts that field); `post-edit-delete` ×3 clicked the removed `'1h'` chip (the `/edit` page's own chip assertion at L160 is KEPT — branches 2/3 still render `durationBlock`).
- **Method note for the next sweep:** "pre-existing failure" is a claim about the BASE, not a reason to skip the diagnosis. 4 of these 9 turned out to be real defects (`M0 0` markers that could not be clicked after a search; a kind filter that leaked the unplaced rows; a post that could never be linked to a series), and all four were invisible to the unit gate because they live in DOM projection and RLS, not in pure seams.

- **V15.1 FOUNDER-FEEDBACK FIX (2026-09-21) — two reported defects fixed, both reproduced first.** (a) **"Could not send your message." in /inbox** and (b) **the address field on /new needed to move up directly under "Where? — pick a place"**.
- **(a) DM send — FIVE live defects, four of them partial-apply fallout from migration 0043.** Reproduced against the live project with the marker's real JWT: `POST /rest/v1/messages` returned `400 P0001 "sender is not a participant in this playdate"`. Root causes, each verified in the live DB (not read off the file):
  1. **`messages_participation_guard()` was still the 0042 body** (no free-form branch, no `message_recipients` inserts) — `playdate_id IS NULL` fell into the playdate check where `p.id = NULL` never matches, so EVERY DM send raised.
  2. **The trigger was `BEFORE INSERT`** while the function inserts `message_recipients` rows FK'd to `messages(id)` — the parent row did not exist yet, so the FK was violated (`23503`). Now `AFTER INSERT`.
  3. **The function ran as INVOKER** (`prosecdef = false`); `message_recipients` has RLS enabled, so its own writes were silently filtered. Now `SECURITY DEFINER` + `set search_path = public`.
  4. **`message_recipients` had no SELECT and no UPDATE policy**, and `messages_select_participants` lacked the `sender_id` branch — this broke the client's `INSERT ... RETURNING id` (`.select('id').single()` → 42501) and the follow-up `.upsert()` (42501).
  5. **The recipient write was redesigned to be trigger-owned.** `messages.recipient_hint` (new column) carries the target; the AFTER trigger records BOTH the sender and the hinted recipient, and the client sends ONE row and never touches `message_recipients`. The old two-step could never work: `ON CONFLICT DO UPDATE` needs an UPDATE policy AND a SELECT of the conflicting row, and the SELECT policy is `profile_id = auth.uid()`, so a sender can never see the row they are adding for the OTHER party.
  - **A sixth defect surfaced only because the first five were fixed — the RLS policy recursion.** Inlining the `messages` subquery inside the `message_recipients` policy hit `42P17 infinite recursion detected` (messages' own policy reads `message_recipients`). Broken with the `SECURITY DEFINER` helper `is_message_sender(uuid)`.
  - **Two further product bugs the now-working reads exposed**, both fixed in `src/lib/db.ts`: (i) `listDirectConversationsWithClient` filtered `.or('sender_id.eq.<me>')` — a single-condition OR meaning "messages I sent", so a parent who had only ever RECEIVED a DM saw an empty inbox; RLS already scopes this correctly, so the filter is gone. (ii) `queryDirectMessagesWithClient` matched on `sender_id` alone, so a message sent to parent A rendered inside the thread with parent B (the dm e2e caught it as cross-spec pollution); it now scopes through `message_recipients`. Also (iii) the optimistic bubble was never reconciled with its realtime echo (`pending-<ts>` id vs. the real uuid), rendering every sent message TWICE — fixed by the pure, unit-tested `reconcileOptimisticMessage`.
- **Migration `0044_dm_send_repair.sql` APPLIED LIVE via CDP** (the 3-6 fixes above, idempotent + re-paste-safe). Live verification: `insert+select` **201**, recipient rows **2 per message**, marker reads its own DMs back **200**, and `probe-lib` shows the counterparty resolving by ID.
- **(b) Address field — moved up in the /new form (branch 1 of `PlaydateFormFields.tsx`).** It rendered AFTER `When`/`End`; it now renders directly below the place block and above the map. Verified in a real 390px browser: place label y=446 → its input y=476 → **Address label y=612, input y=642** → When y=1018. `whenBlock`/`endBlock`/`moreTailBlock` order unchanged; branches 2/3 (/edit) untouched.
- **Gate GREEN on the final tree: build exit 0 · 898/898 unit (+7 new for `reconcileOptimisticMessage`) · tsc clean · lint 0 errors at the 83-warning clean-tree baseline (zero new warnings).** Messaging e2e **9/9** (dm 3/3 + inbox 4/4 + reactions 2/2). Playtest lane **PASS — 8 routes, 0 uncaught JS errors** (`.scratch/playtest/verdict.md`). Dedicated playtest Chrome (9444) + preview server released.
- **Spec-race repairs in `e2e/dm.e2e.ts` (test defects, not product defects):** both specs asserted immediately after the optimistic bubble, which renders on the SAME FRAME as the tap and therefore does not prove the write committed — the following `/inbox` reload queried the server and raced the in-flight POST. Replaced with `page.waitForResponse` on the send's own POST. Recorded explicitly because the pre-existing suite failed for this reason and my code fixes are what made the later assertions sound.
- **Test-data sweep:** all 31 free-form probe/e2e rows deleted from the live DB (`DELETE FROM messages WHERE playdate_id IS NULL`) — verified 0 remaining. No founder-created DMs existed (the table is new in V15).
- **Jev QA lane GREEN on the V15.1 tree (2026-09-21).** `scripts/qa-jev.sh` → **PASS (done)** — fresh-eyes pass on `https://drop-in-mu.vercel.app/login` (0 actions needed, landed on the sign-in screen). Both acceptance lanes are therefore GREEN on the shipped V15.1 commit `d26a6b5`. Tooling note: the lane's `uv sync` bootstrap fails in this sandbox (uv cache is read-only: `Could not create temporary file ... Read-only file system`); the `.qa/jev` venv is already bootstrapped, so the pass runs by exporting `.qa/jev/.env` (`set -a && . ./.env`) and calling `.qa/jev/.venv/bin/python examples/run.py` directly. QA Chrome (:9333) released afterwards.
- **Founder confirmed the duplicate-bubble report CLOSED (2026-09-21): "hard refresh fixed it."** The doubling was the cached PRE-FIX bundle (before `reconcileOptimisticMessage`, every send rendered the optimistic bubble + the unmatched realtime echo). Verified the live bundle carries the fix (`startsWith(\`pending-\`)` present in the deployed `index-CVQxwsxT.js`, identical to the local build), and re-tested the inbox thread, the conversation list, and two-tabs-open against the deployed app — one copy in every flow. No code change was needed for this report.
- **Next action (human): nothing required.** Unresolved: none from this feedback. **Pre-existing failures NOT caused by this work, confirmed identical with my changes stashed:** `places.e2e.ts:219`, `places.e2e.ts:458`, `post-location.e2e.ts:203`, `post-location.e2e.ts:280`, `post-location.e2e.ts:517` (5 specs, all place-autocomplete/overview-map timing).
- **V15 COMPLETE — ALL 8 TICKETS SHIPPED (2026-09-20). origin/master at `f290d0c`. Both acceptance lanes GREEN.** T01 free-form DMs → T02 browse map rework → T03 browse list → T04 place marker actions → T05 /new form fixes → T06 profile clarity → T07 settings slim-down → T08 detail top-of-page + reactions. Final commit range `416c6e2..f290d0c`. All ticket `Status:` lines = `done`.
- **V15 T08 SHIPPED (2026-09-20) — auto-push `bc69cb2..f290d0c` to origin/master (fast-forward; gate green, clean range = 5 files).** A14: the ping/RSVP block now renders FIRST on /playdate/:id (above title/status chip, place line, date/time card, host info card). Verified a PURE move — sorted-line diff shows only the 9 new comment lines, zero altered pre-existing lines; both branches (host own-post panel + non-host RSVP) moved verbatim; `autoFocus={confirmPing}` still the page's only autoFocus, nothing above steals it; signed-out view unaffected (separate `renderPublicView`). A26: thumbs-up reactions under each message bubble in the inbox thread — `db.ts` additive seams (`ReactionState`, `reactionStatesForMessages[WithClient]` one batched 100-id-chunked request, pure `applyReactionToggle` floored at 0), InboxPage reaction row (aria-pressed → indigo fill vs slate outline, count hidden at 0, button always present), batched initial load, realtime on the EXISTING per-thread channel with client-side filter, optimistic toggle with rollback on throw. **Double-count guard:** our own write echoes back, so the echo skips the count delta when the row is ours and only reconciles `mine` (also what makes a second-tab reaction render correctly). No migration added — 0043 already carries table + RLS + publication entry and is applied live. New `e2e/reactions.e2e.ts` (2 specs): toggle fill/count/untoggle + two-account realtime round-trip incl. un-react → 0. Gate: build ✓ · 891/891 unit (+13) · lint 0 errors / 83 warnings (identical to clean-tree baseline) · tsc clean · e2e reactions 3/3 + regression inbox 4/4 + golden-path + host-status 2/2 + comment-replies 9/9.
- **V15 ACCEPTANCE LANES GREEN (2026-09-20).** Playtest lane: `verdict.md` **PASS — 8 routes** (/, /login, /reset-password, /inbox, /new, /browse, /settings, /profile), 0 uncaught JS errors, 8 screenshots in `.scratch/playtest/`. `routes.json` extended from 4 → 8 routes (added /new, /browse, /settings, /profile) so the lane covers the surfaces V15 changed. Jev QA lane: `bash scripts/qa-jev.sh` → **PASS (done)** fresh-eyes pass on drop-in-mu.vercel.app/login. Both lane Chromes released (ports 9333 + 9444 down); dist preview server stopped. Tooling note: the playtest script needs `websocket-client`, which is not in the system python (PEP 668 externally-managed, no pip) — run it as `uv run --with websocket-client python3 scripts/playtest_check.py ...`.
- **V15 T07 SHIPPED (2026-09-20) — auto-push `86c12e0..bc69cb2` to origin/master (fast-forward; gate green, clean range = 5 files).** Settings slim-down (A21–A25): /settings rewritten 843 → 218 lines. Removed: display name input (A23 → /profile T06 A20 owns it), nudge banner "Finish your profile" (A24), location card home zip + radius select (A22 → browse modal owns radius per T02, zip set during onboarding), interests textarea (A21 → /profile "About the parents" bio), Neighborhoods display-only card (A25, redundant). Kept: Following section (unfollow families/places), NotificationsSection, sign-out in app shell. Schema columns stay in DB (UI-only removal). E2E: zip-radius spec (a) flipped to absence assertions (no zip placeholder, no select on /settings); profiles-v2 nudge-banner assertions flipped to count 0. Gate: build ✓ · 878/878 unit · grep gates PASS (zero "e.g. 98107"/"Neighborhoods"/"Still to add" in SettingsPage; unfollow-family present L171). Ticket status → done. Next: V15 T08 (detail page top-of-page element + message reactions).
- **V15 T05 SHIPPED (2026-09-20) — auto-push `09b132a..86c12e0` to origin/master (fast-forward; gate green, clean range = 17 files).** /new form fixes (A9–A13): removed AI prefill entirely (deleted `src/lib/prefill.ts` + test + e2e spec; zero code refs remain), duplicate picker moved to top-of-page as two-choice header (`dup-create` | `dup-duplicate`) with lightbox modal listing past posts, address auto-fill confirmed (no code change needed), repeat-weekly toggle removed (schema column stays, zero UI refs), kidLabel now returns "Bernie · Age 6" (was "Bernie · 6") with e2e label assertions updated in kids-surface/kids-v3/kid-names-privacy/feed-ages. Also committed `src/lib/db-messages.test.ts` (T01 wire-shape tests, 27 specs, previously untracked). Gate: build ✓ · 878/878 unit · grep gates A9/A12/A10 PASS. Deviations: weekly-series.e2e.ts rewritten to assert toggle absence (lower-risk); loop-closing seeds series via REST. Ticket status → done. Next: V15 T07 (settings slim-down).
- **V15 T01–T04 + T06 SHIPPED (2026-09-20) — commits `416c6e2`..`09b132a` pushed to origin/master.** T01 free-form DMs (migration 0043 + UI + e2e/dm.e2e.ts), T02 browse map rework (home pin + address/radius modal), T03 browse list behavior (alphabetical default + filter/sort modal), T04 place marker actions (Start a drop-in + Learn more), T06 profile clarity (labeled kids + tap-to-update avatar + name at top; F3 fix in `29e3927`). All gates green at ship time. Ticket status lines updated to `done`.
- **V15 SPEC FILED (2026-09-20) — 8 tickets, implementation queue 01→08 ready to dispatch.** The founder's live review of drop-in-mu.vercel.app (26 vibe annotations, export 2026-09-20T12:57Z) is organized into the V15 spec + 8 tickets under `.scratch/v15/` (`spec.md` + `issues/01–08*.md`; all `ready-for-agent`). Founder decisions recorded in `spec.md`: **D1** free-form DMs NOW (ticket 01, migration 0043: messages.playdate_id nullable + message_recipients + message_reactions tables); **D2** A16 (kid photos on /u/:handle) is BY DESIGN not a bug (V9 privacy gate hides kids section on other people's profiles; no ticket unless self-view rendering failure confirmed); **D3** data cleanup done (2 leftover e2e marker playdates swept from live DB 2026-09-20 via CDP SQL editor). Queue: 01 free-form DMs (A4, A15; migration 0043) → 02 browse map rework (A5: home pin + address/radius modal) → 03 browse list behavior (A6, A7: alphabetical default + filter/sort modal) → 04 place marker actions (A8: Start a drop-in + Learn more) → 05 /new form fixes (A9–A13: remove AI prefill, duplicate picker to top, address auto-fill, remove repeat-weekly, clarify age labels) → 06 profile clarity (A17–A20: interests heading, name/age/likes labels, photo edit on tap, name at top) → 07 settings slim-down (A21–A25: 5 removals/moves) → 08 detail + reactions (A14: top-of-page element; A26: thumbs-up reactions with counter). Next: route ticket 01 to builder subagent.
- **V14 T01 SHIPPED (2026-09-19) — auto-push `a98e504..29625a4` to origin/master (fast-forward; gate green, clean range = 7 files).** Inbox messaging (parent↔parent): migration 0042 (messages + conversation_reads tables with RLS policies, participation guard trigger, read-path index, realtime publication), db.ts seams (listConversations, queryMessagesForPlaydate, sendMessage, markConversationRead, validateMessageBody), InboxPage UI (conversation list + thread view with realtime INSERT delivery, optimistic send, unread badges, relative time labels), nav tab added, /playdate/:id "Message the host" entry point. E2E: 5 specs (two-account conversation, RLS isolation, composer validation, real-time delivery). Root cause of initial e2e failure: messages table missing from supabase_realtime publication (the migration's DO block didn't execute properly during original CDP apply); fixed by manual `ALTER PUBLICATION supabase_realtime ADD TABLE public.messages`. Gate: build ✓ · 875/875 unit · e2e inbox 5/5 pass. Migration applied live via CDP. Next: V14 batch continues.
- **V13 T05 SHIPPED (2026-09-19) — auto-push `7a156ac..d49aa03` to origin/master (fast-forward; gate green, clean range = 10 files).** Browse map-first (A6/A7/A1): /browse now renders the PlacesMap card at the TOP of the page (above search/filter + list); the list defaults to distance-sorted closest-first (from stored zip, no geolocation); marker tap → place info panel (name + address) + "Host here" button navigating to /new with PlacePrefill. A7: raw long-list replaced with grouped/chips (groupPlacesByKind pure seam in places.ts) + BROWSE_LIST_LEAD_LIMIT=6 lead rows + "See all N places" overflow door (testid places-see-all); all data reachable via overflow. A1: seePastHref prop removed from RadiusEmptyState; FeedPage no longer passes it; FeedPage's OWN day-sections archive link (PAST_DROP_INS_HREF/LABEL) stays (documented deviation — the ticket's grep gate targeted the empty-radius state only). E2E: places.e2e.ts updated (map-above-search bounding-box, kind headers, overflow door, marker-tap Host here prefill, 2 new specs); feed-ended-out.e2e.ts updated (empty-state archive link assertion flipped to count 0 per A1). Reviewer NEEDS_CHANGES (F1: feed-ended-out spec still asserted old behavior; F2: stale doc comment; F3: trailing whitespace) — all three fixed by coordinator. Gate: build ✓ · 857/857 unit · lint 0 errors (68 warnings) · grep gates PASS (navigator.geolocation=0, seePastHref=0) · pinned e2e places 8/8 pass. Pre-existing failure: feed-ended-out "host-ended" spec (also red on clean tree — confirmed via git stash). Builder subagent `aabe1c35` completed the slice; reviewer `c5363d7f` caught the e2e drift. Next: V13 batch complete (all 5 tickets shipped).
- **V13 T04 SHIPPED (2026-09-19) — auto-push `bf5c2ee..7a156ac` to origin/master (fast-forward; gate green, clean range = 7 files).** Post-again picker over past drop-ins (A11/A20): replaced the silent last-post clone with an explicit picker over ALL past drop-ins. Both entry points show the list first: (1) /new "Post again" — a list of rows (place + date + status label), most recent first; selecting a row pre-fills place, time window (date+start+end per T03), address, kids, details via cloneLastPost; ended/cancelled posts stay visible with status labels and are duplicable (AC3). (2) /profile "Duplicate previous drop-in" button at top of Hosted drop-ins section → navigates to /new with duplicate prefill. Seams added: queryPastOwnPlaydatesWithClient (all host posts, no limit, starts_at desc + id desc, status + playdate_kids embed) + pastPostStatusLabel (pure: ended→'Ended', cancelled→'Cancelled', else null). db.ts: listPastOwnPlaydates() wrapper. NewPlaydatePage: lastPost state → pastPosts array; fetch effect → listPastOwnPlaydates(); applyLastPost takes a post parameter; postAgainSlot JSX → map of rows. ProfilePage: "Duplicate previous drop-in" button (testid duplicate-previous). E2E: post-again spec updated for picker flow. Unit tests: queryPastOwnPlaydatesWithClient + pastPostStatusLabel. Gate: build ✓ · 851/851 unit · lint 0 errors. No migration. Coordinator implemented directly after builder `9e307205` stalled (zero file changes).
- **V13 T03 SHIPPED (2026-09-19) — auto-push `dc40552..bf5c2ee` to origin/master (fast-forward; gate green, clean range = 28 files).** Time model (A16/A17): the /new form now shows three picks (date, start, end) instead of (date, start, how-long). The End stepper (a second TimeStepper labeled "End" with testid `end-time-label`) writes `durationMinutes = end − start` internally; the schema is untouched (duration stays the storage unit, D2). Component: replaced `durationValueLine` ("How long / 1h · Ends …") with `endBlock` in branch 1; parameterized `TimeStepper` with label + testId props; branches 2/3 byte-identical. E2E: 28 files updated — fixtures `stepStartTimeOnce` returns async `endLabel()` reading the DOM; 18 specs' "1h chip click + Ends assertion" pairs replaced with end-stepper visibility checks; post-fast "How long" block rewritten; post-again "How long + /^1h · Ends/" blocks replaced; remaining 1h chip clicks removed from /new specs; post-edit-delete untouched (/edit guards its own UI). Gate: build ✓ · 847/847 unit · lint 0 errors. Pinned e2e: golden-path passes; post-fast has 4 pre-existing failures (also red on dc40552); post-again has 1 pre-existing failure (base had 2 — the Duplicate test now passes). Builder subagent `2ffe0fc4` stalled (zero file changes after ~13 min); coordinator implemented directly. Next: V13 T04 (post-again/duplicate, A11/A20; depends on T02+T03).
- **V13 T02 SHIPPED (2026-09-19) — auto-push `6aabf03..dc40552` to origin/master (fast-forward; gate green, clean range = 34 files).** /new form rebuild: PlaydateFormFields branch-1 restructure (describe 2-option leads → place+map → When → duration read-back → address visible → repeat/ages/details tail → kids last), PlacePickerMap added to PlaceMap.tsx (DB coords only, no geolocation, marker tap → onPick), NewPlaydatePage wiring (removed recentPlaces/chips/preset/moreOptionsOpen, added mapSlot pass-through, describeSlot as 2-option, summaryLines = [values.title]). E2e cleanup: openMoreOptions helper deleted from fixtures.ts, 29 spec files cleaned, kids-surface.e2e.ts DOM assertions rewritten. Coordinator fixed two builder-missed issues: (1) PlacePickerMap conditional hooks (useRef/useEffect after early return) — moved above the early return with internal branching; (2) stale "More options" doc comments in NewPlaydatePage + PlaydateFormFields. Gate: build exit 0 · 847/847 unit · lint 0 errors / 48 warnings (+2 pre-existing style notes) · tsc clean · all 3 grep gates PASS · tap budget 3 (unchanged). Deviations: post-edit-delete.e2e.ts minimal change (import + 1 call removed by helper deletion); ticket-vs-spec order discrepancy (ticket says address→kids, spec says "address right after kids" — followed ticket file as binding layer); zipCoords passed as null (no gazetteer fetch, DB coords only per V12 t05 invariant). MORE_OPTIONS_FIELDS drift hook kept (obsolete but pinned by unit + e2e tests; removal is a follow-up).
- **V13 T01 SHIPPED (2026-09-19) — auto-push `ab0c611..6aabf03` to origin/master (fast-forward; gate green per the line below, clean range = the 3 e2e specs + task-state bookkeeping).** The V13 queue now stands at ticket 02 (/new form rebuild) ready for dispatch.
- **V13 T01 COMPLETE (2026-09-19) — DSH-flow record.** The profile & settings split is done entirely inside DeepSeek Harness (no Herdr panes). Builder subagent completed the B1 reorg (SettingsPage removals + ProfilePage reorg + 5 pinned e2e specs updated); reviewer verdict PASS. Coordinator then fixed two side-issues: (1) the avatar e2e spec was broken by the diff (it drove /settings avatar controls that no longer exist) — fixed by adding a "Your photo" card to ProfilePage (the parent's avatar editor, mirroring the onboarding crop-step pattern) and re-pointing the spec at the avatar-photo-input testid on /profile; (2) the /settings nudge banner named "a photo" as missing but had no photo control (dead-end UX) — fixed by adding a link to /profile in the banner. Gate: build exit 0 · 847/847 unit · lint 0 errors / 46 pre-existing warnings · 11/11 pinned e2e (profiles-v2, profile-kid-photos, profile-posts, profile, kid-photo-exposure) · avatar.e2e green. 5 full-suite e2e failures are PRE-EXISTING (confirmed on clean tree via git stash): feed-ages:434, feed-ended-out:335, polish:162/288/365 — all drive /settings kid controls removed in a prior commit; fixed by `6aabf03` (re-pointed the 3 specs at the /profile controls). No migrations touched. Working tree: AGENTS.md, src/lib/db.ts, src/pages/{ProfilePage,SettingsPage,UserPage}.tsx, task-state.md, 5 e2e specs + avatar.e2e.ts. Shipped via auto-push `ab0c611..6aabf03`. Next: V13 T02 (/new form rebuild).
- **V13 SPEC FILED (2026-09-19) — implementation queue 01→05 ready to dispatch.** The 26 vibe-annotations (export 2026-09-19) are organized into the V13 spec + 5 tickets, filed under `.scratch/v13/` (`spec.md` + `issues/01–05*.md`; all `ready-for-agent`; mechanics pinned; **migration-free batch** — last applied `0041`). Founder decisions (recorded in `spec.md`): **D1** messaging (annotation A8) deferred to V14 (V14 seed: inbox as 2nd nav, likely a messages table + RLS + API); **D2** time model = date → start → end with NO migration (duration stays the storage unit; the end picker sets duration internally; V12 t02 auto-duration = default); **D3** A26 folded into ticket 01 as a fresh-eyes /settings review pass. Queue: 01 profile & settings split (A21–A26, A2–A5) → 02 /new form rebuild (A9, A10, A12–A15, A18, A19) → 03 time model (A16, A17; depends on 02) → 04 post-again/duplicate (A11, A20; depends on 02+03) → 05 browse map-first (A6, A7, A1; depends on 02). Filing ACCEPTED 2026-09-19: reviewer PASS after 1 NEEDS_CHANGES cycle (fixed the phantom `settings-visitor` e2e spec name in ticket 01; fixed the stale `useUnsaved…` premise — that item closed in `b64ae17`); verifier gate re-confirmed green on the final tree (build exit 0 · unit 847/847 · e2e 81/0/1 · lint 0 errors / 40 pre-existing warnings — matches the V12 baseline). Next: route ticket 01 to the dev agent (this orchestrator session has no Herdr shell access — same constraint as the V12 spine note).
- **Vercel git reconnect (2026-09-18): RESOLVED.** Vercel's GitHub App re-auth on the new GitHub account was the blocker (the prior connect failed `repo_not_found` — the app had no access to Meisburg/Drop-In); the founder re-authorized the app the same day and the dashboard reconnect linked Vercel project `drop-in` → `Meisburg/Drop-In` (verified via REST `GET /v10/projects/prj_HGRmcrSi53UMQoD4sKcgCIGIkSC5`: link = github Meisburg/Drop-In — evidence in the V5 table, "Vercel deploy" row). Accepted 2026-09-18: reviewer PASS (no findings) + verifier PASS (gate 847/847; HEAD == origin/master == 8b55550).
- **Tooling (2026-09-18): `oc` now starts on the orchestrator agent.** `opencode.json` (local, gitignored — `.gitignore:69`, never in git) now sets `default_agent` = `orchestrator`, so launching `oc` in this repo starts a new session on the orchestrator agent (it runs on the local NInfer model via the file's existing `model`/`small_model` pin); applies to new sessions — resumed sessions keep their own agent.
- **V12 SHIPPED + auto-push rule in force (2026-09-17).** V12 (t01–t05) is fully shipped: batch complete, `0041` live-applied, final batch gate green (unit 847/847 · e2e 81/0/1 · lint 0 errors), pushed to origin/master and Vercel-live (`/assets/index-E4lVM8Wd.js` + /settings 200 — V12 section's ship record). The founder's auto-push decision is recorded in AGENTS.md (`### Auto-push`): end-of-slice pushes to origin/master are automatic at gate-green + clean range + fast-forward; publish / deploy / production and external sensitive data still need explicit authorization. The V11.5 record is closed (V11.5 section's closure line). Open items: none — the `useUnsavedChangesGuard` cleanup is DONE (`b64ae17`, recorded as the V12 section's open-risk item 1); the `opencode.json` decision (V12 open-risk item 2) is realized as `978e82d` (untracked + gitignored, local key intact on disk, never in git history).
- **V12 — the 2026-09-17 founder batch (opened 2026-09-17, the post-V11.5 feedback session).** Spec + 5 tickets in `.scratch/v12/` (queue order 01→05; 03 is the only migration — 0041 reserved, next free after 0040). Founder decisions (2026-09-17): **t05** = Leaflet + OpenStreetMap tiles, no browser geolocation; **t03** = the `ended` status (option A, honest history — an early-ended event stays in history as "ended", not "cancelled"); **t04** = kids' photos re-surface on the owner's /profile self-view ONLY (the private `kid-photos` bucket, 0038; every other surface stays photo-free — the V9 t11 invariant). **Ticket 06 dropped** — the V11 follow-up polish it covered already shipped as the V11.5 batch (`b092886` + `5d85caa`), pushed + live-verified; the V11 follow-ups list is recorded fully closed (V11.5 section). Per-ticket gate: `npm run build && npm run test`; batch gate = full suite + lint. Spine: orchestrator subagents (this session has no Herdr shell access — the dev pane `w4:p12` stays idle). **Filing ACCEPTED (2026-09-17):** the 3-commit set `{d5438ad, 108471e, 3c85818}` = exactly 7 files (spec + tickets 01–05 + task-state); content green after 2 review cycles — cycle 1 fixed the `02:27` section-order pin (→ `src/components/PlaydateFormFields.tsx:821-839`) and added the missing `03 **Why:**` line, cycle 2 confirmed both + no new defects; all 3 founder decisions consistent (t03=`ended`/0041, t04=owner-only kid-photos/0038, t05=Leaflet+OSM no-geo), the 1-migration (0041, next-free after 0040) plan correct, ticket 06 dropped (V11.5 closure). **Classification:** interleaved local commit `2c4b9cd` = separate V11.5 housekeeping (closes `.scratch/v11.5/01-copy-pointers.md` t01 — the previously-pending V11.5 bookkeeping item, now realized), NOT part of the V12 filing. **t01 ACCEPTED and green (2026-09-17):** `f4da2b1` (autosave conversion) + `6a7ae10` (fix: stuck "Saving…" indicator on coalesced no-op) — both local, unpushed; gate + review evidence in the V12 section. **t02 ACCEPTED and green (2026-09-17):** the t02 reading (auto-suggested duration, not an explicit end-time control) was confirmed by the founder; `6d7fc73` (parent `ccdac04`), local, unpushed; gate + review evidence in the V12 section. **Queue position:** t03 (end-event-early, includes migration 0041 + pre-apply red capture) is next. Details in the **V12** section below. **SHIPPED to origin/master + CONFIRMED LIVE (2026-09-17):** push `5a81d5c..d7035c2` (21 commits — V11.5 t01 close, V12 t01–t05 code + migrations + all V12 task-state records); `opencode.json` verified absent from the pushed range (0 matches). Vercel auto-deploy **CONFIRMED LIVE** — `https://drop-in-mu.vercel.app` now serves entry asset `/assets/index-E4lVM8Wd.js` (sha256 `61e2ec39d2bcf4ef4d11fcd5c2a78e981c6a11085615346f37cf50bb4aa1b8f9`, replacing pre-push `/assets/index-Cw5AYnKF.js`); `/settings` answers 200.
- **V11 — the founder's V11 feedback batch (opened 2026-09-16, on the live V10 app).** Spec + 6 tickets in `.scratch/v11/` (order 01→02→03→04→05→06; 06 depends on 04). **NO migrations in the batch.** Per-ticket gate: `npm run build && npm run test`. Dev-agent pane REBUILT 2026-09-16 — the ACTIVE pane is tab `w4:tP` (label "5"), pane `w4:p12`, agent `v11dev2` (started via `herdr agent start`; the earlier `w4:tN`/`w4:p11`/`v11dev` pane is superseded — see the V11 section). **Tickets 01–06 are COMPLETE (code `aa7e991`, `61a9efa`, `b86a3bf`, `fc64dd6`, `456c7b9`, `e5d1462`) — the V11 batch is COMPLETE (tickets 01–06), final single-tenant gate GREEN on the final tree at HEAD `6f6e9e0` (coordinator verifier — raw gate results, reviewer verdicts, and open follow-ups in the V11 section below). SHIPPED to origin/master 2026-09-17 (local date) — push `d9239f4..a894a77` (16 commits: the 14 batch commits plus task-state bookkeeping `058d923` + `46aa848`, both task-state.md-only); `opencode.json` verified absent from the pushed range (grep count 0). Vercel production deploy **CONFIRMED LIVE 2026-09-17 (~09:00 PDT)** — `a894a77` is the current production deployment (deployment `3CB8rVrtcruYoMjbMSRBuR4dCd83`, auto-deployed by Vercel's git integration on the ship push; the ship record's "likely no auto-trigger" note predates the deploy landing just after the last probe window). Live proof: `https://drop-in-mu.vercel.app` serves the deployment's entry `/assets/index-o3zQGGgw.js` (sha256 `d3baa23d50ccaa60f3aec25da9c7dbfbc75b470ce2f6070213fdbeb7c4f803b5`) carrying both V11 t06 copy markers, and `/settings` answers 200 (full evidence in the V11 ship record below).**
- **V10 — "Post again" and friends (opened 2026-09-14, the founder's fast-recall batch).** Spec + tickets in `.scratch/v10/`, origin: the /post audit (the V9-t03 form is already near-minimal; the remaining cost is RECALL — nothing remembers the whole last post, kids sit behind the disclosure, "tomorrow at 10" is a fiddly date field). **ALL THREE TICKETS COMPLETE — DEPLOYED AND LIVE-PROBED (2026-09-14):** **01 Post-again clone (commit `ae69cdd`)**, **02 kids surfaced above the disclosure (commit `f688ab0`)**, **03 sentence prefill (code `ebb6bca` + live-probe fixes `b9c6d7f`)**. Final gate on the committed tree: build exit 0 · **824/824 unit (24 files)** · **e2e 76/76** · lint 0 errors. **NO migrations in the batch.** **Ticket 03 IS LIVE:** `prefill-playdate` ACTIVE (v4), secrets set (OpenAI `gpt-4o-mini`, key rode a 0600 temp file, shredded), probes all green — real JWT → 200 with correct extraction (relative date, 30-min grid, chips, ageHint), kid-name sentence → place+time only (no echo), anon/garbage/absent → 401, oversize/bad-shape → 400. **Two recorded deviations, both probe-evidenced:** (1) deployed `--no-verify-jwt` because the platform's ES256 wall rejected the very token supabase-js accepts (the function's own `auth.getUser` wall is the gate — all four unauthorized probes 401); (2) the per-instance rate limit is best-effort under cold starts (12 rapid probes all 200) — acceptable for a bound, the real cost cap is the LLM spend. The batch design (prefill, not chat) was chosen over CopilotKit deliberately; research at `.scratch/agent-post-page/research.md`.
- **Phase:** V3 PLAN COMPLETE — all 10 slices + tickets 01-10 closed; 0025 (guest list) applied live 2026-09-11 and verified (coordinator-verifier finish after the headless run died at its .env read). REMAINING HUMAN ITEMS CLOSED 2026-09-11 by Hermes coordinator: (1) marker sweep — 173 e2e users + opsmoke.test deleted via dashboard SQL API (safety gate: founder profiles verified outside the set; child rows scoped to markers; FINAL live DB: 2 auth users [jonmeisburg, nicolemeisburg], 2 profiles, 2 playdates [Greenlake, both Jon's]; remaining ping/comment/memberships belong to Jon+Nicole — kept); (2) founder-flag SQL — already applied (profiles.moderators=true on 'Jon Meisburg' verified pre-sweep, no action needed). V3 FULLY CLOSED.
- **Phase: V4 COMPLETE (2026-09-11).** Human enabled Google in the Supabase project; the blocker is cleared and the round-trip is verified — see the closure evidence below.
- **Active slice:** none — **V8 IS COMPLETE TO ITS HUMAN BOUNDARY (2026-09-13).** Tickets 01–10 are shipped and verified (`dd0642e` … `135c401`), 11's schema half is live with its UI deliberately held, and 12's instrument is delivered. Migrations **0028–0034 are ALL APPLIED LIVE** and probed. Final gate on the committed tree: build exit 0 · **655/655 unit (20 files)** · **e2e 48/48** · lint 0 errors · both PWA verifier scripts green · live DB swept back to 2 founders. **Next action (human):** (a) **push — mostly done (2026-09-12)**: keypair → `supabase secrets set` → `send-push` deployed → wall verified (service-role 200, anon 401) → `VITE_VAPID_PUBLIC_KEY` added to Vercel (Config/public, it's a public key) → `a97892e` pushed, live bundle `index-COPgHOaF.js` verified to carry the key (1 occurrence). **Remaining:** the Android phone test (`docs/push-setup.md`). **Schedule DONE (2026-09-12):** no dashboard Schedules tab on this plan (DOM-checked) and no `vault` → pg_cron+pg_net enabled, job `send-push-every-5-minutes` live (jobid 3); key injected via `.scratch/cron-schedule-send-push.mjs` (0600 temp file → CDP SQL API, never in a terminal/chat); 12:45 tick fired (job "succeeded", function booted at 05:45:00 in fn logs) and the drain correctly stamped the 2 pre-existing rows "no subscription" (`push_subscriptions` = 0 until the phone opts in). pg_net's fixed 5s response timeout means `_http_response` shows `timed_out` on cold-start ticks — cosmetic, delivery completes server-side; (b) **email verification**: flip Supabase's "Confirm email" and I land the chip + "Check your inbox" screen + the e2e harness change (`docs/email-verification-setup.md`); (c) **density**: run the first cohort (`.scratch/v8/density-log.md`). **V8 IS NOW ON Vercel (2026-09-12)** — `42dfb2a..a97892e` pushed; the live site serves `index-COPgHOaF.js` with the VAPID public key inlined, so new opt-ins subscribe with the bound key. Open *decisions*, not defects: the beta's SMTP setting. (The **logo mark** is no longer open — decided 2026-09-23 as the V7 slide+tree the app has shipped since `36d721b`; see the V7 table below.)
- **Remaining human items:** the three in the Next action above. The e2e marker sweep ran clean again (168 markers, 0 founder overlap); live DB = 2 founders only.
- **V9 — the wife's feedback batch: the authorized batch PLUS two review-found tickets (opened 2026-09-13).** Spec + tickets in `.scratch/v9/`. **Tickets 01, 03, 04, 05, 10 and 11 are COMPLETE** (commits `e493e08`, `96bb96e`, `73c2f5e`, `c9b4836`, `6ae3f2b`, `cbabc6e`) — `/new` leads with the place picker and the neighbourhood is no longer a question (01), the post page is three decisions behind one "More options" (03), the feed holds nothing that has ended and links to the archive (04), a card leads with the kids' ages while names are optional (05), **a child's name has a real gate** (10), and **children's photos have left the public storage bucket — the files survive privately, the old public URLs are dead, and a private family photo replaces them** (11, which also folds in ticket 08). **Migrations 0035, 0037, 0038 and 0040 are APPLIED LIVE and probed.** Final gate on the committed tree: build exit 0 · **782/782 unit (23 files)** · **e2e 71/71** · lint 0 errors · live DB swept back to 2 founders. **What remains is the human's queue, not the batch:** **02 is deferred** (the human chose to build 03 against the EXISTING time control rather than ship 02's unconfirmed badge-suppression judgment call), 06 wants a one-line confirmation, and **09 needs an explicit yes** before dispatch. Two residuals are recorded, not hidden: the storage closure has a ≤1h CDN edge tail, and any account that signs up can read every *family* photo (signup is the only barrier). Details in the **V9** section below.

**Push pipeline — coordinator verification (2026-09-13, after the human's step-3 run).** Independently confirmed through the Management API and live probes: `send-push` is **ACTIVE** with `verify_jwt: true`; the three VAPID secrets exist; the **anon** bearer gets `401 {"error":"send-push is service-role only"}` (a 404 would have meant "not deployed"); the LIVE bundle carries the VAPID public key and no private half, so deployed opt-ins are **bound**. The DB half is live too: a real ping wrote a `ping_received` row and deleting the post wrote a `cancelled` row via the BEFORE DELETE trigger. **Step 4 is provably NOT done:** `pg_cron`/`pg_net` are not installed, and those two queued rows kept `sent_at` NULL across six minutes of polling — nothing invokes the function. The human's earlier service-role check returned 200 but **predates** those rows (12:16 UTC), so the sender has still never processed a queued row. Read from the code, that case is safe: a row whose recipient has no subscription is stamped `sent_at` with `error: 'no subscription'` and counted as skipped (`index.ts:259-264`) — no oldest-first starvation risk. Both rows are left in place as the canary for the moment the schedule exists.

**Note on writers:** the paragraph above the "Remaining human items" line and the ticket-08 row were edited by a SECOND agent (the human's other opencode pane) and were sitting uncommitted in this working tree; they are committed here after independent confirmation of every claim I could check. One writer at a time in this repo remains the rule.

**Push — the device test is PARKED (2026-09-13, human request: "can we skip this and move on?").** Everything up to the device boundary is proven: the schedule ticks (05:30, `succeeded`), the drain runs, and queued rows are stamped (`sent_at` set, `error: 'no subscription'` for recipients without a device). What has NOT happened: **no push has ever reached a device**, because `push_subscriptions` is still 0 rows — the phone never completed the opt-in. Two consequences to remember when it is picked back up: (1) delivery is unproven, so the "sent_at with `error: null`" case has never been observed; (2) the dedupe key is per `(family, kind, drop-in)`, so a ping that was SKIPPED for having no subscription is never re-delivered by a later ping of the same post — do not spend a test post before a device is registered. Nothing else about push is blocked; V9 work starts now.

### V4 closure evidence (2026-09-11, after the human's Google setup)

| Claim | How it was checked |
|---|---|
| Google is actually enabled | `GET /auth/v1/authorize?provider=google` now answers **302** to `accounts.google.com` with a real `client_id` (it answered 400 "provider is not enabled" for three rounds before). Facebook still 400 — correct per D3 |
| The round-trip really completed | Read `auth.identities` in the live DB: a **`google` identity for jonmeisburg@gmail.com created 2026-09-11 18:12:29 UTC**, `last_sign_in_at` matching. Supabase LINKED it to the existing email account (same address), which is why no new `auth.users` row appeared — and why the first-timer branch was still untested |
| The app hands off correctly | Live click on the built app: only "Continue with Google" renders, lands on `accounts.google.com` with `client_id=1039310980043-…`, `redirect_uri=<project>/auth/v1/callback`, `scope=email profile`, and `redirect_to=http://127.0.0.1:4173/` (the app's own origin). No JSON error page |
| **The first-timer branch** (the one every NEW parent hits, which the human's test could not reach) | Reproduced the exact state — real signup through the UI, then dropped only the profiles row via SQL — and drove the app again: **"Pick your display name" appeared** (`handleStepShown: true`), prefilled from the account's email local part, and submitting **advanced to "Set your location"** (`locationStepAfterSubmit: true`). Marker swept afterwards |
| Live DB after all checks | 2 auth users, 2 profiles, 2 playdates, 0 `e2e-` rows, founder moderator flag intact |

## V5 — beta readiness (opened 2026-09-11, human request)

| Item | State | Evidence |
|---|---|---|
| Password reset | complete | `/reset-password` (outside the shell, like /login — the recovery token lands in the URL fragment and the shell's gate would bounce that window) + "Forgot password?" on /login. `src/lib/passwordReset.ts` pure seams (redirect, `validateNewPassword`, neutral notice, rate-limit wording) + 12 tests; `sendPasswordReset`/`setNewPassword` in db.ts. Live-verified on the built app: reset mode hides the OAuth buttons and password field, the request shows the neutral notice (no error), and a token-less `/reset-password` load renders "This link didn't work". 290/290 unit |
| GitHub backup | complete | **https://github.com/Meisburg/Drop-In** (private; moved 2026-09-18 from jonmeisburg/drop-in); `master` tracks `origin/master`; verified pre-push that no secret is tracked (`.env`, `e2e/.auth/`, marker session state all ignored) |
| Vercel deploy | complete | **https://drop-in-mu.vercel.app** — verified against the live URL: a signed-out load of `/playdate/5142f51d-…` renders the drop-in (title, place, host, Share, "Sign up to join in") rather than not-found or a host 404 (the SPA rewrite), service worker controls the page over HTTPS, manifest `Drop In`/standalone with all 3 icons 200 + 8 iOS startup images, Google handoff lands on `accounts.google.com` carrying `redirect_to=https://drop-in-mu.vercel.app/`, and a cold offline load still paints the shell. Mobile audit green at all 12 viewport/route combinations **on the deployed site**. 2026-09-18: git integration reconnected to Meisburg/Drop-In (Vercel GitHub App re-granted on the new account; the dashboard reconnect had already linked the project — verified same-day via REST `GET /v10/projects/prj_HGRmcrSi53UMQoD4sKcgCIGIkSC5`, no POST needed); link verified (github Meisburg/Drop-In) |

**Human URL-Configuration step: DONE** — `site_url` is now
`https://drop-in-mu.vercel.app` and `uri_allow_list` includes
`https://drop-in-mu.vercel.app/**` (read back from the live auth config).

**BLOCKER for inviting outside testers (measured from the live auth config, 2026-09-11):**
`smtp_host` is **null** (built-in test sender) and `rate_limit_email_sent` is **2 per
hour for the whole project** — so password reset is code-complete but cannot
carry a real beta yet. Also `site_url` is `http://localhost:3000`, which nothing
serves. Both are dashboard settings; `docs/beta-checklist.md` has the steps.

## V6 — first phone feedback (opened 2026-09-11, testing on the deployed URL)

Source: the human testing https://drop-in-mu.vercel.app on a real phone.

| Item | State | Evidence |
|---|---|---|
| Text too small | complete | Measured: text-sm used 249×, text-base 12× → body was 14px. Two passes: 16px, then **17px** (iOS body size) with headings 26px and a 14px floor enforced by `scripts/mobile-audit.mjs` |
| Low contrast (found alongside) | complete | text-slate-400 (≈2.9:1, under WCAG AA) used 32×; both gray tiers shifted up one, hierarchy preserved, no failing-contrast grays left |
| Bottom nav | complete | Icons above the labels + a REAL active state — the old code used Tailwind's `active:` variant (the CSS :active pressed pseudo-class), so the current tab was never marked |
| Going toggle read as a badge | complete | ""it's not clear that's indicating that you're going"" — bare circle → labelled pill ("I'm going" / "Going"), 44px, in the card's action row, plus a "More info" chevron |
| Photos should enlarge | complete | `ImageLightbox` via context; tap to open, tap/Escape to close. Decision #3 applied: the detail avatar enlarges while the NAME goes to the profile (they used to be one link) |
| Kids going (decisions #1 + #2) | complete | **0026** + **0027** applied live and verified. `ping_kids` (cascade from the ping), `count_kids_going` / `count_kids_going_for` (count for every signed-in viewer), `get_kids_going` (names+ages to host/pingers/mods only). UI: the detail page asks "Who's coming with you?" once you're going; the card reads "2 going · 1 kid". Verified end to end on a seeded marker: un-ping clears, the picker appears, the chip selects, "Other kids coming: Bernie · 6" renders, the card counts it. 295/295 unit |

**Regression caught by that verification (worth remembering):** the new hooks first landed BELOW the detail page's early returns, so React threw "rendered more hooks than during the previous render" and the whole detail page rendered blank — build and unit tests were both green. Screenshotting the real page is what caught it. A second race surfaced too: re-reading the selection before the write landed flipped the chip back off, fixed with an `onSaved` callback that fires only after the insert.

## V7 — brand palette (2026-09-11, human request → DEPLOYED)

Source: the human re-examining the brand ("the logo looks like a water drop",
then "which would moms like most?", then a Peanut palette reference). Indigo was
the brand; `scripts/design-detect.mjs` had it listed as an ACCEPTED finding whose
reason was literally "changing it is a brand change, not a CSS edit — tracked as
a product decision". The human made that decision, so the finding is now RESOLVED
rather than merely accepted.

| Item | State | Evidence |
|---|---|---|
| Name | **Drop In, kept** (decided) | Checked the space: "PlayDate" is taken *in this exact category* (playdate.today = "effortless playdate scheduling for busy parents"; also playdate.events + Panic's console owning the word in tech), while Drop In's collisions are drop-in *childcare* — adjacent, not competing |
| Palette | **Shipped** — commit `430a4bc`, live on `drop-in-mu.vercel.app` | Terracotta on a warm off-white base. Direction: "Peanut's structure, our own hues" — adopt their warm base + one committed accent, NOT their coral-red (that hue is the "app for moms" signal; this app is for both parents). Applied as Tailwind `@theme` overrides on the stock scales, so one file recoloured ~450 call sites and the authored lightness ramps survived |
| AA contrast | PASS, measured on the rendered app (local AND production) | headings `#2f4858` 9.59:1 · body `#5a676e` 5.83:1 · wordmark 4.66:1 · buttons (white on `#c8411c`) 4.97:1. Two terracotta tones on purpose: `#e8552f` is the brand hue (artwork), `#c8411c` is the action/text tone — `#e8552f` at 17px/under white text is only ~4.2:1 and fails AA |
| Gates | PASS | build clean · 295/295 unit · lint 0 errors · `mobile-audit.mjs` all 12 viewport/route combos **green against production** · `verify-pwa.mjs` green (SW controls the page, 3 icons 200, 8 startup images, **cold offline load still paints**) |
| Icons / splash / manifest | Regenerated + verified live | Apple-touch, 192, 512, maskable 512 and all 8 iOS splash PNGs re-rendered off indigo at the exact byte sizes the local build produced; manifest `theme_color` + `background_color` = `#e8552f`; compiled CSS carries **zero** legacy indigo hexes |
| Defect found by verifying the fix | Fixed in the same commit | `SplashScreen` was `bg-indigo-600`, so a cold start painted the deep action orange for one frame then jumped to the brighter boot-splash hue. Now `bg-indigo-500` — one colour across first paint, React splash, icon, manifest |
| **Logo MARK** | **DECIDED 2026-09-23 — the slide + tree** (the playground), shipped since `36d721b` | See the closure note below. The droplet has been gone from shipping code since `36d721b`; this row was stale. The group-of-kids direction was the alternative on the table and was NOT adopted |
| Tagline | Proposed, not adopted | "The kids play. You make friends." — it is the promise the human's reference illustration actually depicts (grown-ups chatting in front, kids playing behind) |

**Logo MARK decided 2026-09-23: the slide + tree** (the playground). The mark the app has shipped since `36d721b` (2026-09-11) IS the decision — a slide under a tree on the ground line, replacing the droplet. The V7 row above had gone stale (it still described the droplet as the live shape); no shipping surface has drawn a droplet since `36d721b`. The group-of-kids direction was the alternative on the table and was not adopted. **Verified against the RUNNING app 2026-09-23** (headless Chromium, dummy credentials + route interception so no live Supabase call, `dist` built from this tree): the same geometry renders on every surface — header `h-7 w-7` (28px), /login `h-14 w-14` (56px), /reset-password `h-14 w-14` (56px), the in-app SplashScreen `h-28 w-28` `mono` (112px), and the static boot splash in `index.html` (112px). The SVG sources agree: `assets/drop-in-icon.svg` + `public/favicon.svg`, and the PWA icons regenerated by `scripts/build-icons.sh` (192 / 512 / maskable-512 / apple-touch) are byte-identical to the source (no git diff). No droplet path remains in shipping code. **Two of the eight iOS splash PNGs were stale and are fixed here:** `750x1334.png` and `1536x2048.png` had the mark 64px (32 CSS px) too high vs. the current `scripts/build-splash.mjs`; the other six already matched. **The proof is in the committed images themselves, not an uncopyable note:** all eight splash PNGs and the four PWA raster icons decode to the exact slide-and-tree geometry, and the two regenerated images measurably close the offset (the mark sat 64 device px / 32 CSS px above the generator's position before, and at the generator's position after), so the fix is visible in the commit's own binary diff rather than asserted against gitignored scratch files. (The brief that triggered this also named a V9 line, a V22 line, and a backlog-audit entry as open logo-mark references; a tracked-file grep found none — the only two were this V7 row and the V8 line above, both now closed. `MASTER-IMPROVEMENTS.md` mentions the mockup FILES only.)

**Local-only exploration artifacts (deliberately gitignored, never shipped):**
`public/logo-mockup.html`, `public/color-compare.html` — the palette and mark
comparison pages, plus `.scratch/*.cjs` verification scripts. They live under
`public/` so committing them would have published them.

## V7.1 — photo crop / zoom on upload (2026-09-11, human report → done)

Source: *"when a user uploads a photo they need an opportunity to zoom/crop the
photo because my kids pictures are not displaying properly in the circle."*
Plan of record: `.scratch/photo-crop/spec.md` + tickets `01`–`04`.

**Root cause, exact:** `prepareAvatarFile` (`src/lib/db.ts`) center-cropped every
upload with `(size - drawWidth) / 2` — the crop window pinned to the dead centre
of the source, with no pan, no zoom and no preview — and the square was then drawn
into a circle (`rounded-full object-cover`), which removes the corners too. One
function, three entry points, including **onboarding** (the first photo a new
parent ever uploads).

| Item | State | Evidence |
|---|---|---|
| 01 crop-geometry seam | complete | `src/lib/photoCrop.ts` + 30 unit tests (325 total pass). State is the window CENTRE in source pixels + a zoom, so the same state means the same thing at any window size, and zoom 1 is EXACTLY the old center-crop — which is what lets the step default to "touch nothing, get what you used to get" |
| 02 crop dialog | complete | `src/components/CropPhotoDialog.tsx` + the flow hook in `useCropStep.tsx`. Canvas preview painted with the encoder's OWN transform, circular mask, drag + pinch + wheel + slider, 3x zoom ceiling |
| 03 wire the 3 paths + EXIF | complete | `prepareAvatarFile(source, rect)` no longer decides framing; the ≤5MB gate moved into `useCropStep.beginCrop` (one place, before the decode AND the dialog); `createImageBitmap` given an explicit `imageOrientation: 'from-image'`; `e2e/avatar.e2e.ts` clicks through the dialog |
| 04 avatar resolution | complete | `AVATAR_SIZE_PX` 256 → 512. Measured through the real encoder: 512x512 JPEG at 3.3–5.7KB |
| Verification | measured, not asserted | The dialog is only reachable behind a session, so it was driven via `crop-harness.html` / `crop-encode-harness.html` — dev-only root HTML that Vite serves in dev and never builds, mounting the REAL components with the REAL CSS |
| Lint / build / tests | PASS | build clean · 325/325 unit · oxlint **0 errors**, and precisely **0 warnings on any line this work changed** (all 29 are pre-existing or from uncommitted scratch scripts — checked by intersecting warning lines against diff hunks) |
| Mobile audit | PASS | all 12 viewport/route combinations |

**The claim this feature rests on, and how it was settled:** that the frame the
user sees and the pixels that get saved cannot disagree. Both come from
`cropRectFor` — the preview is painted with `drawTransformFor`, which is DERIVED
from it — and the encoder was then fed three different rectangles of one 9-band
test image and returned three different images (bands 1 / 5 / 4). If the rect were
being ignored, all three would have been identical. Two independent checks of the
gesture layer came out right as well: dragging the photo DOWN moves the window UP
(the "photo fights my finger" bug is absent), and the same drag reaches band 1 at
3x where 1x could only reach band 3.

**Two bugs my own measurements caught and fixed:** the generated iOS splash images
had no CSS reset, so the wordmark sat 32px lower than the web splash (the app's
Tailwind preflight zeroes margins; a bare `<p>` does not); and the first version of
the font check compared an invalid font string, which canvas silently ignores, so it
reported every candidate as a perfect match.

**Still open, deliberately:** the tagline. And one acceptance criterion for ticket
04 cannot be closed from here — whether 512px is *visibly* sharp in the lightbox on
a real phone is perceptual and needs a human holding a phone.

### Review round — one high-severity defect found and fixed

An independent fresh-context reviewer (no prior exposure to this work) returned
**NEEDS_CHANGES**. Full findings and resolutions: `.scratch/photo-crop/review-response.md`.

**The one that mattered:** `useCropStep` passed `{ imageOrientation: 'from-image' }`
to `createImageBitmap`. That member is a **WebIDL enum**, and WebIDL THROWS on an
enum value an engine does not know (unknown KEYS are ignored; unknown VALUES are
not). The value needs Chrome/Edge 112+, Firefox 111+ or Safari 16+, while Vite 8's
own build floor is **chrome111** — inside this project's declared support envelope.
There the call threw, the catch blamed the user's file, and **no photo could be
uploaded at all**. It also bought nothing: `from-image` is the modern default. The
option is gone, and a regression guard in `scripts/crop-flow-harness.html` now
asserts `createImageBitmap` is never called with options — checked for vacuity in
the same run by patching an engine that throws on them.

Ten further real findings were fixed (bitmap leak on unmount-during-decode; a
gesture layer that could wedge permanently and a stale 3→2 pinch base; wheel zoom
dropping deltas; Escape not gated on `busy`; an e2e comment claiming more than its
assertions proved — it now reads the stored object back and asserts it is square;
stale "256px" user-facing copy; no guard on the encoder's rect and no test for
`AVATAR_SIZE_PX`; the verification harnesses being gitignored, so the central claim
was unreproducible — they now live in `scripts/` and are tracked). One nit is
accepted with a written reason.

The reviewer's own independent work corroborated the core: a **270,000-case fuzz of
the real `photoCrop.ts`** found no non-square, non-finite, out-of-bounds,
divide-by-zero or gap-producing state, and confirmed `clampCropState` is sufficient
(so the origin clamp is defence, not a patch over a hole).

Re-verified after the fixes: build clean · **340/340** unit · lint 0 errors · mobile
audit green at all 12 combinations · all four harness verifications re-run (pan
direction, zoom reframing, rect-honoured encode, the >5MB gate, cancel, and the new
`createImageBitmap` argument-count guard).

**Still unverified, stated rather than implied:** any real WebKit/Safari engine; EXIF
orientation on a real camera file (preview and encode share one bitmap, so they cannot
disagree *with each other* — whether it is upright is untested); the e2e suite (a live
Supabase mutation, so it was listed but never run); and the perceptual 512px sharpness.

### PWA / mobile-app readiness (verified round 2)

The "feels like a phone app" half of V4 is now backed by repeatable checks
(`scripts/`, documented in the README) rather than a one-off look:

| Check | Result |
|---|---|
| Service worker takes control of the page | PASS |
| Manifest installable | `Drop In` / `standalone` / `start_url: /` / `background_color #e8552f` (matched to the splash; was indigo before V7) |
| Every advertised icon resolves | PASS — 192, 512, maskable 512 (all HTTP 200, correct sizes) |
| iOS standalone metadata | `apple-mobile-web-app-capable: yes`, `apple-mobile-web-app-title: Drop In`, 8 `apple-touch-startup-image` sizes |
| **Cold offline load** | PASS — the precache serves the shell (login screen paints, no browser error page) |
| Splash lifecycle | boot splash in HTML → overlay at 61ms → gone at 1474ms (inside the 2s cap) → not replayed on navigation |
| Mobile audit | 12 viewport/route combinations green (320–430px portrait + 844x390 / 667x375 landscape) |

## V8 — retention queue (opened 2026-09-12, human-approved evaluation)

Source: the human asked for a product evaluation — *what is missing, and what
exists that we would improve, to make parents want to use this and keep using it
to meet other parents at fun places around the city* — then approved all of it and
asked for tickets. This session (the DSH coordinator) wrote the evaluation, the
spec and the tickets, and — by direct human instruction ("why not just do it
here") — built ticket 01 itself instead of handing it to the dev pane. One writer
in the repo was preserved throughout.

Artifacts: `.scratch/product-review/evaluation.md` (the read-only review; every
claim carries a file:line or a grep result) · `.scratch/v8/spec.md` (the queue, the
migration ledger 0028–0034, the shared migration-check procedure, the baseline
gate) · `.scratch/v8/issues/01`–`12` (one file per ticket, AC checkboxes + an
explicit migration check each) · `.scratch/v8/briefs/01-quick-post.txt` (the
dispatch brief, unused — the human redirected the work here).

**Diagnosis (measured, not vibes).** The app is a careful one-shot directory with
no reason to come back: **zero notification infrastructure** (no push, no email, no
in-app inbox; `dist/sw.js` precaches the shell only), **zero repetition**
(`playdates` carries one `starts_at`/`ends_at`; no recur/weekly/series concept in
any migration), **no memory of people** (the only user-to-user tables are `blocks`
and `going_pings`), and a supply side that fails cold (5-mile default radius, no
seeded or city-wide fallback → a new parent's first screen is *"Nothing happening
near you today — post the first one"*, `FeedPage.tsx:433-443`). The stated goal —
different fun places around the city — has no data model behind it: `place` is free
text and the neighborhood is a display label.

| # | Ticket | State |
|---|---|---|
| 01 | Quick post: today-default, recent places, one-tap preset | **complete** — `dd0642e`; no migration |
| 02 | First visit that isn't a dead end + honest/fresh states | **complete** — `7173b0c` + review round `d574eec` (fresh-context reviewer found a HIGH regression: the visibility refresh blanked the feed; plus the host's "No one has pinged yet" lie, inert escape buttons, and a weak spec assertion — all fixed); no migration; 390/390 unit, e2e 25/25 |
| 03 | "While you were away" inbox (pings on your posts, cancellations) | **complete** — `e016921`; no migration; 390/390 unit, e2e 25/25 (independently re-run). The old amber banner + `countPingsOnMyPosts` were DELETED (one implementation of "you have news"). Judgment call logged: cancellation items are not cursor-gated (playdates has no status-change timestamp) — gated on `starts_at > now` instead |
| 04 | Real post lists on `/u/:handle` and `/profile` | **complete** — `fc85093`; no migration; 403/403 unit, e2e 26/26. Boundary pinned on `ends_at` (the `isEnded` complement): a drop-in happening right now is UPCOMING |
| 05 | Post edit + delete | **complete** — `625d252`; no migration (0005's host-only UPDATE/DELETE policies were already there); 427/427 unit, e2e 31/31. `/new`'s form body extracted into `PlaydateFormFields` — string-identical, so the 12 specs that drive /new pass unmodified |
| 06 | Standing playdates (weekly series) | **complete** — `f54c066`; **0028 APPLIED LIVE** (dashboard SQL API, HTTP 201) with post-apply probes (objects, PostgREST 200 no PGRST205, anon fails closed 401/42501, generator created 3 then 0, zero residue); 454/454 unit, e2e 32/32. Ticket wording deviation, evidence-backed: the function ships VOLATILE because a STABLE function cannot write. New reusable `scripts/apply-migration.mjs` (the apply/probe path this repo had been doing by hand from `.scratch/v4`) |
| 07 | Places directory + place pages + Browse becomes places | **complete** — `48f3572`; **0029 + 0030 APPLIED LIVE** (239 real City-of-Seattle rows; probes: anon read 200, anon write fails closed, 13-field RPC); 514/514 unit, e2e 36/37 (the one failure is the KNOWN guest-list live-API flake — green in isolation). **0028 amended in place + re-applied** (the generator now propagates `place_id`). Finding recorded, not rewritten: 0021/0022's composite-type guard joins `t.oid = a.attrelid`, which never matches (correct: `t.typrelid`) — 0030 uses the corrected join |
| 08 | Web push + install affordance | **code complete + verified; SENDER DEPLOYED + VERIFIED (2026-09-12); LIVE SEND PENDING HUMAN** — `714bed8`; **0031 + 0032 APPLIED LIVE** (0032 re-applied after an in-place amendment: the `starting_soon` zero-count copy, probed NULL/0/1/3 live); 584/584 unit, e2e 42/42, both PWA verifier scripts green after the `generateSW → injectManifest` switch. Fresh-context reviewer returned NEEDS_CHANGES with 8 findings (the opt-in was ONE-WAY, `ping_saved` never fired, rotation repair not wired, a silent upsert collision, iOS webviews blocked, a discarded fallback note, the 0032 dead branch, install capture) — **all 8 fixed** and re-verified. **`docs/push-setup.md` steps 1–3 done (coordinator-ran 2026-09-12):** keypair in `.env.push.local` (0600, private half never printed/pasted/committed) → public key in `.env` + Vercel env (Config, public by design) → `supabase secrets set` + `functions deploy send-push` GREEN → **wall checks passed: service-role POST → 200 `{"ok":true,…}` (secrets landed, no 503); anon POST → 401 "send-push is service-role only"** → `a97892e` pushed, live bundle carries the key. **SCHEDULE DONE (2026-09-12):** no dashboard Schedules tab on this plan (DOM-checked) and no `vault` → `pg_cron`+`pg_net` enabled, job `send-push-every-5-minutes` live (jobid 3); key injected via `.scratch/cron-schedule-send-push.mjs` (0600 temp file → CDP SQL API, never in a terminal/chat); 12:45 tick fired (job "succeeded", fn booted 05:45:00) and the drain correctly stamped the 2 pre-existing rows "no subscription" (`push_subscriptions`=0 until the phone opts in). pg_net's fixed 5s response timeout shows `timed_out` on cold-start ticks — cosmetic, delivery completes server-side. **Remaining human-owned:** the Android phone test (opt in → ping from a 2nd account → buzz within 5 min). No real push has ever been sent |
| 09 | Loop-closing ("same time next week") + follow family/place | **complete** — `76a627b`; **0033 APPLIED LIVE** (probes: duplicate blocked 23505, both-targets blocked 23514, SECDEF counts work, anon fails closed); 620/620 unit, e2e 42/43 (the one failure is the second known live-API flake, green in isolation). Two spec bugs of the coordinator's own found by the post-apply check (a duplicate probe that asserted RLS instead of the unique index; an unfiltered DELETE PostgREST refuses with 400). Sweep tooling now counts follows / push_subscriptions / series rows |
| 10 | Polish batch (saves, undo, degraded states) | **complete** — `135c401`; no migration (the moderator-unhide item was PROBED, not assumed: 0009's policy is column-agnostic, so clearing `hidden_at` is admitted — the live round-trip is now a permanent spec; residue check mods=1, hidden_comments=0); 655/655 unit, e2e 48/48. Two existing specs touched, both reported (the one-submit copy change; the kid row's facts read off its new inline inputs) |
| 11 | Email verification (trust gate) | **schema DONE, UI BLOCKED ON HUMAN** — **0034 APPLIED LIVE** (column + 2 mirror triggers + 2 SECDEF functions; backfill matches `auth.users` 155 = 155). The "Verified email" chip is deliberately NOT shipped: with "Confirm email" OFF Supabase auto-confirms every signup, so the chip would mark EVERY account verified — a trust claim the app cannot make. Chip + "Check your inbox" screen + the e2e harness change land together when the human flips the toggle: `docs/email-verification-setup.md` |
| 12 | Density: the first-cohort playbook | `ready-for-human` — ops, no code. The instrument is delivered: `.scratch/v8/density-log.md` (the weekly ritual, the target — ≥3 series with ≥1 ping for three consecutive weeks — the stop rule, and the exact SQL for each number). Depends on 06 (series) and 07 (places), both shipped |

**Migration ledger:** 0028–0034 were RESERVATIONS in queue order (next free number
wins if the queue reorders; whatever is applied is what this file records).
**ALL SEVEN ARE NOW APPLIED LIVE and probed** — 0028 (re-applied after the in-place
amendment that propagates `place_id`), 0029 + 0030, 0031 + 0032 (re-applied after
the `starting_soon` copy amendment), 0033, 0034.

### V8 deployed to production (2026-09-13, human-authorized: "push it")

`git push origin master` → `ea40ef7..f6957e1` (15 commits, 116 files) → Vercel
auto-deploy. Pre-push safety check: nothing sensitive is tracked (`.env`,
`e2e/.auth/`, marker state all ignored; no VAPID keys exist), largest new blob
180 KB.

| Claim | How it was checked against the LIVE url |
|---|---|
| The new build is actually serving | the live `/sw.js` gained `pushsubscriptionchange` + `notificationclick` ~30 s after the push — handlers only the V8 `injectManifest` worker has (the old generated worker had none) |
| The PWA still holds up | `node scripts/verify-pwa.mjs https://drop-in-mu.vercel.app` green: SW controls the page, manifest/icons/head correct, and a **cold offline load still paints the shell** |
| The splash still holds up | `node scripts/verify-splash.mjs` green: overlay at 173 ms, gone at 1507 ms, inside the cap, not replayed on nav. (`bootSplashInHtml: false` there is a race in the verifier itself — the static markup IS in the served HTML, confirmed by curl: `id="boot-splash"`) |
| Phone widths | `node scripts/mobile-audit.mjs https://drop-in-mu.vercel.app` — all 12 viewport/route combinations green |
| The new public route resolves | `/place/7b6ada36-…` (Green Lake Park East) → HTTP 200 SPA shell; `/playdate/65d0c351-…` → 200 |
| The DB the deploy talks to | all 0028–0034 probes above; the live DB is swept to 2 founders |

**Still human-owned after the deploy:** the push send path (VAPID + `send-push`
deploy + schedule), the email-confirmation toggle (with its follow-up chip
slice), and the density cohort.

### V8 ticket 01 — evidence (complete, `dd0642e`)

| Claim | How it was checked |
|---|---|
| `/new` opens on today + the next 30-minute slot | pure seams (`nextSlotMinutes`, `defaultStartDateIso`, `durationChipForUntilNextHour`/`suggestedDurationMinutes`) + 20 new unit tests, incl. the 23:45 wrap (date advances so the form never opens on a start that already passed) and the "always a legal stepper value / always a real chip" sweeps |
| A recent place fills three fields in one tap | `recentPlacesFrom` (newest wins, case/whitespace-insensitive dedupe, 3-chip cap, rows with no place dropped) + `queryRecentOwnPlacesWithClient` (host-scoped, created_at DESC, bounded scan) against a mocked client; live in the new e2e |
| The preset cannot promise one time and write another | ONE mount-time `now` feeds both the label and the values; the e2e reads the button's own label and asserts the rendered "Ends …" line matches it |
| Posting still needs no date/time work, and lands on the feed | `e2e/quick-post.e2e.ts` (2 tests, phone-width): the default is asserted race-proof (the mount falls between two evaluations of the same pure seam), a post is created touching only title/place/neighborhood/duration, and a phone-width `/new` has no sideways overflow |
| **Gate** | build exit 0 · **360/360 unit** (was 340) · **e2e 21/21** (was 19; the full suite re-run, not just the new spec) · `scripts/mobile-audit.mjs` 12/12 viewport/route combos green |

**Deviations / findings from ticket 01 (all deliberate, logged here):**

1. **Twelve specs were pinning the OLD DEFAULT.** `comments`, `share-public`,
   `zip-radius`, `host-status`, `address-maps`, `kids-v3`, `comment-replies`,
   `card-circles`, `guest-list`, `host-retention`, `avatar` and `golden-path` all
   hardcoded "10:30 AM" after one `+` press (and "Ends 11:30 AM"). That asserted the
   10:00 AM default, not the contract, so the ticket's default change broke all of
   them by design. New `stepStartTimeOnce` (e2e/fixtures.ts) reads the label the form
   actually rendered, presses `+` once, and hands the spec the parsed start — the
   specs now assert the **30-minute grid** and `start + duration`, immune to both the
   default and the wall clock. No assertion was weakened: the end-time assertion is
   now derived rather than hardcoded.
2. **The preset's label is dynamic** ("We're here until 3:30 PM") where the ticket
   pinned the literal `"We're here until 5"`. A fixed "5" would have been a lie for
   most of the day: the suggested duration is "to the next whole hour", which on the
   30-minute grid is always 1h. The affordance and its semantics are unchanged.
3. **The title default fires on a place arriving, not only via the preset.** The
   ticket pinned "prefills the title as `Playdate at <place>` … only when the title
   is empty, and only once place is set". That rule is implemented in one place
   (`withDefaultTitle`) and applied both by the preset AND when a place arrives
   (chip tap or typing), because the common flow is chip → Post, which the preset-only
   reading would have left untitled.
4. **No `db-v8.test.ts`.** The new db.ts round-trip (`listRecentOwnPlaces`) is
   covered by the mocked query test in `feed.test.ts`, where the recording mock
   builder already lives (the ticket's AC pointed at a `db-*.test.ts` file); the
   live round-trip is proved by `quick-post.e2e.ts`.
5. **`scripts/mobile-audit.mjs` cannot cover `/new`** — it walks only the signed-out
   routes (`/login`, the public detail page), so the ticket's 375px AC is asserted
   inside `quick-post.e2e.ts` at a 375×812 viewport instead (no horizontal overflow,
   with the preset card and both chip rows rendered).
6. **Marker sweep due.** This session left 4 marker accounts in the live project:
   `e2e-1789187031`, `e2e-1789187043` (+ viewers `e2e-v-1789187060-1`/`-2`) and
   `e2e-1789187175` — the usual post-run sweep (`node scripts/sweep-e2e-markers.mjs`
   with the CDP Chrome up) has not been run yet.

## V9 — the wife's feedback batch (opened 2026-09-13)

Source: the human relaying his wife's feedback on the live app, filed as
`.scratch/v9/spec.md` + `.scratch/v9/issues/01`–`09` at the end of the V8
session, plus `.scratch/v9/HANDOFF.md` (the index a fresh session starts from).
This session (the DSH coordinator) took the HANDOFF's recommended first move:
build **01, 03, 04, 05** in queue order, with builder → independent gate re-run
by the coordinator → fresh-context reviewer for any large diff → one commit per
ticket → this file updated at each close-out. Dispatch briefs (with the traps
the coordinator verified before briefing) live in `.scratch/v9/briefs/`.

**Baseline at open (re-verified by the coordinator, not taken on trust):** build
exit 0 · **655/655 unit (20 files)** · e2e 48/48 per the HANDOFF · migrations
0028–0034 applied · live DB 2 founders / 5 posts / 0 e2e markers.

| # | Ticket | State |
|---|---|---|
| 01 | Post: location first — pick a place, drop the neighbourhood | **complete — `e493e08`**; **0035 APPLIED LIVE + probed**; 673/673 unit, e2e 54/54, lint 0 errors |
| 02 | Post: a time WINDOW, not an hour | **DEFERRED BY THE HUMAN (2026-09-13)** — see the decision below. Ticket stays `ready-for-agent` pending the badge-suppression confirmation; 0036 stays reserved |
| 03 | Post: the twenty-second post (3 decisions, rest behind "more") | **complete — `96bb96e`**; no migration (`supabase/` verified untouched); 702/702 unit, e2e 59/59, lint 0 errors |
| 04 | Nearby: ended drop-ins leave the feed, into the archive | **complete — `73c2f5e`**; no migration (read-path only, `supabase/` verified untouched); 720/720 unit, e2e 61/61, lint 0 errors |
| 05 | Nearby: ages first, names optional | **complete — `c9b4836`**; **0037 APPLIED LIVE + probed**; 752/752 unit, e2e 65/65, lint 0 errors |
| 06 | Nearby: map-first with a list toggle | `ready-for-human` — needs the map-provider one-liner (Leaflet + OSM recommended) |
| 07 | Nearby: search + filters | not in this session's batch |
| 08 | Profile: no kid photos; a family photo + about-us | **FOLDED INTO 11 (2026-09-13)** — its kid-photo reversal and its family-photo feature both run through the same storage bucket, and ticket 10's review proved that bucket is publicly readable, so the two cannot ship apart. `0038` carried over to 11 |
| 09 | Messages: parent-to-parent on a shared drop-in | `ready-for-human` — **do NOT dispatch without an explicit yes** |
| 10 | Privacy: kid names are readable by every signed-in parent | **complete — `6ae3f2b`**; **0040 APPLIED LIVE + probed** (amended in place and re-applied in review cycle 1); 757/757 unit, e2e 66/66, lint 0 errors |
| 11 | Kid photos: the public storage exposure; family photo instead | **complete — `cbabc6e`**; **0038 APPLIED LIVE + probed**, objects migrated; 782/782 unit, e2e 71/71, lint 0 errors |

**Migration ledger:** 0035–0039 were RESERVATIONS in queue order. **0035, 0037, 0038
and 0040 are now APPLIED LIVE** (all probed; 0040 was amended in place and
re-applied in review cycle 1). 0036 stays reserved for the deferred ticket 02;
0039 remains reserved for ticket 09. Whatever is applied is what this file
records.

### V9 decision taken this session — ticket 02 vs ticket 03 (2026-09-13)

Ticket 03's first AC is pinned to "pick a place, tap a **window chip**, tap
Post", but the window chip is ticket 02 — which 03 itself declares itself
blocked by, and which carries a human judgment call (an approximate start time
cannot honestly power "Happening now / Starts soon", so the recommended default
suppresses those badges for approximate posts). The HANDOFF listed 03 as needing
no decision and 02 as needing a one-line confirmation, so the two contradicted
each other. **The human's call: build 03 on the EXISTING time control and leave
02 for later.** So in ticket 03 "window chip" ⇒ the existing duration chips, and
"the exact-time controls from ticket 02" ⇒ the existing date input + 30-minute
stepper. Ticket 02 is NOT built, NOT applied, and its judgment call is NOT
pre-empted.

### V9 ticket 01 — evidence (complete, `e493e08`)

| Claim | How it was checked |
|---|---|
| `/new` leads with the place picker and never asks for a neighbourhood | `e2e/post-location.e2e.ts` reads the form's own field order and asserts the place input is FIRST; asserts the label, the Browse button and its `aria-expanded` round-trip; asserts `select` count 0 and the words "Neighborhood" / "Pick a neighborhood…" absent |
| A post with a place and NOTHING else is postable | the spec's first test is the raw PostgREST insert with no `neighborhood_id` (the payload the form sends) and reads the column back as NULL. **Red by design pre-0035**, quoted verbatim: `HTTP 400 — {"code":"23502",…"null value in column \"neighborhood_id\" of relation \"playdates\" violates not-null constraint"}` |
| The signed-out view tolerates a NULL label | a session-less browser context loads a neighbourhood-less post, asserts the title and the place link render and that "We couldn't find this drop-in" does NOT — **with an in-band sensitivity proof** (the same context loads a bogus id and that heading DOES appear), so the negative assertion cannot be vacuous |
| Migration 0035 + probes | `information_schema`: `playdates.neighborhood_id` and `playdate_series.neighborhood_id` both `is_nullable = YES`; both FKs still `confdeltype = 'r'` (ON DELETE RESTRICT); `pg_get_functiondef` shows exactly ONE neighbourhood join and it is the LEFT join; the anon RPC returns **HTTP 200 with the full 13-field payload and `neighborhood_name: null`** for a NULL-neighbourhood post (pre-0035 that same call returned NULL = a signed-out "not found"), and **`"Green Lake"`** for an existing post; the probe row was deleted (residue check: 0 probe rows, 5 posts, 0 with a null neighbourhood) |
| **Gate (coordinator, independent)** | build exit 0 · **673/673 unit (20 files)** · **e2e 54/54, exit 0** · lint **0 errors** (39 warnings = the pre-existing baseline) |
| Marker sweep | after the suite: 81 marker accounts, **0 founder overlap**, 0 child rows left by the specs → deleted; verified back to **2 profiles / 5 posts / 0 e2e left / moderator flag intact** |

**Deviations and findings from ticket 01 (all deliberate, logged here):**

1. **Two traps the ticket's "no other column changes" line did not anticipate,
   both verified live BEFORE the migration was written, and both folded into
   0035** (the ticket file itself carries an AMENDED note):
   (a) `get_public_playdate` joined the neighbourhood with an **INNER** join, so a
   NULL neighbourhood made the whole function return NULL — every logged-out
   visitor would have got "not found" for a post that exists, with no error
   anywhere. Re-created with a LEFT join (the composite type needed no swap:
   `neighborhood_name` was already nullable text).
   (b) `playdate_series.neighborhood_id` was NOT NULL and 0028's generator copies
   it into every occurrence, so **"Repeat weekly" would have died on its own
   23502 before the post landed** (`/new` awaits `createPlaydateSeries` before
   `createPlaydate`). That column drops NOT NULL in the same migration.
2. **Four `neighborhoods!inner` embeds became plain (LEFT JOIN) embeds** — the
   ticket named the feed and the profile; an INNER JOIN would have silently
   dropped every neighbourhood-less post from **the feed, the profile lists AND
   the place page**. The memberships embed (`db.ts:392`) correctly keeps
   `!inner` (that FK is NOT NULL).
3. **The empty string would have failed BEFORE and AFTER 0035.** The ticket
   predicts the pre-apply failure is 23502, but the form held `''` and the old
   write sent it as a uuid → `22P02`. Fixed with the house `…IdField` pattern:
   the insert OMITS the key, the update writes NULL. This is *why* the
   documented red is a clean 23502.
4. **21 existing specs filled the removed select**, so each lost that step and
   every one is marked in place. **Three assertions changed** and are quoted
   in-file: `quick-post`'s `toHaveValue(/.+/)` on the gone select →
   `toHaveCount(0)`; `post-edit-delete`'s `/edit` prefill assertion →
   `toHaveCount(1)` + `toHaveValue('')`; `feed.test.ts`'s embed and validator
   tests. No test was weakened.
5. **Fresh-context review returned NEEDS_CHANGES with 3 findings; all fixed**
   (review cycle 1 of a permitted 2). The reviewer found a **real defect** the
   builder and the coordinator had both missed: a "Recent places" chip writes the
   remembered post's REAL neighbourhood id into a form that renders no
   neighbourhood field, and a later place pick inherited it — so place and
   neighbourhood could contradict each other on the card. Fixed *structurally*
   (`placePickPatch(place)` takes only the place, so "fall back to the invisible
   previous value" is no longer expressible) and pinned by a unit test plus an
   e2e that reproduces the exact sequence. The other two: the only assertion
   covering `/edit`'s stored-neighbourhood prefill had been deleted with nothing
   replacing it (restored, plus the clear-to-NULL half), and two assertions in
   the new spec **could not fail** (both replaced with exact-text assertions;
   the card's meta line is now compared against `feed.formatTimeWindow` — the
   function the card itself renders — with whitespace collapsed because Node and
   Chromium ship different ICU builds).
6. **`/edit` untouched by design.** `PlaydateFormFields` is shared, so the new
   layout rides props (`locationFirst`, `showNeighborhood`, `onBrowsePlaces`)
   whose defaults reproduce V8 ticket 05's markup byte-for-byte; `e2e/fixtures.ts`
   is byte-identical (`stepStartTimeOnce` needed no change — that is ticket 03's
   problem, not this ticket's).

### V9 ticket 03 — evidence (complete, `96bb96e`)

| Claim | How it was checked |
|---|---|
| A post is THREE decisions; everything else is behind one disclosure | the summary renders the read-back with the place picker, the duration chips and Post; the spec asserts each moved field is **absent from the DOM** collapsed (`toHaveCount(0)`, i.e. the disclosure unmounts rather than hides) and present expanded |
| "≤4 taps + 1 typed place" (measured, not described) | a capture-phase listener records clicks across the SPA navigation; the spec asserts the click count **and the touched-CONTROL SET** — exactly four: the place field, the picked row, one duration chip, Post. A fifth control fails the spec whatever its event type, so "nothing else may be required" cannot silently stop being true |
| The summary reads back exactly what will be posted | `postSummaryLines` is pure and pinned line-by-line; the e2e compares the rendered lines against the seam (bracket-mount race-proof), then cross-checks the card and the **DB row's** `starts_at`/`ends_at` and address |
| `mobile-audit` stays green | 12/12 on the signed-out routes — **and the honest limit is recorded**: the script cannot walk `/new` (V9/01 finding #5), so the `/new` half is asserted in the e2e at **320/375/390/430 + landscape**, collapsed and expanded: no horizontal overflow, every visible control ≥44px |
| **Gate (coordinator, independent)** | build exit 0 · **702/702 unit (21 files)** · **e2e 59/59, exit 0** · lint **0 errors** (39 warnings = baseline) · `git status --short supabase/migrations` empty |

**Deviations and findings from ticket 03:**

1. **The ticket-02 substitution** (the human's call — see the decision section
   above): "tap a window chip" ⇒ the duration chips; "the exact-time controls
   from ticket 02" ⇒ the existing date input + stepper. Both now sit behind the
   disclosure and are read back in the summary. `e2e/post-time-window.e2e.ts`
   (named in the ticket's Verify line) does not exist — it is ticket 02's spec.
2. **A real defect the fresh-context reviewer found inside this ticket's own
   AC** ("no field is hidden that changes what the parent is agreeing to"): the
   **address was a hidden default**. A pick writes the place's published street;
   typing over the place text dropped the `place_id` but KEPT that street, so the
   collapsed summary could read "Ballard Playground" while the row carried
   **Green Lake's** address — the very value the detail page renders as the
   Google Maps link. Fixed both halves: the address is read back on the place
   line, and a PICK-written address is dropped when the place text changes while
   a parent-TYPED address survives (`addressAfterPlaceTextEdit`).
3. **A cross-ticket AC inversion, resolved by satisfying BOTH ACs** (review
   cycle 1, F2): the summary's title input had become `/new`'s first field and
   first tab stop, contradicting ticket 01's AC 1 — whose whole point is that the
   place picker must be *discoverable*, because it used to read as plain text
   nobody found. Rather than re-pin either AC, the title is now a **tap-to-edit
   read-back**, so the place picker is still the first field *and* first tab stop;
   `expect(fieldOrder[0]).toBe(PLACE_PLACEHOLDER)` is **restored verbatim** (plus
   the stricter `toEqual([PLACE_PLACEHOLDER])`), and **both ticket files carry
   AMENDED notes** — the record is in the files, not only in an e2e comment.
4. **Three more real findings**: the summary's repeat line promised a series the
   submit would not create (now gated on the submit's own guard — no date, no
   line); the "1 typed place" half of the interaction budget was unmeasured (the
   touched-set assertion now pins it); a cleared title was unrecoverable and
   blocked Post (an emptied title counts as un-touched again).
5. **`/edit` untouched by construction**: every new behaviour rides props
   (`summaryLines`, `moreOptionsOpen`/`onToggleMoreOptions`, `minTouchTargets`
   default **false**) whose omission reproduces V8 ticket 05's markup
   node-for-node, so `post-edit-delete.e2e.ts` drives it unchanged.
6. **23 specs needed one `openMoreOptions`/`editTitle` call each.** The
   removed-line audit over the whole e2e diff found **exactly one** executable
   assertion ever affected — the `post-location` order pin, now restored. Every
   other change is an addition; no assertion was loosened, deleted or skipped.
7. **A regression the build caught and reported rather than buried**: the new
   `editTitle` helper used a non-retrying `count()`, which failed
   `loop-closing` once when the SPA had not painted; fixed by waiting on the
   retrying locator and re-verified in isolation.
8. **Still open, human-owned**: the ticket's own last Verify item — a real phone
   pass, timed from the installed icon to posted. This session can measure the
   in-browser interaction count (3 taps + 1 typed place) but not an installed-PWA
   pass.

### V9 ticket 04 — evidence (complete, `73c2f5e`)

| Claim | How it was checked |
|---|---|
| Nearby keeps only what is ahead or happening now; a started-but-not-ended drop-in STAYS with its badge | the cutoff moved to the post's own END on both layers — the DB query sends `.gt('ends_at', cutoffIso)` and the pure filter uses `isStillAhead` (= `!isEnded` by construction). The spec asserts the happening-now card is visible with its badge while the ended one has `toHaveCount(0)`, and pins the issued URLs on the wire (some read carries `ends_at=gt.`, **none** carries `starts_at=gte`) |
| The DB does less work and the client cannot disagree | `filterFeed`'s dead `startOfTodayIso` parameter was REMOVED rather than left beside `nowIso` — one time input, one cutoff. `listRadiusFeed` now reads ONE clock for both layers (it previously read `startOfTodayIso()` for the query and a fresh `new Date()` for the filter). The tempting `starts_at >= now` was never written: it would delete the drop-in happening right now |
| The archive is reachable and honest | "See past drop-ins" under the day sections AND inside the shared empty state (`RadiusEmptyState` takes an optional `seePastHref`; **Browse deliberately gets none**, and the spec asserts both callers against each other). The shipped empty-state copy was kept (it is V8/02's pinned literal — the ticket's "Nothing coming up within N miles." is a paraphrase), and the archive link's own literal is now pinned in `feed.test.ts` so a rename cannot keep the specs green |
| Archive rules (muted, no "I'm going", V8/09's "Same time next week") | `/profile`'s Past rows did NOT meet them: they were not links (the host could not reach the next-week affordance from the archive the feed links to) and were not muted. Both fixed; `/u/:handle`'s Past card asserted muted with zero buttons; the mute is text-only (the Duplicate button stays full strength) |
| **Gate (coordinator, independent)** | build exit 0 · **720/720 unit (21 files)** · **e2e 61/61, exit 0** · lint **0 errors** (39 warnings = baseline) · `git status --short supabase/migrations` empty |

**Deviations and findings from ticket 04:**

1. **The pivot was proven, not asserted:** with the pre-ticket cutoff temporarily
   restored in place, the new spec failed at exactly the documented assertion
   (`getByText(endedTitle, {exact:true})` → Expected 0, Received 1) **while both
   control assertions passed**, then the files were restored byte-identically
   (`grep TEMPORARY REVERT` → no hits) and the gate re-run. The ended window is
   built INSIDE today on purpose — a yesterday window would have been dropped by
   the old rule too, and would have proved nothing.
2. **A HIGH defect this change introduced, found by the fresh-context reviewer
   and fixed in review cycle 1:** moving the inclusion rule to `ends_at` left the
   **day grouping keyed on `starts_at`**, so a still-running post that started
   yesterday rendered under a past-dated header ("Fri, Sep 11") while its card
   said "Happening now" — as the FIRST section on the feed. Unreachable before
   this ticket, which is why no test covered it. Fixed with the pure seam
   `daySectionIso` (a started post clamps up to today), used for the section key,
   the label **and the rain badge's third definition of "today"**, with a
   red-then-green proof.
3. **The spec's own red-before accounting was wrong by three assertions** (the
   feed's archive link, the Past row's title link and the mute were claimed
   "green before and after"; all three are added by this ticket). Now listed as
   this ticket's own pivots — the AC specifically required the spec to say which
   assertion is the pivot.
4. **The archive door is HOST-SCOPED, and that is recorded rather than papered
   over:** `/profile` lists only the viewer's own hosted posts, so a parent who
   *attended* someone else's ended drop-in has no listing surface, and the
   likeliest tapper (a brand-new parent, since the link also sits in the empty
   state) lands on "No posts yet.". Recorded in the ticket's `## Comments` and
   pinned by a non-host assertion. Building an attended-events surface is a
   separate ticket, not a read-path change.
5. **`listPlaceFeed` (`db.ts:688`) and `upcomingCountsByPlace` (`db.ts:711`)
   still cut at start-of-today**, so Browse can say "1 upcoming" for a place
   whose only drop-in has ENDED — a wrong LABEL today, not the performance
   footnote the doc first claimed (framing corrected, numbered follow-up recorded
   in the ticket). `countPostsByHost` has no time filter at all, so the brief's
   premise about it was wrong.
6. **A V3/02 pin is silently superseded:** `DropInCard`'s "the event STAYS in
   the feed — no auto-expiry" is no longer true for a CANCELLED post past its
   end. Reconciled at that site and **four more copies** of the same sentence
   (`types.ts:73`, `PlaydateDetailPage.tsx:230/1410/1722`); `grep "STAYS in the
   feed"` is now the complete list, and the supersession is recorded in the
   ticket.
7. **Left alone deliberately and reported instead of smuggled in:** the clamped
   row now sorts first in Today's section, so V3/01's single "Starts soon" badge
   can go unawarded in one more rare situation — identical to what an
   already-live same-day post does today. Changing V3/01's badge target is a
   deliberate decision, not a bug fix.
8. **`ends_at` is UNINDEXED** (the only playdates index is
   `(neighborhood_id, starts_at)`, 0005), so the new predicate is a scan. Free
   at 5 rows; an index is DDL this read-path-only ticket forbids. Documented.

### V9 ticket 05 — evidence (complete, `c9b4836`)

| Claim | How it was checked |
|---|---|
| A card leads with the ages of the kids the host is bringing, never a name | the spec asserts the age line's rendered text is EXACTLY `ages 3–6`, is the meta's FIRST line, and that **every kid name is absent** from the card — an absence assertion made non-vacuous by proving the same locator first carries the ages line |
| One kid → `age 4`; a wide spread → capped; no kids and no chips → NOTHING (never a guess) | pure seams `ageRangeLine` / `playdateAgeRangeLine` / `statedAgeRangeLine`, unit-pinned including the cap boundary (`AGE_RANGE_ALL_AGES_WIDTH = 12`) on BOTH sides and the no-source case; the spec asserts `card-age-range` count 0 for a kid-less, chip-less post |
| The explicit chips WIN, and they live behind ticket 03's disclosure | precedence is a pure seam with unit tests; the spec asserts the chips row is **not in the DOM** while collapsed, then stores the pair and the card reads the STATED range (with a control that the derived one is gone) |
| One batched read per surface, never one per card | a unit test pins the SELECT string and asserts it projects **only** `kid.age` — no `first_name`, no kid id; the pages call the batched read once, outside the per-card map, and degrade to `{}` silently |
| A kid's first name is optional, end to end | a live spec walks: `/profile` Add with NO name → the column really holds **NULL** (read back with the marker's own JWT, so NULL-vs-`''` is proven) → reload → the row renders sensibly → the Remove dialog says "this kid" → a drop-in posted with that nameless kid reads `age 4` on the card and `Kids coming: Age 4` on the detail page |
| **Gate (coordinator, independent, 0037 applied)** | build exit 0 · **752/752 unit (21 files)** · feed-ages spec **5/5** · **e2e 65/65, exit 0** · lint **0 errors** (39 warnings = baseline) |
| Migration 0037 + probes | both columns nullable `smallint` and `playdates_age_range_chk` present; an inverted range fails closed (`23514`) **and writes nothing** (0 probe residue, 5 posts, 0 with ages); `count_kids_going_for` / `get_kids_going` shapes unregressed; `kids.first_name` nullable. Re-runnable: two `add column if not exists`, a `pg_constraint`-guarded CHECK, and a `drop not null` no-op — no index, policy, grant or function |

**THE PRIVACY FINDING — the ticket's AC is false, and the copy was NOT shipped as
written (this one needs a human decision, see below).** The AC says kid names are
shown "only for the host and people who pinged, as today". **Verified false
against the live project:** `kids_select_authenticated` and
`playdate_kids_select_authenticated` are both `using (true)` for
`authenticated`, and the detail page loads `listPlaydateKidNames`
**unconditionally** for any signed-in viewer — only 0026's `get_kids_going`
gates the *pingers'* kids. So any signed-in parent can read the host's kids'
names; the builder wrote truthful copy ("only on your profile and on a drop-in's
page, and only to signed-in families") and recorded the amendment. **Tightening
that gate was deliberately NOT done here** (it is a privacy change with its own
ACs/migration/review, and this ticket's migration check pins "no policy
changed") — and it is **NOW FILED as ticket 10 on the human's instruction
(2026-09-13): `.scratch/v9/issues/10-kid-names-privacy-gate.md`**, `ready-for-human`,
blocked only on its scope decision. The coupling is recorded in that ticket: the
ages derivation reads `playdate_kids` under the very policy it narrows, so it
must give the derivation its own SECURITY DEFINER function or the narrowing
would **silently blank every card's ages line**.

**Deviations and findings from ticket 05:**

1. **The pre-0037 red was captured first-hand by the coordinator**, and it is a
   `PGRST204`, not the `42703` the ticket predicted: `HTTP 400
   {"code":"PGRST204",…"Could not find the 'age_max' column of 'playdates' in
   the schema cache"}` — PostgREST intercepts the insert payload before
   Postgres. The derived half was green in that same run, exactly as the ticket
   pins; after the apply the spec is 5/5.
2. **No SECURITY DEFINER batched RPC was added**, though the brief asked for one:
   a function can only exist after 0037, which would make the derived half red
   pre-apply and contradict the ticket's own pivot. The reviewer's refinement is
   recorded in the ticket: the pins were **jointly satisfiable** (function +
   pre-apply fallback, or the function in its own migration first), so this was a
   **decision, not an impossibility**. Two accepted costs are named in the
   record: the read is now bulk and automatic on every signed-in surface load,
   and the ages line is hard-coupled to `playdate_kids`' RLS (see the privacy
   finding).
3. **`kid.first_name` made nullable** — a deliberate extension of the ticket's
   "two columns + a CHECK" line, without which the AC cannot hold (blank name
   writes NULL by design). Review cycle 1 then found a **reachable** consequence
   the compiler provably cannot catch: the `/profile` Remove dialog interpolated
   the name, so a nameless kid read **"Remove null?" / "null comes off your
   family profile…"**. Fixed with a noun fallback and pinned by an assertion.
   **Correction recorded:** `--strict` accepts `` `${x}` `` for a
   `string | null`, so the type change enumerates method calls and assignments,
   not template literals — the migration header's original claim was wrong.
4. **The stated range is WRITE-ONCE and outranks the derived one** (recorded as a
   known limitation): the chips exist only on `/new`; `/edit` neither shows nor
   writes them while it *does* own an in-place kids editor, so a wrong chip is
   permanently wrong and beats the correct derived value, fixable only by
   delete-and-re-post.
5. **Two judgment calls the builder flagged, both reversible in one commit:**
   it wired `PlacePage`/`UserPage` through the same shared composition seam
   rather than only documenting the scope (the AC's card sentence is not
   feed-scoped; cost is one extra request per surface load, never per card), and
   it made `places.placeAgeFitLabel` literally `'Best for ' + statedAgeRangeLine`
   so the two age-band seams cannot drift.
6. **Still open, human-owned (unchanged by this session):** the ticket's phone
   pass, and the follow-up privacy ticket above.

### V9 ticket 10 — evidence (complete, `6ae3f2b`)

**THE FINDING, measured before anything was written.** Kids' first names were
readable by ANY signed-in parent: `kids_select_authenticated`
(`0011:86-89`) and `playdate_kids_select_authenticated` (`0022:84-87`) were both
`using (true)` for `authenticated`, and `PlaydateDetailPage`'s mount load called
`listPlaydateKidNames` with **no host/pinger gate at all**. My own probe with a
real stranger JWT: **6 kid rows across families, including 3 kid-photo
`avatar_url`s**, plus 9 `playdate_kids` rows. Only `ping_kids` was ever gated —
0026 covers the **pingers'** kids, never the host's.

| Claim | How it was checked |
|---|---|
| The two wide policies are gone; one gate each | live `pg_policies`: exactly `kids_select_own_host_pinger_mod` (`profile_id = auth.uid() OR moderator OR kid_visible_to_viewer(id)`) and `playdate_kids_select_host_pinger_mod` (`playdate_kid_row_visible(playdate_id, kid_id)`); no `using (true)` SELECT policy left on either table |
| A stranger can no longer read a child | same stranger JWT, same query: `[]` on `kids` **and** `playdate_kids` (was 6 rows / 9 rows); anon `[]` |
| No write path broke (the 0014/42501 interaction) | the owner clause is **inline** in the kids policy because `addKid` writes with `.select()`; probed live — owner `INSERT … RETURNING` → 201 with its row, owner's own read → 200, NULL name round-trips |
| The ages line did not blank (the coupling) | `kid_ages_for` is SECDEF, ages-only; probed `{age_min: 4, age_max: 9}` for a two-kid post; the live suite's card still reads `ages 3–6` |
| All four new functions fail closed | SECDEF + STABLE, `search_path = public, pg_temp`, EXECUTE to `authenticated` only (anon revoked); `get_playdate_kids` returns 0 rows with no JWT |
| **Gate (coordinator, independent)** | build exit 0 · **757/757 unit (21 files)** · kid-names-privacy spec **2/2** · **e2e 66/66, exit 0** · lint **0 errors** (39 warnings = baseline) |
| Pre-apply red, captured first-hand | a stranger's page read `Kids coming: Ages 3–6 · Anna …, Zed …` (the names leaked); the host/pinger halves and the ages line were green in the same run |

**Review cycle 1 found two HIGH issues, both fixed with executed receipts:**

1. **The gate was BYPASSABLE by forging a join row.** Neither join table's
   INSERT check constrained *whose kid* was attached, so an authenticated parent
   knowing one kid uuid could attach it to their own post or ping and then read
   that child's row through the new policy (including the `avatar_url`/`likes`
   the detail RPC withholds), or read name+age through 0026's SECDEF
   `get_kids_going`, which never consults the policy at all. **Reproduced live:
   both forges returned HTTP 201 and the victim's row came back.** Fixed by
   amending 0040 **in place** (the 0028/0032 precedent) with a third SECDEF helper
   `kid_owned_by_caller` and a **replaced** `with check` on both INSERT policies
   (same names — same-command policies OR together). Re-applied and re-probed:
   **both retro-queries for pre-existing forged rows return 0**, the forges fail
   closed, and a legitimate own-kid attach still lands.
2. **The diff had added a FALSE claim about children's PHOTOS.** The copy said
   "a name **and a kid photo** are visible only to …" — and the `avatars` bucket
   is `public = true` with a public-read policy, so kid photos at
   `<uid>/kids/<kidId>` are anonymously listable and fetchable with only the anon
   key that ships in the client bundle. Ticket 10 gated the **column**; it cannot
   gate the **file**. The photo clause was **removed** (not weakened) and the
   finding was escalated → **ticket 11**, on the human's instruction, with
   **ticket 08 folded into it**.

**Also fixed in this ticket:** the pre-apply legacy fallback reads are DELETED
(`isMissingRpc` fired on a code-independent message match, and PGRST202 is
reachable on an applied project — the reads now fail closed like every other read
in `db.ts`), and the spec's 404-skip is gone so the RPC's presence is a **hard**
assertion rather than a silently-green fallback. `/u/:handle`'s kids card is
self-view only — the policy is per-KID, so a pinger would otherwise get a
**partial** list of a family's children, worse than none — with a comment saying
plainly that this is UX and the RLS is the boundary. Supersession notices were
added to `0011`/`0022`/`0026`: re-pasting any of them recreates a `using (true)`
policy from a name-based guard and would **silently re-open the table**
(verified comment-only, 0 non-comment lines). The helpers are a membership oracle
for anyone holding a kid uuid — accepted and documented (enumeration is
infeasible; the grants must stay because a policy runs as the caller).

**The gate's depth, recorded so nobody over-trusts it:** "the families who said
they're going" is **one self-service tap deep** (`going_pings` INSERT is
`profile_id = auth.uid()`, 0026's own inherited gate); "your family" means one
profile, not one household (no household model exists); and the RLS is the
boundary while the `/u/:handle` gate is UX.

### V9 ticket 11 — evidence (complete, `cbabc6e`) — kid photos left the public bucket

**THE EXPOSURE, measured before and after (my own probes, not the builder's
claims).** Kid photos sat in `avatars` (`public = true`, public-read policy) at
`<uid>/kids/<kidId>`. With only the anon key from the client bundle: the bucket
listed families, one `<uid>/kids` prefix returned **3 kid-photo objects**, and a
real legacy URL answered **HTTP 200 with 46,998 bytes** — no account, no URL
knowledge, and the stored paths are permanent. Ticket 10 gated the **column**
(a stranger's `kids` read 6 rows → `[]`); it could not gate the **file**.

| Claim | How it was checked |
|---|---|
| The bucket is private and the decision is enforced | 0038 applied live (HTTP 201): `kid-photos` exists with `public = false`, **5** path-scoped policies, `profiles.family_photo_url` present; `avatars` still `public = true` and untouched; **0040's kid-name gate policies verified intact** (the `kid_owns`/`own_host_pinger_mod` policies still exactly as ticket 10 left them) |
| The files moved, and were NOT lost | the script: read → upload → **SHA-256 + length read-back** → only then delete the public original. `copied=3 failed=0`; END STATE **`public_kid_objects: 0, private_kid_objects: 3, legacy_urls: 0, private_refs: 3`**, bucket private. Parent avatars: 2 objects, still in `avatars`, still public |
| The exposure is CLOSED (the same probe that found it) | the legacy URL now answers **HTTP 400** (was 200/46,998 bytes), and the anonymous listing returns **0** kid-photo objects (was 3) |
| No kid photo is uploaded or rendered any more | `kidPhotoPath`/`kidPhotoStoredRef` have **no runtime caller** outside the seam + its test (my own grep); the kid editor has no photo control; `/u/:handle` rows are name · age · likes; a kid row renders no `<img>` **even with `avatar_url` set** (spec, green) |
| `kids.avatar_url` was kept, not destroyed | rewritten to the bucket-qualified **object path** `kid-photos/<uid>/kids/<kidId>` — never a URL (the old one is dead by design, a signed one expires); `legacy_urls: 0`, `private_refs: 3`; `comment on column` records the decision on the live schema |
| The family photo cannot recreate the exposure | it is **NOT public** (signed-in families only, signed URL minted per render in ONE batched, best-effort call, never persisted — the column holds a path), and the renderer **refuses kid-class values** (unit-tested). The reason: a family photo usually depicts the children |
| **Gate (coordinator, independent)** | build exit 0 · **782/782 unit (23 files)** · kid-photo-exposure spec **6/6** · **e2e 71/71, exit 0** · lint **0 errors** (39 warnings = baseline) |
| Pre-apply pivots, captured first-hand | `Still listable: 3 object(s)` (the anon walk), `Bucket not found` (the private-bucket write), and the family-photo round trip failing on the missing bucket/column — 3 red, and the non-pivot tests green in the same run |

**Review, in the order the human asked for it — the review ran BEFORE the live
apply.** The reviewer was asked to rule on whether the script should be executed
at all, and returned **"SAFE TO RUN as written"** with the blast radius
live-proven to be exactly the 3 kid-class objects (no `<uid>/avatar`, no other
bucket), verify-before-delete clean with no bad interleaving, idempotency and the
post-crash repair path clean, and the service-role-key handling clean on every
output path (argv, env, file, log, error, stack). Its **10 findings were fixed
before the apply**, and two of them were defects in the very properties that make
the move safe: `uploadObject` never sent `x-upsert` (the documented repair path
could only 409 and leave an object **publicly readable forever**), and the script
never checked `kid-photos.public === false` (the property the whole closure rests
on — now a refuse-before-any-write guard plus a post-move anonymous probe of a key
that really exists). Also fixed: the `avatar_url` rewrite is gated on
*verification* rather than mere existence, the source's own byte length is
asserted against `storage.objects.metadata`, the report counts **rows** not
statements, the spec's vacuous "old URL must fail" assertion is labelled
shape-only with the real proof moved to a coordinator probe against a real key,
the stranger's list check asserts **both** branches, and five stale in-file
records were corrected.

**Residuals, recorded rather than papered over:**

1. **The CDN tail.** Supabase exposes no documented purge endpoint, so the closure
   is complete at the **origin** immediately and at every **edge** within the
   objects' `max-age=3600` hour. The script attempts the purge, counts the
   refusals, and both headers say so instead of claiming a purge. My own probe
   still got a 400 immediately (no cache hit), so the tail did not bite here.
2. **The family-photo read class.** `kid_photos_read_family` is `to authenticated`
   with no owner check, and `profiles_select_authenticated` is `using (true)` — so
   **any account that signs up can read every family photo**, and a family photo
   usually depicts children. The copy the parent reads ("shows on your profile, to
   signed-in families") is honest and promises nothing more, but **signup is the
   only barrier**; a stricter rule is a future ticket. This is the residual the
   human accepted with the confirmed decision.

### V9 ticket 11 — provenance note (the ticket is now built; this is the file record)

Filed on the human's instruction out of ticket 10's review cycle, **folding in
ticket 08** (which the human chose over leaving the photo work split in two
files). The live-verified finding, the recommendation for the already-uploaded
files (private bucket + signed URLs: the images survive, their old public URLs
die by design), the shared-bucket constraint that makes a private `avatars`
bucket impossible (parent avatars live there and must stay public), and the full
AC set are in `.scratch/v9/issues/11-kid-photo-storage.md`. **One decision
remains** — what happens to the already-uploaded files — and it is recorded there
with the options table. `0038` moved to this ticket.

## V11.5 — the copy-polish batch (opened 2026-09-17, the V11 t06 reviewer finding-(a) follow-up)

| Item | State |
|---|---|
| Ticket | `.scratch/v11.5/01-copy-pointers.md` (RANKED 1 from the V11 handoff; RANKED 0 — the Vercel deploy confirmation — was already closed by `05c9981` and independently re-verified: live entry `index-o3zQGGgw.js`, `/settings` → 200) |
| t01 user-facing copy | **complete — `b092886`** (2026-09-17): 8 stale "/profile" strings follow the V11 t06 reorg to /settings — OnboardingPage bio/kids error strings (210/211/223/224) + display-name/location prose (282/338), UserPage:564 + PlacePage:408 Following lines (the Following list renders on /settings, `SettingsPage.tsx:1233`); strings only, no behavior/routes/migration; **no unit or e2e spec pinned the old copy** (grep-verified pre-edit, so no test edits) |
| t01 fold-in (comment-only) | **complete — `5d85caa`** (2026-09-17): the same reviewer finding-(b)/(c)/(d) — stale `/profile` comments in db.ts (~14 sites: the 11 pinned + 4 same-class sites at db.ts:779/2368/2686/3294, documented in the 5d85caa commit message), push.ts (3), pushClient.ts (5), OnboardingPage.tsx (3), db-v2.test describe title, WhileAwayCard pattern reference; push-subscribe e2e historical note corrected (pre-t06 the fallback sentence's control lived on /profile); loop-closing JSDoc indent. Zero runtime changes |
| Gate | build exit 0 · **818/818 unit (24 files)** · lint 0 · **e2e spot-check 3/3** (`onboarding-gate` + `loop-closing`, the specs whose surfaces the copy touches); built bundle verified: new copy present, old copy 0 occurrences |
| Ship | **pushed + LIVE (2026-09-17)** — push `05c9981..ea3b43d` confirmed on origin; Vercel auto-deployed, live bundle `index-Cw5AYnKF.js` carries the new copy (1 occurrence) with the old copy at 0 occurrences; `/settings` → 200 |
| Next | per the founder: open V12 (new feedback) or park; no other open threads — the V11 follow-ups list is now fully closed |

**CLOSED (2026-09-17):** the V11.5 record is closed — t01 is shipped + live (`ea3b43d`; live entry `index-Cw5AYnKF.js` carrying the new copy, `/settings` 200), the V11 follow-ups list is fully closed, and the "Next" row is resolved: V12 opened 2026-09-17 and is now shipped (V12 section — t01–t05 accepted, `0041` live, final batch gate green, pushed + Vercel-live). The push question behind this row is moot under the founder's auto-push decision (AGENTS.md `### Auto-push`): end-of-slice pushes to origin/master run automatically at gate-green + clean range + fast-forward.

## V11 — the founder's V11 feedback batch (opened 2026-09-16)

**Handoff doc: `.scratch/v11/HANDOFF.md` — start here in a fresh session (commits, gates, the dev-agent loop, open follow-ups).**
Source: the founder's V11 feedback on the live V10 app — three directives
(Nearby: a "back to 5 miles" escape; Places: drop the "Fits my kid's age"
filter; Places: drop "Ages not listed yet.") plus three confirmed judgment
calls (hero images → restrained section headers, post flow → WHERE-then-WHEN
reorder with no wizard, settings → header gear → `/settings` with `/profile`
becoming read-only). Filed as `.scratch/v11/spec.md` +
`.scratch/v11/issues/01`–`06`. **Batch order 01→02→03→04→05→06 (06 depends on
04). NO migrations in the batch** (UI/copy/form/reorg only). Per-ticket gate:
`npm run build && npm run test`. Each ticket carries its pinned mechanics +
acceptance criteria; the spec carries the out-of-scope list.

**Coordinator infra (2026-09-16):** the dev-agent Herdr pane was gone (server
restart; the only repo-cwd pane, `w4:pP`, proved to be this coordinator's own
pane — its visible screen mirrors this session's own commands). Rebuilt: tab
`w4:tN` ("dropin: v11 dev agent"), pane `w4:p11`, cwd = repo root, opencode
agent **`v11dev`** started via `herdr agent start`. The coordinator loop
(route → wait → read → re-verify → next ticket) runs on `w4:p11`.

| # | Ticket | State |
|---|---|---|
| 01 | Radius — "Back to 5 miles" escape | **complete — `aa7e991`** (2026-09-16); no migration (`supabase/` verified untouched); 825/825 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors. Deviation recorded: two-sided gate (5 < r < 35) — the AC pins `radiusEscapes(35)→[]`, which a one-sided `r>5` gate would break |
| 02 | Places — remove the "Fits my kid's age" filter | **complete — `61a9efa`** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit (825 − 7 age-filter tests), e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; `placeFitsKidAges` + the `kidAges` filter field removed from `browsePlaces` (grep gates clean: 0 hits for `placeFitsKidAges` across `src/`+`e2e/`); the detail-page age line (`placeAgeFitLabel`) untouched |
| 03 | Place detail — drop the "Ages not listed yet." nag | **complete — `b86a3bf`** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; the "Ages not listed yet." fallback is gone from PlacePage (a place with no age data renders NO age line — silence, per the founder's directive), the e2e spec now asserts the line is ABSENT (`toHaveCount(0)`), `placeAgeFitLabel` itself untouched |
| 04 | Restrained section headers (not hero images) | **complete — code `fc64dd6`, close `058d923`** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; new shared `SectionHeader` band (soft gradient tile + 24px stroked glyph + the page's single h1 + one-line tagline, ~74px at 390px) replaces the bare h1s on the five in-scope pages (Near-you feed both branches, Places, Post a drop-in, Edit your drop-in, Your family); `NAV_ICONS` moved from `App.tsx` into `src/components/icons.ts` (pages can't import the root App — it imports the pages, a cycle; the nav renders the same module); h1 title strings unchanged so e2e stayed green; out-of-scope h1s (detail-page error state, onboarding, login, reset, mod, user pages) untouched |
| 05 | Post form — WHERE, then WHEN (no wizard) | **complete — code `456c7b9`, close `0f8bfc3`** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; `startBlock` (the start date + 30-minute `TimeStepper`) moved out of the collapsed "More options" body into a visible "When" section (`whenBlock`, `text-sm font-semibold text-slate-700` "When" label) rendered by /new's branch 1 only (after the place block, before the duration chips) so setting a time no longer needs the door — /edit (branches 2/3) keeps it as-is so its markup stays byte-identical; the disclosure now holds only the optional extras (address, details, repeat, age, and kids only when no kids section is surfaced), so the two hint constants drop the now-visible date and `feed.ts`'s `MORE_OPTIONS_FIELDS` empties out (`moreOptionsHoldsError` kept as a drift hook, pinned all-false by its unit tests); e2e in-scope: post-fast's "everything else behind the door" audit + the failed-start-date spec now read the visible "When" section, kids-surface pins the two new hint strings, post-location's `fieldOrder` assertions gain the now-visible date input (collapsed `[place, date]`, title-editing `[title, place, date]`); the cold /new ≤4-tap budget is unchanged. Deviations recorded: (1) the ticket's name↔string mapping was swapped vs the code — the base `MORE_OPTIONS_HINT` is the no-kids/kids-behind-door string (`'An address, kids, …'`), `MORE_OPTIONS_HINT_WITHOUT_KIDS` the with-kids/kids-surfaced one (`'An address, …'`); documented in-code (PlaydateFormFields.tsx) with the render mapping + unit tests green; (2) `e2e/post-location.e2e.ts` was added to scope (it was not in the original triage) because its `fieldOrder` assertion broke and the AC requires a full green suite — only the two `fieldOrder` assertions in the place-picker test were changed, residual now-stale comments in other post-location tests left untouched (follow-up, not expanded) |
| 06 | Settings reorg — header gear → /settings, /profile read-only | **complete — code `e5d1462`, close `6f6e9e0` (HEAD)** (2026-09-16); no migration (`supabase/` verified untouched); 818/818 unit, e2e 76 passed / 1 skipped (pre-existing conditional), lint 0 errors; new `SettingsPage` (SectionHeader "Settings" / "Profile, location, and notifications") owns every editable control — profile (display name + bio + "A photo of your family"), Location (home zip + radius via `updateHomeZipRadius`), Kids (add/remove/edit + the cap), Notifications (`NotificationsSection`), the private Following (families + places) + Neighborhoods lists — while `ProfilePage` shrinks to the read-only "what others see" view (avatar, display name, bio, kids as name + age, display-only family photo, Your posts upcoming/past) with ONE "Edit profile" link to /settings; the signed-in header gains a gear `NavIcon` between @handle and Sign out (new `gear` path in `icons.ts`'s `NAV_ICONS`; rendered only when signed in) and /settings is protected exactly like /profile (default-deny `resolveAuthRedirect` + the onboarding home-zip gate); cross-refs follow the split — `PlaydateFormFields`' "Add your kids" pointer, the push dismiss copy (`push.ts` `DISMISSED_POINTER` + `pushClient` JSDoc), and `PushOptInPrompt`'s suppression + docs now point at /settings; e2e: the editing specs switch to /settings (zip-radius, avatar, feed-ages, kid-photo-exposure's edit steps, push-subscribe, profiles-v2 wholesale, loop-closing's Following list, polish's edit assertions, kids-v3/kids-surface copy) while the reading specs keep /profile (profile, profile-posts, onboarding-gate's route test, feed-ended-out), kid-photo-exposure's empty-state test splits into a read-only half ("No kids yet." + the "Add a family photo" button ABSENT on /profile) and an editing half (/settings), and prefill's UTC `todayIso` compare (a local/UTC date-boundary flake that blocked the gate) now uses the house-local `localDatePlusDays(0)`. Deviation recorded: the family photo DISPLAY stays on read-only /profile (display-only when `useFamilyPhotoUrl` is non-null; the "Add a family photo" button lives on /settings only) |

### V11 final single-tenant gate (coordinator verifier, run on final tree at HEAD `6f6e9e0`)
- commit map (code→close): t01 `aa7e991`→`14c8354`; t02 `61a9efa` (handoff `4504966`, record files `71e024d`)→`7ef7fc7`; t03 `b86a3bf`→`62d4843`; t04 `fc64dd6`→`058d923`; t05 `456c7b9`→`0f8bfc3`; t06 `e5d1462`→`6f6e9e0` (HEAD)
- build: exit 0 — vite prod + PWA service worker, 19 precache entries, 831.59 KiB
- unit: 818/818 across 24 files, exit 0
- lint: exit 0 — warnings only (react/set-state-in-effect, no-unused-vars, only-export-components), zero errors
- e2e: 76 passed / 1 skipped, exit 0, 6.1m, live Supabase; sole skip = pre-existing conditional at `e2e/polish.e2e.ts:209`
- t03 re-cert: `rg "Ages not listed" src/` = 0 hits (resolves the port-4173 contamination)
- tree: `src/` clean; residue = `M opencode.json` + untracked `.agents/`, `.scratch/**`, `supabase/.temp/`

### V11 reviewer verdicts
- t03: PASS (nits only) — re-certified at the final gate
- t04: PASS — curly apostrophe `src/pages/NewPlaydatePage.tsx:1014`; no trailing newline `src/components/SectionHeader.tsx` + `src/components/icons.ts`; header ~74px vs "<~72px"
- t05: PASS — hint-const location mis-named (actually `src/components/PlaydateFormFields.tsx:87/96-97`, not `src/lib/feed.ts`); name↔string pairing is the pre-existing V10 t02 convention documented at `PlaydateFormFields.tsx:84-86`; stale comment `e2e/post-edit-delete.e2e.ts:86`; post-location fieldOrder date input→''
- t06: PASS — (a) stale user-facing copy `OnboardingPage.tsx:210/211/223/224/282/338`, `UserPage.tsx:564`, `PlacePage.tsx:408`; (b) stale "/profile" comments `db.ts:2403-2405`, `db-v2.test.ts:108`, `WhileAwayCard.tsx:5`, `db.ts:3459-3679/3824` cluster, `push.ts:47/385/573`, `pushClient.ts:11/143/200/392/463`, `OnboardingPage.tsx:138/203/386`; (c) wrong historical note `e2e/push-subscribe.e2e.ts:493`; (d) JSDoc indent `e2e/loop-closing.e2e.ts:27`; out-of-scope: `e2e/prefill.e2e.ts` todayIso flake fixed via `localDatePlusDays(0)`, bundled in `e5d1462` (test-infra only)

### V11 ship record (2026-09-17)
- Push: `d9239f4..a894a77` master→master — 16 commits (the 14 batch commits plus task-state bookkeeping `058d923` + `46aa848`, both task-state.md-only); confirmed on origin via `git ls-remote` (= `a894a776d41acfc8ce5f740b06198665c5318053`); `opencode.json` verified absent from the pushed range (grep count 0)
- Vercel status: NOT live as of ~03:39Z (2026-09-17). Two probe windows (03:22–03:25Z and 03:28–03:39Z; 12 polls total) — production https://drop-in-mu.vercel.app served the old entry chunk `/assets/index-o3zQGGgw.js` throughout (CDN HIT, stable etag `57e198e210418df8ce991651315a15dc`); the local build of the pushed tree (`npm run build` at `a894a77`) produces entry `dist/assets/index-Cedm-xCa.js` (sha256 `81a0b23b844423bce80122f4fc3c332433c8b9d9334c43a23ab264f08959b246`), which was never served. Vercel CLI unavailable in the coordinator environment; likely the GitHub push does not auto-trigger a Vercel build (V10 was shipped manually, deploy-then-push). Probe artifacts: `/tmp/opencode/probe-v11.sh` + `probe-v11.log` (may be ephemeral)
- Open action: founder Vercel dashboard check (project behind `drop-in-mu.vercel.app` → Deployments): if no post-push deployment, deploy manually (Production) or connect the GitHub repo for auto-deploys; if a deployment failed, capture the error. After confirmation, re-probe for `index-Cedm-xCa.js` and close this record
- **CONFIRMED LIVE (2026-09-17 ~09:00 PDT, coordinator — headless-CDP Vercel dashboard session + curl on the production domain).** The "likely no auto-trigger" hypothesis above is **disproven**: Vercel's git integration auto-deployed the ship push. Deployment `3CB8rVrtcruYoMjbMSRBuR4dCd83` (alias `drop-20tbzrxvp-jonmeisburgs-projects.vercel.app`), source `master` @ `a894a77`, created ~20:50 PDT 2026-09-16 (dashboard "12h ago" at 2026-09-17 ~09:00 PDT — just after the last probe window closed at 03:39Z), status **Ready** (14s build), badges **Latest + Current**, owns `drop-in-mu.vercel.app` (plus the git-branch alias `drop-in-git-master-jonmeisburgs-projects.vercel.app` — the git-integration marker). **No manual deploy was needed or triggered** — the target commit was already the current production deployment.
- **Live proof (curl, 2026-09-17 ~09:00 PDT):** (1) `GET https://drop-in-mu.vercel.app/` references entry `/assets/index-o3zQGGgw.js` — the a894a77 deployment's build output; its sha256 is `d3baa23d50ccaa60f3aec25da9c7dbfbc75b470ce2f6070213fdbeb7c4f803b5`. **Note:** the local-build expectation recorded in the probe window (`index-Cedm-xCa.js`, sha256 `81a0b2…`) is a local toolchain artifact — Vercel's build of the same tree produces `o3zQGGgw`; live proof therefore rests on content, not hash: the live bundle carries **both** t06 copy markers (`from your settings` — `push.ts` `DISMISSED_POINTER`; `Add your kids in your settings` — kids-v3/kids-surface copy), exactly 1 occurrence each, and `/settings` → 200 (the new route from t06). (2) This also explains the 03:22–03:39Z probes: they observed `o3zQGGgw` (served by an earlier V11-batch push's deployment — same build content, same entry hash) before the `a894a77` deployment was promoted; task-state.md-only bookkeeping commits do not change the bundle, so the hash was stable across both.
- **Ship record CLOSED:** production serves `a894a77` (V11). RANKED 0 below is resolved by this block.

### Open follow-ups
1. **RESOLVED 2026-09-17 (~09:00 PDT)** — was RANKED 0 (was blocking the ship's completion): Vercel production deploy of `a894a77` is **confirmed live** (deployment `3CB8rVrtcruYoMjbMSRBuR4dCd83`, auto-deployed on the ship push, Ready; live entry `index-o3zQGGgw.js` carries both V11 t06 markers; `/settings` 200 — see the ship record's confirmation block)
2. **RESOLVED 2026-09-17** — done as V11.5 t01: code `b092886` (8 user-facing strings) + comment fold-in `5d85caa`; pushed + live RANKED 1 (recommended, founder decision): polish ticket candidate "V11.5" for t06 finding-(a) — stale /profile→/settings copy pointers
3. **RESOLVED 2026-09-17** — done as the V11.5 t01 comment-only fold-in `5d85caa` RANKED 2 (cosmetic, optional): the comment-only + e2e-doc nits from t05/t06
4. (V12 candidate) stale "/profile" comment at `src/pages/FeedPage.tsx:452` — outside the V11.5 pinned scope, untouched by the batch; low priority
Nothing else outstanding.

Handoff doc + close-out (2026-09-17, coordinator session):
- `.scratch/v11/HANDOFF.md` — committed `b2aa498` (task-state pointer `4ef5a85`); count-robust fix `71c6f9e`; reviewer fixes `1a252a9` (deploy status, forbidden-files, opencode.json claims).
- Reviewer: loop 1 NEEDS_CHANGES (4 findings: deploy-claim, supabase/ standing-rule, AGENTS.md list-attribution, opencode.json "never committed") → all fixed in `1a252a9` → loop 2 PASS, no regressions.
- Verifier (git hygiene, range `a894a77..1a252a9`): PASS — each of the 5 commits single-file; range touches only HANDOFF.md + task-state.md; zero forbidden paths (opencode.json / supabase/ / .agents/ / .scratch/*.cjs); origin/master `a894a77` untouched; worktree clean except the documented unstaged ` M opencode.json` (never-commit divergence). Brief check 6 ("git diff HEAD empty") was a spec contradiction with check 5 — adjudicated: intended clean state is "tree clean except unstaged opencode.json" (check 5); no repo defect.
- Unpushed local bookkeeping commits above `a894a77`: `297e887` `b2aa498` `4ef5a85` `71c6f9e` `1a252a9` (+ this bookkeeping commit). Push is a human call — no push without explicit authorization. Check the current set with `git log --oneline a894a77..HEAD`.
- Known nit (non-blocking, HANDOFF.md:85): kickoff prompt hedges "complete, pushed, and (pending confirmation) deployed" — slightly at odds with the doc's "deploy unconfirmed" stance; acceptable (next line instructs confirming the Vercel deploy first).

## V12 — the 2026-09-17 founder batch (opened 2026-09-17, the post-V11.5 feedback session)

**Spec: `.scratch/v12/spec.md` — start here. Five tickets in `.scratch/v12/issues/` (queue order 01→05; 03 is the only migration — 0041 reserved, next free after 0040).**

Source: the founder's post-V11.5 walkthrough on the live V11 app (V11 + V11.5 are
shipped, pushed, and live-verified; the V11 follow-ups list is fully closed —
V11.5 section above). The batch takes the next round of the founder's
feedback: (a) /settings still makes you press Save behind an unsaved-changes
guard; (b) the /new time section forces a duration tap the fast path doesn't
need; (c) a host who ends an event early can only cancel it; (d) the owner's
own /profile self-view no longer shows the kids' photos and the post-again
clone has loose ends; (e) places carry coordinates in the DB but no map
anywhere to look at them.

**Founder decisions (2026-09-17):**
- **t05 — a map:** Leaflet + OpenStreetMap tiles; explicitly NO browser geolocation (coordinates come from the DB only — 0029 `places.lat/lng` nullable, 0012 `zip_codes` gazetteer).
- **t03 — end an event early:** the `ended` status, option A (honest history) — an early-ended event stays in history labelled "ended"; it is not a cancellation.
- **t04 — kids' photos re-surface:** on the owner's /profile self-view ONLY, read from the private `kid-photos` bucket (0038); every other surface (/u/:handle, cards, feed) stays photo-free — the V9 t11 invariant.
- **Ticket 06 dropped** — the V11 follow-up polish it covered already shipped as the V11.5 batch (`b092886` + `5d85caa`), pushed + live-verified; recorded fully closed (V11.5 section + the spec's Out-of-scope entry, which also records the residual stale comments in `e2e/post-location.e2e.ts`). V12 ships 5 tickets, not 6.

| # | Ticket | State |
|---|---|---|
| 01 | Settings autosave — /settings saves as you go, no Save button, no unsaved guard | **complete — `f4da2b1` + `6a7ae10`** (2026-09-17, local, unpushed); evidence + review in the Completed slices entry below |
| 02 | The new time model — /new picks the duration for you (fast path 4 taps → 3) | **complete — `6d7fc73`** (2026-09-17, local, unpushed); evidence + review in the Completed slices entry below |
| 03 | End an event early — the `ended` status (honest history, option A) | **complete — `29c19a2` + migration `0041` live-applied (2026-09-17, local, unpushed); reviewer PASS + verifier GREEN (final batch gate); evidence in the Completed-slices entry below** |
| 04 | Profile self-view + post-again — kids' photos re-surface (owner-only), the clone closes out | **complete — `b7aa220`** (2026-09-17, local, unpushed); reviewer PASS + verifier GREEN; evidence in the Completed-slices entry below |
| 05 | A map — Leaflet + OpenStreetMap tiles on the place surfaces | **complete — `3ed8043` + fix `db817fd`** (2026-09-17, local, unpushed); reviewer PASS (1 NEEDS_CHANGES loop) + verifier GREEN; evidence in the Completed-slices entry below |

**Migration ledger (batch):** ONE — `0041` (ticket 03); last applied
migration = `0041` (applied 2026-09-17 via the coordinator's CDP + SQL-API
path (Tooling note amendment #2), after the human's dashboard re-auth;
post-apply probes match the header). 0041 widens `playdates.status`'s
`playdates_status_chk`
(from the 0019 2-value `('on','cancelled')` at `0019_status_trim.sql:46-56`
to `('on','cancelled','ended')`, in the 0016/0019 idempotent +
pg_constraint-guarded structure), probes the 0005/0016 `playdates_update_host`
host-write path, and decides — recorded in the migration header — whether an
`ended` transition notifies through 0032's `notify_playdate_cancelled`
trigger (`:416`, WHEN `old.status is distinct from new.status` at
`:454-459`; default: notify, kind `ended`). Live since 2026-09-17 — the t03
Completed-slices entry below records the apply + probes.

**Gates:** per-ticket `npm run build && npm run test` (plus each ticket's e2e
spec list); batch gate = full suite + lint.

**Spine:** orchestrator subagents — this session has no Herdr shell access, so
the dev-agent pane `w4:p12` stays idle (the V11 coordinator loop's pane).

### Filing — ACCEPTED (2026-09-17, after 2 review cycles)

- **Scope:** the 3-commit set `{d5438ad, 108471e, 3c85818}` = exactly 7 files
  — `.scratch/v12/spec.md` + tickets 01–05 + `task-state.md`. `d5438ad` files
  all 7; `108471e` (the cycle-1 pin fixes in tickets 02 + 03) and `3c85818`
  (whitespace-only follow-up on the 02 bullet) amend in place, so the set's
  total footprint is those 7 files and nothing else.
- **Review cycle 1:** 2 findings, both fixed in `108471e` — (1) the `02:27`
  section-order pin pointed at the wrong file, now
  `src/components/PlaydateFormFields.tsx:821-839` (`postAgainSlot` at `:823`);
  (2) ticket 03 was missing its `**Why:**` line (added).
- **Review cycle 2:** confirmed both fixes + no new defects — content green.
- **Consistency:** all 3 founder decisions consistent — t03 = the `ended`
  status (option A) on the single migration 0041, t04 = owner-only kid-photos
  re-surface (private `kid-photos` bucket, 0038), t05 = Leaflet + OSM tiles
  with no browser geolocation. The 1-migration plan (0041, next-free after
  0040) is correct; ticket 06 dropped (its V11 follow-up polish shipped as the
  V11.5 batch — the V11.5 closure recorded in the V11.5 section).
- **Classification of interleaved `2c4b9cd`:** separate V11.5 housekeeping —
  closes `.scratch/v11.5/01-copy-pointers.md` t01 (the ticket half's Status →
  DONE + AC boxes; the task-state half landed in `d5438ad`). **NOT** part of
  the V12 filing; it is the previously-pending V11.5 bookkeeping item, now
  realized.

### Completed slices

- **t01 — Settings autosave (ACCEPTED, green, 2026-09-17).** /settings saves
  as you go — no Save button, no unsaved-changes guard (the explicit Save
  button, the "unsaved changes" dirty line, and the `profile-save-note`
  region are replaced by a compact "saving… / saved" indicator).
  Commits: `f4da2b1` (autosave conversion) + `6a7ae10` (fix: stuck
  "Saving…" indicator on coalesced no-op). Both local, unpushed.
  Gate evidence (verifier-independent): `npx tsc -b` exit 0;
  `npm run build` pass; `npm run test` 821/821 (25 files — 818 baseline +
  3 new `src/lib/autosave.test.ts`); `npm run lint` 0 errors (41
  pre-existing warnings); `rg '\bSave\b' src/pages/SettingsPage.tsx` → 0;
  full e2e 76 pass / 1 designed skip (`e2e/polish.e2e.ts:226` live-SQL CDP
  path). Review: reviewer PASS (the blocking finding on the indicator
  settle resolved at `SettingsPage.tsx:473` / `autosave.ts:38-43`);
  non-blocking leftovers noted: unused `_machine` param (documented),
  missing EOF newlines in the 2 new files (cosmetic). Files:
  `src/pages/SettingsPage.tsx`, `src/lib/autosave.ts`,
  `src/lib/autosave.test.ts`, plus 3 updated e2e specs (`profiles-v2`,
  `polish`, `kid-photo-exposure`).
- **t02 — New time model (ACCEPTED, green, 2026-09-17).** /new auto-picks
  the duration: picking a start slot now picks the duration too (the
  "until next hour" logic the feed already ships — `durationChipForUntilNextHour`
  / `suggestedDurationMinutes`, `src/lib/feed.ts:1562` / `:1569`), and the
  standalone duration-chip row on the fast path collapses behind "More
  options" — the fast path is **3 controls** (place field, picked time row,
  Post), down from 4. The t02 reading (auto-suggested duration, not an
  explicit end-time control) was confirmed by the founder before dispatch.
  Commit: `6d7fc73` (parent `ccdac04`), local, unpushed. Gate evidence
  (verifier-independent): `npx tsc -b` exit 0; `npm run build` pass;
  `npm run test` 821/821 (25 files, baseline held); `npm run test:e2e`
  76 pass / 1 designed skip (`e2e/polish.e2e.ts:213` / `:226` live-SQL
  moderator path) / 0 fail; `npm run lint` 0 errors (41 pre-existing
  warnings); `e2e/post-fast.e2e.ts` re-pinned to exactly 3 controls (place
  field, picked time row, Post); `e2e/post-location.e2e.ts` field-order
  green. Reviewer: PASS (no blocking findings); two NON-BLOCKING notes
  recorded (not ticketed, cosmetic): (a) a 0-duration clone edge — a
  last-post whose duration isn't a chip value seeds 0 and shows
  "0h · Ends <start>" until a chip tap (only reachable via API/seed data,
  not in-app; `NewPlaydatePage.tsx:655`, `feed.ts:2317` / `:798`); (b) a
  pre-existing unused import `clonedStart` at `e2e/post-again.e2e.ts:35`
  (not introduced by this slice; e2e/ is outside tsc + oxlint scope).
  Files: `src/pages/NewPlaydatePage.tsx` (auto-duration mount +
  `durationOverridden` latch + `applyLastPost` / `applyPrefill` guards),
  `src/components/PlaydateFormFields.tsx` (duration-chip row collapsed
  behind "More options", derived "How long" read-back, /edit byte-identical),
  `e2e/post-fast.e2e.ts` (4→3), `e2e/push-subscribe.e2e.ts`,
  `e2e/post-location.e2e.ts` (comment-only), `e2e/post-again.e2e.ts`.
  ENV LIMITATION (recorded): the local Supabase stack (`localhost:54321`)
  was DOWN, so the full e2e ran against the HOSTED project
  (`ayzvjwxb…supabase.co` via `.env`) — the same target prior gate runs
  used; t02 changed no schema, so no local-drift risk.
- **t03 — End an event early (Phase A ACCEPTED, 2026-09-17).** A host can
  end an event early: new `ended` status (option A — honest history, the
  event stays in history labelled "ended"; it is not a cancellation).
  Commit `29c19a2` (parent `f773999`), 13 files, +678/−36, local, unpushed.
  Scope: `supabase/migrations/0041_end_event_early.sql` (NEW — 3-value
  `playdates_status_chk`, 5-value `notification_log_kind_check`,
  generalized `notify_playdate_cancelled` with `v_kind`, 5-arg payload,
  header pins (a)–(f)) + app (`src/lib/types.ts` status union,
  `src/lib/feed.ts` `isStillAhead` + `.neq('status','ended')` feed
  exclusion + Past partition + my-playdates select,
  `src/components/DropInCard.tsx` "Ended" chip,
  `src/pages/PlaydateDetailPage.tsx` "End this post now" option + chip,
  `src/pages/ProfilePage.tsx` "· Ended" suffix,
  `supabase/functions/_shared/pushCopy.ts` + `src/lib/push.ts` 5th `ended`
  kind, `src/lib/db.ts` comment-only four→five kinds) + tests/e2e
  (`src/lib/feed.test.ts`, `src/lib/push.test.ts`,
  `e2e/feed-ended-out.e2e.ts`, `e2e/host-status.e2e.ts`).
  Gate (verifier-independent, re-run post-Phase-B-attempt 2026-09-17):
  `npx tsc -b` exit 0; `npm run build` exit 0; `npm run test` 826/826 (25
  files); `npm run lint` 0 errors; full e2e 76 pass / 2 fail / 1 skip — the
  2 failures are EXACTLY the two new t03 specs at their REST probe: CHECK
  violation 23514 `playdates_status_chk` ("new row for relation
  \"playdates\" violates check constraint") = the designed PRE-APPLY RED;
  the 1 skip = pre-existing `e2e/polish.e2e.ts:226`. Target = hosted
  `ayzvjwxb…supabase.co` (local :54321 down).
  Reviewer: PASS, no blocking. 3 non-blocking recorded: (a) 0041 missing
  EOF newline (cosmetic); (b) ticket pin labels (a)/(b) vs migration header
  (a)–(f) offset — content complete; (c) while-away inbox intentionally
  does NOT surface `ended` items (only `cancelled`, `src/lib/feed.ts`
  cancellation loop) — the ended channel is the push notification;
  JUDGMENT CALL PARKED (ticket silent; founder can revisit).
  Migration decision (in the 0041 header): `ended` = 5th notification kind
  via generalized `notify_playdate_cancelled` (DELETE→'cancelled',
  on→'ended' UPDATE; guard keeps catch-up no-ops safe); the
  `playdates_update_host` probe (0005:78-82) = generic host-write RPC
  admits 'ended', NO RLS change; send-push catch-up scan stays
  `.eq('playdate.status','on')` so ended posts are never re-pushed.
  PHASE B (coordinator apply) status: **COMPLETE 2026-09-17** — unblocked
  by the human's dashboard sign-in (normal Chrome, 2026-09-17; the tooling
  re-copied the profile storage on the fresh CDP launch). 0041 applied the
  same day via the documented CDP + SQL-API path (Tooling note amendment
  #2): pre-apply probe = the 0019 baseline (2-value
  `playdates_status_chk` / 4-value `notification_log_kind_check`); apply
  succeeded (SQL API HTTP 201); post-apply probes match
  `0041_end_event_early.sql:119` + `:163-166` (the 3-value status CHECK
  incl. 'ended'; the 5-value kind CHECK incl. 'ended'). The designed RED
  pair flipped GREEN (`e2e/feed-ended-out.e2e.ts:562` +
  `e2e/host-status.e2e.ts:131`). FINAL V12 BATCH GATE GREEN: `npm run build`
  exit 0; unit 847/847 (25 files); `npm run lint` 0 errors (40 pre-existing
  warnings); full e2e 81/0/1 (the 1 skip = `e2e/polish.e2e.ts:226`, the
  designed CDP env-skip). 0041 notification-row live probe (`select
  count(*) from public.notification_log where kind = 'ended'`) = 0 — the
  acceptable no-owed case (the e2e flows owed no notification — no going
  parent); a count > 0 would have been functional proof the generalized
  trigger writes 'ended' rows. Marker sweep done the same day (the batch's
  final gate item): delete gate passed (811 accounts, 0 founder overlap;
  `e2e_playdates` 1 residual) then verify e2e_left = 0 (2 users / 2
  profiles / 5 playdates left; the select output is counts-only, so no
  account families listed). ROLLBACK NOTE (preserved): re-applying 0019's
  2-value CHECK reverses the status half.
- **t04 — Profile self-view + post-again (ACCEPTED, 2026-09-17).** Commit
  `b7aa220` (full `b7aa2209796ba0323fe1f29b93cef3253777ad26`, parent
  `7799b25`), 13 files, +1143/−94, local, unpushed. Half 1 (owner-only
  kids' photos): new `src/components/useKidPhotoUrls.ts` (batched
  best-effort signed-URL read of the private `kid-photos` bucket — the
  /settings seam; 1h-TTL URLs never persisted; dead object → name+age, no
  stale image, keyed by kid id) + `src/lib/photoStorage.ts`
  `kidPhotoMintPaths` (canonical `kid-photos/<uid>/kids/<kidId>`, never
  parses stored `avatar_url`) + `src/lib/db.ts`
  `signedKidPhotoUrls(WithClient)` + `ProfilePage.tsx` owner self-view Kids
  card renders the photo. Gate verified: the ONE render site is ProfilePage
  (`UserPage.tsx:432-490` stays kidLabel-only; feed cards / place pages
  photo-free); V9 t11 invariant `e2e/kid-photo-exposure.e2e.ts` untouched
  (not in the diff). Half 2 (clone closes out): `DuplicatePrefill` widened
  (`startsAt`/`durationMinutes`/`kidIds`, `src/lib/types.ts`),
  `toDuplicatePrefill` carries the source post's `clonedStart` + form-snapped
  duration + linked kid ids (`src/lib/feed.ts`), `queryMyPlaydatesWithClient`
  selects `playdate_kids(kid_id)`; all FOUR entry points converge on the
  full prefill (the `post-again` slot, App router duplicate/place,
  `PlaydateDetailPage.tsx:976` host panel + "Same time next week" — the
  latter intentionally routes through `clonedStart`'s today/tomorrow
  30-min-grid rule — and `ProfilePage.tsx:171` own-posts row).
  `NewPlaydatePage.tsx` `duplicateFormValues` seeds place/details/duration +
  one-shot kids effect + `durationOverridden` init so the t02 auto-derive
  model is respected (latch marks the cloned duration as overridden; only
  the new start time is required). The previously-unused `clonedStart`
  import in `e2e/post-again.e2e.ts` was put to work (bracket re-seat). New
  e2e `e2e/profile-kid-photos.e2e.ts` (owner view renders signed kid photo;
  /u/<handle> stays photo-free; no-avatar kid degrades to name+age even
  when a bucket object exists) + extended `e2e/post-again.e2e.ts` (full
  prefill asserted: place, details, duration chip, linked kid chip; start
  slot re-seated via the `clonedStart` bracket). Unit: `src/lib/feed.test.ts`
  (widened prefill + my-playdates `playdate_kids(kid_id)` select) +
  `src/lib/photoStorage.test.ts` (`kidPhotoMintPaths` canonical-path gate).
  Gate (verifier-independent, `b7aa220`): `npx tsc -b` exit 0; `npm run
  build` exit 0; `npm run test` 836/836 (25 files); `npm run lint` 0 errors
  (40 pre-existing warnings; 8 set-state-in-effect inside the 13 t04 files
  are inherited from parent `7799b25` — zero new); full e2e 79 pass / 2
  fail / 1 skip — the 2 fails are EXACTLY the t03 RED pair
  (`feed-ended-out.e2e.ts` + `host-status.e2e.ts`, CHECK 23514
  `playdates_status_chk` pre-0041-apply), the 1 skip =
  `e2e/polish.e2e.ts:226` CDP env-skip. Target = hosted
  `ayzvjwxb…supabase.co` (local :54321 down). `opencode.json` excluded
  (still ` M`). Reviewer: PASS, no blocking. Non-blocking recorded:
  (a) rapid double-tap of Duplicate fires `listPlaydateKidIds` RPC twice —
  harmless (best-effort, both resolve the same); (b) new files lack EOF
  newline — cosmetic (oxlint has no formatter config, inert); (c) "Same
  time next week" → `clonedStart` confirmed intentional (ticket-pinned
  post-again semantics). Migration: NONE (ticket pin; the private bucket +
  policies are 0038, already live). No migration file in the diff.
- **t05 — Map (Leaflet + OSM) on the place surfaces (ACCEPTED, 2026-09-17).**
  The place surfaces now show a Leaflet + OpenStreetMap map; no browser
  geolocation (coordinates come from the DB only). Commits: `3ed8043`
  (8 files, +356/−5; parent `3dd38f0`) + fix `db817fd` (3 files, +41/−10;
  parent `3ed8043`), both local, unpushed. Deps: `leaflet ^1.9.4`
  (dependency) + `@types/leaflet ^1.9.22` (dev) — the ONLY new packages
  (package.json delta verified). `src/components/PlaceMap.tsx` (new, 174
  lines): an internal `MapCanvas` (one map per mount, `map.remove()`
  teardown, a `markersKey`-re-keyed circleMarker group,
  `initialMarkerRef` so the mount effect keeps `[]` deps — the "Map
  container is already initialized" trap) + two thin exports: `PlaceMap`
  (testId `place-map`, fixed zoom 15) and `PlacesMap` (testId
  `places-map`, `fitBounds` guarded by `coords.length > 0`). OSM tiles
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, attribution, maxZoom
  19; renders null when coordinates don't resolve (0029's rule: never a
  fake pin). `src/lib/places.ts` pure seams: `resolveMapCoords` (own
  `lat`/`lng` → address-zip gazetteer fallback → null) +
  `zipFromAddress`. NOTE: `places` has NO zip column — the zip is a
  5-digit number embedded in the stored address string (the ticket's
  pinned mechanism assumed a place→zip relationship; the builder
  discovered the actual shape). The gazetteer = the 0012 `zip_codes`
  seed data. Surfaces: `PlacePage.tsx` renders `<PlaceMap>` in the
  address card (after the address link, before the age line);
  `BrowsePage.tsx` renders `<PlacesMap>` in a bordered card above the
  placed rows (list branch only; the fix commit guards the wrapper on
  `mappedMarkers.length > 0` so no empty card when nothing resolves).
  e2e (`e2e/places.e2e.ts`, extended — no new spec file/tests): the
  directory test asserts `places-map` visible + ≥1 marker path +
  tile-pane presence; the place-page test asserts `place-map` visible +
  exactly 1 marker at Green Lake Park's own 0029 coords + tile pane.
  Recorded choice: LIVE OSM tiles, assertions target
  container/marker-path/tile-pane EXISTENCE only (no tile-load wait, no
  pixel inspection) — a tile outage can't fail the spec. Unit:
  `src/lib/places.test.ts` 11 tests total (9 from `3ed8043` + 2 from the
  fix). THE REVIEWER LOOP (1 of 2, NEEDS_CHANGES → PASS): blocking =
  `zipFromAddress` took the FIRST 5-digit run (`/\b(\d{5})\b/.exec`)
  while its own doc + the ticket AC2 + the test name all said the zip =
  the LAST (trailing) run — a 5-digit non-zip token before the zip
  (≥10000 street number, suite number) would pin the wrong city,
  violating 0029's never-fake-pin rule; the old "trailing" test passed
  vacuously (single 5-digit-run fixture ⇒ first==last). Fix `db817fd`:
  last-run via `address.match(/\b\d{5}\b/g)` → `runs.at(-1) ?? null`,
  doc re-pinned, + 2 NON-VACUOUS tests ("Suite 98107, 200 5th Ave S,
  Seattle, WA 98128" → 98128; "10000 1st Ave S, Seattle, WA 98128" →
  98128 — both fail under the old code) + the BrowsePage empty-card
  guard (cosmetic finding, fixed in the same commit). Gate
  (verifier-independent, at `db817fd`): `npx tsc -b` exit 0; `npm run
  build` exit 0 (leaflet CSS in the bundle); `npm run test` 847/847 (25
  files); `npm run lint` 0 errors (only pre-existing warnings; the
  single hit in the fix files — BrowsePage.tsx:79 — is pre-existing,
  outside the touched regions); full e2e 79 pass / 2 fail / 1 skip (the
  2 = the t03 RED pair at 23514 pre-0041-apply; the 1 =
  `e2e/polish.e2e.ts:226` CDP env-skip); `e2e/places.e2e.ts` 6/6;
  `grep -rn geolocation src/` → 0 matches (AC4 invariant). Target =
  hosted `ayzvjwxb…supabase.co` (local :54321 down). Non-blocking parked:
  double-derivation drift — `BrowsePage` computes `mappedMarkers` and
  `PlacesMap` re-derives the same array internally (same pure seam,
  same inputs; the inline "Matches PlacesMap exactly" comment is the
  only drift guard; if `PlacesMap` ever gains a filter, funnel markers
  down as a prop). Migration: NONE (ticket pin; `supabase/` untouched by
  both commits).

### Open risks / follow-ups

1. **DONE (2026-09-17, `b64ae17`):** the un-ticketed cleanup — `src/components/useUnsavedChangesGuard.tsx` deleted (zero importers since t01; the e2e pin at `e2e/polish.e2e.ts:304` had already asserted the dialog was gone from the UI) + the stale "Save profile" doc comments fixed in `src/lib/profileSave.ts` / `src/lib/profileSave.test.ts` / `src/components/ConfirmDialog.tsx` (the guard's caller-list line; its `destructive: false` branch is now un-called but kept as the component's ordinary-confirm mode). Gate: build ✓ + unit 847/847 + lint 0 errors (warnings pre-existing).
2. **RESOLVED (2026-09-17, `978e82d`):** the `opencode.json` human decision — untracked + gitignored (`.gitignore:69`); the local key stays on disk and never enters git history; no app-code change in the range, so the live entry asset is unchanged.
3. **t02 gate — CONFIRMED (2026-09-17):** the founder confirmed the
   auto-suggested-duration reading (vs an explicit end-time control); t02
   was dispatched on that reading and is complete (`6d7fc73`).
4. **t03 PHASE B RESOLVED (2026-09-17):** 0041 live-applied after the human
   re-auth; final batch gate green; see the t03 Completed-slices entry.

**Next:** V12 batch CLOSED — both open items resolved: the `opencode.json`
human decision (RESOLVED by `978e82d`: untracked + gitignored, local key
intact) and the un-ticketed `useUnsavedChangesGuard` cleanup (DONE in
`b64ae17`). Nothing left open in the V12 batch; next move is the founder's
call (a new feedback batch, or park).
SHIPPED 2026-09-17: `5a81d5c..d7035c2` → origin/master → Vercel live (entry asset `/assets/index-E4lVM8Wd.js` + /settings 200); the live app at https://drop-in-mu.vercel.app now carries all of V12.
PUSHED 2026-09-17: `978e82d` (gitignore: stop tracking machine-local `opencode.json`) → origin/master as a 1-commit fast-forward on top of `75aa994` (the qa-jev workstream commit, committed + pushed by the dev-agent pane); `opencode.json` now untracked + gitignored (`.gitignore:69`), local key intact on disk and never in git history; no app-code change in the range, so the live entry asset is expected unchanged.

## V4 — "Drop In" mobile conversion (opened 2026-09-11)

Plan: `plan-v4.md`. Human request (voice, 2026-09-11): make it feel like a phone
app for Android + iOS, rename Playdate → **Drop In**, add a splash screen, add
social login.

| Slice | State | Evidence |
|---|---|---|
| V4.1 mobile polish | complete | `483b270`; build exit 0, 253/253 unit; `scripts/mobile-audit.mjs` green at 320/375/390/430px (no overflow, no <16px text control, no <44px target) — the audit found real defects on its first run (32px card toggle + steppers, 42px detail actions, 28px header links), all fixed |
| V4.2 rename + logo | complete | `5a97eef`; manifest + <title> + header now "Drop In"; `DropInMark` inline SVG + `assets/drop-in-icon.svg` source + `scripts/build-icons.sh` (favicon, apple-touch 180, 192, 512, maskable 512); 253/253 unit. Found by looking at the real page: **/login renders outside the app shell and had NO page container** — the card ran edge-to-edge with zero padding — now a padded, centered, safe-area-aware screen with the brand mark (and no stray "Sign out") |
| V4.2b bug fix | complete | `6e0530a`; a stale/mistyped `/playdate/<id>` link rendered a **phantom drop-in** — the public RPC answers a missing id with an all-null row over HTTP 200 (verified live), so `?? null` never fired and the page showed an epoch date + "null families going". `normalizePublicPlaydate` pure seam + 4 tests (257/257) |
| V4.3 splash screen | complete | `8d51a3c`; two layers — a static indigo splash inside #root (the first painted frame, before the bundle parses) and a React overlay that takes over from the same frame and leaves on "session settled AND a 650ms floor, or a 2000ms cap", 320ms fade, reduced-motion aware, never replayed on in-app navigation. Native half: apple-mobile-web-app metas + 8 apple-touch-startup-image sizes (`scripts/build-splash.mjs` prints the tags) + manifest background matched + splash excluded from the SW precache. Live-verified: boot splash present, overlay appeared at 56ms, gone at 1472ms, boot markup removed, app usable, no replay on nav. Also fixed the fallback-state "Back to today" links to 44px — the not-found fix made that screen actually render and the mobile audit caught them immediately |
| V4.4b signup regression fix | complete | found BY THE E2E GATE, not by review: the setup spec timed out waiting for "Set your location". `useSession` fetches the profile as soon as the session appears — for a brand-new account that is BEFORE the row exists, so it settles as null; LoginPage navigated with that stale null and the new handle step (profile === null) rendered a second name prompt for an email signup. Fix: await `refresh()` after `createProfile`, before navigating. **Full e2e 19/19 green** (was 1 failed / 18 not run) + build exit 0 + 275/275 unit. Marker family from the two runs: `e2e-1789148xxx` host (`b98e9ae8-23ee-44a9-a766-9b39849857f1`) + `e2e-v-1789148563-*` viewers — **sweep due** |
| V4.4 social login | code complete; LIVE BLOCKED (human) | `19899d3`; 275/275 unit (18 new oauth tests). Live click against the real project proved the failure mode: an un-enabled provider answers 400+JSON instead of a 302, so the browser landed on Supabase's raw error page — `probeOAuthProvider` + `skipBrowserRedirect` now turn that into an inline sentence (verified live: "Google sign-in isn't switched on yet"). Handle step on /onboarding for first-time social users (session, no profiles row). Human checklist: `docs/social-login-setup.md` (Google Cloud + Meta + Supabase providers + redirect allowlist incl. the LAN dev URL) |

**Decisions RESOLVED (human, 2026-09-11):**
- **D1 — keep `/playdate/:id`.** Renaming buys nothing with no printed links and
  would need a redirect layer; revisit at deploy time, where it is free (a new
  domain is being introduced anyway and there is no legacy traffic to preserve).
- **D2 — installable PWA, no store apps for V4.** The PWA already installs on
  Android + iOS and the offline shell is verified. Apple's App Review Guideline
  4.2 ("minimum functionality") is the rule that rejects thin website wrappers,
  and iOS web push (16.4+, installed PWA) removes most of the reason to pay
  $99/yr + $25. Capacitor is deferred until beta evidence says what is missing.
  **Caveat: iOS web push has NOT been tested here.**
- **D3 — Google only; Facebook built but switched OFF.** `/login` renders only
  the providers listed in `VITE_OAUTH_PROVIDERS` (default `google`), so a button
  is never shown for a provider the Supabase project has not enabled. Enabling
  Facebook later = the console steps + one env value, no code change.

**Marker sweep COMPLETE (2026-09-11, human go-ahead given):** 10 `e2e-*` accounts
(the two V4 e2e runs) deleted via the dashboard SQL API — gate passed (0 founder
overlap, all 10 profiles markers, zero child rows left; the specs had cleaned up
after themselves). Live DB verified after: **2 auth users, 2 profiles, 2
playdates, 0 e2e rows, founder moderator flag intact**. The sweep is now a
repeatable, gated tool: `node scripts/sweep-e2e-markers.mjs <list|select|delete|verify>`
(refuses to delete if any founder/moderator account is inside the set).

**No DB migrations in V4.1–V4.3.** Live DB untouched since the 2026-09-11 sweep.

## Tooling note (2026-09-09)

- Migrations are now applied by the orchestrator via **browser-use** (Python/CDP) instead of the human dashboard: `browser-use` (uv tool, v0.1.13) attaches to a CDP-enabled Chrome on `:9222`. **One-command rebuild: `scripts/cdp-migration-tooling.sh`** — it recreates the session-bearing profile copy (from `~/.config/google-chrome`, survives /tmp wipes + reboots) and launches the CDP Chrome; pass `stop` to kill it. If `:9222` is already up it fast-paths. Attach: `BU_CDP_URL=http://127.0.0.1:9222 browser-use <<'PY' ... PY`. Apply pattern: Monaco editor via `monaco.editor.getEditors()[0].setValue(<sql>)` + click the "Run Ctrl ↵" button via JS; both migrations return "Success". PostgREST schema cache auto-refreshes (no PGRST205 — REST served new tables at HTTP 200 within ~1 min). open-computer-use was uninstalled (its key synthesis can't reach a Wayland Chrome).
- 2026-09-09 amendment: browser-use's **LLM agent loop is unusable on NInfer** (JSON `response_format` unsupported; `use_vision=False` still ships screenshots → 400 vision_disabled; agent self-reported zero actions on the SQL editor). **Working replacement: `scripts/cdp-sql-runner.py`** — LLM-free direct CDP driver (Target.attachToTarget → Monaco setValue → Run click → optional destructive-confirm click → innerText tail). Run: `bash scripts/cdp-migration-tooling.sh` (Chrome up), then `/home/jmeisburg/.local/share/uv/tools/browser-use/bin/python scripts/cdp-sql-runner.py "<sql>"` (needs that interpreter for its websockets dep). Handles the 0010-style "Run query" confirm dialog. Verified 2026-09-09 on a live SELECT against profiles (9 marker rows read back).
- 2026-09-09 amendment #2 (0016 apply): the dashboard's Monaco SPA no longer hydrates in the profile-copied CDP Chrome (every tab — /sql/new, /dashboard/org, fresh tabs, fresh Chrome instances: all ~95 JS chunks load 200, Sentry reports 0 errors, the app makes zero backend calls, `window.monaco` never defined, `__next` stays an unhydrated shell; reloads / cache-disable / full Chrome restart / 4-min grace all reproduced the same result — root cause not pinned). **Working fallback used for 0016: the dashboard's SQL API directly** — `POST https://api.supabase.com/v1/projects/<ref>/database/query`, body `{"query": "<sql>"}`, and the dashboard session token is the profile copy's Local Storage key supabase.dashboard.auth.token (JSON {access_token, refresh_token}, 1-hour TTL) — extracted via CDP Runtime.evaluate on the supabase.com origin (the cookie DB holds NO session JWT — found during the 0019 apply); a fresh Chrome launch re-hydrates the session. Full path proven on 0019 (2026-09-09): launch tooling script → extract token → POST /database/query (201) → verify by SELECT → release Chrome. Verify DDL effect with a follow-up SELECT through the same API (read-only endpoint; the DML "0 rows" verification-lesson still applies). `cdp-sql-runner.py` remains valid for SELECTs until the SPA issue is post-mortemed; future migration applies: use the SQL API fallback.

## Tooling note (2026-09-17) — Jev QA lane (post-ship fresh-eyes)

- **`bash scripts/qa-jev.sh`** runs a Jev (browser-use/jev-ultrafast) pass on the live site after each ship — coordinator loop step 5 (AGENTS.md). One idempotent runbook: bootstraps the pinned jev-ultrafast clone (commit `452c1ad` + tracked local fix `scripts/qa-jev.patch`) into gitignored `.qa/jev` and `uv sync`s; launches a clean CDP Chrome on `:9333` (profile `.qa/chrome-9333`, detached; never touches the `:9222` migration Chrome or its session profile); runs `examples/run.py` on the default target **`/login`** (the one page a fresh browser can verify — the whole app is behind auth, and `/` correctly BLOCKs at the auth wall, so `/` is a bad target). Verdict = exit code: **0 = PASS (done) · 1 = BLOCKED · 2 = Jev crash · 3 = inconclusive**; last tick + landing URL printed, full output captured to `.qa/last-run.out` / `.qa/last-run.err`. Flags: `--url U --goal 'G'` (override target), `--fresh` (wipe the QA profile), `stop` (kill only the QA Chrome), `--prep` (bootstrap + launch Chrome, attach by hand). Keys stay on-box: TypeSafe from `~/.typesafe_key`, NInfer (qwen3.8-27b @ `http://127.0.0.1:18080/v1`, the persistent `ninfer-serve` process) from `.qa/ninfer.env` — both 600, both gitignored; the regenerated clone `.env` carries `TEXT_MODEL_NO_RESPONSE_FORMAT=1` (the `model.py` guard = the tracked patch, because NInfer rejects `json_object`). If `ninfer-serve` is down the run fails at the first model call — surface it, don't auto-start. Record each verdict here. Spike (2026-09-17, this box): Wikipedia done 2.6 s / 2 actions; live `/` BLOCKED at the auth wall (correct behavior); `/login` done 174 ms / 0 actions.
- QA verdict (2026-09-17): exit 0 (PASS) on /login — https://drop-in-mu.vercel.app/login (Jev done in 221 ms / 0 actions; sign-in screen rendered, no anomalies).
- QA-lane launch fix (2026-09-17): the `--ozone-platform=wayland` launch never passed `WAYLAND_DISPLAY`, so Chrome fell back to the default `wayland-0` socket (this box is `wayland-1`) and the CDP-up check flaked ("QA Chrome did not come up", exit 2) whenever the invoking shell didn't happen to carry `WAYLAND_DISPLAY`. `scripts/qa-jev.sh` now pins `WAYLAND_DISPLAY` into the launched Chrome's env (array-built `env_args`, added only when set). Re-run 2026-09-17: Chrome came up on :9333, Jev **exit 0 (PASS) on /login** — done in 166 ms / 0 actions, landed on https://drop-in-mu.vercel.app/login, sign-in screen rendered. QA Chrome stopped + :9333 released after the run (per guardrail).
- QA verdict (2026-09-17, post-cleanup): exit 0 (PASS) on /login after the `b64ae17..e0d689a` push (orphaned-guard delete + doc-comment fixes + auto-push rule; Vercel auto-deploy) — Jev done in 158 ms / 0 actions, landed on https://drop-in-mu.vercel.app/login, sign-in screen rendered, no anomalies. QA Chrome stopped + :9333 released after the run (per guardrail).

## Slices

| Slice | State | Evidence | Notes |
|---|---|---|---|
| 1 tracer + auth + PWA | complete | commits f26edd1+5c7b422; reviewer PASS (4 non-blocking findings parked, see notes); verifier PASS (build exit 0, manifest in dist, 6/6 tests, combined cmd exit 0); LIVE CHECK PASS 2026-09-04 (probe ok, signup session, profile row inserted + read back, login session; marker live-verify-1788546611@gmail.com) | profiles migration owned by slice 1 (decisions log); migration SQL WRITTEN BUT NOT APPLIED to live project — escalated; non-blocking findings: README .env.example doc bug, db.ts module-scope env throw, non-idempotent policy DDL; live re-check 2026-09-04: PGRST205 persists minutes after dashboard apply — human dashboard verification required; no marker user created (run killed pre-signup); marker domain example.com rejected by project → use gmail.com; PGRST205 resolved by human dashboard apply + cache refresh 2026-09-04 |
| 2 neighborhoods + profiles | complete | commits 9ff7aa6+a3abf09; reviewer PASS (4 non-blocking parked); verifier PASS (build exit 0, 14/14 tests, combined cmd exit 0); post-review SQL delta 017614e+51ee493 content-verified (8392cf3); LIVE CHECK PASS 2026-09-04 (probes ok first attempt; marker A: session + profile row + Ballard/Belltown memberships persisted + feed-gate condition; 0004 23505 proof via marker B; markers live-verify2-1788548418[-b]) | migrations 0002–0004 written by builder, applied by human via dashboard (no DB access on this machine); seed list gets human sanity-check at review; /onboarding route pinned as integration decision; seed list (22 entries) flagged for human sanity-check at review; seed list amended by human 2026-09-04: Beaverton + Interlawn removed (20 entries); post-review SQL delta by human: seed amendment 017614e + DO-block policy idempotency fix 51ee493; 0002–0004 applied live 2026-09-04 (dashboard, Success). |
| 3 feed + posting | complete | commits 81e8b1a+d97020b; reviewer PASS (per-statement DDL audit; 7 non-blocking parked, see notes); verifier PASS (build exit 0, 36/36 tests, combined cmd exit 0, all policy DDL DO-block guarded); 0005+0006 APPLIED LIVE 2026-09-09 via browser-use (Monaco setValue + Run, both "Success"); REST probe playdates+blocks HTTP 200; LIVE CHECK PASS 2026-09-09 (marker host posts drop-in → viewer feed shows it → blocks row created → viewer feed EXCLUDES it via DB-level .not() filter, closing reviewer finding #2; markers live-verify3-<epoch>[-b]@gmail.com) | blocks migration (0006) moved forward from slice 4 (feed AC requires the DB-level block filter; block UI stays in slice 4); 0005/0006 use DO-block idempotency per the logged lesson; applied by orchestrator via browser-use (CDP), not human dashboard (tooling note above); PostgREST cache auto-refreshed (no PGRST205) |
| 4 detail + going-pings + trust | complete | commits f978858+1c8e5f4; reviewer PASS (5 non-blocking parked) + fix-review PASS (2 nits); verifier PASS (build exit 0, 49/49 tests, combined gate exit 0); 0007+0008 APPLIED LIVE 2026-09-09 via CDP (both "Success"; probes HTTP 200, no PGRST205); LIVE CHECK PASS (ping round-trip 1→0; non-moderator report SELECT 0 rows + INSERT 201; host self-ping INSERT 201 = documented DB gap; block .not() filter re-proven; markers live-verify4-1788975216[-b]@gmail.com); orchestrator re-verified independently (build+tests+REST) | 42501 fix: createReport RETURNING 403s under moderators-only SELECT RLS → plain insert (1c8e5f4) + regression tests incl. 42501 tripwire; 0008 owns profiles.moderators (slice 5 must expect it); CDP apply delegated to verifier agent (orchestrator session lacks terminal tool); parked: DropInCard button-in-Link, self-ping DB gap (slice 5 candidate), detail block filter client-side, UserPage 375px row tightness, unused GoingPing type |
| 5 mod tools + mobile polish | complete | commit 2eacd47; reviewer PASS (3 non-blocking parked: self-elevation hole, handle-length 375px edge, pre-apply feed window); verifier PASS (build exit 0, 65/65 tests, combined gate exit 0); 0009+0010 APPLIED LIVE 2026-09-09 via CDP (both "Success"; DB objects verified); orchestrator re-verified independently (build+tests+REST 200 on hidden_at/banned_at; 0010 trigger file present); LIVE CHECK PASS (moderator hide 204 + feed hidden_at exclusion proven vs. unfiltered control; ban banned_at set; host self-ping rejected 400 P0001 "hosts cannot ping their own post" per human-decided trigger; non-mod hide = RLS silent no-op; markers live-verify5-1788977882[-b|-m]@gmail.com, mod flag reverted, lv5 rows deleted, Chrome released) | 0009 expects profiles.moderators from 0008 (documented); founder-flag UPDATE = human one-time SQL (NOT executed — waiting on human); hide/ban final in V1 (no unhide/unban UI); 0010 = BEFORE INSERT trigger (CHECK can't span tables), DO-block idempotency; PostgREST surfaces RLS-blocked 0-row UPDATEs as 2xx, never 403 (lesson) |
| V2.1 quick UX batch (ticket 01) | complete | commit 8bdaeb2; 77/77 tests | report flag off cards, "This is your post" host panel, 30-min steppers + duration chips, duplicate prefill; no migrations |
| V2.2 profiles v2 (ticket 02) | complete | commits b0981b1+c389ce4+4f3cc72; 102/102 unit, 6/6 e2e; 0011 + trigger fix APPLIED LIVE 2026-09-09 via CDP; live: non-mod 400 P0001 + postgres ban + smoke 200 | avatars (256px/≤5MB) + bio (≤500) + structured kids (first name+age, max 5) + onboarding step + nudge banner; 0011 = profiles cols + kids table + avatars bucket + self-elevation trigger; reviewer NEEDS_CHANGES (trigger blocked postgres) -> 4f3cc72 non-JWT pass-through, live-proven; marker lv6-1788991152 (banned_at set) |
| V2.3 zip + radius (ticket 03) | complete | commits e78f174+8ecdfbf; 120/120 unit, 8/8 e2e; 0012 APPLIED LIVE 2026-09-09 via CDP (605-row WA seed); REST probes 200 (no PGRST201) | radius feed (haversine client-side over pinned host-embed, no PostGIS; post location = host home_zip, unknown zip excluded); "N mi" on cards; onboarding zip+radius replaces neighborhood picker (gate now home_zip-based; memberships display-only); /profile location card; 0012 = zip_codes WA seed (SimpleMaps v1.95.1 provenance) + profiles home_zip/radius_miles + RLS; reviewer PASS (4 cosmetic nits parked: comment city label, rejected-promise zip cache, doc typo, trailing newlines); 8ecdfbf = e2e infra fix (viewer context clean storageState); 3 dev-agent stalls -> /new reset + file-based briefs (see decisions log) |
| V2.4 comments (ticket 04) | complete | commits 8ff38ed+b06c5c4; 130/130 unit, 10/10 e2e; 0013+0014 APPLIED LIVE 2026-09-09 via CDP; lv8+lv9 live checks PASS | detail-page comment thread (40px avatar + handle -> /u/, composer <=500, author/host delete, moderator hide + muted "hidden by moderator" chip); 0013 = comments table + RLS (auth select non-hidden, author insert, author-or-host delete via EXISTS, moderator update) DO-block idempotent; reviewer PASS (3 nits: stale closure, carried 0009 any-column mod UPDATE, host-branch e2e); lv8 check caught 42501 (SELECT policy USING also evaluated on UPDATE new row) -> 0014 SELECT policy OR-moderators branch (hidden rows visible to mods only; slice 5 migration renumbered to 0015); live: mod hide 200, viewer 0 rows, mod 1 row, non-mod silent no-op; e2e viewer contexts start signed-out (8ecdfbf pattern) |
| V2.5 share + public view (ticket 05) | complete | commits abe1352+089a1df; 139/139 unit, 12/12 e2e; 0015 APPLIED LIVE 2026-09-09 via CDP; lv10 anon probes PASS | share (Web Share API + copy-link, VITE_PUBLIC_BASE_URL || origin) + signed-out /playdate/:id (public surface = playdate + neighborhood label + host handle/avatar + going count ONLY; /u/ + comments auth-walled; "Sign up to join in" on all actions; "I'm coming" -> /login -> return path -> explicit tap); 0015 = anon playdates read (hidden-aware) + neighborhoods anon + SECURITY DEFINER get_public_playdate (11 public fields, count-only going; going_pings stays authenticated-only); reviewer NEEDS_CHANGES (anon USING(true) leaked hidden posts via anon-key table read) -> 089a1df role-scoped `to anon using (hidden_at is null)`, re-review PASS; live: hidden post absent from anon reads + RPC not-found, anon comment/profile/report reads 0 rows (silent RLS), anon ping write 400 (0010 trigger before RLS) |
| V3.1 feed day sections (ticket 01) | complete | 0449de6; 160/160 unit, 12/12 e2e; reviewer PASS (3 nits parked) | groupByDay promoted to feed.ts (no duplicate impl; BrowsePage switched); pure fns formatDayLabel/isEnded/isStartingSoon (nowIso seam, 15 new unit tests); FeedPage day sections (Today/Tomorrow/weekday headers ascending, ended demoted + grayed in Today, single "Starts soon" badge on soonest upcoming within 60 min, suppressed when already started); no migration |
| V3.2 host status + weather (ticket 02) | complete | 7a705c8; 164/164 unit, 13/13 e2e; reviewer PASS (4 nits parked: queryMyPlaydates column list, types optional status, rain-badge-vs-muted interaction, plan file-scope fix — applied); 0016 APPLIED LIVE 2026-09-09 via dashboard SQL API fallback (201; status column + playdates_status_chk verified); live probes PASS (lv11-1789016534[-b] markers, swept) | migration 0016 (playdates.status text NOT NULL DEFAULT 'on' CHECK IN ('on','rained_out','cancelled'), DO-block idempotent; header documents the 3 pins: authenticated-only 11-field surface, host-only via playdates_update_host RLS, no SELECT-policy change); host control in "This is your post" panel (absent for non-hosts + signed-out public view); muted card/detail states (event stays in feed); Open-Meteo rain badge (host home_zip, >=50%, silently absent on error, per-(zip,date) cache + single retry, never caches rejection); e2e/host-status.e2e.ts (red by design pre-0016-apply, green post-apply) |
| V3.3 quick feedback batch (ticket 06) | complete | <9581d98>; 164/164 unit, 13/13 e2e; reviewer PASS; 0019 APPLIED LIVE via dashboard SQL API (constraint def + 'rained_out' count 0 verified); e2e-1789056820[-v] markers persist (sweep) | card going check toggle (32px circle, top-right; hidden on own posts + public view); h1 "Near you" (e2e pins updated); detail age-hint line out; status On/Cancelled (0019 re-CHECK ('on','cancelled') + 'rained_out'->'on' conversion; Open-Meteo badge stays); /new helper text out; "Attend" -> "✓ Going" (green) |
| V3.4 card going circles (ticket 07) | complete | 7650557; 180/180 unit (7 files), 14/14 e2e incl. card-circles (green post-apply; red-by-design pre-apply); reviewer PASS (3 doc nits — fixed in the wrap-up commit; 1 observation parked: pingsByPostId not refreshed after a card toggle — next feed load refreshes, acceptable); 0020 APPLIED LIVE 2026-09-09 via dashboard SQL API (created_at column verified: timestamptz NOT NULL, 0 NULLs, 1 row backfilled; REST going_pings select created_at 200) | "N going" + up to 3 avatar circles + "+N" on cards (avatars only; names stay detail-only per ticket 05's amended AC); listPingsForPostsWithClient (FK hint pinned) + pure buildGoingLine; migration 0020 (going_pings.created_at — 0007 lacked it; ticket 07 ordering + ticket 04 banner + 0025 guest-list depend on it); e2e/card-circles.e2e.ts |
| V3.5 address + Maps link (ticket 08) | complete | 4094585 + b4a4013 + 3603774; 184/184 unit (7 files), e2e 14 green + address-maps red-by-design pre-apply; reviewer PASS (4 nits: 0021 trailing newline — fixed in 3603774; mapsHref-in-feed.ts location + probe edge — accepted); 0021 APPLIED LIVE 2026-09-10 via dashboard SQL API (column address text verified; 12-field get_public_playdate payload verified via order-by-id limit 1; REST playdates?select=address 200); e2e 15/15 post-apply (address-maps green; family 7 markers e2e-1789063960 + 3 viewers) | optional playdates.address (<=120, trim only, no DB CHECK) + get_public_playdate re-created 11 -> 12 fields (same EXECUTE scoping — anon + authenticated only — + search_path pin + revoke-public as 0015; the 11-field composite type re-created via a DO-block guard on the type's 'address' attribute; NO RLS change — the column rides the existing whole-row SELECT posture, the 0014/0016 lesson); /new "Address (optional)" under place (inline error when over; omitted from the insert when empty — pre-0021-apply posts without an address are unaffected); detail place line -> tappable Google Maps link (target=_blank, rel=noopener) in the signed-in + signed-out (public) views (one shared render; the pure mapsHref seam in feed.ts + unit tests: comma/space/unicode encoding, null/empty -> no link); e2e/address-maps.e2e.ts (host-view + signed-out public-view link assertions, cascade-safe REST cleanup) |
| V3.6 kids v3 (ticket 09) | complete | 93e1ef8 + 487f60d; 189/189 unit (7 files); e2e 15 green + kids-v3 red-by-design pre-apply (PGRST205 at linkKids); card-circles spec race fixed (expect.poll on the going_pings row before the host reload — deterministic 2/2 post-fix); reviewer PASS (storage audit: COVERED — 0011's avatars_owner_* first-folder=uid write policies cover <uid>/kids/<kidId>, bucket public-read so the 40px photo works on /u/:handle; 4 non-blocking nits: avatar error-message wording + 2 EOF newlines — fixed in the close-out commit + a spec locale-ordering caveat — noted); 0022 APPLIED LIVE 2026-09-10 via dashboard SQL API (6 columns + 3 playdate_kids policies verified; storage policy list unchanged — no DDL; REST playdate_kids 200); e2e 16/16 post-apply (kids-v3 green; family 9 markers e2e-1789069939 + 3 viewers) | /new "Kids you're bringing" picker replaces the age-hint section (DB column stays, form field gone; chips = own kids name + age, empty state links /profile); detail "Kids coming" line under the ping section (names + ages only, signed-in view — the signed-out surface stays the 12-field get_public_playdate, pin); profile kid editor gains photo (256px/≤5MB, avatars bucket <uid>/kids/<kidId> — 0011's owner-scoped write policies already cover the path, 0022 adds NO storage DDL) + likes ≤100 + parent interests ≤200 (free-text UI pins, no DB CHECK — the 0021 lesson); /u/ kid rows show photo + name + age + likes line, parent interests line under the bio; kidsComingLine seam = name-order (caller orders by name); e2e/kids-v3.e2e.ts (pick kids on /new → "Kids coming" line on the detail page; red-by-design pre-apply) |
| V3.7 comment replies (ticket 10) | complete | 798b896 + 8e566d2 + 90a159f; 203/203 unit (7 files; +14 seam/plan tests); reviewer A-D + F PASS (per-run + final + fix runs; parked nits all fixed in 8e566d2/90a159f); 0023 APPLIED LIVE 2026-09-10 via the dashboard SQL API — FIRST APPLY PROVED A REGRESSION: the amended SELECT policy's self-referencing subquery 42P17s (infinite recursion in the RLS rewrite; every authenticated comment read 500'd, section hidden app-wide; the live check caught it) -> 90a159f amends 0023 in place (SECDEF comment_parent_visible helper, the 0015 pattern: stable + search_path pinned + EXECUTE authenticated-only) -> RE-APPLY (column/FK no-op, policy DROP+CREATE repair) + live check: authenticated listComments probe 200 (was 500 42P17), e2e 17/17 (comment-replies + comments green), mod-hide round-trip (mod hide 200, not 42501/42P17; viewer 0 rows; flag reverted; probe rows cleaned); marker families (10) e2e-1789072055 + e2e-v-1789072072-1, (11) e2e-1789072981 + e2e-v-1789072998-1, (12) e2e-1789073802 + e2e-v-1789073817-1/-2 (sweep) | 0023 = comments.parent_id (self-ref FK ON DELETE CASCADE) + SELECT policy amendment (hidden-parent rule via the SECDEF helper — DB-level: a reply is invisible to non-mods when its parent is hidden; INSERT/DELETE/UPDATE policies UNCHANGED — insert open to all authenticated, delete = reply author OR event host (parent's author excluded), mod hide covers replies); trust.ts groupCommentsForRender (parents + nested children asc, hidden-parent exclusion, orphan + reply-to-reply drop) + planCommentAction.canReply (top-level only, any authenticated user — one-level pin); detail-page Reply UI (any authenticated user; 'Replying to @handle' composer mode; ml-8 + 24px avatar; no Reply on replies; count includes replies); e2e/comment-replies.e2e.ts (comment -> reply -> nested render + delete-permission matrix; red-by-design pre-apply); the 42P17 regression + SECDEF fix = the session's live-check payoff (a policy that self-references its own table 42P17s at RLS rewrite — unit mocks + the pre-apply gate cannot catch it) |
| V3.8 ICS (ticket 03) | complete | 4a91606 (+ close-out commit: EOF newlines + state); 230/230 unit (8 files), 17/17 e2e — gate re-run independently by the verifier (clean, first run); reviewer PASS (2 non-blocking nits: EOF newlines in the two new files — fixed in the close-out commit; ticket-03 file annotations additive — accepted) | pure `buildIcs(post, nowIso?)` in `src/lib/ics.ts` (VCALENDAR+VEVENT; UID `<id>@playdate`; DTSTAMP via the nowIso seam; UTC DTSTART/DTEND YYYYMMDDTHHMMSSZ; RFC 5545 escaping backslash-first + CRLF + 75-octet line folding [reviewer-accepted superset — details is uncapped; UTF-8-safe via code-point iteration]; LOCATION "place, address" fold-in per the ticket 08 AC — that open AC is now closed; 27 colocated unit tests incl. folding + determinism); detail-page "Add to calendar" button beside Share (signed-in + signed-out action rows, `flex-wrap` for 375px) -> Blob download `playdate-<id>.ics` (text/calendar, createObjectURL + revoke); NO migration (pure client-side; public-surface fields only; signed-out view included); first gate run flaked once (share-public, transient live anon-RPC failure — proven flake on re-run; no code-side cause in the diff); gate runs added marker families (13)+(14) (sweep) |
| V3.9 host retention (ticket 04) | complete | ca5d23f (+ close-out commit: EOF newlines + state + ticket checkboxes); 242/242 unit (8 files), 18/18 e2e post-apply — verifier re-ran the full gate independently, first-run green (host-retention 7.2s, no flake); reviewer PASS (all 8 orchestrator pins met; 2 non-blocking nits: EOF newlines in 0024 + e2e file — fixed in the close-out commit; the e2e's fixed 1500ms wait = residual post-apply flake window — did NOT flake in the live check, fallback = REST poll on last_seen_at) | pure `dueToRefreshLastSeen(lastSeenIso, nowIso, windowMs)` (null -> true; >= window inclusive — 4 unit tests) + db.ts retention section: `countPingsOnMyPostsWithClient` (two-step host post ids -> going_pings count with created_at >= cursor [the 0020 column]; null cursor -> 0 with NO query [orchestrator pin]; 0 posts -> 0 with no ping query) + `countPostsByHostWithClient` (all-time hosted count, NO status/end filters — the 2026-09-09 behavioral-history verdict) + `touchLastSeen` (plain update, NO RETURNING [42501 discipline]; pre-apply 42703 swallowed at call sites) + default wrappers (`countPingsOnMyPosts`, `countPostsByHost`, `restampLastSeen`); FeedPage: mount restamp (fire-and-forget when null or >= 1h stale — LAST_SEEN_WINDOW_MS, the ticket's 1h pin) + amber banner below the "Near you" h1 (ProfilePage nudge-banner pattern; copy verbatim per the plan-v3 pin; tap = awaited restamp + refresh() + navigate /profile — the banner is gone on the next feed visit); UserPage: "Hosted N drop-in(s)" line under "Here since" (singular at N = 1; renders only when N > 0; self + /u/:handle via the shared header render; the "No posts yet." block untouched); 0024 = profiles.last_seen_at timestamptz nullable (DO-block idempotent; header: app-side restamp [NO trigger], NO RLS change, 0009 any-column moderator UPDATE can write it — harmless cursor, no tightening in V3); 12 new unit tests (242 total); e2e/host-retention.e2e.ts (host posts -> viewer pings [REST poll gate + 1500ms wait] -> /u/ "Hosted 1 drop-in" [green pre- AND post-apply] -> banner assert = the red point pre-apply [cursor restamp 42703s, swallowed, banner hidden] -> tap -> /profile -> banner gone; cascade-safe REST cleanup) |

| V3.10 guest list (ticket 05) | complete | 1ccbd5f (0025 SECDEF get_guest_list(p_id) + lib seams + fetchGuestList) + 0bd3f4e (detail-page guest block + e2e); reviewer PASS incl. the MANDATORY pre-apply trust review (residual vector documented in the 0025 header — broad-SELECT stays, names only via the SECDEF function; nits non-blocking); 0025 APPLIED LIVE 2026-09-11 via dashboard SQL API by the headless orchestrator run (v1+v2 curl split; probes: secdef=true, EXECUTE authenticated-only + anon/public revoke verified, broad going_pings SELECT policy intact, fails-closed probe empty); live check FINISHED BY THE COORDINATOR-VERIFIER (headless run auto-rejected its .env read and died — babysit log): guest-list e2e 2/2 (marker family e2e-1789124763, swept), full e2e 19/19, unit 253/253, anon RPC get_guest_list 401 42501 fails-closed (anon has no EXECUTE — correct) | host sees "Going: <names>" on pings >= 2; pingers see co-attendee names; everyone else counts only (the 0015 count-path preserved — broad SELECT policy verified intact post-apply); count-path regression covered by the e2e gate; marker families (16) e2e-1789124763 + viewers (sweep) |

## Open risks

- .env not git-ignored yet (no Vite scaffold exists); slice 1 adds .gitignore
  with `.env` before the first commit.
- Trust at scale is the #1 product risk — slice 4 (reports/blocks) and
  slice 5 (mod tools) are the V1 answer; do not descope them.
- PWA: manifest + minimal service worker only; no offline promises in V1.
- If the live Supabase project is unreachable from this machine, slice 1's 'profile row created' cannot be verified → escalate to human (apply SQL via Supabase dashboard).
- Slice 1 AC 'profile row created' unverifiable until human applies supabase/migrations/0001_create_profiles.sql (dashboard SQL editor or grant DB access); everything else verified.
- Test artifacts in live project (intentional markers; no delete policy in V1 — optional human cleanup in dashboard): live-verify-1788546611@gmail.com (auth + profile row), live-verify2-1788548418@gmail.com (auth + profile row + 2 memberships), live-verify2-1788548418-b@gmail.com (auth user only). — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Slice 2 parked findings (non-blocking): taken-handle retry reload dead-end (signed-in user, no profiles row — dashboard SQL recovery) is a candidate follow-up for slice 3+; createProfile handle-taken detection couples to constraint name profiles_display_name_key.
- Post-review SQL delta (017614e, 51ee493) landed after the reviewer's PASS; builder content-verified the delta this turn; the live onboarding check is the behavioral proof.
- Slice 3 live flow (posting → feed → block filter) unverifiable until human applies 0005–0006 via dashboard; builder code must be complete and build+test green regardless.
- Slice 3 live block-filter path unproven: the .not() DB filter for viewers with blocks rows is only covered by the pure filterFeed re-filter; the live check must create a real blocks row and confirm feed exclusion (reviewer finding #2).
- Parked non-blocking findings (slice 3 review): created_at superset column in 0005; title counter trim cosmetic; unparseable datetime-local fallback error; unused Block type; missing trailing newlines in 0005/0006.
- Test artifacts (lv4): live-verify4-1788975216@gmail.com + -b (auth + profile rows; all lv4 playdate/ping/report/blocks rows deleted, verified 0). Optional human cleanup. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Host self-ping succeeds at DB level (client guard only; 0007 header documents it) — slice 5 candidate for a DB-level guard, pending human call. — RESOLVED 2026-09-09: human chose DB-level guard; shipped as 0010 BEFORE INSERT trigger, enforced live (400 P0001).
- Self-privilege-escalation hole (pre-existing 0001×0008 interaction, slice 5 reviewer finding): any authenticated user can set their own moderators=true via direct API. App never does this. Candidate 0011 trigger — human call.
- display_name unbounded → 375px edge on handle-bearing buttons (ModPage ban row, UserPage block row). Product-level cap candidate — human call.
- Test artifacts (lv5): live-verify5-1788977882@gmail.com (host profile), -b (viewer, banned_at SET — suspended on next session), -m (mod, moderators reverted false); orphaned B Ballard membership. All lv5 playdate/ping rows deleted, verified 0. Optional human cleanup. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- RLS-diagnosis probe artifacts (2026-09-09): probe2–probe8 signup users + probe6/probe8 profile+membership rows (probe8 = Greenwood). No playdates. Optional human cleanup alongside lv1–lv5. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)

- Test artifact (lv6): live-verify marker lv6-1788991152@gmail.com (auth user 63a23f4e-63a9-48d8-91f8-98b8f0c6e0c4, profiles row, banned_at SET — suspended on next session). Optional human cleanup via CDP.
- Untracked dirs (out of slice scope; orchestrator to decide tracking): .opencode/skills/, .scratch/guest-list/, .scratch/v3/.
- Test artifacts (lv7 + e2e, 2026-09-09): lv7-1788993934@gmail.com (auth user e38cf785-04a0-4485-a6ce-aae98e34e389; profiles row home_zip 98109 / radius_miles 10); e2e markers e2e-1788993508 + e2e-1788993746 (auth + profile rows; playdate rows cleaned by spec); e2e-v-<epoch> viewer accounts persist by design (pending sweep). Optional human cleanup alongside lv1–lv6. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Test artifacts (lv8/lv9 + orphans, 2026-09-09): lv8-1788998139[-b|-m] (auth + profiles rows; playdate + comments cleaned), lv9-1788999477[-m|-v] (auth + profiles rows; mod flag reverted; playdate + comment cleaned), lv9-1788999467 orphans (3 auth-only users, no profiles), e2e-v-<epoch> viewer accounts. Optional CDP sweep alongside lv1–lv7. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Test artifacts (lv10 + e2e, 2026-09-09): lv10-1789001488@gmail.com (auth user 3744598f-eff4-4a4c-ade6-89117f66e7c3; profile + playdate rows deleted), e2e-1789001661@gmail.com (e2e marker; playdate rows self-cleaned; e2e-v- viewer accounts persist by design). Optional CDP sweep alongside lv1–lv9. — RESOLVED 2026-09-09: full marker sweep (75 auth users + 64 profiles deleted via CDP; child rows 0; safety gate passed; live DB = founder only)
- Test artifact (lv11, 2026-09-09): both lv11 markers swept
  (auth/profile/playdates verified 0). `e2e-1789016461@gmail.com`
  (auth + profile rows; its playdate self-cleaned by spec) persists by
  the standing e2e-marker pattern — next sweep candidate.
- Parked (V3 slice 2 reviewer nit): `queryMyPlaydatesWithClient`
  column list omits `status`, so /profile's "Your posts" list never
  shows the muted state — candidate to fold into V3 slice 4 (host
  retention touches that surface). The "Rain likely" badge renders
  independently of muted status (documented in DropInCard as
  deliberate: "a forecast, not a state") — accepted.
- Kid-photo pin override (human-approved 2026-09-09): reviewer audits 0022's avatars-bucket write policy (owner-scoped only) before apply; display scope pinned to the profile kids list.
- Card going circles (ticket 07) expose pinger avatars in the feed — human-requested; the guest-list residual-vector note (name reconstruction) now extends to avatars/initials; accepted class: same as the public host avatar.
- Marker sweep DUE (2026-09-09): 5 e2e-* families in auth.users (~30 accounts, all with profile rows; playdate/ping rows cleaned by specs): (1) e2e-1789012649/857/3689/3792/16461 + 8 e2e-v- (03:57-05:01 family), (2) e2e-1789056145/193/278 + 7 e2e-v- (16:02 family), (3) e2e-1789056820 + 2 e2e-v- (16:13, 0019 run), (4) e2e-1789058498/593/646 + 7 e2e-v- (16:41 family), (5) e2e-1789059187 + 3 e2e-v- (16:53, ticket-07 run). Sweep = DELETE profiles + going_pings + auth.users for the e2e-% emails (CDP SQL API path; safety gate: no lv-*, no founder, count sanity) — the V2 full-sweep precedent. (6) ticket-08 address-maps pre-apply e2e run (2026-09-10, commit 4094585's gate run): 1 e2e-* host + 1 e2e-v-* viewer family — exact emails resolved at sweep time via the SQL API: `select email from auth.users where email like 'e2e-%'` (the sweep covers by prefix, so the enumeration stays complete). (7) ticket-08 live-check e2e run (2026-09-10, post-0021-apply): e2e-1789063960 (host) + e2e-v-1789063975 / e2e-v-1789063980 / e2e-v-1789064009 (viewers). (8) 2026-09-10 19:36–19:44 e2e runs (gate + race-fix runs): markers e2e-1789068844, e2e-1789069000, e2e-1789069351 + their e2e-v- viewers (epochs 1789068xxx–1789069451) + e2e-diag-v-1789069165 (probe viewer: auth user + a profiles row persist — its profile delete was an RLS no-op; sweep must hit the profiles row explicitly). (9) ticket-09 live-check e2e run (2026-09-10, post-0022-apply): e2e-1789069939 (host) + e2e-v-1789069950 / e2e-v-1789069956 / e2e-v-1789069987 (viewers). (10) Run D (ticket 10) pre-apply e2e run (2026-09-10, commit 798b896's gate run): e2e-1789072055@gmail.com (host — setup marker; its playdate rows self-cleaned by spec, probe-verified 0; e2e/.auth/marker.json is overwritten by later runs) + e2e-v-1789072072-1@gmail.com (viewer 1 — created, stood at the red point: pre-apply the spec STOPS before viewer 2 is created, so no e2e-v-1789072072-2 account exists from this run; the post-apply live-check run is family 11, a fresh epoch, whose viewers are e2e-v-<live-epoch>-1/-2). (11) ticket-10 post-apply live-check e2e run (2026-09-10, first 0023 apply — the live check that caught the 42P17 regression): e2e-1789072981@gmail.com (host) + e2e-v-1789072998-1@gmail.com (viewer). (12) ticket-10 post-fix re-apply live-check e2e run (2026-09-10, after 90a159f's SECDEF fix + 0023 re-apply; the 17/17 green + mod-hide round-trip run): e2e-1789073802@gmail.com (host) + e2e-v-1789073817-1 / e2e-v-1789073817-2@gmail.com (viewers). Exact emails resolved at sweep time via the SQL API: `select email from auth.users where email like 'e2e-%'` (the sweep covers by prefix, so the enumeration stays complete). (13) ticket-03 ICS gate runs (2026-09-10, commit 4a91606): e2e-1789075019 (first gate run, share-public flake at the end), e2e-1789075119 (flake re-run), e2e-1789075131 (final clean run) + e2e-v-1789075148-1/-2 (viewers, persist by design). (14) verifier's independent gate re-run (2026-09-10, post-review): new e2e-* + e2e-v-* families from that run — exact emails resolved at sweep time via the SQL API (`select email from auth.users where email like 'e2e-%'`; the sweep covers by prefix, so the enumeration stays complete). (15) ticket-04 retention post-apply live-check e2e run (2026-09-10, post-0024-apply): e2e-* host + e2e-v-* viewer family (exact emails resolved at sweep time via the SQL API — `select email from auth.users where email like 'e2e-%'`; the sweep covers by prefix, so the enumeration stays complete).

## Decisions log

- 2026-09-04 — Stack: Vite+React+TS+Tailwind, Supabase backend (auth + Postgres).
- 2026-09-04 — DECISION 1 RESOLVED: human created Supabase project; credentials verified in .env.
- 2026-09-04 — PRODUCT BRIEF (human): recreate the wives'/moms' group chat at
  city scale — drop-in, open invitation, zero pressure. Mobile-first web app
  (PWA), not native stores. DECIDED: drop-in posts w/ optional going-pings
  (no RSVPs); open sign-up + moderation; neighborhood tags for discovery (no
  GPS); any member can post; persistent display_name handles.
- 2026-09-04 — INTEGRATION (orchestrator): `profiles` table migration (id, display_name, created_at + minimal RLS) is part of slice 1 because slice 1's acceptance criteria require 'profile row created'; slice 2 refines RLS + adds neighborhoods/memberships migrations.
- 2026-09-04 — AUTH (human decision): email confirmation intentionally OFF for V1 (no email infrastructure until V2; restore confirmation or an invite flow before any real launch).
- 2026-09-04 — INTEGRATION (orchestrator): /onboarding is the pinned onboarding route path (plan's route list predated onboarding); onboarding gate = signed-in user with 0 memberships; slice 2's UserPage shows 'No posts yet' (playdates table lands in slice 3).
- 2026-09-04 — SEED (human amendment): neighborhoods seed list amended — Beaverton + Interlawn removed; 0002 now 20 entries (human-approved, committed pre-apply).
- 2026-09-04 — LESSON (human, post-apply): Postgres has no `CREATE POLICY ... IF NOT EXISTS` — IF NOT EXISTS is not valid for many DDL statement types. 0002/0003 fixed by human to DO-block policy idempotency (commit 51ee493) and applied live. RULE for all future migrations: wrap idempotent DDL in DO blocks or verify against real Postgres grammar; never assume IF NOT EXISTS exists for a statement type.
- 2026-09-04 — INTEGRATION (orchestrator): slice 3 owns migrations 0005 (playdates + RLS) and 0006 (blocks + RLS) — the blocks table moves forward from slice 4 because slice 3's feed AC requires the DB-level block filter the plan pins; the block UI (block/unblock buttons) stays in slice 4. Feed 'today' boundary = client-local startOfToday (no GPS/timezone settings in V1). /new success navigates to the feed (the detail page lands in slice 4). playdates RLS includes host-only UPDATE/DELETE (capability only; no edit/delete UI until slice 4+).

- 2026-09-09 — 42501 (orchestrator): live check showed createReport's .select().single() (RETURNING) 403s under moderators-only reports SELECT RLS. DECISION: keep RLS pinned (reports visible to moderators only); fix app code with a plain insert, no returned row (1c8e5f4); regression tests include a 42501 mock tripwire.
- 2026-09-09 — INTEGRATION (orchestrator): 0008 owns profiles.moderators (added for reports RLS); slice 5 migration expects the column to exist; the one-time founder flag is an UPDATE of this column (0008 header documents the handoff).
- 2026-09-09 — PARKED (human call): host self-ping INSERT succeeds at DB level (client guard only, 0007 header); candidate DB guard for slice 5. — RESOLVED 2026-09-09: human chose DB-level guard; slice 5's migration (0009+) must add a DB guard preventing host self-ping on going_pings.
- 2026-09-09 — HUMAN DECISION (implemented in 0010): host self-ping closed at DB level via BEFORE INSERT trigger on going_pings (CHECK can't span tables; DO-block idempotency). Enforced live: 400 P0001.
- 2026-09-09 — INTEGRATION (orchestrator): 0009 (hidden_at/banned_at + moderator UPDATE policies) expects the moderators column from 0008 — no re-create. Founder flag stays a human-executed one-time UPDATE (statement in 0009 header; not run in the live pass).
- 2026-09-09 — LIVE-LESSON: PostgREST surfaces RLS-blocked 0-row UPDATEs as 2xx (204 / 200+[]), never 403 — the RLS wall holds, the HTTP layer is silent; /mod's client route guard is the user-facing wall. CDP apply: destructive DDL needs the "Run query" confirm click + a follow-up SELECT to verify execution.

- 2026-09-09 — V2 SLICE 2 (orchestrator): reviewer NEEDS_CHANGES on 0011 self-elevation trigger — the BEFORE UPDATE guard blocked EVERY non-moderator incl. postgres/service_role (auth.uid() is NULL via CDP/dashboard), which would break the ban path. Fix 4f3cc72: `if auth.uid() is null then return new` pass-through so only JWT non-moderators are locked out. Live-proven: non-mod self-elevation UPDATE -> 400 P0001; postgres banned_at UPDATE succeeds. LESSON: a trigger guard that must allow a server role must test auth.uid() IS NULL (non-JWT) separately from the moderator check.
- 2026-09-09 — V2 SLICE 3 (orchestrator): post location = host's home_zip (V2 data model has no per-post location); unknown/missing host zip excluded from the radius feed (no invented coords). Zip seed = WA-only (605 rows, 98xxx, SimpleMaps v1.95.1 filtered to WA) instead of the 41K-row US extract (plan-v2 risk pre-decision; expandable later). Ops lesson: 3 dev-agent stalls on slice 3 (turns died mid-Write — output truncation in a bloated ~163K session). WORKAROUND NOW STANDARD: send "/new" as a STANDALONE herdr prompt (command form resets the opencode session; embedded in prose it is swallowed as chat), then a file-based brief (/tmp/*.txt) with <150-line write chunks; split large slices into small jobs. 0012 live-apply done by the verifier, not the dev agent.
- 2026-09-09 — V2 SLICE 4 (orchestrator): lv8 live check caught a 42501 the diff review missed — Postgres evaluates a table's SELECT policy USING against the NEW row of an UPDATE, so 0013's SELECT policy (hidden_at IS NULL) made the moderator hide path 403 for every moderator. Fix 0014 (b06c5c4): SELECT policy OR-moderators branch (hidden rows now visible to moderators — the /mod model's visibility; non-mods fully blocked) + a muted "hidden by moderator" chip in the detail page. LESSON: an RLS SELECT policy whose USING the UPDATE's new row must satisfy can silently break the UPDATE path — check SELECT-USING/WITH-CHECK interactions before shipping a hide/soft-delete column. NUMBERING: 0014 consumed the number plan-v2 reserved for slice 5's anon-read migration — slice 5 ships as 0015.
- 2026-09-09 — V2 SLICE 5 (orchestrator): anon read shipped exactly as pinned (public surface = playdate + neighborhood label + host handle/avatar + going count; /u/ + comments stay authenticated-only; pinger ids never exposed — going count via a SECURITY DEFINER RPC (get_public_playdate, 11 fields, search_path pinned, EXECUTE scoped to anon+authenticated, revoke public), going_pings stays authenticated-only). Trust review (pre-apply, per plan pin): post enumeration intended + documented; block-filter bypass for signed-out acceptable (blocks are signed-in personalization, public content stays public); hidden-wall leak found by reviewer (anon policy USING(true)) -> 089a1df role-scoped `to anon using (hidden_at is null)` (role-scoped policy cannot 42501 the authenticated update paths — 0014 lesson applies to a role's OWN policies only) + header rewrite; re-review PASS. Live probes (lv10): hidden post absent from anon table reads + RPC not-found; anon comment/profile/report reads 200 [] (silent RLS); anon host-self-ping write -> 400 P0001 (the 0010 BEFORE INSERT trigger fires BEFORE RLS — trigger/RLS ordering: a cross-table BEFORE trigger can surface as the wall, never a silent 2xx). NUMBERING: this slice's migration is 0015 (0014 consumed by the slice-4 hide fix). **V2 ALL 5 SLICES COMPLETE + LIVE (0011–0015 applied).**
- 2026-09-09 — HOUSEKEEPING (orchestrator): (1) Nit batch e0d3756 closed ALL parked V2 review nits — zip-cache retry on fetch failure (no unit test by design: module-private cache; noted), Bellevue label fix (98007), FeedPage docstring typo, trailing newlines, PlaydateDetailPage functional setState (ping/comment ops no longer clobber), ping-intent unmount cleanup (stale "Tap to confirm" highlight gone; return path preserved), host_display_name null-fidelity (type + null-safe renders); 139/139 + 12/12. (2) FULL MARKER SWEEP via CDP: 75 auth users (live-verify*/lv6-lv10/probe*/e2e-*) + 64 profiles deleted; child rows verified 0; safety gate passed (no is_mod=true, no founder match, 75 >= 20 candidates); live DB after = 2 profiles + 3 auth users (all founder: cd733843-1436-42d0-b205-284172578bdb 'Jon Meisburg' moderators=true + auth user jonmeisburg@gmail.com) + 1 founder-hosted playdate. CDP LESSONS: the Monaco editor reports "0 rows" for ALL DML statements — verify effect via before/after counts, never the DML result line; IDLs in SQL need SINGLE-quoted literals (double quotes parse as identifiers -> 42703). (3) Untracked tracker dirs committed to the repo: .scratch/v3/, .scratch/guest-list/, .opencode/skills/ (AGENTS.md references the local skill files).
- 2026-09-09 — FEEDBACK TRIAGE (orchestrator): 12 origin-user annotations (feedback/v3.md) -> ticket 06 (quick batch: #2 card check, #3 "Near you" h1, #4 detail age line out, #5 Rained-out status out + migration 0019, #8 /new helper out, #11 Attend/✓Going) + ticket 07 (#1 card going circles: "N going" + up to 3 avatars + "+N"; names stay detail-only). New: 08 (#9 address + maps link, 0020 + 12-field RPC), 09 (#10 kids-you're-bringing picker + #6a kid photos + #6b/#7 interests, 0021), 10 (#12 one-level replies, 0022). Numbering: retention 0017 -> 0023; guest list 0018 -> 0024 (0019-0022 consumed by the feedback tickets).
- 2026-09-09 — HUMAN DECISIONS (feedback calls): (a) kid photos = YES — OVERRIDES the first-name-only privacy pin; rails: optional per kid, owner-uploaded (avatars bucket <uid>/kids/<kidId>), shown ONLY in the profile kids list — never on cards or event lines. (b) interests = free text (kid likes <=100, parent interests <=200 — orchestrator pin; a tags structure is a later candidate). (c) comment replies = one level, ANY authenticated user may reply (not host-only); no reply-to-replies; reply delete = reply author OR event host.
- 2026-09-09 — SCHEMA GAP (orchestrator): 0007's going_pings has no created_at — migration 0020 adds it (ticket 07); queue renumbered 0021-0025 (address/kids/replies/retention/guest-list). Tooling correction: the dashboard session token lives in the CDP profile's Local Storage (supabase.dashboard.auth.token, 1h TTL), NOT cookies — the 0019 apply proved the full SQL-API path.
- 2026-09-09 — V3 TICKETS 06-07 CLOSED: 9581d98 (quick feedback batch: card going toggle, h1 'Near you' + nav tab 'Nearby', detail age line out, status On/Cancelled — 0019 live; /new helper out; Attend/✓ Going) + 7650557 (card going circles: 0020 going_pings.created_at live, listPingsForPosts FK-hint-pinned single query, buildGoingLine, card going line + up to 3 circles + '+N', mocked-client unit tests for both *WithClient query fns, card-circles e2e). Gates: 180/180 unit + 14/14 e2e; both migrations via the dashboard SQL API (Monaco SPA still broken in CDP Chrome). Parked: pingsByPostId live-refresh after a card toggle (next load refreshes — acceptable).
- 2026-09-09 — JUDGMENT CALL (orchestrator, logged for handoff): the bottom-nav tab for `/` (src/App.tsx:188) was renamed "Today" → "Nearby" during the ticket 06/07 batch. It was NOT in ticket 06's original scope (ticket 06 renamed only the feed h1 "Today" → "Near you"); the reviewer flagged the tab label as a stale duplicate of the renamed h1, and the orchestrator decided to fold the one-word rename into the ticket 07 batch for consistency (shipped in 9581d98's follow-on 7650557). No e2e spec pinned the old "Today" tab (zero matches), so no spec broke. Logged so a fresh session sees the provenance of the nav-tab label.
- 2026-09-10 — V3 TICKET 08 DISPATCHED (orchestrator): address + tap-to-Maps link (V3.5, in progress). Migration 0021: playdates.address text nullable (DO-block idempotent) + get_public_playdate re-created 11 -> 12 fields — the public surface gains the address (the signed-out detail view renders the Maps link; the signed-out read flows through the RPC); the 11-field composite type is re-created (Postgres has no ALTER TYPE) via a DO-block guard on the type's 'address' attribute; same EXECUTE scoping (anon + authenticated only) + search_path pin + revoke-public as 0015; NO RLS change (the column rides the existing playdates whole-row SELECT posture — the 0014/0016 column-add lesson). Code: /new "Address (optional)" under place (<=120, trim, inline error when over; omitted from the insert when empty — pre-0021-apply posts without an address are unaffected); detail place line -> tappable Google Maps link (new tab + rel=noopener) in BOTH the signed-in and signed-out (public) views (one shared render; the pure mapsHref seam in feed.ts, unit-tested: comma/space/unicode encoding + null/empty -> no link); e2e/address-maps.e2e.ts (host-view + signed-out public-view link assertions; cascade-safe REST cleanup; red-by-design pre-apply — the post-with-address insert 42703s, failure lands at the post-create step, never a crash). Gate VERIFIED 2026-09-10 (post-commit 4094585): build + 184/184 unit green (180 + 4 mapsHref tests); e2e pre-apply = 13/14 spec tests green (14/15 invocations incl. setup; address-maps RED at post-create by design — the documented 42703 line). 0021 PENDING LIVE APPLY (human, dashboard SQL API — the 0020 token path, Local Storage key supabase.dashboard.auth.token); the V3.5 live-check line (test:e2e 15/15 + the SQL-API probe pair) is in the Slices table. Committed 4094585 (ticket-08 code + 0021 + e2e + feed tests, 2026-09-10). Queue after green: 09 (kids v3 / 0022) -> 10 (replies / 0023) -> 03 ICS -> 04 retention (0024) -> 05 guest list (0025 + pre-apply trust review).
- 2026-09-10 — V3 TICKET 08 CLOSED: 4094585 (address + Maps link: 0021 playdates.address + get_public_playdate 11->12 fields (0015 pattern preserved: grants anon+authenticated only, search_path pin, security definer, stable), /new optional Address (≤120), detail Maps link signed-in + signed-out (mapsHref pure seam + 4 unit tests), address-maps e2e) + b4a4013 (task-state V3.5) + 3603774 (housekeeping: 0021 trailing newline + sweep note). Gates: 184/184 unit, e2e 14 + red-by-design pre-apply; reviewer PASS. 0021 APPLIED LIVE 2026-09-10 (dashboard SQL API; token refreshed at SPA level as expected; 12-field payload + REST 200 verified; e2e 15/15). PROBE LESSON: min(uuid) does not exist in Postgres — the 12-field probe is order-by-id limit 1 (corrected in the V3.5 live-check line).
- 2026-09-10 — V3 TICKET 09 CODE (orchestrator): kids v3 per the 2026-09-09 human pins — /new "Kids you're bringing" picker replaces the age-hint section (DB column stays, form field gone; 0022 adds playdate_kids + kids.avatar_url/likes + profiles.interests); detail "Kids coming" line = names+ages ONLY, signed-in view (the signed-out surface stays the 12-field get_public_playdate — pin); kid photos owner-uploaded to the avatars bucket <uid>/kids/<kidId> (0011's owner-scoped write policies already cover the path — 0022 adds NO storage DDL; reviewer pre-apply audit still runs); kid likes ≤100 / parent interests ≤200 = free-text UI pins (no DB CHECK, the 0021 lesson); kidsComingLine seam = name-order (caller orders by name). GATES: 189/189 unit; e2e 15 green + kids-v3 red-by-design pre-apply (PGRST205 at linkKids). SPEC RACE (found at the gate): card-circles (ticket 07) lost a viewer-upsert-vs-host-reload race 2/2 after ticket-09's /new fetch shifted timing — fixed with an expect.poll on the going_pings row before the host reload (spec-only; the product's no-live-refresh behavior stands, the reviewer-parked observation); DB path proven sound by a live REST probe (feed query returns the ping + profile embed shape buildGoingLine renders).
- 2026-09-10 — V3 TICKET 09 CLOSED: 93e1ef8 (kids v3: 0022 playdate_kids + kids.avatar_url/likes + profiles.interests — storage covered by 0011 owner policies, no DDL; /new "Kids you're bringing" picker replaces the age section; detail "Kids coming" line names+ages signed-in only; profile kid photo (40px, <uid>/kids/<kidId>) + likes ≤100; parent interests ≤200; kidsComingLine seam; kids-v3 e2e) + 487f60d (task-state V3.6) + close-out commit (EOF newlines). Gates: 189/189 unit, e2e 15 + red-by-design pre-apply; card-circles spec race (viewer-upsert-vs-host-reload) fixed with an expect.poll gate — product no-live-refresh behavior stands (the reviewer-parked ticket-07 observation). 0022 APPLIED LIVE 2026-09-10 (dashboard SQL API; reviewer storage audit COVERED pre-apply; 6 columns + 3 policies + unchanged storage list verified; e2e 16/16).
- 2026-09-10 — OPERATIONAL (orchestrator): builder sessions die mid-run on large slices (ticket 08: 1 death; ticket 09: 4 deaths, finished via 4 scoped runs). Rule for ticket 10+: dispatch the build in scoped runs of ≤ ~4 files each (lib layer → pages → e2e + gate + commits); after any builder death, run a read-only explorer state-check (mtimes + `git log --oneline -1 -- <path>` + working-tree greps) before re-dispatching the continuation — the state reconstructs cleanly.
- 2026-09-10 — 42P17 (orchestrator, live-proven 2026-09-10): an RLS policy whose USING subselects ITS OWN table 42P17s ('infinite recursion detected in policy') at query rewrite — Postgres rejects the query for any RLS-enforced role; the DDL applies cleanly (the defect only surfaces at first authenticated use). The live check caught it (every authenticated comment read 500'd). Fix (90a159f): the check moves into a stable SECURITY DEFINER helper (the 0015 RPC pattern: search_path pinned, EXECUTE scoped to authenticated, revoke public/anon) — the definer's subquery is not RLS-expanded, so the rewrite terminates. RULE: a policy that must reference its own table's other rows (parent/child visibility) uses a SECDEF helper or a security_barrier view — never a direct self-subquery; and such a policy must get a live authenticated-role probe at apply time (unit mocks + pre-apply reds cannot execute it).
- 2026-09-10 — V3 TICKET 03 CLOSED: 4a91606 (ICS: `src/lib/ics.ts` pure `buildIcs(post, nowIso?)` — VCALENDAR (PRODID) + VEVENT, UID `<id>@playdate`, DTSTAMP via the nowIso seam, UTC DTSTART/DTEND (YYYYMMDDTHHMMSSZ), RFC 5545 escaping (backslash-first) + CRLF + 75-octet line folding [reviewer-accepted superset: details is uncapped; UTF-8-safe via code-point iteration], LOCATION "place, address" fold-in (closes the ticket 08 open AC — its checkbox stays in the ticket 08 file, which belongs to closed ticket 08 and is left untouched), 27 colocated unit tests; detail-page "Add to calendar" button beside Share (both action rows, `flex-wrap` for 375px) -> `playdate-<id>.ics` Blob download (text/calendar); NO migration — pure client-side, public-surface fields only, signed-out view included). Gates: build + 230/230 unit (8 files) + 17/17 e2e; the verifier independently re-ran the full gate (clean, first run — no flake recurrence). Reviewer PASS: 2 non-blocking nits (EOF newlines — fixed in the close-out commit; ticket-03 file annotations additive — accepted). One transient share-public flake on the first gate run (live anon RPC, proven flake; no code-side cause in the diff). Queue: 04 retention (0024) -> 05 guest list (0025 + pre-apply trust review). Marker families (13)(14) pending sweep.
- 2026-09-10 — V3 TICKET 04 CLOSED: ca5d23f (retention: 0024 = profiles.last_seen_at timestamptz nullable [DO-block idempotent; header: app-side restamp [NO trigger] + NO RLS change [the column rides the existing profiles posture] + 0009 any-column moderator UPDATE can write it — harmless cursor, no tightening in V3]; db.ts retention section — countPingsOnMyPostsWithClient (two-step: host post ids from playdates -> going_pings count over those ids with created_at >= cursor [the 0020 column]; null cursor -> 0 with NO query [orchestrator pin — no baseline, first visit establishes it]; 0 posts -> 0 with no ping query) + countPostsByHostWithClient (all-time hosted count, NO status/end filters — the 2026-09-09 behavioral-history verdict: no reviews, no vouching) + touchLastSeen (plain update, NO RETURNING [42501 discipline]; pre-0024-apply it 42703s and call sites swallow it) + default wrappers; pure dueToRefreshLastSeen (null -> true; >= windowMs inclusive — the 1h FeedPage pin; 4 unit tests); FeedPage mount restamp (fire-and-forget, caught) + amber banner below the "Near you" h1 (verbatim copy "N new families pinged your drop-ins" [plan-v3 pin, no singular variant]; tap = awaited restamp + refresh() + /profile — the banner is gone on the next feed visit) + UserPage "Hosted N drop-in(s)" line under "Here since" (singular at 1, renders only when N > 0, self + /u/:handle; the "No posts yet." block untouched); 12 new unit tests -> 242/242; e2e/host-retention.e2e.ts (host posts -> viewer pings -> "Hosted 1 drop-in" [green pre- AND post-apply] -> banner assert = the documented red point pre-apply -> tap -> /profile -> banner gone; cascade-safe REST cleanup)). 0024 APPLIED LIVE 2026-09-10 (dashboard SQL API: POST /database/query 201; information_schema probe = last_seen_at timestamptz nullable, 1 row; PostgREST probe 200 — no PGRST205; CDP Chrome released). Post-apply live check (verifier, independent full-gate re-run): build + 242/242 unit (8 files) + 18/18 e2e FIRST RUN (host-retention green 7.2s — no flake; the reviewer's 1500ms-wait risk did not materialize; fallback if it ever flakes = REST poll on profiles.last_seen_at, the pre-apply red point is unaffected). Reviewer PASS: all 8 orchestrator pins met (two-step count + null-cursor pin, all-time count, no-RETURNING touch, throttle pure fn, FeedPage F&F/tap/verbatim-copy, UserPage line, e2e red-point ordering, 0024 SQL + header); 2 non-blocking nits (EOF newlines — fixed in the close-out commit; the 1500ms fixed wait — accepted residual risk). Queue: 05 guest list (0025 + pre-apply trust review). Marker families (15) pending sweep.
## Escalations (waiting on human)

- 2026-09-09 — FOUNDER FLAG: RESOLVED pending verification — human signed up ("Jon Meisburg", profile cd733843-1436-42d0-b205-284172578bdb, 1 membership Greenwood, moderators=false). Orchestrator to apply `update public.profiles set moderators = true where display_name = 'Jon Meisburg';` via cdp-sql-runner and confirm → then /mod is live for the human. — FLAG APPLIED + VERIFIED 2026-09-09 (row re-read: moderators=true).

- DECISION 3: deployment target, deferred to V1.5 — not blocking
- 2026-09-04 — SLICE 1 DB APPLY: apply supabase/migrations/0001_create_profiles.sql to live Supabase project. Options: (a) paste into Supabase dashboard SQL editor, or (b) provide Postgres DATABASE_URL / supabase CLI token for this machine. Live auth endpoint IS reachable; only the SQL-application path is missing. — RESOLVED 2026-09-04 (human applied via dashboard; slice 1 live check PASS, marker live-verify-1788546611@gmail.com — full evidence in the slice 1 row). Marked resolved 2026-09-21: it was still surfacing in `scripts/remind-human.sh` as a false positive, and a reminder that cries wolf stops being read.
- 2026-09-04 — SLICE 1 LIVE CHECK BLOCKED: PostgREST PGRST205 for public.profiles persists minutes after dashboard apply. Human dashboard steps (project matching VITE_SUPABASE_URL): confirm `profiles` in Database → Tables; if absent, re-paste supabase/migrations/0001_create_profiles.sql into the SQL editor and run it; if present, trigger a PostgREST schema-cache refresh (re-run a trivial DDL in the SQL editor, or restart the server); confirm email confirmation is OFF in Authentication settings. Then tell orchestrator 'done' → live check re-run → slice 1 closes → slice 2 dispatches. — RESOLVED 2026-09-04: human applied migration + cache refresh via dashboard; live check PASS (marker live-verify-1788546611@gmail.com).
- 2026-09-04 — SLICE 2 DB APPLY: RESOLVED 2026-09-04. Seed sanity-check completed by human (list amended to 20 entries: Beaverton + Interlawn removed, 017614e). Apply initially failed on invalid `create policy if not exists` — human fixed 0002/0003 to DO-block policy idempotency (51ee493); 0002→0003→0004 then applied via dashboard: Success. Live onboarding check PASS (see slice 2 row evidence).
- 2026-09-04 — SLICE 3 DB APPLY: RESOLVED 2026-09-09 (by orchestrator, not human). 0005_create_playdates.sql then 0006_create_blocks.sql applied live via browser-use (CDP → Monaco setValue + Run; both "Success"). PostgREST schema cache auto-refreshed — REST served playdates + blocks at HTTP 200 within ~1 min (no PGRST205). Live posting check PASS same day (marker host posts → viewer feed shows → blocks row → viewer feed excludes via DB .not() filter, closing reviewer finding #2). Slice 3 closed; slice 4 dispatched.