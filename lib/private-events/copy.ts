// lib/private-events/copy.ts — every word a private event puts on a screen, in one place.
//
// 🔴 ONE DEFINITION PER STRING, FOR THE REASON lib/copy/serviceSettings.ts EXISTS. The same sentence
// appears on the Event types grid, the Add event panel, the Events list, the dashboard card and the
// guest's order page, and a setting that is called two things across three screens is a setting the
// operator has to learn twice. `scripts/private-events.cjs` asserts no screen re-types one of these.
//
// 🔴 LANGUAGE PHASE 1d: THE WORDS ARE MESSAGES NOW — `privateEvents` in messages/en-GB.json, with the US words in
// messages/en-US.json ("right away", "ZIP code"). The screens this module's owner draws (components/manage/
// EventTypes.tsx, components/manage/PrivateLinkPanel.tsx) read them with `useT('privateEvents')` in the truck's
// language, and so does the Schedule tab (app/manage/[token]/page.tsx: `chip`, `link.button`, `form.needsTimes`,
// `form.previewNote`). ⚠️ THE CONSTANTS STILL EXPORTED BELOW ARE THE en-GB MESSAGES, read from the same file (one
// definition), for the importers not yet moved to messages: app/dashboard/[token]/page.tsx (PRIVATE_PUBLIC_NAME,
// the two confirms) and app/api/weekly-post/route.ts (PRIVATE_NO_SINGLE_POST). Each names its key; a caller that
// knows the truck's locale reads the key instead. The confirm route's refusal is `errorsManage.private_needs_times`.

import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/privateEvents'

const gb = translatorFor('en-GB', 'privateEvents')

/**
 * ⛔ THE TYPE'S NAME IS A CONSTANT, NOT A TRANSLATION, AND IT IS WHAT THE UNIQUE INDEX SEES.
 * `event_types_truck_name_uidx` is unique on `(truck_id, lower(name))`, so this string is also the
 * key that detects a truck's pre-existing custom "Private" type and adopts it rather than failing.
 */
export const PRIVATE_TYPE_NAME = 'Private'

/* The chip on the Events list and the badge in the approval queue: `privateEvents.chip`. */

/** What every PUBLIC surface calls a private event. Mirrors `resolve.ts`'s PRIVATE_PUBLIC_LABEL. */
export const PRIVATE_PUBLIC_NAME = gb('publicName')

// ── THE EVENT TYPES GRID ─────────────────────────────────────────────────────────────────────────

/* The ORDERING band and the private-link row label: `privateEvents.grid.orderingSection` / `.linkRowLabel`. */

/**
 * ⛔ REMOVED FROM THE SCREEN (5 October 2026), AND KEPT HERE AS THE RECORD OF WHY.
 *
 * Standard's cell on the ORDERING row said **"Open to everyone"**. It was true, and it was the only
 * cell in the whole grid that was a sentence rather than a value — so it read as a setting whose value
 * happened to be words, and an operator could reasonably look for the control that changed it.
 * Dominic: remove it; all cells except Private's are blank.
 *
 * 🔴 BLANK IS THE HONEST ANSWER. No type except Private offers link ordering at all, so there is
 * nothing in those cells to be on, off, or described — the same reason a type's cell on "Same settings
 * for all vans" is blank rather than a disabled switch.
 * ⚠️ THE CONSTANT IS NOT DELETED, so this note has somewhere to live and
 * `scripts/event-types.cjs` can assert the string reaches no screen.
 */
export const PRIVATE_LINK_STANDARD_CELL = 'Open to everyone'

/* Private's column heading title attribute and the Max badge: `privateEvents.grid.columnTitle` / `.maxOnly`. */

// ── ADD / EDIT EVENT ─────────────────────────────────────────────────────────────────────────────

export const PRIVATE_TICK_LABEL = 'Private event'

/**
 * ⛔ WORD FOR WORD, AND EVERY CLAUSE IS TRUE OF THE CODE (`privateEvents.form.help`). "never the address, the map
 * or Village Foodie" is `redactPrivate` plus the discovery feed's filter; if either changes, this sentence
 * becomes a lie to the operator who ticked the box on the strength of it.
 *
 * ── 🔴 THE SECOND SENTENCE OF THE PANEL (`privateEvents.form.linkPromise`), DIRECTLY UNDER THE FIRST ──────────
 * Dominic, 5 October 2026: move this after "Shows on your schedule as …". It was below the Event
 * name field, which split one explanation of what ticking the box does into two halves separated by
 * an input. The two sentences are one answer to one question, so they are one block; then the name field
 * (`privateEvents.form.nameLabel` / `.nameHelp` / `.namePlaceholder`). `scripts/private-events.cjs` asserts the order.
 */

/** The type picker's disabled state while the tick is on (Max only — Pro has no picker). */
export const PRIVATE_TYPE_PICKER_LOCKED = 'Private'

