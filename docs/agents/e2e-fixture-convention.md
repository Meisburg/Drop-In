# E2E fixture marker convention

**Enforcer:** `scripts/guards/fixture-marker-guard.mjs` (runs inside
`npm run guards`, which runs inside `npm run verify`).
**Live remover:** `scripts/sweep-e2e-markers.mjs`.

## Why this exists

`playwright.config.ts` drives the **live** Supabase project. Every spec writes
real rows to the same database real parents read, so a fixture that no one
removes is not a test detail — it is content in the production discovery feed.
The first-use audit of 2026-09-25 found exactly that: a pre-existing drop-in
labelled as automated-test data, visible to a new parent.

Cleanup therefore cannot depend on every spec remembering. It depends on one
marker convention, enforced twice: deterministically in the repo (this document's
guard), and operationally against production (the sweep).

## The convention

Two markers, one per kind of thing a spec creates.

| Kind | Marker | Where it lives |
| --- | --- | --- |
| **Account** | `e2e-` prefix on the email address | `e2e-<epoch>@gmail.com`, `e2e-v-<epoch>-inbox@gmail.com`, `e2e-nsearch-ui-<tag>-<stamp>@gmail.com` |
| **Record** | `e2e ` (with a space) or `e2e-` prefix on the drop-in title | `` `e2e ${marker.displayName} guest lot` ``, `` `e2e-${epoch} ${marker.displayName} live lot` `` |

The account marker is the **primary** handle: the sweep deletes
`auth.users` rows matching `email like 'e2e-%'`, and the rows those accounts own
cascade with them. The title marker is the **straggler** handle — it is what lets
a human read the production feed and the sweep's report and tell a fixture from a
parent's post.

## ⚠️ Scoping is not safety — the 2026-10-03 incident

**A real parent lost a `going_pings` row to this sweep, and every marker-scoped
check passed while it happened.** The chain:

1. an `e2e-` account hosted a drop-in;
2. a **real** parent pinged it — their `profile_id` is not a marker, so
   `going_pings`' own clause never matched it and its marker count was a truthful
   **zero**;
3. the sweep deleted the marker-hosted drop-in;
4. `ON DELETE CASCADE` destroyed the real parent's ping with it.

**The lesson: deleting a marker PARENT can reach a non-marker CHILD.** Deleting
rows that match `e2e-%` is necessary and not sufficient. Seventeen `CASCADE` edges
reach the sweep's tables from a parent it deletes, and the two that can hit a real
parent *without the parent being a marker* are
`going_pings.playdate_id -> playdates` and `follows.* -> profiles`.

**The sweep now refuses when this would happen.** A read-only collateral probe runs
before any delete, and a single non-marker row behind a doomed parent aborts the
run (exit 5). It cannot be bypassed by a flag. Full write-up:
`.scratch/v28/reports/r3-1-incident.md`.

## ⚠️ A sweep is a snapshot of a stream

Measured: the 2026-10-03 sweep removed **1195** accounts, and roughly **40 more**
were created by e2e runs in the ~90 minutes after it. Cleanup by manual sweep
therefore means re-running a destructive production script before every release,
forever — while fixtures keep appearing in the real discovery feed between runs.

The durable fix is a **separate Supabase project or branch for e2e**, so the marker
set and real parents are never in the same database. Until that exists, the
collateral gate is what makes the sweep safe to run; it does not make it
unnecessary.

## Rules a spec must satisfy

1. **Every account it creates carries the account marker.** An account outside
   the prefix is outside the sweep's scope, so it and everything it owns survive
   forever. Build fixture addresses from the marker (`e2e-v-${epoch}-…@gmail.com`)
   rather than a realistic name.
2. **Every drop-in it posts carries the record marker in the title.** The title
   is what a parent reads; a realistic fixture title is indistinguishable from
   real content.
3. **Its REST `DELETE` is scoped to rows it owns** — a known owner/row column
   (`id`, `profile_id`, `host_profile_id`, `follower_profile_id`, `sender_id`,
   …), never a broad filter (`like`, `neq`, `in`, `gt`). The sweep's own gate
   refuses a founder account inside the marker set; nothing else catches a spec
   whose cleanup is broader than what it created.
4. **It leaves nothing it cannot name.** Anonymous signs that cannot be deleted
   must not be created.

## What the guard does NOT cover

- **Rows already in production.** Those are the sweep's job
  (`scripts/sweep-e2e-markers.mjs`), not the repo's. The guard exists so no NEW
  leak of this class can ship.
- **Realism of the marker itself.** A fixture titled `e2e local lot` is still
  visible copy in the feed; the marker makes it *identifiable*, not *invisible*.
  The rule the audit asks for is identifiability plus removal, not disguise.
- **Live coverage.** The guard never contacts Supabase, by design: a check that
  needs credentials to pass is a check that gets skipped.

## Changing the convention

Changing it is a deliberate act and needs both halves in one commit:

1. the specs that create fixtures,
2. `scripts/sweep-e2e-markers.mjs`,
3. `scripts/guards/fixture-marker-guard.mjs`, and
4. this document.

The guard fails if the sweep and this document disagree, so a one-sided change
cannot land quietly.
