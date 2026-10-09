SENTINEL: V35-A-REVIEWER-AVATAR-K3D7

Slice muzk8c1g. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/rev-avatar-k3d7 -b rev-avatar-k3d7 HEAD
Work only there; commit on branch rev-avatar-k3d7; never touch main or another lane's path; never push.

FOUNDER RULING (verbatim): "in a message thread, show the other person's profile photo in a circle to the LEFT of their name. That is the conventional messaging pattern."
Surface: the REVIEWER row on a place's reviews (a place review card). The founder wants the reviewer's face left of their name there too, and the name to LINK to that person's profile.

WORK:
1. Avatar circle immediately LEFT of the reviewer's name, reusing the app's EXISTING avatar primitive. Do NOT edit that primitive — if you believe it must change, report BLOCKED with the reason.
2. The name is a link to that person's profile. Find the profile route already in use in this app (grep for the existing profile link, e.g. /u/ or /profile) and reuse it. If no profile route exists, report BLOCKED rather than inventing one.
3. No-photo reviewer -> the primitive's placeholder initial, never a broken image.
4. Read-only: src/pages/PlacePage.tsx (review card markup), the avatar primitive, the existing profile-link usage, e2e/place-reviews.e2e.ts. Edit first, verify after.

ACCEPTANCE:
1. Avatar box is LEFT of and vertically aligned with the name box - asserted by GEOMETRY, not DOM order.
2. The name is a link whose href is the reviewer's profile route (assert href, and that it navigates).
3. No-photo reviewer renders the initial placeholder (own assertion).
4. 390px: documentElement.scrollWidth <= clientWidth + 1.
5. Every spec that located the reviewer row changes in the SAME diff.

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be FULLY green — no waivers. Specs on a private port 4210-4218 (mint marker there; kill by port/PID). Stage BY PATH ONLY.
Report .scratch/v35-a-report.md, then reply:
Sentinel: V35-A-REVIEWER-AVATAR-K3D7
Status: DONE | BLOCKED
Commit: <sha7>
