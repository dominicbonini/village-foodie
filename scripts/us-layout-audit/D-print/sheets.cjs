// scripts/us-layout-audit/D-print/sheets.cjs — contact sheets 10 (printed tickets) and 12 (emails + plans PDF) for group
// D-print, from the PNGs and the measured boxes written by tickets.cjs / emails.cjs / plans-pdf.cjs. GB left, US right,
// same scale. Red box + "D-NN" = an issue; green box = a US-only or time-bearing element measured and found to fit.
// (Sheet 11, social posts, is made by scripts/us-layout-audit/D-print/social/.)
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const sharp = require(path.join(REPO, 'node_modules/sharp'))
const D = path.join(REPO, 'docs/us-layout-audit/D-print')
const SHEETS = path.join(REPO, 'docs/us-layout-audit')
const T = require('./tickets-measure.json')
const E = require('./emails-measure.json')
const findings = fs.existsSync(path.join(__dirname, 'findings.json')) ? require('./findings.json') : { issues: [] }

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One screenshot with its boxes drawn on it, scaled by `k`. marks: [{x,y,w,h,label,issue}] */
async function panel(file, marks, k = 1, cropH = null) {
  const img = sharp(path.join(D, file)); const meta = await img.metadata()
  const H = cropH ? Math.min(cropH, meta.height) : meta.height
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${H}">${marks.filter(m => m.y < H).map(m => {
    const col = m.issue ? '#dc2626' : '#16a34a'
    return `<rect x="${m.x - 3}" y="${m.y - 2}" width="${m.w + 6}" height="${m.h + 4}" fill="none" stroke="${col}" stroke-width="${m.issue ? 3 : 2}"${m.issue ? '' : ' stroke-dasharray="6 3"'}/>`
      + (m.label ? (() => { const lw = m.label.length * 7 + 8; const lx = Math.min(meta.width - lw, m.x + m.w + 3 - lw); const ly = m.y + m.h + 2
        return `<rect x="${lx}" y="${ly}" width="${lw}" height="15" fill="${col}"/><text x="${lx + 4}" y="${ly + 12}" font-family="Helvetica" font-size="12" font-weight="700" fill="#fff">${esc(m.label)}</text>` })() : '')
  }).join('')}</svg>`
  let p = sharp(await img.extract({ left: 0, top: 0, width: meta.width, height: H }).png().toBuffer()).composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  let buf = await p.png().toBuffer()
  if (k !== 1) buf = await sharp(buf).resize(Math.round(meta.width * k)).png().toBuffer()
  const m2 = await sharp(buf).metadata()
  return { buf, w: m2.width, h: m2.height }
}

const textSvg = (w, h, lines, size = 16, bg = '#fff', weight = 600) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/>${lines.map((l, i) => `<text x="10" y="${size + 4 + i * (size + 6)}" font-family="Helvetica" font-size="${i ? size - 3 : size}" font-weight="${i ? 400 : weight}" fill="#111">${esc(l)}</text>`).join('')}</svg>`)

/** rows: [{caption, pairs: [[gbPanel, usPanel], ...]}] → one PNG. */
async function sheet(out, title, sub, rows) {
  const GAP = 16, CAP = 26
  const rowDims = rows.map(r => ({ w: r.pairs.reduce((s, [g, u]) => s + g.w + u.w + GAP * 3, 0), h: CAP + Math.max(...r.pairs.flatMap(([g, u]) => [g.h, u.h])) + GAP }))
  const W = Math.max(...rowDims.map(d => d.w), 900), HEAD = 64
  const H = HEAD + rowDims.reduce((s, d) => s + d.h, 0)
  const comps = [{ input: textSvg(W, HEAD, [title, sub], 20, '#f1f5f9', 700), top: 0, left: 0 }]
  let y = HEAD
  rows.forEach((r, ri) => {
    comps.push({ input: textSvg(W, CAP, [r.caption], 14, '#fff', 600), top: y, left: 0 })
    let x = GAP
    for (const [g, u] of r.pairs) {
      comps.push({ input: g.buf, top: y + CAP, left: x }); x += g.w + GAP
      comps.push({ input: u.buf, top: y + CAP, left: x }); x += u.w + GAP * 2
    }
    y += rowDims[ri].h
  })
  await sharp({ create: { width: W, height: H, channels: 3, background: '#cbd5e1' } }).composite(comps).png({ palette: true, compressionLevel: 9 }).toFile(out)
  const size = fs.statSync(out).size
  console.log(path.relative(REPO, out), `${W}x${H}`, (size / 1e6).toFixed(2), 'MB')
  if (size >= 4e6) throw new Error('sheet over 4 MB')
}

