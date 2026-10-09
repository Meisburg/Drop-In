# remove-buttons report — SENTINEL REMOVE-BUTTONS-MINIMALISM-R7T4

Status: DONE (recovered + completed by orchestrator; worker exited rc=1 NO COMMIT)

Jon's minimalism doctrine: "I'm a minimalist and I don't wanna make the user think."
Four controls that did not earn their place were removed.

## Removed (exactly four, nothing else)

1. **NewPlaydatePage.tsx** — the "vibe chips" block (`vibe-chips` / `vibe-chip`).
   `mv0cjnlq`: "I don't like these buttons here… remove it." Removed the row plus its
   `detailsChipsSlot` plumbing in `PlaydateFormFields.tsx`. The pure seam
   (`lib/vibeChips.ts`, `applyVibeChip`) stays: it is a rule, not a control, and a future
   surface re-adding chips inherits it. `e2e/vibe-chips.e2e.ts` deleted (its whole purpose
   was the removed row).

2. **InboxPage.tsx** — the `Link to="/browse"` "Browse places" button in the empty inbox.
   `mv0chug7`: "It doesn't make sense to have this button here." The empty-state copy line
   stays (it explains what the inbox is for); only the button went.

3. **SettingsPage.tsx** — the `settings-profile-link` "Your family profile" row.
   `mv0d7zlm`: "Remove from here." NOT BLOCKED: `/profile` is reachable by the app-wide
   bottom-nav tab (`nav-tab-profile`, `App.tsx:600`) — the primary door. The settings row
   was a redundant SECOND door, which is exactly what Jon flagged.

4. **ProfilePage.tsx** — the top-level `interests-input` block that duplicated the
   per-parent interests cards below. `mv0d4ugk`: "Isn't this redundant because there's an
   interest part for the parents below?" The canonical per-parent section stays;
   `e2e/profile-interests.e2e.ts` updated to seed through the surviving path.

## Gate (run by orchestrator, not the worker)

- typecheck (src + e2e): clean
- build: clean (275ms)
- unit tests: **2757 passed** (95 files)
- lint: warnings only (pre-existing, unrelated files)
- a11y:focus: PASS
- steering-lint: red — the 3 known stale doc pointers (`docs/agents/{builder-routing,
  compute-split,fleet-capacity}.md`), pre-existing debt, the only permitted red
- guards: **PASS** (185 checks) — needed the deleted spec's deletion STAGED first, since
  `trailing-newline-guard` reads `git ls-files --cached` and flagged the tracked-but-absent
  file as ENOENT
- e2e `profile-interests.e2e.ts`: **4/4 passed** (:4221)

## Worker note

The worker finished the edits but exited rc=1 with NO COMMIT — `npm install` in a fresh
worktree consumed its budget before it could gate+commit. Orchestrator recovered the
worktree, verified all four removals, ran the gate, and committed.
