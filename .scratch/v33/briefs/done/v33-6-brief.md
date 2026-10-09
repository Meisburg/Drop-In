SENTINEL: V33-6-MESSAGE-BESIDE-GOING-N8J3

**Slice v33-6 — the Message controls sit beside Going, at their own width.**
Plan of record: `plan.md` §4 "v33-6".

Repo: `~/Projects/playdate-app`. Base: HEAD (`aebdb84`). **Do not push.**

📌 **WORK ECONOMICALLY.** Two builder sessions in this batch burned their whole
context window *surveying* and had to be restarted. Read only what this brief
names; **edit first, verify after**. A fresh session's window is ~98k tokens and
it goes fast.

Report to **`.scratch/v33-6-report.md`**. Reply with only:

```
Sentinel: V33-6-MESSAGE-BESIDE-GOING-N8J3
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-6-report.md
```

---

## 1 — The annotation, and the anchor RE-LOCATED by content

> *"Shouldn't this button be like next to the going button at the top? These
> buttons don't need to be so long, so they could be right next to each other,
> don't you think?"* — `muyekozk`, anchor `PlaydateDetailPage.tsx:2709:9`

The anchor is a **snapshot of the bundle he was served** (v32-5). Read it in that
revision and it is unambiguous — **this is the control he was pointing at**:

```bash
git show 82fe364:src/pages/PlaydateDetailPage.tsx | sed -n '2705,2720p'
```

…which is the **"Message the host"** button (`className="mt-3 w-full …"`), and
directly under it the per-pinger **`Message <name>`** buttons in their own
`flex flex-col gap-2` list. In today's tree they live at `:2774-2797`.

So: the message entry point is a full-width block far below the Going control,
and he wants it **beside Going, at the top, at its own width**, with the
per-pinger buttons sitting **next to each other** rather than stacked as long
bars.

## 2 — What to change (one file: `src/pages/PlaydateDetailPage.tsx`)

- Move the **"Message the host"** control into the page's **action cluster at the
  top, beside the Going control** — the same row/group the Going pill lives in
  (`:2530-2570` region), wrapping at 390px rather than overflowing.
- The **per-pinger `Message <name>`** buttons stay one per pinger (that is the V14
  ticket 01 rule) but become **intrinsic-width, side by side**, wrapping as
  needed — not `w-full` stacked.
- **No control is lost, renamed or restyled beyond width/placement.** Keep every
  accessible name, every testid, and every condition that decides who sees what
  (`canMessageHost`, `hostPingerNames.length > 0`, the "a stranger sees nothing"
  pin — that gate must not widen).
- Every control keeps a **≥44px** smallest dimension.

⚠️ **Do not move the comments section, the guest list, or the kids line.** This is
one control's placement and width.

## 3 — Acceptance criteria

1. On a signed-in drop-in page the **Message entry point renders in the top action
   cluster**, geometrically **beside** the Going control: assert their boxes
   **overlap vertically** (same row band, `|a.y − b.y|` less than a control's
   height) rather than by DOM order.
2. **Not full-width:** at 390px (`test.use({ viewport: { width: 390, height: 844 } })`)
   no message control spans its container's full width — assert its box is
   narrower than the containing row's, and that the page does **not** widen
   (`document.documentElement.scrollWidth <= clientWidth + 1`).
3. **Per-pinger buttons sit next to each other**: with two pingers, assert the two
   boxes share a vertical band (they are on one row) or wrap without overflow.
4. The count of message controls is asserted (before/after the same N) so none is
   dropped.
5. The **who-sees-what** gates are unchanged: a stranger sees no message control
   (asserted); the host sees one per pinger; a pinger sees "Message the host".
6. Stale locators: `e2e/reactions.e2e.ts`, `e2e/inbox.e2e.ts` and
   `e2e/rsvp-confirmation.e2e.ts` all reference `Message the host`. Any spec whose
   locator or geometry moves changes **in the same diff**
   (`scripts/guards/stale-locator-guard.mjs` fails otherwise).
7. `git diff` touches only `src/pages/PlaydateDetailPage.tsx` and those specs.

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

Then, on a private port you own in **4210–4218** (mint the marker ON that port
first; kill the server by port or PID — never `pkill -f`):

```bash
E2E_BASE_URL=http://localhost:4218 npx playwright test e2e/auth.setup.ts
E2E_BASE_URL=http://localhost:4218 npx playwright test e2e/rsvp-confirmation.e2e.ts e2e/inbox.e2e.ts --reporter=list
```

## 5 — Landmines

- Stage **by path only**; never `git add .` / `-A`. Never stage, revert or edit
  `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`.
- Pre-existing e2e failures never to claim: `feed-empty-state.e2e.ts:301`,
  `places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
- The `h1` and its status chip must stay **adjacent siblings** (six specs pin it),
  and there must be exactly one `h1`.
- Ambiguous or blocked? `Status: BLOCKED` with the one question.
