# HANDOVER — Playdate ("Drop In") — for a taking-over harness

**Written 2026-10-02 by the outgoing coordinator.** This document is self-contained:
you are assumed to have **zero** context from the session that produced it. Read
section 0, then 2, then 5.

---

## 0. The 60-second version

**The app.** Playdate ("Drop In") is a privacy-first webapp for arranging playdates.
Parents post a time+place invitation; nearby parents see it and RSVP. Kids appear by
first name and age only; no public profiles; parents must authenticate to see
anything. Stack is deliberately boring: Vite + React + TypeScript + Tailwind.

**The state.** A feature batch of **8 slices (6a–6d, 8a–8d) is COMPLETE and closed**
on branch `Meisburg/onboarding`. All 8 are merged into that branch; **nothing is
pushed to production.** Production is still the older `add7da7` / "V27".

**What is next, and it is NOT code yet.** A phone walk of the Vercel preview produced
**seven product changes** the human wants (section 5). The human's instruction was:
*"let's make these updates and ensure we plan it out first."* **Plan first, then
dispatch builders.** Six of the seven are small; two block publication.

**The factory was just changed, on purpose, and you must not undo it** (section 4).
Its target primary coding model is `strata-max` (Qwen Flash Next IQ3_S), which
**cannot run until the machine gets more RAM**. Until then the router automatically
uses the fallback `ninfer`. This is working as designed — do not "fix" it.

---

## 1. Where everything is

| what | path |
|---|---|
| **worktree (do your work here)** | `/home/jmeisburg/orca/workspaces/playdate-app/onboarding` |
| main checkout (leave alone) | `/home/jmeisburg/Projects/playdate-app` |
| branch | `Meisburg/onboarding` — **not** master |
| remote | `https://<token>@github.com/Meisburg/Drop-In` |
| project law (read it) | `AGENTS.md` at the worktree root |
| build law (read before writing code) | `docs/agents/code-structure.md` |
| the plan | `plan.md` (+ template `plan.template.md`) |
| live state | `task-state.md` |
| batch ledger (append-only) | `.scratch/v28/ledger.md` |
| briefs / reports | `.scratch/v28/briefs/`, `.scratch/v28/reports/` |
| factory registry | `factory/config.json` |
| decisions ledger | `factory/decisions.md` |
| factory CLI | `scripts/factory/factory.mjs` |
| compute policy | `docs/agents/compute-policy.md` |

**The gate for every slice is `npm run verify`** = `build && test && lint &&
a11y:focus && steering-lint && guards`. Measured at commit `f80835c`: exit 0,
**71 test files / 2067 tests passed, 81 lint warnings / 0 errors, `AGENTS.md`
1788 words against a 1800 ceiling, GUARDS: PASS.**

---

## 2. The hard rules — non-negotiable

This project runs an **orchestrator / builder / reviewer / verifier** pattern, and
the rules are enforced socially and by machine checks. Breaking them is worse than
being slow.

1. **Files are the system of record. Chat is not.** A finding that is not written
   into an artifact does not exist for the next reader.
2. **The orchestrator never writes product code and never runs the gate itself.**
   It writes the plan, dispatches builders, and inspects evidence. Code changes
   come from a builder dispatch; doing it inline is a **recorded deviation**.
3. **One writer per worktree at a time. Builders are serialized.**
4. **⚠️ NEVER `git add -A` while a builder is live.** It sweeps that builder's
   in-flight files into your commit and makes a bisect lie. **Stage explicit paths.**
5. **No success claim without fresh verification evidence.** The gate must have run
   *this turn*. A subagent's "DONE" is a belief; the diff and the command output are
   evidence. (D-043 in `factory/decisions.md` is a recorded instance of the outgoing
   coordinator failing exactly this.)
6. **Every slice needs acceptance criteria and a verification command in `plan.md`
   before it is dispatched.** A slice with neither is a plan defect.
7. **Fix rounds escalate by MODEL, not by count:** rounds 1–3 resume the original
   builder; rounds 4–5 dispatch a fresh builder on cloud; round 5's breaker
   adjudicates. Five rounds maximum.
