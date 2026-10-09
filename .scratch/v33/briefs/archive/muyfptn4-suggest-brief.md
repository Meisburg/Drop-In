SENTINEL: MUYFPTN4-SUGGEST-A-PLACE-INTAKE-K3V8

**Slice `muyfptn4` (part 1 of 3) — a signed-in parent can SUGGEST a place, and a
moderator can see the queue.**

Repo: `~/Projects/playdate-app`. Base: HEAD. **Do not push.**

📌 **THIS IS A BOUNDED SLICE — READ THE SCOPE LINE CAREFULLY.** The founder's annotation
asks for the whole intake→review→publish loop. **This slice builds only the INTAKE and
the QUEUE.** It does NOT build promotion into `places`, and it does NOT build photo
upload for a suggestion. Those are parts 2 and 3.

**Scope, exactly:**
- a "Suggest a place" control on `/browse`, and a form that captures name + address +
  kind;
- a new `place_suggestions` table with an INSERT policy for `authenticated`;
- the suggestion appears in a review queue on `/mod`.

**Not in scope:** promoting a suggestion into `places`; uploading a photo for a
suggestion; editing a suggestion; notifying anyone.

Work in YOUR OWN worktree — this is the only slice you will run:

```bash
git worktree add /tmp/pd-wt/muyfptn4-suggest -b muyfptn4-suggest HEAD
cd /tmp/pd-wt/muyfptn4-suggest && npm install --silent 2>/dev/null || true
```

📌 **WORK ECONOMICALLY.** Read only what this brief names; a fresh session's window is
~98k tokens and it goes fast. **Edit first, verify after.**

📌 **A FRESH WORKTREE HAS NO `.env`.** `e2e-target-guard` needs it; if you launched this
worktree by hand, copy `~/Projects/playdate-app/.env` and `e2e/.auth/` in. Stay untracked.

---

## 1 — The annotation, verbatim

> *"You know what this is missing is the ability to add a place because however we added
> all these places, it's not all encompassing of like all the places that could be here.
> So users should be able to add their own place to the list and give them the tools they
> need to add a photo and add the information they need. I think they'd be really useful.
> I think the users moderate the site as much as possible that we can."*
> — `muyfptn4-nm3pjl`, page `/browse`, element `src/App.tsx:605:9`

**Locate by content, never by line number.**

---

## 2 — What already exists (read these; do not re-derive them)

A prior scope pass established, with file:line evidence, that **no place-create path
exists** — and that is by design:

- **`places` is seed-only.** `supabase/migrations/0029_places.sql:106–110`: *"There are
  NO insert/update/delete policies at all: writes stay postgres-only … so RLS denies
  every write by default."* The only policies are `places_select_public` (0029:399–413)
  and a **moderator-only UPDATE** added later (`0062_place_photo_moderation.sql:87–101`).
- **Do NOT open `places` to user INSERT.** The founder wants suggestions reviewed, not
  a public directory anyone can write to. That is exactly why this slice uses a
  separate `place_suggestions` table.
- The directory surface is `src/components/PlaceDirectory.tsx` (rendered by
  `src/pages/BrowsePage.tsx:403`). Row actions today: `row-start-dropin-<id>` (:2006),
  `row-learn-more-<id>` (:2019), `place-edit-photo-<id>` (:2049, moderator-only),
  `place-heart-<id>` (:2068).
- The moderator page is `src/pages/ModPage.tsx`, which already renders `listReports()`
  from `src/lib/db.ts` — follow that page's existing pattern for a second queue.

---

## 3 — What to build

**3a. Migration.** A new file `supabase/migrations/00XX_place_suggestions.sql`
(use the next free number). It must:
- create `place_suggestions` with: `id uuid pk default gen_random_uuid()`,
  `suggested_by uuid references profiles(id)`, `name text not null`,
  `address text`, `kind text`, `status text not null default 'pending'`
  (check: `status in ('pending','accepted','rejected')`),
  `created_at timestamptz not null default now()`, `reviewed_by uuid`,
  `reviewed_at timestamptz`;
