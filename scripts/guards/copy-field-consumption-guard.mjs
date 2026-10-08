#!/usr/bin/env node
/**
 * Copy-field consumption guard — a field of a copy module must be READ by the
 * app, or be allowlisted with a written reason.
 *
 * WHY THIS EXISTS. A copy module (`src/lib/firstRunCopy.ts`) exists for one
 * reason: it holds the words the UI shows. A field in it that nothing reads is
 * a sentence about the product that the product does not say — and it is
 * believed, because it sits in the module everyone trusts for the words.
 *
 * THE INSTANCE THIS WAS WRITTEN FOR (V28 r2 slice 6a, measured on the tree at
 * the time): `skipLabel?: string` was declared, `FIRST_RUN_COPY.kids` set it to
 * `'Skip for now'`, and `firstRunCopy.test.ts` asserted it was non-empty — while
 * `FirstRunCard.tsx` rendered a hard-coded `Skip` and NO file in src read the
 * field at all. `rg -n "skipLabel" src/ --glob '!*.test.*'` returned the
 * declaration and the value and nothing else. The test made it look covered; the
 * test was one of the things that made it a lie possible.
 *
 * This is the fourth instance of the class in this batch (a claim that looks
 * evidenced and is not), which is the batch's rule for when a guard is owed
 * rather than another one-off fix.
 *
 * THE RULE:
 *   Every field declared by a copy module's copy shape must be CONSUMED
 *   somewhere in src/ **by a reader of that shape**, or appear in ALLOWLIST
 *   below with a non-empty reason.
 *
 * A FIELD IS (SHAPE, NAME), NOT A NAME. A copy module may declare several
 * shapes, and they may reuse names — `firstRunCopy.ts` declares
 * `FirstRunCardCopy` (title, body, primaryLabel, skipLabel) and the nudge's
 * anonymous shape (title, body, actionLabel). `title` in one is NOT the `title`
 * in the other: the card's title is the card's masthead, the nudge's title is
 * the nudge's lead. So a read satisfies a field only when the VALUE the read is
 * taken off CARRIES that shape — and since fix 4, "carries" is the checker's
 * answer, not this guard's guess: the value's type is assignable to the shape's
 * type. V28 r2 slice
 * 6a fix 1 (F1): the first version keyed fields by bare name within the module
 * and let a read on ANY binding imported from the module satisfy them, so
 * `FIRST_RUN_NUDGE_COPY.title` was accepted as the consumption of
 * `FirstRunCardCopy.title` — deleting every card's title read left the guard
 * reporting the field read and exiting 0. That is this guard's own defect class
 * one rung inward, and the seed
 * `check.mjs — 'a card title read deleted while the nudge title stays'` is what
 * keeps it from coming back.
 *
 * THE RULE IS STATED ONCE, AND THE CHECKER ENFORCES IT. Fix 4 (V28 r2 slice 6a,
 * review of fix 3) is the third time this guard's OWN identity question has
 * fired: fix 1 found "a field is a bare name in the module", the fix-2 ruling
 * settled shape attribution as per-const rather than per-value, and fix 3's
 * review found "root attribution is by name, not by binding/scope". Each was
 * patched by making the name matching cleverer, and the AST walk still keyed its
 * `roots` table by STRING — so a local parameter that happened to be called
 * `kidsCopy` carried the card's shapes, and a hard-coded word in the chrome sat
 * behind a field the guard reported as read, at exit 0, on input that compiles
 * with zero type errors. That is the defect this file exists to catch, walking
 * through the guard built to catch it. The table is gone: `consumerReads` asks
 * `getTypeAtLocation` what shape a value has and `isTypeAssignableTo` whether it
 * carries the judged one. All three instances close by construction, because
 * none of them is a question about names any more.
 *
 * WHAT COUNTS AS CONSUMPTION — the trap is that THE DEFINITION SITE IS NOT A
 * CONSUMER, so it is stated in full:
 *
 *   CONSUMED = a read of the field through a value that carries its shape, in a
 *   src file that is neither the module nor a test:
 *     FIRST_RUN_COPY.kids.skipLabel        — a direct chain
 *     kidsCopy.skipLabel                   — an alias (`const kidsCopy = FIRST_RUN_COPY.kids`)
 *     FIRST_RUN_COPY[card].title           — a computed hop inside the chain
 *     const { title } = FIRST_RUN_COPY.name — a destructuring of a copy value (F3)
 *     const { kids: { skipLabel } } = FIRST_RUN_COPY — the same, nested: the
 *       inner read is attributed to the shape of the HOP it goes through, which
 *       the checker knows (fix 3 listed this as a limit of the name table; the
 *       table is gone, so the limit went with it)
 *     const { ...rest } = FIRST_RUN_COPY.kids` then `rest.skipLabel` — a read off
 *       a REST-ELEMENT destructure. A real read, and the name table reported it
 *       READ BY NOTHING on code that compiles clean (A9; seed 30)
 *     import * as copy from '../lib/firstRunCopy' then
 *       `copy.FIRST_RUN_COPY.kids.skipLabel` — a NAMESPACE import. Fix 3 listed
 *       this as a missed read and printed a `limit——` line for it; attribution
 *       goes through the value now, so it is followed (seed 31)
 *     import { FIRST_RUN_COPY as copy } … copy.kids.skipLabel — an ALIASED
 *       IMPORT. The shapes are keyed by the exported name and the reads by the
 *       local one; conflating them made every read in such a file invisible and
 *       reported read fields as unread (fix 2, item E).
 *     skipLabel={`${kidsCopy.skipLabel}`}  — a read inside a TEMPLATE HOLE. It
 *       is an expression node, so it is visible (K2: the scanner claimed a hole
 *       was code in one line of itself and erased it in the next, and a template
 *       literal is the most natural way to render words).
 *
 *   NOT CONSUMED (each is a place the word is WRITTEN or ASSERTED, never a
 *   place it is USED — and only use is evidence the word is true):
 *     1. the field's own declaration (`skipLabel?: string`) — a shape
 *        statement. It says the field may exist; it cannot say anyone reads it;
 *     2. the value site in the module (`skipLabel: 'Skip'`) — writing
 *        data into the module is the definition, not a read of it;
 *     3. ANY TEST FILE, including the module's own (`firstRunCopy.test.ts`) — a
 *        test that reads a field proves the field is present and non-empty, NOT
 *        that the UI shows it. That is exactly how the defect above survived.
 *        F2 widened this from the module's own test to every `*.test.*`: the
 *        argument that exempts one test exempts all of them, and admitting the
 *        others would let an unread field buy immunity by asserting about
 *        itself in a file one directory over;
 *     4. a read through a value that does not carry the shape — a bare `.title`
 *        on an unrelated object (`document.title`), `.title` on a SIBLING shape's
 *        value (`FIRST_RUN_NUDGE_COPY.title` is not `FirstRunCardCopy.title`, see
 *        above), or `.skipLabel` on a local stand-in typed `{ skipLabel: string }`
 *        (A8 — the checker says that is not a `FirstRunCardCopy`, and it is right);
 *     5. the word inside a STRING, a TEMPLATE LITERAL TEXT, or a COMMENT — a
 *        comment or a literal that names a field is documentation or data about
 *        it, not a read of it. An AST gets this for free: a string is a node,
 *        not a span of characters the instrument has to decide about.
 *
 * KNOWN LIMITS. Each one names the INPUT that reaches it, because a limit
 * without an input is a guess. Most are false NEGATIVES (a missed read, which
 * surfaces as a finding a human then allowlists) or over-approximations that
 * need a human to allowlist.
 *
 * THE UNIVERSAL CLAIM THAT USED TO SIT HERE WAS WRONG, and A8 is what proved it:
 * it read "none of them can report a word as read when it is not, which is the
 * direction that matters". A same-named local parameter did exactly that, on
 * input with zero type errors, until fix 4 replaced the name table with the
 * checker. The claim is not being re-made. What replaced it is narrower and
 * checkable: no limit below manufactures consumption out of a NAME, because no
 * limit is decided by a name any more — and the two that could still over-report
 * (the data-flow limit and the excess-key note) are stated as over-reports, with
 * the input that reaches each.
 *
 *   - a value that CARRIES the shape counts wherever it came from, including one
 *     the copy module never produced. Reaching input:
 *     `const zzRenderSkip = (c: FirstRunCardCopy) => c.skipLabel` called with a
 *     hand-written `{ title: '…', body: '…', primaryLabel: '…', skipLabel: 'Skip' }`.
 *     The read is real and the word is not the module's. This is the DATA-FLOW
 *     limit, and fix 4 narrowed it rather than closing it: the stand-in in A8 was
 *     typed `{ skipLabel: string }`, which is not a `FirstRunCardCopy`, and the
 *     checker refuses it; a full-shape stand-in is indistinguishable from the real
 *     value to any type query. The NEAREST such input is not hypothetical: any
 *     consumer prop type structurally identical to a judged shape reaches it, and
 *     `FirstRunCardProps` escapes today only because its `body` is an optional
 *     `ReactNode` while the shape's `body` is a required `string` — an accident of
 *     one unrelated field, not a property this guard enforces (measured: a read off
 *     a foreign `{ title: string; body: string; primaryLabel: string; skipLabel?:
 *     string }` is counted; the same read off `FirstRunCardProps` is counted only
 *     once `body` is a required `string`, so BOTH the type and the optionality are
 *     what keep the real prop type out). It CANNOT be fenced the way the parse
 *     limit below is, and that is a ruling, not a shrug: a fence is guard behavior
 *     that CONTAINS the limit — the parse fence refuses every read from an
 *     unparseable file — and containing this one means answering "where did this
 *     value come from", which neither an AST nor a type answers. A seed can only
 *     RE-ASSERT the over-report, and asserting an over-report is not containing it;
 *     so it stays a stated limit with its nearest input named;
 *   - a copy value SPREAD into a component (`<Card {...FIRST_RUN_COPY.kids} />`)
 *     contributes no field-named read: a spread's expression is an identifier, so
 *     there is no property access to attribute, and the guard reads the consumer's
 *     syntax, not the component's internals. Reaching input: that JSX, measured on
 *     this tree — replacing the kids card's `skipLabel={kidsCopy.skipLabel}` with
 *     `{...kidsCopy}` reports both skipLabel fields READ BY NOTHING. The read is
 *     real and the guard misses it (safe direction): the field comes out unread and
 *     a human allowlists it. Fix 4 followed a function parameter and a re-export
 *     because the checker can type them; it does not follow a spread, and this
 *     bullet is the part of fix 3's `parameter, re-export, JSX spread` limit that
 *     is still true — the other two closed, and deleting this bullet along with
 *     them is how a limit stops existing;
 *   - a read whose value the checker types as `any` is NOT attributed, because
 *     every type is assignable FROM `any` and counting it would manufacture
 *     consumption — the direction this guard refuses. Reaching input: an
 *     unresolved import, or a copy value passed through an `any`. Counted and
 *     printed on a `limit——` line per file, so the blind spot is in the run and
 *     not only in this comment;
 *   - a default import of a copy module is not followed; reaching input:
 *     `import copy from '../lib/firstRunCopy'`. The module has no default export,
 *     so the checker gives that value no type to attribute, and the read lands in
 *     the `any` case above (this repo uses named imports);
 *   - a destructured key counts as a read even if the bound variable is never
 *     used; reaching input: `const { skipLabel } = FIRST_RUN_COPY.kids` with the
 *     binding unused. `noUnusedLocals` is on in tsconfig.app.json, so that file
 *     does not compile — unreachable in clean code;
 *   - a destructuring in a FUNCTION PARAMETER is not walked: `bindingReads` is
 *     reached only from `ts.isVariableDeclaration`, so a key bound in a parameter
 *     pattern contributes no read even though the same destructure in a `const`
 *     does (seed 9). Reaching input: `const render = ({ skipLabel }:
 *     FirstRunCardCopy) => skipLabel` (measured on this tree: with the kids card's
 *     real read replaced by a call to that function, both skipLabel fields report
 *     READ BY NOTHING). A missed read (safe direction): the field comes out unread
 *     and a human allowlists it. Binding the whole value in the parameter and
 *     reading a field off it (`({ copy }: { copy: FirstRunCardCopy }) =>
 *     copy.skipLabel`) IS followed — that read is a property access the checker
 *     can type;
 *   - `extends` is not followed: a sub-shape contributes only its OWN declared
 *     fields, and the parent shape is judged on its own. Reaching input:
 *     `interface SkippableFirstRunCardCopy extends FirstRunCardCopy` — the
 *     sub-shape contributes `skipLabel` only, and `FirstRunCardCopy`'s four
 *     fields are judged on their own. Deliberate: following `extends` would make
 *     `SkippableFirstRunCardCopy.title` a second field needing its own read;
 *   - an interface that no exported const carries is not judged (it is a type
 *     used elsewhere, not a copy value the app reads);
 *   - an interface named in a VALUE position of an annotation that the const does
 *     not really carry — `export const C: Omit<FirstRunCardCopy, 'x'> = {…}` —
 *     is taken as carried, because the guard reads type SYNTAX, not types.
 *     Over-approximating: it can only make a field look more read. Reaching
 *     input: that line. Key positions are the one place it is precise — the
 *     first type argument of `Record`/`Partial`/`Required`/`Readonly` is a KEY,
 *     not a value, and is skipped, so an interface used as a record key is not
 *     mistaken for a copy shape (fix 2, ocr #5). A key-taking generic outside
 *     that four-name list has its key treated as a value — same safe direction;
 *   - an excess key in a typed data literal is not this guard's business: tsc's
 *     excess-property check already rejects one. Note the asymmetry the fix-2
 *     review raised and this guard does NOT close: `FirstRunCardCopy.skipLabel`
 *     is optional, so a non-skippable entry CAN carry `skipLabel: 'Skip'` and
 *     compile, and the guard will call it consumed (the read through the base
 *     shape is real). Tightening that means `Omit`-ing the key from the
 *     non-skippable arm of the mapped type, which changes the public shape and
 *     rewrites the pins in firstRunCopy.test.ts — out of this slice's scope;
 *   - A FILE THAT DOES NOT PARSE IS A FINDING, AND ITS READS COUNT FOR NOTHING.
 *     This is the one limit that could point the other way, so it is fenced:
 *     TypeScript's error recovery turns `const zz = 'abc<newline>read.field'`
 *     into a real property-access node, so an unparseable file COULD hand the
 *     guard a read that no compiling program contains. Measured on `typescript
 *     6.0.3`: that input yields `kidsCopy.skipLabel` as a PropertyAccessExpression
 *     plus three parse diagnostics. The guard therefore refuses every read from a
 *     file with parse diagnostics AND reports the file, so a broken file can
 *     neither fake a read nor pass unseen. The diagnostics come from
 *     `Program.getSyntacticDiagnostics` — PUBLIC API. Fix 3 read the parser's own
 *     non-public diagnostic list instead, so a TypeScript rename would have made
 *     the fence report "no parse errors", which is indistinguishable from a clean
 *     repo; the method's existence is now asserted, so a rename stops the run
 *     loudly instead of disabling the fence quietly.
 *
 * THE GUARD POLICES ITS OWN INSTRUMENT. It prints the shape count, the field
 * count, the consumer-file count and the skipped-const count it derived, and a
 * run that discovers ZERO declared fields is a FAIL, not a pass: an instrument
 * that sees nothing looks exactly like a clean repo. Its behavior is proven by
 * `copy-field-consumption-guard.check.mjs`, which seeds each case and requires
 * the right exit code.
 *
 * WHY THIS IS AN AST WALK, AND WHAT IT COST TO LEARN THAT. Three rounds of
 * patching a hand-rolled lexer found more lexer bugs each time: the machine
 * review found 16 defects, 11 of them parser-shaped; fix round 2 fixed 9 and
 * retained 2 BLOCKING ones, one of which was a REGRESSION against fix 1 —
 * an odd number of apostrophes in JSX text paired with a real literal's opening
 * quote, blanked through the literal, and then scanned its BODY as code, so a
 * word inside a string counted as consumption at exit 0; and a read inside a
 * template hole was erased by the very code that claimed to scan it. Both are
 * questions about TOKENS, which is the one thing a character scanner cannot
 * answer without becoming a parser. `typescript` is a devDependency of this repo
 * (`~6.0.2`, installed 6.0.3), so a `node scripts/guards/*.mjs` run and CI both
 * have it. This file is that walk. Measured, it DELETES 17 functions outright —
 * `blankNonCode`, `scan`,
 * `skipString`, `skipRegex`, `regexCanStart`, `stringEnd`, `blankRange`,
 * `matchBrace`, `braceEnd`, `literalKeys`, `shapesInTypeExpr`, `exportedConsts`,
 * `importedBindings`, `aliasesOf`, `patternLeaves`, `destructuredReads`,
 * `readSitesByField` — and closes those defect classes by construction rather
 * than by policing them.
 *
 * What it does NOT do is shrink the file by two thirds, which is what an earlier
 * version of this header predicted. Measured for the lexer→AST rewrite: 860 lines
 * to 734 total, and 472 code lines to 382 with comments and blanks excluded —
 * **−19% of the code, not −66%**. The prediction counted the lexer it would
 * delete and forgot to count what replaces it. A header that overstates its own
 * diff is the same defect this guard exists to catch, so the measured number
 * stays.
 *
 * FIX 4 IS THE SAME LESSON ONE LEVEL DEEPER, AND IT IS NOT MEASURED AS A WIN ON
 * LENGTH. The AST closed the questions a character scanner cannot answer about
 * TOKENS; it left the questions about WHAT A NODE MEANS, and those were being
 * answered by comparing strings. Measured at the two COMMITS, `dde111a` and the
 * fix-4 commit `860893c`: 734 lines to 849 by `wc -l`, and 382 code lines
 * (comments and blanks excluded) either side — the code did not grow, the header
 * did, because the name table (`roots`, the import scan, the alias fixpoint,
 * `rootIdentifier`, `patternReads`, `isTypeOnlyImport`, `parseFile`) was replaced
 * by something smaller (`compilerOptions`, `buildProgram`, `shapeTypes`,
 * `shapesOf`, `bindingReads`) and the explanation of WHY is what takes the space.
 * Those two numbers are pinned to the commits they were measured at, not to "this
 * tree": a line count of the current file is wrong the moment anyone edits it, and
 * this header has already been wrong about its own total once (it said 818; the
 * file was 849, thirty-one short). The cost is real and measured too, three runs
 * each on this machine: the guard goes from a tenth of a second to one to two
 * seconds per run, most of it the single `ts.createProgram` over the tree, and the
 * behavior check from about nine seconds to about forty. The behavior check invokes
 * the guard once for every seed EXCEPT the parse-fence seed, which reads the guard's
 * own SOURCE and never calls `run()` — so from fix 4 on the invocation count is one
 * BELOW the seed count, not once per seed. Its four allowance seeds add no
 * invocation: each calls `run(guardWithAllowlist(…))` once, and that call IS its
 * invocation, not a second one on top. At the fix-4 commit `860893c` that is 33
 * seeds and 32 invocations, and `dde111a` had 28 of each; the 28 this header used
 * to assert is NOT "the fix-4 total minus exactly the four full copies" — the four
 * allowance seeds are inside BOTH totals, and what moved 28 to 32 is the four seeds
 * fix 4 added that DO call `run()` (29-32), alongside seed 33 that does not. The
 * invocation count for the tree you are reading is not pinned in this header: the
 * check computes it and prints it, with its check count, at the end of a run —
 * because a number that moves whenever a seed is added is a number that will be
 * wrong again. The spread is machine load,
 * not nondeterminism in the guard: same repo, same findings, same order. That is the
 * price of asking a question that has an answer instead of guessing at one; if it
 * ever becomes a guard people route around, the honest move is to say so, not to
 * re-grow the name table.
 *
 * What the rewrite buys is not length: it is that the questions the lexer had to
 * GUESS — does this quote open a string, is this identifier a read, is this
 * pattern element a key or a binding — are no longer questions, and since fix 4
 * neither is "does this value carry this shape". The seeds written against the
 * lexer are KEPT, because they encode the RULE, not the implementation; three
 * changed in fix 3 and fix 4, for stated reasons — seed 20's mutation now routes
 * through `editFile` (L4, an invariant with one hole is a hole), seed 17 now
 * asserts the skipped-const COUNT as well as the line (L3), and seed 23's alias
 * read moved to where the alias is IN SCOPE: it had been reading the name card's
 * title from the kids component, which the name table accepted because a name has
 * no scope and the checker cannot because an out-of-scope identifier has no type
 * to ask about. Seed 23 was testing the rule; fix 4 just stopped it testing the
 * guard's blindness too.
 *
 * Deterministic: no LLM, no test run. Same repo, same answer.
 *
 * Usage:  node scripts/guards/copy-field-consumption-guard.mjs [repo-root]
 *         (repo-root needs its `tsconfig.app.json` — the guard builds the
 *         program with the tree's own compiler options and refuses to judge one
 *         it cannot configure)
 * Exit:   0 = clean, 1 = findings
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()

/** The copy modules this guard judges: `src/lib/` modules whose whole job is
 *  to hold the UI's words as data. `consts` names the exports this guard exists
 *  to judge — that list is what makes "the instrument stopped seeing the copy" a
 *  finding instead of a pass, without turning every OTHER exported const in the
 *  file into a build break (see the not-judged rule in `moduleShapeSet`). Adding
 *  a copy module, or a copy const, means adding it here — a visible act, unlike
 *  a field silently going unread. */
