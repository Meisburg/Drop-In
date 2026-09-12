# 10: Polish batch — the saves, the undo, and the states that lie

**What to build:** A batch of small, real frictions found during the read-only
review. Nothing here is a new capability; each item is a place where the app
loses a parent's work, hides what happened, or makes them tap the same thing
five times. No migration.

**Blocked by:** Ticket 09 (one-writer).

**Status:** ready-for-agent

- [ ] **Profile saving:** one **Save profile** submit for the whole form instead of six separate Save buttons (name, location, bio, interests, plus one per kid — `ProfilePage.tsx`); section-level inline errors stay; write only the sections that actually changed
- [ ] **Dirty-state guard:** unsaved typing warns before navigating away (or autosaves) — today the seed-once guards silently drop typed input (`ProfilePage.tsx:199-217`)
- [ ] **Kid rows are editable in place** (first name, age, likes) instead of Remove + re-add; **Remove asks for confirmation**
- [ ] **The 5-kid cap explains itself** — the inputs currently just disable (`ProfilePage.tsx:899,915,920`) with no message
- [ ] **Kids picker batches its writes:** multi-select chips, then one write on confirm, instead of one write per chip tap with every chip disabled while it round-trips (`KidsComingPicker.tsx:46-65`); keep one in-flight guard per request
- [ ] **Comment delete asks for confirmation** (or offers an undo) — it currently fires immediately (`PlaydateDetailPage.tsx:1041-1049`); **moderators can unhide** a hidden comment (the button renders only when `!isHidden` today, `:1051`). Unhide rides `0009`'s any-column moderator UPDATE policy — verify it live, **no migration**
- [ ] **Share failure is visible:** if the share sheet is dismissed and the clipboard write fails, show "Couldn't copy the link" with the URL selectable (`PlaydateDetailPage.tsx:557-569`)
- [ ] **Doc fix:** the ProfilePage module comment claims the neighborhood card supports add/remove; it is display-only by design (memberships no longer filter anything) — correct the comment, keep the behavior
- [ ] Unit tests for the two new pure seams: the changed-section patch builder, and the comment-action confirm state machine
- [ ] New e2e `polish.e2e.ts`: kid edit round-trip (name + age changed, rendered on `/u/:handle`) and a moderator unhide round-trip (mod flag flipped by the SQL-API path the existing mod specs use, then reverted)
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **NONE — no schema or policy change.** The one item that
touches an RLS-adjacent path (moderator unhide) is covered by `0009`'s
any-column moderator UPDATE policy on `comments`' sibling tables — confirm with
a live probe rather than assuming, and if the policy turns out **not** to cover
it, stop and raise it to the coordinator (a migration would then be needed;
next free number wins). Diff guard: nothing under `supabase/migrations/`
changes.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/polish.e2e.ts e2e/profile.e2e.ts e2e/comments.e2e.ts
e2e/comment-replies.e2e.ts`; manual pass on `/profile` — type a bio, navigate
away, confirm you were warned. Sweep markers.

## Comments