8. **BLOCKED means stop and surface. Never silently decide.**
9. **Verification is the authority on "works"; review is the authority on "right".**
10. **Never weaken a rule to make a check pass. Never hand-edit a baseline — re-derive
    it. A check whose named failure mode is unreachable is a claim, not a check.**

### The review lanes (four, and they ask different questions)

| lane | question | mechanism |
|---|---|---|
| reviewer (agent) | does the diff match the PLAN SLICE? | fresh-context subagent |
| **`ocr`** | are there DEFECTS in these lines? | Alibaba open-code-review CLI, own rules in `.opencodereview/rule.json`. **Reviews CODE only — it skips all markdown.** |
| verifier (agent) | do the deterministic checks pass? | runs the real commands |
| **`npm run guards`** | is there a violation at all? | deterministic scripts, no model |

**Before any `git push` to master, read `docs/agents/auto-push.md`.** Three
conditions: gate green on the final tree; a clean range proven by **running**
`bash .scratch/check-push-range.sh` (never eyeballed); and **fast-forward only** —
no force, no amend, no rebase. A `pre-push` hook is armed and enforces it.

---

## 3. Current state

- **Batch complete.** 8 slices closed, 205 commits on the branch, 40+ D-numbered
  rulings in `factory/decisions.md`.
- **Working tree clean** at `f80835c`.
- **`r2-D1` (the resume check) is CLOSED — by the human.** On a phone, against the
  Vercel preview, they abandoned after the kids card, re-entered, and reported
  *"it resumed."* Recorded as the human's words, not an agent's inference. This was
  the batch's only human-only verification.
- **Vercel preview of this branch:**
  `https://drop-in-git-meisburg-onboarding-jonmeisburgs-projects.vercel.app`
  (deployment protection is ON — a Vercel sign-in is needed once).
- **A LAN dev server may still be running** at `http://192.168.1.61:5173/` as a
  fallback. If you are done with it, kill the listener **by port** — never
  `pkill -f`, which matches your own shell and kills it.

### ⚠️ The merge is HELD, and it needs a human

**`origin/master` is 5 commits ahead and the push is NOT a fast-forward.** Those 5
are native-app planning handoffs, a guard-flake fix, and two state records — no
hotfix, nothing touching this batch. `auto-push.md` forbids force/amend/rebase, so
**this needs the human's decision about those 5 commits.** Do not attempt the merge.

### ⚠️ Security finding — reported, NOT acted on

The `origin` remote URL stores a **GitHub OAuth token in plaintext in `.git/config`**
(`gho_` prefix, push access to `Meisburg/Drop-In`). Machine-local and not committed,
but it is a live credential that travels with any copy of the checkout. **Recommend
rotating it and switching to a credential helper.** It was left alone deliberately —
it is the credential the last push used, and rotating it is the human's call.

---

## 4. The factory / compute change — do not undo it

**Decided by the human on 2026-10-02.** The target primary coding + reasoning model
is **`strata-max/qwen3.8-flash-next-iq3_s`** (Qwen Flash Next IQ3_S) served by
Strata Max on the RTX 5090 box. **`ninfer/qwen3.8-27b` is the fallback**, not the
target. Cloud is an exception lane.

**Why the primary is idle, and it is not the model.** Measured across four loads:

- pinned host arena **46.84 GiB, fixed**; total RAM **~52 GB**
- VRAM **31.8 GB — the entire 32 GB card**; load **20 s**
- **71.8 tok/s** with MTP speculation; full **131072** context
- **tool use verified 4/4** with correct name and arguments

It works. Admission needs `52 + 4 reserve + 3 task = 59 GB` and the machine reports
**~2 GB available** while it runs. **The binding constraint is RAM headroom.** The
correct fix is **more RAM: 2 empty DIMM slots, 192 GiB ceiling, 2×32 GiB installed
→ add 2×32 GB and there is ~35 GB of headroom.**

**Two things were proven that kill the obvious workarounds:**

1. **The expert cache is a COPY, not a relocation.** `--kv q4_0` plus a halved
   context grew the resident expert cache 11330 → 11989 slots and the arena stayed
   **46.84 GiB, unchanged.** Freeing VRAM does not free RAM.
