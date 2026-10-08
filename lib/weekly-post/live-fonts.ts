// lib/weekly-post/live-fonts.ts — the editor's fonts: ONE fetch per face, measured AND painted with.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THE BROWSER NEEDS THE FONT **FILE** AND NOT A STYLESHEET (10 October 2026 · §2)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// §2 makes the editor draw every word live, and that has two requirements which both need the bytes:
//
//   1. **MEASURING.** `fitLines` shrinks, wraps and truncates using the font's own advance widths
//      (`ttf-metrics.ts`). Without the real file the live text would be laid out with somebody else's
//      widths — a long place name would "fit" on screen and be truncated in the PNG, which is worse
//      than a slow preview because it is wrong rather than late.
//   2. **PAINTING.** A browser can only draw in a family it has been given.
//
// 🔴 ONE `ArrayBuffer` SERVES BOTH. It is parsed by `readFontMetrics` and handed to `new FontFace(…)`,
// so a face costs one request. ⛔ A GOOGLE FONTS STYLESHEET WOULD HAVE PAINTED AND NOT MEASURED —
// the browser would have the glyphs and this module would have no widths.
//
// ══ ⛔ WHAT THIS CANNOT HAVE, AND IT IS A RULE OLDER THAN §2 ════════════════════════════════════════
// **AN UPLOADED FAMILY IS NEVER SENT TO THE BROWSER.** `font_sample` in the route says why in its own
// words: an uploaded font may be commercially licensed, and a readable URL from our domain is
// redistribution of somebody else's paid font. The GET refuses `u:` ids and this module does not ask.
// 🔴 SO A BOX IN AN UPLOADED FAMILY DRAWS **LIVE IN THE FALLBACK** and renders in the real font in the
// PNG. It is the one place the stage is knowingly not the poster, and it is named in the report.
//
// ⚠️ ITALIC IS REQUESTED AS THE UPRIGHT FACE, ON PURPOSE. None of the 21 bundled families has an
// italic file, so the renderer shears the upright one by 12° (`fauxItalic`) — which is what the bundle
// below will also decide, from the same `resolve()`. A LIBRARY family that does have a real italic
// draws sheared here and italic in the PNG; also in the report, also small.

import { useEffect, useState } from 'react'
import { makeFontBundle, satoriFamily, type FontBundle, type FontFile } from './font-bundle'
import { FALLBACK_FONT_ID } from './font-refs'

/**
 * The CSS family name the browser is given for one of our families.
 *
 * ⛔ **IT IS NOT `satoriFamily`'s ANSWER, AND IT CANNOT BE.** A library id is `g:lobster`, and a colon
 * is not legal in a CSS font-family identifier — `new FontFace('g:lobster', …)` throws and
 * `style.fontFamily = 'g:lobster'` is dropped by the parser. satori matches its registered names as
 * plain strings and never parses CSS, so it is free of the problem this has to solve.
 * 🔴 ONE FUNCTION, USED BY THE REGISTRATION **AND** BY `LivePoster`'s style mapper — a second spelling
 * would register a face under one name and ask for it under another, and every box would draw in the
 * browser's default font with no error anywhere.
 */
export const liveFamily = (family: string): string =>
  `hgf-${family.replace(/[^A-Za-z0-9]+/g, '-')}`

/** One face to fetch. ⚠️ `style` is always `normal` — see the header. */
export interface LiveFaceRef {
  id: string
  bold: boolean
}

export interface LiveFonts {
  /** Null until the first face has arrived. ⚠️ Nothing is drawn live before then. */
  bundle: FontBundle | null
  /** Ids the browser could not have — an uploaded family, or one that failed to load. For the note. */
  unavailable: string[]
}

/** ⚠️ MODULE SCOPE, SO SWITCHING DESIGN OR REMOUNTING COSTS NOTHING. Keyed by (token, id, weight). */
const faceCache = new Map<string, Promise<FontFile | null>>()
/** Which aliases have been added to `document.fonts`. ⚠️ Adding one twice is harmless but pointless. */
const registered = new Set<string>()

