# Slice 6b — MICRO-ROUND — builder report

**Committed as:** `bce017e` — the commit that carries this round's three edits and first introduces
this file. Its id is written into this line by the report-only commit that follows, because a file
cannot contain the hash of the commit that creates it: the one field this report format cannot
self-satisfy.

**Scope:** one coverage clause (C1), one checker case named for more than it asserts (C2), and two
report nits in `.scratch/v28/reports/slice-6b-fix-1.md` (C3). No `src/` file touched; no guard
*behaviour* changed; no comment outside the corrected clause.

---

## C1 — the clause now names the mechanism it proves

**Before** (`scripts/guards/no-bypass-guard.sh:43-46`):

```
#                is outside this check. What it CAN see is a
#                bypass a WRAPPER recorded (a reflog action text that is not one
#                of git's prose shapes) or a line in FAST_PUSH_LOG. The blind
#                spot AND both visible paths are PROVEN rather than asserted by
```

**After** (corrected clause, verbatim):

```
#                is outside this check. What it CAN see is narrower than "a
#                bypass a WRAPPER recorded": a NON-PROSE reflog action text on
#                `logs/HEAD` — the one log file the grep below reads — or a line
#                in FAST_PUSH_LOG. The reflog case is seeded by setting
#                `GIT_REFLOG_ACTION` on a COMMIT, so what it proves is that the
#                prose filter admits a non-prose action text on the log the guard
#                reads; it does NOT prove a wrapper-PUSH is visible — a
#                `GIT_REFLOG_ACTION='… git push --no-verify' git push` writes the
#                flag to no `.git/logs` file at all, and this guard reads only
#                `logs/HEAD`. It does not cover a bypass that leaves neither a
#                non-prose reflog action text nor a FAST_PUSH_LOG line. The blind
#                spot AND both visible paths are PROVEN rather than asserted by
```

**What changed is the mechanism, and the "does not cover" half is still stated plainly.** The
clause now says, in order: (1) the visible artifact is a **non-prose reflog action text on
`logs/HEAD`** — the one log file the grep reads — or a `FAST_PUSH_LOG` line; (2) the seed **sets
`GIT_REFLOG_ACTION` on a COMMIT**, so what the case proves is that the prose filter *admits* a
non-prose action text on the log the guard reads; (3) it does **not** prove that a wrapper-*push*
is visible, with the reviewer's measurement reproduced in the clause itself
(`GIT_REFLOG_ACTION='… git push --no-verify' git push` writes the flag to no `.git/logs` file); and
(4) it does **not** cover a bypass that leaves neither of those two traces — *the same blind spot
the paragraph opens with*. The following sentence's case description was corrected the same way
(`one records a wrapper's reflog action text` → `one sets a non-prose reflog action text with
`GIT_REFLOG_ACTION` on a commit`), and the checker's two prose descriptions of case 3
(`no-bypass-guard.check.mjs` header item 3 and the inline comment above the seed) now name the
mechanism too — `logs/HEAD`, set on a COMMIT — instead of saying "a WRAPPER-recorded reflog action
text" without saying where or how.

**The check name at `check.mjs:151` was left unchanged on purpose.** It asserts *"the HISTORY check
fires on a WRAPPER-recorded reflog action text"*, and that is exactly what its body proves
(`r.exit !== 0 && /recorded bypass history/`) — the overclaim was in the *header clause's*
inference about what such a record means, not in the case's own claim. Changing the name would be a
string literal in executable code, moving the check's printed output; see C4.

## C2 — case 11 now asserts the count directly (option A), not renamed

Case 11's condition was `r.exit === 0` only, so a guard that ignored the blockquote line entirely
(a quotation count of **0**) also passed. **I chose option A, assert the count directly:**

```js
  check(
    'a blockquote (`>`) line-leading tag is a QUOTATION, not a claim',
    r.exit === 0 && /1 untagged quotation line\(s\) ignored/.test(r.out),
    `exit ${r.exit}: ${r.out.split('\n')[0]}`,
  )
```

The sandbox's own run prints the count the assertion reads — the line is **seen and classified as a
quotation**, which is the claim the case's name makes:

```
$ node scripts/guards/check-acceptance-greps.mjs /tmp/micro6b/sb11     # the case-11 corpus
check-acceptance-greps: 1 planning document(s), 1 tagged claim(s), 1 untagged quotation line(s) ignored.
  ok   — plan.md:2 `rg -n "zz" src/aaa.ts` → 0 hit(s), observed 0.
clean — every tagged acceptance claim names a path and matches the tree.
exit=0
```

