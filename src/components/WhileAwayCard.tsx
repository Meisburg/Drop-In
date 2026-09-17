import { GOING_CIRCLE_LIMIT, type WhileAwayInbox, type WhileAwayItem } from '../lib/feed'

/**
 * The feed-top "While you were away" card (V8 ticket 03): the amber
 * nudge-banner pattern (SettingsPage's "Finish your profile" shape), full
 * width, listing up to WHILE_AWAY_ITEM_LIMIT (3) news items — each one an
 * avatar face (or three) + one line of copy + a tap target that lands on that
 * post's /playdate/:id.
 *
 * Tap targets (the ticket's pins):
 * - an ITEM tap is the page's `onOpenItem` (the awaited cursor restamp, then
 *   the navigation) — never a bare link, because opening the inbox is what
 *   dismisses it;
 * - the "+N more" line and the card's own padding are `onDismiss` (the same
 *   restamp, no navigation — the card clears because the cursor moved).
 *
 * The card renders NOTHING when there is nothing new (`items` empty — the
 * page's unsettled and failed reads both land here as an empty inbox): the
 * zero-pressure soul, unchanged. It renders no error state of any kind.
 */
export interface WhileAwayCardProps {
  inbox: WhileAwayInbox
  /** An item tap: restamp the cursor, then open the post. */
  onOpenItem: (playdateId: string) => void
  /** The card padding / "+N more" tap: restamp the cursor and stay put. */
  onDismiss: () => void
}

export function WhileAwayCard({ inbox, onOpenItem, onDismiss }: WhileAwayCardProps) {
  if (inbox.items.length === 0) return null
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
      onClick={onDismiss}
    >
      <p className="font-semibold">While you were away</p>
      <ul className="mt-2 flex flex-col gap-1">
        {inbox.items.map((item) => (
          <li key={item.playdateId}>
            <button
              type="button"
              onClick={(event) => {
                // The item owns the tap (restamp + navigate); the card's own
                // padding handler must not also fire.
                event.stopPropagation()
                onOpenItem(item.playdateId)
              }}
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left hover:bg-amber-100"
            >
              <WhileAwayFaces item={item} />
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {inbox.moreCount > 0 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onDismiss()
          }}
          className="mt-2 min-h-11 px-1 font-medium text-amber-900 underline underline-offset-2"
        >
          +{inbox.moreCount} more
        </button>
      ) : null}
    </div>
  )
}

/**
 * The item's faces: the newest pingers who said they're going, up to
 * GOING_CIRCLE_LIMIT (the same cap and the same 24px circle as the feed card's
 * going line — avatar_url, or the display-name initial on a slate-200 circle
 * when there is none).
 *
 * Each face is NAMED (alt / aria-label + title): the copy is the pinned
 * template (no name in it), so the accessible name is where "who pinged" is
 * carried — a host on a screen reader hears the family, and the name is what
 * long-press/hover shows.
 */
function WhileAwayFaces({ item }: { item: WhileAwayItem }) {
  if (item.faces.length === 0) return null
  return (
    <span className="flex shrink-0 items-center">
      {item.faces.slice(0, GOING_CIRCLE_LIMIT).map((face, index) => {
        const overlap = index > 0 ? ' -ml-2' : ''
        if (face.avatarUrl !== null && face.avatarUrl !== '') {
          return (
            <img
              key={index}
              src={face.avatarUrl}
              alt={face.displayName}
              title={face.displayName}
              className={`h-6 w-6 rounded-full border-2 border-white object-cover${overlap}`}
            />
          )
        }
        return (
          <span
            key={index}
            role="img"
            aria-label={face.displayName}
            title={face.displayName}
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-semibold text-slate-600${overlap}`}
          >
            {(face.displayName.charAt(0) || '?').toUpperCase()}
          </span>
        )
      })}
    </span>
  )
}
