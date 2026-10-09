# HANDOFF — 2026-10-08, end of the V33→V35 batch

**For a FRESH session.** Read this file, then `.scratch/V35-STATE.md` if you need
the batch history. Everything here was measured; nothing depends on this session's
memory.

Repo: `~/Projects/playdate-app`. **Nothing is pushed.** `origin/master` = `5fc5f25`.
Master HEAD = **`1a12f3d`** (12 local commits ahead).

---

## 1 — The Drop In annotation queue is EMPTY

23 pending → **0**. Every one was either built today or verified as already shipped
(the whole /browse cluster had shipped hours earlier and simply never been cleared).

## 2 — What landed today (all local, unpushed)

| Slice | Annotation(s) | Commit |
|---|---|---|
| V35-C five miles (radius default 1→5, migration 0069) | `muydy8tg` | `564d165` → `5d97383` |
| V33-12 inbox avatar left of the name | `muyc3jnt` | `882753e` → `6394810` |
| V33-8 settings: every row earns its place | `muye28ed` `muye1a35` `muyemm3k` `muydzvu9` | `b6226bc` → `8f25080` |
| V33-hero photo above the name | `muye6aeo` | `f109fd5` → `1a12f3d` |
| The auto-resolve fix + `post-merge` hook | — | `a8dc657` |
| The deferred bathrooms pill + moderator ADR 0006 | `muzka6tz` `muye39z4` | `1116380` |

## 3 — What is OPEN now: the Meetup design thread (8 annotations)

All 8 are annotations on
`~/Documents/Obsidian Vault/DropIn-From-Meetup-Patterns.md` — the extraction from
today's Meetup APK reverse-engineering. They are **design-review notes, not a build
queue**. Jon marked up the 8 patterns; the session's job is to decide which become
Drop In backlog items.

The 8, in the note's own order:

1. `meetup-212178a4c471` — unified feed resolver (one filter, blank query → nearby)
2. `meetup-a62da3b6fca2` — **actionable empty state (the note calls it HIGHEST VALUE)**
3. `meetup-42a59eef4f3d` — server-side ranking params, not client sorting
4. `meetup-23d8ed4675b0` — client dedupe by slug + duplicate counter
5. `meetup-160c6b25f16b` — store radius in METERS, convert at render (Meetup's bug)
6. `meetup-7764c59f8e7e` — recents = query + location, local-only
7. `meetup-cec94436a3fe` — map as a first-class search surface ("search this area")
8. `meetup-ffed0e50dd64` — slug deep links `dropin.app/d/<slug>`

**Note:** pattern #2 (actionable empty state) and #1 (unified filter) overlap the
browse work that already shipped — check what exists before treating them as new.

## 4 — THE STANDING GRANT (do not re-ask)

Jon granted blanket authority (2026-10-08) on this project: **decide every design
question yourself and dispatch, reporting the decision afterwards.** Decisions are
recorded in `.scratch/v33/DECISIONS-2026-10-08-hermes.md`. Only ask for: a new data
schema, a paid service, or anything destructive.

## 5 — How the factory works now (this CHANGED today)

**The pane lanes and Pi are retired as dispatchers.** They are the old model: Pi is
an idle planner, and every `wQ:p*` pane is a finished slice that went idle.

**The unit of work is now a headless worker:**

```bash
~/fleet/bin/fleet-run .scratch/v33/briefs/<slice>-brief.md        # cloud (default)
~/fleet/bin/fleet-run .scratch/v33/briefs/<slice>-brief.md --local # 5090, STALLS — avoid
```

- It derives the worktree from the brief's FILENAME (`v33-8-brief.md` → `/tmp/pd-wt/v33-8`).
- **Run it in the BACKGROUND** (`background=true, notify=true`). A foreground timeout
  kills the wrapper and orphans the worker.
- Before any cloud dispatch: `~/fleet/bin/ollama-cloud-budget --json` must not be CRIT.
- **The local 27b model stalls** on these briefs — twice today, zero edits. Use cloud.

**The loop:** audit → brief → dispatch → **gate it yourself** → merge → close the
annotation. A worker's DONE is a belief; `npm run verify` in its worktree is evidence.

**The common worker shape:** it builds all the files, then wedges in its own browser
check and exits rc=1. The fix is the **commit-only recovery**: review the diff, run
the gate yourself, commit. This happened on 3 of 4 slices today.

## 6 — The queue now cleans itself

`scripts/git-hooks/post-merge` (tracked, `core.hooksPath=scripts/git-hooks`) runs
`fleet-resolve --auto` after every merge. `--auto` uses `annotation-audit`, which
checks each annotation's OWN anchor against master's source:

- **SHIPPED** (a testid or quoted label is in master) → auto-closed.
- **OPEN** → real work.
- **UNKNOWN** (prose only) → **a human decides. Never auto-resolved.**

⚠️ This was fixed today: the old matcher grepped commit messages for the annotation
id, which almost never appears (work ships as `v33-8`, not `muye28ed`) and closed 1 of
22. And the audit itself had a false-positive bug — it matched bare prose words
("instead", "down") and reported unbuilt work as SHIPPED. Both are fixed.

## 7 — Traps a fresh session will hit

1. **Never push.** 12 commits sit locally by design.
2. **A fresh worktree has a 20K `node_modules` stub and NO `.env`.** Before any gate:
   `cp ~/Projects/playdate-app/.env .` + `cp -r .../e2e/.auth e2e/` + `rm -rf node_modules
   && npm install`. Without `.env`, 18 test files fail to LOAD — not a code defect.
3. **`steering-lint` is red in every fresh worktree** (another lane's untracked
   `docs/agents/*` pointers). It is the ONLY acceptable red. `guards` must pass.
4. **Two dirty files belong to another session — never stage:** `vite.config.ts` and
   `src/dev/AgentationDev.tsx`. Stage **by path only**; `git add -A` is forbidden.
5. **Verify a founder's claim against the source before building.** Three annotations
   today were filed against a stale preview and were already shipped.
6. **A recovered slice's tests are beliefs too** — the stalled V35-C tests encoded a
   false premise the gate caught. Always run the gate before committing recovered work.

## 8 — The first action of the new session

Read the 8 meetup annotations and the note they mark up, then decide which are real
Drop In work vs already-shipped vs not-worth-it. Use the standing grant: decide, do
not ask. The note's own ranking already flags **the actionable empty state** as
highest value — start there.
