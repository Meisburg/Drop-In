SENTINEL: V36-T4-SLUG-DEDUPE-B2Q6

Slice T4 (agentation session meetup-patterns-d8e22536): dedupe listings by a STABLE SLUG.
OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/slug-dedupe-b2q6 -b slug-dedupe-b2q6 HEAD
Work only there; commit on branch slug-dedupe-b2q6; never touch main or another lane's path.
DO NOT edit AGENTS.md, CONTEXT.md, docs/RELEASE-CHECKLIST.md or vite.config.ts.
You are the LOCAL lane: this ONE small slice only.

THE RULING: Meetup keys a group by its urlname (slug) and dedupes on it, because paginated geo
results WILL repeat an item across pages. The slug is one identifier with three uses: dedupe key,
deep-link key, share key. Drop In should dedupe on a stable slug and count the duplicates.

WORK:
1. A PURE helper in src/lib/ that dedupes a list of listings by stable slug, preserving the FIRST
   occurrence's position, and returns both the deduped list and the number of duplicates removed.
   A slug derives deterministically from stable fields (read how existing listings/places are keyed
   and reuse that identity - if there is already an id or slug field, USE IT; do not invent a
   second identity scheme).
2. Wire it at the boundary that receives a paginated page of listings - the client DEDUPES and does
   NOT sort (sorting stays wherever the server/ordering owns it).
3. Instrument the count: if the app already has an analytics/telemetry seam, emit
   duplicates_detected with the count through it. If there is NO telemetry seam, do not build one -
   say so in the report and leave the count as the function's return value.
4. NO deep links, NO new routes, NO URL changes in this slice. Slug-as-deep-link is a separate
   slice blocked on a domain decision.

ACCEPTANCE: (a) a sibling test for the helper that names the defect it detects (a duplicate that
survives, or an item silently dropped to a later position); (b) three cases: no dupes, one dupe,
same item twice non-adjacently; (c) the wired caller's spec asserts a duplicated page yields a
shorter rendered list; (d) typecheck+tests+lint clean.

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be FULLY green — no waivers. Specs on a private port 4210-4218. Stage BY PATH ONLY.
Report .scratch/v36-t4-report.md, then replay:
Sentinel: V36-T4-SLUG-DEDUPE-B2Q6
Status: DONE | BLOCKED
Commit: <sha7>
