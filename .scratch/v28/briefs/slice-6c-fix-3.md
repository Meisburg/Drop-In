# Slice 6c — FIX ROUND 3 (findings from the fix-round-2 reviewer, verbatim)

**Working directory:** `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`
**Base for this round:** `a4b3cf5` (HEAD; a factory-infrastructure commit — **not part of this slice**)
**Fix round 2's slice commit:** `04921d8`.
**Read `docs/agents/code-structure.md`.** Small edits only — **this round is mostly prose truthfulness plus one new guard rule.**
**Report to `.scratch/v28/reports/slice-6c-fix-3.md`.**

---

## ⚠️ READ THIS FIRST — the report convention, and why it is not a formality

**Write the report FIRST, then append each raw command tail as you produce it.** Four slices ago a
builder was killed mid-round by `systemd-oomd` and its evidence survived only because it had been
appending as it went (see `.scratch/v28/ledger.md`, 2026-10-02). A warning that is not in the artifact
does not exist for the next reader.

**Two habits that cost this slice two rounds already, so they are now rules:**
- **Never `rg -r`.** Read every value out of the command that produces it, **in the same call that
  records it.**
- **Never put a shell-mangled pattern on a command line.** Write the needle to a file and use `-f`.
- **Never state a number, a count, or a history fact you have not just measured.** Round 2's blocking
  finding exists because it added a *history claim* while fixing a *number* claim. Both are the same
  class: **a sentence stating something other than the mechanism.**

---

## Machine state at dispatch — do not fight it, and do not "fix" it

- **You are routed to `ollama-cloud/deepseek-v4.1-flash:cloud`** (`factory route builder`). The local
  `strata-max` worker is **resource-blocked**: it needs 30 GB VRAM and `ninfer-serve` holds the GPU
  (6.6 GB free), so it cannot start. **Do not start it, do not stop `ninfer-serve`, and do not treat
  either as a finding.** This is a scheduling outcome, recorded in `factory/logs/`.
- **`npm run verify` is the gate.** Baseline that must not move: **71 test files / 2065 tests /
  81 lint warnings / 0 errors / GUARDS PASS**. ⚠️ oxlint prints **no summary banner off-TTY** — count
  finding lines with `grep -c ': warning '` and `grep -c ': error '`.

---

## Scope

**Seven findings, all from `.scratch/v28/reports/slice-6c-fix-2-review.md`.** Six are small prose or
diagnosability edits; **N7 is one new deterministic guard rule**, which the reviewer explicitly asked
for instead of a fourth fix round:

> "Per the ladder rule the *class* belongs one rung down — a rule/guard that no instrument header may
> assert a history it cannot point at — not in a third full round."

That is the shape of this round: **fix the instances, then make the class unrepresentable.**

---

## B1 (BLOCKING) — `scripts/guards/regexp-escape-guard.mjs:83-84` states a history it cannot point at

> `* wrong file. It prints its own case count rather than quoting one here, because`
> `* a typed count in this header went stale once already. run-all.sh runs it in`

**"This header never contained a typed count."** Measured by the reviewer:

```
$ git log --all -p -- scripts/guards/regexp-escape-guard.mjs | grep -nE "^\+.*(checks? passed|[0-9]+ checks|case count)"
92:+ * wrong file. It prints its own case count rather than quoting one here, because
$ for c in ce3479c c2ec32e 0205c8d HEAD; do git show $c:scripts/guards/regexp-escape-guard.mjs | grep -cE "checks passed|all [0-9]+ check"; done
0 0 0 0
```

The only line in that file's **entire history** mentioning a typed count is the sentence making the
claim. The old header enumerated the check's cases with **no number**.

**Fix:** delete the false clause. Keep the true, supportable part — it prints its own case count rather
than quoting one here — and state the real reason if you want one: **the printed line is the fact, a map
in a comment is not.** Do not replace the claim with a different history claim. **If you cannot point at
a commit that shows it, do not write it.**

**Why it is blocking, not a nit:** `docs/agents/code-structure.md:123` names *this header* as the
authoritative statement of what the guard covers. A reader acts on it.

---

## N1 — `265 at HEAD` is a label no reader can resolve