// ── THE LINK & QR PANEL AND THE TABLE CARDS ──────────────────────────────────────────────────────────
// `privateEvents.link.*` and `privateEvents.cards.*` (A6 cards, four to an A4 sheet; the words are fixed, the
// truck name and event name are filled in).
// 🔴 `link.newLinkConfirm` NAMES THE CONSEQUENCE THAT CANNOT BE UNDONE: paper. A printed card is not recallable,
// so the operator has to be told that the ones on the tables stop working — not merely that "the link changes".

// The Events list's button that opens the panel: `privateEvents.link.button`.

// ── THE GUEST'S PAGE ─────────────────────────────────────────────────────────────────────────────
// Moved to messages/en-GB.json `privateLink` (Language Phase 1a): the label, the four titles and their
// bodies, word for word — DECISION 7's replaced-link sentence included. app/p/[token]/page.tsx reads them in
// the truck's language.

// ── THE APPROVAL QUEUE ───────────────────────────────────────────────────────────────────────────

/** Why a found event arrived marked private. */
export const SCRAPED_PRIVATE_HINT =
  'We found the word “private” on their schedule, so this is marked as a private event. Untick it if it is open to everyone.'

/**
 * ⛔ A PRIVATE EVENT WITH LINK ORDERING ON CANNOT BE CONFIRMED WITHOUT TIMES (decision 9) —
 * `privateEvents.form.needsTimes` on the approval card, and the same words as the confirm route's refusal
 * `errorsManage.private_needs_times` (app/api/events/action/route.ts).
 * 🔴 AND THE REASON IS NOT TIDINESS. The guest's page shows "today's closing time" and the ordering
 * window is derived from the times; a timeless private event would publish a link that cannot say
 * when it closes and cannot auto-close. The scraper never captures times for these rows (that is in
 * the live facts), so this is the normal path, not an edge case.
 */

// ── POSTERS ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Why the single-event "Make post" is not offered for a private event.
 * 🔴 A ONE-EVENT POSTER EXISTS TO BE PUBLISHED. There is nothing publishable about a private booking:
 * the poster would read "Private event" over a background with an Order link — an advert for
 * something nobody can come to. The WEEKLY poster still lists it, as "Private event" with its times,
 * because that poster's job is to show the week and a busy Saturday is worth showing.
 */
export const PRIVATE_NO_SINGLE_POST = gb('noSinglePost')

// ── THE DASHBOARD'S TWO CONFIRMS ─────────────────────────────────────────────────────────────────

/**
 * ── 🔴 SWITCHING A LIVE OR FUTURE EVENT **TO** PRIVATE ───────────────────────────────────────────
 * ⛔ IT NAMES THE TWO THINGS THAT CHANGE FOR THE PUBLIC, not the mechanism. "This hides the address"
 * and "guests will need the link" are what an operator can act on; `is_private` and a token are not.
 * ⚠️ IT IS A CONFIRM RATHER THAN A TOAST BECAUSE IT IS VISIBLE TO CUSTOMERS IMMEDIATELY: the event
 * drops off the map and the schedule redacts, on the next request. There is no draft state to undo in.
 */
export const CONFIRM_TO_PRIVATE = gb('confirmToPrivate')

/**
 * ── 🔴 SWITCHING **AWAY** FROM PRIVATE ───────────────────────────────────────────────────────────
 * ⛔ THE SECOND SENTENCE IS THE IRREVERSIBLE ONE, and it is why this cannot be a silent change: the
 * private link stops working, and any QR code already printed and put on a table stops with it.
 */
export const CONFIRM_FROM_PRIVATE = gb('confirmFromPrivate')

// ── THE ADD / EDIT FORM'S PREVIEW CARD ───────────────────────────────────────────────────────────

/**
 * ── 🔴 THE LINE UNDER THE PREVIEW WHEN "Private" IS THE CHOSEN TYPE (5 October 2026) — `privateEvents.form.previewNote` ──
 *
 * It replaces "Filled from <place>" on a private event, and it is there to answer a question the
 * preview itself raises: the operator has just typed a venue, a town and a postcode, and the card
 * above shows none of them. Without this line the honest reading is "the preview is broken".
 *
 * ⛔ IT NAMES THE THREE FIELDS, rather than saying "the location is hidden". The operator is looking
 * at three filled boxes and one card; "no venue, town or postcode" maps onto what is in front of them,
 * and a vaguer sentence would leave them checking whether the postcode is the exception.
 * ⚠️ IT SAYS "your schedule", NOT "the public page". A private event is dropped from the map and
 * redacted on the schedule, the embed and the discovery feed alike — naming one surface would imply
 * the others behave differently.
 * ⚠️ THE FIELDS ARE STILL SAVED, AND THAT IS NOT A CONTRADICTION: the truck needs the address to get
 * there. This line is about what is PUBLISHED, which is why it is worded as "how it shows".
 * (The US says "ZIP code".)
 */
