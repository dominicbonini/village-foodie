#!/usr/bin/env node
// US layout audit, group A (customer) — step 2: paint render.cjs's pages in WebKit with the app's compiled CSS
// (scripts/screenshots/common.cjs appCss / fontClasses / serve, 127.0.0.1 only), measure them at 360 / 390 / 768,
// and save GB/US crop pairs into docs/us-layout-audit/A-customer/.
//   node scripts/us-layout-audit/A-customer/shoot.cjs <workDir>   → <workDir>/measure.json
const fs = require('fs'); const path = require('path')
const { REPO } = require('./fixtures.cjs')
const { appCss, fontClasses, serve } = require(path.join(REPO, 'scripts/screenshots/common.cjs'))
const WORK = path.resolve(process.argv[2] || '')
if (!process.argv[2]) { console.error('usage: shoot.cjs <workDir>'); process.exit(2) }
const OUT = path.join(REPO, 'docs/us-layout-audit/A-customer')
fs.mkdirSync(OUT, { recursive: true })
const WIDTHS = [[360, 800], [390, 844], [768, 1024]]
const LIFT = '<style>.max-h-\\[90vh\\]{max-height:none!important;overflow:visible!important}</style>'

// ── in-page measuring helpers (serialised into the page) ──
const HELPERS = `
window.__P = (el) => {
  if (!el) return null
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  return { text: el.innerText.replace(/\\s+/g, ' ').trim().slice(0, 90), x: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height),
    lines: Math.round((r.height - pad) / lh), scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight, font: cs.fontSize }
}
// Every element whose content is wider than its box (scrollWidth > clientWidth), outside intended scrollers.
window.__overflows = (root) => {
  const out = []
  for (const el of (root || document.body).querySelectorAll('*')) {
    if (!el.clientWidth || el.closest('.overflow-x-auto') || el.tagName === 'svg' || el.closest('svg')) continue
    const d = el.scrollWidth - el.clientWidth
    if (d > 1) out.push({ cls: String(el.className).slice(0, 80), tag: el.tagName, d, text: el.innerText.replace(/\\s+/g, ' ').trim().slice(0, 60) })
  }
  return out
}
// Text-pixel width of a string in an element's font.
window.__textW = (el, s) => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(el); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; if (cs.letterSpacing && cs.letterSpacing !== 'normal') { return c.measureText(s).width + parseFloat(cs.letterSpacing) * s.length } return c.measureText(s).width }
window.__overlapX = (a, b) => { if (!a || !b) return null; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); const vy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top); return vy > 0 ? Math.round(ra.right - rb.left) : null }
`

// TruckListCard probes (compact on the order page, full on the chooser / profile / embed).
const CARD_PROBE = `(() => {
  const cols = [...document.querySelectorAll('div')].filter(d => /w-\\[112px\\]|sm:w-\\[140px\\]/.test(d.className))
  return cols.map(col => {
    const card = col.closest('.rounded-xl')
    const date = col.children[0], timeRow = col.children[1], range = timeRow && timeRow.children[0], live = timeRow && timeRow.children[1]
    const venueCol = col.nextElementSibling, h3 = card.querySelector('h3'), area = h3 && h3.nextElementSibling, cta = card.querySelector('a[href*="event_id"]'), corner = card.querySelector('.absolute.top-2')
    // the range's natural one-line width
    const natural = range ? Math.round(__textW(range, range.textContent)) : null
    return { card: __P(card), col: __P(col), date: __P(date), timeRow: __P(timeRow), range: __P(range), rangeNaturalW: natural, live: __P(live),
      liveOverVenue: __overlapX(live || range, venueCol), timeRowOverCol: timeRow ? Math.round(timeRow.getBoundingClientRect().right - col.getBoundingClientRect().right) : null,
      h3: __P(h3), h3Clamped: h3 ? h3.scrollHeight > h3.clientHeight + 1 : null, area: __P(area), areaTrunc: area ? area.scrollWidth > area.clientWidth : null, cta: __P(cta), corner: __P(corner),
      cornerOverCard: corner && h3 ? __overlapX(h3, corner) : null }
  })
})()`

