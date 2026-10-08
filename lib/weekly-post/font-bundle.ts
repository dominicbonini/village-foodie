// lib/weekly-post/font-bundle.ts — the fonts ONE render has available, resolved before it starts.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THE RENDERER IS **HANDED** ITS FONTS RATHER THAN FETCHING THEM
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Until today every font was a committed file, so `render.ts` could call `loadFontMetrics()`
// synchronously in the middle of laying a box out. A library font lives in object storage and an
// uploaded one lives in a truck's own folder, so getting its bytes is `await`. ⛔ AND `boxEl` CANNOT
// BE ASYNC: it is called inside `week.days.forEach(...)`, it runs `fitLines` — a synchronous search
// over font metrics — and making it async would make the whole element tree a promise graph.
//
// 🔴 SO THE I/O HAPPENS FIRST AND THE RENDERER STAYS SYNCHRONOUS. The caller works out which fonts a
// design needs, loads them, and passes this bundle in. **That is the same discipline the background
// picture already follows** — `render.ts` is given a data URI, not a path, because "the renderer does
// not do I/O" is what makes it testable and what keeps one render one round trip.
//
// ⚠️ THE BUNDLE IS ALSO WHERE "WHAT IF THE FONT IS MISSING?" IS ANSWERED, ONCE. A truck can delete an
// uploaded family that a saved design still names. Every path through `resolve()` returns a usable
// face, so a poster always renders — in Oswald, if it has to.

import { readFontMetrics, type FontMetrics } from './ttf-metrics'
import { FALLBACK_FONT_ID, faceFor, type FontFace } from './font-refs'

/** One font file, loaded. ⚠️ `metrics` is parsed once per file per process, not per box. */
export interface FontFile {
  /** The font id this file belongs to — `oswald`, `g:lobster`, `u:myshopfont`. */
  id: string
  /** The family name as the font calls itself. Shown to the operator; NOT what satori is told. */
  family: string
  weight: 400 | 700
  style: 'normal' | 'italic'
  /**
   * ══ 🔴 `Uint8Array`, NOT `Buffer` — 10 OCTOBER 2026 (§2) ════════════════════════════════════════
   * ⛔ `Buffer` IS NODE-ONLY, and §2 needs this bundle built IN THE BROWSER: the live editor measures
   * with the same font metrics the renderer uses, which means parsing the same bytes. A `Buffer` IS a
   * `Uint8Array`, so every server caller is unchanged and `readFontMetrics` already takes the wider
   * type (`FontBytes`). ⚠️ satori accepts a `Uint8Array` too.
   */
  data: Uint8Array
}

/** What `boxEl` needs to lay a box out, and `lineEl` to draw it. */
export interface ResolvedFace {
  /** 🔴 WHAT SATORI IS TOLD. See `satoriFamily` below — it is not always the real family name. */
  family: string
  weight: 400 | 700
  style: 'normal' | 'italic'
  metrics: FontMetrics
  /**
   * true = draw the 12° shear, because this family has no italic FILE.
   *
   * 🔴 THIS IS THE FIELD §1 ASKS FOR: *"Where a real italic file exists, use it instead of the 12°
   * shear. Keep the shear only as the fallback."* The renderer no longer decides — it asks.
   */
  fauxItalic: boolean
  /** true = the design asked for bold and this family has no 700 file. Reported, never silent. */
  fauxBold: boolean
}

export interface FontBundle {
  resolve(id: string, bold: boolean, italic: boolean): ResolvedFace
  /** satori's `fonts` option: one entry per distinct (family, weight, style). */
  satoriFonts(): Array<{ name: string; data: Uint8Array; weight: 400 | 700; style: 'normal' | 'italic' }>
  /** Which ids this bundle actually holds files for. For the report and the harness. */
  ids(): string[]
}

/**
 * ══ 🔴 THE NAME SATORI IS GIVEN IS THE **FONT ID** FOR ANYTHING NOT BUNDLED ═══════════════════════
 *
 * satori matches `fontFamily` against the `name` of a registered font, so the name only has to be
 * consistent — and it has to be UNIQUE.
 *
 * ⛔ AND "THE REAL FAMILY NAME" IS NOT UNIQUE. A truck can upload a file whose name table says
 * "Oswald" — their own licensed cut of it, or a modified one. Registering both under "Oswald" would
 * make satori pick one arbitrarily, and the poster would be drawn in whichever it chose: a truck's
 * uploaded font silently replacing the bundled one across every design they have, or the reverse.
 *
 * ⚠️ THE 21 BUNDLED FAMILIES KEEP THEIR REAL NAMES, because every design saved before today renders
 * through them and this must not change one pixel of that output. Their ids are also unique, so the
 * only thing the real name buys is that the output is byte-identical — which is the whole promise.
 */
