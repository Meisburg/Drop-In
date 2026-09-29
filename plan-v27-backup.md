# Implementation Plan: V27 — the Near you feed

> Owned by the orchestrator. V26 is CLOSED and preserved unchanged below this
> section. This batch builds five slices, commits each on `Meisburg/Drop-Ins`,
> and **never pushes** (the coordinator serializes merges to master). Default
> slice gate is `npm run verify`.
>
> **The job:** a parent on Near you asks four questions — *what can we do in the
> next two hours, will my kid have someone to play with, is the place worth
> going, and is the host someone I'd want to meet.* Today the page answers none
> of them at a glance, and an empty radius is a dead end.

## Cross-cutting environment facts (read before dispatching)

- **No `.env` in this workspace.** `src/lib/db.ts` throws at module load without
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, so the base gate is red until a
  gitignored placeholder `.env` exists (done; never committed).
- **Targeted Playwright e2e CANNOT run in this workspace** — three independent
  blockers: (a) no real Supabase credentials (`SUPABASE_ACCESS_TOKEN` empty,
  placeholder URL), (b) no `e2e/.auth/marker-state.json` (the setup project
  signs up against the live project), (c) port 4173 is held by another lane's
  preview server. Every slice names its targeted spec; the blocker is recorded,
  never silently skipped. `npm run verify` does not open a browser.

### Slice 1: the empty-radius state is no longer a dead end

- **Objective:** the feed's empty state offers the way out that Browse already
  offers, and the location control reads as a control.
- **Files in scope:** `src/pages/FeedPage.tsx`, `src/components/RadiusEmptyState.tsx`
  (stale comment only), `e2e/feed-empty-state.e2e.ts`.
- **Approach:** `FeedPage` passes `showEscapes={false}` on the strength of a
  comment claiming a "persistent radius picker directly above" — the picker was
  removed in V23 slice 1 and the control is now a modal-trigger button. The
  suppression reason is void. Restore escapes (drop the prop / pass `true`) and
  add a chevron affordance to `feed-location-control`. Keep `showPostCta={false}`:
  the raised nav "+" is the persistent post action.
- **Acceptance criteria:**
  1. On `/` at radius 2 with nothing in range, `empty-radius-state` renders both
     `Widen to 20 miles` and `See everything in Seattle`, enabled.
  2. Tapping `Widen to 20 miles` writes `profiles.radius_miles = 20` and the copy
     re-names to `emptyRadiusCopy(20)`.
  3. `feed-location-control` still opens `location-modal`; its accessible name is
     unchanged.
  4. No `Post a drop-in` link inside the feed's empty state.
  5. `/browse` empty state is unchanged.
- **Verification command:** `npm run verify`; then
  `npx playwright test e2e/feed-empty-state.e2e.ts` (blocked here — see above).
- **Ruling:** a control the parent cannot find is a dead end wearing a label.

### Slice 2: the feed says what is happening *now*

- **Objective:** every card inside the 60-minute window is flagged, and the time
  to start/end is stated.
- **Files in scope:** `src/lib/feed.ts`, `src/lib/feed.test.ts`,
  `src/components/DropInCard.tsx`, `src/pages/FeedPage.tsx`,
  `e2e/feed-ended-out.e2e.ts` (extended — it already posts a live drop-in;
  a new spec would have duplicated that fixture).
- **Approach:** add pure `feedCardCountdown(post, nowIso)` (→ `{ tone:'starting'|'ending', label }`
  or null) and `feedNowSummary(posts, nowIso)` (→ `"N happening now · M today"`
  or null). Replace the single-soonest `isStartingSoon` computation in
  `FeedPage` with a per-card call. Render the countdown on its own
  `data-testid="card-countdown"` line so the pinned when-line format is untouched.
- **Acceptance criteria:**
  1. `feedCardCountdown` returns `starts in 20 min` for a post 20 min out, `ends
     in 25 min` for a live post, and null for anything else; boundary-tested at
     exactly 60 min, at start, and after end.
  2. Two posts each starting within 60 min both render `Starts soon` (today only
     the soonest does).
  3. `feedNowSummary` counts live + today correctly and is not rendered when both
     are zero.
  4. Present-tense labels never claim a state the clock has not reached.
- **Verification command:** `npm run verify`; then
  `npx playwright test e2e/feed-ended-out.e2e.ts` (blocked here).
- **As built:** the countdown rides its own `card-countdown` line; the live card
  must contain `/ends in|ending/` (`e2e/feed-ended-out.e2e.ts:396`).
- **Ruling:** the page is already soonest-first; the missing thing is telling the
  parent *how soon*, not re-sorting.

### Slice 3: the place is trust content, not a name

- **Objective:** a place-backed card says what kind of place it is and whether it
  is indoor or outdoor, without a tap.
- **Files in scope:** `src/lib/feed.ts` (query embed), `src/lib/types.ts`,
  `src/components/DropInCard.tsx`, `src/pages/FeedPage.tsx`, fixtures/tests that
  pin the feed row shape.
- **Approach:** embed the place on the feed query —
  `place_ref:places!playdates_place_id_fkey ( id, kind, indoor )` — carry it on
  `PlaydateWithNeighborhood`, and render `data-testid="card-place-trust"` with
  `"{kindLabel} · {indoorLabel}"`. Null/place-less posts render nothing.
- **Acceptance criteria:**
  1. A place-backed row carries `place_ref.kind`/`indoor`; a place-less row
     carries null and renders no trust line.
  2. The trust line uses the existing pure `placeKindLabel`/`placeIndoorLabel`
     seams — no new vocabulary.
  3. No migration.
- **Verification command:** `npm run verify`; then
  `npx playwright test e2e/post-location.e2e.ts` (blocked here).
- **As built:** `places.placeTrustLine` is the pure seam; the feed select
  appends the `place_ref` embed; the assertion lives in `post-location.e2e.ts`
  (it actually posts a picked place), not `place-directory-in-new.e2e.ts`
  (that spec never submits).
- **Named gaps (not silently skipped):** *rating on the card* needs a batched
  `review_summaries_for(uuid[])` (the 0052 RPC is per-place and the house rule is
  one call per feed); *open/closed* has **no data source at all** — no
  open-hours column exists anywhere, and an invented "Open" badge would break
  `PRODUCT.md`'s honesty rule.

### Slice 4: "will my kid have someone to play with"

- **Objective:** the going line says the age BAND of the kids who are coming,
  not just how many.
- **PRIVACY CONSTRAINT (pinned):** `DropInCard`'s contract states *"decision #2
  keeps names and ages off the card entirely — they reach only the host and the
  people going."* This slice therefore exposes **only an aggregate min–max
  band**, never a per-kid age and never a kid identity.
- **Files in scope:** new `supabase/migrations/0056_kid_age_band_going.sql`,
  `src/lib/db.ts`, `src/lib/feed.ts` (label seam), `src/lib/feed.test.ts`,
  `src/components/DropInCard.tsx`, `src/pages/FeedPage.tsx`,
  `e2e/card-circles.e2e.ts` (the going-line spec; it pings without a kid, so the
  band gets a documented TODO there — see As built).
- **Approach:** mirror `0027`'s batched `count_kids_going_for` with a
  `kid_age_band_going_for(uuid[])` returning
  `(playdate_id, min_age, max_age)` from `ping_kids` join `kids`,
  SECURITY DEFINER, authenticated-only, DROP+CREATE idempotent. One batched read
  per feed; the card label is a pure seam. A single distinct age renders
  `age 4`, two or more `ages 2–5`; a null age is dropped, never guessed. The
  count is NOT returned: the existing 0027 count stays the one count source.
- **Acceptance criteria:**
  1. The RPC returns exactly one row per post that has pinged kids with a
     non-null age, and no row for posts with none.
  2. `db.ts` groups it to `Record<postId, {min, max}>`; a failed/pre-apply
     read degrades to `{}` and every card simply omits the band.
  3. The going label reads `3 going · 2 kids (ages 2–5)`.
  4. No per-kid age or identity reaches the client; no per-card query.
- **Verification command:** `npm run verify`; migration apply is **blocked —
  `SUPABASE_ACCESS_TOKEN` is empty and the live dashboard is locked out** (the
  V26 note); targeted `npx playwright test e2e/card-circles.e2e.ts` also
  blocked, and the band's e2e fixture is a documented TODO. Code degrades
  safely pre-apply.
- **As built / GAP (named, not skipped):** migration `0056` is committed but
  **not applied** (no token); the client settles to `{}` on the missing RPC, so
  the band simply does not render live until a coordinator applies it.
