// Frame an iPad web render (below the status bar, @2x) like the GB capture, then scale it to the GB file's size.
// The status bar's right-hand icons (Wi-Fi, 100%, battery) are the GB file's own pixels; the clock is drawn in
// the US form; the Stage Manager corner handle is redrawn. The full-size frame goes to `work`.
const fs = require('fs'); const path = require('path')
const sharp = require('sharp')
module.exports = async function frameIpad({ gb, web, out, work, outW, outH, bg, fg, clock, iconsFrom, W = 2752, webTop = 48, ck = { left: 56, top: 15 } }) {
  const scale = outW / W, H = Math.round(outH / scale)
  const webUri = 'data:image/png;base64,' + fs.readFileSync(web).toString('base64')
  const html = `<!doctype html><html><head><style>html,body{margin:0}#c{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${bg}}
.ck{position:absolute;left:${ck.left}px;top:${ck.top}px;line-height:36px;font-family:-apple-system,system-ui;font-size:${ck.size || 31}px;line-height:${Math.round((ck.size || 31) * 1.16)}px;font-weight:600;color:${fg};white-space:pre;-webkit-font-smoothing:antialiased}</style></head>
<body><div id="c"><img src="${webUri}" style="position:absolute;left:0;top:${webTop}px;display:block">
<div class="ck">${clock}</div>
<svg style="position:absolute;right:0;bottom:0" width="140" height="140" viewBox="0 0 140 140"><path d="M 46 128 Q 106 112 118 70" fill="none" stroke="#5f6368" stroke-width="10" stroke-linecap="round"/></svg>
</div></body></html>`
  const { webkit } = require('playwright')
  const b = await webkit.launch()
  const big = path.join(work, path.basename(out).replace(/\.png$/, '-full.png'))
  try { const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); await pg.setContent(html); await pg.locator('#c').screenshot({ path: big }) } finally { await b.close() }
  const small = await sharp(big).resize(outW, outH, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer()
  const icons = await sharp(gb).extract(iconsFrom).png().toBuffer()
  await sharp(small).composite([{ input: icons, left: iconsFrom.left, top: iconsFrom.top }]).png().toFile(out)
}
