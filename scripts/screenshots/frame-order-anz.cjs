// Step 2 of the AU/NZ order screenshot: frame <work>/order-web-<au|nz>.png with the GB capture's iOS status bar and Safari
// bar (public/screenshots/customer-order.png, read only). Like the US frame (frame-order.cjs), the clock is repainted in
// 12-hour form ("4:31" — the iPhone's bar shows no am/pm) and fitted to the GB clock's size and position in a few passes.
// france-1: a 24-hour country (fr) keeps the GB status bar EXACTLY as captured ("16:31", no date), as frame-order-ie.cjs
// does — order-anz.cjs renders at 16:31 Paris time — and fails if the clock pixels differ.
//   node frame-order-anz.cjs <au|nz|ca|fr> <workDir> <outDir> → <outDir>/customer-order-<cc>.png
const path = require('path'); const compose = require('./compose.cjs'); const bbox = require('./bbox.cjs')
const A = require('./anz-fixtures.cjs')
const c = A.country()
const { REPO, dirs } = require('./common.cjs')
const { WORK, OUT } = dirs()
if (!OUT) { console.error('frame-order-anz: an output dir is required'); process.exit(2) }
const GB = path.join(REPO, 'public/screenshots/customer-order.png')
const out = path.join(OUT, `customer-order-${c.key}.png`)
const web = path.join(WORK, `order-web-${c.key}.png`)
;(async () => {
  if (c.timeFormat === '24h') {
    await compose({ gb: GB, web, out, W: 1284, H: 2778, webTop: 141, bottomFrom: 2601, clocks: [] })
    const region = { x: 60, y: 20, w: 400, h: 110 }
    const want = await bbox(GB, region), got = await bbox(out, region)
    if (JSON.stringify(want) !== JSON.stringify(got)) { console.error('frame-order-anz: the status-bar clock differs from the GB capture', { want, got }); process.exit(1) }
    return console.log('24-hour: clock kept as captured', got)
  }
  const text = A.clock(c, A.instant(c, '2026-09-01', '16:31')).phone
  console.log('clock', JSON.stringify(text))
  const region = { x: 60, y: 20, w: 400, h: 110 }
  const want = await bbox(GB, region)
  let ck = { id: 't', text, size: 51, weight: 600, x: 150, y: 40, cover: { x: 60, y: 20, w: 400, h: 110 }, bg: 'rgb(14,23,42)' }
  for (let i = 0; i < 3; i++) {
    await compose({ gb: GB, web, out, W: 1284, H: 2778, webTop: 141, bottomFrom: 2601, clocks: [ck] })
    const got = await bbox(out, region)
    const scale = want.h / got.h
    ck = { ...ck, size: +(ck.size * scale).toFixed(2) }
    ck.x += Math.round((want.x0 + want.x1) / 2 - (got.x0 + got.x1) / 2); ck.y += Math.round(want.y1 - got.y1)
    console.log({ want, got, next: { size: ck.size, x: ck.x, y: ck.y } })
  }
  await compose({ gb: GB, web, out, W: 1284, H: 2778, webTop: 141, bottomFrom: 2601, clocks: [ck] })
  console.log('final', await bbox(out, region))
})().catch(e => { console.error(e); process.exit(1) })
