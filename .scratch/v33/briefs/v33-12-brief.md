SENTINEL: V33-12-INBOX-AVATAR-LEFT-OF-NAME-Q7M2

Slice `muyc3jnt`. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/inbox-avatar-q7m2 -b inbox-avatar-q7m2 HEAD
Work only there; commit on branch inbox-avatar-q7m2; never touch main or another lane's path; never push.

📌 FRESH WORKTREE: a bare `git worktree add` has a 20K `node_modules` STUB and NO `.env`. Before anything:
  cp ~/Projects/playdate-app/.env .
  cp -r ~/Projects/playdate-app/e2e/.auth e2e/ 2>/dev/null
  rm -rf node_modules && npm install
Without `.env`, `npm run verify` fails with "Cannot find type definition file" and 18 files failing to load. This is not a code defect.

📌 WORK ECONOMICALLY. Read only the files and regions this brief names; **edit first, verify after**.

---

## 1 — The founder's annotation, verbatim

> *"I would like to see a little circle to the left of the message that represents the person I'm sending the message to."* — `muyc3jnt-d3tpgr`, `src/pages/InboxPage.tsx:338:9`

**FOUNDER RULING (V33 §10c, verbatim):** *"show the other person's profile photo in a circle to the LEFT of their name … the conventional messaging pattern — anywhere a person's name is the entity you are messaging (thread header, composer recipient, DM rows), matching the existing avatar treatment in the DM list."* **NOT** a per-bubble avatar. **NOT** a standalone chip.

---

## 2 — What ALREADY exists (read these, do not re-derive)

- **The inbox ROW already has the avatar** — `InboxPage.tsx:157`, a `<HostAvatar host={{id, display_name, avatar_url}} />` fed by `conversation.otherPartyAvatarUrl`. That row is DONE. Do not change it.
- **The one avatar primitive** is `HostAvatar` in `src/components/DropInCard.tsx:822`. **Reuse it. Do NOT edit it.** If you believe it must change, report BLOCKED with the reason.
- **The counterpart object already exists** in the thread view: `InboxPage.tsx:1195` derives `threadHeaderName = counterpart.name`, and `:1156-1157` build `{ name, avatarUrl }` from `conv`. **No new read is needed** — `otherPartyAvatarUrl` is already loaded.
- **The thread header** is `InboxPage.tsx:1370-1397`: a flex row of `BackControl` + either a `<Link>` (`:1373`, a playdate thread) or a plain `min-w-0` div (`:1393`, a DM). The **name is at `:1380` (link branch) and `:1394` (DM branch)**.
- The comment at `:1363-1369` says *"the avatar + handle this heading will eventually carry are slice C's, not this one's"* — **this IS slice C.**
- **The profile route is `/u/<display_name>`** — proven in V35-A (`ff158dd`). `getProfileByHandle` resolves by `profiles.display_name`. Reuse it; invent nothing.
- **The composer** is `InboxPage.tsx:1565` (`data-testid="composer"`), containing the textarea at `:1568`.

---

## 3 — What to build

**3a. The thread header (the primary surface).** Immediately LEFT of the name — in BOTH branches (`:1373` link, `:1393` DM) — render a small circular avatar via `HostAvatar`, vertically centred with the name. The name stays exactly where it is; the avatar precedes it. A no-photo counterpart renders the primitive's **initial placeholder** (never a broken image). A nameless profile ("Unknown") still renders — use the primitive's default, do not invent a second placeholder.

**3b. The composer recipient.** Where the composer names the person being messaged, put the same circle immediately left of that name. If the composer does NOT currently name the recipient, add the smallest honest label — the counterpart's name with the avatar left of it — above the textarea; reuse the existing text scale and tone. Do not build a new component; it is an avatar + a name.

**3c. Data testids.** `thread-header-avatar` (or the app's existing avatar-wrapper naming — match what V35-A used: a thin wrapper with its own testid around the untouched primitive). One testid per surface.

**3d. Geometry is the acceptance, not DOM order.** The avatar's box must be LEFT of and vertically aligned with the name box — assert with `boundingBox()` (`avatar.x < name.x`, `avatar.right <= name.x + 1`, centres within 6px), exactly as V35-A did. Mutation-prove it (`flex-row-reverse` must go red).

---

## 4 — What NOT to touch

- `src/components/DropInCard.tsx` — the `HostAvatar` primitive. 0 lines.
- The inbox ROW (`InboxPage.tsx:157`) — already correct.
- `AGENTS.md`, `CONTEXT.md`, `vite.config.ts`, `docs/agents/*` — the orchestrator's or another lane's.
- Another lane's worktree. **Stage by path only**; `git add -A`/`.` is forbidden.

## 5 — Do NOT write unit tests

Measured: agent-written unit tests restate the agent's own interpretation. If you change a file with an existing spec, run that spec. Otherwise typecheck + guards + a real browser check is the evidence.

## 6 — Verification (quote raw output)

```bash
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
npm run guards     # expect: GUARDS: PASS, exit 0
```
Only `steering-lint` may be red (this fresh worktree's five `docs/agents/*` pointers — another lane's).

Then prove it in the browser: open a thread (and a DM), confirm the avatar circle sits LEFT of the name, vertically aligned; a no-photo counterpart shows the initial. Private port **4210–4218** (mint the e2e marker on that origin; kill by port/PID, never `pkill -f`).

Report to `.scratch/v33-12-report.md` with the raw gate output and the geometry JSON. Reply with only:
```
Sentinel: V33-12-INBOX-AVATAR-LEFT-OF-NAME-Q7M2
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-12-report.md
```
