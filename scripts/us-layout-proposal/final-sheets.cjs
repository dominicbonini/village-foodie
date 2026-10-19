#!/usr/bin/env node
// scripts/us-layout-proposal/final-sheets.cjs — the contact sheets of the US layout fixes AS MERGED (18 October 2026,
// docs/us-layout-fixes-report.md), focused on Dominic's choices. Reads the renders that A/B/C render.cjs wrote:
//   node scripts/us-layout-proposal/final-sheets.cjs <outRoot> <sheetsDir>
// <outRoot> holds A/before, A/final-after, B/before-raw, B/final-after-raw, C/before, C/final-after. Not in the sweep.
const fs = require('fs'); const path = require('path')
const sharp = require('sharp')
const [ROOT, OUT] = process.argv.slice(2)
if (!OUT) { console.error('usage: final-sheets.cjs <outRoot> <sheetsDir>'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })
const P = (g, which, f) => path.join(ROOT, g, which, f)
const BEF = { A: 'before', B: 'before-raw', C: 'before' }, AFT = { A: 'final-after', B: 'final-after-raw', C: 'final-after' }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const text = (w, h, s, { size = 15, weight = 700, fill = '#0f172a', bg = null } = {}) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}` +
  `<text x="8" y="${Math.round(h * 0.7)}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text></svg>`)

/** A panel: label strip over one image (optionally cropped, scaled to `w`). */
async function panel(label, file, { crop, w, tag = '#334155' } = {}) {
  let img = sharp(file)
  if (crop) img = img.extract(crop)
  const buf = await img.toBuffer(); const m = await sharp(buf).metadata()
  const width = w || m.width; const scaled = width === m.width ? buf : await sharp(buf).resize({ width }).toBuffer()
  const sm = await sharp(scaled).metadata()
  const lab = await sharp(text(width, 24, label, { size: 13, fill: '#fff', bg: tag })).png().toBuffer()
  return { w: width, h: sm.height + 24, parts: [{ input: lab, left: 0, top: 0 }, { input: scaled, left: 0, top: 24 }] }
}
/** A row: a title strip and its panels side by side. */
async function row(title, panels) {
  const ps = await Promise.all(panels)
  const w = ps.reduce((s, p) => s + p.w, 0) + 12 * (ps.length - 1), h = Math.max(...ps.map(p => p.h))
  const parts = [{ input: await sharp(text(Math.max(w, 900), 30, title, { size: 16 })).png().toBuffer(), left: 0, top: 0 }]
  let x = 0
  for (const p of ps) { for (const q of p.parts) parts.push({ ...q, left: q.left + x, top: q.top + 32 }); x += p.w + 12 }
  return { w: Math.max(w, 900), h: h + 32, parts }
}
async function sheet(name, heading, rows) {
  const rs = await Promise.all(rows)
  const W = Math.max(...rs.map(r => r.w)) + 32, H = rs.reduce((s, r) => s + r.h + 24, 0) + 70
  const parts = [{ input: await sharp(text(W, 44, heading, { size: 20, fill: '#fff', bg: '#0f172a' })).png().toBuffer(), left: 0, top: 0 }]
  let y = 60
  for (const r of rs) { for (const q of r.parts) parts.push({ ...q, left: q.left + 16, top: q.top + y }); y += r.h + 24 }
  const file = path.join(OUT, name)
  await sharp({ create: { width: W, height: H, channels: 3, background: '#f1f5f9' } }).composite(parts).png({ compressionLevel: 9, palette: true }).toFile(file)
  console.log(name, `${W}x${H}`, (fs.statSync(file).size / 1048576).toFixed(2), 'MB')
}
const BA = (g, f, o = {}) => [panel('BEFORE', P(g, BEF[g], f), { ...o, tag: '#64748b' }), panel('AFTER', P(g, AFT[g], f), { ...o, tag: '#15803d' })]
const BAgbus = (g, stem, o = {}) => [
  panel('GB · BEFORE', P(g, BEF[g], `${stem}-gb.png`), { ...o, tag: '#64748b' }), panel('GB · AFTER', P(g, AFT[g], `${stem}-gb.png`), { ...o, tag: '#15803d' }),
  panel('US · BEFORE', P(g, BEF[g], `${stem}-us.png`), { ...o, tag: '#64748b' }), panel('US · AFTER', P(g, AFT[g], `${stem}-us.png`), { ...o, tag: '#15803d' })]

