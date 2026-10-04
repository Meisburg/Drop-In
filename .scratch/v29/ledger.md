# V29 batch ledger — append-only, one line per event

Trust defects from the 2026-10-04 external review triage. Plan: `plan.md` (V29),
r3 preserved at `plan-v28-r3-backup.md`. Tickets: `.scratch/trust-defects-2026-10/`.

    V29 planned (base 580eb82, tree dirty): 11 slices + v29-0 precondition;
      gate exit 0 — 73 files / 2121 tests / 81 warnings / 0 errors / guards 185 PASS
    V29 v29-0: not started — pre-batch WIP (6 modified tracked files) still unstaged,
      by design: committing another session's in-flight work needs the human's word
    V29 v29-1: dispatched inline (DSH session; the opencode orchestrator-* lane is
      unavailable — the deviation V27/V28 recorded) at base 580eb82+dirty
    V29 v29-1: complete (commit dbb02cb) — signup is no longer a push trigger point.
      PushPromptTrigger = 'post_created' | 'ping_saved'; LoginPage's arm call and
      import gone; a legacy stored 'signup' parses away to nothing
    V29 v29-1: gate EXIT=0 — 73 files / 2122 tests / 81 warnings / 0 errors /
      GUARDS PASS (185) — .scratch/v29-verify.txt
    V29 v29-1: e2e/push-subscribe.e2e.ts 9 passed (EXIT=0, 45.4s) —
      .scratch/v29-1-e2e.txt; the signup test now asserts the opposite, and the
      post/ping baselines are stronger (no card to answer first)
    V29 v29-1: fixture residue RECORDED, not deleted — sweep select shows 6 marker
      profiles/users + 1 kid (13 rows total). Per the fixture convention this is the
      sweep's job, and the destructive step needs fresh human confirmation
      (plan.md:769-771). The spec swept its own playdate + subscription rows after
      every test ("[e2e cleanup] ok"), so the residue is the marker ACCOUNT, which
      is what accumulates between sweeps by design
    V29 v29-2: complete (commit 21fb9c4) — the card may only claim what it read.
      goingPingsLoaded defaults FALSE; ProfileView/PlacePage/PlaceDetailsPage now
      fetch pings (listPingsForPosts) and pass them; every failure path keeps
      null rather than {} — including the FEED's, which used to turn a failed
      ping read into "No one's going yet". goingPingsByPost (lib/feed, pure,
      sibling tests) is the one grouping rule
    V29 v29-2: gate EXIT=0 — 73 files / 2125 tests / 81 warnings / 0 errors /
      GUARDS PASS (.scratch/v29-2-verify.txt); e2e card-circles + profile-posts
      3 passed (.scratch/v29-2-e2e.txt), the new assertion being the host's OWN
      PROFILE card showing "1 going" and never the absence sentence
    V29 v29-3: complete (commit 85a9e59) — the "Posted!" banner is consumed on
      mount (replace, same URL, no state) and renders from a mount-time snapshot,
      so reload/back/forward cannot re-announce the post. The comment that claimed
      "never persisted" was the bug's alibi and is corrected. The title now links
      to the drop-in it announces
    V29 v29-3: gate EXIT=0 — 73 / 2125 / 81 / 0 / GUARDS PASS
      (.scratch/v29-3-verify.txt); e2e share-after-post 3 passed
      (.scratch/v29-3-e2e.txt), including a NEW test for the reload WITHOUT
      dismissing first — the case the old spec structurally could not see
    V29 v29-6: measured before opening the editor — NO new query is needed.
      listRadiusFeed already fetches every upcoming post and filterFeed discards
      the ones outside the radius, so the count is in the same fetch; what must
      change is listRadiusFeed's RETURN SHAPE (one caller: FeedPage:549; no test
      mocks it). Recorded in plan.md so the next round does not re-derive it
    V29 v29-6: complete (commit 5b74862) — the empty state says what is further
      out. listRadiusFeed returns { posts, beyondRadiusCount }; the count runs the
      SAME filterFeed at RADIUS_MAX_MILES and subtracts, so it can never promise
      what a blocked host / ended post / unplaceable post would hide. No new query
    V29 v29-6: gate EXIT=0 — 73 files / 2132 tests / 81 warnings / 0 errors /
      GUARDS PASS (.scratch/v29-6-verify.txt); e2e feed-empty-state 7 passed
      (.scratch/v29-6-e2e.txt). The new rendered test uses a SECOND account
      posting from 98007 (outside the marker's 5-mile radius) ON PURPOSE: v29-7
      makes own posts visible at any distance, so a marker-hosted far post would
      have stopped producing an empty state the moment v29-7 landed
    V29 v29-7: complete (commit 19ac6e4) — filterFeed gains ownProfileId; an own
      post is exempt from the radius and from NOTHING else (blocked, hidden,
      ended, unplaceable all still excluded — the exemption is about DISTANCE)
    V29 v29-7: gate EXIT=0 — 73 / 2135 / 81 / 0 / GUARDS PASS
      (.scratch/v29-7-verify.txt); e2e zip-radius 4 passed, feed-empty-state 7
      passed (.scratch/v29-7-e2e.txt)
    V29 v29-7: FIRST ATTEMPT FAILED and the failure was instructive — the place
      directory is RADIUS-FILTERED from the viewer's own profile, so a 1-mile
      radius left the picker with no rows to pick. The test now patches WIDE (35),
      posts at the furthest seeded place (~12.5 mi, Lakeridge Park), then patches
      NARROW (1) and reloads. Recorded because the next spec that drives the
      directory inherits this fact
    V29: FIXTURE RESIDUE — every e2e run adds one marker ACCOUNT (the spec sweeps
      its own playdates/subscriptions; the account is the sweep's job and the
      destructive step needs fresh human confirmation, plan.md:769-771)
    V29 v29-0: HALF DONE (commit c6935a3) — the impeccable-live injector is gone
      from index.html and dist. FORCED: with the impeccable server up, its toolbar
      (26px buttons, 11.5px inputs, sub-14px labels) rendered on every audited
      page, so mobile-audit's numbers were unreadable on every route and viewport
      and the new v29-4 guard could not be trusted. The other half — committing
      the pre-batch WIP — is still the human's call
    V29 v29-4: complete (commit 9a2c3c4) — the create-account control fits a
      portrait phone; the audit can now catch it. PROVEN ABLE TO FIRE FIRST: the
      new guard reported exactly `below the fold: button "New here? Create an
      account" 640–692 vs viewport 664` and nothing else on all four passes
    V29 v29-4: gate EXIT=0 — 73 files / 2135 tests / 81 warnings / 0 errors /
      GUARDS PASS (.scratch/v29-4-verify.txt); audit EXIT=0 across 7 viewports x
      light/dark x 3 routes (.scratch/v29-4-audit-after.txt); e2e privacy-preview
      + signup-zip-fallback 12 passed (.scratch/v29-4-e2e.txt)
    V29 v29-4: DESIGN NOTE recorded in the guard — landscape phones LEGITIMATELY
      scroll. The check makes two claims: portrait on a one-screen page must fit
      (product context: PRODUCT.md's one-handed portrait phone), and EVERY
      viewport must be reachable by scrolling. Demanding a full sign-in form fit
      390px of height would be a worse design, not a better one
    V29 v29-8: complete (commit eb3840b) — the first screen says what Drop In is.
      One-line copy in both slots so the v29-4 height budget survives, re-verified
      by the audit in the same commit. New spec e2e/login-first-screen.e2e.ts
    V29 v29-8: gate EXIT=0 — 73 / 2135 / 81 / 0 / GUARDS PASS
      (.scratch/v29-8-verify.txt); e2e login-first-screen + signup-zip-fallback
      12 passed (.scratch/v29-8-e2e.txt)
    V29 v29-5: complete (commit 0708fee) — the bare '@' leaves the /new help text
      and a small-hours start says so. THE RULE IS A NOTE, NOT A REFUSAL, and it
      is deliberate: a validator that refuses a legal post is a dead end, and it
      also keeps the rule wall-clock-safe for every existing spec (a suite run at
      02:00 still posts with the default). Gate EXIT=0 — 73 / 2139 / 81 / 0 /
      GUARDS PASS; e2e time-presets + place-directory-in-new 7 passed, including a
      NEW test that fakes the clock to 02:00 (setFixedTime: Date only, timers and
      network stay real) and pins BOTH halves: the note appears, and the post
      button stays enabled
    V29 v29-10: complete (commit 9ca30d0) — sign out moves from the header into
      Settings → Account, beside Download and Delete; the header keeps the gear and
      /login keeps its own Sign out. New spec e2e/sign-out.e2e.ts. Gate EXIT=0 —
      73 / 2139 / 81 / 0 / GUARDS PASS; e2e sign-out + loop-closing 3 passed
    V29 v29-10: the TRAILING-NEWLINE GUARD caught the new spec on the first run
      ('e2e/sign-out.e2e.ts — no newline at end of file'). Fixed the file, not the
      guard. Recorded because it is the deterministic lane doing exactly its job
    V29 v29-9: complete (commit 8877ffb) — the area card: the privacy promise moves
      to the field, and ZIP becomes a PEER (always rendered, directly under the
      address) instead of a fallback unlocked by an address FAILING.
      SUPERSESSION RECORDED: task-state.md:56 ('address with ZIP fallback') and the
      2026-09-25 first-use spec's scope are superseded by the founder's 2026-10-04
      decision; the geocode path, the default, and ZIP-sufficiency are NOT. Gate
      EXIT=0 — 73 / 2139 / 81 / 0 / GUARDS PASS; e2e signup-zip-fallback +
      onboarding-resume 14 passed, including a new peer-path test
    V29 v29-11: STARTED (base 580eb82, head at close) — ALL TEN IMPLEMENTATION
      SLICES ARE DONE. Full suite running; ocr is NOT INSTALLED on this box (not on
      PATH, not in node_modules/.bin) so the third lane cannot run — a recorded
      deviation of the same class as the missing orchestrator lane, NOT a pass
    V29 v29-11: FULL SUITE ROUND 1 — 167 passed, 17 FAILED, 2 skipped (29.7m).
      Diagnosed, not accepted: a pre-batch worktree at 580eb82 was set up and the
      failing specs PASSED there, so the failures were THIS BATCH's, not inherited
      flakes. Two causes, both mine:
        (1) v29-3 linked the "Posted!" banner's TITLE, and the suite's
            a:has-text(title) idiom then matched the banner instead of the card in
            ~11 specs (avatar, feed-ages, kid-names-privacy, places, post-fast,
            post-location, sticky-post, time-presets, weekly-series, while-away,
            zip-radius). Fix: a distinct "View" link with its own label.
        (2) the sign-out spec signed the MARKER out; supabase.auth.signOut()
            revokes the refresh token GLOBALLY, so the saved state every later
            spec reads was dead and ~15 specs failed on /login. Fix: a THROWAWAY
            account in its own context.
    V29 v29-11: the previously failing specs re-run — 28 passed, EXIT=0
      (.scratch/v29-11-rerun.txt). Commit 241c5c3.
    V29 v29-11: ocr lane UNAVAILABLE — `ocr` is not installed on this box (not on
      PATH, not in node_modules/.bin). Recorded as a deviation, never as a pass:
      the two lanes that DID run are the verifier (npm run verify + the full
      suite) and my own adjudication of the failures.
    V29 v29-11: FULL SUITE ROUND 2 (after 241c5c3) — 181 passed / 3 failed /
      2 skipped, 20.1m (.scratch/v29-11-full-e2e-2.txt). The three failures are all
      places.e2e.ts (Leaflet), and ALL THREE ARE EXONERATED WITH EVIDENCE:
      :917 and :1674 FAIL AT THE BASE COMMIT 580eb82 (throwaway worktree, since
      removed), and :2792 passes in isolation both at HEAD and at base.
    V29 v29-11: marker residue at close — 264 marker profiles/auth.users + 5 kids
      (533 rows), every CONTENT table at zero. Delete needs human confirmation.
    V29: BATCH COMPLETE. 10/10 tickets. Residual, human-owned: v29-0's WIP commit,
      the destructive sweep, .vercel-env-tmp.json + token rotation, the form-draft
      decision, the 5-parent test.