`.scratch/v28/reports/slice-6c.md:274` (and the same label at
`.scratch/v28/reports/slice-6c-fix-2.md:30,71`):

> `` `c484648`, 259 at `ce3479c`/`32e9f48`, 265 at HEAD ``

**The value 265 is correct and on record** (real at `c2ec32e`/`0205c8d` — the fix-2 report names both).
**The label is the defect:** a bare `HEAD` inside the commit that *moves* HEAD. Measured at the
committing revision: `git ls-files .scratch | wc -l` → **271**.

**Fix:** name the commit — `265 at 0205c8d`. Do not introduce a new bare `HEAD`.

**Adjacent, same line pair:** `slice-6c.md:271-272` says the header has "the command that re-measures
it (`regexp-escape-guard.mjs`)" — the parenthetical names the **file where** the command lives, not the
command. Fix it to name the command: `git ls-files .scratch | wc -l`.

---

## N2 — `scripts/guards/regexp-escape-guard.check.mjs:43-45` quotes the value that was *right*

> `* A hand-typed total here went stale in fix round 1 ("all 9 checks passed" out of a script that had grown)`

At fix round 1's commit the printed total was **correct**: `git show c2ec32e:…check.mjs` has 9 `check(`
sites and prints `all 9 checks passed`; the committed verifier tail shows nine `✓`. The hand edit in that
round's diff was `all 6 checks passed` → `all 9 checks passed`.

The **stale** state was the **round-2 dispatch**: 12 cases against the committed `all 9`.
**Fix:** say the accurate thing — the total was hand-maintained and was hand-edited in fix round 1, and
it was stale by round 2. **Do not quote a value as stale when it was correct**, which is the same defect
as B1 in a different costume.

---

## N3 — the docstring map counts 11 cases; the script runs 12

`regexp-escape-guard.check.mjs:9-39` numbers cases 1–11. `:46` says "The numbered list above is the
map; the printed line is the fact." But `:211-214` executes a **12th** check, and `:20-21` refers to
"cases **5-12**". Measured: `grep -c "^  [✓✗]"` on the check's own log → **12**, matching
`all 12 checks passed`.

**Fix:** make the map complete — add case 12 — so a reader following "cases 5-12" can find it. (This
map-vs-count gap predates this round: at `ce3479c` it was 5 items against 6 checks.)

---

## N4 — the mutation proofs quote a guard hash a reader cannot reproduce

