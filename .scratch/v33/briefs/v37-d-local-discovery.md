SENTINEL: V37-D-LOCAL-DISCOVERY-V2Q9

Slice D (v37): the DESIGN RECORD for opt-in local family discovery with broad child age
ranges - a decision document, NOT a feature. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/local-discovery-v2q9 -b local-discovery-v2q9 HEAD
Work only there; commit on branch local-discovery-v2q9; never touch main or another lane's path.
DO NOT edit AGENTS.md, CONTEXT.md, docs/RELEASE-CHECKLIST.md or vite.config.ts - those are the orchestrator's.

WHY (the founder's own usability review, verbatim):
"Longer term, opt-in local family discovery with broad child age ranges could help
parents find compatible playmates without exposing extra child details."

⚠️ THIS SLICE WRITES NO APP CODE AND NO TESTS. It produces ONE document and one pointer
line. If you find yourself editing src/, you have misread the brief - stop.

THE QUESTION THIS DOCUMENT MUST ANSWER: Drop In's whole thesis is parents meeting parents,
but today a parent can only meet someone who has already posted an outing. Opt-in family
discovery would let them find each other directly. That is a materially different product
with a materially different privacy posture. The founder has NOT decided to build it. This
document is what he decides FROM.

READ FIRST (these hold the settled thinking you must not contradict):
- docs/adr/ - especially the ADR on what families and children's profiles reveal. The
  privacy copy the reviewer called "reassuring and concrete" is the standard this must
  not undercut.
- CONTEXT.md - the glossary. Use its terms exactly (Group, Member, Admin, Invite link).
  If this document needs a term the glossary does not hold, say so in the document
  rather than inventing a synonym.
- docs/specs/groups-v1.md - groups are private and invite-grown. Discovery must not
  quietly make a private circle discoverable.

THE DOCUMENT - docs/adr/<next free number>-opt-in-family-discovery.md
Use the repo's existing ADR shape (read one first and match it - sections, tone, the
"why" discipline). It must cover, at minimum:
1. THE PROBLEM, stated as the cold start the reviewer measured: places exist, families
   do not, and hosting is the only bridge. Say plainly that hosting does not scale as the
   only path.
2. WHAT IS OPT-IN, in one sentence a parent would understand. Name the default. Name
   what a parent must DO to be findable, and what happens if they do nothing.
3. WHAT IS EXPOSED, exhaustively - an explicit list of every field another parent would
   see, and for each, why it is necessary. Child age appears ONLY as a BROAD BAND, never
   a date of birth, never a name, never a face. State the banding scheme and defend it.
4. WHAT IS DELIBERATELY NOT BUILT in v1 - every attraction you are declining, each with
   the reason. This section is the point of the document.
5. THE SAFETY AND PRIVACY FAILURE MODES - who could be harmed, how, and which of the
   listed fields makes each less likely or more likely.
6. AT LEAST TWO OPTIONS, ranked, with the recommended one first and the tradeoff named.
   A single-option document is not a decision document.
7. WHAT WOULD HAVE TO BE TRUE to build this - the preconditions, including the child
   safety review a feature like this needs before a line of code.

7. A POINTER, not a broadcast: add exactly ONE row to the pointer table in CONTEXT.md is
   FORBIDDEN (orchestrator-owned). Instead, note in your report the exact AGENTS.md row
   text you would add, and let the orchestrator place it. Do not edit AGENTS.md.

ACCEPTANCE: (a) the ADR exists at the next free number and matches the existing ADRs'
shape; (b) it names a default and states what opt-in requires a parent to DO; (c) it
lists every exposed field explicitly and bands child age broadly, never exact; (d) it has
a "deliberately not built" section with a reason per item; (e) it names the safety failure
modes; (f) it offers >=2 ranked options with the recommendation first; (g) it names the
preconditions, including the child-safety review; (h) NO src/ change, NO test written;
(i) it does not contradict any existing ADR or CONTEXT.md term.

GATE: npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be fully green.
(A docs-only slice should not move any of it - if it does, you edited something you
should not have.) Report the raw output. Stage BY PATH ONLY.
Report .scratch/v37-d-report.md, then reply:
Sentinel: V37-D-LOCAL-DISCOVERY-V2Q9
Status: DONE | BLOCKED
Commit: <sha7>
