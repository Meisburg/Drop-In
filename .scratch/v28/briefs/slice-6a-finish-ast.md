# Slice 6a — FINISH the AST rewrite (fresh builder; the state is on disk)

*(Your predecessor did the work. It then died because its session compacted and it tried to **write a ~730-line
file in one tool call** — the response hit the output token limit and the call was never executed. **So: many small
edits, never one giant write.**)*

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing.** Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## What is already on disk, MEASURED BY ME — do not redo any of it

**Uncommitted, in the working tree** (`git status --porcelain`, `582 insertions / 521 deletions`):

| Fact | Evidence |
|---|---|
| **The AST walk is in** | `copy-field-consumption-guard.mjs:202` — `import ts from 'typescript'` |
| **It parses** | `node --check … \|\| echo` → **syntax OK** |
| **Every lexer function is DELETED** | `blankNonCode`, `stringEnd`, `skipString`, `skipRegex`, `exportedConsts`, `importedBindings`, `aliasesOf`, `destructuredReads` → **all count 0** |
| **The file shrank** | **860 → 730 lines** (`git show 1d67f6b:… \| wc -l` vs `wc -l`), and note the predecessor's honest correction: **−19% of the CODE lines, not the "two thirds" the brief implied** |
| `FirstRunCopyByCard` de-exported | `src/lib/firstRunCopy.ts`, 8 changed lines |
| The checker was extended | `…check.mjs`, +191 |

**So your job is FINISH and PROVE, not rewrite.** Read the three files, work out what is missing, and close it.

## The failure you must not repeat

**`bash failed (exit 1): the response hit the output token limit, so its arguments may be truncated.`**
**A 730-line file cannot be written in one tool call here.** Use `edit` with small, targeted `oldText`/`newText`
replacements, or a short `bash` command that only appends. **If you find yourself about to emit a very long
command or file body, stop and split it.**

## What still has to be true when you are done

From `.scratch/v28/briefs/slice-6a-fix-3.md`, these are the open obligations — **check each, do not assume**:

1. **K1 seeds — the three inputs where the OLD rule let a string MANUFACTURE a read.** With the real `skipLabel`
   read deleted, each of these made the pre-AST guard report the field **READ** and exit 0, and **two were
   REGRESSIONS against the fix-1 guard**:
   ```
   It's 'kidsCopy.skipLabel' here
   What's next? See {'docs.kidsCopy.skipLabel'}
   const zzCont = 'abc<newline>kidsCopy.skipLabel'
   ```
   **Each needs a seed that FAILS against `a03fc54`** — and the two regressions **also against `be29027`.**
2. **K2 seed — a read inside a TEMPLATE HOLE.** `skipLabel={`${kidsCopy.skipLabel}`}` was reported **READ BY
   NOTHING**. **A template hole is an expression node now; prove it.**
3. **Every new seed asserts its own premise**, and **every new seed is shown to FAIL against the code from before
   this round.** *A seed that is green against the broken version is not a regression test.*
4. **All 28 existing seeds still pass**, and the **8 that fail against the pre-fix code keep failing** — the reviewer
   measured those as `15,16,17,18,19,20,21,22`. `git archive` a copy into `/tmp` to check; **do not modify the repo
   to seed.**
5. **The guard passes on the real tree** — 3 shapes, 8 shape-qualified fields, 2 consumer files, exit 0.
6. **The guard still FAILS when it matches nothing** (the corpus's own no-match tripwire).
7. `npm run verify` exits 0; **`npm run typecheck` exits 0**; both guard artifacts exit 0 when run directly.
8. **L1** (`patternLeaves` manufacturing reads from computed-key destructures), **L3** (the item-A skip line names
   no remedy — make it say what to do, or surface the skip in the summary counts, and say which), **L4** (seed 20
   uses `writeFileSync`, bypassing `editFile`'s premise check — route it through `editFile`).

## Verify

`npm run verify`, `npm run typecheck`, both guard artifacts directly, `signup-zip-fallback` **once**,
`onboarding-resume` **once** — **one browser spec at a time.** The machine is at its memory limit and the model has
already been OOM-killed **twice** today; the model holds ~50 GB of 62.

**Four named flake modes** — re-run once before believing any red. Kill listeners **by port**, never `pkill -f`.
**Do not poll for a background job** — foreground, or keep the PID and `wait $PID`.

## Report

- **`Committed as: <sha7>`, taken from `git log --oneline -1`, never from memory.**
- The lines deleted vs added, the new seeds with **their pre-fix exits**, which seeded failures you verified
  yourself, and anything the brief did not anticipate.
- **If you cannot finish, commit what is verified and say plainly what is not.**
