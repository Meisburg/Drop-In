SENTINEL: BRIEF-muzk8c1g-t01qct

**Slice `muzk8c1g-t01qct` — verify-and-close: the place-review row already shows the
reviewer's face left of their name, and the name links to their profile (implemented
at base; no re-implementation).**

Repo: `/home/jmeisburg/Projects/playdate-app`. Base: HEAD (`f981c98`). **Do not push.**

Work in the UNIQUE worktree, never the same checkout as another lane:

```bash
cd /home/jmeisburg/Projects/playdate-app
git worktree add /tmp/pd-wt/muzk8c1g-t01qct -b muzk8c1g-t01qct HEAD
cd /tmp/pd-wt/muzk8c1g-t01qct && npm install --silent 2>/dev/null || true
```

All commands run inside `/tmp/pd-wt/muzk8c1g-t01qct`. The stale lane worktree
`.git/worktrees/rev-avatar-k3d7` belongs to the earlier v35-a lane — never touch it.

📌 **WORK ECONOMICALLY.** A fresh session's window is ~98k tokens and it goes fast.
Read only what this brief names; **edit first, verify after** — and this slice
expects **no edits at all**: the work was already landed upstream of your base.
The whole job is to verify the existing implementation against §4 and close the
ticket with raw evidence.

---

## 1 — The annotation (verbatim), and the anchor located BY CONTENT

> *"I think my profile picture should be to the left of my name here so people can
> see who left the review, not just read the name, and the name should be linked to
> my profile. So when you click on it, it takes a user to my profile."*
> — `muzk8c1g-t01qct`, page `http://localhost:5173/place/28652f38-b658-4eb7-983f-97c1bce5fcf0`,
> element `src/pages/PlacePage.tsx:993:21`

The element anchor is a **snapshot of the tree the dev server was serving when he
annotated** — the pre-avatar state. At revision `03a9f9d` (the base the earlier
slice branched from), `PlacePage.tsx:993:21` is exactly the `<p>` that rendered the
reviewer's **name + stars** in a review row:

```bash
git show 03a9f9d:src/pages/PlacePage.tsx | sed -n '985,1000p'
```

…the row keyed `data-testid={`place-review-row-${review.authorProfileId}`}` with,
under the review body, the plain-text name
`<p className="mt-1 text-xs text-slate-500">` — the "not just read the name" he is
pointing at. Line numbers are a snapshot: locate everything by the search strings
below, never by line.

## 2 — What the anchor now IS — and why this slice is a VERIFY, not a build

This same annotation (`muzk8c1g`) was already built and merged for this surface:

- commit **`ff158dd`** — *"feat(place): the reviewer's face sits left of their name,
  and the name links to their profile"* (worktree `rev-avatar-k3d7`; briefs
  `.scratch/v33/briefs/done/v34-b-brief.md` and
  `.scratch/v33/briefs/v35-a-reviewer-avatar.md`);
- merged as **`b9804ae`** — *"merge(reviews): the reviewer avatar left of the name
  (muzk8c1g)"*.

In today's tree (`src/pages/PlacePage.tsx`, the section carrying
`data-testid="place-reviews"`, rows keyed `place-review-row-`), each review row's
meta line already renders, in order:

1. `<span data-testid="review-avatar">` wrapping the app's one avatar primitive
   (`HostAvatar`, `src/components/DropInCard.tsx`) — the reviewer's face, LEFT;
2. the name — `<Link to={`/u/${…}`} data-testid="review-author-link">` (a nameless
   profile renders the plain words "A parent" and is NOT a link);
3. the star count.

…and the behaviour is already pinned by `e2e/place-reviews.e2e.ts`, the test titled
*"a review row shows the reviewer avatar LEFT of their name, and the name links to
their profile (muzk8c1g)"* — avatar LEFT of the name asserted by **geometry**
(measured boxes, not DOM order), the link resolving to `/u/<handle>` and navigating
to that person's public profile (the route exists: `App.tsx`, `path="/u/:handle"`),
the no-photo initial placeholder, and the 390px no-widening rule.

