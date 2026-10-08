// lib/weekly-post/layout.ts — the shape of a saved design, and the only thing that decides a design
// is valid.
//
// ── 🔴 WHY THIS IS VALIDATED SERVER-SIDE AND NOT TRUSTED ────────────────────────────────────────────
// The layout is a `jsonb` column written from the browser and then read by a RENDERER that positions
// text from it. An unchecked number reaches satori as `left: NaN` (silently nothing drawn), a negative
// font size throws inside the layout engine, and a 10,000px box turns a 40ms render into a timeout.
// None of those show up as "invalid design" — they show up as a blank or failed post, later, with no
// clue why. So every field is parsed, bounded and defaulted here, and `validateLayout` is the only way
// a layout enters the system.
//
// 🔴 COORDINATES ARE IN THE BLANK IMAGE'S OWN PIXELS, always. The editor shows the blank scaled down
// and converts on the way in and out; the renderer draws at native size. One coordinate space means a
// design made on a phone renders identically to one made on a desktop — the scale factor never
// reaches storage, so it can never be stored wrong.

// ⚠️ `./font-list`, NOT `./fonts`. This module is imported by the EDITOR, which is a client
// component; `./fonts` reads the filesystem and pulling it into the browser bundle fails the build.
import { DEFAULT_FONT_ID } from './font-list'
/* ⚠️ `./font-refs` IS PURE AND BROWSER-SAFE, like `./font-list` and `./locale` and for the same
 * reason: this module is imported by the editor, so anything it pulls in has to be too. */
import { parseFontId } from './font-refs'
import { DEFAULT_HEADING } from './format'
import type { TimeStyle } from './format'
// ⚠️ `./locale` IS PURE AND BROWSER-SAFE, like `./font-list` and for the same reason: this module is
// imported by the editor, so anything it pulls in has to be too.
import {
  DATE_STYLE_IDS, LEGACY_DATE_STYLE, PLACE_STYLE_IDS,
  type DateStyleId, type PlaceStyleId,
} from './locale'
/* ⚠️ `./place-pictures` IS PURE AND BROWSER-SAFE, like `./font-refs` and `./locale` and for the same
 * reason: this module is imported by the editor, so anything it pulls in has to be too. */
import type { NoPictureBehaviour } from './place-pictures'
/* ══ 🔴 "THE 7 DAYS" (10 October 2026) ════════════════════════════════════════════════════════════
 * ⚠️ `./days` IS PURE AND BROWSER-SAFE, like `./font-list`, `./locale` and `./place-pictures`, and for
 * the same reason: this module is imported by the editor, so anything it pulls in has to be too.
 * ⛔ THE LAYOUT MATHS IS NOT IN THIS FILE. `days.ts` is the ONE place that decides where a part of a
 * row goes, because the renderer and the editor both ask it — see its header. */
import {
  DAYS_IN_WEEK, DAY_PART_KEYS, MAX_WEIGHT, MIN_WEIGHT, daysFromLegacy, normaliseParts,
  type DayPart, type DayPartKey, type DaysArrangement, type DaysBlock, type DaysOffMode,
  type PictureShape,
} from './days'
export { daysFromLegacy }
export type { DaysBlock, DayPart, DayPartKey, DaysArrangement, DaysOffMode, PictureShape }

export const LAYOUT_VERSION = 1 as const

/**
 * "Darken the picture", at most.
 *
 * ⛔ IT WAS 60 UNTIL 10 OCTOBER 2026 — the 6 October brief's number — and §B3 of the 10 October brief
 * asks the slider for 0–70. The validator has to accept what the slider offers or the editor would
 * offer a value the save refuses. 🔴 THE REASON FOR A CEILING AT ALL IS UNCHANGED: a 100% dark layer
 * hides the truck's artwork completely and leaves text on a black rectangle — at which point they have
 * not uploaded a design, they have uploaded a wallpaper. ⚠️ NO EXISTING DESIGN IS AFFECTED: every
 * stored value is ≤ 60, so raising the ceiling can only ever allow something new.
 */
export const MAX_DARKEN = 70

/** The largest side the renderer will produce. Anything bigger is scaled on upload. */
export const MAX_RENDER_SIDE = 2160
/** Uploads below this on the short side are refused: text on a 300px-wide blank cannot be read. */
export const MIN_UPLOAD_SHORT_SIDE = 600
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type Align = 'left' | 'center' | 'right'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE NEW DRAWING OPTIONS (6 October 2026) — AND WHY EVERY ONE OF THEM IS OPTIONAL ON INPUT
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE RULE THIS WHOLE SECTION OBEYS: **a design saved before today must render byte-for-byte as it
// does now, until the truck changes something.** So every field below has a default that is a no-op,
// the validator fills it when the stored JSON does not carry it, and `LAYOUT_VERSION` does NOT change
// — bumping it would make the validator refuse every saved design, which is the opposite of
// compatible.
//
// ⚠️ TWO DELIBERATE EXCEPTIONS, both asked for in the brief and both recorded in
// docs/design-editor-report.md: `timeDisplay` is gone (a design set to "From 5pm" now renders the
// range) and raised ordinals are always on (a design with them off now draws a raised suffix).

/** How hard the shadow is. ⚠️ Presets, not a number, because "a soft shadow" is the thing an operator
 *  wants and 0–100 is a thing they have to experiment with. The number lives in Advanced. */
export type ShadowPreset = 'none' | 'soft' | 'strong'

/** What happens to a name too long for its box. `shrink` is what the renderer has always done. */
export type IfTooLong = 'shrink' | 'twoLines'

/**
 * ══ 🔴 "MAKE THE WORDS EASIER TO READ ON A BUSY PICTURE" ══════════════════════════════════════════
 *
 * Five things that all do one job, which is why they are one object and one popover rather than five
 * scattered toggles: a shadow, an outline, a band behind the words, and the automatic rule that adds a
 * shadow only when the picture needs it.
 *
 * ⛔ `band` REPLACES "Background behind the date". That setting was a `bgTrading` colour on the DATE
 * box alone — so a truck who wanted a label strip behind the TIME could not have one. The band is on
 * every item, and `validateLayout` maps an old `bgTrading` into it **at the same look** (fully opaque,
 * square corners, no padding), which is exactly what the old panel drew.
 */
export interface Effects {
  shadow: ShadowPreset
  /** 0–100, Advanced only. 50 = the preset's own strength; the preset sets this when it is chosen. */
  shadowStrength: number
  outline: boolean
  outlineColour: string
  /** 1–10, Advanced only. "Outline thickness". */
  outlineWidth: number
  band: boolean
  bandColour: string
  /** 0–100. Advanced shows it as "Band see-through", which is 100 − this. */
  bandOpacity: number
  /** Native pixels. "Band corners". */
  bandRadius: number
  /** Native pixels of band outside the box on every side. "Band space around". */
  bandPadding: number
  /**
   * "Keep it readable automatically" — on by default.
   *
   * 🔴 PER ITEM NOW, WHERE IT USED TO BE PER DESIGN. The rule is about one colour on one patch of
   * picture, so a truck with white text on a dark sky and dark text on a light band wants it on for
   * one and off for the other. ⚠️ ITS DEFAULT IS THE DESIGN'S OLD `keepReadable` FLAG, passed into
   * `parseBox`, so an old design keeps its single answer for all of its boxes.
   */
  keepReadable: boolean
}

