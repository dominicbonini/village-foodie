// lib/private-events/copy.ts — every word a private event puts on a screen, in one place.
//
// 🔴 ONE DEFINITION PER STRING, FOR THE REASON lib/copy/serviceSettings.ts EXISTS. The same sentence
// appears on the Event types grid, the Add event panel, the Events list, the dashboard card and the
// guest's order page, and a setting that is called two things across three screens is a setting the
// operator has to learn twice. `scripts/private-events.cjs` asserts no screen re-types one of these.

/**
 * ⛔ THE TYPE'S NAME IS A CONSTANT, NOT A TRANSLATION, AND IT IS WHAT THE UNIQUE INDEX SEES.
 * `event_types_truck_name_uidx` is unique on `(truck_id, lower(name))`, so this string is also the
 * key that detects a truck's pre-existing custom "Private" type and adopts it rather than failing.
 */
export const PRIVATE_TYPE_NAME = 'Private'

/** The chip on the Events list and the badge in the approval queue. */
export const PRIVATE_CHIP = 'Private'

/** What every PUBLIC surface calls a private event. Mirrors `resolve.ts`'s PRIVATE_PUBLIC_LABEL. */
export const PRIVATE_PUBLIC_NAME = 'Private event'

// ── THE EVENT TYPES GRID ─────────────────────────────────────────────────────────────────────────

/** The ORDERING section band, above VANS/PRICES/SERVICE. */
export const ORDERING_SECTION = 'ORDERING'

/** The one row no other type has. */
export const PRIVATE_LINK_ROW_LABEL = 'Take orders by private link and QR code'

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

/** Private's column heading title attribute. */
export const PRIVATE_COLUMN_TITLE =
  'The built-in Private type. It cannot be renamed, moved or deleted.'

/** The Max badge's hover text on a Pro truck. */
export const MAX_ONLY_TITLE = 'Max only'

// ── ADD / EDIT EVENT ─────────────────────────────────────────────────────────────────────────────

export const PRIVATE_TICK_LABEL = 'Private event'

/**
 * ⛔ WORD FOR WORD, AND EVERY CLAUSE IS TRUE OF THE CODE. "never the address, the map or Village
 * Foodie" is `redactPrivate` plus the discovery feed's filter; if either changes, this sentence
 * becomes a lie to the operator who ticked the box on the strength of it.
 */
export const PRIVATE_TICK_HELP =
  'Shows on your schedule as “Private event” with the date and times only — never the address, the map or Village Foodie.'

/**
 * ── 🔴 THE SECOND SENTENCE OF THE PANEL, AND IT SITS DIRECTLY UNDER THE FIRST ───────────────────
 * Dominic, 5 October 2026: move this after "Shows on your schedule as …". It was below the Event
 * name field, which split one explanation of what ticking the box does into two halves separated by
 * an input — the operator read "never the address", typed a name, and then met the sentence about
 * the link. The two sentences are one answer to one question, so they are one block.
 * ⚠️ DECLARED **ABOVE** THE NAME STRINGS NOW, so the file's order matches the screen's. The panel
 * renders in this order and `scripts/private-events.cjs` asserts it.
 */
export const PRIVATE_LINK_PROMISE =
  'Guests order by a private link and QR code — you’ll get them after saving.'

export const PRIVATE_NAME_LABEL = 'Event name'
export const PRIVATE_NAME_HELP = 'Guests see this at the top of the order page.'
export const PRIVATE_NAME_PLACEHOLDER = 'Sarah & Tom’s wedding'

/** The type picker's disabled state while the tick is on (Max only — Pro has no picker). */
export const PRIVATE_TYPE_PICKER_LOCKED = 'Private'

// ── THE LINK & QR PANEL ──────────────────────────────────────────────────────────────────────────

export const LINK_QR_BUTTON = 'Link & QR'
export const LINK_QR_TITLE = 'Private link & QR code'
export const LINK_COPY = 'Copy'
export const LINK_COPIED = 'Copied'
export const QR_DOWNLOAD = 'Download QR'
export const TABLE_CARDS = 'Print table cards'
export const NEW_LINK = 'Make a new link'

/**
 * The confirm on "Make a new link".
 * 🔴 IT NAMES THE CONSEQUENCE THAT CANNOT BE UNDONE: paper. A printed card is not recallable, so the
 * operator has to be told that the ones on the tables stop working — not merely that "the link
 * changes".
 */
export const NEW_LINK_CONFIRM =
  'Make a new link? The current link stops working straight away, and any QR codes you have already printed will stop working too.'

/** Shown when link ordering is off for the event, in place of the panel. */
export const LINK_OFF_NOTICE =
  'Ordering by private link is switched off for this event, so there is no link to share. The event still shows on your schedule as “Private event”.'

