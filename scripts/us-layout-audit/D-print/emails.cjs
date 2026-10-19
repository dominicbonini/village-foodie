// scripts/us-layout-audit/D-print/emails.cjs — US layout audit, group D-print, surface 3: emails that show times,
// dates or totals. The REAL template builders from lib/email.ts are called with the D-print fixtures (Pizza Kitchen):
//   formatConfirmationEmail (confirmed / slot taken / slot moved / received-preferred / ready / edit with held_short),
//   formatNewOrderEmail (operator), sendRefundEmail, sendCancellationEmail, sendEventCancellationEmail.
// The three send* builders only exist inside their senders, so `fetch` is replaced IN THIS PROCESS by a recorder that
// answers {ok:true} and never touches the network; BREVO_API_KEY is set to a dummy so the builder reaches it. NO EMAIL
// IS SENT. The operator "new events found" email lives inline in app/api/inbound-schedule/route.ts; its event-block
// markup is TRANSCRIBED below (route lines ~319-372) and filled by the same time-utils formatters the route calls.
// Each HTML is painted in WebKit at 375 and 600 px (network blocked) and measured: every text element's line count
// (Range.getClientRects grouped by line top), the document's horizontal overflow, the page height; GB vs US.
//
//   node scripts/us-layout-audit/D-print/emails.cjs
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const F = require('./_fixtures.cjs')
const kit = require('../../_render-kit.cjs')({ cacheTag: 'usaudit-D-print' })
const OUT = path.join(REPO, 'docs/us-layout-audit/D-print')
fs.mkdirSync(OUT, { recursive: true })

// ── the recorder that stands in for Brevo. Nothing leaves this process. ──
const sent = []
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.brevo.com/')) throw new Error('unexpected fetch ' + url)
  sent.push(JSON.parse(init.body)); return { ok: true, text: async () => '' }
}
process.env.BREVO_API_KEY = 'usaudit-no-send'

