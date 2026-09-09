# 05: Share + public event view

**What to build:** The distribution layer, sequenced last (after the two-user beta). Every event gains a Share button: Web Share API where available, copy-link fallback otherwise; the URL is `${VITE_PUBLIC_BASE_URL}/playdate/:id` (new env var; deployment stays DECISION 3). The event detail page becomes publicly viewable signed-out — post content only (title, place, time, neighborhood label, host handle + avatar, going count). Host profile pages and comments stay authenticated-only. Signed-out visitors see "Sign up to join in" prompts on every action surface; "I'm coming" routes to /login with a return path that completes the ping after auth. Detail-page SELECT policy opens to anon for playdates (+ the join reads needed to render one post).

**Blocked by:** 02, 03, 04 (it opens the page all three rebuilt), plus the founder's beta gate (two-user smoke test) before this dispatches.

**Status:** ready-for-agent

- [ ] Share button on detail page: navigator.share on supported clients; copy-link fallback with a "Copied" confirmation
- [ ] Shared URL built from VITE_PUBLIC_BASE_URL (placeholder-safe before deployment)
- [ ] Signed-out visitor opening /playdate/:id sees the post (title/place/time/label/host avatar+handle/going count)
- [ ] Signed-out visitor cannot see comments or open /u/:handle (auth-walled as today)
- [ ] Every action surface signed-out shows "Sign up to join in"; "I'm coming" → /login → returns → ping completes
- [ ] Anon SELECT RLS on playdates + supporting join reads; profiles/comments remain authenticated-only
- [ ] Trust review pass by orchestrator before live apply (enumeration + block-filter implications re-checked)
- [ ] Live check: anon REST probe reads one post; anon ping/comment attempts rejected by RLS
- [ ] npm run build && npm run test exit 0