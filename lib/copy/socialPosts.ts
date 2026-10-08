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
/* ⚠️ "your single event post design" — THE NAME BOX 2 NOW USES. It said "your Standard event design",
 * which was two words for one thing ("Standard" and "event") and neither of them was the heading an
 * operator would find if they went looking. */
export const MAKE_POST_FOOTNOTE =
  'Make post opens the finished picture with the caption, ready to download or share. '
  + 'Each post uses that place’s own design if it has one, otherwise your single event post design.'

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
/* ══ 🔴 BOX 2 IS "Single event post design" NOW, AND THE BOLD WORD IS "standard" ═══════════════════
 *
 * ⛔ IT WAS "Event post design", WHICH NAMED THE WRONG DISTINCTION. The three designs are: one for the
 * WEEK, one for ONE EVENT, and one for ONE PLACE — and "Event post design" sat beside "Designs for a
 * place", which is also a design for event posts. An operator reading the two headings could not tell
 * which of them their next post would use.
 *
 * 🔴 AND "standard" IS BOLD BECAUSE IT IS THE FACT THAT MAKES BOX 3 MAKE SENSE. This design is the
 * DEFAULT; a place with its own replaces it there. Without the word, Box 2 and Box 3 read as two
 * unrelated features and an operator who sets up both wonders which one wins.
 * ⚠️ IT IS THREE PARTS BECAUSE ONE OF THEM IS BOLD. A single string with markup in it would mean
 * either a second copy in the JSX or a parser.
 */
export const EVENT_DESIGN_TITLE = 'Single event post design'
export const EVENT_DESIGN_BLURB_BEFORE = 'Your '
export const EVENT_DESIGN_BLURB_BOLD = 'standard'
export const EVENT_DESIGN_BLURB_AFTER =
  ' design for a post about one event. We write that event’s date, place and times on top of it.'
/** The whole sentence, flattened — for anything that needs it as one string (and for the harness). */
export const EVENT_DESIGN_BLURB =
  `${EVENT_DESIGN_BLURB_BEFORE}${EVENT_DESIGN_BLURB_BOLD}${EVENT_DESIGN_BLURB_AFTER}`

/** The two states of Box 2's button. ⚠️ Constants because the empty-state title must agree with them. */
export const EVENT_DESIGN_BUTTON_NEW = 'Set up single event design'
export const EVENT_DESIGN_BUTTON_EDIT = 'Edit single event design'

/* ══ 🔴 "Used for:" — WHICH POSTS EACH DESIGN REACHES ═════════════════════════════════════════════
 * ⛔ THIS IS THE QUESTION THE TWO DESIGN BOXES COULD NOT ANSWER. They are two pictures with almost
 * identical descriptions; what tells them apart is not what is ON them, it is which posts USE them.
 * ⚠️ THE EVENT ONE NAMES ITS EXCEPTION, because the exception is the whole of Box 3. */
export const WEEKLY_DESIGN_USED_FOR = 'the weekly post only.'
/* ⛔ "every event post, at every place — unless that place has its own design." WAS THIS LINE, and it
 * said the same thing as the description above it in different words. The description now carries the
 * "standard" fact; this one answers only "which posts?" — and it answers it in five words, which is
 * what a "Used for:" line is for. */
export const EVENT_DESIGN_USED_FOR = 'every post about a single event.'
/** The bold lead-in. ⚠️ Its own constant so the two panels cannot drift to "Used on:" and "Used for:". */
export const USED_FOR_LABEL = 'Used for:'
/* ══ ⛔ THE THREE CONSTANTS ABOVE ARE NO LONGER DRAWN ANYWHERE — 9 OCTOBER 2026 ════════════════════
 * `UsedFor` drew them under each design's tile. The brief removes both lines, and they can go because
 * the box TITLES carry the same fact: "Weekly post design" and "Single event post design" say what
 * each is for in their own names, so the panel was the same information twice on one card — and it was
 * the taller half of two boxes whose point is the design tile.
 * ⚠️ THEY ARE KEPT, UNREFERENCED, AS THE RECORD OF THE WORDING. Deleting them would leave the next
 * reader of docs/social-posts-report.md unable to find what the screen used to say. */

/* ══ ⛔ BOX 3’S OLD BLURB IS GONE WITH THE MODEL IT DESCRIBED (part 3) ════════════════════════════
 * It was a four-part sentence whose bold middle word carried the whole claim: that a picture given to
 * a venue REPLACED the single event post design there. 🔴 THAT IS NO LONGER TRUE, AND THE SENTENCE
 * COULD NOT BE EDITED INTO TRUTH — a place now simply HAS PICTURES, and each design decides whether it
 * draws one and where. There is nothing left for the word to be the opposite of.
 * ⚠️ FOUR EXPORTS WENT WITH IT, and they went rather than being left unused: an exported sentence that
 * nothing renders is a sentence the next person will believe is on the screen. `PLACE_PICTURES_BLURB`
 * below is Box 3’s description now. */

/** The line at the top of the place design editor. `place` is the place's name as it is on screen. */
export const placeDesignScope = (place: string): string =>
  `Event posts at ${place} use this design. Everywhere else uses your single event post design.`

/**
 * The confirm before removing a place's picture.
 *
 * ⚠️ IT NAMES THE CONSEQUENCE, NOT THE ACT. "Remove this picture?" is a question about a file; what
 * the operator is actually deciding is which design their posts at that place will use next time.
 */
/* ⛔ NOT `useStandardConfirm`. A `use`-prefixed name is a HOOK to the React lint rules, and calling it
 * from an async handler was an error — correctly, by the rule's own lights. The name says what it is. */
export const standardDesignConfirm = (place: string): string =>
  `Use your single event post design at ${place}? Its own picture will be removed.`

/** The link that does it. ⚠️ Link-styled, not a button: it is the quiet way out of a page whose
 *  purpose is the opposite. */
export const USE_STANDARD_LINK = 'Use your single event post design here instead'

/** The footer under Box 3 on Make a post. */
export const PLACE_POST_FOOTER_NOTE = 'hidden places aren’t listed'

/**
 * The footer under Box 3 on Designs: how many places have pictures and how many have none.
 *
 * ⛔ IT COUNTS PICTURES, NOT DESIGNS. The old footer read "N with their own design · M using your
 * single event post design", which was a sentence about a model that no longer exists — a place’s
 * pictures do not replace a design, they are drawn BY one.
 * ⚠️ AND IT IS A FUNCTION HERE RATHER THAN TWO SPANS IN THE JSX, for the reason every other sentence
 * on this screen is: the component must not be a second place the wording can be edited.
 */
export const placePicturesFooter = (withPictures: number, withNone: number): string =>
  `${withPictures} with images · ${withNone} with none`

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
/* ⚠️ "a single event post", MATCHING BOX 2'S NEW NAME. An empty state that names the design by a word
 * the Designs area no longer uses sends the operator looking for a box that is not there. */
