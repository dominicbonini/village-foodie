'use client'

// components/manage/SocialPosts.tsx — Schedule › Social posts.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 TWO AREAS, SIX BOXES, AND NOT ONE NEW WAY TO MAKE OR EDIT ANYTHING
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   Make a post  ·  Weekly post · Single event post · Post for a place
//   Designs      ·  Weekly post design · Single event post design · Designs for a place
//
// ⛔ EVERY BOX IS A DOOR, NOT A SCREEN. "Make this week's post" opens `WeeklyPostApp`'s post screen;
// every "Make post" opens `EventPostModal` — the SAME modal the Events list opens; "Edit weekly
// design" and "Edit event design" open `WeeklyPostApp`'s and `EventSetupScreen`'s existing setup
// screens; and the place design editor is `EventSetupScreen` focused on one place, so the drag surface
// whose pointer handling took three fixes exists exactly once in this product.
//
// 🔴 WHAT THIS FILE ADDS IS THE ANSWER TO "WHAT CAN I POST, AND WHAT WILL IT LOOK LIKE?" — which is a
// question nothing answered. Making a post for a pitch meant finding its event in a list of every
// event; giving a pitch its own picture meant a tab that no longer exists.
//
// ⚠️ ONE READ FOR THE WHOLE PAGE. `social_overview` on /api/weekly-post returns the two designs, the
// next six events and every place with ONE signed thumbnail URL each. ⛔ THE ALTERNATIVE WAS A LOOP:
// the only action that signed a place's picture was `event_load`, which also reads up to 200 events in
// each direction — twenty-one copies of that to draw twenty-one 64px squares.
//
// ⚠️ THE PRIVACY RULE IS THE SERVER'S. A private event arrives with `isPrivate: true` and no venue, no
// town and no place; it is drawn greyed, in its date position, with no button. A place's `next` is its
// next PUBLIC event, because that is the event its button would post. Nothing here decides any of that.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
/* ⛔ `Btn` IS NO LONGER IMPORTED (6 October 2026). Its `colour` palette is the dashboard's, where
 * orange is the ordinary button; on this screen orange MEANS "make something" and nothing else, so the
 * two shapes are `BTN_PRIMARY` and `BTN_OUTLINE` below and there are exactly two primaries. */
import { Card, Input, Spinner } from '@/components/manage/primitives'
/* 🔴 THE ONE TIME-RANGE FORMATTER. See the tombstone where this file had its own. */
import { WeeklyPostApp } from '@/components/manage/WeeklyPost'
import { MAX_UPLOAD_BYTES } from '@/lib/weekly-post/layout'
/* ── 8 October 2026: where a location's picture is used, and the caption labels. */
/* ⛔ `pictureOnWeekly` / `pictureOnEvent` ARE GONE — a location picture is used wherever a design has
 * a space for it, so there is no "is this surface allowed?" left to ask. `PictureUse` goes with them. */
import {
  labelsFor,
  /* 🔴 §5 · THE CAPTION IS FILLED **ON THIS SCREEN** (9 October 2026). ⛔ These are the SAME two pure
   * functions `event_post` uses on the server, so the caption on the card and the caption the modal
   * would have written cannot drift — which is the only reason filling it here is safe. ⚠️ Filling it
   * here is what makes "pick another event" refresh the caption with no round trip. */
  fillCaptionTemplate, eventCaptionValues,
  type CaptionKind, type CaptionLabelId,
} from '@/lib/weekly-post/caption-template'
/* ══ 🔴 THE CHIP EDITOR'S DOM OPERATIONS (10 October 2026) ═════════════════════════════════════════
 * ⚠️ A SEPARATE MODULE BECAUSE **DELETING A CHIP CLEARED THE WHOLE TEMPLATE IN WEBKIT** and the fix
 * has to be drivable in a real browser. See that file's header. ⛔ IT TOUCHES `window` AND `document`,
 * so it belongs to this client component and must never be imported by a route. */
import {
  captionChipHtml, captionHtml, captionFromDom, handleChipDeleteKey, selectionAsTemplate,
  hasCaptionToken,
} from '@/lib/weekly-post/caption-chips'
/* ⛔ `WRONG_SHAPE_NOTE` IS NO LONGER IMPORTED. It was the per-picture badge on the library grid —
 * "Different shape — can't be used as a whole background". The Locations screen says the rule on the
 * BOX instead, with the required size in it (`EVENT_BOX_POSTER_SHAPE`), because a truck needs the
 * size before they export a poster rather than after it is refused. The constant is still exported
 * and still drives `scripts/place-pictures.cjs`. */
import { EventSetupScreen, EventPostModal, renderPng } from '@/components/manage/EventPost'
import { FeatureGate } from '@/components/FeatureGate'
import { WEEKLY_POST_PLAN_REFUSAL } from '@/lib/copy/weeklyPost'
import type { Plan } from '@/lib/features'
/* ══ ⛔ ELEVEN COPY CONSTANTS LEFT THIS IMPORT — 7 October 2026 ════════════════════════════════════
 * They belonged to the pictures library page and to "Post for a place", both of which are gone:
 * `PLACE_POST_BOX_BLURB`, `PLACE_POST_FOOTER_NOTE`, `PLACE_PICTURES_TITLE`/`_BLURB`/
 * `_NONE_HEADING`/`_SOME_HEADING`/`_PAGE_LINE`, `picturesCount`, `PLACE_OWN_POSITIONS_LINK`,
 * `removePictureConfirm`, `placePicturesFooter`, `placeDesignScope`, `standardDesignConfirm` and
 * `USE_STANDARD_LINK`.
 * ⚠️ THEY ARE STILL **EXPORTED** FROM lib/copy/socialPosts.ts AND THAT IS DELIBERATE: three harnesses
 * assert on them by name, and `scripts/place-pictures.cjs` drives the rules they describe. Deleting a
 * copy constant is a separate change from deleting the screen that read it, and a dead export with no
 * reader is cheaper than a harness that cannot find its subject. Named in docs/social-tab-report.md. */
import {
  MAKE_POST_FOOTNOTE, WEEKLY_BOX_BLURB, EVENT_BOX_BLURB, PRIVATE_EVENT_ROW,
  WEEKLY_DESIGN_BLURB,
  EVENT_DESIGN_TITLE, EVENT_DESIGN_BLURB_BEFORE, EVENT_DESIGN_BLURB_BOLD, EVENT_DESIGN_BLURB_AFTER,
  EVENT_DESIGN_BUTTON_NEW, EVENT_DESIGN_BUTTON_EDIT,
  /* ⛔ `INTRO_DESIGNS_WORD` / `INTRO_MAKE_WORD` / `INTRO_AFTER_DESIGNS` / `INTRO_AFTER_MAKE` ARE NO
   * LONGER IMPORTED — the shared intro they built is gone (8 October 2026). They are still exported
   * from the copy module, which three harnesses read by name. */
  TAB_CREATE_HEADING, TAB_CREATE_BLURB, TAB_DESIGNS_HEADING, TAB_DESIGNS_BLURB,
  TAB_LOCATIONS_HEADING, TAB_LOCATIONS_BLURB, LOCATIONS_CARD_TITLE,
  /* ⛔ `POSTER_BOX_TITLE` ("Event poster (optional)") IS NO LONGER IMPORTED — §1 renames the box to
   * "Location poster (optional)", because "Event poster" sat one word away from "Picture for event
   * posts" while being a different thing. It stays exported as the record. */
  LOCATION_POSTER_TITLE,
  /* ── 9 October 2026: THREE pictures, one per job. ⛔ NINE CONSTANTS ARE NO LONGER IMPORTED and all
   * nine stay EXPORTED, because harnesses read them by name and they are the record of the wording:
   * `PICTURE_BOX_TITLE` / `PICTURE_BOX_BLURB` / `PICTURE_BOX_BLURB_V3` (the single "Location picture"
   * box), `WEEKLY_ONLY_ADD_LINK` / `_BOX_TITLE` / `_BOX_BLURB` / `_BADGE` (the override and its "+1"),
   * the four `PICTURE_USE_*` (the retired "Use it on" radios) and `posterBoxBlurb` (the size sentence
   * the poster description lost). */
  POSTER_BOX_BLURB, NAME_FROM_SCHEDULE_NOTE,
  /* ⛔ `LEAVE_CONFIRM_TITLE` AND `LEAVE_CONFIRM_GO` ARE NO LONGER DRAWN — §B10 replaced the two-button
   * dialog with a three-button one, and its title asks the question the third button answers. Both stay
   * exported as the record of the wording. */
  LEAVE_CONFIRM_STAY, LEAVE_TITLE, LEAVE_BODY, LEAVE_SAVE_AND_GO, LEAVE_WITHOUT_SAVING,
  SOCIAL_TAG_LABEL, SOCIAL_TAG_HINT, SOCIAL_TAG_PLACEHOLDER,
  CAPTION_WEEK_TITLE, CAPTION_EVENT_TITLE, captionAddLabel,
  /* ⛔ `CAPTION_SAVED_NOTE` AND `CAPTION_SAVED_TICK` ARE NO LONGER IMPORTED. The template editor is
   * Save / Cancel now rather than debounced autosave, so "Saved automatically" and its fading tick
   * describe behaviour the screen no longer has. Both stay exported as the record. */
  CREATE_FOR_NEXT, CREATE_FOR_THIS,
  CAPTION_HEADING, CAPTION_THIS_POST_NOTE, EDIT_TEMPLATE_LINK,
  TEMPLATE_PANEL_TITLE, TEMPLATE_PANEL_BLURB, TEMPLATE_PANEL_BLURB_WEEK,
  TEMPLATE_SAVE, TEMPLATE_CANCEL, TEMPLATE_PANEL_NOTE,
  /* ⛔ `WEEKLY_DESIGN_USED_FOR`, `EVENT_DESIGN_USED_FOR` AND `USED_FOR_LABEL` ARE NO LONGER IMPORTED —
   * see the `UsedFor` tombstone below. The constants remain in the copy module as the record. */
  EMPTY_WEEKLY_TITLE, EMPTY_EVENT_TITLE, EMPTY_BODY, EMPTY_BUTTON,
  /* ── 7 October 2026: Create a post's two halves, and the Locations sub-tab. */
  CREATE_WEEKLY_TITLE, CREATE_EVENT_TITLE, weekEventsLine, CREATE_WEEKLY_BUTTON,
  /* ⛔ `NEXT_EVENT_HEADING`, `createPostForLabel` AND `MORE_EVENTS_LABEL` ARE NO LONGER IMPORTED —
   * 9 October 2026, §5. The heading is `NEXT_EVENT_HEADING_V4` ("YOUR NEXT EVENT"); the button no
   * longer names the date, because the card above it already shows which event it is about; and the
   * expander is "Show all upcoming events (n) ⌄" over a list the first three of which are always
   * visible. All three stay exported as the record of the wording. */ NO_UPCOMING_EVENTS, imageSourceLine,
  LOCATIONS_SEARCH_LABEL, CHIP_ALL, CHIP_HIDDEN,
  COL_LOCATION, LOCATIONS_NONE, LOCATIONS_NO_MATCH, LOCATIONS_PICK_ONE,
  COL_POSTER, COL_WEEKLY, COL_EVENT, CHIP_NO_PICTURES,
  WEEKLY_PIC_TITLE, WEEKLY_PIC_BLURB, EVENT_PIC_TITLE, EVENT_PIC_BLURB,
  DROP_A_PICTURE, DROP_A_POSTER, USE_EVENT_PICTURE, USE_WEEKLY_PICTURE,
  /* ⛔ ELEVEN MORE COPY CONSTANTS LEFT THIS IMPORT ON 8 OCTOBER, with the wording they carried:
   * `LOCATIONS_TITLE`/`_BLURB` (the card's description, now the page's), `CHIP_MISSING` ("Missing
   * images", now "No images"), the four `EVENT_BOX_PHOTO_*`/`_POSTER_*` pairs and
   * `EVENT_BOX_POSTER_SHAPE`/`_ADD_PHOTO_SPACE` (the event box's wording used to follow the DESIGN —
   * it does not any more), and `WEEKLY_BOX_TITLE`/`_BLURB_LOC`/`WEEKLY_USE_EVENT_IMAGE`/
   * `WEEKLY_NOT_ON_LINE` (the weekly box became the LOCATION PICTURE box with its own radio).
   * ⚠️ THEY ARE STILL **EXPORTED** AND THAT IS DELIBERATE: harnesses assert on them by name, and a dead
   * export with no reader is cheaper than a harness that cannot find its subject. */
  /* ⛔ `SLOT_REPLACE` AND `SLOT_EMPTY` ARE NO LONGER IMPORTED. "Replace" was a second button that did
   * what dropping a file does, and "Nothing yet" was the empty tile's text — the empty box says "Drop a
   * picture here" instead, which is an instruction rather than a status. Both stay exported. */
  SLOT_UPLOAD, SLOT_REMOVE, slotRemoveConfirm,
  /* ⚠️ §3 · THE PHONE SCREEN'S OWN LINES AND ITS BACK LINK — see their notes in the copy module for
   * why the cards do not reuse the desktop blurbs. */
  PHONE_PIC_EVENT_LINE, PHONE_PIC_WEEKLY_LINE, PHONE_PIC_POSTER_LINE, PHONE_ALL_LOCATIONS,
} from '@/lib/copy/socialPosts'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SHAPES `social_overview` ANSWERS WITH
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** One event, as the page draws it. ⛔ A private one carries no location of any kind — see the route. */
export interface PostEvent {
  id: string
  date: string
  startTime: string | null
  endTime: string | null
  isPrivate: boolean
  venue: string | null
  town: string | null
  placeId: string | null
  /** Which design this post WILL use. `own` only when the place has a picture of its own. */
  design: 'own' | 'standard' | 'none'
  /* ══ 🔴 WHICH IMAGE THIS POST WILL USE, AND WHAT KIND IT IS (7 October 2026) ═══════════════════
   * `design` says WHOSE; this says WHAT, and the two are not the same question. A location's event
   * image is a PHOTO cropped into a space when the single event design has one, and the WHOLE POSTER
   * when it has not — decided by the design, resolved on the server (`eventImageMode`). The grey line
   * under "Your next event" names it, because it is the one thing a 96px thumbnail cannot show. */
  imageSource?: 'place-photo' | 'place-poster' | 'standard' | 'none'
  /** The name the poster would print — `short_name` first, as `locationName` resolves it. */
  placeName?: string | null
}

/** One of a location's two images, as the Locations screen draws it. */
export interface SlotImage {
  id: string
  url: string | null
  width: number | null
  height: number | null
  fileName: string
  /** 🔴 True for an image mapped from the legacy `event_bg_*` columns — it has no row yet. */
  legacy: boolean
}

export interface PostPlace {
  id: string
  name: string
  shortName: string | null
  area: string | null
  isFavourite: boolean
  /** 🔴 Whether this location is hidden. The table shows it only under the "Hidden n" chip. */
  isHidden?: boolean
  /* ══ 🔴 THE LOCATION'S **TWO** IMAGES — THE WHOLE MODEL, ON THE WIRE ═══════════════════════════
   * ⚠️ EITHER MAY BE NULL AND BOTH MAY BE THE **SAME** PICTURE. The `event` one falls back to the
   * legacy `event_bg_*` mapping on the server, which is how a location nobody has touched still draws
   * what it draws today. See lib/weekly-post/place-pictures.ts. */
  /** 🔴 The EVENT POST picture — the single event design's picture space. ⚠️ No fallback to weekly. */
  eventPhotoImage?: SlotImage | null
  /* ⚠️ `eventImage` IS THE **EVENT POSTER** AND `weeklyImage` IS THE **LOCATION PICTURE** (8 October
   * 2026). The payload keys kept their names for the same reason the columns did — a rename is a
   * breaking change to every reader for a word — and the screen names them properly. */
  eventImage?: SlotImage | null
  weeklyImage?: SlotImage | null
  /* ⛔ `weeklyOnlyImage` IS GONE FROM THIS SHAPE — 9 October 2026. It was an opt-in override weekly
   * posts used instead of the one location picture; with a picture PER SURFACE there is nothing left
   * to override, and 20261022 moved every stored value into `weekly_picture_id` and emptied the
   * column. The server no longer sends the key. */
  /* ⛔ `pictureUse` IS GONE FROM THIS SHAPE — 9 October 2026. The column stays and is no longer read;
   * a location picture is used wherever a design has a space for it. */
  /** 🔴 This location's social handle, for the `{location-tag}` caption label. Never for a private. */
  socialTag?: string | null
  /** ⚠️ THE OLD SINGLE-PICTURE FLAG — `truck_places.event_bg_path`. Kept because the event design
   *  still renders from it; it is NOT the library's count. See `pictureCount`. */
  hasPicture: boolean
  /** A short-lived signed URL, from the ONE read. Null when the place has no picture of its own. */
  imageUrl: string | null
  /** 🔴 HOW MANY PICTURES THIS PLACE'S LIBRARY HOLDS (part 3), from the one batched read. */
  pictureCount: number
  /** The Main picture's signed thumbnail, from the same read. ⚠️ Never a public URL. */
  mainUrl: string | null
  mainLabel: string | null
  width: number | null
  height: number | null
  ownPositions: boolean
  /** The next PUBLIC event here, or null. */
  next: PostEvent | null
  upcoming: PostEvent[]
}

interface Overview {
  /** 🔴 Whether the truck has a logo we could draw — decides whether "Show your logo" is offered. */
  hasLogo?: boolean
  weekly: {
    ready: boolean
    previewUrl: string | null
    /** The design's own pixel size, so the preview tile is drawn in its shape rather than a guess. */
    width: number | null
    height: number | null
    /* ⚠️ `privateEvents` IS COUNTED SEPARATELY AND `events` IS THE **PUBLIC** TALLY. "4 events · 1
     * private event left out" would contradict itself if the first number included the second. */
    /** 🔴 §6 · `caption` IS THE FINISHED weekly caption for that week, filled on the server with the
     *  same two functions the weekly Make screen uses. ⚠️ Optional, so a payload from before this
     *  existed falls back to the template rather than to an empty box. */
    thisWeek: { start: string; end: string; events: number; privateEvents?: number; caption?: string }
    nextWeek: { start: string; end: string; events: number; privateEvents?: number; caption?: string }
    defaultWeek: 'this' | 'next'
  }
  standard: {
    ready: boolean; previewUrl: string | null; width: number | null; height: number | null
    /** 🔴 Whether the single event design has a photo space — which decides whether a location's event
     *  image is a photo in a box or the whole poster, and therefore what the Locations screen asks for. */
    photoSpace?: boolean
  }
  /** 🔴 Whether the weekly design draws a location picture at all. The Locations pane says so. */
  weeklyPictureOn?: boolean
  /* 🔴 THE TWO SAVED CAPTION TEMPLATES, seeded on read. ⚠️ `saved` is false when the server is
   * returning the seed rather than a stored row — so a "Saved ✓" tick cannot appear over a caption
   * nobody has saved. */
  captions?: {
    week: { template: string; saved: boolean }
    event: { template: string; saved: boolean }
  }
  /** 🔴 §5 · The three per-truck facts the screen needs to fill a template itself. See the route. */
  captionBits?: { orderUrl: string | null; timeStyle: '12h' | '24h'; country?: string }
  upcoming: PostEvent[]
  places: PostPlace[]
}

/**
 * ══ 🔴 THREE AREAS, AND IT IS A TOP TAB NOW (7 October 2026) ══════════════════════════════════════
 * `'posts' | 'designs'` until 6 October, as a pill inside Schedule. Social media is its own top tab
 * with three pills of its own, drawn by the page's shared sub-tab bar rather than by this component.
 * ⚠️ THE IDS ARE THE URL'S (`?tab=social&section=create|designs|locations`), resolved by
 * `resolveManageLocation` in lib/manage-links.ts, which also maps the four retired Schedule ids onto
 * them so no live bookmark lands on Billing or Events.
 */
