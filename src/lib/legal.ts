/**
 * The legal pages' copy and structure (release checklist item 1.6).
 *
 * WHY THIS FILE EXISTS AT ALL: Google Play requires a privacy policy URL on the
 * listing *and* reachable from inside the app, and the repo had **zero** legal
 * pages — `PrivacySection.tsx` states the privacy model in prose inside
 * Settings, which is good and unusually thoughtful, but it is not a policy
 * document and has no URL.
 *
 * THE RULE THIS FILE FOLLOWS: every factual claim here has to be TRUE OF THE
 * CODE TODAY, not aspirational. So each section below is written from what the
 * app actually does — the tables it writes, the processors it calls, the views
 * it gates — and `legal.test.ts` pins the claims that could silently rot:
 *
 *   - no analytics and no ads are claimed, and the repo has none;
 *   - the processors named are the ones the code calls (Supabase, Vercel,
 *     Resend/Gmail, Google OAuth) plus the photo hosts the browser fetches from
 *     directly, which a reader would otherwise never guess;
 *   - "no GPS" is claimed, and the app stores a ZIP and a radius, not a fix;
 *   - there is NO in-app account deletion, so the policy says "email us" rather
 *     than promising a button that does not exist.
 *
 * ⚠️ WHAT A HUMAN MUST STILL DECIDE BEFORE THIS SHIPS, and it is recorded in
 * `docs/RELEASE-CHECKLIST.md` rather than hidden here: the operating entity's
 * legal name and the governing-law wording. Both are the founder's, not an
 * agent's, and the text below is written so that adding them is a two-line edit.
 */

/** One heading and its body. `paragraphs` and `bullets` render in order. */
export interface LegalSection {
  heading: string
  paragraphs?: readonly string[]
  bullets?: readonly string[]
}

export interface LegalDoc {
  title: string
  /** The one-line promise under the title. */
  summary: string
  /** ISO date the text last changed; shown to the reader. */
  updated: string
  sections: readonly LegalSection[]
}

/**
 * The address a parent writes to for a deletion, a correction, or a complaint.
 *
 * It is the operator's own operational address (`docs/email-fallback-ops.md`),
 * and it is deliberately in ONE place so a change is a one-line change.
 */
export const LEGAL_CONTACT_EMAIL = 'jonmeisburg@gmail.com'

/** The stable public URLs. Google wants these on the listing; the app links them. */
export const PRIVACY_PATH = '/privacy'
export const TERMS_PATH = '/terms'

