SENTINEL: V33-2D-OCR-ROUND1-Y7B2

**v33-2, FIX ROUND 1/5 — `ocr`'s findings.** `fc64070` is HEAD and stands; the
slice is right in shape. Five findings, all real, all cheap. Findings 1 and 2 are
one **rule violation** and one **race**, and they are the two that matter.

Repo: `~/Projects/playdate-app`. **Do not push.** Append a "FIX ROUND 1" section
to `.scratch/v33-2-report.md`; reply with:

```
Sentinel: V33-2D-OCR-ROUND1-Y7B2
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-2-report.md
```

---

## 1 (HIGH, rule violation) — the file input is 14px, under the repo's 16px floor

`src/components/PlacePhotoAdmin.tsx`: the now-permanently-rendered file input
carries `text-sm`, which computes to **14px**. This repo's build law pins inputs
at **≥16px** (`.opencodereview/rule.json`; the mobile-audit lane measures it and
only skips checkbox/radio), and the **sibling link field in the same panel already
uses `text-base` for exactly this reason**. The file input is now the panel's
**default, priority** control, so it is measured in the ordinary panel state.

**Fix:** `text-base` on that input. Then prove it: quote the computed font size
for `photo-file-input` at 390px (a one-line probe or the audit's own read), not
just the class string.

## 2 (MEDIUM, real race) — the file picker is live while a save/load is in flight

`photo-file-input` is the one actionable control that is **not** disabled while
`busy` is true. It used to exist only in upload mode, so it could never co-exist
with an in-progress link save; now it sits beside `photo-save-btn` and
`photo-edit-current-btn`. A pick during `fetchPlacePhotoFile` inside
`handleUrlPrimary`/`handleEditCurrent` opens the crop step on a different file
mid-flight — a double-action the moderator cannot see.

**Fix:** disable the file input (`disabled={busy}`) whenever `busy` is true, and
make `handlePickFile` refuse early when `busy` (the same guard the other handlers
already carry) — belt and braces, because a disabled input is the *visible* half
and the guard is the one that holds if the attribute is ever lost.

## 3 (LOW) — the new test inlines a helper that already exists

`e2e/place-photo-admin.e2e.ts`: four lines of goto/set-radius/fill-search/expect
are exactly `openDirectoryAt(page, DONOR_PLACE)`, which **every other test in the
file uses** (including a custom term: `openDirectoryAt(page, 'Park')`). **Fix:**
call the helper. A setup change must not silently miss one test.

## 4 (LOW) — a fourth copy of the storage-path prefix

The public-URL prefix literal is now hardcoded four times in this file. There is
no shared constant to import (the app builds the URL at runtime), so **hoist it to
one file-level const** — e.g.
`const PLACE_PHOTOS_PUBLIC_PREFIX = '/storage/v1/object/public/place-photos/'` —
and use it at every site in this file. One copy, no drift.

## 5 (LOW) — a third copy of the donor read + null guard

The read + null-guard is byte-identical to the one inside `readDonorUrl()`,
including the error string, and exists twice only because one caller needs the
whole row and the other just the URL. **Fix:** extract
`readDonor(): Promise<PlacePhotoRow>` and have `readDonorUrl()` and the new test
both use it. One guard, one error string.

---

## Acceptance criteria for this round

1. `photo-file-input` computes to **≥16px** at 390px — quoted.
2. With `busy` true the file input is **disabled**, and `handlePickFile` refuses;
   the existing crop-cancel / save flows are unchanged (their spec assertions
   still pass untouched).
3. One `PLACE_PHOTOS_PUBLIC_PREFIX`, one `readDonor`, one `openDirectoryAt`
   call-site convention in the file the new tests live in.
4. `npm run typecheck:e2e` exits 0.
5. `npm run verify`: build ✓, typecheck:e2e ✓, test ✓ (**91 files / 2689 tests**),
   lint ✓ (88 warnings, 0 errors), a11y:focus PASS ✓, and steering-lint ✗
   **only** with findings naming `docs/agents/parallel-development.md`,
   `docs/agents/compute-split.md`, `docs/agents/fleet-capacity.md` — **another
   lane's untracked files; do not touch them or `AGENTS.md`.** Then
   `ALLOW_CONFIG_CHANGE="vite.config.ts: waiver" npm run guards` → **GUARDS: PASS**
   (exit 0). Any other failure = stop and report BLOCKED.
6. `e2e/place-photo-admin.e2e.ts` passes **twice** on your private port
   (4210–4218; mint the marker on that port; kill by port/PID, never `pkill -f`).
7. `git diff` still touches **only** `src/components/PlacePhotoAdmin.tsx` and
   `e2e/place-photo-admin.e2e.ts`.

**Any further concern goes in the report as an OPEN FINDING — do not fix it in
this slice.**

## Landmines (unchanged)

Stage by path only — never `git add .`/`-A`. Never stage, revert or edit
`vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, or anything under
`docs/agents/` (other lanes'). Pre-existing failures never to claim:
`feed-empty-state.e2e.ts:301`, `places.e2e.ts:2655`, the flake
`places-map-view.e2e.ts:730`.