- **Ruling:** a count answers "is anyone going"; only a band answers "is anyone
  *my kid's* age" — and the band, never the age list, is what decision #2 can
  tolerate. This amends decision #2 for the aggregate band only, on the
  coordinator's explicit V27 brief; flag for human review.

### Slice 5: the host is a person, not a handle

- **Objective:** the card states the common ground we already hold: whether the
  viewer follows the host.
- **Files in scope:** `src/components/DropInCard.tsx`, `src/pages/FeedPage.tsx`,
  `src/lib/feed.ts` + `src/lib/feed.test.ts` (the pure line builder),
  `e2e/card-circles.e2e.ts`.
- **Approach:** the only input is the already-loaded `followeeIds`. Add pure
  `hostCommonGroundLine(hostId, viewerId, followeeIds)` and render
  `data-testid="card-host-common"`. No new query, no migration, no
  social-proof fabrication (`PRODUCT.md` principle 3).
- **Acceptance criteria:**
  1. `You follow this host` renders when the host id is in `followeeIds` and the
     post is not the viewer's own.
  2. Hidden when the host is not followed, or the host is the viewer, or the set
     is empty.
  3. No new network read is issued.
- **Verification command:** `npm run verify`; then
  `npx playwright test e2e/card-circles.e2e.ts` (blocked here).
- **Ruling (as built):** the line carries ONLY the follow edge. The host's
  picked kids' ages already ride the card's `card-age-range` line (the same
  `kidAgesByPostId` source), so repeating them would print the same ages twice
  on one card — the duplicate-line failure the design reviews reject. Trust is
  structural and honest: name what we *know*, never a verified/safety badge we
  cannot back.

---

# Implementation Plan: V26 — the post-drop-in review prompt

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below must be executable without interpretation. If a slice cannot state its
> acceptance criteria and verification command, it is not ready.
>
> The default slice gate is `npm run verify` (build + test + lint). Anything
> extra is pinned per slice.
>
> **This file replaces the V22 design-quality batch plan, which is preserved
> byte-identically at `plan-v22-backup.md` (verified `diff -q` clean at the time
> of writing).**

## Goal

A drop-in a parent said they were going to ends. Within one 5-minute cron tick
of it ending, that parent gets **one** Web Push — or, if they have no device
registered at all, one email through the existing fallback branch — inviting
them to rate the place. Tapping it lands on `/place/<id>/details`, where the
**existing** `ReviewForm` is already rendered, and the rating they leave is the
**same row** the place page has always written (`reviews`, one row per
(place, parent), migration 0052). No new table, no new form, no new route.

We will know it works when a seeded finished drop-in with a `place_id` produces
exactly one `notification_log` row of kind `review_due` on the first run of
`send-push` and zero on the second, and the row's `url` opens the review form.

## Non-goals

- **No new review model.** `reviews` stays place-level, one row per
  (place, parent). No per-drop-in reviews, no attendance verification, no
  "verified visit" badge. The review prompt and the place page write the same
  record — that is a requirement, not an implementation detail (see Interfaces).
- **No in-app "while you were away" prompt.** Push + email only. An in-app
  banner is a separate ask if the push proves too quiet.
- **No prompting when `place_id is null`.** Most drop-ins are at a typed
  address with no directory place to attach stars to; the feature is silent
  there. Accepted gap.
- **No anti-nag beyond what exists.** The `(profile_id, kind, playdate_id)`
  unique key already makes it once-per-drop-in, and the `/settings` per-kind
  mute already covers "stop telling me". A weekly family at the same park gets
  a weekly prompt; a "don't ask again for this place" rule is out of scope.
- **No change to `notificationUrl(playdateId)`.** It is pinned by
  `src/lib/push.test.ts:283` and five call sites use it. Add a sibling function
  instead.
- **No new route.** `/place/:id` and `/place/:id/details` both exist
  (`src/App.tsx:511` and `:520`), so `routes.json` (the playtest lane) is
  unchanged.
- **No service-worker change.** `src/sw.ts:154` reads `data.url` generically.

## Interfaces

The orchestrator pins these. Builders do not re-decide them.

**Kind name:** `'review_due'`. Deliberately **not** reusing `'ended'`, which
already means *"the host ended it early — don't head out"* (`0041`, pin d) —
different moment, different copy.

**Copy** (the one place it lives, per `0032` pin i):

| Field | Value |
|---|---|
| push title | `How was "<subject>"?` |
| push body | `You said you were going — rate the place.` |
| url | `/place/<place_id>/details` |

`<subject>` is the drop-in title, falling back to `'your drop-in'` — the
existing `TITLE_FALLBACK` in `_shared/emailCopy.ts:55` (reviewer caught this
plan citing `:44`, which is wrong at base `63ef790`).

**The body says "you said you were going", not "you went".** `going_pings`
(`0007`) has **no status column and no check-in exists** — a ping is a stated
intention, not evidence of attendance. Copy that claims attendance would be
false for every no-show. This is a hard rule for the reviewer, not a style note.

**New pure function in `supabase/functions/_shared/pushCopy.ts`:**

```ts
export function reviewPromptUrl(placeId: string): string {
  return `/place/${placeId}/details`
}
```

`NotificationPayloadInput` gains exactly one optional field:

```ts
  /** The place to review. Only `review_due` uses it; null falls back. */
  placeId?: string | null
```

`buildNotificationPayload` returns `reviewPromptUrl(placeId)` for `review_due`,
and **falls back to the existing `notificationUrl(playdateId)` when `placeId` is
null/empty** — never `/place/null/details`.

**"Finished" means `status = 'on' and ends_at < now()`.** Nothing sets `'ended'`
automatically (only a host ending early does, `0041`), so a naturally-expired
drop-in keeps `status = 'on'` forever — that predicate is how "it's over" is
expressed. **A `cancelled` or `ended` drop-in must never prompt for a review.**

**Migration number: `0055`** (highest applied is `0054`; `0055` is next free).
Live-database migration on real family data: every statement guarded, additive,
re-paste-safe — follow `0052`'s structure, not its content.

**The SEVEN hand-maintained lists that describe ONE database constraint.** All
must agree. The explicit drift guard is `src/lib/email.test.ts:87`
(`EMAIL_KINDS` must equal `NOTIFICATION_KINDS`); the `isNotificationKind` block
in `src/lib/push.test.ts` (cited by symbol, not line — the file grew during this
slice and a stale number is how this plan already produced two false citations)
pins the same list from the app side (`isNotificationKind` accepts exactly
these and rejects anything else):

| # | Location | What |
|---|---|---|
| 1 | `supabase/migrations/0041_end_event_early.sql:165` (widened by `0055`) | the `notification_log.kind` CHECK |
| 2 | `supabase/functions/_shared/pushCopy.ts:27` | `NOTIFICATION_KINDS` |
| 3 | `supabase/functions/_shared/pushCopy.ts` (`buildNotificationPayload`) | the copy branch |
| 4 | `supabase/functions/_shared/emailCopy.ts:39` | `EMAIL_KINDS` — **same order** |
| 5 | `src/lib/push.ts` | the `NotificationKind` union + `NOTIFICATION_KIND_COPY` (a `Record`, so TypeScript forces the entry) |
| 6 | `supabase/migrations/0041_end_event_early.sql:246` (replaced by `0055`) | `public.notification_payload`'s `CASE` branches (the `ended` branch is at `:276`) |
| 7 | `e2e/push-subscribe.e2e.ts:939-946` (the `const kinds` array; `'review_due'` at `:945`) | a hand-written five-name array + a docstring asserting "every NOTIFICATION_KIND renders a checkbox" / "all five start CHECKED" |

**Row 7 was added by review, not by the author of this plan — and that is the
point.** This inventory claimed "six" while the slice's own disease (a
hand-maintained kind list that no longer matches the code) was sitting in an
e2e spec the plan never named: `NotificationsSection` maps `NOTIFICATION_KINDS`,
so a **sixth toggle renders with no assertion covering it** and its docstring
became false the moment the kind list grew. `npm run verify` cannot see it —
nothing under `scripts/` names the kinds, and e2e is a separate lane. **Any
future kind change must sweep all seven rows.**

**The SQL payload branch is deliberately unreachable in production** and is
added anyway for twin parity: `review_due` is clock-produced by the scan, which
builds its payload in TypeScript exactly as `catchUpStartingSoon` does
(`send-push/index.ts:269`), so no trigger ever calls `notification_payload`
with this kind. Recording the reason beats a reviewer re-litigating it.

