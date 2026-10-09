SENTINEL: V33-2-PHOTO-ONE-STEP-R6K1

**Slice v33-2 — the place photo admin becomes one step.** Plan of record:
`plan.md` §4 "v33-2". This brief does not replace it.

Repo: `~/Projects/playdate-app`. Base: HEAD (`0456f29`). Local `master`.
**Do not push.** `origin/master` stays at `5fc5f25`.

Report to **`.scratch/v33-2-report.md`** (durable path — `/tmp` was wiped by a
reboot). Reply in the pane with **only**:

```
Sentinel: V33-2-PHOTO-ONE-STEP-R6K1
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-2-report.md
```

---

## 1 — The founder's two annotations, and what is already true

- `muyfsjwv` (18:24Z, anchor `PlacePhotoAdmin.tsx:320`): *"Clicking this button
  should just launch the image upload module. There shouldn't be an extra step.
  This should also be the priority option, so it should be shown first and then
  alternatively, it should be like 'or paste a link'. And instead of a button,
  you just have a place to paste it."*
- `muyfsxah` (18:24Z, anchor `PlacePhotoAdmin.tsx:425`): *"I would want an edit
  photo button somewhere."*

**Measured first, so you do not rebuild what exists:** `Edit photo` controls
already exist on two entry surfaces — `src/components/PlaceDirectory.tsx:2020`
(`place-edit-photo-<id>`) and `src/pages/PlacePage.tsx:684`
(`place-edit-photo`) — both labelled exactly **"Edit photo"**, both moderator-only.
What does **not** exist is any way to edit the photo that is **already set** once
the panel is open: the panel offers paste / upload / Keep / Remove and nothing
else. That, plus the two-step mode picker, is the real residual of the pair.

## 2 — What to change (`src/components/PlacePhotoAdmin.tsx`)

**One step, uploader first, link as a field.** Delete the mode picker — the two
buttons at `:308` (`photo-mode-url`) and `:320` (`photo-mode-upload`) and the
`mode` state behind them. In their place, always visible, in this order:

1. **The file picker, first and presented as the priority** — a labelled control
   (min-h-11) that takes a JPEG/PNG/WebP and opens the crop dialog on the decoded
   file, exactly as `handlePickFile` does today. **Picking a file must open the
   crop step directly**, with no intervening control.
2. **"or paste a link" — a plain paste FIELD**, not a button: the existing
   `photo-url-input` with its `validatePhotoUrl` preview, always rendered (no mode
   gate). Its own action (`photo-save-btn`, "Save photo") stays the URL path's
   single control, and it must only be **reachable/actionable when a link is
   typed** — never a live button with nothing to save.
3. **`Edit photo` inside the panel, when a photo is already set** — a control that
   opens the crop dialog on the **current stored photo** by running the SAME fetch
   path `handleUrlPrimary` already uses, on `place.photo_url`. Do not build a
   second fetch or a second save path. Name the testid `photo-edit-current-btn`,
   label it **"Edit photo"**, and keep it distinct from `Remove photo`.

Keep: the current-photo thumbnail (`place-photo-current`), `photo-keep-btn` for an
`unreviewed` photo, `photo-clear-btn`, the error paragraph, and the crop dialog's
**one** confirm-and-save path. The panel's outer testid `place-photo-admin` and
the launch testids on the two entry surfaces do not change.

## 3 — Acceptance criteria

1. Opening the panel shows the **file picker first**; there is **no mode-selection
   step** and no `photo-mode-url` / `photo-mode-upload` control anywhere.
2. "or paste a link" renders as a **field** (an `input`), not a button, and is
   visible without any prior interaction.
3. Picking a file opens `crop-photo-dialog` **directly**; confirming it writes
   `places.photo_url` — **read the row back from the live DB** and quote it.
4. Typing a valid link and saving writes `places.photo_url` the same way — read
   back, quoted. A link the app refuses still stores the link through the
   existing fallback sentence (unchanged behaviour).
5. With a photo already stored, **`photo-edit-current-btn` exists**, is labelled
   "Edit photo", and opens the crop dialog **on the stored image**; confirming it
   writes the row. Its click must not trigger Remove.
6. Every control keeps a **≥44px** smallest dimension.
7. **No stale locator:** `e2e/place-photo-admin.e2e.ts:317` clicks
   `photo-mode-upload` and the spec's flow depends on the mode step. Update that
   spec **in the same diff** — `scripts/guards/stale-locator-guard.mjs` fails
   otherwise — and keep every other assertion in it intact (the crop-cancel
   no-write proof, the 2:1 window, the restore-on-failure, the row-scroll-back).
8. `git diff` touches only `src/components/PlacePhotoAdmin.tsx` and
   `e2e/place-photo-admin.e2e.ts`.

## 4 — Verification (quote raw output)

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
```

**⚠️ READ THIS BEFORE YOU JUDGE THE GATE.** Another lane created an untracked
steering doc at 14:56 — `docs/agents/parallel-development.md` — and did not yet
point to it from `AGENTS.md`, so `steering-lint` (and therefore `verify`) exits 1
with **exactly one** finding: *"docs/agents/parallel-development.md is not pointed
to from AGENTS.md — unreachable steering"*. **That is not yours. Do not fix it.
Do not touch `AGENTS.md`, that doc, or anything else outside your two files.**

So the expected shape of a green-for-you gate is:
- `build` ✓, `typecheck:e2e` ✓, `test` ✓ (**91 files / 2689 tests**, growing with
  yours), `lint` ✓ (**88 warnings, 0 errors**), `a11y:focus` PASS ✓,
- `steering-lint` ✗ with **only** that one finding, naming that file,
- and `npm run guards` **PASS** when run separately with the same waiver:

```bash
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # must print GUARDS: PASS, exit 0
```

Report the isolation explicitly: the steering finding names a file that appears in
**none** of your commits. If any OTHER check fails, stop and report BLOCKED.

Then the spec, on a private port you own in **4210–4218**:

```bash
npm run build
npx vite preview --port 4214 --strictPort &   # pick a free one
E2E_BASE_URL=http://localhost:4214 npx playwright test e2e/auth.setup.ts   # mint the marker ON this port
E2E_BASE_URL=http://localhost:4214 npx playwright test e2e/place-photo-admin.e2e.ts --reporter=list
```

Kill your server **by port or PID** (`fuser -k 4214/tcp`) — never `pkill -f`.

## 5 — Landmines

- Stage **by path only**: `git add src/components/PlacePhotoAdmin.tsx e2e/place-photo-admin.e2e.ts`.
  **Never `git add .` / `git add -A`.**
- Never stage, revert or edit these (other lanes' dirty/untracked work):
  `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`,
  `docs/agents/parallel-development.md`. (`factory/decisions.md` is the
  orchestrator's.)
- Pre-existing e2e failures — never claim to fix: `feed-empty-state.e2e.ts:301`,
  `places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
- Migrations: never needed here. If you think one is, stop and report BLOCKED.
- Ambiguous or blocked? Report `Status: BLOCKED` with the one question. Do not guess.
