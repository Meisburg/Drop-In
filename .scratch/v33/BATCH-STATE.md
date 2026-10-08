# V33 BATCH STATE — resumable snapshot

**Written** 2026-10-07 ~17:45 local, by the orchestrator, because the builder lane
keeps dying mid-session and this session's own context is filling. **Nothing is
pushed.** `origin/master` is at `5fc5f25`.

Repo: `~/Projects/playdate-app`. Read `plan.md` (§1 table + §4 slices) first;
this file is the *state*, the plan is the *contract*.

---

## 1 — HEAD and where things stand

```
HEAD  = the commit named in §3 below ("shipped"), newest last
gate  = build ✓ · typecheck:e2e ✓ · test 91 files / 2692 tests ✓ · lint 88
        warnings / 0 errors ✓ · a11y:focus PASS ✓ · GUARDS PASS (exit 0)
        ✗ steering-lint — EXTERNAL, see §5
```

The gate is green **for V33's work**. Its one red stage is another lane's
in-flight steering docs (§5). Verify with:

```bash
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # GUARDS: PASS, exit 0
```

## 2 — Pending annotations: 24 → 20

Resolved in the toolbar with a summary and the commit sha (4):
`muye8eek` (already built, `8ecaa35`), `muyfmog8` (v33-1, `25dc518`),
`muyfsjwv` + `muyfsxah` (v33-2, `71de45e`).

**Do not re-resolve these.** Every remaining annotation stays pending until its
slice ships.

## 3 — Shipped (all local, unpushed)

| Slice | Commit(s) | What |
|---|---|---|
| v33-1 | `25dc518` | `matchPlaces` folds whitespace + punctuation — `greenlake` finds Green Lake Park (browser-proved: 117 rows → 5) |
| v33-0 | `2af490e`, `ad738cc`, `b28773b`, `0456f29` | restored the lost 390px no-ellipsis gate + fixed the `upcomingCount` snapshot race, through 3 `ocr` rounds; two ruled limitations documented |
| v33-2 | `fc64070`, `71de45e` | place photo admin is one step (uploader first, "or paste a link" as a field) + an in-panel "Edit photo" that re-frames the stored photo |
| v33-7a | `aebdb84` | **a window's length is free on the 30-minute grid** — `isPostableDuration`; a 30-minute window posts, proved by reading `start_at`/`ends_at` back from the live DB |
| v33-6 | `091aad8` | "Message the host" + the per-pinger "Message \<name\>" buttons moved into the RSVP block beside Going, intrinsic width, side by side |

`ocr` (the third review lane) ran on v33-1 (0 findings), v33-0 (4 + 5 + 4 findings
over three rounds, all answered), v33-2 (5 findings, all answered). JSON at
`.scratch/ocr-v33-*.json`, logs beside them.

## 4 — What is next, in order

| # | Slice | Brief | State |
|---|---|---|---|
| 1 | **v33-5** | *to write* | the card counts parents and kids and says the ages once |
| 2 | **v33-13** | *to write* | confetti on the Going confirmation + the mark above the modal's text |
| 3 | **v33-4** | *to write* | the drop-in page says where the place is (inline facts then the link) |
| 4 | **v33-7b** | *to write* | the window CONTROL polish (start/end presented as one window, nothing silently dragged) — 7a already shipped the defect fix |
| 5 | **v33-12** | *blocked* | inbox identity pair — needs a wording ruling |
| 6 | **v33-8, v33-9, v33-10, v33-11** | *blocked* | settings / hero photo / directory search module / community-owned places — see `plan.md` §5 |

**Rulings already made, do not re-open:** v33-3 is a no-build; v33-4 = "inline the
place's own facts, then the link"; v33-5 = one age range per card; v33-7's bound =
any positive whole number of minutes on the 30-minute grid, ≤ 24h; v33-13 is
scoped to the Going confirmation only.

## 5 — The external blocker (NOT ours — do not "fix" it)

Another lane added **untracked** steering docs and has not pointed to them from
`AGENTS.md`, so `steering-lint` fails and `npm run verify` exits 1:

