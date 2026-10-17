#!/usr/bin/env node
// US layout proposal, group A — contact sheets (BEFORE left / AFTER right, GB and US, each change boxed and labelled with
// its fix number and audit id), and the GB comparison (<beforeDir>/../compare-A.json is NOT written: the compare goes to
// <sheetsDir>/../compare.json, beside before/ and after/).
//   node scripts/us-layout-proposal/A/sheets.cjs <beforeDir> <afterDir> <sheetsDir>
const fs = require('fs'); const path = require('path')
const { REPO } = require('./fixtures.cjs')
const sharp = require(path.join(REPO, 'node_modules/sharp'))
const [B, A, S] = process.argv.slice(2).map(p => p && path.resolve(p))
if (!S) { console.error('usage: sheets.cjs <beforeDir> <afterDir> <sheetsDir>'); process.exit(2) }
fs.mkdirSync(S, { recursive: true })
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'))
const MB = J(path.join(B, 'measure.json')), MA = J(path.join(A, 'measure.json'))
const CB = J(path.join(B, 'crops.json')), CA = J(path.join(A, 'crops.json'))
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dirOf = { before: B, after: A }, cropsOf = { before: CB, after: CA }

// ── measurement phrases for the notes ──
const card = (m, k, i = 0) => (m[k] && m[k].cards && m[k].cards[i]) || {}
const cardTxt = (m, k, i = 0) => { const c = card(m, k, i); return `${c.rangeLines} line${c.rangeLines > 1 ? 's' : ''}, card ${c.cardH} px${c.live ? `, Live on the ${c.liveOnDateLine ? 'date' : 'time'} line` : ''}` }
const foot = (m, k) => (m[k] || {}).footer || {}
const sheet = (m, k) => (m[k] || {}).sheet || {}
const pick = (m, k) => (m[k] || {}).pickup || {}
const ct = (m, k) => (m[k] || {}).chooseTime || {}
const bands = (m, k) => ((m[k] || {}).bands || []).map(b => `${b.section.toLowerCase()} ${b.tinted ? 'TINT' : 'white'}`).join(' · ')

const P = (side, code, stem, size, label, boxLabel) => ({ side, file: `${stem}-${size}-${code.toLowerCase()}.png`, label: label || `${code} · ${side.toUpperCase()}`, box: boxLabel })
const quad = (stem, size, fixGB, fixUS) => [P('before', 'GB', stem, size, null, fixGB), P('after', 'GB', stem, size, null, fixGB), P('before', 'US', stem, size, null, fixUS), P('after', 'US', stem, size, null, fixUS)]
const pairs = (stem, size, fixGB, fixUS) => [[P('before', 'GB', stem, size, null, fixGB), P('after', 'GB', stem, size, null, fixGB)], [P('before', 'US', stem, size, null, fixUS), P('after', 'US', stem, size, null, fixUS)]]

