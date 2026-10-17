#!/usr/bin/env node
// scripts/us-layout-proposal/B/sheets.cjs — group B contact sheets for the US layout proposal (fixes 6–10):
//   sheet-05-dashboard-card-capacity.png  fixes 8, 9 and 10 (dashboard)
//   sheet-06-kds-cook-full.png            fixes 6 and 7
//   sheet-07-kds-money-lines.png          fix 10 on the KDS: BEFORE, 10(i) and 10(ii) side by side
// BEFORE on the left, AFTER on the right (variants beside it), GB and US, each panel titled with the fix number, audit
// id, surface and size; boxes mark what changed. Crops come from each side's own measure.json (render.cjs).
//   node scripts/us-layout-proposal/B/sheets.cjs <beforeDir> <afterDir> <sheetsDir>
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const sharp = require(path.join(REPO, 'node_modules/sharp'))
const [bDir, aDir, sDir] = process.argv.slice(2).map(p => p && path.resolve(p))
if (!sDir) { console.error('usage: sheets.cjs <beforeDir> <afterDir> <sheetsDir>'); process.exit(2) }
fs.mkdirSync(sDir, { recursive: true })
const DIRS = { before: bDir, after: aDir }
const MS = { before: JSON.parse(fs.readFileSync(path.join(bDir, 'measure.json'), 'utf8')), after: JSON.parse(fs.readFileSync(path.join(aDir, 'measure.json'), 'utf8')) }
const m = (side, st, sz, cc) => { const v = MS[side][`${st}|${sz}|${cc}`]; if (!v) throw new Error(`no measure ${side} ${st} ${sz} ${cc}`); return v }
const card = (side, st, sz, cc, id) => { const k = m(side, st, sz, cc).cards.find(c => c.id === id); if (!k) throw new Error(`no card ${id} in ${side} ${st} ${sz} ${cc}`); return k }
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const FONT = 'Helvetica, Arial, sans-serif'
const TONE = { before: '#64748b', after: '#059669', variant: '#7c3aed' }
const BOX = '#e11d48'

