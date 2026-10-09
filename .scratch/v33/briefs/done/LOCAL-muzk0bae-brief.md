SENTINEL: LOCAL-MUZK0BAE-DEDUP-7X2K

**Slice: the map marker popup says "details" twice (annotation muzk0bae).**

The founder, verbatim:
> "I just noticed that when you select this, it says details twice. There's options
> to go to the details twice and that's redundant. We don't need it twice."

Repo: `~/Projects/playdate-app`. Base: HEAD. **Do not push.**

WORK ECONOMICALLY — this lane is LOCAL (~98k window). Read only what this brief
names. Edit first, verify after. If you open a fourth file, stop and start editing.

Find the map marker popup (the popup that appears when you select a place marker on
the map) and remove the DUPLICATE "details" affordance so exactly one remains.
Keep the one that is the real navigation target. Do not restyle anything else; do
not touch other popup content.

Files likely involved (confirm before editing, do not survey widely):
- `src/components/PlacesMapView.tsx`
- `src/components/PlaceMap.tsx`
- any spec that asserts the popup's controls (`scripts/guards/stale-locator-guard.mjs`
  will fail if a locator goes stale — fix specs in the SAME diff)

Then: run `npm run build` and the spec(s) touching the map popup, and commit.
Stage BY PATH only — never `git add -A` or `git add .`.

Reply with ONLY:
```
Sentinel: LOCAL-MUZK0BAE-DEDUP-7X2K
Status: DONE | BLOCKED
Commit: <sha>
Verify: <command> -> <real output, e.g. 'passed'>
```