/** 🔴 THE NO-OP DEFAULTS. Everything here draws exactly nothing. */
export function defaultEffects(keepReadable = true): Effects {
  return {
    shadow: 'none',
    shadowStrength: 50,
    outline: false,
    outlineColour: '#000000',
    outlineWidth: 3,
    band: false,
    bandColour: '#000000',
    bandOpacity: 100,
    bandRadius: 0,
    bandPadding: 0,
    keepReadable,
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PLACE PICTURE (part 3) — A PICTURE FROM THE PLACE'S OWN LIBRARY, ON THE POSTER
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// A place now simply HAS PICTURES (lib/weekly-post/place-pictures.ts). This box is how a DESIGN uses
// one: a pub's logo in the corner of the weekly post, a venue's photo on a single event post, or that
// venue's own poster as the whole background.
//
// ⛔ IT IS **OFF** FOR EVERY DESIGN THAT HAS NOT ASKED FOR IT, INCLUDING EVERY ONE SAVED BEFORE TODAY.
// `enabled: false` is the validator's default when the field is absent, so a stored design renders
// byte-for-byte as it did. That is the same rule every field added in parts 1 and 2 follows.

/**
 * Where the place's picture goes.
 *
 * ⚠️ THE WEEKLY POST ONLY OFFERS `box`, AND THE TYPE DOES NOT SAY SO — the editor does. "Whole
 * background" means *this event's* background, which is a single-event idea: a weekly poster is seven
 * events on one picture, so there is no "the place" whose picture could replace it. A stored
 * `'background'` on a weekly layout is read as `'box'` by the validator rather than refused, because
 * the worst case is a design that draws its picture in the box it already has coordinates for.
 */
export type PlacePicturePlacement = 'box' | 'background'

/** Fill the box (cropped) or fit inside it (letterboxed). */
export type PlacePictureFit = 'fill' | 'fit'

export type PlacePictureCorners = 'square' | 'rounded'

export interface PlacePictureBox extends BoxRect {
  enabled: boolean
  placement: PlacePicturePlacement
  fit: PlacePictureFit
  corners: PlacePictureCorners
  /** Native pixels, used when `corners` is `rounded`. */
  radius: number
  /** What to draw where the place has no picture at all. */
  ifMissing: NoPictureBehaviour
  /** null = no border. */
  borderColour: string | null
  /** Native pixels. Only drawn when `borderColour` is set. */
  borderWidth: number
}

/**
 * A first place-picture box.
 *
 * ⚠️ PROPORTIONAL TO THE PICTURE, SQUARE, AND **OFF**. Square because a logo is usually square and
 * "fit inside" will letterbox anything else honestly; off because a box that appeared on an existing
 * design the moment this shipped would change a poster nobody asked to change.
 * 🔴 THE WEEKLY ONE IS SIZED AND PLACED LIKE A ROW, because it repeats per row exactly as the text
 * does — so it has to start somewhere a row actually is, or the operator's first drag is a rescue.
 */
export function defaultPlacePictureBox(
  width: number, height: number, row?: { x: number; y: number; h: number },
): PlacePictureBox {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const side = row ? Math.max(16, row.h) : Math.max(24, Math.round(Math.min(w, h) * 0.18))
  return {
    enabled: false,
    /* ⚠️ `box` IS THE DEFAULT ON BOTH DESIGNS. "Whole background" replaces the truck's own artwork for
     * that event, which is a bigger thing to do by accident than drawing a small picture. */
    placement: 'box',
    fit: 'fill',
    corners: 'square',
    radius: Math.max(2, Math.round(side * 0.12)),
    ifMissing: 'omit',
    borderColour: null,
    borderWidth: Math.max(1, Math.round(side * 0.03)),
    x: row ? Math.max(0, row.x - side - Math.round(w * 0.015)) : Math.round(w * 0.06),
    y: row ? row.y : Math.round(h * 0.06),
    w: Math.min(side, w),
    h: Math.min(side, h),
  }
}

/**
 * The no-op values for every field added on 6 October 2026, as one spreadable object.
 *
 * 🔴 ONE OBJECT, SPREAD INTO BOTH DEFAULT LAYOUTS AND BOTH NOTE BOXES. Writing these seven fields out
 * four times is four places for one of them to be forgotten — and a forgotten field is `undefined`
 * reaching the renderer, which is how `letterSpacing: NaN` would collapse a line to nothing.
 * ⚠️ `effects` IS A FRESH OBJECT PER CALL, via the getter below, because a shared one would be the
 * SAME object on every box in a design and editing one box's shadow would change all of them.
 */
export const DEFAULT_EXTRAS = {
  italic: false,
  letterSpacing: 0,
  lineSpacing: 100,
  tilt: 0,
  ifTooLong: 'shrink' as IfTooLong,
  wordsBefore: '',
  /* 🔴 EVERY DEFAULT BOX FOLLOWS "All text" (9 October 2026). ⚠️ IT IS SET HERE, in the one object all
   * four default-box builders spread, rather than four times — a fifth builder added later gets it
   * without anybody remembering to. ⛔ `false` IS SAFE **ONLY** FOR A DEFAULT BOX, where the shared look
   * and the box's own fields are the same values; a STORED box goes through `adoptSharedLook`, which
   * decides the flag by comparison. */
  ownStyle: false,
  get effects(): Effects { return defaultEffects() },
}


export interface BoxRect {
  /** Native-pixel offsets from the blank's top-left. */
  x: number
  y: number
  w: number
  h: number
}

export interface TextStyle {
  fontId: string
  /** Native pixels. The renderer shrinks DOWN from this to fit; it never grows past it. */
  fontSize: number
  bold: boolean
  /** '#rrggbb'. */
  color: string
  align: Align
  caps: boolean

  /* ══ 🔴 THE ADVANCED LETTERS AND POSITION FIELDS ══════════════════════════════════════════════
   * ⚠️ ALL FOUR ARE NO-OPS AT THEIR DEFAULTS, which is what keeps an old design identical. */

  /**
   * ⛔ A SHEARED FAUX ITALIC, NOT A REAL ONE, AND THE REPORT SAYS SO. The 21 bundled families ship
   * `-400.ttf` and `-700.ttf` only — there is no italic file, and `fontsForDesign` passes
   * `style: 'normal'` for every one of them. Telling satori `fontStyle: 'italic'` with no italic face
   * loaded draws the upright face and the setting would do nothing at all. So the renderer skews the
   * line by 12°, which is what a word processor does when a family has no italic, and it is honest
   * about being that rather than silently inert.
   */
  italic: boolean
  /** Native pixels added between letters. 0 = the font's own spacing. */
  letterSpacing: number
  /** Percent of the font's natural line height. 100 = today's spacing. */
  lineSpacing: number
  /** Degrees, −15…15. 0 = upright. */
  tilt: number
  /** What to do with a name that will not fit. `shrink` is what the renderer has always done. */
  ifTooLong: IfTooLong
  /**
   * Words drawn in front of whatever this item says — "Find us", "Open".
   * ⚠️ IT IS PART OF THE TEXT, NOT A SECOND BOX, so it shrinks to fit with the rest and cannot end up
   * in a different size from the name it introduces. '' = nothing.
   */
  wordsBefore: string
  effects: Effects
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 "ALL TEXT" — ONE SHARED LOOK, AND **ONE** FUNCTION THAT RESOLVES IT (9 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE PROBLEM IT SOLVES: a weekly design has eleven text boxes and a truck wants one font. Setting
// it meant selecting eleven boxes and changing eleven fonts, and "Copy this style to all text" — the
// button this replaces — was a ONE-WAY BULK WRITE: it stamped eleven copies of one style, so the next
// change meant eleven more presses, and nothing recorded that they were meant to match.
//
// 🔴 SO THE LOOK IS HELD **ONCE**, ON THE LAYOUT, AND A BOX EITHER FOLLOWS IT OR OWNS ITS OWN.
// `ownStyle: false` (the default) means "draw me with the layout's look". That is a relationship rather
// than a copy, so changing the shared font changes every following box for ever, not once.
//
// ⚠️ THE SPLIT IS "LOOK" vs "WHAT AND WHERE", and it is not arbitrary:
//   • SHARED — font, size-independent letter form (bold, italic, capitals), colour, letter spacing and
//     every `effects` field. These are the things a poster wants ONE answer to.
//   • PER BOX — what it says (date style, words before), how big it is, where it is, how it lines up,
//     its tilt, and what happens when it will not fit. ⛔ THESE CANNOT BE SHARED EVEN IN PRINCIPLE: a
//     heading and a time are different sizes in the same design, and `align` is about which edge of
//     **this** box the words sit against.
//
// ⚠️ `lineSpacing` IS PER BOX AND THE BRIEF DOES NOT NAME IT EITHER WAY. It is in the same Advanced
// group as letter spacing, which IS shared — but it multiplies the drawn height of a box's text, so it
// belongs with size and position rather than with colour. Sharing it would silently change the height
// of every multi-line box when a truck adjusted one. **Said out loud because it is a judgement call.**
//
// 🔴 ONE RESOLVER, USED BY THE RENDERER **AND** THE EDITOR — `resolveTextBox`. The brief requires it:
// two functions answering "what does this box look like" is how a preview comes to disagree with the
// PNG, and this project has already shipped that class of bug twice (two background colours on one
// editor and one on the other; a colour control that drew an empty well in Safari, written twice).

/** The look-only half of a `TextStyle` — the half "All text" owns. */
export type TextLook = Pick<
  TextStyle, 'fontId' | 'bold' | 'color' | 'caps' | 'italic' | 'letterSpacing' | 'effects'
>

/**
 * ⛔ THE KEY LIST IS THE SINGLE SOURCE OF THE SPLIT, and it is `satisfies`-checked against `TextLook`
 * so a field added to one and not the other cannot compile. A hand-written second list is how
 * "shared" and "resolved" drift apart.
 */
export const LOOK_KEYS = [
  'fontId', 'bold', 'color', 'caps', 'italic', 'letterSpacing', 'effects',
] as const satisfies readonly (keyof TextLook)[]

/** The shared look a brand-new design starts with. ⚠️ Exactly `defaultLayout`'s old Date style. */
export function defaultTextLook(colour = '#ffffff', keepReadable = true): TextLook {
  return {
    fontId: DEFAULT_FONT_ID,
    bold: false,
    color: colour,
    caps: false,
    italic: false,
    letterSpacing: 0,
    effects: defaultEffects(keepReadable),
  }
}

/** The look fields OF a box, as a `TextLook`. ⚠️ Used when a box becomes the shared style. */
export function lookOf(b: TextStyle): TextLook {
  return {
    fontId: b.fontId, bold: b.bold, color: b.color, caps: b.caps,
    italic: b.italic, letterSpacing: b.letterSpacing,
    /* ⛔ COPIED, NOT ALIASED. `effects` is an object; handing the same reference to the layout and to
     * the box would make "change just this box" change the shared style too. */
    effects: { ...b.effects },
  }
}

/**
 * 🔴 **THE ONE FUNCTION.** What this box actually looks like, shared style applied.
 *
 * ⚠️ IT RETURNS THE SAME BOX OBJECT WHEN THE BOX OWNS ITS STYLE, so the common "own" path allocates
 * nothing and a caller cannot tell the two apart by identity in a way that matters.
 * ⛔ IT TAKES THE LOOK, NOT THE LAYOUT, so it is callable from the weekly layout, the event layout and
 * a test fixture without a third overload.
 */
export function resolveTextBox<T extends TextBox>(look: TextLook | null | undefined, b: T): T {
  /* ⛔ A MISSING SHARED LOOK MEANS "THE BOX'S OWN FIELDS", NOT A CRASH. Some callers hand this a RAW
   * stored layout that has never been through `readStoredLayout` — `idsOfLayout` in the route does, to
   * count the fonts a saved design names without validating it — and a layout saved before today has
   * no `textStyle` at all. ⚠️ Returning the box is also the CORRECT answer for one: before "All text"
   * existed, every box's own fields were exactly what was drawn. */
  if (!look || b.ownStyle) return b
  return { ...b, ...look, effects: { ...look.effects } }
}

/**
 * Does this box's look already equal the shared one? ⚠️ THE MIGRATION-ON-READ TEST.
 *
 * ⛔ COMPARED FIELD BY FIELD THROUGH `LOOK_KEYS`, not with `JSON.stringify`: key order in stored
 * `jsonb` is whatever Postgres chose, so a string compare would call two identical looks different and
 * mark every box OWN — which is the one outcome that would make "All text" useless on every existing
 * design.
 */
export function looksMatch(a: TextStyle, b: TextLook): boolean {
  for (const k of LOOK_KEYS) {
    if (k === 'effects') {
      const ae = a.effects, be = b.effects
      for (const ek of Object.keys(be) as (keyof Effects)[]) {
        if (ae[ek] !== be[ek]) return false
      }
      continue
    }
    if (a[k] !== b[k]) return false
  }
  return true
}

export interface TextBox extends BoxRect, TextStyle {
  /**
   * ══ 🔴 THIS BOX HAS ITS OWN LOOK, RATHER THAN FOLLOWING "All text" ════════════════════════════
   *
   * ⚠️ `false` IS THE DEFAULT AND MEANS "FOLLOW". The look fields on this box are still populated and
   * still stored — they are what a rollback to an older build would draw, and what "Change just this
   * box" starts from — but the renderer ignores them while this is false.
   * ⛔ THE FLAG IS NOT DERIVED AT RENDER TIME. A box whose font happens to equal the shared font is
   * FOLLOWING; a box deliberately set to the same font and then meant to stay put when the shared one
   * changes is OWN. Those are different intentions and only a stored flag can tell them apart.
   */
  ownStyle: boolean
  /**
   * Drawn, or not drawn at all.
   *
   * 🔴 IT MOVED FROM THE EVENT LAYOUT'S BOXES ONTO **EVERY** BOX (6 October 2026). The note it used to
   * carry said the weekly post had "no meaningful 'turn the date off'" — which was true of the old
   * screen and is not true of the new one: the brief gives every item in the left-hand list an on/off
   * switch, on all three design screens, and a truck whose artwork already prints "MONDAY" down the
   * side needs the weekly Date box gone, not dragged off the edge.
   * ⚠️ IT DEFAULTS TO `true` IN THE VALIDATOR, so every design saved before today reads as "everything
   * on" — which is what they were.
   * 🔴 `enabled` IS AN EXPLICIT FLAG, NOT A ZERO-SIZE BOX. A box collapsed to 0×0 would be
   * indistinguishable from a drag gone wrong, would fail the validator's own 8px floor, and would lose
   * the operator's position — so switching it back on would start from nothing. The coordinates stay
   * exactly where they were; only the drawing stops.
   */
  enabled: boolean
  /**
   * The averaged colour of the blank under this box, written by the editor's canvas sampler.
   *
   * 🔴 IT IS STORED RATHER THAN COMPUTED AT RENDER TIME because sampling needs to decode a PNG **or
   * a JPG** and nothing on the server can: no sharp, no canvas, no jpeg library, and satori takes an
   * image in without exposing pixels. The browser has a decoder for both, so the editor samples when
   * a box is placed or moved and stores the answer. lib/weekly-post/contrast.ts explains the split.
   * ⚠️ NULL IS A REAL STATE and means "not sampled" — the renderer then adds no shadow at all rather
   * than guessing a background and altering someone's artwork on no evidence.
   */
  bgSample: { r: number; g: number; b: number } | null
}

export interface DateBox extends TextBox {
  /**
   * The weekday on its own line.
   *
   * ⚠️ RENAMED IN THE UI ONLY — it is "Day on its own line" in Advanced › WORDING now, because "Two
   * lines" was read as "wrap this box", which is what `ifTooLong` does. The FIELD keeps its name so
   * every saved design keeps its setting.
   */
  twoLines: boolean
  /**
   * The band colour on a day with no trading — and on a cancelled single event.
   *
   * ⛔ ITS SIBLING `bgTrading` IS GONE, mapped into `effects.band` by the validator. This one survives
   * because it is not a style, it is the CANCELLED / DAY-OFF LOOK: a second colour the renderer picks
   * on the truck's behalf for a row the operator never sees while designing. It stays a post-type
   * add-on (§7) rather than part of the shared Effects popover.
   */
  bgDayOff: string | null
}

export interface HeadingBox extends TextBox {
  /** Supports {start} and {end}. */
  text: string
}

/**
 * ══ 🔴 "YOUR OWN TEXT" — WHAT THE NOTE BOX BECAME (6 October 2026) ════════════════════════════════
 *
 * It used to be a text box with no fields of its own, drawn only when the operator typed a note on the
 * make screen. The brief renames it "Your own text" and gives it a text field in the toolbar — so it
 * now carries words of its own, and there can be more than one.
 *
 * 🔴 AND `{note}` IS WHAT KEEPS EVERY EXISTING DESIGN IDENTICAL. The box's text supports one token,
 * `{note}`, which the renderer replaces with whatever was typed when the post was made. A design saved
 * before today has a note box with no text at all, so the validator migrates it to exactly `'{note}'`
 * — which renders the typed note and nothing when there is none, which is what it has always done.
 * ⚠️ A BOX WHOSE TEXT COMES OUT EMPTY IS NOT DRAWN AT ALL, band included. That rule is older than this
 * change (an empty bordered area on finished artwork looks like a mistake) and it is what makes the
 * token work: `'{note}'` with no note is an empty string, so the box disappears.
 * ⛔ IT IS NOT A SECOND TEMPLATE LANGUAGE. `{start}`/`{end}` belong to the heading and are not
 * understood here, and `{note}` is not understood there — two tokens in two places, each named where
 * it works, rather than a shared mini-language nobody documents.
 */
export interface NoteBox extends TextBox {
  text: string
}

/** The one token a "Your own text" box understands. */
export const NOTE_TOKEN = '{note}'

/**
 * How many "Your own text" boxes one design may have.
 *
 * ⚠️ A CEILING, NOT A STYLE JUDGEMENT. Each box is fitted and drawn independently, so the render cost
 * is linear in this number — and an unbounded array in a `jsonb` column written from a browser is a
 * way to make one request take a minute.
 */
export const MAX_NOTE_BOXES = 4

export interface Layout {
  version: typeof LAYOUT_VERSION
  /** The blank's native size, stored so a reopened design does not depend on re-reading the image. */
  width: number
  height: number
  heading: HeadingBox
  /** Row 1's three boxes. Rows 2–7 are these, offset by `rowSpacing` × n. */
  date: DateBox
  location: TextBox
  time: TextBox
  /**
   * The "Your own text" boxes, in the order they were added. `[]` = none.
   * ⚠️ AN ARRAY AND NOT `note: NoteBox | null` ANY MORE — the validator migrates the old single field
   * into `notes[0]`, so a saved design loses nothing and gains the token.
   */
  notes: NoteBox[]
  /**
   * The place's picture, in each row. ⚠️ ALWAYS PRESENT, `enabled: false` unless the truck asked —
   * see `defaultPlacePictureBox`. Its placement is always `box` on a weekly design.
   */
  placePicture: PlacePictureBox
  /**
   * ══ 🔴 "THE 7 DAYS" — ONE BOX, SEVEN ROWS (10 October 2026) ══════════════════════════════════
   *
   * ⛔ **OPTIONAL, AND THAT IS THE WHOLE COMPATIBILITY STORY.** Absent means the design is on the OLD
   * row model — three boxes plus `rowSpacing` — and the renderer draws it exactly as it always has.
   * Present means the seven days are one block and `date`/`location`/`time` are STYLE ONLY.
   * 🔴 THE EDITOR CONVERTS ON OPEN (`daysFromLegacy`) AND THE SAVE STORES THE BLOCK, which is the
   * brief's own rule: a design nobody has opened renders byte-for-byte as today, and one its owner has
   * opened and saved renders from the new model.
   * ⚠️ `date`, `location`, `time`, `rowSpacing` AND `placePicture` ARE STILL STORED AND STILL
   * VALIDATED on a converted design. Two reasons, and the second is the real one: their font, colour,
   * capitals, date wording and effects ARE the parts' styles — and an older build (a rollback) ignores
   * `days` entirely and draws the legacy rows, which are still there and still correct.
   */
  days?: DaysBlock
  /** Vertical distance between one row's top and the next's, in native pixels. */
  rowSpacing: number
  /** What Location shows on a day with no event. */
  daysOffText: string
  timeStyle: TimeStyle
  /**
   * The design-wide readability answer.
   *
   * ⚠️ IT IS NOW THE **DEFAULT** FOR EACH BOX'S `effects.keepReadable` RATHER THAN THE SETTING ITSELF.
   * The renderer reads the per-box flag; this field is kept and still written so that a design saved
   * today and reopened by an older build (a rollback) still carries its one answer.
   */
  keepReadable: boolean
  /** Show cancelled events (crossed out, "CANCELLED"). */
  showCancelled: boolean
  /** The filled example shown faintly under the editor, 0–1. 0 = off. */
  exampleOpacity: number

  /* ══ 🔴 THE THREE DESIGN-WIDE ADDITIONS (6 October 2026) ══════════════════════════════════════ */

  /**
   * "Darken the picture", 0–60%.
   *
   * 🔴 DESIGN-WIDE AND UNDER ALL THE TEXT, not per item, because it is the one readability tool that
   * is about the PICTURE rather than about a word: a busy photograph where every box needs help wants
   * one dark layer, not five bands. 0 draws nothing at all.
   */
  darken: number
  /**
   * How the date is worded. ⚠️ DESIGN-WIDE, like `timeStyle` already was — there is one date item, so
   * a per-box field would be a field with one possible owner. `lib/weekly-post/locale.ts` decides what
   * each id looks like in the truck's country.
   */
  dateStyle: DateStyleId
  /** How the place is worded. `nameTownBelow` is what the renderer has always drawn. */
  placeStyle: PlaceStyleId

  /**
   * ══ 🔴 "All text" — THE SHARED LOOK EVERY BOX FOLLOWS UNLESS IT OWNS ITS OWN ══════════════════
   * See `TextLook` above for the split and for why it is a relationship rather than a bulk copy.
   * ⚠️ ON READ IT IS TAKEN FROM THE FIRST ENABLED TEXT BOX of an old design, so nothing moves.
   */
  textStyle: TextLook
}

export const DEFAULT_DAYS_OFF_TEXT = 'No trading today'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFAULT DESIGN
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A first layout for a freshly uploaded blank.
 *
 * 🔴 PROPORTIONAL TO THE IMAGE, not fixed pixels, because blanks range from 1080×1080 to 1080×1920 to
 * whatever Canva exported. The numbers below put the heading across the top and row 1 in the upper
 * third with seven rows fitting inside the frame — a starting point the operator drags, not a guess
 * at their artwork.
 * ⚠️ `rowSpacing` IS DERIVED FROM THE HEIGHT so seven rows always fit on first open. A fixed 120px
 * would run off the bottom of a square blank and the operator's first impression would be a broken
 * preview.
 */
export function defaultLayout(width: number, height: number): Layout {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const pad = Math.round(w * 0.06)
  const headingH = Math.round(h * 0.08)
  const top = Math.round(h * 0.2)
  const bottom = Math.round(h * 0.93)
  const spacing = Math.max(24, Math.floor((bottom - top) / 7))
  const rowH = Math.max(18, Math.round(spacing * 0.78))
  const inner = w - pad * 2
  const dateW = Math.round(inner * 0.3)
  const timeW = Math.round(inner * 0.26)
  const locW = inner - dateW - timeW - Math.round(w * 0.03)

  const base = {
    fontId: DEFAULT_FONT_ID,
    bold: false,
    color: '#ffffff',
    caps: true,
    // ⚠️ UNSAMPLED UNTIL THE EDITOR SAMPLES IT. A default design has never been shown a blank's
    // pixels, so claiming a background here would be inventing one.
    bgSample: null as { r: number; g: number; b: number } | null,
    enabled: true,
    ...DEFAULT_EXTRAS,
  }
  return {
    version: LAYOUT_VERSION,
    width: w,
    height: h,
    heading: {
      ...base, x: pad, y: Math.round(h * 0.07), w: inner, h: headingH,
      fontSize: Math.round(headingH * 0.5), align: 'center', caps: true,
      text: DEFAULT_HEADING,
    },
    date: {
      ...base, x: pad, y: top, w: dateW, h: rowH,
      fontSize: Math.round(rowH * 0.34), align: 'left',
      twoLines: true, bgDayOff: null,
    },
    location: {
      ...base, x: pad + dateW + Math.round(w * 0.015), y: top, w: locW, h: rowH,
      fontSize: Math.round(rowH * 0.4), align: 'left', caps: false,
    },
    time: {
      ...base, x: w - pad - timeW, y: top, w: timeW, h: rowH,
      fontSize: Math.round(rowH * 0.4), align: 'right',
    },
    notes: [],
    /* ⚠️ SIZED AND PLACED LIKE A ROW, because it repeats per row exactly as the three text boxes do. */
    placePicture: defaultPlacePictureBox(w, h, { x: pad, y: top, h: rowH }),
    rowSpacing: spacing,
    daysOffText: DEFAULT_DAYS_OFF_TEXT,
    timeStyle: '12h',
    keepReadable: true,
    showCancelled: true,
    exampleOpacity: 0,
    darken: 0,
    dateStyle: LEGACY_DATE_STYLE,
    placeStyle: 'nameTownBelow',
    /* 🔴 THE SHARED LOOK IS `base`'s OWN LOOK, which is what makes a new design's boxes genuinely
     * identical to it — so `ownStyle: false` on all of them is true rather than merely harmless. */
    textStyle: { ...defaultTextLook('#ffffff'), caps: true },
  }
}

/**
 * A "Your own text" box, when the operator adds one. Placed under row 7 so it does not land on a day.
 *
 * ⚠️ THE SECOND AND LATER ONES ARE STEPPED DOWN. Two boxes at identical coordinates look like one box
 * and the operator would drag the top one thinking they had the new one — so each is offset by its own
 * height below the last, clamped inside the picture.
 */
export function defaultNoteBox(l: Layout): NoteBox {
  const lastRowBottom = l.date.y + l.rowSpacing * 6 + l.date.h
  const pad = l.heading.x
  const h = Math.max(24, Math.round(l.date.h * 0.7))
  return {
    ...DEFAULT_EXTRAS,
    enabled: true,
    bgSample: null,
    fontId: l.location.fontId,
    fontSize: Math.max(10, Math.round(l.location.fontSize * 0.85)),
    bold: false,
    color: l.location.color,
    align: 'center',
    caps: false,
    text: NOTE_TOKEN,
    x: pad,
    y: stackedY(l.notes, Math.min(l.height - 40, lastRowBottom + Math.round(l.rowSpacing * 0.2)), h, l.height),
    w: l.width - pad * 2,
    h,
  }
}

/** Where the next stacked box goes: below the last one, never off the bottom. */
function stackedY(existing: readonly NoteBox[], firstY: number, h: number, H: number): number {
  if (!existing.length) return Math.max(0, Math.min(H - h, firstY))
  const lowest = existing.reduce((m, b) => Math.max(m, b.y + b.h), 0)
  return Math.max(0, Math.min(H - h, lowest + Math.round(h * 0.25)))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface ValidationResult {
  ok: boolean
  /** Present when ok. Fully normalised — every field bounded, no NaN, no missing key. */
  layout?: Layout
  /** Plain sentences, safe to show an operator. */
  errors: string[]
}

const HEX = /^#[0-9a-fA-F]{6}$/

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * A finite number within bounds, or null.
 *
 * 🔴 `Number.isFinite`, NOT `typeof === 'number'`. `NaN` and `Infinity` are both numbers and both
 * reach satori as a silently undrawn element — the single most likely way a bad layout produces a
 * blank poster rather than an error.
 * ⚠️ STRINGS ARE REJECTED, not coerced. `"120"` from a hand-edited payload should fail loudly rather
 * than work by accident and then stop working when something compares it to a number.
 */
function num(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  const r = Math.round(v)
  return r >= min && r <= max ? r : null
}

function str(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
  return s.length <= maxLen ? s : null
}

const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt)

const align = (v: unknown): Align => (v === 'left' || v === 'center' || v === 'right' ? v : 'left')

const colour = (v: unknown, dflt: string): string => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : dflt)

const optColour = (v: unknown): string | null =>
  v === null || v === undefined ? null : (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null)

/**
 * Parse the Effects object.
 *
 * 🔴 EVERY FIELD DEFAULTS TO A NO-OP, so a box whose stored JSON has no `effects` at all comes back
 * with an object that draws nothing — which is what every design saved before today needs.
 *
 * ⛔ AND THE OLD `bgTrading` IS MAPPED IN HERE, AT THE SAME LOOK. The date box used to carry a panel
 * colour; the band replaces it. Fully opaque, square corners, no padding is EXACTLY what the old panel
 * drew (`boxEl` filled the box rect with `backgroundColor`), so a design that had one renders
 * identically. ⚠️ THE MAPPING IS SKIPPED WHEN `effects` IS PRESENT: once a design has been saved by
 * the new editor its band is its own, and re-reading a legacy field would overwrite a truck's choice
 * to switch the band off.
 *
 * @param legacyBand the box's stored `bgTrading`, if it had one.
 * @param keepReadableDflt the design-wide `keepReadable`, which is what an old design meant for every
 *   one of its boxes.
 */
function parseEffects(
  v: unknown,
  legacyBand: unknown,
  keepReadableDflt: boolean,
  fontSize: number,
  H: number,
): Effects {
  const d = defaultEffects(keepReadableDflt)
  if (!isObj(v)) {
    const mapped = optColour(legacyBand)
    return mapped ? { ...d, band: true, bandColour: mapped } : d
  }
  const shadow: ShadowPreset =
    v.shadow === 'soft' ? 'soft' : v.shadow === 'strong' ? 'strong' : 'none'
  return {
    shadow,
    shadowStrength: num(v.shadowStrength, 0, 100) ?? d.shadowStrength,
    outline: bool(v.outline, false),
    outlineColour: colour(v.outlineColour, d.outlineColour),
    outlineWidth: num(v.outlineWidth, 1, 10) ?? d.outlineWidth,
    band: bool(v.band, false),
    bandColour: colour(v.bandColour, d.bandColour),
    bandOpacity: num(v.bandOpacity, 0, 100) ?? d.bandOpacity,
    /* ⚠️ THE TWO PIXEL FIELDS ARE BOUNDED BY THE IMAGE HEIGHT, not by a round number. A 40px corner
     * radius is a gentle curve on a 2160px poster and a blob on a 600px one, so the only honest
     * ceiling is the picture itself. */
    bandRadius: num(v.bandRadius, 0, H) ?? d.bandRadius,
    bandPadding: num(v.bandPadding, 0, H) ?? d.bandPadding,
    keepReadable: bool(v.keepReadable, keepReadableDflt),
  }
}

/** The four LETTERS/POSITION/LONG NAMES fields plus "Words before", parsed with no-op defaults. */
function parseExtras(v: Record<string, unknown>, fontSize: number): {
  italic: boolean
  letterSpacing: number
  lineSpacing: number
  tilt: number
  ifTooLong: IfTooLong
  wordsBefore: string
} {
  return {
    italic: bool(v.italic, false),
    /* 🔴 BOUNDED BY THE FONT SIZE, NOT BY A PIXEL CONSTANT. Letter spacing is a typographic measure:
     * half the font size of negative spacing already overlaps every glyph, and twice it is the widest
     * tracking any poster uses. A fixed ±200px would be meaningless at both 600px and 2160px. */
    letterSpacing: num(v.letterSpacing, -Math.round(fontSize * 0.5), Math.round(fontSize * 2)) ?? 0,
    lineSpacing: num(v.lineSpacing, 50, 300) ?? 100,
    /* ⚠️ THE BRIEF'S ±15°, ENFORCED HERE. A box rotated 40° leaves its own outline entirely, so the
     * editor's drag handles would no longer be over the text they move. */
    tilt: num(v.tilt, -15, 15) ?? 0,
    ifTooLong: v.ifTooLong === 'twoLines' ? 'twoLines' : 'shrink',
    wordsBefore: str(v.wordsBefore, 40) ?? '',
  }
}


/**
 * The shared look, parsed out of a stored layout.
 *
 * ⚠️ IT REUSES `parseEffects` AND THE SAME FIELD RULES AS `parseBox`, so a look stored on the layout
 * and the identical look stored on a box cannot normalise to two different values — which is exactly
 * what `looksMatch` would then report as "this box is different" on a design nobody had touched.
 * ⛔ WHEN THE KEY IS ABSENT THIS IS NOT THE FINAL ANSWER. It returns the plain default, and
 * `adoptSharedLook` replaces that with the design's own first enabled box — the default here only ever
 * survives on a layout stored with no text boxes at all, which cannot happen.
 * ⚠️ `fontSize` IS READ ONLY TO BOUND `letterSpacing` and the band's pixel fields, exactly as
 * `parseBox` does. The shared look has no size of its own; size is always per box.
 */
function parseTextLook(v: unknown, dfltColour: string, keepReadableDflt: boolean, H: number): TextLook {
  if (!isObj(v)) return defaultTextLook(dfltColour, keepReadableDflt)
  const fontSize = num(v.fontSize, 6, H) ?? Math.max(10, Math.round(H * 0.04))
  return {
    fontId: parseFontId(v.fontId) ? String(v.fontId) : DEFAULT_FONT_ID,
    bold: bool(v.bold, false),
    color: colour(v.color, dfltColour),
    caps: bool(v.caps, false),
    italic: bool(v.italic, false),
    letterSpacing: num(v.letterSpacing, -Math.round(fontSize * 0.5), Math.round(fontSize * 2)) ?? 0,
    /* ⚠️ `undefined` FOR THE LEGACY BAND COLOUR. `bgTrading` was a field on the DATE box and nothing
     * else, so there is no design-wide one to map — the per-box parse does that mapping. */
    effects: parseEffects(v.effects, undefined, keepReadableDflt, fontSize, H),
  }
}

/**
 * Parse one text box.
 *
 * ⚠️ THE BOX MUST BE INSIDE THE IMAGE, and that is checked rather than clamped for position: a box at
 * x = 5000 on a 1080 blank is not a near-miss to be nudged, it is a payload that did not come from the
 * editor. Sizes ARE clamped, because a one-pixel-tall box is a plausible drag.
 */
function parseBox(
  v: unknown,
  path: string,
  W: number,
  H: number,
  errors: string[],
  dfltColour: string,
  /** The design-wide `keepReadable`, which is what an old design meant for each of its boxes. */
  keepReadableDflt = true,
): TextBox | null {
  if (!isObj(v)) { errors.push(`${path} is missing.`); return null }
  const x = num(v.x, 0, W)
  const y = num(v.y, 0, H)
  const w = num(v.w, 8, W)
  const h = num(v.h, 8, H)
  if (x === null || y === null || w === null || h === null) {
    errors.push(`${path} has a position or size that is not a number inside the image.`)
    return null
  }
  if (x + w > W + 1 || y + h > H + 1) {
    errors.push(`${path} reaches outside the image.`)
    return null
  }
  /* ══ 🔴 THE FONT ID IS VALIDATED BY **SHAPE**, NOT BY MEMBERSHIP (6 October 2026, part 2) ════════
   *
   * ⛔ IT USED TO BE `FONT_BY_ID.has(v.fontId)` — the 21 committed families and nothing else. That
   * cannot hold any more: a design may name a LIBRARY family from a 1,819-entry catalogue, or a font
   * the TRUCK UPLOADED, and this function is pure, synchronous and imported by the editor. It has no
   * catalogue (129KB, server-side) and no database (a truck's uploads are rows).
   *
   * 🔴 SO THE CHECK IS SPLIT THREE WAYS, and all three are needed:
   *   • **here** — the SHAPE, so a `jsonb` column can never hold `"../../etc/passwd"` or 4KB of junk,
   *     and so the slug that ends up in a storage object path is lowercase alphanumeric;
   *   • **the server** — EXISTENCE, at the point of choosing (`isChoosableLibraryFont`, or a
   *     `truck_fonts` row), which is also where the licence rule is enforced;
   *   • **the renderer** — a FALLBACK, because a font can legitimately disappear when a truck deletes
   *     an uploaded family a saved design still names.
   * ⚠️ `parseFontId` RETURNS null FOR ANYTHING ELSE and the default is used, so this is still a
   * narrowing: a bundled id, `g:<slug>` or `u:<slug>`, and nothing else reaches storage. */
  const fontId = parseFontId(v.fontId) ? String(v.fontId) : DEFAULT_FONT_ID
  /* ⚠️ THE FONT SIZE CEILING IS THE IMAGE HEIGHT. Bigger than the whole poster is meaningless, and it
   * is the value that most affects render time, because satori lays out every glyph. */
  const fontSize = num(v.fontSize, 6, H) ?? Math.max(10, Math.round(h * 0.5))
  return {
    x, y, w, h,
    fontId,
    fontSize,
    bold: bool(v.bold, false),
    color: colour(v.color, dfltColour),
    align: align(v.align),
    caps: bool(v.caps, false),
    /* ⚠️ DEFAULT `true`: every design saved before `enabled` existed had every box drawn. */
    enabled: bool(v.enabled, true),
    /* ⚠️ DEFAULT `false` — "follows All text". ⛔ A design saved before today carries no flag, and
     * `false` on its own would make every box follow a shared style it has never seen. That is why the
     * flag is NOT the whole migration: `adoptSharedLook` below decides, per box, whether `false` is
     * honest. It runs after this, on the assembled layout, because it needs every box at once. */
    ownStyle: bool(v.ownStyle, false),
    bgSample: parseSample(v.bgSample),
    ...parseExtras(v, fontSize),
    effects: parseEffects(v.effects, v.bgTrading, keepReadableDflt, fontSize, H),
  }
  /* ⛔ `raisedOrdinals` IS NO LONGER PARSED AND NO LONGER STORED (6 October 2026). The brief removes
   * it as a setting and makes it always on, so the renderer passes `true`. **A design saved with it
   * off now draws a raised suffix** — the second of the two deliberate breaks, and it is in the
   * report. Reading the old field and keeping it would have been the compatible choice and is the
   * wrong one: the setting is gone from the editor, so a design that kept `false` could never be
   * changed back. */
}

/**
 * A stored background sample, or null.
 *
 * ⚠️ OUT-OF-RANGE CHANNELS MAKE THE WHOLE SAMPLE NULL rather than being clamped. A clamped bad
 * sample is a confident wrong answer about readability; no sample is an honest "we do not know", and
 * the renderer's behaviour for that is to leave the artwork alone.
 */
function parseSample(v: unknown): { r: number; g: number; b: number } | null {
  if (!isObj(v)) return null
  const r = num(v.r, 0, 255), g = num(v.g, 0, 255), b = num(v.b, 0, 255)
  return r === null || g === null || b === null ? null : { r, g, b }
}

/**
 * The "Your own text" boxes.
 *
 * 🔴 IT MIGRATES THE OLD SINGLE `note` FIELD, AND THAT MIGRATION IS THE WHOLE COMPATIBILITY STORY.
 * A design saved before today has `note: {…}` with no text; it comes back as `notes: [{…, text:
 * '{note}'}]`, which the renderer draws exactly as it drew the old one. A design saved by the new
 * editor has `notes` and the legacy field is ignored.
 *
 * ⚠️ A BOX THAT FAILS TO PARSE IS DROPPED, NOT FATAL. The three real boxes are the design; a stray
 * fifth text box with a bad coordinate should not cost the operator their whole poster — and it is
 * dropped rather than clamped, because a text box in the wrong place is worse than one missing.
 * ⚠️ BOUNDED AT `MAX_NOTE_BOXES` by taking the first few, not by refusing the save: a payload with
 * nine is a payload from a build that allowed nine, and the honest answer is to keep what fits.
 */
function parseNotes(
  input: Record<string, unknown>, W: number, H: number, keepReadableDflt: boolean,
): NoteBox[] {
  const withText = (b: TextBox, raw: unknown): NoteBox => ({
    ...b,
    /* ⚠️ A MISSING `text` BECOMES THE TOKEN, NOT ''. Empty text means the box draws nothing, so a
     * migrated legacy box with '' would silently vanish from a poster it has always been on. */
    text: str(isObj(raw) ? raw.text : undefined, 300) ?? NOTE_TOKEN,
  })
  const raws = Array.isArray(input.notes) ? input.notes
    : (input.note === null || input.note === undefined ? [] : [input.note])
  const out: NoteBox[] = []
  for (const raw of raws.slice(0, MAX_NOTE_BOXES)) {
    /* ⚠️ A THROWAWAY ERROR LIST. These boxes are dropped on failure, so their complaints must not
     * reach the operator's error list and refuse a save for a box that is simply not there. */
    const b = parseBox(raw, 'Your own text', W, H, [], '#ffffff', keepReadableDflt)
    if (b) out.push(withText(b, raw))
  }
  return out
}

/**
 * The place-picture box.
 *
 * 🔴 EVERY FIELD DEFAULTS TO THE **OFF** BOX, so a design saved before part 3 — which has no
 * `placePicture` at all — comes back with `enabled: false` and renders byte-for-byte as it did.
 *
 * ⚠️ THE BOX'S GEOMETRY GOES THROUGH `parseBox`'s OWN RULES, not a second copy of them: inside the
 * picture, finite numbers, a size floor. It is a different SHAPE from a text box (no font, no colour),
 * so the rect is parsed here and checked by the same arithmetic — the alternative was giving a picture
 * box a `fontId` nothing would ever read.
 *
 * ⛔ A BOX THAT FAILS ITS BOUNDS IS SWITCHED OFF, NOT REFUSED. The three text boxes are the design; a
 * picture box with a bad coordinate must not cost the operator their whole poster. Switched off is the
 * state they can see and fix, and it is the state every design already has.
 */
function parsePlacePicture(
  v: unknown, W: number, H: number, fallback: PlacePictureBox, weeklyOnly: boolean,
): PlacePictureBox {
  if (!isObj(v)) return { ...fallback, enabled: false }
  const x = num(v.x, 0, W), y = num(v.y, 0, H)
  const w = num(v.w, 8, W), h = num(v.h, 8, H)
  const inside = x !== null && y !== null && w !== null && h !== null && x + w <= W + 1 && y + h <= H + 1
  const rect = inside ? { x: x!, y: y!, w: w!, h: h! } : { x: fallback.x, y: fallback.y, w: fallback.w, h: fallback.h }
  /* ⚠️ A WEEKLY LAYOUT CANNOT HOLD `background`. "Whole background" means THIS EVENT's background,
   * and a weekly poster is seven events on one picture — so a stored one is read as `box` rather than
   * refused, which leaves the operator a design that draws rather than one that will not save. */
  const placement: PlacePicturePlacement =
    !weeklyOnly && v.placement === 'background' ? 'background' : 'box'
  return {
    ...rect,
    /* ⛔ `false` WHEN ABSENT **AND** WHEN THE RECT WAS REFUSED. */
    enabled: inside ? bool(v.enabled, false) : false,
    placement,
    fit: v.fit === 'fit' ? 'fit' : 'fill',
    corners: v.corners === 'rounded' ? 'rounded' : 'square',
    radius: num(v.radius, 0, H) ?? fallback.radius,
    ifMissing: v.ifMissing === 'blank' ? 'blank' : v.ifMissing === 'logo' ? 'logo' : 'omit',
    borderColour: optColour(v.borderColour),
    /* ⚠️ BOUNDED BY THE BOX, NOT BY A CONSTANT. A 40px border is a hairline on a 600px tile and a
     * solid block on a 60px one, so the only honest ceiling is the box it is drawn inside. */
    borderWidth: num(v.borderWidth, 0, Math.max(1, Math.round(Math.min(rect.w, rect.h) / 2))) ?? fallback.borderWidth,
  }
}

/**
 * ══ 🔴 "THE 7 DAYS" BLOCK, PARSED ════════════════════════════════════════════════════════════════
 *
 * ⚠️ `undefined` WHEN THE KEY IS ABSENT, AND THAT IS NOT AN ERROR — it is every design saved before
 * 10 October 2026, and it means "draw the legacy rows". ⛔ A key that IS present and cannot be read is
 * a REAL error, pushed onto the caller's list: dropping it would store a design whose editor shows one
 * model and whose poster draws the other, which is the one failure here nobody would see until the
 * post went out.
 * 🔴 THE GEOMETRY GOES THROUGH THE SAME RULES AS `parseBox` — finite numbers, inside the image, a size
 * floor — because it is the same kind of fact. ⚠️ THE FLOOR ON `h` IS `DAYS_IN_WEEK × 8`: seven rows
 * that each clear the 8px floor a cell is built to.
 */
function parseDays(
  v: unknown, W: number, H: number, errors: string[],
): DaysBlock | undefined {
  if (v === undefined || v === null) return undefined
  if (!isObj(v)) { errors.push('The 7 days box is missing.'); return undefined }
  const x = num(v.x, 0, W)
  const y = num(v.y, 0, H)
  const w = num(v.w, 8, W)
  const h = num(v.h, DAYS_IN_WEEK * 8, H)
  if (x === null || y === null || w === null || h === null) {
    errors.push('The 7 days box has a position or size that is not a number inside the image.')
    return undefined
  }
  if (x + w > W + 1 || y + h > H + 1) {
    errors.push('The 7 days box reaches outside the image.')
    return undefined
  }
  const arrangement: DaysArrangement =
    v.arrangement === 'dayOnTop' ? 'dayOnTop' : v.arrangement === 'bigPicture' ? 'bigPicture' : 'oneLine'
  const pictureShape: PictureShape =
    v.pictureShape === 'rounded' ? 'rounded' : v.pictureShape === 'circle' ? 'circle' : 'square'
  const daysOff: DaysOffMode = v.daysOff === 'omit' ? 'omit' : 'message'
  /* 🔴 THROUGH `normaliseParts`, WHICH IS THE SAME FUNCTION THE LAYOUT MATHS USES. A stored array
   * with a part twice, a part missing or a key from a later build cannot produce a row that draws one
   * part twice — and the normalising is not repeated here, because two copies of that rule is how the
   * renderer and the validator come to disagree about what a row contains. */
  const parts: DayPart[] = normaliseParts(
    (Array.isArray(v.parts) ? v.parts : []).map(raw => {
      const o = isObj(raw) ? raw : {}
      return {
        key: DAY_PART_KEYS.includes(o.key as DayPartKey) ? (o.key as DayPartKey) : ('' as DayPartKey),
        weight: num(o.weight, MIN_WEIGHT, MAX_WEIGHT) ?? MIN_WEIGHT,
      }
    }),
  )
  return {
    x, y, w, h, arrangement, parts, daysOff, pictureShape,
    /* ⚠️ CAPPED AT ONE ROW'S HEIGHT. A stored `textH` taller than a row would make the band taller
     * than the row it is centred in, which `dayCells` clamps anyway — doing it here as well means the
     * STORED value is the one the editor shows. */
    textH: Math.max(8, Math.min(Math.round(h / DAYS_IN_WEEK), num(v.textH, 8, H) ?? Math.round(h / DAYS_IN_WEEK))),
  }
}

/**
 * The gate. Returns a fully normalised layout or a list of plain errors.
 *
 * ⚠️ IT NEEDS THE IMAGE SIZE and takes it as an argument rather than trusting the payload's own
 * `width`/`height`. The size is a fact about the stored file; letting a client declare it would let a
 * payload claim a 10,000px blank and have every box pass the bounds check.
 */
export function validateLayout(input: unknown, width: number, height: number): ValidationResult {
  const errors: string[] = []
  const W = num(width, 1, 20000)
  const H = num(height, 1, 20000)
  if (W === null || H === null) return { ok: false, errors: ['The design image size is not known.'] }
  if (!isObj(input)) return { ok: false, errors: ['The design is missing.'] }
  if (input.version !== LAYOUT_VERSION) {
    errors.push(`This design was saved by a different version of the editor (expected ${LAYOUT_VERSION}).`)
    return { ok: false, errors }
  }

  /* 🔴 THE DESIGN-WIDE READABILITY FLAG IS READ FIRST, because it is the DEFAULT for each box's own
   * `effects.keepReadable`. An old design carried one answer for the whole poster; reading it here and
   * handing it down is what makes "per item" arrive without changing any existing design's output. */
  const keepReadable = bool(input.keepReadable, true)

  const heading = parseBox(input.heading, 'The heading box', W, H, errors, '#ffffff', keepReadable)
  const date = parseBox(input.date, 'The date box', W, H, errors, '#ffffff', keepReadable)
  const location = parseBox(input.location, 'The location box', W, H, errors, '#ffffff', keepReadable)
  const time = parseBox(input.time, 'The time box', W, H, errors, '#ffffff', keepReadable)
  const notes = parseNotes(input, W, H, keepReadable)
  const days = parseDays(input.days, W, H, errors)

  /* 🔴 ROW SPACING HAS A FLOOR AND A CEILING, AND THE CEILING IS THE IMAGE HEIGHT. 0 would stack all
   * seven days on one line (unreadable, and the operator cannot tell why); a huge value pushes six
   * rows off the bottom, which renders fine and looks like the renderer dropped them. */
  const rowSpacing = num(input.rowSpacing, 1, H)
  if (rowSpacing === null) errors.push('The row spacing must be a number of pixels.')

  const headingText = str(isObj(input.heading) ? input.heading.text : undefined, 200)
  if (headingText === null) errors.push('The heading text is too long (200 characters maximum).')
  const daysOffText = str(input.daysOffText, 60)
  if (daysOffText === null) errors.push('The days-off text is too long (60 characters maximum).')

  const timeStyle: TimeStyle = input.timeStyle === '24h' ? '24h' : '12h'
  /* ⚠️ AN UNKNOWN STYLE ID FALLS BACK TO THE LEGACY ONE rather than being refused. Every design saved
   * before today has no `dateStyle` at all and must read as `'long'`, which is the exact wording the
   * renderer has always drawn; an id this build does not know (a rollback from a later one) gets the
   * same treatment, because a poster in the wrong date style is recoverable and a poster that will not
   * render is not. */
  const dateStyle: DateStyleId = DATE_STYLE_IDS.includes(input.dateStyle as DateStyleId)
    ? (input.dateStyle as DateStyleId) : LEGACY_DATE_STYLE
  const placeStyle: PlaceStyleId = PLACE_STYLE_IDS.includes(input.placeStyle as PlaceStyleId)
    ? (input.placeStyle as PlaceStyleId) : 'nameTownBelow'
  /* ══ ⚠️ THE CEILING IS 70% (10 October 2026), AND IT IS STILL A CEILING FOR THE OLD REASON ════════
   * ⛔ IT WAS 60, WHICH WAS THE 6 OCTOBER BRIEF'S NUMBER; §B3 OF THE 10 OCTOBER BRIEF ASKS FOR 0–70 and
   * that is what the slider offers, so the validator has to accept it or the editor would offer a value
   * the save refuses. 🔴 THE REASON FOR HAVING A CEILING AT ALL IS UNCHANGED: a 100% dark layer hides
   * the truck's artwork completely and leaves text on a black rectangle — at which point they have not
   * uploaded a design, they have uploaded a wallpaper. ⚠️ NO EXISTING DESIGN IS AFFECTED: every stored
   * value is ≤ 60, so raising the ceiling can only ever allow something new. */
  const darken = num(input.darken, 0, MAX_DARKEN) ?? 0
  const exampleOpacity = typeof input.exampleOpacity === 'number' && Number.isFinite(input.exampleOpacity)
    ? Math.min(1, Math.max(0, input.exampleOpacity))
    : 0

  if (errors.length || !heading || !date || !location || !time || rowSpacing === null) {
    return { ok: false, errors: errors.length ? errors : ['The design could not be read.'] }
  }
  /* ⛔ THE LAST-TOGGLE RULE NOW HOLDS ON THE WEEKLY POST TOO (6 October 2026), because the weekly post
   * draws cancelled events and says so the same two ways: the place name struck through and the word
   * CANCELLED where the time goes. It was only enforced on the single-event design because only that
   * design had switches; now both do, and one rule covers both.
   * ⚠️ IT CANNOT BREAK AN EXISTING DESIGN. Every design saved before `enabled` existed reads as all-on,
   * so this can only ever refuse a NEW payload that switched both off. */
  if (!toggleIsAllowed({ location, time })) return { ok: false, errors: [LAST_TOGGLE_MESSAGE] }

  /* ⚠️ THE SEVEN ROWS ARE CHECKED AGAINST THE BOTTOM OF THE IMAGE — a warning, not an error. The
   * operator may genuinely want the last row near the edge, and refusing to save would be worse than
   * telling them. The renderer draws whatever fits and the weekly-post screen reports the rest. */
  const layout: Layout = {
    version: LAYOUT_VERSION,
    width: W,
    height: H,
    heading: { ...heading, text: headingText || '' },
    date: {
      ...date,
      twoLines: bool(isObj(input.date) ? input.date.twoLines : undefined, true),
      bgDayOff: optColour(isObj(input.date) ? input.date.bgDayOff : null),
    },
    location,
    time,
    notes,
    /* ⚠️ SPREAD CONDITIONALLY, SO AN OLD DESIGN'S LAYOUT HAS NO `days` KEY AT ALL rather than one set
     * to `undefined`. `JSON.stringify` of the two differs, and the editor's "are there unsaved
     * changes?" test is a string compare — a key that appears from nowhere would make every old design
     * dirty the moment it was read. */
    ...(days ? { days } : {}),
    placePicture: parsePlacePicture(
      input.placePicture, W, H,
      defaultPlacePictureBox(W, H, { x: date.x, y: date.y, h: date.h }),
      /* 🔴 `true` — THE WEEKLY POST HAS NO "whole background". */ true,
    ),
    rowSpacing,
    daysOffText: daysOffText || DEFAULT_DAYS_OFF_TEXT,
    timeStyle,
    keepReadable,
    showCancelled: bool(input.showCancelled, true),
    exampleOpacity,
    darken,
    dateStyle,
    placeStyle,
    /* ⚠️ PARSED, NOT DERIVED. A layout the editor has just saved carries its own shared look and this
     * is where it comes back; a layout saved before today carries none, and `readStoredLayout` replaces
     * what this produced with the design's own first enabled box. */
    textStyle: parseTextLook(input.textStyle, '#ffffff', keepReadable, H),
  }
  return { ok: true, layout, errors: [] }
}

/** Does the seventh row fit inside the image? Reported to the operator, never used to refuse a save. */
export function rowsFitWarning(l: Layout): string | null {
  /* 🔴 "THE 7 DAYS" CANNOT PRODUCE THIS WARNING, AND THAT IS THE POINT OF IT. The block is validated
   * as being inside the image and the seven rows share its height, so a seventh row below the bottom
   * edge is no longer a state the model can hold. ⚠️ The warning stays for every design still on the
   * legacy rows — which is every design nobody has opened since 10 October 2026. */
  if (l.days) return null
  const bottom = Math.max(
    l.date.y + l.rowSpacing * 6 + l.date.h,
    l.location.y + l.rowSpacing * 6 + l.location.h,
    l.time.y + l.rowSpacing * 6 + l.time.h,
  )
  return bottom > l.height
    ? `The last day falls ${Math.round(bottom - l.height)}px below the bottom of the image — reduce the row spacing or move row 1 up.`
    : null
}

/** Every (font, bold) pair a layout uses, for the renderer's font list. */
export function fontsUsedBy(l: Layout): Array<{ id: string; bold: boolean }> {
  /* ⛔ RESOLVED, NOT RAW (9 October 2026). A box that FOLLOWS "All text" still carries its old
   * `fontId` in storage and that font is not the one that will be drawn. Reading the raw field would
   * load a face nothing uses and — the half that actually breaks a poster — would **not load the
   * shared one**, so every following box would fall back to Oswald in the PNG while the editor showed
   * the right family name. ⚠️ The same fix is in `fontsUsedByEvent`, for the same reason. */
  const boxes = [l.heading, l.date, l.location, l.time, ...l.notes]
    .map(b => resolveTextBox(l.textStyle, b))
  return boxes.map(b => ({ id: b.fontId, bold: b.bold }))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE SINGLE-EVENT LAYOUT (stage 2)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * A design for ONE event.
 *
 * 🔴 IT SHARES THE WEEK'S BOX TYPES AND ITS PARSER, AND IS A SEPARATE SHAPE. Three boxes, no row
 * spacing, no days-off text, no heading — a single-event post has one date, one place and one time, so
 * modelling it as a week with `rowSpacing` pinned to zero would carry five fields that must never be
 * read and would make every validator branch ask "which kind is this?". The pieces that ARE the same —
 * `TextBox`, `parseBox`, the bounds rule, the background sample — are the same code, not a copy.
 *
 * ⚠️ IT IS STORED UNDER THE SAME `truck_post_designs` ROW SHAPE, with `kind = 'event'`, which is why
 * the unique key is `(truck_id, kind)` rather than `truck_id`.
 */
/* ══ ⚠️ `SwitchableBox` AND `SwitchableDateBox` ARE NOW ALIASES ════════════════════════════════════
 * `enabled` lives on `TextBox` itself (see its note), so these two names no longer ADD anything. They
 * are kept because `EventLayout` reads better with them and because every import of them across the
 * route and the editor still resolves — renaming thirty call sites to prove a type is now identical to
 * its supertype would be a diff with no behaviour in it. */
export type SwitchableBox = TextBox
/**
 * 🔴 HOW BIG THE TOWN WAS WHEN IT WAS A LINE INSIDE THE VENUE BOX.
 *
 * ⛔ THE RENDERER HARD-CODED `scale: 0.62` IN TWO PLACES (`locationLinesFor` and `timeLinesFor`'s
 * spacer). It is one constant now, because the Venue/Town split has to reproduce that size exactly or
 * every existing design's town changes size the day it is read — which is the one thing "old saved
 * layouts look the same" forbids.
 */
export const TOWN_SCALE = 0.62

export type SwitchableDateBox = DateBox

export interface EventLayout {
  version: typeof LAYOUT_VERSION
  width: number
  height: number
  date: SwitchableDateBox
  /** 🔴 THE **VENUE** — the place name a post prints. ⚠️ The field keeps the name `location`. */
  location: SwitchableBox
  /* ══ 🔴 THE **TOWN**, ITS OWN BOX SINCE 9 OCTOBER 2026 ═══════════════════════════════════════════
   * ⛔ IT USED TO BE A SECOND LINE INSIDE THE VENUE BOX, chosen by `placeStyle`: "name with the town
   * below", "name, town" on one line, or "name only". That made the town's position, size and colour
   * un-editable — it was whatever the venue's were, scaled — and a truck who wanted the town smaller,
   * paler or somewhere else on the poster had no way to say so.
   * 🔴 IT IS A BOX NOW, with its own position and its own full set of text settings. An OLD layout is
   * converted on read: the venue keeps its box exactly, the town is placed directly below it, and it
   * is ON when the old style showed a town and OFF when it did not. See `validateEventLayout`.
   * ⚠️ THE WEEKLY LAYOUT IS **NOT** SPLIT and still has `placeStyle`. Its place text lives inside each
   * day row, repeated seven times with the row's own offset — splitting it would be redesigning the
   * weekly rows, which this build deliberately does not do. */
  town: SwitchableBox
  time: SwitchableBox
  notes: NoteBox[]
  /** The place's picture: in a box, or as this event's whole background. ⚠️ Off unless asked for. */
  placePicture: PlacePictureBox
  timeStyle: TimeStyle
  /* ⛔ `timeDisplay` IS GONE (6 October 2026), AND IT IS THE ONE DELIBERATE BREAK IN THIS BUILD.
   * It offered "From 5pm" or "5pm – 9pm" and defaulted to "From 5pm". The brief removes the choice:
   * a single-event post always states the start AND the finish, because "From 5pm" tells a customer
   * when to arrive and nothing about whether the truck will still be there. **A design saved with
   * "From 5pm" renders the range from now on** — said out loud here, and in the report, because it is
   * the only change on this list that alters a poster a truck has already approved. */
  keepReadable: boolean
  /** 0–60%. A dark layer over the picture and under all the text. 0 draws nothing. */
  darken: number
  dateStyle: DateStyleId
  /* ⛔ LEGACY ON AN EVENT LAYOUT SINCE 9 OCTOBER. Nothing renders from it and nothing offers it; it is
   * kept, normalised and saved so that `validateEventLayout` can still read an old design and work out
   * whether its town was on — which is the only thing it is for now. ⚠️ The WEEKLY layout's
   * `placeStyle` is live and unchanged. */
  placeStyle: PlaceStyleId

  /** 🔴 "All text" — the shared look. Identical field, identical rules, see `Layout.textStyle`. */
  textStyle: TextLook
}

/**
 * 🔴 AT LEAST ONE OF LOCATION OR TIME MUST STAY ON, and the reason is a cancelled event.
 *
 * A cancelled post says so in two places: the place name is struck through, and the Time box reads
 * CANCELLED. With both switched off, a cancelled event renders as an ordinary poster with a date on
 * it — a truck would be telling customers to come to something that is not happening. The Date box may
 * be switched off freely; it carries no cancellation.
 *
 * ⚠️ ENFORCED IN THE VALIDATOR, so the rule holds for a hand-made payload as well as for the UI that
 * greys the last toggle out.
 */
export const LAST_TOGGLE_MESSAGE =
  'Keep either Location or Time switched on. A cancelled event shows its place crossed out and the word CANCELLED, so with both off there would be nothing to say it is cancelled.'

export function toggleIsAllowed(l: { location: { enabled: boolean }; time: { enabled: boolean } }): boolean {
  return l.location.enabled || l.time.enabled
}

/**
 * A first layout for a freshly uploaded event background.
 *
 * ⚠️ THE THREE BOXES STACK IN THE LOWER THIRD, where a truck's artwork usually leaves room, and span
 * the full width centred — a single-event post is read at a glance, so the week's left/right column
 * split would be the wrong starting point. It is a starting point the operator drags, not a guess at
 * their picture.
 * 🔴 DATE DEFAULTS TO ONE LINE here and to two on the weekly post, which is the brief's rule and the
 * right one: "FRIDAY 16TH OCTOBER" across a poster reads as a headline; split over two lines in a
 * seven-row grid it reads as a column.
 */
export function defaultEventLayout(width: number, height: number): EventLayout {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const pad = Math.round(w * 0.07)
  const inner = w - pad * 2
  const rowH = Math.max(28, Math.round(h * 0.075))
  const top = Math.round(h * 0.62)
  const gap = Math.round(rowH * 0.28)
  const base = {
    fontId: DEFAULT_FONT_ID,
    bold: false,
    color: '#ffffff',
    caps: true,
    align: 'center' as Align,
    bgSample: null as { r: number; g: number; b: number } | null,
    enabled: true,
    ...DEFAULT_EXTRAS,
  }
  return {
    version: LAYOUT_VERSION,
    width: w,
    height: h,
    /* ⚠️ ALL THREE START ON. A design that opened with something switched off would look broken to a
     * truck who had not chosen that. */
    date: {
      ...base, x: pad, y: top, w: inner, h: rowH,
      fontSize: Math.round(rowH * 0.62),
      twoLines: false, bgDayOff: null,
    },
    location: {
      ...base, x: pad, y: top + rowH + gap, w: inner, h: rowH,
      fontSize: Math.round(rowH * 0.6), caps: false,
    },
    /* ⚠️ DIRECTLY UNDER THE VENUE, AT `TOWN_SCALE` — the size the renderer drew the town line at when
     * it was part of the venue box. A new design therefore looks like an old one, which is what makes
     * this a split rather than a redesign. */
    town: {
      ...base, x: pad, y: top + rowH + gap + Math.round(rowH * TOWN_SCALE), w: inner,
      h: Math.max(12, Math.round(rowH * TOWN_SCALE)),
      fontSize: Math.max(8, Math.round(rowH * 0.6 * TOWN_SCALE)), caps: false,
    },
    time: {
      ...base, x: pad, y: top + (rowH + gap) * 2, w: inner, h: rowH,
      fontSize: Math.round(rowH * 0.6),
    },
    notes: [],
    placePicture: defaultPlacePictureBox(w, h),
    timeStyle: '12h',
    keepReadable: true,
    darken: 0,
    dateStyle: LEGACY_DATE_STYLE,
    placeStyle: 'nameTownBelow',
    textStyle: { ...defaultTextLook('#ffffff'), caps: true },
  }
}

/** A note box for an event design. Placed under the time row. */
export function defaultEventNoteBox(l: EventLayout): NoteBox {
  const h = Math.max(24, Math.round(l.time.h * 0.8))
  return {
    ...DEFAULT_EXTRAS,
    enabled: true,
    bgSample: null,
    fontId: l.location.fontId,
    fontSize: Math.max(10, Math.round(l.location.fontSize * 0.8)),
    bold: false,
    color: l.location.color,
    align: l.location.align,
    caps: false,
    text: NOTE_TOKEN,
    x: l.location.x,
    y: stackedY(l.notes, Math.min(l.height - 40, l.time.y + l.time.h + Math.round(l.time.h * 0.25)), h, l.height),
    w: l.location.w,
    h,
  }
}

export interface EventValidationResult {
  ok: boolean
  layout?: EventLayout
  errors: string[]
}

/**
 * The gate for an event design.
 *
 * 🔴 THE SAME `parseBox` AS THE WEEK, so every rule it enforces — finite numbers, no strings, inside
 * the image, a known font, a real colour, a sane background sample — holds here without being restated.
 * The only differences are the fields that genuinely differ.
 * ⚠️ THE IMAGE SIZE COMES FROM THE SERVER, exactly as on the week: a payload that could declare its own
 * canvas could place a box anywhere and pass the bounds check.
 */
export function validateEventLayout(input: unknown, width: number, height: number): EventValidationResult {
  const errors: string[] = []
  const W = num(width, 1, 20000)
  const H = num(height, 1, 20000)
  if (W === null || H === null) return { ok: false, errors: ['The design image size is not known.'] }
  if (!isObj(input)) return { ok: false, errors: ['The design is missing.'] }
  if (input.version !== LAYOUT_VERSION) {
    return { ok: false, errors: [`This design was saved by a different version of the editor (expected ${LAYOUT_VERSION}).`] }
  }

  const keepReadable = bool(input.keepReadable, true)
  const date = parseBox(input.date, 'The date box', W, H, errors, '#ffffff', keepReadable)
  const location = parseBox(input.location, 'The location box', W, H, errors, '#ffffff', keepReadable)
  const time = parseBox(input.time, 'The time box', W, H, errors, '#ffffff', keepReadable)
  const notes = parseNotes(input, W, H, keepReadable)

  if (errors.length || !date || !location || !time) {
    return { ok: false, errors: errors.length ? errors : ['The design could not be read.'] }
  }

  /* ══ 🔴 THE TOWN BOX — PARSED WHEN PRESENT, **DERIVED** FROM THE OLD PLACE STYLE WHEN NOT ══════════
   *
   * ⛔ THIS IS THE WHOLE OF "old saved layouts must open without errors and look the same", and it runs
   * on every read, not once in a migration. A design saved before 9 October has no `town` key at all;
   * its town was a second line inside the venue box, sized `TOWN_SCALE` and chosen by `placeStyle`.
   *
   * 🔴 THE CONVERSION, FOLLOWING THE BRIEF:
   *   • the VENUE keeps the old box exactly — position, size, font, colour, effects, all of it;
   *   • the TOWN is placed DIRECTLY BELOW it, in the same style;
   *   • the TOWN IS ON when the old style showed a town (`nameTownBelow`, `nameTown`) and OFF when it
   *     did not (`nameOnly`).
   *
   * ⚠️ "THE SAME STYLE" IS THE SAME **STYLE**, AT THE OLD **SIZE**. The renderer drew that line at
   * `TOWN_SCALE` of the venue's font, so copying the font size unscaled would make every existing
   * design's town suddenly 60% bigger — which is the one thing "look the same" forbids. The font, the
   * colour, the alignment, the capitals and the effects are copied as they are; only the size is
   * scaled, because only the size was never the venue's to begin with.
   *
   * ⛔ ONE CASE CANNOT BOTH FOLLOW THE INSTRUCTION AND LOOK THE SAME, AND IT IS NAMED RATHER THAN
   * SILENTLY CHOSEN: `nameTown` drew "The Kings Arms, Lavenham" on ONE line. Two boxes cannot
   * reproduce one line, and the brief says the town goes directly below — so a `nameTown` design gains
   * a second line. `nameTownBelow` — the default, and what the renderer drew below the name already —
   * is unchanged. Recorded in docs/social-tab-3-report.md.
   *
   * ⚠️ IT IS CLAMPED INTO THE CANVAS. A venue box at the very bottom would otherwise put its town off
   * the poster, and a box outside the image is what `parseBox` refuses — so the derived one must not
   * be able to produce what the parser would reject. */
  const town = (() => {
    /* ══ ⛔ A **THROWAWAY** ERROR LIST, AND THIS IS NOT A DETAIL ═══════════════════════════════════
     * `parseBox` PUSHES "The town box is missing." onto whatever list it is handed when the key is
     * absent — and every design saved before 9 October has no `town` key at all. Passing the real
     * `errors` array therefore made **every existing design fail to validate**, which is the exact
     * opposite of "old saved layouts must open without errors": the editor would have fallen back to
     * `defaultEventLayout` and every truck's positions would have looked lost.
     * 🔴 CAUGHT BY `scripts/weekly-post.cjs` §8b, which drove the validator rather than reading it.
     * ⚠️ A MISSING TOWN IS NOT AN ERROR, IT IS THE **MIGRATION PATH** — so its complaints go nowhere
     * and the derivation below is what answers. A town box that is present but BROKEN is a different
     * case and still fails, because `parseBox` returns null for it too and the fallback then rebuilds
     * it from the venue, which is the safe shape. */
    const townErrors: string[] = []
    const parsed = parseBox(input.town, 'The town box', W, H, townErrors, '#ffffff', keepReadable)
    if (parsed) return parsed
    const oldStyle = input.placeStyle
    const showedTown = oldStyle !== 'nameOnly'
    const h = Math.max(12, Math.round(location.h * TOWN_SCALE))
    return {
      ...location,
      enabled: showedTown,
      fontSize: Math.max(8, Math.round(location.fontSize * TOWN_SCALE)),
      /* ⚠️ `Math.min` KEEPS IT ON THE POSTER. Directly below where there is room; flush with the
       * bottom edge where there is not. */
      y: Math.min(Math.max(0, H - h), location.y + location.h),
      h,
    }
  })()
  /* ⚠️ `town` IS NEVER NULL — the fallback above always returns a box — so this is a type guard rather
   * than a path an input can reach. It is written as one anyway: the day someone adds a `return null`
   * to that closure, this is what stops a `null` reaching the layout. */
  if (!town) return { ok: false, errors: ['The design could not be read.'] }

  /* 🔴 A SWITCHED-OFF BOX IS ACCEPTED EXPLICITLY, and keeps its position. `enabled` defaults to TRUE
   * when absent, so every design saved before this existed reads as "all three on" — which is what they
   * were. */
  /* ⚠️ READ OFF THE PARSED BOXES, NOT OFF THE RAW INPUT AGAIN. `parseBox` already applied the
   * default; asking the payload a second time was a second answer to one question, and the two could
   * disagree the moment either default changed. */
  const locationOn = location.enabled
  const timeOn = time.enabled
  /* ⛔ AND THE LAST ONE CANNOT GO. Enforced here as well as in the UI, so a hand-made payload cannot
   * produce a design on which a cancelled event reads as an ordinary poster. */
  if (!locationOn && !timeOn) return { ok: false, errors: [LAST_TOGGLE_MESSAGE] }

  return {
    ok: true,
    errors: [],
    layout: {
      version: LAYOUT_VERSION,
      width: W,
      height: H,
      date: {
        ...date,
        twoLines: bool(isObj(input.date) ? input.date.twoLines : undefined, false),
        bgDayOff: optColour(isObj(input.date) ? input.date.bgDayOff : null),
      },
      location,
      town,
      time,
      notes,
      placePicture: parsePlacePicture(
        input.placePicture, W, H, defaultPlacePictureBox(W, H), false,
      ),
      timeStyle: input.timeStyle === '24h' ? '24h' : '12h',
      /* ⛔ `timeDisplay` IS READ FROM NOTHING AND WRITTEN NOWHERE. A stored `'from'` is dropped on the
       * next save, which is the point: the single-event post states its start and its finish now. */
      keepReadable,
      darken: num(input.darken, 0, MAX_DARKEN) ?? 0,
      dateStyle: DATE_STYLE_IDS.includes(input.dateStyle as DateStyleId)
        ? (input.dateStyle as DateStyleId) : LEGACY_DATE_STYLE,
      placeStyle: PLACE_STYLE_IDS.includes(input.placeStyle as PlaceStyleId)
        ? (input.placeStyle as PlaceStyleId) : 'nameTownBelow',
      textStyle: parseTextLook(input.textStyle, '#ffffff', keepReadable, H),
    },
  }
}

/**
 * Every (font, bold) pair an event layout uses.
 *
 * ⛔ IT MUST ASK `resolveTextBox`, NOT THE RAW BOXES (9 October 2026). A box that FOLLOWS "All text"
 * still carries its old `fontId` in storage, and that font is not the one that will be drawn. Reading
 * the raw field would load the wrong face — and, worse, would **fail to load the shared one**, so the
 * renderer would fall back to Oswald for every following box while the editor showed the right name.
 * ⚠️ `town` JOINS THE LIST TOO; it was missing, which was harmless only while it could not have a font
 * of its own. 🔴 THE PAIRS ARE DE-DUPLICATED BY THE CALLER, as they always were.
 */
export function fontsUsedByEvent(l: EventLayout): Array<{ id: string; bold: boolean }> {
  const boxes = [l.date, l.location, l.town, l.time, ...l.notes]
    .map(b => resolveTextBox(l.textStyle, b))
  return boxes.map(b => ({ id: b.fontId, bold: b.bold }))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2b · THE SAME DESIGN ON A DIFFERENT CANVAS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * An event layout re-expressed at a new picture size, scaled proportionally.
 *
 * 🔴 TWO CALLERS, ONE RULE.
 *   1. Switching a place from "Same as Standard" to "Own for this place" starts from Standard's boxes
 *      rather than from the generic defaults, because the truck has already arranged those boxes and
 *      the point of switching is usually to move ONE of them. Starting from scratch would throw that
 *      arrangement away.
 *   2. Re-exporting a place's own picture at a different resolution but the SAME shape (1080×1350 →
 *      2160×2700) is the same poster; the boxes should survive, moved to the new pixel grid.
 *
 * ⚠️ THE TWO AXES ARE SCALED INDEPENDENTLY, so this is correct only between canvases of (near) equal
 * shape — which is all either caller asks of it. Scaling a portrait layout onto a landscape canvas
 * this way would stretch every box and every font size; that case resets to `defaultEventLayout`
 * instead, in the route.
 * ⚠️ FONT SIZES SCALE WITH THE **HEIGHT**, not with the average of the two factors. A font size is a
 * vertical measure — it is what decides whether a line still fits the box's height — and the renderer
 * shrinks to fit from it, so tying it to height keeps the relationship between text and box intact.
 * ⚠️ `bgSample` IS CARRIED OVER UNCHANGED. It is the averaged colour under the box; a re-export at a
 * different resolution of the same artwork has the same colours, and a wrong shape resets anyway.
 * ⚠️ THE RESULT IS NOT TRUSTED — every caller passes it through `validateEventLayout`, which is what
 * clamps a rounded box back inside the canvas.
 */
export function scaleEventLayout(input: unknown, width: number, height: number): EventLayout | null {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  if (!input || typeof input !== 'object') return null
  const src = input as Partial<EventLayout>
  const sw = Number(src.width), sh = Number(src.height)
  if (!Number.isFinite(sw) || !Number.isFinite(sh) || sw <= 0 || sh <= 0) return null
  const fx = w / sw, fy = h / sh

  const box = <T extends BoxRect & TextStyle>(b: T): T => ({
    ...b,
    x: Math.round(b.x * fx), y: Math.round(b.y * fy),
    w: Math.round(b.w * fx), h: Math.round(b.h * fy),
    fontSize: Math.max(1, Math.round(b.fontSize * fy)),
    /* 🔴 THE PIXEL-VALUED NEW FIELDS SCALE TOO, AND THAT IS NOT OPTIONAL. Letter spacing, the band's
     * corner radius and the band's padding are all native pixels, so carrying them over unchanged onto
     * a 2160px canvas would halve the tracking and shrink a 40px corner to a hairline — the same bug
     * that `fontSize` scaling here exists to avoid. With the height factor, like the font size, for
     * the same reason: they are measures relative to the text, not to the frame's width.
     * ⚠️ `tilt`, `lineSpacing` AND `italic` DO **NOT** SCALE. A degree is a degree and a percentage is
     * a percentage at any resolution; multiplying either would rotate the design on re-export. */
    letterSpacing: Math.round((b.letterSpacing ?? 0) * fy),
    effects: b.effects
      ? {
          ...b.effects,
          bandRadius: Math.round(b.effects.bandRadius * fy),
          bandPadding: Math.round(b.effects.bandPadding * fy),
        }
      : defaultEffects(),
  })

  const date = src.date, location = src.location, time = src.time
  if (!date || !location || !time) return null
  /* ⚠️ TYPED AS THE **INPUT** TO `validateEventLayout`, NOT AS AN `EventLayout`. A design from before
   * the Venue/Town split has no `town`, and this function's job is to carry boxes across a resize, not
   * to invent one — the validator below is the single place that knows how to derive it. Declaring
   * this `EventLayout` would have forced a `town` here and given the product two migrations. */
  const out: Omit<EventLayout, 'town'> & { town?: TextBox } = {
    version: LAYOUT_VERSION,
    width: w, height: h,
    date: box(date), location: box(location), time: box(time),
    /* ⚠️ SCALED LIKE EVERY OTHER BOX WHEN IT EXISTS, AND LEFT TO THE VALIDATOR WHEN IT DOES NOT. This
     * function carries boxes across a resize; `validateEventLayout` at the end is what derives a
     * missing town from the old `placeStyle`, so a design from before the split arrives here with no
     * `town`, leaves here with no `town`, and gains one there — in the single place that knows how. */
    ...(src.town ? { town: box(src.town) } : {}),
    /* ⚠️ THE LEGACY SINGLE `note` IS ACCEPTED HERE TOO, because this function is handed a RAW stored
     * layout (it is called on `standard.layout` straight out of the column) and that layout may
     * predate `notes`. `validateEventLayout` at the end of this function does the migration; this
     * only has to carry the boxes across without losing them. */
    notes: (Array.isArray(src.notes) ? src.notes : (src as { note?: NoteBox }).note ? [(src as { note?: NoteBox }).note!] : [])
      .slice(0, MAX_NOTE_BOXES).map(n => box(n)),
    timeStyle: src.timeStyle === '24h' ? '24h' : '12h',
    keepReadable: src.keepReadable !== false,
    /* ⚠️ THE PICTURE BOX SCALES LIKE EVERY OTHER BOX, and its two pixel-valued settings — the corner
     * radius and the border width — scale with the HEIGHT, like a font size, for the same reason: a
     * 40px radius is a gentle curve on a 2160px poster and a blob on a 600px one. */
    placePicture: src.placePicture
      ? {
          ...src.placePicture,
          x: Math.round(src.placePicture.x * fx), y: Math.round(src.placePicture.y * fy),
          w: Math.max(8, Math.round(src.placePicture.w * fx)), h: Math.max(8, Math.round(src.placePicture.h * fy)),
          radius: Math.round(src.placePicture.radius * fy),
          borderWidth: Math.round(src.placePicture.borderWidth * fy),
        }
      : defaultPlacePictureBox(w, h),
    darken: Number.isFinite(src.darken) ? Math.min(MAX_DARKEN, Math.max(0, Math.round(src.darken as number))) : 0,
    dateStyle: src.dateStyle ?? LEGACY_DATE_STYLE,
    placeStyle: src.placeStyle ?? 'nameTownBelow',
    /* ⚠️ CARRIED ACROSS A RESIZE UNCHANGED. Every field in the shared look is size-independent except
     * `letterSpacing` and the band's two pixel fields, and all three live inside each BOX as well — so
     * scaling here and in `box()` would scale them twice. ⛔ `letterSpacing` ON THE SHARED LOOK IS
     * THEREFORE LEFT AS IT IS, which is the same choice the old build made by not having one at all;
     * the boxes' own values are what the renderer uses for the boxes that own their style. */
    textStyle: (src as { textStyle?: TextLook }).textStyle as TextLook,
  }
  const v = validateEventLayout(out, w, h)
  return v.ok && v.layout ? v.layout : null
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 READING A **STORED** LAYOUT — THE ONE DOOR IN (7 October 2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ WHY THIS EXISTS: THE EDITOR CRASHED ON PIZZA KITCHEN'S OWN SAVED DESIGN.
//
//     TypeError: undefined is not an object (evaluating 'PLACE_STYLE_SAMPLES[l.placeStyle].split')
//       at itemsOf (components/manage/DesignEditor.tsx:183)
//
// The validators above were wired into every WRITE path — save, render, upload — and into NO read
// path. `event_load` and `load` sent `design.layout` to the browser exactly as it came out of jsonb,
// with a TypeScript `as EventLayout` cast that asserts nothing at runtime. That was harmless while the
// editor only read fields every stored design already had; part 1 added `placeStyle` and `dateStyle`,
// and a design saved before part 1 has neither — so the editor read `undefined` and threw.
//
// 🔴 THE VALIDATORS ALREADY FIX THIS ON THEIR OWN. `validateEventLayout` defaults a missing
// `placeStyle` to 'nameTownBelow' and a missing `dateStyle` to LEGACY_DATE_STYLE — see the tail of its
// return. The bug was never a missing default; it was a path that never asked for one.
//
// ⚠️ SO THESE TWO FUNCTIONS EXIST TO BE THE ONLY WAY A STORED LAYOUT ENTERS THE PRODUCT, the way the
// validators are already the only way a submitted one does. A read site that calls the validator
// itself would work equally well — and that is exactly what the renderer does — but there would then
// be two shapes of "read a layout" and the next read site would copy whichever it found first.
//
// 🔴 THEY NEVER RETURN null, AND THAT IS THE POINT. A stored layout that cannot be validated at all —
// wrong version, a box outside a resized canvas — yields the DEFAULT layout for that canvas rather
// than a crash or an empty screen. ⚠️ THAT IS A REAL LOSS AND IT IS DELIBERATE: the operator's
// positions are gone for that session, but the editor opens, and they can place the boxes again and
// save. The alternative on the day it happens is a screen that does not load at all.
// ⚠️ `repaired` IS RETURNED SO A CALLER CAN SAY SO. Nothing surfaces it to an operator today; it is
// there so that when something does, it does not need a second code path to find out.

/** What `readStoredLayout`/`readStoredEventLayout` give back. `repaired` = the stored value could not
 *  be validated and the default was substituted. */
// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 "All text" ON AN OLD DESIGN — THE MIGRATION, ON READ
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE RULE IS THE SAME ONE EVERY ADDITION IN THIS FILE OBEYS: **a design saved before today must
// open looking identical.** A shared style defaulted to anything of its own would repaint every box on
// every existing poster the moment it was read, which is the worst possible failure here — it would
// happen silently, to designs a truck has already approved, with no action on their part.
//
// 🔴 SO THE SHARED STYLE IS **TAKEN FROM THE DESIGN**, not invented: the look of its first enabled text
// box, Date first where there is one. ⚠️ Date leads because it is the box every design has, it is the
// one the editor opens on, and on a design where the truck has styled things deliberately it is
// overwhelmingly the one the rest were matched to.
//
// ⚠️ AND THEN EVERY BOX IS ASKED, ONE AT A TIME, whether its look already equals that: if it does it
// FOLLOWS, and if it differs it becomes OWN. ⛔ THAT IS WHY THE FLAG CANNOT SIMPLY DEFAULT TO `false`.
// A design with a Permanent Marker heading over Oswald rows would have had its heading silently
// repainted in Oswald — identical output is the whole requirement and that would have broken it on the
// designs that had been worked on the most.
//
// ⛔ AND IT RUNS ON **READ**, NOT AS SQL. The layouts live in a `jsonb` column; there is no safe way to
// rewrite thousands of them in place, and a read-time derivation is also what makes a rollback safe —
// an older build ignores `textStyle` and `ownStyle` and draws each box's own fields, which are still
// there and still correct.

/** Every text box on a layout, in the order the migration should consider them. */
function textBoxesOf(l: Layout | EventLayout): TextBox[] {
  const week = 'rowSpacing' in l
  const head: TextBox[] = week
    ? [l.date, (l as Layout).heading, l.location, l.time]
    : [l.date, l.location, (l as EventLayout).town, l.time]
  return [...head, ...l.notes]
}

/**
 * Take the shared look from the design and decide, per box, whether it follows.
 *
 * ⚠️ A STORED LAYOUT THAT ALREADY CARRIES A SHARED LOOK IS LEFT ALONE — `hadShared` — because by then
 * the flags are the operator's own answers and re-deriving them would overwrite a deliberate "own".
 */
function adoptSharedLook<T extends Layout | EventLayout>(l: T, hadShared: boolean): T {
  const boxes = textBoxesOf(l)
  if (hadShared) return l
  /* 🔴 THE FIRST **ENABLED** BOX. A switched-off Date is not what the poster looks like, so a design
   * whose Date is off takes its shared look from the first box that is actually drawn. ⚠️ Falls back to
   * the Date box when every box is off — the look then has no visible consequence either way. */
  const source = boxes.find(b => b.enabled) ?? l.date
  const look = lookOf(source)
  const mark = <B extends TextBox>(b: B): B => ({ ...b, ownStyle: !looksMatch(b, look) })
  const week = 'rowSpacing' in l
  const common = {
    textStyle: look,
    date: mark(l.date),
    location: mark(l.location),
    time: mark(l.time),
    notes: l.notes.map(mark),
  }
  return week
    ? { ...l, ...common, heading: mark((l as Layout).heading) }
    : { ...l, ...common, town: mark((l as EventLayout).town) }
}

/** Did the stored JSON already carry a shared look? ⚠️ The one thing that decides whether to migrate. */
const hadSharedLook = (input: unknown): boolean => isObj(input) && isObj(input.textStyle)

export interface StoredLayoutRead<T> { layout: T; repaired: boolean }

/**
 * A stored WEEKLY layout, normalised — every field bounded, every missing key defaulted.
 *
 * ⚠️ `width`/`height` MUST BE THE DESIGN'S OWN CANVAS, never anything a caller sent: the size is what
 * proves a box sits inside the artwork, which is the rule `validateLayout` is built around.
 */
export function readStoredLayout(input: unknown, width: number, height: number): StoredLayoutRead<Layout> {
  const v = validateLayout(input, width, height)
  /* 🔴 THE ONE DOOR IN, SO THE MIGRATION IS IN THE ONE PLACE EVERY READER ALREADY GOES THROUGH. Putting
   * it inside `validateLayout` would run it on the editor's own SAVE path too, where the flags are the
   * operator's answers and re-deriving them would overwrite a deliberate "own style". */
  if (v.ok && v.layout) return { layout: adoptSharedLook(v.layout, hadSharedLook(input)), repaired: false }
  return { layout: defaultLayout(width, height), repaired: true }
}

/** A stored EVENT layout, normalised. Same contract as `readStoredLayout`. */
export function readStoredEventLayout(input: unknown, width: number, height: number): StoredLayoutRead<EventLayout> {
  const v = validateEventLayout(input, width, height)
  if (v.ok && v.layout) return { layout: adoptSharedLook(v.layout, hadSharedLook(input)), repaired: false }
  return { layout: defaultEventLayout(width, height), repaired: true }
}
