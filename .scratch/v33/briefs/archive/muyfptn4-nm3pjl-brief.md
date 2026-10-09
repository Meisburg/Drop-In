SENTINEL: MUYFPTN4-USER-ADDED-PLACES-STATUS-Q7M2

**Slice `muyfptn4-nm3pjl` — DETERMINE whether user-addable places already exist; do not
build the whole feature.**

Repo: `~/Projects/playdate-app`. Base: HEAD. **Do not push.**

📌 **THIS IS A SCOPE-DETERMINATION SLICE, NOT A BUILD.** The founder asked for a large
feature (users add their own places, with photos and details, plus editing existing
places, plus moderation). That is multiple slices. **Your job is to find out what
already exists and report what does not.** You may make ONE small, self-contained fix
if you find a clear defect — but do not attempt the feature.

Work in YOUR OWN worktree — this is the only slice you will run:

```bash
git worktree add /tmp/pd-wt/muyfptn4-nm3pjl -b muyfptn4-nm3pjl HEAD
cd /tmp/pd-wt/muyfptn4-nm3pjl && npm install --silent 2>/dev/null || true
```

📌 **WORK ECONOMICALLY.** Read only what this brief names; a fresh session's window is
~98k tokens and it goes fast. **Edit first, verify after** — and this slice expects
possibly no edits at all.

---

## 1 — The annotation, verbatim

> *"You know what this is missing is the ability to add a place because however we added
> all these places, it's not all encompassing of like all the places that could be here.
> So users should be able to add their own place to the list and give them the tools they
> need to add a photo and add the information they need. I think they'd be really useful.
> I think the users moderate the site as much as possible that we can. And then on that
> same note, all the places need to be, you need to be able to edit"*
> — `muyfptn4-nm3pjl`, page `/browse`, element `src/App.tsx:605:9`

**Locate by content, never by line number.** The line number is a snapshot.

---

## 2 — The question to answer (this IS the deliverable)

Answer these six, each with **evidence you read yourself** (file:line, or the raw
command output). Do not infer from names — open the file and read it.

1. **Is there any path for a user to CREATE a place?** Look for: an "add a place" or
   "+" affordance on `/browse` or `/places`, a create-place form, a route like
   `/place/new`, a server write to a `places` table from the client, an RLS policy that
   permits INSERT for a signed-in user. Say where you looked and what you found.
2. **Is there a photo upload for a place?** (A place-creation flow may reuse the
   existing photo upload used for posts — say whether it is reachable from a
   place-create path.)
3. **Can a user EDIT an existing place?** Look for an edit affordance on the place page
   or the directory, an edit form, an UPDATE path.
4. **Is there any moderation surface** for places (approve/reject/flag), or any notion of
   a place being pending/verified/unverified?
5. **What DOES exist that is adjacent?** e.g. `place-photo-admin` (an admin path for
   photos), `PlaceDirectory`, the place detail page. Name them with file:line — this is
   what a future slice would build on.
6. **What is the smallest real slice** that would move toward what he asked? One
   sentence, with the file it would touch. Do NOT implement it.

---

## 3 — What NOT to do

- **Do NOT build the feature.** It is several slices.
- **Do NOT write new unit or integration tests.** If you make a fix, the existing spec
  covering that file is the check.
- **Do NOT edit** `AGENTS.md`, `CONTEXT.md`, `docs/RELEASE-CHECKLIST.md`,
  `vite.config.ts` — the orchestrator owns those.
- **Do NOT touch another lane's worktree.** Stage by path only; never `git add -A`.

---

## 4 — Verification

```bash
npm run typecheck
npm run guards        # expect: GUARDS: PASS, exit 0
```

**Do NOT run the full suite.** If and only if you changed a file with an existing spec,
run that one spec. Quote raw output.

---

## 5 — Report and reply

Report to **`.scratch/muyfptn4-nm3pjl-report.md`**: the six answers, each with the
file:line or command output you read. If nothing exists, say so plainly — an empty
finding is the correct and useful answer here.

Reply with only:

```
Sentinel: MUYFPTN4-USER-ADDED-PLACES-STATUS-Q7M2
Status: DONE | BLOCKED
Commit: <sha7 or NONE>
Report: .scratch/muyfptn4-nm3pjl-report.md
```

`Commit: NONE` is a valid and expected answer if your finding is "none of this exists
yet." Commit only if you made a code change.