A guard that ignored the line entirely reports `0 untagged quotation line(s)` and now fails the
case; a guard that judged it a claim exits 1 (bare directory, rule 1) and fails it too. **I did not
rename**, because the name is now true of what the body asserts, and a rename would move the check's
printed output — the opposite of what C4 asks for.

## C3 — both report nits in `slice-6b-fix-1.md`

1. **The id is in the file now.** Lines 3-5, which deferred to the return message, now read:
   `**Committed as:** `f9ab882` — the commit that introduced this file, from ...` (measured with
   `git log --oneline -1 -- .scratch/v28/reports/slice-6b-fix-1.md`).
2. **The md5 claim carries its command.** "the guard was restored (md5 equal afterwards)" now has
   the raw tail beneath it:

```
$ md5sum scripts/guards/check-acceptance-greps.mjs
210683546eebb78dd2ded3a6b6ffde91  scripts/guards/check-acceptance-greps.mjs
```

   Re-measured this round; `check-acceptance-greps.mjs` is untouched by the micro round, so this is
   still the restored file's hash. (The reviewer had attested the same value independently.)

## C4 — no executable line moved, proven by identical output (not asserted)

The rule is "no executable line may change". **The only non-comment change is C2's assertion — by
C2's own authorization — and every affected script's output is byte-identical before and after.**
Every other changed line is a comment (`#` in the `.sh`, `*` / `//` in the `.mjs`).

```
$ for f in guard nbcheck agcheck ag; do printf "%-9s %s -> %s\n" "$f" \
    "$(md5sum before-$f.out | cut -d' ' -f1)" "$(md5sum after-$f.out | cut -d' ' -f1)"; done
guard     7627fc37f932a2e66352e31e709beb81 -> 7627fc37f932a2e66352e31e709beb81
nbcheck   6c0dc8dd1386a283dc52fe39395b5ec3 -> 6c0dc8dd1386a283dc52fe39395b5ec3
agcheck   7e6e838dc8566be8785eacf3c9cd3686 -> 7e6e838dc8566be8785eacf3c9cd3686
ag        ac9a939d0795c5effe2f7f656a3b1d3c -> ac9a939d0795c5effe2f7f656a3b1d3c

$ for f in guard nbcheck agcheck ag; do diff before-$f.out after-$f.out; done
(no output — all four diffs empty, exit 0)
```

Where `guard` = `bash scripts/guards/no-bypass-guard.sh`, `nbcheck` =
`node scripts/guards/no-bypass-guard.check.mjs`, `agcheck` =
`node scripts/guards/check-acceptance-greps.check.mjs`, `ag` =
`node scripts/guards/check-acceptance-greps.mjs`. All four exited **0 both before and after**.

`git diff -U0` of the round, filtered to non-comment lines, shows exactly two:

```
-    r.exit === 0,
-    `exit ${r.exit}: ${findings(r.out)}`,
+    r.exit === 0 && /1 untagged quotation line\(s\) ignored/.test(r.out),
+    `exit ${r.exit}: ${r.out.split('\n')[0]}`,
```

Those two lines are C2's assertion, and the `agcheck` output above is identical with them in place.

## Acceptance evidence (raw tails)

### `npm run verify` — exit 0

```
 Test Files  69 passed (69)
      Tests  2027 passed (2027)
...
PASS — every control that suppresses its outline provides a focus cue
...
PASS — steering layer is clean.
...
PASS — git hook enforcement is intact.
...
  ✓ a blockquote (`>`) line-leading tag is a QUOTATION, not a claim
check-acceptance-greps check: all 14 checks passed.
...
  ✓ the HISTORY check fires on a WRAPPER-recorded reflog action text
  ✓ the STATIC check still fires when core.hooksPath is unwired
no-bypass-guard check: all 6 checks passed (the stated blind spot is proven, not asserted).

===========================================================
GUARDS: PASS — all deterministic rules hold.
$ echo exit=$?
exit=0
```

(lint: 0 `error` lines; warnings only — unchanged.)

### `bash scripts/guards/run-all.sh` — exit 0

```
  ✓ a blockquote (`>`) line-leading tag is a QUOTATION, not a claim
check-acceptance-greps check: all 14 checks passed.

  ✓ premise: the seeded commit was made with --no-verify and git kept no trace of the flag
  ✓ THE BLIND SPOT: the guard reports PASS on a repo where --no-verify was used
  ✓ the guard STATES its coverage in the run (the PASS does not read as evidence about the flag)
  ✓ the HISTORY check still fires on a bypass it CAN see (FAST_PUSH_LOG)
  ✓ the HISTORY check fires on a WRAPPER-recorded reflog action text
  ✓ the STATIC check still fires when core.hooksPath is unwired
no-bypass-guard check: all 6 checks passed (the stated blind spot is proven, not asserted).

===========================================================
GUARDS: PASS — all deterministic rules hold.
exit=0
```

