// Step 2 of the IE dashboard screenshot: frame <work>/dash-web-ie.png like public/screenshots/dashboard-v4.png (read
// only), scaled to 800x551. The GB capture's clock reads "22:21  Tue 1 Sep" — already 24-hour and day-month, as in
// Ireland — and dash-ie.cjs renders at 22:21 Dublin time on Tue 1 Sep, so the clock is NOT repainted: frame-ipad.cjs
// draws no clock and the GB file's own clock pixels are laid over the status bar, like its right-hand icons.
//   node frame-dash-ie.cjs <workDir> <outDir> → <outDir>/dashboard-v4-ie.png
const path = require('path'); const sharp = require('sharp'); const frame = require('./frame-ipad.cjs'); const bb = require('./bbox.cjs')
const { REPO, dirs } = require('./common.cjs')
const { WORK, OUT } = dirs()
if (!OUT) { console.error('frame-dash-ie: an output dir is required'); process.exit(2) }
const GB = path.join(REPO, 'public/screenshots/dashboard-v4.png')
const out = path.join(OUT, 'dashboard-v4-ie.png')
const CLOCK = { left: 0, top: 0, width: 110, height: 16 }   // the GB clock "22:21  Tue 1 Sep" (its light pixels: x 18–88, y 8–13)
;(async () => {
  await frame({ gb: GB, web: path.join(WORK, 'dash-web-ie.png'), out, work: WORK, W: 2420, webTop: 0, ck: { left: 50, top: 15, size: 25 }, outW: 800, outH: 551,
    bg: '#0f172a', fg: '#ffffff', clock: '', iconsFrom: { left: 700, top: 0, width: 100, height: 14 } })
  const framed = await sharp(out).toBuffer()
  const clock = await sharp(GB).extract(CLOCK).png().toBuffer()
  await sharp(framed).composite([{ input: clock, left: CLOCK.left, top: CLOCK.top }]).png().toFile(out)
  const r = { x: 0, y: 0, w: 200, h: 16 }
  console.log('clock kept as captured', { gb: await bb(GB, r), ie: await bb(out, r) })
})().catch(e => { console.error(e); process.exit(1) })
