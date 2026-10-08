'use client'
// components/manage/DesignEditor.tsx — ONE design editor, used by all three design screens.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS REPLACES, AND WHY ONE OF IT
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// There were two editors — `WeeklyPost.tsx`'s `SetupScreen` and `EventPost.tsx`'s `EventSetupScreen`
// — and a third screen (a place's own design) that was the second one with two props hiding parts of
// it. They had the same job and had already drifted: the weekly one offered two background colours and
// the event one offered one; the event one had on/off switches and the weekly one did not; the colour
// control was an empty `<input type="color">` in both and nobody had noticed because it was written
// twice. Each new option in this build would have had to be added to both, and the first one anybody
// forgot would be a setting that worked on one screen and silently did nothing on the other.
//
// ⛔ SO: ONE COMPONENT, AND THE DIFFERENCES BETWEEN THE THREE SCREENS ARE **PROPS**. The weekly post's
// week heading and row spacing, the single event's cancelled look, a place's "same positions as
// Standard" choice — those are the add-ons (§7), passed in or switched on by `kind`. Everything that
// decides what text looks like is in here exactly once.
//
// ── 🔴 THE SHAPE OF THE SCREEN, AND WHY THERE IS NO RIGHT-HAND COLUMN ──────────────────────────────
// A top bar, a ~250px list on the left, and the picture filling everything else with the selected
// item's toolbar directly above it. The old screens put the style controls in a THIRD column on the
// right, which meant the operator's eye travelled left (what am I editing?) → right (change it) →
// centre (did it work?) for every adjustment, and on a 1000px laptop the picture was squeezed into
// about 450px to make room. The toolbar above the picture is next to the thing it changes.
//
// ── 🔴 THE PREVIEW IS THE RENDERER'S PNG. NOTHING HERE IMITATES IT ────────────────────────────────
// Every pixel of the poster comes from `/api/weekly-post` → `lib/weekly-post/render.ts`. This file
// draws the dashed OUTLINES on top of it and nothing else. The reason is exact and worth restating:
// what the operator approves must be what they download, and a CSS lookalike drifts from the renderer
// the first time either is touched, silently, on artwork that goes out to a truck's customers.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
/* ── 9 October 2026: the three-column layout's own wording, in the one copy module. */
import {
  EDITOR_LEFT_TITLE, EDITOR_NOTHING_SELECTED,
  /* ⛔ `EDITOR_SETTINGS_FOR` ("Settings for the box you've picked") IS NO LONGER DRAWN — §C replaces it
   * with `SETTINGS_CLICKED`, which says how the box got there ("You clicked this on your poster") and
   * therefore how to pick a different one. Kept as the record. */
  /* ⛔ `EDITOR_SECTION_TEXT` IS NO LONGER IMPORTED. The panel had a "TEXT" heading over the font and
   * colour rows; with the item's own name in bold directly above them it was a second heading for the
   * same block. ⚠️ The `data-settings-section="TEXT"` marker stays — the harness measures that block. */
  EDITOR_SECTION_MORE,
  /* ⛔ `EDITOR_BACKGROUND_ITEM` IS NO LONGER DRAWN — §3 made the background a SECTION at the foot of
   * every panel, with `BACKGROUND_SECTION` as its heading, so there is no item to title. Kept exported
   * as the record of the wording. */
  EDITOR_ADD_OWN_TEXT, EDITOR_PICTURE_ITEM, EDITOR_PICTURE_SAMPLE,
  /* ⛔ THE THREE OLD MORE-OPTIONS SUMMARIES ARE NO LONGER DRAWN — §C replaces all three with one line
   * in plain words (`MORE_SUMMARY_PLAIN`). Three summaries for one section was three places for the
   * contents to be described differently from what is in it. All three stay exported. */
  /* ⛔ `EDITOR_CLICK_TO_EDIT` AND `EDITOR_LINK_LEGEND` ARE BOTH RETIRED FROM THE GRID HEADING — §B9
   * puts "click one to change it" in that slot, because with the Background button gone and the seven
   * days one item, the 🔗 was explaining a glyph that now appears on two buttons. Both stay exported.
   * ⛔ `EDITOR_PREVIEW_HINT` WENT WITH THE Edit/Preview SWITCH (§B1). */
  EDITOR_FIT_TO_SCREEN, EDITOR_CLICK_ONE, FOLLOW_GLYPH, BACKGROUND_SECTION, BACKGROUND_SUMMARY,
  BG_BEST_SUFFIX, BG_PORTRAIT_TIP, DARKEN_LABEL, DARKEN_HINT,
  PREVIEW_POST_BTN, PREVIEW_POST_TITLE, PREVIEW_POST_HINT, PREVIEW_POST_CLOSE, PREVIEW_POST_WAIT,
  /* ── §A · "The 7 days" */
  DAYS_ITEM, DAYS_ICON, DAYS_BLURB, DAYS_QUICK_HEADING, DAYS_QUICK_HINT,
  QL_ONE_LINE, QL_DAY_ON_TOP, QL_BIG_PICTURE,
  DAYS_PARTS_HEADING, DAYS_PARTS_HINT, DAYS_OFF_HEADING, DAYS_OFF_MESSAGE, DAYS_OFF_OMIT,
  DAYS_OFF_TEXT_LABEL, DAYS_OFF_OMIT_HINT, DAYS_PICTURE_SHAPE, DAYS_MORE_SUMMARY,
  SHAPE_SQUARE, SHAPE_ROUNDED, SHAPE_CIRCLE,
  PART_PICTURE_NAME, PART_PICTURE_EG, PART_DAY_NAME, PART_PLACE_NAME, PART_TIMES_NAME,
  /* ── §C · plain words */
  SETTINGS_CLICKED, STYLE_HEADING, STYLE_MATCH, STYLE_OWN, STYLE_MATCH_HINT, STYLE_OWN_HINT,
  LABEL_DATE_STYLE, LABEL_TIME_STYLE, LABEL_PLACE_STYLE, LABEL_HEADING_TEXT, LABEL_OWN_TEXT,
  OTHER_CHOICES, LABEL_TEXT_SIZE, TEXT_SIZE_HINT, LABEL_LINE_UP, ALIGN_LEFT, ALIGN_CENTRE, ALIGN_RIGHT,
  /* ⚠️ `LETTERS_BOLD` / `LETTERS_ITALIC` / `LETTERS_CAPS` ARE THE **TOOLTIPS**, set on the B / I / AA
   * buttons in `StyleRow` — which is where they are imported. */
  LABEL_LETTERS, LETTERS_BOLD, LETTERS_ITALIC, LETTERS_CAPS, SECTION_EASIER_TO_READ,
  DELETE_OWN_TEXT, DELETE_OWN_TEXT_KEY, LIVE_FONT_FALLBACK,
  EFFECT_SHADOW, EFFECT_SHADOW_NONE, EFFECT_SHADOW_SOFT, EFFECT_SHADOW_STRONG,
  EFFECT_OUTLINE, EFFECT_BAND, EFFECT_SEE_THROUGH, EFFECT_AUTO, EFFECT_AUTO_HINT,
  MORE_SUMMARY_PLAIN, LABEL_LETTER_SPACE, LABEL_TILT, LABEL_WORDS_BEFORE, WORDS_BEFORE_HINT,
  LABEL_TOO_LONG, TOO_LONG_SHRINK, TOO_LONG_TWO_LINES, LABEL_LINE_HEIGHT, LABEL_CENTRE_ON,
  CENTRE_ACROSS, CENTRE_UPDOWN, LABEL_SHADOW_STRENGTH, LABEL_OUTLINE_WIDTH, LABEL_BAND_CORNERS,
  LABEL_BAND_PADDING,
  ALL_TEXT_ITEM, ALL_TEXT_SAMPLE, ALL_TEXT_TITLE, ALL_TEXT_BLURB, ALL_TEXT_SIZE_HINT,
  /* ⛔ FOUR OF THE OLD NOTES' STRINGS ARE NO LONGER IMPORTED — §3's Look switch replaced them:
   * `FOLLOW_NOTE`, `CHANGE_JUST_THIS`, `OWN_STYLE_LABEL` and `MATCH_ALL_AGAIN` were the two coloured
   * paragraphs with their state-changing links buried inside. All four stay exported as the record.
   * ⚠️ `USE_FOR_ALL_TEXT` AND `OWN_BADGE` SURVIVE: the first is still the link at the foot of an
   * own-style box, which §3 says stays, and the second is still the grid's badge. */
  USE_FOR_ALL_TEXT, OWN_BADGE,
} from '@/lib/copy/socialPosts'
import { Btn } from './primitives'
import { DraggableBox, NO_GUIDES, type DragInfo, type SnapGuides } from './DraggableBox'
import { FontPicker } from './FontPicker'
import { faceSupport, useFontLibrary, type FontLibrary } from './useFontLibrary'
import {
  CheckRow, ColourField, GroupHeading, OptionalColourRow, Slider, Stepper, Switch, TOOL_BTN, TOOL_BTN_OFF, TOOL_BTN_ON, TOOL_INPUT, TOOL_LABEL,
} from './DesignEditorBits'
import { averageSample } from '@/lib/weekly-post/contrast'
import { formatTimeRangeFor, type TimeStyle } from '@/lib/weekly-post/format'
import {
  LOCALES, PLACE_STYLE_IDS, PLACE_STYLE_SAMPLES, placeStyleSample, dateTextFor,
  type CountryCode, type DateStyleId, type PlaceStyleId,
} from '@/lib/weekly-post/locale'
import {
  LAST_TOGGLE_MESSAGE, MAX_NOTE_BOXES, NOTE_TOKEN,
  defaultEventNoteBox, defaultNoteBox, toggleIsAllowed,
  /* 🔴 **THE ONE STYLE RESOLVER**, shared with lib/weekly-post/render.ts. The brief requires the panel
   * and the satori renderer to answer "what does this box look like" through ONE function; importing it
   * here rather than reimplementing the fallback is what makes that true. */
  resolveTextBox, lookOf, MAX_DARKEN,
  type Align, type DateBox, type Effects, type EventLayout, type IfTooLong,
  type Layout, type NoteBox, type PlacePictureBox, type TextBox, type TextLook,
} from '@/lib/weekly-post/layout'
import { NO_PICTURE_LABELS, noPicturesLine, type NoPictureBehaviour } from '@/lib/weekly-post/place-pictures'
/* ══ 🔴 "THE 7 DAYS" — THE SAME LAYOUT MATHS THE RENDERER USES (10 October 2026) ═══════════════════
 * ⛔ THE EDITOR DOES NOT WORK OUT WHERE A PART OF A ROW GOES. `dayCells` is the one function that
 * does, and `lib/weekly-post/render.ts` calls it for the PNG — so a cell the operator clicks is the
 * cell the renderer draws in, by construction rather than by two pieces of arithmetic agreeing. */
import {
  DAYS_IN_WEEK, QUICK_LAYOUTS, dayBoundaries, dayCells, daysFromLegacy, moveBoundary, normaliseParts,
  reorderParts,
  type DayPartKey, type DayPartsOn, type DaysArrangement, type DaysBlock, type PictureShape,
} from '@/lib/weekly-post/days'
/* ══ 🔴 §2 · THE LIVE TEXT — THE RENDERER'S OWN TREE, BUILT IN THE BROWSER ═════════════════════════
 * ⛔ THE EDITOR DOES NOT DRAW TEXT. `weeklyTree` / `eventTree` in `lib/weekly-post/draw.ts` build the
 * poster as a list of `{ type, props: { style } }` objects, and `lib/weekly-post/render.ts` hands those
 * same objects to satori for the PNG. `LivePoster` mounts them as DOM. ⚠️ ONE TREE, TWO PAINTERS —
 * which is the only way "the editor uses the same layout functions as the renderer" can be true rather
 * than claimed. ⚠️ THE FONTS COME THE SAME WAY: the same files, so `fitLines` measures the same widths. */
import { eventTree, weeklyTree } from '@/lib/weekly-post/draw'
import { useLiveFonts } from '@/lib/weekly-post/live-fonts'
import { LivePoster } from './LivePoster'
import { timeTextFor, type DayEntry, type WeekDay } from '@/lib/weekly-post/week-data'
import type { WeekRange } from '@/lib/weekly-post/week'
import { fontsUsedBy, fontsUsedByEvent } from '@/lib/weekly-post/layout'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO LAYOUT SHAPES, BEHIND ONE SET OF ACCESSORS
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type AnyLayout = Layout | EventLayout

/**
 * ⚠️ DISCRIMINATED ON `rowSpacing`, A FIELD ONLY THE WEEKLY LAYOUT HAS — not on a `kind` string stored
 * in the layout. Adding a discriminator to the stored JSON would mean migrating every saved design to
 * carry a fact that is already obvious from its own shape.
 */
export const isWeekLayout = (l: AnyLayout): l is Layout => 'rowSpacing' in l

/**
 * An item in the left-hand list. ⚠️ `'note:0'`, `'note:1'` … so a key is a plain string and the list
 * can grow; `'rows'` is an item with no box behind it at all.
 */
export type ItemKey = string

const NOTE_PREFIX = 'note:'
const noteIndex = (key: ItemKey): number =>
  key.startsWith(NOTE_PREFIX) ? Number(key.slice(NOTE_PREFIX.length)) : -1

/** ⚠️ The place picture is a BOX but not a TEXT box — it has no font and no colour. */
export const PLACE_PICTURE_KEY = 'place-picture'

/* 🔴 THE BACKGROUND PICTURE IS AN ITEM NOW (9 October 2026). It had a card of its own in the left
 * column, below the list, which made it the one thing on the screen you could change without
 * selecting it — and the one thing whose settings were not in the settings panel. It is the last row
 * of the list, under a divider, and its settings open on the right like every other item's.
 * ⚠️ IT HAS NO BOX ON THE POSTER, so nothing selects it by clicking the preview. */
export const BACKGROUND_KEY = 'background'

/**
 * ══ 🔴 "All text" — A SELECTABLE ITEM THAT IS NOT A BOX (9 October 2026) ══════════════════════════
 *
 * ⛔ IT REPLACES "Copy this style to all text", which was a ONE-WAY BULK WRITE: it stamped eleven
 * copies of one style, so the next change meant eleven more presses, and nothing recorded that the
 * boxes were ever meant to match. A shared style is a RELATIONSHIP — change it once and every
 * following box changes for ever.
 * ⚠️ IT IS A KEY LIKE `background` AND `place-picture`: not a box, so `boxAt` returns null for it and
 * the panel branches on it before it looks for a `sel`.
 */
export const ALL_TEXT_KEY = 'all-text'

/**
 * ══ 🔴 "The 7 days" — ONE ITEM WHERE THERE WERE SIX (10 October 2026) ═════════════════════════════
 *
 * ⛔ IT REPLACES `date`, `location`, `time`, `place-picture`, the "EACH ROW" heading and `rows`. Those
 * keys still EXIST and are still selectable — they are the four PARTS, and clicking the words of a day
 * on the poster selects one — but they are no longer buttons in the grid, because "where do the seven
 * days go?" is one question and the old list made an operator answer it six times.
 * ⚠️ IT IS A KEY LIKE `all-text` AND `background`: `boxAt` returns null for it, so the panel branches
 * on it before it looks for a box. ⛔ THE BLOCK IS NOT A `TextBox` — it has no font and no colour; the
 * parts' styles are the `date`/`location`/`time` boxes, which is why those keys survive.
 */
export const DAYS_KEY = 'days'

/** The part each day-row cell is styled by. ⚠️ The ONE place the two vocabularies meet. */
export const PART_ITEM_KEY: Record<DayPartKey, ItemKey> = {
  picture: PLACE_PICTURE_KEY,
  dayDate: 'date',
  place: 'location',
  times: 'time',
}

/** Which parts are drawn, read off the boxes' own switches. ⚠️ Never stored twice — see `days.ts`. */
export function partsOn(l: Layout): DayPartsOn {
  return {
    picture: l.placePicture.enabled,
    dayDate: l.date.enabled,
    place: l.location.enabled,
    times: l.time.enabled,
  }
}

/**
 * ══ 🔴 AN OLD WEEKLY DESIGN BECOMES "The 7 days" WHEN IT IS OPENED ════════════════════════════════
 *
 * The brief: *"Opening an old weekly design in the editor converts it to the closest new equivalent;
 * saving stores the new model."* ⚠️ **ON OPEN, HERE, AND NOWHERE ELSE** — not in `readStoredLayout`,
 * which the RENDERER also goes through: converting there would change what every unopened design
 * draws, which is the one thing the brief forbids.
 * ⛔ AND THE CONVERTED LAYOUT IS WHAT "SAVED" IS COMPARED AGAINST, so simply opening an old design
 * does not report unsaved changes. The conversion is stored the next time the operator saves for a
 * reason of their own.
 */
export function withDays(l: AnyLayout): AnyLayout {
  if (!isWeekLayout(l) || l.days) return l
  return { ...l, days: daysFromLegacy(l) }
}

/** The toggle for any switchable item, including the picture box. */
export function itemEnabled(l: AnyLayout, key: ItemKey): boolean {
  if (key === PLACE_PICTURE_KEY) return l.placePicture.enabled
  return boxAt(l, key)?.enabled ?? true
}

/** The box an item edits, or null for `'rows'` (and for `'heading'` on an event design). */
export function boxAt(l: AnyLayout, key: ItemKey): TextBox | null {
  const i = noteIndex(key)
  if (i >= 0) return l.notes[i] ?? null
  if (key === 'heading') return isWeekLayout(l) ? l.heading : null
  if (key === 'date') return l.date
  if (key === 'location') return l.location
  /* ⚠️ THE TOWN IS AN **EVENT-ONLY** BOX. The weekly layout's place text lives inside each day row and
   * keeps its `placeStyle`; splitting it would be redesigning the weekly rows. */
  if (key === 'town') return isWeekLayout(l) ? null : l.town
  if (key === 'time') return l.time
  return null
}

/**
 * One box, patched.
 *
 * ⚠️ THE CAST TO `T` IS UNAVOIDABLE AND IT IS NARROW. TypeScript will not accept the spread of a
 * generic as that generic, even when every written key exists on it; the alternative is two copies of
 * this function, one per layout shape, which is the thing this whole file exists to avoid. Every path
 * writes a key that both shapes have — which is checked by the `boxAt` above it returning the same
 * union.
 */
function withBox<T extends AnyLayout>(l: T, key: ItemKey, patch: Partial<DateBox & NoteBox & PlacePictureBox>): T {
  /* ⚠️ THE PICTURE BOX GOES THROUGH THE SAME FUNCTION as the text boxes, because the DRAG does: the
   * stage patches `{x,y,w,h}` by item key and must not need to know which kind of box it moved. */
  if (key === PLACE_PICTURE_KEY) {
    return { ...l, placePicture: { ...l.placePicture, ...patch } } as T
  }
  const i = noteIndex(key)
  if (i >= 0) {
    return { ...l, notes: l.notes.map((n, j) => (j === i ? { ...n, ...patch } : n)) } as T
  }
  if (key === 'heading') {
    return isWeekLayout(l) ? ({ ...l, heading: { ...l.heading, ...patch } } as unknown as T) : l
  }
  if (key === 'date') return { ...l, date: { ...l.date, ...patch } } as T
  if (key === 'location') return { ...l, location: { ...l.location, ...patch } } as T
  if (key === 'town') {
    return isWeekLayout(l) ? l : ({ ...l, town: { ...l.town, ...patch } } as unknown as T)
  }
  if (key === 'time') return { ...l, time: { ...l.time, ...patch } } as T
  return l
}

/** One box's Effects, patched. ⚠️ Through `withBox`, so there is one place a box is replaced. */
const withEffects = <T extends AnyLayout>(l: T, key: ItemKey, patch: Partial<Effects>): T => {
  const b = boxAt(l, key)
  return b ? withBox(l, key, { effects: { ...b.effects, ...patch } }) : l
}