// One column: { label, side: 'before'|'after', st, sz, cc, crop: {x,y,w,h}, boxes: [{x,y,w,h,label}], tone }
async function panel({ title, cols, scale = 1, note }) {
  const pad = 12, gut = 20, titleH = note ? 46 : 30, tagH = 22
  const imgs = []
  for (const c of cols) {
    const png = m(c.side, c.st, c.sz, c.cc).png; const file = path.join(DIRS[c.side], png)
    const meta = await sharp(file).metadata()
    const e = { left: Math.max(0, Math.round(c.crop.x)), top: Math.max(0, Math.round(c.crop.y)) }
    e.width = Math.min(Math.round(c.crop.w), meta.width - e.left); e.height = Math.min(Math.round(c.crop.h), meta.height - e.top)
    let buf = await sharp(file).extract(e).toBuffer()
    const w = Math.round(e.width * scale), h = Math.round(e.height * scale)
    if (scale !== 1) buf = await sharp(buf).resize(w, h).toBuffer()
    imgs.push({ buf, w, h, e })
  }
  const colW = imgs.map((im, i) => Math.max(im.w, Math.ceil(cols[i].label.length * 7.4)))
  const W = Math.max(pad * 2 + colW.reduce((s, x) => s + x, 0) + gut * (cols.length - 1), Math.ceil(title.length * 8.6) + pad * 2, note ? Math.ceil(note.length * 6.6) + pad * 2 : 0)
  const H = titleH + tagH + Math.max(...imgs.map(i => i.h)) + pad
  const parts = []; let x = pad; const svg = []
  svg.push(`<text x="${pad}" y="20" font-family="${FONT}" font-size="15" font-weight="700" fill="#0f172a">${esc(title)}</text>`)
  if (note) svg.push(`<text x="${pad}" y="38" font-family="${FONT}" font-size="12" fill="#475569">${esc(note)}</text>`)
  cols.forEach((c, i) => {
    const im = imgs[i]; const top = titleH + tagH
    parts.push({ input: im.buf, left: x, top })
    const tone = TONE[c.tone || c.side]
    svg.push(`<rect x="${x}" y="${titleH + 2}" width="${Math.ceil(c.label.length * 7.2) + 10}" height="17" rx="3" fill="${tone}"/><text x="${x + 5}" y="${titleH + 15}" font-family="${FONT}" font-size="12" font-weight="700" fill="#fff">${esc(c.label)}</text>`)
    svg.push(`<rect x="${x - 1}" y="${top - 1}" width="${im.w + 2}" height="${im.h + 2}" fill="none" stroke="#cbd5e1"/>`)
    for (const b of c.boxes || []) {
      const bx = x + (b.x - im.e.left) * scale, by = top + (b.y - im.e.top) * scale, bw = b.w * scale, bh = b.h * scale
      svg.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="${BOX}" stroke-width="2.5" rx="4"/>`)
      if (b.label) { const lw = 8 + b.label.length * 7; const ly = by - 16 >= top ? by - 16 : by + bh
        svg.push(`<rect x="${bx}" y="${ly}" width="${lw}" height="16" fill="${BOX}" rx="3"/><text x="${bx + 4}" y="${ly + 12}" font-family="${FONT}" font-size="11" font-weight="700" fill="#fff">${esc(b.label)}</text>`) }
    }
    x += colW[i] + gut
  })
  const over = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('\n')}</svg>`
  const buf = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite([...parts, { input: Buffer.from(over), left: 0, top: 0 }]).png().toBuffer()
  return { buf, w: W, h: H }
}

async function sheet(file, header, sub, panels) {
  const ps = []; for (const p of panels) ps.push(await panel(p))
  const W = Math.max(...ps.map(p => p.w), Math.ceil(header.length * 10) + 24); const headH = 58
  const H = headH + ps.reduce((s, p) => s + p.h + 12, 0)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${headH}"><rect width="${W}" height="${headH}" fill="#0f172a"/>
<text x="12" y="26" font-family="${FONT}" font-size="18" font-weight="700" fill="#fff">${esc(header)}</text>
<text x="12" y="47" font-family="${FONT}" font-size="12" fill="#cbd5e1">${esc(sub)}</text></svg>`
  let top = headH; const comp = [{ input: Buffer.from(svg), left: 0, top: 0 }]
  for (const p of ps) { comp.push({ input: p.buf, left: 0, top }); top += p.h + 12 }
  const out = path.join(sDir, file)
  await sharp({ create: { width: W, height: H, channels: 3, background: '#f1f5f9' } }).composite(comp).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(out)
  const mb = fs.statSync(out).size / 1e6
  console.log(file, W, 'x', H, mb.toFixed(2), 'MB'); if (mb >= 4) throw new Error(`${file} is ${mb.toFixed(2)} MB (limit 4)`)
}

const SUB = 'Pizza Kitchen fixtures · Wed 30 Sep 2026 11:50 local · GB = en-GB 24h Europe/London · US = en-US 12h America/New_York with tax/fee/tip · BEFORE = 4d72838, AFTER = this proposal'
const BA = (st, sz, cc, crop, extra = {}) => [
  { label: `BEFORE · ${cc}`, side: 'before', st, sz, cc, crop: crop('before'), boxes: extra.bb ? extra.bb('before') : [] },
  { label: `AFTER · ${cc}`, side: 'after', st, sz, cc, crop: crop('after'), boxes: extra.ab ? extra.ab('after') : [] }]
const R = (r, p = 3, label) => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p, label })

;(async () => {
  // ── SHEET 05 — DASHBOARD: card row 1 (fix 8), capacity sidebar (fix 9), money summary (fix 10) ────────────
  const rowCrop = (sz, cc, w) => side => { const k = card(side, 'dash-orders-full', sz, cc, '1234'); return { x: 0, y: k.y - 6, w, h: 112 } }
  const r1Box = (sz, cc) => side => ['1234', '1236'].map(id => { const k = card(side, 'dash-orders-full', sz, cc, id); return R(k.row1Rect, 3, id === '1234' ? 'B-01' : 'B-02') })
  const side = (sz, cc) => s => { const sb = m(s, 'dash-orders', sz, cc).sidebar; return { x: sb.rect.x - 8, y: sb.rect.y - 8, w: sb.rect.w + 16, h: 470 } }
  const sbBox = (sz, cc, st = 'dash-orders') => s => { const sb = m(s, st, sz, cc).sidebar; const r = sb.sample[0].rect; return [{ x: r.x - 2, y: r.y - 2, w: 6 + sb.timeW[0], h: 420, label: 'B-03' }] }
  const c34 = (st, s) => card(s, st, '810x1080', 'US', '1234')
  await sheet('sheet-05-dashboard-card-capacity.png', 'Sheet 05 · Group B · Dashboard › Orders: order card row 1 (fix 8), kitchen capacity sidebar (fix 9), money summary (fix 10)', SUB, [
    { title: 'Fix 8 (B-01, B-02) · order card row 1, 4-digit numbers · iPad portrait 810×1080 · US', note: 'BEFORE: "15m late" is clipped by the card and "in 25m" runs into the padding. AFTER: the pill / countdown drops under the number and time, right-aligned.',
      cols: BA('dash-orders-full', '810x1080', 'US', rowCrop('810x1080', 'US', 810), { bb: r1Box('810x1080', 'US'), ab: r1Box('810x1080', 'US') }) },
    { title: 'Fix 8 (B-01, B-02) · order card row 1, 4-digit numbers · Android 800×1280 · US',
      cols: BA('dash-orders-full', '800x1280', 'US', rowCrop('800x1280', 'US', 800), { bb: r1Box('800x1280', 'US'), ab: r1Box('800x1280', 'US') }) },
    { title: 'Fix 8 · the same row in GB · 810×1080 · GB fits, so nothing wraps: unchanged (pixel-identical)',
      cols: BA('dash-orders-full', '810x1080', 'GB', rowCrop('810x1080', 'GB', 810)) },
    { title: 'Fix 9 (B-03) · Kitchen capacity sidebar · iPad landscape 1180×820 · US', note: 'BEFORE: "11:50 AM" wraps in the 40 px column, every row doubles (13 rows visible). AFTER: a 64 px column on 12-hour trucks, one line per row (22 visible, as GB).',
      cols: BA('dash-orders', '1180x820', 'US', side('1180x820', 'US'), { bb: sbBox('1180x820', 'US'), ab: sbBox('1180x820', 'US') }) },
    { title: 'Fix 9 · GB, the OPEN QUESTION: DAYLOAD_SIDEBAR_WIDE_TIME_GB · 1180×820 · GB', note: 'AFTER (constant false, the default) = GB unchanged, 40 px column. "AFTER, GB too" (constant true) = the 64 px column in GB as well; the labels lose 24 px.',
      cols: [...BA('dash-orders', '1180x820', 'GB', side('1180x820', 'GB')),
        { label: 'AFTER, GB too · GB', tone: 'variant', side: 'after', st: 'dash-orders-gbtoo', sz: '1180x820', cc: 'GB',
          crop: (s => { const sb = m(s, 'dash-orders-gbtoo', '1180x820', 'GB').sidebar; return { x: sb.rect.x - 8, y: sb.rect.y - 8, w: sb.rect.w + 16, h: 470 } })('after'), boxes: sbBox('1180x820', 'GB', 'dash-orders-gbtoo')('after') }] },
    { title: 'Fix 10 (B-07) · order card money lines · 810×1080 · US (GB has no such lines and is unchanged)', scale: 0.75,
      note: 'BEFORE: Subtotal, Sales tax, Service fee, Tip on every card (+70 px). AFTER: one line "Tax, fees & tip $6.04 ▾"; a tap opens the breakdown under it.',
      cols: [
        { label: 'BEFORE · US', side: 'before', st: 'dash-orders-full', sz: '810x1080', cc: 'US', crop: (k => ({ x: 0, y: k.y - 6, w: 810, h: k.h + 12 }))(c34('dash-orders-full', 'before')), boxes: [R(c34('dash-orders-full', 'before').chargeRect, 4, 'B-07')] },
        { label: 'AFTER · US', side: 'after', st: 'dash-orders-full', sz: '810x1080', cc: 'US', crop: (k => ({ x: 0, y: k.y - 6, w: 810, h: k.h + 12 }))(c34('dash-orders-full', 'after')), boxes: [R(c34('dash-orders-full', 'after').chargeRect, 4, '10')] },
        { label: 'AFTER, tapped open · US', tone: 'variant', side: 'after', st: 'dash-orders-open-full', sz: '810x1080', cc: 'US', crop: (k => ({ x: 0, y: k.y - 6, w: 810, h: k.h + 12 }))(c34('dash-orders-open-full', 'after')), boxes: [R(c34('dash-orders-open-full', 'after').chargeRect, 4, '10 open')] },
      ] },
  ])

  // ── SHEET 06 — KDS: Cook header (fix 6), Full Ready badge (fix 6), Full row 2 name (fix 7) ──────────────────
  const firstRow = (st, sz, cc, h = 96) => s => { const ks = m(s, st, sz, cc).cards; const y = Math.min(...ks.map(k => k.y)); return { x: 0, y: y - 6, w: +sz.split('x')[0], h } }
  const numBoxes = (st, sz, cc, ids, lab) => s => ids.map(id => R(card(s, st, sz, cc, id).numRect, 2, lab))
  const tk = (st, sz, cc, id, h = 104) => s => { const k = card(s, st, sz, cc, id); return { x: k.x - 6, y: k.y - 6, w: k.w + 12, h } }
  const secondRow = (st, sz, cc, h = 110) => s => { const ks = m(s, st, sz, cc).cards.filter(k => ['1231', '1233', '1237'].includes(k.id)); const y = Math.min(...ks.map(k => k.y)); return { x: 0, y: y - 6, w: +sz.split('x')[0], h } }
  const nameBoxes = (st, sz, cc, ids) => s => ids.map(id => { const k = card(s, st, sz, cc, id); return R(k.nameRect, 2, 'B-05') })
  await sheet('sheet-06-kds-cook-full.png', 'Sheet 06 · Group B · Kitchen screen (KDS): Cook ticket header (fix 6), Full ticket Ready badge (fix 6), Full ticket name (fix 7)', SUB, [
    { title: 'Fix 6 (B-06) · Cook tickets, 4-digit numbers · laptop 1280×800 · US', scale: 0.8, note: 'BEFORE: "#…" (Ready) and "#12…" (late). AFTER: the number never shrinks; the time and countdown move to row 2 beside the name, as on Full.',
      cols: BA('kds-grid-cook', '1280x800', 'US', firstRow('kds-grid-cook', '1280x800', 'US', 104), { bb: numBoxes('kds-grid-cook', '1280x800', 'US', ['1234', '1235'], 'B-06') }) },
    { title: 'Fix 6 · Cook tickets · 1280×800 · GB (a named GB bug: "#1…" on the Ready ticket)', scale: 0.8,
      cols: BA('kds-grid-cook', '1280x800', 'GB', firstRow('kds-grid-cook', '1280x800', 'GB', 104), { bb: numBoxes('kds-grid-cook', '1280x800', 'GB', ['1235'], 'B-06') }) },
    { title: 'Fix 6 · Cook tickets · iPad portrait 810×1080 · US and GB', scale: 0.8, note: 'On every truck Cook row 2 keeps at least 16 characters of the name: when it cannot beside the time, the time drops to a second line.',
      cols: [...BA('kds-grid-cook', '810x1080', 'US', firstRow('kds-grid-cook', '810x1080', 'US', 104), { bb: numBoxes('kds-grid-cook', '810x1080', 'US', ['1235'], 'B-06') }),
        ...BA('kds-grid-cook', '810x1080', 'GB', firstRow('kds-grid-cook', '810x1080', 'GB', 104), { bb: numBoxes('kds-grid-cook', '810x1080', 'GB', ['1235'], 'B-06') })] },
    { title: 'Fix 6 · Full ticket, Ready + paid, 4-digit number · 810×1080 · GB and US (a named GB bug: "Ready" drawn over the last digit)',
      note: 'AFTER: when the badge, total and PAID cannot sit beside the number they drop below it, right-aligned (+10 px on that ticket). Tickets that fit are unchanged.',
      cols: [...BA('kds-grid', '810x1080', 'GB', tk('kds-grid', '810x1080', 'GB', '1235', 96), { bb: numBoxes('kds-grid', '810x1080', 'GB', ['1235'], 'B-06') }),
        ...BA('kds-grid', '810x1080', 'US', tk('kds-grid', '810x1080', 'US', '1235', 96), { bb: numBoxes('kds-grid', '810x1080', 'US', ['1235'], 'B-06') })] },
    { title: 'Fix 7 (B-05) · Full ticket row 2: the name keeps at least 16 characters · 810×1080 · US (12-hour trucks only)', scale: 0.85,
      note: 'BEFORE: "Daniel Fitzg…" (12 of 17), "Christophe…" (10 of 22). AFTER: when 16 characters cannot sit beside the time, the time and countdown drop to a second line, right-aligned.',
      cols: BA('kds-grid', '810x1080', 'US', firstRow('kds-grid', '810x1080', 'US', 100), { bb: nameBoxes('kds-grid', '810x1080', 'US', ['1236']), ab: nameBoxes('kds-grid', '810x1080', 'US', ['1236']) }) },
    { title: 'Fix 7 · Full ticket row 2, second row of tickets · 810×1080 · US', scale: 0.85,
      cols: BA('kds-grid', '810x1080', 'US', secondRow('kds-grid', '810x1080', 'US', 100), { bb: nameBoxes('kds-grid', '810x1080', 'US', ['1231', '1233', '1237']), ab: nameBoxes('kds-grid', '810x1080', 'US', ['1231', '1233', '1237']) }) },
    { title: 'Fix 7 · Full ticket row 2 · laptop 1280×800 · US', scale: 0.8,
      cols: BA('kds-grid', '1280x800', 'US', firstRow('kds-grid', '1280x800', 'US', 100), { bb: nameBoxes('kds-grid', '1280x800', 'US', ['1235', '1236']), ab: nameBoxes('kds-grid', '1280x800', 'US', ['1235', '1236']) }) },
    { title: 'Fix 7 · GB is not touched: Full row 2 renders the old markup on a 24-hour truck · 1280×800 · GB', scale: 0.8,
      cols: BA('kds-grid', '1280x800', 'GB', firstRow('kds-grid', '1280x800', 'GB', 100)) },
  ])

  // ── SHEET 07 — KDS money lines (fix 10): BEFORE, 10(i) one line, 10(ii) none ────────────────────────────
  const whole = sz => () => ({ x: 0, y: 0, w: +sz.split('x')[0], h: +sz.split('x')[1] })
  const chBoxes = (side, st, sz, cc) => m(side, st, sz, cc).cards.filter(k => k.chargeRect && k.fully).map(k => R(k.chargeRect, 3, ''))
  const three = (stA, stN, sz, cc) => [
    { label: `BEFORE · ${cc} · fully on screen ${m('before', stA, sz, cc).cardsFully}`, side: 'before', st: stA, sz, cc, crop: whole(sz)(), boxes: chBoxes('before', stA, sz, cc) },
    { label: `10(i) one line · ${cc} · ${m('after', stA, sz, cc).cardsFully}`, side: 'after', st: stA, sz, cc, crop: whole(sz)(), boxes: chBoxes('after', stA, sz, cc) },
    { label: `10(ii) no lines · ${cc} · ${m('after', stN, sz, cc).cardsFully}`, tone: 'variant', side: 'after', st: stN, sz, cc, crop: whole(sz)() }]
  await sheet('sheet-07-kds-money-lines.png', 'Sheet 07 · Group B · KDS money lines (fix 10, B-07): BEFORE vs 10(i) "Tax, fees & tip $x.xx" vs 10(ii) none', SUB + ' · Dominic chooses: KDS_MONEY_LINES = \'one\' | \'none\'', [
    { title: 'Fix 10 (B-07) · KDS grid, Full tickets · Android 800×1280 · US (shown at 45%)', scale: 0.45,
      note: 'Count in each label = tickets fully on screen. AFTER also carries fixes 6 and 7 (row-2 wraps, the Ready ticket\'s badge row), which add height back.',
      cols: three('kds-grid', 'kds-grid-none', '800x1280', 'US') },
    { title: 'Fix 10 · KDS list, Full tickets · iPad landscape 1180×820 · US (shown at 55%)', scale: 0.55, cols: three('kds-list', 'kds-list-none', '1180x820', 'US') },
    { title: 'Fix 10 · KDS list, Full tickets · laptop 1280×800 · US (shown at 55%)', scale: 0.55, cols: three('kds-list', 'kds-list-none', '1280x800', 'US') },
    { title: 'Fix 10 · GB has no money lines: the list is unchanged (pixel-identical) · 1180×820 · GB (shown at 55%)', scale: 0.55,
      cols: BA('kds-list', '1180x820', 'GB', whole('1180x820')) },
  ])
})().catch(e => { console.error(e); process.exit(1) })
