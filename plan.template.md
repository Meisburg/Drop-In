# Implementation Plan: <project/feature name>

> Owned by the orchestrator. Written BEFORE any builder dispatch. Every slice
> below must be executable without interpretation. If a slice cannot state its
> acceptance criteria and verification command, it is not ready — dispatch the
> explorer first.
>
> The default slice gate is `npm run verify` (build + test + lint). Pin anything
> extra (targeted e2e, a live check) explicitly in the slice.

## Goal

<One paragraph: what exists after this plan is done, and how we'll know.>

## Non-goals

- <Explicitly out of scope, so builders and reviewers can enforce boundaries.>

## Interfaces

<The contracts slices must respect: key function signatures, file locations,
config shapes, data formats. The orchestrator pins these here so builders
don't re-decide them.>

## Slices

### Slice 1: <name>

- **Objective:** <one clear outcome>
- **Files in scope:** <exact paths>
- **Approach:** <short; the orchestrator decides this, not the builder>
- **Acceptance criteria:**
  - <checkable statement, e.g. "POST /api/limit returns 429 after 5 req/min per key">
- **Verification command:** `<exact command, run from repo root>`
- **Budget:** one local builder context (~98k tokens, `qwen3.8-27b`). If the
  slice cannot plausibly finish inside that, split it — a slice that overruns
  hits the dumb zone, and the second half drifts from the first.
- **Depends on:** <slice numbers or "nothing">

### Slice 2: <name>

<same fields>

## Risks / open questions

- <Things needing a human decision before the slice can run. Empty = go.>

---

## Status log (orchestrator appends after every phase transition)

- <date> — <event, evidence pointer, next action>