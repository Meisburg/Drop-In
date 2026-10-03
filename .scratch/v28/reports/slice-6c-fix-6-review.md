# V28 r2 slice 6c — ROUND 6 REVIEW (fresh context). Verdict: **NEEDS_CHANGES**

**Reviewed:** `git diff 1c3471a..HEAD`, HEAD = `ef21f96` (the brief names `674ad96`; the orchestrator added
`ef21f96` — D-019 marked superseded + work state — while this review was running; it touches
`factory/decisions.md`, `.scratch/v28/ledger.md`, `factory/work/v28-r2-6c.json` only).
**Claim under test:** `.scratch/v28/reports/slice-6c-fix-6.md` (read as a CLAIM, not evidence).
**Spec under test:** `factory/decisions.md` D-019/D-020/D-021 and the round-6 brief.
**Disclosure:** this reviewer ran on the same model family as the implementer — a sibling, not an independent
model (D-007/D-015). Every sentence below was re-measured against the artifact it names.
**Repo hygiene:** `git status --porcelain` empty before and after; all mutations on `/tmp` copies only; the
`ocr` CLI and `systemctl`/inference servers were not touched; the gate was not run (this lane judges whether
evidence exists).
**Guard files, sha256 at start == at end (unchanged):**

    45d3821395857f26e6c57f7cd76e145d243e17e62b63b8007e846e7aa99e9a4d  scripts/guards/factory-guard.mjs
    63c6c8dc8e80c203bea63df00b33675eaa3c7fd069032bc64325d6033d71d2fa  scripts/guards/factory-guard.check.mjs
    2922f042c0e2a59564c0c999467920cdf93f191438166ae9efdda1cd270f17f8  scripts/guards/regexp-escape-guard.mjs
    536bdaeac46bd6c85d3f45c3076d476fd40d6bf9b705f922e8a3707ae072aeda  scripts/guards/run-all.sh

---

## 1. THE CENTRAL QUESTION — was the ruling implemented, or satisfied in name?

**It was implemented for the canonical, undressed spelling, and the implementation is load-bearing. It is
satisfied only in name outside that spelling, and the header does not say so.**

### 1.1 The decisive test the builder claims — REPRODUCED, the win is real

Harness: a fresh root holding the repository's own `reports/`+`briefs/` (so the baseline is present) plus one
seeded file; run with the real instrument.

    $ node scripts/guards/factory-guard.mjs --root <root>   # seed: "The tree held 276 tracked `.scratch` files at 1c3471a."
      note — count-provenance: 77 provenance token(s) in the scan, 21 distinct sha(s) ... 0 unresolvable
    PASS — exit 0
    $ ... same seed with the sha `deadbee`
      note — count-provenance: 77 provenance token(s) in the scan, 22 distinct sha(s) ... 1 unresolvable
      FINDING [count-provenance-unresolvable]: .scratch/v28/reports/zz-probe.md:1: a count's provenance names
        deadbee, which is not a commit in this repository (`git cat-file -e deadbee^{commit}` fails)
    exit 1

A bogus sha **is** a finding, it is **not** in the baseline, and the `git cat-file -e <sha>^{commit}` gate the
human named is the one that fires. **D-021 item 1 is implemented, not named.** Independently measured:
the scan carries **76 provenance tokens / 21 distinct shas, 0 unresolvable** (my own counter, §8), and
`git cat-file -e` is the arbiter for each.

### 1.2 Is the rule load-bearing after absorbing a 5× baseline? — YES, with one measured exception

    A) REAL lane file, NEW occurrence of a baselined shape appended:
       $ printf '\nPROBE: the corpus reports 265 at HEAD\n' >> .../slice-6b-fix-1.md
       FINDING [no-bare-head-count]: .scratch/v28/reports/slice-6b-fix-1.md:316 ... "265 at HEAD"   exit 1
    B) A new file carrying the same shape:
       FINDING ... zz-probe-new.md:1 ... "412 tracked files at HEAD"                                exit 1
    C) Control, the SAME real lane file, the SAME sentence with the count BOLDED:
       $ printf '\nThe builder measured **265** at HEAD in this same review file.\n' >> .../slice-6c-fix-2-review.md
       PASS — exit 0
    D) Control: the same sentence with the count undressed -> FINDING ... "265 at HEAD"              exit 1

