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
5. **A fixture's action never NOTIFIES a real parent** — and this one is not the
   spec's job, because a spec cannot un-send an email. It is enforced in the
   database: every notification producer drops a fixture's action. See
   "Side effects the sweep cannot undo" below.

## Side effects the sweep cannot undo

Markers make a fixture **removable**. They do not make it **harmless** — and a
notification is the one side effect removal cannot fix: the sweep deletes the
`notification_log` row with the account, but the email has already left.

This was found the hard way on **2026-09-30**: the founder's inbox held **21**
`followed_new_dropin` emails in two days, every one of them a fixture post at
`Green Lake Park` — a place he follows, and the place three specs hardcode
(`e2e/post-location.e2e.ts:85`, `e2e/places.e2e.ts:101`,
`e2e/post-fast.e2e.ts:101`). `playwright.config.ts` drives the **live** project,
so each fixture insert fanned out a real notification to a real parent, and the
five-minute `send-push` cron drained it to his inbox because he has no push
device registered.

**The rule.** A fixture action produces no notification. It is enforced by
`public.is_e2e_profile(uuid)` (migration `0060`), called by **every** producer
that can reach a real parent:

| Producer | The column that carries the marker |
| --- | --- |
| `notify_ping_received` | `new.profile_id` — the pinger |
| `notify_new_comment` | `new.author_profile_id` — the commenter |
| `notify_new_message` | `new.sender_id` — the sender |
| `notify_playdate_cancelled` | the post's host |
| `notify_followed_new_dropin` | the post's host |

The marker checked is the **account** marker (`email like 'e2e-%'`) — the
convention's primary handle, the same expression `scripts/lib/sweep-e2e.mjs`
scopes its delete to. A fixture that posts from an account *outside* the prefix
is already a violation of rule 1, so this guard and the sweep draw the same
boundary.

**It fails OPEN.** An unreadable `auth.users` (or a NULL actor) means "not a
fixture" and the notification is sent — the same ruling `emailFallback` makes
for an unreadable `email_optout`. A guard that failed closed on a read error
would switch off **every** parent's alerts at once, which is worse than the
noise it exists to stop.

**Every producer, not just the one that fired.** The same log already held a
fixture `ping_received` on a **real** post (2026-09-24) and a fixture
`cancelled` (2026-09-20). Fixing one door would have left four open.

**Proof, not assertion.** `0060`'s read-back asserts the predicate both ways
(a real `e2e-%` account is recognised, a real account is not), and
`.scratch/v28/probe-0060-live.sql` proves the trigger behaviour against the live
database inside a transaction that is always rolled back: a fixture post at a
followed place produces **0** notifications, a real-host control at the same
place still produces **1**, and a fixture ping on a real post produces **0**.

## What the guard does NOT cover

- **Rows already in production.** Those are the sweep's job
  (`scripts/sweep-e2e-markers.mjs`), not the repo's. The guard exists so no NEW
  leak of this class can ship.
- **Realism of the marker itself.** A fixture titled `e2e local lot` is still
  visible copy in the feed; the marker makes it *identifiable*, not *invisible*.
  The rule the audit asks for is identifiability plus removal, not disguise.
- **Live coverage.** The guard never contacts Supabase, by design: a check that
  needs credentials to pass is a check that gets skipped.
- **Repo-vs-production drift.** Nothing here can see that a producer exists live
  and not in the repo — which is exactly how the `followed_new_dropin` producer
  ran for days with no migration committed for it (`0060` recovered it). The
  notification guard's own tripwire is textual, inside `0060`'s read-back, so it
  fires on a re-paste and not on a production change. Closing this class properly
  needs a live drift check, which is a new lane and a deliberate decision.

## Changing the convention

Changing it is a deliberate act and needs both halves in one commit:

1. the specs that create fixtures,
2. `scripts/sweep-e2e-markers.mjs`,
3. `scripts/guards/fixture-marker-guard.mjs`,
4. this document, and
5. **`supabase/migrations/0060_…sql`** if the change touches the notification
   guard: its read-back and the five producers' guard clauses are what make rule
   5 true, and a convention change that silently weakens them would be invisible
   here.

The guard fails if the sweep and this document disagree, so a one-sided change
cannot land quietly.
