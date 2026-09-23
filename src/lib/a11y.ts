/**
 * Accessibility helpers for form fields with validation messages.
 *
 * Pure module (build law): no React import, no ambient dependencies — the
 * values it returns are plain strings and booleans that a component spreads
 * onto its controls. Sibling test: `a11y.test.ts`.
 */

/** Stable ids so aria-describedby can reference an error node. */
export function errorId(field: string): string {
  return `err-${field}`
}

/** Props for a control with a possibly-failing validation message. */
export function fieldA11y(
  field: string,
  message: string | null,
): { 'aria-invalid': boolean; 'aria-describedby': string | undefined } {
  if (message === null) {
    return { 'aria-invalid': false, 'aria-describedby': undefined }
  }
  return { 'aria-invalid': true, 'aria-describedby': errorId(field) }
}