export const EMPTY_EVENT_TITLE = 'You haven’t designed a single event post yet'
/* ══ ⛔ "It only takes a minute." IS GONE — 7 October 2026, Dominic ════════════════════════════════
 * The note that was here argued it was the sentence that mattered — the reason to act now rather than
 * later. ⚠️ IT IS ALSO A **PROMISE ABOUT HOW LONG SOMETHING TAKES**, made by a screen that does not
 * know: setting a design up means exporting artwork at the right shape, and for a truck who has not
 * got one it is not a minute. 🔴 ONE EMPTY STATE, SO IT WENT ONCE AND IT WENT FROM BOTH — the weekly
 * half and the single event half render the same `EmptyBox`. */
export const EMPTY_BODY = 'Upload your picture in Designs first.'
export const EMPTY_BUTTON = 'Go to Designs'

/* ══ 🔴 BOX 3 BECOMES "Place pictures" (18 October 2026, part 3) ══════════════════════════════════
 *
 * ⛔ IT WAS "Designs for a place", AND THAT NAME DESCRIBED THE OLD MODEL. A place had ONE picture and
 * it meant one thing — it WAS the background of a single-event post there — so "a design for a place"
 * was an accurate name for a thing that no longer exists.
 *
 * 🔴 NOW A PLACE SIMPLY **HAS PICTURES**, and the designs decide what to do with them. The heading is
 * the noun; the description is the whole of the new model in two sentences, because an operator who
 * reads "Place pictures" and nothing else will assume they are for one post type, which is exactly the
 * assumption this change exists to remove.
 */
/* ══ 🔴 "PLACE PICTURES" BECAME "LOCATION IMAGES" — 7 October 2026, WORDING ONLY ═══════════════════
 * ⛔ THE IDENTIFIERS DID NOT MOVE, AND THAT IS DELIBERATE. `PLACE_PICTURES_*`, `place_pictures`,
 * `placePictureId`, `/place_picture_list` and every column keep their names: a rename that reaches the
 * table, the route actions and the component props is a different job with a migration in it, and this
 * one is a change of words on a screen. ⚠️ SO A GREP FOR "place pictures" IN CODE STILL FINDS THINGS —
 * that is expected, and the only strings an operator reads are in this file. */
export const PLACE_PICTURES_TITLE = 'Location images'
export const PLACE_PICTURES_BLURB =
  'Save images for a location — a pub’s logo, a photo, a festival’s poster. Your designs decide where '
  + 'they appear: in an image box on your weekly or single event post, or as the whole background.'

/**
 * The two group headings in the list. ⚠️ The count is the operator’s own, so each is a function.
 *
 * ⛔ WRITTEN IN SENTENCE CASE AND SHOUTED BY THE STYLESHEET, not typed in capitals. A string that is
 * already uppercase cannot be re-used anywhere the capitals would be wrong, and it reads as shouting
 * in every diff and every search; `uppercase` on the row is the one place that decision belongs.
 */
export const PLACE_PICTURES_NONE_HEADING = (n: number) => `No images yet (${n})`
export const PLACE_PICTURES_SOME_HEADING = (n: number) => `With images (${n})`

/**
 * The line at the top of a place's pictures page.
 *
 * ⛔ IT NAMES BOTH FACTS AN OPERATOR NEEDS BEFORE THEY UPLOAD ANYTHING: which picture gets used, and
 * that the choice is not final. Without the second sentence, "Main" reads as "the only one that does
 * anything" and a truck uploads one picture per place for ever.
 */
export const PLACE_PICTURES_PAGE_LINE =
  'Images for this location. The one marked Main is used automatically; you can pick a different one '
  + 'when you make a post.'

/** The quiet link under the grid. ⚠️ "(optional)" IS IN IT: almost no truck needs this. */
export const PLACE_OWN_POSITIONS_LINK = 'Own text positions for this location (optional)'

/** "N images" — ⚠️ a function, because one image is not "1 images". */
export const picturesCount = (n: number): string => `${n} image${n === 1 ? '' : 's'}`

