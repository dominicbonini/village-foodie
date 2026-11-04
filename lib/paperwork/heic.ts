// lib/paperwork/heic.ts — an iPhone photo (HEIC) becomes a JPEG before it is kept (paperwork-1, 4 November 2026). SERVER ONLY.
// Browsers other than Safari cannot show HEIC, and neither can the organiser's, so the stored file is always a JPEG.
// `heic-convert` (ISC; it decodes with libheif-js, LGPL-3.0, on the server only — nothing of it is sent to a browser).
import convert from 'heic-convert'

/** The JPEG of a HEIC image (quality 0.9). Throws when the bytes cannot be decoded. */
export async function heicToJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const out = await convert({ buffer: Buffer.from(bytes), format: 'JPEG', quality: 0.9 })
  return new Uint8Array(out)
}