- enable RLS;
- **INSERT policy for `authenticated`** — a signed-in user may insert a row with
  `suggested_by = auth.uid()` and `status = 'pending'`. Nothing else;
- **SELECT policy for moderators only** — reuse the existing moderator predicate used
  by `0062` (`exists (select 1 from profiles p where p.id = auth.uid() and p.moderators)`);
- **no UPDATE/DELETE policy for ordinary users.** A suggestion is immutable once filed;
  review (part 2) is moderator-only.
- Follow `0062`'s comment style: state at the top exactly what the policy does and does
  NOT grant, and why.

**3b. Data seam.** In `src/lib/db.ts`, add `suggestPlace(input)` (insert) and, for the
moderator queue, `listPlaceSuggestions()`. Follow the file's existing conventions —
read how `createPlaceComment` (db.ts:6543) and `listReports` are written and match them.

**3c. The affordance.** In `src/components/PlaceDirectory.tsx`, a **"Don't see your
place? Suggest it"** control, keyboard-reachable, ≥44px, `data-testid="suggest-place-cta"`.
It must be reachable at 390px without widening the page (the One-Column Rule; the suite
asserts `scrollWidth <= clientWidth + 1`).

**3d. The form.** Name (required), address (optional), kind (optional select reusing
the app's existing place-kind vocabulary — find it, do not invent one). On submit: insert,
clear, and show a short confirmation that says the suggestion is **pending review** — the
founder's words are "users moderate the site", so the confirmation must not promise an
immediate listing.

**3e. The queue.** On `src/pages/ModPage.tsx`, a second section listing pending
suggestions (name, address, kind, who filed it, when). **Read-only in this slice** — no
accept/reject buttons yet. A moderator must be able to SEE the queue.

---

## 4 — What NOT to touch

- **The `places` table and its policies.** Do not add an INSERT policy to it. That is
  part 2's decision, made deliberately, not a shortcut here.
- **Photo upload.** `PlacePhotoAdmin` / `uploadPlacePhoto` exist for moderator photo
  replacement on existing places. Do not wire them to suggestions in this slice.
- **The seeded directory.** `PlaceDirectory`'s list comes from `listPlaces`; do not mix
  pending suggestions into it. `/mod` is the only place a pending suggestion is visible.
- `AGENTS.md`, `CONTEXT.md`, `docs/RELEASE-CHECKLIST.md`, `vite.config.ts` — the
  orchestrator owns these.
- Another lane's worktree. Stage by path only; never `git add -A`.

---

## 5 — Do NOT write tests

**Do not write unit or integration tests.** Measured: agent-written tests restate the
agent's own interpretation and do not improve outcomes. If you change a file that has an
existing spec, run that spec. Otherwise typecheck + guards + a real manual check is the
evidence.

---

## 6 — Verification (quote raw output)

```bash
npm run typecheck
npm run guards          # expect: GUARDS: PASS, exit 0
```

Then **prove the intake really works**, in the browser, against the live dev DB:

1. Signed in as an ordinary (non-moderator) parent, open `/browse`, use the new control,
   submit a suggestion.
2. Confirm the row landed: `select id, name, status, suggested_by from place_suggestions order by created_at desc limit 1;`
   and that it is visible **on `/mod` as a moderator**.
3. Confirm an ordinary user **cannot** see the queue (the `/mod` route is already guarded).
4. **Delete the row you created**, and say you did.

Quote the raw output of each. If any of it fails, report **BLOCKED** with the one
question that would unblock it.

---

## 7 — Report and reply

Report to **`.scratch/muyfptn4-suggest-report.md`**: what you built, the migration number
you used, the raw verification output, and the exact `data-testid` values you added.

Reply with only:

```
Sentinel: MUYFPTN4-SUGGEST-A-PLACE-INTAKE-K3V8
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/muyfptn4-suggest-report.md
```