### `node scripts/guards/no-bypass-guard.check.mjs` — 6/6, exit 0

```
  ✓ premise: the seeded commit was made with --no-verify and git kept no trace of the flag
  ✓ THE BLIND SPOT: the guard reports PASS on a repo where --no-verify was used
  ✓ the guard STATES its coverage in the run (the PASS does not read as evidence about the flag)
  ✓ the HISTORY check still fires on a bypass it CAN see (FAST_PUSH_LOG)
  ✓ the HISTORY check fires on a WRAPPER-recorded reflog action text
  ✓ the STATIC check still fires when core.hooksPath is unwired
no-bypass-guard check: all 6 checks passed (the stated blind spot is proven, not asserted).
exit=0
```

### `bash scripts/guards/no-bypass-guard.sh` — exit 0

```
No-bypass guard — git hook enforcement
===========================================================
  ok — core.hooksPath = scripts/git-hooks
  ok — scripts/git-hooks/pre-push exists and is executable
  COVERAGE: HISTORY reads the reflog's action text and FAST_PUSH_LOG, never a command line.
    A plain 'git commit --no-verify' leaves no trace this check can read, so the PASS/FAIL
    below is NOT evidence about the flag — only a wrapper-recorded bypass or a FAST_PUSH_LOG
    line is visible (see scripts/guards/no-bypass-guard.check.mjs).

PASS — git hook enforcement is intact.
exit=0
```

### `node scripts/guards/check-acceptance-greps.check.mjs` — 14/14, exit 0

```
  ✓ the real plan.md + briefs pass
  ✓ the real run read a non-zero number of tagged claims (it matched something)
  ✓ an untagged quotation of a bad grep is IGNORED (the tag is the boundary)
  ✓ a zero claim over a BARE DIRECTORY fails (rule 1, isolated)
  ✓ a scoped zero claim whose grep reports hits fails (rule 2, isolated)
  ✓ the recorded `rg "of 5" src/` → 0-hits fixture FAILS
  ✓ the recorded `rg "hasPhoto" src/` → 0-hits fixture FAILS
  ✓ F1 — a zero claim whose only hit is a COMMENT passes (a removal note is not a hit)
  ✓ F1 — the same claim with the mention in CODE fails (the exemption is not a loophole)
  ✓ a corpus with NO tagged claims FAILS (an instrument that matches nothing is not a pass)
  ✓ a tagged claim with no SCOPE fails (nothing to check is not a pass)
  ✓ a tagged claim with no COUNT fails (a claim that cannot be read is not one that holds)
  ✓ F1 holds when the claim command does NOT carry -n (the guard forces -H -n)
  ✓ a blockquote (`>`) line-leading tag is a QUOTATION, not a claim
check-acceptance-greps check: all 14 checks passed.
exit=0
```

### Files changed

```
 .scratch/v28/reports/slice-6b-fix-1.md          | C3: the id, and the md5 command behind the claim
 scripts/guards/check-acceptance-greps.check.mjs | C2: case 11 asserts the quotation count
 scripts/guards/no-bypass-guard.check.mjs        | C1: the two case-3 prose clauses, comments only
 scripts/guards/no-bypass-guard.sh               | C1: the visibility clause, comments only
 .scratch/v28/reports/slice-6b-micro.md          | (this file)
```

---

## Risks

- **`ladder:`** the correction is a comment rewrite in the *header*, but the guard also prints the
  same wording at run time — the `COVERAGE:` echo near the end of `no-bypass-guard.sh` still says
  *"only a wrapper-recorded bypass or a FAST_PUSH_LOG line is visible"*. That echo is an
  **executable line** (`echo "…"`), so correcting it would move the guard's output and break
  acceptance 4's identical-output proof; the brief scoped C1 to the header (`:43,46`) and forbade
  executable changes, so I left it and name it here. A non-micro round that may change output should
  bring the echo into line with the header.
- The `check.mjs:147` the brief cites is the **seed line** (`GIT_REFLOG_ACTION: 'push-wrapper: git
  push --no-verify'`) — executable, and it stays: the value is exactly what makes the case red, and
  what the corrected prose now describes. I corrected the checker's *prose* about it (header item 3
  and the inline comment), which is where the overclaim lived.
- **`Committed as:` inside the file** cannot name its own creating commit (a hash cannot contain
  itself), so this file names the introducing commit and is corrected by one report-only follow-up
  commit. That is the one field of the format no report can self-satisfy; `slice-6b-fix-1.md`'s
  deferral is now resolved with `f9ab882` because that commit exists.

## Unresolved questions

- none.
