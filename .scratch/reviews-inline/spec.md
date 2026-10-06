# Reviews inline on the place page — spec (2026-10-05)

**Status:** brief only. Nothing built.

**Founder's ask, as taken over (the objective's wording, verbatim):**

> *"A place page should show what parents say, with one button opening a
> lightboxed compose modal on ModalShell; decide the fate of the `/place/:id/details`
> route and check the V24 read-surface ruling before changing what is exposed."*

⚠️ The verbatim founder report is NOT in this repo; the sentence above is the
handover's paraphrase and the only source. It is enough to build against, because
every clause is a measured fact about the current tree (§1, §3) rather than an
inference about taste.

---

## 1. What the code does today (read, not assumed)

Two routes, **both inside `ProtectedShell`** (`App.tsx:880`, `:889`), so both are
signed-in-only already:

| Route | Page | Holds |
|---|---|---|
| `/place/:id` | `PlacePage.tsx` (946 lines) | photo + credit, description, actions (learn-more, directions), followers + follow, "Start here", and ONE link to the other route: `place-more-details` (`:860`) |
| `/place/:id/details` | `PlaceDetailsPage.tsx` (793 lines) | `details-start-drop-in`, `details-follower-line`, `details-follow-toggle`, `place-web-search`, `details-hours`, `details-dropin-proof`, `place-rating-line` (`:605`), the `review-form` (`:641`), the comment wall (`place-comment-count`, `place-comment-input`, `place-comment-submit`, `place-comment`) |

`placeDetailsPath(placeId)` (`lib/places.ts:352`) is the ONE builder for the link
between them; its callers are `PlaceMap.tsx:1822` and its own tests. The map
popup is therefore a second door into `/details` that the place page is not.

**TWO DIFFERENT THINGS ARE CALLED "what parents say"**, and this is the whole
design risk of the slice:

- **a REVIEW** — `place_reviews`: one 1–5 `score` (REQUIRED) + an optional
  `body` (≤500 chars), one row per (place, parent), edited in place
  (`src/lib/reviews.ts`; `ReviewForm.tsx` docblock: "ONE REVIEW PER PARENT PER
  PLACE"). `summarizeReviews` / `reviewRatingLine` are the pure read seams.
- **a COMMENT** — `place_comments`: a free-form wall, no score, many per parent.

Both render on `/details` today and neither renders on `/place/:id`.
`reviewRatingLine` is already used by the directory and the map view
(`PlaceDirectory.tsx`, `PlacesMapView.tsx`), so the place page showing a rating
is a surface catching up, not a new capability.

## 2. The V24 read-surface ruling — checked, and it does NOT block this

The item asks for the ruling to be checked before changing what is exposed.
Ruling, verbatim from `task-state.md:2301`:

> **✅ RULING 2026-10-01 (founder): "yes i guess" — accept as-is.** A signed-in
> stranger seeing another family's parent names is intended; the current behavior
> stands.

And the app's model, from the same entry: *"parents authenticate to see
anything."* Consequences for this slice, stated so nobody re-derives them:

1. **Both surfaces are already behind `ProtectedShell`.** Moving reviews from one
   protected route to another protected route exposes nothing new to an anon
   reader. `/place/:id` is *not* public — the comment at `App.tsx:874-879` says so
   explicitly, and the only public drop-in route is `/playdate/:id`.
2. **No migration is implied.** Any design that would have rendered reviews on a
   SIGNED-OUT place page would need a policy decision; this one does not, and a
   builder must not add a route outside `ProtectedShell` to achieve it.
3. **Review AUTHORS are already shown to signed-in strangers** on `/details`, so
   rendering the same rows inline is not a widening either. The ruling covers it.

## 3. The decision (build this; do not re-open it)

- **A compact "What parents say" block goes ON `/place/:id`**, between the
  followers row and "Start here": the existing `place-rating-line` (moved, not
  rebuilt), then up to **three** review bodies with their author and score, then
  the honest empty/zero sentences.
- **ONE button opens a lightboxed compose modal on `ModalShell`.** One button,
  one label, `min-h-11`: "Add your review" when the viewer has none, "Edit your
  review" when they do (the decision comes from the pure seam, never from a
  ternary in the page — §5). The modal contains the EXISTING `ReviewForm`, moved
  inside `ModalShell` unchanged except that its save handler also closes the
  modal. The lightbox is `ModalShell`'s standard dark backdrop; that is what "on
  ModalShell" means here, and it is a one-line mount, not a new overlay.
