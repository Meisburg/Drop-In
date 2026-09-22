# Implementation Plan: V19 — tight maps, feed map, two-parent profiles

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below is executable without interpretation.
>
> Spec: `.scratch/v19/spec.md` (D1–D5 ruled 2026-09-21). Build law:
> `docs/agents/code-structure.md`. Gate: `npm run verify`.
>
> **⚠️ EVIDENCE MUST BE A FILE, NOT PROSE.** Every slice writes its command
> output to `.scratch/v19/evidence/<slice>-<what>.log` and records the exit
> code. In V17 this was made a blocking review finding twice; in V18 the same
> discipline is what let the `ocr` findings be adjudicated from artifacts.
>
> ```bash
> npm run build > .scratch/v19/evidence/<slice>-build.log 2>&1
> echo "exit=$?" >> .scratch/v19/evidence/<slice>-build.log
> ```

## Goal

Make the app feel like a **neighbourhood** rather than a city directory: the map
opens tight on the parent's own address, the feed gets a map of what is actually
happening nearby, and a profile can show the two parents who make up a family —
including when they have separate accounts.

**We know it worked** when: with `radius_miles = 35` stored, `/browse`'s map still
opens tight on the home pin while the list still honours the radius; `/` shows a
map whose pins are the real drop-ins; and two accounts can link and appear on
each other's profile.

## The one thing that must not break

**The radius still filters the LIST.** D1 changes only what the MAP frames. A
diff that stops `filterPlacesByRadius` from running, or that makes the map
re-fit to include everything, has failed the batch — and the map assertion alone
would not catch it, which is why AC 2 asserts both halves.

---

## Slice t01 — the map zoom policy (D1)

**The founder's main ask. Ship this first and verify it on the live site.**

### Interfaces (pinned)

- New named constant in `src/lib/places.ts`:
  `export const MAP_FOCUS_RADIUS_MILES = 1` — the map's frame radius, **always**,
  regardless of the picked list radius. One constant, one meaning; the founder's
  "less than 1 mile view".
- `framingCircle` gains **no** new required behaviour that widens it. Its
  `radiusMiles` input is fed the **focus** radius by the map, while
  `filterPlacesByRadius` keeps receiving the picked radius. **Do not overload one
  value for both** — that is exactly the bug being fixed.
- `MIN_FOCUS_RADIUS_MILES` (0.5) stays as the floor for a *search*-tightened
  frame; the focus radius is the ceiling for the default frame.

### Acceptance criteria

1. Stored `radius_miles = 35` ⇒ the map's frame radius is the focus radius, and
   the rendered marker count matches the radius-filtered list.
2. Changing the radius changes **the number of list rows**, asserted in the same
   spec (the regression guard for §"one thing that must not break").
3. The home pin is inside the canvas bounding box at 1, 5, 20 and 35.
4. Places outside the view are announced, not silently fitted.
5. `framingCircle` unit tests cover: default frame = focus radius; a search that
   narrows tightens below it; a search can never widen it past it.
6. The map still does not re-introduce a points-fit (grep `boundsPoints` = 0).

### Verification command

```bash
npm run verify > .scratch/v19/evidence/t01-verify.log 2>&1; echo "exit=$?" >> .scratch/v19/evidence/t01-verify.log
npx playwright test e2e/places.e2e.ts --reporter=line > .scratch/v19/evidence/t01-e2e.log 2>&1
```

---

## Slice t02 — the feed map (D2)

### Interfaces (pinned)

- **Reuse `PlacesMap`.** Do not write a parallel map component — the V15.2 map
  regressions (`M0 0` markers after a remount, conditional-render unmount) are
  the recorded precedent, and they were fixed in the shared component.
- The feed passes the **distinct places its posts reference**, resolved through
  the same coordinate seam `/browse` uses (`resolveMapCoords`, `zipCoords`).
- Posts with `place_id IS NULL` have **no coordinates**. They get **no pin** and
  must never be invented onto the map. The feed's existing `unplaced` concept is
  the pattern; reuse it rather than inventing a second.
- Per-post pins: option (a) from the V16 t06.3 note — the feed keeps its own
  marker layer, the shared component is not re-shaped for it. **No change to
  `PlaceMap.tsx`'s public props.**

### Acceptance criteria

1. `/` renders a map band above the day sections; the sections are otherwise
   byte-identical in structure.
2. Every PLACED upcoming drop-in contributes exactly one pin.
3. A free-text drop-in (`place_id` null) contributes **no pin** — asserted with
   the spec's own free-text post.
