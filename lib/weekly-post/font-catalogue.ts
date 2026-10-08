// lib/weekly-post/font-catalogue.ts — the library, as data the server can ask questions of.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ SERVER-SIDE ONLY, AND NOT BECAUSE OF `fs`
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// It has no filesystem access and no secrets — it is a static JSON import. It is server-side because
// the file is **129KB**, and `app/manage/[token]/page.tsx` is the largest client bundle in this
// product. A picker that bundled its own catalogue would add 129KB to every operator's first paint of
// a page where most of them will never open the font list.
//
// 🔴 SO THE PICKER ASKS THE SERVER FOR IT, ONCE, WHEN IT IS FIRST OPENED (`font_catalogue` on
// /api/weekly-post), and the browser caches the parsed result for the life of the page. The shape sent
// is this file's own, so there is no second schema in between.
//
// ⚠️ IT IS A **STATIC IMPORT**, NOT `fs.readFileSync`. That is the production-correctness choice, not a
// style one: Next traces a static import into the serverless bundle automatically, and it cannot trace
// a path built at runtime — which is the trap `./fonts.ts` carries an `outputFileTracingIncludes` entry
// for. A catalogue that was present locally and absent in production would make every library font
// unavailable only once deployed.

import catalogue from './font-catalogue.json'
import { slugOfFamily } from './font-refs'

/** The four group tabs the picker offers, in order. ⚠️ "All" and "Yours" are not groups — "All" is no
 *  filter and "Yours" is the truck's uploads, which are not in this file. */
export type FontGroupKey = 'bold' | 'hand' | 'classic' | 'clean'

export const GROUP_LABELS: Record<FontGroupKey, string> = {
  bold: 'Bold & tall',
  hand: 'Handwritten',
  classic: 'Classic',
  clean: 'Clean',
}

export type FontLicence = 'OFL-1.1' | 'Apache-2.0' | 'UFL-1.0'

/** One family, as the generated file stores it. ⚠️ Short keys: 1,819 of these travel to the browser. */
interface RawFamily {
  f: string
  c: FontGroupKey
  l: FontLicence
  /** 1 = a 700 weight exists. */
  b: 0 | 1
  /** 1 = a 400 italic exists. */
  i: 0 | 1
  /** Google's popularity rank. Lower is more popular. */
  p: number
  /** Present when this family ships as a committed .ttf — the value is its bundled font id. */
  bundled?: string
}

export interface CatalogueFamily {
  /** The font id a design stores. ⚠️ The BUNDLED id for a bundled family — never `g:oswald`. */
  id: string
  family: string
  group: FontGroupKey
  licence: FontLicence
  hasBold: boolean
  hasItalic: boolean
  popularity: number
  bundled: boolean
}

const RAW = catalogue as unknown as {
  generatedAt: string
  probed: boolean
  count: number
  source: Record<string, string>
  families: RawFamily[]
}

/* ⛔ A CATALOGUE THAT WAS NOT PROBED MUST NOT SHIP. `--no-probe` exists so the script can be checked
 * without 1,800 requests, and a file written that way records `probed: false`. Loading it would mean
 * offering fonts nobody has confirmed can be fetched — the exact thing §1's "never half-offer a font"
 * forbids. ⚠️ It throws at MODULE LOAD, so it is a build failure rather than a runtime surprise. */
if (!RAW.probed) {
  throw new Error('font-catalogue.json was generated with --no-probe: re-run scripts/build-font-catalogue.mjs')
}

export const FONT_CATALOGUE: readonly CatalogueFamily[] = RAW.families.map(r => ({
  id: r.bundled ?? `g:${slugOfFamily(r.f)}`,
  family: r.f,
  group: r.c,
  licence: r.l,
  hasBold: r.b === 1,
  hasItalic: r.i === 1,
  popularity: r.p,
  bundled: !!r.bundled,
}))

export const CATALOGUE_BY_ID = new Map(FONT_CATALOGUE.map(f => [f.id, f]))

/** How many fonts the picker's search box may claim. 🔴 DERIVED, so the sentence cannot go stale. */
export const FONT_COUNT = FONT_CATALOGUE.length

export const CATALOGUE_GENERATED_AT = RAW.generatedAt
export const CATALOGUE_SOURCES = RAW.source

