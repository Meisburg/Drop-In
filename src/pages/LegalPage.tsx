import { Link } from 'react-router'
import { DropInMark } from '../components/DropInMark'
import { LegalFooter } from '../components/LegalFooter'
import { LEGAL_CONTACT_EMAIL, type LegalDoc } from '../lib/legal'

/**
 * One legal document, rendered (release checklist item 1.6).
 *
 * It is a PUBLIC route on purpose, outside the signed-in shell: Google requires
 * the privacy policy URL to work for anyone, including a reviewer who has no
 * account, and a person deciding whether to sign up should be able to read it
 * before handing over an email address.
 *
 * The shape follows the app's own masthead — the de-carded brand lockup from
 * /login and /reset-password, not a new visual world — because these pages are
 * part of the same product, not a bolted-on legal site.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 bg-page px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link to="/" className="flex items-center gap-2 text-indigo-600" aria-label="Drop In home">
          <DropInMark className="h-8 w-8" />
          <span className="font-display text-2xl font-bold">Drop In</span>
        </Link>
      </header>

      <article className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold text-slate-900" data-testid="legal-title">
            {doc.title}
          </h1>
          <p className="text-sm text-slate-600">{doc.summary}</p>
          <p className="text-xs text-slate-500" data-testid="legal-updated">
            Last updated {doc.updated}
          </p>
        </div>

        {doc.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold text-slate-900">{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="text-sm text-slate-700">
                {paragraph}
              </p>
            ))}
            {section.bullets === undefined ? null : (
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-slate-700">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <p className="text-sm text-slate-700">
          Written questions are welcome at{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-indigo-600 underline underline-offset-2">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </article>

      <LegalFooter className="mt-auto pt-4" />
    </div>
  )
}
