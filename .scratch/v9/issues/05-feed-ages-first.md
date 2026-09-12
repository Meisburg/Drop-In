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

**Status:** ready-for-agent → **BUILT + APPLIED (0037 live) + review cycle 1** — see `## Comments`.

- [ ] A drop-in's **age range is the first line of the card's meta**, e.g.
  `ages 3–6` — derived from the ages of the kids the host said they are bringing
  (`playdate_kids` → `kids.age`, live since 0022), so the host does nothing new:
  pick your kids, and the crowd's age is stated. One kid → `age 4`; a wide spread
  → `ages 2–9`

  > **AMENDED (review cycle 1, F5):** the AC's sentence is about **the card**, and
  > the card is shared. It is now wired on **every** surface that renders
  > `DropInCard` — `FeedPage`, `PlacePage` (`/place/:id`) and `UserPage`
  > (`/u/:handle`, both lists) — each through one batched ages read of its own
  > posts and the single composition `feed.cardAgeRangeLabel`. Cost, stated: one
  > extra batched read per surface load (≤ 1 request), never one per card.
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

  > **AMENDED (review cycle 1, F2 — the parenthetical is FALSE, confirmed twice):**
  > "only for the host and people who pinged" is not what the schema does for the
  > HOST's own kids. Probed live by the builder and again, independently, by the
  > coordinator: `kids_select_authenticated` and `playdate_kids_select_authenticated`
  > are both `qual = true` for `authenticated`; only `ping_kids` is gated
  > (own/host/mod). The code path agrees: `PlaydateDetailPage` loads
  > `listPlaydateKidNames` unconditionally for any signed-in viewer and renders it
  > with no host/pinger gate, while 0026's `get_kids_going` gates only the
  > PINGERS' kids. **The shipped behaviour is unchanged** (no gate touched — the
  > migration check pins "no policy changed"); what changed is that the ticket no
  > longer claims a gate it does not have.
- [ ] The kids editor on `/profile` makes clear that first names are optional:
  the field is not required to save a kid, and the copy says the name is only
  shown to families who are going (the privacy promise, in the UI)

  > **AMENDED (review cycle 1, F2):** the FIELD rule shipped exactly as written
  > (blank is valid; the row writes NULL; 0037 drops the 0011 `not null`), but the
  > COPY does not say "only shown to families who are going", because that would be
  > a promise the schema above contradicts. The shipped copy
  > (`ProfilePage.tsx`, the Kids block) says: *"A first name is optional — skip it
  > and your kid still shows up by age (the cards say “ages 3–6”, never a name). A
  > name appears only on your profile and on a drop-in’s page, and only to signed-in
  > families."*
- [ ] One batched read for the whole feed — extend the existing
  `count_kids_going_for` pattern (one call per feed, not one per card) so a card
  never issues its own query; the pure seam `ageRangeLine(ages)` is unit-tested
  (empty → null, one → `age 4`, spread → `ages 2–9`, and the "wide spread" cap)
- [ ] New e2e `feed-ages.e2e.ts`: host picks two kids (ages 3 and 6) → the feed
  card reads `ages 3–6` **and contains no kid name** (asserted by absence) → a
  post with no kids and no chips shows no ages line → the explicit chips path
  works; **red-by-design pre-0037** only for the chips half (the derived half is
  green immediately — the spec must say which half is the pivot)

  > **AMENDED (review cycle 1, F4 + F8):** the pivot HAPPENED and is recorded below
  > (derived half green, chips half red at the quoted wire error); 0037 is applied
  > now, so the spec is **5/5 green** and its header says so. The spec also grew the
  > AC's missing live evidence: a kid saved with **no first name** (page → column =
  > NULL → reload → Remove dialog → `/new` chip → card → detail line, never the word
  > "null").
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

  > **AMENDED (review cycle 1, T1/T8 + T4):** shipped as written, **plus two
  > deviations** recorded in `## Comments`: (a) no SECURITY DEFINER function was
  > added (the derivation reads `playdate_kids` through one batched RLS-bounded
  > projection of `kids.age`), and (b) `alter table public.kids alter column
  > first_name drop not null` was added to make "the field is not required to save a
  > kid" true at the column level.
