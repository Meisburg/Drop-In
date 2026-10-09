# CHECKPOINT — 2026-10-08, review annotations in

**For a FRESH session.** Everything here was measured; nothing depends on this
session's memory. Repo: `~/Projects/playdate-app`.

---

## 1 — Where things stand

| Item | Value |
|---|---|
| master | `37b06fa`, **0 modified**, 20 unpushed (by design — never push) |
| briefs queue | **empty** (all 7 stale ones archived) |
| annotations pending | **9** — Jon's review feedback (NEW, below) |
| workers running | **0** |
| dev server | :5173 up (Agentation toolbar lives ONLY here — DEV-only) |
| preview | :4173 up (production build, no toolbar) |
| annotation MCP | :4747 up |

## 2 — THE 9 REVIEW ANNOTATIONS (the actual work now)

Jon reviewed the app via Agentation on the DEV server (:5173) and left 9 notes.
Read them in full before acting: `curl -s http://localhost:4747/pending`.
Ids `mv0c*`. The themes:

- **Minimalism — "I don't wanna make the user think"** (stated twice, `mv0cc9ch`,
  `mv0cd7g2`): a DESIGN PRINCIPLE, not a ticket. Applies app-wide.
- **Host event options** (`mv0cnpkh`): wants the host controls to be the important
  set: Edit, Message attendees, Manage attendees, Share, Cancel.
- **Remove buttons** (`mv0cjnlq`, `mv0chug7`): two controls he says should go.
- **Group chat** (`mv0cii7t`): if you're in a group, the group chat should be an
  option alongside individual messages.
- **Create affordance** (`mv0ceczk`): is the create-a-drop-in control obvious
  enough, or does it need a "Host" label?
- **Feed clarity** (`mv0cg1d6`): is it clear this feed is "drop-ins near you that
  OTHERS are hosting"?
- **A fifth nav option — Groups** (`mv0cgy9a`): a Groups tab showing everything
  related to a group you're in.

⚠️ Several are DESIGN questions, not build slices — see the
`ui-annotation-feedback` skill's "When the notes are a DESIGN problem" section.
Group by CONCERN (probably ~4-5 concerns), not 9 tickets.

## 3 — Standing facts (unchanged)

- **STANDING GRANT**: decide + dispatch, report after. Ask only for a new data
  schema, a paid service, or anything destructive.
- **The factory is headless**: `~/fleet/bin/fleet-run <brief>` background, cloud.
  Lanes open in their OWN WORKSPACE (not Pi's tab) — `fleet-dispatch`/`fleet-local-lane`.
- **Gate every slice yourself**: `npm run verify` in the worktree.
- **Never push.** Stage by path only.
- **Pi + Hermes** live in tab 1 of workspace `wQ` (`alt+1`). Automation:
  `fleet-autopilot` + `pi-heartbeat` active; queue empty so both idle/silent.

## 4 — Open, deferred (not lost)

- **MEI measurement suite** (`mei-33-part-a1`, 1649 lines): built on the ABANDONED
  `~/firstmate/projects/Drop-In` (last commit Sept 24). Deferred by Jon; porting is
  a multi-hour conflict resolution. `~/fleet/repos/drop-in` holds the lineage.
- **4 meetup patterns** deferred (search + slug foundation), 1 scope call
  (map "search this area"). See `.scratch/v33/DECISIONS-2026-10-08-meetup-7-processed.md`.

## 5 — First action of the new session

**Process the review feedback WITH its screenshots.** Two commands, then decide:

```sh
curl -s http://localhost:4747/pending                 # the notes (there are ~27 now, not 9)
~/fleet/bin/review-shots                              # pair each note to a screenshot by time
```

`review-shots` matches omarchy screenshots (`~/Pictures/screenshot-<date>_<time>.png`)
to annotations by their `createdAt`. **The pairing is a HINT, not proof** — one shot can
fall within several nearby notes; read the IMAGE and decide which note it illustrates.
Read the notes and their matched screenshots TOGETHER, group by CONCERN (~4-5, probably
not 27 tickets), and decide what's real work vs design direction.

⚠️ Several are DESIGN questions, not build slices — see `ui-annotation-feedback`'s
"When the notes are a DESIGN problem" section. Do not file one ticket per annotation.

### The screenshot convention (Jon's workflow — now wired in)

Jon's omarchy drops every screenshot into `~/Pictures` as `screenshot-YYYY-MM-DD_HH-MM-SS.png`.
His loop: clear `~/Pictures` before a review round, screenshot as he goes, annotate via
the DEV-server toolbar, then say "process the review". On processing, run `review-shots`
to recover the pairing. To attach one specific shot to a note, do NOT paste it in chat:
save it under `<repo>/.scratch/review-<date>/screenshots/` and relay the PATH on the
note's thread via `agentation_reply` (see the `ui-annotation-feedback` skill). The store
has no image field, so a path on the thread IS the attachment.