export type SocialArea = 'create' | 'designs' | 'locations'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SMALL SHARED PIECES
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** "Tue 13 Oct" — built from the 'YYYY-MM-DD' PARTS, never `new Date(str)`, which on a date-only value
 *  is UTC midnight and renders as the previous day west of here. */
export function shortDate(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

/* ⛔ `timeLabel` WAS A SECOND TIME FORMATTER (6 October 2026). It wrote `17:00–20:00` with no spaces
 * around the dash while the rest of the product writes `17:00 – 20:00`, through `formatTimeRange` —
 * whose own note says "use this everywhere a start–end pair is shown so no surface re-introduces
 * seconds (the recurring bug)". This surface was the next one to re-introduce it. */

/* ══ 🔴 THE COLOUR BAR SAYS WHICH DESIGN THE POST WILL USE ═══════════════════════════════════════
 * It is the one thing an operator cannot otherwise tell before pressing the button.
 * ⛔ IT IS 4px AND FULL ROW HEIGHT (6 October 2026). It was `h-8 w-1` — a 4px stub floating beside a
 * taller row, which read as a bullet rather than as the row's own marker.
 * ⚠️ DARK NAVY FOR STANDARD, NOT GREY. Grey on white at 4px is invisible at arm's length on a laptop,
 * and "which design" is the question the bar exists to answer.
 * ⚠️ A PRIVATE ROW HAS NO BAR AT ALL, because it has no post — `none` is transparent and keeps the
 * row's text aligned with the ones above and below it. */
/* ⛔ `DESIGN_BAR` IS GONE — 7 October 2026. It was the coloured spine on each row of the old flat
 * six-event list, saying which design that post would use. The right half of Create a post says it in
 * WORDS now, under the next event, and names the location — which is what an operator can act on. A
 * 4px colour that needed a legend nobody had was the weaker half of that answer. */

/* ══ 🔴 A BOX HEADING IS A HEADING, NOT A LABEL (6 October 2026) ══════════════════════════════════
 * ⛔ IT WAS `SUBCARD_HEADING` — `text-xs font-black uppercase tracking-widest`. That treatment is for
 * a label ABOVE a group of controls; on a card that is one of three choices it made the three boxes
 * read as three form sections rather than as three things you can do. Bold, title case, 17px, dark.
 * ⚠️ ASSERTED BY scripts/social-posts-render.cjs AS A COMPUTED `text-transform: none`, which is the
 * only way to tell a title-case string from an uppercased one after the browser has had it. */
const BOX_HEADING = 'text-[17px] font-bold leading-tight text-slate-900'

/** The description line, directly under the heading. */
const BOX_BLURB = 'mt-1 text-sm text-slate-500'

/* ══ 🔴 BUTTON HIERARCHY: ORANGE MEANS "MAKE SOMETHING" ══════════════════════════════════════════
 * ⛔ AND NOTHING ELSE. Two orange buttons in this product now: "Make this week's post" and "Make post
 * for <date>" in the place editor. Every per-row Make post, every Edit, and "Give own design" are
 * OUTLINED — white, grey border, dark text.
 * 🔴 WHY IT MATTERS ON THIS SCREEN IN PARTICULAR: an operator scanning six boxes should be able to see
 * where the irreversible-ish act is. Fourteen orange buttons on one page is no hierarchy at all.
 * ⚠️ `scripts/social-posts-render.cjs` COUNTS THE ORANGE ONES and names which ids may be orange. */
const BTN_PRIMARY =
  'inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50'
const BTN_OUTLINE =
  'inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
/* ⛔ `BTN_OUTLINE_ORANGE` IS GONE WITH "Designs for a place" (7 October 2026). It was the orange row
 * button on the locations that had no picture yet — the half of that list an operator could act on.
 * The Locations table has no row buttons at all: a row selects, and the acting is in the pane. */

/* ══ 🔴 ONE GRID, USED BY CREATE A POST **AND** DESIGNS (8 October 2026) ═══════════════════════════
 * ⛔ THEY WERE TWO DIFFERENT GRIDS AND IT SHOWED. Create a post was two equal halves across the full
 * content width; Designs was `minmax(200px,320px) minmax(200px,320px) minmax(0,1fr)` — two narrow
 * columns and an empty third track left over from the box that used to sit in it. So the two screens
 * an operator switches between with one click laid their boxes out at different widths, and the
 * pictures in the narrower one were smaller for no reason anybody could name.
 * 🔴 ONE CONSTANT, NOT TWO COPIES OF THE SAME STRING. A shared breakpoint written twice is a shared
 * breakpoint until someone edits one of them.
 * ⚠️ `min-[900px]:` IS MEASURED, NOT INHERITED: a 16in MacBook Pro in Safari with a normal window is
 * 1000–1100px, which is the machine this is used on, so `lg:` (1024) stacked it on a laptop. */
export const TWO_HALVES_GRID = 'grid grid-cols-1 items-stretch gap-3 min-[900px]:grid-cols-2'

/** A box on either area. ⚠️ `min-w-0` on every one: a grid column will not shrink below its content
 *  without it, and one long venue name would then push the whole page sideways. */
function Box({ title, blurb, children, className = '' }: {
  title: string
  /** The description line. ⚠️ It belongs to the HEADING, so it is a prop rather than the first child —
   *  that is what keeps the gap between them the same in all six boxes.
   *  ⚠️ A NODE, NOT A STRING, because one of the six has two bold words in it. */
  blurb?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={`flex min-w-0 flex-col p-4 ${className}`}>
      <p className={BOX_HEADING}>{title}</p>
      {blurb && <p className={BOX_BLURB}>{blurb}</p>}
      <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </Card>
  )
}

/**
 * ══ 🔴 ONE EMPTY STATE, THE SAME IN EVERY BOX THAT CANNOT WORK YET (6 October 2026, Dominic) ══════
 *
 * ⛔ THERE WERE THREE DIFFERENT ANSWERS TO ONE SITUATION. With no design the weekly box relabelled its
 * orange button, boxes 2 and 3 showed a grey line and left their Make post buttons greyed, and the
 * lists underneath went on listing events nobody could post. Three treatments of "you have not
 * uploaded a picture yet" is three things for an operator to work out, and the greyed buttons were the
 * worst of them: a disabled control is a promise that it will work under some condition the screen
 * does not name.
 * 🔴 THIS REPLACES THE BOX'S BODY AND NOTHING ELSE. The heading and the description stay, which is
 * what makes it read as "not yet" rather than "not available".
 * ⚠️ `flex-1` AND `items-center justify-center`, so the panel fills the box and the three boxes stay
 * the same height whichever of them are empty.
 * ⛔ NO ORANGE. Orange means "make something", and making something is the one thing this box cannot
 * do; the button that leaves is outlined like every other button that goes somewhere.
 */
function EmptyBox({ title, onGo }: { title: string; onGo: () => void }) {
  return (
    <div data-empty-box
      className="flex min-h-[9rem] flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="max-w-[20rem] text-sm text-slate-500">{EMPTY_BODY}</p>
      <button type="button" className={`${BTN_OUTLINE} mt-1`} onClick={onGo}>{EMPTY_BUTTON}</button>
    </div>
  )
}

/**
 * The "Used for:" panel under a design's picture.
 *
 * ⛔ IT ANSWERS THE QUESTION THE TWO DESIGN BOXES COULD NOT. They are two pictures with almost
 * identical descriptions; what tells them apart is not what is ON them, it is which posts USE them.
 */
/* ══ ⛔ TOMBSTONE · `UsedFor` — REMOVED 9 OCTOBER 2026 ════════════════════════════════════════════
 * It drew a grey panel under each design's tile: **Used for:** "the weekly post only." on one and
 * "every post about a single event." on the other.
 * 🔴 THE BRIEF REMOVES BOTH LINES, and the reason they can go is that the box titles now carry the
 * same fact: "Weekly post design" and "Single event post design" say what each is for in their own
 * names. A sentence under each saying it again was the same information twice on one card — and it was
 * the taller half of the two boxes, on a screen where the design tiles are what an operator reads.
 * ⚠️ THE CONSTANTS STAY IN lib/copy/socialPosts.ts WITH THEIR OWN NOTE, unreferenced, because they are
 * the record of what the wording was. */
/**
 * ══ 🔴 THE TILE SHOWS THE **POST**, NOT THE BLANK IT IS DRAWN ON (10 October 2026) ════════════════
 *
 * ⛔ **DOMINIC: "the images should be populated with the selected or next event data."** The tile was
 * the design's background picture — the blank, with no date, no venue and no time on it — so the one
 * thing it could not show was the post the operator is about to make. Two events at the same location
 * produced the same tile.
 *
 * 🔴 IT RENDERS THROUGH `renderPng`, THE SAME HELPER THE POST MODAL USES, with the same
 * `event_render` action — so the tile and the post cannot disagree about what is being made.
 * ⚠️ **CACHED PER EVENT AND CANCELLED ON CHANGE.** Picking along the list must not queue a render per
 * keypress, and an answer that arrives after the operator has moved on must not overwrite the one they
 * are looking at. ⛔ THE OBJECT URLS ARE REVOKED on unmount — a blob per event left behind is a leak on
 * a screen an operator flicks through.
 * ⚠️ THE BLANK IS THE PLACEHOLDER WHILE IT LOADS, not a spinner on its own: the shape and the artwork
 * are already right, so the tile settles rather than appearing.
 */
/** ⚠️ A sentinel in the same map as the URLs — one lookup answers "done?" and "did it work?". */
const FAILED = 'failed'

function PostTile({ token, kind, eventId, week, fallbackUrl, w, h }: {
  token: string
  /** 🔴 Which post to draw. ⚠️ PRIMITIVES, NOT AN OBJECT: the effect's deps have to be stable, and an
   *  object literal prop is a new identity on every render of the parent. */
  kind: 'event' | 'week'
  eventId?: string | null
  week?: 'this' | 'next'
  /** The design's own picture — shown until the post arrives, and if it cannot be made. */
  fallbackUrl: string | null
  w: number | null
  h: number | null
}) {
  /** ⚠️ ONE MAP FOR BOTH KINDS, so the key has to name the kind as well as the thing. */
  const key = kind === 'event' ? (eventId ? `e:${eventId}` : null) : `w:${week ?? 'this'}`
  /* 🔴 eventId → the post's object URL, or `'failed'`. ⛔ **STATE, NOT A REF, AND BOTH HALVES OF THAT
   * ARE THIS FILE'S LINT RULES RATHER THAN A PREFERENCE.** `react-hooks/set-state-in-effect` refuses a
   * `setState` called synchronously inside an effect, so nothing may be set before the fetch; and the
   * React Compiler refuses a ref READ during render, so the answer cannot be derived from one either.
   * A map in state, written only after the await, satisfies both.
   * ⚠️ KEYED BY EVENT, so flicking back to one already seen is instant and costs no second render. */
  const [byKey, setByKey] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!key || byKey[key]) return
    let alive = true
    ;(async () => {
      try {
        /* 🔴 NO `background` AND NO `layout` — which is the MODAL'S OWN CASE: the route's note calls
         * it "sends neither, and gets exactly what `eventPostContext` resolved". ⛔ `'auto'` IS NOT A
         * VALUE IT TAKES (`'event' | 'place' | 'default'`); sending one would force a background the
         * operator never chose. The server's own resolution is what the grey line under this tile
         * already describes. */
        const r = kind === 'event'
          ? await renderPng(token, { action: 'event_render', eventId })
          /* ⚠️ THE WEEKLY POST NEEDS NO `layout` EITHER — the route falls back to the SAVED design and
           * loads that week's real events, which is exactly the post the button below makes. */
          /* ⚠️ `showPrivate: true` SO THE TILE IS THE POST THE BUTTON MAKES. The make-post screen
           * defaults to showing them (see `WeeklyPostApp`), and a thumbnail that left them out would
           * show a different week from the one about to be published. */
          : await renderPng(token, { action: 'render', week: week ?? 'this', showPrivate: true })
        /* ⚠️ A RENDER THAT LANDS AFTER THE OPERATOR HAS MOVED ON IS THROWN AWAY **AND REVOKED** — an
         * orphaned blob is a leak on a screen people flick through. */
        if (!alive) { URL.revokeObjectURL(r.url); return }
        setByKey(m => ({ ...m, [key]: r.url }))
      } catch {
        /* ⚠️ A FAILED RENDER IS NOT AN ERROR ON THIS SCREEN. The tile falls back to the design's own
         * picture, which is what it showed before this existed; the operator's way forward is the
         * button below it, and the modal reports the real problem if there is one. ⛔ IT IS RECORDED,
         * so a design that cannot render is not retried on every pass through this effect. */
        if (alive) setByKey(m => ({ ...m, [key]: FAILED }))
      }
    })()
    return () => { alive = false }
  }, [token, kind, eventId, week, key, byKey])

  /* ⛔ REVOKED ON UNMOUNT ONLY — revoking per change would free the URL the map is still handing out.
   * ⚠️ THROUGH A REF WRITTEN BY AN EFFECT, because a cleanup that closed over `byEvent` would capture
   * whichever version it was created with and leak every blob added after it. Reading a ref in a
   * cleanup is not reading one during render. */
  const latest = useRef<Record<string, string>>({})
  useEffect(() => { latest.current = byKey }, [byKey])
  useEffect(() => () => {
    for (const u of Object.values(latest.current)) if (u !== FAILED) URL.revokeObjectURL(u)
  }, [])

  const entry = key ? byKey[key] : undefined
  const url = entry && entry !== FAILED ? entry : null
  const busy = !!key && entry === undefined

  return (
    <div className="relative" data-post-tile={kind}>
      <DesignTile url={url ?? fallbackUrl} w={w} h={h} />
      {busy && !url && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </div>
  )
}

