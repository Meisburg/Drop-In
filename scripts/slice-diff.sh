#!/usr/bin/env bash
# slice-diff.sh — inspect a slice's diff against the base the slice was DISPATCHED
# from, chosen by the ledger rather than by memory.
#
# WHY THIS EXISTS. The orchestrator once diffed slice 2 against `e252f01`, which
# is slice 1b's PARENT rather than its tip, then attributed 1b's comment edit to
# slice 2 and wrote a false rule into the ledger. Both SHAs were legitimate
# ancestors, so an ancestry check would NOT have caught it -- the failure was
# CHOOSING the base. So this tool does not take a freely-typed base. It takes a
# slice name and reads the base from the ledger's `dispatched (base <sha>)` line,
# which is written at dispatch time and therefore records what was true then.
# It REFUSES rather than guessing when the ledger records no base for the slice,
# and it REFUSES rather than choosing when the ledger records more than one.
#
# USAGE
#   scripts/slice-diff.sh <slice-id> [-- <path>...]
#
#   <slice-id>    the token after `Slice ` in the ledger, e.g. 6c, 8a, 8b.
#   -- <path>...  optional pathspecs; the diff is restricted to them.
#
# It prints the resolved range (`<base>..<tip>`) in its header, so a wrong base is
# visible instead of silent.
#
# Exit: 0 = diff printed, 1 = no base recorded (or ambiguous), 2 = usage, 3 = base
#       does not resolve to a commit in this repository.

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

LEDGER="${SLICE_DIFF_LEDGER:-.scratch/v28/ledger.md}"

usage() {
  sed -n '/^# USAGE$/,/^# Exit:/p' "$0" | sed 's/^# \{0,1\}//'
}

if [ -z "${1:-}" ]; then
  echo "slice-diff: missing <slice-id>"
  usage
  exit 2
fi
slice="$1"
shift

# The slice id is embedded in an extended regex, so refuse anything that could
# rewrite the pattern rather than quoting it into a different question.
case "$slice" in
  *[!0-9A-Za-z._-]* | '')
    echo "slice-diff: refusing slice id '$slice' — ids are alphanumerics plus . _ - only"
    exit 2
    ;;
esac

if [ ! -f "$LEDGER" ]; then
  echo "slice-diff: REFUSING — no ledger at $LEDGER, so there is no recorded base to read."
  exit 1
fi

# Dispatch lines for THIS slice: a line naming `Slice <id>` as a whole token that
# also carries the word `dispatched`. The token boundary stops id `1` from
# matching `1b`; the dispatch filter keeps fix-round and status lines out.
mapfile -t dispatch_lines < <(
  grep -nE "^[^|]*Slice[[:space:]]+${slice}([^0-9A-Za-z]|$)" "$LEDGER" 2>/dev/null \
    | grep -iE "dispatch" || true
)

bases=()
if [ "${#dispatch_lines[@]}" -gt 0 ]; then
  # Every `base <sha>` on every dispatch line for the slice. Extract with a
  # literal needle rather than a shell-mangled pattern.
  mapfile -t bases < <(
    printf '%s\n' "${dispatch_lines[@]}" \
      | grep -oiE "\(base[[:space:]]+[\`\"']?[0-9a-f]{7,40}" \
      | grep -oE "[0-9a-f]{7,40}" \
      | sort -u || true
  )
fi

if [ "${#bases[@]}" -eq 0 ]; then
  echo "slice-diff: REFUSING — the ledger records no \`dispatched (base <sha>)\` line for slice '$slice'."
  echo "  A diff needs a base that was written down when the slice started; this tool will not invent one."
  if [ "${#dispatch_lines[@]}" -gt 0 ]; then
    echo "  dispatch line(s) found for this slice, none naming a base:"
    printf '    %s\n' "${dispatch_lines[@]}"
  fi
  exit 1
fi

if [ "${#bases[@]}" -gt 1 ]; then
  # ponytail: no round selector — an ambiguous ledger REFUSES rather than picking,
  # because picking is the failure this tool exists to prevent. Add a round
  # argument when a slice's fix rounds genuinely need separate diffs.
  echo "slice-diff: REFUSING — the ledger records ${#bases[@]} different bases for slice '$slice' (${bases[*]})."
  echo "  Choosing one would be a guess; name the round in the ledger or diff by hand."
  exit 1
fi

base="${bases[0]}"
tip="$(git rev-parse HEAD)"

if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "slice-diff: the ledger's base '$base' for slice '$slice' is not a commit in this repository."
  exit 3
fi

echo "slice-diff: slice '$slice'  range '${base}..${tip}'"
echo "            base '${base}' read from ${LEDGER} (dispatch time, not typed now)"
echo "==========================================================="

if [ "$#" -gt 0 ]; then
  echo "(diff restricted to: $*)"
  echo
  git --no-pager diff "${base}..${tip}" -- "$@"
else
  git --no-pager diff "${base}..${tip}"
fi
