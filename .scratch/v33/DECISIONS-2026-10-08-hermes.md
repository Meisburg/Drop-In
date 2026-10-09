# DECISIONS — the remaining Drop In queue (Hermes, standing grant 2026-10-08)

Jon granted standing authority to apply my own recommendation to every outstanding
design question and dispatch, reporting decisions after. This file records each
decision with its reasoning, so the work is reproducible without this session.

---

## D1 — The /browse pill row WRAPS, it does not scroll (`muzk5y54`)

**The wife's note supersedes the correction's "scrolls sideways":**

> *"why aren't all these pills together? Why are they all space-weird? … you don't
> even need to make them scrollable where they're off-screen, you could show all of
> them together."*

**Decision: ONE flat pill row that WRAPS and shows every pill; none off-screen. Even, tight gaps.**

- Supersedes `plan-browse.md` §3 ("scrolls sideways") and acceptance criterion 7.
- Supersedes `RULING-browse-correction.md` §1's "scrolls sideways" clause. The
  *order* stands; the *overflow behaviour* becomes wrap.
- **Why:** a filter you cannot see is a filter you forget. The wife's objection is
  the stronger UX argument (discoverability beats compactness for 7 short pills),
  and it also removes the sideways-scroll at 390px entirely, which is a smaller
  accessibility surface.
- Criterion 7 becomes: the pill row **wraps**; every pill is within the viewport
  (`documentElement.scrollWidth <= clientWidth + 1` still holds); no pill's right
  edge exceeds the container.
- The gap must read as ONE group — a single `gap-2` on a wrapping flex, not the
  current mixed spacing that produced "space-weird".

## D2 — The coffee claim is a quarter mile, and the pill says so (`muzk3j1e`)

Already shipped in part: `COFFEE_NEARBY_RADIUS_METERS = 400` in the refresh script.
The duplicate control is gone (`0df3dfe`). **Resolved as shipped; no further decision.**

## D3 — A "bathrooms" pill is DEFERRED, not built (`muzka6tz`)

**Decision: do NOT build it this batch.** It needs a data source that does not
exist — OSM `amenity=toilets` via the same Overpass/cached-column shape as
`coffee_nearby`. Adding a pill with no column behind it would render a control that
filters nothing, which is exactly the "dead control" class this batch has been
deleting. **Recorded in `docs/backlog/` with the data requirement**; build it when a
`places.bathrooms` column is populated, as its own slice.

## D4 — The hero photo is a READ-VIEW hero only (`muye6aeo`)

**Decision: build the hero on the profile read view; do NOT absorb the "Family
photos" block.** The V32 ruling "the photos stay after the kids" governs the
*editor's order*, which is a different surface from the read view. A hero rectangle
above the profile name is compatible with that ruling; absorbing the family-photo
section would make it redundant and would reverse a one-batch-old ruling. So: add
the hero, keep the family photos section. One clear, small change.

## D5 — Moderator tooling: write the ADR + ONE recommendation, build nothing (`muye39z4`)

**Decision: the deliverable is a written recommendation, not code** (the batch's own
ruling). It must first *discover* `supabase/migrations/0063_place_photo_review_state.sql`
and the existing moderator surfaces, then recommend on top of that flow — never
beside it. This is a writing task, not a build.

## D6 — Browse sort default: Best first, with the stated tie-break

**Decision: adopt the plan's §4.1 as written.** Best first (rating desc, review
count desc, then name) on load; A–Z stays first-class. The tie-break is
load-bearing because 230 of 234 places have no reviews. No change to the plan.

## D7 — Search expands to the full row while typing

**Decision: adopt the plan's §4.2 as written.** Expand on focus/typing, collapse on
blur/clear. Asserted by width, not DOM order. No change to the plan.

---

## The dispatch order I will run

1. **v33-D (the /browse restructure)** — the corrected plan + the wrap correction
   (D1) + the deleted modal + Best-first default. Largest value; unblocks 5 annotations.
2. **v33-hero** (`muye6aeo`) — the read-view hero (D4).
3. **v33-9b-bathrooms-backlog** — a one-file backlog note (D3); cheap.
4. **v33-moderator-adr** (`muye39z4`) — the written recommendation (D5).

Each runs on **cloud** (`ollama-cloud/deepseek-v4.1-flash:cloud`); the local 27b
proved it stalls on these briefs. Gate every slice by re-running `npm run verify`
in the worktree before accepting — a worker's "DONE" is a belief, the gate is
evidence.