const SHEETS = [
  { file: 'sheet-01-order-header-public-embed.png', title: 'Group A · fixes 1 and 2 · Order page event header and chooser, public truck page, embed (TruckListCard) · BEFORE | AFTER, GB then US', rows: [
    { head: 'Fix 1 + 2 (A-01 GB and US) · Order page › event header, LIVE event 11:30–22:45 · 360 px',
      note: `GB ${cardTxt(MB, 'order-menu|GB|360')} → ${cardTxt(MA, 'order-menu|GB|360')}. US ${cardTxt(MB, 'order-menu|US|360')} → ${cardTxt(MA, 'order-menu|US|360')} (range ${card(MA, 'order-menu|US|360').rangeW} px whole; column ${card(MB, 'order-menu|US|360').colW} → ${card(MA, 'order-menu|US|360').colW} px, venue column ${card(MB, 'order-menu|US|360').venueW} → ${card(MA, 'order-menu|US|360').venueW} px). Fix 1: the no-break spaces keep "11:30 AM" and "10:45 PM" whole.`,
      panes: quad('order-header', 360, 'Fix 2 · A-01', 'Fix 1+2 · A-01') },
    { head: 'Fix 1 + 2 (A-02) · Order page › event header, pre-order 17:00–21:00 · 360 px',
      note: `GB ${cardTxt(MB, 'order-typical|GB|360')} → ${cardTxt(MA, 'order-typical|GB|360')} (unchanged). US "5:00 PM – 9:00 PM" ${cardTxt(MB, 'order-typical|US|360')} ("PM" orphaned) → ${cardTxt(MA, 'order-typical|US|360')}.`,
      panes: quad('order-header-typical', 360, null, 'Fix 1+2 · A-02') },
    { head: 'Fix 1 + 2 (A-02) · Order page › event header, midnight-spanning 20:00–00:30 · 390 px',
      note: `GB ${cardTxt(MB, 'order-midnight|GB|390')} → ${cardTxt(MA, 'order-midnight|GB|390')} (unchanged). US "8:00 PM – 12:30 AM" ${cardTxt(MB, 'order-midnight|US|390')} → ${cardTxt(MA, 'order-midnight|US|390')}.`,
      panes: quad('order-header-midnight', 390, null, 'Fix 1+2 · A-02') },
    { head: 'Fix 2 (A-01, A-02) · Order page › event header · 768 px (GB pair, then US pair)',
      note: `Live event: GB ${cardTxt(MB, 'order-menu|GB|768')} → ${cardTxt(MA, 'order-menu|GB|768')}; US ${cardTxt(MB, 'order-menu|US|768')} → ${cardTxt(MA, 'order-menu|US|768')}.`,
      panes: pairs('order-header', 768, 'Fix 2 · A-01', 'Fix 2 · A-01') },
    { head: 'Fix 2 (A-03) · Order page › event chooser (full card, sm: 140 px column) · 768 px',
      note: `Live row: GB ${cardTxt(MB, 'order-chooser|GB|768')} → ${cardTxt(MA, 'order-chooser|GB|768')}; US ${cardTxt(MB, 'order-chooser|US|768')} → ${cardTxt(MA, 'order-chooser|US|768')}. Phones keep their one-line row (date · range · Live) — see the 360 row below.`,
      panes: pairs('order-chooser', 768, 'Fix 2', 'Fix 2 · A-03') },
    { head: 'Fix 2 · Order page › event chooser · 360 px (row layout: unchanged by design)',
      note: `Phones: GB card ${card(MB, 'order-chooser|GB|360').cardH} → ${card(MA, 'order-chooser|GB|360').cardH} px, US ${card(MB, 'order-chooser|US|360').cardH} → ${card(MA, 'order-chooser|US|360').cardH} px, every range one line before and after.`,
      panes: quad('order-chooser', 360, null, null) },
    { head: 'Fix 2 (A-07) · Public truck page (TruckClient, the truck\'s own time settings) · 768 px',
      note: `Live card: GB ${cardTxt(MB, 'sched|GB|768')} → ${cardTxt(MA, 'sched|GB|768')}; US ${cardTxt(MB, 'sched|US|768')} → ${cardTxt(MA, 'sched|US|768')}.`,
      panes: pairs('schedule', 768, 'Fix 2', 'Fix 2 · A-07') },
    { head: 'Fix 2 (A-07) · Custom-domain / embed schedule (EmbedSchedule) · 768 px',
      note: `Live card: GB ${cardTxt(MB, 'domain|GB|768')} → ${cardTxt(MA, 'domain|GB|768')}; US ${cardTxt(MB, 'domain|US|768')} → ${cardTxt(MA, 'domain|US|768')}.`,
      panes: pairs('embed', 768, 'Fix 2', 'Fix 2 · A-07') },
    { head: 'Fix 2 · Public truck page and embed · 360 px (row layout: unchanged by design)',
      note: `Phones: schedule cards GB ${card(MB, 'sched|GB|360').cardH} → ${card(MA, 'sched|GB|360').cardH} px, US ${card(MB, 'sched|US|360').cardH} → ${card(MA, 'sched|US|360').cardH} px; embed GB ${card(MB, 'domain|GB|360').cardH} → ${card(MA, 'domain|GB|360').cardH}, US ${card(MB, 'domain|US|360').cardH} → ${card(MA, 'domain|US|360').cardH}.`,
      panes: [P('before', 'US', 'schedule', 360, 'US schedule · BEFORE'), P('after', 'US', 'schedule', 360, 'US schedule · AFTER'), P('before', 'US', 'embed', 360, 'US embed · BEFORE'), P('after', 'US', 'embed', 360, 'US embed · AFTER')] },
  ] },
  { file: 'sheet-02-basket-checkout.png', title: 'Group A · fix 10 (customer) · Order page › basket footer and checkout sheet · BEFORE | AFTER, GB then US · 360 × 800', rows: [
    { head: 'Fix 10 (A-04) · Basket footer, collapsed · 360 px',
      note: `GB ${foot(MB, 'order-menu|GB|360').h} → ${foot(MA, 'order-menu|GB|360').h} px; US ${foot(MB, 'order-menu|US|360').h} → ${foot(MA, 'order-menu|US|360').h} px (unchanged: the fold is inside the expanded basket).`,
      panes: quad('basket-collapsed', 360, null, null) },
    { head: 'Fix 10 (A-04) · Basket footer, EXPANDED · 360 × 800',
      note: `GB ${foot(MB, 'order-basket|GB|360').h} px (${foot(MB, 'order-basket|GB|360').pctOfScreen} %) → ${foot(MA, 'order-basket|GB|360').h} px (${foot(MA, 'order-basket|GB|360').pctOfScreen} %), unchanged. US ${foot(MB, 'order-basket|US|360').h} px (${foot(MB, 'order-basket|US|360').pctOfScreen} % of the screen, 4 charge rows) → ${foot(MA, 'order-basket|US|360').h} px (${foot(MA, 'order-basket|US|360').pctOfScreen} %): item lines capped at 30vh and scrolling (${(foot(MA, 'order-basket|US|360').capped || {}).clientH} of ${(foot(MA, 'order-basket|US|360').capped || {}).scrollH} px), Subtotal + "Tax & fees" + Total kept in view.`,
      panes: quad('basket-expanded', 360, null, 'Fix 10 · A-04') },
    { head: 'Fix 10 (A-04) · Basket footer, expanded, "Tax & fees" tapped open · 360 × 800 (US only; GB has no such lines)',
      note: `US AFTER: the row opens to Sales tax 8.875%, Online service fee and Tip 20%, indented; footer ${foot(MA, 'order-basket-fees|US|360').h} px (${foot(MA, 'order-basket-fees|US|360').pctOfScreen} %), the cap holds.`,
      panes: [P('before', 'US', 'basket-fees', 360, 'US · BEFORE (no fold: 4 rows)'), P('after', 'US', 'basket-expanded', 360, 'US · AFTER, folded', 'Fix 10'), P('after', 'US', 'basket-fees', 360, 'US · AFTER, opened', 'Fix 10')] },
    { head: 'Fix 10 (A-05) · Checkout sheet as it opens (first screen, no scrolling) · 360 × 800',
      note: `GB unchanged: summary ${sheet(MB, 'order-sheet|GB|360').summaryExpandedAtOpen ? 'expanded' : 'collapsed'} → ${sheet(MA, 'order-sheet|GB|360').summaryExpandedAtOpen ? 'expanded' : 'collapsed'}, scroll to Place order ${sheet(MB, 'order-sheet|GB|360').scrollToPlace} → ${sheet(MA, 'order-sheet|GB|360').scrollToPlace} px. US: summary expanded → collapsed; content ${sheet(MB, 'order-sheet|US|360').contentH} → ${sheet(MA, 'order-sheet|US|360').contentH} px; Place order ${sheet(MB, 'order-sheet|US|360').scrollToPlace} px below the first screen → visible without scrolling (${sheet(MA, 'order-sheet|US|360').placeVisibleAtOpen}), with Total, in a ${sheet(MA, 'order-sheet|US|360').stickyFooterH} px sticky footer.`,
      panes: quad('sheet-open', 360, null, 'Fix 10 · A-05') },
    { head: 'Fix 10 (A-05) · Checkout sheet scrolled to its end · 360 × 800',
      note: 'US AFTER: the totals box keeps Subtotal, tax, fee and tip; Total and Place order stay in the sticky footer. GB unchanged.',
      panes: quad('sheet-end', 360, null, null) },
  ] },
  { file: 'sheet-03-manage-my-order-choose-time.png', title: 'Group A · fixes 11 and 12 · Manage my order › Pickup row (OPEN QUESTION: GB both ways) and the "Choose time" select', rows: [
    { head: 'Fix 11 (A-06) · Manage my order › Pickup, long venue · 360 px — GB: BEFORE | AFTER (MANAGE_PICKUP_STACK_GB = false) | AFTER, GB too (= true)',
      note: `GB: ${pick(MB, 'manage-longvenue|GB|360').valueLines} line, row ${pick(MB, 'manage-longvenue|GB|360').rowH} px → false: ${pick(MA, 'manage-longvenue|GB|360').rowH} px (unchanged) · true: ${pick(MA, 'manage-longvenue-gbtoo|GB|360').valueLines} lines, row ${pick(MA, 'manage-longvenue-gbtoo|GB|360').rowH} px, card ${pick(MA, 'manage-longvenue|GB|360').cardH} → ${pick(MA, 'manage-longvenue-gbtoo|GB|360').cardH} px.`,
      panes: [P('before', 'GB', 'manage-longvenue', 360, 'GB · BEFORE'), P('after', 'GB', 'manage-longvenue', 360, 'GB · AFTER (false)'), P('after', 'GB', 'manage-longvenue-gbtoo', 360, 'GB · AFTER, GB too (true)', 'Fix 11')] },
    { head: 'Fix 11 (A-06) · Manage my order › Pickup, long venue · 360 px — US: BEFORE | AFTER',
      note: `US: "${pick(MB, 'manage-longvenue|US|360').value}" ${pick(MB, 'manage-longvenue|US|360').valueLines} lines, gap to the label ${pick(MB, 'manage-longvenue|US|360').gapLabelToValue} px, text-align ${pick(MB, 'manage-longvenue|US|360').valueAlign}, row ${pick(MB, 'manage-longvenue|US|360').rowH} px → time and venue on lines of their own, gap ${pick(MA, 'manage-longvenue|US|360').gapLabelToValue} px, right-aligned, row ${pick(MA, 'manage-longvenue|US|360').rowH} px.`,
      panes: [P('before', 'US', 'manage-longvenue', 360, null, 'A-06'), P('after', 'US', 'manage-longvenue', 360, null, 'Fix 11')] },
    { head: 'Fix 11 · Manage my order › Pickup, normal venue · 360 px — GB BEFORE | AFTER (false) | AFTER, GB too (true) | US BEFORE | US AFTER',
      note: `Normal venue: US row ${pick(MB, 'manage|US|360').rowH} → ${pick(MA, 'manage|US|360').rowH} px (the stacked layout applies to every 12-hour order, card ${pick(MB, 'manage|US|360').cardH} → ${pick(MA, 'manage|US|360').cardH} px); GB false ${pick(MA, 'manage|GB|360').rowH} px, true ${pick(MA, 'manage-gbtoo|GB|360').rowH} px.`,
      panes: [P('before', 'GB', 'manage', 360, 'GB · BEFORE'), P('after', 'GB', 'manage', 360, 'GB · AFTER (false)'), P('after', 'GB', 'manage-gbtoo', 360, 'GB too (true)', 'Fix 11'), P('before', 'US', 'manage', 360), P('after', 'US', 'manage', 360, null, 'Fix 11')] },
    { head: 'Fix 11 · Manage my order › Pickup, long venue · 390 px — GB AFTER (false) | GB too (true) | US BEFORE | US AFTER',
      note: `390: US BEFORE fit on one line (${pick(MB, 'manage-longvenue|US|390').valueLines}); AFTER it is stacked like 360 (row ${pick(MA, 'manage-longvenue|US|390').rowH} px).`,
      panes: [P('after', 'GB', 'manage-longvenue', 390, 'GB · AFTER (false)'), P('after', 'GB', 'manage-longvenue-gbtoo', 390, 'GB too (true)'), P('before', 'US', 'manage-longvenue', 390), P('after', 'US', 'manage-longvenue', 390)] },
    { head: 'Fix 12 (GB bug too) · Checkout sheet › "Choose time" select · 360 px',
      note: `Ink measured on pixels: words' right edge vs the ▾'s left edge — BEFORE ${ct(MB, 'order-sheet-asap|GB|360').overrunPx > 0 ? `${ct(MB, 'order-sheet-asap|GB|360').overrunPx} px INTO the ▾` : `${-ct(MB, 'order-sheet-asap|GB|360').overrunPx} px clear`} (the audit's box measure: 5 px) → AFTER ${-ct(MA, 'order-sheet-asap|GB|360').overrunPx} px clear, GB and US alike (padding 6/14 px and the ▾ at 8 px, below 380 px only).`,
      panes: quad('choose-time', 360, 'Fix 12', 'Fix 12') },
    { head: 'Fix 12 · "Choose time" · 390 px (unchanged: the change applies below 380 px)',
      note: `390: ${-ct(MB, 'order-sheet-asap|GB|390').overrunPx} px clear → ${-ct(MA, 'order-sheet-asap|GB|390').overrunPx} px clear.`,
      panes: quad('choose-time', 390, null, null) },
  ] },
  { file: 'sheet-04-us-landing-bands.png', title: 'Group A · fix 13 · US landing without the testimonial: the white / tint band alternation · BEFORE | AFTER, GB then US', landing: true, rows: [
    { head: 'Fix 13 · Landing, trust strip to footer · 390 px',
      note: `GB (byte-identical HTML, see compare.json): ${bands(MA, 'landing|GB|390')}. US BEFORE: ${bands(MB, 'landing|US|390')} — "how it works" and pricing two tints back to back. US AFTER: ${bands(MA, 'landing|US|390')}.`,
      panes: [P('before', 'GB', 'landing', 390, 'GB · BEFORE'), P('after', 'GB', 'landing', 390, 'GB · AFTER'), P('before', 'US', 'landing', 390, 'US · BEFORE'), P('after', 'US', 'landing', 390, 'US · AFTER')], bandKey: 'landing|{code}|390', maxH: 2600 },
    { head: 'Fix 13 · Landing, trust strip to footer · 1280 px',
      note: `US AFTER: pricing white (the "switch" box turns wash, still one step off its section), the final CTA band tinted. GB unchanged.`,
      panes: [P('before', 'GB', 'landing', 1280, 'GB · BEFORE'), P('after', 'GB', 'landing', 1280, 'GB · AFTER'), P('before', 'US', 'landing', 1280, 'US · BEFORE'), P('after', 'US', 'landing', 1280, 'US · AFTER')], bandKey: 'landing|{code}|1280' },
  ] },
]

