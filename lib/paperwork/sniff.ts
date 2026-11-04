// lib/paperwork/sniff.ts — what a file IS, from its first bytes (paperwork-1, 4 November 2026). PURE.
// 🔴 THE NAME AND THE DECLARED TYPE ARE NEVER TRUSTED: "invoice.pdf" that starts with "MZ" is not a PDF. Only the five
// accepted kinds are recognised; anything else is null and refused.
import type { AcceptedMime } from './model'

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => sig.every((v, i) => b[at + i] === v)
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
/** ISO base media "ftyp" brands that are HEIF/HEIC still images (iPhone photos are 'heic'; some are 'mif1'). */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'])

export function sniffMime(bytes: Uint8Array): AcceptedMime | null {
  if (bytes.length < 12) return null
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'                       // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  if (ascii(bytes, 4, 8) === 'ftyp') {
    // The major brand, then the compatible brands, up to the box's own size.
    const boxSize = Math.min(((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0, bytes.length, 256)
    for (let at = 8; at + 4 <= boxSize; at += 4) {
      if (at === 12) continue   // the minor version, not a brand
      if (HEIF_BRANDS.has(ascii(bytes, at, at + 4))) return 'image/heic'
    }
  }
  return null
}
