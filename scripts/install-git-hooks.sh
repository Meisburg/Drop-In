#!/usr/bin/env bash
# Install this repo's git hooks from scripts/ into .git/hooks/.
#
# WHY A SCRIPT AND NOT COMMITTED HOOKS: .git/hooks/ is not version-controlled, so
# a hook that only lives there is invisible to every clone and lost on re-clone.
# The hook BODY is tracked in scripts/ (scripts/pre-push); this installs it.
#
# Run once per clone:  bash scripts/install-git-hooks.sh
#
# To bypass temporarily:  FAST_PUSH=1 git push origin master
# (skips the build/test/lint gate; the clean-range check always runs)

set -euo pipefail
REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"

HOOKS_DIR="$(git rev-parse --git-path hooks)"
mkdir -p "$HOOKS_DIR"

for hook in pre-push; do
  src="scripts/$hook"
  dst="$HOOKS_DIR/$hook"
  if [ ! -f "$src" ]; then
    echo "skip: $src not found"
    continue
  fi
  cp "$src" "$dst"
  chmod +x "$dst"
  echo "installed: $dst"
done

echo
echo "Verifying the hook is reachable:"
if [ -x "$HOOKS_DIR/pre-push" ]; then
  echo "  OK  $HOOKS_DIR/pre-push is executable"
else
  echo "  FAIL $HOOKS_DIR/pre-push is not executable" >&2
  exit 1
fi