- *Apply path (coordinator only):* `node scripts/apply-migration.mjs supabase/migrations/0037_*.sql`.
- *Post-apply probes:* (1) both columns + the CHECK exist; (2) an insert with
  `age_min = 8, age_max = 3` fails closed; (3) a probe post with chips returns
  them through the normal read; (4) the batched kids-count RPC still returns its
  shape (nothing regressed in 0027).
- *Human-owned:* none.

**Verify:** `npm run build && npm run test`; `npx playwright test
e2e/feed-ages.e2e.ts` (red pre-apply for the chips half); full suite; live marker
pass — pick two kids and read `ages 3–6` back on the feed.
**Post-apply (2026-09-13):** all green — build 0 · 749/749 unit · **64/64 e2e** ·
lint 0 errors / 39 warnings · `feed-ages` 5/5.

## Comments

### 2026-09-13 — builder report, review cycle 1 (recorded in the file, per the reviewer's F2/F3/claim-1)

Files are the system of record: every "reported with evidence" claim below lives
here, not only in code comments.

**The pivot, observed.** Pre-0037 the spec ran 3-passed/1-failed: the derived half
(the card reads `ages 3–6`, no kid name) and the privacy check were **green**, and
the chips half failed at the documented point. Exact wire error, quoted:

```
HTTP 400 {"code":"PGRST204","details":null,"hint":null,
          "message":"Could not find the 'age_max' column of 'playdates' in the schema cache"}
```
with the form's designed line `Could not post your drop-in. Try again.` (the app
never renders PostgREST's text — a `PostgrestError` is not an `Error`) and **no
row written**. Note for the record: the ticket predicted `42703`; that is the
DB-level code and it IS what a SELECT of the missing column answers
(`{"code":"42703",…,"message":"column playdates.age_min does not exist"}` — probed
live), but PostgREST intercepts an unknown column in an INSERT payload with its own
`PGRST204`. 0037 was then applied (coordinator, HTTP 201, probes recorded in
`task-state.md`), after which `feed-ages` is **5/5 green** and the full suite
**64/64**.

**T1/T8 DEVIATION — no SECURITY DEFINER batched function.** The derivation does not
go through a new RPC. It is ONE batched, RLS-bounded read of `playdate_kids`
projecting `kids.age` only (`db.kidAgesByPostForPostsWithClient`; its SELECT string
is pinned by a unit test asserting it contains neither `first_name` nor `id`), and
the stated pair rides the row's own `*` select. **Why:** a function can only be
created by 0037, so an RPC-backed derivation is RED before 0037 — and this ticket
pins the opposite (derived green immediately, only the chips half red).

**The reviewer's refinement, recorded because it sharpens the decision:** the pins
were *jointly* satisfiable — a function in 0037 **plus** a pre-apply fallback read,
or the function in its own migration applied first. So this was a **decision, not an
impossibility**, and it accepted two costs that must be named:

1. The ages read is now **bulk and automatic on every signed-in feed load** (and on
   `/place/:id` and `/u/:handle`, review cycle 1 F5) — one extra request per
   surface, always issued when the surface has posts, where a gated per-post RPC
   would have been opt-in and lazy.
2. **The feed's ages line is hard-coupled to `playdate_kids`' RLS.** The read is
   best-effort by contract, so the follow-up ticket that tightens kid names (see
   below) will **silently blank every card's ages line** — no error, no crash, just
   an absent line — unless that ticket gives the derivation its own gate
   (a SECURITY DEFINER batched RPC is exactly the shape it would need). Recording
   this here is the point: the coupling is invisible at the point of change.

Not widened, verified live twice (builder + coordinator): `0022`'s
`playdate_kids_select_authenticated` and `0011`'s `kids_select_authenticated` are
`USING (true)` for `authenticated` — a marker JWT reads other families'
`playdate_kids` rows today (kid ids included), so projecting `age` is strictly
*narrower* than the standing posture; `anon` gets `200 []` (RLS is `to
authenticated`). `get_kids_going` / `count_kids_going_for` / `count_kids_going` and
every policy are untouched.