2. **The reserve is NOT to be weakened and no capacity number adjusted to force
   admission.** A factory that admits a model it cannot hold does not gain the
   model, it loses the work.

**How the switch happens — and why it is explicit.** The router already ordered the
two correctly, **but by accident**: both are `cost_tier 0` and both clear the builder
floor, and the tie-break `capabilityHeadroom` **sums raw units** — a context window
in tokens beside a reasoning level out of five — so `strata-max` won by 32768 points
of unit scale. `factory/config.json` now carries **`models[strata-max].preference = -1`**
(lower wins, default 0), applied **after** the cost tier (so a preference can never
promote cloud over local) and **before** capability headroom. **No declared
capability value was raised to produce this** (D-034).

**What the router will do once the RAM is installed** (simulated and pinned by tests):

| lane | model |
|---|---|
| builder, verifier, explorer, ocr | `strata-max/...` |
| **reviewer** | **`ninfer/...`** — always, because `strata-max` declares `reasoning: 2` against a reviewer floor of `3`, so the builder can never review |
| researcher | cloud |

**Verify it yourself:**

    node scripts/factory/factory.mjs route builder

`strata-max/...` = primary active. `ninfer/...` = the RAM is not there yet, **which
is the fallback doing its job, not a fault.** `factory doctor` shows the arithmetic.

**⚠️ The ONE machine step at upgrade time, and it is NOT to be done early:**

    systemctl --user disable --now ninfer-serve

All three inference units are `enabled` and only `strata-max`/`strata-serve` declare
`Conflicts=`, while `ninfer-serve` declares none. Today that is harmless (strata-max
cannot fit, so it fails and ninfer carries everything). After the RAM upgrade **both
would try to load at login — 31.8 GB + 23.4 GB against a 32 GB card** — and the loser
is decided by startup order. **Doing this before the RAM arrives would leave nothing
local loading and every lane falling to cloud.** Order matters more than the edit.

**Known-open, recorded not smoothed over:** the reviewer is the **same family** as
the builder (both Qwen). D-035 found a shared blind spot is one verdict counted twice;
only a different family buys independence from *prior*. `ollama-cloud/glm-5.3` (GLM)
is the family-independent option. Also: the two models **cannot be loaded at once**,
so moving between builder and reviewer is a **~20–30 s model swap** per lane.
`--expert-cache-per-layer` is **UNAVAILABLE** (fails the engine's own
`ExpertCache::verify_slot`). `MAP_HUGETLB` is unavailable, so the arena uses 4 KB pages.

---

## 5. THE PLAN TO EXECUTE — seven product items

**All seven come from the human, walking the Vercel preview on a phone, with
screenshots.** None is started. **Plan them into `plan.md` slices BEFORE dispatching
any builder**, with acceptance criteria and a verification command each.

**Six of the seven are small. Two block publication — do those first.**

### 🔴 Blocker 1 — remove the three fake e2e drop-ins (item 4)

- **What:** the preview shows three fake drop-ins: `e2e weekly-absent 1790896154`,
  venue "E2E weekly lot", host "@e2e-1790896143 Marker". They must be gone before
  publication.
- **Where:** these are **e2e marker accounts** created by `e2e/weekly-series.e2e.ts`.
  The batch's own ledger already lists them as *"awaiting the batch-end sweep."*
- **This is DATA CLEANUP, not a code change.** ⚠️ **It touches production data —
  treat it as the highest-risk item here and get the human's explicit confirmation of
  the exact rows before deleting anything.**
- **Acceptance:** the three rows are gone and a fresh preview renders no `e2e`-prefixed
  venue or host. **Verify by querying, not by eyeballing the page.**

### 🔴 Blocker 2 — notifications are genuinely broken (item 6)

- **What:** enabling notifications yields
  `Registration failed - missing applicationServerKey, and gcm_sender_id not found in manifest`.
  **This is a real product defect, not a nit.**
