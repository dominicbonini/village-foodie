#!/usr/bin/env node
// scripts/pending-card-render.cjs — the "Needs your approval" card on Manage › Schedule, MEASURED in a real
// browser engine (WebKit — the iPhone's) at 320 / 375 / 390 / 430 / 820 / 1440 px.
//
//   npx next build && node scripts/pending-card-render.cjs                  measure (the harness)
//   node scripts/pending-card-render.cjs --shots=before|after                also write PNGs to docs/screenshots/pending-card/
//
// ── 🔴 WHY THIS EXISTS (16 October 2026, docs/private-event-approval-fix-report.md) ─────────────────────────────
// On Dominic's phone the Event type chooser was drawn ON TOP of the pending card's own details for Pizzeria
// Gusto's scraped private events: it was a `w-full` child of the card's horizontal flex row, so on a narrow
// screen the details column (`flex-1 min-w-0`) shrank to nothing and its text spilled under the chooser. A
// class-string grep cannot see that — it is a fact about rendered boxes. So this renders the REAL ScheduleTab
// (the same bundle language-phase-1d uses, fixtures only — Pizza Kitchen, never a live truck), with the app's
// compiled CSS, and measures:
//   1. the chooser's box does not intersect the details' box, and comes BELOW them (top ≥ details bottom);
//   2. nothing in the card is wider than the card, and the page does not scroll sideways;
//   3. the order: details → chooser → warnings → Approve / Edit / Reject (one row, last, at every width);
//   4. a PRIVATE pending event shows no "We guessed this location" box and no "No location yet" box; a STANDARD
//      pending event with a guessed venue shows the guessed box exactly as before;
//   5. Approve is enabled for a private event once it has times, disabled without — and then the card SAYS why (a
//      standard event with no times shows the new sentence; a private one shows its own times prompt).
// ⚠️ It runs on any version of the card (it is how the BEFORE pictures were taken); the checks are what the
// fixed card must satisfy, so on the old card they fail — which is the point.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
process.env.TZ = 'Europe/London'
const argv = process.argv.slice(2)
const SHOTS = (argv.find(a => a.startsWith('--shots=')) || '').slice(8) || null
const WIDTHS = [320, 375, 390, 430, 820, 1440]
const SHOT_WIDTHS = [375, 390, 430, 820, 1440]

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ''}`) } }

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.css')) files.push(f) } }
  walk(root)
  return files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
}

const M_FILE = 'app/manage/[token]/page.tsx'
const ET = 'components/manage/EventTypes.tsx'
const ev = (o) => ({ truck_id: 'test-truck', venue_address: null, address: null, town: null, postcode: null, start_time: null, end_time: null,
  status: 'unconfirmed', auto_open: true, auto_close: true, opened_at: null, closed_at: null, confirmed_at: null, customer_note: null, notes: null,
  source: 'scraper', van_id: null, is_private: false, private_name: null, event_deals: [], venue_match_confidence: null, latitude: null, longitude: null, ...o })
/* The three live shapes: Gusto's scraped private event (no times, a "guessed" junk venue at the centre of the UK),
 * the same with times added, and a STANDARD scraped event whose venue really was guessed among namesakes. */
const EVENTS = [
  ev({ id: 'priv-no-times', event_date: '2026-10-16', venue_name: 'Private Event', scraped_signature: 'Private Event', is_private: true,
    venue_match_confidence: 'low', latitude: 55.378051, longitude: -3.435973 }),
  ev({ id: 'priv-times', event_date: '2026-10-17', venue_name: 'Private Event', scraped_signature: 'Private Event', is_private: true,
    start_time: '18:00', end_time: '22:00', venue_match_confidence: 'low', latitude: 55.378051, longitude: -3.435973 }),
  ev({ id: 'std-guessed', event_date: '2026-10-18', venue_name: 'The Bull', town: 'Bottisham', start_time: '17:00', end_time: '21:00',
    venue_match_confidence: 'low', latitude: 52.21, longitude: 0.26 }),
  ev({ id: 'std-no-times', event_date: '2026-10-19', venue_name: 'Market Square', town: 'Harnessville', venue_match_confidence: 'high', latitude: 52.2, longitude: 0.6 }),
]
const PRIVATE_TYPE = { id: 'type-private', name: 'Private', kind: 'private', upcoming: 0 }

async function main() {
  const kit = require('./_render-kit.cjs')({ cacheTag: 'pending-card' })
  const FIX = require('./_lp1d-fixtures.cjs')
  kit.setNow(FIX.NOW); kit.setDeviceTz('Europe/London')
  const ctx = FIX.context(kit, REPO)
  const { h, html, states, inManage, PROVIDERS, GB } = ctx
  const M = await kit.bundle('pending-card', [
    `export { ScheduleTab } from '@/${M_FILE}'`, PROVIDERS,
  ].join('\n'), {
    patches: [
      { file: M_FILE, append: 'export { ScheduleTab }' },
      { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
      { file: M_FILE, states: states(M_FILE, ['events', 'loadingEvents', 'vans', 'placeTypeChoices']) },
      { file: ET, states: states(ET, ['types', 'ready', 'usual']) },
    ],
  })
  const noop = () => {}
  const props = { isActive: true, section: 'events', onSectionChange: noop, onOpenSocial: noop, truck: { ...GB.truck }, token: 'harness',
    bundles: [], categories: [], notices: null, api: async () => ({}), showToast: noop, onTruckUpdate: noop, onVerifySuccess: noop,
    onSwitchTab: noop, pendingVerifyEvents: null, onClearPendingVerify: noop, onPendingCount: noop, onEventsSaved: noop }
  const body = html({ events: EVENTS, loadingEvents: false, vans: [{ id: 'v1', name: 'Van 1' }], placeTypeChoices: [PRIVATE_TYPE],
    types: [PRIVATE_TYPE], ready: true, usual: null }, inManage(M, GB, h(M.ScheduleTab, props)))
  if (body.startsWith('ERROR')) throw new Error(body)
  const page = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${appCss()}</style><style>body{margin:0;background:#f8fafc}</style></head><body><main id="root" class="px-4 py-3">${body}</main></body></html>`

  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  try {
    const pg = await browser.newPage()
    await pg.setContent(page, { waitUntil: 'load' })
    const outDir = path.join(REPO, 'docs/screenshots/pending-card')
    if (SHOTS) fs.mkdirSync(outDir, { recursive: true })
    for (const w of WIDTHS) {
      await pg.setViewportSize({ width: w, height: 1200 })
      const m = await pg.evaluate(() => {
        const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } }
        const cards = [...document.querySelectorAll('[data-event-type-select]')].map(sel => {
          const card = sel.closest('.px-4.py-3')
          const details = card && card.querySelector('.flex.items-start.gap-4 > .flex-1.min-w-0')
          const text = card ? card.innerText : ''
          const venue = details ? details.querySelector('p') : null
          const approve = card ? [...card.querySelectorAll('button')].filter(b => /^Approve$/.test(b.textContent.trim()) && b.offsetParent !== null) : []
          const editBtns = card ? [...card.querySelectorAll('button')].filter(b => /^Edit$/.test(b.textContent.trim()) && b.offsetParent !== null) : []
          const guessed = card ? [...card.querySelectorAll('p')].find(p => /We guessed this location/.test(p.textContent)) : null
          const noLoc = card ? [...card.querySelectorAll('p')].find(p => /No location yet/.test(p.textContent)) : null
          const cardBox = card ? box(card) : null
          let widest = 0
          if (card) for (const el of card.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width && r.right > cardBox.r + 0.5) widest = Math.max(widest, r.right - cardBox.r) }
          return {
            id: venue ? venue.textContent : '?', text,
            details: details ? box(details) : null, chooser: box(sel), card: cardBox,
            detailsScroll: details ? details.scrollWidth - details.clientWidth : null,
            overflowRight: widest,
            approve: approve.map(b => ({ disabled: b.disabled, box: box(b) })),
            edit: editBtns.map(b => box(b)),
            guessed: !!guessed, guessedBox: guessed ? box(guessed) : null, noLocation: !!noLoc,
          }
        })
        const wide = [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > window.innerWidth + 0.5)
          .filter(el => ![...el.children].some(c => c.getBoundingClientRect().right > window.innerWidth + 0.5))
          .slice(0, 3).map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 4).join('.')} "${(el.textContent || '').trim().slice(0, 30)}" right=${Math.round(el.getBoundingClientRect().right)}`)
        return { cards, pageScrollX: document.documentElement.scrollWidth - window.innerWidth, wide }
      })
      const label = i => ['private, no times', 'private, with times', 'standard, guessed venue', 'standard, no times'][i] || `card ${i}`
      t(`${w}px · the page does not scroll sideways`, m.pageScrollX <= 0, `scrollWidth exceeds the viewport by ${m.pageScrollX}px — ${m.wide.join(' | ')}`)
      t(`${w}px · four pending cards render`, m.cards.length === 4, `${m.cards.length} cards`)
      m.cards.forEach((c, i) => {
        const L = `${w}px · ${label(i)}`
        const d = c.details, ch = c.chooser
        const intersects = d && !(ch.r <= d.l || ch.l >= d.r || ch.b <= d.t || ch.t >= d.b)
        t(`${L} · the chooser does not intersect the details`, d && !intersects, d ? `details ${JSON.stringify(d)} · chooser ${JSON.stringify(ch)}` : 'no details box')
        t(`${L} · the chooser comes below the details`, d && ch.t >= d.b - 0.5, d ? `chooser top ${ch.t} < details bottom ${d.b}` : '')
        t(`${L} · the details are not squeezed (≥ 120px wide)`, d && d.w >= 120, d ? `details width ${d.w}` : '')
        t(`${L} · the details' text is not clipped`, c.detailsScroll !== null && c.detailsScroll <= 0, `scrollWidth − clientWidth = ${c.detailsScroll}`)
        t(`${L} · nothing sticks out of the card`, c.overflowRight <= 0.5, `${c.overflowRight}px past the card's right edge`)
        t(`${L} · the chooser spans the card's content width`, ch.w >= c.card.w - 2 * 16 - 1, `chooser ${ch.w} vs card ${c.card.w}`)
        t(`${L} · exactly one visible Approve`, c.approve.length === 1, `${c.approve.length}`)
        if (c.approve.length === 1) t(`${L} · Approve comes after the chooser`, c.approve[0].box.t >= ch.b - 0.5, `approve top ${c.approve[0].box.t} < chooser bottom ${ch.b}`)
        if (c.guessedBox && c.approve.length === 1) t(`${L} · the warning comes before Approve`, c.guessedBox.t <= c.approve[0].box.t)
      })
      const [pNo, pTimes, std, sNo] = m.cards
      if (pNo) {
        t(`${w}px · private, no times · no "We guessed this location" box`, !pNo.guessed)
        t(`${w}px · private, no times · no "No location yet" box`, !pNo.noLocation)
        t(`${w}px · private, no times · Approve disabled (no times)`, pNo.approve[0]?.disabled === true)
        t(`${w}px · private, no times · the card says why Approve is off`, /start and end time/i.test(pNo.text), 'no plain-words reason on the card')
      }
      if (pTimes) {
        t(`${w}px · private, with times · no location box`, !pTimes.guessed && !pTimes.noLocation)
        t(`${w}px · private, with times · Approve enabled — never blocked by location`, pTimes.approve[0]?.disabled === false)
      }
      if (std) {
        t(`${w}px · standard, guessed venue · the guessed box is shown`, std.guessed)
        t(`${w}px · standard, guessed venue · Approve enabled`, std.approve[0]?.disabled === false)
      }
      if (sNo) {
        t(`${w}px · standard, no times · Approve disabled`, sNo.approve[0]?.disabled === true)
        t(`${w}px · standard, no times · the card says why, in words`, /Approve is off until this event has a start and end time/.test(sNo.text), 'no plain-words reason on the card')
        t(`${w}px · standard, no times · no location box (it has a confident venue)`, !sNo.guessed && !sNo.noLocation)
      }
      if (SHOTS && SHOT_WIDTHS.includes(w)) {
        const h2 = await pg.evaluate(() => document.documentElement.scrollHeight)
        await pg.setViewportSize({ width: w, height: Math.min(Math.max(h2, 600), 4000) })
        await pg.screenshot({ path: path.join(outDir, `${SHOTS}-${w}.png`), fullPage: true })
      }
    }
  } finally { await browser.close() }
  console.log(`\n${fail ? '✗' : '✓'} pending-card-render: ${pass} passed, ${fail} failed${SHOTS ? ` · screenshots: docs/screenshots/pending-card/${SHOTS}-*.png` : ''}`)
  if (fail && !SHOTS) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
