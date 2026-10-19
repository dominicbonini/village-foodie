// scripts/us-layout-audit/D-print/tickets.cjs — US layout audit, group D-print, surface 1: printed kitchen tickets.
// The REAL ticket: a worst-case Order → mapOrderToTicket → renderTicket (ESC/POS bytes), exactly as usePrinting's onPrint
// does (printedLabel = formatInstantClock(now, truck.time), stampNow's own call). The BYTES are decoded back into printed
// rows here (ESC a / GS ! / ESC E / GS B / LF), so every count below is what the printer receives, not a model of it.
// Each row's physical width = characters × (2 when GS ! 0x11 double width). A row wider than the paper (32 cols at
// 58 mm, 48 at 80 mm) is wrapped by the printer; this script reports every such row, and every row whose count
// changed GB → US. PNGs are a monospace paint of the decoded rows, overflow (where the printer would wrap) in red.
//
//   node scripts/us-layout-audit/D-print/tickets.cjs
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const F = require('./_fixtures.cjs')
const kit = require('../../_render-kit.cjs')({ cacheTag: 'usaudit-D-print' })
const OUT = path.join(REPO, 'docs/us-layout-audit/D-print')
fs.mkdirSync(OUT, { recursive: true })

const COLS = { 58: 32, 80: 48 }