- **`/place/:id/details` IS KEPT**, and this is the decision the item asks for.
  Its own docblock (`PlaceDetailsPage.tsx:71`) records why it exists: the
  decision page *"must stay short"*, and the research page is where the full wall
  and the whole comment thread live. Deleting it would either lengthen
  `/place/:id` into the thing V23 slice 5 split out, or drop the comment wall and
  the hours/web-search blocks on the floor. So: the place page gets the summary
  and the compose door; `/details` keeps the full wall, the comment thread, and
  the pure research blocks, and gains a link back to the place page.
- **The summary and the wall read the SAME rows** (`place_reviews`), through the
  same read path, so the two surfaces cannot disagree about the parent's own
  review — the drift class this repo has paid for repeatedly (the one-copy rule,
  `docs/agents/code-structure.md`).

## 4. Interfaces to pin

Test ids that must survive (specs select on them):
`place-rating-line`, `review-form`, `place-comment-count`, `place-comment-input`,
`place-comment-submit`, `place-comment`, `place-more-details`,
`details-follow-toggle`, `details-start-drop-in`, `place-web-search`,
`details-hours`, `details-dropin-proof`.

New ids this slice introduces:
`place-reviews`, `place-reviews-empty`, `place-review-row-<authorId>`,
`place-review-compose-btn`, `place-review-modal`, `place-review-modal-close`.

Pure seams to add (in `lib/`, with sibling tests — a `.tsx` file must not decide):
`reviewComposeLabel(hasMine: boolean): 'Add your review' | 'Edit your review'`
and, projected from `summarizeReviews` for the inline block,
`inlineReviewHighlights(rows, limit)` (returns at most `limit`, in the order the
wall already uses — do not invent a second ordering).

## 5. Acceptance criteria

1. At 390×844 on `/place/:id`, `place-reviews` renders the rating line and up to
   three review bodies; with zero reviews it renders `place-reviews-empty` and NO
   rows (count 0, not an empty container).
2. Exactly ONE compose button (`place-review-compose-btn`) is on the page at
   either width, `min-h-11`, with an accessible name that matches the pure
   label seam for both the has-review and has-none states.
3. Tapping it opens `place-review-modal` (a real dialog: Escape closes, focus is
   trapped, the backdrop is the lightbox), and the form inside is the existing
   `review-form` — assert `toHaveCount(1)` so the old inline copy is gone, not
   duplicated.
4. Saving a review closes the modal and the inline block shows the new row
   without a page reload.
5. `/place/:id/details` still renders the full wall, the comment thread, hours
   and the web-search block, and still renders exactly once from the map popup's
   `placeDetailsPath` link.
6. No anon exposure: `/place/:id` while signed out still redirects to `/login`
   (assert the URL after `goto` with an empty storageState).
7. `npm run verify` stays green and the test count GROWS; the specs that own
   these surfaces (`e2e/place-photo-admin.e2e.ts` touches the place page, and
   whichever spec owns `/details` — find it, do not assume) are green on a
   private port.

## 6. Verification recipe (private port — never a bare playwright run)

```bash
npm run build
npx vite preview --port 4191 --strictPort &
E2E_BASE_URL=http://localhost:4191 npx playwright test e2e/<the-details-spec>.e2e.ts e2e/places.e2e.ts
# kill the preview BY PORT afterwards; never add a playwright.private.config.ts
```

## 7. Open decisions — the founder's, not the builder's

1. **Does the inline block also show a comment COUNT with a link to `/details`,
   or only reviews?** Default: reviews only, plus the existing
   `place-more-details` link — a count that leads somewhere is fine, but it is a
   second number on a page that already shows a rating.
2. **How many review bodies inline — three or five?** Default: three, because the
   block sits above "Start here" on a phone.
3. **Should a parent with no review still see others' bodies?** Default: yes —
   the ruling in §2 makes reviews readable to any signed-in parent, and hiding
   them behind a "write one first" gate would be a new product rule, not a
   layout choice.

## 8. Not in scope

- Moderation, reporting or hiding of reviews; the existing moderation surfaces do
  not change.
- The comment wall's own behaviour (posting, ordering, its box) — it stays on
  `/details` byte-for-byte.
- Review photos, replies, helpfulness votes, or a rating histogram.
- `placeDetailsPath`'s shape or any other caller of it.
