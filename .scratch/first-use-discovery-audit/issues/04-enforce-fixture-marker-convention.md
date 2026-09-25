# 04: Make the test-fixture marker convention enforceable

**What to build:** The production discovery feed showed a pre-existing event
plainly labelled as automated-test data, so a real parent could read it as either
a real invitation or a sign the product is not ready. The leak is structural:
`playwright.config.ts` runs specs against the **live** Supabase project, and
cleanup depends on every spec remembering to remove what it created.

Two gaps in the current cleanup make "remembering" the only guarantee. The sweep
deletes `e2e-%` accounts and the rows those accounts own — but a fixture row
created by, or owned by, an account outside that marker set is invisible to it.
And nothing checks the sweep's own shape, so a spec can introduce a new fixture
convention that the sweep silently does not cover.

Close both gaps with **deterministic, credential-free** checks that run in the
normal gate. This ticket deliberately does not touch the live database: a guard
that needs live credentials to pass is a guard that gets skipped, which is the
failure mode being fixed.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The project's test-marker convention is documented in exactly one place,
      with both halves stated: how a fixture account is named, and how a fixture
      record is titled.
- [ ] A deterministic guard fails when a spec can leave a fixture behind —
      specifically, when a spec creates fixture data that the documented marker
      convention and the sweep's scope do not cover, or when a spec manipulates
      drop-in rows it did not itself create.
- [ ] The guard runs without live Supabase credentials, so it cannot be skipped
      for lack of access.
- [ ] Every fixture-producing spec reports what it removed, and the run surfaces
      that report.
- [ ] A failed cleanup is surfaced as a release-blocking operational failure, not
      silently ignored.
- [ ] The public-link and end-to-end specs retain isolated fixture setup and
      cleanup.
- [ ] `npm run verify` passes with the new guard wired into it.
