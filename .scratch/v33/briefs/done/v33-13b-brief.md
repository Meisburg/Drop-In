SENTINEL: V33-13B-FINISH-L4C7

**Slice v33-13, FINISH PASS.** A builder session did the work and died mid-run
(context window) **without committing and without writing its report**. You are a
fresh session. Nothing is on fire.

Repo: `~/Projects/playdate-app`. HEAD: `ab33d61`. **Do not push.**

**Uncommitted tree (from `git status`), the full set:**

```
 M src/components/RsvpConfirmationDialog.tsx
 M src/components/DropInMark.tsx                 (+4/−1)
 M src/index.css                                 (+58)
 M e2e/rsvp-confirmation.e2e.ts
?? src/lib/confetti.ts            (new — the pure piece geometry)
?? src/lib/confetti.test.ts       (new — its sibling test)
?? e2e/zz-v331-browser.e2e.ts     (new — a TEMPORARY browser probe)
```

`npm run typecheck:e2e` **already exits 0** on this tree. Other lanes' dirty
files (`vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`) are not yours.

Report to **`.scratch/v33-13-report.md`**. Reply with only:

```
Sentinel: V33-13B-FINISH-L4C7
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-13-report.md
```

---

## 1 — Read the contract, then the tree

The brief of record is **`.scratch/v33/briefs/v33-13-brief.md`** — read it (the
annotation, the scope, the acceptance criteria) and `plan.md` §4 "v33-13".
Then read `git diff` plus the two new `src/lib/confetti*` files.

Do **not** redesign. Confirm the seven acceptance criteria below and fix only what
is missing or broken. Working economically matters: a fresh window is ~98k tokens
and four sessions this batch burned theirs surveying.

## 2 — Before anything else: delete the temporary probe

`e2e/zz-v331-browser.e2e.ts` is a **throwaway browser probe**, not a spec of this
behaviour. **Delete it** (`rm`) — unless it genuinely asserts this slice's
behaviour AND passes in the suite, in which case rename it to something honest.
Quote which you did and why.

## 3 — The acceptance criteria you are finishing against

1. The RSVP confirmation renders the **mark above the text** and the **confetti
   layer**, with pinned testids (`rsvp-confirmation-mark`, `rsvp-confetti`).
2. **Another dialog has none** — a `ConfirmDialog` flow shows
   `rsvp-confetti` count **0** (the scope half; it leaks if the animation ever
   moves into `ModalShell`).
3. **Reduced motion**: with `page.emulateMedia({ reducedMotion: 'reduce' })`, every
   confetti piece's computed `animationName` is `none`, and the dialog's title,
   both paragraphs, the mark and "Got it" all remain present and visible.
4. **No layout shift**: the "Got it" button's bounding box is identical (within
   1px) with the confetti layer present.
5. At **390×844** the dialog's controls are fully visible (no box beyond the
   viewport) and every control keeps **≥44px**.
6. **No new dependency** in `package.json`, and **no `Math.random()`** in the
   component — the seeded pure function in `src/lib/confetti.ts` is the seam, and
   its sibling test asserts determinism, the piece count, left-positions inside
   0–100 %, and positive bounded durations/delays.
7. `git diff` touches only: `src/components/RsvpConfirmationDialog.tsx`,
   `src/components/DropInMark.tsx` (justify its 4 lines in the report — the brief
   said to import the mark, not redraw it), `src/index.css`, `src/lib/confetti.ts`,
   `src/lib/confetti.test.ts`, and `e2e/rsvp-confirmation.e2e.ts`.

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
typecheck:e2e ✓, test ✓ (**91 files / 2692 tests**, growing with the confetti
sibling test), lint ✓ (**0 errors**), a11y:focus PASS ✓, steering-lint ✗ with
**only those findings**, `guards` **PASS**. **Do not touch `AGENTS.md` or
`docs/agents/*`.** Any other failure = stop, BLOCKED.

Then, on a private port you own in **4210–4218** (mint the marker ON that port
first; kill the server by port or PID — never `pkill -f`):

```bash
E2E_BASE_URL=http://localhost:4212 npx playwright test e2e/auth.setup.ts
E2E_BASE_URL=http://localhost:4212 npx playwright test e2e/rsvp-confirmation.e2e.ts e2e/polish.e2e.ts --reporter=list
```

## 5 — Commit and report

`git add` **by path only** — the four modified product/spec files plus the two new
`src/lib/confetti*` files. **Never `git add .` / `-A`.** Subject in the repo's
style (`feat(drop-ins): …`), the founder's annotation quoted, and:

```
SENTINEL: V33-13B-FINISH-L4C7
```

The report must state, for each of the seven criteria, what asserts it — and name
anything you did **not** verify as an OPEN FINDING rather than implying it.
Never stage, revert or edit another lane's files; pre-existing e2e failures never
to claim: `feed-empty-state.e2e.ts:301`, `places.e2e.ts:2655`, the flake
`places-map-view.e2e.ts:730`.
