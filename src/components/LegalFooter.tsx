import { Link } from 'react-router'
import { LEGAL_CONTACT_EMAIL, PRIVACY_PATH, TERMS_PATH } from '../lib/legal'

/**
 * The two legal doors, as one small line of text.
 *
 * WHY IT IS A COMPONENT AND NOT A COPY-PASTE: release checklist item 1.6 says
 * both pages must be reachable from the app, and "reachable" is a property that
 * quietly stops being true when a new public screen forgets the links. One
 * component means one place that grows when a third document arrives.
 *
 * It renders on the signed-out screens (where a person deciding whether to sign
 * up is most likely to look for it) and at the foot of the documents themselves.
 * It is deliberately quiet — this is a link nobody needs until they need it.
 */
export function LegalFooter({ className = '' }: { className?: string }) {
  // ⚠️ `inline-flex min-h-11 items-center` IS NOT DECORATION. The first version
  // of this component was plain text links, and `mobile-audit` failed 14 checks
  // across /login, /reset-password and the signed-out redirect: each link
  // measured 20px tall against a 44px floor. A legal link is still a control.
  const linkClass =
    'inline-flex min-h-11 items-center px-1 underline underline-offset-2 hover:text-slate-700'
  return (
    <nav
      aria-label="Legal"
      data-testid="legal-footer"
      className={`flex flex-wrap items-center justify-center gap-x-2 text-xs text-slate-500 ${className}`}
    >
      <Link to={PRIVACY_PATH} className={linkClass}>
        Privacy
      </Link>
      <span aria-hidden="true">·</span>
      <Link to={TERMS_PATH} className={linkClass}>
        Terms
      </Link>
      <span aria-hidden="true">·</span>
      <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={linkClass}>
        Contact
      </a>
    </nav>
  )
}