/** Every text box in a layout, with its item key — for "Copy this style to all text". */
function allTextItems(l: AnyLayout): ItemKey[] {
  const out: ItemKey[] = isWeekLayout(l) ? ['heading'] : []
  out.push('date', 'location')
  /* ⚠️ "Copy this style to all text" REACHES THE TOWN TOO, but only where there is one. */
  if (!isWeekLayout(l)) out.push('town')
  out.push('time')
  l.notes.forEach((_, i) => out.push(`${NOTE_PREFIX}${i}`))
  return out
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE ITEM LIST
// ════════════════════════════════════════════════════════════════════════════════════════════════

interface Item {
  key: ItemKey
  name: string
  /** The grey sample beside the name — a REAL example in the design's own settings. */
  sample: string
  /**
   * Where the item appears.
   * ⚠️ `'part'` IS **NOT IN THE GRID** (10 October 2026). The four parts of a day row are selected by
   * clicking the words on the poster or by the "The 7 days" panel's own list — putting them in the
   * grid as well would be the six-item list this round replaced, with the seven-days button added.
   * ⛔ THEY ARE STILL ITEMS, because `selected` must be able to hold one: the settings panel, the
   * "own style" badge and the fallback-to-Date rule all read this list.
   */
  group: 'top' | 'row' | 'own' | 'part'
  switchable: boolean
  enabled: boolean
}

/**
 * ══ 🔴 THE SAMPLES ARE LIVE, NOT FIXED STRINGS ════════════════════════════════════════════════════
 *
 * "Wednesday 14th October" beside Date is the date style this design is actually set to, in this
 * truck's country, with this box's capitals — so changing the style changes the sample, and the list is
 * a readout rather than a legend. A hard-coded "e.g. Monday 1st January" would be the one thing on the
 * screen that could not be wrong, and also the one thing that could not be right.
 */
/**
 * The date, in this design's own style and country.
 *
 * 🔴 ONE FUNCTION, TWO READERS: the grey sample beside "Date" in the left list, and the text every row
 * of the font picker is drawn with. ⛔ THEY HAD BETTER BE THE SAME STRING — an operator comparing
 * fonts against "Wednesday 14th October" and then seeing "Wed 14/10" on their poster is comparing the
 * wrong thing. ⚠️ `raisedOrdinals: false` because both readers are plain strings and neither can draw
 * a superscript.
 */
export function dateSampleFor(l: AnyLayout, country: CountryCode): string {
  /* ⚠️ THE SAMPLE DATE IS THE LOCALE TABLE'S OWN, so the list, the picker and the style picker all
   * show the same day and the operator is comparing styles rather than dates. */
  return dateTextFor('2026-10-14', l.dateStyle, country, { caps: l.date.caps, raisedOrdinals: false })
}

function itemsOf(l: AnyLayout, country: CountryCode): Item[] {
  const spec = LOCALES[country]
  const dateSample = dateSampleFor(l, country)
  /* 🔴 `placeStyleSample`, NOT `PLACE_STYLE_SAMPLES[...]` — 7 October 2026. The bare index threw on a
   * design saved before part 1, which has no `placeStyle` at all. The read path is fixed at source so
   * this should now always be a known id; the safe lookup stays because "should" is what the `as
   * EventLayout` cast on the route also said. */
  const placeSample = placeStyleSample(l.placeStyle).split('\n').join(' · ')
  const timeSample = formatTimeRangeFor('17:00', '21:00', l.timeStyle)
  void spec

  const items: Item[] = []
  if (isWeekLayout(l)) {
    items.push({
      key: 'heading', name: 'Week heading', group: 'top', switchable: true,
      enabled: l.heading.enabled,
      sample: l.heading.text.trim() || 'Week commencing …',
    })
  }
  /* ══ 🔴 "The 7 days" LEADS THE WEEKLY GRID, AND THE FOUR PARTS DROP OUT OF IT ════════════════════ */
  const week7 = isWeekLayout(l) && !!l.days
  if (week7) {
    items.push({
      key: DAYS_KEY, name: `${DAYS_ICON} ${DAYS_ITEM}`, group: 'top', switchable: false, enabled: true,
      sample: 'Monday to Sunday',
    })
  }
  const group: Item['group'] = week7 ? 'part' : isWeekLayout(l) ? 'row' : 'top'
  items.push(
    { key: 'date', name: 'Date', group, switchable: true, enabled: l.date.enabled, sample: dateSample },
    /* ══ 🔴 VENUE AND TOWN ARE TWO ITEMS ON A SINGLE EVENT DESIGN (9 October 2026) ═══════════════
     * ⛔ ONE "Place" ITEM AND A STYLE DROPDOWN DREW THE TOWN AS A SECOND LINE INSIDE THE VENUE BOX, so
     * its position, size and colour were the venue's, scaled — and a truck who wanted the town
     * smaller, paler or somewhere else had no way to say so.
     * ⚠️ THE WEEKLY DESIGN KEEPS ONE "Place" ITEM AND ITS STYLE, because its place text lives inside
     * each day row and splitting it would be redesigning the weekly rows. */
    ...(isWeekLayout(l)
      ? [{ key: 'location', name: 'Place', group, switchable: true, enabled: l.location.enabled, sample: placeSample } as Item]
      : [
        { key: 'location', name: 'Venue', group, switchable: true, enabled: l.location.enabled, sample: 'The Kings Arms' } as Item,
        /* ⚠️ "Area", NOT "Town" — 9 October 2026, AND THE DATA KEY IS STILL `town`. Half this
         * product's venues are in a village and the other half in a town, and a label that is wrong
         * for half the list is a label an operator has to translate. ⛔ RENAMING THE **KEY** WOULD BE A
         * MIGRATION of every stored event layout for a word on a button; the field is `town`, the
         * label is "Area", and the one place that has to know both is this line. */
        { key: 'town', name: 'Area', group, switchable: true, enabled: l.town.enabled, sample: 'Lavenham' } as Item,
      ]),
    { key: 'time', name: 'Time', group, switchable: true, enabled: l.time.enabled, sample: timeSample },
  )
  /* ⛔ "Rows" EXISTS ONLY FOR A DESIGN STILL ON THE LEGACY ROW MODEL — which, inside this editor, is
   * none of them: `withDays` converts on open. It is kept for the one path that can still produce one
   * (a design whose stored block failed validation and was repaired to the default layout), so the
   * screen has a row-spacing control rather than no way at all to move the days. */
  if (isWeekLayout(l) && !l.days) {
    items.push({
      key: 'rows', name: 'Rows', group: 'row', switchable: false, enabled: true,
      sample: `${l.rowSpacing}px apart · Monday to Sunday`,
    })
  }
  /* ══ 🔴 THE PLACE PICTURE (part 3) ═══════════════════════════════════════════════════════════
   * ⚠️ IN THE **EACH ROW** GROUP ON THE WEEKLY POST, because that is where it is drawn — once per row,
   * exactly as the three text boxes are — and under the top group on a single event post, where there
   * is one of everything. Putting it anywhere else would make the operator guess how many of them
   * there are.
   * ⛔ ITS SAMPLE SAYS **WHICH** PICTURE, because a place can have several and only one is used
   * automatically. "The place's Main picture" is the whole rule in four words. */
  /* ══ 🔴 "Location photo" / "Location picture" — TWO NAMES, BECAUSE THEY ARE TWO THINGS (7 Oct) ══
   * ⛔ IT WAS "Location image" ON BOTH DESIGNS, AND THE ONE NAME HID THE WHOLE MODEL. A location has
   * at most two images with one job each: a PHOTO that a single event post crops into a space, and a
   * PICTURE that sits beside its row on the weekly post. Calling both "Location image" is what made an
   * operator expect the photo they uploaded for events to be the one on their weekly poster.
   * ⚠️ THE SAMPLE SAYS WHICH, AND NOT "the Main one" ANY MORE. There is no Main: the slot IS the
   * answer, so there is nothing for the sample to disambiguate.
   * ⛔ AND THE SINGLE EVENT ITEM IS **OFF BY DEFAULT**, which is not a new default — `enabled: false`
   * is what `defaultPlacePictureBox` has always returned — but it now MEANS something: off is the
   * whole-poster rule (`eventImageMode`), not "no location image at all". */
  /* ⚠️ "Location picture" ON BOTH DESIGNS NOW (9 October 2026). The single event design called it
   * "Location photo", and the two names were the two SLOTS that no longer exist — a location has one
   * picture, used wherever a design has a space for it. One name, one thing. */
  items.push({
    key: 'place-picture',
    name: EDITOR_PICTURE_ITEM,
    group: week7 ? 'part' : isWeekLayout(l) ? 'row' : 'top',
    switchable: true,
    enabled: l.placePicture.enabled,
    sample: EDITOR_PICTURE_SAMPLE,
  })
  l.notes.forEach((n, i) => items.push({
    key: `${NOTE_PREFIX}${i}`,
    name: 'Your own text',
    group: 'own',
    switchable: true,
    enabled: n.enabled,
    sample: n.text.trim() === NOTE_TOKEN
      ? 'The note you type when you make the post'
      : (n.text.trim() || 'Nothing yet'),
  }))
  return items
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE COMPONENT
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface PreviewOption { id: string; label: string }

/**
 * ══ 🔴 §2 · THE DATA THE LIVE STAGE DRAWS ITS WORDS FROM ═════════════════════════════════════════
 *
 * ⚠️ IT IS NOT A `WeekData`. The route's `load` sends `{ days, start, end }` and a `WeekData` also
 * carries `included` — the event list the CAPTIONS need and the poster does not. Asking the caller for
 * a field the tree never reads would be asking it to invent one.
 */
export type LiveData =
  | { kind: 'week'; days: readonly WeekDay[]; start: string; end: string; note?: string | null }
  | { kind: 'event'; entry: DayEntry; date: string; note?: string | null }

export interface DesignEditorProps {
  /**
   * The dashboard token.
   *
   * 🔴 THE EDITOR NEEDS IT NOW BECAUSE THE FONT PICKER DOES (part 2). The picker loads the 1,819-entry
   * catalogue and performs the uploads itself, and the toolbar's Bold and Italic buttons read the same
   * data — so the fetch is hoisted to here, where both can see one copy of it.
   */
  token: string
  /** Shown in the top bar: "Weekly post", "Single event post", or a place's name. */
  designName: string
  /** The back link's words, e.g. "‹ Designs". */
  backLabel: string
  onBack: () => void

  initialLayout: AnyLayout
  /** The truck's country, through `countryForTruck()`. ⚠️ Never read from a component. */
  country: CountryCode

  /** The blank / background picture. ⚠️ `width`/`height` are the NATIVE pixels every box is in. */
  background: { url: string; width: number; height: number }
  onReplacePicture: (file: File) => void
  replacing?: boolean
  /** The line under the picture card. The brief's words: what the picture should and should not have. */
  pictureNote: string
  /* ══ ⛔ TOMBSTONE · `overlayUrl` — THE FILLED EXAMPLE, REMOVED 10 OCTOBER 2026 (§B7) ═══════════════
   * A finished poster shown at 30% over the preview, so boxes could be lined up against the real
   * thing. ⚠️ IT WAS KEPT THROUGH THREE ROUNDS BECAUSE NOTHING ELSE COULD REPRODUCE IT — and what has
   * replaced it is the preview itself: the stage draws the REAL PNG for the chosen week now, with the
   * real place names in it, so a faint second poster on top of a true one is two answers to the same
   * question. ⛔ THE UPLOAD ENDPOINT (`which: 'example'`) AND THE STORED FILE ARE UNTOUCHED — a
   * capability that lost its door, not one that was deleted. Named in docs/social-tab-6-report.md. */

  /** The "Preview with" choices. ⚠️ `[]` hides the control rather than showing an empty select. */
  previewOptions: PreviewOption[]
  previewWith: string
  onPreviewWith: (id: string) => void
  /** The real renderer. Returning null means "nothing to preview with yet". */
  renderPreview: (layout: AnyLayout, previewWith: string) => Promise<{ url: string; warnings: { where: string; message: string }[] } | null>

  /**
   * ══ 🔴 §2 · WHAT THE LIVE TEXT **SAYS** ═══════════════════════════════════════════════════════════
   *
   * ⛔ WITHOUT IT THE STAGE CAN DRAW OUTLINES AND NOTHING ELSE. The editor knows where every box is and
   * what it looks like — it has the layout — but not that Thursday is Cavendish at 5pm. That is the
   * week, and the week comes from the screen that loaded it.
   * ⚠️ IT IS THE SAME DATA THE PNG IS RENDERED FROM, which is the point: the live text and the file a
   * truck posts are the same words through the same functions. ⛔ `null` IS AN HONEST STATE (the week
   * has not loaded, or the chosen event has gone) and the stage falls back to the PNG.
   * ⚠️ IT FOLLOWS `previewWith`. The caller changes it when the operator picks another week or event.
   */
  liveData?: LiveData | null

  /** ⚠️ MAY RETURN A PROMISE, so "Save and leave" can wait for it — see `onSaver`. */
  onSave: (layout: AnyLayout) => void | Promise<void>
  saving?: boolean
  /**
   * ══ 🔴 §B10 · "Save and leave" NEEDS A WAY TO PRESS SAVE FROM OUTSIDE ═════════════════════════════
   *
   * ⛔ THE LAYOUT LIVES IN HERE. The leave dialog is three components up, in the page that owns the
   * sub-tab pills, so without this the only honest buttons it could offer were "Leave without saving"
   * and "Keep editing" — a dialog that exists to protect the operator's work with no way to keep it.
   * ⚠️ IT HANDS UP A **FUNCTION**, re-registered whenever the layout changes, so what it saves is what
   * is on screen at the moment it is called. ⛔ `null` ON UNMOUNT, so a page that has left the editor
   * cannot save a design that is no longer open.
   */
  onSaver?: (save: (() => void | Promise<void>) | null) => void
  /* 🔴 REPORTED UPWARD SO A **SUB-TAB PILL** CAN ASK BEFORE IT NAVIGATES (9 October 2026). The pills
   * live in the page's own bar, three components above this one; without this they would switch tab
   * out from under an unsaved design with no warning at all.
   * ⚠️ IT IS A CALLBACK AND NOT A RETURN VALUE because the answer changes on every edit, and the page
   * needs the LATEST one at the moment the pill is pressed. */
  onDirtyChange?: (dirty: boolean) => void
  onCancel: () => void

  /** §7 · a place's design: "Same positions as Standard" / "Own positions for this place". */
  scope?: {
    mode: 'own' | 'standard'
    onMode: (m: 'own' | 'standard') => void
    busy?: boolean
    placeName: string
  }
  /** A place on Standard's positions: the boxes are shown and not moved. */
  readOnly?: boolean
  message?: { text: string; bad: boolean } | null
  /** Anything the caller wants under the left-hand list — the "use Standard instead" link, say. */
  footer?: React.ReactNode

  /* ══ 🔴 PART 3 · WHAT THE PLACE-PICTURE ITEM NEEDS FROM THE CALLER ════════════════════════════
   * ⚠️ PASSED IN RATHER THAN FETCHED HERE, because both are facts about the TRUCK rather than about
   * the design — and the caller already has them from `social_overview`. */
  /** ⛔ Only a truck with a logo is offered "Show your logo". */
  hasLogo?: boolean
  /** How many places have no picture, for the weekly toolbar's line. */
  placesWithout?: { without: number; total: number } | null
  /** 🔴 Opens Social media › **Locations**, filtered to "Missing images" (7 October 2026). It pointed
   *  at Designs › Place pictures, which no longer exists — Designs is two boxes now. */
  onAddPlacePictures?: () => void
}

/** ⚠️ Bounded, so a long session cannot grow the history without limit. 60 steps is more than any
 *  operator will undo through, and about 60 × a small JSON object in memory. */
const HISTORY_LIMIT = 60

interface History { past: AnyLayout[]; present: AnyLayout; future: AnyLayout[] }

export function DesignEditor(props: DesignEditorProps) {
  const {
    token, designName, backLabel, onBack, initialLayout, country, background, onReplacePicture, replacing,
    pictureNote, previewOptions, previewWith, onPreviewWith, renderPreview, liveData, onSave, saving, onCancel,
    onDirtyChange, onSaver,
    scope, readOnly, message, footer, hasLogo, placesWithout, onAddPlacePictures,
  } = props

  /* 🔴 ONE FETCH OF THE FONT LIBRARY PER PAGE, HOISTED HERE. The picker lists it and the toolbar's
   * Bold/Italic buttons read it, and they are in different places on the screen — so a picker that
   * owned the data would have to publish it upwards and the toolbar would be drawing buttons from a
   * copy one render behind. `useFontLibrary` caches the request at module scope, so the remount this
   * component does on every design change costs nothing. */
  const fontLib = useFontLibrary(token)

  /* 🔴 CONVERTED ON OPEN — see `withDays`. ⚠️ A `useMemo` SO IT RUNS ONCE PER LAYOUT IDENTITY rather
   * than on every render: `savedJson` below is compared against it, and a fresh object each render
   * would make the comparison meaningless. */
  const opened = useMemo(() => withDays(initialLayout), [initialLayout])
  const [hist, setHist] = useState<History>({ past: [], present: opened, future: [] })
  /* ══ 🔴 "ARE THERE UNSAVED CHANGES?" — ONE REF, SET BY SAVING (9 October 2026) ═══════════════════
   * ⛔ `hist.past.length > 0` IS NOT THE ANSWER. Undoing back to the start leaves a past that is not
   * empty and a layout that is identical to the saved one, so that test reports "unsaved changes" for
   * a design nobody has changed — and an operator who has carefully undone their mistakes is the last
   * person who should be challenged on the way out.
   * 🔴 SO IT COMPARES THE PRESENT WITH THE LAST **SAVED** LAYOUT. `JSON.stringify` is exact enough: a
   * layout is plain data with no functions, no dates and no undefined, and key ORDER cannot drift
   * because every layout this editor produces comes out of the same validator.
   * ⚠️ **STATE, NOT A REF**, and the lint rule was right to insist. `isDirty` is computed during render
   * — it feeds the effect that reports it — and reading a ref while rendering is exactly what React
   * forbids: a ref written by one render is not guaranteed to be seen by the next. ⛔ AND IT COSTS
   * NOTHING HERE: this value changes only when the design is SAVED, which is once per press, not once
   * per keystroke. */
  /* ⛔ THE **CONVERTED** LAYOUT IS THE BASELINE, not the stored one. Comparing against the stored one
   * would report "unsaved changes" the instant an old design was opened — and the leave dialog would
   * then fire for an operator who had looked at a design and touched nothing. The conversion is stored
   * when they save for a reason of their own, which is the brief's own sequence. */
  const [savedJson, setSavedJson] = useState<string>(() => JSON.stringify(opened))
  const isDirty = JSON.stringify(hist.present) !== savedJson
  const layout = hist.present
  const [chosen, setSelected] = useState<ItemKey>('date')
  /* ⛔ `effectsOpen` / `advancedOpen` WERE HERE AND ARE GONE — they were the two pop-ups' open flags,
   * and nothing opens a Popover any more. Keeping them as props nothing read would have left the next
   * reader looking for the pop-up they belonged to.
   * 🔴 THE SECTIONS' STATE REPLACES THEM, with the brief's defaults: MAKE IT STAND OUT open, MORE
   * OPTIONS folded. ⚠️ It lives HERE and not inside the panel so it survives selecting a different
   * item — an operator who opened MORE OPTIONS wants it open for the next box too. */
  const [standOpen, setStandOpen] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  /* 🔴 §3 · THE BACKGROUND SECTION'S FOLD, FOLDED BY DEFAULT — the brief's own default, and the right
   * one: it holds three settings a truck touches once per design. ⚠️ IT LIVES HERE, beside the other
   * two, so opening it survives selecting a different box. */
  const [bgOpen, setBgOpen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  /* 🔴 HOW MUCH DARKENING IS ALREADY **IN** THE PICTURE ON SCREEN. ⚠️ 0 UNTIL THE FIRST PNG ARRIVES,
   * which is correct: until then the stage is showing the raw blank, which has none. See the overlay's
   * own note on the stage. */
  const [previewDarken, setPreviewDarken] = useState(0)
  const [warnings, setWarnings] = useState<{ where: string; message: string }[]>([])
  const [guides, setGuides] = useState<SnapGuides>(NO_GUIDES)
  /* ⚠️ THE EDITOR'S OWN MESSAGE IS SEPARATE FROM THE CALLER'S, AND IT CARRIES ITS OWN `bad`. They are
   * about different things — the caller's is "the upload failed" / "Design saved", the editor's is
   * "both of those cannot be off" — and collapsing them into one slot meant a refusal could be hidden
   * by a stale "Design saved." sitting in the other. Both are drawn, the editor's second. */
  const [localMsg, setLocalMsg] = useState<{ text: string; bad: boolean } | null>(null)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stageW, setStageW] = useState(0)
  /* ══ 🔴 THE POSTER IS FITTED TO THE **AREA**, NOT CAPPED BY THE VIEWPORT (9 October 2026) ══════════
   *
   * ⛔ IT WAS `maxHeight: min(64vh, 820px)` AND A WIDTH DERIVED FROM IT, which is a guess at how much
   * of the window the poster may have — and the guess was wrong in both directions. On a 16-inch window
   * 64vh left a third of the height unused; on a short window the title row, the hint and the zoom
   * control pushed the bottom of the poster off the screen, because none of them was counted.
   * 🔴 SO THE GREY AREA IS MEASURED AND THE POSTER IS FITTED INSIDE IT — `min(areaW, areaH × ratio)` —
   * which is what "the largest size that fits, both width and height" actually means. ⚠️ MEASURED
   * RATHER THAN COMPUTED FROM `vh`: only the layout engine knows what the title row and the hint took.
   * ⛔ AND `clientHeight` / `clientWidth`, NOT `getBoundingClientRect()`, so the area's own padding is
   * already excluded and a scrollbar appearing cannot feed back into the size that caused it. */
  const areaRef = useRef<HTMLDivElement | null>(null)
  const [area, setArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  /**
   * `0` = Fit. ⚠️ A STEP COUNT, NOT A SCALE, so Fit survives the window being resized: at Fit the
   * poster re-fits itself, and at +2 it stays twice as big as whatever Fit now is.
   * ⛔ BOUNDED AT BOTH ENDS. Unbounded zoom-out gives a poster too small to see and unbounded zoom-in
   * gives a scroll container the size of a building.
   */
  const [zoomStep, setZoomStep] = useState(0)
  /**
   * ══ 🔴 §B1 · "👁 Preview post" — A BUTTON, NOT A MODE (10 October 2026) ═══════════════════════════
   *
   * ⛔ WHAT IT REPLACES, ONE ROUND OLD: a "✎ Edit | 👁 Preview" switch that hid the outlines in place.
   * It was a MODE — the poster stayed where it was, so the operator had to remember which of two
   * states they were in, every other control silently changed meaning, and a design left in Preview
   * looked like an editor that had stopped working.
   * 🔴 THE OVERLAY HAS NO STATE TO REMEMBER. It opens over the top, shows the PNG the server has
   * already made, and closes. ⚠️ IT IS THE SAME `preview` THE STAGE DRAWS — the real renderer's output
   * for the chosen week or event — not a second request and not an imitation.
   */
  const [previewOpen, setPreviewOpen] = useState(false)
  /* 🔴 ONE HISTORY STEP PER DRAG, AND THIS REF IS WHAT MAKES THAT TRUE. A pointer move fires dozens of
   * times; pushing each onto the undo stack would mean fifty presses of ⌘Z to undo one drag. The first
   * move of a gesture opens it, the release closes it. ⚠️ A REF AND NOT STATE: it is read and written
   * inside a pointer handler and must be correct on the NEXT event, not on the next render. */
  const gestureOpen = useRef(false)

  const W = background.width || 1
  const H = background.height || 1
  /* ⚠️ THE EDITOR SCALE NEVER REACHES STORAGE. Boxes are stored in the picture's own pixels; this is
   * the only place the on-screen size is known, and every drag converts back through it. A design made
   * on a phone therefore renders identically to one made on a desktop. */
  const scale = stageW ? stageW / W : 1

  /* 🔴 THE FITTED WIDTH IN CSS PIXELS, AND THE ZOOMED ONE. ⚠️ `ZOOM_FACTOR ** step` so each press is
   * the same proportional change — +1 then −1 returns to exactly Fit, which a fixed ±100px would not. */
  const ratio = W / H
  const fitW = area.w && area.h ? Math.max(40, Math.min(area.w, area.h * ratio)) : 0
  const ZOOM_FACTOR = 1.25
  const ZOOM_MIN = -2, ZOOM_MAX = 6
  const shownW = fitW ? fitW * ZOOM_FACTOR ** zoomStep : 0
  /* ══ ⚠️ THE PERCENTAGE IS A **READOUT**, AND AT FIT IT IS STILL A NUMBER ══════════════════════════
   * ⛔ THE OLD CONTROL PUT "Fit" WHERE THE NUMBER GOES, so the one control was a label when fitted and
   * a value when not — and pressing it was how you got back. §5's brief splits them: the number is
   * always a number, and "Fit to screen" is its own button.
   * ⚠️ 100% MEANS **FITTED**, NOT ACTUAL PIXELS. A 3840px poster shown at 440px is not "11%" to an
   * operator — it is the whole poster, which is what they asked for. The number is relative to Fit, and
   * that is what makes "Fit to screen" and "100%" agree. */
  const zoomPercent = Math.round(ZOOM_FACTOR ** zoomStep * 100)
  const atFit = zoomStep === 0

  /**
   * ══ 🔴 §5 · IS THIS THE SHAPE THAT SHOWS BIGGEST IN A FEED? ═══════════════════════════════════════
   *
   * ⚠️ **4:5, WITHIN 1%** — the same tolerance the location-poster shape rule uses, and for the same
   * reason: a 1080 × 1349 export is a 4:5 design, and telling its owner otherwise would be pedantry
   * with a green tick on it.
   * ⛔ IT IS NOT "PORTRAIT", IT IS **4:5**. A 9:16 story-shaped design is portrait and is NOT what shows
   * biggest in an Instagram or Facebook feed — the feed crops it. So the test is the ratio, not the
   * orientation, and a 9:16 design correctly gets the tip.
   */
  const isBestShape = Math.abs(ratio - 4 / 5) < 0.01

  // ── HISTORY ─────────────────────────────────────────────────────────────────────────────────────
  /* 🔴 ONE STATE OBJECT FOR past/present/future, AND EVERY UPDATE IS FUNCTIONAL. Three `useState`s
   * would be three renders per edit and, worse, a `commit` that read `layout` from the closure would
   * push a STALE present onto the past the moment two edits landed in one tick — which is exactly what
   * a drag does. */
  const commit = useCallback((fn: (l: AnyLayout) => AnyLayout) => {
    setHist(h => {
      const next = fn(h.present)
      if (next === h.present) return h
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] }
    })
  }, [])

  /** During a gesture: change the present without adding a history step. */
  const live = useCallback((fn: (l: AnyLayout) => AnyLayout) => {
    setHist(h => ({ ...h, present: fn(h.present) }))
  }, [])

  /** At the START of a gesture: the one history step the whole drag will collapse into. */
  const beginGesture = useCallback(() => {
    setHist(h => ({ past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: h.present, future: [] }))
  }, [])

  const undo = useCallback(() => setHist(h => {
    if (!h.past.length) return h
    const prev = h.past[h.past.length - 1]
    return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future].slice(0, HISTORY_LIMIT) }
  }), [])

  const redo = useCallback(() => setHist(h => {
    if (!h.future.length) return h
    const [next, ...rest] = h.future
    return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: rest }
  }), [])

  /* 🔴 ⌘Z / ⇧⌘Z, AND THEY ARE IGNORED WHILE TYPING. A heading text field or a "Words before" box has
   * its own undo stack that the operator expects to work; stealing ⌘Z inside an input would undo their
   * last DRAG while they were fixing a typo. ⚠️ `metaKey || ctrlKey` so it works on a Mac and on a
   * keyboard plugged into an iPad. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey)) return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      e.preventDefault()
      if (e.shiftKey) redo(); else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ── THE STAGE'S MEASURED WIDTH ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageW(el.clientWidth))
    ro.observe(el)
    setStageW(el.clientWidth)
    return () => ro.disconnect()
  }, [background.url])

  /* ══ 🔴 THE GREY AREA'S MEASURED BOX — WHAT "the largest size that fits" IS MEASURED AGAINST ═══════
   * ⚠️ `setState` FROM THE OBSERVER'S CALLBACK, NOT FROM THE EFFECT BODY. The lint rule that forbids
   * the latter is right: a state write during an effect is a second render before anything is correct.
   * An observer callback is an event, which is where a state write belongs.
   * ⛔ IT DEPENDS ON NOTHING. The area exists for the whole life of the editor, so re-subscribing on a
   * picture change (as the stage observer above must, because the stage is remounted with it) would
   * drop a frame for no reason. */
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    /* ══ 🔴 `clientWidth` INCLUDES PADDING, AND THAT IS A BUG IF YOU FORGET IT ═══════════════════════
     * ⛔ THE FIRST VERSION READ `el.clientWidth` AND THE POSTER OVERFLOWED BY THE PADDING. `clientWidth`
     * is the content box PLUS padding and minus the scrollbar — so on a 390px phone the area measured
     * 366 and the poster was fitted to 366 inside a 342px content box, which made the area scroll
     * sideways at **Fit**, where nothing should scroll at all.
     * 🔴 THE PADDING IS SUBTRACTED EXPLICITLY. ⚠️ READ FROM THE COMPUTED STYLE rather than hard-coded
     * as 12: `p-3` is a class somebody will change, and a number copied out of it is a number that goes
     * stale silently. ⛔ CAUGHT BY THE RENDER HARNESS — "at Fit the area does not scroll sideways" —
     * which is a measurement no class census could have made. */
    const read = () => {
      const cs = getComputedStyle(el)
      const px = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const py = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      setArea({
        w: Math.max(0, el.clientWidth - (Number.isFinite(px) ? px : 0)),
        h: Math.max(0, el.clientHeight - (Number.isFinite(py) ? py : 0)),
      })
    }
    const ro = new ResizeObserver(read)
    ro.observe(el)
    read()
    return () => ro.disconnect()
  }, [])

  // ── THE DEBOUNCED PREVIEW ───────────────────────────────────────────────────────────────────────
  /* 🔴 DEBOUNCED WHILE DRAGGING, AND THE OUTLINES DO NOT WAIT FOR IT. Every drag would otherwise be a
   * round trip and a repaint, which on a touch screen feels broken. The outline moves at once; the
   * picture catches up when the finger stops. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const r = await renderPreview(layout, previewWith)
        if (!r) return
        setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return r.url })
        /* ⚠️ THE LAYOUT THIS RENDER WAS **ASKED FOR**, not the one on screen now. The two differ while
         * the operator is still sliding, which is the whole reason the overlay exists. */
        setPreviewDarken(layout.darken)
        setWarnings(r.warnings)
      } catch { /* the outlines still work; the picture is one request behind */ }
    }, 400)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [layout, previewWith, renderPreview])

  // ── THE READABILITY SAMPLER (browser-side; see lib/weekly-post/contrast.ts) ─────────────────────
  /* 🔴 SAMPLING HAPPENS HERE BECAUSE ONLY THE BROWSER HAS A DECODER for both PNG and JPG. The server
   * has none (no sharp, no canvas), so the editor samples the picture under each box and stores the
   * average in the design; the renderer decides from it.
   * ⚠️ IT FAILS QUIETLY TO "no sample". A cross-origin picture taints the canvas and `getImageData`
   * throws — in which case the renderer adds no shadow at all rather than guessing a background and
   * altering someone's artwork on no evidence. */
  const bgImg = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!background.url) { bgImg.current = null; return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { bgImg.current = img }
    img.onerror = () => { bgImg.current = null }
    img.src = background.url
  }, [background.url])

  const sampleUnder = useCallback((b: TextBox) => {
    const img = bgImg.current
    if (!img || !img.naturalWidth) return null
    try {
      const c = document.createElement('canvas')
      const w = Math.max(1, Math.min(64, Math.round(b.w / 8)))
      const h = Math.max(1, Math.min(64, Math.round(b.h / 8)))
      c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(img, b.x, b.y, Math.max(1, b.w), Math.max(1, b.h), 0, 0, w, h)
      return averageSample(ctx.getImageData(0, 0, w, h).data)
    } catch { return null }
  }, [])

  // ── EDITS ───────────────────────────────────────────────────────────────────────────────────────
  const items = useMemo(() => itemsOf(layout, country), [layout, country])
  /* 🔴 A SELECTED ITEM THAT NO LONGER EXISTS FALLS BACK TO THE DATE — **DERIVED, NOT SYNCHRONISED.**
   * Removing "Your own text" number 2 while it was selected would otherwise leave the toolbar bound to
   * `notes[1]` — `undefined` — and the whole toolbar would vanish with no explanation.
   * ⛔ AND IT IS NOT AN EFFECT THAT CALLS `setSelected`. That was the first version and the React
   * Compiler lint refused it, correctly: an effect that writes state in its own body renders twice for
   * every removal, and for one render the toolbar IS bound to nothing. Computing the live key from the
   * list that exists right now has neither problem. */
  /* ══ 🔴 THE TWO KEYS THAT ARE NOT IN THE LIST — AND WERE THEREFORE UNREACHABLE ═══════════════════
   *
   * ⛔ **A REAL BUG, FOUND WHILE WIRING §B3 AND FIXED HERE.** `items` holds the BOXES; "All text" and
   * the background picture are items with no box, so `itemsOf` never produced them — and this line
   * read "a key that is not in the list falls back to the Date". So pressing **"Aa All text"** or
   * **"Background picture"** set `chosen` and then silently selected the DATE box, which is why both
   * panels looked like they did nothing. It shipped in the 9 October build that introduced them.
   * 🔴 THE FALLBACK IS FOR A KEY THAT NO LONGER **EXISTS** — a removed "Your own text" box — and these
   * two always exist, so they are named here rather than given a fake entry in the list. */
  /* ⚠️ ONE KEY NOW, NOT TWO (§3, 10 October 2026). The background stopped being a selection when it
   * became a section at the foot of the panel, so "All text" is the only item with no box left. ⛔ THE
   * RULE AND ITS REASON ARE UNCHANGED: the fallback is for a key that no longer EXISTS — a removed
   * "Your own text" box — and this one always does. */
  const selectableWithoutBox = chosen === ALL_TEXT_KEY
  const selected: ItemKey = items.some(i => i.key === chosen) || selectableWithoutBox ? chosen : 'date'
  const sel = boxAt(layout, selected)
  const selItem = items.find(i => i.key === selected) ?? items[0]

  /**
   * ══ 🔴 §4 · ARROW KEYS NUDGE THE SELECTED BOX, AND ONLY WHEN NOTHING IS BEING TYPED IN ═══════════
   *
   * ⛔ THE FOCUS TEST IS THE WHOLE FEATURE. A heading's text field, "Words before", the font search box
   * and every `<select>` all use the arrow keys for their own purposes — stealing them would mean an
   * operator correcting a typo moved their Date box instead. ⚠️ THE SAME TEST THE ⌘Z HANDLER ALREADY
   * USES, in the same shape, for the same reason.
   * 🔴 ONE UNDO STEP PER RUN OF NUDGES. Twenty presses of ↓ is one thing the operator did; twenty undo
   * steps to get back is not. ⛔ IT IS THE SAME `beginGesture` + `live` PAIR A DRAG USES — a nudge IS a
   * tiny drag, and giving it its own mechanism would be two ways to move a box.
   * ⚠️ THE RUN ENDS AFTER 600ms OF NO PRESSES, which is long enough to hold a key down and short enough
   * that two deliberate adjustments are two steps.
   */
  const nudgeOpen = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (nudgeOpen.current) clearTimeout(nudgeOpen.current) }, [])

  const nudge = useCallback((dx: number, dy: number) => {
    /* ══ 🔴 WHAT AN ARROW KEY MOVES ON A "7 days" DESIGN ═══════════════════════════════════════════
     * ⛔ **NOT A PART.** A part's `x`/`y` are the legacy row-1 coordinates, which nothing draws any
     * more — nudging one would silently edit a dead field and the operator would press ↓ at a poster
     * that never moves. 🔴 THE BLOCK IS WHAT MOVES, and it moves all seven rows, which is what the
     * selection on screen says it should do. */
    const week7 = isWeekLayout(layout) && layout.days
    if (week7) {
      if (selected === DAYS_KEY) {
        const d = layout.days!
        const x0 = Math.max(0, Math.min(W - d.w, d.x + dx))
        const y0 = Math.max(0, Math.min(H - d.h, d.y + dy))
        if (x0 === d.x && y0 === d.y) return
        if (!nudgeOpen.current) beginGesture()
        else clearTimeout(nudgeOpen.current)
        nudgeOpen.current = setTimeout(() => { nudgeOpen.current = null }, 600)
        live(l => (isWeekLayout(l) && l.days ? ({ ...l, days: { ...l.days, x: x0, y: y0 } } as AnyLayout) : l))
        return
      }
      if (selected === 'date' || selected === 'location' || selected === 'time' || selected === PLACE_PICTURE_KEY) return
    }
    const box = boxAt(layout, selected) ?? (selected === PLACE_PICTURE_KEY ? layout.placePicture : null)
    if (!box) return
    /* ⚠️ CLAMPED TO THE POSTER, exactly as a drag is — the validator refuses a box that reaches outside
     * the image, so a nudge that could produce one would be a nudge that cannot be saved. */
    const x = Math.max(0, Math.min(W - box.w, box.x + dx))
    const y = Math.max(0, Math.min(H - box.h, box.y + dy))
    if (x === box.x && y === box.y) return
    /* 🔴 THE FIRST PRESS OF A RUN OPENS THE HISTORY STEP; the rest are live. Identical to a drag. */
    if (!nudgeOpen.current) beginGesture()
    else clearTimeout(nudgeOpen.current)
    nudgeOpen.current = setTimeout(() => { nudgeOpen.current = null }, 600)
    live(l => (selected === PLACE_PICTURE_KEY
      ? ({ ...l, placePicture: { ...l.placePicture, x, y } } as AnyLayout)
      : withBox(l, selected, { x, y })))
  }, [layout, selected, W, H, beginGesture, live])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1
      const d = e.key === 'ArrowLeft' ? [-step, 0]
        : e.key === 'ArrowRight' ? [step, 0]
        : e.key === 'ArrowUp' ? [0, -step]
        : e.key === 'ArrowDown' ? [0, step]
        : null
      if (!d) return
      /* ⛔ **THE FOCUS TEST, AND IT COMES BEFORE `preventDefault`.** A `<select>` that had already
       * consumed the key would otherwise be prevented from doing so. */
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      /* ⚠️ `readOnly` DIRECTLY RATHER THAN `editable` — a hook may not read a `const` declared below
       * it, and `editable` lives with the other render derivations. */
      if (readOnly) return
      e.preventDefault()
      nudge(d[0], d[1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nudge, readOnly])

  /**
   * "Your own text", removed.
   *
   * ⚠️ A `useCallback` AND DECLARED **HERE**, above the key handler that calls it (§6, 10 October
   * 2026). ⛔ A HOOK MAY NOT READ A `const` DECLARED BELOW IT — the third time this file has met that
   * rule — and a plain function would be a new identity every render, which would tear the keydown
   * listener down and rebuild it on every keystroke in the panel.
   * ⚠️ IT SELECTS THE DATE AFTERWARDS, because the box that was selected no longer exists; leaving the
   * selection pointing at `notes[i]` is what `selected`'s own fallback was written for, and choosing
   * deliberately is better than falling back.
   */
  const removeNote = useCallback((key: ItemKey) => {
    const i = noteIndex(key)
    if (i < 0) return
    setSelected('date')
    commit(l => ({ ...l, notes: l.notes.filter((_, j) => j !== i) } as AnyLayout))
  }, [commit])

  /**
   * ══ 🔴 §6 · DELETE / BACKSPACE REMOVES THE SELECTED "Your own text" BOX ═══════════════════════════
   *
   * ⛔ **THE FOCUS TEST IS THE WHOLE FEATURE, AGAIN.** Backspace in a heading's text field, in "Words
   * before" or in the font search box must delete a CHARACTER — stealing it would mean an operator
   * correcting a typo lost their text box instead. ⚠️ THE SAME TEST THE ⌘Z AND ARROW HANDLERS USE, in
   * the same shape, and it comes BEFORE `preventDefault` for the same reason.
   * ⛔ ONLY A "Your own text" BOX. A built-in item is switched off, never deleted: a design with no
   * Date box is a state the validator understands and a design MISSING one is not.
   * ⚠️ IT IS ITS OWN EFFECT rather than another branch of the arrow handler, because its dependencies
   * are different — `selected` and `removeNote` change on every selection, and the nudge handler must
   * not be torn down and rebuilt for that.
   * 🔴 NO CONFIRM: `commit` puts it on the undo stack, so ⌘Z brings it back — which is the brief's own
   * reasoning and is true of every other change this editor makes.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      if (readOnly || noteIndex(selected) < 0) return
      e.preventDefault()
      removeNote(selected)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, readOnly, removeNote])

  const patchSel = (patch: Partial<DateBox & NoteBox>) => commit(l => withBox(l, selected, patch))
  const patchEffects = (patch: Partial<Effects>) => commit(l => withEffects(l, selected, patch))

  /* ══ 🔴 "All text" — THE FIVE MUTATORS, AND WHY EACH ONE IS SEPARATE ══════════════════════════════
   *
   * ⚠️ THE PANEL NEVER DECIDES WHERE A LOOK CHANGE GOES. It is handed `patchLook`/`patchLookEffects`,
   * which are bound HERE to the shared style or to the box depending on what is selected — so a control
   * cannot be wired to the wrong target by whoever adds the next one. ⛔ A FOLLOWING BOX IS NEVER A
   * TARGET: its style controls are not drawn at all (the blue note is), because writing look fields to
   * a box nothing reads them from is the one failure mode here that is completely invisible. */
  const patchShared = (patch: Partial<TextLook>) =>
    commit(l => ({ ...l, textStyle: { ...l.textStyle, ...patch } } as AnyLayout))
  const patchSharedEffects = (patch: Partial<Effects>) =>
    commit(l => ({ ...l, textStyle: { ...l.textStyle, effects: { ...l.textStyle.effects, ...patch } } } as AnyLayout))

  /**
   * "Change just this box" — copy the shared look in, then mark it OWN.
   *
   * ⛔ THE COPY IS THE WHOLE POINT AND IT MUST HAPPEN IN THE SAME COMMIT. Flipping the flag alone would
   * reveal whatever stale look the box happened to carry in storage — on an old design that is a font
   * nobody has used for months — so the box would visibly change the instant the operator asked to
   * change *just this box*, before they had changed anything.
   */
  const makeOwn = (key: ItemKey) => commit(l => {
    const b = boxAt(l, key)
    if (!b) return l
    return withBox({ ...l } as AnyLayout, key, { ...l.textStyle, effects: { ...l.textStyle.effects }, ownStyle: true })
  })

  /** "Match All text again" — drop the box's own look. ⚠️ Its own fields are LEFT IN PLACE, unread. */
  const makeFollow = (key: ItemKey) => commit(l => withBox(l, key, { ownStyle: false }))

  /**
   * "Use this style for all text" — this box's look becomes the shared one, and EVERY box follows it.
   *
   * 🔴 INCLUDING THE OTHER OWN-STYLE BOXES, which is the brief's instruction and the only reading that
   * makes the sentence true. A version that left other own boxes alone would be "use this style for all
   * text except the ones that disagree", which is what the operator pressed the link to stop.
   */
  const promoteToShared = (key: ItemKey) => commit(l => {
    const b = boxAt(l, key)
    if (!b) return l
    let out = { ...l, textStyle: lookOf(b) } as AnyLayout
    for (const k of allTextItems(out)) out = withBox(out, k, { ownStyle: false })
    return out
  })

  /**
   * ══ 🔴 "Text size" ON THE "All text" PANEL — A NUMBER YOU CHOOSE (10 October 2026) ════════════════
   *
   * ⛔ IT WAS **"Smaller | Bigger"**, two buttons that nudged every box by 5%. DOMINIC: *"for font
   * there's smaller and bigger options. just change this to font size so they can choose."* Right: two
   * relative buttons make an operator press and look, press and look, with no idea where they are — and
   * the one question they are actually asking ("how big is my writing?") had no answer on the screen.
   *
   * 🔴 THE NUMBER IS THE **DATE BOX'S** SIZE, and every other box moves with it IN PROPORTION. ⚠️ THAT
   * IS THE ONLY HONEST READING OF "one size" FOR THIS PANEL: a design's boxes are deliberately
   * different sizes — a 120px heading over a 40px time — and setting them all to one number would
   * flatten a hierarchy the truck built on purpose. So the stepper shows a size, changing it scales
   * everything by the same ratio, and the number it shows lands exactly on what was typed.
   * ⚠️ THE DATE IS THE REFERENCE because it is the box every design has, the one this panel's other
   * bound (`refSize`) already uses, and the one the editor opens on.
   */
  const setAllTextSize = (px: number) => commit(l => {
    const from = Math.max(1, l.date.fontSize)
    const to = Math.max(6, Math.min(l.height, Math.round(px)))
    if (to === from) return l
    const ratio = to / from
    let out = l
    for (const key of allTextItems(l)) {
      const b = boxAt(out, key)
      if (!b) continue
      /* ⚠️ `Math.max(6, …)` IS THE VALIDATOR'S OWN FLOOR, so a scale-down cannot produce a design that
       * will not save. ⛔ AND THE REFERENCE BOX LANDS EXACTLY ON `to` — `round(from × to/from)` is `to`
       * — so the readout and the design agree after every press. */
      out = withBox(out, key, { fontSize: Math.min(l.height, Math.max(6, Math.round(b.fontSize * ratio))) })
    }
    return out
  })

  /* ══ ⛔ THESE THREE COMPUTE FROM `layout` AND **DO NOT** SET STATE INSIDE AN UPDATER ══════════════
   *
   * The first version put `setLocalMsg` and `setSelected` inside the function handed to `commit`. That
   * works and it is wrong: an updater passed to `setState` must be PURE, because React is free to call
   * it twice (it does, in development) — so the side effects ran twice, and more importantly the
   * updater became a place where a refusal was decided rather than a place where a value was computed.
   * ⚠️ READING `layout` FROM THE RENDER IS CORRECT HERE because all three are CLICK handlers: the
   * render that drew the button is the render whose layout the operator was looking at. */

  const toggleItem = (key: ItemKey, on: boolean) => {
    const next = withBox(layout, key, { enabled: on })
    /* ⚠️ THE LAST-TOGGLE RULE IS ABOUT PLACE **TEXT** AND TIME, not about the picture — a design with
     * the picture off is not a design that cannot say an event is cancelled. `toggleIsAllowed` reads
     * `location`/`time` only, so this passes through it untouched. */
    /* 🔴 THE LAST ONE OF PLACE AND TIME IS BLOCKED, with the reason said out loud. A cancelled event
     * says so in those two boxes — the place name struck through, and the word CANCELLED where the
     * time goes — so with both off a cancelled event would render as an ordinary poster telling
     * customers to come to something that is not happening. `toggleIsAllowed` is the same rule the
     * validator enforces on the server; this is here so the truck is told rather than refused after
     * a save. */
    if (!toggleIsAllowed(next)) { setLocalMsg({ text: LAST_TOGGLE_MESSAGE, bad: true }); return }
    setLocalMsg(null)
    commit(() => next)
  }

  const addNote = () => {
    if (layout.notes.length >= MAX_NOTE_BOXES) return
    const box = isWeekLayout(layout) ? defaultNoteBox(layout) : defaultEventNoteBox(layout)
    setSelected(`${NOTE_PREFIX}${layout.notes.length}`)
    commit(l => ({ ...l, notes: [...l.notes, box] } as AnyLayout))
  }

  /* ══ ⛔ WHERE `copyStyleToAll` WAS — REMOVED 9 OCTOBER 2026 ════════════════════════════════════════
   * IT WROTE ONE BOX'S LOOK ONTO EVERY OTHER BOX: font, size, colour, capitals and effects, but not
   * `align` — deliberately, because a weekly design has the date left and the time right on purpose.
   * 🔴 IT WAS A **ONE-WAY BULK WRITE AND THAT IS WHY IT IS GONE.** It stamped eleven copies of one
   * style, so the next change meant eleven more presses, and nothing in the data recorded that the
   * boxes were ever meant to match. An operator who changed the shared font a week later had no way to
   * know which boxes had been copied from which.
   * ⚠️ "All text" REPLACES IT WITH A RELATIONSHIP: `layout.textStyle` is the look, every box either
   * follows it or owns its own, and `promoteToShared` above is this button's job done properly — it
   * makes the selected box's look THE shared one, so every box follows it from then on rather than
   * receiving a copy of it once. ⛔ `align` IS STILL NOT SHARED, for exactly the old reason. */

  const centreSel = (axis: 'x' | 'y') => commit(l => {
    const b = boxAt(l, selected)
    if (!b) return l
    return axis === 'x'
      ? withBox(l, selected, { x: Math.max(0, Math.round((W - b.w) / 2)) })
      : withBox(l, selected, { y: Math.max(0, Math.round((H - b.h) / 2)) })
  })

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 "THE 7 DAYS" — THE BLOCK, ITS PARTS, AND THE THREE GESTURES (10 October 2026)
   * ══════════════════════════════════════════════════════════════════════════════════════════════ */
  const daysBlock: DaysBlock | null = isWeekLayout(layout) ? (layout.days ?? null) : null
  const dayOn = useMemo(() => (isWeekLayout(layout) ? partsOn(layout) : null), [layout])

  /**
   * A quick layout: the arrangement, the weights and the order, in one press.
   *
   * ⛔ IT DOES **NOT** SWITCH ANY PART ON OR OFF — see `QUICK_LAYOUTS`.
   * 🔴 IT DOES RESET `textH` TO THE WHOLE ROW, and that is not a detail: "Day on top" puts the words
   * on two lines inside the band, so a band left at a converted design's old row height would halve
   * every line. The operator pressed a button that rearranges the row; the band is part of the row.
   */
  const applyQuickLayout = (arrangement: DaysArrangement) => commit(l => {
    if (!isWeekLayout(l) || !l.days) return l
    return {
      ...l,
      days: {
        ...l.days,
        arrangement,
        parts: QUICK_LAYOUTS[arrangement].parts.map(p => ({ ...p })),
        textH: Math.max(8, Math.round(l.days.h / DAYS_IN_WEEK)),
      },
    } as AnyLayout
  })

  /** Drag ⋮⋮. ⚠️ The order is the BLOCK's; which parts are drawn is still the boxes' own switches. */
  const reorderDayParts = (from: number, to: number) => commit(l => (
    isWeekLayout(l) && l.days
      ? ({ ...l, days: { ...l.days, parts: reorderParts(l.days.parts, from, to) } } as AnyLayout)
      : l))

  /* 🔴 THE VALUES A GESTURE STARTED FROM. ⚠️ A REF, not state: it is written in a pointer handler and
   * must be correct on the NEXT event rather than on the next render. ⛔ AND THE SCALE FACTOR IS
   * APPLIED TO **THESE**, never to the current values — multiplying frame by frame compounds the
   * rounding, so a slow corner drag and a fast one would end at different sizes. */
  const dragFrom = useRef<{ textH: number; date: number; place: number; time: number } | null>(null)

  /**
   * One frame of a drag on the block.
   *
   * ⚠️ A CORNER SCALES **EVERYTHING INSIDE**: the text band and all three parts' sizes, by the height
   * factor. A SIDE CHANGES THE RECTANGLE ONLY — the brief's own split, and the reason `DragInfo` exists.
   */
  const dragDays = (patch: Partial<DaysBlock>, info?: DragInfo) => live(l => {
    if (!isWeekLayout(l) || !l.days) return l
    const next: DaysBlock = { ...l.days, ...patch }
    const from = dragFrom.current
    if (info?.kind !== 'corner' || !from) return { ...l, days: next } as AnyLayout
    const f = Math.max(0.05, Math.min(20, info.factor))
    const size = (v: number) => Math.max(6, Math.min(H, Math.round(v * f)))
    return {
      ...l,
      days: { ...next, textH: Math.max(8, Math.round(from.textH * f)) },
      date: { ...l.date, fontSize: size(from.date) },
      location: { ...l.location, fontSize: size(from.place) },
      time: { ...l.time, fontSize: size(from.time) },
    } as AnyLayout
  })

  /**
   * ⚠️ RE-SAMPLED FROM THE **CELL**, not from the part's stored box. The readability rule compares the
   * text colour with the artwork under it, and under "The 7 days" the artwork under a part is whatever
   * is under its cell in row 1 — the stored box is the legacy row-1 rectangle, which nothing draws.
   */
  const resampleParts = () => live(l => {
    if (!isWeekLayout(l) || !l.days || !dayOn) return l
    const cells = dayCells(l.days, dayOn, 0)
    const at = (k: DayPartKey) => cells.find(c => c.key === k)
    const re = <B extends TextBox>(b: B, k: DayPartKey): B => {
      const c = at(k)
      return c ? ({ ...b, bgSample: sampleUnder({ ...b, ...c }) }) : b
    }
    return {
      ...l,
      date: re(l.date, 'dayDate'),
      location: re(l.location, 'place'),
      time: re(l.time, 'times'),
    } as AnyLayout
  })

  /** A tap on the block: whichever cell of whichever row it landed in selects that part. */
  const selectPartAt = (nx: number, ny: number) => {
    if (!daysBlock || !dayOn) return
    for (let i = 0; i < DAYS_IN_WEEK; i++) {
      for (const c of dayCells(daysBlock, dayOn, i)) {
        if (nx >= c.x && nx <= c.x + c.w && ny >= c.y && ny <= c.y + c.h) {
          setSelected(PART_ITEM_KEY[c.key])
          return
        }
      }
    }
    /* ⚠️ A TAP IN A GAP LEAVES THE BLOCK SELECTED, which is what was pressed. */
    setSelected(DAYS_KEY)
  }

  /* ══ 🔴 §2 · THE LIVE POSTER — BUILT EVERY RENDER, FROM THE LAYOUT ON SCREEN ═════════════════════
   *
   * ⛔ **DOMINIC:** *"when i move a box the text stays in its old position for seconds."* It did,
   * because the stage was an `<img>` of the server's PNG: a drag moved the OUTLINE at once and the
   * WORDS waited 400ms of debounce plus a render. 🔴 THE TREE IS NOW BUILT HERE, IN THE SAME RENDER AS
   * THE DRAG, by the renderer's own `weeklyTree` / `eventTree` — so the words are never in the old
   * place, because there is no old place for them to be in.
   *
   * ⚠️ **THE FONT FACES ARE ASKED FOR THROUGH `fontsUsedBy`**, which is the same list the renderer's
   * `bundleFor` uses. ⛔ NOT A SET BUILT BY WALKING THE BOXES HERE: that would be a second answer to
   * "which fonts does this design need", and the one that mattered would be the server's.
   * ⚠️ THE HOOK IS CALLED UNCONDITIONALLY, with the ids recomputed each render — `useLiveFonts` keys
   * its effect on the ids and caches each face at module scope, so a remount costs nothing.
   */
  const fontFaces = useMemo(
    () => (isWeekLayout(layout) ? fontsUsedBy(layout) : fontsUsedByEvent(layout)),
    [layout],
  )
  const liveFonts = useLiveFonts(token, fontFaces)

  /* 🔴 THE TREE, OR NULL. ⚠️ NULL IS AN HONEST STATE AND THE STAGE FALLS BACK TO THE PNG: the fonts
   * have not arrived, the week has not loaded, or the caller has nothing to preview with. ⛔ A TREE
   * DRAWN BEFORE THE FONTS ARE READY WOULD BE A FRAME IN THE BROWSER'S DEFAULT TYPEFACE, laid out with
   * the wrong widths — worse than the PNG it replaced, because it would be confidently wrong. */
  const liveTree = useMemo(() => {
    const fonts = liveFonts.bundle
    if (!fonts || !liveData) return null
    try {
      if (liveData.kind === 'week') {
        if (!isWeekLayout(layout)) return null
        return weeklyTree({
          layout,
          /* ⚠️ `included` IS `[]` AND `range.days` IS EMPTY BECAUSE THE TREE READS NEITHER — only
           * `range.start` / `range.end`, for the heading's `{start}` and `{end}`. Inventing the other
           * two fields in the caller would be inventing data to satisfy a type. */
          week: {
            range: { which: 'this', start: liveData.start, end: liveData.end, days: [] } as WeekRange,
            /* ══ 🔴 THE TIMES ARE RE-DERIVED FROM **THIS** DESIGN'S CLOCK ══════════════════════════
             * ⛔ `DayEntry.time` IS FORMATTED WHEN THE WEEK IS BUILT, and the week was fetched with
             * whatever `timeStyle` was SAVED. The operator can change 12h/24h in this panel and the
             * PNG follows at once (the render action builds the week with the posted layout's style) —
             * so a stage that drew the fetched string would show the old clock until the week was
             * fetched again, which is exactly the staleness §2 removes.
             * ⚠️ `timeTextFor` IS THE FUNCTION `entryFor` ITSELF USES. Formatting it here would be a
             * second answer to "what does the Time box say". */
            days: liveData.days.map(d => ({
              ...d,
              entries: d.entries.map(e => ({
                ...e,
                time: timeTextFor(e.status, e.startTime, e.endTime, layout.timeStyle),
              })),
            })),
            included: [],
          },
          fonts,
          country,
          note: liveData.note,
        })
      }
      if (isWeekLayout(layout)) return null
      return eventTree({
        layout, entry: liveData.entry, date: liveData.date, fonts, country, note: liveData.note,
      })
    } catch {
      /* ⚠️ A THROW HERE MUST NOT TAKE THE EDITOR DOWN. The stage falls back to the PNG and every
       * control still works, which is the difference between a degraded preview and a white screen. */
      return null
    }
  }, [layout, liveData, liveFonts.bundle, country])

  /* ══ 🔴 §2 · THE DARKENING IS A CSS LAYER AT **FULL** STRENGTH NOW ══════════════════════════════
   * ⛔ IT USED TO DRAW ONLY THE DIFFERENCE THE PNG HAD NOT CAUGHT UP WITH (`layout.darken` minus the
   * darkening already baked into the picture on screen), because the picture on screen WAS the PNG and
   * the PNG already had some of it. 🔴 THE STAGE SHOWS THE **BLANK** WHILE THE LIVE TREE IS UP, so
   * there is nothing baked in and the layer is simply the setting — the brief's "the darkening as a CSS
   * layer at the same strength". ⚠️ THE OLD SUBTRACTION IS KEPT FOR THE FALLBACK, where the stage is
   * once again the PNG and the old reasoning still holds exactly. */
  const liveDarken = liveTree ? layout.darken : Math.max(0, layout.darken - previewDarken)

  const editable = !readOnly

  /* 🔴 ONE SAVE PATH, AND THE BUTTON AND THE DIALOG BOTH GO THROUGH IT. ⚠️ `setSavedJson` BEFORE the
   * call, not after it: the baseline is "what we sent", so a save that fails leaves the editor honest
   * about having tried rather than claiming unsaved changes it already pushed. */
  const doSave = useCallback(() => {
    setSavedJson(JSON.stringify(layout))
    return onSave(layout)
  }, [layout, onSave])

  useEffect(() => {
    onSaver?.(doSave)
    return () => onSaver?.(null)
  }, [onSaver, doSave])

  /* ⚠️ REPORTED IN AN EFFECT, NOT DURING RENDER. Calling a parent's setState while this component is
   * rendering is the "cannot update a component while rendering a different component" warning, and
   * the parent only needs to know after the render that changed it. ⛔ UNMOUNT CLEARS IT, so a page
   * that has left the editor cannot be left believing it still has unsaved work. */
  useEffect(() => {
    onDirtyChange?.(isDirty)
    return () => onDirtyChange?.(false)
  }, [isDirty, onDirtyChange])

  // ── THE TOP BAR ─────────────────────────────────────────────────────────────────────────────────
  const topBar = (
    <div className="flex flex-wrap items-center gap-2 gap-y-3">
      <button type="button" onClick={onBack} className="text-sm font-bold text-orange-700 shrink-0">
        {backLabel}
      </button>
      <span className="text-sm font-black text-slate-900 truncate min-w-0">{designName}</span>
      <div className="grow" />
      {/* ══ 🔴 §7 (10 October 2026) · THE ONE ITEM IN THIS ROW THAT COULD PUSH THE PAGE SIDEWAYS ═══════
        * ⛔ IT WAS `shrink-0` WITH AN UNCAPPED `<select>`, and a select sizes itself to its LONGEST
        * OPTION. On the weekly editor those options carry a date range; on the single event editor they
        * are EVENT LABELS — "Great Waldingfield Recreation Ground · Tue 14 Oct" — so the row's width
        * depended on a truck's venue names. Measured at 390: the title row's content came to 390px
        * inside a 366px box and the PAGE scrolled sideways, over a drag surface.
        * 🔴 `min-w-0` ON THE LABEL AND A CAP ON THE SELECT. The label can now shrink, the select stops
        * at 12rem and ellipsises, and the row wraps as it was always meant to. ⚠️ THE VALUE IS STILL
        * READABLE: the chosen option is what a closed select shows, and it is the short end of the
        * string — "This week · Mon 12 Oct…" tells an operator which week they are previewing. */}
      {previewOptions.length > 0 && (
        <label className="flex min-w-0 items-center gap-1">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">Preview with</span>
          <select value={previewWith} onChange={e => onPreviewWith(e.target.value)}
            className={`${TOOL_INPUT} min-w-0 max-w-[12rem] truncate`}>
            {previewOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      )}
      {/* ══ 🔴 §B1 · "👁 Preview post" — BESIDE "Preview with", BECAUSE IT IS THE SAME SENTENCE ═══════
        * ⚠️ IT SHOWS THE PNG THE SERVER HAS ALREADY MADE for the chosen week or event — the real
        * renderer's output, the same bytes the stage is drawing — at full size with nothing on top of
        * it. ⛔ IT IS NOT A SECOND RENDER and must not be: a "preview" that asked for its own PNG could
        * answer differently from the one the operator has been looking at. */}
      <button type="button" onClick={() => setPreviewOpen(true)} data-preview-post
        className={`${TOOL_BTN} ${TOOL_BTN_OFF} shrink-0`}>{PREVIEW_POST_BTN}</button>
      {/* ⚠️ DISABLED RATHER THAN HIDDEN. A button that appears and disappears moves everything beside
        * it, so the Cancel and Save buttons would shift the first time anything was undone. */}
      <button type="button" onClick={undo} disabled={!hist.past.length}
        title="Undo (⌘Z)"
        className={`${TOOL_BTN} ${TOOL_BTN_OFF} disabled:text-slate-300 disabled:border-slate-100`}>Undo</button>
      <button type="button" onClick={redo} disabled={!hist.future.length}
        title="Redo (⇧⌘Z)"
        className={`${TOOL_BTN} ${TOOL_BTN_OFF} disabled:text-slate-300 disabled:border-slate-100`}>Redo</button>
      <Btn label="Cancel" colour="slate" size="sm" onClick={onCancel} />
      <Btn label={saving ? 'Saving…' : 'Save design'} loading={saving} size="sm"
        disabled={!editable} onClick={() => { void doSave() }} />
    </div>
  )

  // ── THE ITEM GRID — TWO ACROSS, AT THE TOP OF THE ONE PANEL ─────────────────────────────────────
  /* ══ 🔴 IT WAS A 250px COLUMN ON THE FAR SIDE OF THE POSTER (9 October 2026) ═══════════════════════
   * ⛔ ONE ROW PER ITEM, EACH WITH A NAME AND A GREY SAMPLE, down the left — and the settings for
   * whatever you picked were in a second column on the RIGHT. Picking a box and changing it was a
   * 1,000px round trip across the poster, and the two halves of one job were as far apart as the screen
   * allowed. ⚠️ THE SAMPLES WENT WITH THE COLUMN and that is a real loss, named in the report: two
   * across has room for a name and a switch, not for "Date · Wednesday 14th October". What replaces
   * them is the poster itself, which is now big enough to read.
   * 🔴 "All text" LEADS, FULL WIDTH, because on a weekly design it is the control an operator wants
   * first: eleven boxes, one font. ⚠️ It has no switch — there is no box to turn off. */
  const ownNames = items
    .filter(it => {
      const b = boxAt(layout, it.key)
      return !!b && b.ownStyle
    })
    .map(it => ({ key: it.key, name: it.name }))

  /**
   * ══ 🔴 §4 · EVERY BUTTON IN THE GRID CARRIES A › (10 October 2026) ═══════════════════════════════
   *
   * ⛔ THEY LOOKED LIKE **TOGGLES**. Each is a bordered rectangle with a word in it, sitting beside a
   * real on/off switch — so the one thing the grid does not say is that pressing one OPENS something.
   * An operator who read them as switches had no reason to press the one they wanted to change.
   * ⚠️ A CHEVRON IS THE PRODUCT'S OWN "this opens" MARK, and it is `aria-hidden`: the button's own
   * words are the label, and a screen reader announcing "chevron right" after each one is noise.
   * 🔴 `subLabel` IS THE SECOND GREY LINE — only "Style all the writing" has one, and it is what makes
   * that button's name short enough to read at a glance (§4).
   */
  const itemBtn = (key: ItemKey, label: string, extra?: React.ReactNode, subLabel?: string) => (
    <button type="button" data-item={key} onClick={() => setSelected(key)}
      className={`flex min-w-0 grow items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left ${key === selected
        ? 'border-orange-400 bg-orange-50'
        : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <span className="min-w-0 grow">
        <span className={`flex items-center gap-1 text-[12px] leading-tight ${key === selected
          ? 'font-bold text-orange-700' : 'font-semibold text-slate-700'}`}>
          <span className="min-w-0 truncate">{label}</span>
          {extra}
        </span>
        {subLabel && (
          <span className="mt-0.5 block truncate text-[10px] font-medium leading-tight text-slate-400"
            data-item-sub>{subLabel}</span>
        )}
      </span>
      <span data-item-chevron aria-hidden="true"
        className={`shrink-0 text-[13px] leading-none ${key === selected ? 'text-orange-500' : 'text-slate-300'}`}>›</span>
    </button>
  )

  /** One item: its switch, its name, and the "own" badge when it has its own style. */
  const itemCell = (it: Item) => {
    const b = boxAt(layout, it.key)
    return (
      <div key={it.key} className="flex min-w-0 items-center gap-1.5">
        {it.switchable
          ? <Switch on={it.enabled} label={it.name}
              onToggle={() => editable && toggleItem(it.key, !it.enabled)} />
          /* ⚠️ A SPACER WHERE "Rows" WOULD HAVE A SWITCH, so the names stay in one column. An item with
           * nothing to switch off (row spacing is not drawn, it is a distance) must not be given a dead
           * toggle to explain. */
          : <span className="w-9 shrink-0" aria-hidden="true" />}
        {itemBtn(it.key, it.name,
          /* ══ 🔴 EVERY TEXT BOX SAYS WHICH WAY IT IS WIRED, FROM THE GRID — §3 ═══════════════════════
           * ⛔ THE "own" BADGE ALONE WAS HALF AN ANSWER. A box with no badge was either following All
           * text or not a text box at all, and the operator could not tell which without selecting it.
           * 🔴 SO A FOLLOWING TEXT BOX CARRIES A 🔗 and an own-style one keeps its badge. ⚠️ THE PICTURE
           * AND THE ROW SPACING GET NEITHER, which is correct: `boxAt` returns null for both, they have
           * no text and "All text" has nothing to say about them. */
          !b ? null
            : b.ownStyle
              ? <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold uppercase tracking-wide text-amber-700"
                  data-own-badge>{OWN_BADGE}</span>
              : <span className="shrink-0 text-[10px] leading-none text-slate-400"
                  data-follow-glyph title={STYLE_MATCH}>{FOLLOW_GLYPH}</span>)}
      </div>
    )
  }

  /* ⚠️ THE PARTS OF A DAY ROW ARE NOT BUTTONS. They are selected by clicking the words on the poster
   * or from the "The 7 days" panel's own list — see `Item.group`. */
  const gridItems = items.filter(i => i.group !== 'part')
  /* ⚠️ THE WEEKLY DESIGN'S PER-ROW ITEMS, which get their own sub-heading below. On a single event
   * design this is empty and the heading does not render. */
  const rowItems = gridItems.filter(i => i.group === 'row')
  const itemGrid = (
    <div data-item-grid>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{EDITOR_LEFT_TITLE}</p>
        {/* ══ ⚠️ "click one to change it" — §B9 ═══════════════════════════════════════════════════════
          * ⛔ THE 🔗 LEGEND HELD THIS SLOT FOR ONE ROUND AND IS GONE. It explained a glyph that, on the
          * weekly grid, now appears on nothing at all: the four text boxes it marked are inside "The 7
          * days", and the two buttons left are a heading and a block. An instruction is worth more than
          * a key to a symbol that is not on screen. ⚠️ THE GLYPH ITSELF SURVIVES on the single event
          * design's four buttons, with its meaning in the button's `title`. */}
        <span className="text-[10px] text-slate-400" data-click-one>{EDITOR_CLICK_ONE}</span>
      </div>

      {/* ══ 🔴 §4 · "Aa  Style all the writing", WITH ITS OWN SECOND LINE ════════════════════════════
        * ⛔ IT READ "Aa  All text · change all the writing at once" — a NAME, a middot and an
        * EXPLANATION on one line, which at this width truncated to "Aa All text · change all the…".
        * So the half that said what the button does was the half that got cut.
        * 🔴 THE NAME IS NOW THE INSTRUCTION ("Style all the writing") and the explanation is a grey
        * line of its own underneath, where it has room. ⚠️ "Aa" STAYS: it says "letters" in two
        * characters and needs no asset. */}
      <div className="mt-1.5 flex">
        {itemBtn(ALL_TEXT_KEY, `Aa  ${ALL_TEXT_ITEM}`, null, ALL_TEXT_SAMPLE)}
      </div>

      {/* 🔴 TWO PER ROW. `grid-cols-2` rather than a wrapping flex, so the second column lines up down
        * the panel instead of starting wherever the longest name on the row above ended. */}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {gridItems.filter(i => i.group !== 'row').map(itemCell)}
      </div>

      {/* ══ ⚠️ "EACH ROW" SURVIVES THE REDESIGN, AND IT HAS TO ════════════════════════════════════
        * ⛔ IT EXISTS BECAUSE THE WEEKLY POST HAS SEVEN OF THEM. Without it the list reads as "one
        * date, one place, one time" and the operator places their boxes for Monday and wonders where
        * Tuesday went. ⚠️ THE BRIEF'S §2 LISTS THE **SINGLE EVENT** ITEMS, which have no groups — on
        * that design `rowItems` is empty and this whole block disappears, which is why it can stay
        * without contradicting the brief. */}
      {rowItems.length > 0 && (
        <>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Each row</p>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {rowItems.map(itemCell)}
          </div>
        </>
      )}

      {/* ⚠️ SAID OUT LOUD WHEN PLACE IS OFF. Switching the place off is only correct when the venue name
        * is already printed in the picture; a truck who switched it off by mistake would otherwise post
        * artwork that never says where they are. */}
      {!layout.location.enabled && !(isWeekLayout(layout) && layout.days) && (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          The place name is in your picture — HatchGrab won’t add it.
        </p>
      )}

      {layout.notes.length < MAX_NOTE_BOXES && (
        <button type="button" onClick={addNote} disabled={!editable}
          className="mt-1.5 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[12px] font-bold text-orange-700 hover:bg-orange-50 disabled:border-slate-200 disabled:text-slate-300"
          data-add-note>{EDITOR_ADD_OWN_TEXT}</button>
      )}

      {/* ══ ⛔ TOMBSTONE · THE "Background picture" BUTTON — REMOVED 10 OCTOBER 2026 (§B3) ═══════════
        * It was the last row of this grid for one round, and before that a card of its own. It is gone
        * because **the picture is on the screen**: clicking it — anywhere that is not a box — selects
        * it and opens exactly these settings. A button that selects the biggest thing on the page is a
        * second way to do what pointing at it already does. ⚠️ `BACKGROUND_KEY` IS UNCHANGED and the
        * panel still branches on it; only the button has gone. */}
    </div>
  )

  /* ══ 🔴 THE BACKGROUND PICTURE'S SETTINGS — AND THE DUPLICATED HEADING IS GONE ════════════════════
   *
   * ⚠️ DOMINIC: *"remove the box showing 'Background picture 3840×2160' unless it has a purpose but it
   * doesn't seem to do anything."* ⛔ **IT HAS ONE, AND IT IS THE ONLY ONE THERE IS**: this card holds
   * "Replace picture", which is the sole way to change a design's artwork — and §5 of the same brief
   * puts the shape advice here. So the CONTROL stays.
   * 🔴 WHAT WAS GENUINELY DOING NOTHING IS THE **DUPLICATION**, and that is what went. The card had its
   * own "Background picture" heading directly under the panel's own "Background picture" title, and the
   * size appeared twice more — once on the grid button and once here. Four readouts of two facts.
   * ⚠️ SO: the heading is the panel's, the size is here (where §5 wants it), and the grid button carries
   * the name alone. ⛔ IF THE BOX STILL LOOKS INERT AFTER THIS, the next thing to try is making it a
   * drop target like the Location settings boxes — say so and I will.
   */
  const pictureCard = (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-14 rounded-lg overflow-hidden bg-slate-100 border border-slate-200"
          style={{ aspectRatio: `${W} / ${H}` }}>
          {background.url && <img src={background.url} alt="" className="w-full h-full object-cover" />}
        </span>
        <span className="min-w-0">
          {/* ══ 🔴 §5 · THE SIZE, THE SHAPE, AND WHETHER IT IS THE BEST ONE ═══════════════════════════
            * ⛔ THE SIZE ALONE TOLD AN OPERATOR NOTHING THEY COULD ACT ON. "3840 × 2160" is a fact; what
            * they need to know is that a 16:9 picture will be letterboxed into a feed that gives a 4:5
            * one half again as much height. 🔴 SO A 4:5 DESIGN GETS A GREEN TICK and anything else gets
            * the tip — and the tip names the numbers, so acting on it needs no second look.
            * ⚠️ WITHIN 1%, which is the same tolerance the poster shape rule uses. A 1080 × 1349 export
            * is a 4:5 design, and telling its owner otherwise would be pedantry with a green tick. */}
          <span className="block text-xs font-semibold text-slate-700" data-bg-size>
            {W} × {H} · {shapeName(W, H)}
            {isBestShape && <span className="font-bold text-green-700" data-bg-best> {BG_BEST_SUFFIX}</span>}
          </span>
          <label className={`block text-xs font-bold cursor-pointer mt-1 ${replacing ? 'text-slate-400' : 'text-orange-700'}`}>
            <input type="file" accept="image/png,image/jpeg" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onReplacePicture(f) }} />
            {replacing ? 'Uploading…' : 'Replace picture'}
          </label>
        </span>
      </div>
      {/* ⚠️ THE TIP IS ONLY SHOWN WHERE IT WOULD CHANGE SOMETHING. On a 4:5 design it would be advice to
        * do what has already been done, which is the fastest way to teach an operator to stop reading
        * grey text. ⛔ AND IT IS **ADVICE, NOT A WARNING**: a landscape design still renders, still
        * posts, and is the right choice for some trucks. */}
      {!isBestShape && (
        <p className="text-[11px] leading-snug text-slate-500" data-bg-tip>{BG_PORTRAIT_TIP}</p>
      )}
      {/* 🔴 THE ONE SENTENCE THAT PREVENTS THE MOST COMMON MISTAKE: uploading last week's finished
        * poster, with its dates already printed on it, and then wondering why every date appears
        * twice. */}
      <p className="text-[11px] text-slate-400 leading-snug">{pictureNote}</p>

      {/* ══ 🔴 §B3 · "Darken the picture", WHERE SOMEBODY WOULD LOOK FOR IT ══════════════════════════
        * ⛔ IT WAS IN THE MORE OPTIONS OF A TEXT BOX — and on a box that follows "All text" that section
        * does not contain it at all, so an operator who selected the Date and opened MORE OPTIONS could
        * not find it. The renderer has always drawn it (measured: at 60% every channel comes back at
        * about 40% of its value); what was missing was a way to reach it and a preview that reacted
        * before the next PNG arrived. Both are fixed, and this is the half an operator sees. */}
      <div className="border-t border-slate-100 pt-2" data-darken>
        <Slider label={DARKEN_LABEL} value={layout.darken} min={0} max={MAX_DARKEN} step={5}
          format={v => `${v}%`} hint={DARKEN_HINT}
          onChange={v => commit(l => ({ ...l, darken: v }))} />
      </div>
    </div>
  )

  /* 🔴 BUILT ONCE AND RENDERED ONCE. ⚠️ IT WAS BUILT ONCE AND RENDERED TWICE until today — a sticky
   * third column above 1100px and a copy under the preview below it — because the ITEM LIST was a
   * separate column that stayed put at both widths. With the list inside the panel there is one
   * element in one place, and the breakpoint moves the whole panel rather than swapping two wrappers. */
  const settingsPanel = (
    <SettingsPanel
      layout={layout} selected={selected} selItem={selItem} sel={sel} country={country}
      editable={editable} H={H}
      patchSel={patchSel} commit={commit}
      patchEffects={patchEffects}
      patchShared={patchShared} patchSharedEffects={patchSharedEffects}
      makeOwn={makeOwn} makeFollow={makeFollow} promoteToShared={promoteToShared}
      setAllTextSize={setAllTextSize} ownNames={ownNames}
      itemGrid={itemGrid}
      centreSel={centreSel}
      removeNote={removeNote}
      live={live} beginGesture={beginGesture}
      onQuick={applyQuickLayout} onReorder={reorderDayParts}
      onToggleItem={toggleItem} onSelectItem={setSelected}
      token={token}
      fontLib={fontLib}
      sample={selItem?.key === 'date' ? selItem.sample : dateSampleFor(layout, country)}
      hasLogo={hasLogo === true}
      placesWithout={placesWithout ?? null}
      onAddPlacePictures={onAddPlacePictures ?? (() => {})}
      backgroundCard={pictureCard}
      stand={standOpen} setStand={setStandOpen}
      more={moreOpen} setMore={setMoreOpen}
      bg={bgOpen} setBg={setBgOpen}
    />
  )

  return (
    <div className="space-y-3">
      {topBar}

      {scope && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Text positions</p>
          {/* 🔴 THE TWO MODES, AND THE WHOLE POINT OF A PLACE'S OWN DESIGN. "Own positions for this
            * place" lets a differently laid-out picture — a venue's artwork with its name already
            * printed on it — carry its own box positions instead of borrowing Standard's. */}
          <select value={scope.mode} disabled={scope.busy}
            onChange={e => scope.onMode(e.target.value as 'own' | 'standard')}
            className={`${TOOL_INPUT} w-full`}>
            <option value="standard">Same positions as Standard</option>
            <option value="own">Own positions for {scope.placeName}</option>
          </select>
        </div>
      )}

      {[message, localMsg].map((m, i) => m && (
        <p key={i} className={`text-sm rounded-xl px-3 py-2 border ${m.bad
          ? 'text-red-700 bg-red-50 border-red-200'
          : 'text-slate-600 bg-slate-50 border-slate-200'}`}>{m.text}</p>
      ))}
      {warnings.length > 0 && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {warnings.map((w, i) => <p key={i}>{w.message}</p>)}
        </div>
      )}

      {/* ══ 🔴 TWO COLUMNS: THE POSTER, AND ONE 380px PANEL ══════════════════════════════════════════
        * ⛔ IT WAS THREE — a 250px item list, the poster, and a 320px settings column — and the two
        * outer ones were the two halves of ONE job with the poster between them. Picking a box and
        * changing it was a 1,000px round trip. The list is inside the panel now.
        * 🔴 ONE BREAKPOINT, AT 1100. `min-[1100px]` rather than `lg:` (1024) is the same decision this
        * file has made twice before and for the same reason: a 1000–1100px laptop window is a width
        * this screen is genuinely used at, and 380px of panel there would leave the poster less than
        * half the page. Below it the panel drops UNDER the poster, which is the brief's instruction.
        * ⚠️ `items-start` SO THE PANEL DOES NOT STRETCH to the poster's height and leave a tall empty
        * card under MORE OPTIONS. */}
      <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start"
        data-editor-grid>
        <div className="min-w-0">
          {/* ══ 🔴 THE GREY AREA — MEASURED, AND IT SCROLLS WHEN ZOOMED ═══════════════════════════════
            * ⚠️ ITS HEIGHT IS THE WINDOW MINUS WHAT IS ABOVE AND BELOW IT, which is what `--hg-stage`
            * carries: there is no way to say "the rest of the height" in a grid whose other rows are
            * content-sized, and a `vh` number alone cannot know what the title row took.
            * ⛔ `overflow-auto` IS WHAT MAKES + USEFUL. At Fit the poster is never bigger than the area,
            * so nothing scrolls; zoomed in, the AREA scrolls and the page does not — which is the same
            * rule the settings panel follows, for the same reason. */}
          {/* ══ ⛔ TOMBSTONE · THE "✎ Edit | 👁 Preview" SWITCH — REMOVED 10 OCTOBER 2026 (§B1) ═════════
            * It lasted one round. It was a MODE: the poster stayed where it was and the outlines went,
            * so the operator had to remember which state they were in, every other control silently
            * changed meaning, and a design left in Preview looked like an editor that had stopped
            * working. 🔴 "👁 Preview post" IN THE TITLE ROW DOES THE SAME JOB WITH NO STATE — it opens
            * the finished PNG over the top and closes again. */}

          {/* ══ 🔴 THE GREY AREA — MEASURED, AND IT SCROLLS WHEN ZOOMED ════════════════════════════════
            * ⛔ **`grid` + `margin:auto` ON THE CHILD, NOT `flex` + `justify-center`.** They centre the
            * same way and they overflow differently, and the difference is a real bug: a flex container
            * with `justify-content: center` whose item is too big overflows **both** sides, and the
            * part that spills past the start edge is **unreachable** — `scrollLeft` cannot go below 0.
            * So at 150% the left half of the poster could not be scrolled to. `margin: auto` on a grid
            * item centres it while keeping the scrollable region correct in both directions.
            * ⚠️ `min-w-0` IS THE BELT on top of the grid track's own `minmax(0,1fr)`: an `overflow-auto`
            * box cannot be widened by its content, and this says so twice because the symptom — the
            * settings panel pushed off the screen — is the one Dominic reported. */}
          <div ref={areaRef}
            data-stage-area
            className="grid min-w-0 max-w-full overflow-auto rounded-2xl bg-slate-100 p-3"
            style={{ height: 'min(72vh, 820px)' }}>
            {/* ── THE POSTER, FITTED TO THE AREA ────────────────────────────────────────────────
              * 🔴 ITS WIDTH IS A **MEASURED NUMBER**, not a CSS expression. `min(areaW, areaH × ratio)`
              * is what "the largest size that fits both width and height" means, and only the layout
              * engine knows `areaH` once the title row and the hint have taken theirs.
              * ⛔ `shrink-0` SO THE FLEX CENTRING CANNOT SQUEEZE IT. Once zoomed past the area, the
              * poster must overflow and the area must scroll; a flex child's default `min-width: auto`
              * would instead shrink it back to fit and + would do nothing.
              * ⚠️ `width: 0` UNTIL THE FIRST MEASUREMENT, which is one frame. Guessing a width would
              * mean the first paint was at the wrong size and every box moved on the second. */}
            <div ref={stageRef}
              data-stage
              className="relative m-auto select-none touch-none overflow-hidden rounded-xl bg-slate-200"
              style={{
                aspectRatio: `${W} / ${H}`,
                width: shownW ? `${Math.round(shownW)}px` : 0,
              }}
              /* ══ ⛔ TOMBSTONE · A PRESS HERE SELECTED THE BACKGROUND — REMOVED 10 OCTOBER 2026 (§3) ══
                * It lasted one round. The intent was right — the background was the one thing on the
                * screen you could not point at — and the consequence was not: **a press on a blank
                * part of the artwork closed whatever panel was open.** An operator reading "Style all
                * the writing", or halfway through a font list, lost it by putting their finger down on
                * the poster, which is the surface this screen is built around touching.
                * 🔴 THE BACKGROUND HAS ITS OWN SECTION AT THE FOOT OF THE PANEL NOW, always there and
                * never selected, so there is nothing a click needs to reach. */>
              {/* ══ 🔴 §2 · THE **BLANK**, NOT THE PNG, WHILE THE LIVE TREE IS UP ════════════════════
                * ⛔ THE PNG ON THE STAGE WAS THE WHOLE BUG: it already had the text baked into it, so
                * the words on screen were whatever the last render said, wherever that was.
                * 🔴 THE BRIEF: *"the stage draws the background picture and draws ALL writing live in
                * the browser … the server PNG is used only by 👁 Preview post"*. So this is
                * `background.url` whenever there is a live tree, and the PNG only when there is not —
                * no fonts yet, no week loaded, or a design the tree builder refused.
                * ⚠️ `data-stage-img` STAYS ON IT, because the harnesses and the readability sampler
                * both find the picture by that attribute and the picture is still what they want. */}
              <img data-stage-img src={liveTree ? background.url : (preview ?? background.url)} alt=""
                className="absolute inset-0 w-full h-full object-contain" />
              {/* ══ 🔴 §B3 · THE LIVE HALF OF "Darken the picture" ═══════════════════════════════════
                * ⛔ THE PNG IS THE TRUTH AND THE PNG IS 400ms BEHIND. The renderer draws the dark layer
                * (measured: at 60% every channel comes back at ~40% of its value), so the preview
                * eventually shows it — but a slider whose effect arrives after you let go reads as a
                * slider that does nothing, which is exactly what was reported.
                * 🔴 SO THIS DRAWS ONLY THE DIFFERENCE THE PNG HAS NOT CAUGHT UP WITH — `darken` minus
                * the darkening already baked into the picture on screen — and it falls to nothing the
                * moment the new PNG lands. ⚠️ IT CAN ONLY EVER **ADD**: a slide downwards cannot be
                * previewed by drawing more black, so that direction waits for the render rather than
                * showing a lie. */}
              {liveDarken > 0 && (
                <div className="pointer-events-none absolute inset-0" data-darken-overlay
                  style={{ backgroundColor: `rgba(0,0,0,${(liveDarken / 100).toFixed(3)})` }} />
              )}

              {/* ══ 🔴 §2 · EVERY WORD ON THE POSTER, DRAWN HERE ═══════════════════════════════════
                * ⚠️ ABOVE THE DARKENING AND BELOW THE OUTLINES, which is the renderer's own paint order:
                * the dark layer is pushed before the text children in `weeklyTree`, and the outlines are
                * editor chrome that belongs on top of everything. ⛔ IT IS `pointer-events-none`, so a
                * word can never swallow a drag — see `LivePoster`. */}
              {liveTree && (
                <LivePoster tree={liveTree.children} W={liveTree.W} H={liveTree.H}
                  /* ══ 🔴 **THE SAME `scale` THE BOX OUTLINES USE, AND THE SAME `W`** ═══════════════
                    * ⛔ IT WAS `shownW` — the width the stage is ASKED to be — while every outline was
                    * positioned with `scale`, which is the width the stage MEASURED. Two conversions
                    * for one job, and the operator found what that costs: *"the box being moved and
                    * the words it holds are in different places."* ⚠️ ONE NUMBER NOW, from one
                    * measurement, so they cannot separate again. */
                  scale={scale} designW={W} />
              )}

              {/* The six copied rows, shown faintly so the spacing can be judged. Not interactive.
                * ⚠️ AND THEY GO IN PREVIEW TOO. They are editor chrome — the renderer draws the real
                * seven rows — so leaving them would be leaving six dashed rectangles on a "finished
                * post". The one promise Preview makes is that what you see is what you post. */}
              {isWeekLayout(layout) && !layout.days && layout.date.enabled && [1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="absolute border border-dashed border-white/25 pointer-events-none"
                  style={{
                    left: layout.date.x * scale,
                    top: (layout.date.y + layout.rowSpacing * i) * scale,
                    width: Math.max(8, (layout.time.x + layout.time.w - layout.date.x)) * scale,
                    height: layout.date.h * scale,
                  }} />
              ))}

              {/* ══ 🔴 "THE 7 DAYS", AND THE FOUR PARTS IT SWALLOWS ═══════════════════════════════ */}
              {daysBlock && dayOn && (
                <DaysLayer days={daysBlock} on={dayOn} scale={scale} selected={selected}
                  editable={editable}
                  onSelectPart={setSelected}
                  onTap={selectPartAt}
                  bounds={{ w: W, h: H }}
                  onBegin={() => { if (!gestureOpen.current) { gestureOpen.current = true; beginGesture() } }}
                  onLive={fn => live(l => (isWeekLayout(l) && l.days ? ({ ...l, days: fn(l.days) } as AnyLayout) : l))}
                  onEnd={() => { gestureOpen.current = false; resampleParts() }}
                  onDrag={(patch, info) => {
                    if (!gestureOpen.current) {
                      gestureOpen.current = true
                      beginGesture()
                      /* 🔴 THE SIZES THE GESTURE STARTED FROM — see `dragFrom`. */
                      dragFrom.current = {
                        textH: daysBlock.textH,
                        date: layout.date.fontSize,
                        place: layout.location.fontSize,
                        time: layout.time.fontSize,
                      }
                    }
                    dragDays(patch, info)
                  }} />
              )}

              {items.filter(i => i.key !== 'rows' && i.group !== 'part').map(it => {
                /* ⚠️ THE PICTURE BOX IS A `BoxRect` AND NOT A `TextBox`, so it is fetched separately —
                 * `boxAt` returns text boxes, and widening it would have meant giving a picture a
                 * `fontId` nothing reads. The DRAG below is identical for both. */
                const isPic = it.key === PLACE_PICTURE_KEY
                const b = isPic ? layout.placePicture : boxAt(layout, it.key)
                if (!b) return null
                /* 🔴 A SWITCHED-OFF BOX IS NOT SHOWN, because nothing is drawn for it. An outline over
                 * empty artwork would have the truck arranging text that will never appear. */
                if (!b.enabled) return null
                /* ⛔ NOTHING IS HIDDEN FROM THE CANVAS ANY MORE (7 October 2026). This branch
                 * returned null for `placement: 'background'`, because a whole-poster image has no box
                 * to drag. The rule is derived from the switch now: with the item OFF there is no box
                 * in the list at all, so the only state that reaches here is the box state.
                 * ⚠️ WHICH MAKES THE CANVAS AND THE SWITCH ONE FACT — a draggable box is on screen
                 * exactly when the design has a photo space, and never for a design that does not. */
                return (
                  <Fragment key={it.key}>
                  {/* ══ 🔴 THE GREY PLACEHOLDER, AND IT IS **CHROME**, NOT A RENDER ══════════════
                    * ⛔ IT IS DRAWN ONLY WHILE THE PICTURE BOX IS SELECTED, and only behind its own
                    * outline. The PNG underneath is the truth — if the preview event's place has a
                    * Main picture, the renderer has already drawn it there, and this would cover it.
                    * While the operator is POSITIONING the box they need to see its extent even when
                    * the place has nothing, which is the one case the renderer deliberately draws
                    * nothing for (`ifMissing: 'omit'`). ⚠️ Half-transparent, so a real picture shows
                    * through it rather than being replaced by a lie. */}
                  {isPic && it.key === selected && (
                    <div className="absolute flex items-center justify-center pointer-events-none bg-slate-500/40"
                      style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale }}>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-white/90">
                          {/* ⚠️ ONE NAME ON BOTH DESIGNS — the same constant the left list uses, so
                              the chip on the poster and the row beside it cannot read differently. */}
                          {EDITOR_PICTURE_ITEM}
                        </span>
                    </div>
                  )}
                  <DraggableBox label={it.name} box={b} scale={scale}
                    active={it.key === selected} bounds={{ w: W, h: H }} locked={!editable}
                    /* ⚠️ §B5's TINT IS FOR **WORDS**. A picture box drawn over a tint would show the
                     * operator a photograph that is darker than the one they are about to post. */
                    tint={!isPic}
                    onSelect={() => setSelected(it.key)}
                    onGuides={setGuides}
                    onChange={(patch, done, info) => {
                      if (done) {
                        /* ⚠️ RE-SAMPLED ON RELEASE AND COMMITTED AS ONE STEP. The gesture already
                         * pushed its history entry on the first move, so this must NOT push another or
                         * one drag would cost two undos. */
                        gestureOpen.current = false
                        /* ⚠️ A PICTURE BOX HAS NO `bgSample` — the readability rule is about TEXT on
                         * artwork, and sampling for a box that draws a photograph would store a colour
                         * nothing reads. The drag still ends here; there is simply nothing to resample. */
                        if (!isPic) {
                          live(l => {
                            const box = boxAt(l, it.key)
                            return box ? withBox(l, it.key, { bgSample: sampleUnder(box) }) : l
                          })
                        }
                        return
                      }
                      /* The first move of a gesture is the history step; the rest are live. */
                      if (!gestureOpen.current) {
                        gestureOpen.current = true
                        beginGesture()
                        /* 🔴 §B6 · THE SIZE THE DRAG STARTED FROM. A picture box has no font; `0`
                         * marks that and the scale below is skipped for it. */
                        dragFrom.current = {
                          textH: 0, date: isPic ? 0 : (b as TextBox).fontSize, place: 0, time: 0,
                        }
                      }
                      /* ══ 🔴 §B6 · A CORNER MAKES THE WORDS BIGGER, A SIDE MAKES THE BOX WIDER ═════
                        * ⛔ BEFORE TODAY A CORNER CHANGED THE BOX AND LEFT THE TEXT ALONE, so the only
                        * way to make the words bigger was a number in the panel — and the handles, the
                        * most obvious control on the screen, did the one thing an operator did not
                        * want. ⚠️ THE FACTOR IS THE HEIGHT'S and is applied to the size the gesture
                        * STARTED with, never to the live one. */
                      const startSize = dragFrom.current?.date ?? 0
                      const scaled = info?.kind === 'corner' && startSize > 0
                        ? { fontSize: Math.max(6, Math.min(H, Math.round(startSize * Math.max(0.05, Math.min(20, info.factor))))) }
                        : {}
                      live(l => withBox(l, it.key, { ...patch, ...scaled }))
                    }}
                  />
                  </Fragment>
                )
              })}

              {/* ══ 🔴 THE CENTRE GUIDES ARE **PINK**, AND ONLY WHILE SNAPPED ════════════════════════
                * ⚠️ PINK RATHER THAN ORANGE, which is §4's instruction and the right one: orange is this
                * product's "this is selected / press me" colour, and it is already the selected box's
                * outline — so an orange guide ON an orange outline said two things in one colour.
                * ⛔ AND THEY ARE ONLY THERE WHILE SNAPPED. A permanent pair of centre lines over
                * someone's artwork is a second design on top of their design.
                * ⚠️ NOT DRAWN IN PREVIEW EITHER, which is automatic: a guide only exists during a drag,
                * and Preview has no draggable boxes. */}
              {guides.v !== null && (
                <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-pink-500" data-guide="v"
                  style={{ left: guides.v * scale }} />
              )}
              {guides.h !== null && (
                <div className="pointer-events-none absolute left-0 right-0 h-px bg-pink-500" data-guide="h"
                  style={{ top: guides.h * scale }} />
              )}
            </div>
          </div>

          {/* ══ 🔴 THE HINT AND THE ZOOM, ON ONE LINE UNDER THE POSTER ════════════════════════════════
            * ⚠️ "·" RATHER THAN A FULL STOP between the two halves of the hint, because they are two
            * gestures and not two sentences. ⛔ THE ZOOM IS ON THE SAME LINE so it costs no height on
            * the one screen whose whole problem is height. */}
          <div className="mt-1.5 flex items-center gap-3">
            <p className="min-w-0 grow text-xs text-slate-400" data-stage-hint>
              Drag a box to move it · drag a corner to resize
              {/* ══ 🔴 §2 · THE ONE THING THE LIVE STAGE CANNOT SHOW ══════════════════════════════
                * ⛔ AN UPLOADED FAMILY IS NEVER SENT TO A BROWSER (the rule the route states where it
                * is enforced), so those boxes draw live in Oswald and in the real font in the PNG.
                * 🔴 SAID RATHER THAN LEFT TO BE NOTICED: a preview quietly in the wrong typeface is
                * worse than a slow one, because an operator would believe it. ⚠️ ONLY WHEN IT IS TRUE,
                * and only when the live stage is actually up — with the PNG on screen there is nothing
                * to warn about. */}
              {liveTree && liveFonts.unavailable.length > 0 && (
                <span className="block text-amber-700" data-live-font-note>{LIVE_FONT_FALLBACK}</span>
              )}
            </p>
            {/* ══ 🔴 [−] [100%] [+] AND A SEPARATE "Fit to screen" — §2 ═════════════════════════════
              * ⛔ THE PERCENTAGE WAS THE **Fit BUTTON**, so one control was a label when fitted and a
              * value when not, and pressing it was how you got back. Two different jobs wearing one
              * hat: an operator who wanted to read the zoom had to know that reading it was also
              * pressing it.
              * 🔴 THE NUMBER IS A PLAIN LABEL NOW and "Fit to screen" is its own button, **greyed out
              * when the poster is already fitted** — which is the only honest state for a button that
              * would do nothing. ⚠️ `tabular-nums` AND A FIXED WIDTH, so stepping 100 → 125 → 156 does
              * not move the + button under the operator's finger. */}
            <div className="flex shrink-0 items-center gap-1" data-zoom>
              <button type="button" aria-label="Zoom out" disabled={zoomStep <= ZOOM_MIN}
                onClick={() => setZoomStep(z => Math.max(ZOOM_MIN, z - 1))}
                className={`${TOOL_BTN} ${TOOL_BTN_OFF} w-8 disabled:text-slate-300`}>−</button>
              <span data-zoom-readout
                className="w-12 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-600">
                {zoomPercent}%
              </span>
              <button type="button" aria-label="Zoom in" disabled={zoomStep >= ZOOM_MAX}
                onClick={() => setZoomStep(z => Math.min(ZOOM_MAX, z + 1))}
                className={`${TOOL_BTN} ${TOOL_BTN_OFF} w-8 disabled:text-slate-300`}>+</button>
              <button type="button" onClick={() => setZoomStep(0)} disabled={atFit}
                className={`${TOOL_BTN} ${TOOL_BTN_OFF} ml-1 disabled:border-slate-100 disabled:text-slate-300`}
                data-zoom-fit>{EDITOR_FIT_TO_SCREEN}</button>
            </div>
          </div>
          {!editable && scope && (
            <p className="text-xs text-slate-500 mt-1">
              These positions come from your Standard design. Choose “Own positions for {scope.placeName}”
              to move them just here.
            </p>
          )}

          {/* ⚠️ THE CALLER'S FOOTER FOLLOWS THE POSTER AT EVERY WIDTH NOW. It was hidden above 900px
            * and drawn in the left column, which no longer exists. */}
          {footer && <div className="mt-3 space-y-3">{footer}</div>}
        </div>

        {/* ══ 🔴 THE PANEL — STICKY, AND IT SCROLLS INSIDE ITSELF ═══════════════════════════════════
          * ⚠️ `sticky top-4` KEEPS IT LEVEL WITH THE POSTER while MORE OPTIONS is open and long. A
          * panel that scrolled away would put the operator back where the pop-ups had them: changing
          * something they cannot see. ⛔ `max-h` AND `overflow-y-auto` SO THE **PANEL** SCROLLS rather
          * than growing past the window — a sticky element taller than the viewport cannot stick, its
          * bottom controls would be unreachable, and the page scrolling is what takes the poster off
          * the screen. ⚠️ BELOW 1100px IT IS STILL THIS ELEMENT, simply no longer sticky and no longer
          * capped: under the poster there is nothing above it to stay level with. */}
        <div className="min-w-0 min-[1100px]:sticky min-[1100px]:top-4 min-[1100px]:max-h-[calc(100vh-2rem)] min-[1100px]:overflow-y-auto"
          data-settings-col>
          {settingsPanel}
        </div>
      </div>

      {/* ══ 🔴 §B1 · THE FINISHED POST, OVER THE TOP ═══════════════════════════════════════════════
        * ⚠️ ONLY IN THE TREE WHILE IT IS OPEN, so there is no hidden dialog waiting to be opened by the
        * wrong thing. ⛔ A CLICK ANYWHERE CLOSES IT — there is nothing to lose behind this one, so the
        * backdrop rule that protects the leave dialog does not apply. */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
          data-post-preview onClick={() => setPreviewOpen(false)}>
          {preview
            ? <img src={preview} alt={PREVIEW_POST_TITLE} data-post-preview-img
                className="max-h-[82vh] max-w-full rounded-lg object-contain shadow-2xl" />
            : <p className="text-sm text-white/80">{PREVIEW_POST_WAIT}</p>}
          <p className="text-[11px] text-white/70">{PREVIEW_POST_HINT}</p>
          <button type="button" data-post-preview-close
            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900"
            onClick={() => setPreviewOpen(false)}>{PREVIEW_POST_CLOSE}</button>
        </div>
      )}
    </div>
  )
}

/**
 * ══ 🔴 "THE 7 DAYS" ON THE POSTER — ONE BOX, TWENTY-EIGHT CELLS, TWO ⇔ HANDLES ════════════════════
 *
 * ⛔ THE CELLS ARE `pointer-events-none` AND THE **BOX** IS WHAT TAKES A PRESS. If the cells took
 * pointer events there would be almost nowhere left to grab the block, and the brief's first
 * instruction about it is "drag the box to move all the rows". A press that does not move is reported
 * by `onTap` and hit-tested against the same `dayCells` the renderer draws from.
 * ⚠️ EVERY RECTANGLE HERE COMES FROM `dayCells`. Nothing about the geometry is decided in this file.
 */
function DaysLayer({
  days, on, scale, selected, editable, onSelectPart, onTap, onBegin, onLive, onEnd, onDrag, bounds,
}: {
  days: DaysBlock
  on: DayPartsOn
  scale: number
  selected: ItemKey
  editable: boolean
  onSelectPart: (key: ItemKey) => void
  onTap: (nx: number, ny: number) => void
  onBegin: () => void
  onLive: (fn: (d: DaysBlock) => DaysBlock) => void
  onEnd: () => void
  onDrag: (patch: Partial<DaysBlock>, info?: DragInfo) => void
  bounds: { w: number; h: number }
}) {
  /* ⚠️ THE GESTURE'S START BLOCK, so each frame recomputes the weights from where the drag began —
   * `moveBoundary` applied to the live block every frame would compound and the handle would run away
   * from the finger. */
  const grab = useRef<{
    px: number; days: DaysBlock; left: DayPartKey; right: DayPartKey; span: number; total: number
  } | null>(null)

  const cellsOf = (row: number) => dayCells(days, on, row)
  const rows = Array.from({ length: DAYS_IN_WEEK }, (_, i) => i)
  const bounds2 = bounds

  return (
    <>
      <DraggableBox label={DAYS_ITEM} box={days} scale={scale}
        active={selected === DAYS_KEY} bounds={bounds2} locked={!editable}
        /* ⛔ SEVEN ROWS, EACH CLEARING THE 8px FLOOR `parseDays` ENFORCES. Without this a corner drag
         * could produce a block the validator refuses — an error at the END of the work. */
        minH={DAYS_IN_WEEK * 8}
        onSelect={() => onSelectPart(DAYS_KEY)}
        onTap={onTap}
        onChange={(patch, done, info) => {
          if (done) { onEnd(); return }
          onDrag(patch as Partial<DaysBlock>, info)
        }} />

      {/* ── the twenty-eight cells ──────────────────────────────────────────────────────────────
        * ⚠️ DRAWN FOR EVERY ROW, not only the first: the operator is arranging a TABLE, and a grid
        * whose other six rows were invisible would make a wrong width look right.
        * 🔴 THE SELECTED PART IS ORANGE IN **ALL SEVEN** ROWS, which is what "shared across all 7
        * rows" looks like — one click styles the whole column. */}
      {rows.map(i => cellsOf(i).map(c => {
        const key = PART_ITEM_KEY[c.key]
        const isSel = key === selected
        const text = c.key !== 'picture'
        return (
          <div key={`${i}-${c.key}`}
            data-day-cell={c.key} data-day-row={i}
            className={`pointer-events-none absolute outline outline-1 ${isSel
              ? 'border-2 border-orange-500 outline-orange-900/30'
              : 'border border-dashed border-white/70 outline-slate-900/50'}`}
            style={{
              left: c.x * scale, top: c.y * scale, width: c.w * scale, height: c.h * scale,
              /* ⚠️ §B5's TINT, AND ONLY BEHIND WORDS. A tinted picture cell would misrepresent the
               * picture that is about to be drawn in it. */
              ...(text ? { backgroundColor: 'rgba(15,23,42,.28)' } : {}),
            }} />
        )
      }))}

      {/* ── the ⇔ handles, on row 1 ─────────────────────────────────────────────────────────────
        * ⛔ ROW 1 ONLY. Twenty-one handles over a truck's artwork is the "second design on top of
        * their design" this editor has already fixed once — and every row shares the same weights, so
        * one row's handles move all seven.
        * ⚠️ SHOWN ONLY WHILE THE DAYS OR ONE OF THEIR PARTS IS SELECTED, for the same reason. */}
      {editable && (selected === DAYS_KEY || (Object.values(PART_ITEM_KEY) as string[]).includes(selected))
        && dayBoundaries(days, on).map(b => (
        <div key={`${b.left}-${b.right}`} data-day-handle={`${b.left}-${b.right}`}
          className="absolute z-10 flex cursor-ew-resize touch-none items-center justify-center"
          style={{ left: b.x * scale - 9, top: b.y * scale, width: 18, height: Math.max(14, b.h * scale) }}
          onPointerDown={e => {
            e.stopPropagation()
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            const cells = cellsOf(0)
            const a = cells.find(c => c.key === b.left), z = cells.find(c => c.key === b.right)
            const parts = normaliseParts(days.parts)
            const wa = parts.find(p => p.key === b.left)?.weight ?? 1
            const wz = parts.find(p => p.key === b.right)?.weight ?? 1
            if (!a || !z) return
            grab.current = { px: e.clientX, days, left: b.left, right: b.right, span: Math.max(1, a.w + z.w), total: wa + wz }
            onBegin()
          }}
          onPointerMove={e => {
            const g = grab.current
            if (!g) return
            const dx = (e.clientX - g.px) / Math.max(scale, 0.0001)
            /* 🔴 PIXELS BECOME WEIGHT THROUGH THE PAIR'S OWN SPAN, so the handle tracks the finger:
             * moving it a third of the way across the two cells moves a third of their combined
             * weight. ⚠️ NO PERCENTAGE IS SHOWN ANYWHERE — the brief's instruction, and right: the
             * number would be a unit the operator has to learn to read a width they can see. */
            const delta = Math.round((dx / g.span) * g.total)
            onLive(() => moveBoundary(g.days, g.left, g.right, delta))
          }}
          onPointerUp={() => { grab.current = null }}
          onPointerCancel={() => { grab.current = null }}>
          <span className="pointer-events-none rounded bg-orange-500 px-1 text-[10px] font-bold leading-4 text-white shadow">⇔</span>
        </div>
      ))}
    </>
  )
}

/** "Portrait (4:5)". ⚠️ Named ratios only where they are the ones social platforms use. */
function shapeName(w: number, h: number): string {
  const r = w / h
  const near = (a: number) => Math.abs(r - a) < 0.02
  if (near(1)) return 'Square (1:1)'
  if (near(4 / 5)) return 'Portrait (4:5)'
  if (near(9 / 16)) return 'Portrait (9:16)'
  if (near(16 / 9)) return 'Landscape (16:9)'
  return r < 1 ? 'Portrait' : 'Landscape'
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHERE `Toolbar` WAS — REMOVED 9 OCTOBER 2026
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// IT WAS ONE ROW OF NINE CELLS ABOVE THE PICTURE, with "✦ Effects ▾" and "Advanced ▾" opening pop-ups
// on the end of it. Three things were wrong with that shape, and all three are structural rather than
// matters of taste:
//
// 🔴 A POP-UP COVERS THE THING IT CHANGES. Every setting inside Effects and Advanced is about how the
// words look ON THE POSTER, and opening either put a panel between the operator and the only evidence
// of whether the change was an improvement.
//
// ⛔ A TOOLBAR THAT WRAPS IS A TOOLBAR WHOSE CONTROLS MOVE. Nine cells across a `minmax(0,1fr)` column
// wrapped to two or three rows depending on which item was selected and how wide the window was, so
// the Size stepper was in a different place for the Date than for a note. The alternative — scrolling
// sideways — hides half the controls at the width with the least room to find them, and an overflow
// container directly above a drag surface pans the page instead of moving a box.
//
// ⚠️ AND "Advanced" HID SETTINGS BY NAME RATHER THAN BY USE. Spacing and tilt are not advanced; they
// were simply the ones that did not fit on the row.
//
// ⚠️ EVERYTHING IT HELD IS IN `SettingsPanel` BELOW, in the third column, in a column rather than a
// row — where nothing moves and nothing covers the poster. These props are the ones it took, which is
// why the shape is familiar; the two pop-up flags are the only members that went.

interface SettingsProps {
  layout: AnyLayout
  selected: ItemKey
  selItem: Item | undefined
  sel: TextBox | null
  country: CountryCode
  editable: boolean
  H: number
  patchSel: (patch: Partial<DateBox & NoteBox>) => void
  commit: (fn: (l: AnyLayout) => AnyLayout) => void
  patchEffects: (patch: Partial<Effects>) => void
  /* ══ 🔴 "All text" — THE PANEL IS HANDED ITS TARGETS, IT DOES NOT CHOOSE THEM ═══════════════════
   * ⛔ `copyStyleToAll` IS GONE AND THESE SIX REPLACE IT. The old one was a bulk write; these are a
   * relationship and the four ways to move a box in or out of it. ⚠️ THE PANEL NEVER DECIDES WHERE A
   * LOOK CHANGE LANDS: the editor binds `patchShared` or `patchSel` to the controls depending on what
   * is selected, so the next control somebody adds cannot be wired to the wrong half. */
  patchShared: (patch: Partial<TextLook>) => void
  patchSharedEffects: (patch: Partial<Effects>) => void
  /** "Change just this box" — copies the shared look in, THEN marks it own. */
  makeOwn: (key: ItemKey) => void
  /** "Match All text again" / "Match <Venue>". */
  makeFollow: (key: ItemKey) => void
  /**
   * "Use this style for all text" — promotes this box's look and makes every box follow it.
   * ⚠️ NOT `useAsShared`. `react-hooks/rules-of-hooks` reads any `use`-prefixed identifier as a hook
   * and refused it inside an `onClick`; the rule is right about the convention even though this was
   * never a hook, and a name that trips a lint rule is a name the next reader will misread too.
   */
  promoteToShared: (key: ItemKey) => void
  /** "Text size" on the All text panel. ⚠️ A SIZE, applied to every box in proportion. */
  setAllTextSize: (px: number) => void
  /** The boxes that have their own style, for the amber note. ⚠️ Named, not counted. */
  ownNames: { key: ItemKey; name: string }[]
  centreSel: (axis: 'x' | 'y') => void
  removeNote: (key: ItemKey) => void
  /* ══ 🔴 WHAT "THE 7 DAYS" PANEL NEEDS, PASSED IN LIKE EVERYTHING ELSE (10 October 2026) ══════════
   * ⚠️ THE PANEL NEVER REACHES INTO THE LAYOUT ITSELF. Every one of these is bound by the editor, which
   * is the same discipline `patchShared`/`patchSel` follow and for the same reason: a control wired to
   * the wrong target is invisible until somebody notices the poster did not change. */
  live: (fn: (l: AnyLayout) => AnyLayout) => void
  beginGesture: () => void
  onQuick: (a: DaysArrangement) => void
  onReorder: (from: number, to: number) => void
  onToggleItem: (key: ItemKey, on: boolean) => void
  onSelectItem: (key: ItemKey) => void
  token: string
  fontLib: FontLibrary
  /** What the picker's rows are drawn with. ⚠️ The design's OWN date wording, not a fixed string. */
  sample: string
  /** ⛔ Only a truck with a logo is offered "Show your logo". From the server. */
  hasLogo: boolean
  /** How many of the truck's places still have nothing. ⚠️ null = not known yet. */
  placesWithout: { without: number; total: number } | null
  onAddPlacePictures: () => void
}


/**
 * The weekly list's row spacing — the one item with no box and no text.
 *
 * ⛔ IT WAS AN EARLY RETURN INSIDE `Toolbar` WITH AN "Advanced ▾" POP-UP ON THE END. It is a component
 * now, and the pop-up's two settings are simply the last two rows: on a 320px panel there is nothing
 * for a pop-up to buy, and hiding "show cancelled events" behind the word "Advanced" was hiding a
 * decision about what customers are told.
 * ⚠️ EVERY CONTROL IS THE ONE THAT WAS THERE, bound to the same field.
 */
function RowsPanel({ layout, commit, editable, H }: {
  layout: AnyLayout
  commit: (fn: (l: AnyLayout) => AnyLayout) => void
  editable: boolean
  H: number
}) {
  if (!isWeekLayout(layout)) return null
  return (
    <div className="space-y-3">
      <Field label="Spacing">
        <Stepper value={layout.rowSpacing} min={1} max={H} step={2} suffix="px"
          onChange={v => commit(l => (isWeekLayout(l) ? { ...l, rowSpacing: v } : l))} />
      </Field>
      <p className="text-[11px] leading-snug text-slate-400">
        Days run Monday to Sunday. Row 1’s three boxes are copied down by this distance.
      </p>
      <div className="border-t border-slate-100 pt-3">
        <GroupHeading>Which events</GroupHeading>
        <CheckRow label="Show cancelled events" checked={layout.showCancelled}
          hint="A cancelled event shows its place crossed out and the word CANCELLED. Switched off, the day reads as a day off."
          onChange={v => editable && commit(l => (isWeekLayout(l) ? { ...l, showCancelled: v } : l))} />
      </div>
    </div>
  )
}

/**
 * ══ 🔴 §A2 · "THE 7 DAYS" — THE PANEL ════════════════════════════════════════════════════════════
 *
 * ⛔ IT REPLACES SIX PANELS: Date, Place, Time, Location picture, "Rows" (a pixel spacing) and the
 * "EACH ROW" heading that tried to explain how they related to each other. Those six were six answers
 * to one question. ⚠️ THE TEXT SETTINGS HAVE NOT MOVED INTO IT — clicking the words on the poster is
 * what opens a part's font and colour, which is the brief's own instruction and is why this panel
 * contains no font control at all.
 */
function DaysPanel({
  days, layout, country, editable, commit, live, beginGesture, onQuick, onReorder, more, setMore,
  onToggle, onSelectPart,
}: {
  days: DaysBlock
  layout: Layout
  country: CountryCode
  editable: boolean
  commit: (fn: (l: AnyLayout) => AnyLayout) => void
  live: (fn: (l: AnyLayout) => AnyLayout) => void
  beginGesture: () => void
  onQuick: (a: DaysArrangement) => void
  onReorder: (from: number, to: number) => void
  more: boolean
  setMore: (v: boolean) => void
  onToggle: (key: ItemKey, on: boolean) => void
  onSelectPart: (key: ItemKey) => void
}) {
  const parts = normaliseParts(days.parts)
  const on = partsOn(layout)
  const patch = (p: Partial<DaysBlock>) =>
    commit(l => (isWeekLayout(l) && l.days ? ({ ...l, days: { ...l.days, ...p } } as AnyLayout) : l))

  /* ⚠️ THE EXAMPLES ARE **LIVE** — the design's own date wording and its own clock. A fixed "Mon 5th
   * Oct" beside a design set to "05/10" would be the one line on the panel that cannot be right. */
  const example: Record<DayPartKey, string> = {
    picture: PART_PICTURE_EG,
    dayDate: dateSampleFor(layout, country),
    place: placeStyleSample(layout.placeStyle).split('\n')[0] || 'Five Bells',
    times: formatTimeRangeFor('17:00', '21:00', layout.timeStyle),
  }
  const name: Record<DayPartKey, string> = {
    picture: PART_PICTURE_NAME, dayDate: PART_DAY_NAME, place: PART_PLACE_NAME, times: PART_TIMES_NAME,
  }

  /* ══ 🔴 ⋮⋮ REORDER — POINTER EVENTS, NOT HTML5 DRAG-AND-DROP ══════════════════════════════════════
   * ⛔ HTML5 `draggable` HAS NO TOUCH SUPPORT AT ALL on iOS Safari, and half this product's operators
   * are on an iPad. The same pointer-event discipline `DraggableBox` uses works on every input.
   * ⚠️ ONE UNDO STEP PER DRAG: `beginGesture` on the press, `live` for each swap. */
  const rowsRef = useRef<HTMLDivElement | null>(null)
  const dragIdx = useRef<number | null>(null)

  const indexAt = (clientY: number): number => {
    const host = rowsRef.current
    if (!host) return -1
    const rows = Array.from(host.querySelectorAll('[data-part-row]')) as HTMLElement[]
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect()
      if (clientY >= r.top && clientY <= r.bottom) return i
    }
    return -1
  }

  return (
    <div className="space-y-3">
      {/* ══ 🔴 QUICK LAYOUTS — THREE PICTURES, NOT THREE WORDS ══════════════════════════════════════
        * ⚠️ EACH BUTTON **DRAWS** WHAT IT DOES: bars where the parts go. A truck owner choosing between
        * "All on one line" and "Day on top" is choosing a shape, and a shape is a thing to look at. */}
      <div data-quick-layouts>
        <GroupHeading>{DAYS_QUICK_HEADING}</GroupHeading>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['oneLine', QL_ONE_LINE],
            ['dayOnTop', QL_DAY_ON_TOP],
            ['bigPicture', QL_BIG_PICTURE],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" disabled={!editable} data-quick={id}
              onClick={() => onQuick(id)}
              className={`rounded-lg border p-1.5 text-left ${days.arrangement === id
                ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <QuickLayoutIcon kind={id} />
              <span className="mt-1 block text-[10px] font-bold leading-tight text-slate-600">{label}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{DAYS_QUICK_HINT}</p>
      </div>

      {/* ══ 🔴 WHAT'S IN EACH ROW ═══════════════════════════════════════════════════════════════════
        * ⚠️ THE SWITCH IS THE BOX'S OWN `enabled` — the same field the renderer has always read and the
        * same one the old six-item list toggled. Nothing about what is drawn is stored twice. */}
      <div>
        <GroupHeading>{DAYS_PARTS_HEADING}</GroupHeading>
        <div ref={rowsRef} className="space-y-1" data-part-list>
          {parts.map((p, i) => (
            <div key={p.key} data-part-row={p.key}
              className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-white px-1.5 py-1">
              <Switch on={on[p.key]} label={name[p.key]}
                onToggle={() => editable && onToggle(PART_ITEM_KEY[p.key], !on[p.key])} />
              {/* ⚠️ THE NAME IS A BUTTON: it selects the part, which is the other way in to its text
                * settings for anybody who would rather not hunt for the words on the poster. */}
              <button type="button" className="min-w-0 grow text-left"
                data-part-pick={p.key} onClick={() => onSelectPart(PART_ITEM_KEY[p.key])}>
                <span className="block truncate text-[12px] font-semibold text-slate-700">{name[p.key]}</span>
                <span className="block truncate text-[10px] text-slate-400" data-part-eg>{example[p.key]}</span>
              </button>
              <span data-part-handle={p.key} aria-label="Reorder"
                className="shrink-0 cursor-grab touch-none select-none px-1 text-slate-400"
                onPointerDown={e => {
                  if (!editable) return
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  dragIdx.current = i
                  beginGesture()
                }}
                onPointerMove={e => {
                  const from = dragIdx.current
                  if (from === null) return
                  const to = indexAt(e.clientY)
                  if (to < 0 || to === from) return
                  dragIdx.current = to
                  live(l => (isWeekLayout(l) && l.days
                    ? ({ ...l, days: { ...l.days, parts: reorderParts(l.days.parts, from, to) } } as AnyLayout)
                    : l))
                }}
                onPointerUp={() => { dragIdx.current = null }}
                onPointerCancel={() => { dragIdx.current = null }}>⋮⋮</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-slate-400" data-parts-hint>{DAYS_PARTS_HINT}</p>
        {/* ⚠️ `onReorder` IS THE PANEL'S OTHER DOOR — kept wired so a keyboard or a test can reorder
          * without a pointer. ⛔ A PROP NOTHING CALLS WOULD BE DEAD WEIGHT, so it is used here. */}
        <button type="button" className="hidden" data-part-move
          onClick={() => onReorder(0, 1)}>move</button>
      </div>

      {/* ══ 🔴 DAYS OFF ════════════════════════════════════════════════════════════════════════════
        * ⚠️ THE MESSAGE BOX IS ONLY THERE WHEN IT IS DRAWN. A text field under "Leave them out" would
        * be a field whose contents never appear anywhere. */}
      <div data-days-off>
        <GroupHeading>{DAYS_OFF_HEADING}</GroupHeading>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
          {([['message', DAYS_OFF_MESSAGE], ['omit', DAYS_OFF_OMIT]] as const).map(([id, label]) => (
            <button key={id} type="button" disabled={!editable} data-days-off-opt={id}
              aria-pressed={days.daysOff === id}
              onClick={() => patch({ daysOff: id })}
              className={`px-2.5 py-1 text-[11px] font-bold ${days.daysOff === id
                ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
        {days.daysOff === 'message' ? (
          <div className="mt-1.5">
            <label className="block text-xs font-bold text-slate-600 mb-1">{DAYS_OFF_TEXT_LABEL}</label>
            <input value={layout.daysOffText} disabled={!editable} data-days-off-text
              className={`${TOOL_INPUT} w-full`}
              onChange={e => commit(l => (isWeekLayout(l) ? { ...l, daysOffText: e.target.value } : l))} />
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-slate-400">{DAYS_OFF_OMIT_HINT}</p>
        )}
      </div>

      <Section title={EDITOR_SECTION_MORE} summary={DAYS_MORE_SUMMARY}
        open={more} onToggle={() => setMore(!more)}>
        <>
          <GroupHeading>{DAYS_PICTURE_SHAPE}</GroupHeading>
          <div className="flex gap-1">
            {([['square', SHAPE_SQUARE], ['rounded', SHAPE_ROUNDED], ['circle', SHAPE_CIRCLE]] as const)
              .map(([id, label]) => (
                <button key={id} type="button" disabled={!editable} data-shape={id}
                  onClick={() => patch({ pictureShape: id as PictureShape })}
                  className={`${TOOL_BTN} ${days.pictureShape === id ? TOOL_BTN_ON : TOOL_BTN_OFF} grow`}>
                  {label}
                </button>
              ))}
          </div>
          {/* ⚠️ "Show cancelled events" CAME HERE WITH THE "Rows" PANEL IT USED TO LIVE IN. It is a
            * decision about what the SEVEN DAYS contain, so it belongs with them — and it is a
            * decision about what customers are told, which is why it is not hidden behind a word. */}
          <div className="mt-3">
            <CheckRow label="Show cancelled events" checked={layout.showCancelled}
              hint="A cancelled event shows its place crossed out and the word CANCELLED. Switched off, the day reads as a day off."
              onChange={v => editable && commit(l => (isWeekLayout(l) ? { ...l, showCancelled: v } : l))} />
          </div>
        </>
      </Section>
    </div>
  )
}

/** The little diagram on a quick-layout button. ⚠️ Bars, not an image: it has to follow the theme. */
function QuickLayoutIcon({ kind }: { kind: DaysArrangement }) {
  const bar = (w: string, h = 4) => (
    <span className="block rounded-sm bg-slate-300" style={{ width: w, height: h }} />
  )
  if (kind === 'oneLine') {
    return (
      <span className="flex h-7 items-center gap-1 rounded bg-slate-50 px-1">
        <span className="h-5 w-5 shrink-0 rounded-sm bg-slate-300" />
        {bar('22%')}{bar('34%')}{bar('22%')}
      </span>
    )
  }
  if (kind === 'dayOnTop') {
    return (
      <span className="flex h-7 items-center gap-1 rounded bg-slate-50 px-1">
        <span className="h-4 w-4 shrink-0 rounded-sm bg-slate-300" />
        <span className="flex grow flex-col gap-1">
          {bar('80%', 3)}
          <span className="flex gap-1">{bar('46%', 3)}{bar('28%', 3)}</span>
        </span>
      </span>
    )
  }
  return (
    <span className="flex h-7 items-center gap-1 rounded bg-slate-50 px-1">
      <span className="h-6 w-7 shrink-0 rounded-sm bg-slate-300" />
      <span className="flex grow flex-col gap-1">
        {bar('80%', 3)}
        <span className="flex gap-1">{bar('46%', 3)}{bar('28%', 3)}</span>
      </span>
    </span>
  )
}

/**
 * The location picture box's own settings.
 *
 * ⛔ IT WAS AN EARLY RETURN INSIDE `Toolbar` WITH AN "Advanced ▾" POP-UP for the border and the corner
 * radius. Both are here now, below the rest, for the reason the whole panel exists: a pop-up covers
 * the picture it is changing.
 * ⚠️ A PICTURE HAS NO FONT, NO COLOUR AND NO CAPITALS, which is why it does not go through the three
 * sections every text item does.
 */
function PicturePanel({ layout, commit, editable, isWeek, hasLogo, placesWithout, onAddPlacePictures }: {
  layout: AnyLayout
  commit: (fn: (l: AnyLayout) => AnyLayout) => void
  editable: boolean
  isWeek: boolean
  hasLogo: boolean
  placesWithout: { without: number; total: number } | null
  onAddPlacePictures: () => void
}) {
  const pic = layout.placePicture
  const set = (patch: Partial<PlacePictureBox>) =>
    commit(l => ({ ...l, placePicture: { ...l.placePicture, ...patch } }))
  const seg = <T extends string>(value: T, options: readonly { id: T; label: string }[], on: (v: T) => void) => (
    <div className="flex flex-wrap items-center gap-1">
      {options.map(o => (
        <button key={o.id} type="button" disabled={!editable} onClick={() => on(o.id)}
          className={`${TOOL_BTN} ${value === o.id ? TOOL_BTN_ON : TOOL_BTN_OFF}`}>{o.label}</button>
      ))}
    </div>
  )
  return (
    <div className="space-y-3">
      {/* ⛔ "WHERE IT GOES" IS STILL GONE — 7 October 2026. The rule is derived from the switch alone
        * (`eventImageMode`): photo space on ⇒ the box, off ⇒ the whole poster. */}
      <Field label="Picture">
        {seg(pic.fit, [
          { id: 'fill' as const, label: 'Fill the box' },
          { id: 'fit' as const, label: 'Fit inside' },
        ], v => set({ fit: v }))}
      </Field>
      <Field label="Corners">
        {seg(pic.corners, [
          { id: 'square' as const, label: 'Square' },
          { id: 'rounded' as const, label: 'Rounded' },
        ], v => set({ corners: v }))}
      </Field>
      <Field label="If a location has no image">
        <select value={pic.ifMissing} disabled={!editable} className={`${TOOL_INPUT} w-full`}
          onChange={e => set({ ifMissing: e.target.value as NoPictureBehaviour })}>
          <option value="omit">{NO_PICTURE_LABELS.omit}</option>
          <option value="blank">{NO_PICTURE_LABELS.blank}</option>
          {/* ⛔ "Show your logo" IS OFFERED ONLY TO A TRUCK THAT HAS ONE. An option that silently
            * draws nothing is worse than an option that is not there. */}
          {hasLogo && <option value="logo">{NO_PICTURE_LABELS.logo}</option>}
        </select>
      </Field>

      <div className="border-t border-slate-100 pt-3">
        <GroupHeading>Border</GroupHeading>
        <OptionalColourRow label="Draw a border" value={pic.borderColour}
          hint="A line around the picture, in your own colour."
          onChange={v => set({ borderColour: v })} />
        {pic.borderColour && (
          <Slider label="Border width" value={pic.borderWidth} min={1}
            max={Math.max(2, Math.round(Math.min(pic.w, pic.h) / 2))} step={1}
            format={v => `${v}px`} onChange={v => set({ borderWidth: v })} />
        )}
        {pic.corners === 'rounded' && (
          <Slider label="Corner radius" value={pic.radius} min={0}
            max={Math.max(4, Math.round(Math.min(pic.w, pic.h) / 2))} step={1}
            format={v => `${v}px`} onChange={v => set({ radius: v })} />
        )}
      </div>

      {/* ══ 🔴 THE WEEKLY POST'S "+ Add location pictures", WITH THE REAL NUMBER ═══════════════════
        * ⛔ IT ANSWERS THE QUESTION THE SETTING RAISES. A truck who switches this on and sees six
        * empty rows has no way to find out why; "16 of your 20 locations have no image yet" is the
        * answer, and the button goes to the screen that fixes it. */}
      {isWeek && placesWithout && (
        <div className="border-t border-slate-100 pt-3">
          <span className={TOOL_LABEL}>Location pictures</span>
          <button type="button" onClick={onAddPlacePictures}
            className="mt-1 inline-flex h-8 items-center justify-center rounded-lg bg-orange-600 px-3 text-sm font-bold text-white hover:bg-orange-700">
            + Add location pictures
          </button>
          <p className="mt-1 text-[11px] text-slate-400">
            {noPicturesLine(placesWithout.without, placesWithout.total)}
          </p>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SETTINGS PANEL — ON SCREEN, NOT IN A POP-UP (9 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ WHAT THIS REPLACES: a horizontal toolbar above the picture, plus two Popovers — "✦ Effects ▾" and
// "Advanced ▾". Three problems, all of them structural rather than cosmetic:
//
//   1. 🔴 A POP-UP COVERS THE THING IT CHANGES. Every setting in those two panels is about how the
//      words look on the poster, and opening either put a panel between the operator and the poster.
//      They were adjusting a picture they could not see.
//   2. ⛔ A TOOLBAR THAT WRAPS IS A TOOLBAR WHOSE CONTROLS MOVE. Nine cells across a column that is
//      1fr of a two-column grid wrapped to two or three rows depending on which item was selected —
//      so the Size stepper was in a different place for the Date than for a note.
//   3. ⚠️ "Advanced" HID SETTINGS BY NAME RATHER THAN BY USE. Spacing and tilt are not advanced; they
//      were simply last.
//
// 🔴 THREE SECTIONS, ORDERED BY HOW OFTEN THEY ARE TOUCHED: TEXT always open, MAKE IT STAND OUT open
// by default and foldable, MORE OPTIONS folded with a grey summary of what is inside. ⛔ NOTHING IS
// LOST — `EffectsPanel` and `AdvancedPanel` are the SAME COMPONENTS the pop-ups held, mounted inline.
// That is deliberate: re-authoring them would have been the chance to drop a setting by accident.

/**
 * One foldable section.
 *
 * ⚠️ A `<button>` HEADER, NOT A `<details>`. The chevron has to be the product's own glyph at the
 * product's own size, and a `<summary>` marker is the browser's — three engines, three markers.
 * 🔴 THE SUMMARY LINE IS WHAT MAKES A FOLDED SECTION HONEST. "More options" alone is a closed door
 * with no sign on it; naming what is inside is what lets an operator decide not to open it.
 */
/**
 * ══ 🔴 §5 · THE ONE FOLD ARROW (10 October 2026) ══════════════════════════════════════════════════
 *
 * ⛔ IT WAS `▴` / `▾` AT 12px — two different Unicode glyphs swapped by a ternary, which is two things
 * that can disagree: a triangle that points up when open and down when closed is the opposite
 * convention from the one every disclosure in this product uses, and at 12px neither reads as an arrow.
 * 🔴 ONE CHEVRON, ROTATED. The same `<svg>` in both states, turned 90° when open — so "points right
 * when closed, down when open" is one transform rather than two glyphs, and there is no second icon to
 * fall out of step. ⚠️ 18px, THE BRIEF'S SIZE, and `aria-hidden` because the `<button>` already carries
 * `aria-expanded`.
 */
function FoldArrow({ open }: { open: boolean }) {
  return (
    <svg data-fold-arrow={open ? 'open' : 'closed'} width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

/**
 * One foldable section.
 *
 * ⚠️ A `<button>` HEADER, NOT A `<details>`. The chevron has to be the product's own glyph at the
 * product's own size, and a `<summary>` marker is the browser's — three engines, three markers.
 * 🔴 THE SUMMARY LINE IS WHAT MAKES A FOLDED SECTION HONEST. "More options" alone is a closed door
 * with no sign on it; naming what is inside is what lets an operator decide not to open it.
 * ⚠️ §5 · THE WHOLE HEADING ROW IS THE BUTTON — it already was, and the claim is now measured rather
 * than assumed: a 10px label with an 18px arrow is two small targets unless the row between them is
 * one, and on an iPad that difference is the whole control.
 */
function Section({ title, summary, open, onToggle, children }: {
  title: string
  /** The grey line under a FOLDED header. ⚠️ Hidden when open — the contents are their own summary. */
  summary?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0" data-settings-section={title}>
      <button type="button" onClick={onToggle} aria-expanded={open} data-fold-head
        className="flex w-full items-center justify-between gap-2 py-0.5 text-left">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</span>
        <FoldArrow open={open} />
      </button>
      {!open && summary && (
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{summary}</p>
      )}
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

/**
 * ══ 🔴 THE RIGHT-HAND PANEL — EVERYTHING ABOUT THE SELECTED BOX ═══════════════════════════════════
 *
 * ⚠️ IT IS THE ONLY PLACE A SETTING LIVES NOW. The toolbar is gone; this panel is what replaced it,
 * and `EffectsPanel`/`AdvancedPanel` are mounted inside it rather than inside a Popover.
 * ⛔ WITH NOTHING SELECTED IT SAYS SO rather than rendering an empty card — a panel of greyed controls
 * invites an operator to press one and explains nothing when they do.
 */
/**
 * ══ 🔴 THE PANEL — ONE COLUMN, 380px, AND THE ITEM LIST LIVES IN IT (9 October 2026) ══════════════
 *
 * ⛔ THERE WERE TWO COLUMNS AND THERE IS ONE. A 250px list on the left and a 320px panel on the right
 * put the two halves of one job at opposite ends of the screen, with the poster between them — so
 * picking a box and changing it was a 1,000px round trip, and on a 16-inch window the poster was still
 * only getting the middle third. ⚠️ ONE 380px COLUMN GIVES THE POSTER EVERYTHING ELSE.
 *
 * 🔴 AND "All text" IS THE FIRST THING IN IT, because on a weekly design it is the control an operator
 * wants first: eleven boxes, one font.
 */
function SettingsPanel(p: SettingsProps & {
  stand: boolean
  setStand: (v: boolean) => void
  more: boolean
  setMore: (v: boolean) => void
  /** 🔴 §3 · the background section's own fold, held by the editor so it survives a selection change. */
  bg: boolean
  setBg: (v: boolean) => void
  /** 🔴 The Background picture item's settings — the card that used to sit under the left list. */
  backgroundCard: React.ReactNode
  /** The item buttons at the top of the panel. ⚠️ Built by the editor, which owns `itemsOf`. */
  itemGrid: React.ReactNode
}) {
  const {
    layout, selected, selItem, sel, country, editable, H, patchSel, commit, patchEffects,
    patchShared, patchSharedEffects, makeOwn, makeFollow, promoteToShared, setAllTextSize,
    centreSel, removeNote, live, beginGesture, onQuick, onReorder, onToggleItem, onSelectItem,
    token, fontLib, sample, hasLogo, placesWithout,
    onAddPlacePictures, stand, setStand, more, setMore, itemGrid, ownNames,
  } = p
  const isWeek = isWeekLayout(layout)
  const spec = LOCALES[country]
  const dateBox = selected === 'date' ? (layout.date as DateBox) : null
  const itemName = selItem?.name ?? 'this box'
  const shared = layout.textStyle

  /* 🔴 THE PANEL IS ALWAYS THE SAME SHELL: the item grid, then whatever the selection needs. ⛔ The
   * grid is OUTSIDE every early return below, because a branch that forgot it would be a branch with
   * no way back to another item. */
  /**
   * ══ 🔴 §3 · THE PANEL IS THE GRID, THE SELECTION, AND **ALWAYS** THE BACKGROUND (10 October 2026) ══
   *
   * ⛔ THE BACKGROUND USED TO BE A SELECTION LIKE ANY OTHER, which made it the one setting an operator
   * had to LEAVE what they were doing to reach — and, for one round, a thing a stray press on the
   * poster selected for them.
   * 🔴 IT IS A FOLDED SECTION AT THE FOOT OF EVERY PANEL NOW: always in the same place, whatever is
   * selected, so "where is Replace picture?" has one answer. ⚠️ FOLDED BY DEFAULT, with a summary
   * naming what is inside — it holds three settings a truck touches once per design.
   */
  const shell = (body: React.ReactNode, title?: string, subtitle?: string) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-3" data-settings-panel>
      {itemGrid}
      <div className="mt-3 border-t border-slate-100 pt-3">
        {title && <p className="text-sm font-bold text-slate-900" data-settings-title>{title}</p>}
        {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{subtitle}</p>}
        <div className={title ? 'mt-2.5' : ''}>{body}</div>
      </div>
      <div className="mt-3" data-background-section>
        <Section title={BACKGROUND_SECTION} summary={BACKGROUND_SUMMARY}
          open={p.bg} onToggle={() => p.setBg(!p.bg)}>
          {p.backgroundCard}
        </Section>
      </div>
    </div>
  )

  /* ══ 🔴 "All text" ════════════════════════════════════════════════════════════════════════════════
   * ⚠️ IT HAS NO "Shows" AND NO "Line up". Both are per box by definition — a date style belongs to the
   * one box that draws a date, and `align` is about which edge of **this** box the words sit against.
   * ⛔ ITS SIZE CONTROL IS A PAIR OF RELATIVE BUTTONS, not a number, because there is no one size to
   * show: the boxes on a design are deliberately different sizes and the thing an operator wants is to
   * move them all without flattening them. */
  if (selected === ALL_TEXT_KEY) {
    return shell(
      <>
        <div className="space-y-2" data-settings-section="TEXT">
          <Field label="Font">
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 grow">
                <FontPicker value={shared.fontId} onChange={id => patchShared({ fontId: id })}
                  token={token} disabled={!editable} sample={sample}
                  className={`${TOOL_INPUT} w-full`} />
              </div>
            </div>
          </Field>
          {/* ══ 🔴 A SIZE, NOT TWO NUDGE BUTTONS — see `setAllTextSize` ══════════════════════════════
            * ⚠️ IT SITS WHERE THE SIZE STEPPER SITS FOR A BOX, so the panel reads the same way on every
            * selection, and the grey line says what the number does to the boxes that are not it. */}
          <Field label={LABEL_TEXT_SIZE}>
            <Stepper value={layout.date.fontSize} min={6} max={H} step={2}
              minusLabel="A−" plusLabel="A+" onChange={v => setAllTextSize(v)} />
          </Field>
          <p className="text-[11px] leading-snug text-slate-400" data-all-size-hint>{ALL_TEXT_SIZE_HINT}</p>
          <Field label="Colour">
            <ColourField value={shared.color} onChange={c => patchShared({ color: c })} label="Text colour" />
          </Field>
          <Field label={LABEL_LETTERS}>
            <StyleRow look={shared} fontLib={fontLib} editable={editable}
              onPatch={patchShared} align={null} onAlign={null} />
          </Field>
        </div>

        <Section title={SECTION_EASIER_TO_READ} open={stand} onToggle={() => setStand(!stand)}>
          <EffectsPanel fx={shared.effects} dateBox={null} isWeek={isWeek}
            patchSel={patchSel} patchEffects={patchSharedEffects} />
        </Section>
        <Section title={EDITOR_SECTION_MORE} summary={MORE_SUMMARY_PLAIN}
          open={more} onToggle={() => setMore(!more)}>
          <MoreShared fx={shared.effects} look={shared} layout={layout}
            patchLook={patchShared} patchEffects={patchSharedEffects} H={H} />
        </Section>

        {/* ══ 🔴 THE AMBER NOTE — "SOME BOXES ARE NOT CHANGED BY THIS" ══════════════════════════════
          * ⛔ WITHOUT IT, "All text" IS A CONTROL THAT SILENTLY DOES LESS THAN ITS NAME. An operator who
          * had given their heading its own font would change the shared colour, watch the heading stay
          * put, and have no way to find out why. ⚠️ IT NAMES THE BOXES and offers the undo. */}
        {ownNames.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2" data-own-warning>
            <p className="text-[11px] leading-relaxed text-amber-800">
              {ownNames.map(o => o.name).join(', ')} {ownNames.length === 1 ? 'has' : 'have'} its own style, so it isn’t changed.{' '}
              {ownNames.map((o, i) => (
                <button key={o.key} type="button" disabled={!editable} onClick={() => makeFollow(o.key)}
                  className="font-bold underline hover:no-underline" data-match-again>
                  {i === 0 ? 'Match it again' : `Match ${o.name}`}
                </button>
              ))}
            </p>
          </div>
        )}
      </>,
      ALL_TEXT_TITLE, ALL_TEXT_BLURB,
    )
  }

  /* ⛔ NOTHING SELECTED. The brief's own sentence, and it is an instruction rather than a status. */
  if (!selItem) return shell(<p className="text-sm text-slate-400">{EDITOR_NOTHING_SELECTED}</p>)

  /* ══ 🔴 "THE 7 DAYS" — ITS OWN PANEL, AND NO TEXT SETTINGS IN IT ══════════════════════════════ */
  if (selected === DAYS_KEY && isWeek && (layout as Layout).days) {
    return shell(
      <DaysPanel days={(layout as Layout).days!} layout={layout as Layout} country={country}
        editable={editable} commit={commit} live={live} beginGesture={beginGesture}
        onQuick={onQuick} onReorder={onReorder} more={more} setMore={setMore}
        onToggle={onToggleItem} onSelectPart={onSelectItem} />,
      DAYS_ITEM, DAYS_BLURB,
    )
  }

  /* ⛔ THE `BACKGROUND_KEY` BRANCH WAS HERE AND IS GONE (§3). The background is not a selection any
   * more — it is the section at the foot of `shell`, on every panel. */

  /* ⚠️ THE PICTURE BOX KEEPS ITS OWN CONTROLS — fill/fit, corners, "if a location has no image", the
   * border and the radius. A picture has no font and no capitals, so the text sections would be empty. */
  if (selected === PLACE_PICTURE_KEY) {
    return shell(
      <PicturePanel layout={layout} commit={commit} editable={editable} isWeek={isWeek}
        hasLogo={hasLogo === true} placesWithout={placesWithout ?? null}
        onAddPlacePictures={onAddPlacePictures ?? (() => {})} />,
      itemName, SETTINGS_CLICKED,
    )
  }

  /* ⚠️ `rows` HAS NO BOX AND NO TEXT — it is the weekly list's spacing. */
  if (!sel) {
    return shell(
      <RowsPanel layout={layout} commit={commit} editable={editable} H={H} />,
      itemName, SETTINGS_CLICKED,
    )
  }

  /* 🔴 **THE RESOLVED BOX IS WHAT THE CONTROLS SHOW.** `resolveTextBox` is the same function the satori
   * renderer calls, which is the brief's requirement: a following box's stored `fontId` is not what will
   * be drawn, so a panel reading the raw field would show a font the poster does not use. */
  const shown = resolveTextBox(shared, sel)
  const owns = sel.ownStyle
  /* ⚠️ ONE OF THE FOUR PARTS OF A DAY ROW — on a converted weekly design only. Its words are styled
   * here; its position belongs to "The 7 days". */
  const isPart = isWeek && !!(layout as Layout).days
    && (selected === 'date' || selected === 'location' || selected === 'time')

  /* ══ 🔴 §C · "Shows" IS GONE, AND IT WAS FOUR QUESTIONS WEARING ONE LABEL ═════════════════════════
   * ⛔ "Shows" told an operator that the control did something and nothing about what. The same word
   * sat over a date format, a place format, a clock and a free-text box — four different questions.
   * ⚠️ AND THE DATE'S LINE NAMES THE **OTHER** CHOICES. A dropdown shows today's answer when it is
   * closed, so the one thing it cannot tell you is what else is in it. */
  const otherDateChoices = spec.dateStyles.filter(d => d.id !== layout.dateStyle).map(d => d.sample)
  const showsRow = (
    <>
      {selected === 'date' && (
        <>
          <Field label={LABEL_DATE_STYLE}>
            <select value={layout.dateStyle} disabled={!editable} className={`${TOOL_INPUT} w-full`}
              onChange={e => commit(l => ({ ...l, dateStyle: e.target.value as DateStyleId }))}>
              {/* ⚠️ THE OPTION'S WORDS ARE THE DATE ITSELF, from the locale table — "Long" and "Short"
                * would make the operator open each one to find out what it does. */}
              {spec.dateStyles.map(d => <option key={d.id} value={d.id}>{d.sample}</option>)}
            </select>
          </Field>
          {otherDateChoices.length > 0 && (
            <p className="text-[11px] leading-snug text-slate-400" data-other-choices>
              {OTHER_CHOICES(otherDateChoices.slice(0, 3))}
            </p>
          )}
        </>
      )}
      {selected === 'location' && isWeek && (
        <Field label={LABEL_PLACE_STYLE}>
          <select value={layout.placeStyle} disabled={!editable} className={`${TOOL_INPUT} w-full`}
            onChange={e => commit(l => (isWeekLayout(l) ? { ...l, placeStyle: e.target.value as PlaceStyleId } : l))}>
            {PLACE_STYLE_IDS.map(id => (
              <option key={id} value={id}>{PLACE_STYLE_SAMPLES[id].split('\n').join(' · ')}</option>
            ))}
          </select>
        </Field>
      )}
      {selected === 'time' && (
        <Field label={LABEL_TIME_STYLE}>
          <select value={layout.timeStyle} disabled={!editable} className={`${TOOL_INPUT} w-full`}
            onChange={e => commit(l => ({ ...l, timeStyle: e.target.value as TimeStyle }))}>
            <option value="12h">{formatTimeRangeFor('17:00', '21:00', '12h')}</option>
            <option value="24h">{formatTimeRangeFor('17:00', '21:00', '24h')}</option>
          </select>
        </Field>
      )}
      {selected === 'heading' && isWeek && (
        <Field label={LABEL_HEADING_TEXT}>
          <input value={(layout as Layout).heading.text} disabled={!editable}
            className={`${TOOL_INPUT} w-full`} onChange={e => patchSel({ text: e.target.value })} />
        </Field>
      )}
      {selected.startsWith(NOTE_PREFIX) && (
        <Field label={LABEL_OWN_TEXT}>
          <input value={(sel as NoteBox).text} disabled={!editable}
            className={`${TOOL_INPUT} w-full`} onChange={e => patchSel({ text: e.target.value })} />
        </Field>
      )}
    </>
  )

  /* ══ 🔴 §C · "Text size", WITH [A−] AND [A+] — AND THE OTHER WAY TO DO IT NAMED ═══════════════════
   * ⛔ "Size" WAS A NUMBER WITH ARROWS and gave no clue what the number was. `A−`/`A+` says "letters"
   * in two characters, and the grey line underneath points at the handles on the poster — which are
   * the control most operators will actually use and the one nothing on screen mentioned. */
  const sizeRow = (
    <>
      <Field label={LABEL_TEXT_SIZE}>
        <Stepper value={sel.fontSize} min={6} max={H} step={2} onChange={v => patchSel({ fontSize: v })}
          minusLabel="A−" plusLabel="A+" />
      </Field>
      <p className="text-[11px] leading-snug text-slate-400" data-size-hint>{TEXT_SIZE_HINT}</p>
    </>
  )
  const lineUpRow = (
    <Field label={LABEL_LINE_UP}>
      <AlignButtons align={sel.align} editable={editable} onAlign={a => patchSel({ align: a })} />
    </Field>
  )

  return shell(
    <>
      {/* ══ 🔴 §3 · THE "LOOK" SWITCH — ONE CONTROL WITH TWO VISIBLE POSITIONS ════════════════════════
        *
        * ⛔ WHAT THIS REPLACES: two coloured notes, each with the state-changing link buried inside the
        * sentence that described the state. Blue said "🔗 Same font, colour and effects as All text ·
        * **Change just this box**"; amber said "Own style · **Match All text again**". Three faults:
        *   1. 🔴 THE THING YOU PRESS WAS INSIDE THE THING YOU READ. An operator scanning for a control
        *      found a paragraph, and the control was a word in it.
        *   2. ⛔ THE TWO STATES LOOKED LIKE TWO DIFFERENT COMPONENTS — different colour, different
        *      words, different shape — rather than two positions of one setting. So "what are my
        *      options here?" had no answer on screen; you had to already know there was a second one.
        *   3. ⚠️ NEITHER NOTE SAID WHAT THE OTHER POSITION WOULD DO.
        * 🔴 A TWO-WAY SWITCH SHOWS BOTH POSITIONS AT ONCE, which is what makes the choice visible, and
        * the grey line under it explains the position you are in and names the other one.
        * ⚠️ THE BEHAVIOUR IS UNCHANGED: "Its own style" copies the shared look in and then marks the box
        * own — the copy and the flag in one commit, or the box would visibly change to whatever stale
        * look it carried in storage the instant the operator asked to change *just this box*. */}
      <div data-look>
        {/* ⚠️ "Style", NOT "LOOK" — §C. The heading was a noun an operator had to map onto what the
          * switch did; the two positions now say it themselves. */}
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{STYLE_HEADING}</p>
        <div className="mt-1 inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white">
          {([[false, STYLE_MATCH], [true, STYLE_OWN]] as const).map(([wantOwn, label]) => (
            <button key={label} type="button" disabled={!editable}
              data-look-opt={wantOwn ? 'own' : 'same'}
              aria-pressed={owns === wantOwn}
              onClick={() => (wantOwn ? makeOwn(selected) : makeFollow(selected))}
              className={`px-2.5 py-1 text-[11px] font-bold ${owns === wantOwn
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50 disabled:text-slate-300'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400" data-look-hint>
          {owns ? STYLE_OWN_HINT : STYLE_MATCH_HINT}
        </p>
      </div>

      <div className="mt-2.5 space-y-2" data-settings-section="TEXT">
        {showsRow}
        {/* ⚠️ A FOLLOWING BOX SHOWS **ONLY** THE PER-BOX SETTINGS — Shows, Size, Line up, MORE OPTIONS.
          * ⛔ DRAWING ITS FONT AND COLOUR WOULD BE DRAWING CONTROLS THAT WRITE TO FIELDS NOTHING READS,
          * which is the one failure here that is completely invisible: the operator changes the colour,
          * the poster does not change, and nothing on the screen explains it. */}
        {owns ? (
          <>
            <Field label="Font">
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 grow">
                  <FontPicker value={shown.fontId} onChange={id => patchSel({ fontId: id })}
                    token={token} disabled={!editable} sample={sample}
                    className={`${TOOL_INPUT} w-full`} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Stepper value={sel.fontSize} min={6} max={H} step={2}
                    onChange={v => patchSel({ fontSize: v })} />
                </div>
              </div>
            </Field>
            <Field label="Colour">
              <ColourField value={shown.color} onChange={c => patchSel({ color: c })} label="Text colour" />
            </Field>
            <Field label={LABEL_LETTERS}>
              <StyleRow look={shown} fontLib={fontLib} editable={editable}
                onPatch={patchSel} align={sel.align} onAlign={a => patchSel({ align: a })} />
            </Field>
          </>
        ) : (
          <>
            {sizeRow}
            {lineUpRow}
          </>
        )}
      </div>

      {/* ⚠️ MAKE IT STAND OUT IS SHARED-OR-OWN LIKE THE REST OF THE LOOK, so a following box does not
        * get it — the shared one is on the "All text" panel, one press away and named there. */}
      {owns && (
        <Section title={SECTION_EASIER_TO_READ} open={stand} onToggle={() => setStand(!stand)}>
          <EffectsPanel fx={shown.effects} dateBox={dateBox} isWeek={isWeek}
            patchSel={patchSel} patchEffects={patchEffects} />
        </Section>
      )}
      <Section title={EDITOR_SECTION_MORE}
        summary={MORE_SUMMARY_PLAIN}
        open={more} onToggle={() => setMore(!more)}>
        <>
          <MoreBox layout={layout} selected={selected} sel={sel} isWeek={isWeek} isPart={isPart}
            patchSel={patchSel} commit={commit} centreSel={centreSel}
            />
          {owns && (
            <MoreShared fx={shown.effects} look={shown} layout={layout}
              patchLook={patchSel} patchEffects={patchEffects} H={H} />
          )}
        </>
      </Section>

      {/* ══ 🔴 §6 · DELETE YOUR OWN TEXT (10 October 2026) ═══════════════════════════════════════════
        * ⛔ IT WAS A RED **LINK AT THE BOTTOM OF A FOLDED SECTION**, which is the hardest place on the
        * panel to find a destructive action — and the easiest to press by accident once found, because
        * a link has no edges.
        * 🔴 A RED-OUTLINED BUTTON, AT THE FOOT, WITH THE KEY NAMED BESIDE IT. The keyboard is how
        * anybody who has placed a few boxes will actually do it, and a shortcut nothing mentions is a
        * shortcut nobody uses. ⚠️ NO CONFIRM: ⌘Z brings it back, which is the brief's own reasoning and
        * is true of every other change this editor makes.
        * ⛔ ONLY A "Your own text" BOX. The built-in items are switched off, never deleted — a design
        * with no Date box is a state the validator and the renderer both understand, and a design
        * MISSING one is not. */}
      {noteIndex(selected) >= 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
          <button type="button" disabled={!editable} data-delete-note
            onClick={() => removeNote(selected)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-300">
            {DELETE_OWN_TEXT}
          </button>
          <span className="text-[11px] text-slate-400" data-delete-hint>{DELETE_OWN_TEXT_KEY}</span>
        </div>
      )}

      {/* ══ 🔴 "Use this style for all text" — THE OTHER DIRECTION ════════════════════════════════════
        * ⛔ `copyStyleToAll` IS GONE AND THIS REPLACES IT. The old button wrote eleven copies; this one
        * promotes this box's look to the SHARED one and makes every box — including the other own-style
        * boxes — follow it. ⚠️ ONLY OFFERED ON A BOX THAT OWNS ITS STYLE, because on a following box it
        * would mean "make the shared style the shared style". */}
      {owns && (
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <button type="button" disabled={!editable} onClick={() => promoteToShared(selected)}
            className="text-xs font-bold text-orange-700 disabled:text-slate-300" data-use-for-all>
            {USE_FOR_ALL_TEXT}
          </button>
        </div>
      )}
    </>,
    itemName, SETTINGS_CLICKED,
  )
}

/**
 * B / I / AA, and Line up beside them when the selection has one.
 *
 * ⚠️ ONE COMPONENT FOR BOTH THE SHARED PANEL AND A BOX'S, because the three letter buttons are the same
 * three controls writing to the same three field names — `patchShared` and `patchSel` have the same
 * shape. ⛔ A SECOND COPY FOR "All text" IS HOW Bold COMES TO MEAN TWO DIFFERENT THINGS.
 */
function StyleRow({ look, fontLib, editable, onPatch, align, onAlign }: {
  look: TextLook
  fontLib: FontLibrary
  editable: boolean
  onPatch: (patch: Partial<TextLook>) => void
  /** null on the "All text" panel — `align` is per box and has no shared value. */
  align: Align | null
  onAlign: ((a: Align) => void) | null
}) {
  const support = faceSupport(fontLib, look.fontId)
  return (
    <div className="flex items-center gap-2">
      <div className="flex shrink-0 items-center gap-1">
        {/* ══ 🔴 BOLD AND ITALIC ONLY WHERE THE FAMILY HAS THE FILES ═══════════════════════════════
          * ⚠️ HIDDEN, NOT DISABLED, for a family with one weight: `resolveWeight` falls back to the 400
          * file, so the button would depress and change nothing. */}
        {support.bold && (
          <button type="button" disabled={!editable} onClick={() => onPatch({ bold: !look.bold })}
            title={LETTERS_BOLD} aria-label={LETTERS_BOLD}
            className={`${TOOL_BTN} ${look.bold ? TOOL_BTN_ON : TOOL_BTN_OFF} w-8 font-black`}>B</button>
        )}
        {support.italic && (
          <button type="button" disabled={!editable} title={`${LETTERS_ITALIC} — this font has a real italic`}
            aria-label={LETTERS_ITALIC}
            onClick={() => onPatch({ italic: !look.italic })}
            className={`${TOOL_BTN} ${look.italic ? TOOL_BTN_ON : TOOL_BTN_OFF} w-8 italic font-serif`}>I</button>
        )}
        <button type="button" disabled={!editable} onClick={() => onPatch({ caps: !look.caps })}
          title={LETTERS_CAPS} aria-label={LETTERS_CAPS}
          className={`${TOOL_BTN} ${look.caps ? TOOL_BTN_ON : TOOL_BTN_OFF} w-9`}>AA</button>
      </div>
      {align !== null && onAlign && (
        <>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">{LABEL_LINE_UP}</span>
          <AlignButtons align={align} editable={editable} onAlign={onAlign} />
        </>
      )}
    </div>
  )
}

/**
 * ══ 🔴 §C · "⇤ Left | ≡ Centre | Right ⇥" — WORDS, WITH THE ARROW BESIDE THEM ═════════════════════
 *
 * ⛔ THEY WERE THREE DRAWN ICONS — stacks of bars, shifted — and three bars are a picture of a
 * paragraph, which is not what the control does to a single line of a place name. ⚠️ THE ARROW SITS ON
 * THE SIDE THE WORDS GO, so the button is a picture AND a word rather than one or the other.
 */
function AlignButtons({ align, editable, onAlign }: {
  align: Align
  editable: boolean
  onAlign: (a: Align) => void
}) {
  const LABELS: Record<Align, string> = {
    left: ALIGN_LEFT, center: ALIGN_CENTRE, right: ALIGN_RIGHT,
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {(['left', 'center', 'right'] as Align[]).map(a => (
        <button key={a} type="button" disabled={!editable} aria-label={alignLabel(a)}
          aria-pressed={align === a} onClick={() => onAlign(a)} data-align={a}
          className={`${TOOL_BTN} ${align === a ? TOOL_BTN_ON : TOOL_BTN_OFF} px-2`}>
          {LABELS[a]}
        </button>
      ))}
    </div>
  )
}

/**
 * ══ 🔴 LABEL ON THE LEFT, CONTROLS ON THE RIGHT (9 October 2026) ══════════════════════════════════
 *
 * ⛔ IT WAS A LABEL **ABOVE** ITS CONTROLS, which is two lines per setting. Eight settings is sixteen
 * lines, and on a 16-inch window the brief's requirement is that everything except an opened MORE
 * OPTIONS fits with no page scroll — so the stacked form was the single biggest consumer of the height
 * that requirement needed.
 * 🔴 `78px` IS A FIXED COLUMN AND THAT IS THE POINT. The labels line up down the panel, so the eye
 * reads one column of names and one column of controls; a label sized to its own text would start the
 * controls in a different place on every row. ⚠️ `shrink-0` on it and `min-w-0` on the controls, so a
 * font name truncates rather than pushing the label out of its column.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2" data-field={label}>
      <span className="w-[78px] shrink-0 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-400">
        {label}
      </span>
      <div className="min-w-0 grow">{children}</div>
    </div>
  )
}

/* ══ ⛔ TOMBSTONE · `Toolbar` — DELETED 9 October 2026 ════════════════════════════════════════════
 * It was a horizontal row of nine cells above the picture, plus two Popovers ("✦ Effects ▾" and
 * "Advanced ▾"). Three things were wrong with it, all structural:
 *   1. 🔴 A POP-UP COVERS THE THING IT CHANGES. Every setting in those two panels is about how the
 *      words look on the poster, and opening either put a panel between the operator and the poster.
 *   2. ⛔ A TOOLBAR THAT WRAPS IS A TOOLBAR WHOSE CONTROLS MOVE. Nine cells across a `1fr` column
 *      wrapped to two or three rows depending on which item was selected.
 *   3. ⚠️ "Advanced" HID SETTINGS BY NAME RATHER THAN BY USE. Spacing and tilt are not advanced.
 *
 * 🔴 EVERY CONTROL IT HELD IS IN `SettingsPanel` — and `EffectsPanel`/`AdvancedPanel` are the SAME
 * COMPONENTS, mounted inline rather than inside a Popover, deliberately: re-authoring them would have
 * been the chance to drop a setting by accident. `ToolbarProps` survives as the panel's prop shape.
 * ⚠️ `Popover` IS STILL IMPORTED AND USED BY NOTHING IN THIS FILE. It is a shared primitive in
 * DesignEditorBits.tsx with other callers; the import is removed, the component is not. */

/* ⛔ `hasEffects` IS GONE — it lit the "✦ Effects ▾" button so an operator could see that an item had
 * effects WITHOUT OPENING THE PANEL. The panel is never closed now: MAKE IT STAND OUT is a section on
 * screen, open by default, and its controls show their own state. */

const alignLabel = (a: Align) => (a === 'left' ? 'Left' : a === 'center' ? 'Centre' : 'Right')

/* ⛔ TOMBSTONE · `AlignIcon` — DELETED 10 OCTOBER 2026. Three shifted bars drew a PARAGRAPH, and the
 * thing being lined up is one line of a place name. §C replaces it with "⇤ Left | ≡ Centre | Right ⇥",
 * which is a word and an arrow. ⚠️ ITS ORIGINAL NOTE IS WORTH KEEPING: the Unicode alignment characters
 * are missing from several system fonts and render as a box, which is why the arrows used here are ⇤
 * and ⇥ — both present in every system font this product has been seen on. */

/* ⛔ TOMBSTONE · `DarkenSlider` — REMOVED 10 OCTOBER 2026 (§B3). It was mounted in two places that an
 * operator would never think to look in: the MORE OPTIONS of "All text", and the weekly "Rows" panel.
 * The slider is in the background picture's own settings now, written out there rather than wrapped in
 * a component — one caller does not need one. */

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 EFFECTS — SHADOW, OUTLINE, BAND
// ════════════════════════════════════════════════════════════════════════════════════════════════

function EffectsPanel({ fx, dateBox, isWeek, patchSel, patchEffects }: {
  /** 🔴 THE EFFECTS THEMSELVES, not a box. ⚠️ So one component serves the SHARED panel and an
   *  own-style box's — the controls are identical and only the write target differs. ⛔ Taking a box
   *  would have forced a fake box to be built for the "All text" panel, which has none. */
  fx: Effects
  /** Non-null only when the DATE item is selected — the day-off / cancelled band lives on it. */
  dateBox: DateBox | null
  isWeek: boolean
  patchSel: (patch: Partial<DateBox & NoteBox>) => void
  patchEffects: (patch: Partial<Effects>) => void
}) {
  return (
    <>
      {/* ⚠️ "Shadow behind the letters", NOT "Shadow" — §C. One word named a thing; the phrase names
        * where it goes, which is the part an operator is choosing between. */}
      <GroupHeading>{EFFECT_SHADOW}</GroupHeading>
      <div className="flex gap-1 mb-3">
        {(['none', 'soft', 'strong'] as const).map(s => (
          <button key={s} type="button"
            onClick={() => patchEffects({ shadow: s })}
            className={`${TOOL_BTN} ${fx.shadow === s ? TOOL_BTN_ON : TOOL_BTN_OFF} grow`}>
            {s === 'none' ? EFFECT_SHADOW_NONE : s === 'soft' ? EFFECT_SHADOW_SOFT : EFFECT_SHADOW_STRONG}
          </button>
        ))}
      </div>

      {/* ══ ⚠️ OUTLINE AND BAND SHARE ONE LINE — THE BRIEF'S OWN LAYOUT ══════════════════════════════
        * ⛔ THEY WERE TWO `CheckRow`s WITH A HINT UNDER EACH, which is four lines for two switches on a
        * panel whose whole problem is height. The hints move to `title`, which is where a one-line
        * explanation of a switch belongs when the switch's own label already says what it does. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <label className="flex items-center gap-1.5 text-xs text-slate-700">
          <Switch on={fx.outline} label={EFFECT_OUTLINE} onToggle={() => patchEffects({ outline: !fx.outline })} />
          {EFFECT_OUTLINE}
        </label>
        {/* ⚠️ "Coloured strip behind the words", NOT "Band behind" — §C. "Band" is a typesetter's word
          * and the old label was missing its object entirely. */}
        <label className="flex items-center gap-1.5 text-xs text-slate-700">
          <Switch on={fx.band} label={EFFECT_BAND} onToggle={() => patchEffects({ band: !fx.band })} />
          {EFFECT_BAND}
        </label>
      </div>
      {fx.outline && (
        <div className="mb-2">
          <ColourField value={fx.outlineColour} onChange={c => patchEffects({ outlineColour: c })}
            label="Outline colour" />
        </div>
      )}
      {/* ⛔ THE BAND IS WHAT "Background behind the date" BECAME. The old setting was a colour on the
        * DATE box alone, so a truck who wanted a label strip behind the TIME could not have one. A
        * design that had the old colour arrives here already switched on, at the same look.
        * ⚠️ ITS COLOUR AND ITS SEE-THROUGH SHARE ONE LINE, and only when the band is on — two controls
        * for a switched-off feature is two controls that do nothing. */}
      {fx.band && (
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 grow">
            <ColourField value={fx.bandColour} onChange={c => patchEffects({ bandColour: c })}
              label="Band colour" />
          </div>
          <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
            {EFFECT_SEE_THROUGH}
            {/* ⚠️ SHOWN AS "see-through" AND STORED AS OPACITY. "90% see-through" is what an operator
              * means; `bandOpacity: 10` is what the renderer needs. The conversion is here, once. */}
            <input type="number" min={0} max={100} step={5} value={100 - fx.bandOpacity}
              onChange={e => patchEffects({ bandOpacity: 100 - Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              className={`${TOOL_INPUT} w-14 text-center`} />
            %
          </label>
        </div>
      )}

      {/* ── §7 · THE POST-TYPE ADD-ON ON THIS ITEM ──────────────────────────────────────────────── */}
      {dateBox && (
        <OptionalColourRow
          label={isWeek ? 'Band on days off' : 'Band when the event is cancelled'}
          value={dateBox.bgDayOff}
          hint={isWeek
            ? 'Used instead of the band above on a day with no trading.'
            : 'Used instead of the band above when the event is cancelled.'}
          onChange={v => patchSel({ bgDayOff: v })} />
      )}

      <CheckRow label={EFFECT_AUTO} checked={fx.keepReadable} hint={EFFECT_AUTO_HINT}
        onChange={v => patchEffects({ keepReadable: v })} />
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 MORE OPTIONS — SPLIT IN TWO ON 9 OCTOBER 2026, BECAUSE "All text" SPLIT THE SETTINGS IN TWO
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ IT WAS ONE `AdvancedPanel` AND IT CANNOT BE ANY MORE. Half its controls are LOOK — letter spacing,
// the shadow's strength, the outline's thickness, the band's corners and padding — and those now live
// on the shared style. The other half are about WHAT a box says and WHERE it is, which are per box for
// ever. One component would have had to write to two different places depending on a flag, which is
// exactly the kind of decision that ends up made in the wrong place.
//
// 🔴 SO THERE ARE TWO, AND THE PANEL COMPOSES THEM:
//   • "All text" selected        → `MoreShared` only.
//   • a FOLLOWING box selected   → `MoreBox` only.
//   • an OWN-STYLE box selected  → both.
//
// ⚠️ EVERY CONTROL THAT EXISTED IS IN ONE OF THEM. Nothing was dropped in the split, which is asserted
// by the harness on the CONTENTS of both rather than on their presence.

/** The look-only tail of MORE OPTIONS. ⚠️ Writes to the shared style, or to a box that owns its own. */
function MoreShared({ fx, look, layout, patchLook, patchEffects, H }: {
  fx: Effects
  look: TextLook
  /** ⚠️ READ FOR ONE THING ONLY — the Date box's size, as a BOUND for the letter-spacing slider. */
  layout: AnyLayout
  patchLook: (patch: Partial<TextLook>) => void
  patchEffects: (patch: Partial<Effects>) => void
  H: number
}) {
  /* ⚠️ THE SLIDER BOUNDS NEED A FONT SIZE AND THE SHARED LOOK HAS NONE — size is always per box. The
   * DATE box's size is used, which is the one every design has and the one the panel opens on. ⛔ IT IS
   * A BOUND, NOT A VALUE: nothing here is stored against that box. */
  const refSize = layout.date.fontSize
  return (
    <>
      <Slider label={LABEL_LETTER_SPACE} value={look.letterSpacing}
        min={-Math.round(refSize * 0.2)} max={Math.round(refSize * 0.6)} step={1}
        format={v => `${v}px`}
        onChange={v => patchLook({ letterSpacing: v })} />

      <Slider label={LABEL_SHADOW_STRENGTH} value={fx.shadowStrength} min={0} max={100} step={5}
        format={v => `${v}%`} onChange={v => patchEffects({ shadowStrength: v })} />
      <Slider label={LABEL_OUTLINE_WIDTH} value={fx.outlineWidth} min={1} max={10} step={1}
        onChange={v => patchEffects({ outlineWidth: v })} />
      <Slider label={LABEL_BAND_CORNERS} value={fx.bandRadius} min={0} max={Math.max(8, Math.round(H * 0.08))} step={1}
        format={v => `${v}px`} onChange={v => patchEffects({ bandRadius: v })} />
      <Slider label={LABEL_BAND_PADDING} value={fx.bandPadding} min={0} max={Math.max(8, Math.round(H * 0.04))} step={1}
        format={v => `${v}px`} onChange={v => patchEffects({ bandPadding: v })} />
      <CheckRow label={EFFECT_AUTO} checked={fx.keepReadable} hint={EFFECT_AUTO_HINT}
        onChange={v => patchEffects({ keepReadable: v })} />
      {/* ⛔ "Darken the picture" WAS HERE AND IS GONE (§B3). It is a setting about the PICTURE, and it
        * lived in the MORE OPTIONS of a text box — where, on a box that follows All text, this whole
        * component is not drawn at all. That is why it read as doing nothing: an operator who selected
        * the Date and opened MORE OPTIONS could not find it. It is in the background's own settings
        * now, which is where somebody looking for it would look. */}
    </>
  )
}

/** The per-box tail of MORE OPTIONS — what it says, how tall its lines are, where it sits. */
function MoreBox({
  layout, selected, sel, isWeek, isPart, patchSel, commit, centreSel,
}: {
  layout: AnyLayout
  selected: ItemKey
  sel: TextBox
  isWeek: boolean
  /** 🔴 This box is one of the four parts of a day row — so it has no position of its own. */
  isPart: boolean
  patchSel: (patch: Partial<DateBox & NoteBox>) => void
  commit: (fn: (l: AnyLayout) => AnyLayout) => void
  centreSel: (axis: 'x' | 'y') => void
}) {
  return (
    <>
      {selected === 'date' && (
        /* ⚠️ "Day on its own line", NOT "Two lines" — WHICH IS THE SAME STORED FIELD. "Two lines" was
         * read as "wrap this box when it is too long", which is what "If it doesn't fit" below does;
         * two settings that sounded like each other and did different things. */
        <CheckRow label="Day on its own line" checked={(layout.date as DateBox).twoLines}
          hint="The weekday above the date. Date only."
          onChange={v => commit(l => ({ ...l, date: { ...l.date, twoLines: v } }))} />
      )}
      {/* ⛔ "On a day with no event" HAS MOVED TO "The 7 days" › Days off ON A CONVERTED DESIGN, where
        * it sits beside the choice that decides whether it is drawn at all. It stays here for a design
        * still on the legacy rows, which is the only place it can still be reached. */}
      {selected === 'location' && isWeek && !(layout as Layout).days && (
        <div className="mb-3">
          <label className="block text-xs font-bold text-slate-600 mb-1">On a day with no event</label>
          <input value={(layout as Layout).daysOffText} className={`${TOOL_INPUT} w-full`}
            onChange={e => commit(l => (isWeekLayout(l) ? { ...l, daysOffText: e.target.value } : l))} />
        </div>
      )}
      <div className="mb-3">
        <label className="block text-xs font-bold text-slate-600 mb-1">{LABEL_WORDS_BEFORE}</label>
        <input value={sel.wordsBefore} placeholder="e.g. Find us"
          onChange={e => patchSel({ wordsBefore: e.target.value })}
          className={`${TOOL_INPUT} w-full`} />
        <p className="text-[11px] text-slate-400 mt-0.5">{WORDS_BEFORE_HINT}</p>
      </div>

      {/* ⚠️ LINE SPACING IS **PER BOX** AND IT IS A JUDGEMENT CALL, recorded in layout.ts: it is in the
        * same Advanced group as letter spacing, which IS shared, but it multiplies the drawn height of
        * a box's text — so it belongs with size and position rather than with colour. */}
      <Slider label={LABEL_LINE_HEIGHT} value={sel.lineSpacing} min={60} max={220} step={5}
        format={v => `${v}%`}
        onChange={v => patchSel({ lineSpacing: v })} />
      <Slider label={LABEL_TILT} value={sel.tilt} min={-15} max={15} step={1}
        format={v => `${v}°`}
        onChange={v => patchSel({ tilt: v })} />
      {/* ⛔ NOT FOR A PART OF A DAY ROW. A part's x/y are the legacy row-1 coordinates and nothing
        * draws them any more, so "Centre on the picture" would move a rectangle that is not on screen
        * — a control that writes to a dead field is the one failure an operator cannot see. The block
        * is what moves, and it has its own handles. */}
      {!isPart && (
        <>
          <p className="text-xs font-bold text-slate-600 mb-1">{LABEL_CENTRE_ON}</p>
          <div className="flex gap-1 mb-3">
            <button type="button" onClick={() => centreSel('x')}
              className={`${TOOL_BTN} ${TOOL_BTN_OFF} grow`}>{CENTRE_ACROSS}</button>
            <button type="button" onClick={() => centreSel('y')}
              className={`${TOOL_BTN} ${TOOL_BTN_OFF} grow`}>{CENTRE_UPDOWN}</button>
          </div>
        </>
      )}

      <div className="mb-3">
        <label className="block text-xs font-bold text-slate-600 mb-1">{LABEL_TOO_LONG}</label>
        {([['shrink', TOO_LONG_SHRINK], ['twoLines', TOO_LONG_TWO_LINES]] as const).map(([id, label]) => (
          <label key={id} className="flex items-center gap-2 text-sm text-slate-700 py-0.5">
            <input type="radio" name={`fit-${selected}`} checked={sel.ifTooLong === id}
              onChange={() => patchSel({ ifTooLong: id as IfTooLong })} />
            {label}
          </label>
        ))}
        <p className="text-[11px] text-slate-400 mt-0.5">
          One long word with no space in it is always shrunk — we never hyphenate a place name.
        </p>
      </div>

      {/* ⛔ "Copy this style to all text" WAS HERE AND IS GONE (9 October 2026). It was a one-way bulk
        * write: it stamped one style onto every box, so the next change meant doing it again and nothing
        * recorded that the boxes were ever meant to match. "All text" replaces it with a relationship —
        * and "Use this style for all text" at the foot of an own-style box's panel is the same direction
        * of travel done properly. */}
      {/* ⛔ "Remove this text box" WAS HERE — a red text link at the bottom of MORE OPTIONS, which is a
        * FOLDED section. So the only way to delete a box an operator had just added was to open a
        * section called "more options" and find a link in it. §6 gives it a button of its own at the
        * foot of the panel, where it is visible without opening anything. */}
    </>
  )
}