```
docs/agents/parallel-development.md   (created 14:56)
docs/agents/compute-split.md
docs/agents/fleet-capacity.md
```

The finding names files that appear in **none** of V33's commits, and the same
gate ran `exit 0` at 14:44 before the first of them existed. **Never touch
`AGENTS.md` or `docs/agents/*`** — that is the other lane's work. Read the
finding, confirm it is only these three, and record the isolation.

## 6 — Operational facts a fresh orchestrator must know

- **The builder lane is a live `dsh tui` pane.** `herdr pane list` shows it;
  `.scratch/v33/builder-pane.txt` names the last one used. Dispatch with
  `herdr_dispatch_slice(pane_id, brief, sentinel, report_lines, timeout_ms)`.
- ⚠️ **The local model (`qwen-local/qwen3.8-27b`, ~98k window) DIES on long
  agentic sessions.** Measured this batch: one session surveyed for 50 minutes and
  made **zero edits**; three sessions died at 94/157/230 steps, two of them
  *after* committing, one with `CONTEXT_WINDOW_EXCEEDED`. Therefore:
  1. **One slice per fresh session.** Never reuse a session for a second slice.
  2. **Tell the builder to work economically** — "read only the files and regions
     this brief names; edit first, verify after". That instruction is why v33-7a
     finished.
  3. **Check `git log` and the tree after every dispatch.** A builder that
     timed out may have committed anyway (v33-7a, v33-6 did) — or may have
     changed nothing (the 50-minute survey). Never assume; never re-dispatch
     blindly.
  4. A new session = `herdr pane split` + `herdr pane run <pane> "dsh tui"`, then
     wait ~25 s for the banner. `dsh-tui` alone 401s (no auth); `dsh tui` works.
     `/new` typed into the TUI is NOT a command — it goes to the model.
- **`/tmp` is volatile here:** the machine rebooted at 14:09 and wiped
  `/tmp/pd-slices`, taking briefs and a screenshot with it. **Briefs live in
  `.scratch/v33/briefs/`, reports in `.scratch/v33-<slice>-report.md`.** A copy is
  mirrored into `/tmp/pd-slices` only for the old convention.
