// lib/weekly-post/font-refs.ts — what a `fontId` in a saved design may be. PURE. BROWSER-SAFE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THREE KINDS OF FONT, ONE STRING FIELD
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
//   | id                | what it is                                      | where the bytes are |
//   |-------------------|-------------------------------------------------|---------------------|
//   | `oswald`          | one of the 21 **bundled** families              | committed in `assets/fonts/weekly-post/` |
//   | `g:lobster`       | a **library** family from the Google catalogue   | our own private storage, fetched once |
//   | `u:myshopfont`    | a font the truck **uploaded**                   | our own private storage, per truck |
//
// ⛔ THE BUNDLED IDS ARE BARE AND MUST STAY BARE. Every design saved before 6 October 2026 stores
// `oswald`, `bebasneue`, `playfairdisplay` … — a prefixed scheme would have orphaned every one of
// them. So the bundled form is "no prefix", and the two new forms carry one.
//
// ── 🔴 WHY THIS FILE CANNOT CHECK WHETHER THE FONT EXISTS ─────────────────────────────────────────
// `layout.ts` imports it, and `layout.ts` is imported by the EDITOR — a client component. The library
// catalogue is a 129KB JSON file and a truck's uploaded fonts are rows in a database; neither belongs
// in a browser bundle, and the second one cannot be in a pure function at all.
//
// 🔴 SO THE SPLIT IS: **this file validates the SHAPE, the server validates the EXISTENCE, and the
// renderer FALLS BACK** to Oswald for a font it cannot load. All three are needed:
//   • shape, so a `jsonb` column can never hold `fontId: "../../etc/passwd"` or 4KB of junk;
//   • existence, so choosing a font that is not in the catalogue is refused at the point of choosing;
//   • a fallback, because a font CAN legitimately disappear — a truck deletes an uploaded family that
//     one of their designs still uses — and a poster that will not render is worse than one in Oswald.

/** The one id a design is always able to resolve. ⚠️ Mirrors `DEFAULT_FONT_ID` in `./font-list`. */
/* The words this file exports are messages (Language Phase 1d Part 2), through ./words.ts. */
import { gbRefusalText, weeklyPostWordsFor } from './words'

export const FALLBACK_FONT_ID = 'oswald'

export type FontKind = 'bundled' | 'library' | 'own'

export interface FontRef {
  kind: FontKind
  /** The whole id as stored. */
  id: string
  /** For `library` and `own`: the slug after the prefix. For `bundled`: the id itself. */
  slug: string
}

/**
 * A family name → the slug used in a font id.
 *
 * ⚠️ IT MUST MATCH `slug()` IN `scripts/build-font-catalogue.mjs`, which is what wrote the catalogue —
 * and it is also what the 21 bundled ids already are (`Bebas Neue` → `bebasneue`), which is how the
 * bundled and library namespaces came to agree without anything being migrated.
 * ⛔ LOWERCASE ALPHANUMERIC ONLY, AND THAT IS A SAFETY RULE AS WELL AS A NAMING ONE: the slug ends up
 * in a storage object path, so a dot or a slash in it would be a path-traversal in a string the
 * browser supplies.
 */
export const slugOfFamily = (family: string): string =>
  String(family ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const SLUG = /^[a-z0-9]{1,64}$/

/**
 * Read a stored `fontId`, or `null` if it is not a shape this product writes.
 *
 * ⚠️ `null` RATHER THAN A THROW, because every caller's correct response is "use the fallback" and a
 * throw at render time would turn one bad field into no poster at all.
 */
export function parseFontId(v: unknown): FontRef | null {
  if (typeof v !== 'string' || !v) return null
  if (v.startsWith('g:')) {
    const slug = v.slice(2)
    return SLUG.test(slug) ? { kind: 'library', id: v, slug } : null
  }
  if (v.startsWith('u:')) {
    const slug = v.slice(2)
    return SLUG.test(slug) ? { kind: 'own', id: v, slug } : null
  }
  return SLUG.test(v) ? { kind: 'bundled', id: v, slug: v } : null
}

export const libraryFontId = (family: string): string => `g:${slugOfFamily(family)}`
export const ownFontId = (family: string): string => `u:${slugOfFamily(family)}`

/** Is this id one of the two new kinds? ⚠️ Used to decide whether storage has to be consulted. */
export const needsStorage = (id: string): boolean => {
  const r = parseFontId(id)
  return !!r && r.kind !== 'bundled'
}

/**
 * The weight and style a (fontId, bold, italic) triple asks for.
 *
 * 🔴 ONE FUNCTION, SO THE PICKER, THE VALIDATOR, THE STORE AND THE RENDERER ALL ASK FOR THE SAME FILE.
 * The product only ever draws two weights and one italic — `TextStyle` has a `bold` boolean, not a
 * weight — so a family's useful files are exactly these three, and §3's "Regular, Bold and Italic" is
 * the same three.
 * ⚠️ THERE IS NO BOLD ITALIC. A fourth file for a combination no control can currently select would be
 * a file nothing asks for; `bold + italic` draws the italic face at its own weight, which is what a
 * word processor does with a family that has no bold italic.
 */
export interface FontFace {
  weight: 400 | 700
  style: 'normal' | 'italic'
}

export const faceFor = (bold: boolean, italic: boolean): FontFace =>
  italic ? { weight: 400, style: 'italic' } : { weight: bold ? 700 : 400, style: 'normal' }

/** The three faces a family may have, in the order the upload prompt offers them. */
/* ⚠️ THE FACE NAMES ARE MESSAGES (`weeklyPostApi.face`, Language Phase 1d Part 2). `label` is the en-GB word every
 * existing reader shows; the route sends `faceLabelFor(face, locale)` in the truck's language. */
const FACE_KEY = (f: FontFace): 'regular' | 'bold' | 'italic' =>
  f.style === 'italic' ? 'italic' : f.weight >= 700 ? 'bold' : 'regular'
/** A face's name in a locale's words — "Regular", "Bold", "Italic". ⚠️ en-GB when the locale is absent. */
export const faceLabelFor = (f: FontFace, locale?: string | null): string => weeklyPostWordsFor(locale)(`face.${FACE_KEY(f)}`)

export const FACES: readonly (FontFace & { label: string })[] = [
  { weight: 400, style: 'normal', label: faceLabelFor({ weight: 400, style: 'normal' }) },
  { weight: 700, style: 'normal', label: faceLabelFor({ weight: 700, style: 'normal' }) },
  { weight: 400, style: 'italic', label: faceLabelFor({ weight: 400, style: 'italic' }) },
]

export const faceKey = (f: FontFace): string => `${f.weight}${f.style === 'italic' ? 'i' : ''}`

/** ⚠️ 5MB, the brief's ceiling. A 5MB TTF is a very large CJK face; a Latin one is 30–200KB. */
export const MAX_FONT_BYTES = 5 * 1024 * 1024

/** The refusal for a WOFF/WOFF2, in the brief's words. ⛔ It says where to get a usable file. */
export const WOFF_REFUSAL = gbRefusalText('wp_font_woff')

/* ⚠️ en-GB (Language Phase 1d Part 2): the words are `weeklyPostApi.licenceTick` (US "license") and
 * `weeklyPostApi.fontUploadButton`; a screen in the truck's language reads those keys. */
export const LICENCE_TICK = weeklyPostWordsFor('en-GB')('licenceTick')
/** 🔴 §8 · The button beside the search box. ⚠️ "↑", not "⤒" — one glyph every font has. */
export const FONT_UPLOAD_BTN = weeklyPostWordsFor('en-GB')('fontUploadButton')
