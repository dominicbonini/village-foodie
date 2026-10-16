// Frame a phone web render with the GB capture's own device chrome (the iOS status bar, Safari's bar),
// repainting only the status-bar clock in the US form. Everything is drawn in WebKit at DPR 1, pixel for pixel.
//   compose({ gb, web, out, W, H, webTop, bottomFrom?, clocks: [{ id, text, cover:{x,y,w,h}, bg, x, y, size, weight, color?, ls? }], overlays? })
const fs = require('fs')
const sharp = require('sharp')
const uri = async (f, ex) => 'data:image/png;base64,' + (ex ? await sharp(f).extract(ex).png().toBuffer() : fs.readFileSync(f)).toString('base64')

module.exports = async function compose({ gb, web, out, W, H, webTop, bottomFrom, clocks = [], overlays = [] }) {
  const top = webTop > 0 ? await uri(gb, { left: 0, top: 0, width: W, height: webTop }) : null
  const bot = bottomFrom != null && bottomFrom < H ? await uri(gb, { left: 0, top: bottomFrom, width: W, height: H - bottomFrom }) : null
  const webUri = await uri(web)
  const ov = []
  for (const o of overlays) ov.push(`<img src="${await uri(gb, o.from)}" style="position:absolute;left:${o.to.x}px;top:${o.to.y}px">`)
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:#fff}#c{position:relative;width:${W}px;height:${H}px;overflow:hidden}
img{display:block}.ck{position:absolute;white-space:nowrap;font-family:-apple-system,"SF Pro Text",system-ui;color:#fff;-webkit-font-smoothing:antialiased}</style></head><body><div id="c">
<img src="${webUri}" style="position:absolute;left:0;top:${webTop}px">
${top ? `<img src="${top}" style="position:absolute;left:0;top:0">` : ''}
${bot ? `<img src="${bot}" style="position:absolute;left:0;top:${bottomFrom}px">` : ''}
${ov.join('\n')}
${clocks.map(c => `<div style="position:absolute;left:${c.cover.x}px;top:${c.cover.y}px;width:${c.cover.w}px;height:${c.cover.h}px;background:${c.bg}"></div>
<div class="ck" id="${c.id}" style="left:${c.x}px;top:${c.y}px;font-size:${c.size}px;font-weight:${c.weight};color:${c.color || '#fff'};letter-spacing:${c.ls || 0}px">${c.text}</div>`).join('\n')}
</div></body></html>`
  const { webkit } = require('playwright')
  const b = await webkit.launch()
  try {
    const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
    await pg.setContent(html, { waitUntil: 'load' })
    const boxes = await pg.evaluate(() => [...document.querySelectorAll('.ck')].map(e => { const r = e.getBoundingClientRect(); return { id: e.id, x: r.x, w: r.width } }))
    await pg.locator('#c').screenshot({ path: out })
    return boxes
  } finally { await b.close() }
}