**The email fallback needs almost nothing.** `EmailRow.url` is the relative path
already stored on the `notification_log` row (`emailCopy.ts:77`) and
`emailUrl(url, base)` only prefixes the base (`:124`), so a correct `url` on the
row is all the email needs. Only `EMAIL_KINDS` gains the entry.

**New constant `REVIEW_PROMPT_WINDOW_HOURS = 24` — and it lives in the PURE
module, not in `send-push/index.ts`.** *Corrected while dispatching Slice 2:*
this plan first put it beside `STARTING_SOON_WINDOW_MINUTES` (`send-push:133`),
but a window is a **rule**, and Slice 2's acceptance criterion 4 has to test it —
so a constant in the Deno wiring file would be unreachable from the vitest lane.
It is therefore defined and exported in
`supabase/functions/_shared/reviewScan.ts`, re-exported through
`src/lib/reviewScan.ts`, and **imported** by `send-push/index.ts` in Slice 3.
That is the same direction of dependency as `emailFallback.ts`.

```ts
/** Only drop-ins that ended within this many hours are considered. */
export const REVIEW_PROMPT_WINDOW_HOURS = 24
```

The window keeps the scan bounded. Without it, the every-5-minutes query walks
all history forever. Reuse the existing `MAX_SCAN_POSTS = 500` cap (`:142`).

**Idempotence is the existing unique key, not new logic:**
`upsert(rows, { onConflict: 'profile_id,kind,playdate_id', ignoreDuplicates: true })`.

## Slices

### Slice 1: the `review_due` kind exists, end to end, with no producer

- **Objective:** migration `0055` widens the `notification_log.kind` CHECK and
  completes the SQL twin; all six lists carry `'review_due'`; the pure copy and
  URL rules exist and are unit-tested.
- **Files in scope:**
  - `supabase/migrations/0055_review_prompt.sql` (new)
  - `supabase/functions/_shared/pushCopy.ts`
  - `supabase/functions/_shared/emailCopy.ts`
  - `src/lib/push.ts`
  - `supabase/functions/send-push/index.ts` — **only** the `NotificationKind`
    import/`isNotificationKind` surface if it does not compile; **no scan, no
    wiring**
  - `src/lib/push.test.ts`, `src/lib/email.test.ts`
  - `e2e/push-subscribe.e2e.ts` — **added to scope by review ruling** (see
    Interfaces row 7 and the Status log). Its :931-937 array and its :909/:916/
    :920 docstring are place 7 of the same list; leaving them uncured would ship
    a rendered-but-unasserted sixth toggle and a false docstring.
  - `src/lib/db.ts` — **added to scope by review ruling**: the comment at :3640
    reads "not one of the five" and the diff makes it stale. Comment-only fix.
  - `supabase/migrations/0055_review_prompt.sql` must be mode **644**, matching
    all 50 sibling migrations (it was created `600`; `find
    supabase/migrations -name '*.sql' ! -perm 644` must return nothing).