The baseline is **not** "everything existing is allowed" — but it is not the whole truth either: **C** is a
brand-new occurrence of the class in a real lane file that passes. That is B1' below.

### 1.3 The baseline's 5× growth — REPRODUCED EXACTLY, and it is honest

I rebuilt the instrument's own per-arm match counts from the regexes in the committed file, over the corpus at
three commits (`/tmp/snap.mjs`, applying the instrument's own fixed-sha exemption):

    corpus@1c3471a (round-5 end, 122 files):  union 358 / keys 217   arms a1=102 a2=125 a3=145   tokens 75 / 20 shas
    corpus@3920065 (123 files):               union 372 / keys 230   arms a1=104 a2=130 a3=153   tokens 75 / 20 shas
    corpus@HEAD    (124 files):               union 442 / keys 255   arms a1=124 a2=150 a3=183   tokens 76 / 21 shas

Every number in the report's §4 reconciles: **372/230** is the pre-report re-derivation, **442/255** the final
one, **104/130/153** are the per-arm totals at `3920065` that the report calls "what grew", and the
union-growth 355 < 387 = the sum, exactly as the report's sentence says. The old map is 87/47 (86/46 by my
parser, which drops the one key carrying an escaped `"` — the shortfall is my parser, not the map). **No honesty
finding here.** All 21 distinct shas resolve as commits (measured one by one).

### 1.4 The QUALITY of the decidability — two measured holes, one declared ceiling

**(a) Resolvable-but-wrong commit — declared, and the declaration is honest.** `… 276 files at 37b8dd8`
(37b8dd8 is a real earlier commit, the count is not from it) → **PASS, exit 0**. The builder declares this in
the guard header (`factory-guard.mjs:461-465`) and in the report (§8). Judgement: **honest, not hollowing.**
D-021's own operative text prescribes exactly `git cat-file -e <sha>^{commit}` — existence and commit-ness.
Identity ("is the sha the tree the count came from") is not computable from the sentence, so the residue is the
ruling's, not the builder's. It is declared in both places. **No finding.**

**(b) The `at`-connector boundary — declared, and defensible.** `276 files, measured from deadbee` → PASS,
not counted as a token (76 tokens, not 77). The header (`:466-471`) and the report (§8) name it, and it buys
the content-hash control. **No finding** — see B2 for the *undeclared* half of the same boundary.

**(c) The sha is verified only when the COUNT is undressed, and when no punctuation follows the sha.** Both
are undeclared and let a wrong sha through. **B1 and B2 below.** This is the answer to the human's question:
the decidability is real, but its reach is narrower than the header states and the ceiling list does not name
the difference.

---

## 2. BLOCKING FINDINGS