**So: do not re-implement.** This slice closes by verifying the existing
implementation against §4. The only edit permitted is the one a **failed**
criterion forces, and it goes in `src/pages/PlacePage.tsx` (the row's meta line) —
and, only if a row testid moves, the spec that located it, in the same diff.

**Do NOT touch:**

- The `HostAvatar` primitive (`src/components/DropInCard.tsx`) — the row wraps it;
  it is the app's one avatar and must not be edited or grow a testid.
- The `/u/:handle` route and `UserPage` — reuse, never invent a new profile route.
- The review reads (`reviewRows` / `reviewSummary`), the compose modal, the Save
  (follow-place) block, and the "All reviews and comments →" door — the research
  page is a different surface and a different slice.
- **Never** edit or stage `AGENTS.md`, `CONTEXT.md`, `docs/RELEASE-CHECKLIST.md` or
  `vite.config.ts`. Never stage, revert or touch another lane's paths (including
  the stale `rev-avatar-k3d7` worktree).

**Hard rules:**

- **Unique worktree:** `/tmp/pd-wt/muzk8c1g-t01qct` only. Never the main checkout,
  never another lane's worktree.
- **Stage by path only; never `git add -A`.** If a code change is forced by a
  failed criterion, commit it on branch `muzk8c1g-t01qct` in that worktree.
- If it needs a **human decision** or a **PAID data source**, reply **BLOCKED**
  with the reason — one question.

## 3 — Acceptance criteria (checkable)

1. **Avatar left of the name, measured:** on a REAL second reviewer's row (not the
   viewer's own local state), the `review-avatar` box sits LEFT of the
   `review-author-link` box — `avatar.x < name.x` and the boxes' vertical centres
   within a few px — as asserted in `e2e/place-reviews.e2e.ts`.
2. **The name links to the profile:** the link's href is `/u/<the reviewer's
   display name>` (the existing route — `getProfileByHandle` matches
   `profiles.display_name`), and clicking it lands on that person's public
   profile page.
3. **No-photo reviewer** renders the primitive's initial circle (the reviewer
   name's first letter, uppercased) and mounts NO `<img>` — the broken-image case
   is asserted, not hoped for.
4. **Nameless profile** renders "A parent" as plain text and is NOT a link (no
   dead `/u/` link exists).
5. **390px** (`test.use({ viewport: { width: 390, height: 844 } })`):
   `document.documentElement.scrollWidth <= clientWidth + 1` — the page does not
   widen.
6. **One call site, no second circle:** the row draws the face with the app's
   single `HostAvatar` primitive — the diff against base adds no new avatar
   component (if there is no diff, this holds trivially).
7. **If nothing fails, the diff is empty:** `git diff HEAD` in the worktree shows
   no product-code change, and the report says so explicitly.

## 4 — Verification (quote raw output)

```bash
cd /tmp/pd-wt/muzk8c1g-t01qct
npm run verify        # build + test + lint
npm run guards        # expect: GUARDS: PASS, exit 0
```

Then the one spec that pins this slice, on a private port you own in **4210–4218**
(mint the marker ON that port first; kill the server by port or PID — never
`pkill -f`):

```bash
E2E_BASE_URL=http://localhost:4218 npx playwright test e2e/place-reviews.e2e.ts --reporter=list
```

**⚠️** `steering-lint` (and therefore `verify`) may carry findings from ANOTHER
lane's files (their docs, their unstaged config). Quote them, leave them — they
are not yours. Any failure in a file THIS diff touches = stop, `BLOCKED`.

## 5 — Report and reply

Report to **`.scratch/muzk8c1g-t01qct-report.md`**: which acceptance item each
criterion in §3 passed on (with the raw output quoted), and — if you closed
without a change — say so explicitly: *"no diff needed: the annotation is satisfied
at base by `ff158dd` (merged `b9804ae`); ticket `muzk8c1g-t01qct` closes as
already implemented."* If a fix was forced, report the new commit and a one-line
diff summary.

For the reply's `Commit:` line: report the implementing commit **`ff158dd`** if no
new commit was made, or your new `<sha7>` if a fix was forced. Reply with only:

```
Sentinel: BRIEF-muzk8c1g-t01qct
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/muzk8c1g-t01qct-report.md
```