// Step 2 of the order screenshot: frame <work>/order-web.png with the GB capture's iOS status bar and Safari
// bar (public/screenshots/customer-order.png, read only), the clock repainted as "4:31" and fitted to the GB
// clock's size and position in a few passes.   node frame-order.cjs <workDir> <outDir> → <outDir>/customer-order-us.png
const path = require('path'); const compose = require('./compose.cjs'); const bbox = require('./bbox.cjs')
const { REPO, dirs } = require('./common.cjs')
const { WORK, OUT } = dirs()
if (!OUT) { console.error('frame-order: an output dir is required'); process.exit(2) }
const GB = path.join(REPO, 'public/screenshots/customer-order.png')
const out = path.join(OUT, 'customer-order-us.png')
const web = path.join(WORK, 'order-web.png')
;(async () => {
  const region = { x: 60, y: 20, w: 400, h: 110 }
  const want = await bbox(GB, region)
  let c = { id: 't', text: '4:31', size: 51, weight: 600, x: 150, y: 40, cover: { x: 60, y: 20, w: 400, h: 110 }, bg: 'rgb(14,23,42)' }
  for (let i = 0; i < 3; i++) {
    await compose({ gb: GB, web, out, W: 1284, H: 2778, webTop: 141, bottomFrom: 2601, clocks: [c] })
    const got = await bbox(out, region)
    const scale = want.h / got.h
    c = { ...c, size: +(c.size * scale).toFixed(2) }
    c.x += Math.round((want.x0 + want.x1) / 2 - (got.x0 + got.x1) / 2); c.y += Math.round(want.y1 - got.y1)
    console.log({ want, got, next: { size: c.size, x: c.x, y: c.y } })
  }
  await compose({ gb: GB, web, out, W: 1284, H: 2778, webTop: 141, bottomFrom: 2601, clocks: [c] })
  console.log('final', await bbox(out, region))
})().catch(e => { console.error(e); process.exit(1) })
