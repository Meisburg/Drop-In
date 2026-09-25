# 05: Sweep production of automated-test records and wire it into the release runbook

**What to build:** Ticket 04 makes the marker convention enforceable in the repo.
This ticket is the operational half: actually clear the automated-test records
that are in production today, prove they are gone, and make the sweep a named,
repeatable release step rather than a procedure someone remembers.

The sweep must act only on the documented marker convention, must print exactly
which records it removed, and must fail loudly. The existing deletion path
already refuses when a founder or moderator account falls inside the marker set
— keep that refusal and its safety gate. What it lacks is reporting and a
post-delete proof: run it, read the count, delete, then re-read and confirm the
marker count is zero and the totals moved by exactly the amount the removal
report claimed. A mismatch is a failure, not a rounding note.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Production discovery shows no drop-ins titled with the project's test
      marker convention.
- [ ] The sweep reports the exact records it removed, and the pre-delete safety
      gate still refuses when a founder or moderator account falls inside the
      marker set.
- [ ] The sweep verifies its own result: the marker count reads zero after
      deletion, and a mismatch between the claimed and observed totals fails the
      sweep.
- [ ] A failed sweep is a release-blocking operational failure.
- [ ] No real parent content is deleted: the criteria are the documented marker
      convention, never a broad match.
- [ ] The release runbook names the sweep as a required step with its exact
      command, and is the document a releaser would actually follow.
- [ ] `npm run verify` still passes (the live sweep is not part of the local
      gate — the deterministic half lives in ticket 04).
