# Developer handoff: first-use discovery audit

**Status:** ready to plan and build  
**Audit date:** 2026-09-25  
**Product target:** production Drop In at a 390 × 844 mobile viewport  
**Scope:** a signed-out parent enters, creates an account, finds a nearby drop-in, opens it, and says “I’m going.” The public shared-event route was also checked.

This is an implementation brief, not a source-code audit. The observations below came from a live, new-user run with two fictional Seattle accounts and one fictional event. Source links identify likely implementation locations only; they are not the evidence for a finding.

## Read this before changing code

1. Read `AGENTS.md`, then turn these recommendations into bounded slices in `plan.md` before dispatching a builder.
2. Read `docs/agents/code-structure.md` before writing or reviewing a diff. Read `docs/agents/browser-lanes.md` before any production-browser re-check.
3. Keep the public shared-link privacy boundary intact: public visitors can see event information and a count, but not comments, attendee identities, or profiles. A public visitor must still explicitly confirm “I’m going” after signing in; do not auto-RSVP them.

## Live evidence and journey result

The core journey completed, but it was not entirely self-explanatory.

| Step | Observed result | Assessment |
| --- | --- | --- |
| Signed-out entry | The login screen clearly offered “New here? Create an account.” | Healthy |
| Account creation | First name, last name, home address, email, and password were understandable. Address privacy copy was visible. The entered address did not resolve to a ZIP, and the next screen asked for a ZIP without explaining why. | Minor friction |
| Nearby feed | The new account saw the nearby fixture and distance. | Healthy |
| Event detail | Time, place, host, attendance, and the filled “I’m going” action were easy to scan. | Healthy |
| RSVP result | “✓ Going,” the attendance count, and “Message the host” made the result clear. A notification prompt/note appeared immediately after the RSVP and competed with that moment. | Minor friction |
| Public shared event | The signed-out visitor could understand the event and was invited to sign up; comments remained hidden. | Healthy |
| Post a drop-in form | Literal internal source-comment text was visible below the submit button. | Release-blocking presentation defect |

The audit data was removed after the run. Exact verification returned zero audit users, profiles, fixture events, and audit RSVP rows. No production data should be needed to reproduce these changes.

## Prioritized work

### 1. P0 — remove the literal developer comment from the post form

**Observed:** At the bottom of `/new`, directly below the orange **Post drop-in** button, the page rendered this internal prose:

```text
/* V23 slice 3: the bottom "Browse all N places" door is GONE... */
```

**Confirmed implementation cause:** [NewPlaydatePage.tsx](../src/pages/NewPlaydatePage.tsx) contains those five lines as plain JSX text at approximately lines 1217–1221, between `PlaydateFormFields` and the directory-sheet JSX. They need to be deleted or converted to a real JSX comment. There is no user-facing copy to replace.

**Acceptance criteria:**

- `/new` contains no rendered text beginning `/* V23 slice 3` or mentioning the internal “Browse all N places” decision.
- The **Browse places** field control still opens the directory sheet.
- The form still submits normally, and the directory sheet's focus, Escape, and selection behavior are unchanged.
- Add a regression assertion to the closest existing `/new` Playwright coverage: it must inspect the rendered page text after scrolling to the submit area, not merely search source code.

**Likely files:**

- [NewPlaydatePage.tsx](../src/pages/NewPlaydatePage.tsx)
- [place-directory-in-new.e2e.ts](../e2e/place-directory-in-new.e2e.ts) for the rendered regression check

### 2. P1 — make the address-to-ZIP fallback explicit during signup

**Observed:** The signup form correctly says the address is used to show nearby drop-ins and is not shown to other parents. When address resolution did not yield a ZIP, the account was created and the user was routed to the ZIP onboarding step. Nothing on that transition explained that the address lookup had failed or why another location field was now required.

**Recommendation:** Keep account creation non-blocking, but make the fallback legible. The recommended experience is: explain that the account is ready, say that the address could not be matched to a ZIP, and put the ZIP field immediately in context. Do not make a third-party geocoding failure prevent account creation.

**Acceptance criteria:**

- A resolved Seattle address sends a new parent directly to a nearby feed with nearby results when data exists.
- An unresolved address still creates the account and lands on the ZIP fallback without a dead end.
- The fallback states why a ZIP is requested now, preserves the existing address-privacy promise, and provides an inline, accessible validation error for an invalid ZIP.
- The parent can complete setup without knowing implementation terms such as “geocoding” or “home_zip.”
- Do not store or expose a precise home address beyond the existing privacy model.

**Likely files:**

