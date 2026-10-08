// lib/weekly-post/ttf-metrics.ts — how wide is this string, in this font, at this size?
//
// ── 🔴 WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────────────────────────
// The weekly post must NEVER overflow a box. The operator drags three outlines onto their own artwork
// and from then on HatchGrab fills seven days into them unattended — so "Lavenham Village Hall" has to
// shrink to fit, and a 60-character place name has to shrink further and then truncate. That decision
// has to be made BEFORE rendering, which means measuring text without drawing it.
//
// 🔴 NOTHING IN THE DEPENDENCY TREE CAN DO IT. satori measures internally and exposes nothing; there is
// no canvas, no `measureText`, no opentype.js. The alternative — render, decode the PNG, look at the
// pixels, shrink, render again — is a loop of 40ms renders per box per day, and it would still be
// guessing which size to try next.
//
// So this reads the font's own tables: `head` for unitsPerEm, `cmap` for codepoint → glyph, `hmtx` for
// each glyph's advance width. That is the same data the renderer lays out with, so the two agree.
//
// ⚠️ ADVANCE WIDTHS, NOT KERNING OR SHAPING. No `kern`/`GPOS` pair adjustment and no ligature
// substitution, so a measured string can be a few tenths of a percent wider than the rendered one —
// never narrower, because kerning in these faces pulls pairs together rather than apart. `fitText`
// adds a safety margin on top, and the render harness checks the actual pixels. For Latin text in the
// 21 bundled families this is exact to within a pixel at the sizes a poster uses.
//
// ⚠️ PURE AND SYNCHRONOUS. It takes a Buffer the caller already has, so the harness drives it with the
// committed font files and no I/O of its own.

export interface FontMetrics {
  unitsPerEm: number
  /** Typographic ascender/descender in font units, for line height. */
  ascender: number
  descender: number
  /** Advance width in font units, by codepoint. Missing codepoints fall back to `fallbackAdvance`. */
  advance: Map<number, number>
  fallbackAdvance: number
}

/**
 * ══ 🔴 THE METRICS PATH TAKES **BYTES**, NOT A `Buffer` (10 October 2026) ═════════════════════════
 *
 * ⛔ IT TOOK A NODE `Buffer` AND READ IT WITH `readUInt16BE`, WHICH THE BROWSER DOES NOT HAVE. That was
 * right while the only caller was the renderer. §2 of the 10 October brief puts the EDITOR's live text
 * through the same fitting rules as the PNG — which means the browser has to measure with the same
 * advance widths, out of the same font file.
 * 🔴 A `Uint8Array` AND A `DataView` READ IDENTICALLY IN BOTH, and a Node `Buffer` **is** a
 * `Uint8Array`, so every existing caller compiles and behaves exactly as before. ⚠️ ONE PARSER, ONE SET
 * OF NUMBERS: a second implementation for the browser would be a second answer to "how wide is this
 * string", which is the drift `fit.ts` exists to prevent.
 * ⚠️ THE **NAME** READER BELOW STILL TAKES A `Buffer`. It decodes UTF-16 and latin1 text, which Node
 * does for free and the browser does not, and nothing in the browser asks a font what it is called.
 */
export type FontBytes = Uint8Array

const viewOf = (b: FontBytes): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength)
const u16 = (b: FontBytes, o: number) => viewOf(b).getUint16(o, false)
const i16 = (b: FontBytes, o: number) => viewOf(b).getInt16(o, false)
const u32 = (b: FontBytes, o: number) => viewOf(b).getUint32(o, false)
/** ⚠️ A FOUR-BYTE TAG IS ASCII BY SPEC, so this needs no decoder and works in both. */
const tag4 = (b: FontBytes, o: number) =>
  String.fromCharCode(b[o] ?? 0, b[o + 1] ?? 0, b[o + 2] ?? 0, b[o + 3] ?? 0)
const hex4 = (b: FontBytes, o: number) =>
  [0, 1, 2, 3].map(i => (b[o + i] ?? 0).toString(16).padStart(2, '0')).join('')

/**
 * Read the tables `measureText` needs out of a TTF/OTF.
 *
 * 🔴 IT THROWS ON ANYTHING IT CANNOT READ rather than returning a guess. A silently wrong unitsPerEm
 * would make every box's shrink-to-fit wrong by a constant factor, which looks like a design bug and
 * is almost impossible to trace back to here.
 */