function DesignTile({ url, w, h }: { url: string | null; w: number | null; h: number | null }) {
  /* 🔴 A FIXED HEIGHT AND A DERIVED WIDTH, not `aspect-ratio` on a full-width box. Three boxes in a
   * row are different widths; a width-driven aspect ratio would make the three previews three
   * different heights, which is the thing this is here to stop.
   *
   * ══ ⛔ AND THE WIDTH IS CAPPED, BECAUSE A LANDSCAPE DESIGN BURST OUT OF ITS BOX (6 Oct 2026) ══════
   * REPORTED BY DOMINIC: the event post design stretched past the edge of its card. With a fixed
   * height and NO cap, a 1920×1080 design is 220 × 391px — and the column it sits in is between 200
   * and 320px wide. Every design I had measured was portrait, so the fixture never produced a tile
   * wider than its box and the harness could not see it.
   * 🔴 SO THE HEIGHT IS THE TARGET, NOT THE RULE: 220px tall unless that would make it wider than
   * `MAX_W`, in which case the WIDTH caps and the height follows the ratio down. A 4:5 design is
   * exactly 176×220 — the agreed tile — and a landscape one is 176 wide and short, which is what a
   * landscape design actually looks like.
   * ⚠️ `maxWidth: '100%'` IS THE BELT TO THAT BRACES. 176 fits a 200px column with `p-4` (168px of
   * content) to within 8px, and a future column narrower than that must still not overflow. */
  const ratio = w && h ? w / h : 4 / 5
  const H = 220
  const MAX_W = 176
  const width = Math.min(Math.round(H * ratio), MAX_W)
  const height = Math.round(width / ratio)
  return (
    <div
      data-design-tile
      style={{ height, width, maxWidth: '100%' }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-center text-[11px] font-semibold text-slate-400"
    >
      {url
        /* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring Supabase URL;
           next/image would need the host in `remotePatterns` and would proxy a private object. */
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : 'No design yet'}
    </div>
  )
}

/* ⛔ `PlaceTile` IS GONE — 7 October 2026. A 28×35 thumbnail for the "Designs for a place" list. The
 * Locations table draws its own 24×30 pair (one per slot) with a grey dash for an empty one, because
 * a row there has TWO images to show rather than one. */

/**
 * "Own design" — a small rounded tag, to the right of the name and before the button.
 *
 * ══ ⛔ THE "Standard" TAG IS GONE (6 October 2026, Dominic) ═══════════════════════════════════════
 * REPORTED AS "remove the event type from Designs for a place", and that is exactly how it read:
 * **Standard is the name of an EVENT TYPE** in this product — it is the first pill on the Event types
 * grid and on every Add event form — and a grey "Standard" tag on a place row looked like that type
 * having been attached to the place.
 * 🔴 AND IT CARRIED NO INFORMATION. Every place without its own design is on the event design; a tag
 * on all of them says only "this row is a row". What is worth marking is the EXCEPTION, which is the
 * handful of places that have their own — so only that one is drawn.
 * ⚠️ THE DEFAULT IS STILL VISIBLE ON THE ROW, twice over: a blank tile rather than a thumbnail, and a
 * button that reads "Design" rather than "Edit". Nothing was lost with the word.
 */
/* ⛔ `DesignTag` IS GONE WITH THE BOX IT BELONGED TO. It marked the exception in "Designs for a
 * place" — the handful of places with their own picture. "Place pictures" marks the exception the
 * other way round: the places with NONE come first, under their own heading, which says more than a
 * tag on the rest ever did. */

/** "✓ Set up" / "Not set up". */
function ReadyBadge({ ready }: { ready: boolean }) {
  return ready
    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">✓ Set up</span>
    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Not set up</span>
}

/* ⛔ `BackLink` IS GONE — 9 October 2026. It drew a standalone "‹ Designs" row above each full-page
 * view, and the editor's own title row already begins with one beside the title it goes back from. Two
 * ways back for one journey, stacked, costing a row of height on the screen that needs it most. */

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE PANE
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 THE MOUNT, AND THE GATE ═══════════════════════════════════════════════════════════════════
 *
 * ⚠️ `schedule_graphics` IS CHECKED PER BOX, NOT AROUND THE PAGE, because the brief asks for the
 * locked state INSIDE the weekly box. ⛔ AND THE OTHER TWO BOXES ARE LOCKED THE SAME WAY, which the
 * brief does not say in so many words: /api/weekly-post gates EVERY action on `schedule_graphics`
 * (`gated()` runs once at the top of POST), so a Make post button on a truck without it would open a
 * modal that 403s. A button that cannot work is worse than a locked box that says why.
 * ⚠️ NO TRUCK IS IN THAT STATE TODAY: the preview key is on Pizza Kitchen, which is on `trial`, and
 * TRIAL_FEATURES spreads MAX_FEATURES. See docs/social-posts-report.md.
 *
 * ⚠️ THE PREVIEW KEY IS NOT CHECKED HERE. The page.tsx pill list already filters on it, so a truck
 * without it cannot reach this component at all — and the route refuses it a second time.
 */
export function SocialPostsPane({ truck, token, area, onArea, manageApi, openEventId, onOpenedEvent, onRequestArea, onFullWidth }: {
  truck: {
    plan: Plan
    feature_overrides: Record<string, boolean> | null
    trial_expires_at: string | null
    name?: string | null
  } | null
  token: string
  /** Which of the three areas is open. It is in the URL — see lib/manage-links.ts. */
  area: SocialArea
  onArea: (a: SocialArea) => void
  /** /api/manage, for the one field this page writes that is not a design: a location's name on posts. */
  manageApi: (action: string, extra?: Record<string, unknown>) => Promise<unknown>
  /** 🔴 An event handed over by Schedule › Events' "Make post" — its modal opens on arrival. */
  openEventId?: string | null
  /** Cleared once the pane has consumed `openEventId`, so a later pill switch cannot reopen it. */
  onOpenedEvent?: () => void
  /** 🔴 Hands the page a guarded navigator, so a sub-tab pill asks before leaving an unsaved design. */
  onRequestArea?: (go: ((area: SocialArea) => void) | null) => void
  /**
   * ══ 🔴 "THIS PANE WANTS THE WHOLE WINDOW" (9 October 2026) ═════════════════════════════════════
   * ⛔ THE PAGE CAPS ITS CONTENT AT `max-w-5xl` ABOVE 1400px, which is 1024px of a 1728px window — so a
   * design editor asked to use the full width could not, however it was built. ⚠️ A `100vw` BREAKOUT
   * (`margin-left: calc(50% - 50vw)`) WAS THE OTHER OPTION AND IS WRONG: `vw` includes the vertical
   * scrollbar, so on any page tall enough to scroll it overflows by ~15px and the PAGE pans sideways —
   * over a drag surface, where a sideways pan is a lost gesture.
   * 🔴 SO THE PANE ASKS AND THE PAGE ANSWERS. The page owns its container; this is a request, not a
   * reach into it.
   */
  onFullWidth?: (on: boolean) => void
}) {
  return (
    <SocialPosts truck={truck} token={token} area={area} onArea={onArea} manageApi={manageApi}
      openEventId={openEventId ?? null} onOpenedEvent={onOpenedEvent} onRequestArea={onRequestArea}
      onFullWidth={onFullWidth} />
  )
}

type View =
  | { kind: 'boxes' }
  | { kind: 'weekly-post'; week: 'this' | 'next' }
  | { kind: 'weekly-design' }
  | { kind: 'event-design' }
  /* ══ ⛔ `place-pictures` AND `place-design` ARE GONE — 7 October 2026 ════════════════════════════
   * The pictures page was a LIBRARY — a grid, a ★ Main, a Make main / Rename menu and a sentence
   * explaining that the Main one was used automatically. A location now has at most two images with
   * one job each, so there is nothing to browse and nothing to promote: the Locations sub-tab's two
   * boxes are the whole screen, and they are a pane rather than a page (no second "‹ ‹").
   *
   * ⚠️ `place-design` WAS THE PER-LOCATION **TEXT POSITIONS** EDITOR, reached from a quiet link at the
   * bottom of that page. The brief removes the link, so the editor has no door and it has gone with
   * it. ⛔ WHAT IS **NOT** GONE IS THE DATA OR THE BEHAVIOUR: `truck_places.event_layout` is still
   * read by `eventPostContext`, still validated against that location's own picture, and still used
   * in preference to the standard positions — so every location that has its own keeps rendering
   * exactly as it does. A location can no longer be GIVEN its own from the UI, which is a capability
   * that lost its door rather than a capability that was deleted. Named in docs/social-tab-report.md
   * rather than left to be discovered. */

/* ⛔ `manageApi` IS NO LONGER DESTRUCTURED. Its one reader was "Name on posts", which left this screen
 * on 9 October when the field moved to Tidy up places. ⚠️ IT IS STILL IN THE PROP TYPE and the page
 * still passes it — removing it would be a change to the page's mount for nothing, and the next thing
 * this pane needs to write through `/api/manage` will want it back. */
function SocialPosts({ truck, token, area, onArea, openEventId, onOpenedEvent, onRequestArea, onFullWidth }: {
  truck: {
    plan: Plan
    feature_overrides: Record<string, boolean> | null
    trial_expires_at: string | null
    name?: string | null
  } | null
  token: string
  area: SocialArea
  onArea: (a: SocialArea) => void
  openEventId?: string | null
  onOpenedEvent?: () => void
  /* 🔴 HANDS THE PAGE A GUARDED NAVIGATOR (9 October 2026). The sub-tab pills live in the page's own
   * bar; this is how they come to ask before leaving an unsaved design. ⚠️ `null` on unmount, so a
   * page that has left this pane cannot go on calling into it. */
  onRequestArea?: (go: ((area: SocialArea) => void) | null) => void
  /** 🔴 "This pane wants the whole window" — see the note on `SocialPostsPane`. */
  onFullWidth?: (on: boolean) => void
  manageApi: (action: string, extra?: Record<string, unknown>) => Promise<unknown>
}) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'boxes' })
  /* ══ 🔴 "THE EDITOR HAS UNSAVED CHANGES" — REPORTED UP FROM `DesignEditor` ════════════════════════
   * ⚠️ IT IS STATE HERE AND A REF THERE, and both are right: the editor reads it inside a handler that
   * must have the current answer, and this pane RENDERS from it — the confirm is a dialog, not an
   * alert, so it has to be in the tree. */
  const [editorDirty, setEditorDirty] = useState(false)
  /**
   * 🔴 The press waiting on an answer. ⚠️ null = no dialog is open.
   * ⛔ `'back'` IS A TARGET TOO (10 October 2026, §B10). "‹ Designs" inside the editor used to close it
   * without asking, so the one way out an operator actually uses was the one that threw work away
   * silently — while a sub-tab pill asked. One guard, every exit.
   */
  const [leaveTo, setLeaveTo] = useState<SocialArea | 'back' | null>(null)
  /* ══ 🔴 §B10 · THE EDITOR'S OWN SAVE, SO THE DIALOG CAN OFFER "Save and leave" ═══════════════════
   * ⚠️ A REF, NOT STATE: it is read inside a click handler that must have the current one, and nothing
   * renders from it — a state write per keystroke of the editor's layout would re-render this pane for
   * no reason. ⛔ THE EDITOR CLEARS IT ON UNMOUNT, so this cannot save a design that is not open. */
  const editorSave = useRef<(() => void | Promise<void>) | null>(null)
  /** The event whose post modal is open. One at a time, closed by setting this to null. */
  const [posting, setPosting] = useState<string | null>(null)
  /* ══ 🔴 §5 · THE CHOSEN EVENT AND THE CAPTION THAT GOES WITH IT (9 October 2026) ═══════════════════
   *
   * ⛔ THEY LIVE **HERE**, NOT IN `NextEventHalf`, and they have to: the caption box is a sibling of
   * that card, not a child of it, and the post modal is a third sibling again. A choice held in the
   * card could not reach either. ⚠️ `null` MEANS "the next one", which is resolved where it is used so
   * that a reload, a refresh of the overview or an event passing cannot leave a stale id selected.
   * 🔴 `postText` IS THE OPERATOR'S OWN WORDS and it is what the modal shares. ⚠️ It is `undefined`
   * until the box has reported once, which is how the modal tells "no box was offered" (Schedule's own
   * Make post) from "the box was emptied" — those must behave differently. */
  const [chosenEventId, setChosenEventId] = useState<string | null>(null)
  const [postText, setPostText] = useState<string | undefined>(undefined)
  /* ⚠️ THE WEEKLY CARD'S BOX REPORTS TOO, and nothing reads it yet — the weekly MAKE screen owns its
   * own caption and has since 8 October. ⛔ IT IS WIRED ANYWAY rather than passing a no-op, because a
   * `() => {}` would be the kind of thing somebody later takes for a finished feature. The report says
   * what is missing. */
  const [weekCaption, setWeekCaption] = useState<string | undefined>(undefined)
  void weekCaption
  const [week, setWeek] = useState<'this' | 'next'>('this')
  /* ⛔ `eventSearch` AND `designSearch` WENT WITH THE TWO LISTS THAT HAD SEARCH BOXES ("Post for a
   * place" and "Designs for a place"). The Locations table owns its own search, because the state
   * belongs with the filter chips it works alongside. */

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/weekly-post', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'social_overview' }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      /* 🔴 THE SERVER'S OWN SENTENCE, SHOWN AS IT CAME BACK. The refusals here are specific — a truck
       * without the plan is told which plan — and "something went wrong" would strip the only part an
       * operator can act on. */
      if (!r.ok) throw new Error(String(j.error ?? 'That did not work.'))
      setData(j as unknown as Overview)
      setWeek((j as unknown as Overview).weekly.defaultWeek)
      setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load') }
  }, [token])

  /* ⚠️ THE DISABLE IS PER-LINE AND NARROW, as everywhere else in Manage. The setState calls are inside
   * `load`, after an await — the rule's own "subscribe and set state in the callback" — and the rule is
   * static and cannot see past the call. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  /* ══ 🔴 THE HANDOFF FROM SCHEDULE › EVENTS' "Make post" (§1) ══════════════════════════════════════
   * That button switches to this tab with `section=create` AND an event id, and the modal must be open
   * when the operator arrives — one press, not two.
   * ⛔ IT IS AN EFFECT AND IT HAS TO BE. The id arrives as a PROP from a tab switch, so there is no
   * event handler in this component to hang it on, and `posting` is this component's state. The
   * disable is the same per-line one `load` carries, and for the same reason: the setState is the
   * response to something outside React changing.
   * 🔴 `onOpenedEvent()` CLEARS THE PROP, which is what stops the modal reopening every time this
   * component re-renders — including after the operator closes it. Without it, closing the modal and
   * then saving anything at all would put it straight back.
   * ⚠️ IT DOES NOT CHECK `area`: the page has already set the section to `create`, and an id that
   * arrived while the operator was on Designs is still an id they asked to post about. */
  useEffect(() => {
    if (!openEventId) return
    /* ⚠️ THE DISABLE SITS ON THE `setPosting` LINE, NOT ON THE `useEffect`. Put above the hook it is
     * reported as unused — the rule fires on the CALL, so that is where the exemption has to be. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosting(openEventId)
    onOpenedEvent?.()
  }, [openEventId, onOpenedEvent])

  /* ⛔ EVERY HOOK BEFORE EVERY EARLY RETURN. `saveCaption` was declared beside the other derived
   * values near the bottom — which is after the five `if (view.kind === …) return` branches, so on a
   * full-page view it was never called and React's hook order changed between renders. The lint rule
   * caught it; the symptom would have been a caption editor that lost its saver after opening the
   * weekly post screen once. */
  /**
   * Save one post type's caption template.
   *
   * ══ 🔴 IT RELOADS AFTERWARDS — AND THE COMMENT THAT SAID IT MUST NOT WAS OUT OF DATE ══════════════
   *
   * ⛔ DOMINIC, 10 OCTOBER 2026: *"i added +Week dates then saved template but it didnt save."* **It
   * did.** The row in the database begins `{week-dates} Pizza Kitchen — where we are this week:` — the
   * press wrote exactly what he asked for. What did not happen is the SCREEN changing: this function
   * deliberately did not reload, so `data.captions.week.template` stayed as it was, the caption box
   * went on showing the caption the server had filled from the OLD template, and reopening "✎ Edit
   * template" showed the old one with his chip missing. From where he was sitting that is a save that
   * did nothing, and he was right to report it.
   * ⛔ THE OLD REASONING WAS TRUE OF A SCREEN THAT NO LONGER EXISTS. It read: "`load()` would hand the
   * editor a new `initial`, the `key` would change, React would mount a fresh editor and the caret
   * would jump to the start — **on every debounce, while the operator is still typing**." That was the
   * AUTOSAVE era. There is one write now, on a deliberate press, and the panel CLOSES immediately
   * after it — so there is no caret left to lose and nothing is still being typed.
   * 🔴 AND THE RELOAD IS NOT COSMETIC: the filled caption on the card is built on the SERVER from the
   * template, so without it the card would go on showing a caption built from a template that no longer
   * exists — the one failure this round's §2 is about, in a different place.
   * ⚠️ IT THROWS ON FAILURE so the editor can show its own error and stay open. A silent failure here
   * would close the panel over a caption that was never written.
   */
  const saveCaption = useCallback(async (kind: 'week' | 'event', template: string) => {
    const r = await fetch('/api/weekly-post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'caption_save', kind, template }),
    })
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      throw new Error(String(j.error ?? 'That did not save.'))
    }
    /* ⚠️ AWAITED, so the panel's `onSave` does not close over a screen that is still showing the old
     * words — the caller closes the editor the moment this resolves. */
    await load()
  }, [token, load])

  /* ⛔ EVERY HOOK BEFORE EVERY EARLY RETURN. These three sat beside the other derived values near the
   * bottom — which is after the `if (view.kind === …) return` branches, so inside a full-page editor
   * they were never called and React's hook order changed between renders. The lint rule caught it;
   * the symptom would have been the pill guard going dead exactly when an editor was open, which is
   * the only time it matters. */
  /* ══ 🔴 A PILL PRESS GOES THROUGH HERE WHILE AN EDITOR IS OPEN (9 October 2026) ══════════════════
   * ⛔ THE PILLS SWITCHED TAB OUT FROM UNDER AN OPEN EDITOR WITH NO WARNING. They live in the page's
   * own sub-tab bar, three components above this pane, so they knew nothing about an unsaved design —
   * an operator who had spent ten minutes placing boxes could lose all of it by pressing "Designs" to
   * check something.
   * 🔴 AN IN-PAGE CONFIRM, NOT `window.confirm`. A browser dialog cannot be styled, cannot be read by
   * the page's own voice, and on Safari steals focus in a way that has already cost this product a
   * share sheet. ⚠️ AND IT IS ONLY ASKED WHEN THERE IS SOMETHING TO LOSE: a clean editor navigates
   * straight through, which is what makes the question mean something when it is asked.
   * ⚠️ IT ALSO CLOSES THE EDITOR. Switching pill while standing in a full-page view has to put the
   * pane back on its boxes, or the new pill would render behind the editor it did not close. */
  const goArea = useCallback((area2: SocialArea) => {
    setView({ kind: 'boxes' })
    setEditorDirty(false)
    onArea(area2)
  }, [onArea])

  const requestArea = useCallback((area2: SocialArea) => {
    if (editorDirty) { setLeaveTo(area2); return }
    goArea(area2)
  }, [editorDirty, goArea])

  /* 🔴 THE ONE PLACE A DECISION IS CARRIED OUT, so "Save and leave" and "Leave without saving" cannot
   * end up in different places. ⚠️ `'back'` CLOSES THE EDITOR AND RELOADS, which is what "‹ Designs"
   * has always done; an area switches tab. */
  const leaveNow = useCallback((to: SocialArea | 'back') => {
    if (to === 'back') { setEditorDirty(false); setView({ kind: 'boxes' }); void load(); return }
    goArea(to)
  }, [goArea, load])

  /* ⚠️ HANDED UP TO THE PAGE, which owns the pills. ⛔ IT IS AN EFFECT rather than a render-time call
   * for the same reason `onDirtyChange` is: setting a parent's state during this component's render is
   * the React warning, and the page only needs the handler after the render that produced it. */
  useEffect(() => {
    onRequestArea?.(requestArea)
    return () => onRequestArea?.(null)
  }, [onRequestArea, requestArea])

  /* 🔴 THE THREE FULL-PAGE EDITOR VIEWS ARE THE ONES THAT WANT THE WHOLE WINDOW — and only those. The
   * boxes view is a two-column reading screen that is better at the page's normal width.
   * ⚠️ THE CLEAN-UP ARM MATTERS AS MUCH AS THE REPORT: leaving the page wide after the editor closed
   * would silently change every other screen on the tab. */
  const wantsFullWidth = view.kind === 'weekly-design' || view.kind === 'event-design' || view.kind === 'weekly-post'
  useEffect(() => {
    onFullWidth?.(wantsFullWidth)
    return () => onFullWidth?.(false)
  }, [onFullWidth, wantsFullWidth])

  const gate = (children: React.ReactNode) => (
    <FeatureGate
      feature="schedule_graphics"
      plan={truck?.plan}
      overrides={truck?.feature_overrides}
      trialExpiresAt={truck?.trial_expires_at}
      upgradeMessage={WEEKLY_POST_PLAN_REFUSAL}
    >
      {children}
    </FeatureGate>
  )

  /* ══ 🔴 §B10 · "‹ Designs" ASKS, LIKE A PILL DOES ════════════════════════════════════════════════
   * ⛔ IT DID NOT, AND IT IS THE EXIT AN OPERATOR ACTUALLY USES — it is the first thing on the editor's
   * own title row. So the guard that protected the three pills left the front door open. */
  const back = () => {
    if (editorDirty) { setLeaveTo('back'); return }
    leaveNow('back')
  }

  // ── THE FULL-PAGE VIEWS ──────────────────────────────────────────────────────────────────────
  /* ══ ⛔ THE STANDALONE "‹ Designs" ROW IS GONE — 9 October 2026 ══════════════════════════════════
   * Every one of these three views drew a `BackLink` ABOVE the editor, and the editor's own title row
   * already starts with one ("‹ Designs  Single event post design"). Two ways back, stacked, for one
   * journey — and the upper one cost a whole row of vertical space on a screen whose whole problem is
   * that the poster wants more.
   * 🔴 THE INLINE ONE IS THE SURVIVOR, because it is the one beside the title it takes you back from.
   * ⚠️ `BackLink` IS STILL EXPORTED AND USED BY NOTHING — see its own note. */
  /* ══ ⛔ EVERY HOOK BEFORE EVERY EARLY RETURN — THE THIRD TIME THIS FILE HAS LEARNT IT ══════════════
   * The caption memo below sat beside the other derived values, which is AFTER the
   * `if (view.kind === …) return` branches — so inside a full-page editor it was never called and
   * React's hook order changed between renders. `react-hooks/rules-of-hooks` caught it, as it caught
   * `saveCaption` and then `goArea`/`requestArea` before it. ⚠️ THE SYMPTOM WOULD HAVE BEEN THE CAPTION
   * GOING BLANK after closing an editor, which reads as a server problem. */

  /** One location by id, for the right half's "which image" line. ⚠️ A private event has no place.
   *  ⛔ `useCallback` BECAUSE THE CAPTION MEMO DEPENDS ON IT — a new function every render would refill
   *  the caption every render, and a caption that re-fills under the operator retypes their edit away. */
  const placeById = useCallback(
    (id: string | null | undefined): PostPlace | null =>
      id ? ((data?.places ?? []).find(p => p.id === id) ?? null) : null,
    [data],
  )

  /* ══ 🔴 §5 · THE CHOSEN EVENT, AND ITS CAPTION, FILLED HERE ════════════════════════════════════════
   *
   * ⛔ `chosenEventId` IS RESOLVED AGAINST THE **CURRENT** LIST rather than trusted. The overview is
   * re-read after every upload and every design save, and an event that has passed since the operator
   * chose it is simply gone from `upcoming` — so a stored id has to fall back to the next public event
   * rather than leaving the card blank.
   * 🔴 AND THE CAPTION IS FILLED WITH THE **SAME TWO PURE FUNCTIONS** `event_post` uses on the server,
   * from the same values. That is what makes it safe to fill on the client: there is one implementation
   * of "what does this caption say", and this is a second CALLER of it, not a second copy.
   * ⚠️ `now: new Date()` IS CORRECT HERE AND IS THE REASON `{day-date}` IS RELATIVE. The label fills to
   * "tonight" / "tomorrow" / "on Tue 13 Oct" as of the moment the operator is looking, which is what
   * `caption.ts` has always done — a date baked in on Sunday would be a lie by Wednesday.
   */
  const postableUpcoming = (data?.upcoming ?? []).filter(e => !e.isPrivate)
  const chosenEvent = postableUpcoming.find(e => e.id === chosenEventId) ?? postableUpcoming[0] ?? null
  const eventCaption = useMemo(() => {
    if (!chosenEvent || !data) return ''
    const template = data.captions?.event.template ?? ''
    if (!template) return ''
    return fillCaptionTemplate(template, eventCaptionValues({
      /* ⚠️ `placeName` IS WHAT THE POSTER PRINTS (`short_name` first) and `venue` is the full name.
       * The caption must agree with the poster, so the resolved one leads. */
      placeName: chosenEvent.placeName ?? chosenEvent.venue ?? '',
      town: chosenEvent.town,
      date: chosenEvent.date,
      startTime: chosenEvent.startTime,
      endTime: chosenEvent.endTime,
      orderUrl: data.captionBits?.orderUrl ?? null,
      timeStyle: data.captionBits?.timeStyle ?? '12h',
      /* 🔴 THE LOCATION'S OWN HANDLE, AND **NEVER** FOR A PRIVATE BOOKING — `chosenEvent` is drawn from
       * `postableUpcoming`, so a private event cannot reach this line at all. */
      socialTag: placeById(chosenEvent.placeId)?.socialTag ?? null,
      country: (data.captionBits?.country as 'GB' | 'US' | undefined) ?? 'GB',
      now: new Date(),
    }))
    /* ⚠️ `placeById` AND `data` ARE THE DEPENDENCIES THAT MATTER; `placeById` closes over `places`,
     * which comes out of `data`, so listing `data` covers both. ⛔ `new Date()` IS NOT A DEPENDENCY and
     * must not be — a caption that re-filled every render would retype itself under the operator. */
  }, [chosenEvent, data, placeById])

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 §B10 · THE LEAVE DIALOG — BUILT HERE, **ABOVE** THE EARLY RETURNS
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   *
   * ⛔ **THIS IS THE BUG DOMINIC REPORTED.** The dialog was rendered in the boxes view's JSX — which is
   * below three `if (view.kind === …) return` branches. So from inside an editor with unsaved changes,
   * a pill press called `setLeaveTo(...)` and **nothing appeared**: the state changed, the dialog was
   * not in the tree, and the operator pressed "Location settings" and watched the screen do nothing.
   * 🔴 IT IS ONE ELEMENT NOW, INCLUDED BY ALL FOUR RETURNS — which is also why it is built before them
   * rather than copied into each.
   * ⚠️ AND IT HAS THREE BUTTONS. Two were a false choice: the dialog that exists to protect the
   * operator's work offered no way to keep it.
   */
  const leaveDialog = leaveTo && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-leave-confirm
      /* ⚠️ A CLICK ON THE BACKDROP IS "Keep editing", which is the SAFE answer. A backdrop that
       * discarded work would be the most destructive control on the screen and the easiest to hit by
       * accident. */
      onClick={() => setLeaveTo(null)}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-slate-900" data-leave-title>{LEAVE_TITLE}</p>
        <p className="mt-1 text-[12px] leading-snug text-slate-500" data-leave-body>{LEAVE_BODY}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {/* ⛔ "Keep editing" IS FIRST AND IS THE OUTLINED ONE; the destructive answer is not where a
            * hurried press lands. 🔴 "Save and leave" IS THE ORANGE ONE — the brief's instruction, and
            * the one that loses nothing. */}
          <button type="button" data-keep-editing className={BTN_OUTLINE}
            onClick={() => setLeaveTo(null)}>{LEAVE_CONFIRM_STAY}</button>
          <button type="button" data-leave-anyway
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            onClick={() => { const to = leaveTo; setLeaveTo(null); leaveNow(to) }}>
            {LEAVE_WITHOUT_SAVING}
          </button>
          {/* ⚠️ IT **AWAITS** THE SAVE BEFORE LEAVING. The editor's `onSave` goes to the server; leaving
            * first would unmount the screen that reports whether it worked, and an operator who chose
            * "Save and leave" would have no way to find out that it had not. ⛔ AND A FAILED SAVE KEEPS
            * THE EDITOR OPEN, with its own error message, rather than discarding the work anyway. */}
          <button type="button" data-save-and-leave
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
            onClick={() => {
              const to = leaveTo
              const save = editorSave.current
              void (async () => {
                try { await save?.() } catch { setLeaveTo(null); return }
                setLeaveTo(null)
                leaveNow(to)
              })()
            }}>
            {LEAVE_SAVE_AND_GO}
          </button>
        </div>
      </div>
    </div>
  )

  if (view.kind === 'weekly-post') {
    return (<>{gate(<WeeklyPostApp token={token} truckName={truck?.name ?? 'Your truck'}
      initialMode="post" initialWeek={view.week} onBack={back} onDirtyChange={setEditorDirty}
      onSaver={fn => { editorSave.current = fn }} />)}{leaveDialog}</>)
  }
  if (view.kind === 'weekly-design') {
    /* ══ 🔴 "+ Add location pictures" GOES TO **Location settings**, THROUGH `requestArea` ═══════════
      * ⛔ IT WENT TO Designs, AND CALLED `onArea` DIRECTLY. Both halves of that were wrong by 9 October:
      *   • Designs no longer holds a per-location picture list at all — that was "Designs for a place",
      *     sorted so the empty ones came first, and it is tombstoned above. A location's picture is set
      *     in Location settings now, so the old target is a tab where there is nothing to do.
      *   • `onArea` DIRECTLY IS AN UNGUARDED WAY OUT OF AN OPEN EDITOR. This link is pressed from inside
      *     the weekly design editor, with boxes possibly just moved — the one situation the sub-tab
      *     guard exists for. `requestArea` asks first and `goArea` closes the editor, so the `setView`
      *     this used to do by hand is already done for it. */
    return (<>{gate(<WeeklyPostApp token={token} truckName={truck?.name ?? 'Your truck'}
      initialMode="setup" initialDesignKind="week" hideKindSwitch onBack={back}
      onDirtyChange={setEditorDirty}
      onSaver={fn => { editorSave.current = fn }}
      /* 🔴 THE DESIGNS LIST RE-READS THE MOMENT THE PICTURE CHANGES, not when the operator leaves —
         see `WeeklyPostApp.onPictureChanged`. */
      onPictureChanged={() => { void load() }}
      onAddPlacePictures={() => requestArea('locations')} />)}{leaveDialog}</>)
  }
  if (view.kind === 'event-design') {
    return (<>{gate(<EventSetupScreen token={token} onlyStandard onCancel={back}
      onDirtyChange={setEditorDirty} onSaver={fn => { editorSave.current = fn }}
      onPictureChanged={() => { void load() }} />)}{leaveDialog}</>)
  }
  // ── THE BOXES ────────────────────────────────────────────────────────────────────────────────
  const places = data?.places ?? []

  /* ⛔ `matches`, `designList`, `withoutPictures` AND `withPictures` ARE GONE — 7 October 2026. They
   * sorted "Designs for a place" so the locations with NO picture came first, under their own heading.
   * 🔴 THE Locations TABLE DOES THAT WITH A **CHIP** INSTEAD — "Missing images n" — which is better in
   * the way that matters: the number is visible before it is pressed, so an operator knows whether
   * there is anything to do without scrolling a list to find out. `LocationsArea` owns its own search
   * and filtering, because that state belongs with the chips. */

  const weekChoice = week === 'this' ? data?.weekly.thisWeek : data?.weekly.nextWeek



  /* ══ ⛔ THE "Set up your event design first" LINE AND THE DISABLED BUTTONS ARE GONE (6 Oct 2026) ═══
   * They were one of THREE different answers to one situation — the weekly box relabelled its orange
   * button, boxes 2 and 3 greyed theirs under a note, and the lists went on listing events nobody
   * could post. ⛔ A DISABLED CONTROL IS A PROMISE that it will work under some condition the screen
   * does not name. `EmptyBox` replaces all three, identically. */

  /* 🔴 "Go to Designs" SWITCHES THE AREA, AND THAT IS ALL IT DOES. It does not open a particular
   * editor: the operator may need the weekly one or the event one, and Designs is where both are.
   * ⚠️ IT GOES THROUGH `onSectionChange`, so the URL becomes `?section=designs` — the area is
   * addressable and a reload stays put. Same path the segmented control takes. */
  const goToDesigns = () => requestArea('designs')

  return (
    <div className="space-y-3" data-social-posts>
      {/* ══ 🔴 EACH SUB-TAB SAYS WHAT **IT** IS FOR — 8 October 2026 ═══════════════════════════════
        * ⛔ A SHARED "Social posts" HEADING AND A SHARED INTRO STOOD HERE, and between them they
        * answered the wrong question twice. The heading named the TAB — which the pill bar directly
        * above it already names, in the same words, highlighted — and the intro was a map of two areas
        * ("Designs is where you upload… Make a post puts…") that are now three pills in that bar.
        * 🔴 A PAGE THAT EXPLAINS ITS OWN NAVIGATION IS A PAGE WHOSE NAVIGATION IS NOT EXPLAINING
        * ITSELF. Each pill now answers "what is this screen for?", which is the only question a
        * heading on a sub-tab has to answer.
        * ⚠️ ONE BLOCK, THREE PAIRS, CHOSEN BY `area` — not three copies of the markup. The three
        * headings must stay the same size and the same distance from the bar, and that is a fact about
        * one element rather than a habit shared by three. */}
      <div className="min-w-0" data-tab-head>
        <p className="text-xl font-black text-slate-900" data-tab-heading>
          {area === 'create' ? TAB_CREATE_HEADING
            : area === 'designs' ? TAB_DESIGNS_HEADING
            : TAB_LOCATIONS_HEADING}
        </p>
        <p className="mt-0.5 max-w-[46rem] text-sm text-slate-500" data-tab-blurb>
          {area === 'create' ? TAB_CREATE_BLURB
            : area === 'designs' ? TAB_DESIGNS_BLURB
            : TAB_LOCATIONS_BLURB}
        </p>
      </div>

      {error && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-red-600">
          {error}
          <button type="button" onClick={() => void load()}
            className="font-semibold underline hover:no-underline">Retry</button>
        </p>
      )}
      {!data && !error && <div className="p-8 text-center"><Spinner /></div>}

      {data && area === 'create' && (
        <>
          {/* ══ 🔴 TWO HALVES SIDE BY SIDE FROM **900px**, STACKED BELOW IT (7 October 2026) ════════
            * ⛔ THERE WERE THREE BOXES AND THE THIRD HAS GONE. "Post for a place" was a third door
            * into the same modal — pick a venue, post its next event — and the right half below does
            * that job better by naming the next event outright instead of making the operator pick the
            * venue it happens to be at. Nothing it could do is now impossible.
            * ⚠️ `min-[900px]:` IS THE SAME BREAKPOINT THE THREE BOXES USED, and it is deliberate
            * rather than inherited: a 16in MacBook Pro in Safari with a normal window is 1000–1100px,
            * which is the machine this is used on, so `lg:` (1024) stacked it on a laptop. **A
            * breakpoint with no measurement between its two sides is a breakpoint nobody has checked**
            * — it is measured at 390 and 1100 by scripts/social-posts-render.cjs.
            * ⚠️ `items-stretch`, so two halves of very different lengths are the same height and read
            * as two choices of one kind rather than two loose cards. */}
          <div className={TWO_HALVES_GRID} data-create-halves>
            {/* ══ 🔴 THE SINGLE EVENT HALF IS ON THE **LEFT** (10 October 2026, Dominic) ═══════════════
              * ⛔ THE WEEKLY POST HELD THE LEFT FOR FOUR ROUNDS, and the order was inherited rather than
              * chosen: the weekly poster was the first thing this feature could make. **A single event
              * post is the one a truck makes most often** — one per pitch, several a week — where the
              * weekly one is made once and then rarely touched. The thing done daily reads first.
              * ⚠️ DESIGNS AND LOCATION SETTINGS MOVED IN THE SAME EDIT, so the three screens of this tab
              * agree about which post comes first; two of them disagreeing is worse than either order. */}
            {/* ── LEFT · SINGLE EVENT POST ────────────────────────────────────────────────────── */}
            <Box title={CREATE_EVENT_TITLE} blurb={EVENT_BOX_BLURB}>
              {gate(!data.standard.ready ? (
                <EmptyBox title={EMPTY_EVENT_TITLE} onGo={goToDesigns} />
              ) : (
                <>
                  <NextEventHalf
                    token={token}
                    events={data.upcoming}
                    photoSpace={data.standard.photoSpace === true}
                    standardUrl={data.standard.previewUrl}
                    standardW={data.standard.width}
                    standardH={data.standard.height}
                    /* ⚠️ THE **EVENT POST** PICTURE, not the weekly one and not the poster — this
                     * thumbnail stands in for what the single event post will be drawn on. */
                    placeImageUrl={id => placeById(id)?.eventPhotoImage?.url ?? null}
                    onPost={id => setPosting(id)}
                    chosenId={chosenEventId}
                    onChoose={setChosenEventId}
                  />
                  {/* 🔴 THE `key` IS THE FILLED TEXT ITSELF, which is what makes "pick another event"
                    * refresh the box: a different event fills to a different string, so the textarea
                    * remounts with it. ⛔ IT ALSO MEANS AN EDIT IS LOST WHEN THE OPERATOR PICKS A
                    * DIFFERENT EVENT, and that is correct — the caption was for the other post. */}
                  <PostCaption
                    key={`cap-event-${eventCaption}`}
                    kind="event"
                    filled={eventCaption}
                    template={data.captions?.event.template ?? ''}
                    busy={false}
                    onSave={t => saveCaption('event', t)}
                    onTextChange={setPostText}
                  />
                </>
              ))}
            </Box>

            {/* ── RIGHT · WEEKLY POST ─────────────────────────────────────────────────────────── */}
            <Box title={CREATE_WEEKLY_TITLE} blurb={WEEKLY_BOX_BLURB}>
              {gate(!data.weekly.ready ? (
                <EmptyBox title={EMPTY_WEEKLY_TITLE} onGo={goToDesigns} />
              ) : (
                <>
                  {/* 🔴 THE DESIGN'S OWN THUMBNAIL, IN ITS OWN SHAPE. Same tile the Designs box draws,
                    * so an operator recognises what they are about to make. */}
                  {/* 🔴 THE WEEK'S OWN POST, NOT THE BLANK — the same change as the single event half,
                    * reported in the same breath: *"weekly post picture in create a post isn't showing
                    * the events but single event is."* ⚠️ IT FOLLOWS THE "Which week" SELECT below it,
                    * so picking next week redraws the tile with next week's events. */}
                  <div className="flex flex-col items-center">
                    <PostTile token={token} kind="week" week={week}
                      fallbackUrl={data.weekly.previewUrl}
                      w={data.weekly.width} h={data.weekly.height} />
                  </div>
                  {/* ══ 🔴 THE GREY LINE SITS UNDER THE TILE IN **BOTH** HALVES (10 October 2026) ═══
                    * ⛔ **DOMINIC: "the dropdowns for which event and which week aren't lined up."**
                    * They were one line apart: the single event half carries "Using your standard
                    * single event design" between its picture and its label, and this half carried its
                    * own grey line AFTER the select — so one `<select>` sat a line lower than the
                    * other. 🔴 ONE ORDER IN BOTH NOW: tile → grey line → label → select, so the two
                    * controls are at the same height whatever either line says.
                    * ⛔ NO "last made" — WE DO NOT STORE IT. A date nobody recorded would be a date an
                    * operator plans around. 🔴 WHAT IT DOES SAY IS WHAT IS **LEFT OUT**: a week whose
                    * numbers do not add up is the question this answers before it is asked. */}
                  <p className="mt-2 text-center text-[11px] text-slate-400" data-week-events>
                    {weekEventsLine(weekChoice?.events ?? 0, weekChoice?.privateEvents ?? 0)}
                  </p>
                  <label className="mt-3 block text-xs font-bold text-slate-600" htmlFor="which-week">Which week</label>
                  <select id="which-week" value={week} onChange={e => setWeek(e.target.value as 'this' | 'next')}
                    data-week-select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                    <option value="this">This week · {shortDate(data.weekly.thisWeek.start)} – {shortDate(data.weekly.thisWeek.end)}</option>
                    <option value="next">Next week · {shortDate(data.weekly.nextWeek.start)} – {shortDate(data.weekly.nextWeek.end)}</option>
                  </select>
                  {/* 🔴 ONE OF THE TWO ORANGE BUTTONS ON THIS AREA, and it is only drawn when the
                    * design is ready — the empty state above is the other branch. */}
                  <div className="mt-auto pt-3">
                    <button type="button" data-primary className={`${BTN_PRIMARY} w-full`}
                      onClick={() => setView({ kind: 'weekly-post', week })}>
                      {CREATE_WEEKLY_BUTTON}
                    </button>
                  </div>
                  {/* ══ 🔴 THE WEEKLY CARD IS THE SAME PATTERN AS THE EVENT ONE, AND NOW SO IS ITS TEXT
                    * ⛔ **IT SHOWED THE TEMPLATE — `{day-list}`, `{order-link}` AND ALL — AND THAT WAS A
                    * REAL BUG, REPORTED BY DOMINIC ON 10 OCTOBER.** The 9 October round added `caption`
                    * to both weeks in the overview payload and filled it on the server with the Make
                    * screen's own two functions… and this card went on reading `captions.week.template`.
                    * ⚠️ THE CHECK THAT PASSED WAS ASKING THE **ROUTE**, which was right all along — a
                    * payload assertion cannot see the screen, and the one that can is in
                    * `scripts/social-posts.cjs` now.
                    * 🔴 `weekChoice` IS THE WEEK THE SELECT ABOVE IS ON, so changing "Which week"
                    * changes the caption with it — the same rule the event card follows when a
                    * different event is picked.
                    * ⚠️ THE TEMPLATE IS STILL THE TEMPLATE: "✎ Edit template" edits the thing with the
                    * tokens in it, which is what that button has always meant. */}
                  <PostCaption
                    key={`cap-week-${weekChoice?.caption ?? data.captions?.week.template ?? ''}`}
                    kind="week"
                    filled={weekChoice?.caption ?? data.captions?.week.template ?? ''}
                    template={data.captions?.week.template ?? ''}
                    busy={false}
                    onSave={t => saveCaption('week', t)}
                    onTextChange={setWeekCaption}
                  />
                </>
              ))}
            </Box>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">{MAKE_POST_FOOTNOTE}</p>
        </>
      )}

      {/* ══ 🔴 DESIGNS USES CREATE A POST'S GRID — THE SAME CONSTANT (8 October 2026) ═══════════════
        * ⛔ IT WAS `minmax(200px,320px)_minmax(200px,320px)_minmax(0,1fr)`: two narrow columns and an
        * empty third track, left behind when "Location images" moved out of this area. So the two
        * screens one click apart laid their boxes out at different widths, and these pictures were
        * smaller than Create a post's for a reason that had stopped existing.
        * ⚠️ THE PICTURES STAY CENTRED and the orange button stays pinned to the bottom — both are the
        * boxes' own rules (`items-center` on the tile wrapper, `mt-auto` on the button) and neither
        * depends on the column width. */}
      {data && area === 'designs' && (
        <div className={TWO_HALVES_GRID} data-design-boxes>
          {/* ⚠️ THE SINGLE EVENT DESIGN LEADS (10 October 2026) — the same order as Create a post and
            * Location settings, for the reason given there: the post a truck makes most often reads
            * first, and three screens of one tab disagreeing about it is worse than either order. */}
          {/* ── BOX 1 · EVENT DESIGN — FIRST, because it is the post made most often ───────────── */}
          {/* ══ 🔴 "Single event post design", AND "standard" IS BOLD ═════════════════════════════
            * ⛔ IT WAS "Event post design" — which named the wrong distinction, because the box beside
            * it ("Designs for a place") is ALSO a design for event posts. An operator reading the two
            * headings could not tell which one their next post would use. The bold "standard" is what
            * ties the two boxes together: this is the default, and a place with its own replaces it. */}
          <Box title={EVENT_DESIGN_TITLE} blurb={<>
            {EVENT_DESIGN_BLURB_BEFORE}
            <strong className="font-bold text-slate-700">{EVENT_DESIGN_BLURB_BOLD}</strong>
            {EVENT_DESIGN_BLURB_AFTER}
          </>}>
            {gate(
              <>
                <div className="flex flex-col items-center">
                  <DesignTile url={data.standard.previewUrl} w={data.standard.width} h={data.standard.height} />
                  <div className="mt-2"><ReadyBadge ready={data.standard.ready} /></div>
                </div>
                <div className="mt-auto pt-3">
                  <button type="button" data-primary className={`${BTN_PRIMARY} w-full`}
                    onClick={() => setView({ kind: 'event-design' })}>
                    {data.standard.ready ? EVENT_DESIGN_BUTTON_EDIT : EVENT_DESIGN_BUTTON_NEW}
                  </button>
                </div>
              </>,
            )}
          </Box>

          {/* ── BOX 2 · WEEKLY DESIGN ──────────────────────────────────────────────────────────── */}
          <Box title="Weekly post design" blurb={WEEKLY_DESIGN_BLURB}>
            {gate(
              <>
                {/* ⚠️ CENTRED, AND THE TILE IS THE SAME SIZE IN BOTH STATES. The badge sits under it,
                  * centred with it — so the two design boxes read as a matched pair whichever of them
                  * is set up. ⛔ `items-center` ON THE WRAPPER, not `mx-auto` on the tile: the badge has
                  * to share the centring or it drifts left when the tile is portrait. */}
                <div className="flex flex-col items-center">
                  <DesignTile url={data.weekly.previewUrl} w={data.weekly.width} h={data.weekly.height} />
                  <div className="mt-2"><ReadyBadge ready={data.weekly.ready} /></div>
                </div>
                {/* 🔴 ORANGE, AND PINNED TO THE BOTTOM (6 October 2026, Dominic). On Designs, setting a
                  * design up IS the thing to do — these two are the only orange buttons on the area. */}
                <div className="mt-auto pt-3">
                  <button type="button" data-primary className={`${BTN_PRIMARY} w-full`}
                    onClick={() => setView({ kind: 'weekly-design' })}>
                    {data.weekly.ready ? 'Edit weekly design' : 'Set up weekly design'}
                  </button>
                </div>
              </>,
            )}
          </Box>

          {/* ── BOX 3 · DESIGNS FOR A PLACE ────────────────────────────────────────────────────── */}
          {/* ⚠️ TWO BOLD WORDS, AND THEY ARE THE POINT. A place design REPLACES the event design there;
            * an operator who reads "instead of" as "as well as" will give a venue its logo and wonder
            * why the date stopped appearing where it used to. */}
          {/* ══ ⛔ THE "Location images" BOX LEFT DESIGNS — 7 October 2026 ═══════════════════════
            * Designs is TWO boxes: the weekly post design and the single event post design. A list of
            * locations was never a design; it was here because there was nowhere else to put it.
            * 🔴 IT IS THE **Locations** PILL NOW, with a table and a per-location pane — and the model
            * under it changed with the screen: a location has at most TWO images, one for event posts
            * and one for the weekly post, instead of a library with a Main. See
            * `supabase/migrations/20261019_place_picture_slots.sql`. */}
        </div>
      )}

      {/* ══ 🔴 THE LOCATIONS AREA — A TABLE AND ONE SELECTED LOCATION (7 October 2026) ═══════════
        * ⚠️ MANAGEMENT ONLY. There is no Create post button anywhere on it: making a post is Create a
        * post's job, and a second door into the same modal is exactly what "Post for a place" was.
        * ⛔ AND THE OLD PICTURES PAGE IS GONE WITH IT — the image grid, ★ Main, "Main is used
        * automatically", the Make main / Rename menu, "Own text positions…" and the double "‹ ‹".
        * A location has two images with one job each, so there is nothing to browse and nothing to
        * promote. The remaining pieces are named in docs/social-tab-report.md. */}
      {data && area === 'locations' && (
        <LocationsArea
          token={token} places={places}
          onChanged={() => void load()}
          gate={gate}
        />
      )}

      {/* 🔴 THE SAME ONE ELEMENT THE THREE FULL-PAGE VIEWS RENDER — see `leaveDialog` above. */}
      {leaveDialog}

      {/* 🔴 THE SAME MODAL THE EVENTS LIST OPENS. One make flow, opened from four places. */}
      {posting && (
        /* ══ 🔴 THE OPERATOR'S CAPTION TRAVELS INTO THE MODAL — §5 ═════════════════════════════════
          * ⛔ ONLY WHEN THE MODAL IS ABOUT THE **CHOSEN** EVENT. `posting` is also set by Schedule ›
          * Events' own "Make post" (through `openEventId`), and that door has no caption box in front
          * of it — handing it this one would put the wrong event's words on the post. ⚠️ `undefined`
          * then, which is what tells the modal to use the server's own text. */
        <EventPostModal token={token} eventId={posting}
          captionOverride={posting === chosenEvent?.id ? postText : undefined}
          onClose={() => { setPosting(null); void load() }}
          onNeedsSetup={() => { setPosting(null); setView({ kind: 'event-design' }) }} />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 "Single event post" — THE NEXT EVENT IN FULL, THEN THE REST COLLAPSED (7 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ IT WAS A FLAT LIST OF SIX ROWS WITH SIX IDENTICAL BUTTONS, and that made every event equally
// likely to be the one you wanted — which is wrong, because it almost always is the next one. The
// headline answers "post about my next event" in one press and names the date on the button; the other
// ten are behind a disclosure for the times it is not.
//
// 🔴 AND THE HEADLINE SAYS **WHICH IMAGE** IT WILL USE, which nothing said before. Three different
// images produce the same 96px thumbnail — the location's photo, the location's poster, or the standard
// design — and the only one an operator can act on is the one actually chosen. `imageSource` comes
// from the server, resolved by the same rule the renderer applies.

/**
 * ══ 🔴 §5 · "YOUR NEXT EVENT", AND A WAY TO PICK A DIFFERENT ONE (9 October 2026) ═════════════════
 *
 * ⛔ WHAT THIS REPLACES: the headline showed the DATE first, in bold, with the venue third in grey —
 * and the only other way to post was a collapsed "▾ 5 more events" list where every row carried its
 * own "Make post" button. Three things were wrong with that:
 *   1. 🔴 THE DATE IS NOT WHAT AN OPERATOR RECOGNISES AN EVENT BY. They know "the Kings Arms one". The
 *      venue is the identity; the date is when it is.
 *   2. ⛔ A BUTTON PER ROW IS A SECOND DOOR TO ONE MODAL, and it skipped the caption box entirely —
 *      which is how an edited caption would have been silently discarded for every event but the first.
 *   3. ⚠️ THE THREE SOONEST EVENTS WERE BEHIND A PRESS. A truck's next few days is the thing this card
 *      is for; collapsing it to save four lines hid the common case to make room for the rare one.
 *
 * 🔴 SO: ONE CHOSEN EVENT AT THE TOP, three rows under it to change it, and the rest behind the press.
 * Picking a row changes what the card is about — the heading's event, the button's words, and the
 * caption — and there is exactly one button that opens the modal.
 */
function NextEventHalf({
  token, events, photoSpace, standardUrl, standardW, standardH, placeImageUrl, onPost,
  chosenId, onChoose,
}: {
  /** 🔴 For `EventPostTile`, which renders the chosen event's real post. */
  token: string
  events: readonly PostEvent[]
  /** Whether the single event design has a photo space — it decides "photo" vs "poster" in the line. */
  photoSpace: boolean
  standardUrl: string | null
  standardW: number | null
  standardH: number | null
  placeImageUrl: (placeId: string | null) => string | null
  onPost: (eventId: string) => void
  /** 🔴 Held by the PARENT, because the caption box below this card is filled from the same choice. */
  chosenId: string | null
  onChoose: (id: string) => void
}) {
  /* 🔴 THE DEFAULT IS THE NEXT **PUBLIC** EVENT, not the next event. There is no post for a private
   * booking — the route refuses `event_post` for one — so a private event can never be the chosen one.
   * ⚠️ IT STILL APPEARS IN THE LIST BELOW, greyed, in its date position, because leaving it out would
   * make the operator's own diary look wrong. */
  const postable = events.filter(e => !e.isPrivate)
  const chosen = postable.find(e => e.id === chosenId) ?? postable[0] ?? null
  /* ⚠️ THE PICKER LISTS EVERY EVENT **EXCEPT THE CHOSEN ONE**, privates included. ⛔ NOT "except the
   * first": once the operator has picked the third event, the first belongs back in the list — a
   * picker that could not take you back to where you started would be a one-way door. */
  const others = events.filter(e => e.id !== chosen?.id)

  if (!chosen && others.length === 0) {
    return <p className="py-3 text-sm text-slate-400">{NO_UPCOMING_EVENTS}</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-next-event-half>
      {/* ══ 🔴 THE TILE, THEN ONE LINE, THEN A DROPDOWN — THE WEEKLY HALF'S SHAPE (10 October 2026) ═══
        *
        * ⛔ **WHAT WENT, AND DOMINIC ASKED FOR ALL OF IT:** the "YOUR NEXT EVENT" heading above the
        * picture, the venue/area/date/times block beside it, and the expanding "or pick another event"
        * list below. 🔴 THE PICTURE IS THE POST NOW (see `PostTile`), and the post already prints the
        * venue, the date and the times — so the block beside it was the same facts a second time, in
        * smaller type, next to a picture of them.
        * ⚠️ AND THE TWO HALVES NOW MATCH: a centred tile, a grey line under it, a labelled `<select>`.
        * ⛔ THE SELECT IS AT THE SAME HEIGHT IN BOTH, which is why the line under the tile is one line
        * in each — two halves whose controls sit at different heights read as two unrelated cards. */}
      <div className="flex flex-col items-center">
        <PostTile token={token} kind="event" eventId={chosen?.id ?? null}
          fallbackUrl={placeImageUrl(chosen?.placeId ?? null) ?? standardUrl}
          w={standardW} h={standardH} />
      </div>
      {/* 🔴 THE GREY LINE NAMING THE IMAGE, MOVED UNDER THE TILE. ⚠️ THE **CLIENT** DOES NOT DECIDE
        * photo-vs-poster: `imageSource` already says, from the server. `photoSpace` is only the
        * fallback for a payload from before that field existed, so the line is never blank. */}
      <p className="mt-2 text-center text-[11px] text-slate-400" data-image-source>
        {chosen
          ? imageSourceLine(
            chosen.imageSource
              ?? (placeImageUrl(chosen.placeId) ? (photoSpace ? 'place-photo' : 'place-poster') : 'standard'),
            chosen.placeName ?? chosen.venue,
          )
          : ''}
      </p>
      {/* ⚠️ "Which event" TO THE WEEKLY HALF'S "Which week" — the same label shape, the same control,
        * the same place on the card. ⛔ EVERY EVENT IS IN IT, privates included and `disabled`, because
        * leaving them out would make the operator's own diary look wrong — the rule the old list had. */}
      <label className="mt-3 block text-xs font-bold text-slate-600" htmlFor="which-event">Which event</label>
      <select id="which-event" value={chosen?.id ?? ''} data-event-select
        onChange={e => onChoose(e.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
        {events.map(ev => (
          <option key={ev.id} value={ev.id} disabled={ev.isPrivate}>
            {shortDate(ev.date)} · {ev.isPrivate ? PRIVATE_EVENT_ROW : (ev.venue ?? '—')}
            {!ev.isPrivate && ev.town ? ` · ${ev.town}` : ''}
          </option>
        ))}
      </select>

      {/* ══ 🔴 THE BUTTON IS AT THE FOOT OF THE HALF, SO THE TWO ORANGE BUTTONS LINE UP ════════════
        * ⛔ IT SAT DIRECTLY UNDER THE CHOSEN EVENT, ABOVE "OR PICK ANOTHER EVENT" — and the weekly
        * card's button is pinned to the bottom of its own half. So the two primary buttons on the
        * screen sat at two different heights, which is what Dominic reported: the eye reads two
        * choices of one kind and finds them out of step.
        * 🔴 `mt-auto` IN A `flex-1 flex-col`, THE SAME MECHANISM THE WEEKLY HALF USES — both buttons
        * are now the last thing before the caption block, and the caption is the same component at the
        * same `rows={5}` in both, so they line up at every width rather than at one.
        * ⚠️ ITS WORDS STILL SAY WHICH EVENT IT IS ABOUT — "next event" while the first is chosen,
        * "this event" once another has been picked — so moving it below the picker costs nothing: the
        * button names its own subject. */}
      {chosen && (
        <div className="mt-auto pt-3" data-post-action>
          <button type="button" data-primary className={`${BTN_PRIMARY} w-full`}
            onClick={() => onPost(chosen.id)}>
            {chosen.id === postable[0]?.id ? CREATE_FOR_NEXT : CREATE_FOR_THIS}
          </button>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CAPTION EDITOR — TEXT PLUS CHIPS (8 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE BRIEF'S HARD REQUIREMENT IS "shown as small pale-orange chips (never raw codes like {place})"
// AND "chips can be deleted like a character and moved by typing around them". Those two together rule
// out the two obvious implementations:
//
//   • A `<textarea>` showing `{place}` — raw codes, which the brief forbids outright.
//   • A rich-text editor with real inline widgets — `contentEditable`, a selection model, a paste
//     sanitiser and an undo stack. That is a component, not a feature, and this product has one drag
//     surface precisely because the second of anything is the second set of its bugs.
//
// 🔴 SO IT IS A `contentEditable` DIV WITH THE CHIPS AS **`contentEditable={false}` SPANS**, and the
// browser's own editing engine does the rest. That is the whole trick: a false-editable inline element
// inside an editable host is treated by every engine as ONE character — Backspace deletes it whole, the
// caret steps over it, and typing on either side puts text on either side. ⚠️ WHICH IS EXACTLY WHAT THE
// BRIEF ASKS FOR, and it is the browser's behaviour rather than ours to maintain.
//
// ⛔ THE VALUE IS READ BACK OUT OF THE DOM, NOT HELD IN REACT STATE. A controlled `contentEditable` is
// the classic way to destroy a caret: React re-renders, the DOM node is replaced, and the cursor jumps
// to the start on every keystroke. 🔴 SO REACT RENDERS IT **ONCE** (`key` on the location/kind) and
// never again from state; `onInput` serialises the DOM and hands the string to the debounced save.

/* ⛔ `captionChipHtml`, `captionHtml` AND `captionFromDom` MOVED TO `lib/weekly-post/caption-chips.ts`
 * ON 10 OCTOBER 2026, with the chip delete that had to go with them. The reason is in that file's
 * header and it is not tidiness: **deleting a chip cleared the whole template in WebKit**, the engine
 * this product is used in, and a behaviour that differs between engines has to be driven in a real one
 * to be believed. A handler closed over a React ref cannot be; an exported DOM function can, and
 * `scripts/caption-chips-render.cjs` presses a real Backspace against it in both. */

/**
 * ══ 🔴 §5 · THE CAPTION FOR **THIS** POST, AND THE WAY INTO THE TEMPLATE ══════════════════════════
 *
 * ⛔ WHAT WAS HERE: the chip editor, directly, with a debounced autosave and "Saved automatically ·
 * used next time too" under it. So the only caption on the card was the TEMPLATE — tokens and all —
 * and every keystroke went to the database. Two things followed, and both were wrong:
 *   1. 🔴 THE OPERATOR COULD NOT CHANGE ONE POST. Editing the caption for tonight's event edited the
 *      caption for every event, for ever, and the note said so out loud.
 *   2. ⛔ THE CAPTION THEY WERE LOOKING AT WAS NOT THE CAPTION THEY WOULD POST. "Pizza Kitchen at
 *      {venue}, {area} on {day-date}" is a template; the post says "Pizza Kitchen at The Kings Arms,
 *      Lavenham on Wednesday". Reading one and posting the other is not a preview.
 *
 * 🔴 SO THE BOX IS A PLAIN `<textarea>` HOLDING THE **FILLED** CAPTION, and the template is behind a
 * link. ⚠️ A `<textarea>` AND NOT A `contentEditable`: there are no chips in it, nothing to style, and
 * a textarea gets the platform's own spellcheck, caret and undo for free — all three of which the chip
 * editor had to work around.
 *
 * ⚠️ TYPING IS **NEVER SAVED**. The edited text lives in this component and travels to the modal; the
 * template row is untouched unless the operator opens the panel and presses Save.
 */
function PostCaption({ kind, filled, template, busy, onSave, onTextChange }: {
  kind: CaptionKind
  /** 🔴 The template, filled in for the chosen event. ⚠️ Changing it REPLACES the box — see the `key`. */
  filled: string
  /** The raw template, for the panel. */
  template: string
  busy: boolean
  onSave: (template: string) => Promise<void>
  /** 🔴 Reported up so the post modal shares what is in the box. */
  onTextChange: (text: string) => void
}) {
  const [editingTemplate, setEditingTemplate] = useState(false)
  /* ⛔ THE BOX'S VALUE IS LOCAL STATE SEEDED FROM `filled`, and the `key` at the call site is what
   * re-seeds it when the chosen event changes. ⚠️ A `value={filled}` CONTROLLED BOX WOULD BE
   * UNTYPEABLE and a `defaultValue` would never refresh — the keyed-remount is the one shape that does
   * both, and it is the same trick the chip editor used for the same reason. */
  const [text, setText] = useState(filled)

  /* ⚠️ THE PARENT IS TOLD ON MOUNT TOO, not only on a keystroke: the modal has to be able to share the
   * UNEDITED caption, which is the overwhelmingly common case. ⛔ AN EFFECT, because a parent's state
   * must not be set during this component's render. */
  useEffect(() => { onTextChange(text) }, [text, onTextChange])

  return (
    <div className="mt-3 border-t border-slate-100 pt-3" data-post-caption={kind}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{CAPTION_HEADING}</p>
        {/* 🔴 THE LINK IS TOP RIGHT OF THE CAPTION, which is where a "settings for this thing" control
          * belongs — and it is the only way to the template, so the box below cannot be mistaken for
          * one. */}
        {!editingTemplate && (
          <button type="button" data-edit-template onClick={() => setEditingTemplate(true)}
            className="text-[11px] font-semibold text-slate-600 underline hover:no-underline">
            {EDIT_TEMPLATE_LINK}
          </button>
        )}
      </div>

      {editingTemplate ? (
        /* ⚠️ **IN PLACE OF** THE BOX, NOT UNDER IT. Two caption fields on one card, one of them full of
         * tokens, is the confusion this whole section exists to remove. */
        <CaptionEditor
          kind={kind}
          initial={template}
          busy={busy}
          onCancel={() => setEditingTemplate(false)}
          onSave={async t => {
            await onSave(t)
            setEditingTemplate(false)
          }}
        />
      ) : (
        <>
          <textarea
            data-caption-text
            value={text}
            disabled={busy}
            onChange={e => setText(e.target.value)}
            rows={5}
            className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400" data-caption-note>
            {CAPTION_THIS_POST_NOTE}
          </p>
        </>
      )}
    </div>
  )
}

function CaptionEditor({ kind, initial, busy, onSave, onCancel }: {
  kind: CaptionKind
  initial: string
  busy: boolean
  onSave: (template: string) => Promise<void>
  /** 🔴 §5 · Back to the caption box, with nothing written. */
  onCancel: () => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /* ══ ⛔ THE DEBOUNCED AUTOSAVE IS GONE — 9 OCTOBER 2026 ════════════════════════════════════════════
   *
   * IT WAS A 1s DEBOUNCE WITH "Saved automatically" AND A FADING TICK, and it was right for the shape
   * this editor used to have: it WAS the caption field, always on screen, and a truck's words had to
   * survive them closing the tab. 🔴 IT IS A PANEL THE OPERATOR OPENS ON PURPOSE NOW, and autosave is
   * wrong for a panel with a Cancel button — "Cancel" after fourteen keystrokes have already been
   * written is a button that cannot do what it says.
   * ⚠️ SO THERE IS ONE WRITE, ON Save, AND THE TIMERS WENT WITH IT. Nothing here can fire against an
   * unmounted component, which is what the two `clearTimeout`s in the cleanup existed to prevent.
   */

  const save = () => {
    const host = hostRef.current
    if (!host) return
    setSaving(true); setErr(null)
    void onSave(captionFromDom(host))
      .catch(e => setErr(e instanceof Error ? e.message : 'That did not save.'))
      .finally(() => setSaving(false))
  }

  /**
   * Insert a chip at the caret.
   *
   * 🔴 `document.execCommand('insertHTML')` IS DELIBERATE AND IS NOT A RELIC. It is the only call that
   * inserts at the caret **and joins the browser's own undo stack**, so ⌘Z after pressing a label
   * removes the chip rather than skipping back past the operator's last sentence. The modern
   * replacement (Range surgery) does neither. It is deprecated and universally supported; the day that
   * changes, the fallback below is what runs.
   * ⚠️ THE EDITOR IS FOCUSED FIRST, because `insertHTML` with no caret inside the host inserts nowhere.
   */
  const insert = (id: CaptionLabelId, label: string) => {
    const host = hostRef.current
    if (!host) return
    host.focus()
    const html = captionChipHtml(id, label) + '&nbsp;'
    let done = false
    try { done = document.execCommand('insertHTML', false, html) } catch { done = false }
    if (!done) {
      /* ⛔ THE FALLBACK APPENDS RATHER THAN GUESSING AT THE CARET. A chip in the wrong place is worse
       * than a chip at the end, which the operator can drag a word past. */
      host.insertAdjacentHTML('beforeend', html)
    }
  }

  /**
   * ══ 🔴 DELETING A CHIP DELETED THE WHOLE TEMPLATE — REPORTED 10 OCTOBER 2026 ═══════════════════
   *
   * ⛔ DOMINIC: *"i tried to delete the 'list of days' from the template but it cleared all the
   * template."* The comment at the top of this section claimed every engine treats a
   * `contenteditable="false"` span as one character. Chromium does; **WebKit does not** — and WebKit is
   * the engine this product is used in.
   * 🔴 THE TWO DELETE KEYS ARE OURS NOW, AND ONLY FOR THE CHIP CASE: `handleChipDeleteKey` removes that
   * one node and returns true, and everything else is handed straight back to the browser.
   * ⚠️ THE LOGIC IS IN `lib/weekly-post/caption-chips.ts` so a real browser can be made to press a real
   * Backspace against it — see that file's header, and `scripts/caption-chips-render.cjs`.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (host && handleChipDeleteKey(host, e.key)) e.preventDefault()
  }

  /**
   * ══ 🔴 CUT, COPY AND PASTE CARRY THE **TOKEN**, WHICH IS HOW A CHIP MOVES ═══════════════════════
   *
   * ⛔ DOMINIC ASKED FOR A CHIP TO BE *"deleted and moved correctly as an editor"*, and moving it was
   * the half that silently corrupted the template: the clipboard took the chip's **label** ("List of
   * days"), because that is the text the span displays — so cutting a chip and pasting it two lines
   * down replaced a token with three ordinary words, and the caption quietly stopped filling it in.
   */
  const onCopyOrCut = (e: React.ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const host = hostRef.current
    const text = host ? selectionAsTemplate(host) : ''
    if (!text) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', text)
    if (cut) window.getSelection()?.deleteFromDocument()
  }

  const title = kind === 'week' ? CAPTION_WEEK_TITLE : CAPTION_EVENT_TITLE

  return (
    <div className="mt-1" data-caption-editor={kind}>
      {/* ⚠️ THE PANEL NAMES ITSELF AND SAYS WHAT IT GOVERNS. "Caption template" alone would leave the
        * operator guessing whether it is this post's or every post's — which is the one thing the box
        * it replaced got wrong. */}
      <p className="text-sm font-bold text-slate-900">{TEMPLATE_PANEL_TITLE}</p>
      <p className="text-[11px] text-slate-400">
        {kind === 'week' ? TEMPLATE_PANEL_BLURB_WEEK : TEMPLATE_PANEL_BLURB}
      </p>
      {/* ⚠️ `suppressContentEditableWarning` BECAUSE REACT IS RIGHT TO WARN IN GENERAL AND WRONG HERE:
        * the warning is about React managing children it does not own, and this editor deliberately
        * hands the children to the browser after the first render. The `key` at the call site is what
        * makes a NEW template mount a NEW editor rather than fighting the caret. */}
      <div
        ref={hostRef}
        contentEditable={!busy}
        suppressContentEditableWarning
        data-caption-input
        role="textbox"
        aria-multiline="true"
        aria-label={title}
        /* ⛔ NO `onInput` HANDLER. Nothing is saved until Save is pressed, and the browser owns the
         * field's contents between the first render and that press — which is the whole point of
         * `suppressContentEditableWarning` above. */
        /* ⛔ PASTE IS FORCED TO PLAIN TEXT. Without this, pasting from a word processor brings fonts,
         * colours and `<style>` blocks into a field whose value is read back as text — and a pasted
         * `<span contenteditable="false">` could even masquerade as a chip. */
        onKeyDown={onKeyDown}
        onCopy={e => onCopyOrCut(e, false)}
        onCut={e => onCopyOrCut(e, true)}
        onPaste={e => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          /* 🔴 ANY `{token}` IN THE PASTE COMES BACK AS A CHIP. `captionHtml` is the same function that
           * drew the field in the first place, so a pasted template and a loaded one cannot differ.
           * ⚠️ PLAIN TEXT WITH NO TOKEN TAKES THE OLD PATH — `insertText` keeps the browser's undo
           * stack, which `insertHTML` on an ordinary paste would not be worth losing. */
          try {
            if (hasCaptionToken(text)) document.execCommand('insertHTML', false, captionHtml(text))
            else document.execCommand('insertText', false, text)
          } catch { /* the field keeps its value */ }
        }}
        className="mt-1 min-h-[6rem] w-full whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-300"
        dangerouslySetInnerHTML={{ __html: captionHtml(initial) }}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-caption-labels>
        {labelsFor(kind).map(l => (
          <button key={l.id} type="button" disabled={busy} data-caption-add={l.id}
            onClick={() => insert(l.id, l.label)}
            className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50">
            {captionAddLabel(l.label)}
          </button>
        ))}
      </div>
      {/* 🔴 SAVE AND CANCEL, IN THAT ORDER. ⚠️ Save is the orange one because it is the thing the panel
        * was opened to do; Cancel is outlined because going back is not an action on the data. */}
      <div className="mt-2 flex items-center gap-1.5">
        <button type="button" disabled={busy || saving} onClick={save} data-template-save
          className={`${BTN_PRIMARY}`}>{saving ? 'Saving…' : TEMPLATE_SAVE}</button>
        <button type="button" disabled={saving} onClick={onCancel} data-template-cancel
          className={BTN_OUTLINE}>{TEMPLATE_CANCEL}</button>
      </div>
      {err && <p className="mt-1 text-[11px] text-red-600">{err}</p>}
      {/* ⚠️ THE NOTE SAYS WHAT THE ORANGE WORDS **ARE** and what Saving reaches. An operator looking at
        * a field full of chips needs the first; one about to press Save needs the second. */}
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400" data-template-note>
        {TEMPLATE_PANEL_NOTE}
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE LOCATIONS SUB-TAB (7 October 2026) — A TABLE, AND ONE LOCATION'S TWO IMAGES
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ WHAT THIS REPLACES, AND WHY IT IS SMALLER: "Location images" was a list that opened a PAGE per
// location, and that page was a picture library — a grid, a ★ Main, a Make main / Rename menu, and a
// sentence explaining that the Main one was used automatically. Every one of those exists because a
// location could have any number of pictures and only one of them was used.
//
// 🔴 A LOCATION HAS **THREE** PICTURES, ONE PER JOB — a WEEKLY post picture, an EVENT post picture and
// a POSTER — so there is nothing to browse, nothing to promote and nothing to explain. Three boxes with
// a drop area and a Remove say the whole model, and "which one is used" is answered by the box's title.
// ⚠️ IT WAS TWO FROM 7 OCTOBER AND ONE-PLUS-AN-OVERRIDE FROM 9 OCTOBER, and the reason it is three now
// is that "one picture used everywhere" had two consequences nobody could see: a logo chosen for a
// 180px line on a weekly poster was also the photo cropped into a 1080px space on an event post.
//
// ⚠️ TABLE LEFT, SELECTED LOCATION RIGHT, side by side from 900px and stacked below it — the same
// breakpoint Create a post uses, for the same measured reason.

/* ⛔ `SlotBoxCopy` WENT WITH `SlotBox`. `PictureBox` takes `title` and `blurb` as two plain props,
 * because there is no longer a case where the pair is computed and passed around together. */
/* ══ ⛔ TOMBSTONE · `SlotBox` — DELETED 9 OCTOBER 2026 ════════════════════════════════════════════
 * It was the poster/picture box on Location settings: a 70px `object-cover` tile, the file name beside
 * it, and Replace and Remove stacked in a column. `PictureBox` below replaces it on that screen.
 * 🔴 IT WAS KEPT UNRENDERED FOR ABOUT TEN MINUTES, with a note saying the event modal's one-off upload
 * might want it — and then deleted, because that is exactly what dead code with an excuse attached
 * looks like. The modal has its own control and always has.
 * ⚠️ WHAT WENT WITH IT, in case it is wanted again: `object-cover` CROPPED the preview (a wide logo
 * showed as its middle third), the tile took its aspect ratio from the standard design so an empty
 * poster box still said what shape was wanted, and "Replace" was a second button that did what
 * dropping a file does. The first is a bug, the second is a real loss — see the report — and the third
 * is the one the brief removed. */

/**
 * ══ 🔴 ONE OF THE THREE PICTURE BOXES (9 October 2026) ════════════════════════════════════════════
 *
 * ⛔ IT REPLACES `SlotBox` ON THIS SCREEN, and the differences are all the brief's:
 *   • **A LARGE PREVIEW, AND THE PICTURE IS SHOWN WHOLE.** `SlotBox` drew a 70px tile with
 *     `object-cover`, which CROPS — so a wide logo appeared as its middle third and an operator
 *     checking they had uploaded the right file was shown something that was not quite it.
 *     `object-contain` on a fixed-height area shows the picture, letterboxed, which is what a preview
 *     is for. ⚠️ THE HEIGHT IS THE SAME IN ALL THREE, which is what makes the boxes equal.
 *   • **Remove ONLY, NO Replace.** Replace was a second button that did what dropping a new file does;
 *     two presses for one outcome, on the box with the least room. ⚠️ A FILLED BOX IS THEREFORE
 *     Remove-then-upload, which is one more press in the rare case and one fewer button in every case.
 *   • **A DASHED DROP AREA WHEN EMPTY**, which says "you may drop here" without a sentence — and
 *     drag-and-drop actually works, rather than the dashes being decoration.
 *
 * ⚠️ THE FILE INPUT IS STILL A `<label>` ROUND A HIDDEN `<input type="file">`. The native control is
 * the only thing that opens a file picker without a user-gesture problem on Safari, and a
 * `<label htmlFor>` is the only way to style it.
 */
function PictureBox({ title, blurb, slotKey, image, busy, onUpload, onRemove, borrow, dropLabel }: {
  title: string
  blurb: string
  /** Only for the input's `id`, so three boxes on one screen cannot share one. */
  slotKey: string
  image: SlotImage | null
  busy: boolean
  onUpload: (file: File) => void
  onRemove: () => void
  /** "Use the … picture", or null when there is nothing to borrow. */
  borrow: { label: string; onClick: () => void } | null
  dropLabel?: string
}) {
  const inputId = `pic-${slotKey}`
  /* ⚠️ `over` IS PURELY VISUAL and it is per box, so dragging across the row highlights one at a time.
   * ⛔ `dragleave` FIRES WHEN THE POINTER CROSSES INTO A **CHILD** of the drop area, so the flag would
   * flicker off over the preview and the button. The counter is what makes it honest: enter and leave
   * are balanced, and only a zero means the pointer has really gone. */
  const [depth, setDepth] = useState(0)
  const over = depth > 0

  /** ⚠️ ONE PATH FOR A DROP AND FOR THE FILE DIALOG, so neither can take a file the other refuses. */
  const take = (f: File | undefined | null) => { if (f) onUpload(f) }

  return (
    /* ══ 🔴 §1 · THE THREE BOXES LINE UP — A FLEX COLUMN WITH THE DESCRIPTION TAKING THE SLACK ════════
     *
     * ⛔ **DOMINIC, 10 OCTOBER, ON THE SCREEN ITSELF:** *"when the images are empty in location
     * settings, make sure the upload box lines up — currently it sits below the text, which has
     * different lengths. Best to move the upload box to the bottom so they line up."* And: *"the same
     * when they are uploaded — the images should line up."* And: *"the pictures are wider than the box
     * they're in; the remove button is not in the box either."*
     *
     * ⛔ **THIS REPLACES `grid-rows-subgrid`, WHICH WAS THE WRONG TOOL AND IS GONE.** It did line the
     * rows up in every measurement this repository took — three boxes adopting the parent's four rows,
     * each row as tall as the tallest — and the operator's own screen still showed the Upload buttons at
     * three different heights. ⚠️ I COULD NOT REPRODUCE THAT, and the report says so plainly: the
     * compiled stylesheet the dev server is serving right now **does** carry `.grid-rows-subgrid`,
     * `.grid-cols-[minmax(0,1fr)]` and the pane's own `minmax` track, and the WebKit measurement passed
     * at 1100, 1280 and 1728. 🔴 SO THE FIX IS NOT A SECOND ATTEMPT AT THE SAME MECHANISM. Subgrid put
     * the alignment in the hands of a layout feature whose failure mode I cannot see from here; what
     * replaces it cannot have that failure mode at all:
     *
     *   • **A FLEX COLUMN**, and `grow` on the DESCRIPTION. The grid still stretches the three boxes to
     *     one height — that part was never in doubt — and the description absorbing the slack pushes the
     *     preview and the Remove row to the FOOT of every box. Two fixed heights above the bottom edge
     *     of three equal boxes is the same y, by arithmetic rather than by a track-sizing rule.
     *   • **THE FOOTER ROW IS `h-7` WHETHER OR NOT THERE IS A PICTURE.** ⛔ THIS IS THE BIT THAT WOULD
     *     HAVE BROKEN IT: the row is empty in an empty box, so bottom-aligning without a fixed height
     *     would sit an empty box's preview 28px LOWER than a filled one's — the brief's "the images
     *     should line up" failing between exactly the two states the screen shows at once.
     *   • **NOTHING IN THE BOX REPORTS A MAX-CONTENT WIDTH ANY MORE**, because the file name is gone
     *     (below), so the overflow §1 was written about has no contributor left. A flex column's items
     *     stretch to the content box; a `w-full object-contain` picture inside a fixed-height area is
     *     contained; and `min-w-0` keeps the box itself from asking the 3-column track for more.
     *
     * ⚠️ WHAT IS LOST WITH SUBGRID: the TITLE and the DESCRIPTION are no longer forced to equal heights
     * between boxes — only everything from the preview down is. That is invisible here because all three
     * titles are one line, and it is the honest trade: the operator's complaint is about the previews and
     * the buttons, which is what the bottom edge now governs. ⛔ IF A TITLE EVER WRAPS IN ONE BOX ONLY,
     * the descriptions will start at different heights again — and that is fine, because they already
     * END at different heights and always will.
     */
    <div data-picture-box={slotKey}
      className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {/* 🔴 `grow` IS THE WHOLE ALIGNMENT. It is on the description because the description is the one
        * thing here whose height differs between the three boxes — one, two and two lines at a third of
        * this pane — so it is the one that should absorb the difference. */}
      <p className="mt-0.5 grow text-xs leading-relaxed text-slate-500">{blurb}</p>

      {/* 🔴 THE PREVIEW AREA — ONE FIXED HEIGHT, WHATEVER IS IN IT, which is half of what makes the
        * three previews line up. The other half is the footer's fixed height below. */}
      <div
        onDragEnter={e => { e.preventDefault(); setDepth(d => d + 1) }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={() => setDepth(d => Math.max(0, d - 1))}
        onDrop={e => {
          e.preventDefault()
          setDepth(0)
          take(e.dataTransfer?.files?.[0])
        }}
        data-drop-area
        className={`relative mt-2 flex h-[132px] min-w-0 items-center justify-center overflow-hidden rounded-lg border ${image
          ? 'border-slate-200 bg-slate-50'
          : `border-2 border-dashed ${over ? 'border-orange-400 bg-orange-50' : 'border-slate-300 bg-slate-50'}`}`}>
        {image?.url
          /* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring Supabase URL. */
          ? <img src={image.url} alt="" className="h-full w-full object-contain" />
          : (
            <div className="min-w-0 px-2 text-center">
              <p className="text-[11px] font-semibold text-slate-400">{dropLabel ?? DROP_A_PICTURE}</p>
              <label htmlFor={inputId} data-upload
                className={`mt-1.5 inline-flex cursor-pointer items-center rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                {SLOT_UPLOAD}
              </label>
              {/* ══ 🔴 THE BORROW LINK IS **PINNED TO THE FOOT OF THE DROP AREA** ═══════════════════
                * ⚠️ IT IS STILL INSIDE THE EMPTY AREA, because it is the other way to fill this box and
                * putting it outside would make it look like a setting.
                * ⛔ BUT IT USED TO SIT IN THE SAME CENTRED STACK AS Upload, AND THAT IS A BUG THE
                * MEASUREMENT CAUGHT: only ONE of the three boxes is ever offered a borrow, so that box's
                * stack was one line taller and centring put its Upload button **11px higher** than the
                * other two — *"make sure the upload box lines up"*, failing for a reason that had
                * nothing to do with the descriptions above. 🔴 TAKING IT OUT OF THE FLOW is what fixes
                * it: Upload is centred on the same two lines in every box, filled or empty, offered a
                * borrow or not. */}
              {borrow && (
                <button type="button" disabled={busy} onClick={borrow.onClick} data-borrow
                  className="absolute inset-x-2 bottom-1.5 block text-[11px] font-semibold text-slate-600 underline hover:no-underline disabled:text-slate-300">
                  {borrow.label}
                </button>
              )}
            </div>
          )}
      </div>

      {/* ⚠️ THE INPUT LIVES OUTSIDE THE CONDITIONAL so the `htmlFor` above always has a target. */}
      <input id={inputId} type="file" accept="image/png,image/jpeg" className="absolute hidden" disabled={busy}
        onChange={e => { take(e.target.files?.[0]); e.currentTarget.value = '' }} />

      {/* ══ 🔴 THE FOOTER IS `h-7` WHETHER OR NOT THERE IS A PICTURE ══════════════════════════════════
        * ⛔ AN EMPTY BOX RENDERS NOTHING IN IT, and that is exactly why the height is fixed rather than
        * left to the contents: the previews are lined up by the box's BOTTOM edge now, so a footer that
        * collapsed to nothing in two boxes and stood 28px tall in the third would put their previews at
        * two different heights — the very thing the operator reported.
        * ⛔ **THE FILE NAME IS GONE — Dominic, 10 October: "remove the photo name eg Screenshot
        * 2026-10-05 at 11.11.21.png".** The brief had asked for it truncated with an ellipsis; the
        * operator asked for it removed, which is the later instruction and the better one — a Supabase
        * file name tells a truck nothing they cannot see in the preview above it, and it was the one
        * thing in this box that ever reported a max-content width. ⚠️ `fileName` IS STILL STORED AND
        * STILL SENT (the route writes `file_name`), so nothing is lost but the line. */}
      <div className="mt-2 flex h-7 min-w-0 items-center justify-end">
        {image && (
          <button type="button" disabled={busy} onClick={onRemove} data-remove
            className="shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">
            {SLOT_REMOVE}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * ══ 🔴 §3 · ONE LOCATION PICTURE, AS A COMPACT CARD FOR A PHONE (10 October 2026) ════════════════
 *
 * ⛔ **IT IS NOT A NARROWER `PictureBox`, AND IT SHOULD NOT BE.** That component is three equal boxes
 * side by side with a 132px preview each, and the thing that makes it work — a flex column whose
 * description absorbs the slack so the previews line up — has nothing to line up with when there is
 * one card per row. ⚠️ THE BRIEF ASKED FOR A DIFFERENT SHAPE, not a smaller one: *"a 72px thumbnail (or
 * a dashed empty square), title, one grey line, and a 'Remove' or 'Upload' button."*
 *
 * 🔴 **BOTH VARIANTS ARE RENDERED AND CSS CHOOSES, WHICH IS WHY THE INPUT ID IS PREFIXED.** The phone
 * cards and the desktop boxes are both in the tree, shown and hidden by `md:` classes — no media-query
 * hook, no hydration mismatch and no frame of the wrong layout. ⛔ BUT TWO `<label htmlFor>` PAIRS WITH
 * THE SAME id WOULD BOTH BIND TO THE FIRST INPUT, so a tap on the phone card's Upload would open the
 * desktop box's file picker. The prefix is what keeps them apart, and it is why `slotKey` is not
 * enough on its own.
 */
function PhonePictureCard({ title, line, slotKey, image, busy, onUpload, onRemove, borrow }: {
  title: string
  /** The one grey line. ⚠️ Not the desktop blurb — see `PHONE_PIC_EVENT_LINE` and its note. */
  line: string
  slotKey: string
  image: SlotImage | null
  busy: boolean
  onUpload: (file: File) => void
  onRemove: () => void
  /** "Use the … picture", or null. ⚠️ Only ever offered on an EMPTY card — see the desktop box. */
  borrow: { label: string; onClick: () => void } | null
}) {
  const inputId = `pic-phone-${slotKey}`
  return (
    <div data-phone-pic-card={slotKey}
      className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
      {/* ══ 🔴 72px, FIXED, AND `shrink-0` ══════════════════════════════════════════════════════════
        * ⚠️ `object-contain` LIKE THE DESKTOP PREVIEW, not `object-cover`: a wide logo shown as its
        * middle third is the bug the desktop box fixed, and a smaller thumbnail is no reason to
        * reintroduce it. ⛔ AN EMPTY ONE IS A DASHED SQUARE — the brief's own word — which says "a
        * picture goes here" without a sentence. */}
      <div data-phone-thumb
        className={`flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg ${image
          ? 'border border-slate-200 bg-slate-50'
          : 'border-2 border-dashed border-slate-300 bg-slate-50'}`}>
        {image?.url && (
          /* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring Supabase URL. */
          <img src={image.url} alt="" className="h-full w-full object-contain" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight text-slate-900">{title}</p>
        {/* ⚠️ ONE LINE, AND IT IS ALLOWED TO WRAP. `line-clamp-2` rather than `truncate`: these lines
          * are 36–43 characters and wrap to two at 390px, and a cut-off description tells the operator
          * less than a wrapped one. The CARD's height follows it, which is fine — these are stacked. */}
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 line-clamp-2">{line}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {image ? (
            <button type="button" disabled={busy} onClick={onRemove} data-phone-remove
              className="shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">
              {SLOT_REMOVE}
            </button>
          ) : (
            <label htmlFor={inputId} data-phone-upload
              className={`inline-flex shrink-0 cursor-pointer items-center rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
              {SLOT_UPLOAD}
            </label>
          )}
          {/* ⚠️ THE BORROW LINK STAYS ON THE EMPTY CARD — the brief says so, and it is the other way to
            * fill this one. ⛔ IT IS BESIDE Upload RATHER THAN UNDER IT: a 72px card has no room for a
            * third row, and `flex-wrap` lets it drop to its own line when the words are long. */}
          {borrow && (
            <button type="button" disabled={busy} onClick={borrow.onClick} data-phone-borrow
              className="text-[11px] font-semibold text-slate-600 underline hover:no-underline disabled:text-slate-300">
              {borrow.label}
            </button>
          )}
        </div>
      </div>
      {/* ⚠️ THE INPUT IS OUTSIDE THE CONDITIONAL so `htmlFor` always has a target, and `hidden` so it
        * takes no space. ⛔ ITS id CARRIES THE `pic-phone-` PREFIX — see this component's note. */}
      <input id={inputId} type="file" accept="image/png,image/jpeg" className="hidden" disabled={busy}
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = '' }} />
    </div>
  )
}

function SocialTagField({ initial, busy, onSave }: {
  initial: string
  busy: boolean
  onSave: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <div className="mt-3">
      <label className="block text-xs font-bold text-slate-600">
        {SOCIAL_TAG_LABEL} <span className="font-medium text-slate-400">{SOCIAL_TAG_HINT}</span>
      </label>
      <input value={value} onChange={e => setValue(e.target.value)} placeholder={SOCIAL_TAG_PLACEHOLDER}
        data-social-tag autoCapitalize="none" autoCorrect="off" spellCheck={false}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      <button type="button" disabled={busy} className={`${BTN_OUTLINE} mt-2`} data-save-tag
        onClick={() => onSave(value)}>
        Save tag
      </button>
    </div>
  )
}

/* ⛔ FOUR PROPS LEFT THIS COMPONENT ON 9 OCTOBER, and each went with something the screen no longer
 * does: `manageApi` wrote "Name on posts", which moved to Tidy up places; `photoSpace` and
 * `weeklyPictureOn` chose which of three amber lines to show under the picture box, and those lines
 * belonged to a "Use it on" choice that no longer exists; `onEditWeeklyDesign` / `onEditEventDesign`
 * were the links those lines carried. ⚠️ `standardW`/`standardH` STAY — the poster tile is still drawn
 * in the standard design's shape, which is how an operator sees what is being asked for. */
/** Which chip is pressed. ⚠️ Declared here because it is this component's own state and nothing
 *  else's — it previously sat beside `SlotBox` and was deleted with it. */
type LocFilter = 'all' | 'missing' | 'hidden'

function LocationsArea({
  token, places, onChanged, gate,
}: {
  token: string
  places: readonly PostPlace[]
  /* ⛔ `standardW` / `standardH` ARE NO LONGER TAKEN — 9 October 2026. They shaped the POSTER box's
   * tile to the standard design's aspect ratio, so an EMPTY poster box said what shape was wanted
   * without a number. ⚠️ THE THREE BOXES ARE THE SAME SIZE NOW, which is the brief's instruction, and a
   * box that took its own shape from a design could not be. **This is a real loss and it is in the
   * report**: an operator uploading their first poster no longer sees the target shape, only the
   * refusal if they get it wrong. The refusal still names the size. */
  onChanged: () => void
  gate: (children: React.ReactNode) => React.ReactNode
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<LocFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null)

  /* ⛔ HIDDEN LOCATIONS ARE ONLY VISIBLE UNDER THE Hidden CHIP. They are in the payload — the chip
   * needs a count — but a hidden location is one the operator has put away, and listing it in the
   * default view would undo that. */
  const visible = useMemo(() => places.filter(p => p.isHidden !== true), [places])
  const hidden = useMemo(() => places.filter(p => p.isHidden === true), [places])
  /* ══ ⚠️ "No pictures" MEANS THE TWO **PICTURES** ARE EMPTY — NOT THE POSTER ════════════════════════
   * ⛔ IT USED TO MEAN "either slot is empty", POSTER INCLUDED, and with three slots that would put
   * nearly every location on the list: a location poster is a finished design for a specific venue and
   * most trucks will never make one. A chip that matches almost everything sorts nothing.
   * 🔴 SO IT IS THE TWO PICTURES, which are the two an ordinary location wants. ⚠️ RENAMED FROM "No
   * images" to "No pictures" to match the three boxes' own word — and from "Missing images" before
   * that, because "missing" implies something ought to be there and all three are optional. */
  const missing = useMemo(
    () => visible.filter(p => !p.weeklyImage || !p.eventPhotoImage), [visible])

  const rows = useMemo(() => {
    const base = filter === 'hidden' ? hidden : filter === 'missing' ? missing : visible
    const q = search.trim().toLowerCase()
    if (!q) return base
    return base.filter(p =>
      p.name.toLowerCase().includes(q)
      || String(p.shortName ?? '').toLowerCase().includes(q)
      || String(p.area ?? '').toLowerCase().includes(q))
  }, [filter, search, hidden, missing, visible])

  const selected = places.find(p => p.id === selectedId) ?? null

  /* ══ 🔴 §3 · OPENING A LOCATION ON A PHONE IS A **HISTORY ENTRY** (10 October 2026) ═══════════════
   *
   * ⛔ THE BRIEF: *"the phone back gesture or the browser back button returns to the list."* On a phone
   * the detail is a SCREEN, and a screen you cannot leave with the gesture every other screen answers
   * is a trap — the operator's next move after the back swipe does nothing would be to leave Manage
   * altogether.
   * 🔴 `pushState` ON OPEN, `popstate` CLEARS THE SELECTION. One entry per open, never two: `closeLocation`
   * calls `history.back()` rather than clearing the state itself, so the link and the gesture leave the
   * history in exactly the same place. ⛔ CLEARING THE STATE **AND** PUSHING WOULD STRAND AN ENTRY, and
   * the operator's second back press would appear to do nothing.
   *
   * ⚠️ **THE MEDIA QUERY IS READ AT THE MOMENT OF THE TAP, NOT AT RENDER.** That is what keeps this out
   * of the hydration problem entirely: it is an event handler, so there is no server render to
   * disagree with. ⛔ AND ON A DESKTOP NOTHING IS PUSHED — the list is beside the pane, so back
   * belongs to the page, not to this card.
   * ⚠️ `onPopState` IS REGISTERED UNCONDITIONALLY and only ever CLEARS. If a phone is rotated to
   * landscape past 768px while a location is open, the pane simply becomes the right-hand pane and a
   * stray back press clears the selection — which is what the desktop "pick a location" state is.
   */
  const phoneNow = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 767px)').matches

  const openLocation = (id: string) => {
    setSelectedId(id)
    setMsg(null)
    if (phoneNow()) {
      try { window.history.pushState({ hgLocation: id }, '') } catch { /* no history ⇒ the link still works */ }
    }
  }
  const closeLocation = () => {
    /* ⚠️ IF THERE IS AN ENTRY TO POP, POP IT — the `popstate` handler is what clears the selection, so
     * the two paths end in one place. Otherwise (desktop, or a browser that refused the push) clear it
     * directly, because nothing is going to call back. */
    if (phoneNow() && window.history.state && (window.history.state as { hgLocation?: string }).hgLocation) {
      window.history.back()
      return
    }
    setSelectedId(null)
  }
  useEffect(() => {
    const onPop = () => setSelectedId(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const api = async (action: string, extra: Record<string, unknown>) => {
    const r = await fetch('/api/weekly-post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action, ...extra }),
    })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) throw new Error(String(j.error ?? 'That did not work.'))
    return j
  }

  const run = async (fn: () => Promise<unknown>, after: string) => {
    setBusy(true); setMsg(null)
    try {
      await fn()
      onChanged()
      setMsg({ text: after, bad: false })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'That did not work.', bad: true })
    } finally { setBusy(false) }
  }

  /**
   * Upload an image into one slot.
   *
   * 🔴 ONE PRESS, WHETHER IT IS Upload OR Replace. The server inserts a `place_pictures` row and points
   * the slot at it in the same request; the row the slot pointed at before stays, unreferenced and
   * undeleted, with its file.
   * ⚠️ `'event'` IS THE **POSTER'S** SLOT, `'weekly'` the weekly picture's and `'event-photo'` the
   * event picture's — the column names, not the screen's words. ⛔ `'event'` MEANING THE POSTER IS THE
   * ONE GENUINELY MISLEADING NAME IN THIS MODEL and it is kept because renaming a column is a
   * drop-and-add. See the note in lib/weekly-post/place-pictures.ts and the column comments.
   */
  const upload = (placeId: string, slot: 'event' | 'weekly' | 'event-photo') => async (file: File) => {
    setMsg(null)
    if (file.size > MAX_UPLOAD_BYTES) {
      setMsg({ text: `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 10MB.`, bad: true })
      return
    }
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setMsg({ text: 'Please choose a PNG or JPG.', bad: true })
      return
    }
    await run(async () => {
      const ext = file.type.includes('png') ? 'png' : 'jpg'
      const up = (await api('upload_url', { which: 'place-picture', ext })) as { uploadUrl: string; path: string }
      const put = await fetch(up.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!put.ok) throw new Error('The upload did not complete')
      await api('place_picture_confirm', { placeId, path: up.path, fileName: file.name, slot })
    }, 'Image saved.')
  }

  const chip = (id: LocFilter, label: string) => (
    <button key={id} type="button" data-loc-chip={id} onClick={() => setFilter(id)}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        filter === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
      {label}
    </button>
  )

  /* ══ 🔴 A ✓ OR A –, NOT A 24px THUMBNAIL (9 October 2026) ══════════════════════════════════════════
   *
   * ⛔ IT WAS A THUMBNAIL PER SLOT, 24 × 30. At that size a logo is a coloured smudge and a photo is a
   * grey rectangle — so it answered "is there one?" at the cost of looking as though it answered
   * "which one?", which it could not. ⚠️ AND A THIRD COLUMN OF THEM WOULD HAVE MADE THE ROW WIDER
   * than the names in it, which is the one thing a `table-fixed` list must not do.
   * 🔴 SO THE COLUMN ANSWERS THE QUESTION IT CAN: set, or not. A green tick in a circle and a grey
   * dash, 16px each — the full-size picture is one click away in the pane, where it is big enough to
   * recognise. ⚠️ THE DASH IS THE SAME GLYPH the rest of this product uses for nothing. */
  const tick = (image: SlotImage | null) => (
    <span className="flex justify-center" data-slot-tick={image ? 'set' : 'none'}>
      {image
        ? <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100 text-[10px] font-bold leading-none text-green-700">✓</span>
        : <span className="text-[13px] font-bold leading-none text-slate-300">–</span>}
    </span>
  )

  const msgNode = msg
    ? <p className={`mt-2 text-sm ${msg.bad ? 'text-red-600' : 'text-green-700'}`}>{msg.text}</p>
    : null

  /* ⛔ THE THREE LINES UNDER THE PICTURE BOX ARE GONE — 9 October 2026. They said "turn it on in your
   * weekly design →", "your single event design has no photo space yet →" and "this location has an
   * event poster, so…". 🔴 THE FIRST TWO BELONGED TO A CHOICE THAT NO LONGER EXISTS: a picture is used
   * wherever a design has a space, so "you chose a surface that cannot draw it" is not a state the
   * screen can produce. ⚠️ THE THIRD — the poster winning on event posts — is still TRUE and is still
   * how `planEventImages` behaves; it is simply not worth a line on a screen that no longer asks the
   * truck to choose, because nothing they did caused it. */

  return (
    /* ══ 🔴 A NARROWER TABLE — ABOUT A THIRD, NOT A HALF (8 October 2026) ══════════════════════════
     * ⛔ IT WAS `minmax(0,1fr) minmax(280px,420px)`, so the table took everything the pane did not and
     * at 1440 that is two thirds of the page for three columns, two of which are 24px wide. The pane is
     * where the work happens.
     * ⚠️ `minmax(280px,1fr)` BESIDE `minmax(0,2.6fr)` IS THE BRIEF'S OWN RATIO and it is a RATIO rather
     * than a width, so it holds at 1100 and at 1728 alike. The 280px floor is what stops a long venue
     * name squeezing the column to nothing before it truncates.
     * ⚠️ `items-start`, NOT `items-stretch`: a short pane must not be stretched to a sixty-row table's
     * height. */
    <div className="grid grid-cols-1 items-start gap-3 min-[900px]:grid-cols-[minmax(280px,1fr)_minmax(0,2.6fr)]"
      data-locations-area>
      {/* ══ 🔴 §3 (10 October 2026) · BELOW 768px THIS IS **TWO SCREENS**, NOT TWO PANES ═════════════
        *
        * ⛔ **DOMINIC, ON AN iPHONE.** Stacked, the pane sat under a sixty-row table: choosing a
        * location scrolled the three picture boxes off the bottom of the screen, so the operator tapped
        * a row and nothing appeared to happen.
        * 🔴 THE SWITCH IS **PURE CSS**, and that is deliberate. `selectedId` already exists, so "which
        * screen" is `selectedId ? detail : list` — expressed as `hidden`/`md:block` rather than through
        * a media-query hook. ⚠️ A HOOK WOULD MEAN GUESSING ON THE SERVER: the first render would be
        * desktop, and a phone would paint the wrong layout for a frame and risk a hydration mismatch.
        * ⚠️ 768px IS THE BRIEF'S BREAKPOINT — `md:` — AND IT IS NOT 900. The two-PANE grid still starts
        * at 900, untouched, so 768–899 keeps the stacked arrangement it has today, which is what *"tablet
        * (768px and up) stay exactly as they are"* asks for. ⛔ THE TWO NUMBERS ARE DIFFERENT ON PURPOSE
        * and this is the note that stops them being "tidied" into one. */}
      {/* ── LEFT · THE TABLE ──────────────────────────────────────────────────────────────────── */}
      {/* ⚠️ "Locations", AND THE CARD CARRIES NO DESCRIPTION. The PILL and the page heading say
        * "Location settings"; the page description directly above already says what the screen is for,
        * and repeating it inside the card would be the same sentence twice on one screen. */}
      {/* ⚠️ THE LIST IS HIDDEN ON A PHONE **ONLY WHILE A LOCATION IS OPEN**, and always visible from
        * 768px up. ⛔ `md:block` IS WHAT MAKES THE SECOND HALF TRUE — without it the desktop pane would
        * lose its table the moment a row was clicked. */}
      <div className={selectedId ? 'hidden md:block' : 'block'} data-loc-list-screen>
      <Box title={LOCATIONS_CARD_TITLE}>
        {gate(
          <>
            <Input label={LOCATIONS_SEARCH_LABEL} value={search} onChange={setSearch}
              placeholder="Name or area" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <div className="mt-2 flex flex-wrap gap-1.5" data-loc-chips>
              {chip('all', CHIP_ALL(visible.length))}
              {chip('missing', CHIP_NO_PICTURES(missing.length))}
              {chip('hidden', CHIP_HIDDEN(hidden.length))}
            </div>
            {/* ⛔ `max-h` AND `overflow-y-auto` ARE WHAT MAKE THE LIST SCROLL **INSIDE ITS CARD**.
              * Without a cap a truck with sixty locations grows the card, the page grows with it, and
              * the selected location's pane is off the bottom of the screen — which is the one thing a
              * two-pane screen must not do. */}
            <div className="mt-2 max-h-[30rem] min-h-0 overflow-y-auto" data-loc-table>
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <th className="w-auto py-1 text-left">{COL_LOCATION}</th>
                    {/* ══ ⚠️ WEEKLY · EVENT · POSTER — THE SAME ORDER AS THE THREE BOXES IN THE PANE ════
                      * ⛔ A TABLE WHOSE COLUMNS RAN IN A DIFFERENT ORDER FROM THE BOXES would make the
                      * operator re-learn which tick is which every time they looked from one to the
                      * other — and with three of them, two of which are "pictures", that is a mistake
                      * waiting to be made. ⚠️ THE OLD ORDER WAS POSTER THEN PICTURE; the poster is LAST
                      * now, because it is the one most trucks never set and the two pictures are what
                      * the row is usually about.
                      * ⚠️ `w-[44px]` EACH: a 16px tick centred, with room for the header's own word. */}
                    {/* ⚠️ EVENT BEFORE WEEKLY (10 October 2026) — the same order as the three boxes
                      * beside it and as the other two screens of this tab. ⛔ A TABLE WHOSE COLUMNS RUN
                      * ONE WAY AND A PANE WHOSE BOXES RUN THE OTHER is two orders on one screen, which
                      * is worse than either. */}
                    <th className="w-[44px] py-1 text-center">{COL_EVENT}</th>
                    <th className="w-[44px] py-1 text-center">{COL_WEEKLY}</th>
                    <th className="w-[44px] py-1 text-center">{COL_POSTER}</th>
                    {/* ══ 🔴 §3 · A `›` COLUMN, ON A PHONE ONLY ════════════════════════════════════
                      * ⚠️ `md:hidden` ON BOTH THE HEADER AND THE CELL, so from 768px up the column is
                      * not there at all and the table is the four columns it has always been — which
                      * is what *"desktop and tablet stay exactly as they are"* means for this table.
                      * ⛔ IT SAYS "this row goes somewhere", which on a phone it now does: the row
                      * opens its own screen. Beside a pane it would be pointing at something already
                      * on display. ⚠️ THE HEADER IS EMPTY AND THAT IS RIGHT — a column of chevrons has
                      * no name, and `aria-hidden` keeps it out of the row's announcement. */}
                    <th className="w-[20px] py-1 md:hidden" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* ⚠️ `colSpan={5}` SINCE §3 — the phone's `›` column counts. A `colSpan` that lagged
                    * the header would leave the empty-state line short of the table's width and pull a
                    * hairline across it. ⛔ THE COMMENT IS **ABOVE** THE GUARD, not inside it: a
                    * JSX comment node between `&& (` and the element is not an expression, and TS
                    * reports it as a missing `)` fifteen lines further down. */}
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="py-3 text-sm text-slate-400">
                      {places.length === 0 ? LOCATIONS_NONE : LOCATIONS_NO_MATCH}
                    </td></tr>
                  )}
                  {rows.map(pl => (
                    /* ⚠️ THE **ROW** IS THE CONTROL. ⛔ `<tr onClick>` ALONE IS NOT KEYBOARD-REACHABLE,
                     * so the name cell holds a real `<button>` and the row's click is a convenience. */
                    <tr key={pl.id} data-loc-row
                      onClick={() => openLocation(pl.id)}
                      className={`cursor-pointer ${selectedId === pl.id ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                      {/* ══ 🔴 THE NAME WRAPS TO TWO LINES INSTEAD OF BEING CUT OFF ════════════════════
                        * ⛔ IT WAS `truncate` AND `font-bold`, AND BOTH WERE WRONG HERE. "The Kings Arms
                        * at Great Finborough" became "The Kings Arms at Great Fi…" in a 200px column, so
                        * the one thing the row exists to identify was the thing it could not show — and
                        * two venues on the same street became the same row. ⚠️ `line-clamp-2` RATHER THAN
                        * UNBOUNDED WRAPPING: two lines is enough for every name in the data and keeps the
                        * rows near enough the same height to scan.
                        * ⚠️ AND WEIGHT **500**, not bold. Every row was bold, so nothing was emphasised —
                        * and a list of sixty bold names is heavier to read than a list of sixty plain
                        * ones. The AREA stays grey underneath, where it was. */}
                      <td className="min-w-0 py-1.5 pr-2 align-top">
                        <button type="button" className="block w-full min-w-0 text-left">
                          {/* ⛔ NO `block` HERE, AND THE RENDER HARNESS IS WHY. `line-clamp-2` sets
                            * `display: -webkit-box` — that is how the clamp works at all — and `block`
                            * sets `display: block`. Two classes, one property: whichever rule comes
                            * later in the compiled stylesheet wins, and `block` won. The names wrapped
                            * to THREE lines and the measurement said so.
                            * ⚠️ `line-clamp-2` IS ALREADY A BLOCK-LEVEL DISPLAY, so nothing is lost. */}
                          <span className="text-sm font-medium leading-snug text-slate-900 line-clamp-2"
                            data-loc-name>{pl.name}</span>
                          <span className="block truncate text-xs text-slate-400">
                            {pl.area ?? ''}{pl.isHidden ? (pl.area ? ' · hidden' : 'hidden') : ''}
                          </span>
                        </button>
                      </td>
                      <td className="py-1.5 align-top">{tick(pl.eventPhotoImage ?? null)}</td>
                      <td className="py-1.5 align-top">{tick(pl.weeklyImage ?? null)}</td>
                      <td className="py-1.5 align-top">{tick(pl.eventImage ?? null)}</td>
                      <td className="py-1.5 pl-1 align-top text-right text-slate-300 md:hidden"
                        aria-hidden="true" data-loc-chevron>›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>,
        )}
      </Box>
      </div>

      {/* ── RIGHT · THE SELECTED LOCATION ─────────────────────────────────────────────────────── */}
      {/* ⚠️ ON A PHONE IT IS A SCREEN AND IT IS ONLY THERE WHEN SOMETHING IS OPEN; from 768px up it is
        * the right-hand pane and is always there, showing "pick a location" when nothing is.
        * ⚠️ `md:block` IS RIGHT AND `md:flex` WOULD BE WRONG: this div is only a wrapper, and the FLEX
        * COLUMN is the `<Card>` inside it. Making the wrapper a flex container would put the Card in a
        * row of one and leave the column's own `p-4` and gaps to it. ⛔ THE FIRST VERSION OF THIS NOTE
        * SAID THE OPPOSITE of the code beside it, which is worse than no note at all. */}
      <div className={selectedId ? 'block' : 'hidden md:block'} data-loc-detail-screen>
      {/* ══ 🔴 §3 · "‹ All locations" — THE WAY BACK, ON A PHONE ONLY ═══════════════════════════════
        * ⚠️ `md:hidden`: from 768px up the list is beside it, so a back link would be a button that
        * leads to something already on screen. ⛔ IT ALSO POPS THE HISTORY ENTRY rather than merely
        * clearing the state — see `openLocation` — so the link and the phone's own back gesture leave
        * the history in the same place. */}
      {selected && (
        <button type="button" data-loc-back onClick={closeLocation}
          className="mb-2 inline-flex items-center text-sm font-semibold text-slate-600 md:hidden">
          {PHONE_ALL_LOCATIONS}
        </button>
      )}
      <Card className="flex min-w-0 flex-col p-4" data-loc-pane>
        {!selected ? (
          <p className="py-6 text-center text-sm text-slate-400">{LOCATIONS_PICK_ONE}</p>
        ) : gate(
          <>
            <p className="text-[17px] font-bold leading-tight text-slate-900">
              {selected.name}
              {selected.area ? <span className="font-medium text-slate-400"> · {selected.area}</span> : null}
            </p>

            {/* ⛔ "Name on posts" LEFT THIS SCREEN — 9 October 2026. It wrote `short_name`, which
              * "Tidy up places" also writes, and that other screen edits the TOWN beside it. A
              * location's name and its town are one fact about the schedule, and splitting the pair
              * across two screens is how they come to disagree.
              * ⚠️ THE NOTE NAMES THE REAL PATH rather than saying "elsewhere". */}
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400" data-name-from-schedule>
              {NAME_FROM_SCHEDULE_NOTE}
            </p>

            {msgNode}

            {/* ══ 🔴 THREE BOXES OF EQUAL SIZE, SIDE BY SIDE ════════════════════════════════════════════
              * ⛔ IT WAS **TWO** COLUMNS WITH THE OVERRIDE STACKED UNDER ONE OF THEM, which made the
              * third picture visibly subordinate to the second — and it was, under the old model. With
              * a picture per surface there is no hierarchy left to draw: three jobs, three boxes, the
              * same size. ⚠️ `items-stretch` IS WHAT MAKES THEM EQUAL, and the preview inside each has a
              * fixed height, so a box with a picture and a box without are the same box.
              * ⚠️ THEY STACK BELOW 900px, where three columns of a preview and a button is narrower
              * than any of them needs. ⛔ NOT 640: three across needs half again as much room as two
              * did, and 640 ÷ 3 is 200px per box with a 12px gap. */}
            {/* ⚠️ `items-stretch` IS THE DEFAULT AND IT IS WHAT MAKES THE THREE BOXES ONE HEIGHT — and
              * that, with each box being a flex column whose description takes the slack, is what lines
              * the previews and the Remove rows up. ⛔ `grid-rows-[auto_auto_auto_auto]` IS GONE: it
              * existed only for the boxes' `grid-rows-subgrid` to adopt, and the boxes no longer use it.
              * See the long note on `PictureBox` for why that mechanism was replaced. */}
            {/* ══ 🔴 §3 · THE PHONE'S THREE COMPACT CARDS (10 October 2026) ═══════════════════════
              * ⚠️ `md:hidden` — below 768px these replace the three boxes below, which are
              * `hidden md:grid`. Both are in the tree and CSS chooses; see `PhonePictureCard` for why
              * that is better than a media-query hook, and why its input ids carry a prefix.
              * ⛔ THE ORDER IS THE BRIEF'S AND IT IS THE SAME AS THE DESKTOP BOXES' — event photo,
              * weekly, poster — so the two layouts cannot teach an operator two different orders.
              * ⚠️ THE BORROW LINKS ARE THE SAME TWO CONDITIONS, written once each here and once in the
              * boxes. 🔴 THAT IS THE ONE DUPLICATION THIS SHAPE COSTS, and it is named rather than
              * hidden: the condition — "this box is empty AND the other is full" — is three lines of
              * JSX in each, and lifting it into a helper would mean a helper that returns a prop
              * object, which is harder to read than the thing it replaces. */}
            <div className="mt-3 space-y-2 md:hidden" data-loc-phone-cards>
              <PhonePictureCard
                title={EVENT_PIC_TITLE} line={PHONE_PIC_EVENT_LINE} slotKey="event-photo"
                image={selected.eventPhotoImage ?? null} busy={busy}
                onUpload={upload(selected.id, 'event-photo')}
                onRemove={() => {
                  if (!window.confirm(slotRemoveConfirm('picture'))) return
                  void run(() => api('place_slot_clear', { placeId: selected.id, slot: 'event-photo' }), 'Removed.')
                }}
                borrow={!selected.eventPhotoImage && selected.weeklyImage
                  ? {
                    label: USE_WEEKLY_PICTURE,
                    onClick: () => void run(
                      () => api('place_slot_use', {
                        placeId: selected.id, slot: 'event-photo',
                        pictureId: selected.weeklyImage?.id,
                      }),
                      'Event posts now use that picture too.'),
                  }
                  : null} />
              <PhonePictureCard
                title={WEEKLY_PIC_TITLE} line={PHONE_PIC_WEEKLY_LINE} slotKey="weekly"
                image={selected.weeklyImage ?? null} busy={busy}
                onUpload={upload(selected.id, 'weekly')}
                onRemove={() => {
                  if (!window.confirm(slotRemoveConfirm('picture'))) return
                  void run(() => api('place_slot_clear', { placeId: selected.id, slot: 'weekly' }), 'Removed.')
                }}
                borrow={!selected.weeklyImage && selected.eventPhotoImage
                  ? {
                    label: USE_EVENT_PICTURE,
                    onClick: () => void run(
                      () => api('place_slot_use', {
                        placeId: selected.id, slot: 'weekly',
                        pictureId: selected.eventPhotoImage?.id,
                      }),
                      'Weekly posts now use that picture too.'),
                  }
                  : null} />
              <PhonePictureCard
                title={LOCATION_POSTER_TITLE} line={PHONE_PIC_POSTER_LINE} slotKey="event"
                image={selected.eventImage ?? null} busy={busy}
                onUpload={upload(selected.id, 'event')}
                onRemove={() => {
                  if (!window.confirm(slotRemoveConfirm('poster'))) return
                  void run(() => api('place_slot_clear', { placeId: selected.id, slot: 'event' }), 'Removed.')
                }}
                /* ⚠️ NO BORROW ON THE POSTER, for the reason the desktop box gives: a poster is held to
                 * the standard design's shape to within 1%, so pointing it at a logo would be offering
                 * an upload that is about to be refused. */
                borrow={null} />
            </div>

            {/* ⚠️ `hidden md:grid` — the desktop boxes, unchanged from 768px up. ⛔ `md:grid` AND NOT
              * `md:block`: this is a grid and `block` would stack the three boxes without the gap. */}
            <div className="mt-3 hidden grid-cols-1 gap-3 md:grid min-[900px]:grid-cols-3"
              data-loc-boxes>
              {/* ══ 🔴 THE EVENT PICTURE IS FIRST (10 October 2026, Dominic) ═══════════════════════
                * ⛔ WEEKLY LED "matching the table's column order", which was a reason about this
                * screen's own table rather than about the operator. **The single event post is the one
                * a truck makes most often**, so its picture is the one they come here to set — and
                * Designs and Create a post were reordered the same way in the same edit, so the three
                * screens of this tab agree. ⚠️ THE TABLE'S COLUMNS MOVED WITH THEM, below. */}
              <PictureBox
                title={EVENT_PIC_TITLE} blurb={EVENT_PIC_BLURB} slotKey="event-photo"
                image={selected.eventPhotoImage ?? null} busy={busy}
                onUpload={upload(selected.id, 'event-photo')}
                onRemove={() => {
                  if (!window.confirm(slotRemoveConfirm('picture'))) return
                  void run(() => api('place_slot_clear', { placeId: selected.id, slot: 'event-photo' }), 'Removed.')
                }}
                borrow={!selected.eventPhotoImage && selected.weeklyImage
                  ? {
                    label: USE_WEEKLY_PICTURE,
                    onClick: () => void run(
                      () => api('place_slot_use', {
                        placeId: selected.id, slot: 'event-photo',
                        pictureId: selected.weeklyImage?.id,
                      }),
                      'Event posts now use that picture too.'),
                  }
                  : null}
              />

              {/* ══ 🔴 THE LOCATION POSTER ════════════════════════════════════════════════════════════
                * ⚠️ NO "use the other one" LINK, AND THAT IS NOT AN OVERSIGHT. A poster is held to the
                * standard design's shape to within 1%; offering to point it at a logo would be offering
                * an upload that is about to be refused. ⚠️ THE SIZE IS NOT IN THE DESCRIPTION either —
                * the shape rule still applies and a wrong-shape upload is still refused in its own
                * words, but a number to read before a job most trucks never do was a cost on everybody. */}

              <PictureBox
                title={WEEKLY_PIC_TITLE} blurb={WEEKLY_PIC_BLURB} slotKey="weekly"
                image={selected.weeklyImage ?? null} busy={busy}
                onUpload={upload(selected.id, 'weekly')}
                onRemove={() => {
                  if (!window.confirm(slotRemoveConfirm('picture'))) return
                  void run(() => api('place_slot_clear', { placeId: selected.id, slot: 'weekly' }), 'Removed.')
                }}
                /* ══ 🔴 "Use the event post picture" — ONE ROW, NOT A SECOND FILE ════════════════════
                  * ⛔ OFFERED ONLY WHEN **THIS** BOX IS EMPTY AND THE OTHER IS FULL, which is the only
                  * state in which it means anything: with both empty there is nothing to point at, and
                  * with this one full it would be a replace dressed up as a shortcut.
                  * 🔴 IT POINTS THE COLUMN AT THE SAME `place_pictures` ROW. `place_slot_use` takes a
                  * picture id, so no file is uploaded and no file is copied — and because
                  * `place_pictures_path_uidx` is a FULL unique index on `path`, a copy is impossible
                  * anyway. ⚠️ A LEGACY IMAGE HAS NO ROW YET and `place_slot_use` writes one first; that
                  * is why `slotOut` sends `legacy` with the id. */
                borrow={!selected.weeklyImage && selected.eventPhotoImage
                  ? {
                    label: USE_EVENT_PICTURE,
                    onClick: () => void run(
                      () => api('place_slot_use', {
                        placeId: selected.id, slot: 'weekly',
                        pictureId: selected.eventPhotoImage?.id,
                      }),
                      'Weekly posts now use that picture too.'),
                  }
                  : null}
              />

              <PictureBox
                title={LOCATION_POSTER_TITLE} blurb={POSTER_BOX_BLURB} slotKey="event"
                image={selected.eventImage ?? null} busy={busy}
                dropLabel={DROP_A_POSTER}
                onUpload={upload(selected.id, 'event')}
                onRemove={() => {
                  if (!window.confirm(slotRemoveConfirm('poster'))) return
                  void run(() => api('place_slot_clear', { placeId: selected.id, slot: 'event' }), 'Removed.')
                }}
                borrow={null}
              />
            </div>

            {/* ── THE TAG ──────────────────────────────────────────────────────────────────────── */}
            {/* ⛔ THE TAG IS **NOT** `sg_upsert_place`'s PATH. It is a column this feature added,
              * written by this feature's own route so the normaliser runs on the way in. */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <SocialTagField
                key={`t-${selected.id}`}
                initial={selected.socialTag ?? ''}
                busy={busy}
                onSave={value => void run(
                  () => api('place_social_tag', { placeId: selected.id, tag: value }),
                  'Tag saved.',
                )}
              />
            </div>
          </>,
        )}
      </Card>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE PLACE DESIGN EDITOR
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ 🔴 ONE PLACE'S EVENT DESIGN, AS A FULL PAGE ══════════════════════════════════════════════════
 *
 * ⛔ THE EDITOR INSIDE IT IS `EventSetupScreen`, FOCUSED. Everything this page adds is CHROME — the
 * back link, the name, the scope sentence, "Make post for …" and the quiet way out. The picture, the
 * drag surface, the fonts, the preview and every save path are the existing screen's, because a second
 * drag surface would be a second set of the three pointer bugs that one had.
 *
 * ⚠️ THE "Name on posts" FIELD WAS PART OF THAT CHROME UNTIL 9 OCTOBER 2026 and is not any more. It
 * wrote `short_name`, which `locationName()` in lib/weekly-post/week-data.ts reads FIRST — so it was
 * the field that decided what a poster prints, which is why it was offered here at all.
 * 🔴 IT WENT BECAUSE "Tidy up places" EDITS THE NAME AND THE TOWN TOGETHER. Those two are one fact
 * about the schedule; a second screen editing only the name is how they come to disagree, and the
 * poster then prints a mismatch that neither screen can show the operator. The Location settings pane
 * carries a grey note naming the real path there instead.
 * ⚠️ NOTHING ABOUT THE DATA CHANGED EITHER WAY. No column was added when the field arrived and none
 * was dropped when it left; `short_name` is still read first by the renderer. ⛔ THE "Tidy up places"
 * CARD STILL LABELS `name` "Name on posts", which is the field the renderer uses SECOND — that label
 * is wrong, it is named in docs/social-posts-report.md, and it is left alone because the brief says to
 * leave Tidy up as it is.
 */

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ TOMBSTONE · `PlacePicturesPage`, `PlacePictureRow`, `PlaceDesignPage` AND `LibraryPicture`
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// All four were deleted on 7 October 2026 with the library model they served. What they were:
//
//   • `PlacePicturesPage` — a grid of a location's pictures with ★ Main, a Make main / Rename menu,
//     "Main is used automatically", and a quiet link to the text-positions editor. 🔴 EVERY ONE OF
//     THOSE CONTROLS EXISTED BECAUSE A LOCATION COULD HAVE ANY NUMBER OF PICTURES AND ONLY ONE WAS
//     USED. With two slots, one job each, the question they answered does not arise.
//   • `PlacePictureRow` — its list row, with a thumbnail and a picture count.
//   • `PlaceDesignPage` — the per-location text-positions editor. See the note on the `View` union:
//     the DATA and the RENDERING are untouched; what went is the way to create one.
//   • `LibraryPicture` — the page's own row shape, with `isMain`, `sortOrder` and `wholeBackgroundOk`.
//
// ⚠️ `place_picture_list`, `place_picture_main`, `place_picture_rename` AND `place_picture_remove` ARE
// STILL ON THE ROUTE AND NOTHING CALLS THEM. They are left because removing a route action is a
// separate change with its own blast radius (`scripts/place-pictures.cjs` drives three of them), and
// because `place_picture_remove` is the only path that deletes a stored object — which the next person
// to read this should know exists and know nothing presses. Named in docs/social-tab-report.md.
//
// ⚠️ `inGridOrder` / `mainPicture` IN lib/weekly-post/place-pictures.ts ARE STILL LIVE. The legacy
// mapping and `readPlaceLibrary` both use them; they are the store's own order, not a screen's.

