# 03: Zip + radius discovery

**What to build:** Discovery rebuild. Onboarding replaces the neighborhood multi-select with home zip (typed) + radius (default 5 mi; options 2/5/10/20/35). A seeded zip_codes table (public-domain gazetteer extract) maps zip → lat/lng; feed and browse queries filter by haversine distance and compute per-post distance shown as "N mi". Neighborhoods become display labels only; memberships stay in the schema but leave the filter path (no destructive migration). /profile edits zip + radius.

**Blocked by:** 01 (the /new and card UX must be stable first — this slice changes the same pages' data layer).

**Status:** ready-for-agent

- [x] zip_codes seeded (US gazetteer extract); lookup returns lat/lng for a known zip
- [x] Feed shows every drop-in within radius regardless of neighborhood; excludes beyond it (pure distance predicate unit-tested)
- [x] Each post shows distance ("4 mi") on cards
- [x] Onboarding: zip + radius step replaces neighborhood picker; ≥1 selection equivalent (zip valid + radius chosen)
- [x] /profile: zip + radius editable; existing memberships display-only
- [x] Neighborhood names still render as labels on posts
- [x] Haversine filter runs in SQL (no PostGIS); embed paths carry FK hints (PGRST201 lesson)
- [x] REST smoke probe: real-DB feed query with distance filter returns expected rows for marker zips
- [x] npm run build && npm run test exit 0

## Comments

- 2026-09-09 — COMPLETE (dev agent, fresh session after 3 stalls). Commits e78f174 (slice: 0012_zip_radius.sql + radius feed + onboarding/profile location step + e2e zip-radius spec + fixture) + 8ecdfbf (e2e infra fix: viewer context clean storageState; "N mi" assertion re-scoped to the meta-line <p> — avatar initial glues to anchor textContent). Gates: `npm run build && npm run test` exit 0 (120/120, +18 new); `npx playwright test` exit 0 (8/8 incl. 2 new zip-radius tests). 0012 applied live via CDP (orchestrator verifier): 605-row WA zip seed (SimpleMaps v1.95.1, provenance header) + home_zip/radius_miles live; REST probes 200 (host-embed distance path, PGRST201-free; corrected probe form: alias-prefixed embed `host:profiles!playdates_host_profile_id_fkey(id,home_zip,radius_miles)&host.home_zip=eq.98109`). Pinned decisions honored: post location = host home_zip (unknown excluded), haversine pure-fn unit-tested + no PostGIS, gate = home_zip unset, WA-only seed. Markers: lv7-1788993934 + e2e artifacts (optional sweep). All ACs met.