const MEASURE = {
  'order-menu': `({ cards: ${CARD_PROBE}, footer: __P(document.querySelector('div.fixed.bottom-0')), overflows: __overflows(document.querySelector('main .text-center')) })`,
  'order-basket': `(() => {
    const footer = document.querySelector('div.fixed.bottom-0')
    const rows = [...footer.querySelectorAll('[data-charge-line]')].map(__P)
    const sumBtn = footer.querySelector('button')
    return { cards: ${CARD_PROBE}, footer: __P(footer), footerShareOfViewport: Math.round(footer.getBoundingClientRect().height / innerHeight * 100), chargeRows: rows,
      totalRow: __P([...footer.querySelectorAll('.font-black')].find(e => /Total/.test(e.innerText) && e.classList.contains('border-t'))), summaryRow: __P(sumBtn), taxNotice: __P(footer.querySelector('[data-tax-notice]')),
      overflows: __overflows(footer) }
  })()`,
  'order-midnight': `({ cards: ${CARD_PROBE}, overflows: __overflows(document.querySelector('main .text-center')) })`,
  'order-chooser': `({ cards: ${CARD_PROBE}, overflows: __overflows(document.querySelector('main')) })`,
  'order-sheet': `(() => {
    const sheet = document.querySelector('.max-h-\\\\[90vh\\\\]')
    const sel = sheet.querySelector('select')
    const asap = [...sheet.querySelectorAll('button')].find(b => b.innerText.includes('ASAP'))
    const opt = sel.options[sel.selectedIndex]
    const cs = getComputedStyle(sel)
    const textW = Math.round(__textW(sel, opt.text))
    const arrow = sel.parentElement.querySelector('.pointer-events-none')
    const sr = sel.getBoundingClientRect(), ar = arrow.getBoundingClientRect()
    const textRight = sr.left + sr.width / 2 + textW / 2
    const chosen = [...sheet.querySelectorAll('p')].find(p => p.className.includes('text-green-600') || (p.className.includes('text-slate-400') && p.className.includes('mt-2') && p.closest('.bg-white.rounded-2xl')))
    const tip = sheet.querySelector('[data-tip-block]')
    const tipBtns = tip ? [...tip.querySelectorAll('button')].map(b => ({ ...__P(b), inner: [...b.children].map(__P) })) : []
    const totals = sheet.querySelector('[data-checkout-totals]')
    const sumHdr = sheet.querySelector('button.w-full.flex')
    const place = [...sheet.querySelectorAll('button')].find(b => /Place order|Pay/.test(b.innerText) && b.className.includes('bg-orange-600'))
    return { sheet: { h: Math.round(sheet.getBoundingClientRect().height), naturalH: sheet.scrollHeight, viewportH: innerHeight, scrollToPlace: place ? Math.round(place.offsetTop + place.offsetHeight - sheet.clientHeight) : null },
      asap: __P(asap), asapLines: asap ? [...asap.children].map(__P) : [], select: { ...__P(sel), selected: opt.text, textW, avail: Math.round(sr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), textRightToArrowLeft: Math.round(ar.left - textRight) },
      chosen: __P(chosen), tipBtns, tipRowH: tip ? __P(tip.querySelector('.grid')) : null, totalsRows: totals ? [...totals.children].map(__P) : [], totalsBox: __P(totals), summaryHdr: __P(sumHdr), place: __P(place),
      payOpts: [...sheet.querySelectorAll('button.w-full.flex.items-start')].map(__P), overflows: __overflows(sheet) }
  })()`,
  'order-confirm': `(() => {
    const card = document.querySelector('.max-w-sm')
    const box = card.querySelector('.rounded-xl.p-3')
    const totals = card.querySelector('.bg-slate-50.rounded-xl')
    const rows = totals ? [...totals.querySelectorAll('[data-charge-line]')].map(__P) : []
    return { card: __P(card), orderNo: __P([...card.querySelectorAll('p')].find(p => p.innerText.startsWith('Order #'))), slotBox: __P(box), slotLines: box ? [...box.children].map(__P) : [], chargeRows: rows,
      totalRow: __P(totals && totals.lastElementChild), overflows: __overflows(card) }
  })()`,
  'manage': `(() => {
    const card = document.querySelector('.max-w-sm')
    const rows = [...card.querySelectorAll('.flex.justify-between')].map(r => ({ row: __P(r), label: __P(r.children[0]), value: __P(r.children[1]) }))
    return { card: __P(card), h1: __P(card.querySelector('h1')), rows, overflows: __overflows(card) }
  })()`,
  'sched': `({ cards: ${CARD_PROBE}, overflows: __overflows(document.querySelector('main')) })`,
  'domain': `({ cards: ${CARD_PROBE}, overflows: __overflows(document.body) })`,
}
MEASURE['order-sheet-asap'] = MEASURE['order-sheet']
MEASURE['order-typical'] = MEASURE['order-midnight']
MEASURE['order-confirm-pending'] = MEASURE['order-confirm']
MEASURE['manage-longvenue'] = MEASURE['manage']
MEASURE['sched-proj'] = MEASURE['sched']
MEASURE['domain-proj'] = MEASURE['domain']