- **Where:** `src/sw.ts:74-80`. `const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''`.
- **The defect, precisely:** the comment there asserts *"`subscribe()` is still
  attempted without `applicationServerKey`, which the Web Push protocol allows, so a
  parent's opt-in is recorded and starts working the moment a sender exists."*
  **The browser refuses it**, so the opt-in is **not recorded** and the comment claims
  a capability the mechanism does not have. This is the recurring defect class this
  project has a name for (**D-025**): *a stated capability the mechanism does not have.*
- ⚠️ **The fix may not be purely in code.** A VAPID key pair must exist and be
  configured. **`docs/push-setup.md` is the human-owned setup document.** Establish
  what is actually missing before writing code — the honest outcome may be "code +
  a secret the human must provision", which is a **BLOCKED** to surface, not a guess.
- **Acceptance:** on a real browser, enabling notifications completes registration and
  the subscription is persisted. **Verify in the browser, not by unit test alone.**

### 🟡 Item 5 — "I'm going" belongs BELOW the event info

- **Where:** `src/pages/PlaydateDetailPage.tsx:2147` — the button currently sits at the
  very top, before the title.
- **Why (human's words):** a user decides whether they are going *after* reading about
  the event.
- **Small, self-contained UI move.** Acceptance: ordering is visible and no other
  element shifts; existing detail-page specs still pass.

### 🟡 Item 7 — set-location needs TWO buttons, not three

- **Where:** `src/components/LocationModal.tsx:260,271` — currently `See places` /
  `Apply radius` / `Cancel`.
- **Wanted:** **Cancel** and **Apply**, where Apply closes the menu *and* updates the
  page.
- **⚠️ One fix covers both entry points:** `src/components/PlaceDirectory.tsx:1348`
  (Places) and `src/pages/FeedPage.tsx` (the drop-in page). The handler lives at
  `FeedPage.tsx:992-1013`, and **the comment at `:1013` literally describes this bug.**
- Acceptance: two buttons, both entry points, Apply closes and applies. **Check the
  Places path too — that is the one a single-page test would miss.**

### 🟢 Items 1, 2, 3 — the first-run flow (COUPLED — plan them together)

These three all touch the onboarding/first-run experience and **interact**. Sequencing
them independently is how you get a merge conflict inside one flow.

**Item 1 — navigation arrows.** The first-run cards need back/forward so a parent can
go back and fix an answer. → `src/pages/OnboardingPage.tsx` (the card sequence has no
reverse move). ⚠️ **Read this file's history first: the mid-save/freeze semantics here
are load-bearing and were audited at length in slices 8a and 8d. A back-arrow
interacts with `saving`, the zip field, and the radius select.** Treat as the riskiest
of the three.

**Item 2 — delete the "You're all set" screen** (screenshot `…403b.png`). The human
wants people to **start by exploring other people's drop-ins** instead. →
`src/lib/firstRunTour.ts:19` (the comment literally reads *"r1's ending — 'Here are a
few real places near you'"*).

**Item 3 — replace "How Drop In works" with lightboxed tooltips on app load**
(screenshot `…d095.png`). The human calls the current screen *"a bad way to learn about
the app."* → `src/components/HowItWorksCard.tsx`, and `src/lib/firstRunTour.ts` +
`src/lib/firstRunTour.test.ts`.

> ⚠️⚠️ **READ THIS BEFORE TOUCHING ITEMS 2 OR 3.** `src/components/HowItWorksCard.tsx`
> and `src/lib/firstRunTour.ts` are exactly what slice 6d built a whole guard around:
> `scripts/guards/copy-taxonomy-guard.mjs`, whose declaration is
> **`TOUR_TAXONOMY_CLAIMS` at `src/lib/firstRunTour.ts:205`**, with the rule written
> into `docs/agents/code-structure.md`. **Deleting or rewriting that copy will change
> or invalidate the declaration.** Run `npm run guards` early and often on these two
> items; a copy change that silently empties the declaration is a **finding**, not a pass.

---

## 6. Other open items needing a human (do not decide these alone)

1. **The merge to master** — blocked on the 5 divergent commits (section 3).
2. **`ocr` routing is TEMPORARY.** Commit `ec47f15` set
   `task_kinds.ocr.requires_local_inference` to `false`. **It is now possible to revert
   it to `true`**, because `ninfer` clears ocr's floor (this was not true when the
   waiver was written). One line. **Needs the human's word.**
3. **Known-opens recorded during the batch, not fixed:**
   - 8b: four opens, including that the guard-uses-the-shared-scanner claim is a text
     assertion plus shape-limited seeds.
   - 8c: the **same-second kid-photo window** — the same token **is the CDN cache key**,
     so old bytes can be served up to the edge TTL. Pinned at `db.ts:2857`. Structural
     fix would be `createSignedUrls(..., { cacheNonce })`.
   - 8d: five opens, the sharpest being that **the mid-save divergence is a family, not
     one field** — the **radius select** (`OnboardingPage.tsx:1089` + `:1683-1700`) is
     editable while `saving`, and both save paths write the tap-time `radiusMiles`.
   - **`v28-r2-8e`** — a real guard defect: `count-provenance`'s `at` arm has no left
     boundary, so it matches the `at` inside `iat`. It already pressured one lane into
     **obfuscating readable evidence to silence a spurious finding.** Registered,
     unfixed.
4. **`strata-max` still declares `residency: resident`, which is false** — it is loaded
   on demand. Left as declared rather than quietly edited; recorded in
   `docs/agents/compute-policy.md`.
5. **The factory prints `the factory's own worker is strata-max — start it with:
   systemctl --user start strata-max`.** That hint becomes correct after the RAM
   arrives, but **starting it today blocks every lane including cloud.** Do not act
   on the hint.

---

## 7. How to work here

```bash
cd /home/jmeisburg/orca/workspaces/playdate-app/onboarding

# the gate — the only authority on "works"
npm run verify

# guard totals, individually
node scripts/guards/factory-guard.mjs
node scripts/guards/factory-guard.check.mjs      # prints a check count
bash  scripts/guards/lib-sibling-guard.sh
bash  scripts/guards/run-all.sh

# the factory
node scripts/factory/factory.mjs doctor
node scripts/factory/factory.mjs route builder
node scripts/factory/factory.mjs admit builder --id <id>   # task-kind FIRST, then --id
```

**Environment notes that will otherwise cost you an hour:**

- **oxlint prints no summary banner off a TTY.** Count with
  `grep -c ': warning '` / `grep -c ': error '`.
- `vitest` discovers `scripts/**/*.test.mjs`.
- **A `lib/` module must ship a sibling `*.test.ts`**, and `scripts/lib/` counts too.
- **A change to a protected config** (`package.json`, `tsconfig*.json`, `vite.config.ts`,
  `vitest.config.ts`, `.oxlintrc.json`, `playwright.config.ts`, `scripts/steering-lint.sh`)
  requires **`ALLOW_CONFIG_CHANGE="<why>"`**.
- **A new route must join the playtest `routes.json`.**
- `steering-lint` ceilings: **`AGENTS.md` 1800 words** (it is at **1788** — 12 to spare)
  and `docs/agents/coordinator.md` 900. **Every steering doc must be reachable from
  `AGENTS.md`.** If you create a doc under `docs/agents/`, you must point to it from
  `AGENTS.md` — and there are only 12 words of room, so prune while you add.
- **Never `rg -r`.** Write the needle to a file and use `-f`.
- **Never state a number, count, or history fact you have not just measured.**
- Workflow/subagent scripts must avoid bare `@` and unescaped backticks — build them
  from arrays joined with `\n` and plain quotes.

---

## 8. Your first three actions

1. **Read** `AGENTS.md`, `plan.md`, `task-state.md` and `docs/agents/code-structure.md`.
2. **Confirm the tree and the gate yourself** — `git status`, `git log --oneline -5`,
   `npm run verify`. Do not trust this document's numbers; re-measure them.
3. **Write `plan.md` slices for the seven items in section 5 — blockers first — with
   acceptance criteria and a verification command each. Then dispatch one builder at a
   time.** Do not start the mobile implementation before the plan exists; that is the
   human's explicit instruction, and it is the first rule of this project.
