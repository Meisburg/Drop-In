SENTINEL: V37-C-AGE-FIT-ON-CARD-R8W5

Slice C (v37): a parent can see whether an outing fits their child's age WITHOUT
opening it - the age range is on the feed card, not only the detail page. OWN WORKTREE,
unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/age-fit-card-r8w5 -b age-fit-card-r8w5 HEAD
Work only there; commit on branch age-fit-card-r8w5; never touch main or another lane's path.
DO NOT edit AGENTS.md, CONTEXT.md, docs/RELEASE-CHECKLIST.md or vite.config.ts - those are the orchestrator's.

WHY (the founder's own usability review, verbatim):
"and show age fit more clearly on outings."

WHAT EXISTS ALREADY - reuse, do not rebuild:
- The detail page ALREADY states the authoritative age range: PlaydateDetailPage.tsx
  uses `statedAgeRangeLabel` from the pure seam `statedAgeRangeLine(age_min, age_max)`
  (~line 1755). READ IT FIRST. The label logic, the "nothing stated" case, and the
  authoritative-over-inferred rule are already settled there.
- REUSE `statedAgeRangeLine`. Do NOT write a second age formatter, do NOT re-derive the
  range from the card's other fields, and do NOT invent a new phrasing.

WORK:
1. Render the age range on the FEED CARD (the drop-in card in the day sections), using
   the SAME `statedAgeRangeLine` helper the detail page uses. One source of truth.
2. Placement and weight follow the card's existing label row - read how the distance
   "N mi" label and the place name are set and match that treatment. It is a fact on the
   card, not a banner. Do not add a second badge style.
3. When neither bound is stated, the card renders NOTHING for age - the same "nothing
   stated" end state the helper already returns. NEVER an empty chip, NEVER "All ages",
   NEVER a placeholder.
4. Do NOT add a filter, a sort, or an age-matching feature. This slice STATES the range;
   matching is a separate decision the founder has not made.
5. The detail page's rendering must stay BYTE-FOR-BYTE unchanged. Same helper, two
   callers - that is the point.
6. Do not truncate or reword the helper's output. Whatever "nothing stated" returns for
   the detail page is what the card does too.

ACCEPTANCE: (a) an outing with a stated range shows that range on its feed card; (b) the
card's string is IDENTICAL to the detail page's for the same outing (assert this - it is
the whole point of reusing the helper); (c) an outing with no stated range shows nothing
on the card, exactly as it shows nothing on the detail page; (d) the label's visual
weight matches the existing distance label, not a new badge style; (e) 390px, no overflow.

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be fully green. Specs on a private port 4210-4218 (mint marker there; kill by port/PID, never pkill -f). Stage BY PATH ONLY.
Report .scratch/v37-c-report.md, then reply:
Sentinel: V37-C-AGE-FIT-ON-CARD-R8W5
Status: DONE | BLOCKED
Commit: <sha7>
