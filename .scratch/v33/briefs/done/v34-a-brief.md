SENTINEL: V34-A-MAP-POPUP-DETAILS-R7M2

**Slice `muzk0bae` — the map marker popup says "details" twice.**

⚠️ **Work in YOUR OWN WORKTREE:**
```bash
cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/map-popup -b map-popup HEAD
cd /tmp/pd-wt/map-popup && npm install --silent 2>/dev/null || true
```
All commands run inside `/tmp/pd-wt/map-popup`; commit on branch `map-popup`; never
touch the main worktree; never push.

## The annotation

> *"I just noticed that when you select this, it says details twice. There's options
> to go to the details twice and that's redundant. We don't need it twice."*
> anchored on `.leaflet-popup-content-wrapper … [data-testid="place-marker-info"]`
> on `/`.

## The work

The feed's map marker popup renders **two** affordances that both lead to the same
place detail. Find them (the popup component, `data-testid="place-marker-info"` or
its children), keep **one** — the clearer, more discoverable one — and delete the
other. Keep every testid that a spec locates positively (or update that spec in the
same diff; `scripts/guards/stale-locator-guard.mjs` fails otherwise).

**Read only:** the popup component and the specs that mention `place-marker-info`.
Edit first, verify after.

## Acceptance

1. Exactly **one** "details" affordance in the popup — asserted by count in a spec
   (and the assertion must not be vacuous: it must wait for the popup to render).
2. Tapping it still opens the place detail page.
3. Nothing else in the popup changes.

## Gate

`ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify`
and the same with `npm run guards` → **GUARDS: PASS**. Expected red: `steering-lint`
naming another lane's `docs/agents/*` only. Run the map spec
(`e2e/places-map-view.e2e.ts` or `e2e/address-maps.e2e.ts`) on a private port
(4210–4218, mint the marker there, kill by port/PID). Stage by path only. Report to
`.scratch/v34-a-report.md`; reply:

```
Sentinel: V34-A-MAP-POPUP-DETAILS-R7M2
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v34-a-report.md
```
