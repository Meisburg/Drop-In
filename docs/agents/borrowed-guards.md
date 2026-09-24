# Borrowed guards — what we took from ECC, and what we refused

Source: `affaan-m/ECC` (MIT), local checkout at
`~/Projects/skills/ECC-main/ECC-main`. Read this before adding a fourth guard,
and before proposing we adopt ECC wholesale.

## The one-line reason we did not adopt ECC

ECC is a **catalog**: 68 agents, 292 skills, 94 commands, 53 hook scripts,
7 harness adapters. This repo is a **control loop**: one orchestrator, four
subagents, three review lanes, one gate. Those are different genres. Bolting a
catalog onto a control loop does not make the loop better — it makes the
always-on steering payload larger, and this repo's budget for that is under 5%
of a 98k local window. AGENTS.md already rejected `/implement` and
`superpowers:subagent-driven-development` on exactly this ground. ECC is the
same shape of decision.

What ECC does have that we did not: **deterministic per-edit enforcement**.
Its hooks fire on tool calls and can block. Ours fired only at slice end, in
`npm run verify`, and only for the things someone remembered to script.

So: take the enforcement idea, take three specific rules, refuse the rest.

## What was taken

| Guard | Rule it enforces | Source pattern in ECC |
|---|---|---|
| `scripts/guards/lib-sibling-guard.sh` | every non-exempt `src/lib/*.ts` ships a sibling `.test.ts` | `scripts/hooks/quality-gate.js` PostToolUse gate |
| `scripts/guards/config-guard.sh` | no protected check-config changes without a recorded reason | `scripts/hooks/config-protection.js` PreToolUse block |
| `scripts/guards/no-bypass-guard.sh` | `core.hooksPath` still points at the tracked dir; hooks executable | `scripts/hooks/block-no-verify.js` PreToolUse block |

All three are reimplemented, not copied. ECC's versions are Node scripts
speaking Claude Code's `PreToolUse`/`PostToolUse` stdin JSON. This repo's
harness is OpenCode + DSH, where no such hook event exists. So each rule is
expressed as a **batch gate**: a deterministic shell script that runs inside
`npm run verify` and fails the slice. Same rule, same determinism, no harness
dependency, no runtime to keep alive.

That trade costs latency-of-detection — ECC blocks the edit, we block the
slice. It gains portability and a much smaller surface: three shell scripts
with no dependency graph, versus 53 Node scripts with a lib layer, a sidecar
metadata file, fingerprints, and a schema validator for the metadata.

## Why these three and not others

Each was picked because it enforces a rule this repo **already wrote down**
and had no mechanism to enforce:

1. **lib-sibling** — `docs/agents/code-structure.md` says "A new `lib/` module
   without a sibling `.test.ts` is an incomplete slice." That sentence was
   enforced by reviewer attention alone. On a long diff a reviewer misses one
   file, and the miss is invisible: the module imports, the build passes, and
   nothing ever says the module is untested. Four modules are currently exempt
   and each exemption carries a written reason in the script.

2. **config-guard** — this was the one place with *no reviewer at all*. `ocr`
   reviews code and treats config as `unsupported_ext`; steering-lint reviews
   prose. So `.oxlintrc.json`, the `verify` script, and `vitest.config.ts` were
   unguarded, and they are precisely the files where a failing gate can be
   turned green by editing the gate instead of fixing the code. The guard does
   not judge the change; it makes the change impossible to make *silently*.

3. **no-bypass** — this repo put real enforcement in `scripts/git-hooks/pre-push`
   via `core.hooksPath`. That is one flag from being skipped
   (`--no-verify`, `-c core.hooksPath=/dev/null`), and an agent that cannot make
   `verify` pass has an easier option than fixing the code. A hook an agent can
   bypass is a suggestion, not enforcement.

## The no-bypass guard's accepted exception (externally owned validation copies)

The guard's static job keeps **three** values apart instead of assuming one:
the repository's own config layer (the shared local scope), the effective
`core.hooksPath` after all layers, and the layer that supplies the effective
value. The repository's own layer must point at `scripts/git-hooks` in every
case — that is the original guarantee, and it is what makes the tracked hook
travel with the repository. A missing or rewired repository layer still fails.

A differing effective value is accepted only when **all** of these hold:

- the checkout is a linked worktree (`--git-dir` differs from
  `--git-common-dir`), and that common git dir resolves **outside** the
  checkout's top level;
