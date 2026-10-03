// lib/weekly-post/contrast.ts — "Keep text readable": white text on a white part of the artwork.
//
// ── 🔴 THE PROBLEM ─────────────────────────────────────────────────────────────────────────────────
// The operator picks a text colour once and then seven days of text land on whatever their artwork
// happens to have behind those boxes. A design that reads perfectly on the dark half of a photo
// vanishes on the light half — and they will not see it, because the preview they approved was last
// week's events in different positions.
//
// ── 🔴 THE RULE, AND THE LINE IT DOES NOT CROSS ────────────────────────────────────────────────────
// Sample the blank under each box, compute WCAG contrast against the chosen colour, and if it is below
// 4.5:1 add a soft shadow/outline IN THE OPPOSITE TONE. **The operator's colour is never changed.**
// Silently darkening their white text would be editing their design; adding a shadow behind it is what
// a designer would do, and it is reversible by turning the setting off.
//
// ── ⚠️ WHERE THE SAMPLING HAPPENS, AND WHY IT IS NOT IN THIS FILE ──────────────────────────────────
// Sampling needs the blank's PIXELS, which means decoding a PNG **or a JPG**. Nothing in the
// dependency tree decodes either: there is no sharp, no canvas, no jpeg library, and satori/resvg take
// an image in and give a PNG out without ever exposing pixels. Writing a baseline JPEG decoder to
// average a rectangle would be a large, risky piece of code on the render path.
//
// The browser already has a decoder for both formats. So the EDITOR samples each box with a canvas
// when the box is placed or moved, and stores the average under it in the design
// (`bgSample`). This file does the DECIDING, as pure functions, and the renderer applies it. The
// division is deliberate: the part that needs a decoder runs where one exists, and the part that
// decides what the poster looks like is pure, server-side and fully testable.
//
// ⚠️ NO SAMPLE ⇒ NO SHADOW. A design with no stored sample (an older editor, or a canvas the browser
// refused) renders exactly as the operator's colours say, and the preview shows them the truth. The
// alternative — guessing a background and adding a shadow nobody asked for — would alter artwork on no
// evidence.

/** An averaged background sample, 0–255 per channel. */
export interface RgbSample {
  r: number
  g: number
  b: number
}

/** The WCAG 2.1 threshold for normal text. Poster text is large, but 4.5 is the brief's number. */
export const CONTRAST_THRESHOLD = 4.5

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)))

export function parseHex(hex: string): RgbSample | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export const toHex = (c: RgbSample): string =>
  '#' + [c.r, c.g, c.b].map(v => clamp255(v).toString(16).padStart(2, '0')).join('')

/**
 * WCAG relative luminance.
 *
 * ⚠️ THE sRGB TRANSFER FUNCTION, NOT A PLAIN AVERAGE. `(r+g+b)/3` gets pure blue and pure yellow the
 * wrong way round — blue is far darker than its arithmetic mean suggests — so a plain average would
 * decide that white text on blue is readable and white on yellow is not. Exactly backwards.
 */
export function relativeLuminance(c: RgbSample): number {
  const ch = (v: number) => {
    const s = Math.min(255, Math.max(0, v)) / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). Order of arguments does not matter. */
export function contrastRatio(a: RgbSample, b: RgbSample): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** The average of a set of pixels. Used by the editor's sampler; here so the harness can drive it. */
export function averageSample(pixels: ArrayLike<number>, stride = 4): RgbSample {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i + 2 < pixels.length; i += stride) {
    /* ⚠️ FULLY TRANSPARENT PIXELS ARE SKIPPED. A blank exported with a transparent margin would
     * otherwise average towards black and earn a light shadow it does not need. */
    if (stride >= 4 && pixels[i + 3] === 0) continue
    r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++
  }
  if (!n) return { r: 255, g: 255, b: 255 }
  return { r: r / n, g: g / n, b: b / n }
}

export interface Readability {
  /** The shadow/outline colour, or null when the text is readable as it is. */
  outline: string | null
  /** The measured ratio, for the report and for the harness. */
  ratio: number
}

/**
 * Decide whether this text colour needs help against this background.
 *
 * 🔴 THE OUTLINE IS THE OPPOSITE TONE OF THE **TEXT**, not of the background. White text gets a dark
 * outline; dark text gets a light one. Choosing from the background instead would put a light outline
 * behind white text on a light background — invisible, and the exact case this exists for.
 * ⚠️ NOT PURE BLACK OR WHITE. A near-black at 85% and a near-white at 95% read as a soft shadow rather
 * than a sticker outline, which is what makes this acceptable on someone's own artwork.
 */
export function readabilityFor(textColour: string, bg: RgbSample | null | undefined, enabled: boolean): Readability {
  const text = parseHex(textColour)
  if (!enabled || !text || !bg) return { outline: null, ratio: text && bg ? contrastRatio(text, bg) : 21 }
  const ratio = contrastRatio(text, bg)
  if (ratio >= CONTRAST_THRESHOLD) return { outline: null, ratio }
  const textIsLight = relativeLuminance(text) > 0.5
  return { outline: textIsLight ? '#0b0b0bd9' : '#ffffffe6', ratio }
}

/**
 * The CSS `textShadow` for an outline colour.
 *
 * ⚠️ FOUR OFFSETS PLUS A BLUR, because satori supports `text-shadow` but not `-webkit-text-stroke`.
 * Four diagonal offsets approximate a stroke; the blur alone would wash out rather than separate.
 * ⚠️ SCALED WITH THE FONT SIZE. A fixed 2px shadow is invisible at 120px and a smear at 12px.
 */
export function outlineShadow(outline: string | null, fontSize: number): string | undefined {
  if (!outline) return undefined
  const d = Math.max(1, Math.round(fontSize * 0.035))
  const blur = Math.max(1, Math.round(fontSize * 0.05))
  return [
    `${d}px ${d}px ${blur}px ${outline}`,
    `-${d}px ${d}px ${blur}px ${outline}`,
    `${d}px -${d}px ${blur}px ${outline}`,
    `-${d}px -${d}px ${blur}px ${outline}`,
  ].join(', ')
}
