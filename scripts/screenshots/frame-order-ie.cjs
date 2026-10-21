// Step 2 of the IE order screenshot: frame <work>/order-web-ie.png with the GB capture's iOS status bar and Safari
// bar (public/screenshots/customer-order.png, read only). The GB clock already reads "16:31" (24-hour, as in
// Ireland) and order-ie.cjs renders at 16:31 Dublin time, so the clock is KEPT AS CAPTURED — no repaint.
//   node frame-order-ie.cjs <workDir> <outDir> → <outDir>/customer-order-ie.png
const path = require('path'); const compose = require('./compose.cjs'); const bbox = require('./bbox.cjs')
const { REPO, dirs } = require('./common.cjs')
const { WORK, OUT } = dirs()
if (!OUT) { console.error('frame-order-ie: an output dir is required'); process.exit(2) }
const GB = path.join(REPO, 'public/screenshots/customer-order.png')
const out = path.join(OUT, 'customer-order-ie.png')
const web = path.join(WORK, 'order-web-ie.png')
;(async () => {
  await compose({ gb: GB, web, out, W: 1284, H: 2778, webTop: 141, bottomFrom: 2601, clocks: [] })
  const region = { x: 60, y: 20, w: 400, h: 110 }
  const want = await bbox(GB, region), got = await bbox(out, region)
  if (JSON.stringify(want) !== JSON.stringify(got)) { console.error('frame-order-ie: the status-bar clock differs from the GB capture', { want, got }); process.exit(1) }
  console.log('clock kept as captured', got)
})().catch(e => { console.error(e); process.exit(1) })
