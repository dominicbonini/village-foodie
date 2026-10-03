// lib/weekly-post/image-info.ts — what is this file, and how big is it, decided from its own bytes.
//
// ── 🔴 WHY THE SERVER READS THE HEADER ITSELF ──────────────────────────────────────────────────────
// The browser uploads the blank straight to Supabase Storage with a signed URL, so the only thing that
// reaches our code is a path and whatever the client says is at it. The dimensions matter: every box
// in the design is bounds-checked against them, so a client that could declare "this blank is
// 10,000 × 10,000" could place a box anywhere and have the validator wave it through. The file type
// matters for the same reason the size limit does — satori is handed this as a data URI, and a PDF
// renamed to .png would fail inside the renderer rather than at the upload with a sentence an operator
// can act on.
//
// ⚠️ HEADERS ONLY, NOT A DECODER. PNG puts width and height in the IHDR chunk, 16 bytes in; JPEG puts
// them in whichever SOF marker it uses. Reading those is a few lines and no dependency. Decoding the
// pixels would be a large amount of code for a question that is answered in the first 200 bytes —
// and the pixel-level work this feature needs (the readability sample) happens in the browser, where a
// decoder already exists. lib/weekly-post/contrast.ts explains that split.

export type ImageFormat = 'png' | 'jpeg'

export interface ImageInfo {
  format: ImageFormat
  width: number
  height: number
}

export interface ImageCheckOptions {
  maxBytes: number
  minShortSide: number
}

export type ImageCheck =
  | { ok: true; info: ImageInfo }
  /** A plain sentence, safe to show an operator. */
  | { ok: false; error: string }

/** PNG: 8-byte signature, then an IHDR chunk whose width/height are 4-byte big-endian at 16 and 20. */
function pngSize(b: Buffer): ImageInfo | null {
  if (b.length < 24) return null
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) if (b[i] !== sig[i]) return null
  if (b.slice(12, 16).toString('latin1') !== 'IHDR') return null
  return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

/**
 * JPEG: walk the marker chain to the first SOF.
 *
 * ⚠️ IT WALKS RATHER THAN GUESSING AN OFFSET. A JPEG from Canva carries an EXIF block, often a colour
 * profile and sometimes a thumbnail before the frame header, so the dimensions are not at a fixed
 * position. ⚠️ SOF4/SOF8/SOF12 ARE SKIPPED (DHT, JPG and DAC) — they are not frame headers, and
 * treating them as one reads two arbitrary bytes as the image height.
 */
function jpegSize(b: Buffer): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue }                 // resync past padding
    const marker = b[i + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    const len = b.readUInt16BE(i + 2)
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) return { format: 'jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

export function readImageInfo(bytes: Buffer): ImageInfo | null {
  return pngSize(bytes) ?? jpegSize(bytes)
}

/**
 * The upload gate.
 *
 * 🔴 EVERY REFUSAL IS A SENTENCE, NOT A CODE. This is the first thing an operator does in the feature,
 * usually with a file Canva just gave them, and "415" tells them nothing about what to do next.
 */
export function checkUpload(bytes: Buffer, opts: ImageCheckOptions): ImageCheck {
  if (!bytes || bytes.length === 0) return { ok: false, error: 'That file was empty.' }
  if (bytes.length > opts.maxBytes) {
    const mb = Math.round(opts.maxBytes / (1024 * 1024))
    return { ok: false, error: `That image is ${(bytes.length / 1024 / 1024).toFixed(1)}MB. The limit is ${mb}MB — export it again at a smaller size.` }
  }
  const info = readImageInfo(bytes)
  if (!info) return { ok: false, error: 'That file is not a PNG or JPG. In Canva choose Share › Download and pick PNG.' }
  if (!info.width || !info.height) return { ok: false, error: 'That image reports no size — try exporting it again.' }
  const shortSide = Math.min(info.width, info.height)
  if (shortSide < opts.minShortSide) {
    return { ok: false, error: `That image is ${info.width}×${info.height}. The shortest side needs to be at least ${opts.minShortSide}px so the text stays sharp.` }
  }
  return { ok: true, info }
}

/** The data URI the renderer takes. ⚠️ The ONLY place the content type is derived from the bytes. */
export function toDataUri(bytes: Buffer, info: ImageInfo): string {
  return `data:image/${info.format};base64,${bytes.toString('base64')}`
}