/**
 * The table directory — which tables this file has and where.
 *
 * 🔴 EXTRACTED 6 October 2026 SO THE `name` READER USES THE SAME SNIFF AND THE SAME WALK. A second
 * copy would be a second opinion on "is this a font", and the two would disagree on exactly the file
 * that matters: a truck's uploaded one.
 * ⚠️ WOFF AND WOFF2 FAIL HERE, BY MAGIC, WITH THEIR OWN WORDS — `wOFF` and `wOF2` are not fonts this
 * renderer can read, and telling the operator "unknown magic 0x774f4632" would be useless.
 */
export function tableDirectory(buf: FontBytes): Map<string, { off: number; len: number }> {
  if (buf.length < 12) throw new Error('font: too short to be a font')
  const magic = tag4(buf, 0)
  if (magic === 'wOFF' || magic === 'wOF2') throw new Error(`font: this is a ${magic === 'wOFF' ? 'WOFF' : 'WOFF2'} file, not a TTF or OTF`)
  const tag = u32(buf, 0)
  // 0x00010000 = TrueType outlines · 'true' = older Apple TTF · 'OTTO' = CFF outlines
  const isTtf = tag === 0x00010000 || magic === 'true'
  const isOtf = magic === 'OTTO'
  /* ⛔ `ttcf` IS A COLLECTION, NOT A FONT. It holds several faces and its header is a different shape;
   * accepting it would read a table directory out of the wrong offset and produce nonsense metrics. */
  if (magic === 'ttcf') throw new Error('font: this is a font collection (.ttc), not a single TTF or OTF')
  if (!isTtf && !isOtf) throw new Error(`font: unknown magic 0x${hex4(buf, 0)}`)

  const numTables = u16(buf, 4)
  const tables = new Map<string, { off: number; len: number }>()
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (rec + 16 > buf.length) break
    tables.set(tag4(buf, rec), { off: u32(buf, rec + 8), len: u32(buf, rec + 12) })
  }
  return tables
}

export function readFontMetrics(buf: FontBytes): FontMetrics {
  const tables = tableDirectory(buf)

  const head = tables.get('head')
  const hhea = tables.get('hhea')
  const hmtx = tables.get('hmtx')
  const cmap = tables.get('cmap')
  const maxp = tables.get('maxp')
  if (!head || !hhea || !hmtx || !cmap || !maxp) {
    throw new Error(`font: missing a required table (have ${[...tables.keys()].join(',')})`)
  }

  const unitsPerEm = u16(buf, head.off + 18)
  if (!unitsPerEm) throw new Error('font: unitsPerEm is 0')
  const ascender = i16(buf, hhea.off + 4)
  const descender = i16(buf, hhea.off + 6)
  const numberOfHMetrics = u16(buf, hhea.off + 34)
  const numGlyphs = u16(buf, maxp.off + 4)

  /* ── hmtx: `numberOfHMetrics` (advance, lsb) pairs, then lsb-only entries ─────────────────────────
   * ⚠️ GLYPHS PAST THE PAIRS REUSE THE LAST ADVANCE. That is the format, not a shortcut — monospaced
   * and condensed faces rely on it, and treating those glyphs as width 0 would make long strings
   * measure far too narrow and overflow. */
  const advanceOfGlyph = (gid: number): number => {
    if (gid < 0 || gid >= numGlyphs) return 0
    const i = Math.min(gid, numberOfHMetrics - 1)
    const at = hmtx.off + i * 4
    return at + 2 <= buf.length ? u16(buf, at) : 0
  }

  const glyphOf = buildCmap(buf, cmap.off)
  /* ⚠️ THE FALLBACK IS THE WIDTH OF A SPACE, NOT ZERO. An unmapped codepoint (a stray emoji, a
   * character the family does not cover) renders as .notdef or nothing; measuring it as 0 would let a
   * string of them overflow silently. A space's width is the honest conservative answer. */
  const spaceGid = glyphOf(0x20)
  const fallbackAdvance = spaceGid ? advanceOfGlyph(spaceGid) : Math.round(unitsPerEm / 4)

  /* 🔴 BUILT EAGERLY FOR THE RANGES A POSTER ACTUALLY USES, and lazily for anything else, because
   * walking every codepoint of a 60,000-glyph font on every render would cost more than the render. */
  const advance = new Map<number, number>()
  const add = (cp: number) => { const g = glyphOf(cp); if (g) advance.set(cp, advanceOfGlyph(g)) }
  for (let cp = 0x20; cp <= 0x7e; cp++) add(cp)              // ASCII printable
  for (const cp of [0xa0, 0xa3, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026, 0x00b7]) add(cp)
  // £ en/em dash, curly quotes, ellipsis, middot — every separator this feature can emit

  return { unitsPerEm, ascender, descender, advance, fallbackAdvance }
}