// ── THE TABLE CARDS ──────────────────────────────────────────────────────────────────────────────

/** A6, four to an A4 sheet. The words are fixed; the truck name and event name are filled in. */
export const CARD_SCAN = 'Scan to order'
export const CARD_BLURB = 'Order and pay on your phone. We’ll call your name when it’s ready.'
export const CARD_FOOTER = 'Ordering by HatchGrab'

// ── THE GUEST'S PAGE ─────────────────────────────────────────────────────────────────────────────

export const GUEST_PRIVATE_LABEL = 'PRIVATE EVENT'

/**
 * ⛔ DECISION 7, WORD FOR WORD. `{truck}` is substituted; nothing else is.
 * 🔴 IT TELLS THE GUEST WHAT TO DO NEXT. "Not found" is what a 404 says and it is useless to someone
 * holding a printed card — this names who replaced it and who to ask.
 */
export const LINK_REPLACED = (truckName: string) =>
  `This link no longer works — ${truckName} has replaced it. Ask the organiser for the new link or QR code.`

/** The same shape for the other way a link dies: the operator made the event public. */
export const LINK_MADE_PUBLIC = (truckName: string) =>
  `This link no longer works — ${truckName} has made this event public. You can order from their normal page.`

export const LINK_UNKNOWN = 'This link doesn’t work. Check it with the organiser, or scan the QR code again.'

export const LINK_ORDERING_OFF_GUEST =
  'This event isn’t taking orders online. Please order at the hatch.'

// ── THE APPROVAL QUEUE ───────────────────────────────────────────────────────────────────────────

/** Why a found event arrived marked private. */
export const SCRAPED_PRIVATE_HINT =
  'We found the word “private” on their schedule, so this is marked as a private event. Untick it if it is open to everyone.'

/**
 * ⛔ A PRIVATE EVENT WITH LINK ORDERING ON CANNOT BE CONFIRMED WITHOUT TIMES (decision 9).
 * 🔴 AND THE REASON IS NOT TIDINESS. The guest's page shows "today's closing time" and the ordering
 * window is derived from the times; a timeless private event would publish a link that cannot say
 * when it closes and cannot auto-close. The scraper never captures times for these rows (that is in
 * the live facts), so this is the normal path, not an edge case.
 */
export const PRIVATE_NEEDS_TIMES =
  'Add a start and end time — a private event taking orders by link needs them.'

// ── POSTERS ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Why the single-event "Make post" is not offered for a private event.
 * 🔴 A ONE-EVENT POSTER EXISTS TO BE PUBLISHED. There is nothing publishable about a private booking:
 * the poster would read "Private event" over a background with an Order link — an advert for
 * something nobody can come to. The WEEKLY poster still lists it, as "Private event" with its times,
 * because that poster's job is to show the week and a busy Saturday is worth showing.
 */
export const PRIVATE_NO_SINGLE_POST =
  'Private events don’t get their own post — they appear on your weekly poster as “Private event”.'

// ── THE DASHBOARD'S TWO CONFIRMS ─────────────────────────────────────────────────────────────────

/**
 * ── 🔴 SWITCHING A LIVE OR FUTURE EVENT **TO** PRIVATE ───────────────────────────────────────────
 * ⛔ IT NAMES THE TWO THINGS THAT CHANGE FOR THE PUBLIC, not the mechanism. "This hides the address"
 * and "guests will need the link" are what an operator can act on; `is_private` and a token are not.
 * ⚠️ IT IS A CONFIRM RATHER THAN A TOAST BECAUSE IT IS VISIBLE TO CUSTOMERS IMMEDIATELY: the event
 * drops off the map and the schedule redacts, on the next request. There is no draft state to undo in.
 */
export const CONFIRM_TO_PRIVATE =
  'This hides the address and the event from the map. Guests will need the private link to order.'

/**
 * ── 🔴 SWITCHING **AWAY** FROM PRIVATE ───────────────────────────────────────────────────────────
 * ⛔ THE SECOND SENTENCE IS THE IRREVERSIBLE ONE, and it is why this cannot be a silent change: the
 * private link stops working, and any QR code already printed and put on a table stops with it.
 */
export const CONFIRM_FROM_PRIVATE =
  'This makes the event public: its address and map pin will show, and the private link will stop working.'

// ── THE ADD / EDIT FORM'S PREVIEW CARD ───────────────────────────────────────────────────────────

/**
 * ── 🔴 THE LINE UNDER THE PREVIEW WHEN "Private" IS THE CHOSEN TYPE (5 October 2026) ─────────────
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
 */
export const PRIVATE_PREVIEW_NOTE =
  'How it shows on your schedule — no venue, town or postcode.'
