# 02: Profiles v2 — avatars, bio, kids

**What to build:** The comfort layer. Profiles gain a photo (Supabase Storage, client-resized to 256px, ≤5 MB input), a short bio, and structured kid rows (first name + age only — never full names or gender, founder-pinned). Onboarding gains an optional photo+bio+kids step with a persistent nudge banner on /profile until complete. /u/:handle and the detail page's host section render the rich profile; feed cards gain a 40px host avatar. Includes the parked self-elevation trigger (profiles UPDATE locking moderators/banned_at to moderators/postgres) in this ticket's migration pass.

**Blocked by:** None (independent of 01).

**Status:** ready-for-agent

- [ ] Avatar upload resizes client-side to 256px square; >5 MB rejected before upload
- [ ] Avatar renders (40px round) on feed cards, detail host line, /u/:handle, and comments-ready shape
- [ ] Bio editable in /profile, length-capped, rendered on /u/:handle
- [ ] Kids: add/remove structured rows (first name + age, max 5 enforced); shown on /u/:handle as first name + age only
- [ ] Onboarding: optional completion step; /profile nudge banner until photo+bio+kids present
- [ ] No kid full names or gender anywhere in schema or UI (privacy pin)
- [ ] Storage bucket avatars with owner-scoped write policy; public read
- [ ] Self-elevation trigger live: non-moderator cannot set moderators/banned_at via direct API (live-proven)
- [ ] npm run build && npm run test exit 0; REST smoke probe for any new embed path