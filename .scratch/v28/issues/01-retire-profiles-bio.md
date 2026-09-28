# 01: Retire the dead `profiles.bio` column (and decide the stranger-read fallback)

**What to build:**
1. Confirm nothing writes `profiles.bio` after V27 — the account-level bio card
   was deleted; the parent card's "About me" is now the one editor.
2. Migrate any remaining non-null `profiles.bio` values into the parent card's
   "About me" (or record them as intentionally dropped), then drop the column
   in a migration with the usual idempotent guard.
3. Remove the owner-row read fallback that still reads `profiles.bio`
   (`ProfileView` / `parentCards`).
4. Update the sibling unit tests for the removed fallback.

**Why:** The V27 `/profile` redesign (commit `c8720b4`) deleted the only editor,
so `profiles.bio` is dead data. Leaving it means the read path keeps a fallback
for a column no UI can write.

**Related product call (human):** a stranger currently sees the linked partner's
row only if a legacy partner card exists. If both parents should always be
visible to strangers, that needs a public roster entry — decide separately.

**Evidence:** `V27-BATCH-SUMMARY.md`; the V27 banners in `task-state.md`.

**Status:** ready-for-agent
