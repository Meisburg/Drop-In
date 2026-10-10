# Groups — deferred to v2+

> ## ⚠️ GROUPS v1 IS NOT BUILT — this is a pre-build cut list, not a post-ship record
>
> Verified 2026-10-09: there is **no `groups` table in any migration**, no group
> e2e spec, and no group work in git history. What exists is the *design* —
> ADR `0005` (the decisions and why) and `docs/specs/groups-v1.md` (6 slices,
> G1–G6, unstarted).
>
> **So every "revisit when" below is conditional on work that has not begun.**
> Nothing here was cut from a shipped feature; these are things cut from a
> *plan*. Do not read this file as evidence groups exist.
>
> **Audited 2026-10-09:** all seven reasons below still hold, and the two privacy
> specs item 6 cites (`e2e/kid-names-privacy.e2e.ts`,
> `e2e/kid-photo-exposure.e2e.ts`) both exist on disk. One wording fix: item 4
> says invite provenance is "already recorded on `group_members`" — that table
> does not exist yet, so read it as "will be recorded."

Parked 2026-10-07 from the groups design session. Each item records **what** it
is and **why it was cut**, so a future reader does not relitigate it from
scratch. Ordered by the founder's own priority, roughly.

The v1 decision is ADR `0005-groups-are-private-and-own-their-drop-ins.md`.
Read that first.

## 1. Open and request-to-join groups

**What:** a group the admin can make discoverable, with anyone able to request
membership and the admin approving or denying.

**Why cut:** it is the other half of a 2x2 (discoverable / not, invite-only /
request-to-join) which, combined with drop-in visibility, is eight states each
needing its own UI, tests and moderation rules. That is a permissions engine, not
a v1.

**Revisit when:** private groups are in use and someone asks for an open one by
name — not before.

## 2. Public directory of groups

**What:** browsable list of discoverable groups a parent can find and request to
join.

**Why cut:** it directly contradicts the trust model the feature exists to
provide. The founder spent the design session worrying about who can be trusted
in a group; a public directory of them makes groups stranger, not safer.

**Revisit when:** item 1 exists. A directory of *private* groups should never
ship.

## 3. Membership criteria / application form

**What:** admin-configured criteria (member of this preschool, lives in this
area) and an application form a requester fills in to justify joining.

**Why cut:** Facebook-group bureaucracy. Nobody joins a new app to fill out
paperwork, and the free-text application becomes a moderation queue the admin did
not ask to run. The invite chain already answers "can this person be trusted."

**Revisit when:** item 1 exists and admins are actually requesting it.

## 4. "Drop-ins attended" as an admin-facing trust signal

**What:** show a requester's drop-in history so an admin can judge whether they
are safe.

**Why cut:** a count invites gaming (post-and-no-show inflates it), and the
founder was explicit that he does not want parents reviewing other parents. The
honest signal is *who invited them* — already recorded on `group_members`.

**Revisit when:** never as a review surface. If a trust signal is needed later,
derive it from invite provenance, not attendance counts.

## 5. Full group chat

**What:** threads, per-message read state, mute, reactions, media in the group
thread.

**Why cut:** a second messaging product with its own state model and moderation.
v1 ships **one thread per group** on the existing `messages` infrastructure,
which is enough to coordinate a meetup — the group's actual purpose.

**Revisit when:** the single thread is measurably too coarse (members asking for
sub-threads or mute).

## 6. Group chat media

**What:** photos and attachments in the group thread.

**Why cut:** inherits the kid-photo privacy rules, which are the most sensitive
surface in the app (`e2e/kid-names-privacy.e2e.ts`, `kid-photo-exposure`). Do not
bolt media onto a new surface without the privacy review that path demands.

**Revisit when:** item 5 ships and the privacy review is scheduled as its own
slice.

## 7. A drop-in in more than one group

**What:** publishing one drop-in to two groups, or to a group and the public feed.

**Why cut:** needs a join table, per-destination visibility and feed fan-out. v1
enforces one destination per drop-in.

**Revisit when:** someone posts the same drop-in twice by hand and complains.
