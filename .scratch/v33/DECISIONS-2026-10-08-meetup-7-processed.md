# DECISIONS — processing the 7 meetup annotations (2026-10-08)

Authority: Jon's standing grant. Jon asked to PROCESS all 7 — resolve each, don't
leave them pending. Every verdict below is checked against master's SOURCE.

Grounding facts (measured, not remembered):
- Drop In has **no drop-in keyword search** (feed has no search box; only /browse places does).
- Drop In has **no `slug` identity** (the only `slug` refs are a Wikimedia URL + a privacy label).
- Drop In DOES share drop-ins as **`/playdate/<id>`** (`lib/trust.ts` buildShareUrl) with a
  deep-link handler (`lib/appLinks.ts`, prefix `/playdate/`) and a public-origin resolver
  (`lib/publicUrl.ts`). So "deep links" and "one identifier for link+share" ALREADY EXIST.

---

## RESOLVED — verified SHIPPED (2)

**`meetup-160c6b25f16b` — radius in meters.** SHIPPED in spirit. Drop In stores radius
as ONE canonical unit (`radius_miles`, migration 0069) and never a unit-ambiguous int.
Meetup's bug (converting km→mi only when the unit string contains "KM") is not
expressible here. The pattern's actual rule — "one canonical unit, convert at render" —
is what Drop In already does. Resolving as shipped; no code change.

**`meetup-ffed0e50dd64` — slug deep links.** SHIPPED in substance. Share links are
`/playdate/<id>` (trust.buildShareUrl), the OS deep-link handler exists (appLinks.ts,
prefix `/playdate/`), and the public base URL is resolved once (publicUrl.ts). The
pattern's core claim — "one identifier, three uses: link + share + dedupe key" — holds with
the UUID. The only delta is UUID-vs-slug, and for a **kids' safety app an unguessable UUID
is BETTER than a guessable slug**. Resolving as shipped; adopting slugs would be a regression.

---

## RESOLVED — DEFERRED, blocked on a foundation that does not exist (4)

These four all hang on ONE missing thing: a drop-in search surface + a slug identity.
Writing them as slices now would build against a screen that does not exist. They are
recorded, not lost — they convert to slices the day search ships.

**`meetup-212178a4c471` — unified feed resolver (query==='' ? nearby : search).** DEFER.
There is no `search(filter)` to switch to. The resolver is a 5-line seam once a drop-in
search endpoint exists; building it first is a resolver with one branch.

**`meetup-42a59eef4f3d` — server-side ranking params.** DEFER. The feed sorts client-side
by `starts_at` (feed.ts:821), correct at this volume. A server `sort` param has no consumer
until the feed paginates or grows. Tunable params only pay off at scale.

**`meetup-23d8ed4675b0` — dedupe by slug + counter.** DEFER. No slug identity, and geo
pagination (the thing that produces dupes) does not exist yet. The seam is trivial once
slugs + pagination exist; pointless before.

**`meetup-7764c59f8e7e` — recents = query + location.** DEFER. There is no search surface
to have recents for. Same gate as the resolver above.

---

## RESOLVED — NEEDS JON'S DECISION, not built (1)

**`meetup-cec94436a3fe` — map "search this area".** DEFER, pending a scope call. A map IS
already in scope (the feed's Map view + the browse map), so the pattern applies — but
"search this area" only makes sense once there is a search to constrain. It is a strong
v1 feature AFTER search, not before. Flagged for Jon: build it as part of the search pass.

---

## NET

- 2 shipped (no action): meters, slug deep links — both already true in Drop In's own idiom.
- 4 deferred: all unblocked by ONE design pass — a drop-in search surface + slug identity.
- 1 pending scope call (map search-this-area): build it inside that same search pass.

**The one thing to build next, if any: the drop-in search + slug foundation.** It converts
4 defers and the 1 scope call into real slices at once. Everything else here is either
already done or waiting on it.
