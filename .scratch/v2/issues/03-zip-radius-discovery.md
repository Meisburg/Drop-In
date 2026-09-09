# 03: Zip + radius discovery

**What to build:** Discovery rebuild. Onboarding replaces the neighborhood multi-select with home zip (typed) + radius (default 5 mi; options 2/5/10/20/35). A seeded zip_codes table (public-domain gazetteer extract) maps zip → lat/lng; feed and browse queries filter by haversine distance and compute per-post distance shown as "N mi". Neighborhoods become display labels only; memberships stay in the schema but leave the filter path (no destructive migration). /profile edits zip + radius.

**Blocked by:** 01 (the /new and card UX must be stable first — this slice changes the same pages' data layer).

**Status:** ready-for-agent

- [ ] zip_codes seeded (US gazetteer extract); lookup returns lat/lng for a known zip
- [ ] Feed shows every drop-in within radius regardless of neighborhood; excludes beyond it (pure distance predicate unit-tested)
- [ ] Each post shows distance ("4 mi") on cards
- [ ] Onboarding: zip + radius step replaces neighborhood picker; ≥1 selection equivalent (zip valid + radius chosen)
- [ ] /profile: zip + radius editable; existing memberships display-only
- [ ] Neighborhood names still render as labels on posts
- [ ] Haversine filter runs in SQL (no PostGIS); embed paths carry FK hints (PGRST201 lesson)
- [ ] REST smoke probe: real-DB feed query with distance filter returns expected rows for marker zips
- [ ] npm run build && npm run test exit 0