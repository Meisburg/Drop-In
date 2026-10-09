import { Link } from 'react-router'

/**
 * V24 slice 05: the bottom nav's CENTRE action — a raised circular "+" that
 * links to /new (the existing posting route). It is an ACTION, not a fifth
 * NavTab destination: it sits between Inbox and Places in App.tsx's <nav>,
 * visually breaking the bar's plane (raised, circular, brand fill) so it
 * reads as "do something" rather than "go somewhere".
 *
 * The founder overrode V22 slice 12 on 2026-09-25 after using the app on a
 * phone ("maybe we put it dead center in the middle of the menu bar at the
 * bottom again between inbox and places as this cool post button"). That
 * override deliberately deviates from Apple HIG ("a tab bar supports
 * navigation, not actions") — see the rewritten rationale in src/App.tsx.
 *
 * Accessibility: aria-label carries the real name ("Create a drop-in"); the
 * "+" glyph is aria-hidden. The tap target is 56px (h-14 w-14), above the
 * 44px floor; focus-visible ring + motion-reduce follow the app's control
 * conventions (see BackControl.tsx). data-testid="feed-post-drop-in" is
 * carried over from the feed CTA it replaces (V22 slice 12 placed the Post
 * action on the feed; V24 slice 05 moves it here) so the five existing e2e
 * call sites keep working unchanged.
 */
export function PostActionButton() {
  return (
    <Link
      to="/new"
      data-testid="feed-post-drop-in"
      aria-label="Create a drop-in"
      className="relative z-10 -mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform duration-150 motion-reduce:transition-none hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:-mt-0 md:mx-auto md:h-12 md:w-12 md:shadow-md"
    >
      <span aria-hidden="true" className="text-2xl font-bold leading-none">
        +
      </span>
    </Link>
  )
}
