# Browser annotations (Agentation) — the human's batch feedback

The founder batches design feedback: he opens the dev app, clicks a run of
elements, writes one comment on each, across several routes, and then wants the
whole batch **triaged at once**. `/impeccable live` cannot serve that loop — it
takes one element per round trip — so the repo carries a second, dev-only
annotation toolbar.

## The two halves

| Half | Where | Notes |
|---|---|---|
| Toolbar (in the app) | `src/dev/AgentationDev.tsx`, reached only through an `import.meta.env.DEV` branch in `src/App.tsx` | Dev-only, **verified**: the production bundle was grepped for the package and contains nothing. It also means `mobile-audit` / `design-detect` never see it — both run against a production build. |
| Collection server | `npx -y agentation-mcp server`, port **4747** | Started by a human or an agent; it is **per-machine, not per-session**, and a new session does not inherit the previous one's process. |

The toolbar posts to `http://localhost:4747` (the `endpoint` prop). With that
server down the toolbar still works — annotations go to the clipboard instead of
syncing — so a failed sync is not a bug in the app.

## Reading the batch (the thing an agent does)

```bash
npx -y agentation-mcp server    # once, if :4747 is not already answering
curl -s http://localhost:4747/pending | head -c 4000
```

- `GET /pending` — every pending annotation, across every route.
- `GET /sessions` — the sessions (one per route) when you need to group by page.
- `GET /health`, `GET /status` — is it up, and is a browser attached.

After triaging, mark items so the human's queue does not grow forever:

```bash
curl -s -X POST http://localhost:4747/annotations/<id>/resolve
```

(Also available: `…/acknowledge`, `…/dismiss` with a reason, and a reply
endpoint for threading a question back onto an annotation.)

## What each annotation carries

`url`, `comment`, `element`, `elementPath`, `attributes` (its default
identifying attributes include **`data-testid`**, which is how this app
addresses everything), `sourceFile` as `path:line:column`, plus
`selectedText`, `cssClasses`, `computedStyles` and `boundingBox` when the pick
supplies them.

**`sourceFile` is the field that matters.** Three of six `/impeccable live`
generates once anchored on a look-alike component (`FirstRunCard.tsx` instead of
`ProfileView.tsx`, `PagePage`'s sibling instead of the real host panel, and so
on) because a CSS selector matched twice. When an annotation carries a
`sourceFile`, open THAT file rather than grepping the selector.

## How to triage it

1. Pull the batch; group by `sourceFile` — several notes on one file are one
   slice, not several.
2. Split each item into **one-line fix** vs **slice** (schema, data source,
   cross-surface contract). Say which is which; do not silently grow a slice out
   of a copy change.
3. Write the triage down (`.scratch/` is fine) — the chat is not the system of
   record, and a batch is exactly the thing that gets lost in a compaction.
4. Resolve or dismiss what you answered, so the next pull shows only what is
   still open.

## Deliberate limits

- **Desktop only.** The toolbar does not run on a phone. Feedback about the
  phone experience still arrives as prose, and that is fine — the sharpest notes
  this repo has received were single sentences.
- **A source location is best effort.** It comes from React development
  metadata, so it is absent in a production build (by design) and may be missing
  on a deeply wrapped element. Absent means "grep the selector", not "the
  annotation is broken".
- **Not vendored into the product.** The package is `PolyForm Shield`, which is
  source-available but not OSI open source — fine as dev tooling, never shipped.
