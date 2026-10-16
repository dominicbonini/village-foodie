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

import { translatorFor } from '@/lib/i18n/translator'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/socialPosts'

/* ── 🔴 LANGUAGE PHASE 1d PART 2: THE WORDS LIVE IN messages/en-GB.json `socialPosts` (US in en-US.json) ──────
 * The Social media tab reads them with `useT('socialPosts')` in the truck's locale. The exports below are the SAME
 * messages in en-GB, for the callers that have not moved (the harnesses, and any screen still importing a constant)
 * — one definition of every sentence, never a second typed copy. Each export's key is its name in camelCase. */
const gb = translatorFor(DEFAULT_LOCALE, 'socialPosts')
/** A rich message's plain text, and its parts split at the <b> tags (for the exports that were split by hand). */
const SPLIT = '\u0001'
const boldParts = (key: 'pageIntro' | 'eventDesignBlurb'): string[] =>
  gb.markup(key, { b: chunks => `${SPLIT}${chunks}${SPLIT}` }).split(SPLIT)

/** Under the three Make-a-post boxes. ⛔ It names BOTH facts an operator needs before pressing
 *  anything: what Make post actually does, and which picture it will use. */
/* ⚠️ "your single event post design" — THE NAME BOX 2 NOW USES. It said "your Standard event design",
 * which was two words for one thing ("Standard" and "event") and neither of them was the heading an
 * operator would find if they went looking. */
export const MAKE_POST_FOOTNOTE =
  gb('makePostFootnote')

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
/* 🔴 LANGUAGE PHASE 1d PART 2: ONE MESSAGE, `pageIntro`, WITH THE TWO AREA NAMES IN <b> TAGS (rule 2). The four
 * parts below are cut from it, so they cannot drift from the sentence. */
const INTRO_PARTS = boldParts('pageIntro')
export const INTRO_DESIGNS_WORD = INTRO_PARTS[1]
export const INTRO_MAKE_WORD = INTRO_PARTS[3]
export const INTRO_AFTER_DESIGNS = INTRO_PARTS[2]
export const INTRO_AFTER_MAKE = INTRO_PARTS[4]
/** The whole sentence, flattened — for anything that needs it as one string (and for the harness). */
export const PAGE_INTRO =
  `${INTRO_DESIGNS_WORD}${INTRO_AFTER_DESIGNS}${INTRO_MAKE_WORD}${INTRO_AFTER_MAKE}`

/* ══ 🔴 THE SIX DESCRIPTIONS SAY WHAT THE PICTURE WILL HAVE ON IT ═════════════════════════════════
 * ⛔ THE OLD ONES DESCRIBED THE BOX ("Your whole week on one picture"). These describe the OUTPUT —
 * what HatchGrab writes on top of the truck's own artwork — because that is the thing an operator
 * cannot see until they have pressed the button once. */

/** Box 1, Make a post. */
export const WEEKLY_BOX_BLURB = gb('weeklyBoxBlurb')
/** Box 2, Make a post. */
export const EVENT_BOX_BLURB = gb('eventBoxBlurb')
/** Box 3, Make a post. */
export const PLACE_POST_BOX_BLURB = gb('placePostBoxBlurb')

/**
 * A private event's row, in the Single event box.
 *
 * ⛔ IT IS A ROW AND NOT AN OMISSION. A private event takes its place in the next-six list, greyed,
 * because an operator who sees five events when they have six bookings will go looking for the sixth.
 * ⚠️ IT CARRIES NO VENUE, NO TOWN AND NO PLACE NAME — the server does not send them for a private
 * event (§73), so this line is all there is to draw.
 */
export const PRIVATE_EVENT_ROW = gb('privateEventRow')

/** Box 1, Designs. */
export const WEEKLY_DESIGN_BLURB =
  gb('weeklyDesignBlurb')
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
export const EVENT_DESIGN_TITLE = gb('eventDesignTitle')
/* 🔴 LANGUAGE PHASE 1d PART 2: ONE MESSAGE, `eventDesignBlurb`, WITH "standard" IN A <b> TAG (rule 2). */
const EVENT_DESIGN_PARTS = boldParts('eventDesignBlurb')
export const EVENT_DESIGN_BLURB_BEFORE = EVENT_DESIGN_PARTS[0]
export const EVENT_DESIGN_BLURB_BOLD = EVENT_DESIGN_PARTS[1]
export const EVENT_DESIGN_BLURB_AFTER = EVENT_DESIGN_PARTS[2]
/** The whole sentence, flattened — for anything that needs it as one string (and for the harness). */
export const EVENT_DESIGN_BLURB =
  `${EVENT_DESIGN_BLURB_BEFORE}${EVENT_DESIGN_BLURB_BOLD}${EVENT_DESIGN_BLURB_AFTER}`

/** The two states of Box 2's button. ⚠️ Constants because the empty-state title must agree with them. */
export const EVENT_DESIGN_BUTTON_NEW = gb('eventDesignButtonNew')
export const EVENT_DESIGN_BUTTON_EDIT = gb('eventDesignButtonEdit')

/* ══ 🔴 "Used for:" — WHICH POSTS EACH DESIGN REACHES ═════════════════════════════════════════════
 * ⛔ THIS IS THE QUESTION THE TWO DESIGN BOXES COULD NOT ANSWER. They are two pictures with almost
 * identical descriptions; what tells them apart is not what is ON them, it is which posts USE them.
 * ⚠️ THE EVENT ONE NAMES ITS EXCEPTION, because the exception is the whole of Box 3. */
export const WEEKLY_DESIGN_USED_FOR = gb('weeklyDesignUsedFor')
/* ⛔ "every event post, at every place — unless that place has its own design." WAS THIS LINE, and it
 * said the same thing as the description above it in different words. The description now carries the
 * "standard" fact; this one answers only "which posts?" — and it answers it in five words, which is
 * what a "Used for:" line is for. */
export const EVENT_DESIGN_USED_FOR = gb('eventDesignUsedFor')
/** The bold lead-in. ⚠️ Its own constant so the two panels cannot drift to "Used on:" and "Used for:". */
export const USED_FOR_LABEL = gb('usedForLabel')
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
  gb('placeDesignScope', { place })

