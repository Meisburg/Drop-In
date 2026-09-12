# 05: Nearby — ages first, names optional

**What to build:** Her words: *"I think age of the kid should be the most
important cuz the kids people want to know what age they're playing with … if
it's toddlers you're going to bring your kid to a toddler thing … names are
optional and when people start to put names like some people get weird about
that. But ages, if you just say kid age, I feel like that's not weird."*

She is describing the actual decision a parent makes — *is this the right age
crowd?* — and today the app answers it with a count ("2 going · 1 kid") and no
ages at all. (The V3 feedback removed the "Best for ages" field in favour of the
kids picker, which made ages *invisible* on the cards.) Put ages back as the
headline signal, and make a parent's own kid NAMES explicitly optional.

**Blocked by:** Ticket 04 (one-writer).

**Status:** ready-for-agent

- [ ] A drop-in's **age range is the first line of the card's meta**, e.g.
  `ages 3–6` — derived from the ages of the kids the host said they are bringing
  (`playdate_kids` → `kids.age`, live since 0022), so the host does nothing new:
  pick your kids, and the crowd's age is stated. One kid → `age 4`; a wide spread
  → `ages 2–9`
- [ ] **Derivation, pinned:** the range is computed from the host's selected kids
  when there are any; when the host picked no kids, the card shows nothing (never
  a guess); the same range is shown on the detail page beside the existing
  "Kids coming" line
- [ ] A host with **no kids listed** can still state an age range: `/new` gains an
  **"Ages (optional)"** chip row (`0–2`, `2–5`, `5–8`, `8–12`, `All ages`) under
  More options, stored in the `playdates.age_min` / `age_max` columns that
  0037 adds — and when both sources exist, the explicit chips win (the parent
  said so out loud)
- [ ] **Names stay out of the feed entirely** (already the rule on cards) and the
  detail page's "Kids coming" line is demoted from names-first to
  **ages-first** ("Ages 3–6 · Bernie, Lily" — names last, and only for the host
  and people who pinged, as today)
- [ ] The kids editor on `/profile` makes clear that first names are optional:
  the field is not required to save a kid, and the copy says the name is only
  shown to families who are going (the privacy promise, in the UI)
- [ ] One batched read for the whole feed — extend the existing
  `count_kids_going_for` pattern (one call per feed, not one per card) so a card
  never issues its own query; the pure seam `ageRangeLine(ages)` is unit-tested
  (empty → null, one → `age 4`, spread → `ages 2–9`, and the "wide spread" cap)
- [ ] New e2e `feed-ages.e2e.ts`: host picks two kids (ages 3 and 6) → the feed
  card reads `ages 3–6` **and contains no kid name** (asserted by absence) → a
  post with no kids and no chips shows no ages line → the explicit chips path
  works; **red-by-design pre-0037** only for the chips half (the derived half is
  green immediately — the spec must say which half is the pivot)
- [ ] `npm run build && npm run test && npm run test:e2e` exit 0

**Migration check:** **REQUIRED — `supabase/migrations/0037_playdates_age_range.sql`**
(number reserved; next free wins if the queue reorders).

- *Idempotency:* `add column if not exists` for `age_min` / `age_max` (smallint,
  nullable) + a DO-block guarded CHECK (`age_min is null or age_max is null or
  age_min <= age_max`).
- *Header must document:* that ages may be DERIVED (from `playdate_kids`) or
  STATED (these columns) and the explicit value wins; that kid names never cross
  to the feed; that no policy changed; that `playdates.age_hint` (the old
  free-text column, dormant since V3) is NOT reused — it is left alone rather
  than repurposed.
- *Apply path (coordinator only):* `node scripts/apply-migration.mjs supabase/migrations/0037_*.sql`.
- *Post-apply probes:* (1) both columns + the CHECK exist; (2) an insert with
  `age_min = 8, age_max = 3` fails closed; (3) a probe post with chips returns
  them through the normal read; (4) the batched kids-count RPC still returns its
  shape (nothing regressed in 0027).
- *Human-owned:* none.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/feed-ages.e2e.ts` (red pre-apply for the chips half); full suite; live marker
pass — pick two kids and read `ages 3–6` back on the feed.

## Comments
