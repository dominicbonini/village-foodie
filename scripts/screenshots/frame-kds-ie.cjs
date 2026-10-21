// Step 2 of the IE kitchen screenshot: frame <work>/kds-web-ie.png like public/screenshots/kitchen.png (read only),
// scaled to 640x480. The GB capture's clock reads "21:08  Tue 1 Sep" — already 24-hour and day-month, as in Ireland —
// and kds-ie.cjs renders at 21:08 Dublin time on Tue 1 Sep, so the clock is NOT repainted: frame-ipad.cjs draws no
// clock and the GB file's own clock pixels are laid over the status bar, like its right-hand icons.
//   node frame-kds-ie.cjs <workDir> <outDir> → <outDir>/kitchen-ie.png
const path = require('path'); const sharp = require('sharp'); const frame = require('./frame-ipad.cjs'); const bb = require('./bbox.cjs')
const { REPO, dirs } = require('./common.cjs')
const { WORK, OUT } = dirs()
if (!OUT) { console.error('frame-kds-ie: an output dir is required'); process.exit(2) }
const GB = path.join(REPO, 'public/screenshots/kitchen.png')
const out = path.join(OUT, 'kitchen-ie.png')
const CLOCK = { left: 0, top: 0, width: 80, height: 11 }   // the GB clock "21:08  Tue 1 Sep" (its dark pixels: x 12–63, y 5–10)
;(async () => {
  await frame({ gb: GB, web: path.join(WORK, 'kds-web-ie.png'), out, work: WORK, outW: 640, outH: 480, bg: '#ffffff', fg: '#000000', clock: '',
    iconsFrom: { left: 560, top: 0, width: 80, height: 11 } })
  const framed = await sharp(out).toBuffer()
  const clock = await sharp(GB).extract(CLOCK).png().toBuffer()
  await sharp(framed).composite([{ input: clock, left: CLOCK.left, top: CLOCK.top }]).png().toFile(out)
  const r = { x: 0, y: 0, w: 160, h: 12 }
  console.log('clock kept as captured', { gb: await bb(GB, r, true), ie: await bb(out, r, true) })
})().catch(e => { console.error(e); process.exit(1) })