### B1 — a WRONG sha passes whenever the count is dressed; the header says the count may carry that dress
`scripts/guards/factory-guard.mjs:536` (`COUNT_TOKEN`, trailing lookahead `(?=\s+[a-zA-Z`])`), `:573-575`
(`COUNT_AT_SHA`), header `:392-406`.

The header claims (report line 52 quotes it): *"the count may carry the punctuation English puts between a
number and its label (`.scratch`, `src/lib`, `(tracked)`, `87, taken at <sha>`, `87 as of <sha>`)"*. The
implementation makes the count token require **whitespace then a letter/backtick immediately after the
digits**, so every report-shaped dress defeats it — and with the count token gone, `COUNT_AT_SHA` never
recognizes the provenance at all, so the sha is neither counted nor verified:

    $ probe '<seed>' with a BOGUS sha (all of these PASS, exit 0, 76 tokens — i.e. not one was even counted):
      "The tree held **412** tracked files at deadbee."                PASS
      "The tree held 412 (tracked) files at deadbee."                  PASS
      "| 412 | tracked files at deadbee |"                             PASS
    same three with "at HEAD" instead of a sha — ALSO PASS, no finding:
      "The tree held **412** tracked files at HEAD."                   PASS
      "The tree held 412 (tracked) files at HEAD."                     PASS
      "| 412 | tracked files | at HEAD |"                              PASS
      'The tree held "412" tracked files at HEAD.'                     PASS
      "The tree held 412: tracked files at HEAD."                      PASS
    control in the same harness: "The tree held 276 tracked files at deadbee."  -> FINDING

**This is not a constructed probe.** Four LIVE lines in the corpus carry the class in exactly this dress, and
none of them is in the baseline (all four are unmatched, which is why the whole repo copy passes; the only `**`
occurrences in the baseline map are git glob keys such as `.scratch/**/*.mjs`, never a bolded count):

    .scratch/v28/reports/slice-6c-fix-2-review.md:226   writeFileSync` → **3** at HEAD (import, helper, premise) vs **7** at `c2ec32e`
    .scratch/v28/reports/slice-6c-fix-1-review.md:18    ... were taken; **265** at `c2ec32e`/HEAD.
    .scratch/v28/reports/slice-6c-fix-3-review.md:165   The builder measured **2067** at its HEAD
    .scratch/v28/briefs/slice-6c-fix-2.md:60            > ... were taken; **265** at `c2ec32e`/HEAD.

Each seeded alone in a fresh root → `PASS`, exit 0.

**Severity.** The DECIDABLE half is the thing D-021 exists for, and here a wrong named commit is not a finding
but a silent pass — in the two spellings lane reports actually use for counts. The header's own claim that
"naming a commit is necessary AND sufficient here" (`:404-405`) is false for these spellings, and
`docs/agents/code-structure.md:121-127` makes that header/implementation disagreement the defect. The report
(§2.1) reproduces the header sentence that promises the dress is accepted; measured, it is not.

