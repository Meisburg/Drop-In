SENTINEL: V33-12-AVATAR-BESIDE-NAME-Q4N8

**Slice v33-12 — a face immediately left of the person's name (inbox).**

⚠️ **YOUR OWN WORKTREE — unique path:**
```bash
cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/inbox-avatar-q4n8 -b inbox-avatar-q4n8 HEAD
cd /tmp/pd-wt/inbox-avatar-q4n8 && npm install --silent 2>/dev/null || true
```
Everything runs in `/tmp/pd-wt/inbox-avatar-q4n8`; commit on branch
`inbox-avatar-q4n8`; **never touch the main worktree or another lane's path**;
never push. **You are the LOCAL lane — one slice, and this is it.**

## The ruling (the founder corrected an earlier reading of mine)

> *"when you see the name of a person that you're messaging, you should see their
> profile picture in like a circle to the left of their name, which is what typical
> messaging apps do."*

So: **a profile-picture circle immediately left of the name**, wherever a person's
name is the entity you are messaging — the **thread header**, the **composer's
recipient**, and the DM **list rows**, matching the avatar treatment already used in
the DM list.

**Explicitly NOT:** a per-message bubble avatar (the app deliberately writes the
counterpart down once in the header), and NOT a standalone chip. The founder's
original annotation (`muyc3jnt`) asked for a circle to the left of the message — that
reading is superseded by the correction above.

⚠️ **The other half of the original pair (`muyc5kwv`, the last-active line) was
REJECTED by the founder** — the app refuses to claim presence. **Do not add a
last-active or "active today" line anywhere.** It already renders on the inbox row;
leave it exactly as it is.

## The work

In `src/pages/InboxPage.tsx` (thread header + composer recipient) — and the DM list
row if it is not already right:
1. Render the person's **avatar immediately left of their name**, reusing the app's
   **existing avatar primitive** (the one the inbox row already uses — do not write
   a second one, and **do not edit that primitive**: if you think it needs a change,
   report BLOCKED and say why).
2. Handle the no-photo case with that primitive's own placeholder (initial), never a
   broken image.
3. Nothing else in the thread changes: the header's copy, the bubbles, the composer,
   the send path.

**Read only:** `src/pages/InboxPage.tsx`, the avatar primitive, and
`e2e/inbox.e2e.ts` / `e2e/inbox-bubbles.e2e.ts` / `e2e/inbox-thread-geometry.e2e.ts`.
Edit first, verify after — the local window is ~98k.

## Acceptance

1. In a thread, the counterpart's avatar renders **left of their name** in the
   header — asserted by **geometry** (the avatar's box is left of, and vertically
   aligned with, the name's box), not by DOM order.
2. The composer region shows the recipient's face beside their name the same way.
3. A person with no photo renders the placeholder initial, not a broken image (its
   own assertion).
4. **No last-active/presence line is added anywhere** — assert its count is
   unchanged from today.
5. No per-bubble avatar is introduced — assert the bubble rows are unchanged (their
   existing specs pass untouched).

## Gate

```bash
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards     # GUARDS: PASS
```
Expected red: `steering-lint` naming another lane's `docs/agents/*` only. Then the
inbox specs on a **private port 4210–4218** (mint the marker there; kill by
port/PID, never `pkill -f`). Stage **by path only**. Report to
`.scratch/v33-12-report.md`; reply:

```
Sentinel: V33-12-AVATAR-BESIDE-NAME-Q4N8
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-12-report.md
```
