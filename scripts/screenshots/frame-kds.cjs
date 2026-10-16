// Step 2 of the kitchen screenshot: frame <work>/kds-web.png like public/screenshots/kitchen.png (read only),
// clock "9:08 PM  Tue Sep 1", scaled to 640x480.   node frame-kds.cjs <workDir> <outDir> → <outDir>/kitchen-us.png
const path = require('path'); const frame = require('./frame-ipad.cjs')
const { REPO, dirs } = require('./common.cjs')
const { WORK, OUT } = dirs()
if (!OUT) { console.error('frame-kds: an output dir is required'); process.exit(2) }
frame({ gb: path.join(REPO, 'public/screenshots/kitchen.png'), web: path.join(WORK, 'kds-web.png'), out: path.join(OUT, 'kitchen-us.png'), work: WORK,
  outW: 640, outH: 480, bg: '#ffffff', fg: '#000000', clock: '9:08 PM  Tue Sep 1', iconsFrom: { left: 560, top: 0, width: 80, height: 11 } })
  .then(() => console.log('ok'), e => { console.error(e); process.exit(1) })
