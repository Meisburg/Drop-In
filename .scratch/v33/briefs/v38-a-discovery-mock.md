SENTINEL: V38-A-DISCOVERY-MOCK-W4J7

Slice A (v38): a DEV-ONLY prototype screen showing what ONE discovery match looks
like — no schema, no switch, no data, no real family. Its ONLY job is to be shown to
real parents so the founder can find out whether a match is enough to start a
conversation. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/discovery-mock-w4j7 -b discovery-mock-w4j7 HEAD
Work only there; commit on branch discovery-mock-w4j7; never touch main or another lane's path.
DO NOT edit AGENTS.md, CONTEXT.md, docs/RELEASE-CHECKLIST.md, vite.config.ts, or any file
under supabase/ — those are the orchestrator's.

⚠️ THE RULE THIS SLICE OBEYS, QUOTED FROM THE ADR IT SERVES (docs/adr/0007, §7):
"Option 1's match surface should be prototyped and shown to real parents WITHOUT A
DATABASE BEHIND IT — the question is whether a match is enough to start a conversation,
and that is a question screenshots can answer for free."

⚠️ AND ITS FIRST PRECONDITION, which this slice does NOT violate because it ships no
feature: "A child-safety review, by someone qualified to run one, BEFORE A LINE OF CODE."
This slice is a DEV-ONLY mock with hardcoded strings. It exposes nothing, stores nothing,
queries nothing, and is absent from the production bundle. If you find yourself adding a
table, a column, a query, an RPC, a migration or a real read, you have misread the brief —
STOP and report BLOCKED.

THE EXISTING PRECEDENT — follow it exactly, do not invent a second pattern:
- src/dev/AgentationDev.tsx is the repo's dev-only surface.
- src/App.tsx line ~55 gates it: `const AgentationDev = import.meta.env.DEV ? lazy(...) : null`
  and line ~868 mounts it behind that null check.
Copy that mechanism. Read both first.

WORK:
1. A new file src/dev/DiscoveryMock.tsx — a DEV-ONLY, hardcoded mock of the Option 1
   match surface. Content is FIXTURE STRINGS ONLY, inline in the file. No imports from
   src/lib/db, no supabase client, no fetch, no router state, no props.
2. Mount it DEV-ONLY in src/App.tsx using the SAME mechanism the AgentationDev line
   already uses (an `import.meta.env.DEV` ternary + a null check). Do NOT add a
   production route. Do NOT touch the router's real route table.
3. The mock shows EXACTLY the §3 fields of ADR 0007, and no others:
   (a) the other parent's display name;
   (b) the broad child age band, rendered with the ADR's OWN labels —
       "Babies & toddlers (0-2)", "Preschool (3-5)", "School age (6-9)", "Older kids (10+)";
       show the multi-child case too (the wide span, e.g. "Babies & toddlers through
       school age") because that is the case the banding scheme exists for;
   (c) the approximate area, as a NEIGHBORHOOD NAME or zip — never coordinates, never a
       street;
   (d) the optional one-line "what we're into", parent-written — and ALSO show the empty
       case rendering NOTHING, never a placeholder;
   (e) the "Ask to connect" affordance.
4. The mock must show the CONSENT CARD state too: the exact list of what another parent
   would see, shown BEFORE switching on, with the switch defaulted OFF. The ADR calls
   this list "the consent card and the privacy policy's new paragraph" — render it as
   the ADR's §3 table reads.
5. Hardcode TWO fixture families so a parent can compare side by side, and make the
   second one exercise the multi-child band and the EMPTY free-text line.
6. Render it at 390px without overflow — parents will look at this on a phone.
7. NO new route in production. NO e2e spec (this is not behaviour; it is a mock). Write
   NO new test for the mock's content.

⚠️ WHAT THIS SLICE MUST NOT DO, restated because it is the whole point:
- No migration, no column, no table, no RPC, no policy.
- No read of any real family, place, or user.
- No Settings switch wired to anything.
- No "ask to connect" that does anything but sit there.
- Nothing that changes what a signed-out or signed-in real user sees.

ACCEPTANCE: (a) src/dev/DiscoveryMock.tsx exists and imports NOTHING from db/supabase;
(b) it is reachable only under `import.meta.env.DEV` via the existing precedent's mechanism;
(c) it renders exactly the five §3 fields, no more, using the ADR's own band labels;
(d) the band renders for both the single-child and the multi-child (wide-span) case;
(e) the empty free-text case renders nothing, not a placeholder;
(f) the consent card lists the five fields and the switch reads as OFF;
(g) production bundle is UNCHANGED — verify this by building and grepping the dist output
    for a fixture string you used (e.g. the fixture family name) and quote the empty result;
(h) 390px, no overflow;
(i) typecheck + lint clean.

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. The gate must be fully green.
Report .scratch/v38-a-report.md, quoting (1) the raw output of the dist grep proving the
production bundle does NOT contain the mock, and (2) the band labels you rendered.
Then reply:
Sentinel: V38-A-DISCOVERY-MOCK-W4J7
Status: DONE | BLOCKED
Commit: <sha7>