`.scratch/v28/reports/slice-6c-fix-2.md:174,233,266,299` quote
`guard f0fc47a07c932e9331dc90dacde0e81e8ac617374d8e34c3a255f488bce08ba`. The **check** hash is
byte-exact for HEAD; the **guard** hash is not (HEAD's guard is `34fa7aa5…`). The builder's backups are
still on disk and resolve it:

```
$ sha256sum /tmp/fix2-bak-*/guard.mjs
f0fc47a0…  /tmp/fix2-bak-root-anchored/guard.mjs   (+ three more backup dirs)
$ diff -u /tmp/fix2-bak-root-anchored/guard.mjs scripts/guards/regexp-escape-guard.mjs
  (only the N1 lane-attribution prose edit)
```

So the mutated code **was** identical and the substance holds — but as committed the "restored,
hash-verified" claim is **not checkable from the repo**.

**Fix:** say it plainly at those four sites — **the proofs were run against a guard that differed from
the committed one by the N1 prose edit only, and the quoted hash is of that pre-edit copy.** State the
provenance; do not restate the hash as if it were HEAD's. Verify any hash you print, in the same call
that records it.

---

## N5 — a failed `git add` loses the reason

`regexp-escape-guard.check.mjs:150` pipes the `init && add` call, and `:154` keeps only
`e.message.split('\n')[0]`, which for `execSync` is `Command failed: <the command>` — **git's reason is
dropped**. Measured: the ✗ line reads `git step failed: Command failed: git init -q && git add -f
.scratch/zz-probe.mjs` with no mention of *why*. By contrast `:151` omits `stdio:'pipe'`, so in the
other probe git's `fatal: detected dubious ownership in repository` prints raw.

**Fix:** make the two calls handle stderr **consistently**, and keep git's own message. The premise must
stay named either way — that part is already correct and must not regress.

---

## N6 — the summary line calls an environment failure a broken guard

`regexp-escape-guard.check.mjs:224` prints
`… 1 check(s) failed — the guard is not doing its job.` even when **the only failure is the wrapped
premise** (git missing, dubious ownership).

`ocr`'s finding was that an environment hiccup must be distinguishable from a broken guard. The ✗ line
now names the premise, but **the last line a CI reader sees still asserts the guard is broken.**

**Fix:** make the summary distinguish the two. When the only failures are the environment premise, say
so; only claim the guard is broken when a guard case actually failed.

---

## N7 — the class rule: no instrument header may assert a count or a history it cannot point at

**This is the reason there is no fourth round.** Add a deterministic rule so the class B1 belongs to
cannot be re-created. In `scripts/guards/factory-guard.mjs`, add **`instrument-headers-honest`**:

- Scan the **header comment block** of each `scripts/guards/*.mjs` — the leading `//` comment lines
  before the first line of code — for a **typed count claim**: a digit immediately followed by
  `check(s)` / `case(s)` / `test(s)`, or the phrases `checks passed` / `N checks`. A count in a header
  goes stale the moment the file grows, and it is exactly what B1's sentence claimed but could not point at.
- **Also flag a history claim with no resolvable pointer** — a header line asserting that something
  "went stale" / "used to be" / "was once N" **without** naming a commit sha or a file:line. That is the
  precise shape of B1.
- The rule must have a **seam** (`--root`, like `factory-guard.mjs` already has) and ship a **behavior
  check** in `factory-guard.check.mjs`: seed a header containing a typed count and require the guard to
  fire, plus a **control** proving an honest header passes. A rule whose check cannot fail is a comment.
- Register it in the header rule list of `factory-guard.mjs` (the comment block that enumerates the
  rules) and update the summary "ok —" line if it enumerates what passed.

**Do not** merely delete the offending sentences and stop. The point is that the **next** such sentence
is caught by a machine, not by a reviewer's attention.

**Check yourself against the rule you just wrote:** after N7 lands, `node scripts/guards/factory-guard.mjs`
must pass on this repo — so if your own new header describes the rule, describe it **without** typing a
count.

---

## Verification — you run this, and you report the raw tail

1. `node scripts/guards/factory-guard.check.mjs` → **every check fires**, and the run-time counter prints
   the correct total. (It counts at run time on purpose; **do not** hard-type the total anywhere.)
2. `node scripts/guards/regexp-escape-guard.check.mjs` → still green, `all N checks passed`, and the
   count now matches the docstring map (N3).
3. `bash scripts/guards/run-all.sh` → exit 0, `GUARDS: PASS`.
4. **`npm run verify`** → **exit 0**, and the baseline unmoved: **71 files / 2065 tests / 81 warnings /
   0 errors / GUARDS PASS**. (`steering-lint` is part of it: **AGENTS.md is 1789 words against a ceiling
   of 1800** — do not add more than a few words to `AGENTS.md`, and if you touch it, re-run
   `bash scripts/steering-lint.sh`.)
5. **Prove each fix by reproducing the reviewer's own measurement**, not by re-reading your edit. For B1
   in particular, run the reviewer's own two commands and paste the output.

**Commit** with a message stating each finding and its fix. **Do not push.** Production is V27 and this
batch does not push mid-batch.

---

## Report format (`.scratch/v28/reports/slice-6c-fix-3.md`)

- Per-finding table: finding → what you changed → **the command that proves it** → raw result.
- **A "rejected" row is allowed and expected** if a finding is wrong — but it must be argued from a
  measurement, not from a preference. Every rejection is the orchestrator's to adjudicate, so state
  your evidence for it. (No finding was rejected in fix round 2, and the reviewer confirmed that.)
- A section on **N7**: the rule, its seam, the seeded failure, the control, and the exact output of the
  behavior check.
- The raw `npm run verify` tail, **appended as produced**.
- Anything you noticed and did **not** fix — named, with file:line, so it becomes a decision rather than
  a silence.
