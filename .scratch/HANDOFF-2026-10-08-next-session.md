# HANDOFF — for the next Hermes session (2026-10-08, evening)

Read this first. Everything here is measured, not remembered. Repo: `~/Projects/playdate-app`.
Standing grant is ACTIVE (decide + dispatch, report after — ask only for a new data schema,
a paid service, or anything destructive).

---

## 1 — STATE RIGHT NOW

| Thing | Value |
|---|---|
| master | `ff41b0d`, **0 modified**, 21 unpushed (by design — NEVER push) |
| briefs queue | **0** (all stale ones archived to `.scratch/v33/briefs/archive/`) |
| **annotations pending** | **27** — Jon's review feedback (THE WORK) |
| workers running | 0 |
| dev server | :5173 up — **Agentation toolbar lives ONLY here** |
| preview | :4173 up (no toolbar; ignore for review) |
| annotation MCP | :4747 up |
| dsh host | :3080 up (401 = auth wall = normal) |
| pstack-dsh | 0.2.3 in ALL THREE profiles (tui/web/headless) |

## 2 — THE JOB: process the 27 review annotations

Jon reviewed on the dev server and left 27 notes (ids `mv0c*`/`mv0d*`). The task is
**triage, not a build queue.** Read them full, group by CONCERN (~6-8, not 27 tickets),
give each a verdict, resolve through `fleet-resolve <id> "<verdict>: <reason>"`.

**Run BOTH of these and read them together:**

```sh
curl -s http://localhost:4747/pending      # the 27 notes
~/fleet/bin/review-shots                   # pair each to a screenshot by time
```

⚠️ `review-shots` pairing is a HINT, not proof (one shot can sit near several notes).
Read the image, decide which note it illustrates. `~/Pictures` was emptied at 19:50.

**The 27, grouped by my first read (verify against the full text):**

- **Minimalism — the driving principle ("I don't wanna make the user think"), stated 2x
  (`mv0cc9ch`, `mv0cd7g2`).** Also: modal "feels chaotic" (`mv0cytrt`), "remove these
  buttons" (`mv0cjnlq`, `mv0chug7`, `mv0d7zlm`). A DESIGN DIRECTION, not tickets.
- **Affordance / naming:** create button clarity (`mv0ceczk`), "Host a drop in" vs
  "start" (`mv0culjp`), feed clarity "drop-ins others are hosting" (`mv0cg1d6`),
  "Learn More" button (`mv0cvj2y`), website button (`mv0cw9r2`).
- **Social features:** heart instead of star (`mv0cqvky`), heart system for families
  (`mv0cx8yz`), upvote/downvote comments (`mv0cxxvg`), group chat option (`mv0cii7t`).
- **Organization/nav:** 5th nav tab "Groups" (`mv0cgy9a`), sort dropdown
  (`mv0crqvw`), "Best first" meaning (`mv0cq2io`), host-controls set (`mv0cnpkh`).
- **Data/content:** clickable addresses → Google Maps (`mv0ctykq`), remove Cafe
  (redundant with coffee-nearby) (`mv0cpqfi`), star rating bigger (`mv0ctaar`),
  interests redundant (`mv0d4ugk`), add-parent confusion (`mv0d7dwh`), form redesign
  (`mv0d2y3o`), `mv0cwpud` (dull pills → color).

## 3 — HOW TO RUN IT (pstack on dsh is LIVE)

Jon's ask this session: run the factory from **dsh-tui** with **pstack**.

- `pstack-dsh@0.2.3` is installed in **tui, web, headless**. Targets dsh 0.2.0-rc.2 (exact match).
- It ships 46 skills (23 playbooks + 23 principles). Entry is the **`/poteto-mode` SLASH command**
  — its SKILL.md has `disable-model-invocation: true`, so the model CANNOT call it via the `skill`
  tool (`not available for model invocation` = by design, not broken).
- Tools: `pstack_spawn` (spawn child by ROLE), `pstack_catalog` (list routes),
  `pstack_overlay_read`/`write` (role→route overlay at `~/.dsh/pstack-dsh.json`).
- **No overlay yet** → every role inherits the parent conversation. Set roles in Settings → pstack
  (web UI) or write the overlay.
- **PROVEN:** `dsh --profile headless "call pstack_spawn with prompt 'reply with only PONG'"`
  returned PONG from a `poteto-agent` child. pstack works.
- Authoritative mapping: the plugin's own `HARNESS.md` (in the plugin package). Read it, do not
  write your own.

**Recommended flow for the 27:** open dsh-tui (or a headless dsh run), `/poteto-mode`, point it at
the annotations + `review-shots`. Or do the triage in Hermes (this seat) and use pstack for the
build fan-out after.

## 4 — THE FACTORY (how work ships)

- **Unit of work = a headless worker:** `~/fleet/bin/fleet-run <brief> --background`. Cloud by
  default. Gate every slice yourself: `npm run verify` in the worktree (a worker's DONE is a belief).
- **Lanes open in their OWN WORKSPACE** (not Pi's tab) — fixed this session in
  `fleet-dispatch`/`fleet-local-lane`. Your cockpit is tab 1 of `wQ` (`alt+1`), always.
- **Automation:** `fleet-autopilot` + `pi-heartbeat` cron jobs ACTIVE; queue empty so both idle/silent
  (heartbeat prints `Status: silent` — correct).
- **Cron scripts are thin WRAPPERS** execing `~/fleet/bin/*` (they used to be copies that diverged —
  fixed). Pane notifications are OFF by default (`HERMES_PANE=""`); opt in with `HERMES_PANE=wQ:p13`.

## 5 — OPEN / DEFERRED (not lost)

- **MEI measurement suite** (`mei-33-part-a1` + 9 commits, 1649 lines): built on the ABANDONED
  `~/firstmate/projects/Drop-In` (last commit Sept 24). Porting to live master = multi-hour
  conflict resolution. `~/fleet/repos/drop-in` holds the lineage (NOT `~/Projects/playdate-app`).
- **4 meetup patterns** deferred (need a drop-in search surface + slug identity), 1 scope call
  (map "search this area"). See `.scratch/v33/DECISIONS-2026-10-08-meetup-7-processed.md`.

## 6 — SESSION LEARNINGS (recorded in skills)

- `deepseek-harness-ops`: the crash-loop watcher, the pane-notification trap, workspace-per-lane,
  the pstack-dsh port (grep for `<thing>-dsh` before hand-building).
- `ui-annotation-feedback`: the screenshot relay (no image field in the store), `review-shots`,
  the backlog-processing verdicts.
- Committed this session: guard env-layer fix, the meetup-empty-state slice, 7 meetup annotations
  processed, review-shots, workspace-per-lane, pane-notify off. All in ~/fleet and the app repo.

## 7 — FIRST ACTION

Run `curl -s http://localhost:4747/pending` and `~/fleet/bin/review-shots`. Read the 27 notes
together with their screenshots. Group by concern. Decide. Start there.
