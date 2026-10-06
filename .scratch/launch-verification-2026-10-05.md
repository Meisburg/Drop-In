# What to look at — the launch verification list (2026-10-05)

**Written for the founder, by the orchestrator.** Everything below is either
something only you can do, or something to check once the 16 unpushed commits are
live. Every number here was measured on this tree today; where a measurement has a
method, the method is named so you (or the next agent) can repeat it.

---

## 0. THE ONE WORD THAT UNBLOCKS THE MOST

**`src/pages/FeedPage.tsx`, `src/components/LocationModal.tsx` and `src/index.css`
are one session's uncommitted work, and THREE ready fixes are stuck behind them:**

| # | Fix | State | Where it is stuck |
|---|---|---|---|
| 1 | **Your feed-map request** — *"when I click the map button, I expect a map to populate even if there's no drop-ins… Otherwise it seemed like this feature is broken"* | **built, in no commit** | `FeedPage.tsx` (the "A MAP VIEW MUST PRODUCE A MAP" branch) |
| 2 | **The location note's wording** — *"I'm not sure why it says location is off for a drop-in… I don't see in the settings where you turn it off or on either"* | **written, reverted rather than half-shipped** | `LocationModal.tsx:203` |
| 3 | **A 44px-floor break on the feed** — the *"See past drop-ins"* link measures **133×19**, found by the audit lane on a populated feed | **one line, not applied** | `FeedPage.tsx:1564-1571` |

Say **"commit those files"** and all three land (this session will commit them as
their own slice, with the other session's work intact and credited). Say nothing and
all three stay invisible — which is the exact complaint you brought at 2796/2809:
the work is done and you cannot see it.

---

## 1. WHAT TO CHECK ON THE DEPLOYED APP, AFTER A PUSH

Nothing below is live yet: `origin/master` is **16 commits behind** this tree.
After a push (and a hard refresh, or after clearing the PWA cache if it looks
stale — the served bundle is the test, not the filename):

1. **The map, on `/browse`** — tap **Map**. The map must open on the **focused
   place with its pin in the middle of the pane**, not on your home pin. (Before:
   it centred on your home pin and often showed none of the place's pins.)
2. **The radius has one door** — the *Distance* pill is gone from `/browse`. The
   radius is set by the **Location** control beside the search field, and changing
   it must still narrow/widen the list (measured 117 → 239 rows).
3. **First run, on a NEW account** — the first lightbox must ring the **Drop Ins
   icon at the bottom left** of the nav. (Before: it rang the *"Near you"* heading
   at the top of the page.) The tour only shows on a fresh signup through the
   onboarding run, so use a new email.
4. **Your profile's Past list** — with **6+** past drop-ins: **5 compact rows**,
   then a real **"Show N more"** button; month headings with counts once it is
   long; **no maps row** on a past row. (Before: up to 50 full cards ≈ 5,500px and
   a dead *"+N older"* line.)
5. **Settings on your phone** — `/settings` is now an **index** (Notifications ·
   Near you · Following & saved · **Privacy & safety** · Appearance · Account);
   tapping one opens just that category with a back control. On a desktop window
   it is a **left pane** with the body beside it. Nothing inside a category changed.
6. **A place page** — it should show **what parents say** (the rating and up to
   three review bodies) with **one button** opening a lightboxed compose modal.
   (This is the slice building now; if it is not in the push, it comes next.)

## 2. THE POST-PUSH VERIFICATION NOBODY HAS RUN

The nightly live e2e lane (`gh workflow run e2e-scheduled.yml`) checks out
`origin/master`, so **it can only measure what is pushed** — which is why it has
not been re-run for any of this work. Once you push, **dispatch it once**: it is
~200 specs against the live database on a clean runner, and its last recorded run
(`37329038488`) was down to three known failures. It is the closest thing to a
whole-app regression check this repo has.

## 3. WHAT IS YOURS ALONE (measured today, so the numbers are real)

1. **The sweep** — **"sweep it"** covers two actions and both are still safe:
   **2,447 marker rows / 1,210 accounts** (re-measured 2026-10-05 22:30 with the
   sweep tool's own query builders; it was 1,620/801 earlier the same day, and it
   grows with every test run), `founder_overlap: 0`, and the **five duplicated
   place rows still have zero references** (0 playdates, 0 reviews, 0 comments,
   0 follows across all ten ids). It also removes the three stray marker
   `playdates` rows, one of which is currently defeating a spec.
2. **The 25 unreviewed photos** — stored, hidden from parents until a moderator
   confirms them. Live counts right now: **239 places, 152 confirmed, 25
   unreviewed, 62 with no photo**. `git log` and `docs/RELEASE-CHECKLIST.md` say 26;
   **25** is what the database says as of today.
   They are, in full (name · kind), so you can work the list without opening the
   moderator tool to find them:
   Bayview-Kinnear Park · playground · Beacon Hill Playground · playground ·
   Benefit Playground · playground · Delridge Community Center · other ·
   Delridge Playfield Wading Pool · splash_pad · Dr. Blanche Lavizzo Park ·
   playground · E Queen Anne Playground · playground · Flo Ware Park · playground ·
   Froula Playground · playground · Gilman Playground · playground · Hoa Mai Park ·
   playground · International Childrens Park · playground ·
   International District Community Center · other · Madison Pool · pool ·
   Meadowbrook Community Center · other · Rainier Beach Pool · pool ·
   Rainier Community Center · playground · Rainier Playfield · playground ·
   Rogers Playground · playground · Ross Playground · playground ·
   South Park Community Center · other · South Park Playground · playground ·
   Van Asselt Playground · playground · Victory Heights Playground · playground ·
   Westcrest Park · playground.
   ⚠️ **ONE THING TO DECIDE WHILE YOU LOOK: two of them share ONE SOURCE PHOTO.**
   `Delridge Community Center` and `Delridge Playfield Wading Pool` both point at
   `flickr.com/photos/29056926@N02/4604211764` — the same picture would appear on
   two different place pages. They are adjacent facilities in one park, so one
   photo may well be right; it is flagged because you are the one who can decide it,
   and confirming both silently ships the same image twice.
3. **The 62 blank places** — no free photo exists anywhere, and the worklist is
   still exact: the report's 62 names and the database's 62 blanks are the **same
   set** (compared name by name today, zero in either direction). The sourcing
   report lists them (`.scratch/place-photo-sourcing/report.md`, §"No candidate").
4. **Rotate the old GitHub token** — it is already out of `.git/config` (origin is
   SSH; re-read today, zero credential material) and the transport no longer uses
   it. Only the revoke remains, and only you can do it.
5. **The child-data posture (0.2)** and the four paid native decisions — unchanged
   from the release checklist.

## 4. TWO HAZARDS FOR WHOEVER RUNS A CHECK NEXT

- **`scripts/signed-in-audit.mjs` defaults to `http://localhost:4180`**, and this
  box has had a **stale `vite preview` on `:4180` since 17:07**. A bare
  `node scripts/signed-in-audit.mjs` therefore measures an hours-old build and
  reports failures that do not exist in this tree — which it did, once, to me.
  Always pass `E2E_BASE_URL=http://localhost:4191` with your own preview.
- **A filtered e2e run never refreshes the marker token.** Name
  `e2e/auth.setup.ts` in the filter or the run drives the app with the last full
  run's session, whose Supabase access token expired after **3,600 s** — and the
  failures read as product bugs (`HTTP 401 PGRST303 "JWT expired"`). Full write-up
  and the spec that would fix it: `.scratch/e2e-marker-token/spec.md`.
