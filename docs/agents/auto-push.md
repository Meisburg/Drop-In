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

As of 2026-09-21 the three conditions are no longer advice. `scripts/pre-push`
is installed into `.git/hooks/pre-push` (via `bash scripts/install-git-hooks.sh`)
and refuses a push to master when:

| Condition | Hook behaviour |
|---|---|
| Rule 2 (clean range) | Always enforced. Cannot be skipped. |
| Rule 1 (gate green) | Enforced — runs `npm run verify`. Skip with `FAST_PUSH=1`. |
| Rule 3 (fast-forward) | Not enforced — git itself rejects non-ff on a plain push. |

```bash
FAST_PUSH=1 git push origin master   # skip the build/test/lint gate only
```

`FAST_PUSH=1` intentionally does **not** bypass the range check: that check is
seconds, and it is the one that has already failed in production once.
