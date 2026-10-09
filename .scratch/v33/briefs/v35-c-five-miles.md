SENTINEL: V35-C-FIVE-MILES-N6T4

Slice 5c (five miles). OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/five-miles-n6t4 -b five-miles-n6t4 HEAD
Work only there; commit on branch five-miles-n6t4; never touch main or another lane's path.
You are the LOCAL lane: this one slice only, and it is deliberately small.

FOUNDER RULING: the browse/search radius default becomes FIVE MILES. Migration 0066 narrowed it; this REVERSES that narrowing.
WORK:
1. The radius default is ONE named constant in src/lib/ set to 5 miles (express it the way the codebase already expresses radius - read how the existing constant is written and match it; do not invent a second unit).
2. Every place the default is used reads that constant - no literal 5 scattered around.
3. A NEW forward migration that reverses 0066's change, with a comment stating plainly that this is a DELIBERATE REVERSAL of 0066 and naming the founder ruling. Take the NEXT free migration number at your base (list the migrations directory; never reuse a number). Apply with: bash scripts/db-sql.sh --file <path>
4. Apply it TWICE (idempotence), then read the column/row back and paste the actual output into your report.
5. NEVER run scripts/apply-migration.mjs (it drives the human's browser).
6. Read-only: the migrations dir, src/lib/ radius helpers + their sibling tests, the spec that asserts the current default. Edit first, verify after.

ACCEPTANCE: (a) the constant is 5 miles and is the single source; (b) the migration applies cleanly twice and the read-back proves the new value; (c) a spec asserts the browse default is now five miles (and any spec asserting the old value changes in the SAME diff); (d) typecheck+tests+lint clean.

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. Only steering-lint may be red. Specs on a private port 4210-4218. Stage BY PATH ONLY.
Report .scratch/v35-c-report.md, then reply:
Sentinel: V35-C-FIVE-MILES-N6T4
Status: DONE | BLOCKED
Commit: <sha7>