/**
 * codepoint → glyph id, from the best `cmap` subtable available.
 *
 * ⚠️ FORMAT 4 AND FORMAT 12, AND IN THAT ORDER OF PREFERENCE BY PLATFORM. Format 4 covers the BMP and
 * is what every one of the 21 bundled families ships; format 12 appears on the larger ones and covers
 * the astral planes. A font with neither is rejected by the caller rather than measured as all-zeros.
 */
function buildCmap(buf: FontBytes, off: number): (cp: number) => number {
  const numSubtables = u16(buf, off + 2)
  let best: { format: number; off: number } | null = null
  for (let i = 0; i < numSubtables; i++) {
    const rec = off + 4 + i * 8
    const platform = u16(buf, rec)
    const encoding = u16(buf, rec + 2)
    const subOff = off + u32(buf, rec + 4)
    if (subOff + 4 > buf.length) continue
    const format = u16(buf, subOff)
    const unicode =
      (platform === 3 && (encoding === 1 || encoding === 10)) ||
      platform === 0
    if (!unicode) continue
    if (format === 12) best = { format, off: subOff }                   // widest coverage, prefer it
    else if (format === 4 && (!best || best.format !== 12)) best = { format, off: subOff }
  }
  if (!best) throw new Error('font: no usable unicode cmap subtable')

  if (best.format === 12) {
    const nGroups = u32(buf, best.off + 12)
    const base = best.off + 16
    return (cp: number) => {
      let lo = 0, hi = nGroups - 1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const g = base + mid * 12
        const start = u32(buf, g), end = u32(buf, g + 4)
        if (cp < start) hi = mid - 1
        else if (cp > end) lo = mid + 1
        else return u32(buf, g + 8) + (cp - start)
      }
      return 0
    }
  }

  // ── format 4 ──────────────────────────────────────────────────────────────────────────────────────
  const segCountX2 = u16(buf, best.off + 6)
  const segCount = segCountX2 / 2
  const endCodes = best.off + 14
  const startCodes = endCodes + segCountX2 + 2
  const idDeltas = startCodes + segCountX2
  const idRangeOffsets = idDeltas + segCountX2
  return (cp: number) => {
    if (cp > 0xffff) return 0
    for (let s = 0; s < segCount; s++) {
      if (u16(buf, endCodes + s * 2) < cp) continue
      const start = u16(buf, startCodes + s * 2)
      if (start > cp) return 0
      const rangeOffset = u16(buf, idRangeOffsets + s * 2)
      if (rangeOffset === 0) return (cp + i16(buf, idDeltas + s * 2)) & 0xffff
      /* ⚠️ THE GLYPH-ID ARRAY IS ADDRESSED RELATIVE TO THE idRangeOffset FIELD ITSELF, which is the
       * one genuinely strange thing in this format and the usual source of off-by-one glyph lookups. */
      const at = idRangeOffsets + s * 2 + rangeOffset + (cp - start) * 2
      if (at + 2 > buf.length) return 0
      const gid = u16(buf, at)
      return gid === 0 ? 0 : (gid + i16(buf, idDeltas + s * 2)) & 0xffff
    }
    return 0
  }
}

/**
 * The width of `text` in pixels at `fontSize`, and the line height.
 *
 * ⚠️ `letterSpacing` IS IN PIXELS AND APPLIES BETWEEN characters, not after the last one — the same
 * rule CSS uses, so the measurement matches what the renderer will do with the same value.
 */
