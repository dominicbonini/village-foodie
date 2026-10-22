// Step 2 of the AU/NZ kitchen screenshot: frame <work>/kds-web-<au|nz>.png like public/screenshots/kitchen.png (read only),
// scaled to 640x480. Like the US frame (frame-kds.cjs), the clock is repainted in 12-hour form — "9:08 pm  Tue 1 Sep".
// france-1: a 24-hour country (fr) is repainted too, because the GB date is English — "21:08  mar. 1 sept." (A.clock's 24-hour form).
//   node frame-kds-anz.cjs <au|nz|ca|fr> <workDir> <outDir> → <outDir>/kitchen-<cc>.png
const path = require('path'); const frame = require('./frame-ipad.cjs')
const A = require('./anz-fixtures.cjs')
const c = A.country()
const { REPO, dirs } = require('./common.cjs')
const { WORK, OUT } = dirs()
if (!OUT) { console.error('frame-kds-anz: an output dir is required'); process.exit(2) }
const clock = A.clock(c, A.instant(c, '2026-09-01', '21:08')).ipad
console.log('clock', JSON.stringify(clock))
frame({ gb: path.join(REPO, 'public/screenshots/kitchen.png'), web: path.join(WORK, `kds-web-${c.key}.png`), out: path.join(OUT, `kitchen-${c.key}.png`), work: WORK,
  outW: 640, outH: 480, bg: '#ffffff', fg: '#000000', clock, iconsFrom: { left: 560, top: 0, width: 80, height: 11 } })
  .then(() => console.log('ok'), e => { console.error(e); process.exit(1) })
