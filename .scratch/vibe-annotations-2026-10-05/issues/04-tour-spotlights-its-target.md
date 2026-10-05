# 04: The first-run tour spotlights the control it teaches

**What to build:** During the first-run tour, the ringed control renders at full
brightness while the rest of the screen stays dimmed. A tap still passes through
the tour, and dismissal still works exactly as it does today.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** annotation 2 in `source-annotations.json` — the icon inside the ring is dimmed.

- [ ] The veil's cutout rectangle equals the ring's rectangle at every tour step,
      asserted in the browser rather than in CSS unit tests.
- [ ] Everything outside the cutout remains dimmed, so the screen still reads as
      a tour rather than a broken page.
- [ ] The cutout is derived from the ring's own rectangle — no second geometry
      computation, and no new module.
- [ ] Pass-through, Escape, Skip, and the once-per-tab dismissal facts are
      unchanged, and their existing assertions still pass.
- [ ] The veil stays hidden from assistive technology.
- [ ] `npm run verify` exits 0.