/**
 * The confirm before removing a place's picture.
 *
 * ⚠️ IT NAMES THE CONSEQUENCE, NOT THE ACT. "Remove this picture?" is a question about a file; what
 * the operator is actually deciding is which design their posts at that place will use next time.
 */
/* ⛔ NOT `useStandardConfirm`. A `use`-prefixed name is a HOOK to the React lint rules, and calling it
 * from an async handler was an error — correctly, by the rule's own lights. The name says what it is. */
export const standardDesignConfirm = (place: string): string =>
  gb('standardDesignConfirm', { place })

/** The link that does it. ⚠️ Link-styled, not a button: it is the quiet way out of a page whose
 *  purpose is the opposite. */
export const USE_STANDARD_LINK = gb('useStandardLink')

/** The footer under Box 3 on Make a post. */
export const PLACE_POST_FOOTER_NOTE = gb('placePostFooterNote')

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
  gb('placePicturesFooter', { withPictures, withNone })

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
  gb('postNameHint', { fullName })

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
export const EMPTY_WEEKLY_TITLE = gb('emptyWeeklyTitle')
/* ⚠️ "a single event post", MATCHING BOX 2'S NEW NAME. An empty state that names the design by a word
 * the Designs area no longer uses sends the operator looking for a box that is not there. */
export const EMPTY_EVENT_TITLE = gb('emptyEventTitle')
/* ══ ⛔ "It only takes a minute." IS GONE — 7 October 2026, Dominic ════════════════════════════════
 * The note that was here argued it was the sentence that mattered — the reason to act now rather than
 * later. ⚠️ IT IS ALSO A **PROMISE ABOUT HOW LONG SOMETHING TAKES**, made by a screen that does not
 * know: setting a design up means exporting artwork at the right shape, and for a truck who has not
 * got one it is not a minute. 🔴 ONE EMPTY STATE, SO IT WENT ONCE AND IT WENT FROM BOTH — the weekly
 * half and the single event half render the same `EmptyBox`. */
export const EMPTY_BODY = gb('emptyBody')
export const EMPTY_BUTTON = gb('emptyButton')

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
export const PLACE_PICTURES_TITLE = gb('placePicturesTitle')
export const PLACE_PICTURES_BLURB =
  gb('placePicturesBlurb')

/**
 * The two group headings in the list. ⚠️ The count is the operator’s own, so each is a function.
 *
 * ⛔ WRITTEN IN SENTENCE CASE AND SHOUTED BY THE STYLESHEET, not typed in capitals. A string that is
 * already uppercase cannot be re-used anywhere the capitals would be wrong, and it reads as shouting
 * in every diff and every search; `uppercase` on the row is the one place that decision belongs.
 */
export const PLACE_PICTURES_NONE_HEADING = (n: number) => gb('placePicturesNoneHeading', { n })
export const PLACE_PICTURES_SOME_HEADING = (n: number) => gb('placePicturesSomeHeading', { n })

/**
 * The line at the top of a place's pictures page.
 *
 * ⛔ IT NAMES BOTH FACTS AN OPERATOR NEEDS BEFORE THEY UPLOAD ANYTHING: which picture gets used, and
 * that the choice is not final. Without the second sentence, "Main" reads as "the only one that does
 * anything" and a truck uploads one picture per place for ever.
 */
export const PLACE_PICTURES_PAGE_LINE =
  gb('placePicturesPageLine')

/** The quiet link under the grid. ⚠️ "(optional)" IS IN IT: almost no truck needs this. */
export const PLACE_OWN_POSITIONS_LINK = gb('placeOwnPositionsLink')

/** "N images" — ⚠️ a function, because one image is not "1 images". */
export const picturesCount = (n: number): string => gb('picturesCount', { n })

