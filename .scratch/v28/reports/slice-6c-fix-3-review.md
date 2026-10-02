# Slice 6c — FIX ROUND 3: independent review

**Reviewer:** fresh-context, `orchestrator-reviewer` lane. **Same registered model as the implementer**
(`ollama-cloud/deepseek-v4.1-flash:cloud`) — the D-007 independence gap is real and is carried here, not
hidden. Compensation: every factual sentence below was reproduced against the artifact it names, in the
same shell call that records it.
**Diff reviewed:** `git diff 71bdd55..b4a8b73 -- <the builder's 7 files>` (builder commits `20773ee` +
`b4a8b73`; base `71bdd55`). `HEAD` moved to `7fe7003` (orchestrator D-011 commit) mid-review; it touches
only `factory/` + `.scratch/v28/ledger.md`, so the seven-file diff is unchanged.
**Verdict: NEEDS_CHANGES.**

**Lane rule honoured:** I did not run `npm run verify` or `run-all.sh` (the gate is the verifier's). I *did*
run the three guard instruments under review (`factory-guard.mjs`, `factory-guard.check.mjs`,
`regexp-escape-guard.check.mjs`) as measurements; they mutate only `os.tmpdir()` sandboxes. `git status
--porcelain` was empty before and after every run.

**Guard-file attestation (sha256, start == end):**

```
5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3  scripts/guards/factory-guard.mjs
fe98ace1b44af3f7c8dec687200bd43ebdc9c956531cfef4b884802569711101  scripts/guards/factory-guard.check.mjs
2922f042c0e2a59564c0c999467920cdf93f191438166ae9efdda1cd270f17f8  scripts/guards/regexp-escape-guard.mjs
8493f7e8f3ad4a7799a248138aea3d928e6615122607441461b394f68a4d7bde  scripts/guards/regexp-escape-guard.check.mjs
```

These are byte-identical at the start and the end of this review, and identical to the four hashes the
builder reports. The working tree was left byte-identical (all /tmp work under `/tmp/rev6c/`).

---

## Blocking findings

**1. `ladder:` `.scratch/v28/reports/slice-6c-fix-3.md:526` re-introduces the bare-`HEAD` count label that
N1 exists to kill, and the committed artifact does not support it.**

> `... is now two rounds behind the tree (this round measured 276 tracked `.scratch` files at HEAD — see the
> N1 table).`

Measured (same call):

```
$ for c in 71bdd55 20773ee b4a8b73; do printf "%s " "$c"; git ls-tree -r --name-only "$c" .scratch | wc -l; done
71bdd55 276
20773ee 277
b4a8b73 277
```

`71bdd55` was "HEAD" at the moment of measurement (the report says so at `:4-6`), and it held 276. But the
sentence is committed in `20773ee`, whose `.scratch` holds **277** — because the commit *itself* adds a
tracked file under `.scratch` (this report). That is verbatim the defect the brief's N1 names ("a bare
`HEAD` inside the commit that *moves* HEAD") and the brief's N1 fix line is explicit: **"Do not introduce a
new bare `HEAD`."** The builder fixed three such labels in two other reports and then wrote a fresh one in
its own, inside the very bullet that praises the guard header for being *dated*. A reader at the committed
revision who runs the command gets 277 and cannot reproduce 276 from the label.

*Counterargument, recorded:* the report's own narrative (`:4-6`) names `71bdd55` as the HEAD at measurement,
so the label is resolvable by inference; the fix is a one-line prose change (name `71bdd55`). I still return
it as blocking because the slice's stated purpose is to make this class unrepresentable and the brief
forbade exactly this.

---

## Non-blocking findings

**2. `scripts/guards/factory-guard.mjs:315` — the header scan ends at the first line that is not a comment,
and a *truly empty* line counts as "not a comment", so a blank line inside a header block silently truncates
the scan.**

```
$ printf '#!/usr/bin/env node\n// first comment\n\n// all 9 checks passed after a blank line\nprocess.exit(0)\n' \
    > /tmp/rev6c/n7c/root/scripts/guards/zz-blank2.mjs
$ node <copy of factory-guard.mjs> --root /tmp/rev6c/n7c/root | grep instrument-headers-honest
   (no output — the seeded typed count after the blank line was NOT flagged)
```

The same file seeded with the count *before* the blank line **is** flagged, so the break, not the regex, is
the cause. Latent today: a scripted scan of every `scripts/guards/*.mjs` header found **zero** headers with a
blank line before their first code line (all internal blank lines are `//` or ` *`, both of which are matched
by the comment test). The builder's ladder list names "the leading comment block only" but not this
truncation; it is a one-character-class gap in the rule that is the round's centrepiece.

**3. `scripts/guards/factory-guard.mjs:347` — the `ok —` line asserts "every instrument header stating only
what it can point at" in the vacuous case.**

```
$ node <copy of factory-guard.mjs> --root /tmp/rev6c/nosg     # root has factory/config.json, no scripts/guards
  note — no scripts/guards under this root; instrument headers unchecked here
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at
```

No header was checked, yet the summary claims every header is honest. The `note` at `:306` precedes it and
the builder named the vacuity as a ladder ceiling, so this is a disclosure-quality nit, not a false claim.

**4. `.scratch/v28/reports/slice-6c-fix-3.md:129` — a recorded command comment asserts a "HEAD" identity the
committed revision does not have.**

> `$ node scripts/guards/regexp-escape-guard.check.mjs | grep -c "^  [✓✗]"  # HEAD's check == 04921d8's, same sha256`

```
$ printf '04921d8 check: '; git show 04921d8:scripts/guards/regexp-escape-guard.check.mjs | sha256sum | cut -d' ' -f1
04921d8 check: 6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb
$ printf '20773ee check: '; git show 20773ee:scripts/guards/regexp-escape-guard.check.mjs | sha256sum | cut -d' ' -f1
20773ee check: 8493f7e8f3ad4a7799a248138aea3d928e6615122607441461b394f68a4d7bde
```

At the committed HEAD the check is `8493f7e8…`, not `6a5aa3d3…`; the report's own N4 note
(`slice-6c-fix-2.md:184ff`) says this round's edits moved the check. It was true at measurement time and the
N4 note discloses the movement, so it is a `ladder:` record-label instance (same class as finding 1), not a
substantive error — the number it justifies (12) still reproduces.

**5. `.scratch/v28/reports/slice-6c-fix-3.md:16` — "One finding **rejects the brief's own wording**" frames
the brief's *quotation of the old docstring* as the brief's instruction.** The brief's N2 instruction
("hand-maintained … hand-edited in fix round 1, and it was stale by round 2") agrees with the builder; only
the quoted docstring sentence is the thing being rejected, and the builder's own N2 row (`:31`) states this
correctly. Wording precision, not substance. (And the brief's "stale by round 2" is itself only true of the
*uncommitted* round-2 working tree — at the committed base `0205c8d` the check has 9 `check(` sites and
prints `all 9`, see the N2 adjudication below.)

---

## Adjudications requested by the lane brief

### The N7 narrowing: honest, not a rule shaped to pass

Measured in a `/tmp` copy of `scripts/guards/` (repo untouched):

```
$ node <literal factory-guard: self-subject gate removed> --root /tmp/rev6c/n7/root | grep instrument-headers-honest
  FINDING ... check-acceptance-greps.mjs:61: "* ... A comment that says \"this used to be `hasPhoto`\" is"
  FINDING ... copy-field-consumption-guard.check.mjs:67: "* ... it used to be a hard, un-allowlistable finding"
$ node <real factory-guard> --root /tmp/rev6c/n7/root | grep instrument-headers-honest
   (no output)
```

So the literal reading does fire on exactly the two lines the builder names, and the narrow rule does not.
Three further measurements say the narrowing is a boundary, not a dodge:

1. The rule still fires on B1's shape, verbatim — the behaviour check's HISTORY seed is B1's deleted
   sentence (`scripts/guards/factory-guard.check.mjs:264-266`) and `factory-guard.check.mjs` prints
   `✓ a header claiming its own text changed with no commit to check is CAUGHT` (exit 1, real run).
2. Removing the self-subject gate does **not** turn the check red — the widening is invisible to the
   behaviour check and is only caught by the repo run. So the behaviour check is not what made the rule
   narrow; the two other lanes' headers did.
3. The control is a real control: removing the *pointer* exemption turns it red —
   `$ <pointer-exemption removed> factory-guard.check.mjs` → `✗ the same root with honest headers passes
   (control) — exit 1`.

The ceiling is named with file:line and a widening path, and D-011 already ruled the widening out of this
round's scope. **Upheld.** One nuance the report could state more precisely: `copy-field…check.mjs:67` is a
history claim about that guard's *behaviour*, not about another document's comment as item 3 implies — it is
excluded by the self-subject gate, which is a genuinely narrower boundary than "about its own text". It
belongs on the widening work item.

### The 2065-vs-2067 discrepancy: the orchestrator's stale brief, not the builder's error

```
$ git diff a4b3cf5..71bdd55 -- scripts/factory/scheduler.test.mjs | grep -cE "^\+.*\b(it|test)\("
2
$ git log --oneline a4b3cf5..71bdd55 -- scripts/factory/scheduler.test.mjs
1281c9b D-009/D-010: a fix round can be written down, and a lane can carry its model
```

The brief (commit `0591bf1`) states base `a4b3cf5` and baseline **2065**; `1281c9b` — an
orchestrator/factory-infrastructure commit, not this slice — added **2** `it(`/`test(` sites to
`scripts/factory/scheduler.test.mjs` after the brief was written. The builder measured **2067** at its HEAD
and named the delta instead of quietly matching the brief. The brief carried the exact defect this round
exists to fix (a stated count that does not match its instrument); the error is the orchestrator's, and
`factory/decisions.md:257-264` (D-011) already records it as such. **The builder was right.**

---

## Requirements traceability (seven findings)

| Finding | Verdict | Evidence (command → result) |
|---|---|---|
| **B1** — the unpointable history clause | **met** | The clause is gone: `git grep -nE "went stale\|used to be\|was once\|has grown" -- scripts/guards/regexp-escape-guard.mjs` → exit 1 (no match). New text at `regexp-escape-guard.mjs:84-85` states only the mechanism ("the printed line is the fact, a map in a comment is not"), exactly the supportable replacement the brief allowed. Reviewer's two commands re-run: history grep now shows only the two versions of the claim sentence (the fix itself); `for c in ce3479c c2ec32e 0205c8d HEAD; do git show $c:…guard.mjs \| grep -cE "checks passed\|all [0-9]+ check"; done` → `0 0 0 0`. |
| **N1** — bare `265 at HEAD` label + file-named-instead-of-command | **met in the builder's files** | `git ls-tree -r --name-only <c> .scratch \| wc -l` → 259/259/262/265/265 for `ce3479c`/`32e9f48`/`c484648`/`c2ec32e`/`0205c8d`. Both builder-owned reports now say `265 at 0205c8d`; `git grep -n -f /tmp/rev-n1-needle.txt -- slice-6c.md slice-6c-fix-2.md` → exit 1. `slice-6c.md:272` names `git ls-files .scratch \| wc -l`. The surviving `265 at HEAD` is in 7 other files, all correctly left alone (records/orchestrator docs; D-011 item 2). **But the fix re-created the class at `slice-6c-fix-3.md:526` — see Blocking finding 1.** |
| **N2** — value quoted as stale that was correct | **met (and the brief's parenthetical was wrong)** | `git show c2ec32e -- …check.mjs \| grep -nE "^[-+].*checks passed"` → `- all 6 checks passed` / `+ all 9 checks passed`; `c2ec32e` has 9 `check(` sites, no `${ran}`, no `seedCase` (all measured) ⇒ `all 9` was **correct** at fix 1. The committed round-2 base `0205c8d` also has 9 `check(` sites / 9 executed / `all 9` (loop-free — measured), so the committed file was not stale then either; the staleness lived in the uncommitted round-2 working tree (the fix-2 brief: "Check count is now more than 9"). New docstring at `:47-51` says exactly that and nothing more. |
| **N3** — docstring map 11 vs executed 12 | **met** | `grep -cE "^ \* +1?[0-9]\. "` → 12 (was 11 at `71bdd55`); `node …check.mjs \| grep -c "^  [✓✗]"` → 12, matching `all 12 checks passed`. Case 12 is the 12th executed check (`restored sandbox passes again`), reachable from the `5-12` reference at `:21`. |
| **N4** — non-reproducible mutation-proof hash | **met** | `sha256sum /tmp/fix2-bak-*/guard.mjs` → 4× `f0fc47a0…`; `git show 04921d8:…guard.mjs` → `34fa7aa5…`; `diff -u <(git show 04921d8:…guard.mjs) /tmp/fix2-bak-root-anchored/guard.mjs \| grep -c '^@@'` → **1** hunk (the lane-attribution prose; hunk printed and read); backup still contains the deleted clause (`grep -c` → 1). Provenance now stated at all four sites (`slice-6c-fix-2.md:177ff` + three one-line pointers at `:248,284,320`). Check hash `6a5aa3d3…` verified byte-exact for `04921d8`. |
| **N5** — a failed `git add` loses git's reason; calls inconsistent | **met** | Both git calls now pin `stdio: ['ignore','pipe','pipe']` (`check.mjs:174-175`); `gitReason` (`:162`) keeps git's own stderr. With a `git` shim on PATH: PRE-fix (`71bdd55` check, run from a /tmp copy) → `git step failed: Command failed: git init -q && git add -f .scratch/zz-probe.mjs`; POST-fix → `git step failed: fatal: detected dubious ownership in repository at '/tmp/zz-fake'`. Silent-git control (exit 128, no stderr) → falls back to the command name deliberately. |
| **N6** — summary calls an environment failure a broken guard | **met** | Same shim: PRE-fix summary → `1 check(s) failed — the guard is not doing its job.`; POST-fix → `1 check(s) failed — the wrapped git PREMISE, not the guard.` + three explanatory lines, **exit 1** (`:253-259`). Guarded by `failures === 1 && premiseFailed`, so a real guard failure still says "not doing its job". |
| **N7** — class rule + behaviour check + control | **met** | `factory-guard.mjs:298-330` implements `instrument-headers-honest` behind the existing `--root` seam (`:303-308` notes an absent `scripts/guards`), registered in the header rule list (`:43-46`), called at `:341`, and named in the `ok —` line (`:347`). Behaviour check (`factory-guard.check.mjs:259-302`) seeds a typed count and B1's sentence, plus an adversarial control that carries both vocabularies and passes only because it names `c2ec32e`; `node scripts/guards/factory-guard.check.mjs` → `all 20 checks passed`, exit 0; `node scripts/guards/factory-guard.mjs` → PASS, exit 0. Mutations reproduced in a /tmp copy: no-typed-count → `✗ a header that types a count … is CAUGHT`; no-history → `✗ a header claiming its own text changed … is CAUGHT`; pointer-exemption-removed → `✗ the same root with honest headers passes (control)`. |

**Scope / structure:** the diff is exactly 7 files — 4 `scripts/guards/*.mjs` (each with its sibling
`*.check.mjs` updated) and 3 `.scratch` reports. `git diff --stat a4b3cf5..71bdd55` confirms this round's
guard files add no test files and no `src/`/`e2e/` changes. Every changed line traces to one of the seven
findings or to their evidence; no reformatting, no drive-by refactor, no new dependency, no unrequested
abstraction. `docs/agents/code-structure.md:122-124` (the header is authoritative) is the law the rule
encodes, and the rule's docstring cites it accurately.

---

## Measurements log (all run in this session)

```
git diff --stat 71bdd55..HEAD                       → 7 files, 774 insertions
git ls-tree -r --name-only 71bdd55|20773ee|b4a8b73 .scratch | wc -l   → 276 | 277 | 277
git ls-files .scratch | wc -l (HEAD)                → 277
git grep -f /tmp/rev-n1-needle.txt -- <2 reports>   → exit 1 (clean)
git grep -f /tmp/rev-n1-needle.txt -- .             → 7 other files + this report's own command quote
for c …: git show $c:…regexp-escape-guard.mjs | grep -cE "checks passed|all [0-9]+ check"  → 0 0 0 0
for c …check.mjs: grep -cE "^\\s*check\\("  → 0205c8d 9 (no loops), 04921d8 6 + 7 seedCase calls = 12
grep -cE "^ \\* +1?[0-9]\\. " (map)                  → 12 (was 11 at 71bdd55)
sha256sum /tmp/fix2-bak-*/guard.mjs                  → 4× f0fc47a0…
git show 04921d8|68080b0:…guard.mjs | sha256sum      → 34fa7aa5… (both)
diff backup vs 04921d8 guard | grep -c '^@@'         → 1 (lane-attribution prose)
git show 04921d8:…check.mjs | sha256sum              → 6a5aa3d3…
node scripts/guards/factory-guard.mjs                → PASS, exit 0, "…every instrument header stating only what it can point at"
node scripts/guards/factory-guard.check.mjs          → all 20 checks passed, exit 0
node scripts/guards/regexp-escape-guard.check.mjs    → all 12 checks passed, exit 0
PATH=<fake git shim> node …regexp-escape-guard.check.mjs (pre/post)  → N5/N6 lines above, exit 1 both
<literal rule on /tmp guards copy>                   → fires on check-acceptance-greps.mjs:61, copy-field…:67
<3 rule mutations in /tmp copy>                      → each turns exactly its own seed/control red
git diff a4b3cf5..71bdd55 -- scheduler.test.mjs | grep -cE "^\\+.*\\b(it|test)\\("  → 2
sha256sum scripts/guards/{factory-guard,factory-guard.check,regexp-escape-guard,regexp-escape-guard.check}.mjs  → identical at start and end
```

**Not verified by me (out of lane):** `npm run verify`, `run-all.sh`, `steering-lint` — the builder's tails
for these are claims; the verifier owns them. Nothing in my lane depends on them: the seven findings are in
guard scripts and reports, and each was reproduced without the gate.

## One-line summary

All seven findings are genuinely addressed with reproducible evidence; the only blocker is a *new* bare-
`HEAD` count label in the round's own report (`slice-6c-fix-3.md:526`), which is the exact class this slice
exists to kill and which the brief explicitly forbade.
