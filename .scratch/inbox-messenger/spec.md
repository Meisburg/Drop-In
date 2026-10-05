# Inbox: make the thread read like a messenger — spec (2026-10-05)

**Founder's ask, verbatim:**

> *"critique this messaging functionality. I would expect it to feel more like
> Facebook Messenger and right now it doesn't look very good at all … It seems
> strange to me how the layout is. I think it should be more familiar and
> standardized based on what the leaders in messaging apps — how they structure
> everything."*

Surface: the DM thread view in `src/pages/InboxPage.tsx` (1434 lines), reached
from `/inbox`. It is the ONE page in the app that is a conversation, and it is
laid out like a form.

## 1. What is wrong, measured from the rendered markup

1. **The composer is a boxed card with Send on its own row.** A `rounded-xl
   border bg-white p-3` card holds a borderless textarea, and a separate
   `bg-indigo-600` "Send" button sits right-aligned *below* it. Every leading
   messenger puts one rounded field with the send control **inline at its right
   edge**. This is most of the "strange layout".
2. **The composer scrolls away.** The whole `<main>` scrolls
   (`px-4 py-4 pb-[calc(6rem+env(safe-area-inset-bottom))]`), so nothing is
   pinned; a conversation's message area scrolls and its composer stays put.
3. **The header is headless.** `inbox-back-to-conversations` + two truncated
   `<p>`s that render EMPTY — no avatar, no name. A thread must name the person.
4. **The empty state is a grey panel** (`min-h-40 rounded-xl border bg-slate-50`)
   where a familiar thread shows a quiet canvas with a face and "Say hi".
5. **Quick replies float as a third block** (`mt-3` sibling), not as a strip
   attached to the composer.
6. **Bubbles are unverified** — the thread was empty in the capture, so this spec
   must measure side-alignment, timestamps and day separators rather than assume.

## 2. The target anatomy (what "familiar" means concretely)

- **Pinned header:** back control + avatar + first name (and the `@handle` as the
  secondary line), on the card/surface, separated by the standard hairline.
- **A scroll region that fills the rest of the viewport** and opens at the newest
  message: the thread column owns its height
  (`flex h-[calc(100dvh-<nav+safe>)] flex-col`, `flex-1 min-h-0 overflow-y-auto`)
  rather than letting `<main>` scroll. The nav is a bottom bar on phones and a
  left rail at `md` — both cases must be handled.
- **Bubbles:** outgoing right-aligned on the action tone with its label flipped,
  incoming left-aligned on the card surface; consecutive messages from one sender
  group; `rounded-xl` (never `rounded-full`); timestamp at `text-xs text-slate-500`
  (4.89:1) once per group, and a day separator when the day changes.
- **Quick replies:** the existing strip, attached directly above the composer.
- **Composer pinned at the bottom**, one rounded surface, textarea + inline
  circular send. *This half already exists* — see §4.
- **Empty state:** no panel; a centered, quiet invitation in the scroll region.

## 3. Constraints (the build law and the design system, both binding)

- Keep every existing hook the specs use: `data-testid="quick-replies"`,
  `quick-reply-{n}`, `inbox-back-to-conversations`, the `Write a message…`
  placeholder, and the Send control's accessible name (the composer variant
  reaches it with `aria-label="Send"`).
- 44px targets, 16px text controls, WCAG AA on rendered pixels, nothing below
  14px, no new colour or font, `motion-reduce` on every transition/animation.
- The shell's scroll model must not change for other routes: this is the DM
  route owning its own height, not `<main>` becoming fixed for everyone.
- iMessage/Messenger parity is a **layout** target only. Explicitly OUT of scope:
  read receipts, typing indicators, attachments, reactions, message search,
  edit/delete, and unread badges inside the thread. Each is a product decision
  this spec does not make.

## 4. Slices

**Slice A — the thread geometry (no copy changes).**
Pinned header, the scroll region with `min-h-0`, the composer pinned at the
bottom of that region. Acceptance: with a thread longer than the viewport, the
composer is visible without scrolling and the newest message is on screen on
open; at 844×390 (landscape) neither is clipped; every other route scrolls
exactly as it does today.
*The composer treatment from the live session (`variant 1` in the wrapper in
`InboxPage.tsx`) is the starting point if it was accepted; otherwise it is part of
this slice.*

**Slice B — bubbles and time.**
Side-alignment, grouping, per-group timestamp, day separators, and the empty
state's replacement. Acceptance: two consecutive messages from one sender share a
group; a message from the other person flips sides; a day change renders a
separator; no bubble is `rounded-full`.

**AMENDED 2026-10-05 — the founder's `delight` pass, verbatim:**

> *"add delight. I just feel like this chat UI just doesn't look great. Like if I
> was a parent looking at this, I'd be like, kind of looks like AI slop. I wanted
> to look more stylish and well thought out."*

The five things that make it read as generated, each visible in the rendered
markup and each a specific fix in this slice:

1. **The conversation is a panel inside a panel** (`min-h-40 rounded-xl border
   bg-slate-50 p-4`). Delete the frame: the thread is the page, not a box on it.
2. **Both sides are the same white bordered bubble** (`rounded-2xl border-slate-200
   bg-white`). The viewer's own messages take the action tone with the label
   flipped (a fill under white text is `indigo-600`, per the Two Tones Rule);
   theirs take the warm fill (`slate-50`) with no border.
3. **The timestamp (17px) is louder than the sender's name (14px).** Time is the
   quietest thing in the thread: `text-xs text-slate-500`.
4. **The reaction control is a unicode 👍 standing in for an icon.** Craft-floor
   bans a glyph as an icon system: draw it, one consistent stroke with the rest.
5. **The header stacks three lines and repeats the drop-in twice** ("Drop-in at
   Green Lake Park (East)" and the context line ending in the same place). One
   line of context, and the name is the header.

Also: the sender's name is repeated above every bubble in a 1:1 thread — show it
once per group at most. Nothing here adds a colour, a font or a shadow beyond
what DESIGN.md already defines.

**Slice C — the header identity.**
Avatar + name + handle on the thread header, using the same avatar component the
rest of the app uses, and the same truncation discipline.

## 5. Verification

```bash
npm run verify                                        # build + test + lint + a11y:focus + steering-lint + guards
node scripts/mobile-audit.mjs <base>                  # 7 viewports × light/dark, incl. 844×390
npx playwright test e2e/dm.e2e.ts e2e/inbox.e2e.ts    # targeted, not the full suite
```

Baseline that must not regress: `75 files / 2197 tests / 86 warnings / 0 errors /
GUARDS PASS` (re-measure before slice A — the crop work lands first and moves it).

New assertions this work needs:
- the composer is inside the viewport **after the thread is scrolled to the top**
  (the pinned claim, which nothing asserts today);
- the newest message is visible on open without scrolling;
- a day separator renders when the day changes (fixture-generated, marker data).

⚠️ Port 4173 belongs to another checkout's preview right now, and 29 specs
hardcode it — use `playwright.private.config.ts` on :4180, per
`.scratch/place-photo-crop/spec.md` §"How to run e2e while another checkout owns
:4173", then delete it.

## 6. Sequencing

The place-photo crop work (`/home/jmeisburg/Projects/playdate-app/.scratch/place-photo-crop/spec.md`)
is in front of this. Slice A starts only after that batch's gate is green.
