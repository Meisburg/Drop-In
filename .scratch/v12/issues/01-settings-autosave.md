# 01: Settings autosave — /settings saves as you go, no Save button, no unsaved guard

**What to build:** Turn the /settings form into an autosave surface:
1. Profile fields — display name (`SettingsPage.tsx:798`), home zip
   (`:827`) + radius (`:839`), bio (`:872`), interests (`:918`) — persist
   debounced as the user edits them. The explicit Save button
   (`:1192-1198`), the dirty line ("unsaved changes", `:1199-1207`), and
   the `profile-save-note` region (`:1208-1215`) are replaced by a compact
   "saving… / saved" status indicator in the same region.
2. Kids — add (`handleAddKid`, `:550`; the add-kid row `:1136-1175`) and
   inline edits (name `:1068`, age `:1083`, likes `:1095`) persist without
   a Save control. Remove (`handleRemoveKid`, `:583`; the confirm dialog
   `:1354-1365`) stays a two-step confirm — it is destructive, not a save —
   and persists on confirm.
3. The unsaved-changes guard goes away: `dirty` (`:367`), `unsavedGuard`
   (`:368`), and the guard dialog (`:1367-1369`) are removed (or scoped to
   "a save is in flight" only). `handleSaveProfile` (`:448`, the form
   submit at `:788`) is no longer the save path.

**Why:** Founder ask (V12): /settings still behaves like a classic form —
fill, press Save, and get bounced by the guard when you leave mid-edit. A
settings screen should just… save.

**Status:** ready-for-agent

## Mechanics (pinned)

- `src/pages/SettingsPage.tsx` (1372 lines at filing): `savePlan` `:351`,
  `dirty` `:367`, `unsavedGuard` `:368`, `editDraft` `:405`,
  `editKidDraft` `:414`, `handleAddKid` `:550`, `handleRemoveKid` `:583`,
  `handleSaveProfile` `:448` (the form `:788` onSubmit; the "Location" h2
  `:815`, the "Kids" h2 `:936`).
- Avatar / family photo uploads (`uploadAvatar` / `uploadFamilyPhoto`,
  imports `:30-31`, call sites `:203` / `:219`) already save on change —
  they are the model for the autosave pattern this ticket extends to the
  rest of the form.
- E2E blast radius — specs that visit /settings and (some) press Save or
  read the save note: `zip-radius`, `avatar`, `feed-ages`,
  `kid-photo-exposure`, `push-subscribe`, `profiles-v2`, `loop-closing`,
  `polish`, `kids-v3`, `kids-surface`. Update the ones that click the Save
  button; keep every read of a persisted value (read-after-write still
  proves persistence).

## Acceptance criteria

1. No Save control on /settings: name / home zip / radius / bio /
   interests persist while editing (debounced — builder's choice, ≥ 300 ms;
   one in-flight save per field set, coalesced), with a visible "saving… /
   saved" indicator in the region the Save button occupied.
2. Kids: add + inline edits persist without a control; remove keeps its
   confirm dialog and persists on confirm.
3. The unsaved-changes guard (dialog + `dirty` / `unsavedGuard` state) is
   gone; leaving mid-save does not lose typed values (a failed save shows
   its inline error and the draft survives).
4. Zero "Save" click affordances left on /settings (grep gate); the e2e
   specs from the blast list are updated and the full e2e suite is green.
5. `npm run build && npm run test` exit 0; `npm run lint` 0 errors.

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** none — first in the queue.