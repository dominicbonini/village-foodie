// lib/copy/socialPosts.ts — every sentence the Social posts page says, in one place.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THESE ARE CONSTANTS AND NOT LITERALS IN THE JSX
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Four of them are said on two screens — the boxes and the editor they open — and two are asserted by
// `scripts/social-posts.cjs`. A sentence written out twice is two sentences the moment one is edited,
// and this product has already shipped that fault: "the weekly post is on Pro and Max" was written in
// a route and in a component, both wrong in the same way, and only one of them was corrected.
//
// ⚠️ THEY ARE **COPY**, NOT LABELS. A button's word stays at its call site; what lives here is a
// sentence that explains something, because that is the kind of string that drifts.

/** Under the three Make-a-post boxes. ⛔ It names BOTH facts an operator needs before pressing
 *  anything: what Make post actually does, and which picture it will use. */
export const MAKE_POST_FOOTNOTE =
  'Make post opens the finished picture with the caption, ready to download or share. '
  + 'Each post uses that place’s own design if it has one, otherwise your Standard event design.'

/* ══ 🔴 THE PAGE INTRO — WHAT THE TWO AREAS ARE FOR (6 October 2026, Dominic) ══════════════════════
 *
 * ⛔ IT WAS "Make a picture for your week, an event or a place — and set up how they look." That named
 * the SIX BOXES and said nothing about the choice an operator actually has to make first, which is
 * which of the two AREAS they are in and why there are two.
 * 🔴 SO IT NAMES THE ORDER: Designs is the once; Make a post is the every-week. An operator who reads
 * it knows why "Make post" is greyed out before they press it.
 *
 * ⚠️ IT IS THREE PARTS BECAUSE TWO OF THEM ARE BOLD. A single string with markup in it would mean
 * either a second copy in the JSX or a parser; the area names are the bold ones, and they are the two
 * words that also appear on the segmented control — so they are read as the control, not as emphasis.
 */
export const INTRO_DESIGNS_WORD = 'Designs'
export const INTRO_MAKE_WORD = 'Make a post'
export const INTRO_AFTER_DESIGNS = ' is where you upload your background pictures, once. '
export const INTRO_AFTER_MAKE = ' puts your dates, places and times on them for you.'
/** The whole sentence, flattened — for anything that needs it as one string (and for the harness). */
export const PAGE_INTRO =
  `${INTRO_DESIGNS_WORD}${INTRO_AFTER_DESIGNS}${INTRO_MAKE_WORD}${INTRO_AFTER_MAKE}`

/* ══ 🔴 THE SIX DESCRIPTIONS SAY WHAT THE PICTURE WILL HAVE ON IT ═════════════════════════════════
 * ⛔ THE OLD ONES DESCRIBED THE BOX ("Your whole week on one picture"). These describe the OUTPUT —
 * what HatchGrab writes on top of the truck's own artwork — because that is the thing an operator
 * cannot see until they have pressed the button once. */

/** Box 1, Make a post. */
export const WEEKLY_BOX_BLURB = 'One picture showing everywhere you’ll be this week.'
/** Box 2, Make a post. */
export const EVENT_BOX_BLURB = 'One picture for one event: its date, place and times.'
/** Box 3, Make a post. */
export const PLACE_POST_BOX_BLURB = 'Pick a place and post the next event you have there.'

/**
 * A private event's row, in the Single event box.
 *
 * ⛔ IT IS A ROW AND NOT AN OMISSION. A private event takes its place in the next-six list, greyed,
 * because an operator who sees five events when they have six bookings will go looking for the sixth.
 * ⚠️ IT CARRIES NO VENUE, NO TOWN AND NO PLACE NAME — the server does not send them for a private
 * event (§73), so this line is all there is to draw.
 */
export const PRIVATE_EVENT_ROW = 'Private event · no post'

/** Box 1, Designs. */
export const WEEKLY_DESIGN_BLURB =
  'Your background picture for the weekly schedule post. Each week we write your days, places and '
  + 'times on top of it.'
/** Box 2, Designs. */
export const EVENT_DESIGN_BLURB =
  'Your background picture for a single event post. We write that event’s date, place and times on '
  + 'top of it.'

/* ══ 🔴 "Used for:" — WHICH POSTS EACH DESIGN REACHES ═════════════════════════════════════════════
 * ⛔ THIS IS THE QUESTION THE TWO DESIGN BOXES COULD NOT ANSWER. They are two pictures with almost
 * identical descriptions; what tells them apart is not what is ON them, it is which posts USE them.
 * ⚠️ THE EVENT ONE NAMES ITS EXCEPTION, because the exception is the whole of Box 3. */
export const WEEKLY_DESIGN_USED_FOR = 'the weekly post only.'
export const EVENT_DESIGN_USED_FOR =
  'every event post, at every place — unless that place has its own design.'