4. A feed with zero placed posts renders the map's empty state, not a broken map.
5. Same tight-zoom policy as t01 (the focus radius, home pin centred).
6. No uncaught JS errors on `/` (the playtest lane's assertion).
7. Mobile audit still passes at `/`.

### Verification command

```bash
npm run verify > .scratch/v19/evidence/t02-verify.log 2>&1; echo "exit=$?" >> .scratch/v19/evidence/t02-verify.log
node scripts/mobile-audit.mjs http://127.0.0.1:4173 > .scratch/v19/evidence/t02-mobile.log 2>&1
```

---

## Slice t03 — migration 0047: parent cards + account links (D3, D4)

### Interfaces (pinned)

**`parent_cards`** — 1–2 rows per account.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `profile_id` | uuid → profiles(id), not null | the owner |
| `name` | text | display name for THIS parent |
| `photo_url` | text null | private-bucket path, the 0038 pattern |
| `about` | text null | the free-text "about me" |
| `position` | integer not null | 1 or 2; the render order |
| `created_at` | timestamptz | |

**`account_links`** — the invite→accept pair.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `requester_id` | uuid → profiles(id) | who sent it |
| `addressee_id` | uuid → profiles(id) | who must accept |
| `status` | text not null | `pending` \| `accepted` \| `declined` |
| `created_at`, `responded_at` | timestamptz | |

**Pinned constraints (the 2021/0012 lessons):**
- ONE card per position per profile: unique `(profile_id, position)`.
- At most one ACCEPTED link per profile: a partial unique index on
  `(requester_id) where status='accepted'` and the mirror, so a parent cannot
  accumulate partners.
- No self-link: `check (requester_id <> addressee_id)`.
- `status` in the three values: a CHECK, because unlike a free-text bio this is
  a closed set the app branches on.
- **Idempotent**, DO-block guarded, no `CREATE POLICY ... IF NOT EXISTS` (the
  2026-09-04 lesson). RLS enabled on both tables.

**RLS, pinned:**
- `parent_cards`: SELECT for authenticated (they render on a profile that is
  already visible); INSERT/UPDATE/DELETE only where `profile_id = auth.uid()`.
- `account_links`: SELECT only for the two parties; INSERT only as
  `requester_id = auth.uid()`; UPDATE (accept/decline) only by the addressee.
  **A third account must read zero rows** — this is the privacy surface and gets
  its own e2e assertion.
- Any policy that must read its own table's other rows uses a SECURITY DEFINER
  helper, never a self-subquery (the 42P17 lesson, `90a159f`).

**Relationship to the existing `profiles.bio` (risk 4):** pinned explicitly —
`bio` stays the account-level "about the parents" text and continues to render
`/u/:handle`; `parent_cards` is the per-parent detail. The migration header must
state this so a later reader does not assume one replaced the other.

### Acceptance criteria

1. Applied live via the management API, **and applied twice** to prove
   idempotency (the V18 precedent — 0046 was proven this way).
2. `information_schema` read-back shows both tables and every column.
3. `pg_policies` read-back shows the policies above.
4. A live probe proves the privacy claim: a third account reads **0 rows** from
   `account_links` for a link it is not part of.
5. No existing row is touched: `profiles` count unchanged.

---

## Slice t04 — link by handle (D3)

### Interfaces (pinned)

Pure seams in `src/lib/links.ts` (sibling test required):
- `normalizeHandle(input)` — strips a leading `@`, trims, lowercases.
- `validateLinkRequest(handle, selfHandle)` — returns an error string or null:
  empty, self-link, unknown handle are distinct messages.
- `linkStatusLabel(status)` — `pending` → "Invite sent", etc.

DB seams in `src/lib/db.ts`, each with the `WithClient` form + a default wrapper
(the house pattern): `requestAccountLink`, `respondToAccountLink`,
`listMyAccountLink`, `unlinkAccounts`, `findProfileByHandle`.

### Acceptance criteria

1. Sending an invite to a handle creates a `pending` row; the addressee sees it.
2. Accept ⇒ both profiles show the link. Decline ⇒ neither does.
3. Unlink ⇒ neither does, and a fresh invite can be sent again.
4. Unknown handle and self-link each show their own message (never a generic one).
5. **RLS asserted in e2e**: a third account cannot read the link, and cannot
   accept someone else's invite.
6. Every new seam unit-tested; red-checked.

---

## Slice t05 — the profile renders two parent cards (D4)

### Interfaces (pinned)

- `/profile` renders up to two cards (photo + name + about), in `position` order.
- A linked partner is shown **as the link**, not duplicated as a second card
  (pinned: one parent = one card; the partner's own card lives on their own
  account).
- Photo upload reuses the existing private-bucket path (0038) — **no new bucket,
  no public URL** (the V9 t11 invariant).
- `parentCardList(cards)` pure seam returns them in order, capped at 2.

### Acceptance criteria

1. One card renders for a single parent; two when both exist.
2. A third card cannot be created (the unique constraint + the UI cap).
3. Photos are private-bucket paths; **no public URL is minted**.
4. The linked partner appears with a link to their `/u/:handle`.
5. Mobile audit passes at `/profile` (the tap-target floor).
6. No kid data appears on a parent card or the map.

---

## Slice t06 — lanes

1. Full e2e suite (batch-end lane, `nice -n 19` — the human works on this
   machine; targeted specs during slices).
2. Playtest lane PASS, 8 routes, 0 uncaught JS errors.
3. Mobile audit including `/` and `/profile`.
4. **`ocr` third lane** over the batch diff. NOTE: it writes its session file
   under `~/.opencodereview/sessions/`, which workspace-write denies — the run
   crashes at finalize and loses its findings. **Use `sandbox_permissions:
   danger-full-access` for that one command**, as recorded in the V18 ledger.
5. Clean-range check (`.scratch/check-push-range.sh`). **Do not track probe
   `.mjs`/`.html` under `.scratch/`** — the gitignore rule added in V18 covers
   it, and the check enforces it.
6. Live-site verification after deploy: compare **code markers, not bundle
   hashes** (a hash is a build artifact, not an identity — the V18 lesson).

## Sequencing

t01 → **[verify the zoom fix on the LIVE site with the founder]** → t02 → t03 →
t04 → t05 → t06.

t03 must land before t04/t05 (schema before flow). t01 and t02 are independent
of t03–t05.

## Ledger

Append one line per event to `.scratch/v19/ledger.md`:

```
Slice N: dispatched (base <sha7>)
Slice N: complete (commits <base7>..<head7>, review clean)
Slice N: fix round R/5 (<X> addressed, <Y> open)
Slice N: parked — <finding> — Ruling: <why the code stands>
```