// Crops: [file stem, element finder (in page), deviceScaleFactor, tall viewport?]
const CROPS = {
  'order-menu': [['order-header', `document.querySelector('main .text-center.mb-5')`, 2, false]],
  'order-basket': [['order-basket', `document.querySelector('div.fixed.bottom-0')`, 1, false]],
  'order-typical': [['order-header-typical', `document.querySelector('main .text-center.mb-5')`, 2, false]],
  'order-midnight': [['order-header-midnight', `document.querySelector('main .text-center.mb-5')`, 2, false]],
  'order-chooser': [['order-chooser', `document.querySelector('main .text-center.mb-5')`, 1, false]],
  'order-sheet': [['order-slots', `[...document.querySelectorAll('.max-h-\\\\[90vh\\\\] h2')].find(h => /time/i.test(h.innerText)).parentElement`, 2, true],
    ['order-totals', `(() => { const s = document.querySelector('.max-h-\\\\[90vh\\\\]'); const t = s.querySelector('[data-tip-block]') || s.querySelector('button.w-full.flex.items-start') || s.querySelector('[data-checkout-totals]'); return { from: (t.closest('.mt-4') || t), to: [...s.querySelectorAll('p')].find(p => /text-center/.test(p.className) && p.className.includes('mt-2')) } })()`, 1, true],
    ['order-sheet-summary', `document.querySelector('.max-h-\\\\[90vh\\\\] .mb-4')`, 1, true]],
  'order-sheet-asap': [['order-slots-asap', `[...document.querySelectorAll('.max-h-\\\\[90vh\\\\] h2')].find(h => /time/i.test(h.innerText)).parentElement`, 2, true]],
  'order-confirm': [['order-confirm', `document.querySelector('.max-w-sm')`, 1, true]],
  'order-confirm-pending': [['order-confirm-pending', `document.querySelector('.max-w-sm .rounded-xl.p-3').parentElement`, 1, true]],
  'manage': [['manage', `document.querySelector('.max-w-sm')`, 1, true]],
  'manage-longvenue': [['manage-longvenue', `document.querySelector('.max-w-sm .px-6.py-4.border-b')`, 2, true]],
  'sched': [['schedule', `document.querySelector('main .animate-in')`, 1, false]],
  'sched-proj': [['schedule-proj', `document.querySelector('main .animate-in')`, 1, false]],
  'domain': [['embed', `document.querySelector('.flex.flex-col')`, 1, false]],
  'domain-proj': [['embed-proj', `document.querySelector('.flex.flex-col')`, 1, false]],
}

