SENTINEL: V33-8-SETTINGS-EVERY-ROW-EARNS-ITS-PLACE-T4N9

Slice `muye28ed` + `muye1a35` + `muyemm3k` + `muydzvu9` (the settings cluster — ONE slice).

OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/settings-earns-t4n9 -b settings-earns-t4n9 HEAD
Work only there; commit on branch settings-earns-t4n9; never touch main or another lane's path; never push.

📌 FRESH WORKTREE NEEDS TWO THINGS OR THE GATE LIES:
  cp ~/Projects/playdate-app/.env .
  cp -r ~/Projects/playdate-app/e2e/.auth e2e/ 2>/dev/null
  rm -rf node_modules && npm install
Without `.env`, 18 test files fail to LOAD ("Missing VITE_SUPABASE_URL") and it looks like a code defect. It is not.

📌 WORK ECONOMICALLY. Read only the files this brief names; **edit first, verify after**.

---

## 1 — The founder's annotations, verbatim

> *"I fail to see how this is a settings page for this information. If I can't edit anything, it doesn't make any sense. I think for every section for the settings, there should be a way to change it. Otherwise, what's the point of even having it here, right?"* — `muye28ed`

> *"Does this make sense to you? Like, if you see here families you follow … places you saved …"* — `muydzvu9`

> *"Perhaps you just put the logout button at the bottom of this list. I don't want somebody to look at an option to delete their account next to logout because they might consider it. I don't even want them to find that easily, LOL."* — `muyemm3k`

> *(on the Privacy section's name fact)* `Your name` — `muye1a35`

## 2 — THE RULING (settled — do not re-decide)

**The convention this follows:** a mobile settings page is a list of things you can CHANGE. Every row is either an inline control, or a doorway to the screen that owns it. A dead read-only display does not belong.

**Therefore, for every line in every settings category:**

1. **If a screen already owns editing it → the line becomes a LINK to that screen.** The canonical case: Privacy's "Your name" links to `/profile` (the profile editor, V15 T07 — which `/settings` already links to as "Your family profile"). Do not build a second editor for it.
2. **If nothing owns it and it is a fact about the parent → it must either gain a control or state WHY it is read-only**, in one short line next to it.
3. **If it is computed or contractual (member-since, counts, the account email) → it stays text WITH a why-line.** "Member since — set when you joined." No new controls, no pretending.
4. **Nothing is deleted** without the founder naming it (he asked for "editable or gone"; gone needs his call, so default to editable-or-explain).

**Sign out moves to the BOTTOM of the Account category, below Delete my account**, visually separated. Today `AccountSection.tsx:135-169` renders Sign out ABOVE Delete my account, adjacent — that is exactly the arrangement `muyemm3k` objects to.

**Following & saved (`muydzvu9`):** the pair currently reads as one confusing thing. Split it into two plainly-labelled, plainly-editable blocks — "Families you follow" and "Places you saved" — each already has its own unfollow control (`data-testid="unfollow-family"` / `"unfollow-place"` in `FollowingSection.tsx:174,217`). Make the headings and the section blurb say plainly that here is where you change them. No new read.

## 3 — Files (read these; do not survey)

- `src/pages/SettingsPage.tsx` — the index + one-category-at-a-time shell (V-latest). The six categories come from `src/lib/settingsIndex.ts` (`SETTINGS_INDEX`, the labels and blurbs).
- `src/lib/settingsIndex.ts` — the data table. If a blurb or label must change to state what a category is FOR, change it HERE (one source; the phone index and the desktop pane both read it).
- `src/components/PrivacySection.tsx` — `buildPrivacyReport` produces `facts`; `PrivacySection`'s `facts.map` at `:264` renders each as a `<div>` with a `<dt>` label + `<dd>` value + `<dd>` detail. **"Your name" is one such fact** — make that row link to `/profile`.
- `src/components/FollowingSection.tsx` — the two blocks at `:174` and `:217`.
- `src/components/AccountSection.tsx` — sign out (`:135-148`) and delete (`:150-169`); **swap their order** so sign-out is last, with separation.
- The specs that pin these: `e2e/settings*.e2e.ts`, `e2e/account*.e2e.ts` (find them; every spec locating a moved row changes in the SAME diff).

## 4 — What to build

**4a.** A shared "settings row" shape for the read-only lines: a label, the value, and either a chevron-Link (when a screen owns it) or a why-line (when it does not). Match the app's existing row treatment (`SettingsPage.tsx:109-116` is the model: a `rounded-xl border … min-h-11` row with a right-hand hint). Reuse classes; invent no second card style.

**4b.** Privacy: "Your name" (and any other fact whose editor is `/profile`) becomes a Link to `/profile`. Facts that are computed keep the why-line.

**4c.** Account: Sign out LAST. Add real separation from Delete my account (the delete block already has its own red card — keep it, and ensure sign-out sits outside/after it with space, not adjacent above it).

**4d.** Following & saved: headings + blurb state plainly that these are editable here.

**4e.** Any row that is neither editable nor explainable: leave it, and list it in your report as a candidate for the founder to delete. **Do not delete on your own.**

## 5 — What NOT to touch

- `AGENTS.md`, `CONTEXT.md`, `docs/agents/*`, `vite.config.ts` — the orchestrator's or another lane's.
- The `/profile` editor itself. Link to it; do not change it.
- Another lane's worktree. **Stage by path only**; `git add -A`/`.` is forbidden.

## 6 — Do NOT write unit tests

If you change a file with an existing spec, run that spec. Otherwise typecheck + guards + a real browser check is the evidence.

## 7 — Verification (quote raw output)

```bash
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
npm run guards     # expect: GUARDS: PASS, exit 0
```
Only `steering-lint` may be red (this fresh worktree's five `docs/agents/*` pointers).

Browser check: open `/settings`, visit each of the six categories, and confirm — a row that says it is editable really is; "Your name" taps through to `/profile`; Sign out is the LAST action in Account, visibly separated from Delete. Private port **4210–4218** (mint the marker there; kill by port/PID, never `pkill -f`). 390px: no horizontal overflow.

Report to `.scratch/v33-8-report.md`, listing any row you left as a delete-candidate. Reply with only:
```
Sentinel: V33-8-SETTINGS-EVERY-ROW-EARNS-ITS-PLACE-T4N9
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-8-report.md
```
