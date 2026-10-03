# Slice 6c fix-7 FINAL — fresh-context review of the DECLARATION pass (commit `05edac7`)

**Lane:** reviewer ("is it RIGHT"). **Not the verifier** — the gate was not run by me.
**Disclosure (D-007/D-015):** a sibling model, not independent. Every factual sentence below is reproduced
against the artifact it names, with the command quoted inline.
**Repo:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding` @ `Meisburg/onboarding`, HEAD `05edac7`.
**Reviewed range:** `git diff e9b8cad 05edac7` (the declaration pass; parent is the D-027 report commit).
**No mutation:** `git status --porcelain` empty at start and end. sha256 frozen:

| file | sha256 at start | at end |
|---|---|---|
| `scripts/guards/factory-guard.mjs` | `9597040a585409e2…07f0b7ea` | `9597040a585409e2…07f0b7ea` |
| `.scratch/v28/reports/slice-6c-fix-7.md` | `8385bc8440a688ee…ae11abb` | `8385bc8440a688ee…ae11abb` |
| `.scratch/v28/ledger.md` | `08772e492c07ed70…74aefab6ed` | `08772e492c07ed70…74aefab6ed` |
| `factory/decisions.md` | `68c114a1f387263a…0f0812757` | `68c114a1f387263a…0f0812757` |

(Full: `sha256sum scripts/guards/factory-guard.mjs .scratch/v28/reports/slice-6c-fix-7.md .scratch/v28/ledger.md factory/decisions.md` — identical at the two ends.)

---

    Verdict: NEEDS_CHANGES

    Blocking findings:
      - report `.scratch/v28/reports/slice-6c-fix-7.md:402` — a `file:line` pointer to the mechanism that is
        wrong at the line it names ("`factory-guard.mjs:1424` skips every other path"): `:1424` is a JSDoc
        sentence, the `continue` is at `:1446`. A fresh instance of the class (a pointer that does not point at
        what it names), introduced by THIS pass, in §10.3's own corrected prose.
      - report `.scratch/v28/reports/slice-6c-fix-7.md:130` and `:406` — "the fourteen matcher constants" /
        "the measured artifact is **14**" is not reproducible: the matcher block holds 12 constant declarations
        (`factory-guard.mjs:387-390,400-407`) and the file holds 13 top-level regex-literal constants (those 12
        + `FIXED_SHA` at `:797`). This pass turned a reproducible "thirteen" into an unreproducible "fourteen"
        while asserting a measurement (WRONG NUMBER).
    Non-blocking findings:
      - `scripts/guards/factory-guard.mjs:53` — "(26 of the 90 names in this file, measured)": the header's own
        file contains 0 `check(` names; the 90 are in `factory-guard.check.mjs`. The number is TRUE there
        (26 read / 64 unread); the referent is unstated (same implicitness at report `:46` and `:52`). Across
        all scanned guard files the coverage is 45/188.
      - ladder: `scripts/guards/factory-guard.mjs:93-96` and `:1427` — the `.scratch/` claim ("must cite a line
        that carries the sha it names") still overstates the mechanism: `:1448` skips a `.scratch/` path that is
        not on disk, `:1449-1450` skips a finding whose sha is not introduced by "names" or is a `<…>`/`…`
        placeholder. Same class as the previous review's B2 (the transcript bullet stating more than the rule
        enforces) — the correction was paid once and the residual is still undeclared.
      - `scripts/guards/factory-guard.mjs:61-62` — the 1d keys are given as `resolvable-pointer`,
        `claim-checkable`, `line-shows-it`; the code (`:406`) and report §10.1 (`:383`) give the literal
        phrasings ("resolvable pointer", "makes the claim checkable", "the line that shows it"). The sentence
        itself says "KEYED TO LITERAL PHRASINGS"; its own three labels appear nowhere in the source. Same for
        rule 3, whose header key "the baseline is N" omits the "holds" variant the regex accepts (`:407`).
      - report `.scratch/v28/reports/slice-6c-fix-7.md:230` — the corrected §5 sentence points at "(see §10.2)"
        for the 26/90 coverage; §10.2 (`:386-391`) is the 11/11 paraphrase residue, the coverage is in §10.1
        (`:370-385`). Another pointer that does not show what it names.
    Requirements traceability:
      - B1 (rule-2 coverage claim) corrected -> met, number TRUE (26/64/90, see Judge 1); referent caveat above.
      - B2 (transcript scope claim) corrected -> met in all three places (header bullet `:94`, JSDoc `:1427`,
        ok-claim `:1522`); the non-`.scratch/` escape is declared as a ceiling (`:97-100`, `:1428-1430`).
      - D-027 obeyed: no matcher widened, no phrasing added per escape -> met (one non-comment line changed in
        the guard, an output string; constant declarations byte-identical to the mechanism commit).
      - Residue declared with its number, per rule, in the header AND §10.1 -> met (11/11, A–N listed in §10.0;
        each rule's key stated) with the two precision defects above.
      - A fresh instance in this pass's own artifacts -> NOT met: two blocking instances found (above), plus
        four non-blocking.
    Recommended next action: fix the two blocking sentences as prose (§10.3's `:1424` -> `:1446`; "fourteen" ->
    the number the artifact yields, with its derivation named) and declare the transcript rule's remaining
    stand-downs; the mechanism itself needs no change.

---

## 0. What the pass was, and what I checked it against

`git show --stat 05edac7` -> 3 files, comment/prose only:

```
 .scratch/v28/ledger.md                 |   1 +
 .scratch/v28/reports/slice-6c-fix-7.md | 150 ++++++++++++++++++++++++++++-----
 scripts/guards/factory-guard.mjs       |  36 ++++++--
 3 files changed, 160 insertions(+), 27 deletions(-)
```

`scripts/guards/factory-guard.check.mjs` — the check file — was **not touched at all** by this commit. The
ruling implemented is D-027 (`factory/decisions.md:739-769`): lower the claim to the mechanism, do not widen the
mechanism, do not add one phrasing per escape. I judged the pass against that ruling, and I judged its own new
prose by the standard the slice exists to enforce (D-020's lexical/semantic limit; D-025's class).

---

## 1. Judge 1 — is B1 genuinely corrected, and is the corrected number TRUE?

**Yes for the claim; yes for the number; the referent is unstated.**

The corrected coverage numbers appear in the guard header (`scripts/guards/factory-guard.mjs:53`), report `:46`,
`:52-53`, `:230`, `:303`, `:397`, `:10.1` (`:383`). I re-counted with the guard's own name regex, copied
verbatim from `factory-guard.mjs:419` (`/^\s*check\(\s*(['"`])(.*?)\1/`), over the prose-collector's rule
(`:415-424`, names read only on the line that opens the call):

```
$ cat > /tmp/count_read_names.mjs <<'X'
import { readFileSync } from 'node:fs'
const re = /^\s*check\(\s*(['"`])(.*?)\1/
for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  let opened = 0, read = 0
  for (const line of lines) { if (/^\s*check\(/.test(line)) { opened++; if (re.exec(line)) read++ } }
  console.log(`${file}: opened=${opened} read=${read} unread=${opened - read}`)
}
X
$ node /tmp/count_read_names.mjs scripts/guards/factory-guard.check.mjs
scripts/guards/factory-guard.check.mjs: opened=90 read=26 unread=64
```

**26 of 90 read, 64 unread — TRUE**, and 64/90 = 71 % (report `:303`) is right. Corroborated independently:

```
$ grep -cE '^\s*check\(' scripts/guards/factory-guard.check.mjs
90
$ grep -o 'check(' scripts/guards/factory-guard.check.mjs | wc -l
92        # the 2 extras are the string at :1117 and "check(s) failed" at :1209 — report §2's claim is exact
```

So the sentence the prior review failed (B1: "read check NAMES and every body comment") is now narrowed to the
measured boundary at every site I read. **B1 is genuinely corrected and the number is true.**

One caveat, non-blocking, recorded as finding 1 above: the header says "26 of the 90 names **in this file**",
and the file this header sits in (`factory-guard.mjs`) has **0** `check(` names. The 90 are in
`factory-guard.check.mjs`. The number is supported only for a file the sentence does not name. Across every
scanned guard file the read coverage is different again:

```
$ node /tmp/count_read_names.mjs scripts/guards/*.mjs
check-acceptance-greps.check.mjs: opened=14 read=1 unread=13
copy-field-consumption-guard.check.mjs: opened=50 read=6 unread=44
factory-guard.check.mjs: opened=90 read=26 unread=64
fixture-marker-guard.check.mjs: opened=11 read=10 unread=1
no-bypass-guard.check.mjs: opened=6 read=0 unread=6
regexp-escape-guard.check.mjs: opened=6 read=1 unread=5
stale-locator-guard.check.mjs: opened=7 read=1 unread=6
vacuous-absence-guard.check.mjs: opened=4 read=0 unread=4
ALL guard .mjs: opened=188 read=45 unread=143
```

---

## 2. Judge 2 — is B2 genuinely corrected, and is the non-`.scratch/` escape declared?

**Yes, all three sites, and the ceiling is stated.**

```
$ grep -n "cites a file under\|named ceilings\|cites a \`.scratch/\` file still carries" scripts/guards/factory-guard.mjs
94://                         that cites a file under `.scratch/` must cite a line
100://                         rule: both are named ceilings, not covered shapes.
1429: * a transcript of a different rule — both are named ceilings, not covered shapes.
1522:  if (transcriptsChecked) claims.push('every pasted provenance transcript that cites a `.scratch/` file still carries the sha it names (or is marked historical; other paths and other rules are ceilings)')
```

The header bullet (`:93-100`), the JSDoc (`:1427-1431`) and the `ok —` claim (`:1522`) now all say a file
**under `.scratch/`**, and both bullet and docstring declare the other-path / other-rule escape as a *named
ceiling, not a covered shape*. That is exactly the D-027 remedy applied to B2. The mechanism agrees:

```
$ grep -n "startsWith('.scratch/')" scripts/guards/factory-guard.mjs
1446:      if (!cited.startsWith('.scratch/')) continue
```

`git diff e9b8cad 05edac7` shows the prior text was "that cites a file IN this repository" in all three places,
so the correction is complete rather than partial.

**Residual, non-blocking, and the same class the review already returned once (`ladder:`).** The bullet claims a
`.scratch/` citation "must cite a line that carries the sha it names, or be marked historical". The mechanism
also stands down silently on two further `.scratch/` shapes, neither declared:

```
1448:      if (!existsSync(target)) continue            # a .scratch/ path not on disk -> skipped
1449:      const sha = (/names\s+([^\s,]+)/.exec(line) ?? [])[1]
1450:      if (!sha || /[<>…]/.test(sha)) continue      # sha not introduced by "names", or a placeholder -> skipped
```

A pasted `count-provenance-unresolvable` finding that cites a `.scratch/` file which is not present in the tree
(e.g. renamed or deleted after the transcript was taken) is not checked, though the header says such a
citation must carry its sha. This is the same shape as B2 — the transcript bullet stating more than the rule
enforces — so per the ladder rule it should be declared, not re-argued.

---

## 3. Judge 3 — did the pass obey D-027 (no widening, no phrasing per escape)?

**Yes. Verified two ways.**

(a) The guard diff has exactly **one** non-comment changed line in the whole commit — the `ok —` output string:

```
$ git diff e9b8cad 05edac7 -- scripts/guards/factory-guard.mjs | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' \
    | sed -E 's/^([+-])[[:space:]]*/\1 /' \
    | awk '{ if ($0 ~ /^[+-] (\/\/|\*|\/\*)/) c++; else print "NONCOMMENT: " $0 } END { print "comment/blank lines changed: " c }'
NONCOMMENT: - if (transcriptsChecked) claims.push('every pasted provenance transcript that cites this repository still carries the sha it names (or is marked historical)')
NONCOMMENT: + if (transcriptsChecked) claims.push('every pasted provenance transcript that cites a `.scratch/` file still carries the sha it names (or is marked historical; other paths and other rules are ceilings)')
comment/blank lines changed: 34
```

No matcher, no `if`, no threshold, no regex changed. The only executable-line change is a printf string whose
*claim* was lowered.

(b) The matcher constant declarations are byte-identical between the mechanism commit `c0c024a` and HEAD:

```
$ diff <(grep -nE '^const [A-Za-z_0-9]+ = (/|new RegExp)' /tmp/rev/c0c024a.mjs | sed 's/^[0-9]*://') \
       <(grep -nE '^const [A-Za-z_0-9]+ = (/|new RegExp)' scripts/guards/factory-guard.mjs | sed 's/^[0-9]*://')
(no output)
```

So: **no matcher widened, no phrasing added per escape, no rule weakened.** The check file was not touched by
this commit at all. Judge 3 is a clean pass — the ruling was obeyed.

---

## 4. Judge 4 — is the residue declared with its number, per rule, in header AND §10.1, agreeing with the code?

**Yes on substance; two precision defects.**

Residue number: header `:63-64` "eleven fresh class instances were built and all eleven escaped"; report §10.0
(`:342-368`) lists all eleven by letter (A,B,C,D,E,F,G,H,L,M,N = 11 — counted), §10.2 (`:388`) states
"Eleven fresh class instances constructed; eleven escaped (A, B, C, D, E, F, G, H, L, M, N)". Header and report
agree.

Each rule's literal key, header vs §10.1 vs code:

| rule | header (`factory-guard.mjs`) | §10.1 (report) | code constant |
|---|---|---|---|
| 1a | `:56-58` "the only git call is" + backticked command | `:376` same | `:401` `/the only git call is\s+`([^`]*)`/` |
| 1b | `:58-59` "X is its own alternative" + backticked token + "alternative" | `:377` same | `:402` `` /`([^`]+)`(?:'s)?\s+alternative\b/ `` |
| 1c | `:59-60` "a phrase this file records as narrowed" | `:378` "*used to claim* / *was narrowed*" | `:404` `/used to claim|was narrowed|it was narrowed/` |
| 1d | `:61-62` `resolvable-pointer`, `claim-checkable`, `line-shows-it` | `:379` "resolvable pointer", "makes the claim checkable", "the line that shows it" | `:406` `/\bresolvable\s+pointer\b|\bmakes the claim checkable\b|\bthe line that shows it\b/` |
| 2 | `:50-53` body comments + names on the opening line (26/90) | `:380` same | `:419` name regex / `:415-424` |
| 3 | `:62-63` "the baseline is N" | `:381` "the baseline is N / the baseline holds N" | `:407` `/\bthe baseline\b…(?:is|holds)\s+(\d+)\b/` |
| 4 | `:93-100` pasted `count-provenance-unresolvable` citing `.scratch/` | `:382` same | `:1443-1452` |

Agreement defects (non-blocking):
- 1d: the header's three backticked labels are `resolvable-pointer`/`claim-checkable`/`line-shows-it`; the code
  (`:406`) and §10.1 (`:379`) use the space-separated literal phrasings. `grep -n "resolvable-pointer\|claim-checkable\|line-shows-it"`
  returns only the header lines (`:61-62`) — the labels it presents as the rule's keys appear nowhere else in
  the source, in the very sentence that says "KEYED TO LITERAL PHRASINGS".
- 3: the header names only "the baseline is N"; the regex also accepts "the baseline holds N" (`:407`), which
  §10.1 does state. Under-stated, not false.

---

## 5. Judge 5 — a fresh instance of the class in THIS pass's own artifacts

Found two blocking and four non-blocking, all introduced by `05edac7` (confirmed with `git log -S` on the
strings), none in the mechanism.

**Blocking 1 — a wrong `file:line` pointer (report `:402`).** `git log -S "factory-guard.mjs:1424"` ->
`05edac7` only. The sentence:

```
$ awk 'NR>=400 && NR<=404 {printf "%d: %s\n", NR, $0}' .scratch/v28/reports/slice-6c-fix-7.md
400: 2. **B2 — the `transcript-reproduces` sentence misstated its mechanism.** The header bullet, the JSDoc and the
401:    `ok —` claim said a transcript "that cites a file IN this repository"; the mechanism checks only `.scratch/`
402:    citations (`factory-guard.mjs:1424` skips every other path). Probe M (`scripts/guards/p.mjs:99`, bogus sha) ->
403:    exit 0. **Fixed:** all three now say "cites a file under `.scratch/`", with other paths and other rules named
404:    as ceilings.
```

`:1424` does not skip anything:

```
$ awk 'NR==1424 {print NR": "$0}' scripts/guards/factory-guard.mjs
1424:  * A pasted run is a claim that the command in it produces the lines under it.
$ grep -n "startsWith('.scratch/')" scripts/guards/factory-guard.mjs
1446:      if (!cited.startsWith('.scratch/')) continue
```

The pointer names the JSDoc sentence (which the same paragraph already cited as the thing being fixed), not the
skipping code. This is the slice's class in its purest form — a `file:line` claim the source contradicts — and it
was written by the pass whose subject is that class.

**Blocking 2 — a wrong number (report `:130`, `:406`).** `git show 05edac7~1:.scratch/v28/reports/slice-6c-fix-7.md | grep -n "matcher constants"`
-> `129:matcher constants are untouched by this pass` (the pre-fix text read "the **thirteen** matcher
constants"). `05edac7` changed it to "the **fourteen** matcher constants" (`:130`) and asserted in §10.3
(`:405-407`):

```
405: 3. **N3 — a written number the artifacts disagreed on.** §3 said "the thirteen matcher constants"; the ledger
406:    said 14; the measured artifact is **14**. Corrected to fourteen — and N3 was itself an instance of the class
407:    (a written number the artifact contradicts).
```

I cannot reproduce 14 under any count of the artifact:

```
$ grep -nE "^const [A-Za-z_0-9]+ = /" scripts/guards/factory-guard.mjs | wc -l
13          # 4 HEADER_* (:387-390) + 8 prose-rule consts (:400-407) + FIXED_SHA (:797)
$ awk 'NR>=392 && NR<=408 && /^const /' scripts/guards/factory-guard.mjs | wc -l
8           # the block the report calls "the constants block"
$ grep -nE "^const (HEADER_|GIT_INV|EXCLUSIVE|NAMED_|PROSE_|ABANDON_|POINTER_|BASELINE_)" scripts/guards/factory-guard.mjs | wc -l
12          # 4 header matchers + 8 rule matchers
$ grep -nE "^const [A-Za-z_0-9]+ = new RegExp" scripts/guards/factory-guard.mjs | wc -l
7           # BARE_HEAD_COUNT_AT/CMD/WC, COUNT_AT_SHA, COUNT_CMD_SHA, BARE_HEAD_COUNT, MOVING_REV_RE
```

Measured: **12** constant declarations in the matcher/header block (`:387-390`, `:400-407`), **13** top-level
regex-literal constants in the file (those 12 + `FIXED_SHA` at `:797`). No plausible command yields 14 (I tried
`= /` -> 16 incl. 3 inline regexes; `= new RegExp` -> 7; all-indent regex-literal consts -> 16; every regex-ish
const -> 23). The pass made a number **worse**: the pre-fix "thirteen" matches the top-level regex-literal
count exactly; "fourteen" matches nothing, and the sentence it sits in ("untouched by this pass") is also
untrue of the 8 rule constants, which this feature added. A number written about the mechanism that the
mechanism does not support, declared as *measured*, is precisely the tenth instance this slice exists to kill.

**Non-blocking instances** (findings 3-6 in the header block above): the header's unnamed 26/90 referent
(`:53`), the transcript bullet's undeclared stand-downs (`:1448-1450`, `ladder:` — same class as the previous
review's B2), the 1d key labels vs code/§10.1 (`:61-62` vs `:406` vs report `:379`), and §5's cross-reference
"(see §10.2)" for a number that lives in §10.1 (report `:230` vs `:386-391` / `:370-385`).

I found no claim in this pass that a *matcher* covers something it does not — Judge 3's answer covers the
mechanism side, and the four rules themselves remain as verified in earlier rounds.

---

## 6. Requirements traceability (the brief's criteria)

| criterion | status | evidence |
|---|---|---|
| B1 corrected; the number TRUE | **met** (referent caveat, non-blocking) | Judge 1: 26/64/90 reproduced with the guard's own regex; report `:46`,`:52`,`:303`,`:397`,`:383` all narrowed |
| B2 corrected in header + JSDoc + ok-claim; non-`.scratch/` escape declared a ceiling | **met** | Judge 2: `:94`, `:1427`, `:1522`, `:97-100`, `:1428-1430`; mechanism at `:1446` |
| D-027: no widening, no phrasing per escape | **met** | Judge 3: one non-comment line changed (an output string); matcher declarations byte-identical `c0c024a` -> HEAD |
| Residue declared with its number, per rule, header AND §10.1 | **met** (2 precision defects) | Judge 4: 11/11 stated in both; A–N listed; per-rule key table agrees except 1d labels and rule 3's "holds" |
| The class hunted in this pass's own artifacts | **not met** | Judge 5: 2 blocking (wrong pointer `:402`, wrong number `:130`/`:406`) + 4 non-blocking |

---

## 7. Closing context — what kind of defect is left

The mechanism is not in question. The four rules, their seeds and their mutations were verified in earlier
rounds and this pass changed no matcher (Judge 3). Nothing here is a behavioural defect.

What is left is, plainly:

1. **A WRONG POINTER** — report `:402` cites `factory-guard.mjs:1424` for the `.scratch/` skip; the skip is at
   `:1446`. Same class as a wrong number (a named location the artifact contradicts).
2. **A WRONG NUMBER** — "fourteen matcher constants" / "the measured artifact is 14" (`:130`, `:406`) against
   a measured 12 (matcher block) / 13 (top-level regex-literal constants). This pass *introduced* it by
   "correcting" a reproducible 13.
3. **An UNDER-DECLARED BOUNDARY** (lower severity, `ladder:` to B2) — the transcript bullet's `.scratch/` claim
   omits the two remaining silent stand-downs (`:1448-1450`).

None of the three is a mechanism defect, so per the human's framing nothing here requires reopening slice 6c's
behaviour or re-widening anything: two prose lines in `.scratch/v28/reports/slice-6c-fix-7.md` and one clause in
the guard header's transcript bullet. Because one of them is a wrong number — the exact class D-027 closed the
slice for — I return **NEEDS_CHANGES** rather than PASS, and I say so knowing the human has asked to close 6c:
the guard's mechanism, its boundary declarations for B1/B2, and the ledger correction are all sound.