**T4 EXTENSION — `kids.first_name` made nullable (deviation, deliberate).** Live
evidence: `information_schema.columns` → `kids.first_name` was `is_nullable = NO`;
the AC "the field is not required to save a kid" needs the UI rule relaxed AND the
column nullable, so 0037 carries `alter table public.kids alter column first_name
drop not null`, and the app writes **NULL** (not `''`) for a blank name. Consumers
walked for the NULL: `/profile` rows (photo alt, initial circle), the Remove dialog
(below), `/new` kid chips, `/u/:handle` kid list, `KidsComingPicker`,
`kidsComingLine` (an age-only kid now renders through the RANGE — the T3 trap),
`listPlaydateKidNames` / `listKidsGoing` (`?? ''`), `profileSave.toKidRowValues`,
and the detail page's "Other kids coming". 0026's `order by … first_name asc` needs
**no** change (ASC = NULLS LAST) and gets none — it is an applied migration.

**Claim 1 CORRECTED (review cycle 1, F1): the type change does NOT enumerate
template literals.** The migration header said the `string | null` change "made the
compiler enumerate them". Under `--strict`, `` `${x}` `` with `x: string | null`
compiles clean, so the compiler walked method calls and assignments only. A real,
reachable bug was hiding there: `ProfilePage`'s Remove dialog interpolated
`kid.first_name` directly, so a nameless kid's dialog said **"Remove null?"** /
"null comes off your family profile…" (NULL row, post-0037) or **"Remove ?"** (a
cleared in-page draft). Found by grepping `src/` for name interpolations, fixed with
a normalised name plus the noun fallback ("This kid"), and now asserted end to end
(`feed-ages` test 5). The migration header's sentence is corrected to say exactly
this.

**The amended AC (F2).** No follow-up ticket was opened for the names gate, and it
is named here so it is not lost: tightening `0011`/`0022` so a kid's name is visible
only to the host and to families who pinged is a **privacy change with its own ACs,
its own migration and its own review** — and this ticket's migration check explicitly
pins "no policy changed". It must also give the derivation its own gate (see cost 2
above), otherwise it blanks the ages line it currently feeds. The shipped `/profile`
copy is the truthful one.

**F3 — the stated range is WRITE-ONCE (known limitation, not fixed here).** The
"Ages (optional)" chips exist only on `/new`: `/edit` neither renders nor writes
them (`updatePlaydateWithClient` never names the columns) **while `/edit` does own an
in-place kids editor**. So a wrong chip is permanently wrong and it **outranks the
correct derived value** (explicit-wins), and the only fix for a parent today is
delete-and-re-post. The duplicate prefill does not carry the columns either. Not
fixed because the ticket scopes the chips to `/new` and touching the shared form's
field set means the change detector + the update payload + the pre-apply `/edit`
path (a 42703 on every edit before 0037). Follow-up: give `/edit` the same chip row
plus `age_min`/`age_max` in `playdateFormValuesFromPost`, `PlaydateEditOriginal`,
`playdateEditFieldsChanged` and the update payload.

**F6 — one band, one spelling.** `feed.statedAgeRangeLine` now reads a one-sided
pair as `ages 5 and up` / `ages 3 and under` (it used to collapse it to `age 5`),
and `places.placeAgeFitLabel` is literally `'Best for ' + that seam`, so the place
page's band and a drop-in's stated band cannot drift. Its own tests were unchanged
(output byte-identical); a cross-seam unit test now pins the agreement.

**F5 — wiring.** Covered by the AMENDED note on the first AC: `FeedPage`,
`PlacePage` and `UserPage` each run ONE batched ages read and call the single seam
`feed.cardAgeRangeLabel`. Cost: one extra request per surface load.

**Marker hygiene.** Every run of this ticket's spec deleted its own rows with the
marker's own JWT (0 `e2e-*`-owned kids/playdates/playdate_kids/going_pings survive —
verified read-only). The `e2e-*` marker ACCOUNTS (36 at the time of writing,
accumulated across tickets 01/03/04 and this one) are the coordinator's sweep.
