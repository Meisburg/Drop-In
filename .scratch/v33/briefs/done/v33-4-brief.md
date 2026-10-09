SENTINEL: V33-4-PLACE-ON-DROPIN-S1K6

**Slice v33-4 — the drop-in page says where the place is.** Plan of record:
`plan.md` §4 "v33-4". Ruling applied: **"inline the place's own facts, then the
link"** (his own "use your best judgment").

Repo: `~/Projects/playdate-app`. Base: HEAD (`4590014`). **Do not push.**

📌 **WORK ECONOMICALLY — this lane's window is ~98k.** Read only what this brief
names. Edit first, verify after. Do not survey the repo.

Report to **`.scratch/v33-4-report.md`**. Reply with only:

```
Sentinel: V33-4-PLACE-ON-DROPIN-S1K6
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-4-report.md
```

---

## 1 — The annotation, and what the page does today

> *"If we're not going to include information about the place on the drop in
> itself, then every drop in should be like hyper linkable with like more info
> where it takes you to that place, I guess, right? Or should it be included on
> this page altogether? I guess use your best judgment."* — `muye9a6l`

Measured, so you need not rediscover it:

- `src/pages/PlaydateDetailPage.tsx:2355-2400` is the place paragraph. The name is
  **already** a `Link` to `placePath(detail.place_id)` for a directory place, a
  Maps `<a>` for a free-text place, plain text otherwise; the neighbourhood is
  appended after a `·`.
- `:2400-2415` is the place **rating** line (v32-9) — leave it alone.
- `e2e/post-location.e2e.ts:568-570` pins the paragraph's **exact text** and must
  change in the same diff.

## 2 — What to change (one file, plus its specs)

**Inline the place's own facts, then keep the link as the door.**

- Under the name, render a **quiet facts line** from data the page **already
  holds** — `detail.place_ref` (id, kind, indoor, photo fields) and the
  neighbourhood. Use the **same vocabulary the directory row already uses**
  (`placeIndoorLabel` / `placeKindLabel` — "Playground · Outdoor"), quoted as
  `·`-joined text, so the app has one way of saying this, not two.
- **Add no read.** If a fact is not already in `detail` or `detail.place_ref`,
  leave it out and say so in the report. Do not add a query, a fetch, or an embed
  field for this slice.
- **A free-text place (no `place_id`) renders no facts line at all** — no
  placeholder, no dangling separator — and keeps its existing Maps door.
- The name stays the link, the paragraph keeps its meaning, and the `·`
  neighbourhood suffix stays on the name line where it is.

## 3 — Acceptance criteria

1. A `place_id` drop-in page shows the place name (still a link to the place page)
   **and** a facts line with its kind and indoor/outdoor — asserted on the
   rendered text.
2. A **free-text** post renders **no** facts line (assert its absence) and still
   offers the Maps link.
3. The facts come from `place_ref`/`detail` **only**: prove it by asserting the
   rendered string is built by the shared label helpers, and state in the report
   that no new read was added.
4. The rating line from v32-9 is unchanged and still renders under the place block.
5. **Exactly one `h1`**, and the status chip remains the `h1`'s immediate next
   sibling (six specs pin that adjacency).
6. `e2e/post-location.e2e.ts`'s exact-text pin is updated **in the same diff**,
   deliberately, with a comment saying why it moved.
7. `git diff` touches only `src/pages/PlaydateDetailPage.tsx` and the spec(s) that
   pin the old text.

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
typecheck:e2e ✓, test ✓ (**92 files / 2705 tests**, growing with yours), lint ✓
(**0 errors**), a11y:focus PASS ✓, steering-lint ✗ with **only those findings**,
`guards` **PASS**. **Do not touch `AGENTS.md` or `docs/agents/*`.** Any other
failure = stop, BLOCKED.

Then, on a private port you own in **4210–4218** (mint the marker ON that port
first; kill the server by port or PID — never `pkill -f`):

```bash
E2E_BASE_URL=http://localhost:4214 npx playwright test e2e/auth.setup.ts
E2E_BASE_URL=http://localhost:4214 npx playwright test e2e/post-location.e2e.ts e2e/place-reviews.e2e.ts --reporter=list
```

## 5 — Landmines

- Stage **by path only**; never `git add .` / `-A`. Never stage, revert or edit
  `vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`.
- Pre-existing e2e failures never to claim: `feed-empty-state.e2e.ts:301`,
  `places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
- Ambiguous or blocked? `Status: BLOCKED` with the one question.
