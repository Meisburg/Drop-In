# Slice 6c — FIX ROUND 4 (findings from the fix-round-3 reviewer, verbatim)

**Working directory:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
**Base for this round:** `7fe7003` (HEAD — the orchestrator's D-011 log; not part of this slice)
**Fix round 3's slice commits:** `20773ee` + `b4a8b73`. **Round 3's lanes:** verifier `VERIFY: PASS`, reviewer `NEEDS_CHANGES`.
**Read `docs/agents/code-structure.md`.** Small edits plus **one new guard rule**.
**Report to `.scratch/v28/reports/slice-6c-fix-4.md`.**

---

## ⚠️ You are a FRESH builder. Round 3's builder is not resumed — this is the ladder's rung 4.

**Write the report FIRST and append raw command tails as you produce them.** A builder was OOM-killed
mid-round earlier in this batch; its evidence survived only because it was appending as it went.

**The three habits this slice keeps paying for:**
- **Never `rg -r`.** Read every value out of the command that produced it, **in the same call that records it.**
- **Never put a shell-mangled pattern on a command line.** Write the needle to a file and use `-f`.
- **Never state a number, count, or history fact you have not just measured** — and **never label a number
  `HEAD`.** Round 3's blocking finding is a fresh instance of exactly that, written *inside the bullet that
  praises another file for being dated*. This is the fourth time this class has cost a round. That is why
  this round adds a rule for it (N3 below).

---

## Machine state — do not fight it, do not "fix" it

You are routed to `ollama-cloud/deepseek-v4.1-flash:cloud` because the local `strata-max` worker is
**resource-blocked**: it needs 30 GB VRAM and `ninfer-serve` holds the GPU. **Do not start `strata-max`, do
not stop `ninfer-serve`, and do not report either as a finding.**

**`npm run verify` baseline that must not move — RE-MEASURE IT, do not copy it:** as of `7fe7003` it is
**71 test files / 2067 tests / 81 lint warnings / 0 errors / GUARDS PASS**. ⚠️ You are adding tests this round,
so **your** numbers will differ; state your own measured numbers and account for every one of them. Never
carry a baseline forward from a brief — that error was the orchestrator's last round and it is recorded in
`factory/decisions.md` D-011. oxlint prints **no summary banner off-TTY**: count with `grep -c ': warning '`
and `grep -c ': error '`.

---

## B1 (BLOCKING) — `.scratch/v28/reports/slice-6c-fix-3.md:526` is a NEW bare-`HEAD` count label

> `   276 tracked \`.scratch\` files at HEAD — see the N1 table). Left alone and **correct as written**: it is`

**Confirmed by the orchestrator, read-only:**

```
$ git ls-tree -r --name-only 71bdd55 .scratch | wc -l   → 276
$ git ls-tree -r --name-only 20773ee .scratch | wc -l   → 277
```

`71bdd55` was HEAD **at the moment of measurement**, and the sentence is **committed in `20773ee`**, whose
`.scratch` holds **277** — because the commit *itself* adds a tracked file under `.scratch` (the report).
That is verbatim the defect the brief's N1 names: **"a bare `HEAD` inside the commit that *moves* HEAD"** —
and round 3's own brief said in as many words: **"Do not introduce a new bare `HEAD`."**

**Fix:** name the commit — `276 at 71bdd55`. One line. Then **grep your own report** for every other `HEAD`
count label before you commit; you have already been caught by this once.

**The `ladder:` tag matters:** the reviewer tagged it `ladder:` because the *class* belongs in a rule, not in
a fifth round. So fixing the sentence is only half of B1 — **N3 below is the other half.**

---

## N1 — `scripts/guards/factory-guard.mjs:315`: a blank line truncates the header scan

The `instrument-headers-honest` scan ends at the first line that is not a comment, and **a truly empty line
counts as "not a comment"**, so a blank line inside a header block silently stops the scan.

**Confirmed by the orchestrator, read-only:**

```
$ printf '#!/usr/bin/env node\n// first comment\n\n// all 9 checks passed after a blank line\nprocess.exit(0)\n' \
    > /tmp/nb2/scripts/guards/zz-blank.mjs
$ node scripts/guards/factory-guard.mjs --root /tmp/nb2 | grep -c instrument-headers-honest
0        # the seeded typed count after the blank line was NOT flagged
```

The same file with the count **before** the blank line **is** flagged, so the break is the cause, not the
regex. **It is latent today** — the reviewer scanned every `scripts/guards/*.mjs` header and found **zero**
with a blank line before the first code line — **but it is a one-character-class gap in the rule that is this
round's centrepiece, and it must not be left as a latent hole.**

**Fix:** the scan must tolerate blank lines inside a header block. **Add a behavior-check seed for exactly
this shape** (a typed count *after* a blank line, inside the header) — the rule's own check must be able to
fail on it, or the fix is unproven.

---

## N2 — `scripts/guards/factory-guard.mjs:347`: the `ok —` line claims more than was checked

```
$ node <factory-guard> --root /tmp/rev6c/nosg     # a root with factory/config.json and NO scripts/guards
  note — no scripts/guards under this root; instrument headers unchecked here
  ok — 5 model(s), 8 task kind(s), 0 work item(s); every floor meetable, every artifact present,
       every instrument header stating only what it can point at
```

**No header was checked, yet the summary asserts every header is honest.** The `note` precedes it, so this
is a disclosure nit rather than a false claim — but **a summary that claims a check it skipped is the same
failure mode this whole round is about.** Fix the `ok —` line so it only claims what it checked.

---

## N3 — the class rule: a count in a report must name the commit it was measured at

**This is why there is no fifth round, and it is the second half of B1.** `instrument-headers-honest` only
scans `scripts/guards/*.mjs` **headers**. It cannot see report prose — which is where this class has now
recurred **four times** (N1's three labels, then B1's fresh one).

Add **`no-bare-head-count`** to `scripts/guards/factory-guard.mjs`:

- **Scan** tracked markdown under `.scratch/v28/reports/` and `.scratch/v28/briefs/` — i.e. the reports and
  the briefs, which are the artifacts that carry measurements.
- **Flag** a line that labels a **number** with an unresolvable head: a digit near `at HEAD` / `at the HEAD`.
  A count labelled `HEAD` inside a commit that moves `HEAD` is unreproducible by construction, which is the
  whole defect.
- **It MUST be forward-only, and this is a hard requirement.** `factory/decisions.md` **D-011 item 2** ruled
  that historical records **keep their original labels** — a record retro-edited to look like it was always
  right is not evidence. There are **7 pre-existing occurrences in other lanes' files** that must **stay**
  (the reviewer measured them: `git grep -n -f <needle> -- ...` → the surviving `265 at HEAD` sites).
  So the rule needs a **recorded baseline** — an explicit list of the known occurrences, by
  `file::line-text` or equivalent — and it **fails only on a NEW one**. **Print the baseline's size** in the
  guard's output so it can only shrink by a deliberate edit, never by accident.
- **Ship a behavior check** in `factory-guard.check.mjs`: seed a report with a bare-`HEAD` count and require
  the guard to fire; plus a **control** proving a baselined occurrence still passes (D-011 honoured) and a
  report naming a commit passes. **A rule whose check cannot fail is a comment.**
- Register it in `factory-guard.mjs`'s header rule list and in the `ok —` line (consistent with N2).

**Check yourself against the rule you just wrote:** your own report must not contain a bare-`HEAD` count.
If it does, the rule you wrote catches you — which is the correct outcome and you should say so rather than
weaken the rule.

---

## N4 — `.scratch/v28/reports/slice-6c-fix-3.md:129`: another `HEAD` identity label

> `$ node scripts/guards/regexp-escape-guard.check.mjs | grep -c "^  [✓✗]"  # HEAD's check == 04921d8's, same sha256`

Measured: `04921d8`'s check is `6a5aa3d3…`; at the committed HEAD it is `8493f7e8…`. It was true at
measurement time and round 3's own N4 note discloses the movement, so the **number it justifies (12) is
sound** — this is a **record-label** instance, same class as B1.

**Fix:** name the commit the hash belongs to. Do not change the number; it reproduces.

---

## N5 — `.scratch/v28/reports/slice-6c-fix-3.md:16`: a wording imprecision

> `One finding **rejects the brief's own wording**`

The brief's N2 instruction **agreed** with the builder; only the brief's **quotation of the old docstring**
is the thing being rejected. Round 3's own N2 row (`:31`) states this correctly. **Fix the framing so the
two do not disagree.** Wording precision, not substance.

---

## What round 3 got right — do not undo it

The reviewer upheld these with measurements; **leave them alone:**
- **The N7 narrowing is honest, not a rule shaped to pass.** The literal reading fires on exactly the two
  other-lane lines the builder named; the narrow rule does not; and removing the self-subject gate **does
  not** turn the behaviour check red — so the narrowing was a boundary, not a dodge. **D-011 already ruled
  the widening out of scope**; it belongs on its own work item.
- **The 2065-vs-2067 discrepancy was the orchestrator's stale brief**, confirmed independently by both
  round-3 lanes: no test file is in the builder's diff, and `1281c9b` (an orchestrator commit) added the two
  `it(` sites. **The builder was right to name it instead of matching the brief.**

---

## Verification — you run this, and you report the raw tail

1. `node scripts/guards/factory-guard.check.mjs` → exit 0, every check fires, and the **run-time** counter's
   total agrees with an independent count of the check lines. (A hard-typed total is itself the defect.)
2. `node scripts/guards/regexp-escape-guard.check.mjs` → exit 0, `all 12 checks passed`, map still = 12.
3. `bash scripts/guards/run-all.sh` → exit 0, `GUARDS: PASS`.
4. `npm run verify` → exit 0, with **your** measured numbers stated and every delta from 2067 accounted for.
   `steering-lint` is inside it: `AGENTS.md` is at 1789 words against a ceiling of **1800** — do not push it
   over, and re-run `bash scripts/steering-lint.sh` if you touch `AGENTS.md` at all.
5. **Prove the class rule works on a NEW violation**: create a report in a `/tmp` root containing a bare
   `HEAD` count, run the guard there, and paste the finding. Then prove a baselined occurrence passes.
6. **Prove N1 is fixed** by re-running the orchestrator's own blank-line reproduction above and showing the
   finding now fires.

**Commit** with a message stating each finding and its fix. **Do not push.** Production is V27 and this batch
does not push mid-batch.

---

## Report format (`.scratch/v28/reports/slice-6c-fix-4.md`)

- Per-finding table: finding → what you changed → **the command that proves it** → raw result.
- A section on **N3**: the rule, its seam, the recorded baseline and its printed size, the seeded failure,
  the baselined control, and the exact behaviour-check output.
- **Grep your own report for `at HEAD` before you commit** and paste that grep's output, empty or not.
- State your measured `npm run verify` numbers and account for the delta from 2067.
- The raw verify tail, appended as produced.
- Anything you noticed and did **not** fix — named with file:line, so it becomes a decision rather than a
  silence. **A rejection is allowed** if argued from a measurement; the orchestrator adjudicates every one.