- **Approach:** mirror `0041`'s amendment structure exactly — `drop constraint
  if exists` + re-`add` the widened CHECK inside the guarded `DO` block; `drop
  function if exists public.notification_payload(text, uuid, text, text, int)`
  then `create` with the `review_due` branch added and **every other branch
  carried over char-for-char**. Re-grant exactly as `0032:268-271` does
  (`service_role` only; `public`/`anon`/`authenticated` revoked). Append
  `'review_due'` to `NOTIFICATION_KINDS` and `EMAIL_KINDS` in the **same
  position in both**; add the `NOTIFICATION_KIND_COPY` entry; add the
  `buildNotificationPayload` branch and `reviewPromptUrl`.
- **Acceptance criteria:** criteria **1–3 are coordinator-applied** (after the
  builder's gate, per `docs/agents/coordinator.md` step 3 — the live apply needs
  the human's CDP browser and credentials, so no builder touches production);
  criteria **4–7 are builder-owned** and must be green before the builder
  returns.
  1. *(coordinator)* `0055` applies clean to the live database and **applies a
     second time with exit 0** (re-paste-safe).
  2. *(coordinator)* Read-back proves `notification_log`'s kind CHECK
     **accepts** `'review_due'` and **still rejects** a bogus kind — both
     probed, not assumed.
  3. *(coordinator)* Read-back proves `public.notification_payload` exists with
     the same signature and `prosecdef`/`stable` as before, and that
     `notification_payload('review_due', …)` returns non-empty
     title/body/url.
  4. `EMAIL_KINDS` and `NOTIFICATION_KINDS` are both **six** entries, in the
     same order; both drift guards green.
  5. `buildNotificationPayload({ kind: 'review_due', playdateId, postTitle: 'Green Lake', placeId })`
     → `url === '/place/<placeId>/details'`, `title === 'How was "Green Lake"?'`.
  6. `buildNotificationPayload({ kind: 'review_due', playdateId, placeId: null })`
     → `url === '/playdate/<playdateId>'`, **never** `/place/null/details`; same
     for `placeId: ''`.
  7. Every test that pinned "the five kinds" becomes "the six kinds" —
     **updated, never deleted**. This includes **all seven places in the
     Interfaces inventory**, and specifically
     `e2e/push-subscribe.e2e.ts:931-937` (append `'review_due'` to the array and
     correct "five"/"all five" in its docstring) — which this plan originally
     omitted from the file list. Post-diff positions the reviewer confirmed:
     drift guard `src/lib/email.test.ts:85`, `notificationUrl` pin
     `src/lib/push.test.ts:345`, `isNotificationKind` `:386` (round 2 inserted
     the `reviewPromptUrl` block at `:349-384`, which moved it from `:360` —
     a number this plan briefly asserted wrongly). The
     `notificationUrl(POST_ID) === '/playdate/<id>'` assertion stays green and
     unmodified.
  8. *(builder)* The introduced-false comment is fixed: `notificationUrl` has
     **one** call site, not five — "used by five call sites" at
     `_shared/pushCopy.ts:53` and `src/lib/push.test.ts:351` is wrong; five
     *kinds* flow through it. Also `src/lib/db.ts:3640` "one of the five" → six.
  9. *(builder)* `0055`'s read-back **asserts** `prosecdef` rather than only
     printing it (it already selects it into `v_prosecdef` and only checks
     `provolatile` at `:298-300`). A value that is printed is a claim; a value
     that is asserted is a proof — the repo's own "assert its own effect" rule
     (`0052`). Expected value: **false**.
  10. *(builder)* `0055_review_prompt.sql` is mode `644`, matching all 50
      siblings; `find supabase/migrations -name '*.sql' ! -perm 644` returns
      nothing.
- **Verification command:** the **builder** runs, from the repo root:
  ```bash
  npm run verify
  ```
  and records its full output to `.scratch/v26/s1-verify.txt` (accepted:
  `npm run verify` is build + vitest + oxlint + `a11y:focus` + steering-lint +
  guards; **none of it opens a browser**, so a builder can run it without
  touching the human's Chrome). The **coordinator** then applies `0055` live
  **twice** via `bash scripts/db-sql.sh --file supabase/migrations/0055_review_prompt.sql`
  — the **browserless** path, which needs no browser at all
  (`docs/agents/browser-lanes.md` §7). **Do not use
  `scripts/cdp-migration-tooling.sh` + `scripts/apply-migration.mjs` for this:**
  the tooling script `pkill -9`s every `google/chrome` process, and the human
  has a live Chrome session on this box, while `apply-migration.mjs` visibly
  navigates a window they are working in. `db-sql.sh` uses the
  `SUPABASE_ACCESS_TOKEN` already present in `.env` against `api.supabase.com`.
  Record to `.scratch/v26/` the two `information_schema` / `pg_proc` read-backs
  and both kind-CHECK probes.
- **Budget:** one local builder context (~98k tokens, `qwen3.8-27b`).
- **Depends on:** nothing.

### Slice 2: the pure scan decision — who gets asked, and what the row says

- **Objective:** the selection rule and the row mapping live in a pure module
  with a sibling test, so the vitest lane can reach them.
- **Files in scope:**
  - `supabase/functions/_shared/reviewScan.ts` (new)
  - `src/lib/reviewScan.ts` (new — the re-export)
  - `src/lib/reviewScan.test.ts` (new — the sibling test `npm run guards`
    requires for every `lib/*.ts`)
- **Approach:** the proven seam in this repo, stated verbatim in
  `send-push/index.ts:36-39`: *"The pure decisions live in
  `../_shared/emailFallback.ts` (which the app's `src/lib/emailFallback.ts`
  re-exports and `src/lib/emailFallback.test.ts` unit-tests), so this file is
  wiring only."* Do exactly that. The module exports a pure
  `isReviewPromptCandidate`-style predicate plus a `reviewPromptRow` mapper
  taking already-fetched values (`{ profileId, playdateId, placeId, title }`)
  and returning the `notification_log` insert shape. **No `Date.now()`, no
  client, no I/O inside the pure functions** — `now` is an argument, the same
  discipline the scan constants encode.
- **Acceptance criteria:**
  1. A drop-in that ended 2 hours ago with `status = 'on'` and a non-null
     `place_id` is a candidate.
  2. `status` of `'cancelled'` or `'ended'` is **not** a candidate, at any
     `ends_at`.
  3. `ends_at` in the future is **not** a candidate.
  4. `ends_at` older than `REVIEW_PROMPT_WINDOW_HOURS` is **not** a candidate.
  5. `place_id` null or empty is **not** a candidate.
  6. The mapper produces `kind: 'review_due'`, the pinned title/body, and
     `url === '/place/<placeId>/details'`.
  7. The candidate predicate is **mutation-checked**: flipping any one of the
     five conditions to always-true makes at least one test fail — the builder
     records which test dies for each flip. (The repo requires a spec that can
     actually fail for the defect it names.)
- **Verification command:**
  ```bash
  npm run verify
  ```
  Evidence file in `.scratch/v26/` recording the five mutation flips and the
  test that died for each.
- **Budget:** one local builder context.
- **Depends on:** Slice 1 (the `review_due` kind and `reviewPromptUrl`).

### Slice 3: wire the scan in, and prove it on the live database

- **Objective:** `send-push` gains `catchUpReviewDue`, runs it on every
  invocation beside the `starting_soon` scan, and a real finished drop-in
  produces exactly one row.
- **Files in scope:**
  - `supabase/functions/send-push/index.ts`
  - `docs/push-setup.md` — only if the deploy note needs the new scan
    documented; **no `pg_cron` change** (the job URL is unchanged, which is the
    whole reason the function keeps its misleading name — `:37-42`)
- **Approach:** `catchUpReviewDue(admin)` mirrors `catchUpStartingSoon`
  (`:206-295`) step for step: one `going_pings` select with the `!inner` embed
  on `playdates` (the `!inner` is what makes the filters restrict the join
  rather than blank the embed — `:212`), the `.in()` exclusion on
  `(kind = 'review_due', playdate_id)` over the **non-empty** id list, the
  `told` set, then the `ignoreDuplicates` upsert. Call it in the handler next to
  the existing scan and report its count in the same JSON summary. Keep the
  whole thing **wiring only** — every decision is already in `reviewScan.ts`.

- **GO-LIVE RUNBOOK — VERIFIED, BROWSERLESS, ONE COMMAND.** The deploy needs no
  interactive login: `npx supabase` resolves CLI **2.118.0**, the
  `SUPABASE_ACCESS_TOKEN` is already in `.env`, and although
  `scripts/push-deploy.sh` reads `.env.push.local`, that file exists only to
  **set** the three VAPID secrets — which `docs/push-setup.md:21` records as
  already set and verified live. So:
  ```bash
  set -a; . ./.env; set +a
  npx supabase functions deploy send-push --project-ref ayzvjwxbxyrcgyoeaxuk
  ```
  **Leave JWT verification ON** (the deploy default) — the function has its own
  service-role wall on top. **And remember the cron:** this command *is* the
  go-live, not a preparation for it.
  **⚠️ TWO FOOTGUNS, BOTH VALIDATED AGAINST THE CLI (2.118.0), BOTH AVOIDED BY
  THE COMMAND ABOVE:**
  1. **NAME THE FUNCTION.** `functions deploy` documents *"Deploys all if
     omitted"* — dropping `send-push` from the command would deploy **every**
     function, including `prefill-playdate`, an unintended production change.
  2. **`--project-ref` IS REQUIRED.** This checkout is not `supabase link`ed, so
     without the flag the CLI errors *"Cannot find project ref. Have you run
     supabase link?"*. Verified: an authenticated `projects list` with the
     `.env` token succeeds non-interactively and resolves the project as
     `ayzvjwxbxyrcgyoeaxuk` / "PlayDate", so **no `supabase login` is needed** —
     the token is sufficient.
  **POST-DEPLOY PROOF — three independent signals, all read from the live
  project (no browser, read-only).** Recorded from the pre-deploy state, so the
  "before" is a fact rather than a recollection:

  | signal | BEFORE the deploy | expected AFTER |
  |---|---|---|
  | `version` | `5` | `6` (must increment) |
  | `updated_at` | `1790450713441` (2026-09-26T19:25:13Z) | ≈ the deploy time |
  | `ezbr_sha256` | `8d25f1f891ffa8684e781cbe4ff622a5d91501ea4ca0a584a2c7cf8eee18da8b` | **a different hash** |

  ```bash
  REF=$(sed -n 's|^VITE_SUPABASE_URL=https\?://\([a-z0-9]*\)\.supabase\.co.*|\1|p' .env)
  curl -s "https://api.supabase.com/v1/projects/$REF/functions" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
  ```
  The count-appearance proof, read from the database (not the function's own
  report, which could lie):
  `select count(*) from public.notification_log where kind = 'review_due';`
  — `0` before, `1` after, and `sent_at` stamped once the drain has run.
  **Do not print any key or secret when running these.**
- **THE FIXTURE FOR CRITERIA 3 AND 4 — DESIGNED, NOT YET SEEDED** (seeding is a
  production write and belongs to the authorized go-live step). Because only
  criterion 1 comes free, the negatives must be built. **Minimal shape:**
  1. **One `e2e-` marked account** (the sweep's primary handle:
     `scripts/sweep-e2e-markers.mjs` deletes `auth.users` where
     `email like 'e2e-%'`, and rows the account owns cascade with it — with a
     safety gate that refuses if a founder account is inside the marker set).
  2. **For criterion 4** (null `place_id` → zero rows): the cheapest possible
     fixture — that account adds **one `going_ping` on an existing finished,
     place-less drop-in**. No new drop-in needed; the scan must then produce
     **zero** rows for that profile, which is exactly the assertion.
  3. **For criterion 3** (`cancelled` → zero rows): no finished cancelled drop-in
     exists, so this one needs a **fixture drop-in** — marked with an `e2e `
     title prefix, `status = 'cancelled'`, `ends_at` in the past, a real
     `place_id` (so only the *status* rule can reject it) — plus one `going_ping`
     from the marked account.
  **Cleanup is provable, and here is why:** `notification_log`'s only foreign key
  is `notification_log_profile_id_fkey` … **ON DELETE CASCADE**, verified live. So
  deleting the marked account removes the `review_due` row with it.
  **⚠️ There is NO foreign key on `notification_log.playdate_id`** (verified
  live) — so deleting a drop-in does **not** remove its notification rows.
  Cleanup must therefore go **through the profile**, which the sweep already
  does; a fixture designed around "delete the drop-in" would leave the row
  behind and fail criterion 7.
  **The upsert's conflict target exists exactly as pinned:**
  `notification_log_profile_id_kind_playdate_id_key UNIQUE (profile_id, kind,
  playdate_id)` — confirmed live, so `onConflict` cannot silently no-op.
  **And a fixture must never be left behind in the feed:** per
  `docs/agents/e2e-fixture-convention.md`, the marker makes a fixture
  *identifiable*, not *invisible* — so the seeded drop-in is visible copy in the
  discovery feed for as long as it exists, which argues for seeding and sweeping
  inside one short, authorized window.
- **THE ONE REAL NOTIFICATION IS IDENTIFIED — AND IT IS THE AWKWARD CASE.**
  Read-only probes of the live project: the single row the first run creates is
  for drop-in `04a073f4-8db7-4adb-8310-9863e1411424` — *"Drop-in at Green Lake
  Park (East)"*, ended `2026-09-26 14:30 UTC` — with exactly **1 pinger**, at
  place *"Green Lake Park (East)"*. That place **already has 1 review**, and the
  pinger is **the same profile that wrote it**
  (`pinger_already_reviewed_this_place = true`). So the first real notification
  this feature ever sends is a prompt to **edit an existing review**, not to
  write a first one. Risks item 3 accepted that case in the abstract; it is no
  longer abstract — **it is the only case that fires today.**
  **Open human decision, bundled with the deploy authorization:** go live as-is
  and accept one prompt-to-update, **or** add a *"skip parents who already
  reviewed this place"* exclusion first (an anti-join against `reviews` on
  `(place_id, author_profile_id)`) — one filter in the scan, plus a Slice 2
  amendment and a re-review. The orchestrator recommends **adding it**, because
  prompting someone who already reviewed a place is nagging by construction and
  recurs for every parent who reviews a place and then attends another drop-in
  there. Either way the deploy waits for the human's word.
- **THE WIRING HAS NO UNIT LANE, AND THAT IS WHY THE DECISIONS ARE ELSEWHERE.**
  Verified by reading both Deno scripts: `scripts/deno-check-functions.sh`
  type-checks the functions but **never runs** them, and
  `scripts/deno-test-functions.sh` is **hardcoded to stage and run exactly one
  file** — `_shared/smtpDeno_test.ts` — so it is not a general Deno test runner.
  Plain `npm run test` (vitest, Node) cannot load an Edge Function that touches
  `Deno` globals. **Therefore `catchUpReviewDue` cannot be unit-tested by any
  existing lane**, and the builder must not invent one, add a `deno.json`, or
  claim coverage it does not have. The verification for this slice is exactly:
  `npm run verify` (which includes the already-green `reviewScan` sibling test)
  + `bash scripts/deno-check-functions.sh` (types) + **the live proof, which is
  the coordinator's**. This is the whole reason the plan pushes every decision
  into the pure `reviewScan.ts` and holds `index.ts` to wiring only: **the
  wiring's only real test is the run against the live database.**
- **THE EMBED STRING IS PINNED** (verified against the live schema and the
  precedent at `send-push/index.ts:216`): the foreign key is
  **`going_pings_playdate_id_fkey`** (`going_pings.playdate_id → playdates(id)
  ON DELETE CASCADE`, confirmed live), so the select is
  `'profile_id, playdate_id, playdate:playdates!going_pings_playdate_id_fkey!inner ( id, title, ends_at, status, place_id )'`
  — the precedent's four columns plus **`ends_at`** (the window and "is it
  over" both need it) and **`place_id`** (the mapper needs it, and the
  `place_id is not null` filter depends on it). The `!inner` is load-bearing:
  without it the playdate filters would blank the embed instead of restricting
  the join.
- **GO-LIVE MECHANICS — CORRECTED WHILE PREPARING THIS SLICE. THE DEPLOY *IS*
  THE GO-LIVE.** Verified against the live database this slice targets:
  `cron.job` jobid 3 is `send-push-every-5-minutes`, schedule `*/5 * * * *`,
  **`active = true`**. So this slice does **not** end at a by-hand invocation I
  control: the moment the new `send-push` is deployed, the cron runs
  `catchUpReviewDue` within five minutes, inserts the rows, and drains them.
  **The human checkpoint belongs BEFORE the deploy, not before an invocation** —
  and the plan's criteria below were originally worded as though a manual call
  were the go-live moment. **Measured cost, read-only, before building it:** 23
  drop-ins · 12 place-backed · 2 finished-and-place-backed inside the 24h window
  · **1** `going_pings` row across them — so the first automatic run notifies
  **exactly one real family**, and a sent push cannot be recalled.
- **What real data can prove for free, and what it cannot** — **CORRECTED: I
  originally wrote that real data proved criterion 4 for free, and that was
  WRONG.** The first reading counted 4 finished drop-ins with `place_id is null`
  in the window, which looked like free coverage. Running the scan's actual
  query against the live API settled it: with the pinned embed and the
  `place_id` filter **removed**, the window still returns **1 row, of which 0
  have a null `place_id`** — because the scan joins **from `going_pings`**, and
  those place-less drop-ins have **no pingers at all**, so they never enter the
  candidate set. The `place_id is not null` filter therefore excludes nothing in
  the live window: correct by construction, **unexercised by production data**.
  The correct statement is: **only criterion 1 comes free** (the one identified
  real row); **criteria 3 AND 4 both need a seeded fixture**. And
  `finished_cancelled_or_ended_24h = 0`, so criterion 3 was never free either.
  **Any fixture must carry the marker convention in
  `docs/agents/e2e-fixture-convention.md`** — account email `e2e-` prefix,
  drop-in title `e2e ` prefix, cleanup scoped to owned ids — or it becomes
  unsweepable content in real parents' discovery feed, which is the exact leak
  that document's guard exists to prevent.
- **The by-hand invocation is available** and must not be reported as blocked on
  a credential: `GET https://api.supabase.com/v1/projects/<ref>/api-keys` with
  the `SUPABASE_ACCESS_TOKEN` already in `.env` returns the `service_role` key
  (HTTP 200, verified), which is what `docs/push-setup.md:220-221` invokes the
  function with. (`.env` itself holds no service-role key — but "not in `.env`"
  is not "not available", the false negative this repo paid ~25 rounds for
  during V16.)
