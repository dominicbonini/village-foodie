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

/** Box 1, Make a post. */
export const WEEKLY_BOX_BLURB = 'Your whole week on one picture.'
/** Box 2, Make a post. */
export const EVENT_BOX_BLURB = 'One picture for one event. Pick from your next events.'
/** Box 3, Make a post. */
export const PLACE_POST_BOX_BLURB = 'Pick a place to post its next event.'

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
export const WEEKLY_DESIGN_BLURB = 'The picture, the rows and where the text goes on your weekly post.'
/** Box 2, Designs. */
export const EVENT_DESIGN_BLURB =
  'Your Standard design for single event posts. Used at every place that doesn’t have its own.'
/** Box 3, Designs. */
export const PLACE_DESIGN_BLURB =
  'Give a place its own picture — a pub’s logo, a brewery’s colours. Its event posts use it instead of Standard.'

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
 * ⚠️ SEE docs/social-posts-report.md: the "Tidy up places" card labels `name` "Name on posts", which
 * is the field the poster uses SECOND. That label is wrong and was left alone on instruction.
 */
export const POST_NAME_HINT = (fullName: string): string =>
  `Printed on posts for this place. Leave it blank to use “${fullName}”.`
