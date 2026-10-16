// Step 2 of the dashboard screenshot: frame <work>/dash-web.png like public/screenshots/dashboard-v4.png (read
// only), clock "10:21 PM  Tue Sep 1", nudged once onto the GB clock's position, scaled to 800x551.
//   node frame-dash.cjs <workDir> <outDir> → <outDir>/dashboard-v4-us.png
const path = require('path'); const frame = require('./frame-ipad.cjs'); const bb = require('./bbox.cjs')
const { REPO, dirs } = require('./common.cjs')
const { WORK, OUT } = dirs()
if (!OUT) { console.error('frame-dash: an output dir is required'); process.exit(2) }
const GB = path.join(REPO, 'public/screenshots/dashboard-v4.png')
const out = path.join(OUT, 'dashboard-v4-us.png')
;(async () => {
  const r = { x: 0, y: 0, w: 200, h: 16 }
  let ck = { left: 50, top: 15, size: 25 }
  for (let i = 0; i < 2; i++) {
    await frame({ gb: GB, web: path.join(WORK, 'dash-web.png'), out, work: WORK, W: 2420, webTop: 0, ck, outW: 800, outH: 551, bg: '#0f172a', fg: '#ffffff',
      clock: '10:21 PM  Tue Sep 1', iconsFrom: { left: 700, top: 0, width: 100, height: 14 } })
    const want = await bb(GB, r), got = await bb(out, r)
    console.log(want, got)
    ck = { ...ck, left: ck.left + Math.round((want.x0 - got.x0) * 2420 / 800), top: ck.top + Math.round((want.y0 - got.y0) * 2420 / 800) }
  }
})().catch(e => { console.error(e); process.exit(1) })
