# v33-8 report — settings: every row earns its place (`muye28ed`, `muye1a35`, `muyemm3k`, `muydzvu9`)

**Sentinel:** `V33-8-SETTINGS-EVERY-ROW-EARNS-ITS-PLACE-T4N9`
**Status:** DONE
**Branch:** `v33-8` @ `/tmp/pd-wt/v33-8` · **Base:** `83df01a` · **Not pushed.**

---

## 0 — Provenance

The worker built all eight files, then **stalled in its own manual browser check**
(a reasoning loop about a stale marker session) and never committed. The edits were
complete on disk. This session reviewed the diff, ran the gate, ran the e2e the
worker skipped, and commits it here. The **commit-only recovery** shape the batch
documents.

## 1 — The convention this follows

A mobile settings page is a list of things you can CHANGE. Every row is either an
inline control, a doorway to the screen that owns it, or a read-only line that says
WHY. A dead display does not belong.

## 2 — What changed

| File | Change |
|---|---|
| `src/lib/privacy.ts` | `PrivacyFact` gains `editAt?` — the screen that owns changing it. Name / kids / photos → `/profile`; the kept facts → undefined |
| `src/components/PrivacySection.tsx` | one shared `FactRow`: a **doorway** (whole row a `Link` + `Change ›`) when `editAt` is set, else a **why-line** row. `dl/dt/dd` → `div/span` (a `Link` is not legal inside a `dl`; nothing selected on them) |
| `src/components/AccountSection.tsx` | **Sign out moved BELOW Delete my account**, with a separator rule and its own space |
| `src/components/FollowingSection.tsx` | each block states plainly it is where you change it |
| `src/lib/settingsIndex.ts` | the `saved` blurb and description say what the category is FOR, not what it mirrors |
| `src/lib/privacy.test.ts` | pins that exactly the three /profile-owned facts are doorways |
| `e2e/settings-index.e2e.ts`, `e2e/sign-out.e2e.ts` | sign-out-below-delete asserted **by geometry** (`signOutBox.y > deleteBox.y + deleteBox.height`) |

## 3 — Acceptance

| Founder ask | Result |
|---|---|
| "if I can't edit anything, what's the point of having it here" | every read-only line is now a doorway or carries a why-line |
| "Your name" (`muye1a35`) | links to `/profile`; no second editor built |
| Sign out at the bottom, away from Delete (`muyemm3k`) | moved below, separated — **geometry-proved** |
| "families you follow / places you save" confusion (`muydzvu9`) | blurb + headings say it is where you change them |

**No row was deleted** — none passed the bar for removal; every one earned a control,
a doorway, or a why-line. **No delete-candidates to report.**

## 4 — Gate (run by the controller, not the worker)

```
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only
  server.host change (another session), not this slice" npm run verify
```
- build ✓ · typecheck:e2e ✓ · **94 files / 2747 tests** ✓ · lint ✓ ·
  a11y:focus ✓ · **steering-lint ✗ (the only red — the other lane's `docs/agents/*`
  untracked pointers, unresolved in a fresh worktree)** · guards ✓
- `npm run guards` standalone: **GUARDS: PASS** (185 checks)

### e2e — port 4212 (marker minted there; setup reported `radius_miles=5`, so V35-C's migration is live)

| Spec | Result |
|---|---|
| `settings-index.e2e.ts` (incl. the new sign-out geometry) | **7 passed** |
| `sign-out.e2e.ts` (incl. the new sign-out-below-delete geometry) | **1 passed** |
| `privacy-preview.e2e.ts` (the `dl→div` change) | **2 passed** |

## 5 — Scope

```
src/components/AccountSection.tsx     55 ++++
src/components/FollowingSection.tsx    6 +
src/components/PrivacySection.tsx     51 ++++
src/lib/privacy.ts                    23 ++
src/lib/privacy.test.ts               14 +
src/lib/settingsIndex.ts               6 +-
e2e/settings-index.e2e.ts             10 +
e2e/sign-out.e2e.ts                   11 +
```

Nothing pushed. `origin/master` untouched.
