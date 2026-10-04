# 02 — Finishing signup must not, by itself, earn a notification ask

**Status:** ready-for-agent
**Type:** Product Improvement
**Source:** Deepseek PCR 008 → `D2`
**Decision (founder, 2026-10-04):** drop the signup trigger point. The ask
happens only after a **real action** — a created post, or "I'm going".

## What happens

`src/pages/LoginPage.tsx:149` calls `armPushPromptForAction('signup')` when the
account is created. The prompt is mounted for the whole authed shell
(`src/App.tsx:526`) and suppressed only on `/settings`, `/onboarding` and `/new`
(`src/lib/push.ts:617-619`). `/onboarding` renders no nav (`src/App.tsx:400`), so
the point is armed but unspent during the first run — and the **first feed paint
after onboarding resolves it**. A parent who has never posted and never said
they are going meets the notification/install card on top of an empty feed. On
iOS it is the install note instead; either way it is the first thing they see.

This must land **before the 5-parent first-open test runs**, or the prompt appears
during the scored zero-instruction block and contaminates the observation.

## Acceptance criteria

1. Completing signup and landing on the feed shows **no** push card and **no**
   install note.
2. The ask still appears after a real action — a created post, or a saved "I'm
   going" — with today's deferral behaviour intact.
3. "Not now" still records the point, one offer per point still holds, and
   `/settings`, `/onboarding`, `/new` still suppress.
4. `src/lib/push.test.ts` is **updated to pin the new rule** ("signup alone earns
   no ask"), not weakened or deleted.

## Verification

```bash
npm run verify
npm run test:e2e -- e2e/push-subscribe.e2e.ts
```

## Likely files

- `src/lib/push.ts` — `PushPromptTrigger` and `decidePermissionPrompt`
- `src/lib/pushClient.ts` — if it enumerates or validates trigger points
- `src/pages/LoginPage.tsx:149` — remove the arm
- `src/lib/push.test.ts` — the pin

## Considerations

- **Change only the signup point.** The post and ping points, the max-one-offer
  rule and the four suppressed paths are deliberate; the triage declined the
  cooldown request for exactly that reason.
- If the arm helper's signature or union type changes, expect compile errors at
  every call site — that is the type system doing the work, not a defect.
- If a "just signed up" signal is still wanted for anything else, keep the write
  and change the decision seam instead of deleting the record.
