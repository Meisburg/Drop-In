# Grounding gates (Exa)

Read this **before dispatching a builder for a slice that touches an external
API, library, or version-specific behavior.**

The open web is a source of record for interfaces, not an authority on intent.

- `plan.md` `## Interfaces` must be Exa-grounded before any builder dispatch:
  the orchestrator dispatches `orchestrator-researcher` first when a slice
  touches an external API, library, or version-specific behavior. For this repo
  that means Supabase, Stripe, Vite, Tailwind, or PWA manifest shapes.
- A builder that hits an undocumented external shape grounds it before coding
  and cites the URL in its report.
- `websearch` (Exa, injected by OmO) is the fast path; the `exa-search` /
  `exa-contents` skills are the precise path (filters, structured output).
- Findings land in `research/<topic>.md`; chat is not the system of record.
- Corollary for this repo: a slice is not ready to build against a Supabase
  migration whose applied state nobody has confirmed against the live project.