/** The bold lead-in. ⚠️ Its own constant so the two panels cannot drift to "Used on:" and "Used for:". */
export const USED_FOR_LABEL = 'Used for:'

/* ══ 🔴 BOX 3, DESIGNS — AND THE TWO BOLD WORDS ARE THE POINT ═════════════════════════════════════
 * ⛔ "instead of" IS BOLD BECAUSE THE WHOLE SENTENCE TURNS ON IT. A place design does not add to the
 * event design, it REPLACES it there — and an operator who reads it as "as well as" will give a venue
 * its logo and wonder why the date stopped appearing in the old position. */
export const PLACE_DESIGN_BLURB_BEFORE =
  'Want a different picture at one venue — a pub’s logo, a festival’s poster? Give that place its own '
  + 'design. Event posts there use it '
export const PLACE_DESIGN_BLURB_BOLD = 'instead of'
export const PLACE_DESIGN_BLURB_AFTER = ' your event post design.'
/** The whole sentence, flattened — for anything that needs it as one string (and for the harness). */
export const PLACE_DESIGN_BLURB =
  `${PLACE_DESIGN_BLURB_BEFORE}${PLACE_DESIGN_BLURB_BOLD}${PLACE_DESIGN_BLURB_AFTER}`

/** The line at the top of the place design editor. `place` is the place's name as it is on screen. */
export const placeDesignScope = (place: string): string =>
  `Event posts at ${place} use this design. Everywhere else uses your Standard design.`

/**
 * The confirm before removing a place's picture.
 *
 * ⚠️ IT NAMES THE CONSEQUENCE, NOT THE ACT. "Remove this picture?" is a question about a file; what
 * the operator is actually deciding is which design their posts at that place will use next time.
 */
/* ⛔ NOT `useStandardConfirm`. A `use`-prefixed name is a HOOK to the React lint rules, and calling it
 * from an async handler was an error — correctly, by the rule's own lights. The name says what it is. */
export const standardDesignConfirm = (place: string): string =>
  `Use your Standard design at ${place}? Its own picture will be removed.`

/** The link that does it. ⚠️ Link-styled, not a button: it is the quiet way out of a page whose
 *  purpose is the opposite. */
export const USE_STANDARD_LINK = 'Use Standard design here instead'

/** The footer under Box 3 on Make a post. */
export const PLACE_POST_FOOTER_NOTE = 'hidden places aren’t listed'

/**
 * The "Name on posts" field in the place design editor.
 *
 * ⛔ IT IS BOUND TO `short_name`, AND THAT IS NOT A CHOICE — it is what the renderer prints.
 * `locationName()` in lib/weekly-post/week-data.ts reads `short_name` first and falls back to `name`,
 * so the field an operator must edit to change what a poster says is the short one.
 * ⚠️ THE "Tidy up places" CARD AGREES WITH THIS NOW (V14.4, 6 October 2026). It used to label `name`
 * "Name on posts" — the field the poster uses SECOND — and the two labels were swapped: `name` is
 * "Full name" there and `short_name` is "Name on posts", the same column this hint describes.
 */
export const POST_NAME_HINT = (fullName: string): string =>
  `Printed on posts for this place. Leave it blank to use “${fullName}”.`

/* ══ 🔴 ONE EMPTY STATE, THE SAME IN EVERY BOX THAT CANNOT WORK YET (6 October 2026, Dominic) ══════
 *
 * ⛔ THERE WERE THREE DIFFERENT ANSWERS TO ONE SITUATION, and that was the fault. With no design, the
 * weekly box relabelled its orange button, boxes 2 and 3 showed a grey line and left their Make post
 * buttons greyed, and the lists underneath went on listing events nobody could post. Three treatments
 * of "you have not uploaded a picture yet" is three things for an operator to work out.
 * 🔴 ONE PANEL, IDENTICAL IN ALL THREE: what is missing, what to do, and one button that does it.
 * ⚠️ IT REPLACES THE BOX'S BODY, NOT ITS HEADING. The heading and description still say what the box
 * is FOR — which is what makes the empty state readable as "not yet" rather than "not available".
 * ⛔ AND THERE IS NO ORANGE IN IT. Orange is "make something", and the one thing you cannot do here is
 * make something; the button that leaves is outlined, like every other button that goes somewhere.
 */
export const EMPTY_WEEKLY_TITLE = 'You haven’t designed a weekly post yet'
export const EMPTY_EVENT_TITLE = 'You haven’t designed an event post yet'
/** ⚠️ THE SECOND SENTENCE IS THE ONE THAT MATTERS: it says the job is small. "Upload your picture" is
 *  an instruction; "It only takes a minute" is the reason to follow it now rather than later. */
export const EMPTY_BODY = 'Upload your picture in Designs first. It only takes a minute.'
export const EMPTY_BUTTON = 'Go to Designs'
