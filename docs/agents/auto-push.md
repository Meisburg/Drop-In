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
do (applying a migration that needs a credential, a one-time SQL statement, a
product decision) gets recorded there and then never resurfaces. The end of a
batch is the moment the human is most likely present, so that is when the nudge
fires.

```bash
bash scripts/remind-human.sh          # run any time
bash scripts/remind-human.sh --hook   # the terse pre-push form
```

**Keep it working — it reads two things from `task-state.md`:**

1. Any line matching `ACTION REQUIRED` (or `⚠️ ACTION`).
2. Open entries (lines starting with `- `) in the
   `## Escalations (waiting on human)` section.

Entries containing `RESOLVED`, `APPLIED + VERIFIED`, or `not blocking` are
skipped automatically. So: when you record human-pending work, put it in one of
those two places — anywhere else in the file is invisible to the reminder, which
defeats the point.
