# 01: Remove the developer comment rendered on /new

**What to build:** On the post form at `/new`, the literal internal prose
`/* V23 slice 3: the bottom "Browse all N places" door is GONE. … */` currently
renders as visible page text directly below the **Post drop-in** button. A
parent reading it sees developer notes about a decision that was already made.
Delete it (or convert it to a real JSX comment) so nothing renders there, and
pin the result with a rendered-text assertion, not a source grep.

The block comment sits between the `<PlaydateFormFields …/>` element and the
directory-sheet JSX in `src/pages/NewPlaydatePage.tsx` (approximately lines
1217–1221). It was valid JSX until it lost its `{/* … */}` wrapper — introduced
by `3948c43` (the V23 feedback batch). There is no user-facing copy to replace:
the field's own **Browse places** button is the surviving door, and the audit's
preserve-list forbids resurrecting a bottom-of-form directory control.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `/new` renders no text beginning `/* V23 slice 3` and no text mentioning
      the internal "Browse all N places" decision.
- [ ] The **Browse places** field control still opens the directory sheet.
- [ ] The form still submits, and the sheet's focus trap, Escape handling, and
      place-selection behavior are unchanged.
- [ ] Rendered-text regression coverage exists: the assertion reads the page's
      rendered text after scrolling to the submit area, and does not merely
      search source files.
- [ ] The regression assertion is added to the spec that already drives `/new`
      end-to-end (`e2e/place-directory-in-new.e2e.ts`), which already asserts
      the removed `browse-all-places` testid is absent.
- [ ] `npm run verify` passes, and
      `npm run test:e2e -- e2e/place-directory-in-new.e2e.ts` passes.
