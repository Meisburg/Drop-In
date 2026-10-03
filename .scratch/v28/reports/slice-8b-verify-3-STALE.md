# Slice 8b — round-3 verification, ABORTED as superseded (orchestrator record)

**This is not a verdict.** The lane never finished. It is preserved because it produced one measurement
worth keeping and because a killed lane otherwise disappears without trace.

**Run:** `4ae3a721-20a2-481a-bc9d-3b050c74f958` (single, `orchestrator-verifier`, deepseek-v4.1-flash:cloud).
**Aborted:** 2026-10-02, after 15 minutes with no activity and a `bash` call 19 minutes old, at ~91k tokens.
**Cause, measured:** the lane's last command was an **unterminated heredoc** —
`bash: cat > /tmp/v3/derive.mjs <<'EOF' // Re-derive a baseline …` — with no closing `EOF`, so bash blocked
on stdin indefinitely. **Not a model stall; a shell that was never going to return.**

**Superseded:** round 3 closed when its review landed; round 4's verification lane was already running against
the round-4 fix (`7c16e7a`) when this was aborted. Nothing in the round-4 result set depends on this lane.

## The one measurement worth keeping

It reproduced the partial-loss state from a **stale-key probe**:

    7:  note — no-bare-head-count: 671 of the 674 recorded occurrence(s) matched this scan (LOST COVERAGE 3)
    12:PASS — the registry can be trusted and no work item claims evidence it does not have.

**Read correctly, this is a confirmation, not a defect:** the probe deliberately made 3 recorded keys stale, the
run printed `LOST COVERAGE 3` naming the count, and **the exit code did not move — which is exactly the
disposition declared in the report** ("a partial loss prints `LOST COVERAGE N` and does not gate, with the
reason"). The lane's own notes call that disposition "honest as declared".

Its raw log is the sibling file, copied verbatim: `slice-8b-verify-3-STALE-partial.log`.