const COPY_MODULES = [
  {
    module: 'src/lib/firstRunCopy.ts',
    // V34-C registered the finish transition's copy const the day it was
    // added — the act this list exists to force.
    consts: ['FIRST_RUN_COPY', 'FIRST_RUN_NUDGE_COPY', 'FIRST_RUN_COMPLETION_COPY'],
  },
  // Slice 2b-iii. Its fields ARE read: NotificationsSection renders
  // `notificationSectionCopy(native)` and prints all three sentences.
  // Registered the day it was added, because that is the act this list exists
  // to force.
  {
    module: 'src/lib/notificationSectionCopy.ts',
    consts: ['NOTIFICATION_COPY_WEB', 'NOTIFICATION_COPY_NATIVE'],
  },
]

/**
 * Fields allowed to be unread, keyed by module, then by `Shape.field`, with the
 * reason as the value. The reason is not decoration: an entry whose value is
 * blank is a FINDING, because an unexplained allowance is how a lie gets a pass
 * on paper. An entry for a field that IS consumed is also a finding (a stale
 * allowance is a hole left open for the next field to fall into), and so is an
 * entry for a field the module does not declare (a typo'd allowance guards
 * nothing).
 */
const ALLOWLIST = {
  'src/lib/firstRunCopy.ts': {
    // (none — every declared field is read by the app)
  },
}

/** Generics whose FIRST type argument is a KEY, not a value: `Record<Id, Shape>`
 *  says the keys are ids and the values are shapes. Reading the key as a value
 *  made an interface used as a record key a judged copy shape, whose own fields
 *  were then reported as unread copy — a hard finding against code that has no
 *  copy field in it at all (fix 2, ocr #5). */
const KEY_POSITION_GENERICS = new Set(['Record', 'Partial', 'Required', 'Readonly'])

// ---------------------------------------------------------------------------
// Parsing. One source file, one truth: which span is a string, which identifier
// is an import alias, which pattern element is a key and which is a binding.
// ---------------------------------------------------------------------------

/** The tree's own compiler options, READ from `tsconfig.app.json` rather than
 *  restated here: a second copy of them drifts, and drift would make the guard
 *  answer a different question than `npm run typecheck` does. They come from the
 *  tree being JUDGED, not from where this script lives, so a sandbox copy of src
 *  is judged with the config that sandbox would build under. A config this guard
 *  cannot read is a hard stop, not a fallback: a guard judging a program it did
 *  not configure is reporting the answer to some other question. */
function compilerOptions(root) {
  const configPath = path.join(root, 'tsconfig.app.json')
  const read = ts.readConfigFile(configPath, (f) => readFileSync(f, 'utf8'))
  if (read.error !== undefined) {
    throw new Error(
      `copy-field guard: cannot read ${configPath} (${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}) — ` +
        'the guard refuses to judge a program it cannot configure',
    )
  }
  return { ...ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath)).options, noEmit: true }
}

/** One program for the whole tree, built once. Fix 4: identity is decided by
 *  the TYPE CHECKER, so the guard needs a real program — the same one `tsc`
 *  builds — and not a per-file parse. */
function buildProgram(root) {
  const rootNames = srcFiles(path.join(root, 'src'))
  if (rootNames.length === 0) {
    throw new Error(`copy-field guard: no source files under ${path.join(root, 'src')} — an instrument with no input is not passing, it is blind`)
  }
  const program = ts.createProgram({ rootNames, options: compilerOptions(root) })
  // The parse fence (K1c) reads PUBLIC API now — `Program.getSyntacticDiagnostics`
  // — where fix 3 read `sf.parseDiagnostics`, which is not in the .d.ts. A
  // TypeScript rename would then have made the fence quietly return "no parse
  // errors", which looks exactly like a clean repo. Asserted, so the fence goes
  // LOUD (a thrown error exits non-zero) instead of silent.
  if (typeof program.getSyntacticDiagnostics !== 'function') {
    throw new Error(
      'copy-field guard: Program.getSyntacticDiagnostics is missing from this typescript version — the parse-diagnostic fence cannot run, and a guard that cannot see parse errors must not report a pass',
    )
  }
  return program
}

/** The parse fence, in public API. */
function parseErrorsOf(program, sf) {
  return program.getSyntacticDiagnostics(sf).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
}

function walk(node, visit) {
  visit(node)
  ts.forEachChild(node, (child) => {
    walk(child, visit)
  })
}

/** The text of a property/pattern key, or null when it is computed (an
 *  expression, so nothing is known about which field it names). */
function keyText(name) {
  if (name === undefined || ts.isComputedPropertyName(name)) return null
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return null
}

const isExported = (node) => (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

/** ONE extension set, shared by the walk and the test-file rule. They used to
 *  disagree — the walk matched only `.ts`/`.tsx` while the test rule accepted
 *  `[cm]?[jt]sx?` — so a future `.mts`/`.cts` consumer would have been skipped
 *  without a word, which is a missed read (fix 4). */
const SOURCE_EXT = /\.[cm]?[jt]sx?$/

const srcFiles = (dir) => {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...srcFiles(p))
    else if (SOURCE_EXT.test(entry.name)) out.push(p)
  }
  return out
}

/** No test file is a consumer — see exclusion 3 in the header. */
const isTestFile = (name) => /\.test\./.test(name) && SOURCE_EXT.test(name)

const lineAt = (parsed, node) => parsed.sf.getLineAndCharacterOfPosition(node.getStart(parsed.sf)).line + 1

// ---------------------------------------------------------------------------
// 1. What the copy module DECLARES — the shape set, and each shape's fields.
// ---------------------------------------------------------------------------

function moduleShapeSet(parsed) {
  const interfaces = new Map() // shape name -> own declared field names
  const interfaceDecls = new Map() // shape name -> its InterfaceDeclaration (the checker needs the NODE to ask what type it is)
  const aliasTypes = new Map() // alias name -> its TypeNode
  const consts = [] // exported consts: { name, annotation?, initializer? }

  for (const stmt of parsed.sf.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      interfaceDecls.set(stmt.name.text, stmt)
      interfaces.set(
        stmt.name.text,
        stmt.members.filter((m) => ts.isPropertySignature(m)).map((m) => keyText(m.name)).filter((k) => k !== null),
      )
      continue
    }
    if (ts.isTypeAliasDeclaration(stmt)) {
      if (!aliasTypes.has(stmt.name.text)) aliasTypes.set(stmt.name.text, stmt.type)
      continue
    }
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) consts.push({ name: d.name.text, annotation: d.type, initializer: d.initializer })
      }
    }
  }

  /** The shape NAMES a type expression mentions. A mapped type, a conditional
   *  type and an intersection are all just nodes to descend, so
   *  `[K in Id]: K extends S ? A : B` needs no special case — and the type
   *  PARAMETER (`K`) and the key (`Id`) are not shapes because they are not
   *  names this module declares as one. */
  function typeNodeNames(node, out = new Set()) {
    if (ts.isTypeReferenceNode(node)) {
      const name = ts.isIdentifier(node.typeName) ? node.typeName.text : null
      const args = node.typeArguments ?? []
      const first = name !== null && KEY_POSITION_GENERICS.has(name) && args.length > 1 ? 1 : 0
      for (let i = first; i < args.length; i++) typeNodeNames(args[i], out)
      if (name !== null && (interfaces.has(name) || aliasTypes.has(name))) out.add(name)
      return out
    }
    // `ts.forEachChild` ABORTS when the callback returns anything defined (it
    // treats a defined result as "this node is done, use it"), so the callback
    // must return nothing — a bare arrow expression that hands back the Set
    // silently cuts the descent after the first child.
    ts.forEachChild(node, (child) => {
      typeNodeNames(child, out)
    })
    return out
  }

  /** An alias resolves by descending ITS type node, recursively. Source order is
   *  irrelevant, so a const annotated with an alias declared further down the
   *  file resolves exactly like one declared above it (fix 2, item F: the
   *  previous pass resolved aliases in source order, so a forward reference
   *  became "names no shape" — a hard finding on well-formed code, plus every
   *  field of that const silently dropping out of the run). The `seen` set is
   *  the cycle guard: `type A = B; type B = A` must terminate. */
  function resolveShapes(names) {
    const shapes = new Set()
    const seen = new Set()
    const visit = (name) => {
      if (seen.has(name)) return
      seen.add(name)
      if (interfaces.has(name)) {
        shapes.add(name)
        return
      }
      const body = aliasTypes.get(name)
      if (body === undefined) return
      for (const inner of typeNodeNames(body)) visit(inner)
    }
    for (const name of names) visit(name)
    return shapes
  }

  const shapes = new Map() // shape name -> { fields, declaredBy }
  const constShapes = new Map() // exported const name -> Set of shape names
  const notJudged = [] // annotated exported consts this guard does not judge

  for (const { name: constName, annotation, initializer } of consts) {
    if (annotation !== undefined) {
      const named = resolveShapes(typeNodeNames(annotation))
      if (named.size > 0) {
        constShapes.set(constName, named)
        for (const s of named) {
          if (!shapes.has(s))
            shapes.set(s, {
              fields: interfaces.get(s) ?? [],
              declaredBy: `interface ${s}`,
              shapeNode: interfaceDecls.get(s),
            })
        }
        continue
      }
      // An annotated const that names no shape this module declares is NOT a
      // copy value as this guard understands one — a list of ids, a
      // `Record<string, string>`, a lookup table. It is REPORTED and skipped.
      //
      // It used to be a hard finding, and that was wrong in the direction the
      // batch cares about: an unrelated exported const added to a copy module
      // broke the build with no way to excuse it (the ALLOWLIST is keyed by
      // Shape.field, and an unjudged const contributes no shape to allowlist).
      // The blind case is still caught, precisely: COPY_MODULES names the consts
      // this guard expects to judge, and a named const that is not judged is a
      // finding. So the tripwire fires on "the copy const stopped being
      // recognised", not on "someone added a const".
      notJudged.push({
        name: constName,
        why: `its annotation (${annotation.getText(parsed.sf).slice(0, 60)}) names no shape this module declares`,
      })
      continue
    }
    if (initializer === undefined || !ts.isObjectLiteralExpression(initializer)) continue // not copy data
    // An unannotated literal: its own keys ARE the shape, and the const's name
    // is the binding the app reads it through.
    shapes.set(constName, {
      fields: initializer.properties
        .filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
        .map((p) => keyText(p.name))
        .filter((k) => k !== null),
      declaredBy: `${constName} (literal shape)`,
      shapeNode: initializer,
    })
    constShapes.set(constName, new Set([constName]))
  }

  return { shapes, constShapes, notJudged }
}

// ---------------------------------------------------------------------------
// 2. Who READs it.
// ---------------------------------------------------------------------------

/** The TYPE each declared shape is, from the checker: an interface's declared
 *  type, or the type of an unannotated literal const's initializer — which is
 *  what the app actually reads through. A shape the checker gives no type for is
 *  returned UNRESOLVED, not skipped: a shape whose type the guard cannot name is
 *  a shape no read can ever satisfy, which is the instrument going blind, and
 *  blind is exactly what this guard exists to refuse. */
function shapeTypes(checker, shapes) {
  const types = new Map() // shape name -> ts.Type
  const unresolved = []
  for (const [name, { shapeNode }] of shapes) {
    let type
    if (shapeNode === undefined) type = undefined
    else if (ts.isInterfaceDeclaration(shapeNode)) {
      const sym = checker.getSymbolAtLocation(shapeNode.name)
      type = sym === undefined ? undefined : checker.getDeclaredTypeOfSymbol(sym)
    } else type = checker.getTypeAtLocation(shapeNode)
    if (type === undefined) unresolved.push(name)
    else types.set(name, type)
  }
  return { types, unresolved }
}

/** Every read in one consumer file, grouped by field name and tagged with the
 *  shapes the value it is read off carries.
 *
 *  FIX 4 IS THIS FUNCTION, AND IT IS THE WHOLE POINT. The three instances of
 *  this guard's own defect class — fix 1 ("a field is a bare name in the
 *  module"), the fix-2 ruling (attribution is per-const, not per-value), and
 *  fix 3's review ("root attribution is by name, not by binding/scope") — were
 *  one decision made by comparing STRINGS: `roots` was a name-keyed table, so a
 *  local parameter that happened to be called `kidsCopy` carried the card's
 *  shapes and manufactured consumption at exit 0 (A8). The table is gone. A
 *  value carries a shape when the CHECKER says its type is assignable to that
 *  shape: `isTypeAssignableTo(typeOf(value), shapeType)` is what "this value IS
 *  a FirstRunCardCopy" means to the compiler, and it is the same question `tsc`
 *  answers. So the root's NAME, how it was bound, and whether it arrived by
 *  import, alias, rest element, namespace import or function parameter stop
 *  being questions this guard has to answer at all. */
function consumerReads(checker, sf, shapeTypes, fieldNames) {
  const byField = new Map() // field name -> [{ shapes, node }]
  let anySites = 0

  const push = (field, shapes, node) => {
    if (field === null || field === '') return
    if (!byField.has(field)) byField.set(field, [])
    byField.get(field).push({ shapes, node })
  }

  /** Which judged shapes this value carries. `any` is NOT a shape: every type is
   *  assignable FROM any, so an unresolved import or an `any`-typed value would
   *  manufacture consumption — the exact direction this guard refuses. Counted
   *  and printed as a limit rather than dropped, so the blind spot stays
   *  visible in the run. */
  const shapesOf = (valueNode) => {
    const type = checker.getTypeAtLocation(valueNode)
    if ((type.flags & ts.TypeFlags.Any) !== 0) {
      anySites += 1
      return null
    }
    const names = new Set()
    for (const [name, shapeType] of shapeTypes) {
      if (checker.isTypeAssignableTo(type, shapeType)) names.add(name)
    }
    return names
  }

  /** A read can only satisfy a field it is NAMED after — `foo.map` is not a read
   *  of `title`, whatever `foo` is. This is a pre-filter on the walk, not the
   *  identity rule: it never decides which field a read IS, it only skips nodes
   *  that cannot be one. Measured, it takes the guard from 5.5s to 1.2s, and a
   *  guard that takes 5.5s is a guard people route around. */
  const named = (name) => fieldNames.has(name)

  /** The keys a destructuring pattern reads, and the value EACH LEVEL is read
   *  off. `propertyName` is the KEY (the field read); `name` is the BINDING,
   *  which is never a read — that distinction is what closes fix 3's L1
   *  (`const { [k]: title } = …` binds a local called `title`, it does not read
   *  one). A nested pattern is judged against ITS OWN value, not the outer root:
   *  in `const { kids: { skipLabel } } = FIRST_RUN_COPY` the `skipLabel` read
   *  goes through the `kids` hop, and the checker knows that hop's type — so
   *  fix 3's "attributes to the shapes of the ROOT" limit went with the name
   *  table. A REST ELEMENT binds a whole value, not a key, so it contributes no
   *  read here, and needs none: after `const { ...rest } = FIRST_RUN_COPY.kids`,
   *  `rest.skipLabel` is a property access whose value type the checker already
   *  knows (A9 — the name table reported it READ BY NOTHING). */
  function bindingReads(pattern, valueNode) {
    const shapes = shapesOf(valueNode)
    if (shapes === null) return
    for (const el of pattern.elements) {
      if (ts.isOmittedExpression(el) || el.dotDotDotToken !== undefined) continue
      if (el.propertyName !== undefined) {
        const field = keyText(el.propertyName)
        if (field !== null) push(field, shapes, el) // computed key -> nothing is known, so nothing counts
      } else if (ts.isIdentifier(el.name)) {
        push(el.name.text, shapes, el) // shorthand: the binding name IS the key
      }
      if (ts.isObjectBindingPattern(el.name)) bindingReads(el.name, el)
    }
  }

  walk(sf, (n) => {
    if (ts.isPropertyAccessExpression(n)) {
      if (!named(n.name.text)) return
      const shapes = shapesOf(n.expression)
      if (shapes !== null) push(n.name.text, shapes, n)
      return
    }
    if (ts.isElementAccessExpression(n) && ts.isStringLiteral(n.argumentExpression)) {
      if (!named(n.argumentExpression.text)) return
      const shapes = shapesOf(n.expression)
      if (shapes !== null) push(n.argumentExpression.text, shapes, n)
      return
    }
    if (ts.isVariableDeclaration(n) && n.initializer !== undefined && ts.isObjectBindingPattern(n.name)) {
      bindingReads(n.name, n.initializer)
    }
  })

  return { byField, anySites }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Copy-field consumption guard — a copy field nobody reads is a lie waiting to be told')
console.log('==================================================================================')

const findings = []

// One program for the whole tree — the same one `npm run typecheck` builds.
// Attribution needs it: "which shape is this value" is a question about the
// program, not about one file's syntax (fix 4).
const program = buildProgram(ROOT)
const checker = program.getTypeChecker()

/** Every source file in the program under `<root>/src`, with its parse
 *  diagnostics taken through PUBLIC API (`Program.getSyntacticDiagnostics`). */
const SRC_PREFIX = path.normalize(path.join(ROOT, 'src')) + path.sep
const sources = new Map()
for (const sf of program.getSourceFiles()) {
  const file = path.normalize(sf.fileName)
  if (!file.startsWith(SRC_PREFIX)) continue
  sources.set(file, { file, sf, parseErrors: parseErrorsOf(program, sf) })
}

for (const { module: moduleRel, consts: expectedConsts } of COPY_MODULES) {
  const modulePath = path.normalize(path.join(ROOT, moduleRel))
  const parsed = sources.get(modulePath)
  if (parsed === undefined) {
    findings.push(`${moduleRel}: the copy module this guard judges is GONE — a guard whose input vanished is not passing, it is blind`)
    continue
  }
  if (parsed.parseErrors.length > 0) {
    findings.push(
      `${moduleRel}: the copy module does not PARSE (${parsed.parseErrors.length} error(s): ` +
        `${parsed.parseErrors[0]}) — the guard takes no shape from a file it cannot parse`,
    )
    continue
  }

  const { shapes, constShapes, notJudged } = moduleShapeSet(parsed)

  // The precise tripwire. COPY_MODULES names the consts this guard exists to
  // judge; a named const that is no longer recognised is the instrument going
  // blind, and that IS a finding. A const that is NOT named and carries no
  // shape is skipped with a printed line instead — an unrelated exported const
  // must not break the build with no way to excuse it.
  for (const want of expectedConsts) {
    if (!constShapes.has(want)) {
      findings.push(
        `${moduleRel}: "${want}" is listed as a copy const this guard judges, but it is not recognised as an ` +
          'annotated (or unannotated) object-literal export — the instrument is blind on it, which is not a pass',
      )
    }
  }

  // The instrument's own tripwire: zero shapes or zero fields means the walk
  // stopped matching, which looks exactly like a clean module.
  if (shapes.size === 0) {
    findings.push(`${moduleRel}: the parser found NO declared copy shapes — the instrument is broken, not the module`)
    continue
  }
  const declared = [] // [{ shape, field, declaredBy }]
  for (const [shape, { fields, declaredBy }] of shapes) {
    for (const field of fields) declared.push({ shape, field, declaredBy })
  }
  if (declared.length === 0) {
    findings.push(`${moduleRel}: the parser found NO declared copy fields — the instrument is broken, not the module`)
    continue
  }

  // The shapes as TYPES. A shape the checker gives no type for can never be
  // satisfied by a read, so it is a finding, not a silent skip.
  const { types, unresolved } = shapeTypes(checker, shapes)
  for (const name of unresolved) {
    findings.push(
      `${moduleRel}: the guard cannot name the TYPE of the declared shape "${name}" — no read can satisfy its ` +
        'fields, so reporting them unread would be the instrument failing, not the app',
    )
  }

  const consumers = []
  const anySites = []
  const fieldNames = new Set(declared.map((d) => d.field))
  for (const [file, fileParsed] of sources) {
    if (file === modulePath || isTestFile(path.basename(file))) continue
    if (fileParsed.parseErrors.length > 0) {
      // A file that does not parse is NOT allowed to contribute reads: TypeScript
      // recovers from `const zz = 'abc<newline>read.field'` by producing a real
      // property-access node out of the string's second line, so an unparseable
      // file could hand this guard a read that no compiling program contains.
      findings.push(
        `${path.relative(ROOT, file)}: does not PARSE (${fileParsed.parseErrors.length} error(s): ` +
          `${fileParsed.parseErrors[0]}) — no read from it counts, and a file the guard cannot read is not a clean file`,
      )
      continue
    }
    const { byField, anySites: n } = consumerReads(checker, fileParsed.sf, types, fieldNames)
    if (n > 0) anySites.push(path.relative(ROOT, file))
    if (byField.size === 0) continue
    consumers.push({ file, parsed: fileParsed, byField })
  }

  const allow = ALLOWLIST[moduleRel] ?? {}
  console.log(`  module: ${moduleRel}`)
  console.log(`  judged copy consts: ${expectedConsts.join(', ')}`)
  console.log(`  declared shapes: ${shapes.size} (${[...shapes.keys()].join(', ')})`)
  console.log(`  declared fields: ${declared.length} (${declared.map((d) => `${d.shape}.${d.field}`).join(', ')})`)
  console.log(`  consumer files (a judged shape's value is read in it; no test file qualifies): ${consumers.length}`)
  // L3: a skipped const must be VISIBLE IN THE COUNTS, not just in a line that
  // scrolls past, and the line must say what to do about it.
  console.log(`  skipped consts: ${notJudged.length} (${notJudged.map((n) => n.name).join(', ') || 'none'})`)
  for (const note of notJudged) {
    console.log(`  skipped— exported const ${note.name}: ${note.why}`)
    console.log(
      '           do this: if it IS copy, give it a shape this module declares and add it to COPY_MODULES in this ' +
        'guard; if it is not copy, leave it — this line is a notice, and the count above is what keeps it honest',
    )
  }
  for (const note of [...new Set(anySites)]) {
    console.log(
      `  limit—— ${note}: a field-named read off an \`any\`-typed value cannot be attributed to a shape, so it is ` +
        'missed (see KNOWN LIMITS in the header) — usually an unresolved import, which is a type error anyway',
    )
  }

  const seenAllow = new Set()
  for (const { shape, field, declaredBy } of declared) {
    const key = `${shape}.${field}`
    let hit = null
    for (const c of consumers) {
      const found = (c.byField.get(field) ?? []).find((s) => s.shapes.has(shape))
      if (found !== undefined) {
        hit = { file: path.relative(ROOT, c.file), line: lineAt(c.parsed, found.node) }
        break
      }
    }
    const listed = Object.prototype.hasOwnProperty.call(allow, key)
    const reason = listed ? String(allow[key] ?? '').trim() : ''
    if (listed) seenAllow.add(key)

    if (hit !== null) {
      console.log(`  read   — ${key} (${declaredBy}) at ${hit.file}:${hit.line}`)
      if (listed) {
        findings.push(
          `${moduleRel}: "${key}" is allowlisted as unread but IS read at ${hit.file}:${hit.line} — ` +
            'a stale allowance is a hole left open for the next unread field to fall into; delete the entry',
        )
      }
      continue
    }

    if (!listed) {
      findings.push(
        `${moduleRel}: "${key}" (${declaredBy}) is declared and valued but READ BY NOTHING in src — no ` +
          `binding or value that carries ${shape} reads "${field}" anywhere outside the module's own declaration, its ` +
          `data, and its tests. A read through a SIBLING shape's value does not count. Render it, delete it, ` +
          'or allowlist it with a reason.',
      )
      continue
    }
    if (reason === '') {
      findings.push(
        `${moduleRel}: "${key}" is allowlisted as unread with NO REASON — an unexplained allowance is ` +
          'how an unread word gets a pass on paper',
      )
      continue
    }
    console.log(`  allowed— ${key} (${declaredBy}): ${reason}`)
  }

  for (const key of Object.keys(allow)) {
    if (!seenAllow.has(key)) {
      findings.push(
        `${moduleRel}: the allowlist names "${key}", which this module does not declare as a shape.field — ` +
          'a typo in an allowance guards nothing and hides nothing',
      )
    }
  }
}

console.log()
if (findings.length === 0) {
  console.log('PASS — every declared copy field is read by the app, or allowed with a reason.')
  process.exit(0)
}

console.log(`FAIL — ${findings.length} finding(s):`)
for (const f of findings) console.log(`  - ${f}`)
console.log()
console.log('These are deterministic findings, not opinions. Fix the cause; do not')
console.log('silence the guard. Either the app renders the word, or the field goes away,')
console.log('or the allowance says why in writing.')
process.exit(1)
