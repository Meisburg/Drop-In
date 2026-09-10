# 09: Kids v3 — kids you're bringing, photos, conversation starters

**What to build:** Feedback #10 + #6. (a) /new: the "Best for ages (optional)" section is REPLACED by "Kids you're bringing (optional)" — a multi-select of your own kids (chips: name + age) from the kids table; empty state "Add your kids on your profile" + link to /profile when you have none; the age-hint field is gone from /new (the DB column stays, just unused in the UI). Selected kids land in the new `playdate_kids` table and show on the detail page as a "Kids coming" line below the ping section: "Bernie · 6, Lily · 4" (names + ages only — NO photos here; pin). (b) Kid photos (human-approved 2026-09-09 — overrides the first-name-only pin, logged in task-state decisions): an optional per-kid photo in the profile kid editor (upload reuses the avatar machinery: client-resized 256px, ≤5MB; stored in the existing avatars bucket at `<uid>/kids/<kidId>` — the owner-scoped write policy must match this path; reviewer audits the policy in 0022). Shown only in the profile kids list (40px, like the avatar) — never on cards or event lines. (c) Conversation starters (orchestrator pin: free text — the boring default; a tags structure is a later candidate): kids gain a "likes" field (≤100 chars); the profile gains "interests" (≤200 chars); both display on /u/:handle (kid row: photo + name + age + "likes …" line; parent: an interests line under the bio). Migration 0022: playdate_kids + kids.avatar_url + kids.likes + profiles.interests (all DO-block idempotent; 0022 also verifies/extends the avatars bucket write policy to the `<uid>/kids/<kidId>` path — header documents it).

**Blocked by:** Ticket 08 (one-writer).

**Status:** ready-for-agent

- [ ] Migration 0022: `playdate_kids` (id, playdate_id FK ON DELETE CASCADE, kid_id FK ON DELETE CASCADE, unique pair) + `kids.avatar_url` (text, nullable) + `kids.likes` (text, nullable, ≤100) + `profiles.interests` (text, nullable, ≤200) + avatars-bucket write policy check/extension for the `<uid>/kids/<kidId>` path (owner-scoped only); DO-block idempotent; applied live after code green
- [ ] /new: kids picker replaces the age section (multi-select chips name+age; empty state + /profile link); on post create, upsert the selection into playdate_kids (replace-on-duplicate)
- [ ] Detail page: "Kids coming" line below the ping section (names + ages, no photos; hidden when 0)
- [ ] Profile: kid editor gains photo upload (256px/≤5MB, avatars bucket `<uid>/kids/<kidId>`) + "likes" field; profile edit gains "interests" field
- [ ] /u/:handle: kid rows show 40px photo (fallback initial) + name + age + likes line; parent interests line under the bio
- [ ] One new e2e spec: pick kids on /new → "Kids coming" line on the detail page
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments