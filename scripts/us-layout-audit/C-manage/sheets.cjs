#!/usr/bin/env node
// scripts/us-layout-audit/C-manage/sheets.cjs — contact sheets 07–09 for group C (Manage), GB left / US right, each
// issue boxed and labelled with its id. Reads the measurements render.cjs wrote (box coordinates in page px).
//   node scripts/us-layout-audit/C-manage/sheets.cjs <raw.json>
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const sharp = require(path.join(REPO, 'node_modules/sharp'))
const SHOTS = path.join(REPO, 'docs/us-layout-audit/C-manage')
const OUT = path.join(REPO, 'docs/us-layout-audit')
const raw = JSON.parse(fs.readFileSync(process.argv[2] || path.join(REPO, 'node_modules/.cache/usaudit-C-raw.json'), 'utf8'))

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
/** One screenshot, cropped (image px) and scaled, with boxes ({x,y,w,h} in image px before scaling) drawn on it. */
async function panel(file, { crop = null, scale = 1, boxes = [] } = {}) {
  let img = sharp(path.join(SHOTS, file))
  const meta = await img.metadata()
  const c = crop ? { left: Math.max(0, crop.x), top: Math.max(0, crop.y), width: Math.min(crop.w, meta.width - Math.max(0, crop.x)), height: Math.min(crop.h, meta.height - Math.max(0, crop.y)) } : { left: 0, top: 0, width: meta.width, height: meta.height }
  const base = await sharp(path.join(SHOTS, file)).extract(c).resize(Math.round(c.width * scale)).png().toBuffer()
  const bm = await sharp(base).metadata(); const W = bm.width, H = bm.height
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${boxes.map(b => {
    const x = (b.x - c.left) * scale - 3, y = (b.y - c.top) * scale - 3, w = b.w * scale + 6, h = b.h * scale + 6
    const col = b.ref ? '#64748b' : '#dc2626'
    const ly = b.below ? y + h : Math.max(0, y - 20)
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${col}" stroke-width="3" ${b.ref ? 'stroke-dasharray="6 4"' : ''} rx="4"/>
<rect x="${Math.max(0, x)}" y="${ly}" width="${b.label.length * 9 + 10}" height="20" fill="${col}" rx="3"/>
<text x="${Math.max(0, x) + 5}" y="${ly + 15}" font-family="Helvetica, Arial" font-size="14" font-weight="bold" fill="#fff">${esc(b.label)}</text>`
  }).join('')}</svg>`
  return { buf: await sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer(), w: W, h: H }
}
/** A row: a caption, then GB | US. */
async function row(caption, gb, us) {
  const gap = 24, capH = 34, tagH = 22
  const W = Math.max(gb.w + us.w + gap, Math.ceil(caption.length * 9.6)), H = capH + tagH + Math.max(gb.h, us.h)
  const svg = `<svg width="${W}" height="${capH + tagH}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="22" font-family="Helvetica, Arial" font-size="17" font-weight="bold" fill="#0f172a">${esc(caption)}</text>
<text x="0" y="${capH + 16}" font-family="Helvetica, Arial" font-size="14" font-weight="bold" fill="#475569">GB (en-GB, 24-hour)</text>
<text x="${gb.w + gap}" y="${capH + 16}" font-family="Helvetica, Arial" font-size="14" font-weight="bold" fill="#475569">US (en-US, 12-hour)</text></svg>`
  const buf = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite([
    { input: Buffer.from(svg), top: 0, left: 0 }, { input: gb.buf, top: capH + tagH, left: 0 }, { input: us.buf, top: capH + tagH, left: gb.w + gap }]).png().toBuffer()
  return { buf, w: W, h: H }
}
async function sheet(file, header, rows) {
  const pad = 24, headH = 56, gapY = 28
  const W = Math.max(...rows.map(r => r.w)) + 2 * pad
  const H = headH + rows.reduce((a, r) => a + r.h + gapY, 0) + pad
  const svg = `<svg width="${W}" height="${headH}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${headH}" fill="#0f172a"/><text x="${pad}" y="35" font-family="Helvetica, Arial" font-size="20" font-weight="bold" fill="#fff">${esc(header)}</text></svg>`
  const comps = [{ input: Buffer.from(svg), top: 0, left: 0 }]
  let y = headH + 16
  for (const r of rows) { comps.push({ input: r.buf, top: y, left: pad }); y += r.h + gapY }
  const out = path.join(OUT, file)
  await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(comps).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(out)
  const kb = Math.round(fs.statSync(out).size / 1024)
  console.log(`${file}: ${W}×${H}, ${kb} KB`)
  if (kb > 4000) throw new Error(`${file} is over 4 MB`)
}
const rel = (b, o) => b && ({ x: b.x - o.x, y: b.y - o.y, w: b.w, h: b.h })

async function main() {
  // ── SHEET 07 · Schedule › event cards and pending-approval cards, phone 390 ──────────────────────────────
  {
    const L = raw['schedule-list'].phone
    const boxes = cc => {
      const m = L[cc], o = m.crop
      return m.cards.flatMap(c => {
        if (['Market Square', 'The Old Crown', 'Community Centre'].includes(c.venue)) return [{ ...rel(c.timeBox, o), label: 'C-01', ref: cc === 'GB' }]
        if (c.venue === 'Village Hall') return [{ ...rel(c.timeBox, o), label: 'C-02', ref: cc === 'GB' }]
        return []
      })
    }
    const r1 = await row('Schedule › event list, phone 390×844 — Open now · Needs your approval · Needs confirmation · Confirmed',
      await panel('schedule-list-390-gb.png', { boxes: boxes('GB') }), await panel('schedule-list-390-us.png', { boxes: boxes('US') }))
    const T = raw['schedule-list'].ipadp
    const r2 = await row('Schedule › event list, iPad portrait 810×1080 — fine: every time range on one line (top of list)',
      await panel('schedule-list-810-gb.png', { crop: { x: 0, y: 0, w: 780, h: 560 }, scale: 0.6 }), await panel('schedule-list-810-us.png', { crop: { x: 0, y: 0, w: 780, h: 560 }, scale: 0.6 }))
    await sheet('sheet-07-schedule-cards.png', 'Sheet 07 · Manage › Schedule › event cards — C-01 wrap (UGLY), C-02 time split from AM/PM (UGLY)', [r1, r2])
  }
  // ── SHEET 08 · Schedule › event editor, import review ────────────────────────────────────────────────────
  {
    const sel = (view, size, cc, label) => (raw[view][size][cc].selects || []).filter(s => /hour/i.test(s.aria || '')).map(s => ({ ...s.box, label, ref: cc === 'GB' }))
    const fieldCrop = (view) => { const f = raw[view].phone.US.fieldRow; return { x: 0, y: f.y - 14, w: 390, h: f.h + 28 } }
    const rA = await row('Edit event, phone 390 — 11:30–22:45 / 11:30 AM – 10:45 PM: the hour box shows "11" and "10", AM/PM cut off',
      await panel('schedule-editor-390-gb.png', { crop: fieldCrop('schedule-editor'), scale: 1.6, boxes: sel('schedule-editor', 'phone', 'GB', 'C-03') }),
      await panel('schedule-editor-390-us.png', { crop: fieldCrop('schedule-editor'), scale: 1.6, boxes: sel('schedule-editor', 'phone', 'US', 'C-03') }))
    const rB = await row('Edit event, phone 390 — across midnight 20:00–00:30 / 8:00 PM – 12:30 AM: "8 |" and "12" (reads as noon)',
      await panel('schedule-editor-midnight-390-gb.png', { crop: fieldCrop('schedule-editor-midnight'), scale: 1.6, boxes: sel('schedule-editor-midnight', 'phone', 'GB', 'C-03') }),
      await panel('schedule-editor-midnight-390-us.png', { crop: fieldCrop('schedule-editor-midnight'), scale: 1.6, boxes: sel('schedule-editor-midnight', 'phone', 'US', 'C-03') }))
    const P = raw['schedule-editor'].ipadp
    const pc = { x: P.US.previewBox.x - 10, y: P.US.fieldRow.y - 30, w: P.US.previewBox.w + 20, h: P.US.previewBox.y + P.US.previewBox.h - P.US.fieldRow.y + 40 }
    const pb = cc => P[cc].preview.map(p => ({ ...p.box, label: 'C-04', ref: cc === 'GB', below: true }))
    const rC = await row('Edit event, iPad 810 — hour boxes fine; preview wraps "PM" (C-04; also 800/1180/1280)',
      await panel('schedule-editor-810-gb.png', { crop: pc, boxes: pb('GB') }), await panel('schedule-editor-810-us.png', { crop: pc, boxes: pb('US') }))
    const I = raw['schedule-import'].phone
    const ib = cc => [{ ...I[cc].summaries[0].box, label: 'C-05', ref: cc === 'GB' }]
    const icrop = { x: 16, y: 80, w: 358, h: 160 }
    const rD = await row('Import schedule › review, phone 390 — the card heading "Wed, Sep 30th · 11:30 AM–10:45 PM" orphans "PM"',
      await panel('schedule-import-390-gb.png', { crop: icrop, scale: 1.6, boxes: ib('GB') }), await panel('schedule-import-390-us.png', { crop: icrop, scale: 1.6, boxes: ib('US') }))
    await sheet('sheet-08-schedule-editor.png', 'Sheet 08 · Manage › Schedule › Add/Edit event + Import review — C-03 (BROKEN), C-04, C-05 (UGLY)', [rA, rB, rC, rD])
  }
  // ── SHEET 09 · Settings (pre-order cut-off, collection times), Payments (Tax, tips and fees), Billing — all fine ──
  {
    const rows = []
    rows.push(await row('Settings › Pre-orders, phone 390 — fine: the 12:45 PM cut-off fits its 128px time box (the row is 11px wide of its box in GB too)',
      await panel('settings-preorder-390-gb.png', { scale: 0.8 }), await panel('settings-preorder-390-us.png', { scale: 0.8 })))
    rows.push(await row('Settings › Collection times, phone 390 — fine: "6:00 PM, 6:15 PM, 6:30 PM…" wraps as a sentence (+16px)',
      await panel('settings-collection-390-gb.png', { scale: 0.8 }), await panel('settings-collection-390-us.png', { scale: 0.8 })))
    const pm = raw.payments.phone
    const pcrop = { x: 0, y: 240, w: 358, h: (pm.US.chargesCard.y + pm.US.chargesCard.h) - 240 + 12 }
    rows.push(await row('Payments, phone 390 — fine: GB has no "Tax, tips and fees" card (prices include VAT); US card fits (8.875%, tips, 3% + $0.30)',
      await panel('payments-390-gb.png', { crop: { x: 0, y: 240, w: 358, h: 300 }, scale: 0.8 }), await panel('payments-390-us.png', { crop: pcrop, scale: 0.8 })))
    rows.push(await row('Billing › Trial, phone 390 — fine: "Your trial ends September 30, 2026", prices in the 56px columns',
      await panel('billing-trial-390-gb.png', { crop: { x: 0, y: 0, w: 358, h: 1000 }, scale: 0.8 }), await panel('billing-trial-390-us.png', { crop: { x: 0, y: 0, w: 358, h: 1000 }, scale: 0.8 })))
    rows.push(await row('Shell › trial popup, phone 390 — fine (date wraps inside the sentence in both)',
      await panel('trial-popup-390-gb.png', { crop: { x: 0, y: 150, w: 390, h: 540 }, scale: 0.8 }), await panel('trial-popup-390-us.png', { crop: { x: 0, y: 150, w: 390, h: 540 }, scale: 0.8 })))
    await sheet('sheet-09-settings-payments-billing.png', 'Sheet 09 · Manage › Settings times, Payments › Tax, tips and fees, Billing — no US issues', rows)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
