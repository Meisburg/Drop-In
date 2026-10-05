# Auto-push

Founder decision, 2026-09-17. Read this **before any `git push` to
`origin/master`** — that is the only time it applies.

End-of-slice pushes to origin/master do not need per-push human authorization.
Push when **ALL THREE** conditions hold.

## 1. Gate green

The slice's verification command passes on the final tree. Pin it as the plan
slice's gate: `npm run verify` (build + test + lint), plus e2e where the plan
pins it.

## 2. Clean range

`git diff --name-only origin/master..HEAD` lists only the slice's intended
files — zero local-only artifacts: `.agents/`, `.scratch/*.cjs|mjs|html`,
`supabase/.temp/`, `opencode.json` (untracked + gitignored). A slice's own
migration under `supabase/migrations/` IS an intended file when the plan slice
says so.

**RUN THIS, do not eyeball it:**

```bash
bash .scratch/check-push-range.sh
```

It applies the whole rule mechanically and exits non-zero on any forbidden path.

> **Why this is a script and not a header comment.** The rule was ALREADY correct
> and was still violated: on 2026-09-21 a slice ran `git add -A supabase/` and
> committed `supabase/.temp/linked-project.json` (project ref + org id,
> machine-local CLI state). The agent then checked the range with a hand-typed
> regex that omitted `supabase/.temp/` and reported "clean". A review lane caught
> it before it reached origin — but only by luck of ordering.
> **A safety check the agent types from memory is not a check.**

If the script is missing, write it from this rule before pushing.

## 3. Fast-forward

Plain `git push origin master`; no force, no amend, no rebase.

## Failure and staging rules

- Any one condition fails → **STOP**, report the failing check verbatim, founder
  decides. Never silently decide.
- **Never `git add -A` a directory.** Stage the slice's own files by name, or
  `git add -A src/ e2e/ supabase/migrations/` — never a bare `supabase/`, which
  is what let CLI temp state into a commit.
- Scope: git pushes to origin/master **only**. Publish, deploy, production
  changes, and sending sensitive data externally still require explicit human
  authorization.

## Run it yourself (founder rule, 2026-09-21)

**Do not hand the human work an agent can do.** The founder's standing
instruction: *"just run anything you need to run yourself, and let me know if
there's something I have to do that you can't do."*

Before writing "WAITING ON YOU" or asking for a manual step, check whether the
capability is actually absent — **most of the time it is not**:

| Task | Who does it |
|---|---|
| `npm run verify`, targeted e2e, playtest lane | **the agent** |
| Applying a migration | **the agent** — `POST api.supabase.com/v1/projects/<ref>/database/query` with `SUPABASE_ACCESS_TOKEN` from `.env`. No browser, no dashboard, no paste. |
| Redeploying an edge function (`npx supabase functions deploy …`) | **the human's yes first; the agent still runs it.** It is a production deploy. If a live migration starts emitting a new kind, the matching sender redeploy is *required for correctness* — the old sender mislabels the new kind — but it is still a deploy and still needs the yes. Record the ask as `ACTION REQUIRED` when you cannot get one. |
| Reading/probing the live DB for verification | **the agent** (same token) |
| Running Docker/Postgres tests of a migration | **the agent** |
| A product/judgment call | **the human** — and it needs a *decision*, not labour |
| Publish, deploy, send data externally | **the human's authorization** — a one-word yes; the agent still does the work |

The failure this rule exists to prevent: during V16 an agent asserted "no
credential exists on this machine" **without reading `.env` properly**, and asked
the founder to paste SQL by hand for ~25 rounds while a working `sbp_` token sat
in the file. **Verify a negative as carefully as a positive.** The cost of
getting it wrong is the human's time, spent on work the agent could have done.

When you *do* need the human, say precisely what you need and why it is theirs:
*"May I apply this migration to production?"* — not *"here is some SQL to paste."*

## The machine now enforces this

As of 2026-09-21 the three conditions are no longer advice. The hook lives at
**`scripts/git-hooks/pre-push`** — a *tracked* file — and git is pointed at it
with `core.hooksPath`, so the hook body travels with every clone.

It refuses a push to master when:

| Condition | Hook behaviour |
|---|---|
| Rule 2 (clean range) | Always enforced. Cannot be skipped. |
| Rule 3 (fast-forward) | Always enforced. Cannot be skipped. |
| Rule 1 (gate green) | Enforced — runs `npm run verify`. Skip with `FAST_PUSH=1`. |

