# v33-hero report — a hero photo above the profile name (`muye6aeo`)

**Sentinel:** `V33-HERO-PHOTO-ABOVE-THE-NAME-M8K3`
**Status:** DONE
**Branch:** `v33-hero` @ `/tmp/pd-wt/v33-hero` · **Base:** `8f25080` · **Not pushed.**

---

## 0 — Provenance

The worker built the change, then wedged debugging its own browser-check harness
(an `npm` spawn it could not keep alive) and exited rc=1 with the code complete on
disk. This session reviewed the diff, ran the gate, ran the e2e the worker
skipped, and commits it — the **commit-only recovery** shape.

## 1 — What shipped

On `/u/:handle` and `/profile`, a **hero rectangle ABOVE the profile name**, rendered
**only when the family has a signed photo**. It is the same photo the "Family photos"
block below already shows — one URL (`familyPhotoUrl`), one label, one lightbox.

| Piece | Source | Note |
|---|---|---|
| Image | `familyPhotoUrl` (`useFamilyPhotoUrl`) | **no new read, no new column** |
| Tap target | `PhotoButton` + `galleryPhotosFrom(...)` | the **existing** shared lightbox, index 0 |
| Testid | `profile-hero-photo` | one per surface |
| Shape | `aspect-[2/1] w-full rounded-xl object-cover` | the app's existing hero treatment |
| Loading | `eager` | above the fold — same rule as the identity avatar |

## 2 — The ruling this follows

⚠️ **The hero is ADDED; the "Family photos" section STAYS.**

The V32 ruling *"the photos stay after the kids"* governs the **editor's order** and
is untouched. On the **read** view the hero is a new rectangle; the family-photo
block (`FamilyPhotoBlock`) is present and unchanged except for a shared label
variable. Absorbing it would have reversed a one-batch-old ruling; the founder asked
for a hero, not the removal of the block. **Add, do not replace.**

A photo-less family renders **no hero and no empty box** — the identity block is
exactly today's markup.

## 3 — Acceptance

| # | Criterion | Evidence |
|---|---|---|
| a | hero sits ABOVE the name | rendered as a sibling before the `flex items-center gap-3` identity row |
| b | only when a photo exists | `{familyPhotoUrl !== null ? … : null}` |
| c | tapping opens the EXISTING viewer | reuses `PhotoButton` + `galleryPhotosFrom`, same as the block below |
| d | the Family photos block is untouched | `FamilyPhotoBlock` still renders; only its label argument was hoisted to a shared const |
| e | 390px: no overflow | the block is `w-full`; the gate's existing 390px assertions cover the page |

## 4 — Gate (run by the controller, not the worker)

```
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only
  server.host change (another session), not this slice" npm run verify
```
- build ✓ · typecheck:e2e ✓ · **94 files / 2747 tests** ✓ · lint ✓ ·
  a11y:focus ✓ · **steering-lint ✗ (the only red — the other lane's untracked
  `docs/agents/*` pointers, unresolved in a fresh worktree)** · guards ✓
- `npm run guards` standalone: **GUARDS: PASS** (185 checks)

### e2e — port 4212 (marker minted there)

| Spec | Result |
|---|---|
| `profile.e2e.ts` | **passed** |
| `profile-kid-photos.e2e.ts` (the photo surfaces the hero shares a mechanism with) | **passed** |

## 5 — Scope

```
src/components/ProfileView.tsx  +44/-2   the hero + a shared label const
```

Nothing pushed. `origin/master` untouched.
