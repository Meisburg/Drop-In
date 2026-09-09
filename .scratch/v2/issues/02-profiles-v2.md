# 02: Profiles v2 — avatars, bio, kids

**What to build:** The comfort layer. Profiles gain a photo (Supabase Storage, client-resized to 256px, ≤5 MB input), a short bio, and structured kid rows (first name + age only — never full names or gender, founder-pinned). Onboarding gains an optional photo+bio+kids step with a persistent nudge banner on /profile until complete. /u/:handle and the detail page's host section render the rich profile; feed cards gain a 40px host avatar. Includes the parked self-elevation trigger (profiles UPDATE locking moderators/banned_at to moderators/postgres) in this ticket's migration pass.

**Blocked by:** None (independent of 01).

**Status:** ready-for-agent

- [x] Avatar upload resizes client-side to 256px square; >5 MB rejected before upload
- [x] Avatar renders (40px round) on feed cards, detail host line, /u/:handle, and comments-ready shape
- [x] Bio editable in /profile, length-capped, rendered on /u/:handle
- [x] Kids: add/remove structured rows (first name + age, max 5 enforced); shown on /u/:handle as first name + age only
- [x] Onboarding: optional completion step; /profile nudge banner until photo+bio+kids present
- [x] No kid full names or gender anywhere in schema or UI (privacy pin)
- [x] Storage bucket avatars with owner-scoped write policy; public read
- [x] Self-elevation trigger live: non-moderator cannot set moderators/banned_at via direct API (live-proven)
- [x] npm run build && npm run test exit 0; REST smoke probe for any new embed path
## Comments

- 2026-09-09 — COMPLETE (dev agent). Commits b0981b1 (slice 2: 0011_profiles_v2.sql + avatars/bio/kids + 2 e2e specs) + c389ce4 (e2e avatar PNG-CRC/cleanup fix) + 4f3cc72 (self-elevation trigger non-JWT pass-through after reviewer NEEDS_CHANGES; also surfaced the Add-kid validation error). Gates: `npm run build && npm run test` exit 0 (102/102); `npx playwright test` exit 0 (6/6 incl. 2 new specs). 0011 + trigger fix applied live via CDP (orchestrator). Live proofs: non-mod self-elevation UPDATE -> 400 P0001 "only moderators can grant moderator status" (V1 escalation hole still closed); postgres banned_at UPDATE succeeds (ban-path regression fixed by the pass-through); smoke probes profiles?select=avatar_url,bio + kids + storage.buckets (avatars, public=true) all 200. Privacy pin verified: no kid full name/gender in schema or UI. Marker lv6-1788991152@gmail.com (banned_at set; test artifact). All ACs met.