/** ESC/POS bytes → printed rows {text, size, align, bold, invert}. */
function decode(bytes) {
  const rows = []; let cur = { text: '', size: 'normal', align: 'left', bold: false, invert: false }
  let size = 'normal', align = 'left', bold = false, invert = false
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b === 0x1B) { const c = bytes[i + 1]
      if (c === 0x40) { i += 1; continue }
      if (c === 0x74 || c === 0x64) { if (c === 0x64 && rows.length + cur.text.length === 0) { /* leading feed */ } i += 2; continue }
      if (c === 0x61) { align = bytes[i + 2] === 1 ? 'center' : 'left'; i += 2; continue }
      if (c === 0x45) { bold = bytes[i + 2] === 1; i += 2; continue }
    }
    if (b === 0x1D) { const c = bytes[i + 1]
      if (c === 0x21) { size = bytes[i + 2] === 0x11 ? 'large' : 'normal'; i += 2; continue }
      if (c === 0x42) { invert = bytes[i + 2] === 1; i += 2; continue }
      if (c === 0x56) { i += 2; continue }
    }
    if (b === 0x0A) { rows.push({ ...cur, size, align, bold, invert }); cur = { text: '' }; continue }
    cur.text += b === 0xA3 ? '£' : String.fromCharCode(b)
  }
  return rows.map(r => ({ ...r, phys: r.text.length * (r.size === 'large' ? 2 : 1) }))
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
/** Monospace paint of the printed rows. 1 col = 9px; a large row is drawn at 2× (double width AND height). */
function ticketHtml(rows, cols, title) {
  const CW = 9.0; const pad = 12
  const body = rows.map(r => {
    const k = r.size === 'large' ? 2 : 1
    const fit = Math.floor(cols / k)
    const style = `font-size:${15 * k}px;line-height:${18 * k}px;font-weight:${r.bold ? 700 : 400};text-align:${r.align === 'center' ? 'center' : 'left'}`
    const span = t => r.invert ? `<span style="background:#111;color:#fff">${esc(t)}</span>` : esc(t)
    if (r.text.length <= fit) return `<div class="r" style="${style}">${span(r.text) || '&nbsp;'}</div>`
    // the printer wraps at the paper edge: show the carried-over remainder in red, on its own row
    let out = `<div class="r over" style="${style}">${span(r.text.slice(0, fit))}</div>`
    for (let i = fit; i < r.text.length; i += fit) out += `<div class="r wrapped" style="${style}">${span(r.text.slice(i, i + fit))}</div>`
    return out
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#e5e7eb;font-family:Menlo,monospace}
  .h{font:600 13px -apple-system,system-ui;padding:6px ${pad}px;color:#111}
  .p{background:#fff;width:${cols * CW}px;padding:10px ${pad}px 14px;margin:0 ${pad}px 12px;box-shadow:0 1px 3px #0003}
  .r{white-space:pre;overflow:visible;letter-spacing:0;font-family:Menlo,monospace}
  .r>*{font-family:inherit}
  .wrapped{background:#fecaca;outline:1px solid #dc2626}
  .over{outline:1px dashed #dc2626}
  </style></head><body><div class="h">${esc(title)}</div><div class="p" id="paper">${body}</div></body></html>`
}

;(async () => {
  const m = await kit.bundle('tickets', [
    "export { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'",
    "export { renderTicket, buildTicketLines } from '@/lib/printing/ticket'",
    "export { renderTestTicket } from '@/lib/printing/testTicket'",
    "export { formatInstantClock } from '@/lib/time-utils'",
  ].join('\n'))

  const SCEN = [
    { key: 'main', label: 'worst case: 6 items, modifiers, notes, buzzer, phone, unpaid, possible-duplicate banner',
      ledger: [], reprint: { reason: 'possible_duplicate', attempt: 2 } },
    { key: 'held', label: 'card held (uncaptured authorisation)', ledger: [], held: true },
    { key: 'partrefund', label: 'part refunded', ledger: [{ kind: 'charge', channel: 'card_online', amount_minor: 999999, state: 'succeeded', livemode: true }, { kind: 'refund', channel: 'card_online', amount_minor: 1000, state: 'succeeded', livemode: true }] },
    { key: 'midnight', label: 'slot 00:30 (12:30 AM), event spanning midnight', slot: '00:30', ledger: [] },
    { key: 'asap', label: 'no slot (ASAP)', slot: null, ledger: [] },
    { key: 'test', label: 'Print test ticket' },
  ]
  const result = { tickets: [] }
  for (const scn of SCEN) for (const paper of [58, 80]) {
    const per = {}
    for (const c of ['GB', 'US']) {
      kit.setNow(F.NOW[c]); kit.setDeviceTz(F.TIME[c].timeZone); kit.setDeviceLocale(F.TIME[c].locale)
      let bytes
      if (scn.key === 'test') {
        bytes = m.renderTestTicket({ truckName: 'Pizza Kitchen', paper, at: new Date(), time: F.TIME[c] })
      } else {
        const order = { ...F.order(c), ...('slot' in scn ? { slot: scn.slot } : {}) }
        const ticket = m.mapOrderToTicket({ order, truck: F.truck(c), event: F.EVENT, ledgerRows: scn.ledger,
          printedLabel: m.formatInstantClock(new Date(), F.TIME[c]), reprint: scn.reprint ?? null, heldAuthorisation: !!scn.held })
        bytes = m.renderTicket(ticket, { paper_width: paper })
      }
      const rows = decode(bytes)
      per[c] = rows
    }
    const cols = COLS[paper]
    const over = c => per[c].map((r, i) => ({ i, ...r })).filter(r => r.phys > cols)
    const entry = { scenario: scn.key, label: scn.label, paper, cols, rows: { GB: per.GB.length, US: per.US.length },
      printedRows: { GB: per.GB.reduce((s, r) => s + (r.size === 'large' ? 2 : 1), 0), US: per.US.reduce((s, r) => s + (r.size === 'large' ? 2 : 1), 0) },
      overGB: over('GB').map(r => ({ text: r.text, phys: r.phys })), overUS: over('US').map(r => ({ text: r.text, phys: r.phys })),
      maxPhys: { GB: Math.max(...per.GB.map(r => r.phys)), US: Math.max(...per.US.map(r => r.phys)) },
      timeRows: { GB: per.GB.filter(r => /\d:\d\d/.test(r.text)).map(r => ({ text: r.text, size: r.size, phys: r.phys, limit: cols })),
                  US: per.US.filter(r => /\d:\d\d/.test(r.text)).map(r => ({ text: r.text, size: r.size, phys: r.phys, limit: cols })) },
      usOnly: per.US.filter(r => !per.GB.some(g => g.text.replace(/[£$]/g, '') === r.text.replace(/[£$]/g, ''))).map(r => ({ text: r.text, size: r.size, phys: r.phys, limit: cols })),
      lines: per }
    result.tickets.push(entry)
  }
  // ── paint ──
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  const page = await browser.newPage({ viewport: { width: 520, height: 400 }, deviceScaleFactor: 1 })
  await page.route('**/*', r => r.request().url().startsWith('data:') ? r.continue() : r.abort())
  for (const t of result.tickets) {
    if (!['main', 'test', 'held'].includes(t.scenario)) continue
    for (const c of ['GB', 'US']) {
      await page.setContent(ticketHtml(t.lines[c], t.cols, `${c} · ${t.paper} mm (${t.cols} cols) · ${t.label}`))
      const box = await page.evaluate(() => { const b = document.body.getBoundingClientRect(); const p = document.getElementById('paper').getBoundingClientRect(); return { w: Math.ceil(Math.max(p.right + 12, 300)), h: Math.ceil(b.height) } })
      await page.setViewportSize({ width: box.w, height: Math.max(box.h, 100) })
      const f = path.join(OUT, `ticket-${t.scenario}-${t.paper}mm-${c.toLowerCase()}.png`)
      await page.screenshot({ path: f, fullPage: true })
      // rows the contact sheet boxes: the collect/pickup header, the charge rows, the print stamp
      ;(t.marks ??= {})[c] = await page.evaluate(() => [...document.querySelectorAll('.r')].map(el => ({ text: el.textContent.trim(), r: el.getBoundingClientRect() }))
        .filter(o => /^(#\S+\s+)?(PICKUP|COLLECT)|^(Subtotal|Sales tax|Service fee|Card fee|Tip)\b|^printed/.test(o.text))
        .map(o => ({ text: o.text, x: Math.round(o.r.left), y: Math.round(o.r.top), w: Math.round(o.r.width), h: Math.round(o.r.height) })))
    }
  }
  await browser.close()
  fs.writeFileSync(path.join(__dirname, 'tickets-measure.json'), JSON.stringify(result, null, 1))

  for (const t of result.tickets) {
    console.log(`${t.scenario} ${t.paper}mm rows GB ${t.rows.GB}/${t.printedRows.GB}  US ${t.rows.US}/${t.printedRows.US}  max ${t.maxPhys.GB}/${t.maxPhys.US} of ${t.cols}  over GB ${t.overGB.length} US ${t.overUS.length}`)
    for (const r of t.timeRows.US) console.log('   US time row:', JSON.stringify(r))
    for (const r of t.timeRows.GB) console.log('   GB time row:', JSON.stringify(r))
    for (const r of t.overUS) console.log('   US OVER:', JSON.stringify(r))
  }
})().catch(e => { console.error(e); process.exit(1) })