;(async () => {
  await sheet('final-1-phone-time-picker-5A.png', 'Final 1 · Choice 1 (fix 5, C-03): 5A — one select per time on a phone. 5B is deleted.', [
    row('Add/Edit event · times · 360 (GB minute boxes clipped 6–12 px, US AM/PM cut 35–37 px → nothing cut)', BAgbus('C', 'schedule-editor-times-360')),
    row('Add/Edit event · times · 390', BAgbus('C', 'schedule-editor-times-390')),
    row('Add/Edit event · overnight 8:00 PM – 12:30 AM · 390 (12:30 AM read as "12 : 30" before)', BAgbus('C', 'schedule-editor-midnight-times-390')),
    row('Add/Edit event · times · 800 — unchanged (hour + minute pair from 640 px up)', BAgbus('C', 'schedule-editor-times-800', { w: 300 })),
    row('Import review · phone card · 390 — choice 8: GB gets the 5A single select too', BAgbus('C', 'schedule-import-390', { w: 300 })),
  ])
  await sheet('final-2-kds-ready-badge.png', 'Final 2 · Choice 3 (fix 6, B-06): the Ready badge no longer covers a 4-digit number — and no GB ticket grows', [
    row('KDS Full grid · GB 810×1080 · #1235 Ready: badge drawn over "5" → a smaller badge pinned above the total; totals unchanged', BA('B', 'kds-grid-810x1080-gb.png', { crop: { left: 190, top: 200, width: 600, height: 120 } })),
    row('KDS Full grid · GB 800×1280 · whole screen: 6 tickets fully on screen BEFORE and AFTER', BA('B', 'kds-grid-800x1280-gb.png', { w: 400 })),
    row('KDS Full grid · GB 1280×800 · 4-digit (35 px overlap → 0)', BA('B', 'kds-grid-1280x800-gb.png', { crop: { left: 170, top: 165, width: 620, height: 90 } })),
    row('KDS Full grid · US 810×1080 · same fix; US tickets also lose their money lines (choice 2)', BA('B', 'kds-grid-810x1080-us.png', { crop: { left: 190, top: 200, width: 600, height: 380 } })),
    row('KDS list · GB 1180×820 · the same badge change on the list (same row height)', BA('B', 'kds-list-1180x820-gb.png', { crop: { left: 960, top: 440, width: 210, height: 70 } })),
  ])
  await sheet('final-3-money-lines.png', 'Final 3 · Choices 2 and 6 (fix 10): no money lines on the KDS; one "Tax, fees & tip" / "Tax & fees" line elsewhere', [
    row('KDS Full grid · US 1180×820 · 10(ii): tax / fee / tip lines gone; total and PAID stay in the header', BA('B', 'kds-grid-1180x820-us.png', { w: 700 })),
    row('Dashboard card · US 810×1080 · one summary line "Tax, fees & tip ▾" (the order has a tip)', BA('B', 'dash-orders-810x1080-us.png', { w: 520 })),
    row('Dashboard card · US 810×1080 · tapped open', [panel('AFTER · open', P('B', AFT.B, 'dash-orders-open-810x1080-us.png'), { w: 520, tag: '#15803d' })]),
    row('Order page basket · US 360 · expanded: 85 % → 63 % of the screen; "Tax, fees & tip" fold', BA('A', 'basket-expanded-360-us.png')),
    row('Checkout sheet · US 360 · Total + Place order in a sticky footer, summary collapsed', BA('A', 'sheet-open-360-us.png')),
  ])
  await sheet('final-4-schedule-phone-cards.png', 'Final 4 · Choice 4 (fix 3, C-01/C-02): Schedule phone cards, every truck — van line only on cards with icons', [
    row('Manage › Schedule · 390 · GB and US (pending "Needs your approval" cards: same height as BEFORE)', BAgbus('C', 'schedule-list-390', { w: 300 })),
    row('Manage › Schedule · 390 · single-van truck', BAgbus('C', 'schedule-list-novan-390', { w: 300 })),
    row('Manage › Schedule · 800 — unchanged', BAgbus('C', 'schedule-list-800', { w: 300 })),
  ])
  await sheet('final-5-twelve-hour-only.png', 'Final 5 · Choice 5 (fixes 4, 9, 11): decided by the truck\'s clock — 12-hour gets the new layout, 24-hour keeps today\'s', [
    row('Import review heading · 390 (fix 4, C-05)', BAgbus('C', 'schedule-import-390', { w: 300 })),
    row('Kitchen-capacity sidebar · 1180×820 (fix 9, B-03): US time on one line, 13 → 22 rows; GB unchanged', BAgbus('B', 'dash-orders-1180x820', { w: 380 })),
    row('Manage my order · Pickup · 360 · long venue (fix 11, A-06)', BAgbus('A', 'manage-longvenue-360', { w: 300 })),
  ])
  await sheet('final-6-header-clipping-cook.png', 'Final 6 · Choice 7 (area line), fix 12 (two GB clipping bugs) and choice 8 (Cook long names)', [
    row('Order header · live · 360 (choice 7): "Kingston · KT1 1LF" / "Hoboken · 07030" in full; card 59 → 51 px', BAgbus('A', 'order-header-360', { w: 340 })),
    row('Order header · not live · 360: the GB area line was already ellipsed by 0.3 px — now in full', BAgbus('A', 'order-header-typical-360', { w: 340 })),
    row('"Choose time" · 360 (fix 12): no longer runs into its ▾', BAgbus('A', 'choose-time-360', { w: 300 })),
    row('Settings › Pre-orders deadline row · 390 (fix 12): 11 px over → 0', BAgbus('C', 'settings-390', { w: 300 })),
    row('KDS Cook · GB 810×1080 (fix 6 + choice 8): number never cut; a long name pushes the time to a second line', BA('B', 'kds-grid-cook-810x1080-gb.png', { crop: { left: 0, top: 200, width: 810, height: 260 }, w: 700 })),
  ])
})().catch(e => { console.error(e); process.exit(1) })
