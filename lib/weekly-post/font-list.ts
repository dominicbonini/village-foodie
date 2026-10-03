// lib/weekly-post/font-list.ts — the curated font list, as DATA.
//
// 🔴 SPLIT OUT OF `fonts.ts` SO THE BROWSER CAN IMPORT IT. The editor needs the family names for its
// font picker, and `layout.ts` needs the ids to validate a design — but `fonts.ts` reads the TTFs with
// `node:fs`, and pulling that into a client component breaks the build outright. (It did: the first
// version of the weekly-post screen failed the production build with "Code generation for chunk item
// errored" on app/manage/[token]/page.tsx, because this list was imported through `layout.ts` into a
// `'use client'` file.)
//
// So: the LIST lives here and is pure; the BYTES live in `fonts.ts` and are server-only. Nothing in
// this file touches the filesystem, and nothing in it may.

export type FontGroup = 'Bold condensed' | 'Slab & serif' | 'Handwritten' | 'Clean sans'

export interface FontChoice {
  /** The stable id stored in a design's layout JSON. ⚠️ NEVER the display name: renaming a family in
   *  the picker must not orphan every design that chose it. */
  id: string
  family: string
  group: FontGroup
  /** The weights with their own file. A family listed 400-only has no bold of its own — see below. */
  weights: number[]
  licence: 'OFL-1.1' | 'Apache-2.0' | 'UFL-1.0'
}

/**
 * The 21 families, in the four groups a weekly post actually uses.
 *
 * 🔴 EVERY ENTRY IS OPEN-LICENCE AND THE LICENCE IS THE REAL ONE. Two are Apache-2.0 rather than
 * OFL-1.1 — Roboto Slab and Permanent Marker — and they are labelled as such rather than rounded up to
 * "OFL", because this list is what the report publishes.
 *
 * ⚠️ SINGLE-WEIGHT FAMILIES LIST ONLY 400, and that is load-bearing. Asking Google for a 700 of Anton
 * returns the 400 file; storing it as "bold" would make a bold toggle silently do nothing. The UI
 * hides the bold control for these rather than offering a lie.
 */
export const FONT_CHOICES: readonly FontChoice[] = [
  { id: 'oswald',          family: 'Oswald',           group: 'Bold condensed', weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'bebasneue',       family: 'Bebas Neue',       group: 'Bold condensed', weights: [400],      licence: 'OFL-1.1' },
  { id: 'anton',           family: 'Anton',            group: 'Bold condensed', weights: [400],      licence: 'OFL-1.1' },
  { id: 'archivoblack',    family: 'Archivo Black',    group: 'Bold condensed', weights: [400],      licence: 'OFL-1.1' },
  { id: 'teko',            family: 'Teko',             group: 'Bold condensed', weights: [400, 700], licence: 'OFL-1.1' },

  { id: 'robotoslab',      family: 'Roboto Slab',      group: 'Slab & serif',   weights: [400, 700], licence: 'Apache-2.0' },
  { id: 'playfairdisplay', family: 'Playfair Display', group: 'Slab & serif',   weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'merriweather',    family: 'Merriweather',     group: 'Slab & serif',   weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'bitter',          family: 'Bitter',           group: 'Slab & serif',   weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'abrilfatface',    family: 'Abril Fatface',    group: 'Slab & serif',   weights: [400],      licence: 'OFL-1.1' },

  { id: 'kalam',           family: 'Kalam',            group: 'Handwritten',    weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'caveat',          family: 'Caveat',           group: 'Handwritten',    weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'pacifico',        family: 'Pacifico',         group: 'Handwritten',    weights: [400],      licence: 'OFL-1.1' },
  { id: 'permanentmarker', family: 'Permanent Marker', group: 'Handwritten',    weights: [400],      licence: 'Apache-2.0' },
  { id: 'dancingscript',   family: 'Dancing Script',   group: 'Handwritten',    weights: [400, 700], licence: 'OFL-1.1' },

  { id: 'inter',           family: 'Inter',            group: 'Clean sans',     weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'montserrat',      family: 'Montserrat',       group: 'Clean sans',     weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'poppins',         family: 'Poppins',          group: 'Clean sans',     weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'raleway',         family: 'Raleway',          group: 'Clean sans',     weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'worksans',        family: 'Work Sans',        group: 'Clean sans',     weights: [400, 700], licence: 'OFL-1.1' },
  { id: 'lato',            family: 'Lato',             group: 'Clean sans',     weights: [400, 700], licence: 'OFL-1.1' },
] as const

/** 🔴 THE FALLBACK, and the one id a design is guaranteed to be able to resolve. */
export const DEFAULT_FONT_ID = 'oswald'

export const FONT_BY_ID = new Map(FONT_CHOICES.map(f => [f.id, f]))

/** Where the committed TTFs are. ⚠️ Mirrored in next.config.ts's tracing include. */
export const FONT_DIR = 'assets/fonts/weekly-post'

/**
 * Resolve (id, bold) to the file that actually exists.
 *
 * 🔴 A FAMILY WITH NO 700 FALLS BACK TO ITS 400 FILE, deliberately and visibly: `resolveWeight`
 * returns what was used, so the caller can tell the difference between "bold" and "this family has one
 * weight". The alternative — letting satori synthesise a bold — produces a smeared outline that looks
 * like a rendering fault.
 */
export function resolveWeight(id: string, bold: boolean): 400 | 700 {
  const f = FONT_BY_ID.get(id) ?? FONT_BY_ID.get(DEFAULT_FONT_ID)!
  return bold && f.weights.includes(700) ? 700 : 400
}
