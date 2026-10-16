// The bounding box of the light pixels (or the dark ones, dark=true) inside a region of a PNG. The frame steps
// use it to fit the repainted status-bar clock onto the GB capture's own clock (same height, centre, baseline).
const sharp = require('sharp')
module.exports = async (f, r, dark = false, thr = 170) => {
  const { data, info } = await sharp(f).extract({ left: r.x, top: r.y, width: r.w, height: r.h }).raw().toBuffer({ resolveWithObject: true })
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const i = (y * r.w + x) * info.channels; const v = (data[i] + data[i + 1] + data[i + 2]) / 3
    if (dark ? v < thr : v > thr) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) } }
  return { x0: x0 + r.x, x1: x1 + r.x, y0: y0 + r.y, y1: y1 + r.y, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}