- **Never stage, revert or edit another lane's files.** Currently dirty and
  belonging to others: `vite.config.ts`, `src/dev/AgentationDev.tsx`,
  `CONTEXT.md`, `docs/agents/*`. Stage **by path only** — `git add .`/`-A` is
  forbidden. (`factory/decisions.md` is the orchestrator's.)
- **Pre-existing e2e failures — never claim to fix:** `feed-empty-state.e2e.ts:301`,
  `places.e2e.ts:2655`, the intermittent live-data flake
  `places-map-view.e2e.ts:730`.
- **Browser lanes:** ports 4180 / 4175 / 5173 are other lanes'. Own one in
  **4210–4218**, build first, **mint the e2e marker on that origin**
  (`e2e/auth.setup.ts`), kill the server **by port or PID** — never `pkill -f`.
- **The toolbar server is up** (`agentation-mcp` on `:4747`) and its MCP tools are
  reachable as `local-mcp_agentation_*`: `get_all_pending`, `resolve`
  (`{annotationId, summary}`), `dismiss`, `reply`, `acknowledge`.
- **Migrations** (none needed so far in V33): apply with
  `bash scripts/db-sql.sh --file <path>`, read the column back, apply twice to
  prove idempotence. **NEVER `scripts/apply-migrations.mjs`** — it drives the
  human's own Chrome window.
- **Cloud budget** (measured, not cached): weekly 35.5 %, session 29.8 % →
  `OK`. The local 5090 stays the default lane (Jon's 5090-first ruling); cloud is
  the overflow lane and was NOT needed.

## 7 — Deviations recorded (not hidden)

1. **v33-0 took three `ocr` rounds.** Rounds 1–2 fixed real defects in the gate
   itself (an unreachable assertion, a stale snapshot, a vacuous-pass hole,
   inline-box false positives, an incomplete selector). Round 3's two remaining
   findings are ruled *limitations* and are **documented in the file** instead of
   fixed — the loop stopped there by operator ruling, and the reason is in the
   test's own comments.
2. **v33-7 was split** into 7a (the defect) and 7b (the control polish) by the
   plan's own escape clause, after the first dispatch burned 50 minutes without an
   edit.
3. **v33-6's commit subject has no conventional-commit prefix** (`v33-6: …`) and
   **no report file was written** — the session died after committing. The diff
   and the gate are the evidence; both were checked by the orchestrator.
4. **v33-1's brief was wrong about ranking**: it demanded "Green Lake Park
   ranks first", which is unachievable without breaking the pinned name-then-id
   tie-break. The tie-break won; all five rows returned. Recorded in that slice's
   report.
5. **`.scratch/v33-0-report.md` was committed by the builder** (the `.scratch`
   convention is normally untracked). Harmless and durable; left as it is.

---

## 8 — Facts already gathered for the briefs not yet written

Measured by the orchestrator; **use them instead of re-deriving** (each costs a
session's context to rediscover).

### v33-5 — the card counts parents and kids, one age range (`muyed1t6`)
- `src/components/DropInCard.tsx:517-526` renders `card-age-range` — the HOST's
  kids' ages ("Ages 3–6"), above the place line.
- `:573-626` is the going line: circles, `+N`, then `goingLine.label`.
- `buildGoingLine` `src/lib/feed.ts:1531` → `goingCountsLabel` `:1567-1578`
  already renders **`3 going · 2 kids (ages 2–5)`** — the counts and the
  attendee band exist; the word "going" is the ambiguous one (V6's own note), and
  the card shows **two age signals** at once, which is what he is pointing at.
- Pin: the counts name **parents** and **kids**; an age range renders **exactly
  once** (suppress `card-age-range` when the going line renders; keep it when
  nobody is going, the only age signal a fresh post has); the decision is a `lib/`
  seam with a sibling test.
- Specs that pin the old strings: `e2e/feed-ages.e2e.ts`, `e2e/card-circles.e2e.ts`.

### v33-4 — the drop-in page says where the place is (`muye9a6l`)
- The place paragraph is `src/pages/PlaydateDetailPage.tsx:2355-2400`: the name is
  already a `Link` to `placePath(detail.place_id)` for a directory place, a Maps
  `<a>` for free text, plain text otherwise; the neighbourhood is appended.
- The rating line sits under it (`:2400-2415`).
- `e2e/post-location.e2e.ts:568-570` pins the paragraph's **exact text** — it must
  change in the same diff.
- Ruling: **inline the place's own facts, then the link** (his own "use your best
  judgment"): reuse the directory row's trust-line vocabulary, add nothing that
  needs a new read, render nothing when there is no `place_id`.

### v33-7b — the window CONTROL (`muyefjzq`, the polish half)
- `src/components/PlaydateFormFields.tsx`: `whenBlock` `:545`, `endBlock`
  `:612-636`, `durationBlock` `:590`. **Branch 1 (`/new`) only**; branches 2/3
  (`/edit`, the location-first page) keep `durationBlock` byte-identical.
- `stepTimeMinutes` (feed.ts) is the existing pure stepper; the window rule is
  `(end − start) mod 1440`, which v33-7a already made unconstrained on the grid.
- Specs pin `end-time-label`, the absence of "Ends …" on `/new`, and the steppers.
- Pin: one control reading as a **window**; stepping one value never silently
  moves the other; the single remaining coupling is `end > start`, and when it
  forces a move the UI says so.

### Operating recipe for the builder lane (repeat it in every brief)
`herdr pane split` + `herdr pane run <pane> "dsh tui"`, wait ~25 s, then
`herdr_dispatch_slice(pane_id, brief, sentinel, report_lines, timeout_ms)`.
**Write the brief for a ~98k window**: name the files and regions, forbid
surveying, and — when a session has already built the work — send a **commit-only**
brief that runs two commands and commits (that is the only shape that completed in
under three minutes this batch).

## 9 — UPDATE (later the same session)

**HEAD is now `1f9914c`.** Shipped since §3 was written: **v33-13** (`964d066`
confetti + mark on the Going confirmation, `ocr` not run — one session's work
committed by a commit-only pass, gate 92 files / 2697 tests, guards PASS) and
**v33-5** (`1f9914c` the card counts parents and kids and says the ages once;
gate 92 / 2705, guards PASS, suppression mutation-proved).

**Pending annotations: 24 → 18.** Newly resolved with a summary + sha:
`muyejzaa` (v33-13, `964d066`), `muyed1t6` (v33-5, `1f9914c`).

**Still open, in priority order:** v33-4, v33-7b, v33-12 (needs a wording
ruling), v33-8 / v33-9 / v33-10 / v33-11 (need rulings, `plan.md` §5). Briefs
for v33-4 and v33-7b are **not written** — their facts are in §8 above; v33-5's
brief is at `.scratch/v33/briefs/v33-5-brief.md` and is now a worked example of
the shape that completes in one session.

**What worked:** a brief that names files AND regions, forbids surveying, and
states the expected gate shape. v33-5 finished in one 81-step session; the
commit-only brief finished in 13 steps. **What failed:** any dispatch whose brief
left the builder to discover context — two of those died with zero edits.

**Un-run review lane:** `v33-13` has had **no `ocr` review** (the sessions kept
dying). Run
`ocr review --from 40b1f06 --to 964d066 --format json --output .scratch/ocr-v33-13.json`
when a lane is free. v33-6 and v33-7a also have no `ocr` pass yet
(`091aad8`, `aebdb84`).

---

## 10 — UPDATE #2: routing changed, a REGRESSION found, and the rulings

### 10a. ⚠️ OPEN REGRESSION FROM v33-6 — FIX THIS FIRST (`091aad8`)

`ocr` (run concurrently as the ruling directed) found it and **the source
confirms it**:

- `src/pages/PlaydateDetailPage.tsx:2542` opens `{!isHost ? (` and that branch now
  **contains** the per-pinger row at `:2588` (`hostPingerNames.map(...)`).
- `hostPingerNames` is derived at `:1788` as
  `isHost && guestNames !== null && count !== null && count > 0 ? guestNames : []`
  — **host-only**.
- Inside a `!isHost` branch it is therefore **always empty**. **The host can never
  see "Message \<pinger\>" any more.** A pinger can still see "Message the host".

Two spec assertions were moved into the same wrong branch and now pass
**vacuously** (`ocr` findings 7 and 11): the host-side visibility check and its
`toHaveCount(2)`. That is why the gate was green.

**The fix:** the per-pinger row must render **outside** the `!isHost` branch (it is
host-only by its own gate, not by the branch), beside the RSVP row as v33-6
intended; and both spec assertions must be restored so they can fail again —
**mutation-prove** it (make `hostPingerNames` return `[]` and show the spec red).

Same `ocr` pass also returned, all real: `key={name}` on non-unique
`display_name`s (`:2590`); a duplicated message-control className; a three-level
nested ternary in the going-button label; `page.locator(sel, { hasText })` is
**not** valid Playwright (must be `.filter({ hasText })`) in
`e2e/rsvp-confirmation.e2e.ts`; an unguarded `second.context.close()` in
`e2e/inbox.e2e.ts`; a duplicated viewport pin re-baselining five unrelated specs;
and a stale docblock. Fix them in the same pass where cheap.

**v33-7a's `ocr`** returned 3 **doc-drift** findings in `src/lib/feed.ts` (the
`validatePlaydateForm` docblock and the `durationMinutes` field doc still say
"one of the chips"; and the new docblock claims `isDuration` is what the chip
row's selected state uses — it is not, the row compares `durationMinutes`
directly). Cheap, honest, do them with the v33-6 fix.

### 10b. ROUTING (operator, 2026-10-07 21:0x) — supersedes §6's lane recipe

**Exactly ONE local builder lane** (`ninfer/qwen3.8-27b`, full ~98k window). Every
other lane runs on **cloud**: `ollama-cloud/deepseek-v4.1-flash:cloud` (1M ctx) or
`ollama-cloud/glm-5.3` (1M ctx) — zero local KV. `wQ:p15` and `wQ:p19` were
**closed** for this reason; `wQ:p1F` is the one local lane.

**The measured cause of the "dead" lanes was KV contention, not brief length**
(`running=5 waiting=4`, decode 27.8 tok/s, KV capacity 122,880 total vs 30-50k per
coding context). A queued lane emits nothing and looks dead. **Before any cloud
lane: `~/fleet/bin/ollama-cloud-budget --json` — verdict must not be CRIT** (a hard
429 kills a cloud lane silently, zero files changed). Measured at 21:05: weekly
35.8 %, session 0.7 %, **verdict OK**. Judge a lane's health from process state
(`~/fleet/bin/fleet-stall-check <pane> --repo …`), never from its pane.

Tight briefs remain good practice for a different reason (a smaller context
delays the overflow) — **but they were not the cause.**

### 10c. RULINGS APPLIED (`.scratch/v33/RULINGS-2026-10-07.md`)

- ✅ **5b rejected and dismissed in the toolbar** with the safety reason: the inbox
  last-active line (`muyc5kwv`) — the app refuses to claim presence; manufacturing
  one lies about a parent's whereabouts.
- **5c five miles (`muydy8tg`): APPLY.** One constant + one migration reversing
  `0066`, with the migration comment recording that it is a **deliberate reversal,
  not drift** ("for now" — a tuning value). Not started.
- **v33-12 (`muyc3jnt`) re-ruled: avatar circle immediately LEFT of the person's
  name** — the conventional messaging pattern — anywhere a person's name is the
  entity you are messaging (thread header, composer recipient, DM rows), matching
  the existing avatar treatment in the DM list. **NOT** a per-bubble avatar, **NOT**
  a standalone chip. Not started.
- **v33-7b: PROCEED** (UI polish only; the bound is already ruled).
- **v33-10 / 5a: prototypes, no slice.** 2–3 directory layouts and the hero-photo
  variant, shown to the founder; `impeccable` applies.
- **v33-11 / roles: ADR + ONE recommendation, NO implementation this batch.**
  Discover `supabase/migrations/0063_place_photo_review_state.sql` and the
  moderator surfaces first — build on that flow, never beside it.
- **Reviews (R1): build the ASK** — a non-obligating prompt to parents who said
  Going, after the time has passed. No scraping, no seeding. **Prototype the copy
  first.** Do not present an average derived from 4 reviews as representative.
- **v33-8 settings rule:** editable = a fact about the parent (name, photo, kids,
  interests, zip, radius, notif prefs, providers); read-only = computed or
  contractual (member-since, counts, the account email) or moderation-controlled;
  when read-only, **say why** next to it; **log out to the bottom** in that slice.
- **Debts: carry them** (62 places without a photo, `coffee_nearby` 215/234 null,
  590 marker rows — the last can go to the overnight sweep).

### 10d. IN FLIGHT when this snapshot was written

- **v33-4** (`muye9a6l`): builder `wQ:p1F` (the one local lane), 41 steps,
  **uncommitted** — `src/pages/PlaydateDetailPage.tsx` (+15) and
  `e2e/post-location.e2e.ts` (+16). Its TTFT read 34.3 s while three local lanes
  were alive; with the other two now closed it should recover. **Check
  `git log` before re-dispatching it** — this batch has twice seen a "dead" lane
  that had already committed.

### 10e. UPDATE #3 — v33-4 landed; the queue as it stands

**HEAD `83ac2bf`.** **v33-4 shipped** (`muye9a6l`): a quiet facts line under the
place name on a drop-in page, built from the same `placeTrustLine` seam the
directory row uses; a free-text post renders nothing; no new read. Gate
**92 files / 2705 tests / 0 errors · GUARDS PASS**, only the external
steering-lint red. Diff = exactly the page + its spec.

**Toolbar: 24 → 16 pending.** Resolved with a summary + sha: `muye8eek`,
`muyfmog8`, `muyfsjwv`, `muyfsxah`, `muyejzaa`, `muyed1t6`, `muye9a6l`.
Dismissed with the safety reason: `muyc5kwv`.

**Strict order for the next session — do not reorder:**

1. ⚠️ **Fix the v33-6 host regression** (§10a) — the host cannot see its own
   "Message \<pinger\>" buttons, and two spec assertions were made vacuous. Also
   fold in v33-7a's three `ocr` doc-drift findings and the cheap v33-6 `ocr`
   items (duplicate className, nested ternary, `key={name}`, the invalid
   `page.locator(sel, { hasText })` in `e2e/rsvp-confirmation.e2e.ts`, the
   unguarded `second.context.close()`, the re-baselining viewport pin, the stale
   docblock). Then **resolve `muyekozk`** against `091aad8` **only after** the host
   row really renders — the annotation is satisfied by v33-6's intent, and the
   regression is what makes it a lie today.
2. **v33-7b** — the window control polish. Brief not yet written; the facts are in
   §8. Dispatch **to a cloud lane** (`ollama-cloud/deepseek-v4.1-flash:cloud`) after
   `~/fleet/bin/ollama-cloud-budget --json` reads OK.
3. **v33-12** — the avatar circle immediately LEFT of the person's name
   (conventionally, wherever the name is the entity you are messaging). Ruling in
   §10c; brief not yet written.
4. **5c five miles** — one constant + one migration reversing `0066`, comment
   recording the deliberate reversal.
5. **v33-8 settings** — the editability rule in §10c, with log-out at the bottom.
6. **Prototypes (no slice):** 2–3 directory layouts; the hero-photo variant.
7. **ADR + one recommendation:** community-owned places and three roles, built on
   `0063_place_photo_review_state.sql`.
8. **Reviews (R1):** prototype the post-event ask copy first, then the slice.

**Owed `ocr` passes:** v33-4 has none yet. v33-6 and v33-7a have run
(`.scratch/ocr-v33-6.json`, `-7a.json`); **v33-13's run timed out** — rerun it.

---

## 11 — THE /browse DESIGN PASS (supersedes the earlier "prototypes first")

**Contract:** `.scratch/v33/RULING-browse-directory.md` (founder, 21:25).
**Deliverable (a) — DONE:** `.scratch/v33/plan-browse.md` — the restructured
`/browse`: search expanding to the full row while typing; three **labelled tiers**
(`When` = Open now · `Kind` = Playground/Indoor play/Museum/Café (+ More kinds) ·
`Mine` = Saved); the sort as a visible control **above the list** with **Best
first** as the default and A–Z available; the **Filters modal and its trigger
deleted**; the tie-break pinned (rating desc, review count desc, then name) because
4 reviews over 234 places means 230 rows tie. Eight acceptance criteria, each with
what asserts it, in §5 of that plan.

**Deliverable (b) — the PROTOTYPE — is QUEUED, not dropped.** A static HTML file at
`.scratch/v33/prototypes/browse/browse.html` (no app code, no new route), in this
app's own tokens, 390px + 1280px, with the one recommendation stated at the top of
the page. **It must be built with `impeccable` loaded** (`impeccable context`, then
the craft floor before any edit) — this is layout, hierarchy and copy, which is
exactly what that skill governs.

**⚠️ Routing blocks it right now:** the cap is **exactly ONE local builder lane**, and
that lane (`wQ:p1F`) is carrying the v33-6 host-regression fix. The `dsh cloud
rollover` job refuses while any lane has work, so new panes are still local and
**must not be started**. **Queue the prototype behind the v33-6 fix on `wQ:p1F`** (or
on the first cloud lane the rollover produces).

**The five annotations are two changes and one design pass** — do not brief them
separately: (1) delete the modal, (2) change the default sort, (3) the layout pass.