export const satoriFamily = (file: { id: string; family: string }): string =>
  file.id.includes(':') ? file.id : file.family

const keyOf = (id: string, f: FontFace) => `${id}|${f.weight}|${f.style}`

/**
 * Build a bundle from a set of loaded files.
 *
 * ⚠️ IT REQUIRES A FALLBACK FACE AND SAYS SO LOUDLY. Every `resolve()` must return something, so the
 * bundle has to contain at least Oswald regular. A bundle built without it would throw on the first
 * missing font — at render time, on somebody's poster.
 */
/**
 * ══ 🔴 THE BYTES, AS SATORI'S TYPES WANT THEM — 10 OCTOBER 2026 (§2) ══════════════════════════════
 *
 * ⛔ `FontFile.data` IS A `Uint8Array` NOW, because the live editor builds a bundle in the BROWSER from
 * fetched bytes and `Buffer` does not exist there. satori's own `FontOptions` still asks for
 * `ArrayBuffer | Buffer`, which is a NOMINAL difference and not a real one — it reads the bytes.
 * ⚠️ IT DOES NOT COPY ON THE SERVER. Every server caller already hands in a `Buffer`, so this returns
 * the same object; only a browser-built bundle (which never reaches satori) would allocate.
 */
export const asFontBuffer = (data: Uint8Array): Buffer =>
  Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength)

export function makeFontBundle(files: readonly FontFile[]): FontBundle {
  const byKey = new Map<string, FontFile>()
  const metricsCache = new Map<string, FontMetrics>()
  for (const f of files) byKey.set(keyOf(f.id, f), f)

  const fallback = byKey.get(keyOf(FALLBACK_FONT_ID, { weight: 400, style: 'normal' }))
  if (!fallback) {
    throw new Error(`font bundle: no fallback — ${FALLBACK_FONT_ID} regular must always be loaded`)
  }

  /* ⚠️ METRICS ARE PARSED LAZILY AND CACHED PER FILE. A design with five boxes in one family would
   * otherwise re-read the same 86KB of tables five times per render. */
  const metricsOf = (f: FontFile): FontMetrics => {
    const k = keyOf(f.id, f)
    const hit = metricsCache.get(k)
    if (hit) return hit
    const m = readFontMetrics(f.data)
    metricsCache.set(k, m)
    return m
  }

  const faceOf = (f: FontFile, fauxItalic: boolean, fauxBold: boolean): ResolvedFace => ({
    family: satoriFamily(f),
    weight: f.weight,
    style: f.style,
    metrics: metricsOf(f),
    fauxItalic,
    fauxBold,
  })

  return {
    resolve(id, bold, italic) {
      /* 🔴 THE LADDER, AND EVERY RUNG IS A REAL CASE:
       *   1. exactly what was asked for;
       *   2. italic asked for, no italic file → the upright face, SHEARED (`fauxItalic`);
       *   3. bold asked for, no 700 file → the 400 file, flagged (`fauxBold`) — six of the bundled
       *      families are single-weight and the toolbar hides their Bold button, but a SAVED design
       *      may already carry `bold: true` from before its family was changed;
       *   4. nothing for this id at all → Oswald. A truck deleted an uploaded font a design still
       *      names, and a poster in Oswald beats no poster. */
      const want = faceFor(bold, italic)
      const exact = byKey.get(keyOf(id, want))
      if (exact) return faceOf(exact, false, false)

      if (italic) {
        const upright = byKey.get(keyOf(id, { weight: bold ? 700 : 400, style: 'normal' }))
          ?? byKey.get(keyOf(id, { weight: 400, style: 'normal' }))
        if (upright) return faceOf(upright, true, bold && upright.weight !== 700)
      }
      const regular = byKey.get(keyOf(id, { weight: 400, style: 'normal' }))
      if (regular) return faceOf(regular, false, bold)

      return faceOf(fallback, italic, false)
    },

    satoriFonts() {
      /* ⚠️ KEYED BY (name, weight, style). Passing one family twice at the same weight makes satori
       * warn and pick arbitrarily; passing it once per face is what lets a design use regular, bold
       * and italic of the same family in different boxes. */
      const seen = new Set<string>()
      const out: Array<{ name: string; data: Uint8Array; weight: 400 | 700; style: 'normal' | 'italic' }> = []
      for (const f of byKey.values()) {
        const name = satoriFamily(f)
        const k = `${name}|${f.weight}|${f.style}`
        if (seen.has(k)) continue
        seen.add(k)
        out.push({ name, data: f.data, weight: f.weight, style: f.style })
      }
      return out
    },

    ids() { return [...new Set([...byKey.values()].map(f => f.id))] },
  }
}
