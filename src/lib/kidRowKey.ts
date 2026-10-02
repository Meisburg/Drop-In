/**
 * The onboarding kids card's row keys (V28 r2 fix round 2, R2 + R3).
 *
 * A kid row's key is its STABLE client identity (fix round 1, F2): every
 * write after an `await` (the photo's crop-confirm, Remove, Continue)
 * attaches to the key, never the array index — a row removed above an
 * in-flight confirm re-indexes the array, and an index-attached attach
 * would land on the wrong row, or none.
 *
 * The key needs SESSION-UNIQUENESS, not cryptographic strength: two rows
 * in one card, never persisted, never shared. So the fast path is
 * `crypto.randomUUID` and the fallback is `Date.now()` + `Math.random()`:
 * `randomUUID` exists only in SECURE contexts (HTTPS / localhost), and a
 * phone testing against a plain-HTTP LAN address is NOT one — there the
 * call would throw an uncaught `TypeError` and break "Add another kid"
 * with no user-visible error (R3).
 *
 * The key is minted by the CALLER, outside any state updater (R2):
 * updaters are pure, and StrictMode double-invokes them — a
 * `crypto.randomUUID()` inside the updater would mint a different key per
 * invocation, and the committed row's key would depend on which invocation
 * React settles. This module is that caller's home (the build law: a
 * decision with a rule ships in `src/lib/` with its sibling test).
 */
export function newKidRowKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // `r-<epoch ms>-<random base-36>`: the prefix makes a minted key
  // distinguishable from a kid id (a UUID) in logs, and the random tail
  // breaks a same-millisecond collision between two quick adds.
  return `r-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