/** The confirm before removing one. ⚠️ It names the picture, and says what happens to Main. */
export const removePictureConfirm = (label: string, isMain: boolean): string =>
  isMain
    ? `Remove “${label}”? It is this location’s Main image — the next one becomes Main.`
    : `Remove “${label}”?`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 CREATE A POST — TWO HALVES (7 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ "Post for a place" IS GONE AND ITS WORDING IS NOT REUSED HERE. It was a third way to reach the
// same modal — pick a venue, post its next event — and the right half below does that better by
// naming the next event outright instead of making the operator pick the venue it happens to be at.

export const CREATE_WEEKLY_TITLE = 'Weekly post'
export const CREATE_EVENT_TITLE = 'Single event post'

/** "4 events · 1 private event left out" — the second clause only when there is one. */
export const weekEventsLine = (events: number, privateEvents: number): string => {
  const left = `${events} event${events === 1 ? '' : 's'}`
  if (privateEvents <= 0) return left
  /* ⛔ IT SAYS "left out", NOT "hidden". A private booking is not posted about at all — there is no
   * post it is being kept out of the picture of — and "hidden" would read as a setting to go and
   * change. The route refuses `event_post` for one, so this is a statement of fact. */
  return `${left} · ${privateEvents} private event${privateEvents === 1 ? '' : 's'} left out`
}

export const CREATE_WEEKLY_BUTTON = 'Create weekly post'
export const NEXT_EVENT_HEADING = 'Your next event'
/** "Create post for Tue 13 Oct". ⚠️ The DATE, not "this event" — the button says what it will make. */
export const createPostForLabel = (date: string): string => `Create post for ${date}`
export const MORE_EVENTS_LABEL = (n: number): string => `More events (${n})`
export const NO_UPCOMING_EVENTS = 'Nothing coming up.'

/**
 * The grey line under a single event post's preview, naming the image it will use.
 *
 * 🔴 IT NAMES THE SOURCE, BECAUSE THE SOURCE IS THE THING AN OPERATOR CANNOT SEE. Three different
 * images can produce the same thumbnail at 96px — the location's own photo, the location's poster, or
 * the standard design — and the only one they can act on is the one that is actually chosen.
 */
/* ⛔ A PRIVATE EVENT NEVER GETS A LOCATION IMAGE, and the reason is the whole privacy rule: the server
 * does not send a private booking's place at all, so there is nothing here to offer. */
export const IMAGE_CHOICE_PRIVATE = 'Private bookings always use your standard design.'

export const imageSourceLine = (
  /* ⚠️ `'none'` IS ACCEPTED AND MEANS A PRIVATE BOOKING. It never reaches this line on screen — the
   * headline is always a public event — but the type is the server's `imageSource`, and narrowing it
   * here would make the caller cast rather than make the case impossible. It answers honestly. */
  source: 'event' | 'place-photo' | 'place-poster' | 'standard' | 'none',
  place?: string | null,
): string => {
  const where = String(place ?? '').trim() || 'this location'
  if (source === 'none') return IMAGE_CHOICE_PRIVATE
  if (source === 'event') return 'Using the image you uploaded for this post'
  if (source === 'place-photo') return `Using ${where}’s photo`
  if (source === 'place-poster') return `Using ${where}’s poster`
  return 'Using your standard single event design'
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE LOCATIONS SUB-TAB (7 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ MANAGEMENT ONLY. There is no "Create post" button anywhere on it: making a post is Create a
// post's job, and a second door into the same modal is what "Post for a place" was.

/* ⚠️ IT MATCHES THE PILL — "Location settings" (7 October 2026, Dominic). A pill that says one name
 * opening a card headed another is two names for one screen, and the operator has to work out that
 * they are the same thing. The pill was what was renamed; this follows it. */
export const LOCATIONS_TITLE = 'Location settings'
export const LOCATIONS_BLURB =
  'Give each location its images. They are used automatically when you make a post.'

export const LOCATIONS_SEARCH_LABEL = 'Search locations'
export const CHIP_ALL = (n: number): string => `All ${n}`
export const CHIP_MISSING = (n: number): string => `Missing images ${n}`
export const CHIP_HIDDEN = (n: number): string => `Hidden ${n}`

/* ══ 🔴 §5 · CREATE A POST — THE NEXT EVENT, THE PICKER, AND THE CAPTION (9 October 2026) ══════════
 * ⚠️ "YOUR NEXT EVENT" IS A POSSESSIVE because the card is about the truck's own diary, and the one
 * before it said "NEXT EVENT", which reads like a listing. ⛔ "OR PICK ANOTHER EVENT" STARTS WITH "OR"
 * deliberately: it is the alternative to the button above it, not a second list. */
export const NEXT_EVENT_HEADING_V4 = 'YOUR NEXT EVENT'
export const PICK_ANOTHER_HEADING = 'OR PICK ANOTHER EVENT'
export const CREATE_FOR_NEXT = 'Create post for next event'
/** ⚠️ Shown once another event has been chosen — "this", because the card above now shows it. */
export const CREATE_FOR_THIS = 'Create post for this event'
export const SHOW_ALL_UPCOMING = (n: number): string => `Show all upcoming events (${n}) ⌄`
export const HIDE_ALL_UPCOMING = 'Hide the rest ⌃'

/* ══ 🔴 THE CAPTION BOX — PLAIN TEXT, THIS POST ONLY ══════════════════════════════════════════════
 * ⛔ "used next time too" IS GONE AND THAT PHRASE WAS THE PROBLEM. The caption box on this card is the
 * TEMPLATE FILLED IN for one event; editing it has to change that post and nothing else, and a note
 * promising otherwise was promising the opposite of what the box does.
 * ⚠️ TWO SENTENCES: what typing does, and what it does NOT do. The second is the one an operator needs
 * before they will type at all. */
export const CAPTION_HEADING = 'CAPTION'
export const CAPTION_THIS_POST_NOTE =
  'Type straight in the box to change it for this post only. Your template stays as it is.'
export const EDIT_TEMPLATE_LINK = '✎ Edit template'
export const TEMPLATE_PANEL_TITLE = 'Caption template'
export const TEMPLATE_PANEL_BLURB = 'used for every single event post'
export const TEMPLATE_PANEL_BLURB_WEEK = 'used for every weekly post'
export const TEMPLATE_SAVE = 'Save template'
export const TEMPLATE_CANCEL = 'Cancel'
/** 🔴 It says what the orange words ARE and what Saving reaches. ⚠️ "every future post", not "every
 *  post": the caption already on screen is refreshed, and posts already shared are gone. */
export const TEMPLATE_PANEL_NOTE =
  'The orange words fill in from each event. Saving updates the caption above and every future post.'

export const COL_LOCATION = 'Location'
export const COL_WEEKLY = 'Weekly'
export const COL_EVENT = 'Event'

export const LOCATIONS_NONE = 'No locations yet.'
export const LOCATIONS_NO_MATCH = 'Nothing matches that.'
export const LOCATIONS_PICK_ONE = 'Pick a location on the left to give it its images.'

/* ── THE EVENT BOX, WHOSE WORDING FOLLOWS THE DESIGN ─────────────────────────────────────────────
 * 🔴 TWO SETS, AND THE SCREEN PICKS BY THE DESIGN RATHER THAN BY A SETTING OF ITS OWN. With a photo
 * space on the single event design the image is a PHOTO that goes in that space; without one it is the
 * whole POSTER. Those are different things to ask a truck for — a photo of the pub, versus artwork
 * the pub already has — so asking for the wrong one produces an upload that cannot be used. */
export const EVENT_BOX_PHOTO_TITLE = 'Photo for your event posts'
export const EVENT_BOX_PHOTO_BLURB =
  'It goes in the photo space on your single event design, cropped to fill it. Any shape is fine.'
export const EVENT_BOX_POSTER_TITLE = 'Poster for events here (optional)'
export const EVENT_BOX_POSTER_BLURB =
  'It replaces your standard design completely for events at this location.'
/** ⛔ The shape refusal, and it names the way out rather than just refusing. */
export const EVENT_BOX_POSTER_SHAPE = (w: number, h: number): string =>
  `A poster has to be the same shape as your standard design (${w}×${h}), because your text boxes were `
  + 'placed on that shape.'
export const EVENT_BOX_ADD_PHOTO_SPACE =
  'Add a photo space to your single event design to use any shape instead'

export const WEEKLY_BOX_TITLE = 'Picture beside its row on your weekly post'
export const WEEKLY_BOX_BLURB_LOC =
  'A logo or a photo. It is drawn small, in the space your weekly design gives it.'
export const WEEKLY_USE_EVENT_IMAGE = 'Use the event photo here too'
/** ⚠️ Shown when the weekly design has no Location picture item switched on — see the brief's §5. */
export const WEEKLY_NOT_ON_LINE =
  'Your weekly design does not show a location picture yet, so this one will not appear until you '
  + 'switch it on in Designs.'

export const SLOT_UPLOAD = 'Upload'
export const SLOT_REPLACE = 'Replace'
export const SLOT_REMOVE = 'Remove'
export const SLOT_EMPTY = 'Nothing yet'
/* ⛔ IT SAYS THE IMAGE IS KEPT, because it is: Remove clears the slot and nothing is deleted. A truck
 * told "Remove" without that sentence has every reason to think they are about to lose the file. */
export const slotRemoveConfirm = (what: string): string =>
  `Remove this ${what}? It stops being used. The image itself is kept.`

export const NAME_ON_POSTS_LABEL = 'Name on posts'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE IMAGE CHOICE WHEN MAKING A SINGLE EVENT POST (7 October 2026, §6)
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const IMAGE_CHOICE_LABEL = 'Image'
export const imageChoicePlacePhoto = (place: string): string => `${place}’s photo`
export const imageChoicePlacePoster = (place: string): string => `${place}’s poster`
export const IMAGE_CHOICE_STANDARD = 'Standard design'
export const IMAGE_CHOICE_ONE_OFF = 'Upload one for this post only'
/* ⚠️ "as <Location>'s poster", NOT "for <Location>" (8 October 2026). A location has TWO images now,
 * and "for" named neither — a truck ticking it could reasonably expect either. The tick saves the
 * upload into the POSTER slot, and the words say so. */
export const imageChoiceAlsoSave = (place: string): string => `Also save it as ${place}’s poster`


// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ROUND 2 — EACH SUB-TAB'S OWN HEADING AND DESCRIPTION (8 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE SHARED "Social posts" HEADING AND THE SHARED INTRO ARE GONE. One heading over three different
// screens said what the TAB was and nothing about the screen the operator was on — and the intro
// ("Designs is where you upload… Make a post puts…") was a map of two areas that are now three pills
// in a bar directly above it. A page that explains its own navigation is a page whose navigation is
// not explaining itself.
// 🔴 EACH PILL NOW ANSWERS "what is this screen for?" IN ITS OWN WORDS, which is the only question a
// heading on a sub-tab has to answer.

export const TAB_CREATE_HEADING = 'Create a post'
export const TAB_CREATE_BLURB =
  'Make a post for this week or for one event. We put your dates, places and times on your design, '
  + 'ready to download or share.'

export const TAB_DESIGNS_HEADING = 'Designs'
export const TAB_DESIGNS_BLURB =
  'Your two designs: one for the weekly schedule and one for single event posts. Set them up once — '
  + 'every post uses them.'

export const TAB_LOCATIONS_HEADING = 'Location settings'
/* ⚠️ "Pictures", NOT "Images" — §1. The three boxes say "picture" and so does the chip; one word for
 * one thing. ⛔ AND "names" IS GONE FROM IT: the name is edited in Tidy up places, which this screen
 * says in its own grey note — promising it here would be the second screen that claims to own it. */
export const TAB_LOCATIONS_BLURB =
  'Pictures and social media tags for each location. They’re used automatically when you create '
  + 'a post.'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 TWO KINDS OF LOCATION IMAGE — A POSTER AND A PICTURE (8 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THIS REPLACES THE "event slot / weekly slot" WORDING, AND THE REASON IS NOT COSMETIC. Under that
// model, whether a location's event image was a PHOTO cropped into a box or the WHOLE POSTER was
// decided by the DESIGN — so adding a photo space to the single event design silently changed what
// every location's uploaded image meant. 🔴 THE TRUCK CHOOSES NOW, and the two things have two names.

/** The left card inside Location settings. ⚠️ The PILL and the page heading stay "Location settings". */
export const LOCATIONS_CARD_TITLE = 'Locations'

/* ══ 🔴 THE TABLE'S COLUMNS — POSTER THEN PICTURE (8 October 2026) ════════════════════════════════
 * ⛔ THEY WERE "WEEKLY" AND "EVENT", which named the SURFACE each image appeared on. That stopped
 * being true the moment a picture could be set to "Both": one column would have had to appear twice.
 * 🔴 THEY NAME THE **THING** NOW, which does not move. Where it is drawn is `picture_use`. */
/* ══ 🔴 FOUR COLUMNS, AND THE TWO PICTURES COME FIRST (9 October 2026) ════════════════════════════
 * ⚠️ THE ORDER IS THE ORDER OF THE THREE BOXES IN THE PANE, which is what stops an operator re-reading
 * the header every time they look from the list to the boxes. ⛔ "Picture" ALONE IS GONE: with two
 * pictures it named neither of them.
 * ⚠️ `COL_WEEKLY` AND `COL_EVENT` ARE DECLARED ABOVE, beside `COL_LOCATION` — they were written for the
 * 7 October table, dropped from the screen on 8 October when the columns became POSTER/PICTURE, and
 * they are the right two words again. Reusing them rather than declaring a second pair is the point of
 * keeping retired copy in this file. */
export const COL_POSTER = 'Poster'

/* ══ 🔴 THE THREE PICTURE BOXES (9 October 2026) ══════════════════════════════════════════════════
 * ⚠️ EACH BLURB SAYS **WHERE THE PICTURE APPEARS**, not what kind of file it is. "A logo or photo" is
 * the same for two of them; what an operator needs to know is which poster it lands on, because that
 * is what decides whether a square logo or a wide photo is the right choice.
 * ⛔ THE OLD "Location picture" PAIR IS RETIRED BELOW — one picture used everywhere could not say
 * where it appeared, because the answer was "everywhere". */
/* ══ ⚠️ "Location poster", NOT "Event poster" — 9 October 2026, §1 ════════════════════════════════
 * ⛔ "Event poster" SAT BESIDE "Picture for event posts" and the two were one word apart while being
 * different things: one is a photo cropped INTO the design, the other REPLACES the design. Naming it
 * after the LOCATION says whose poster it is, which is the part that distinguishes it.
 * ⚠️ `POSTER_BOX_TITLE` STAYS EXPORTED as the record; harnesses read it by name. */
/* ⚠️ "(optional)" IS GONE — 10 October 2026, §1. EVERY box on this screen is optional, so the word
 * singled out the one that is no more optional than its two neighbours — and it was the longest title
 * of the three, which is what made the row look uneven. */
export const LOCATION_POSTER_TITLE = 'Location poster'
export const WEEKLY_PIC_TITLE = 'Picture for weekly posts'
export const WEEKLY_PIC_BLURB = 'A logo or photo for this location’s line on your weekly post.'
export const EVENT_PIC_TITLE = 'Picture for event posts'
export const EVENT_PIC_BLURB = 'A logo or photo in the picture space of your single event design.'
/* ══ ⚠️ "Drop it here" — BOTH BOXES, 10 October 2026, §1 ═══════════════════════════════════════════
 * ⛔ "Drop a picture here" / "Drop a poster here" NAMED THE FILE in a box whose title and description
 * have just named it twice. ⚠️ THE TWO CONSTANTS STAY SEPARATE rather than being collapsed into one:
 * `dropLabel` is a per-box prop, and a single shared string would make the next box that wants its own
 * wording a refactor instead of a value. */
export const DROP_A_PICTURE = 'Drop it here'
export const DROP_A_POSTER = 'Drop it here'
/* 🔴 THE TWO BORROW LINKS. ⚠️ "Use the …" rather than "Copy the …", because nothing is copied: the
 * slot is pointed at the same stored row. */
export const USE_EVENT_PICTURE = 'Use the event post picture'
export const USE_WEEKLY_PICTURE = 'Use the weekly post picture'
/* ⛔ `COL_PICTURE` IS NO LONGER DRAWN. It was the single location picture's column, back when there
 * was one; kept as the record of the wording. */
export const COL_PICTURE = 'Picture'

/* ⚠️ "No images", NOT "Missing images" (8 October 2026). Both images are OPTIONAL — a location may
 * legitimately have neither — and "missing" implies something ought to be there and is not. */
/* ⛔ `CHIP_NO_IMAGES` IS NO LONGER DRAWN — "No pictures" replaced it on 9 October, to match the three
 * boxes' own word and because the chip now counts the two PICTURES rather than every slot. */
export const CHIP_NO_IMAGES = (n: number): string => `No images ${n}`
export const CHIP_NO_PICTURES = (n: number): string => `No pictures ${n}`

export const POSTER_BOX_TITLE = 'Event poster (optional)'
/** ⚠️ IT NAMES THE SHAPE, because a poster that is the wrong shape cannot be used and the truck needs
 *  the size BEFORE they export it, not after it is refused. */
export const posterBoxBlurb = (w: number | null, h: number | null): string =>
  'A full poster for events here. It replaces your standard single event design. We add the date, '
  + 'times and “Powered by HatchGrab”.'
  + (w && h ? ` Same shape as your standard design (${w} × ${h}).` : '')

export const PICTURE_BOX_TITLE = 'Location picture'
export const PICTURE_BOX_BLURB = 'A logo or photo of this location. Any shape.'

/** The radio. ⛔ REQUIRED, and `weekly` is the default — the behaviour every row had before. */
export const PICTURE_USE_LABEL = 'Use it on'
export const PICTURE_USE_WEEKLY = 'Weekly post'
export const PICTURE_USE_EVENT = 'Single event posts'
export const PICTURE_USE_BOTH = 'Both'

/** Shown when the picture is set to weekly/both and the weekly design draws no location picture. */
export const PICTURE_WEEKLY_OFF = 'Turn it on in your weekly design →'
/** Shown when the picture is set to event/both and the single event design has no photo space. */
export const PICTURE_EVENT_NO_SPACE =
  'Your single event design has no photo space yet — add one to show this picture on event posts →'
/* 🔴 ONE GREY LINE WHEN BOTH EXIST. A truck who has uploaded both and set the picture to event/both
 * would otherwise watch the picture not appear on event posts and have nothing to read about why. */
export const PICTURE_POSTER_WINS =
  'This location has an event poster, so single event posts use the poster and this picture isn’t '
  + 'drawn on them.'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SOCIAL MEDIA TAG
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const SOCIAL_TAG_LABEL = 'Tag on social media'
export const SOCIAL_TAG_HINT = '(for captions)'
export const SOCIAL_TAG_PLACEHOLDER = '@buresmusicfest'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CAPTION EDITORS
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const CAPTION_WEEK_TITLE = 'Caption for weekly posts'
export const CAPTION_EVENT_TITLE = 'Caption for single event posts'
/* ⚠️ IT SAYS "used next time too", WHICH IS THE HALF AN OPERATOR WOULD NOT GUESS. "Saved" alone reads
 * as "saved for this post"; the whole point of a template is that it is not. */
export const CAPTION_SAVED_NOTE = 'Saved automatically · used next time too'
export const CAPTION_SAVED_TICK = 'Saved ✓'
/** The "+" buttons' prefix. ⛔ The LABEL NAMES come from lib/weekly-post/caption-template.ts. */
export const captionAddLabel = (name: string): string => `+ ${name}`

/* 🔴 THE ONE LINE UNDER THE SHARE BUTTONS. ⛔ IT NAMES THE TWO APPS THAT REFUSE A CAPTION rather than
 * saying "some apps", because an operator whose caption did not arrive needs to know whether they did
 * something wrong — and on Facebook and Instagram they did not. */
export const SHARE_CAPTION_NOTE =
  'Facebook and Instagram don’t accept a ready-written caption from other apps — it’s copied, so just '
  + 'paste it in.'


// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ROUND 3 — ONE PICTURE, USED EVERYWHERE (9 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ "Use it on" IS GONE. It asked the truck weekly / single event / both before a picture did
// anything — a required step about a question most trucks have no opinion on. A pub's logo is the
// pub's logo, and it belongs wherever a design has room for one.
// 🔴 THE DEFAULT IS "EVERYWHERE" AND THE EXCEPTION IS OPT-IN: one link, one extra box.

/** ⛔ The size text is gone from the poster blurb — the shape rule still applies and still refuses on
 *  upload with its own sentence, but a size in the description was a number to read before a job most
 *  trucks never do. */
/* ⚠️ REWRITTEN 10 October 2026, §1 — the brief's own sentence. "A full poster for events here. It
 * replaces your standard single event design." named the THING and left the operator to work out
 * whether they had one; the question first ("Got a ready-made poster for this location?") is what tells
 * a truck with no poster that this box is not for them. */
export const POSTER_BOX_BLURB =
  'Got a ready-made poster for this location? Upload it and we’ll use it instead of your single event '
  + 'design.'

export const PICTURE_BOX_BLURB_V3 =
  'A logo or photo. Used wherever your designs have a picture space.'

/* ══ ⛔ THE OVERRIDE'S FOUR STRINGS ARE NO LONGER DRAWN — 9 OCTOBER 2026, LATER THE SAME DAY ════════
 * They were the opt-in link, the third box's title and blurb, and the "+1" badge on the table's picture
 * thumbnail. All four belonged to ONE picture plus an override; with a picture per surface there is
 * nothing to override and no badge to draw — the table has a column per slot instead.
 * ⚠️ `WEEKLY_ONLY_BOX_TITLE` WAS "Picture for weekly posts", WHICH IS NOW `WEEKLY_PIC_TITLE`'s
 * wording. That is not a coincidence: the override box was the right box with the wrong model behind
 * it, and the new shape is what it was reaching for. */
export const WEEKLY_ONLY_ADD_LINK = '+ Use a different picture on weekly posts'
export const WEEKLY_ONLY_BOX_TITLE = 'Picture for weekly posts'
export const WEEKLY_ONLY_BOX_BLURB = 'Used on weekly posts instead of your location picture.'

/* ⛔ "Name on posts" LEFT THIS SCREEN. It wrote `short_name`, which "Tidy up places" also writes — two
 * screens editing one column, and the other one edits the town beside it. ⚠️ THE NOTE NAMES THE REAL
 * PATH rather than saying "elsewhere": a pointer an operator cannot follow is a pointer that costs
 * them a search. */
export const NAME_FROM_SCHEDULE_NOTE =
  /* ⚠️ "area", NOT "town" — the same reason the editor's item was renamed: half the venues on this
   * product are in a village. The screen it points at calls the field "Area" too. */
  'Name and area come from your schedule. Edit them in Schedule › Events › Add event › Tidy up places.'

/** The "+1" badge on a PICTURE thumbnail when a weekly-only override is also set. */
export const WEEKLY_ONLY_BADGE = '+1'

/* 🔴 THE UNSAVED-CHANGES CONFIRM. ⛔ IT IS A QUESTION, NOT A WARNING: "Leave without saving?" asks the
 * one thing the operator can answer, and the two buttons are the two answers in their own words rather
 * than OK and Cancel. */
export const LEAVE_CONFIRM_TITLE = 'You have unsaved changes. Leave without saving?'
export const LEAVE_CONFIRM_STAY = 'Keep editing'
export const LEAVE_CONFIRM_GO = 'Leave'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DESIGN EDITOR'S THREE-COLUMN LAYOUT (9 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const EDITOR_LEFT_TITLE = 'ON YOUR POST'
/** ⛔ An instruction, not a status: it says what to do rather than what is missing. */
export const EDITOR_NOTHING_SELECTED = 'Click anything on your post to change it'
export const EDITOR_SETTINGS_FOR = 'Settings for the box you’ve picked'
export const EDITOR_SECTION_TEXT = 'TEXT'
export const EDITOR_SECTION_STAND = 'MAKE IT STAND OUT'
export const EDITOR_SECTION_MORE = 'MORE OPTIONS'
/* 🔴 THE SUMMARY IS WHAT MAKES A FOLDED SECTION HONEST. "More options" alone is a closed door with no
 * sign on it; naming what is inside is what lets an operator decide NOT to open it. */
/**
 * ══ 🔴 THREE SUMMARIES, BECAUSE MORE OPTIONS HOLDS THREE DIFFERENT THINGS (9 October 2026) ════════
 *
 * ⛔ ONE SUMMARY WAS A LIE ON TWO OF THE THREE SELECTIONS. "All text" has no tilt and no "centre the
 * box"; a box that FOLLOWS the shared style has no letter spacing and no band padding. A folded section
 * whose sign names things that are not behind it is worse than one with no sign — the operator opens
 * it, does not find what was promised, and stops trusting the summaries that ARE right.
 * ⚠️ AND "copy this style" IS GONE FROM ALL THREE, because that button is gone.
 */
export const EDITOR_MORE_SUMMARY =
  'Spacing, tilt, words before, line spacing, darken the picture, centre the box'
/** The "All text" panel's — look only, because nothing per box is reachable from it. */
export const EDITOR_MORE_SUMMARY_ALL =
  'Letter spacing, shadow strength, outline thickness, band corners, darken the picture'
/** A following box's — per box only, because its look lives on All text. */
export const EDITOR_MORE_SUMMARY_BOX =
  'Words before, line spacing, tilt, long names, centre the box'

/* ══ 🔴 "All text" — THE WORDS, AND WHY EACH ONE IS THE WAY IT IS ══════════════════════════════════
 * ⛔ "All text" IS NOT A BOX AND MUST NOT READ LIKE ONE, so its subtitle says what pressing things in
 * it will do — "changes every box that matches" — rather than naming a thing on the poster.
 * ⚠️ "that matches" IS CARRYING WEIGHT: it is the one phrase that makes the amber note below it
 * expected rather than surprising. */
/* ══ ⚠️ "Style all the writing", NOT "All text" — §4, 10 October 2026 ═════════════════════════════
 * ⛔ "All text" IS A NOUN FOR A THING THE OPERATOR DOES NOT HAVE. They have writing on a poster; "all
 * text" is our name for the set of boxes that hold it. The button is an instruction now, and the
 * explanation that used to share its line has a grey line of its own. */
export const ALL_TEXT_ITEM = 'Style all the writing'
/* ⚠️ "change all the writing at once" — THE BRIEF'S OWN WORDS (§B9, 10 October 2026). "style every
 * text box at once" used "style" as a verb and "text box" as a noun an operator does not have: what
 * they have is writing on a poster. */
export const ALL_TEXT_SAMPLE = 'Font, colour and effects for everything'
export const ALL_TEXT_TITLE = 'All text'
export const ALL_TEXT_BLURB = 'changes every box that matches'
/** 🔴 The blue note on a box that follows. ⚠️ It names the three things an operator looks for first. */
export const FOLLOW_NOTE = 'Same font, colour and effects as All text'
export const CHANGE_JUST_THIS = 'Change just this box'
/** The amber note on a box with its own look. */
export const OWN_STYLE_LABEL = 'Own style'
export const MATCH_ALL_AGAIN = 'Match All text again'
export const USE_FOR_ALL_TEXT = 'Use this style for all text'
/** ⚠️ The badge on an own-style box's button in the item grid. Three letters, lower case, not a word. */
export const OWN_BADGE = 'own'
/* ⛔ `EDITOR_CLICK_TO_EDIT` IS NO LONGER DRAWN — 9 October 2026, §3. The grid's right-hand slot says
 * what the 🔗 means instead, which is a fact an operator cannot work out and "click to edit" is one they
 * can. Kept as the record of the wording. */
export const EDITOR_CLICK_TO_EDIT = 'click to edit'

/* ══ 🔴 §3 · THE "LOOK" SWITCH — WHAT REPLACED THE TWO COLOURED NOTES ═════════════════════════════
 * ⛔ THE NOTES WERE A **STATE READOUT WITH A LINK IN IT**: blue "🔗 Same font, colour and effects as All
 * text · Change just this box", amber "Own style · Match All text again". So the thing you pressed to
 * change the state was buried inside the sentence describing it, and the two states looked like two
 * different components rather than two positions of one control.
 * 🔴 A TWO-WAY SWITCH SHOWS BOTH POSITIONS AT ONCE, which is what makes it obvious there is a choice at
 * all — and the grey line under it explains the position you are in rather than announcing it. */
export const LOOK_HEADING = 'LOOK'
export const LOOK_SAME = '🔗 Same as All text'
export const LOOK_OWN = 'Its own style'
export const LOOK_SAME_HINT =
  'Font, colour and effects come from All text. Pick “Its own style” to change them for this box only.'
export const LOOK_OWN_HINT =
  'This box has its own font, colour and effects. Pick “Same as All text” to match the others again.'
/** 🔴 The right-hand slot of the grid's heading line, replacing "click to edit". */
export const EDITOR_LINK_LEGEND = '🔗 = matches All text'
/** ⚠️ The 🔗 on a following text box's button. One glyph, no words — the legend above explains it. */
export const FOLLOW_GLYPH = '🔗'

/* ══ 🔴 §4 · EDIT / PREVIEW ═══════════════════════════════════════════════════════════════════════
 * ⚠️ THE HINT NAMES WHAT PREVIEW **DOES**, not what it is. "Preview" alone is a word an operator has to
 * press to understand, and pressing an unknown control on a design you have just spent ten minutes on
 * is something people do not do. */
export const EDITOR_PREVIEW_HINT = 'Preview hides the box outlines so you see the finished post'
/* ══ 🔴 §2 · THE ZOOM ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ "Fit to screen", NOT "Fit": it is a button now rather than the percentage's label, so it has room
 * to say what it does — and "Fit" on its own reads as a state. */
export const EDITOR_FIT_TO_SCREEN = 'Fit to screen'

/* ══ 🔴 §5 · THE PORTRAIT ADVICE ══════════════════════════════════════════════════════════════════
 * ⚠️ THE TICK AND THE WORDS AFTER IT ARE GREEN, which is the brief's own instruction and is why the
 * suffix is one string: the size and shape before it stay grey, and splitting the colour mid-line needs
 * the green half to be its own element.
 * ⛔ THE TIP NAMES THE NUMBERS. "Use a portrait picture" is advice an operator cannot act on without a
 * second look; "1080 × 1350, 4:5" is advice they can take straight to Canva. */
export const BG_BEST_SUFFIX = '✓ best for Instagram & Facebook'
export const BG_PORTRAIT_TIP =
  'Tip: a portrait picture (1080 × 1350, 4:5) shows biggest on Instagram and Facebook feeds.'
export const EDITOR_BACKGROUND_ITEM = 'Background picture'
export const EDITOR_ADD_OWN_TEXT = '+ Add your own text'
/** ⚠️ "Location picture" everywhere — the single event design said "Location photo" until today. */
export const EDITOR_PICTURE_ITEM = 'Location picture'
export const EDITOR_PICTURE_SAMPLE = 'Each location’s picture'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ROUND 6 · PLAIN WORDS (10 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ WHO THIS IS FOR, SAID ONCE SO EVERY STRING BELOW CAN BE JUDGED AGAINST IT: food truck owners who
// are not tech-savvy. A label earns its place by saying what it DOES in words the operator already
// uses. "Shows" is a developer's word for "what this box prints"; "Line up" is a verb in a menu; "Make
// it stand out" is a claim rather than a job. The advanced settings have not gone anywhere — they are
// folded under MORE OPTIONS with the same plain treatment.

/* ══ 🔴 §A · "THE 7 DAYS" ═════════════════════════════════════════════════════════════════════════
 * ⛔ IT REPLACES SIX ITEMS — Date, Place, Time, Location picture, "Each row" and "Rows" — which were
 * six answers to one question ("where do the seven days go?"). An operator had to place three boxes at
 * the same height, guess the gaps between them, and then find a pixel number called "Spacing" that
 * copied all three down six times. ⚠️ THE SIX ARE NOT GONE, THEY ARE **INSIDE**: the parts list has a
 * switch for each, and clicking the words on the poster still opens that part's own text settings. */
export const DAYS_ITEM = 'The 7 days'
export const DAYS_ICON = '☰'
export const DAYS_BLURB =
  'One row for each day. Drag the orange box on your poster to move them, pull its corners to make '
  + 'the rows bigger or smaller.'
export const DAYS_QUICK_HEADING = 'QUICK LAYOUTS'
export const DAYS_QUICK_HINT = 'One click rearranges every row.'
export const QL_ONE_LINE = 'All on one line'
export const QL_DAY_ON_TOP = 'Day on top'
export const QL_BIG_PICTURE = 'Big picture'
export const DAYS_PARTS_HEADING = 'WHAT’S IN EACH ROW'
/* ⚠️ THE EXAMPLES BESIDE THREE OF THESE ARE **LIVE** — the design's own date wording, place wording
 * and clock — for the reason the item list's samples were live: a fixed "Mon 5th Oct" would be the one
 * thing on the screen that cannot be wrong and also cannot be right. The picture's is a rule, not an
 * example, because there is nothing to show until a location has one. */
export const PART_PICTURE_NAME = 'Location picture'
export const PART_PICTURE_EG = 'if it has one'
export const PART_DAY_NAME = 'Day and date'
export const PART_PLACE_NAME = 'Place'
export const PART_TIMES_NAME = 'Times'
export const DAYS_PARTS_HINT =
  'Drag ⋮⋮ to change the order. To change how the words look, click them on your poster.'
export const DAYS_OFF_HEADING = 'Days off'
export const DAYS_OFF_MESSAGE = 'Show a message'
export const DAYS_OFF_OMIT = 'Leave them out'
export const DAYS_OFF_TEXT_LABEL = 'What it says'
export const DAYS_OFF_OMIT_HINT = 'Days with nothing on are left blank.'
export const DAYS_PICTURE_SHAPE = 'Picture shape'
export const SHAPE_SQUARE = 'Square'
export const SHAPE_ROUNDED = 'Rounded'
export const SHAPE_CIRCLE = 'Circle'
export const DAYS_MORE_SUMMARY = 'Picture shape'

/* ══ 🔴 §B · THE EDITOR ═══════════════════════════════════════════════════════════════════════════
 * ⛔ "✎ Edit | 👁 Preview" IS GONE AFTER ONE ROUND, AND THE REASON IS WORTH KEEPING. It was a MODE:
 * the poster stayed where it was and the outlines disappeared, so the operator had to remember which
 * of two states they were in, and every other control on the screen silently changed meaning. A BUTTON
 * that opens the finished post over the top has no state to remember and no way to get stuck in. */
export const PREVIEW_POST_BTN = '👁 Preview post'
export const PREVIEW_POST_TITLE = 'Your finished post'
export const PREVIEW_POST_HINT = 'This is exactly what gets posted.'
export const PREVIEW_POST_CLOSE = 'Close'
export const PREVIEW_POST_WAIT = 'Making your post…'
/** 🔴 The right-hand slot of the grid heading. ⛔ It replaces the 🔗 legend, which §B9 removes. */
export const EDITOR_CLICK_ONE = 'click one to change it'
/* ══ 🔴 "Darken the picture" MOVES TO THE PICTURE (§B3) ═══════════════════════════════════════════
 * ⛔ IT WAS IN **MORE OPTIONS OF A TEXT BOX**, which is why it read as doing nothing: on a box that
 * follows All text that section does not contain it at all, so an operator who selected the Date and
 * opened MORE OPTIONS could not find it — and the one place it WAS reachable (All text › MORE OPTIONS,
 * and the weekly "Rows" item) is not where anybody looks for a setting about the PICTURE. It is a
 * whole-picture setting and it lives with the picture now. */
export const DARKEN_LABEL = 'Darken the picture'
export const DARKEN_HINT = 'Puts a dark layer over your picture so white writing is easier to read.'
/** §B8 · shown only when the new picture is a different shape AND boxes actually moved. */
export const NEW_SHAPE_RESET =
  'Your new picture is a different shape, so the boxes have moved to a starting position.'

/* ══ 🔴 §B10 · LEAVING THE EDITOR ═════════════════════════════════════════════════════════════════
 * ⛔ TWO BUTTONS WERE A FALSE CHOICE. "Leave" or "Keep editing" left the operator to work out that
 * saving first was a third thing they would have to do by hand — so the dialog that exists to protect
 * their work offered no way to keep it. */
export const LEAVE_TITLE = 'Save your changes first?'
export const LEAVE_BODY = 'You’ve changed this design since you last saved.'
export const LEAVE_SAVE_AND_GO = 'Save and leave'
export const LEAVE_WITHOUT_SAVING = 'Leave without saving'

/* ══ 🔴 §C · THE SETTINGS FOR A SELECTED BOX, IN PLAIN WORDS ══════════════════════════════════════ */
export const SETTINGS_CLICKED = 'You clicked this on your poster. Change it here.'
/** ⛔ "LOOK" became "Style", and the two positions say what they DO rather than naming a state. */
export const STYLE_HEADING = 'Style'
export const STYLE_MATCH = 'Match the other writing'
export const STYLE_OWN = 'Style this one on its own'
export const STYLE_MATCH_HINT = 'Font, colour and effects come from All text, so everything matches.'
export const STYLE_OWN_HINT = 'Font, colour and effects are set just for this.'
/* ⚠️ "Shows" IS GONE FROM EVERY ITEM. It was one word standing in for four different questions, and
 * each one is now asked in full. ⛔ THE DATE'S LINE NAMES THE **OTHER** CHOICES, because a dropdown
 * whose closed state shows today's answer tells an operator nothing about what else is in it. */
export const LABEL_DATE_STYLE = 'How the date is written'
export const LABEL_TIME_STYLE = 'How the times are written'
export const LABEL_PLACE_STYLE = 'How the place is written'
export const LABEL_HEADING_TEXT = 'What the heading says'
export const LABEL_OWN_TEXT = 'What it says'
export const OTHER_CHOICES = (samples: readonly string[]): string =>
  `Other choices: ${samples.join(' · ')}`
export const LABEL_TEXT_SIZE = 'Text size'
export const TEXT_SIZE_HINT = 'or drag a corner of the box on your poster'
export const LABEL_LINE_UP = 'Line up the words'
export const ALIGN_LEFT = '⇤ Left'
export const ALIGN_CENTRE = '≡ Centre'
export const ALIGN_RIGHT = 'Right ⇥'
export const LABEL_LETTERS = 'Letters'
export const LETTERS_BOLD = 'Bold'
export const LETTERS_ITALIC = 'Italic'
export const LETTERS_CAPS = 'CAPITALS'
/** ⛔ "MAKE IT STAND OUT" was a claim; this is the job. */
export const SECTION_EASIER_TO_READ = 'MAKE IT EASIER TO READ'
export const EFFECT_SHADOW = 'Shadow behind the letters'
export const EFFECT_SHADOW_NONE = 'None'
export const EFFECT_SHADOW_SOFT = 'Soft'
export const EFFECT_SHADOW_STRONG = 'Strong'
export const EFFECT_OUTLINE = 'Outline round the letters'
export const EFFECT_BAND = 'Coloured strip behind the words'
export const EFFECT_SEE_THROUGH = 'See-through'
export const EFFECT_AUTO = 'Keep it readable automatically'
export const EFFECT_AUTO_HINT =
  'If the words are hard to read on your picture, we add a soft shadow. Your colours never change.'
export const MORE_SUMMARY_PLAIN =
  'Space between letters · Tilt · Add words before it (like “From”) · If a name is too long: make it '
  + 'smaller or use two lines'
export const LABEL_LETTER_SPACE = 'Space between letters'
export const LABEL_TILT = 'Tilt'
export const LABEL_WORDS_BEFORE = 'Add words before it'
export const WORDS_BEFORE_HINT = 'Drawn in front of what this item says, like “From”. It shrinks to fit with the rest.'
export const LABEL_TOO_LONG = 'If a name is too long'
export const TOO_LONG_SHRINK = 'Make it smaller'
export const TOO_LONG_TWO_LINES = 'Use two lines'
export const LABEL_LINE_HEIGHT = 'Space between lines'
export const LABEL_CENTRE_ON = 'Centre on the picture'
export const CENTRE_ACROSS = 'Across'
export const CENTRE_UPDOWN = 'Up and down'
export const LABEL_SHADOW_STRENGTH = 'How dark the shadow is'
export const LABEL_OUTLINE_WIDTH = 'How thick the outline is'
export const LABEL_BAND_CORNERS = 'Rounded corners on the strip'
export const LABEL_BAND_PADDING = 'Space around the words in the strip'

/* ══ 🔴 "All text" › Text size — A NUMBER, NOT TWO NUDGE BUTTONS (10 October 2026) ═════════════════
 * ⛔ "Smaller | Bigger" MADE AN OPERATOR PRESS AND LOOK, PRESS AND LOOK, and never answered the
 * question they were asking: how big is my writing? ⚠️ THE LINE BELOW IS WHAT MAKES THE NUMBER HONEST
 * — a design's boxes are deliberately different sizes, so one number cannot be all of them, and what
 * this control does is move them together. */
export const ALL_TEXT_SIZE_HINT = 'Changes every box at once and keeps the big ones bigger.'

/* ══ 🔴 §3 (10 October 2026) · THE BACKGROUND PICTURE IS A SECTION, NOT A SELECTION ════════════════
 * ⛔ IT WAS AN ITEM YOU SELECTED, which made the one setting about the POSTER ITSELF the only one an
 * operator had to leave what they were doing to reach. ⚠️ THE 🖼 IS PART OF THE TITLE rather than a
 * separate icon: every other section heading is plain capitals, and one glyph is what marks this one
 * as being about the picture rather than about words.
 * ⚠️ THE SUMMARY NAMES ALL THREE THINGS INSIDE, because a folded section whose sign lists two of three
 * is a sign that sends somebody looking elsewhere for the third. */
export const BACKGROUND_SECTION = '🖼 BACKGROUND PICTURE'
export const BACKGROUND_SUMMARY = 'Replace picture · Darken the picture · size advice'

/* ══ 🔴 §6 (10 October 2026) · DELETING YOUR OWN TEXT ══════════════════════════════════════════════
 * ⚠️ "this text", NOT "this text box": a box is our word for it, and the thing the operator is looking
 * at is their own words on their own poster. ⛔ THE KEY IS NAMED BESIDE THE BUTTON rather than left to
 * be discovered — a shortcut nothing mentions is a shortcut nobody uses. */
export const DELETE_OWN_TEXT = '🗑 Delete this text'
export const DELETE_OWN_TEXT_KEY = 'or press Delete'

/* ══ 🔴 §2 (10 October 2026) · THE ONE THING THE LIVE STAGE CANNOT SHOW ═══════════════════════════
 *
 * ⛔ **AN UPLOADED FONT IS NEVER SENT TO A BROWSER.** The rule is older than §2 and the route states it
 * where it is enforced: an uploaded font may be commercially licensed, and a readable URL from our
 * domain is redistribution of somebody else's paid font. So the editor cannot draw in it — it draws
 * those boxes in Oswald — while the PNG a truck actually posts is in their own font.
 * 🔴 SO IT IS **SAID**, not left to be noticed. A preview that is quietly in the wrong typeface is
 * worse than a slow one, because an operator would believe it. ⚠️ ONE SHORT LINE under the poster,
 * only when the design really names an uploaded family, and it names the way to see the truth.
 */
export const LIVE_FONT_FALLBACK =
  'Your own uploaded font can’t be shown here, so that text is in Oswald while you edit. Press “👁 Preview post” to see it properly.'