- [LoginPage.tsx](../src/pages/LoginPage.tsx) — signup flow and silent `zipFromAddressQuery` fallback
- [App.tsx](../src/App.tsx) and the onboarding route — routing boundary and fallback copy
- [onboarding-gate.e2e.ts](../e2e/onboarding-gate.e2e.ts) plus a focused new-signup test

### 3. P1 — protect the immediate RSVP success moment

**Observed:** After a parent chose **I’m going**, the detail view correctly changed to **✓ Going**, showed “1 family going — come say hi,” listed **You**, and exposed **Message the host**. A notification opt-in/fallback card appeared in the same immediate action sequence and pulled attention away from the RSVP confirmation.

**Recommendation:** The RSVP confirmation has priority. Do not present a permission request or notification explainer in the same immediate detail-page state as a successful RSVP. If notifications remain action-triggered, defer the prompt until a later, non-critical moment (for example, a subsequent feed visit), or limit this prompt to another high-intent action. Settings must remain the durable place to manage notifications.

**Acceptance criteria:**

- Immediately after a successful RSVP, the primary visible response is the changed RSVP state and attendance result.
- A browser notification permission request, opt-in card, or fallback note does not appear over or beside that immediate RSVP confirmation.
- The parent can still find notification controls in Settings.
- A denied, unsupported, or dismissed notification state does not make the RSVP look failed or incomplete.
- Preserve the current one-tap RSVP behavior and its explicit undo semantics.

**Likely files:**

- [PlaydateDetailPage.tsx](../src/pages/PlaydateDetailPage.tsx) — RSVP save and push-prompt arm
- [PushOptInPrompt.tsx](../src/components/PushOptInPrompt.tsx) — global prompt timing and copy
- [pushClient.ts](../src/lib/pushClient.ts) and [push.ts](../src/lib/push.ts) — trigger/decision seam
- [push-subscribe.e2e.ts](../e2e/push-subscribe.e2e.ts) and targeted RSVP coverage

### 4. P2 — keep test fixtures out of the production discovery feed

**Observed:** Before the audit fixture was created, the production feed exposed a pre-existing event visibly labeled as E2E/test data. A real new parent could interpret this as a real invitation or as a low-trust product.

**Recommendation:** Treat this as release hygiene. Sweep only clearly identified automated-test records after test runs and before production validation. Never use broad deletion criteria, and do not make the sweep a reason to delete real parent content.

**Acceptance criteria:**

- Production discovery does not display events with the project’s test-marker convention to ordinary parents.
- Cleanup is constrained to an explicit, documented marker convention and reports the exact records removed.
- A failed cleanup is surfaced as a release-blocking operational failure, not silently ignored.
- The existing public-link and end-to-end tests retain isolated fixture setup and cleanup.

**Likely files:**

- [sweep-e2e-markers.mjs](../scripts/sweep-e2e-markers.mjs)
- [share-public.e2e.ts](../e2e/share-public.e2e.ts) and other fixture-producing specs
- Deployment/runbook documentation rather than product UI code, unless the current sweep lacks the required guardrails

## Preserve these behaviors

- The signup screen makes the first action and the address privacy purpose clear.
- The nearby feed gives a new parent a visible, local result quickly.
- The event detail page gives **I’m going** visual priority, then confirms the result with a count and a direct host-message path.
- A public shared link supplies enough event context to motivate signup while keeping comments and attendee identities private.
- The post form’s place directory remains adjacent to the place question; removing the stray comment must not resurrect a second bottom-of-form directory control.

## Verification plan

For every implementation slice, run the project gate first:

```bash
npm run verify
```

Then run the impacted browser checks against the project’s approved test target, not a human’s logged-in browser. At minimum, cover:

```bash
npm run test:e2e -- e2e/place-directory-in-new.e2e.ts
npx playwright test e2e/share-public.e2e.ts e2e/onboarding-gate.e2e.ts e2e/push-subscribe.e2e.ts
```

The second command is intentionally a Playwright command rather than an `npm` script; remove or adjust any spec that is not relevant to the final change.

Finish with a manual 390 px-wide re-check of these exact states:

1. Signup with a resolvable address and an unresolvable address.
2. Nearby feed → event detail → RSVP confirmation.
3. Public shared event → sign-in → explicit RSVP confirmation.
4. Bottom of `/new` below the submit button.

## Not established by this audit

Keyboard-only navigation, screen-reader output, 200% zoom/reflow, and real slow/offline network recovery were not tested. They should be separate validation work, not claimed as complete from this mobile visual run.
