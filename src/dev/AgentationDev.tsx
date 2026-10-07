import { useLocation } from 'react-router'
import { Agentation } from 'agentation'

/**
 * DEV-ONLY ANNOTATION TOOLBAR (Agentation, added 2026-10-06).
 *
 * WHY IT EXISTS: the founder batches feedback — several elements, one comment
 * each, across several routes — and wants the whole batch triaged at once.
 * `/impeccable live` serves one element at a time, so it cannot run that loop.
 * The payload is the point: every annotation carries the route, the element
 * path, `data-testid` (this app's own addressing scheme) and a detected
 * `path:line:column`, which is what lets the agent find the source instead of
 * guessing at a look-alike component.
 *
 * IT IS DEV-ONLY, AND THAT IS ENFORCED RATHER THAN HOPED FOR. This module is
 * reached only through an `import.meta.env.DEV` branch in App.tsx; Vite
 * replaces that expression with `false` in a production build, so the dynamic
 * import is eliminated and `agentation` never enters `dist/`. Adding it
 * included grepping the built bundle for the package (see the note in
 * App.tsx). If that check ever fails, the branch is wrong, not the grep.
 *
 * `key={location.key}` IS DELIBERATE. Agentation buckets feedback per route,
 * and an in-app navigation is a `pushState` that it cannot observe by itself.
 * Remounting on navigation matches its own documented behaviour: a pending
 * selection is cancelled on navigation while SAVED feedback stays with the
 * route it was written on.
 *
 * `endpoint` points at the local MCP server (`npx -y agentation-mcp server`).
 * With it down, the toolbar still works — annotations are copied to the
 * clipboard instead of synced.
 */
export default function AgentationDev() {
  const location = useLocation()
  return <Agentation key={location.key} appName="Drop In" endpoint="http://localhost:4747" />
}
