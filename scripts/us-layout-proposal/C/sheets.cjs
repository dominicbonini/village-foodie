#!/usr/bin/env node
// scripts/us-layout-proposal/C/sheets.cjs — contact sheets 08–10 for the US layout proposal, group C (Manage).
//   node scripts/us-layout-proposal/C/sheets.cjs <beforeDir> <afterDir> <sheetsDir>
// BEFORE left / AFTER right, GB and US, each change labelled with its fix number (and audit id); the 5A / 5B variants and
// the "AFTER, GB too" renders side by side and labelled. Reads the PNGs and measure.json render.cjs wrote. Each sheet < 4 MB.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const sharp = require(path.join(REPO, 'node_modules/sharp'))
const [BEFORE, AFTER, SHEETS] = process.argv.slice(2).map(p => path.resolve(p))
if (!SHEETS) { console.error('usage: sheets.cjs <beforeDir> <afterDir> <sheetsDir>'); process.exit(1) }
fs.mkdirSync(SHEETS, { recursive: true })
const MB = JSON.parse(fs.readFileSync(path.join(BEFORE, 'measure.json'), 'utf8'))
const MA = JSON.parse(fs.readFileSync(path.join(AFTER, 'measure.json'), 'utf8'))

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const FONT = 'font-family="Helvetica, Arial"'

/** One screenshot (dir/file), optionally cropped (image px) and scaled, with boxes ({x,y,w,h} image px) drawn on it. */
async function panel(dir, file, { crop = null, scale = 1, boxes = [] } = {}) {
  const src = path.join(dir, file)
  const meta = await sharp(src).metadata()
  const c = crop ? { left: Math.max(0, crop.x), top: Math.max(0, crop.y), width: Math.min(crop.w, meta.width - Math.max(0, crop.x)), height: Math.min(crop.h, meta.height - Math.max(0, crop.y)) } : { left: 0, top: 0, width: meta.width, height: meta.height }
  const base = await sharp(src).extract(c).resize(Math.round(c.width * scale)).png().toBuffer()
  const bm = await sharp(base).metadata(); const W = bm.width, H = bm.height
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#cbd5e1"/>${boxes.map(b => {
    const x = (b.x - c.left) * scale - 2, y = (b.y - c.top) * scale - 2, w = b.w * scale + 4, h = b.h * scale + 4
    const col = b.col || '#dc2626'
    const ly = Math.max(0, y - 18)
    if (b.nolabel) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${col}" stroke-width="1.5" rx="3"/>`
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${col}" stroke-width="2.5" rx="4"/>
<rect x="${Math.max(0, x)}" y="${ly}" width="${b.label.length * 8 + 8}" height="17" fill="${col}" rx="3"/>
<text x="${Math.max(0, x) + 4}" y="${ly + 13}" ${FONT} font-size="12" font-weight="bold" fill="#fff">${esc(b.label)}</text>`
  }).join('')}</svg>`
  return { buf: await sharp(base).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer(), w: W, h: H }
}
/** A row: a caption, then panels side by side, each under its own tag. */
async function row(caption, items) {
  const gap = 20, capH = 30, tagH = 22
  const W = Math.max(items.reduce((a, it) => a + it.p.w, 0) + gap * (items.length - 1), Math.ceil(caption.length * 8.6))
  const H = capH + tagH + Math.max(...items.map(it => it.p.h))
  let x = 0; const tags = []; const comps = []
  for (const it of items) {
    tags.push(`<text x="${x}" y="${capH + 15}" ${FONT} font-size="13" font-weight="bold" fill="${it.col || '#475569'}">${esc(it.tag)}</text>`)
    comps.push({ input: it.p.buf, top: capH + tagH, left: x }); x += it.p.w + gap
  }
  const svg = `<svg width="${W}" height="${capH + tagH}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="20" ${FONT} font-size="16" font-weight="bold" fill="#0f172a">${esc(caption)}</text>${tags.join('')}</svg>`
  const buf = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }, ...comps]).png().toBuffer()
  return { buf, w: W, h: H }
}
async function sheet(file, header, rows) {
  const pad = 24, headH = 52, gapY = 26
  const W = Math.max(...rows.map(r => r.w)) + 2 * pad
  const H = headH + 14 + rows.reduce((a, r) => a + r.h + gapY, 0) + pad
  const svg = `<svg width="${W}" height="${headH}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${headH}" fill="#0f172a"/><text x="${pad}" y="33" ${FONT} font-size="19" font-weight="bold" fill="#fff">${esc(header)}</text></svg>`
  const comps = [{ input: Buffer.from(svg), top: 0, left: 0 }]
  let y = headH + 14
  for (const r of rows) { comps.push({ input: r.buf, top: y, left: pad }); y += r.h + gapY }
  const out = path.join(SHEETS, file)
  await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(comps).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(out)
  const mb = fs.statSync(out).size / 1048576
  console.log(`${file}: ${W}×${H}, ${mb.toFixed(2)} MB`)
  if (mb >= 4) throw new Error(`${file} is over 4 MB`)
}
const rel = (b, o) => b && o ? { x: b.x - o.x, y: b.y - o.y, w: b.w, h: b.h } : b
const m = (M, view, variant, size, cc) => M.views[view] && M.views[view][variant] && M.views[view][variant][size] && M.views[view][variant][size][cc]
const AFTER_C = '#15803d', GBTOO_C = '#7c3aed', B_C = '#475569'

async function main() {
  // ── SHEET 08 · fix 3 (C-01, C-02) — Schedule cards on a phone ──
  {
    const rows = []
    const cardBoxes = (M, view, variant, size, cc, label) => {
      const x = m(M, view, variant, size, cc); if (!x) return []
      return x.cards.filter(c => c.actionsBox && c.icons > 0).flatMap(c => [
        { ...rel(c.timeBox, x.crop), label, nolabel: true },
        ...(c.vanBox ? [{ ...rel(c.vanBox, x.crop), label: 'van', col: '#2563eb', nolabel: true }] : []),
      ])
    }
    for (const view of ['schedule-list', 'schedule-list-novan']) {
      const what = view === 'schedule-list' ? 'two vans (van shown)' : 'one van (no van shown)'
      const s = 0.75
      rows.push(await row(`Fix 3 (C-01, C-02) · Schedule, phone 390, ${what} — red: the time line on cards with action icons, blue: the van line. GB AFTER = SCHEDULE_CARD_STACK_GB false; GB too = true`, [
        { tag: 'US · BEFORE', p: await panel(BEFORE, `${view}-390-us.png`, { scale: s, boxes: cardBoxes(MB, view, 'base', 'phone', 'US', 'C-01/02') }) },
        { tag: 'US · AFTER', col: AFTER_C, p: await panel(AFTER, `${view}-390-us.png`, { scale: s, boxes: cardBoxes(MA, view, 'base', 'phone', 'US', 'fix 3') }) },
        { tag: 'GB · BEFORE', p: await panel(BEFORE, `${view}-390-gb.png`, { scale: s }) },
        { tag: 'GB · AFTER (unchanged)', col: AFTER_C, p: await panel(AFTER, `${view}-390-gb.png`, { scale: s }) },
        { tag: 'GB · AFTER, GB too', col: GBTOO_C, p: await panel(AFTER, `${view}@gbtoo-390-gb.png`, { scale: s, boxes: cardBoxes(MA, view, 'gbtoo', 'phone', 'GB', 'fix 3') }) },
      ]))
    }
    for (const w of [800, 1280]) {
      const crop = { x: 0, y: 0, w: w - 24, h: 520 }
      rows.push(await row(`Fix 3 · ${w}px — unchanged from 640 up (card heights and line counts identical, GB and US)`, [
        { tag: 'US · BEFORE', p: await panel(BEFORE, `schedule-list-${w}-us.png`, { crop, scale: 0.5 }) },
        { tag: 'US · AFTER', col: AFTER_C, p: await panel(AFTER, `schedule-list-${w}-us.png`, { crop, scale: 0.5 }) },
        { tag: 'GB · AFTER, GB too', col: GBTOO_C, p: await panel(AFTER, `schedule-list@gbtoo-${w}-gb.png`, { crop, scale: 0.5 }) },
      ]))
    }
    await sheet('sheet-08-schedule-cards.png', 'Sheet 08 · Fix 3 · Manage › Schedule cards on a phone — time on its own line, van on its own line, icons beneath (C-01, C-02)', rows)
  }

  // ── SHEET 09 · fix 5 (C-03 + GB minute boxes clipped) — the phone time picker, 5A and 5B ──
  {
    const rows = []
    const sizes = [[360, 'p360'], [390, 'phone'], [800, 'droidtab']]
    const selBoxes = (M, view, variant, size, cc) => {
      const x = m(M, view, variant, size, cc); if (!x || !x.fieldRow) return []
      const o = { x: Math.max(0, x.fieldRow.x - 12), y: Math.max(0, x.fieldRow.y - 12) }
      return x.fields.flatMap(f => f.selects.filter(s => s.cut > 0).map(s => ({ ...rel(s.box, o), label: `-${s.cut}px` })))
    }
    for (const [view, range] of [['schedule-editor', '11:30–22:45 / 11:30 AM – 10:45 PM'], ['schedule-editor-midnight', '20:00–00:30 / 8:00 PM – 12:30 AM']]) {
      for (const [w, sid] of sizes) {
        for (const cc of ['GB', 'US']) {
          const sc = w === 800 ? 1 : 1.25
          const ok = (M, v) => { const x = m(M, view, v, sid, cc); return x ? x.fields.map(f => f.selects.map(s => `${s.label.replace(/ /g, ' ')} ${s.need}/${s.avail}`).join(', ')).join(' – ') : '' }
          rows.push(await row(`Fix 5 (C-03${cc === 'GB' ? ', GB clipped boxes' : ''}) · Add/Edit event › times, ${w}px, ${cc}, ${range} — label px needed/shown: BEFORE ${ok(MB, 'base')} · 5A ${ok(MA, 'base')}`, [
            { tag: `${cc} · BEFORE`, p: await panel(BEFORE, `${view}-times-${w}-${cc.toLowerCase()}.png`, { scale: sc, boxes: selBoxes(MB, view, 'base', sid, cc) }) },
            { tag: `${cc} · 5A — one select per time`, col: AFTER_C, p: await panel(AFTER, `${view}-times-${w}-${cc.toLowerCase()}.png`, { scale: sc }) },
            { tag: `${cc} · 5B — hour + minute${cc === 'US' ? ' + AM/PM' : ''}`, col: GBTOO_C, p: await panel(AFTER, `${view}@pickB-times-${w}-${cc.toLowerCase()}.png`, { scale: sc }) },
          ]))
        }
      }
    }
    // The same component in Import review's phone card (in scope only as far as the component fixes it).
    const ic = { x: 36, y: 535, w: 318, h: 130 }
    for (const cc of ['GB', 'US']) {
      rows.push(await row(`Fix 5 · Import review › phone card times, 390px, ${cc} — the same component (5A / 5B)`, [
        { tag: `${cc} · BEFORE`, p: await panel(BEFORE, `schedule-import-390-${cc.toLowerCase()}.png`, { crop: ic, scale: 1.1 }) },
        { tag: `${cc} · 5A`, col: AFTER_C, p: await panel(AFTER, `schedule-import-390-${cc.toLowerCase()}.png`, { crop: ic, scale: 1.1 }) },
        { tag: `${cc} · 5B`, col: GBTOO_C, p: await panel(AFTER, `schedule-import@pickB-390-${cc.toLowerCase()}.png`, { crop: ic, scale: 1.1 }) },
      ]))
    }
    await sheet('sheet-09-phone-time-picker-5A-5B.png', 'Sheet 09 · Fix 5 · Phone time picker in Add/Edit event — BEFORE | 5A (one select per time) | 5B (hour + minute + AM/PM) — C-03', rows)
  }

  // ── SHEET 10 · fix 4 (C-05 import heading; C-04 Preview) and fix 12 (pre-order deadline row) ──
  {
    const rows = []
    const hc = { x: 36, y: 128, w: 318, h: 100 }
    const hb = (M, variant, cc, label) => { const x = m(M, 'schedule-import', variant, 'phone', cc); return x && x.headings[0] ? [{ ...rel(x.headings[0].box, { x: hc.x, y: hc.y }), label }] : [] }
    for (const cc of ['US', 'GB']) {
      const items = [
        { tag: `${cc} · BEFORE`, p: await panel(BEFORE, `schedule-import-390-${cc.toLowerCase()}.png`, { crop: hc, scale: 1.3, boxes: hb(MB, 'base', cc, cc === 'US' ? 'C-05' : 'heading') }) },
        { tag: `${cc} · AFTER${cc === 'GB' ? ' (IMPORT_HEADING_STACK_GB = false)' : ''}`, col: AFTER_C, p: await panel(AFTER, `schedule-import-390-${cc.toLowerCase()}.png`, { crop: hc, scale: 1.3, boxes: hb(MA, 'base', cc, 'fix 4') }) },
      ]
      if (cc === 'GB') items.push({ tag: 'GB · AFTER, GB too', col: GBTOO_C, p: await panel(AFTER, 'schedule-import@gbtoo-390-gb.png', { crop: hc, scale: 1.3, boxes: hb(MA, 'gbtoo', 'GB', 'fix 4') }) })
      rows.push(await row(`Fix 4 (C-05) · Import review › phone card heading, 390px, ${cc} — the time on its own line under the date`, items))
    }
    for (const w of [800, 810, 1180, 1280]) {
      const items = []
      for (const cc of ['GB', 'US']) {
        const lines = (M) => { const x = m(M, 'schedule-editor', 'base', { 800: 'droidtab', 810: 'ipadp', 1180: 'ipadl', 1280: 'laptop' }[w], cc); return x && x.preview ? x.preview.map(p => `${p.lines} line${p.lines > 1 ? 's' : ''}, ${p.need}px in ${p.w}`).join('') : '' }
        items.push({ tag: `${cc} · BEFORE (${lines(MB)})`, p: await panel(BEFORE, `schedule-editor-preview-${w}-${cc.toLowerCase()}.png`, { scale: 0.9 }) })
        items.push({ tag: `${cc} · AFTER (${lines(MA)})`, col: AFTER_C, p: await panel(AFTER, `schedule-editor-preview-${w}-${cc.toLowerCase()}.png`, { scale: 0.9 }) })
      }
      rows.push(await row(`C-04 · Add/Edit event › Preview card (TruckListCard, not edited here), ${w}px — range breaks only after the dash (fix 1); one line would need the widths shown`, items))
    }
    const dl = (M, cc, label) => { const x = m(M, 'settings', 'base', 'phone', cc); return x && x.deadlineRow ? [{ ...rel(x.deadlineRow.timeBox, x.crop), label }] : [] }
    for (const cc of ['GB', 'US']) {
      const over = M => { const x = m(M, 'settings', 'base', 'phone', cc); return x && x.deadlineRow ? x.deadlineRow.sticksOut : '?' }
      rows.push(await row(`Fix 12 · Settings › Pre-orders › Deadline row, 390px, ${cc} — BEFORE ${over(MB)}px past its box → AFTER ${over(MA)}px (a named GB bug)`, [
        { tag: `${cc} · BEFORE`, p: await panel(BEFORE, `settings-390-${cc.toLowerCase()}.png`, { boxes: dl(MB, cc, `+${over(MB)}px`) }) },
        { tag: `${cc} · AFTER`, col: AFTER_C, p: await panel(AFTER, `settings-390-${cc.toLowerCase()}.png`, { boxes: dl(MA, cc, 'fix 12') }) },
      ]))
    }
    await sheet('sheet-10-import-preview-deadline.png', 'Sheet 10 · Fix 4 (Import heading C-05; Preview C-04) and Fix 12 (pre-order deadline row) — Manage', rows)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