async function fetchFace(token: string, id: string, bold: boolean): Promise<FontFile | null> {
  const key = `${token}|${id}|${bold ? 700 : 400}`
  const hit = faceCache.get(key)
  if (hit) return hit
  const run = (async (): Promise<FontFile | null> => {
    const qs = new URLSearchParams({ token, font: id, w: bold ? '700' : '400', s: 'normal' })
    const res = await fetch(`/api/weekly-post?${qs.toString()}`)
    /* ⚠️ A REFUSAL IS NOT AN ERROR HERE. 403 is an uploaded family — the expected answer, not a
     * failure — and 404 is a family the server could not load. Either way there is no file, the
     * caller records the id, and `FontBundle.resolve` falls back exactly as the renderer would. */
    if (!res.ok) return null
    const data = new Uint8Array(await res.arrayBuffer())
    /* 🔴 THE FACE THE SERVER **ACTUALLY RESOLVED**, from its own headers. Asking for Bold in a
     * single-weight family returns the 400 file, and keying it as 700 in this bundle would make
     * `resolve()` hand out a face the server does not have. */
    const family = res.headers.get('X-Hg-Font-Family') || id
    const [w, st] = (res.headers.get('X-Hg-Font-Face') || '400|normal').split('|')
    return {
      id,
      family,
      weight: w === '700' ? 700 : 400,
      style: st === 'italic' ? 'italic' : 'normal',
      data,
    }
  })()
  faceCache.set(key, run)
  /* ⚠️ A REJECTED PROMISE MUST NOT STAY IN THE CACHE, or one dropped connection would leave this
   * family permanently unavailable for the life of the page. */
  run.catch(() => faceCache.delete(key))
  return run
}

/**
 * Register a file with the browser under its alias, and resolve when it is usable.
 *
 * 🔴 IT IS AWAITED. `document.fonts.add()` is not enough — the face is parsed asynchronously, and a
 * frame drawn before it finishes draws in the default font. ⚠️ THE EDITOR THEREFORE SHOWS NOTHING LIVE
 * until the fonts are ready, rather than showing one frame of the wrong typeface.
 */
async function registerFace(file: FontFile): Promise<void> {
  const alias = liveFamily(satoriFamily(file))
  const key = `${alias}|${file.weight}|${file.style}`
  if (registered.has(key)) return
  /* ⚠️ A COPY OF THE BYTES. `FontFace` may take ownership of the buffer it is given, and the same
   * bytes are still needed by `readFontMetrics` inside the bundle. */
  const face = new FontFace(alias, file.data.slice().buffer as ArrayBuffer, {
    weight: String(file.weight),
    style: file.style,
  })
  await face.load()
  document.fonts.add(face)
  registered.add(key)
}

/**
 * Load every face a design needs, and hand back a bundle the live draw can measure with.
 *
 * ⚠️ `FALLBACK_FONT_ID` IS ALWAYS INCLUDED, because `makeFontBundle` throws without it — by design:
 * every `resolve()` has to be able to return something, and "Powered by HatchGrab" is drawn in it.
 * This is the same thing `bundleFor` does on the server.
 */
export function useLiveFonts(token: string, faces: readonly LiveFaceRef[]): LiveFonts {
  /* ⚠️ THE **KEY** IS WHAT THE EFFECT DEPENDS ON, not the array. `fontsUsedBy` builds a fresh array on
   * every render, so depending on it would refetch (from cache) and re-set state for ever. */
  const key = JSON.stringify(
    [...new Set([`${FALLBACK_FONT_ID}|400`, ...faces.map(f => `${f.id}|${f.bold ? 700 : 400}`)])].sort(),
  )
  const [state, setState] = useState<LiveFonts>({ bundle: null, unavailable: [] })

  useEffect(() => {
    let alive = true
    const wanted: LiveFaceRef[] = (JSON.parse(key) as string[]).map(s => {
      const [id, w] = s.split('|')
      return { id, bold: w === '700' }
    })
    void (async () => {
      const got = await Promise.all(wanted.map(f => fetchFace(token, f.id, f.bold).catch(() => null)))
      const files = got.filter((f): f is FontFile => !!f)
      const unavailable = [...new Set(wanted.filter((_, i) => !got[i]).map(f => f.id))]
      if (!files.some(f => f.id === FALLBACK_FONT_ID)) {
        /* ⛔ NO FALLBACK ⇒ NO LIVE DRAW. `makeFontBundle` would throw, and a stage that threw would
         * take the whole editor down. The PNG is still there, which is the honest degradation. */
        if (alive) setState({ bundle: null, unavailable })
        return
      }
      await Promise.all(files.map(f => registerFace(f).catch(() => undefined)))
      if (alive) setState({ bundle: makeFontBundle(files), unavailable })
    })()
    return () => { alive = false }
  }, [token, key])

  return state
}
