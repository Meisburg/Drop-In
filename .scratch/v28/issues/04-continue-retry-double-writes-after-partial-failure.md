# Issue 04 — a Continue retry after a partial failure double-writes the rows that already landed

**Found by:** slice 3's reviewer lane (reported as N3, "residual, pre-existing, note only").
**Where:** `src/pages/OnboardingPage.tsx:705-712` (the Continue loop's fail-and-break).
**Status:** OPEN — filed, not fixed, and deliberately not in slice 3's fix round.

## The defect

`handleKidsContinue` writes the filled rows through `addKid` in a loop. On a failure it records the
error and **breaks**, leaving any rows it already wrote with `kid: null` in local state. A parent who
then taps Continue again sees those rows still "pending" and **writes them a second time** — duplicate
kids, from one failed attempt plus one retry.

## Why it is not in slice 3's fix round

It **pre-dates slice 3** and is independent of the photo path: the loop's bookkeeping is what is wrong,
not the photo confirm's. Slice 3's fix round is already carrying six findings, two of them blocking and
one a data-shape refactor. **Adding a seventh, in a different code path, would make that round harder to
verify than the defect is to live with.** The reviewer recorded it so it would not be rediscovered, which
is the right call.

## Why it still matters

It is the **same family** as the two blocking findings slice 3's lanes did catch: local state that no
longer matches what was persisted, and a silent duplicate write as the consequence. The slice-3 fix
round's row-identity work makes the *photo* path immune; this loop is the remaining path that can still
double-write.

## What a fix needs

The loop must record the `kid` it just wrote **even when a later row throws**, so a retry skips it —
i.e. the same "attach the persisted id" discipline the photo path is being refactored to use, applied to
the failure branch. Verify with a spec that fails one row and retries.