export function measureText(
  text: string,
  m: FontMetrics,
  fontSize: number,
  letterSpacing = 0,
): number {
  if (!text) return 0
  let units = 0
  let chars = 0
  /* ⚠️ ITERATED BY CODE POINT (`for…of`), NOT BY UTF-16 UNIT. A surrogate pair measured as two
   * unmapped units would come out as two fallback widths instead of one glyph. */
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    units += m.advance.get(cp) ?? m.fallbackAdvance
    chars++
  }
  const width = (units / m.unitsPerEm) * fontSize
  return width + Math.max(0, chars - 1) * letterSpacing
}

/** The natural line height in pixels: ascender − descender, scaled. */
export function lineHeightPx(m: FontMetrics, fontSize: number): number {
  return ((m.ascender - m.descender) / m.unitsPerEm) * fontSize
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE `name` TABLE — WHAT THE FONT CALLS ITSELF (6 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// A truck uploads `MyShopFont-Bold.ttf`. ⛔ THE FILENAME IS NOT EVIDENCE: it is whatever the file was
// called on their machine, it is supplied by the browser, and "Bold" in it may be a lie. The font's
// own `name` table says what family it belongs to and which face it is, and that is what §3 means by
// *"Take the family name and weight from the font's own name table."*
//
// ⚠️ IT IS READ IN THE SAME PASS AND THE SAME PARSER AS THE METRICS, deliberately: a file whose name
// table cannot be read is a file we are not going to draw with either, so there is one place that
// decides "this is a usable font" rather than two that could disagree.

export interface FontNames {
  /** name id 1 — the typographic family, e.g. "Playfair Display". */
  family: string
  /** name id 2 — the subfamily, e.g. "Regular", "Bold", "Italic", "Bold Italic". */
  subfamily: string
  /** name id 4 — the full name, kept for the report and for a display-name default. */
  full: string
  /** name id 16, when present — the PREFERRED family. See the note in `readFontNames`. */
  preferredFamily: string | null
  /** name id 17, when present — the preferred subfamily. */
  preferredSubfamily: string | null
}

/**
 * Read the `name` table.
 *
 * 🔴 NAME IDS 16/17 BEAT 1/2 WHERE THEY EXIST, AND THAT IS NOT A PREFERENCE — IT IS THE SPEC. A family
 * with more than four faces cannot express itself in ids 1 and 2, because the old Windows model only
 * had Regular/Bold/Italic/Bold-Italic. So a nine-weight family ships id 1 = "Roboto Light" and id 16 =
 * "Roboto" with id 17 = "Light". Reading only id 1 would file every weight of a large family as a
 * SEPARATE family — nine "families" with one face each, which is exactly the shape §3's
 * "Regular, Bold and Italic" grouping cannot work with.
 *
 * ⚠️ PLATFORM 3 (Windows, UTF-16BE) FIRST, THEN PLATFORM 1 (Mac, single byte). Nearly every font has
 * both; the Windows records are UTF-16 and are the ones with the full character set.
 */
export function readFontNames(buf: Buffer): FontNames {
  const tables = tableDirectory(buf)
  const name = tables.get('name')
  if (!name) throw new Error('font: no name table — we cannot tell what this font is called')

  const format = u16(buf, name.off)
  const count = u16(buf, name.off + 2)
  const stringOffset = u16(buf, name.off + 4)
  if (format !== 0 && format !== 1) throw new Error(`font: name table format ${format} is not one we read`)

  /** The best record for one name id, as a decoded string. */
  const pick = (nameId: number): string | null => {
    let best: { score: number; text: string } | null = null
    for (let i = 0; i < count; i++) {
      const rec = name.off + 6 + i * 12
      if (rec + 12 > buf.length) break
      if (u16(buf, rec + 6) !== nameId) continue
      const platform = u16(buf, rec)
      const encoding = u16(buf, rec + 2)
      const language = u16(buf, rec + 4)
      const len = u16(buf, rec + 8)
      const off = name.off + stringOffset + u16(buf, rec + 10)
      if (off + len > buf.length || len === 0) continue

      /* ⚠️ ENGLISH IS PREFERRED BUT NOT REQUIRED. A font with only a Japanese name record must still
       * yield a family name — the truck can rename it for display, and refusing the upload because we
       * did not like its language would be refusing a font that works perfectly. */
      const isWindowsUnicode = platform === 3 && (encoding === 1 || encoding === 10)
      const isMacRoman = platform === 1 && encoding === 0
      if (!isWindowsUnicode && !isMacRoman) continue
      const english = isWindowsUnicode ? (language & 0x3ff) === 0x09 : language === 0
      const score = (isWindowsUnicode ? 2 : 0) + (english ? 1 : 0)
      if (best && best.score >= score) continue

      const raw = buf.slice(off, off + len)
      const text = isWindowsUnicode
        ? raw.toString('utf16le').split('').length && swapUtf16(raw)
        : raw.toString('latin1')
      const clean = String(text).replace(/\u0000/g, '').trim()
      if (clean) best = { score, text: clean }
    }
    return best ? best.text : null
  }

  const family = pick(1)
  if (!family) throw new Error('font: the name table has no family name')
  return {
    family,
    subfamily: pick(2) ?? 'Regular',
    full: pick(4) ?? family,
    preferredFamily: pick(16),
    preferredSubfamily: pick(17),
  }
}

/** UTF-16**BE** → a JS string. ⚠️ Node has no 'utf16be', so the bytes are swapped into LE first. */
function swapUtf16(raw: Buffer): string {
  const swapped = Buffer.allocUnsafe(raw.length - (raw.length % 2))
  for (let i = 0; i + 1 < raw.length; i += 2) { swapped[i] = raw[i + 1]; swapped[i + 1] = raw[i] }
  return swapped.toString('utf16le')
}

/**
 * The family and face this file IS, as the product models them.
 *
 * 🔴 IT RETURNS ONE OF THE THREE FACES THE PRODUCT DRAWS (`font-refs.ts`'s `FACES`) AND NOTHING ELSE.
 * A font can call itself "SemiBold", "Black", "Light Italic" or "Condensed Medium Oblique"; this
 * feature has a `bold` boolean and an `italic` boolean, so those have to land on one of three files.
 *
 * ⚠️ THE RULES, IN ORDER, AND EACH ONE EXISTS BECAUSE A REAL FONT BREAKS THE ONE BEFORE IT:
 *   1. **the `OS/2` weight class**, when it is there — the font's own numeric answer, 100–900;
 *   2. **the subfamily words** otherwise — "Bold", "Black", "Heavy", "Semibold" all read as bold;
 *   3. **italic from either** the `head` table's italic bit **or** the words, because plenty of
 *      oblique faces set one and not the other.
 * ⛔ ANYTHING 600 OR ABOVE IS "BOLD" AND ANYTHING BELOW IS "REGULAR". A truck who uploads a Light and
 * a Regular would have the second overwrite the first, which is why the upload flow NAMES the face it
 * decided and lets them see it before saving.
 */
export function faceOfFont(buf: Buffer, names: FontNames): { family: string; weight: 400 | 700; style: 'normal' | 'italic'; saidWeight: number | null; saidSubfamily: string } {
  const tables = tableDirectory(buf)
  const os2 = tables.get('OS/2')
  const head = tables.get('head')
  const saidWeight = os2 && os2.off + 6 <= buf.length ? u16(buf, os2.off + 4) : null
  /* ⚠️ `head.macStyle` BIT 1 IS ITALIC (bit 0 is bold). Read from the table rather than from the name,
   * because an oblique face often calls itself "Oblique" and sets the bit. */
  const macStyle = head && head.off + 46 <= buf.length ? u16(buf, head.off + 44) : 0
  const subfamily = names.preferredSubfamily ?? names.subfamily
  const words = `${subfamily} ${names.full}`.toLowerCase()

  const italicByBit = (macStyle & 0x02) !== 0
  const italicByWord = /\b(italic|oblique)\b/.test(words)
  const style: 'normal' | 'italic' = italicByBit || italicByWord ? 'italic' : 'normal'

  let weight: 400 | 700
  if (saidWeight && saidWeight >= 100 && saidWeight <= 1000) weight = saidWeight >= 600 ? 700 : 400
  else weight = /\b(bold|black|heavy|semibold|extrabold|ultrabold)\b/.test(words) ? 700 : 400

  /* ⚠️ THE PREFERRED FAMILY WINS, so "Roboto Light" + "Light" files as Roboto. See `readFontNames`. */
  return { family: names.preferredFamily ?? names.family, weight, style, saidWeight, saidSubfamily: subfamily }
}