```bash
FAST_PUSH=1 git push origin master   # skip the build/test/lint gate only
```

`FAST_PUSH=1` intentionally does **not** bypass rules 2 and 3: those are
seconds, and the range check is the one that has already failed in production
once.

### Why `core.hooksPath` and not `.git/hooks/`

`.git/hooks/` is **not version-controlled**. A hook copied there is invisible to
every clone, and it is lost entirely if `.git/` is ever recreated — at which
point enforcement silently reverts to "trust the agent", the exact failure this
hook exists to prevent.

`core.hooksPath` is *local* config and does not travel with a clone either, so
the config is self-healed two ways:

1. **`npm install` does it for you** — the `prepare` script runs
   `scripts/install-git-hooks.sh`. Any fresh clone that installs dependencies is
   gated automatically, with no manual step.
2. **Manually, once:** `bash scripts/install-git-hooks.sh` (or
   `npm run hooks:install`).

Both are idempotent. If you are ever unsure whether the gate is live:

```bash
git config core.hooksPath          # expect: scripts/git-hooks
git rev-parse --git-path hooks/pre-push   # expect: scripts/git-hooks/pre-push
```

If that prints `.git/hooks/pre-push`, the gate is **not** armed in this clone.

The `no-bypass` guard enforces the same statement mechanically, but it checks
**this repository's own config layer** rather than only the effective value. A
differing effective `core.hooksPath` is accepted only for an externally owned
disposable copy — a linked worktree whose common git dir is outside the checkout
and whose worktree config layer supplies a path inside that common dir — and the
guard prints every acceptance. The repository's own layer above must still read
`scripts/git-hooks`; a rewired repository layer, a non-worktree override, or a
recorded bypass still fails. Details: `docs/agents/borrowed-guards.md`.

### Verified behaviour (2026-09-21)

Each rule was observed firing, not assumed: a dirty range containing
`supabase/.temp/linked-project.json` was blocked (`FAST_PUSH=1` could not bypass
it), a red gate (`"verify": "exit 7"`) was blocked, a non-fast-forward was
blocked, a clean+green range passed, and non-master pushes skip the gate
entirely.

## The human-action reminder

A successful gated push also prints a **WAITING ON YOU** block, from
`scripts/remind-human.sh`. It is informational and never affects the exit code.

This exists because `task-state.md` is 1,300+ lines: work that only the human can
do (a **product decision**, or an action needing their **authorization** rather
than their hands) gets recorded there and then never resurfaces. The end of a
batch is the moment the human is most likely present, so that is when the nudge
fires.

**Do not put "needs a credential" on that list without checking.** A migration
apply does NOT need the human: `.env` carries `SUPABASE_ACCESS_TOKEN` (`sbp_…`)
and the apply is a plain
`POST https://api.supabase.com/v1/projects/<ref>/database/query`. During V16 an
agent asserted "no credential exists on this machine" without reading `.env`
properly, and asked the human to paste SQL by hand for ~25 rounds when the token
was sitting right there. **Verify a negative as carefully as a positive** — the
cost of getting it wrong is the human's time, spent on work the agent could have
done.

The genuine human-only categories are: a product/judgment call, and anything
your AGENTS.md requires explicit authorization for (publish, deploy, sending
data externally, production changes). Those need a **yes**, not manual labour.

```bash
bash scripts/remind-human.sh          # run any time
bash scripts/remind-human.sh --hook   # the terse pre-push form
```

**Keep it working — it reads two things from `task-state.md`:**

1. Any **entry** whose first line (`- …`) matches `ACTION REQUIRED` (or
   `⚠️ ACTION`) — the phrase belongs on the `- ` line, not wrapped below it.
2. Open entries (lines starting with `- `) in the
   `## Escalations (waiting on human)` section.

An entry is **opened by its first line and closed by any line in it**: the entry
runs from its `- ` line through its indented continuation lines, and it is
skipped when **any** line in that block contains `RESOLVED`,
`APPLIED + VERIFIED`, `SUPERSEDED`, `not blocking`, or `no further action`. This
matters because the house convention is to record the ruling *below* the ⚠️
sentence — a line-by-line match printed the closed V24 read-surface item
forever, and it was the only thing the reminder showed. (The asymmetry is
deliberate: matching the phrase on *any* line would also fire on prose that
merely quotes it — the noise class that made this reminder unreadable once
already. So: when you record human-pending work, put it in one of those two
places, with the phrase on the entry's own first line — anywhere else in the
file is invisible to the reminder, which defeats the point.)
