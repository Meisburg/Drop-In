#!/usr/bin/env bash
# Point this repo at its TRACKED git hooks directory.
#
# WHY core.hooksPath AND NOT .git/hooks/: `.git/hooks/` is not
# version-controlled. A hook copied there is invisible to every clone and is
# lost if `.git/` is ever recreated — so the enforcement silently reverts to
# "trust the agent", which is the exact failure the hook exists to prevent.
#
# With `core.hooksPath = scripts/git-hooks`, the hook BODY is tracked in git and
# travels with every clone. This script only has to set one config value; there
# is no copy step and nothing to keep in sync.
#
# Run once per clone:  bash scripts/install-git-hooks.sh
# (or: git config core.hooksPath scripts/git-hooks)
#
# To bypass the gate temporarily:  FAST_PUSH=1 git push origin master
# (skips the build/test/lint gate; the clean-range check ALWAYS runs)

set -euo pipefail
REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"

HOOKS_DIR="scripts/git-hooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "FATAL: $HOOKS_DIR not found — is this the repo root?" >&2
  exit 1
fi

# The hook must be executable IN THE WORKING TREE (git tracks the mode bit).
if [ ! -x "$HOOKS_DIR/pre-push" ]; then
  chmod +x "$HOOKS_DIR/pre-push"
  echo "fixed: made $HOOKS_DIR/pre-push executable"
fi

git config core.hooksPath "$HOOKS_DIR"
echo "set: core.hooksPath = $HOOKS_DIR"

# Prove it: git must resolve the hook, and it must be runnable.
echo
echo "Verifying:"
RESOLVED="$(git rev-parse --git-path hooks/pre-push)"
if [ -f "$RESOLVED" ]; then
  echo "  OK  git resolves pre-push -> $RESOLVED"
else
  echo "  FAIL git cannot resolve pre-push (looked at $RESOLVED)" >&2
  exit 1
fi

if [ -x "$RESOLVED" ]; then
  echo "  OK  pre-push is executable"
else
  echo "  FAIL pre-push is not executable" >&2
  exit 1
fi

echo
echo "Done. Pushes to master are now gated by the tracked hook."