export const LEGAL_EFFECTIVE_DATE = '2026-10-05'

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy policy',
  summary:
    'Drop In arranges playdates between nearby families. This page says exactly what we collect, who else sees it, and how to get rid of it.',
  updated: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      heading: 'The short version',
      bullets: [
        'Your children are identified by first name and age only. There are no public kid profiles.',
        'Signed-out visitors see nothing. You have to sign in to see any family.',
        'We do not sell your data, we do not run ads, and we do not use third-party analytics.',
        'We do not track your GPS. We use the ZIP code and the radius you choose.',
        'You can ask us to delete your account and its data at any time.',
      ],
    },
    {
      heading: 'What we collect',
      paragraphs: [
        'We collect only what the app needs to put a parent and a playground in the same place at the same time.',
      ],
      bullets: [
        'Account: your email address, and a password that is stored hashed by our authentication provider. We never see your password.',
        'Profile: the display name you choose, an optional profile photo, and an optional family photo.',
        'Your kids: first name, age, and an optional photo. You enter this yourself; nothing about your kids is required beyond a first name and an age.',
        'Location: your home ZIP code and the search radius you pick. That is an area, not a position — the app never asks for or stores GPS coordinates of your device.',
        'Your drop-ins: the title, the place you choose, the address that comes with it, the date and time, and which of your kids you are bringing.',
        'Messages: the messages you send to other parents, and comments on drop-ins.',
        'Notifications: if you turn notifications on, your browser gives us a push subscription address for that device.',
        'Safety records: any report you file or family you block.',
      ],
    },
    {
      heading: 'Who can see what',
      paragraphs: [
        'This is the same split the app itself shows you in Settings, under Privacy & safety.',
      ],
      bullets: [
        'Other parents can see: your display name, your profile photo, the first names and ages of the kids you bring to a drop-in, the drop-ins you are hosting or going to, and anything you write in a comment or message.',
        'Only you can see: your email address, your kids’ photos, your ZIP code and radius, your notification settings, your saved and blocked lists, and your draft.',
        'Nobody signed out can see anything at all — not the feed, not a profile, not a place.',
        'Moderators can see the content needed to handle a report and the place directory’s review state. They cannot see your email address or your kids’ photos.',
      ],
    },
    {
      heading: 'Who else processes your data',
      paragraphs: [
        'We do not sell or rent personal data. We use these service providers to run the app, and they process data on our behalf:',
      ],
      bullets: [
        'Supabase — the database, authentication, and photo storage. This is where the data physically lives.',
        'Vercel — hosting and serving the web app.',
        'Resend (with Google’s mail service) — delivering sign-in, reset, and notification emails to you.',
        'Google — only if you choose “Continue with Google”. We then receive your name and email address from Google; we never receive your Google password.',
      ],
    },
    {
      heading: 'Place photos load from other websites',
      paragraphs: [
        'Most pictures of parks and pools in the directory are not stored by us. The app links to the image at its original host — usually Wikimedia Commons, or Flickr through Openverse — so your browser requests the picture directly from that host, which will see your IP address and browser details the way any web request does.',
        'Maps are drawn with OpenStreetMap tiles through Leaflet, which also sees those requests. Photos a moderator uploads are the exception: those are copied into our own storage.',
        'We record the source page and the licence for each picture, and you can see the credit line on the place page.',
      ],
    },
    {
      heading: 'About children',
      paragraphs: [
        'Drop In is for parents and caregivers, not for children. The account holder is an adult. Information about a child — a first name, an age, and optionally a photo — is entered by the adult who cares for that child, and it is visible only to signed-in parents, in the limited form described above.',
        'We ask for a first name and an age rather than a full name and a birthdate because that is enough for another parent to recognise who is coming, and no more than that.',
        'If you believe a child’s information has been posted by someone who should not have posted it, write to us and we will remove it.',
      ],
    },
    {
      heading: 'Cookies and local storage',
      paragraphs: [
        'We do not use advertising or tracking cookies. Your browser stores: your signed-in session, your light/dark choice, whether you have been offered notifications, and a draft of a drop-in you have not posted yet. Signing out clears the session.',
      ],
    },
    {
      heading: 'How long we keep it, and how to delete it',
      paragraphs: [
        'We keep your data while your account exists. There is no self-service delete button in the app yet, so deletion is a request you make to us:',
        `Email ${LEGAL_CONTACT_EMAIL} from the address on your account and ask us to delete it. We will delete your profile, your kids’ records and their photos, your drop-ins, your messages, your follows and blocks, and your notification subscriptions.`,
        'We will confirm when it is done. We may keep a minimal record where the law requires it, for example a record of a ban for safety reasons.',
      ],
    },
    {
      heading: 'Changes to this policy',
      paragraphs: [
        `If this policy changes in a way that matters, we will say so in the app before the change takes effect. This version is dated ${LEGAL_EFFECTIVE_DATE}.`,
        `Questions, corrections, or complaints: ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
}

export const TERMS_OF_USE: LegalDoc = {
  title: 'Terms of use',
  summary:
    'The ground rules for using Drop In: who may use it, what you may post, and what we are and are not responsible for when families meet up.',
  updated: LEGAL_EFFECTIVE_DATE,
  sections: [
    {
      heading: 'Who may use Drop In',
      bullets: [
        'You must be 18 or older, and you must be the parent or caregiver of any child you add.',
        'You are responsible for the accuracy of what you post, and for keeping your password to yourself.',
        'One account per adult. Do not create accounts to harass anyone or to get around a suspension.',
      ],
    },
    {
      heading: 'What you may post',
      bullets: [
        'Post real drop-ins you intend to attend: a real place, a real time, and an open invitation.',
        'Do not post other people’s children’s full names, photos, or personal details without their parent’s permission.',
        'Do not harass, threaten, or impersonate anyone, and do not post anything illegal, hateful, or sexual.',
        'Do not use the app to advertise, to scrape data, or to send bulk messages.',
      ],
      paragraphs: [
        'We may remove content, and suspend or close an account, when someone breaks these rules or when we believe someone’s safety requires it.',
      ],
    },
    {
      heading: 'Meeting up is at your own risk',
      paragraphs: [
        'This matters more than any other paragraph here, so it is stated plainly: Drop In introduces you to other families. We do not run background checks, we do not verify anyone’s identity, and we do not supervise a meeting.',
        'You decide whom to meet, where, and when. Use the same judgement you would use with anyone you met online for the first time, and meet in a public place.',
      ],
    },
    {
      heading: 'Your content',
      paragraphs: [
        'What you post stays yours. By posting it you give us permission to show it in the app to the people described in the privacy policy — and to store it so the app works. You can delete your own drop-ins and messages, and you can ask us to delete your account.',
      ],
    },
    {
      heading: 'What we do not promise',
      bullets: [
        'The app is provided as it is. We do not promise it will be uninterrupted or free of mistakes.',
        'We are not responsible for the conduct of other parents, or for what happens at a meeting you arrange.',
        'We are not responsible for pictures of places supplied by other websites, or for a place being closed, changed, or unsuitable when you arrive.',
      ],
    },
    {
      heading: 'Ending your use',
      paragraphs: [
        'You may stop using Drop In at any time and ask us to delete your account. We may suspend or close an account that breaks these terms, or where keeping it would put someone at risk.',
      ],
    },
    {
      heading: 'Changes to these terms',
      paragraphs: [
        `If these terms change in a way that matters, we will say so in the app before the change takes effect. This version is dated ${LEGAL_EFFECTIVE_DATE}.`,
        `Questions: ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
}