/** The confirm before removing one. ⚠️ It names the picture, and says what happens to Main. */
export const removePictureConfirm = (label: string, isMain: boolean): string =>
  gb(isMain ? 'removePictureConfirm.main' : 'removePictureConfirm.other', { label })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 CREATE A POST — TWO HALVES (7 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ "Post for a place" IS GONE AND ITS WORDING IS NOT REUSED HERE. It was a third way to reach the
// same modal — pick a venue, post its next event — and the right half below does that better by
// naming the next event outright instead of making the operator pick the venue it happens to be at.

export const CREATE_WEEKLY_TITLE = gb('createWeeklyTitle')
export const CREATE_EVENT_TITLE = gb('createEventTitle')

/** "4 events · 1 private event left out" — the second clause only when there is one. */
export const weekEventsLine = (events: number, privateEvents: number): string => {
  if (privateEvents <= 0) return gb('weekEventsLine.events', { events })
  /* ⛔ IT SAYS "left out", NOT "hidden". A private booking is not posted about at all — there is no
   * post it is being kept out of the picture of — and "hidden" would read as a setting to go and
   * change. The route refuses `event_post` for one, so this is a statement of fact. */
  return gb('weekEventsLine.withPrivate', { events, privateEvents })
}

export const CREATE_WEEKLY_BUTTON = gb('createWeeklyButton')
export const NEXT_EVENT_HEADING = gb('nextEventHeading')
/** "Create post for Tue 13 Oct". ⚠️ The DATE, not "this event" — the button says what it will make. */
export const createPostForLabel = (date: string): string => gb('createPostForLabel', { date })
export const MORE_EVENTS_LABEL = (n: number): string => gb('moreEventsLabel', { n })
export const NO_UPCOMING_EVENTS = gb('noUpcomingEvents')

/**
 * The grey line under a single event post's preview, naming the image it will use.
 *
 * 🔴 IT NAMES THE SOURCE, BECAUSE THE SOURCE IS THE THING AN OPERATOR CANNOT SEE. Three different
 * images can produce the same thumbnail at 96px — the location's own photo, the location's poster, or
 * the standard design — and the only one they can act on is the one that is actually chosen.
 */
/* ⛔ A PRIVATE EVENT NEVER GETS A LOCATION IMAGE, and the reason is the whole privacy rule: the server
 * does not send a private booking's place at all, so there is nothing here to offer. */
export const IMAGE_CHOICE_PRIVATE = gb('imageChoicePrivate')

export const imageSourceLine = (
  /* ⚠️ `'none'` IS ACCEPTED AND MEANS A PRIVATE BOOKING. It never reaches this line on screen — the
   * headline is always a public event — but the type is the server's `imageSource`, and narrowing it
   * here would make the caller cast rather than make the case impossible. It answers honestly. */
  source: 'event' | 'place-photo' | 'place-poster' | 'standard' | 'none',
  place?: string | null,
): string => {
  /* 🔴 ONE WHOLE SENTENCE PER SOURCE: "this location" is a `select` branch of the message, not a word put in. */
  const where = String(place ?? '').trim()
  const hasPlace = where ? 'yes' : 'no'
  if (source === 'none') return IMAGE_CHOICE_PRIVATE
  if (source === 'event') return gb('imageSource.event')
  if (source === 'place-photo') return gb('imageSource.placePhoto', { hasPlace, place: where })
  if (source === 'place-poster') return gb('imageSource.placePoster', { hasPlace, place: where })
  return gb('imageSource.standard')
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
export const LOCATIONS_TITLE = gb('locationsTitle')
export const LOCATIONS_BLURB =
  gb('locationsBlurb')

export const LOCATIONS_SEARCH_LABEL = gb('locationsSearchLabel')
export const CHIP_ALL = (n: number): string => gb('chipAll', { n })
export const CHIP_MISSING = (n: number): string => gb('chipMissing', { n })
export const CHIP_HIDDEN = (n: number): string => gb('chipHidden', { n })

/* ══ 🔴 §5 · CREATE A POST — THE NEXT EVENT, THE PICKER, AND THE CAPTION (9 October 2026) ══════════
 * ⚠️ "YOUR NEXT EVENT" IS A POSSESSIVE because the card is about the truck's own diary, and the one
 * before it said "NEXT EVENT", which reads like a listing. ⛔ "OR PICK ANOTHER EVENT" STARTS WITH "OR"
 * deliberately: it is the alternative to the button above it, not a second list. */
export const NEXT_EVENT_HEADING_V4 = gb('nextEventHeadingV4')
export const PICK_ANOTHER_HEADING = gb('pickAnotherHeading')
export const CREATE_FOR_NEXT = gb('createForNext')
/** ⚠️ Shown once another event has been chosen — "this", because the card above now shows it. */
export const CREATE_FOR_THIS = gb('createForThis')
export const SHOW_ALL_UPCOMING = (n: number): string => gb('showAllUpcoming', { n })
export const HIDE_ALL_UPCOMING = gb('hideAllUpcoming')

/* ══ 🔴 THE CAPTION BOX — PLAIN TEXT, THIS POST ONLY ══════════════════════════════════════════════
 * ⛔ "used next time too" IS GONE AND THAT PHRASE WAS THE PROBLEM. The caption box on this card is the
 * TEMPLATE FILLED IN for one event; editing it has to change that post and nothing else, and a note
 * promising otherwise was promising the opposite of what the box does.
 * ⚠️ TWO SENTENCES: what typing does, and what it does NOT do. The second is the one an operator needs
 * before they will type at all. */
export const CAPTION_HEADING = gb('captionHeading')
export const CAPTION_THIS_POST_NOTE =
  gb('captionThisPostNote')
export const EDIT_TEMPLATE_LINK = gb('editTemplateLink')
export const TEMPLATE_PANEL_TITLE = gb('templatePanelTitle')
export const TEMPLATE_PANEL_BLURB = gb('templatePanelBlurb')
export const TEMPLATE_PANEL_BLURB_WEEK = gb('templatePanelBlurbWeek')
export const TEMPLATE_SAVE = gb('templateSave')
export const TEMPLATE_CANCEL = gb('templateCancel')
/** 🔴 It says what the orange words ARE and what Saving reaches. ⚠️ "every future post", not "every
 *  post": the caption already on screen is refreshed, and posts already shared are gone. */
export const TEMPLATE_PANEL_NOTE =
  gb('templatePanelNote')

export const COL_LOCATION = gb('colLocation')
export const COL_WEEKLY = gb('colWeekly')
export const COL_EVENT = gb('colEvent')

export const LOCATIONS_NONE = gb('locationsNone')
export const LOCATIONS_NO_MATCH = gb('locationsNoMatch')
export const LOCATIONS_PICK_ONE = gb('locationsPickOne')

/* ── THE EVENT BOX, WHOSE WORDING FOLLOWS THE DESIGN ─────────────────────────────────────────────
 * 🔴 TWO SETS, AND THE SCREEN PICKS BY THE DESIGN RATHER THAN BY A SETTING OF ITS OWN. With a photo
 * space on the single event design the image is a PHOTO that goes in that space; without one it is the
 * whole POSTER. Those are different things to ask a truck for — a photo of the pub, versus artwork
 * the pub already has — so asking for the wrong one produces an upload that cannot be used. */
export const EVENT_BOX_PHOTO_TITLE = gb('eventBoxPhotoTitle')
export const EVENT_BOX_PHOTO_BLURB =
  gb('eventBoxPhotoBlurb')
export const EVENT_BOX_POSTER_TITLE = gb('eventBoxPosterTitle')
export const EVENT_BOX_POSTER_BLURB =
  gb('eventBoxPosterBlurb')
/** ⛔ The shape refusal, and it names the way out rather than just refusing. */
export const EVENT_BOX_POSTER_SHAPE = (w: number, h: number): string =>
  gb('eventBoxPosterShape', { w: String(w), h: String(h) })
export const EVENT_BOX_ADD_PHOTO_SPACE =
  gb('eventBoxAddPhotoSpace')

export const WEEKLY_BOX_TITLE = gb('weeklyBoxTitle')
export const WEEKLY_BOX_BLURB_LOC =
  gb('weeklyBoxBlurbLoc')
export const WEEKLY_USE_EVENT_IMAGE = gb('weeklyUseEventImage')
/** ⚠️ Shown when the weekly design has no Location picture item switched on — see the brief's §5. */
export const WEEKLY_NOT_ON_LINE =
  gb('weeklyNotOnLine')

export const SLOT_UPLOAD = gb('slotUpload')
export const SLOT_REPLACE = gb('slotReplace')
export const SLOT_REMOVE = gb('slotRemove')
export const SLOT_EMPTY = gb('slotEmpty')
/* ⛔ IT SAYS THE IMAGE IS KEPT, because it is: Remove clears the slot and nothing is deleted. A truck
 * told "Remove" without that sentence has every reason to think they are about to lose the file. */
export const slotRemoveConfirm = (what: string): string =>
  gb('slotRemoveConfirm', { what })

export const NAME_ON_POSTS_LABEL = gb('nameOnPostsLabel')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE IMAGE CHOICE WHEN MAKING A SINGLE EVENT POST (7 October 2026, §6)
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const IMAGE_CHOICE_LABEL = gb('imageChoiceLabel')
export const imageChoicePlacePhoto = (place: string): string => gb('imageChoicePlacePhoto', { place })
export const imageChoicePlacePoster = (place: string): string => gb('imageChoicePlacePoster', { place })
export const IMAGE_CHOICE_STANDARD = gb('imageChoiceStandard')
export const IMAGE_CHOICE_ONE_OFF = gb('imageChoiceOneOff')
/* ⚠️ "as <Location>'s poster", NOT "for <Location>" (8 October 2026). A location has TWO images now,
 * and "for" named neither — a truck ticking it could reasonably expect either. The tick saves the
 * upload into the POSTER slot, and the words say so. */
export const imageChoiceAlsoSave = (place: string): string => gb('imageChoiceAlsoSave', { place })


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

export const TAB_CREATE_HEADING = gb('tabCreateHeading')
export const TAB_CREATE_BLURB =
  gb('tabCreateBlurb')

export const TAB_DESIGNS_HEADING = gb('tabDesignsHeading')
export const TAB_DESIGNS_BLURB =
  gb('tabDesignsBlurb')

export const TAB_LOCATIONS_HEADING = gb('tabLocationsHeading')
/* ⚠️ "Pictures", NOT "Images" — §1. The three boxes say "picture" and so does the chip; one word for
 * one thing. ⛔ AND "names" IS GONE FROM IT: the name is edited in Tidy up places, which this screen
 * says in its own grey note — promising it here would be the second screen that claims to own it. */
export const TAB_LOCATIONS_BLURB =
  gb('tabLocationsBlurb')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 TWO KINDS OF LOCATION IMAGE — A POSTER AND A PICTURE (8 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THIS REPLACES THE "event slot / weekly slot" WORDING, AND THE REASON IS NOT COSMETIC. Under that
// model, whether a location's event image was a PHOTO cropped into a box or the WHOLE POSTER was
// decided by the DESIGN — so adding a photo space to the single event design silently changed what
// every location's uploaded image meant. 🔴 THE TRUCK CHOOSES NOW, and the two things have two names.

/** The left card inside Location settings. ⚠️ The PILL and the page heading stay "Location settings". */
export const LOCATIONS_CARD_TITLE = gb('locationsCardTitle')

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
export const COL_POSTER = gb('colPoster')

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
export const LOCATION_POSTER_TITLE = gb('locationPosterTitle')
export const WEEKLY_PIC_TITLE = gb('weeklyPicTitle')
export const WEEKLY_PIC_BLURB = gb('weeklyPicBlurb')
export const EVENT_PIC_TITLE = gb('eventPicTitle')
export const EVENT_PIC_BLURB = gb('eventPicBlurb')
/* ══ ⚠️ "Drop it here" — BOTH BOXES, 10 October 2026, §1 ═══════════════════════════════════════════
 * ⛔ "Drop a picture here" / "Drop a poster here" NAMED THE FILE in a box whose title and description
 * have just named it twice. ⚠️ THE TWO CONSTANTS STAY SEPARATE rather than being collapsed into one:
 * `dropLabel` is a per-box prop, and a single shared string would make the next box that wants its own
 * wording a refactor instead of a value. */
export const DROP_A_PICTURE = gb('dropAPicture')
export const DROP_A_POSTER = gb('dropAPoster')
/* 🔴 THE TWO BORROW LINKS. ⚠️ "Use the …" rather than "Copy the …", because nothing is copied: the
 * slot is pointed at the same stored row. */
export const USE_EVENT_PICTURE = gb('useEventPicture')
export const USE_WEEKLY_PICTURE = gb('useWeeklyPicture')
/* ⛔ `COL_PICTURE` IS NO LONGER DRAWN. It was the single location picture's column, back when there
 * was one; kept as the record of the wording. */
export const COL_PICTURE = gb('colPicture')

/* ⚠️ "No images", NOT "Missing images" (8 October 2026). Both images are OPTIONAL — a location may
 * legitimately have neither — and "missing" implies something ought to be there and is not. */
/* ⛔ `CHIP_NO_IMAGES` IS NO LONGER DRAWN — "No pictures" replaced it on 9 October, to match the three
 * boxes' own word and because the chip now counts the two PICTURES rather than every slot. */
export const CHIP_NO_IMAGES = (n: number): string => gb('chipNoImages', { n })
export const CHIP_NO_PICTURES = (n: number): string => gb('chipNoPictures', { n })

export const POSTER_BOX_TITLE = gb('posterBoxTitle')
/** ⚠️ IT NAMES THE SHAPE, because a poster that is the wrong shape cannot be used and the truck needs
 *  the size BEFORE they export it, not after it is refused. */
export const posterBoxBlurb = (w: number | null, h: number | null): string =>
  w && h ? gb('posterBoxBlurbSized.withSize', { w: String(w), h: String(h) }) : gb('posterBoxBlurbSized.plain')

export const PICTURE_BOX_TITLE = gb('pictureBoxTitle')
export const PICTURE_BOX_BLURB = gb('pictureBoxBlurb')

/** The radio. ⛔ REQUIRED, and `weekly` is the default — the behaviour every row had before. */
export const PICTURE_USE_LABEL = gb('pictureUseLabel')
export const PICTURE_USE_WEEKLY = gb('pictureUseWeekly')
export const PICTURE_USE_EVENT = gb('pictureUseEvent')
export const PICTURE_USE_BOTH = gb('pictureUseBoth')

/** Shown when the picture is set to weekly/both and the weekly design draws no location picture. */
export const PICTURE_WEEKLY_OFF = gb('pictureWeeklyOff')
/** Shown when the picture is set to event/both and the single event design has no photo space. */
export const PICTURE_EVENT_NO_SPACE =
  gb('pictureEventNoSpace')
/* 🔴 ONE GREY LINE WHEN BOTH EXIST. A truck who has uploaded both and set the picture to event/both
 * would otherwise watch the picture not appear on event posts and have nothing to read about why. */
export const PICTURE_POSTER_WINS =
  gb('picturePosterWins')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SOCIAL MEDIA TAG
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const SOCIAL_TAG_LABEL = gb('socialTagLabel')
export const SOCIAL_TAG_HINT = gb('socialTagHint')
export const SOCIAL_TAG_PLACEHOLDER = gb('socialTagPlaceholder')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CAPTION EDITORS
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const CAPTION_WEEK_TITLE = gb('captionWeekTitle')
export const CAPTION_EVENT_TITLE = gb('captionEventTitle')
/* ⚠️ IT SAYS "used next time too", WHICH IS THE HALF AN OPERATOR WOULD NOT GUESS. "Saved" alone reads
 * as "saved for this post"; the whole point of a template is that it is not. */
export const CAPTION_SAVED_NOTE = gb('captionSavedNote')
export const CAPTION_SAVED_TICK = gb('captionSavedTick')
/** The "+" buttons' prefix. ⛔ The LABEL NAMES come from lib/weekly-post/caption-template.ts. */
export const captionAddLabel = (name: string): string => gb('captionAddLabel', { name })

/* 🔴 THE ONE LINE UNDER THE SHARE BUTTONS. ⛔ IT NAMES THE TWO APPS THAT REFUSE A CAPTION rather than
 * saying "some apps", because an operator whose caption did not arrive needs to know whether they did
 * something wrong — and on Facebook and Instagram they did not. */
export const SHARE_CAPTION_NOTE =
  gb('shareCaptionNote')


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
  gb('posterBoxBlurb')

export const PICTURE_BOX_BLURB_V3 =
  gb('pictureBoxBlurbV3')

/* ══ ⛔ THE OVERRIDE'S FOUR STRINGS ARE NO LONGER DRAWN — 9 OCTOBER 2026, LATER THE SAME DAY ════════
 * They were the opt-in link, the third box's title and blurb, and the "+1" badge on the table's picture
 * thumbnail. All four belonged to ONE picture plus an override; with a picture per surface there is
 * nothing to override and no badge to draw — the table has a column per slot instead.
 * ⚠️ `WEEKLY_ONLY_BOX_TITLE` WAS "Picture for weekly posts", WHICH IS NOW `WEEKLY_PIC_TITLE`'s
 * wording. That is not a coincidence: the override box was the right box with the wrong model behind
 * it, and the new shape is what it was reaching for. */
export const WEEKLY_ONLY_ADD_LINK = gb('weeklyOnlyAddLink')
export const WEEKLY_ONLY_BOX_TITLE = gb('weeklyOnlyBoxTitle')
export const WEEKLY_ONLY_BOX_BLURB = gb('weeklyOnlyBoxBlurb')

/* ⛔ "Name on posts" LEFT THIS SCREEN. It wrote `short_name`, which "Tidy up places" also writes — two
 * screens editing one column, and the other one edits the town beside it. ⚠️ THE NOTE NAMES THE REAL
 * PATH rather than saying "elsewhere": a pointer an operator cannot follow is a pointer that costs
 * them a search. */
export const NAME_FROM_SCHEDULE_NOTE =
  /* ⚠️ "area", NOT "town" — the same reason the editor's item was renamed: half the venues on this
   * product are in a village. The screen it points at calls the field "Area" too. */
  gb('nameFromScheduleNote')

/** The "+1" badge on a PICTURE thumbnail when a weekly-only override is also set. */
export const WEEKLY_ONLY_BADGE = '+1'

/* 🔴 THE UNSAVED-CHANGES CONFIRM. ⛔ IT IS A QUESTION, NOT A WARNING: "Leave without saving?" asks the
 * one thing the operator can answer, and the two buttons are the two answers in their own words rather
 * than OK and Cancel. */
export const LEAVE_CONFIRM_TITLE = gb('leaveConfirmTitle')
export const LEAVE_CONFIRM_STAY = gb('leaveConfirmStay')
export const LEAVE_CONFIRM_GO = gb('leaveConfirmGo')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DESIGN EDITOR'S THREE-COLUMN LAYOUT (9 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const EDITOR_LEFT_TITLE = gb('editorLeftTitle')
/** ⛔ An instruction, not a status: it says what to do rather than what is missing. */
export const EDITOR_NOTHING_SELECTED = gb('editorNothingSelected')
export const EDITOR_SETTINGS_FOR = gb('editorSettingsFor')
export const EDITOR_SECTION_TEXT = gb('editorSectionText')
export const EDITOR_SECTION_STAND = gb('editorSectionStand')
export const EDITOR_SECTION_MORE = gb('editorSectionMore')
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
  gb('editorMoreSummary')
/** The "All text" panel's — look only, because nothing per box is reachable from it. */
export const EDITOR_MORE_SUMMARY_ALL =
  gb('editorMoreSummaryAll')
/** A following box's — per box only, because its look lives on All text. */
export const EDITOR_MORE_SUMMARY_BOX =
  gb('editorMoreSummaryBox')

/* ══ 🔴 "All text" — THE WORDS, AND WHY EACH ONE IS THE WAY IT IS ══════════════════════════════════
 * ⛔ "All text" IS NOT A BOX AND MUST NOT READ LIKE ONE, so its subtitle says what pressing things in
 * it will do — "changes every box that matches" — rather than naming a thing on the poster.
 * ⚠️ "that matches" IS CARRYING WEIGHT: it is the one phrase that makes the amber note below it
 * expected rather than surprising. */
/* ══ ⚠️ "Style all the writing", NOT "All text" — §4, 10 October 2026 ═════════════════════════════
 * ⛔ "All text" IS A NOUN FOR A THING THE OPERATOR DOES NOT HAVE. They have writing on a poster; "all
 * text" is our name for the set of boxes that hold it. The button is an instruction now, and the
 * explanation that used to share its line has a grey line of its own. */
export const ALL_TEXT_ITEM = gb('allTextItem')
/* ⚠️ "change all the writing at once" — THE BRIEF'S OWN WORDS (§B9, 10 October 2026). "style every
 * text box at once" used "style" as a verb and "text box" as a noun an operator does not have: what
 * they have is writing on a poster. */
export const ALL_TEXT_SAMPLE = gb('allTextSample')
export const ALL_TEXT_TITLE = gb('allTextTitle')
export const ALL_TEXT_BLURB = gb('allTextBlurb')
/** 🔴 The blue note on a box that follows. ⚠️ It names the three things an operator looks for first. */
export const FOLLOW_NOTE = gb('followNote')
export const CHANGE_JUST_THIS = gb('changeJustThis')
/** The amber note on a box with its own look. */
export const OWN_STYLE_LABEL = gb('ownStyleLabel')
export const MATCH_ALL_AGAIN = gb('matchAllAgain')
export const USE_FOR_ALL_TEXT = gb('useForAllText')
/** ⚠️ The badge on an own-style box's button in the item grid. Three letters, lower case, not a word. */
export const OWN_BADGE = gb('ownBadge')
/* ⛔ `EDITOR_CLICK_TO_EDIT` IS NO LONGER DRAWN — 9 October 2026, §3. The grid's right-hand slot says
 * what the 🔗 means instead, which is a fact an operator cannot work out and "click to edit" is one they
 * can. Kept as the record of the wording. */
export const EDITOR_CLICK_TO_EDIT = gb('editorClickToEdit')

/* ══ 🔴 §3 · THE "LOOK" SWITCH — WHAT REPLACED THE TWO COLOURED NOTES ═════════════════════════════
 * ⛔ THE NOTES WERE A **STATE READOUT WITH A LINK IN IT**: blue "🔗 Same font, colour and effects as All
 * text · Change just this box", amber "Own style · Match All text again". So the thing you pressed to
 * change the state was buried inside the sentence describing it, and the two states looked like two
 * different components rather than two positions of one control.
 * 🔴 A TWO-WAY SWITCH SHOWS BOTH POSITIONS AT ONCE, which is what makes it obvious there is a choice at
 * all — and the grey line under it explains the position you are in rather than announcing it. */
export const LOOK_HEADING = gb('lookHeading')
export const LOOK_SAME = gb('lookSame')
export const LOOK_OWN = gb('lookOwn')
export const LOOK_SAME_HINT =
  gb('lookSameHint')
export const LOOK_OWN_HINT =
  gb('lookOwnHint')
/** 🔴 The right-hand slot of the grid's heading line, replacing "click to edit". */
export const EDITOR_LINK_LEGEND = gb('editorLinkLegend')
/** ⚠️ The 🔗 on a following text box's button. One glyph, no words — the legend above explains it. */
export const FOLLOW_GLYPH = '🔗'

/* ══ 🔴 §4 · EDIT / PREVIEW ═══════════════════════════════════════════════════════════════════════
 * ⚠️ THE HINT NAMES WHAT PREVIEW **DOES**, not what it is. "Preview" alone is a word an operator has to
 * press to understand, and pressing an unknown control on a design you have just spent ten minutes on
 * is something people do not do. */
export const EDITOR_PREVIEW_HINT = gb('editorPreviewHint')
/* ══ 🔴 §2 · THE ZOOM ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ "Fit to screen", NOT "Fit": it is a button now rather than the percentage's label, so it has room
 * to say what it does — and "Fit" on its own reads as a state. */
export const EDITOR_FIT_TO_SCREEN = gb('editorFitToScreen')

/* ══ 🔴 §5 · THE PORTRAIT ADVICE ══════════════════════════════════════════════════════════════════
 * ⚠️ THE TICK AND THE WORDS AFTER IT ARE GREEN, which is the brief's own instruction and is why the
 * suffix is one string: the size and shape before it stay grey, and splitting the colour mid-line needs
 * the green half to be its own element.
 * ⛔ THE TIP NAMES THE NUMBERS. "Use a portrait picture" is advice an operator cannot act on without a
 * second look; "1080 × 1350, 4:5" is advice they can take straight to Canva. */
export const BG_BEST_SUFFIX = gb('bgBestSuffix')
export const BG_PORTRAIT_TIP =
  gb('bgPortraitTip')
export const EDITOR_BACKGROUND_ITEM = gb('editorBackgroundItem')
export const EDITOR_ADD_OWN_TEXT = gb('editorAddOwnText')
/** ⚠️ "Location picture" everywhere — the single event design said "Location photo" until today. */
export const EDITOR_PICTURE_ITEM = gb('editorPictureItem')
export const EDITOR_PICTURE_SAMPLE = gb('editorPictureSample')

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
export const DAYS_ITEM = gb('daysItem')
export const DAYS_ICON = '☰'
export const DAYS_BLURB =
  gb('daysBlurb')
export const DAYS_QUICK_HEADING = gb('daysQuickHeading')
export const DAYS_QUICK_HINT = gb('daysQuickHint')
export const QL_ONE_LINE = gb('qlOneLine')
export const QL_DAY_ON_TOP = gb('qlDayOnTop')
export const QL_BIG_PICTURE = gb('qlBigPicture')
export const DAYS_PARTS_HEADING = gb('daysPartsHeading')
/* ⚠️ THE EXAMPLES BESIDE THREE OF THESE ARE **LIVE** — the design's own date wording, place wording
 * and clock — for the reason the item list's samples were live: a fixed "Mon 5th Oct" would be the one
 * thing on the screen that cannot be wrong and also cannot be right. The picture's is a rule, not an
 * example, because there is nothing to show until a location has one. */
export const PART_PICTURE_NAME = gb('partPictureName')
export const PART_PICTURE_EG = gb('partPictureEg')
export const PART_DAY_NAME = gb('partDayName')
export const PART_PLACE_NAME = gb('partPlaceName')
export const PART_TIMES_NAME = gb('partTimesName')
export const DAYS_PARTS_HINT =
  gb('daysPartsHint')
export const DAYS_OFF_HEADING = gb('daysOffHeading')
export const DAYS_OFF_MESSAGE = gb('daysOffMessage')
export const DAYS_OFF_OMIT = gb('daysOffOmit')
export const DAYS_OFF_TEXT_LABEL = gb('daysOffTextLabel')
export const DAYS_OFF_OMIT_HINT = gb('daysOffOmitHint')
export const DAYS_PICTURE_SHAPE = gb('daysPictureShape')
export const SHAPE_SQUARE = gb('shapeSquare')
export const SHAPE_ROUNDED = gb('shapeRounded')
export const SHAPE_CIRCLE = gb('shapeCircle')
export const DAYS_MORE_SUMMARY = gb('daysMoreSummary')

/* ══ 🔴 §B · THE EDITOR ═══════════════════════════════════════════════════════════════════════════
 * ⛔ "✎ Edit | 👁 Preview" IS GONE AFTER ONE ROUND, AND THE REASON IS WORTH KEEPING. It was a MODE:
 * the poster stayed where it was and the outlines disappeared, so the operator had to remember which
 * of two states they were in, and every other control on the screen silently changed meaning. A BUTTON
 * that opens the finished post over the top has no state to remember and no way to get stuck in. */
export const PREVIEW_POST_BTN = gb('previewPostBtn')
export const PREVIEW_POST_TITLE = gb('previewPostTitle')
export const PREVIEW_POST_HINT = gb('previewPostHint')
export const PREVIEW_POST_CLOSE = gb('previewPostClose')
export const PREVIEW_POST_WAIT = gb('previewPostWait')
/** 🔴 The right-hand slot of the grid heading. ⛔ It replaces the 🔗 legend, which §B9 removes. */
export const EDITOR_CLICK_ONE = gb('editorClickOne')
/* ══ 🔴 "Darken the picture" MOVES TO THE PICTURE (§B3) ═══════════════════════════════════════════
 * ⛔ IT WAS IN **MORE OPTIONS OF A TEXT BOX**, which is why it read as doing nothing: on a box that
 * follows All text that section does not contain it at all, so an operator who selected the Date and
 * opened MORE OPTIONS could not find it — and the one place it WAS reachable (All text › MORE OPTIONS,
 * and the weekly "Rows" item) is not where anybody looks for a setting about the PICTURE. It is a
 * whole-picture setting and it lives with the picture now. */
export const DARKEN_LABEL = gb('darkenLabel')
export const DARKEN_HINT = gb('darkenHint')
/** §B8 · shown only when the new picture is a different shape AND boxes actually moved. */
export const NEW_SHAPE_RESET =
  gb('newShapeReset')

/* ══ 🔴 §B10 · LEAVING THE EDITOR ═════════════════════════════════════════════════════════════════
 * ⛔ TWO BUTTONS WERE A FALSE CHOICE. "Leave" or "Keep editing" left the operator to work out that
 * saving first was a third thing they would have to do by hand — so the dialog that exists to protect
 * their work offered no way to keep it. */
export const LEAVE_TITLE = gb('leaveTitle')
export const LEAVE_BODY = gb('leaveBody')
export const LEAVE_SAVE_AND_GO = gb('leaveSaveAndGo')
export const LEAVE_WITHOUT_SAVING = gb('leaveWithoutSaving')

/* ══ 🔴 §C · THE SETTINGS FOR A SELECTED BOX, IN PLAIN WORDS ══════════════════════════════════════ */
export const SETTINGS_CLICKED = gb('settingsClicked')
/** ⛔ "LOOK" became "Style", and the two positions say what they DO rather than naming a state. */
export const STYLE_HEADING = gb('styleHeading')
export const STYLE_MATCH = gb('styleMatch')
export const STYLE_OWN = gb('styleOwn')
export const STYLE_MATCH_HINT = gb('styleMatchHint')
export const STYLE_OWN_HINT = gb('styleOwnHint')
/* ⚠️ "Shows" IS GONE FROM EVERY ITEM. It was one word standing in for four different questions, and
 * each one is now asked in full. ⛔ THE DATE'S LINE NAMES THE **OTHER** CHOICES, because a dropdown
 * whose closed state shows today's answer tells an operator nothing about what else is in it. */
export const LABEL_DATE_STYLE = gb('labelDateStyle')
export const LABEL_TIME_STYLE = gb('labelTimeStyle')
export const LABEL_PLACE_STYLE = gb('labelPlaceStyle')
export const LABEL_HEADING_TEXT = gb('labelHeadingText')
export const LABEL_OWN_TEXT = gb('labelOwnText')
export const OTHER_CHOICES = (samples: readonly string[]): string =>
  gb('otherChoices', { choices: samples.join(' · ') })
export const LABEL_TEXT_SIZE = gb('labelTextSize')
export const TEXT_SIZE_HINT = gb('textSizeHint')
export const LABEL_LINE_UP = gb('labelLineUp')
export const ALIGN_LEFT = gb('alignLeft')
export const ALIGN_CENTRE = gb('alignCentre')
export const ALIGN_RIGHT = gb('alignRight')
export const LABEL_LETTERS = gb('labelLetters')
export const LETTERS_BOLD = gb('lettersBold')
export const LETTERS_ITALIC = gb('lettersItalic')
export const LETTERS_CAPS = gb('lettersCaps')
/** ⛔ "MAKE IT STAND OUT" was a claim; this is the job. */
export const SECTION_EASIER_TO_READ = gb('sectionEasierToRead')
export const EFFECT_SHADOW = gb('effectShadow')
export const EFFECT_SHADOW_NONE = gb('effectShadowNone')
export const EFFECT_SHADOW_SOFT = gb('effectShadowSoft')
export const EFFECT_SHADOW_STRONG = gb('effectShadowStrong')
export const EFFECT_OUTLINE = gb('effectOutline')
export const EFFECT_BAND = gb('effectBand')
export const EFFECT_SEE_THROUGH = gb('effectSeeThrough')
export const EFFECT_AUTO = gb('effectAuto')
export const EFFECT_AUTO_HINT =
  gb('effectAutoHint')
export const MORE_SUMMARY_PLAIN =
  gb('moreSummaryPlain')
export const LABEL_LETTER_SPACE = gb('labelLetterSpace')
export const LABEL_TILT = gb('labelTilt')
export const LABEL_WORDS_BEFORE = gb('labelWordsBefore')
export const WORDS_BEFORE_HINT = gb('wordsBeforeHint')
export const LABEL_TOO_LONG = gb('labelTooLong')
export const TOO_LONG_SHRINK = gb('tooLongShrink')
export const TOO_LONG_TWO_LINES = gb('tooLongTwoLines')
export const LABEL_LINE_HEIGHT = gb('labelLineHeight')
export const LABEL_CENTRE_ON = gb('labelCentreOn')
export const CENTRE_ACROSS = gb('centreAcross')
export const CENTRE_UPDOWN = gb('centreUpdown')
export const LABEL_SHADOW_STRENGTH = gb('labelShadowStrength')
export const LABEL_OUTLINE_WIDTH = gb('labelOutlineWidth')
export const LABEL_BAND_CORNERS = gb('labelBandCorners')
export const LABEL_BAND_PADDING = gb('labelBandPadding')

/* ══ 🔴 "All text" › Text size — A NUMBER, NOT TWO NUDGE BUTTONS (10 October 2026) ═════════════════
 * ⛔ "Smaller | Bigger" MADE AN OPERATOR PRESS AND LOOK, PRESS AND LOOK, and never answered the
 * question they were asking: how big is my writing? ⚠️ THE LINE BELOW IS WHAT MAKES THE NUMBER HONEST
 * — a design's boxes are deliberately different sizes, so one number cannot be all of them, and what
 * this control does is move them together. */
export const ALL_TEXT_SIZE_HINT = gb('allTextSizeHint')

/* ══ 🔴 §3 (10 October 2026) · THE BACKGROUND PICTURE IS A SECTION, NOT A SELECTION ════════════════
 * ⛔ IT WAS AN ITEM YOU SELECTED, which made the one setting about the POSTER ITSELF the only one an
 * operator had to leave what they were doing to reach. ⚠️ THE 🖼 IS PART OF THE TITLE rather than a
 * separate icon: every other section heading is plain capitals, and one glyph is what marks this one
 * as being about the picture rather than about words.
 * ⚠️ THE SUMMARY NAMES ALL THREE THINGS INSIDE, because a folded section whose sign lists two of three
 * is a sign that sends somebody looking elsewhere for the third. */
export const BACKGROUND_SECTION = gb('backgroundSection')
export const BACKGROUND_SUMMARY = gb('backgroundSummary')

/* ══ 🔴 §6 (10 October 2026) · DELETING YOUR OWN TEXT ══════════════════════════════════════════════
 * ⚠️ "this text", NOT "this text box": a box is our word for it, and the thing the operator is looking
 * at is their own words on their own poster. ⛔ THE KEY IS NAMED BESIDE THE BUTTON rather than left to
 * be discovered — a shortcut nothing mentions is a shortcut nobody uses. */
export const DELETE_OWN_TEXT = gb('deleteOwnText')
export const DELETE_OWN_TEXT_KEY = gb('deleteOwnTextKey')

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
  gb('liveFontFallback')

/* ══ 🔴 §3 (10 October 2026) · LOCATION SETTINGS ON A PHONE ═══════════════════════════════════════
 *
 * ⛔ **THE PHONE CARDS CARRY THEIR OWN ONE-LINE DESCRIPTIONS, AND THAT IS NOT DUPLICATED COPY.** The
 * desktop boxes say the whole thing — *"A logo or photo in the picture space of your single event
 * design."* — because they have a 132px preview and a third of a pane to say it in. A 72px card on a
 * 390px screen has one line, and a truncated sentence is worse than a shorter one.
 * ⚠️ THEY ARE THE BRIEF'S OWN WORDS, verbatim, so the phone screen says what was asked for rather than
 * what I would have written. 🔴 ONE CONSTANT PER LINE, so the card and any check read the same string.
 */
export const PHONE_PIC_EVENT_LINE = gb('phonePicEventLine')
export const PHONE_PIC_WEEKLY_LINE = gb('phonePicWeeklyLine')
export const PHONE_PIC_POSTER_LINE = gb('phonePicPosterLine')

/** The way back from one location to the list. ⚠️ "All locations", not "Back": a back link should say
 *  where it goes, and this screen is reachable only from that list. */
export const PHONE_ALL_LOCATIONS = gb('phoneAllLocations')

/* ══ 🔴 §4 (10 October 2026) · THE PHONE DESIGN EDITOR ════════════════════════════════════════════
 *
 * ⚠️ THE BRIEF'S OWN WORDS, so the screen says what was asked for rather than what I would have
 * written. ⛔ ONE CONSTANT EACH, in the copy module, because the phone bar and the harness that checks
 * it must read the same string — a label typed twice is a label that drifts the first time it is
 * shortened.
 */
export const PHONE_EDIT_HINT =
  gb('phoneEditHint')
/** The item bar's labels. ⚠️ SHORT BY DESIGN: these sit under an icon in a 64px square. */
export const PHONE_ITEM_ALL_TEXT = gb('phoneItemAllText')
export const PHONE_ITEM_ADD_TEXT = gb('phoneItemAddText')
export const PHONE_ITEM_PICTURE = gb('phoneItemPicture')
/** The sheet's tab labels, in the brief's order. */
export const PHONE_TAB_WORDS = gb('phoneTabWords')
export const PHONE_TAB_SIZE = gb('phoneTabSize')
export const PHONE_TAB_STYLE = gb('phoneTabStyle')
export const PHONE_TAB_READABLE = gb('phoneTabReadable')
export const PHONE_TAB_MORE = gb('phoneTabMore')
export const PHONE_TAB_LAYOUT = gb('phoneTabLayout')
export const PHONE_TAB_ROW = gb('phoneTabRow')
export const PHONE_TAB_DAYS_OFF = gb('phoneTabDaysOff')
export const PHONE_TAB_PICTURE = gb('phoneTabPicture')
export const PHONE_TAB_DARKEN = gb('phoneTabDarken')
/** ⚠️ The sheet's close button, named for a screen reader as well as drawn. */
export const PHONE_SHEET_CLOSE = gb('phoneSheetClose')