/**
 * ══ 🔴 THE POPULAR PICKS — WHAT THE PICKER SHOWS BEFORE ANYBODY SEARCHES ══════════════════════════
 *
 * ⛔ GOOGLE'S OWN POPULARITY ORDER IS THE WRONG ORDER FOR THIS SCREEN. Its top twenty are Roboto,
 * Open Sans, Noto Sans, Lato, Montserrat, Inter … — the fonts the WEB is set in. A food truck's poster
 * is a headline on a photograph, and the families that work there are condensed display faces, fat
 * slabs and brush scripts. Ordering by web popularity would put forty body-text sans faces in front
 * of an operator looking for something that shouts.
 *
 * 🔴 SO THIS LIST IS CHOSEN, AND BEING CHOSEN IS WHY IT IS WRITTEN DOWN RATHER THAN COMPUTED. It is
 * the brief's ten plus thirty more of the same kinds, spread across the four groups so that whichever
 * tab an operator opens first has something in it before they type.
 * ⚠️ EVERY NAME IS CHECKED AGAINST THE CATALOGUE at module load — see `POPULAR_PICKS` below. A typo
 * here would silently shorten the list, which is the one way this could be wrong and look fine.
 */
const PICK_NAMES: readonly string[] = [
  // ── Bold & tall: the headline faces a poster actually uses ──
  'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Teko', 'Lobster', 'Alfa Slab One',
  'Fjalla One', 'Righteous', 'Staatliches', 'Bowlby One', 'Passion One', 'Titan One',
  // ── Handwritten: a chalkboard, a brush, a marker ──
  'Pacifico', 'Permanent Marker', 'Caveat', 'Kalam', 'Dancing Script', 'Satisfy',
  'Shadows Into Light', 'Amatic SC', 'Patrick Hand', 'Sacramento',
  // ── Classic: slabs and serifs, for the "proper food" look ──
  'Playfair Display', 'Abril Fatface', 'Merriweather', 'Roboto Slab', 'Bitter',
  'Lora', 'Libre Baskerville', 'Cormorant Garamond', 'Josefin Slab',
  // ── Clean: when the picture is busy and the words must not be ──
  'Poppins', 'Montserrat', 'Inter', 'Raleway', 'Work Sans', 'Lato', 'Nunito',
  'Quicksand', 'Barlow Condensed', 'Archivo Narrow',
]

/**
 * The picks, resolved to catalogue entries.
 *
 * ⛔ A NAME THAT IS NOT IN THE CATALOGUE THROWS AT MODULE LOAD rather than being skipped. A skipped
 * pick is a list that is quietly 39 long with no sign of which one went missing — and the likeliest
 * cause is a family being renamed or losing its licence between catalogue builds, which is precisely
 * the thing somebody needs to be told about.
 */
export const POPULAR_PICKS: readonly CatalogueFamily[] = PICK_NAMES.map(name => {
  const hit = FONT_CATALOGUE.find(f => f.family === name)
  if (!hit) throw new Error(`POPULAR_PICKS names "${name}", which is not in font-catalogue.json — re-run scripts/build-font-catalogue.mjs or correct the name`)
  return hit
})

/** A library family by its id, or null. ⚠️ Includes the bundled ones, under their bundled ids. */
export const catalogueFamily = (id: string): CatalogueFamily | null => CATALOGUE_BY_ID.get(id) ?? null

/**
 * Is this id a font the truck is allowed to choose from the library?
 *
 * 🔴 THE SERVER'S HALF OF THE THREE-WAY SPLIT in `font-refs.ts`: the shape is checked there, the
 * EXISTENCE is checked here, and the renderer falls back. ⛔ IT IS WHAT ENFORCES THE LICENCE RULE at
 * the point of choosing: a family that is not in this file has no allowed licence, no latin subset or
 * no fetchable static TTF, and all three are reasons to refuse rather than to try.
 */
export const isChoosableLibraryFont = (id: string): boolean => CATALOGUE_BY_ID.has(id)

/** What the browser is sent. ⚠️ The same short keys the file uses — one schema, not two. */
export interface CataloguePayload {
  count: number
  generatedAt: string
  /** `[id, family, group, licence, hasBold, hasItalic]` per family. */
  families: Array<[string, string, FontGroupKey, FontLicence, 0 | 1, 0 | 1]>
  popular: string[]
}

/**
 * The catalogue as one JSON payload for the picker.
 *
 * ⚠️ TUPLES, NOT OBJECTS. 1,819 objects with six named keys is ~310KB of JSON; the same data as tuples
 * is ~115KB. It travels once per page, and the picker expands it on arrival.
 * ⚠️ ALREADY IN POPULARITY ORDER, because the generated file is — so the browser never sorts 1,819
 * entries to show the first forty.
 */
export function cataloguePayload(): CataloguePayload {
  return {
    count: FONT_COUNT,
    generatedAt: CATALOGUE_GENERATED_AT,
    families: FONT_CATALOGUE.map(f => [f.id, f.family, f.group, f.licence, f.hasBold ? 1 : 0, f.hasItalic ? 1 : 0]),
    popular: POPULAR_PICKS.map(f => f.id),
  }
}
