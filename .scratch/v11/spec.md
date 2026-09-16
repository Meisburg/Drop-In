# V11 spec — "Feel the product, not the form": discoverability + setup batch

Date: 2026-09-16 · Origin: the founder walked the live app end-to-end and
flagged four things that read as "why can't I tell what this is / who it's
for." The app already *works*; the gaps are (a) the Nearby empty state only
knows how to widen a radius, so a tight-radius parent is a dead end; (b) two
Places surfaces still carry the V9 "fits my kids age" filter and an
"Ages not listed yet." placeholder that the product has since stopped using;
(c) the post form leads with *when* instead of *where*; and (d) setup lives
buried in /profile with no discoverable entry point. This batch fixes all four
with no new migration.

The batch splits into **3 clear directives** (do regardless) + **3 judgment
calls** (each already decided by the founder, recommendations taken):

## What ships (6 tickets)

**Clear directives**

1. **01 — radius narrow-back.** The Nearby empty state offers only WIDEN /
   SEE-ALL escapes. When the parent's radius is above the 5-mile default, add
   a "Back to 5 miles" escape so a too-wide radius is also escapable. Pure
   change in `radiusEscapes` (feed.ts) + `RadiusEmptyState.tsx`. No migration.
2. **02 — remove the age filter.** The Places directory ("fits my kids age")
   is gone. The filter UI in BrowsePage + the `placeFitsKidAges` /
   `filterPlaces` age plumbing are deleted. No migration.
3. **03 — remove "Ages not listed yet."** The PlacePage copy is out, and the
   e2e assertion that pins it (places.e2e.ts) is updated alongside. No
   migration.

**Judgment calls (decided — recommended options taken)**

4. **04 — restrained section headers.** Each top-level page gets a small
   illustrated header: a soft gradient block, a section icon, one line of
   section-specific copy ("See what's on near you," "Where families drop in,"
   …). The feed stays above the fold; this is NOT a full-bleed hero. New
   small component; no migration.
5. **05 — post form: where → when.** On /new, lead with WHERE (the place
   picker), then WHEN (date/time/duration). Kids + the rest of "More options"
   stay collapsed. Single-page, progressive reveal — NOT a 4-step wizard (a
   wizard would fight the ~10 pinned e2e tap-count invariants). No migration.
6. **06 — settings reorg.** A gear icon in the top nav (right of the handle /
   Sign out) routes to a new `/settings`: notifications, home zip + radius,
   kids, bio, interests, photos, sign out. `/profile` becomes a READ-ONLY
   "what others see" view (name, photo, family photo, about, interests, kids,
   live posts) with one **Edit profile** button that links the bio/photo to
   `/settings`. No migration.

## Out of scope (recorded, not built)

- Voice / mic input on /new (V10 out-of-scope, still parked)
- A full-bleed marketing hero / landing-page rebrand — the restrained header
  (ticket 04) is deliberately NOT that
- A multi-step post wizard (rejected in ticket 05 — fights pinned e2e)
- Moving `NotificationsSection` off /profile — it *moves* to /settings (06)
  but is not redesigned

## Migration check

**NONE for the batch.** No `supabase/` SQL migration, no edge function, no
secret. Tickets 01–06 are app-code + e2e only. Ticket 06 adds one route
(`/settings`) and one nav affordance — frontend only.

## Verify (batch gate)

`npm run build && npm run test` per ticket; e2e per ticket's spec list; final
gate = full suite + lint. Manual pass: (a) set radius to 20 → Nearby empty
state offers "Back to 5 miles"; (b) Places has no age filter and no "Ages not
listed yet."; (c) /new leads with the place picker; (d) top-nav gear →
/settings has the setup controls, /profile is read-only with Edit profile.