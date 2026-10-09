SENTINEL: V34-B-REVIEWER-AVATAR-NAME-LINK-T9W4

**Slice `muzk8c1g` — the reviewer's face, and their name links to their profile.**

⚠️ **Work in YOUR OWN WORKTREE:**
```bash
cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/reviewer-avatar -b reviewer-avatar HEAD
cd /tmp/pd-wt/reviewer-avatar && npm install --silent 2>/dev/null || true
```
All commands inside `/tmp/pd-wt/reviewer-avatar`; commit on branch
`reviewer-avatar`; never touch the main worktree; never push.

## The annotation

> *"I think my profile picture should be to the left of my name here so people can
> see who left the review, not just read the name, and the name should be linked to
> my profile. So when you click on it, it takes a user to my profile."*
> anchored on `.flex[data-testid="place-reviews"] … [data-testid="place-review-row-…"]`

## The work — and it is the SAME pattern as the standing v33-12 ruling

**Ruling to reuse:** *a profile-picture circle **immediately left of the person's
name**, wherever a person's name is the entity you are looking at* — the
conventional messaging-app/social pattern, consistent with the avatar treatment
already used in the DM list and the thread header.

In the place reviews list (`src/components/PlaceReviews*` / wherever
`place-review-row-*` renders):
1. Render the reviewer's **avatar immediately left of their name** — reuse the
   app's existing avatar primitive (the one the inbox/DM list and the feed use; do
   not invent a second one). Handle the no-photo case the way that primitive
   already does (initial/placeholder), not with a broken image.
2. **Link the name to the reviewer's profile.** Use the route the app already uses
   for a public profile (`/u/:handle` — find the existing helper/path rather than
   writing a new string), with the same link styling the app uses elsewhere.
3. The row's existing content (stars, date, quote) is unchanged.

**Read only:** the review row component, the avatar primitive, and the profile-path
helper. Edit first, verify after.

## Acceptance

1. Each review row shows the reviewer's avatar **to the left of** the name —
   asserted by **geometry** (the avatar's box is left of, and vertically aligned
   with, the name's box), not by DOM order alone.
2. The name is a link whose target is that reviewer's profile path — asserted on
   the resolved href.
3. A reviewer with no photo renders the primitive's placeholder, never a broken
   image (asserted for the fallback branch as well as the photo branch).
4. A signed-out viewer sees the same row (no new data exposed — the avatar and name
   were already public on that surface).
5. Any spec that located the old markup changes in the same diff
   (`stale-locator-guard`).

## Gate

`ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify`, then the same with
`npm run guards` → **GUARDS: PASS**; only `steering-lint` may be red (another lane's
`docs/agents/*`). Run `e2e/place-reviews.e2e.ts` on a private port (4210–4218; mint
the marker there; kill by port/PID). Stage **by path only**. Report to
`.scratch/v34-b-report.md`; reply:

```
Sentinel: V34-B-REVIEWER-AVATAR-NAME-LINK-T9W4
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v34-b-report.md
```