- the effective value is supplied by the **worktree config layer**
  (`config.worktree`), not by any other layer;
- the effective value resolves to a path **inside that common git dir** (the
  owning tool's own storage area) and is not the checkout's tracked
  `scripts/git-hooks`; and
- the repository's own layer still points at `scripts/git-hooks`.

**Why this exception exists.** A pipeline that validates a slice makes a
disposable copy and deliberately isolates the hooks path inside storage it
owns, so the guard used to read the copy's own path and fail on every
validation run. The repository's own layer is what must stay wired; a linked
worktree whose common git dir is outside the checkout and whose worktree layer
supplies the isolated path is accepted because the tool that owns that
throwaway copy supplies that layer. Every acceptance prints one line naming the
effective value, the supplying layer, and the external ownership, so the
acceptance is visible in a log rather than silent.

The HISTORY job is unchanged in strength: an accepted copy is never a licence
to skip the gate. A bypass recorded in the reflog or the recorded push history
still fails the guard, and when the copy is externally owned the history job
resolves the tracked `scripts/git-hooks/pre-push` in the checkout (git's own
resolution points into the owning tool's storage area, where no such hook
exists).

**Verified behaviour (commands run, results observed):**

```bash
# The guard's own worktree:
npm run guards
#   -> GUARDS: PASS — all deterministic rules hold.

# A simulated externally owned validation copy:
#   git init --bare <tmp>.git; git push <tmp>.git HEAD:refs/heads/master
#   git -C <tmp>.git config core.hooksPath scripts/git-hooks
#   git -C <tmp>.git config extensions.worktreeConfig true
#   git -C <tmp>.git worktree add <tmp>/copy master
#   git -C <tmp>/copy config --worktree core.hooksPath <tmp>.git/hooks
#   (cd <tmp>/copy && bash scripts/guards/no-bypass-guard.sh)
#   -> exit 0 and the single line:
#      ACCEPT: effective core.hooksPath '<tmp>.git/hooks' is supplied by the
#      worktree config layer ... this copy is externally owned.

# The focused test, which builds temporary repositories rather than mocking git:
npx vitest run scripts/guards/no-bypass-guard.test.mjs
#   -> 24 passed: externally owned copy accepted with the printed line; rewired
#      repository layer fails; non-worktree override fails; missing hook fails;
#      non-executable hook fails; recorded bypass (push log, reflog, and
#      wrapper-recorded commands) fails; git's own reflog prose (commit
#      subjects, branch names, refs, URLs) stays informational; ordinary
#      checkout unchanged.
```

**A pipeline validation copy is expected to pass with the printed acceptance
line.**

## What was refused, and why

| ECC component | Refused because |
|---|---|
| 292 skills, 68 agents | Competing spine. Context tax against a 98k window. |
| Instinct system (continuous-learning v1/v2) | Interesting, but it *generalizes* from sessions. Our `task-state.md` ledger already records events; generalizing them is a human judgement call this project should make deliberately, not a daemon. Revisit only if the ledger stops being readable. |
| 53 hook scripts | 3 of them carry rules we had written down. The rest automate things (`auto-tmux-dev`, `desktop-notify`, `cost-tracker`, `suggest-compact`) that this repo either does not want or already handles in `docs/agents/`. |
| AgentShield | Audits agent permission/injection surfaces. Real value, wrong time: single-user local repo. Becomes relevant the first day a second human writes to `AGENTS.md`. |
| MCP catalog (7 servers) | ECC's own docs warn the catalog can cut a 200k window to ~70k. We have 98k. |
| `hooks.metadata.json` + fingerprint validator | Machinery to keep *their* hook graph honest. We have no hook graph. Would be infrastructure for infrastructure's sake. |

## Adding a fourth guard

A guard earns its place only if all four are true:

1. It enforces a rule that is **already written down** in this repo. A guard
   with no backing doc is a rule nobody agreed to.
2. It is **deterministic** — finds a violation or does not, no model involved.
3. It **cannot** be satisfied by editing itself without that edit showing up as
   a diff a human reads.
4. It fits in a shell script under ~120 lines with no dependencies.

If it needs a model to decide, it is not a guard — it is the reviewer's job.
Write the rule into `docs/agents/code-structure.md` first, then the guard.

Run the suite: `npm run guards` (also part of `npm run verify`).
