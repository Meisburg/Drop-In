# 05: Share + public event view

**What to build:** The distribution layer, sequenced last (after the two-user beta). Every event gains a Share button: Web Share API where available, copy-link fallback otherwise; the URL is `${VITE_PUBLIC_BASE_URL}/playdate/:id` (new env var; deployment stays DECISION 3). The event detail page becomes publicly viewable signed-out — post content only (title, place, time, neighborhood label, host handle + avatar, going count). Host profile pages and comments stay authenticated-only. Signed-out visitors see "Sign up to join in" prompts on every action surface; "I'm coming" routes to /login with a return path that completes the ping after auth. Detail-page SELECT policy opens to anon for playdates (+ the join reads needed to render one post).

**Blocked by:** 02, 03, 04 (it opens the page all three rebuilt), plus the founder's beta gate (two-user smoke test) before this dispatches.

**Status:** ready-for-agent

- [x] Share button on detail page: navigator.share on supported clients; copy-link fallback with a "Copied" confirmation
- [x] Shared URL built from VITE_PUBLIC_BASE_URL (placeholder-safe before deployment)
- [x] Signed-out visitor opening /playdate/:id sees the post (title/place/time/label/host avatar+handle/going count)
- [x] Signed-out visitor cannot see comments or open /u/:handle (auth-walled as today)
- [x] Every action surface signed-out shows "Sign up to join in"; "I'm coming" → /login → returns → ping completes
- [x] Anon SELECT RLS on playdates + supporting join reads; profiles/comments remain authenticated-only
- [x] Trust review pass by orchestrator before live apply (enumeration + block-filter implications re-checked)
- [x] Live check: anon REST probe reads one post; anon ping/comment attempts rejected by RLS
- [x] npm run build && npm run test exit 0

## Comments

- 2026-09-09 — COMPLETE (dev agent, 2 sessions: code abe1352 + reviewer fix 089a1df). Commit abe1352 (slice: 0015_public_playdate.sql + signed-out public detail view + share button + return path + e2e/share-public.e2e.ts + .env.example) + 089a1df (0015 anon policy hidden-aware after reviewer NEEDS_CHANGES — a direct anon-key REST read of the playdates table leaked hidden posts; fixed with role-scoped `to anon using (hidden_at is null)` + header rewrite; .gitignore !.env.example). Gates: `npm run build && npm run test` exit 0 (139/139); `npx playwright test` exit 0 (12/12 incl. 2 new share-public specs; the signed-out public-surface spec was red by design pre-apply, green post-apply). 0015 applied live via CDP (orchestrator verifier) after the pinned orchestrator trust review (enumeration intended+documented; block-filter bypass acceptable; no column leaks — RPC returns exactly 11 public fields; no anon write paths). lv10 anon probes: playdates 200 (hidden wall holds on table + RPC not-found), RPC payload exact, anon ping write 400 P0001 (0010 trigger before RLS), anon comment/profile/report reads 0 rows (silent RLS). Marker lv10-1789001488 (sweep artifact). All ACs met.
