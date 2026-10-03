// scripts/_png-decode.cjs — a minimal PNG reader, so the weekly-post harness can check PIXELS.
//
// 🔴 WHY A DECODER AT ALL. The weekly post's hardest promise is "text never overflows its box". That
// can be checked two ways: by trusting the measurement that decided the font size, or by looking at
// the pixels that came out. Only the second one catches a disagreement BETWEEN the measurement and the
// renderer — which is the failure that matters, because it is invisible until it is on artwork a truck
// has posted. The brief asks for exactly this ("check the rendered pixels or the computed text
// rectangles"); this file is what makes the first option available, and the harness does both.
//
// ⚠️ IT DECODES WHAT resvg PRODUCES AND NOTHING ELSE: 8-bit RGBA or RGB, non-interlaced, which is what
// `@vercel/og` emits every time. A 16-bit, palette or interlaced PNG is REFUSED rather than guessed at
// — a decoder that quietly misreads a format would make every pixel assertion meaningless.
//
// ⚠️ NO DEPENDENCY. `zlib` is in Node, the rest is the five filter types from the PNG spec.

const zlib = require('zlib')

/** Undo one scanline's filter, in place. `prev` is the already-unfiltered line above. */
function unfilter(type, line, prev, bpp) {
  switch (type) {
    case 0: return
    case 1: // Sub
      for (let i = bpp; i < line.length; i++) line[i] = (line[i] + line[i - bpp]) & 255
      return
    case 2: // Up
      for (let i = 0; i < line.length; i++) line[i] = (line[i] + prev[i]) & 255
      return
    case 3: // Average
      for (let i = 0; i < line.length; i++) {
        const left = i >= bpp ? line[i - bpp] : 0
        line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
      }
      return
    case 4: // Paeth
      for (let i = 0; i < line.length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0
        const b = prev[i]
        const c = i >= bpp ? prev[i - bpp] : 0
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        line[i] = (line[i] + pr) & 255
      }
      return
    default:
      throw new Error(`png: unknown filter type ${type}`)
  }
}

/** → { width, height, channels, data } where `data` is row-major, `channels` bytes per pixel. */
function decodePng(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('png: not a PNG')
  let off = 8
  let width = 0, height = 0, bitDepth = 0, colourType = 0, interlace = 0
  const idat = []
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.slice(off + 4, off + 8).toString('latin1')
    const data = buf.slice(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colourType = data[9]; interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len                                   // length + type + data + crc
  }
  if (bitDepth !== 8) throw new Error(`png: only 8-bit is supported (got ${bitDepth})`)
  if (interlace !== 0) throw new Error('png: interlaced is not supported')
  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 0
  if (!channels) throw new Error(`png: only RGB/RGBA are supported (colour type ${colourType})`)

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(stride * height)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1)
    const filter = raw[at]
    const line = Buffer.from(raw.slice(at + 1, at + 1 + stride))
    unfilter(filter, line, prev, channels)
    line.copy(out, y * stride)
    prev = line
  }
  return { width, height, channels, data: out }
}

const pixel = (img, x, y) => {
  const i = (y * img.width + x) * img.channels
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.channels === 4 ? img.data[i + 3] : 255 }
}

/**
 * The bounding box of pixels that DIFFER from the same region of a reference image.
 *
 * 🔴 THIS IS HOW "the text stayed inside its box" IS CHECKED HONESTLY. Rendering the poster twice —
 * once with the text and once without — and diffing tells you exactly which pixels the text put on the
 * page, with no assumption about colour, shadow, anti-aliasing or what the artwork underneath looks
 * like. Looking for "non-background pixels" instead would need a definition of background, and the
 * background here is the operator's own photograph.
 *
 * ⚠️ `tolerance` ABSORBS ANTI-ALIASING AND PNG QUANTISATION, not real differences: 8/255 is well below
 * any visible mark and well above the noise two renders of identical content produce (which is zero,
 * but the margin costs nothing).
 */
function diffBounds(a, b, region, tolerance = 8) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('png: diff needs equal sizes')
  const x0 = Math.max(0, region ? region.x : 0)
  const y0 = Math.max(0, region ? region.y : 0)
  const x1 = Math.min(a.width, region ? region.x + region.w : a.width)
  const y1 = Math.min(a.height, region ? region.y + region.h : a.height)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const pa = pixel(a, x, y), pb = pixel(b, x, y)
      if (Math.abs(pa.r - pb.r) > tolerance || Math.abs(pa.g - pb.g) > tolerance || Math.abs(pa.b - pb.b) > tolerance) {
        count++
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  return count === 0
    ? { empty: true, count: 0 }
    : { empty: false, count, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, right: maxX, bottom: maxY }
}

module.exports = { decodePng, pixel, diffBounds }
