SENTINEL: V33-6F-HOST-ROW-FIX-R2D9

**Slice v33-6, FIX ROUND 1/5 — a REGRESSION `ocr` caught and the source confirms,
plus two cheap doc-drift finds from v33-7a.** Plan of record: `plan.md` §4.

Repo: `~/Projects/playdate-app`. Base: HEAD (`4276993`). **Do not push.**

📌 **WORK ECONOMICALLY — this lane is the ONE local lane, ~98k window.** Read only
what this brief names. Edit first, verify after.

Report to **`.scratch/v33-6-report.md`**. Reply with only:

```
Sentinel: V33-6F-HOST-ROW-FIX-R2D9
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-6-report.md
```

---

## 1 — THE REGRESSION (fix this first)

`src/pages/PlaydateDetailPage.tsx`:

- `:2542` opens `{!isHost ? (` — the RSVP block.
- `:2588` renders the host's per-pinger row (`hostPingerNames.map(...)`) **inside**
  that branch.
- `:1788` derives `hostPingerNames` as
  `isHost && guestNames !== null && count !== null && count > 0 ? guestNames : []`
  — **host-only**.

So inside `!isHost` it is **always empty** and **the host can never see
"Message \<pinger\>" any more**. A pinger can still see "Message the host".

**And two spec assertions were moved into the same wrong branch, so they pass
VACUOUSLY** — `e2e/inbox.e2e.ts`: the host-side message-button visibility check
and its `toHaveCount(2)`. That is why the gate was green.

**Fix:**
1. The per-pinger row renders **outside** the `!isHost` branch — it is host-only by
   its **own** gate (`hostPingerNames.length > 0`), not by that branch. Keep it in
   the same visual cluster (the action row above the RSVP controls is fine; what
   matters is the branch).
2. Restore both assertions so they can fail again, and **mutation-prove it**: make
   `hostPingerNames` return `[]`, show the host-side spec **red**, revert, show
   `git diff` clean of the mutation.
3. Keep the pinger-side "Message the host" behaviour and its stranger-absence
   assertion exactly as they are.

## 2 — The cheap `ocr` items, same pass

In `src/pages/PlaydateDetailPage.tsx`:
- `key={name}` on the per-pinger buttons (`:2590`) — `display_name` is **not
  unique**; use a stable id from the guest-list read if one is available, else
  say in the report why not (do not invent one).
- The message-control `className` is duplicated verbatim across the "Message the
  host" button and the per-pinger variant (only `text-left` differs) — one const.
- The three-level nested ternary in the going button's label — extract one small
  pure helper (`lib/` if it decides anything, else a local function) and give it a
  sibling test if it lives in `src/lib/`.

In `e2e/rsvp-confirmation.e2e.ts`:
- `page.locator(selector, { hasText })` is **not valid Playwright** — the options
  object only takes `{ timeout }`. Use `.filter({ hasText })` or `getByRole`.
  A spec that throws on an invalid option is not asserting anything.

In `e2e/inbox.e2e.ts`:
- `second.context.close()` is unguarded — wrap it so a thrown assertion cannot
  leak the context (this file's own `createPingingViewer` docblock makes that the
  convention).
- The file-scoped 390×844 viewport pin silently re-baselines **five** specs,
  including four unrelated to v33-6 geometry. Scope it to the specs that need it
  (or document it in the file's own words, as the sibling files do).
- Fix the stale docblock that describes an API the helper does not have.
- The duplicated `scrollWidth`/`clientWidth` read — one measurement, or a small
  helper.

In `src/lib/feed.ts` (from **v33-7a**'s `ocr`, all doc drift):
- the docblock above `validatePlaydateForm` (`~:976-982`) still says "the duration
  is one of the chips" — the body now uses `isPostableDuration`;
- the `PlaydateFormValues.durationMinutes` field doc (`~:945-949`) still says "one
  of `PLAYDATE_DURATIONS_MINUTES`";
- the new `isPostableDuration` docblock claims `isDuration` is what the chip row's
  *selected* state uses. **It is not** — `durationChipsRow` compares
  `values.durationMinutes === minutes` directly. Say what is true.

## 3 — Acceptance criteria

1. The host sees one "Message \<pinger\>" button per pinger again — asserted on the
   **rendered** DOM in a host context, and **mutation-proved** (mutation → red).
2. A pinger still sees "Message the host"; a stranger still sees neither
   (both assertions unchanged and non-vacuous).
3. The six cheap items above are done or explicitly and honestly declined in the
   report with a reason.
4. `npm run verify`: build ✓, typecheck:e2e ✓, test ✓ (**92 files / 2705 tests**,
   growing if you add unit tests), lint ✓ (**0 errors**), a11y:focus PASS ✓,
   steering-lint ✗ **only** with findings naming `docs/agents/*` (another lane's
   untracked docs; **do not touch `AGENTS.md` or `docs/agents/*`**), and
   `ALLOW_CONFIG_CHANGE="vite.config.ts: waiver" npm run guards` → **GUARDS: PASS**.
   Any other failure = stop, BLOCKED.
5. `e2e/inbox.e2e.ts` and `e2e/rsvp-confirmation.e2e.ts` pass on your private port
   (**4210–4218**; mint the marker ON that port first; kill the server by port or
   PID, never `pkill -f`).
6. `git diff` touches only: `src/pages/PlaydateDetailPage.tsx`, `e2e/inbox.e2e.ts`,
   `e2e/rsvp-confirmation.e2e.ts`, `src/lib/feed.ts` (docs only) and any new
   `src/lib/*.ts` + sibling test you add.

Stage **by path only**; never `git add .` / `-A`. Never stage, revert or edit
`vite.config.ts`, `src/dev/AgentationDev.tsx`, `CONTEXT.md`, `docs/agents/*`.
Pre-existing failures never to claim: `feed-empty-state.e2e.ts:301`,
`places.e2e.ts:2655`, the flake `places-map-view.e2e.ts:730`.
Blocked or ambiguous → `Status: BLOCKED` with the one question.
