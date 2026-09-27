/**
 * The app's review-scan seam — the browser twin of the push sender's scan
 * decision.
 *
 * Two runtimes, ONE implementation, exactly as `src/lib/emailFallback.ts`
 * re-exports `supabase/functions/_shared/emailFallback.ts` (and `src/lib/push.ts`
 * re-exports `_shared/pushCopy.ts`): the Deno sender imports the shared module
 * directly, the app and the vitest spec import it through this file. The shared
 * module is pure — it takes every fact as an argument and reads no global, no
 * clock, no env and no `window` — so there is nothing to adapt for the browser.
 *
 * `REVIEW_PROMPT_WINDOW_HOURS` is re-exported with the functions on purpose: it
 * is a RULE (see `plan.md` Interfaces), and slice 3's `send-push` imports it from
 * here rather than repeating the number. Before this seam existed the plan put
 * the constant beside `STARTING_SOON_WINDOW_MINUTES` in the Deno wiring file,
 * where the vitest lane could not reach it.
 *
 * Every value and every type is re-exported, so a consumer never has to reach
 * across the `src/` boundary and the two runtimes can never drift. There are no
 * tsconfig path aliases in this repo, hence the relative path with the explicit
 * `.ts` extension.
 */
export {
  REVIEW_PROMPT_WINDOW_HOURS,
  isReviewPromptCandidate,
  reviewPromptRow,
} from '../../supabase/functions/_shared/reviewScan.ts'
export type {
  ReviewPromptFacts,
  ReviewPromptInput,
  ReviewPromptRow,
} from '../../supabase/functions/_shared/reviewScan.ts'