;(async () => {
  const m = await kit.bundle('emails', [
    "export { formatConfirmationEmail, formatNewOrderEmail, sendRefundEmail, sendCancellationEmail, sendEventCancellationEmail } from '@/lib/email'",
    "export { formatYmdShortMonth, formatTime } from '@/lib/time-utils'",
  ].join('\n'))

  const emailItems = F.ITEMS.map(i => ({ ...i, modifiers: (i.modifiers || []).map(x => ({ name: x.name, price: x.price })) }))
  const common = c => ({
    money: F.MONEY[c], time: F.TIME[c], phoneCountry: c, orderId: F.ORDER_ID, orderKey: '00000000-0000-4000-8000-0000000a0123',
    truckName: 'Pizza Kitchen', customerName: 'Alexandra Montgomery-Smith', items: emailItems, deals: [], discountAmt: 0,
    total: F.order(c).total, charges: c === 'US' ? F.US_CH : null, notes: F.NOTES,
    venueName: F.EVENT.venue_name, venueTown: F.EVENT.town, venuePostcode: c === 'GB' ? 'HV1 2AB' : 'NY 10027',
    preferredContactMethod: 'whatsapp', contactPhone: c === 'GB' ? '07700 900123' : '(212) 555-0147', whatsappSender: null,
    allowCancellation: true, cancellationCutoffMins: 30, baseUrl: 'https://www.hatchgrab.com', truckSlug: 'test-kitchen',
  })
  const EMAILS = [
    { key: 'confirm', label: 'Customer · order confirmed (collection time box)', build: c => m.formatConfirmationEmail({ ...common(c), slot: '12:45', autoAccepted: true }) },
    { key: 'confirm-taken', label: 'Customer · confirmed, requested slot taken', build: c => m.formatConfirmationEmail({ ...common(c), slot: '12:45', requestedSlot: '12:30', slotChanged: true, autoAccepted: true }) },
    { key: 'slot-moved', label: 'Customer · slot moved by the truck (previously …)', build: c => m.formatConfirmationEmail({ ...common(c), slot: '12:45', slotAdjustedFrom: '00:30', autoAccepted: true }) },
    { key: 'received', label: 'Customer · received, preferred time', build: c => m.formatConfirmationEmail({ ...common(c), slot: '12:45', autoAccepted: false }) },
    { key: 'ready', label: 'Customer · ready to collect', build: c => m.formatConfirmationEmail({ ...common(c), slot: '12:45', autoAccepted: true, variant: 'ready', paymentState: 'hatch' }) },
    { key: 'edit-held', label: 'Customer · order edited, card held for part (4-digit figures)', build: c => m.formatConfirmationEmail({ ...common(c), slot: '22:45', autoAccepted: true, paymentState: 'held_short', paidMinor: 0, heldMinor: 100000, balanceMinor: Math.round(F.order(c).total * 100) }) },
    { key: 'new-order', label: 'Operator · new order', build: c => m.formatNewOrderEmail({ ...common(c), customerPhone: c === 'GB' ? '07700 900123' : '(212) 555-0147', slot: '12:45', autoAccepted: true }) },
    { key: 'refund', label: 'Customer · partial refund (4-digit)', send: c => m.sendRefundEmail({ to: 'x@example.invalid', customerName: 'Alexandra', orderId: F.ORDER_ID, truckName: 'Pizza Kitchen', amountMinor: 123456, chargedMinor: Math.round(F.order(c).total * 100), money: F.MONEY[c] }) },
    { key: 'cancel', label: 'Customer · cancelled with refund (4-digit)', send: c => m.sendCancellationEmail({ to: 'x@example.invalid', customerName: 'Alexandra', orderId: F.ORDER_ID, truckName: 'Pizza Kitchen', reason: 'We have run out of dough.', paymentStatus: 'paid', paymentState: 'captured', refundedMinor: Math.round(F.order(c).total * 100), money: F.MONEY[c] }) },
    { key: 'event-cancel', label: 'Customer · event cancelled (long date)', send: c => m.sendEventCancellationEmail({ to: 'x@example.invalid', customerName: 'Alexandra', orderId: F.ORDER_ID, truckName: 'Pizza Kitchen', venueName: F.EVENT.venue_name, village: F.EVENT.town, eventDate: F.EVENT_DATE, note: null, paymentStatus: 'paid', time: F.TIME[c] }) },
    { key: 'new-events', label: 'Operator · new events found (inbound schedule)', build: c => inboundSchedule(c) },
  ]

  // ── TRANSCRIBED from app/api/inbound-schedule/route.ts (the route builds it inline; no exported builder) ──
  function inboundSchedule(c) {
    const ts = F.TIME[c]
    const fmtDate = iso => m.formatYmdShortMonth(iso, ts, { weekday: 'short', day: 'numeric', month: 'short' })
    const fmtTimeRange = (st, et) => { const a = st ? m.formatTime(String(st), ts) : ''; const b = et ? m.formatTime(String(et), ts) : ''; return a && b ? `${a}–${b}` : a || '' }
    const venueLine = e => `${e.venue_name || 'Unknown venue'}${e.town ? `, ${e.town}` : ''}`
    const noLink = 'color:#1e293b !important;text-decoration:none !important;pointer-events:none;cursor:default'
    const eventBlockHtml = e => {
      const t = fmtTimeRange(e.start_time, e.end_time)
      const timePart = t ? ` <span style="color:#cbd5e1">|</span> <a style="${noLink}">⏱️ ${t}</a>` : ''
      return `<div style="padding:14px 0">
            <div style="font-weight:bold;color:#1e293b;font-size:16px;line-height:1.35">📍 ${venueLine(e)}</div>
            <div style="font-size:14px;line-height:1.5;margin-top:5px">
              <a style="${noLink}">📅 ${fmtDate(e.event_date)}</a>${timePart}
            </div>
          </div>`
    }
    const evs = [
      { event_date: '2026-09-30', venue_name: 'St Mary\'s Primary School Summer Fair', town: 'Little Harnessville', start_time: '11:30:00', end_time: '22:45:00' },
      { event_date: '2026-10-02', venue_name: 'Old Brewery Yard Night Market', town: 'Harnessville', start_time: '20:00:00', end_time: '00:30:00' },
      { event_date: '2026-10-07', venue_name: 'Riverside Park', town: 'Harnessville', start_time: '17:00:00', end_time: '21:00:00' },
    ]
    const n = evs.length
    const html = `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#334155">
            <p>Hi there,</p>
            <p>We found <strong>${n} new event${n !== 1 ? 's' : ''}</strong> on your schedule that need your approval before they appear to customers.</p>
            <p style="font-weight:600;margin:20px 0 0">Events found:</p>
            <div style="border-top:1px solid #eef2f6;border-bottom:1px solid #eef2f6">${evs.map(eventBlockHtml).join('<hr style="border:none;border-top:1px solid #eef2f6;margin:0" />')}</div>
            <p style="margin-top:16px">Once you approve them in your Schedule tab they'll go live on the map and your ordering page will be ready to take pre-orders.</p>
          </div>`
    return { subject: 'New events found for Pizza Kitchen — please review', html, text: '' }
  }

  const mails = {}
  for (const e of EMAILS) for (const c of ['GB', 'US']) {
    kit.setNow(F.NOW[c]); kit.setDeviceTz(F.TIME[c].timeZone); kit.setDeviceLocale(F.TIME[c].locale)
    let mail
    if (e.build) mail = e.build(c)
    else { sent.length = 0; await e.send(c); const s = sent[0]; mail = { subject: s.subject, html: s.htmlContent, text: s.textContent } }
    ;(mails[e.key] ??= {})[c] = mail
  }
  globalThis.fetch = realFetch

  // ── paint + measure ──
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  const results = []
  for (const W of [375, 600]) {
    const page = await browser.newPage({ viewport: { width: W, height: 800 }, deviceScaleFactor: 1 })
    await page.route('**/*', r => r.request().url().startsWith('data:') ? r.continue() : r.abort())
    for (const e of EMAILS) {
      const per = {}
      for (const c of ['GB', 'US']) {
        const html = mails[e.key][c].html
        await page.setContent(/<html/i.test(html) ? html : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0">${html}</body></html>`)
        if (!/<meta name="viewport"/.test(html)) await page.evaluate(() => { const mm = document.createElement('meta'); mm.name = 'viewport'; mm.content = 'width=device-width'; document.head.appendChild(mm) })
        per[c] = await page.evaluate(() => {
          const out = []
          const lines = el => {
            // a line = a cluster of glyph boxes that overlap vertically (a smaller inline span on the same line
            // has a different top, so tops alone over-count)
            const rects = []; const range = document.createRange()
            const walk = n => { for (const k of n.childNodes) { if (k.nodeType === 3 && k.textContent.trim()) { range.selectNodeContents(k); for (const r of range.getClientRects()) if (r.width > 0.5) rects.push({ t: r.top, b: r.bottom }) } else if (k.nodeType === 1 && getComputedStyle(k).display.startsWith('inline')) walk(k) } }
            walk(el); rects.sort((a, b) => a.t - b.t)
            let n = 0, bottom = -1e9
            for (const r of rects) { const mid = (r.t + r.b) / 2; if (mid > bottom) { n++; bottom = r.b } else bottom = Math.max(bottom, r.b) }
            return n
          }
          for (const el of document.body.querySelectorAll('td,p,h1,h2,strong,span,a,div')) {
            const disp = getComputedStyle(el).display
            if (disp.startsWith('inline') && el.closest('td,p,h1,h2,div') !== el.parentElement && false) continue
            const own = [...el.childNodes].some(k => k.nodeType === 3 && k.textContent.trim())
            if (!own) continue
            const r = el.getBoundingClientRect()
            const pth = []; for (let x = el; x && x !== document.body; x = x.parentElement) pth.unshift(x.tagName.toLowerCase() + ':' + [...x.parentElement.children].indexOf(x))
            out.push({ path: pth.join('/'), tag: el.tagName.toLowerCase(), disp, text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 140), lines: lines(el),
              w: Math.round(r.width), h: Math.round(r.height), sw: el.scrollWidth, cw: el.clientWidth })
          }
          const d = document.documentElement
          // the elements the contact sheet boxes: times, dates and the US charge rows
          const marks = []
          for (const el of document.body.querySelectorAll('strong,td,a,span,p')) {
            const t = el.innerText.replace(/\s+/g, ' ').trim()
            if (t.length > 90 || !/\d:\d\d|September|Sep 30|30 Sep|^(Subtotal|Sales tax|Online service fee|Card fee|Tip)\b/.test(t)) continue
            if (el.tagName === 'P' && el.querySelector('strong,span,a')) continue
            const r = (el.tagName === 'TD' ? el.parentElement : el).getBoundingClientRect()
            marks.push({ text: t, x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) })
          }
          return { els: out, marks, docH: d.scrollHeight, docSW: d.scrollWidth, vw: window.innerWidth }
        })
        await page.setViewportSize({ width: W, height: 800 })
        const f = path.join(OUT, `email-${e.key}-${W}-${c.toLowerCase()}.png`)
        await page.screenshot({ path: f, fullPage: true })
        per[c].png = path.relative(REPO, f)
      }
      results.push({ key: e.key, label: e.label, width: W, subject: { GB: mails[e.key].GB.subject, US: mails[e.key].US.subject }, GB: per.GB, US: per.US })
    }
    await page.close()
  }
  await browser.close()

  // ── compare: a US element that wraps more than its GB twin (matched by text with figures, times and AM/PM removed) ──
  const norm = s => s.replace(/\b(AM|PM)\b/g, '').replace(/[£$€]/g, '').replace(/[0-9]/g, '#').replace(/#[#,.:]*#?/g, '#').replace(/\s+/g, ' ').trim()
  const report = []
  for (const r of results) {
    const gbBy = new Map(); for (const e of r.GB.els) { const k = e.tag + '|' + norm(e.text); if (!gbBy.has(k)) gbBy.set(k, e) }
    const gbPath = new Map(r.GB.els.map(e => [e.path, e]))
    const diffs = []
    for (const u of r.US.els) {
      const g = gbBy.get(u.tag + '|' + norm(u.text)) || (/^(Subtotal|Sales tax|Online service fee|Service fee|Card fee|Tip)\b/.test(u.text) ? null : gbPath.get(u.path))
      const interesting = /\d:\d\d|AM|PM|\$|tax|Tip|fee|September|Sep|Wed/.test(u.text)
      if (!interesting) continue
      if (!g) { if (u.lines > 1) diffs.push({ kind: 'us-only-wraps', us: u }); else diffs.push({ kind: 'us-only', us: u }); continue }
      if (u.lines > g.lines) diffs.push({ kind: 'more-lines', path: u.path, gb: { text: g.text, lines: g.lines, h: g.h, w: g.w }, us: { text: u.text, lines: u.lines, h: u.h, w: u.w } })
    }
    report.push({ key: r.key, label: r.label, width: r.width, subject: r.subject,
      docH: { GB: r.GB.docH, US: r.US.docH }, hOverflow: { GB: r.GB.docSW - r.GB.vw, US: r.US.docSW - r.US.vw },
      pngs: { GB: r.GB.png, US: r.US.png }, diffs })
  }
  fs.writeFileSync(path.join(__dirname, 'emails-measure.json'), JSON.stringify({ report, raw: results }, null, 1))
  for (const r of report) {
    console.log(`\n${r.key} @${r.width}: docH GB ${r.docH.GB} US ${r.docH.US}  hOverflow GB ${r.hOverflow.GB} US ${r.hOverflow.US}`)
    console.log(`   subject GB(${r.subject.GB.length}) ${r.subject.GB}\n   subject US(${r.subject.US.length}) ${r.subject.US}`)
    for (const d of r.diffs) console.log('   ', d.kind, JSON.stringify(d.gb ? { gb: d.gb, us: d.us } : d.us))
  }
})().catch(e => { console.error(e); process.exit(1) })
