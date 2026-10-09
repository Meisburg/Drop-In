SENTINEL: V33-HERO-PHOTO-ABOVE-THE-NAME-M8K3

Slice `muye6aeo`. OWN WORKTREE, unique path:
  cd ~/Projects/playdate-app && git worktree add /tmp/pd-wt/hero-photo-m8k3 -b hero-photo-m8k3 HEAD
Work only there; commit on branch hero-photo-m8k3; never touch main or another lane's path; never push.

📌 FRESH WORKTREE NEEDS TWO THINGS OR THE GATE LIES:
  cp ~/Projects/playdate-app/.env .
  cp -r ~/Projects/playdate-app/e2e/.auth e2e/ 2>/dev/null
  rm -rf node_modules && npm install
Without `.env`, 18 test files fail to LOAD and it looks like a code defect. It is not.

📌 WORK ECONOMICALLY. Read only the files this brief names; **edit first, verify after**.

---

## 1 — The founder's annotation, verbatim

> *"Instead of putting this down here under a header that says family photos, maybe you just have like a hero photo that goes above the profile name at the top that represents like the family, right?"* — `muye6aeo`, `src/components/ProfileView.tsx:911:13`

## 2 — THE RULING (settled — do not re-decide)

⚠️ **The hero is added; the "Family photos" section STAYS.**

One batch ago the founder ruled *"the photos stay after the kids"* (V32, the
EDITOR's order). That ruling governs the **edit** surface and is untouched here.

On the **read** view (`ProfileView.tsx`), the hero is a NEW rectangle above the
profile name. **Do NOT absorb or delete the "Family photos" block** (`:969`) — if the
hero swallowed it, that section would become redundant, which would reverse a
one-batch-old ruling without the founder asking. He asked for a hero; he did not ask
to remove the photos block. Add, do not replace.

**The hero uses the SAME photo the family-photo block already shows**
(`profile.family_photo_url` via `useFamilyPhotoUrl`, `:215`). **No new read, no new
column, no upload path.** If there is no family photo, render NO hero (the identity
block is unchanged). This is a presentation change only.

## 3 — What to build

**3a.** In the identity block (`ProfileView.tsx:545-553`), render a hero **above** the
existing `flex items-center gap-3` row (the avatar + `@name`). It is a Places-style
rectangle: full width of the profile's content column, a fixed aspect (`aspect-[16/9]`
or the app's existing hero treatment if one exists — find it, do not invent), rounded
to the app's card radius, and it renders ONLY when a family photo exists.

**3b.** Tapping it opens the EXISTING photo lightbox — the family-photo block already
does this (`photos={galleryPhotosFrom(...)}` at `:997` with `ImageLightbox` /
`PhotoButton`). Reuse that mechanism; invent no second viewer.

**3c.** `data-testid="profile-hero-photo"`. A no-photo profile renders NO hero and NO
empty box — the identity block is byte-identical to today.

**3d.** 390px: no horizontal overflow (`documentElement.scrollWidth <= clientWidth + 1`).

## 4 — What NOT to touch

- **The "Family photos" section** (`:969-1000`) — it STAYS. This is the ruling.
- The editor (`ProfilePage.tsx`) and its photo order — a different surface, ruled last batch.
- `AGENTS.md`, `CONTEXT.md`, `docs/agents/*`, `vite.config.ts`.
- Another lane's worktree. **Stage by path only**; `git add -A`/`.` is forbidden.

## 5 — Do NOT write unit tests

If you change a file with an existing spec, run that spec. Otherwise typecheck + guards + a real browser check is the evidence.

## 6 — Verification (quote raw output)

```bash
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only server.host change (another session), not this slice" npm run verify
npm run guards     # expect: GUARDS: PASS, exit 0
```
Only `steering-lint` may be red (this fresh worktree's five `docs/agents/*` pointers).

Browser check on a private port **4210–4218** (mint the marker there; kill by port/PID,
never `pkill -f`): open a profile WITH a family photo — the hero renders above the name
and the Family photos section is still below; open one WITHOUT — no hero, no gap.

Report to `.scratch/v33-hero-report.md`. Reply with only:
```
Sentinel: V33-HERO-PHOTO-ABOVE-THE-NAME-M8K3
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/v33-hero-report.md
```
