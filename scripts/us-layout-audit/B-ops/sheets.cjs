#!/usr/bin/env node
// scripts/us-layout-audit/B-ops/sheets.cjs — group B-ops contact sheets (05 dashboard, 06 KDS): GB left, US right,
// same scale, each issue boxed and labelled with its id. Crops and boxes come from measures.json (render.cjs).
//   node scripts/us-layout-audit/B-ops/sheets.cjs
const fs = require('fs'); const path = require('path')
const sharp = require('sharp')
const REPO = path.resolve(__dirname, '../../..')
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'measures.json'), 'utf8'))
const SHOTS = path.join(REPO, 'docs/us-layout-audit/B-ops')
const m = (st, sz, cc) => M[`${st}|${sz}|${cc}`]
const card = (st, sz, cc, id) => m(st, sz, cc).cards.find(c => c.id === id)
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const RED = '#e11d48', GREEN = '#059669'

// A panel: one title, then GB | US crops of the same size. side: { png, crop: {x,y,w,h} }, boxes in page px.
async function panel({ title, gb, us, scale = 1, boxes = [], tone = 'issue' }) {
  const cw = Math.round(gb.crop.w * scale), ch = Math.round(gb.crop.h * scale)
  const pad = 12, gut = 24, titleH = 30, tagH = 20
  const W = Math.max(pad * 2 + cw * 2 + gut, Math.ceil(title.length * 8.8) + pad * 2), H = titleH + tagH + ch + pad
  const parts = []
  for (const [i, side] of [gb, us].entries()) {
    const img = sharp(path.join(SHOTS, side.png)); const meta = await img.metadata()
    const c = { left: Math.max(0, side.crop.x), top: Math.max(0, side.crop.y) }
    c.width = Math.min(side.crop.w, meta.width - c.left); c.height = Math.min(side.crop.h, meta.height - c.top)
    let buf = await sharp(path.join(SHOTS, side.png)).extract(c).toBuffer()
    if (scale !== 1) buf = await sharp(buf).resize(Math.round(c.width * scale), Math.round(c.height * scale)).toBuffer()
    parts.push({ input: buf, left: pad + i * (cw + gut), top: titleH + tagH })
  }
  const col = tone === 'fine' ? GREEN : RED
  const svgBoxes = boxes.map(b => {
    const side = b.side === 'gb' ? gb : us; const ox = pad + (b.side === 'gb' ? 0 : cw + gut)
    const x = ox + (b.x - side.crop.x) * scale, y = titleH + tagH + (b.y - side.crop.y) * scale, w = b.w * scale, h = b.h * scale
    const lw = 10 + b.label.length * 8
    const ly = !b.below && y - 18 >= titleH + tagH ? y - 18 : y + h
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${col}" stroke-width="3" rx="4"/>
<rect x="${x}" y="${ly}" width="${lw}" height="18" fill="${col}" rx="3"/><text x="${x + 5}" y="${ly + 13}" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#fff">${esc(b.label)}</text>`
  }).join('\n')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<text x="${pad}" y="20" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${esc(title)}</text>
<text x="${pad}" y="${titleH + 14}" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#475569">GB  (en-GB · 24h · Europe/London)</text>
<text x="${pad + cw + gut}" y="${titleH + 14}" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#475569">US  (en-US · 12h · America/New_York · tax/fee/tip)</text>
<rect x="${pad - 1}" y="${titleH + tagH - 1}" width="${cw + 2}" height="${ch + 2}" fill="none" stroke="#cbd5e1"/>
<rect x="${pad + cw + gut - 1}" y="${titleH + tagH - 1}" width="${cw + 2}" height="${ch + 2}" fill="none" stroke="#cbd5e1"/>
${svgBoxes}</svg>`
  const base = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite([...parts, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer()
  return { buf: base, w: W, h: H }
}

async function sheet(file, header, panels) {
  const ps = []; for (const p of panels) ps.push(await panel(p))
  const W = Math.max(...ps.map(p => p.w)); const headH = 44
  const H = headH + ps.reduce((s, p) => s + p.h + 14, 0)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${headH}"><rect width="${W}" height="${headH}" fill="#0f172a"/>
<text x="12" y="28" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#fff">${esc(header)}</text></svg>`
  let top = headH; const comp = [{ input: Buffer.from(svg), left: 0, top: 0 }]
  for (const p of ps) { comp.push({ input: p.buf, left: 0, top }); top += p.h + 14 }
  const out = path.join(REPO, 'docs/us-layout-audit', file)
  await sharp({ create: { width: W, height: H, channels: 3, background: '#f1f5f9' } }).composite(comp).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(out)
  console.log(file, W, 'x', H, (fs.statSync(out).size / 1e6).toFixed(2), 'MB')
}