// Elements to box on the contact sheets, per crop.
const RANGES = (re) => `[...document.querySelectorAll('div')].filter(d => ${re}.test(d.className)).map(d => d.children[1])`
const HIGHLIGHT = {
  'order-header': RANGES('/w-\\[112px\\]/'), 'order-header-typical': RANGES('/w-\\[112px\\]/'), 'order-header-midnight': RANGES('/w-\\[112px\\]/'),
  'order-chooser': `${RANGES('/sm:w-\\[140px\\]/')}.slice(0, 1)`,
  'schedule-proj': `${RANGES('/sm:w-\\[140px\\]/')}.slice(0, 1)`, 'embed-proj': `${RANGES('/sm:w-\\[140px\\]/')}.slice(0, 1)`,
  'schedule': RANGES('/sm:w-\\[140px\\]/'), 'embed': RANGES('/sm:w-\\[140px\\]/'),
  'order-basket': `[document.querySelector('div.fixed.bottom-0')]`,
  'manage-longvenue': `[document.querySelector('.max-w-sm .px-6.py-4.border-b .flex.justify-between')]`,
  'order-totals': `[document.querySelector('[data-tip-block] .grid'), document.querySelector('[data-checkout-totals]')]`,
}

;(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(WORK, 'manifest.json'), 'utf8'))
  const css = appCss(); const fc = fontClasses(css)
  let current = ''
  const srv = await serve(() => current)
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  const results = {}, cropInfo = {}
  try {
    for (const { name, code, lang } of manifest) {
      const body = fs.readFileSync(path.join(WORK, `${name}-${code.toLowerCase()}.html`), 'utf8').replace(/<img alt="Village Foodie"[^>]*>/g, '')
      for (const [w, h] of WIDTHS) {
        for (const dsf of [...new Set((CROPS[name] || []).map(c => c[2]))].concat(CROPS[name] ? [] : [1])) {
          const crops = (CROPS[name] || []).filter(c => c[2] === dsf)
          const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf })
          current = `<!doctype html><html lang="${lang}" data-brand="hatchgrab"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="${fc}">${body}</body></html>`
          await page.goto(srv.url, { waitUntil: 'load' })
          await page.evaluate(() => document.fonts.ready)
          await page.addScriptTag({ content: HELPERS })
          if (!results[`${name}|${code}|${w}`]) {
            const m = await page.evaluate(MEASURE[name])
            m.docOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
            results[`${name}|${code}|${w}`] = m
          }
          for (const [stem, finder, , tall] of crops) {
            if (tall) { await page.setViewportSize({ width: w, height: 3200 }); await page.addStyleTag({ content: LIFT.replace(/<\/?style>/g, '') }); await page.waitForTimeout(50) }
            const box = await page.evaluate(`(() => { const f = ${finder}; const pad = 6; if (f && f.from) { const a = f.from.getBoundingClientRect(), b = f.to.getBoundingClientRect(); return { x: 0, y: Math.max(0, a.top + scrollY - pad), width: innerWidth, height: b.bottom - a.top + 2 * pad } }
              const r = f.getBoundingClientRect(); return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top + scrollY - pad), width: Math.min(innerWidth, r.width + 2 * pad), height: r.height + 2 * pad } })()`)
            box.width = Math.min(box.width, w - box.x)
            const file = path.join(OUT, `${stem}-${w}-${code.toLowerCase()}.png`)
            await page.screenshot({ path: file, clip: box, fullPage: true })
            const hl = HIGHLIGHT[stem] ? await page.evaluate(`(${HIGHLIGHT[stem]}).filter(Boolean).map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } })`) : []
            cropInfo[path.basename(file)] = { clip: box, dsf, boxes: hl.map(b => ({ x: b.x - box.x, y: b.y - box.y, w: b.w, h: b.h })) }
            if (tall) { await page.setViewportSize({ width: w, height: h }) }
          }
          await page.close()
        }
      }
      process.stdout.write(`${name}-${code} `)
    }
  } finally { await browser.close(); srv.close() }
  fs.writeFileSync(path.join(WORK, 'measure.json'), JSON.stringify(results, null, 1))
  fs.writeFileSync(path.join(WORK, 'crops.json'), JSON.stringify(cropInfo, null, 1))
  console.log('\nmeasured', Object.keys(results).length, '→', path.join(WORK, 'measure.json'))
})().catch(e => { console.error(e); process.exit(1) })