async function textBlock(text, width, size, bold, color = '#0f172a') {
  const per = Math.floor(width / (size * 0.53)); const words = String(text).split(' '); const lines = ['']
  for (const wd of words) { if ((lines[lines.length - 1] + ' ' + wd).trim().length > per) lines.push(wd); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + wd).trim() }
  const lh = Math.round(size * 1.35), h = lines.length * lh + 4
  const svg = `<svg width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">${lines.map((l, i) => `<text x="0" y="${(i + 1) * lh - 4}" font-family="Helvetica, Arial" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${color}">${esc(l)}</text>`).join('')}</svg>`
  return { buf: await sharp(Buffer.from(svg)).png().toBuffer(), h }
}

async function build(sheet) {
  const W = 1720, PAD = 16, GAP = 18
  const parts = []; let y = 0
  const head = await textBlock(sheet.title, W - 2 * PAD, 22, true); parts.push({ input: head.buf, top: 10, left: PAD }); y += head.h + 22
  for (const r of sheet.rows) {
    const lines = Array.isArray(r.panes[0]) ? r.panes : [r.panes]
    const t1 = await textBlock(r.head, W - 2 * PAD, 17, true); parts.push({ input: t1.buf, top: y, left: PAD }); y += t1.h + 2
    const t2 = await textBlock(r.note, W - 2 * PAD, 14, false, '#334155'); parts.push({ input: t2.buf, top: y, left: PAD }); y += t2.h + 8
    for (const panes of lines) {
      const n = panes.length, paneW = Math.floor((W - 2 * PAD - (n - 1) * GAP) / n)
      const metas = await Promise.all(panes.map(p => sharp(path.join(dirOf[p.side], p.file)).metadata()))
      const cssW = panes.map((p, i) => metas[i].width / cropsOf[p.side][p.file].dsf), cssH = panes.map((p, i) => metas[i].height / cropsOf[p.side][p.file].dsf)
      let scale = Math.min(sheet.landing ? 1 : 1.6, paneW / Math.max(...cssW))
      if (sheet.landing) scale = Math.min(scale, (r.maxH || 1500) / Math.max(...cssH))
      let rowH = 0
      for (let i = 0; i < n; i++) {
        const p = panes[i], c = cropsOf[p.side][p.file]
        const w = Math.round(cssW[i] * scale), h = Math.round(cssH[i] * scale)
        const left = PAD + i * (paneW + GAP)
        const lab = await textBlock(p.label, paneW, 14, true, p.side === 'after' ? '#15803d' : '#64748b'); parts.push({ input: lab.buf, top: y, left })
        const img = await sharp(path.join(dirOf[p.side], p.file)).resize(w, h).png().toBuffer()
        const boxes = p.box ? c.boxes : []
        let bandSvg = ''
        if (sheet.landing && r.bandKey) {
          const code = p.file.endsWith('-gb.png') ? 'GB' : 'US'
          const m = (p.side === 'before' ? MB : MA)[r.bandKey.replace('{code}', code)]
          bandSvg = (m.bands || []).map(b => { const by = (b.top - c.clip.y) * scale; if (by < -2 || by > h) return ''
            const txt = `${b.tinted ? 'TINT' : 'white'} · ${b.section.toLowerCase()}`, lw = txt.length * 7.2 + 10
            const lx = w + 10 + lw < paneW ? w + 10 : w - lw - 4   // beside the page when there is room, else inside it
            return `<line x1="2" y1="${by + 2}" x2="${Math.max(w, lx) + 2}" y2="${by + 2}" stroke="${b.tinted ? '#0369a1' : '#f97316'}" stroke-width="1.5" stroke-dasharray="4 3"/><rect x="${lx}" y="${by + 4}" width="${lw}" height="18" rx="3" fill="${b.tinted ? '#0369a1' : '#f97316'}"/><text x="${lx + 5}" y="${by + 17}" font-family="Helvetica, Arial" font-size="12" font-weight="700" fill="#fff">${esc(txt)}</text>` }).join('')
        }
        const svg = `<svg width="${sheet.landing ? paneW : w + 4}" height="${h + 4}" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="${w + 2}" height="${h + 2}" fill="none" stroke="#94a3b8" stroke-width="1"/>
          ${boxes.map(b => { const bx = b.x * scale + 2, by = b.y * scale + 2, bw = b.w * scale, bh = b.h * scale; const lw = p.box.length * 8 + 10
            const lx = Math.max(2, Math.min(bx + bw - lw, w - lw)), ly = by > 22 ? by - 21 : by + bh + 2
            return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="#dc2626" stroke-width="2.5" rx="3"/><rect x="${lx}" y="${ly}" width="${lw}" height="19" fill="#dc2626" rx="3"/><text x="${lx + 5}" y="${ly + 14}" font-family="Helvetica, Arial" font-size="13" font-weight="700" fill="#fff">${esc(p.box)}</text>` }).join('')}${bandSvg}</svg>`
        parts.push({ input: img, top: y + lab.h + 2, left: left + 2 }, { input: Buffer.from(svg), top: y + lab.h, left })
        rowH = Math.max(rowH, lab.h + h + 6)
      }
      y += rowH + 12
    }
    y += 14
  }
  const out = path.join(S, sheet.file)
  await sharp({ create: { width: W, height: y + PAD, channels: 3, background: '#ffffff' } }).composite(parts).png({ compressionLevel: 9, palette: true }).toFile(out)
  const mb = fs.statSync(out).size / 1e6
  console.log(sheet.file, mb.toFixed(2), 'MB', `${W}x${y + PAD}`)
  if (mb >= 4) throw new Error(`${sheet.file} is ${mb.toFixed(2)} MB (limit 4 MB)`)
}

// ── GB, BEFORE vs AFTER: every rendered GB page's HTML, and every GB crop's pixels ──
async function compareGB() {
  const out = { html: {}, pixels: {} }
  for (const f of fs.readdirSync(path.join(B, 'html')).filter(f => f.endsWith('-gb.html'))) {
    const a = path.join(A, 'html', f); if (!fs.existsSync(a)) continue
    const x = fs.readFileSync(path.join(B, 'html', f)), y = fs.readFileSync(a)
    out.html[f] = x.equals(y) ? 'identical' : `differs (${x.length} → ${y.length} bytes)`
  }
  for (const f of Object.keys(CB).filter(f => f.endsWith('-gb.png'))) {
    if (!CA[f]) continue
    const [x, y] = await Promise.all([B, A].map(d => sharp(path.join(d, f)).raw().toBuffer({ resolveWithObject: true })))
    if (x.info.width !== y.info.width || x.info.height !== y.info.height) { out.pixels[f] = `size ${x.info.width / CB[f].dsf}x${x.info.height / CB[f].dsf} → ${y.info.width / CA[f].dsf}x${y.info.height / CA[f].dsf}`; continue }
    let n = 0; for (let i = 0; i < x.data.length; i += x.info.channels) if (x.data[i] !== y.data[i] || x.data[i + 1] !== y.data[i + 1] || x.data[i + 2] !== y.data[i + 2]) n++
    out.pixels[f] = n ? `${n} pixels differ` : 'identical'
  }
  out.landingGbHtmlIdentical = out.html['landing-gb.html'] === 'identical'
  const file = path.join(path.dirname(S), 'compare.json')
  fs.writeFileSync(file, JSON.stringify(out, null, 1))
  console.log('GB landing HTML byte-identical:', out.landingGbHtmlIdentical, '→', file)
}

;(async () => { for (const s of SHEETS) await build(s); await compareGB() })().catch(e => { console.error(e); process.exit(1) })
