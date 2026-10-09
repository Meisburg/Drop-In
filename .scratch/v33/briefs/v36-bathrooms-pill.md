SENTINEL: V36-BATHROOMS-PILL-Y7M5

Slice muzka6tz (a "bathrooms available" pill on places). OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/bathrooms-y7m5 -b bathrooms-y7m5 HEAD
Work only there; commit on branch bathrooms-y7m5; never touch main or another lane's path.
DO NOT edit AGENTS.md, CONTEXT.md, docs/RELEASE-CHECKLIST.md or vite.config.ts - those are the orchestrator's.

DATA SOURCE - the free one, by ruling:
OpenStreetMap tags ARE the source: amenity=toilets presence near the place, from Overpass,
same shape as the existing coffee column. NO paid source: if you conclude that any part
needs a paid API or a key you do not already have, STOP and report BLOCKED with the name of
the source, before writing code.

WORK (mirror the coffee_nearby pattern exactly - read it first and copy its shape):
1. A migration adding the column beside coffee_nearby, tri-valued on purpose: true / false /
   null(=never asked). Take the NEXT free migration number at your base (list the migrations
   dir; never reuse a number). Apply with: bash scripts/db-sql.sh --file <path>; apply it TWICE
   (idempotence) and read the column back, quoting the output. NEVER run scripts/apply-migration.mjs.
2. A paced refresh script beside scripts/refresh-coffee-nearby.mjs with a SIBLING TEST. Reuse its
   pacing/backoff and its batching; do not invent a second HTTP client.
3. The pill on the place surfaces, rendered ONLY when the value is TRUE. false and null render
   NOTHING - never "no bathrooms", never a placeholder. Three separate assertions, because
   collapsing false and null is the defect this column design exists to prevent.
4. No synchronous request on page load: the pill reads the stored column only.

ACCEPTANCE: (a) migration applies twice cleanly + read-back quoted; (b) refresh script has a
sibling test that detects its own failure mode (a 429/overpass error must not write NULL over a
known value); (c) true renders the pill, false and null render nothing (3 assertions);
(d) 390px no overflow; (e) typecheck+tests+lint clean.

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be FULLY green — no waivers. Specs on a private port 4210-4218 (mint marker there; kill by port/PID, never pkill -f). Stage BY PATH ONLY.
Report .scratch/v36-bathrooms-report.md, then reply:
Sentinel: V36-BATHROOMS-PILL-Y7M5
Status: DONE | BLOCKED
Commit: <sha7>
