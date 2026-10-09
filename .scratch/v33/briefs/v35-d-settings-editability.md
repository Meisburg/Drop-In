SENTINEL: V35-D-SETTINGS-EDITABILITY-R9F3

Slice v33-8. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/settings-editable-r9f3 -b settings-editable-r9f3 HEAD
Work only there; commit on branch settings-editable-r9f3; never touch main or another lane's path.

FOUNDER RULING: on Settings, a field is EDITABLE when it is a fact about the parent; it is READ-ONLY when it is computed, contractual, or moderation-controlled - and when it is read-only, the UI SAYS WHY in one short line. Log out moves to the BOTTOM of the page.
WORK:
1. Apply that rule to the settings page: each editable field stays an input; each read-only field renders as text, not a disabled input, with ONE short line saying why it is not editable (e.g. "Set when you signed up", "Changed by our moderators").
2. Do not invent a reason: derive it from what the field actually is. If you cannot state a true reason for a read-only field, leave it editable and say so in the report.
3. Log out is the LAST control on the page.
4. Read-only: the settings page, whatever lib/ seam computes those fields, and the settings spec. Edit first, verify after.

ACCEPTANCE: (a) an editable fact is still an editable input and its value round-trips (save, reload, read back); (b) at least one computed/contractual field renders as read-only TEXT with a non-empty reason line (assert the reason's text); (c) Log out is the last element (assert by geometry/order); (d) every control >=44px; (e) the settings spec changes in the SAME diff if it located removed inputs.

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be FULLY green — no waivers. Specs on a private port 4210-4218. Stage BY PATH ONLY.
Report .scratch/v35-d-report.md, then reply:
Sentinel: V35-D-SETTINGS-EDITABILITY-R9F3
Status: DONE | BLOCKED
Commit: <sha7>
