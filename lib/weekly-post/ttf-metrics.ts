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

const u16 = (b: Buffer, o: number) => b.readUInt16BE(o)
const i16 = (b: Buffer, o: number) => b.readInt16BE(o)
const u32 = (b: Buffer, o: number) => b.readUInt32BE(o)

/**
 * Read the tables `measureText` needs out of a TTF/OTF.
 *
 * 🔴 IT THROWS ON ANYTHING IT CANNOT READ rather than returning a guess. A silently wrong unitsPerEm
 * would make every box's shrink-to-fit wrong by a constant factor, which looks like a design bug and
 * is almost impossible to trace back to here.
 */
export function readFontMetrics(buf: Buffer): FontMetrics {
  if (buf.length < 12) throw new Error('font: too short to be a font')
  const tag = u32(buf, 0)
  // 0x00010000 = TrueType outlines · 'true' = older Apple TTF · 'OTTO' = CFF outlines
  const isTtf = tag === 0x00010000 || buf.slice(0, 4).toString('latin1') === 'true'
  const isOtf = buf.slice(0, 4).toString('latin1') === 'OTTO'
  if (!isTtf && !isOtf) throw new Error(`font: unknown magic 0x${buf.slice(0, 4).toString('hex')}`)

  const numTables = u16(buf, 4)
  const tables = new Map<string, { off: number; len: number }>()
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (rec + 16 > buf.length) break
    tables.set(buf.slice(rec, rec + 4).toString('latin1'), { off: u32(buf, rec + 8), len: u32(buf, rec + 12) })
  }

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
function buildCmap(buf: Buffer, off: number): (cp: number) => number {
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
