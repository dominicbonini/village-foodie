#!/usr/bin/env node
// US layout audit, group A (customer) — step 3: contact sheets 01–04 (GB left, US right, same scale; issues boxed
// and labelled), from shoot.cjs's crops and their element boxes (<workDir>/crops.json).
//   node scripts/us-layout-audit/A-customer/sheets.cjs <workDir>
const fs = require('fs'); const path = require('path')
const { REPO } = require('./fixtures.cjs')
const sharp = require(path.join(REPO, 'node_modules/sharp'))
const WORK = path.resolve(process.argv[2] || '')
const SHOTS = path.join(REPO, 'docs/us-layout-audit/A-customer')
const OUT = path.join(REPO, 'docs/us-layout-audit')
const raw = JSON.parse(fs.readFileSync(path.join(WORK, 'crops.json'), 'utf8'))
const crops = new Proxy(raw, { get: (o, f) => o[f] || o[String(f).replace('-proj-', '-')] })   // a projection's GB pane is the GB shot itself
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// A row: one crop stem at one size; `gb` / `us` = label for that side's boxes (null = no box); `note` under the title.
const SHEETS = [
  { file: 'sheet-01-order-event-header.png', title: 'A-customer · Order page › event header and event chooser (TruckListCard) · GB left / US right', rows: [
    { stem: 'order-header', size: 360, gb: 'A-01', us: 'A-01', note: 'Live event (11:30–22:45): the range wraps beside "● Live" in BOTH countries; card 59 px in both.' },
    { stem: 'order-header-typical', size: 360, gb: null, us: 'A-02', note: 'Typical pre-order event 17:00–21:00: GB one line (82 px); US "5:00 PM – 9:00 PM" (115 px) wraps in the 112 px column, "PM" orphaned; card 51 → 59 px.' },
    { stem: 'order-header-midnight', size: 390, gb: null, us: 'A-02', note: 'Midnight-spanning 20:00–00:30: GB 87 px one line; US "8:00 PM – 12:30 AM" 122 px → 2 lines; card 51 → 59 px.' },
    { stem: 'order-header-typical', size: 768, gb: null, us: 'A-02', note: '768: the column stays 112 px, so the same wrap; card 54 → 60 px.' },
    { stem: 'order-chooser', size: 768, gb: null, us: 'A-03', note: 'Chooser at ≥640 px (sm: 140 px column): live range + "● Live" = 169 px > 140 → 2 lines; card 70 → 76 px. GB 125 px fits.' },
    { stem: 'order-chooser', size: 360, gb: null, us: null, note: 'Chooser on phones (row layout): fits in both — FINE.' },
  ] },
  { file: 'sheet-02-order-basket-checkout.png', title: 'A-customer · Order page › basket footer, pickup-time picker, tip + totals, confirmation · GB left / US right', rows: [
    { stem: 'order-basket', size: 360, gb: null, us: 'A-04', note: 'Sticky basket footer, expanded: GB 570 px (71 % of 360×800) → US 683 px (85 %): tax notice + 4 charge rows. Collapsed: 125 → 150 px.' },
    { stem: 'order-slots', size: 360, gb: null, us: null, note: 'Pickup time, 12:45 selected: "12:45 PM" 73 px in a 99 px select, 7 px clear of the ▾ (GB 22 px). "Around 12:00 PM" one line — FINE.' },
    { stem: 'order-totals', size: 360, gb: null, us: 'A-05', note: 'Card + 20 % tip: tip buttons 58×52 px, "$203.95" 49 px in 46–48 px of content (tight, no clip); totals rows one line each. Sheet 1254 → 1556 px; Place order 372 → 768 px below the first screen.' },
    { stem: 'order-confirm', size: 360, gb: null, us: null, note: 'Confirmation (Order #1234, Pickup time: 12:45 PM): every line one line; card 933 → 1029 px from the 4 charge rows — FINE.' },
  ] },
  { file: 'sheet-03-manage-my-order.png', title: 'A-customer · Order tracking › manage-my-order (/order/[id]/manage) · GB left / US right', rows: [
    { stem: 'manage', size: 360, gb: null, us: null, note: 'Pickup "12:45 PM · Riverside Park" one line (168 px); totals rows one line; card 537 → 633 px (charge rows) — FINE.' },
    { stem: 'manage-longvenue', size: 360, gb: null, us: 'A-06', note: 'Longer venue: GB "12:45 · Pier 13 Waterfront Market" 218 px fits; US wraps to 2 lines, butts the label ("Pickup12:45 PM", 0 px gap), row 20 → 40 px.' },
    { stem: 'manage-longvenue', size: 390, gb: null, us: null, note: '390 and 768: the same row fits on one line — FINE.' },
  ] },
  { file: 'sheet-04-public-schedule-embed.png', title: 'A-customer · Public truck page (TruckClient) and custom-domain / embed schedule (EmbedSchedule) · GB left / US right', rows: [
    { stem: 'schedule', size: 390, gb: null, us: 'OBS', note: 'AS SHIPPED: a US truck\'s cards print UK formats ("Wed 30 Sep", "11:30 – 22:45") — TruckListCard gets no time settings here. No layout change.' },
    { stem: 'schedule-proj', size: 768, gb: null, us: 'A-07', note: 'PROJECTION (US settings passed at bundle time): live card at 768 wraps like A-03; card 70 → 76 px. Phones fit.' },
    { stem: 'embed', size: 768, gb: null, us: 'OBS', note: 'AS SHIPPED: custom-domain page, same UK formats on a US truck.' },
    { stem: 'embed-proj', size: 768, gb: null, us: 'A-07', note: 'PROJECTION: the same 768 wrap; card 70 → 76 px.' },
  ] },
]