- **SLICE 3 MUST CALL THE PREDICATE BEFORE THE MAPPER.** Slice 2's
  `reviewPromptRow` is deliberately **total**: it does not re-run
  `isReviewPromptCandidate`, so a blank `placeId` passed straight to it yields
  the fallback `/playdate/<id>` url rather than an error (tested in
  `reviewScan.test.ts`). That keeps one copy of the rule, but it means the
  mapper is **not** a safety net — `catchUpReviewDue` must filter with the
  predicate first, and its SQL-side `.not('place_id','is',null)` filter is the
  second, independent wall.
- **Two boundary choices in Slice 2 are ACCEPTED as judgement calls** (both
  pinned by tests, both inconsequential against a 5-minute cron): exactly
  `ends_at === now` is treated as *not yet over* (`>=` rejects), and exactly
  24h old is treated as *inside* the window (`>` rejects only strictly older).
- **Acceptance criteria:**
  1. One invocation inserts exactly **one** `notification_log` row: `kind = 'review_due'`,
     `sent_at is null`, `url = '/place/<place_id>/details'`, `profile_id` = the
     pinging parent. **No fixture is needed for this criterion — CORRECTED, real
     data supplies it:** the one row the first run creates is for drop-in
     `04a073f4-8db7-4adb-8310-9863e1411424` (*"Drop-in at Green Lake Park
     (East)"*, ended `2026-09-26 14:30 UTC`), whose `place_id` is
     `7b6ada36-b925-4a13-8850-f29593e2dc2f`, and the scan's exact query was run
     read-only against the live API to confirm it returns **exactly that one
     candidate** (HTTP 200).
  2. **A second invocation inserts zero** — `select count(*)` on that
     `(profile_id, kind, playdate_id)` is still `1`. **Read the count from the
     DATABASE, never from the function's own `reviewDueCreated`:** that field
     returns rows **attempted**, not created (the reviewer proved it is
     precedent-identical to `startingSoonCreated`), so under a concurrent
     double-fire it can over-report. The DB is the only witness.
  3. A seeded **cancelled** finished drop-in produces **zero** rows.
  4. A seeded finished drop-in with `place_id is null` produces **zero** rows.
  5. The existing `starting_soon` scan still reports its own count unchanged —
     the new scan does not disturb it (both counts appear in the response).
  6. The row drains: one real push (or one email, for a profile with no
     subscription) is sent and `sent_at` is stamped — or, if no live device is
     available, the drain's dry path is recorded and the gap named explicitly
     rather than claimed as passing.
  7. Every fixture is cleaned up, and the cleanup is verified by a post-run
     `count(*) = 0` — the repo's e2e-fixture convention. **Fixtures exist only
     for criteria 3 and 4** (criterion 1 needs none), and cleanup goes **through
     the profile**: `notification_log` cascades on `profile_id` but has **no FK
     on `playdate_id`**, so deleting a drop-in would leave the row behind.
- **Verification command:**
  ```bash
  npm run verify
  ```
  plus the live by-hand invocation (`send-push` is documented as runnable by
  hand — `:5`), with every request/response captured to
  `.scratch/v26/live-*.json` and the seeded rows' before/after state recorded.
- **Budget:** one local builder context.
- **Depends on:** Slice 2.

### Slice 4 (human decision, V26 amendment): skip parents who already reviewed the place

> **Added 2026-09-27 by human decision** — the human chose the orchestrator's
> recommendation ("add the skip first") over "deploy as-is". It AMENDS Slice 2
> (one new pure rule) and Slice 3 (one new read in the wiring); it changes no
> migration, no route, no copy, and no other kind.

- **Objective:** a parent who already has a `reviews` row for the drop-in's
  place is **not** asked to review it again. The prompt becomes
  "rate this place" for a first rating, never "edit the rating you left".
- **Why:** the one real candidate the first live run would have notified
  (drop-in `04a073f4…`) is the **same profile that already wrote that place's
  review**. Risks item 3 accepted the case in the abstract; it is the only case
  that fires today. Prompting someone who already reviewed a place is nagging by
  construction and recurs for every parent who reviews a place then attends a
  second drop-in there.
- **Files in scope:**
  - `supabase/functions/_shared/reviewScan.ts` — the pure rule
  - `src/lib/reviewScan.test.ts` — the sibling test (guards require it)
  - `supabase/functions/send-push/index.ts` — the scan's new read + the fact it
    injects + two stale header/comment corrections
- **Approach (pinned; the builder does not re-decide it):**
  1. `ReviewPromptFacts` gains a **required** `alreadyReviewed: boolean` —
     required (not optional) so TypeScript, not discipline, forces every caller
     to supply the fact. Rule **(f)**, appended after (e) so the existing a–e
     numbering and their killing tests are untouched:
     `if (facts.alreadyReviewed) return false`.
  2. `catchUpReviewDue` derives the candidate **place** ids from the already-
     fetched `pings` (trimmed, unique, non-empty), reads
     `reviews (place_id, author_profile_id)` with `.in('place_id', placeIds)`
     **only when that list is non-empty**, throws on `reviewError` like the two
     existing reads, and builds a `Set` keyed `` `${author_profile_id}:${place_id}` ``.
     The predicate call adds
     `alreadyReviewed: reviewed.has(\`${row.profile_id}:${row.playdate?.place_id ?? ''}\`)`.
  3. The predicate still runs **before** the mapper (Slice 3's rule), and this is
     a **fifth rejection**, not a filter that reorders anything.
  4. **Header honesty (the disease this batch has already paid for twice):** the
     file header's `review_due` sentence and `catchUpReviewDue`'s doc comment
     must state the new exclusion; a comment the diff makes false is a defect.
- **Acceptance criteria:**
  1. `isReviewPromptCandidate` returns **false** when `alreadyReviewed` is `true`,
     at any `status`/`endsAt`/`placeId`, **with a positive control** at identical
     facts and `alreadyReviewed: false` → `true` (proves the new fact, not a
     neighbouring rule, decided it).
  2. The module stays pure — the existing no-clock/no-client/no-I/O checks pass —
     and rule (f) is **mutation-checked**: flipping it to a no-op kills the named
     test; raw output saved to `.scratch/v26/`.
  3. `catchUpReviewDue` reads `reviews` for the candidate places, keyed on the
     `(author_profile_id, place_id)` pair, and passes `alreadyReviewed` into the
     predicate; the predicate is still called before `reviewPromptRow`.
  4. The new read is **bounded** (candidate place ids only, `.in()` on a
     non-empty list) and its PostgREST error is thrown — never swallowed.
  5. The file header and the function doc comment describe the new exclusion.
  6. `npm run verify` **EXIT=0** and `bash scripts/deno-check-functions.sh`
     **EXIT=0**; no test deleted or weakened.
  7. *(coordinator, read-only, BEFORE any deploy)* the scan's exact query with the
     new exclusion applied returns **zero** candidates for the identified real
     drop-in `04a073f4…` — so the go-live notifies no family that has already
     reviewed the place.
- **Verification command:**
  ```bash
  npm run verify
  bash scripts/deno-check-functions.sh
  ```
  Evidence in `.scratch/v26/` (gate output, Deno output, the mutation flip).
- **Budget:** one local builder context.
- **Depends on:** Slice 2 (the predicate) and Slice 3 (the wiring).

## Risks / open questions

1. **`REVIEW_PROMPT_WINDOW_HOURS = 24` is the orchestrator's choice, not the
   human's.** Every other decision in this plan traces to a human answer; this
   one does not. The failure it bounds: a parent who ignores the prompt for a
   week still gets nothing new, because the row was inserted on the first tick
   after the drop-in ended and is never withdrawn — the window governs which
   drop-ins are *considered*, not how long a parent has to act. Flagged so the
   human can reduce it to 6h or raise it; it blocks neither slice.
2. **The copy wording is the orchestrator's draft** (pinned in Interfaces).
   It is honest about attendance, which is the constraint that matters; the
   exact phrasing is a founder read.
3. **A parent who already reviewed that place is still prompted once.** The
   `ReviewForm` loads their existing review and the button reads "Update
   review" (`src/components/ReviewForm.tsx:214`), so this is coherent rather
   than broken — but it is a prompt to edit, not to write. Accepted.
4. **No-shows get asked.** `going_pings` records intent only. The copy says so.
   Accepted as the cost of having no check-in.
5. **`0055` touches a live database holding real family data.** Guarded,
   additive, re-paste-safe, applied twice with read-back — the `0052`/`0053`
   standard. This is the only genuinely risky step in the batch.
6. **The push is the only surface.** No in-app fallback for a parent who has
   muted notifications or declined the browser permission — the `starting_soon`
   scan has the same property, so this is consistent, but it means a muted
   parent never learns the prompt exists.
7. **RETIRED — "the `ADD CONSTRAINT` could abort on a pre-existing row outside
   the CHECK."** Raised by the reviewer as uncheckable without SQL; retired by a
   coordinator read-only probe of the live table: the only kinds ever stored are
   `cancelled` (290), `ping_received` (273), `new_comment` (16) and
   `starting_soon` (1) — a strict subset of the five-value CHECK. Nothing
   outside it can fail validation. (Read via `bash scripts/db-sql.sh --read`,
   the browserless path.)
8. **RETIRED — "dropping then re-adding the CHECK leaves a window with no
   constraint if `db-sql.sh` autocommits per statement."** The live constraint
   definition read during the same probe **is** `0041`'s widen —
   `CHECK (kind = ANY (ARRAY['ping_received','starting_soon','cancelled',
   'new_comment','ended']))` — so this exact drop-then-add pattern has already
   been applied through this exact path and is visible in production. No
   `004x`/`005x` migration uses an explicit `begin;`/`commit;`: `db-sql.sh` POSTs
   the entire file as **one** query string, which the Supabase SQL API evaluates
   as a single request.
9. **THIS PLAN'S OWN INVENTORY WAS WRONG, AND REVIEW FOUND IT.** The Interfaces
   section listed "six" hand-maintained kind lists while the slice's own disease
   sat uncured in a seventh (`e2e/push-subscribe.e2e.ts`), and Slice 1's file
   list omitted it while criterion 7 demanded it — the builder could not satisfy
   the criterion without leaving scope. Resolved by **widening both**, not by
   narrowing the criterion (see the Status log for the ruling and its reasoning).
   Recorded rather than tidied away: a plan that miscounts its own inventory is
   the failure mode this batch exists to cure.

## Status log (orchestrator appends after every phase transition)

- 2026-09-26 — **Plan written, batch opened as V26, no slice dispatched yet.**
  Derived from a founder idea ("after somebody attends a drop-in they should be
  given the opportunity to give feedback on that place… five stars one through
  five and also write a comment"), which the orchestrator grounded in the
  existing system before planning: the stars-and-comment half **already ships**
  (`reviews`, migration `0052`; `ReviewForm`; the aggregate line on place
  pages, browse cards and map pins), so the whole batch is the *prompt*.
  Two decisions taken by the human, both recorded in the Non-goals:
  (a) the prompt writes **the same `reviews` row** the place page writes — no
  new table; (b) **`place_id is null` prompts nothing**. Supersedes the V22
  plan (preserved at `plan-v22-backup.md`, `diff -q` clean). Next action:
  dispatch Slice 1 to one local builder.

- 2026-09-26 — **Slice 1 built, independently verified green, reviewed
  NEEDS_CHANGES. Fix round 1 dispatched. `0055` NOT yet applied.** Verifier
  reproduced the gate exactly (`npm run verify` EXIT=0 · 55 files / 1754 tests ·
  78 warnings / 0 errors · GUARDS PASS · Deno lane EXIT=0 · no test deleted) and
  **corrected this file's lint baseline**: the real base at `63ef790` is **78**
  warnings, not the 68 repeated here since V21 — so this diff's lint delta is
  **0**. Reviewer verdict NEEDS_CHANGES on one blocking finding (the e2e
  five-kind array and its now-false docstring) plus four comment-level findings
  and **three defects in this plan**, all accepted. Coordinator rulings:
  **(A) widen, don't narrow** — criterion 7 is widened and
  `e2e/push-subscribe.e2e.ts` + `src/lib/db.ts` join Slice 1's file list,
  because narrowing would enshrine a rendered-but-unasserted sixth toggle and a
  declared-false docstring, which is precisely the drift this batch exists to
  cure; **(B)** the diff introduced a falsehood — `notificationUrl` has **one**
  call site, not five ("used by five call sites") — and a false comment is a
  defect, not a nit; **(C)** `docs/push-setup.md:212` parked to Slice 3, which
  already owns that file; **(D)** `0055`'s read-back must **assert** `prosecdef`
  (expected `false`), not merely print it; **(E)** `0055` moves to mode `644`,
  matching all 50 siblings. Two reviewer risks **retired with live data**, not
  argument: the `ADD CONSTRAINT` cannot abort (only 4 kinds ever stored, all
  inside the CHECK) and the drop-then-add window is a non-issue (the live
  constraint *is* `0041`'s widen, applied through this same browserless path).
  The brief's "keep `security definer`" was **my error** and the builder was
  right to refuse it. Next action: fix round 1 returns, then re-review, then the
  coordinator's live apply.

- 2026-09-26 — **Slice 2 COMPLETE AND ACCEPTED, then pushed (`7e53c22`).** Three
  new files: the pure rules in `_shared/reviewScan.ts`, the `src/lib` re-export
  seam, and the sibling test the guards require. Reviewer **PASS** with all seven
  criteria at `file:line` and no blocking findings; the verifier's own gate green
  (56 files / 1784 tests / guards PASS / Deno EXIT=0). Mutation-checked: **5/5
  rule flips each killed a different named test**, raw per-flip output saved. The
  module is provably pure — no clock read, `now` is a parameter, proven by a test
  that ages the same facts out under a later `now`.
  **A red gate turned out to be a genuine environmental flake**, and it was
  disproved rather than explained away: `scripts/guards/no-bypass-guard.test.mjs`
  failed once inside the full suite with a git-internal hardlink error, then
  passed **5/5 in isolation and 3/3 at the base commit**, with two independent
  full gates green on the identical tree. Causation was **impossible by
  construction** — that guard's clone is built from `git push HEAD`, and every
  Slice 2 file was **untracked**, so the failing process could not have contained
  them. Deferred known issue: this flake can spuriously red the gate, and the
  pre-push hook runs the same gate; candidate fix is `--no-hardlinks` in
  `plainClone()`. **The coordinator's own "commit-graph rewritten at 20:24"
  hypothesis was killed by the verifier** — that mtime is the `..` row for
  `.git/objects`, not the directory's, and no writer is configured.
- 2026-09-26 — **Slice 3 CODE COMPLETE AND ACCEPTED, pushed (`e64d298`). The
  batch's only remaining item is the human-authorized go-live.** `catchUpReviewDue`
  wired into the 5-minute scan, mirroring `catchUpStartingSoon` step for step:
  reviewer verdict was NEEDS_CHANGES on one blocking finding (a file header this
  slice made false), plus assertions that everything else was right — wiring-only,
  predicate strictly before the mapper, the embed character-identical, the
  non-empty `.in()` exclusion, the pinned upsert, both counts reported, and
  **`catchUpStartingSoon` byte-identical** (91 lines vs 91, proven by extraction
  in both lanes). The fix round was prose-only and the re-review returned **PASS
  with no blocking and no non-blocking findings**, confirming all four corrected
  sites accurate and **no new false claim introduced**.
  **The re-review settled a dispute by enumeration, against the coordinator:**
  every `insert into public.notification_log` is one of four statements inside
  exactly **three** function bodies — `0041:178` *replaces* `0032:416` rather
  than adding one — so it is **three functions, four kinds**. The builder refused
  the coordinator's "four functions" instruction and was right.
  **Cross-slice seams verified** (a check no lane owned): the window constant has
  one source, the kind name agrees in all seven places, the url encodes like the
  canonical `places.ts:327` builder, and the copy has one source pinned against
  its SQL twin.
  ⛔ **NOT DEPLOYED, DELIBERATELY.** `cron.job` jobid 3 is active at `*/5`, so
  **deploying IS the go-live** — one real family, irreversibly. Everything about
  it is rehearsed: a single browserless command, no `supabase login` needed, two
  footguns pinned (name the function or it deploys all of them; `--project-ref` is
  mandatory because this checkout is not `supabase link`ed), and the landing
  proved by three live signals (`version` 5→6, `updated_at`, `ezbr_sha256`) plus a
  database row count rather than the function's own `reviewDueCreated`, which
  reports rows *attempted*. The fixture for criteria 3–4 is designed, and cleanup
  must go **through the profile** — `notification_log` cascades on `profile_id`
  but has **no FK on `playdate_id`**.

- 2026-09-27 — **Slice 4 (the human-chosen amendment: skip parents who already
  reviewed the place) is built, reviewed, fixed, and verified green. The
  go-live is the only remaining step.** The human chose the orchestrator's
  recommendation ("add the skip first") over "deploy as-is". Slice 2 gains a
  **required** `alreadyReviewed` fact and rule **(f)**; Slice 3's
  `catchUpReviewDue` gains the bounded `reviews (place_id, author_profile_id)`
  read and injects the fact. Builder DONE (`npm run verify` EXIT=0 · 56 files /
  **1785 tests** · 78 warnings / 0 errors · GUARDS PASS; `deno-check` EXIT=0;
  rule (f) mutation-killed by the named test). Verifier independently reproduced
  the full gate and the Deno lane (`.scratch/v26/s4-verify-verifier.txt`,
  `s4-deno-verifier.txt`). Reviewer **NEEDS_CHANGES** on exactly one blocking
  finding — a comment the diff made false, `src/lib/reviewScan.test.ts:10` still
  said "five rejection rules" while the same file now tests six — plus one
  stale test label ("criterion 8"); both were fixed in fix round 1 and re-gated
  (`s4-verify-fix1.txt` EXIT=0 · 1785 tests · GUARDS PASS). The `ocr` lane
  reviewed the code (`.scratch/v26/ocr-s4.json`) with **zero findings on the
  product files**; its single low finding is `.scratch` JSON gitignore hygiene,
  **parked** (untracked scratch, mechanically excluded by `check-push-range.sh`,
  and out of this slice's scope).
  **Live read-only blast-radius probe run BEFORE the deploy**
  (`.scratch/v26/live-blast-radius.txt`): exactly **1** finished place-backed
  ping inside the 24-hour window (`04a073f4…`, ended 2026-09-26 14:30 UTC) and it
  is by **the parent who already reviewed that place** — so with rule (f) the
  go-live notifies **zero** families. `notification_log` `review_due` rows
  before the deploy: **0**.

- 2026-09-27 — **SHIPPED, DEPLOYED, AND CLOSED. Every acceptance criterion is
  now proven, and criterion 3 was closed without a production write.**
  `40ffa83` pushed through the gated hook (full gate green inside the hook);
  `send-push` deployed (v5→v6, `updated_at` moved, `ezbr_sha256
  8d25f1f8…→2ebf8ceb…`). The first post-deploy cron tick
  (`2026-09-27 14:20:00.109Z`, 13 s after the deploy) returned
  `{"reviewDueCreated":0,…}` with the Green Lake candidate still in-window, and
  the same tick exercised the `place_id is null` wall against two real
  place-less pinged drop-ins — so **the go-live notified zero families**
  (`.scratch/v26/live-tick.txt`). **Criterion 3 (`cancelled` → zero rows) is
  proven against the live schema with ZERO persistence**
  (`.scratch/v26/live-criterion3-rollback.txt`): the Management API query
  endpoint accepts explicit transaction control, so a `cancelled` place-backed
  finished drop-in + ping (and an identical `status='on'` control + ping) were
  inserted inside one `begin`/`rollback`; the scan's exact predicate returned
  `cancelled_candidates = 0`, `on_control_candidates = 1`, and a post-rollback
  read confirmed 0 playdates / 0 pings / 0 notifications persisted. Criterion 4
  is live-proven by the tick; criteria 1/5/6/7 are satisfied or vacuous as
  recorded in `V26-SUMMARY.md`. Remaining items are **human-gated**: the two
  leftover `e2e ` fixtures' sweep (drives the human's Chrome), and the
  24h-window / copy product calls.

---

# Implementation Plan: V27 — the /new posting experience (Meisburg/post-drop-in)

> Owned by the orchestrator. This batch answers the founder's 2026-09-27 review
> of `/new`: posting a drop-in must be quick, and the post should attract
> friendly, like-minded families. **Time presets shipped first** (base of this
> batch, not a slice here). The four slices below are the remaining
> recommendations, in order.
>
> The default gate is `npm run verify`. Every slice also pins a targeted
> Playwright run for its own surface. **Branch `Meisburg/post-drop-in`
> (staging). DO NOT PUSH — the coordinator serializes merges to master.**

## Goal

A parent posts a drop-in faster and with more confidence: they can always see
and submit the plan (Slice 1), the optional details becomes an inviting
one-tap sentence (Slice 2), the page says what is public and reassures them
(Slice 3), and a posted drop-in is easy to share at the moment of intent
(Slice 4). `/edit` renders byte-identically to today throughout.

## Non-goals

- No new route, table, or migration.
- No change to `/edit`'s rendered markup — every new form affordance is an
  optional slot the page passes and `/edit` does not.
- No new REQUIRED field or step; nothing added may block Post.
- No analytics, no invented social proof (PRODUCT.md, Evidence on Hand).

## Interfaces

- `PlaydateFormFields` (`src/components/PlaydateFormFields.tsx`) gains OPTIONAL
  props, each defaulted so `/edit` is unchanged: `formId?: string` (default
  `'playdate-form'`), `hideSubmit?: boolean` (default false),
  `timePresetsSlot?: ReactNode` (shipped with time presets),
  `detailsChipsSlot?: ReactNode`, `privacySlot?: ReactNode`.
- Pure seams live in `src/lib/` with a sibling `*.test.ts` (the build law):
  Slice 1 `stickyPostLine` (in `src/lib/postSummary.ts`); Slice 2
  `src/lib/vibeChips.ts`; Slice 3 `privacyPreview` (in
  `src/lib/postSummary.ts`); Slice 4 reuses `buildShareUrl` (`src/lib/trust.ts`).
- `src/pages/NewPlaydatePage.tsx` owns the wires; the form component owns no
  state. `src/pages/FeedPage.tsx` is touched only by Slice 4.

## Slices

### Slice 1: the sticky Post bar with a live read-back

- **Objective:** on `/new`, a bar pinned above the bottom nav shows a one-line
  read-back of the current plan and a Post button that submits the same form.
- **Files in scope:** `src/pages/NewPlaydatePage.tsx`,
  `src/components/PlaydateFormFields.tsx`, `src/lib/postSummary.ts`,
  `src/lib/postSummary.test.ts`, new `e2e/sticky-post.e2e.ts`.
- **Approach:** add `formId` (becomes the `<form id>`) and `hideSubmit` to the
  form. `/new` passes `hideSubmit` and renders a `fixed` bar at
  `bottom-[calc(5.5rem+env(safe-area-inset-bottom))]` (the PlaceDirectory
  offset, above the app's fixed bottom nav) containing `stickyPostLine(values)`
  and a `type="submit" form={formId}` button. `/edit` passes neither. Add
  bottom padding on `/new` so the bar cannot cover the submit error.
- **Acceptance criteria:**
  - On `/new` exactly ONE control is named "Post drop-in" (the bar's), and
    clicking it submits and lands on `/`.
  - The bar's read-back is `stickyPostLine(values)` (day + start + place), a
    pure seam with unit tests for the empty/full cases.
  - `/edit` renders no bar and keeps its in-form submit byte-identically.
  - The bar shows no horizontal overflow at 320px and its button is ≥44px.
- **Verification command:** `npm run verify` (exit 0), then
  `npx playwright test e2e/sticky-post.e2e.ts e2e/post-fast.e2e.ts`.
- **Depends on:** nothing.

### Slice 2: vibe chips — the optional details becomes the invitation

- **Objective:** under the Details field, one row of tappable starters turns a
  blank description into an inviting sentence with no typing.
- **Files in scope:** new `src/lib/vibeChips.ts` + `vibeChips.test.ts`;
  `src/components/PlaydateFormFields.tsx` (a `detailsChipsSlot`);
  `src/pages/NewPlaydatePage.tsx`; new `e2e/vibe-chips.e2e.ts`.
- **Approach:** `VIBE_CHIPS` (id, label, text) and a pure
  `applyVibeChip(current, chip)`: empty field → the chip's sentence; text that
  already contains it → unchanged; otherwise append on a new line. The page
  renders the chip row as a slot into the Details block; `/edit` passes none.
- **Acceptance criteria:**
  - Tapping a chip on an empty Details writes that chip's sentence; the
    resulting post carries it (a submit writes `values.details`).
  - Tapping the same chip again is a no-op (no duplicated sentence); tapping a
    second chip appends it.
  - `/edit` shows no chips.
  - Every chip is ≥44px and the row wraps with no overflow at 320px.
- **Verification command:** `npm run verify` (exit 0), then
  `npx playwright test e2e/vibe-chips.e2e.ts`.
- **Depends on:** Slice 1 (the form slot pattern), not its commit.

### Slice 3: the privacy preview + trust line

- **Objective:** at the point of posting, show what is public and state the
  privacy promise in one line.
- **Files in scope:** `src/lib/postSummary.ts` + test;
  `src/components/PlaydateFormFields.tsx` (a `privacySlot`);
  `src/pages/NewPlaydatePage.tsx`; new `e2e/privacy-preview.e2e.ts`.
- **Approach:** pure `privacyPreview(values, kidLabels)` returns the compact
  preview line (kids by first name + age, place, day, start) and a fixed note
  ("Only nearby parents can see this. Kids show as first name + age."). The
  page passes it as the slot the form renders directly above its submit area;
  `/edit` passes none.
- **Acceptance criteria:**
  - On `/new` the note is visible and the preview names the selected kids by
    `kidLabel` (first name + age), the place, and the start.
  - `/edit` shows neither.
  - The block adds no horizontal overflow at 320px.
- **Verification command:** `npm run verify` (exit 0), then
  `npx playwright test e2e/privacy-preview.e2e.ts`.
- **Depends on:** Slice 1.

### Slice 4: the share prompt after posting

- **Objective:** immediately after a post succeeds, the parent gets a one-tap
  way to share it — at the moment of intent, without losing the existing
  "Post → feed" flow.
- **Files in scope:** `src/pages/NewPlaydatePage.tsx`,
  `src/pages/FeedPage.tsx`, `src/lib/postSummary.ts` + test (if a pure
  `justPostedBanner` seam is needed), new `e2e/share-after-post.e2e.ts`.
- **Approach:** after `createPlaydate`, `navigate('/', { replace: true, state:
  { justPosted: { id, title, place } } })` (URL stays `/`, so `waitForURL('/')`
  in every existing spec still matches). `FeedPage` reads
  `useLocation().state`, keeps it in local state, and renders a dismissible
  banner naming the post with a Share button (`buildShareUrl` + Web Share,
  clipboard fallback — the same seam the detail page uses) and a dismiss.
- **Acceptance criteria:**
  - Posting on `/new` lands on `/` and shows the "Posted" banner with a Share
    control; Share copies/uses `buildShareUrl(post.id, VITE_PUBLIC_BASE_URL ||
    origin)`.
  - Dismissing removes the banner; a later plain load of `/` shows no banner.
  - Every existing `/new`→`/` spec still passes unchanged (no strict-mode or
    URL change).
- **Verification command:** `npm run verify` (exit 0), then
  `npx playwright test e2e/share-after-post.e2e.ts e2e/post-again.e2e.ts`.
- **Depends on:** Slice 1.

## Risks / open questions

- The sticky bar must not double the "Post drop-in" accessible name (Slice 1
  hides the in-form submit on `/new`) — a strict-mode violation would break
  every existing post spec.
- Slice 3's note says "nearby", not a specific radius: `/new` does not load
  the profile radius, and inventing a number would be a false claim. RULING.
- Slice 4 must keep the post URL exactly `/` (router state, not a query), or
  the existing `waitForURL('/')` specs break.

## Status log (orchestrator appends after every phase transition)

- 2026-09-27 — V27 batch planned (4 slices); baseline feedback work committed;
  Slice 1 dispatched.
- 2026-09-27 — **V27 BATCH COMPLETE.** Baseline feedback work `63c49ae`
  (duplicate affordance, row `shrink-0` overflow fix, time presets). Slices:
  **1 `8e7f474`** sticky Post bar + `stickyPostLine`; **2 `76f2778`** vibe chips
  + `lib/vibeChips`; **3 `ef9aac1`** privacy preview + trust line; **4
  `9073c2b`** share prompt after posting. Every slice: `npm run verify` EXIT=0
  (final tip **1806 unit tests**, GUARDS PASS) and its targeted Playwright lane
  green. The shared `:4173` preview was held by the `places` worktree, so all
  e2e ran on a private `:4174` with `reuseExistingServer: false` (untracked
  `playwright.noreuse.config.ts`, deleted after the tip gate). `/edit` remains
  byte-identical throughout. No push — branch `Meisburg/post-drop-in` only.