### B1' — `ladder:` the same dress is also a fresh instance of the DETECTOR class
Same citation (`:536`, `:560`). `**412** tracked files at HEAD` / `| 412 | … at HEAD |` /
`412 (tracked) files at HEAD` are counts whose stated provenance is a bare moving revision, and they pass.
This is the class D-020 predicted a further round would reproduce ("the round would again find a fresh
instance of the class in its own report (it did, in rounds 1-6)"), and round 6's ceiling list
(`factory-guard.mjs:456-515`, report §8) does not name it. It is pre-existing, not a regression — the
round-5 arm also required `\d+\s+`, so the dress was never reachable by either instrument; the round-6 header
now claims the arm "is about the TOKEN, not about one English sentence shape", which is what raises it to a
finding. Prefix applies because the *class* is the one five previous reviews returned; the **decidable-half**
half of B1 is *not* a ladder finding (it is a defect of the mechanism D-021 introduced).

### B2 — punctuation after the sha defeats the canonical form; the header says either word order in the clause
`scripts/guards/factory-guard.mjs:540` (`COUNT_GAP` requires `\s` immediately after the sha), `:573-575`,
header `:395` ("may sit in either word order within the same clause"; report line 52 quotes it, report line 69
re-states it).

    seed                                                        | tokens | verdict
    "The corpus stands at deadbee 276 tracked files were..."    |  77    | FINDING  (reverse order, space after the sha)
    "The corpus stands at deadbee, 276 tracked files were..."   |  76    | PASS     <-- not recognized
    "The corpus stands at deadbee: 276 tracked files were..."   |  76    | PASS     <-- not recognized
    "The corpus, at 1c3471a, held 276 tracked files."           |  76    | PASS     <-- not recognized
    "at 1c3471a, 276 files were present."                       |  76    | PASS     <-- not recognized
    "at 1c3471a 276 files were present."                        |  77    | PASS (valid sha, but COUNTED)

A count's canonical `at <sha>` token written *inside a comma or a colon* — the commonest English parenthetical —
is not a provenance token at all: with a bogus sha it is a **silent PASS**, and the run's own token counter does
not move, so the reader is not even told a token was skipped. The declared ceiling (`:466-471`) names a sha
written *without* the connector; it does not name a sha written *with* the connector and then punctuated. The
header's "either word order" claim is true only when a whitespace character follows the sha.

Also measured on the count-punctuation side (same mechanism, same line): `276 tracked files at HEAD` fires
(`:540` gap ok), `276 — at HEAD` fires, `276 files at deadbee; nothing else` fires, `276 files at deadbee)`
fires — so the failure is specifically punctuation/space directly after the sha, and dress after the count.

---

## 3. NON-BLOCKING FINDINGS

### N1 — ARM 3's stated property is wider than the arm; a counted git command piped through a filter is missed
`scripts/guards/factory-guard.mjs:568` (the middle class is `[^\n|`]`, so it cannot cross a `|`); header
`:443-444` says ARM 3 is *"a counted git command that names NO fixed revision: `git <anything> … | wc -l`"*.

    "git log --oneline | grep -c \"round 6\" | wc -l"     -> PASS, exit 0 (no finding)
    "git ls-files src | grep -c \"\.ts$\" | wc -l"        -> PASS, exit 0
    control "git ls-files src | wc -l"                    -> FINDING

A lane counting the tree through a filter (`git ls-files … | grep … | wc -l`) has no reproducible provenance
and is uncaught; the header claims the property covers it. Not on the ceiling list (`:496-505` covers the
template case and filesystem counts, not a filter in the pipe).

### N2 — a count labelled `@{2}` (the bare reflog spelling of HEAD) is missed, and the header's `@` bullet is garbled
`scripts/guards/factory-guard.mjs:531` (`@(?![{\w])` suppresses the bare `@{…}` form); header `:483-485`.

    $ git rev-parse @{2}      -> 8f3296127f4944490850eeb53ec640230da8ab43   (== git rev-parse HEAD@{2})
    seed "The tree held 276 tracked files at @{2}."        -> PASS, exit 0
    seed "276 tracked files at @{3}"                       -> PASS, exit 0
    control "276 tracked files at HEAD@{2}."                -> FINDING
    control "276 tracked files at @."                      -> FINDING

`@{2}` resolves as a commit, so it is a moving revision, and D-019's table lists `HEAD@{…}` as in scope; the
bare-`@` shorthand fires but the bare-`@`+reflog-selector does not. The header bullet ("The lookahead's only
reachable job is a bare `@{…}` reflog spec — the token's own `(?!\w)` end excludes the email and decorator
shapes before the lookahead is consulted") describes the lookahead's *job* without declaring the resulting
miss, and the ceiling list (report §8) omits `@{…}` entirely. Either declare it or drop the `{` from the
lookahead — but as written, a capability is described and not held. (The check suite at
`factory-guard.check.mjs:498-512` names `@{…}` a *control*, i.e. it encodes "must not fire" as the intended
behaviour, which does not match the semantics the rest of the instrument claims for `@`.)

### N3 — `resolveRepo()` short-circuits the header's three-step order, and the printed NOTE says otherwise
`scripts/guards/factory-guard.mjs:854-860` (`await`-free `resolveRepo`), `:895` (the NOTE); header `:418-426`.

    $ node scripts/guards/factory-guard.mjs --root "$PWD" --repo /tmp/empty      # scan root IS a worktree
      note — count-provenance: no git worktree to resolve provenance shas against (looked for --repo, then
      this scan root, then this instrument's own repository) — the provenance shas of counts are NOT verified
      ok — ... (the "provenance sha resolving as a commit" claim correctly absent)
    $ node scripts/guards/factory-guard.mjs --root "$PWD" --repo /tmp/does-not-exist
      same note, exit 0
    $ node scripts/guards/factory-guard.mjs --root /tmp/r6base                    # no --repo, not a worktree
      note — count-provenance: 76 provenance token(s) ... resolved ... 0 unresolvable   (fallback works)

With `--repo` given, the other two candidates in the header's stated order are never consulted: the code is
`repoFlag === -1 ? [ROOT, own] : [resolve(argv[repoFlag+1])]`. The NOTE asserts all three were looked at, and
they were not. Effect: one stale `--repo` argument silently disables the decidable half for a whole scan whose
root is a worktree — the claim is dropped from `ok —` (good, that part is implemented as stated) but the
diagnosis a reader gets is false. No false finding is manufactured; the defect is the header/NOTE claim.

### N4 — the round-5 report's three corrections: JUDGED, and they respect D-011 item 2
`.scratch/v28/reports/slice-6c-fix-5.md:100` (R5-3), `:493` (R5-1), `:530` (R5-2). D-011 item 2 rules that the
historical records keep their labels, because *"a record retro-edited to look like it was always right is not
evidence"*. On the artifact:

- Each of the three edits carries a visible `**ROUND 6 CORRECTION**` block that names what the sentence used to
  say and quotes it verbatim (R5-1: *"It said both 'were silently dropped by the same `\b`'"*; R5-3: the old
  `grep -c` line and its `0`; R5-2: *"'each can fail' was FALSE for the second check"*). A reader cannot mistake
  the record for always-right, so D-011 item 2's stated reason is satisfied.
- The edits are inside **this lane's own artifact**, ordered by the round-6 brief (D-021's own "also owed"
  paragraph), not another lane's measurement record — which is what D-011 item 2 was protecting. The brief
  explicitly directed both edits.
- The corrected sentences are **true**, verified by me against the pre-repair guard
  (`git show 37b8dd8^:scripts/guards/factory-guard.mjs`, which is where the `\b` actually was — `99d044f`
  predates the whole rule and would have been the wrong artifact to test):
  `276 tracked files at HEAD^` → `FINDING … "276 tracked files at HEAD"` (truncated, not dropped);
  `at HEAD@{2}` → same; `at @` → `PASS` (truly dropped); `at HEAD~1` → full label.
- The commit subject that cannot be rewritten (`37b8dd8`) is named in the correction, so the surviving
  overstatement is disclosed rather than hidden.

**Ruling: D-011 item 2 is RESPECTED.** Residual note only: the original words now survive as a quotation inside
the correction plus git history, so the record's visible state is "corrected with the old text quoted", which is
the shape the ruling asks for.

Also re-measured, the two corrections' other claims: R5-2's old control root under a lookahead-removed mutant
exits **0** (as the correction says) and the rebuilt root under the same mutant exits **1** (control reachable);
R5-3's pair is reproducible — pre-fix guard on a blank-line seed `grep -c instrument-headers-honest` → **0**,
round-6 guard → **1** with the identical finding `zz-blank.mjs:4`; the blob grep → **3**. All honest.

### N5 — the D-019 table: leaving it was right, and it is now flagged superseded
`factory/decisions.md:419-424`. The builder left D-019 untouched and disclosed it with `file:line` (report
`:486-488`), offering a D-023. The orchestrator's `ef21f96` (in range) added the banner: *"SUPERSEDED … D-021
replaced the lexical arms with a canonical, verified provenance token … read D-021 and the guard's own header,
which is authoritative."* A reader who finds D-019 first now cannot misread it as the current spec. Touching
`factory/decisions.md` was outside the builder's brief; the disclosure + banner is the right resolution.

---

## 4. THE CEILING LIST — enumerated, then probed for a shape that is not on it
The list as written (`factory-guard.mjs:456-515`, restated report §8): implied-provenance counts;
resolvable-but-wrong commit; sha without the `at` connector; a token that is neither moving-rev nor sha
(`at latest`, 6-hex); `<HEAD>`/`MERGE_HEAD`-style refs; other moving refs (branch/tag); ARM 1's 4-token
proximity window and its prose cost; ARM 3 template-vs-measurement; filesystem counts; files outside scope.

**Probed shapes missed but NOT on the list:** (B1/B1') count dress — `**412**`/`| 412 |`/`412 (tracked)`/`"412"`/
`412:` before the label (4 live corpus lines); (B2) punctuation directly after the sha (`at <sha>,` / `at <sha>:`);
(N1) a counted git command piped through a filter; (N2) a bare `@{2}` reflog label. All four are measured above
with the command and the raw verdict; none is named in the list. The list is honest about what it names and
silent about what it does not — which is the one thing `docs/agents/code-structure.md:121-127` does not allow.

---

## 5. HONESTY OF THE REPORT — every number I could recompute, I recomputed
Reproduced exactly: `442` occurrences / `255` keys (run-time NOTE and my own counter); `372/230` at the
pre-report corpus (`3920065`); per-arm `104/130/153`; `76` provenance tokens / `21` distinct shas / `0`
unresolvable; the guard `PASS` exit 0 on the clean repo and on the corpus copy; `38` baseline keys for
`slice-6c-fix-6.md`; the report's own grep is empty once committed (report §12) — confirmed; `AGENTS.md` 1789
words (I counted: `wc -w` = 1789); `git show 99d044f:… | grep -c instrument-headers-honest` = 3; 24 new
`check(` sites in `factory-guard.check.mjs` (57 `check(` call sites in the file, consistent with the 57 the
report's run prints); the central check's
mutation flips (sha scan removed → the bogus-sha seed PASSes, exit 0); the `@`-lookahead mutation flips the
rebuilt control (exit 1 vs 0). The report's `npm run verify` block is the one claim this lane cannot re-run
(it is the gate): it is presented as a raw tail with concrete numbers and a raw log path, and every number in
it that does not require running vitest (AGENTS.md words, guard/check counts) is correct. **No honesty
finding.**

---

## 6. REQUIREMENTS TRACEABILITY (D-021 + brief)

| Requirement | Status | Evidence |
|---|---|---|
| 1.1 canonical provenance token defined in the guard header | **met** | `factory-guard.mjs:392-398`; report §2.1 |
| 1.2 a sha naming a commit is VERIFIED; a bogus sha is a FINDING | **partially met** | canonical undressed form: FINDING + exit 1 (reproduced). Dressed count (B1) and punctuation after the sha (B2): silent PASS, not counted, not declared |
| 1.2 not-a-git-worktree behaviour decided; no silent pass, no false finding | **met for the behaviour; the NOTE's claim is false when `--repo` is given** (N3) | `--repo <non-worktree>` → NOTE + claim dropped from `ok —`, exit 0; `--root <gitless>` → fallback to this repo, 76/21 resolved |
| 1.3 arm 1 about the moving-rev token adjacent to a count, either order | **partially met** | reverse order fires (`HEAD the corpus reports 90`, live `slice-6b-fix-1.md:292`); `.scratch`/`src/lib`/`(tracked)`/`87, taken` all fire; but the count token's dress defeats it (B1') |
| 1.4 arm 3 from an eight-name list to the property | **partially met** | `show/reflog/blame/annotate` fire, and `branch/stash/status` fire; a command piped through a filter does not (N1) |
| 1.5 arm 2 sees global options and quoted revs | **met** | all five invocations fire (`--no-pager`, `-C`, `-c k=v`, `"HEAD"`, `'HEAD'`); both mutations flip |
| 1.6 working-tree count `git status --porcelain \| wc -l` decided | **met (enforced)** | FINDING; the old "KNOWN GAP" bullet is deleted |
| D-021 item 2 — absorb the red by RE-DERIVATION, never by hand | **met** | 372/230 → 442/255 reproduced from the instrument's own matches; map equals my independent count |
| brief: correct the three false round-5 artifacts | **met** | N4 — all three corrections visible, quoted, and independently verified true |
| brief: header states which half is decidable and which is a declared ceiling | **partially met** | the split is stated (`:400-406`, `:456-515`); four missed shapes are not in the list |
| brief: keep the honest parts of round 5 | **met** | `@` arm, `matchAll`, independent derivation, SCOPE block, reworded `ok —`, the scheduler test split — all present in the diff |
| brief: `factory/config.json` untouched | **met** | not in the diff |

---

## 7. IS THIS A SPECIFICATION DEFECT OR AN IMPLEMENTATION DEFECT?

**An implementation defect.** D-021 was ruled; the mechanism that implements it exists and fires. What fails
is the *fit between the mechanism and the header that describes it* — the count token (`:536`) and the gap
(`:540`) are narrower than the canonical form the header writes down (`:392-398`) and narrower than the
ceiling list admits (`:456-515`). No new specification ruling is needed to close B1/B2/N1/N2/N3: they are token
definitions plus the ceiling wording, all inside the artifact D-021 already authorises.

Per the standing escalation protocol, the triple for the human anyway:
- **Invariant:** a count's stated provenance must be a fixed, resolvable commit, and a violation must FAIL
  mechanically (D-021).
- **Detection rule:** the existing `N at <sha>` + `git cat-file -e <sha>^{commit}` for the decidable half, plus
  the three moving-rev arms for the residue.
- **Exact missed shapes:** `**412**` / `| 412 |` / `412 (tracked)` / `"412"` / `412:` between a count and its
  label (missed by BOTH halves — a wrong sha passes); `at <sha>,` and `at <sha>:` (the decidable half alone);
  `git … | <filter> | wc` (arm 3); `at @{2}` (arm 1). Four live corpus lines exist for the first shape.

---

## 8. RESIDUAL UNCERTAINTY / WHAT I DID NOT DO
- I did not run the gate (`run-all.sh` / `npm run verify`) — reviewer lane, not verifier. The report's verify
  numbers are therefore accepted as claimed, with the caveats in §5; the one delta I can fully confirm is
  `AGENTS.md 1789`.
- My per-arm counter is a reconstruction from the committed regexes, not the instrument itself; it reconciles
  to the baseline exactly (442/255) with the instrument's own fixed-sha exemption applied, which is why I trust
  the deltas.
- Harness detail: every probe ran in a `/tmp` root containing a copy of the repository's `reports/`+`briefs/`
  plus one seeded file (so the baseline is present and a PASS is meaningful); the instrument used was always
  the committed `scripts/guards/factory-guard.mjs`. Mutants were copies under `/tmp`. No repo file was
  modified; guards' sha256 unchanged (§ top).

## 9. VERDICT

    Verdict: NEEDS_CHANGES

**Recommended next action:** a bounded repair — widen `COUNT_TOKEN`'s trailing assertion and `COUNT_GAP` to the
form the header writes down, widen or declare arm 3's filter case and arm 1's bare `@{…}` case, and correct the
`resolveRepo` NOTE/header step-order sentence — then re-derive the baseline and re-state the ceiling list as
the four measured shapes above; this is an implementation defect inside D-021, not a specification round.

---

## 10. FINAL STATE (appended last, as produced)

    $ git rev-parse HEAD                      -> ef21f96de208fb5f1a51e82be8bc87c5ef93d9f1
    $ git status --porcelain                  -> (empty)
    $ sha256sum scripts/guards/*.mjs scripts/guards/run-all.sh  -> identical to the values in the header of
                                                 this review (diff of start vs end: no output)

Two mutations of this review's own prose were made after the first write (both accuracy corrections, recorded
here rather than silently): the baseline-`**` sentence now says the only `**` in the map are git glob keys, and
the check-count sentence now says "57 `check(` call sites … consistent with the 57 the report's run prints"
instead of claiming I observed the run-time counter. No measurement, verdict or citation changed.

**The whole diff is reviewable and each changed line traces to the slice** — with one exception worth naming:
`scripts/guards/factory-guard.mjs:854-860` (`resolveRepo`) carries a behaviour the header's step-order sentence
(:418-426) and its own NOTE (:895) describe inaccurately (N3). Everything else in the diff — the header
rewrite, the three arms, the two provenance patterns, the re-derived map, the 24 new checks and their
`mutatedGuard` anchor assertion, the three labelled corrections — is in-scope and load-bearing.