;(async () => {
  for (const sheet of SHEETS) {
    const parts = []; let y = 0; const PAD = 16, GAP = 24, MAXPANE = 760
    const W = 2 * MAXPANE + GAP + 2 * PAD
    const head = await textBlock(sheet.title, W, 22, true); parts.push({ input: head.buf, top: y + 10, left: PAD }); y += head.h + 20
    for (const r of sheet.rows) {
      const files = ['gb', 'us'].map(s => `${r.stem}-${r.size}-${s}.png`)
      const metas = await Promise.all(files.map(f => sharp(path.join(SHOTS, f)).metadata()))
      const css = files.map((f, i) => metas[i].width / crops[f].dsf)
      const scale = Math.min(r.size === 768 ? 1 : 1.5, MAXPANE / Math.max(...css))
      const title = await textBlock(`${r.stem.replace(/-/g, ' ')} · ${r.size} px — ${r.note}`, W - 2 * PAD, 15, false); parts.push({ input: title.buf, top: y, left: PAD }); y += title.h + 6
      let rowH = 0
      for (let i = 0; i < 2; i++) {
        const f = files[i], c = crops[f], side = i ? 'us' : 'gb'
        const w = Math.round(css[i] * scale), h = Math.round(metas[i].height / c.dsf * scale)
        const img = await sharp(path.join(SHOTS, f)).resize(w, h).png().toBuffer()
        const label = r[side]
        const boxes = label ? c.boxes : []
        const svg = `<svg width="${w + 4}" height="${h + 4}" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="${w + 2}" height="${h + 2}" fill="none" stroke="#94a3b8" stroke-width="1"/>
          ${boxes.map(b => { const bx = b.x * scale, by = b.y * scale, bw = b.w * scale, bh = b.h * scale; const ty = by > 22 ? by - 4 : by + bh + 18
            const lw = label.length * 10 + 10, right = bx + bw + 6 + lw < w   // the label beside the box, else inside its top-right corner
            const lx = right ? bx + bw + 6 : bx + bw - lw - 4, lyTop = right ? by + bh / 2 - 10 : by + 4
            return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#dc2626" stroke-width="3" rx="3"/><rect x="${lx}" y="${lyTop}" width="${lw}" height="20" fill="#dc2626" rx="3"/><text x="${lx + 5}" y="${lyTop + 15}" font-family="Helvetica, Arial" font-size="15" font-weight="700" fill="#fff">${esc(label)}</text>` }).join('')}
          <text x="6" y="${h - 6}" font-family="Helvetica, Arial" font-size="13" font-weight="700" fill="#0f172a" opacity="0.55">${side.toUpperCase()}</text></svg>`
        const left = PAD + i * (MAXPANE + GAP)
        parts.push({ input: img, top: y + 2, left: left + 2 }, { input: Buffer.from(svg), top: y, left })
        rowH = Math.max(rowH, h + 4)
      }
      y += rowH + 22
    }
    const out = path.join(OUT, sheet.file)
    await sharp({ create: { width: W, height: y + PAD, channels: 3, background: '#ffffff' } }).composite(parts).png({ compressionLevel: 9, palette: true }).toFile(out)
    console.log(sheet.file, (fs.statSync(out).size / 1e6).toFixed(2), 'MB', W + 'x' + (y + PAD))
  }
})().catch(e => { console.error(e); process.exit(1) })

// A wrapped text block rendered by librsvg (system sans).
async function textBlock(text, width, size, bold) {
  const per = Math.floor(width / (size * 0.55)); const words = String(text).split(' '); const lines = ['']
  for (const wd of words) { if ((lines[lines.length - 1] + ' ' + wd).trim().length > per) lines.push(wd); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + wd).trim() }
  const lh = Math.round(size * 1.35), h = lines.length * lh + 4
  const svg = `<svg width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">${lines.map((l, i) => `<text x="0" y="${(i + 1) * lh - 4}" font-family="Helvetica, Arial" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="#0f172a">${esc(l)}</text>`).join('')}</svg>`
  return { buf: await sharp(Buffer.from(svg)).png().toBuffer(), h }
}
