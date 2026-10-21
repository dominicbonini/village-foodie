// Step 2 of the AU/NZ dashboard screenshot: frame <work>/dash-web-<au|nz>.png like public/screenshots/dashboard-v4.png (read
// only), scaled to 800x551. Like the US frame (frame-dash.cjs), the clock is repainted in 12-hour form — "10:21 pm  Tue 1 Sep"
// (the time from Intl in en-AU/en-NZ, the date day-month) — and nudged once onto the GB clock's position.
//   node frame-dash-anz.cjs <au|nz> <workDir> <outDir> → <outDir>/dashboard-v4-<au|nz>.png
const path = require('path'); const frame = require('./frame-ipad.cjs'); const bb = require('./bbox.cjs')
const A = require('./anz-fixtures.cjs')
const c = A.country()
const { REPO, dirs } = require('./common.cjs')
const { WORK, OUT } = dirs()
if (!OUT) { console.error('frame-dash-anz: an output dir is required'); process.exit(2) }
const GB = path.join(REPO, 'public/screenshots/dashboard-v4.png')
const out = path.join(OUT, `dashboard-v4-${c.key}.png`)
;(async () => {
  const clock = A.clock(c, A.instant(c, '2026-09-01', '22:21')).ipad
  console.log('clock', JSON.stringify(clock))
  const r = { x: 0, y: 0, w: 200, h: 16 }
  let ck = { left: 50, top: 15, size: 25 }
  for (let i = 0; i < 2; i++) {
    await frame({ gb: GB, web: path.join(WORK, `dash-web-${c.key}.png`), out, work: WORK, W: 2420, webTop: 0, ck, outW: 800, outH: 551, bg: '#0f172a', fg: '#ffffff',
      clock, iconsFrom: { left: 700, top: 0, width: 100, height: 14 } })
    const want = await bb(GB, r), got = await bb(out, r)
    console.log(want, got)
    ck = { ...ck, left: ck.left + Math.round((want.x0 - got.x0) * 2420 / 800), top: ck.top + Math.round((want.y0 - got.y0) * 2420 / 800) }
  }
})().catch(e => { console.error(e); process.exit(1) })