const issueFor = (surfacePrefix, text) => (findings.issues || []).find(i => i.surface.startsWith(surfacePrefix) && i.match && text.includes(i.match))

;(async () => {
  // ── sheet 10: tickets ──
  const tk = (scn, paper) => T.tickets.find(t => t.scenario === scn && t.paper === paper)
  const tmarks = (t, c) => (t.marks?.[c] || []).map(mk => {
    const iss = issueFor('Printed ticket', mk.text)
    const row = t.lines[c].find(l => l.text.trim() === mk.text)
    const label = iss ? iss.id : /PICKUP|COLLECT/.test(mk.text) ? `${mk.text.replace(/^#\S+\s+/, '').length}/${Math.floor(t.cols / 2)} dbl cols` : /^Subtotal/.test(mk.text) ? 'US only, fits' : ''
    return { ...mk, issue: !!iss, label: iss ? iss.id : label }
  })
  const tp = async (scn, paper) => { const t = tk(scn, paper); return [
    await panel(`ticket-${scn}-${paper}mm-gb.png`, tmarks(t, 'GB')), await panel(`ticket-${scn}-${paper}mm-us.png`, tmarks(t, 'US'))] }
  await sheet(path.join(SHEETS, 'sheet-10-printed-tickets.png'),
    'D-print · Printed kitchen ticket (ESC/POS) — 58 mm (32 cols) and 80 mm (48 cols) · GB left / US right',
    'Decoded from the real renderTicket bytes. Worst case: #A123, pickup 12:45 / 12:45 PM, 6 items, long modifier list, notes, 4-digit total, US tax/fee/card fee/tip. No row wraps in either country (green = measured, fits).',
    [
      { caption: 'Worst-case order, possible-duplicate banner — 58 mm (left pair) and 80 mm (right pair)', pairs: [await tp('main', 58), await tp('main', 80)] },
      { caption: 'Card held (DO NOT COLLECT / DO NOT CHARGE) — 58 mm and 80 mm;  Print test ticket — 58 mm and 80 mm', pairs: [await tp('held', 58), await tp('held', 80), await tp('test', 58), await tp('test', 80)] },
    ])

  // ── sheet 12: emails + plans PDF ──
  const er = (key, w) => E.raw.find(r => r.key === key && r.width === w)
  const emarks = (r, c) => (r[c].marks || []).map(mk => {
    const iss = issueFor('Email', mk.text)
    return { ...mk, issue: !!iss, label: iss ? iss.id : (/^Subtotal/.test(mk.text) ? 'US only, 1 line' : '') }
  })
  const ep = async (key, w, k = 1, crop = null) => { const r = er(key, w); return [
    await panel(`email-${key}-${w}-gb.png`, emarks(r, 'GB'), k, crop), await panel(`email-${key}-${w}-us.png`, emarks(r, 'US'), k, crop)] }
  const pdf = [await panel('plans-pdf-head-794-gb.png', [], 0.6), await panel('plans-pdf-head-816-us.png', [], 0.6)]
  await sheet(path.join(SHEETS, 'sheet-12-emails-plans-pdf.png'),
    'D-print · Emails (real lib/email.ts builders, WebKit) at 375 and 600 px · Plans PDF header (A4 vs US Letter) · GB left / US right',
    'Fixtures: Pizza Kitchen, 12:45 / 12:45 PM, Wednesday 30 September / Wednesday, September 30, 4-digit totals, US tax 8.875% + fee + card fee + tip 20%. No US-only wrap or overflow found (green = measured, fits).',
    [
      { caption: 'Customer · order confirmed — 375 px (left pair) and 600 px (right pair)', pairs: [await ep('confirm', 375), await ep('confirm', 600, 0.75)] },
      { caption: 'Customer · slot moved (12:45 PM, previously 12:30 AM) 375 px · Operator · new order 375 px · Operator · new events found 375 px · Event cancelled 375 px (tops)', pairs: [await ep('slot-moved', 375, 0.75, 700), await ep('new-order', 375, 0.75, 700), await ep('new-events', 375, 0.75, 700), await ep('event-cancel', 375, 0.75, 400)] },
      { caption: 'Plans PDF header (the only date: "Generated 2026-09-30", ISO in both) — A4 794 px vs US Letter 816 px, 60%', pairs: [pdf] },
    ])
})().catch(e => { console.error(e); process.exit(1) })
