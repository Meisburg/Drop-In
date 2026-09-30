# Explorer brief — the NEW FEATURES (read-only, cited findings)

You are `orchestrator-explorer`. **Edit nothing. Create no files. Commit nothing.**
Report cited findings only: every claim carries `path:line`. A claim without a line
reference is a guess, and a guess that reaches a plan becomes a defect that reaches a
builder.

Repo: this worktree (`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`),
branch `Meisburg/onboarding`. Read `docs/agents/code-structure.md` first (the build law).

## Why

The human walked the new onboarding on a phone and asked for two features that are NOT
in this batch yet. Before I can slice them I need the ground truth of what already
exists, because two claims I made earlier were wrong and I will not make a third:

- I said "there is no messaging" — **wrong**: `supabase/migrations/0056_messages_push.sql`
  exists, `/inbox` is a nav tab, and a parent's page `/u/:handle` carries a
  **Follow / Message / Block / Report** row.
- The human's actual request for finding people: *"they're not going to be able to search
  for somebody's name to message them"* — i.e. **find a parent by name**. And separately
  **partner linking**: invite a partner by email, or search for a parent already on the
  app and link the two accounts as one family.

## What to find and report

**For each: the exact current shape, every caller/consumer, and line references.**

### A. Identity and schema
1. **The `profiles` table as it exists today** — the authoritative column list. Read the
   migrations under `supabase/migrations/` (grep for `alter table`
   `profiles`/`create table` `profiles`) and report the **union of columns** with the
   migration that added each. At minimum confirm: `display_name`, `avatar_url`, `bio`,
   `home_zip`, `radius_miles`, plus anything social. Flag which are **unique** and which
   are **nullable**, with the constraint names.
2. **Is `display_name` UNIQUE, and is it the public handle?** Show the constraint
   (`profiles_display_name_key`?) and the read path (`getProfileByHandle`) with line refs.
   Report exactly what the name card writes and how it is split (first + last →
   one `display_name`?).
3. **Any existing household / family / partner / relationship concept.** Grep the
   migrations and `src/lib/db.ts` for `household`, `family`, `partner`, `guardian`,
   `relationship`, `member`. **Report "0 hits" explicitly if there is none** — a
   negative is a finding and it decides whether partner linking starts from zero.
4. **`kids`** — the authoritative column list (including `avatar_url` if it exists),
   and whether a kid is scoped to a profile (`profile_id`).

### B. Messaging and discovery
5. **The Inbox**: tables and migrations that store conversations/messages
   (`0056_messages_push.sql` and any earlier one), the RPC/functions that start a
   conversation, `src/pages/InboxPage.tsx`'s read path, and **how a conversation gets its
   recipient** — from `/u/:handle`'s Message button? Report the call chain with line refs
   from the button to the write.
6. **How does a parent currently FIND another parent?** Grep `src/` for any **person
   search**: an autocomplete, a name query, a picker, `ilike`, `textSearch`, a
   `search` state. **Report "0 hits" explicitly if there is none.** Distinguish a
   *place* search (which I believe exists on `/browse`) from a *parent* search.
7. **`follows`** — what it can target (family or place?), the constraint
   (`follows_one_target_check`), `validateFollowTarget`, and the callers. Show the
   `profiles` read policies that a name search would have to respect
   (`db.ts:2239` mentions two SELECT policies — quote them with line refs).

### C. The dead-export sweep (carry-over)
8. Report the current consumers of each: **`missingProfileItems`**, **`needsOnboarding`**,
   **`skipLabel`** (in the copy module), and `MissingProfileItem`. For each say exactly
   how many production call sites exist and name them, or say **"0 production callers"**.
   This is the known "pinned by a test, read by nobody" pattern and I need the current
   count so the plan can wire-or-delete each by name.
9. **`scripts/guards/run-all.sh`** — the current list of guards it runs, with line refs,
   and what `npm run verify` runs (read `package.json`'s `verify` script and report it
   verbatim). I need the exact baseline the next batch must not regress (currently
   66 test files / 1989 tests, 0 lint errors / 81 warnings — **verify those numbers, do
   not repeat them**).

## Rules that bind this report

- **A no-match is a finding** — say "0 hits" explicitly.
- **Do not use `-r` with `rg`** (it parses as `-r n` and FABRICATES output).
- **Never grep a phrase that can wrap** — use the shortest stable fragment and read the
  surrounding context.
- When a migration is the authority for a column, cite the migration file and line.
- Report the current state; **do not propose the fix.**
- Finish with **"Facts I could not establish"**.