;(async () => {
  // ── SHEET 05 — DASHBOARD ─────────────────────────────────────────────────────────────────────────────
  const P = '810x1080', L = '1180x820'
  const conf = cc => card('dash-orders', P, cc, '1234')
  const rowCrop = cc => ({ x: 0, y: conf(cc).y - 8, w: 810, h: 100 })
  const c34 = conf('US'), c36 = card('dash-orders', P, 'US', '1236')
  const side = cc => m('dash-orders', L, cc).timeEls.filter(t => t.key.includes('w-10'))
  const strip = cc => m('dash-orders', P, cc).timeEls.filter(t => t.key.includes('text-[11px]'))
  const c31 = cc => card('dash-orders', L, cc, '1231')
  const cardCrop = cc => ({ x: c31(cc).x - 6, y: c31(cc).y - 6, w: c31(cc).w + 12, h: Math.max(c31('GB').h, c31('US').h) + 12 })
  await sheet('sheet-05-dashboard.png', 'Sheet 05 · B-ops · Dashboard (Orders, + Add order, event bar) · GB left / US right · Wed 30 Sep 2026 11:50 local', [
    { title: 'B-01, B-02 · Orders › order-card header row 1 · iPad portrait 810×1080 (Android 800×1280 the same, 3 px worse)',
      gb: { png: `dash-orders-full-${P}-gb.png`, crop: rowCrop('GB') }, us: { png: `dash-orders-full-${P}-us.png`, crop: rowCrop('US') },
      boxes: [{ side: 'us', x: c34.x + c34.w - 70, y: c34.row1Rect.y - 4, w: 74, h: c34.row1Rect.h + 8, label: 'B-01' },
        { side: 'us', x: c36.x + c36.w - 66, y: c36.row1Rect.y - 4, w: 70, h: c36.row1Rect.h + 8, label: 'B-02' }] },
    { title: 'B-03 · Orders › Kitchen capacity sidebar · iPad landscape 1180×820 (laptop 1280×800 the same)',
      gb: { png: `dash-orders-${L}-gb.png`, crop: { x: side('GB')[0].x - 18, y: side('GB')[0].y - 40, w: 216, h: 600 } },
      us: { png: `dash-orders-${L}-us.png`, crop: { x: side('US')[0].x - 18, y: side('US')[0].y - 40, w: 216, h: 600 } },
      boxes: [{ side: 'us', x: side('US')[0].x - 4, y: side('US')[0].y - 4, w: 50, h: 560, label: 'B-03' }] },
    { title: 'B-04 · Orders › Kitchen capacity strip (below lg) · iPad portrait 810×1080 (Android 800×1280 the same)',
      gb: { png: `dash-orders-${P}-gb.png`, crop: { x: 0, y: strip('GB')[0].y - 34, w: 810, h: 76 } },
      us: { png: `dash-orders-${P}-us.png`, crop: { x: 0, y: strip('US')[0].y - 34, w: 810, h: 76 } },
      boxes: [{ side: 'us', x: 14, y: strip('US')[0].y - 8, w: 786, h: 40, label: 'B-04' }] },
    { title: 'B-07 · Orders › order card grows by the tax / fee / tip lines · iPad landscape 1180×820 (every size)',
      gb: { png: `dash-orders-${L}-gb.png`, crop: cardCrop('GB') }, us: { png: `dash-orders-${L}-us.png`, crop: cardCrop('US') },
      boxes: [{ side: 'us', ...(r => ({ x: r.x - 6, y: r.y - 4, w: r.w + 12, h: r.h + 8 }))(c31('US').chargeRect), label: 'B-07' }] },
    { title: 'FINE · event bar: venue · 11:30 AM–10:45 PM and "Wednesday, September 30th" on one line each · 810×1080 (all four sizes)', tone: 'fine',
      gb: { png: `dash-longdate-${P}-gb.png`, crop: { x: 0, y: 108, w: 810, h: 60 } }, us: { png: `dash-longdate-${P}-us.png`, crop: { x: 0, y: 108, w: 810, h: 60 } } },
    { title: 'FINE · + Add order › time picker (closed select) and ASAP line · iPad portrait 810×1080 (all four sizes)', tone: 'fine',
      gb: { png: `dash-add-${P}-gb.png`, crop: { x: 470, y: 790, w: 340, h: 290 } }, us: { png: `dash-add-${P}-us.png`, crop: { x: 470, y: 790, w: 340, h: 290 } } },
    { title: 'FINE (layout) · + Add order › midnight-spanning event 8:00 PM–12:30 AM, not started · 810×1080', tone: 'fine',
      gb: { png: `dash-add-midnight-${P}-gb.png`, crop: { x: 0, y: 110, w: 470, h: 300 } }, us: { png: `dash-add-midnight-${P}-us.png`, crop: { x: 0, y: 110, w: 470, h: 300 } } },
  ])

  // ── SHEET 06 — KDS ───────────────────────────────────────────────────────────────────────────────────
  const kc = (st, sz, cc, id) => card(st, sz, cc, id)
  const k0 = cc => m('kds-grid', P, cc).cards[0]
  const kRow = cc => ({ x: 0, y: k0(cc).y - 6, w: 810, h: 92 })
  const k36 = kc('kds-grid', P, 'US', '1236')
  const cook = cc => m('kds-grid-cook', '1280x800', cc).cards[0]
  const cookCrop = cc => ({ x: 0, y: cook(cc).y - 6, w: 520, h: 86 })
  const ck34 = kc('kds-grid-cook', '1280x800', 'US', '1234'), ck35 = kc('kds-grid-cook', '1280x800', 'US', '1235')
  const A = '800x1280'; const ka = kc('kds-grid', A, 'US', '1234')
  await sheet('sheet-06-kds.png', 'Sheet 06 · B-ops · Kitchen screen (KDS) · GB left / US right · Wed 30 Sep 2026 11:50 local', [
    { title: 'B-05 · KDS › Full ticket, row 2: the wider time truncates the customer name · iPad portrait 810×1080 (all four sizes)',
      gb: { png: `kds-grid-${P}-gb.png`, crop: kRow('GB') }, us: { png: `kds-grid-${P}-us.png`, crop: kRow('US') },
      boxes: [{ side: 'us', x: k36.nameRect.x - 3, y: k36.nameRect.y - 3, w: k36.nameRect.w + 6, h: k36.nameRect.h + 6, label: 'B-05', below: true }] },
    { title: 'B-06 · KDS › Cook ticket: the order number truncates ("#12…", "#…") · laptop 1280×800 (also 810 / 800 / 1180 for a Ready ticket)',
      gb: { png: 'kds-grid-cook-1280x800-gb.png', crop: cookCrop('GB') }, us: { png: 'kds-grid-cook-1280x800-us.png', crop: cookCrop('US') },
      boxes: [{ side: 'us', x: ck34.numRect.x - 4, y: ck34.numRect.y - 2, w: ck34.numRect.w + 8, h: ck34.numRect.h + 4, label: 'B-06' },
        { side: 'us', x: ck35.numRect.x - 4, y: ck35.numRect.y - 2, w: ck35.numRect.w + 8, h: ck35.numRect.h + 4, label: 'B-06' }] },
    { title: 'B-07 · KDS › Full tickets grow by the tax / fee / tip lines: 6 tickets fully on screen in GB, 3 in US · Android 800×1280 (shown at 50%)',
      gb: { png: `kds-grid-${A}-gb.png`, crop: { x: 0, y: 0, w: 800, h: 1280 } }, us: { png: `kds-grid-${A}-us.png`, crop: { x: 0, y: 0, w: 800, h: 1280 } }, scale: 0.5,
      boxes: [{ side: 'us', x: ka.chargeRect.x - 6, y: ka.chargeRect.y - 4, w: ka.chargeRect.w + 12, h: ka.chargeRect.h + 8, label: 'B-07' }] },
    { title: 'FINE · KDS › Start Event banner "Today · 8:00 PM – 12:30 AM" and the event bar (midnight-spanning event) · 810×1080 (all four sizes)', tone: 'fine',
      gb: { png: `kds-midnight-${P}-gb.png`, crop: { x: 0, y: 140, w: 810, h: 225 } }, us: { png: `kds-midnight-${P}-us.png`, crop: { x: 0, y: 140, w: 810, h: 225 } } },
  ])
})().catch(e => { console.error(e); process.exit(1) })
