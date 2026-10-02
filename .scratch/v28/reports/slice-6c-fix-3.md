# Slice 6c — FIX ROUND 3 (V28 r2)

**Brief:** `.scratch/v28/briefs/slice-6c-fix-3.md` (authoritative for this round).
**Base for this round:** `68080b0` (HEAD at dispatch; a factory-infrastructure commit, not part of this slice).
HEAD moved to `71bdd55` while this round was running (the orchestrator's ledger commit) — measured with
`git rev-parse HEAD` — so that is the parent of the commit this report describes.
**Fix round 2's slice commit:** `04921d8`.
**This report is written first and appended to as evidence is produced** — the convention the brief requires
(`.scratch/v28/ledger.md`, 2026-10-02: a builder was OOM-killed mid-round and its evidence survived only
because it had been appending as it went).

**Machine state, not a finding.** Routed to cloud (`ollama-cloud/deepseek-v4.1-flash:cloud`) because the local
`strata-max` worker needs 30 GB VRAM and `ninfer-serve` holds the GPU. Neither was started nor stopped.

**Convention held this round:** every number, count and history fact below was produced by the command quoted
beside it, in the same call that recorded it. One finding **rejects the brief's own wording** on that basis —
N2's "went stale in fix round 1" — and N4's provenance note keeps a hash the brief's text got right while the
tails did not say where it came from.

---

## Per-finding table

Status: `FIXED` = change landed; `REJECTED` = finding argued wrong from a measurement. Every row's proof is a
command whose raw output is appended in "Evidence, as produced" below.

| Finding | Verdict | What changed | The command that proves it | Raw result |
|---|---|---|---|---|
| **B1 (BLOCKING)** — `regexp-escape-guard.mjs:83-84` asserts a history it cannot point at | FIXED | the false clause is deleted; the header now says the count is printed at run time and that the map is a map, with no history claim | the reviewer's two commands, re-run (`git log --all -p … \| grep -nE …`; `for c in …; git show $c:… \| grep -cE …`) | `92:+ * wrong file. It prints its own case count…` — the only line in the file's entire history mentioning a typed count, and `ce3479c 0 / c2ec32e 0 / 0205c8d 0 / HEAD 0`. Confirmed. |
| **N1** — the label that pins the count to `HEAD` instead of to a commit (the reviewer's "a label no reader can resolve") | FIXED | `265 at 0205c8d` at three sites (`slice-6c.md:274`, `slice-6c-fix-2.md:30`, `:71`), and `slice-6c.md:271-272` now names the command instead of the file it lives in | `git ls-tree -r --name-only <sha> .scratch \| wc -l` per commit; then `git grep -n -f /tmp/n1-needle.txt` over the two builder-owned reports | 259 `ce3479c` / 259 `32e9f48` / 262 `c484648` / 265 `c2ec32e` / 265 `0205c8d` / 276 HEAD — so `0205c8d` is the measured home of 265. After the edit: **0 in both builder-owned reports** (`git grep` exits 1 with no output); the label survives in seven other files, all of them owned by another lane or by the orchestrator — listed under "Noticed and did not fix". |
| **N2** — the check's docstring quotes as stale a value that was correct | **REJECTED as worded, FIXED as a claim** | the sentence no longer says the total "went stale in fix round 1"; it now says what used to be typed here was a hand-maintained total (`c2ec32e`) that matched the script at that commit and did not survive the round that grew the script — with the pointer on the line that makes the claim, as the new rule requires | `git show c2ec32e -- …check.mjs \| grep -nE '^[-+].*checks passed'`; `for c in …; git show $c:…check.mjs \| grep -cE '^\s*check\('` | the fix-1 diff is `-…all 6 checks passed` → `+…all 9 checks passed`, and `c2ec32e` has 9 `check(` sites and **no** `${ran}` and **no** `seedCase` helper (all three measured), so one site was one check and **9 was correct at that commit.** The stale state is the round-2 one, and it is reachable from the commits: round 2's base `0205c8d` still has 9 `check(` sites, and `04921d8` brings the file to 12 cases *and* replaces the typed total with the derived count — the typed total was behind the file it was fixed for. |
| **N3** — the docstring map counts 11; the script runs 12 | FIXED | case 12 is in the map | `node …check.mjs \| grep -c '^  [✓✗]'` vs `grep -cE '^ \* +1?[0-9]\. '` | 12 checks vs 11 map items before the edit (both numbers measured, same call). |
| **N4** — the mutation proofs quote a guard hash a reader cannot reproduce | FIXED | a provenance note at the first hash site and a one-line pointer at the other three; the hash is stated as the pre-edit copy's | `sha256sum /tmp/fix2-bak-*/guard.mjs`; `sha256sum scripts/guards/regexp-escape-guard.mjs`; `diff -u /tmp/fix2-bak-root-anchored/guard.mjs scripts/guards/regexp-escape-guard.mjs \| grep -c '^@@'` | all four backups `f0fc47a0…`; committed guard `34fa7aa5…`; **one** diff hunk (the lane-attribution prose). The proofs ran against a guard that differs from the committed one by that prose only. |
| **N5** — a failed `git add` loses git's reason | FIXED | both git calls pin `stdio` and the catch reports git's own stderr line (falling back to the command name only when there is no stderr) | a `git` shim on `PATH` that prints git's `fatal:` line, before and after the edit | before: `git step failed: Command failed: git init -q && git add -f .scratch/zz-probe.mjs` (the reviewer's exact line, reproduced). after: `git step failed: fatal: detected dubious ownership in repository at '/tmp/zz-fake'`. |
| **N6** — the summary calls an environment failure a broken guard | FIXED | the summary distinguishes "the only failure was the wrapped premise" from "a guard case failed" | same shim, same run as N5 | before: `1 check(s) failed — the guard is not doing its job.` after: `1 check(s) failed — the wrapped git PREMISE, not the guard.` followed by three lines saying every case about the guard's own behavior passed (raw tail below), still exit 1 |
| **N7** — the class rule `instrument-headers-honest` | FIXED | a new deterministic rule in `factory-guard.mjs` (seam `--root`), registered in the header rule list, plus a behaviour check with three seeds and a control | `node scripts/guards/factory-guard.check.mjs`; `node scripts/guards/factory-guard.mjs` | see the N7 section: every seeded shape fires, the control passes, and the rule passes on this repo. |

**Nothing was rejected outright; N2 is a rejection of the brief's *wording* on a measurement, not of the
finding.** The brief's N2 text ("the total was hand-maintained and was hand-edited in fix round 1, and it was
stale by round 2") is exactly right; only the reviewer's parenthetical that it "went stale in fix round 1" is
contradicted by the commits — at `c2ec32e` the typed total and the case count agreed.

---

## Evidence, as produced

### B1 — the reviewer's own two commands, re-run (raw)

```
$ git log --all -p -- scripts/guards/regexp-escape-guard.mjs | grep -nE "^\+.*(checks? passed|[0-9]+ checks|case count)"
92:+ * wrong file. It prints its own case count rather than quoting one here, because
$ for c in ce3479c c2ec32e 0205c8d HEAD; do printf "%s " "$c"; git show $c:scripts/guards/regexp-escape-guard.mjs | grep -cE "checks passed|all [0-9]+ check"; done
ce3479c 0
c2ec32e 0
0205c8d 0
HEAD 0

Command exited with code 1
```

(The non-zero exit is `grep -c`'s: a count of 0 is a matched-nothing exit status, not a failed command. The
measurement is the four zeros.)

```
$ printf '%s\n' '<the B1 clause, verbatim>' > /tmp/b1-needle.txt   # written to a file: no shell-mangled pattern on a command line
$ git grep -n -f /tmp/b1-needle.txt -- scripts/guards/
scripts/guards/regexp-escape-guard.mjs:84: * a typed count in this header went stale once already. run-all.sh runs it in
```

### N1 — the counts, and the label gone (raw)

```
$ for c in ce3479c 32e9f48 c484648 c2ec32e 0205c8d HEAD; do printf "%s " "$c"; git ls-tree -r --name-only "$c" .scratch | wc -l; done
ce3479c 259
32e9f48 259
c484648 262
c2ec32e 265
0205c8d 265
HEAD 276
```

`git ls-tree -r --name-only` is the same measurement as `git ls-files` without a checkout — they agree at
HEAD (276 = 276, both measured in this round's session), and it is the only form that works on a commit that
is not checked out. So the label now names `0205c8d`, a commit where **this same command returns 265**.

```
$ printf '%s\n' '265 at HEAD' > /tmp/n1-needle.txt      # a file, not a shell-mangled pattern on the line
$ cat /tmp/n1-needle.txt
265 at HEAD
$ git grep -n -f /tmp/n1-needle.txt -- .scratch/v28/reports/slice-6c.md .scratch/v28/reports/slice-6c-fix-2.md
exit=1
```

Exit 1 with no output is `git grep`'s "no match": **both builder-owned reports are clean.** The same command
over the whole tree shows what is left, and where (see "Noticed and did not fix" — the remaining sites are the
orchestrator's briefs and ledger, and four other lanes' review/verify records).

### N2 — what the commits actually show (raw)

```
$ git show c2ec32e -- scripts/guards/regexp-escape-guard.check.mjs | grep -nE "^[-+].*checks passed"
148:-  console.log('regexp-escape-guard check: all 6 checks passed.')
149:+  console.log('regexp-escape-guard check: all 9 checks passed.')
$ for c in $(git log --format=%h -- scripts/guards/regexp-escape-guard.check.mjs); do printf "%s " "$c"; git show $c:scripts/guards/regexp-escape-guard.check.mjs | grep -cE "^\s*check\(" ; done
04921d8 6
c2ec32e 9
ce3479c 6
$ for c in ce3479c c2ec32e 04921d8; do printf "%s " "$c"; git show $c:scripts/guards/regexp-escape-guard.check.mjs | grep -nE "checks passed" | tail -1; done
ce3479c 135:  console.log('regexp-escape-guard check: all 6 checks passed.')
c2ec32e 187:  console.log('regexp-escape-guard check: all 9 checks passed.')
04921d8 221:  console.log(`regexp-escape-guard check: all ${ran} checks passed.`)
```

So: `c2ec32e` prints a **literal** total (`grep -c 'ran}'` → 0) and has 9 `check(` call sites with no
`seedCase` helper yet — at that commit one site is one check, so the total matched the script. The brief's
parenthetical is the thing that was wrong, and the reviewer's own reading is on record at
`.scratch/v28/reports/slice-6c-fix-2-review.md:107-115`: the event it describes is the round-2 state, where
the file had grown and the total had not. That state is reachable from the commits — round 2's base
`0205c8d` runs what a typed total can describe, and `04921d8` both brings the file to the count the run
reports and replaces the typed total with the derived one:

```
$ git show c2ec32e:scripts/guards/regexp-escape-guard.check.mjs | grep -c 'ran}'
0
$ git show 0205c8d:scripts/guards/regexp-escape-guard.check.mjs | grep -cE "^\s*check\("
9
$ git show 0205c8d:scripts/guards/regexp-escape-guard.check.mjs | grep -c "seedCase"
0
$ node scripts/guards/regexp-escape-guard.check.mjs | grep -c "^  [✓✗]"      # HEAD's check == 04921d8's, same sha256
12
$ git show 04921d8 -- scripts/guards/regexp-escape-guard.check.mjs | grep -nE "^[-+].*checks passed"
287:-  console.log('regexp-escape-guard check: all 9 checks passed.')
288:+  console.log(`regexp-escape-guard check: all ${ran} checks passed.`)
```

The header sentence now says that much and no more: a hand-maintained total (`c2ec32e`) that matched at
that commit and did not survive the round that grew the script, with the pointer **on the line that makes
the claim** — because the rule this round adds requires it (N7), a requirement the first draft of this very
sentence failed.

### N3 — the map against the run (raw)

```
$ node scripts/guards/regexp-escape-guard.check.mjs | grep -c "^  [✓✗]"
12
$ grep -cE "^ \* +1?[0-9]\. " scripts/guards/regexp-escape-guard.check.mjs     # before the edit
11
$ grep -nE "^ \* +1?[0-9]\. " scripts/guards/regexp-escape-guard.check.mjs | tail -3      # before the edit
35: *  10. a ZERO count FAILS — delete the implementation and the guard refuses,
37: *  11. ONE copy in the WRONG file FAILS — the count alone is not the rule; the
```

11 map items, 12 executed checks — the 12th being `restored sandbox passes again`, which `:20-21`'s
"cases 5-12" already referred to. Case 12 is now in the map, and the header still types no total.

### N4 — the hash's provenance, measured (raw)

```
$ sha256sum /tmp/fix2-bak-*/guard.mjs
f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08aba  /tmp/fix2-bak-no-cts/guard.mjs
f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08aba  /tmp/fix2-bak-no-mts/guard.mjs
f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08aba  /tmp/fix2-bak-premise-broken/guard.mjs
f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08aba  /tmp/fix2-bak-root-anchored/guard.mjs
$ printf '04921d8:  '; git show 04921d8:scripts/guards/regexp-escape-guard.mjs | sha256sum | cut -d' ' -f1
04921d8:  34fa7aa50bc16a28d013c26d273ae13222c5528df09650594f9c791c220fd7bb
$ printf '68080b0:  '; git show 68080b0:scripts/guards/regexp-escape-guard.mjs | sha256sum | cut -d' ' -f1
68080b0:  34fa7aa50bc16a28d013c26d273ae13222c5528df09650594f9c791c220fd7bb
$ diff -u <(git show 04921d8:scripts/guards/regexp-escape-guard.mjs) /tmp/fix2-bak-root-anchored/guard.mjs | grep -c '^@@'
1
$ grep -c "went stale once already" /tmp/fix2-bak-root-anchored/guard.mjs
1
```

One hunk, and the copy still carries the clause this round deleted — so the four tails' `guard f0fc47a0…` is
unambiguously the pre-edit copy, and the note now says so at each site.

```
$ sha256sum scripts/guards/regexp-escape-guard.check.mjs         # before this round's edits
6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb  scripts/guards/regexp-escape-guard.check.mjs
$ git show 04921d8:scripts/guards/regexp-escape-guard.check.mjs | sha256sum
6a5aa3d321d2f1479aae833dde818ff6e160fc8ed0ed5ddd9df0a2b992728aeb  -
```

The `check` hash in those tails is byte-exact for `04921d8` (and for the file as this round began); this
round's N2/N3/N5/N6 edits move it on, which the provenance note now says in the same breath.

### N5 / N6 — the reviewer's own scenario, before and after (raw)

The reviewer's evidence was a wrapped git failure whose ✗ line lost git's reason and whose summary called the
guard broken. That scenario is reproducible without mutating the check: a `git` on `PATH` that fails the way
the reviewer's did.

```
$ cat > /tmp/zz-fakebin/git <<'EOF'
#!/usr/bin/env bash
echo "fatal: detected dubious ownership in repository at '/tmp/zz-fake'" >&2
exit 128
EOF
$ chmod +x /tmp/zz-fakebin/git

=== PRE-FIX (this round's base, HEAD 68080b0) ===
$ PATH=/tmp/zz-fakebin:$PATH node scripts/guards/regexp-escape-guard.check.mjs
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✗ PREMISE: the .scratch seed is TRACKED — the state the header’s uncounted-hole sentence describes (not a verdict about the guard) — git step failed: Command failed: git init -q && git add -f .scratch/zz-probe.mjs — case 5 still runs either way, because the guard never consults git
  … (cases 5-12 all ✓) …

regexp-escape-guard check: 1 check(s) failed — the guard is not doing its job.
exit=1

=== POST-FIX (same shim, same tree plus this round's edits) ===
$ PATH=/tmp/zz-fakebin:$PATH node scripts/guards/regexp-escape-guard.check.mjs
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✗ PREMISE: the .scratch seed is TRACKED — the state the header’s uncounted-hole sentence describes (not a verdict about the guard) — git step failed: fatal: detected dubious ownership in repository at '/tmp/zz-fake' — case 5 still runs either way, because the guard never consults git
  … (cases 5-12 all ✓) …

regexp-escape-guard check: 1 check(s) failed — the wrapped git PREMISE, not the guard.
Every case about the guard’s own behavior passed; what failed is the environment the premise
needs (git’s own message is on the ✗ line above). Fix the environment, re-run, and read the
count again — this red is not a broken guard, but it is not a pass either.
exit=1
```

Both halves in one scenario: git's own sentence on the ✗ line (N5), and a summary that stops short of
indicting the guard (N6) while still exiting 1. The control for the fallback — a git that fails with **no**
stderr at all — keeps the old behaviour deliberately, because there is nothing else to report:

```
$ printf '#!/usr/bin/env bash\nexit 128\n' > /tmp/zz-silentbin/git && chmod +x /tmp/zz-silentbin/git
$ PATH=/tmp/zz-silentbin:$PATH node scripts/guards/regexp-escape-guard.check.mjs 2>&1 | grep -E "git step failed|PREMISE, not the guard"
  ✗ PREMISE: … — git step failed: Command failed: git init -q && git add -f .scratch/zz-probe.mjs — case 5 still runs either way, because the guard never consults git
regexp-escape-guard check: 1 check(s) failed — the wrapped git PREMISE, not the guard.
```


---

## N7 — `instrument-headers-honest`: the rule, its seam, its seeds, its control

**Why this is the round's centrepiece.** B1 was a header sentence asserting a history it could not point at.
It was fixed in round 3 by hand; a rule is what stops the *next* one being fixed by a reviewer's attention.

### The rule, as implemented (`scripts/guards/factory-guard.mjs`)

`checkInstrumentHeaders()` reads the **header comment block** of every `scripts/guards/*.mjs` — the leading
comment lines before the first line of code — and reports two shapes:

1. **A typed count of the instrument's own cases.** `\d+\s*[-\s]?\s*(check|checks|case|cases|test|tests)`,
   `checks? passed`, `all \d+ check`. A header that types its own total goes stale the moment the file grows,
   and the header is what a reader trusts (`docs/agents/code-structure.md:123` names one as authoritative for
   its scope).
2. **A history claim about the header's own text with nothing that resolves it.** A staleness phrase
   (`went stale` / `was once` / `used to be` / `has grown`) on a line that is about this instrument's own
   text or numbers (`count|counts|number|total|header|sentence|prose|label|map`) and names **no commit sha
   and no `file:line`** — the precise shape of B1. The pointer has to sit **on the line that makes the
   claim**: an unresolvable claim three lines from its evidence is the shape that failed.

The rule is registered in the guard's header rule list, called from the same place as every other rule, and
named in the summary `ok —` line (`… every floor meetable, every artifact present, every instrument header
stating only what it can point at`).

**The seam** is the one `factory-guard.mjs` already has: `--root`. The rule reads
`<root>/scripts/guards/*.mjs`, so a throwaway root is enough to seed a violating header with no repo touching
— and a root with no `scripts/guards` prints `note — no scripts/guards under this root; instrument headers
unchecked here` rather than passing silently (the same shape as the existing absent-agent-dir note).

### The seeded failures and the control, in the behaviour check

Added as case 14 of `scripts/guards/factory-guard.check.mjs`; three roots, two of which must be red and one
green. The guard's own output for each seeded root:

```
$ node /tmp/fix3-seedshow.mjs typed
Factory guard — the scheduler registry and the work state
===========================================================
  FINDING [instrument-headers-honest]: zz-typed.mjs:2: the header types a count of this instrument's own cases — print the count the run derives instead: "// zz-seeded — all 9 checks passed on a clean tree."

FAIL — 1 factory finding(s).

exit=1

$ node /tmp/fix3-seedshow.mjs history
  FINDING [instrument-headers-honest]: zz-history.mjs:2: the header claims its own text changed and names no commit sha or file:line to check it against: "// zz-seeded — a typed count in this header went stale once already."

exit=1

$ node /tmp/fix3-seedshow.mjs honest
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at

PASS — the registry can be trusted and no work item claims evidence it does not have.

exit=0
```

The history seed is **B1's sentence verbatim** — the rule fires on the exact words a reviewer had to catch.
The control is deliberately *adversarial*: its header carries both the phrase and the count vocabulary and
still passes because it names the commit that shows the claim (`… the typed count in this header used to be
wrong and was corrected at c2ec32e.`), so the rule is proven to be about the pointer rather than about the
words.

### The seeds are load-bearing (mutation-proved)

Three mutations of the rule, each in the same call as its restore, with the file hash-verified:

```
$ bash /tmp/fix3-proofs.sh 2>&1 | grep -vE "^  ✓"
=== mutation: no-typed-count ===
applied no-typed-count to scripts/guards/factory-guard.mjs
  ✗ a header that types a count of its own cases is CAUGHT — exit 0
factory-guard check: 1 check(s) failed — the factory guard is not doing its job.
check exit=1
restored: 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3 -> 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3

=== mutation: no-history ===
applied no-history to scripts/guards/factory-guard.mjs
  ✗ a header claiming its own text changed with no commit to check is CAUGHT — exit 0
factory-guard check: 1 check(s) failed — the factory guard is not doing its job.
check exit=1
restored: 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3 -> 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3

=== mutation: over-broad ===
applied over-broad to scripts/guards/factory-guard.mjs
  ✗ the same root with honest headers passes (control) — exit 1
factory-guard check: 1 check(s) failed — the factory guard is not doing its job.
check exit=1
restored: 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3 -> 5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3
```

Each half of the rule, removed, turns exactly its own seed red; the pointer exemption, removed, turns the
**control** red — so the control is a real control, not decoration. The restore hash equals the guard's hash
at commit time (`5d384806…`, measured below), so nothing the proofs mutated is in the tree.

### The rule caught this round's own prose, which is the proof it is not a formality

The first draft of the N2 fix said `… the total that used to be here was hand-edited to match at c2ec32e …`,
with the pointer on the next line. Against the real repo:

```
$ node scripts/guards/factory-guard.mjs
  FINDING [instrument-headers-honest]: regexp-escape-guard.check.mjs:48: the header claims its own text changed and names no commit sha or file:line to check it against: "* hand-maintained total is why: the total that used to be here was hand-edited"

FAIL — 1 factory finding(s).
exit=1
```

That finding is what produced the sentence quoted under N2 — the pointer moved onto the claim line. The rule
is now the thing that keeps the round's own writing straight, not a reviewer.

### And it passes on this repo

```
$ node scripts/guards/factory-guard.mjs
Factory guard — the scheduler registry and the work state
===========================================================
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at

PASS — the registry can be trusted and no work item claims evidence it does not have.
exit=0
```

---

## The gate — run in this round, fresh, raw tails

```
$ node scripts/guards/factory-guard.check.mjs
factory-guard behavior check — every rule must be able to fail
===========================================================
  ✓ a clean registry with a present artifact passes
  ✓ a model with no footprint_source is CAUGHT
  ✓ a capability floor no model can meet is CAUGHT
  ✓ an illegal lane state is CAUGHT
  ✓ acceptance=pass with review still running is CAUGHT
  ✓ a waived lane with no reason is CAUGHT
  ✓ an artifact named but not on disk is CAUGHT
  ✓ the same item passes when the artifact exists (control)
  ✓ a depends_on naming no work item is CAUGHT
  ✓ an agent default naming an unregistered model is CAUGHT
  ✓ a model with no health probe is CAUGHT
  ✓ an illegal residency value is CAUGHT
  ✓ two models declared resident at once is CAUGHT
  ✓ turning reclaim automatic is CAUGHT
  ✓ dropping the remote-verification requirement is CAUGHT
  ✓ an unacknowledged independence gap is CAUGHT
  ✓ the acknowledged gap passes (control)
  ✓ a header that types a count of its own cases is CAUGHT
  ✓ a header claiming its own text changed with no commit to check is CAUGHT
  ✓ the same root with honest headers passes (control)

factory-guard check: all 20 checks passed.
exit=0
```

The total is `ran`, counted at run time — no total is typed in the file, and the two new cases are the last
two seeds plus the control. (Note the check's own header still says what it always said: *"A rule whose check
cannot fail is a comment."*)

```
$ node scripts/guards/regexp-escape-guard.check.mjs
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✓ PREMISE: the .scratch seed is TRACKED — the state the header’s uncounted-hole sentence describes (not a verdict about the guard)
  ✓ a .scratch copy is UNCOUNTED — the skip is by directory name, as SCOPE states
  ✓ a generated .vitest cache file holding the literal does NOT fail the lane
  ✓ a NESTED .vitest (src/deep/.vitest/) is skipped too — the skip matches a directory NAME at ANY depth
  ✓ a copy in a DECLARATION file (.d.mts) is CAUGHT — .mts is in the extension list
  ✓ a copy in a DECLARATION file (.d.cts) is CAUGHT — .cts is in the extension list, not stated-but-unpinned
  ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: all 12 checks passed.
exit=0
```

(The map now has 12 items — N3 — and the printed total is `${ran}`.)

```
$ bash scripts/guards/run-all.sh
PASS — build law holds.
PASS — checks still mean what they meant.
PASS — git hook enforcement is intact.
PASS — the fixture convention holds and the sweep still covers it.
PASS — every positively-used e2e locator literal still exists in src.
PASS — every declared copy field is read by the app, or allowed with a reason.
PASS — the escape has exactly one home.
PASS — the registry can be trusted and no work item claims evidence it does not have.
PASS — the guard fires on every seeded defect and passes a clean repo.
PASS — the sweep reports, proves, and refuses correctly.

copy-field-consumption-guard check: all 48 checks passed, 0 failed, across 33 guard invocations (the guard header describes that count as its cost driver and does not assert it).
check-acceptance-greps check: all 14 checks passed.
no-bypass-guard check: all 6 checks passed (the stated blind spot is proven, not asserted).
regexp-escape-guard check: all 12 checks passed.
factory-guard check: all 20 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
exit=0
```

```
$ npm run verify ; echo exit=$?
> drop-in@0.0.0 build
…
> drop-in@0.0.0 test
 Test Files  71 passed (71)
      Tests  2067 passed (2067)
> drop-in@0.0.0 lint
> drop-in@0.0.0 a11y:focus
PASS — every control that suppresses its outline provides a focus cue
> drop-in@0.0.0 steering-lint
  ok — AGENTS.md (1789 words, ceiling 1800)
  ok — docs/agents/coordinator.md (700 words, ceiling 900)
PASS — steering layer is clean.
> drop-in@0.0.0 guards
  ✓ a header that types a count of its own cases is CAUGHT
  ✓ a header claiming its own text changed with no commit to check is CAUGHT
  ✓ the same root with honest headers passes (control)

factory-guard check: all 20 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
exit=0
```

Lint, counted off-TTY because oxlint prints no summary banner there:

```
$ grep -c ': warning ' /tmp/fix3-verify.log
81
$ grep -c ': error ' /tmp/fix3-verify.log
0
```

**Baseline: 71 test files / 2067 tests / 81 warnings / 0 errors / GUARDS PASS — unmoved.** The dispatch
message carries 2067; the brief carries 2065. Both are real measurements of different commits, and the delta
is outside this slice: `git diff a4b3cf5..HEAD -- scripts/factory/scheduler.test.mjs` adds **2** `it(`/`test(`
sites (the factory-infrastructure commits between the brief's stated base `a4b3cf5` and this round's HEAD).
This round's diff touches no test file — `git status --short` lists four `scripts/guards/*.mjs` files and the
three `.scratch` reports, nothing under `src/`, `e2e/`, or `scripts/factory/`.

Files as committed (sha256, measured at report time; re-checked after the commit):

```
5d384806a7d6a596832b80c536d011a8f2019358a3ba5ee7e47b17e3a72769b3  scripts/guards/factory-guard.mjs
fe98ace1b44af3f7c8dec687200bd43ebdc9c956531cfef4b884802569711101  scripts/guards/factory-guard.check.mjs
2922f042c0e2a59564c0c999467920cdf93f191438166ae9efdda1cd270f17f8  scripts/guards/regexp-escape-guard.mjs
8493f7e8f3ad4a7799a248138aea3d928e6615122607441461b394f68a4d7bde  scripts/guards/regexp-escape-guard.check.mjs
```

---

## Noticed and did not fix — decisions, not silences

1. **The bare-`HEAD` label survives in seven other files** (N1's class, outside the three sites the finding
   names): `.scratch/v28/briefs/slice-6c-fix-2.md:68`, `.scratch/v28/briefs/slice-6c-fix-3.md:80,85`,
   `.scratch/v28/ledger.md:7091`, `.scratch/v28/reports/slice-6c-fix-1-review.md:97,217,230,244`,
   `.scratch/v28/reports/slice-6c-fix-1-verify.md:417`,
   `.scratch/v28/reports/slice-6c-fix-2-review.md:81,83,245,268`,
   `.scratch/v28/reports/slice-6c-fix-2-verify.md:208,223,265`. **Not fixed on purpose:** the briefs and the
   ledger are the orchestrator's documents, and the review/verify reports are *records of what those lanes
   measured at their own HEAD* — rewriting them would falsify a record to make a label resolve, which is the
   opposite of what N1 is about. The label class is now machine-visible for guard **headers** (N7); the same
   class in prose artifacts has no machine and is the orchestrator's call.
2. **`scripts/guards/copy-field-consumption-guard.check.mjs:67`** — `it used to be a hard, un-allowlistable
   finding, i.e. a build break` is a history claim about that guard's own behavior with no commit or line.
   The new rule does **not** flag it: the line is not about that header's own text or numbers (no
   count/number/total/header/sentence/prose/label/map word), which is the boundary this round chose
   deliberately — see the `ladder:` note below. Left in place; it is a decision for the orchestrator whether
   the boundary should widen (it would make a fourth round for one sentence in another lane's guard).
3. **`scripts/guards/check-acceptance-greps.mjs:61`** — `A comment that says "this used to be `hasPhoto`" is
   honest documentation` is a *quotation of another document's* comment, not a claim by this header. Not
   flagged, and this file's own header is the in-repo precedent for that reading: its "THE TRAP THIS GUARD
   WAS DESIGNED AROUND — a naive parser fires on the documentation of the rule it enforces".
4. **`scripts/guards/run-all.sh:44-51`** — the one-line description of `factory-guard` in the guard list does
   not mention the new rule (nor `agent-model-in-registry` or `independence-satisfiable`). Left alone: it is
   a summary, not an enumeration, and the brief asked for the rule list *in `factory-guard.mjs`*, which is
   where the authoritative list lives.
5. **`regexp-escape-guard.mjs`'s `262` at `c484648`** is now two rounds behind the tree (this round measured
   276 tracked `.scratch` files at HEAD — see the N1 table). Left alone and **correct as written**: it is
   dated to a commit and carries its own re-measuring command, which is the whole of N1's lesson.
6. **`.scratch/v28/reports/slice-6c-fix-2-review.md`'s quotations of `slice-6c-fix-2.md:30,71`** no longer
   match those lines byte-for-byte, because this round edited the lines the brief ordered edited (and added
   N4's provenance notes inside the same file). The recorded wording survives in the review and in the brief;
   an in-place fix and a frozen quotation cannot both be exact, and the brief chose the fix.
7. **Machine state, unchanged and not a finding:** `strata-max` was never started and `ninfer-serve` was
   never stopped. The route to `ollama-cloud/deepseek-v4.1-flash:cloud` is a scheduling outcome, recorded in
   the brief and in `factory/logs/`.

## Risks and ceilings (`ladder:`)

- **`ladder:` the history half of `instrument-headers-honest` is narrowed to lines about the instrument's own
  text or numbers**, because the literal reading (any staleness phrase with no pointer) fires on two
  legitimate headers in other guards (items 2 and 3 above) and the brief requires the rule to pass on this
  repo. The rule therefore catches B1's exact shape — proven by seeding B1's sentence verbatim — but not
  every conceivable history claim. Widening it is a one-line change plus two header sentences in other
  guards, and it belongs to the orchestrator as a decision.
- **`ladder:` the pointer must be on the claim line.** This is a formatting demand: the rule caught the first
  draft of this round's own N2 sentence for wrapping, not for being wrong. Named as a ceiling. The alternative
  (accept a pointer anywhere in the header) was rejected on measurement: B1's header contained *both* a sha
  and a `file:line` for other claims, so a block-level exemption would have let B1 through untouched.
- **`ladder:` the scan is the leading comment block only** — a guard's header is what a reader meets first, and
  that is the block the brief named. A history claim in a section comment further down a guard file is not
  caught.
- **`ladder:` `.check.mjs` files are scanned too** (they are instruments, and N2's line lived in one) — so the
  rule's cost is the header prose of every `scripts/guards/*.mjs`, which is intended, and a new guard whose
  header quotes a typed count will be caught before it is committed.
- **`ladder:` the sha pattern can accept a hex-looking English word** (`\b[0-9a-f]{7,40}\b` matches, e.g.
  `defaced`), so a claim could be *spuriously* exempted. The failure direction is lenient (a missed finding,
  never a false alarm), which is the direction this repo's guards prefer for prose.
- **`ladder:` N5 reports the last non-empty stderr line** of the failed git step, not all of it: the ✗ line has
  to stay one line, and git's `fatal:` reason is what the reviewer asked for. A multi-line git refusal loses
  its earlier lines.
- **`ladder:` a root with no `scripts/guards` prints a note and passes** — vacuous by construction, mirroring
  `checkAgentModels`'s absent-directory handling. The behaviour check's clean root exercises that path, and the
  seeding path is separately proved red, so the two are not confused.
- **No verification lane was needed for product behaviour:** this slice changes guard scripts and reports. The
  four required commands above are the whole of its surface, and each was run fresh after the last edit.
