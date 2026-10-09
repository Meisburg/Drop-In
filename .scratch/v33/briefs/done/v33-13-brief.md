SENTINEL: V33-13-CONFETTI-GOING-P3X8

**Slice v33-13 — delight on the Going confirmation.** Plan of record: `plan.md`
§4 "v33-13".

Repo: `~/Projects/playdate-app`. Base: HEAD (`ab33d61`). **Do not push.**

📌 **WORK ECONOMICALLY.** Four builder sessions in this batch died or wasted
their window surveying. Read only the files this brief names; **edit first,
verify after**.

Report to **`.scratch/v33-13-report.md`**. Reply with only:

```
Sentinel: V33-13-CONFETTI-GOING-P3X8
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-13-report.md
```

---

## 1 — The annotation

> *"It would be cool if we had some kind of confetti thing that explodes
> animation when you say you're going somewhere. Also, maybe you could put the
> drop in logo at the top above the text to make this just look more interesting.
> It looks very boring right now."* — `muyejzaa`, anchor `ModalShell.tsx:191`

The modal he was looking at is the **RSVP confirmation**, which is
`src/components/RsvpConfirmationDialog.tsx` (it wraps `ModalShell` — read its
render, `:50-85`). **`ModalShell` is every dialog's shell**, so the animation is
scoped to the confirmation component, NOT to the shell.

## 2 — What to build (no new dependency)

**a. The drop-in mark above the text.** `src/components/DropInMark.tsx` already
exists (the app's own logo glyph; import it, do not draw a new one). Render it
**above** the confirmation's text, in `RsvpConfirmationDialog.tsx`. It is
decorative: `aria-hidden="true"` (the dialog's title already names the event), and
it must not introduce a second `h1` or steal focus.

**b. Confetti, scoped to this one dialog.** CSS-only — **no animation library, no
new npm dependency.** Add keyframes + a class to the app's global stylesheet
`src/index.css` (it already carries `@keyframes modal-pop`, `:93`, and a
`@media (prefers-reduced-motion: reduce)` block at `:636` — put the reduced-motion
override in that same block or beside it).

Rules the confetti must satisfy, and they are the acceptance criteria:

- the layer is `aria-hidden="true"` and `pointer-events-none`;
- it **does not shift layout** — the dialog's controls keep their boxes (assert
  the `rsvp-confirmation-got-it` button's box is unchanged with and without the
  layer);
- it is bounded to the dialog (no fixed-position pieces escaping over the page);
- under **`prefers-reduced-motion: reduce`** nothing animates (assert
  `animationName === 'none'` for the pieces), and **no content is lost**.

**c. The geometry is a `lib/` decision, not a render.** Add
`src/lib/confetti.ts` exporting one pure function (e.g.
`confettiPieces(count, seed)`) that returns the piece list — position, delay,
duration, rotation, colour index — with **a sibling test**
(`src/lib/confetti.test.ts`) that asserts: determinism for a fixed seed, `count`
pieces returned, every left-position inside 0–100 %, positive durations and
delays, and a bounded total duration. **Name the test's `it(...)` for what it
protects** (deterministic, bounded, no layout escape) rather than the mechanism.
`Math.random()` is **not** allowed in the component: the pure function with an
explicit seed is the seam (the build law: React renders, `lib/` decides).

**Out of scope:** `ModalShell` itself, any other dialog (`ConfirmDialog` must
render **no** confetti — that is an assertion), every other page, and the feed
card's own ping affordance.

## 3 — Acceptance criteria

1. The RSVP confirmation renders **both** the mark (above the text) and the
   confetti layer; `data-testid`s are pinned (e.g. `rsvp-confetti`,
   `rsvp-confirmation-mark`).
2. **Another dialog has none**: open a `ConfirmDialog` (any confirm flow) and
   assert `rsvp-confetti` count is **0** — the "scope" half, and the one that
   leaks if the animation lands in the shell.
3. **Reduced motion**: with `prefers-reduced-motion: reduce`
   (`page.emulateMedia({ reducedMotion: 'reduce' })`), every confetti piece's
   computed `animationName` is `none`, and the dialog's title, both paragraphs,
   the mark and "Got it" are all still present and visible.
4. **No layout shift**: the "Got it" button's bounding box is identical
   (within 1px) with the confetti layer present.
5. At **390×844** the dialog's controls are fully visible (no box beyond the
   viewport) and every control keeps ≥44px.
6. No new dependency in `package.json`; no `Math.random()` outside the seeded
   pure function.
7. `git diff` touches only: `src/components/RsvpConfirmationDialog.tsx`,
   `src/lib/confetti.ts`, `src/lib/confetti.test.ts`, `src/index.css`, and the
   spec(s) you touch.

## 4 — Verification (quote raw output)

```bash
cd ~/Projects/playdate-app
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # GUARDS: PASS, exit 0
```

**⚠️ `steering-lint` (and therefore `verify`) exits 1 for a reason that is NOT
yours:** another lane added untracked docs under `docs/agents/`
(`parallel-development.md`, `compute-split.md`, `fleet-capacity.md`) and has not
pointed to them from `AGENTS.md`. Expected green-for-you shape: build ✓,
typecheck:e2e ✓, test ✓ (**91 files / 2692 tests**, growing with yours), lint ✓
(**0 errors**), a11y:focus PASS ✓, steering-lint ✗ with **only those findings**,
`guards` **PASS**. **Do not touch `AGENTS.md` or `docs/agents/*`.** Any other
failure = stop, BLOCKED.

Then, on a private port you own in **4210–4218** (mint the marker ON that port;
kill the server by port or PID — never `pkill -f`):

```bash
E2E_BASE_URL=http://localhost:4211 npx playwright test e2e/auth.setup.ts
E2E_BASE_URL=http://localhost:4211 npx playwright test e2e/rsvp-confirmation.e2e.ts e2e/polish.e2e.ts --reporter=list
```

## 5 — Landmines

- Stage **by path only**; never `git add .` / `-A`. Never stage, revert or edit
  `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`.
- Pre-existing e2e failures never to claim: `feed-empty-state.e2e.ts:301`,
  `places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
- Every `npm run verify` needs the `ALLOW_CONFIG_CHANGE="…"` waiver above.
- Ambiguous or blocked? `Status: BLOCKED` with the one question.
