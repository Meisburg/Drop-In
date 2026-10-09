SENTINEL: V35-B-INTERESTS-EMOJI-H8W2

Slice muzjx0we. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/interests-emoji-h8w2 -b interests-emoji-h8w2 HEAD
Work only there; commit on branch interests-emoji-h8w2; never touch main or another lane's path.

FIRST: if you have agentation MCP tools, fetch the founder's annotation muzjx0we and follow its TEXT exactly - it is the spec. The gist: the profile's interests read as a flat list of words; the founder wants each interest as an emoji + text bubble.
If you cannot fetch it, implement this spec:
1. Each interest renders as a small bubble: a leading emoji, then the interest's text.
2. The emoji comes from a PURE mapping in src/lib/ (interest vocabulary -> emoji) with a SIBLING TEST naming the defect it detects (an unknown interest silently getting a wrong or random emoji). Unknown interest -> no emoji, text still shown (never a blank bubble, never a random emoji).
3. Bubbles wrap; they are labels, not buttons (no aria-pressed, not pressable).
4. No new read or fetch: only interests already on the profile row.
5. Read-only: the profile page, src/lib/ interests/domain helpers, the profile spec. Edit first, verify after.

ACCEPTANCE: (a) a profile with 3 interests renders 3 bubbles, each with its text; (b) a known interest gets its mapped emoji (asserted); (c) an UNKNOWN interest renders its text with NO emoji (its own assertion); (d) 390px no overflow (scrollWidth <= clientWidth + 1); (e) the list stays stable order (no reshuffle between renders).

GATE: ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify ; then npm run guards -> GUARDS: PASS. Only steering-lint may be red. Specs on a private port 4210-4218. Stage BY PATH ONLY.
Report .scratch/v35-b-report.md, then reply:
Sentinel: V35-B-INTERESTS-EMOJI-H8W2
Status: DONE | BLOCKED
Commit: <sha7>
