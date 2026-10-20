#!/usr/bin/env node
// scripts/pending-card-buttons.cjs — Manage › Schedule's "Needs your approval" card: from 640px up, Approve / Edit /
// Reject sit ON THE EVENT TYPE CHIPS' ROW, right-aligned (docs/pending-card-buttons-report.md, 19 October 2026).
// MEASURED in WebKit (the iPhone's engine), on the REAL ScheduleTab with the app's compiled CSS — fixtures only (Pizza
// Kitchen, GB and US; never a live truck).
//
//   npx next build && node scripts/pending-card-buttons.cjs                   measure AFTER against the BEFORE fixture
//   node scripts/pending-card-buttons.cjs --capture-before                     write scripts/fixtures/pending-card-buttons-before.json
//   node scripts/pending-card-buttons.cjs --shots=before|after                 also write PNGs to docs/us-polish/pending-card-buttons/
//
// At 390 / 640 / 800 / 1180 / 1280px, GB and US, two pages: (A) a normal pending card, a private one, one with a
// guessed-location warning, one with Approve off (no times), a "Needs confirmation" card and a confirmed card, with
// Standard / Private / two types; (B) a normal pending card with MANY event types (the wrap case). It checks:
//   1. 390px: every page's screenshot is byte-identical to BEFORE's (sha256 in the fixture) — phones are unchanged;
//   2. ≥640px, a pending card: exactly one visible Approve / Edit / Reject group, INSIDE the chooser, right-aligned with
//      it; side by side with the chips — vertically centred on them (±1px) — or, when they cannot fit, wholly BELOW the
//      chips, still right-aligned; the helper line under the chips; the "why Approve is off" line directly under the
//      buttons, right-aligned; every warning below the chooser; no bottom action row;
//   3. every width: nothing in a card overlaps anything else, nothing sticks out of the card, no sideways scroll;
//   4. the "Needs confirmation" and confirmed cards are the height they were BEFORE at every width.
// Card heights BEFORE → AFTER are printed (and written to the report by hand).
const fs = require('fs'); const path = require('path'); const crypto = require('crypto')
const REPO = path.resolve(__dirname, '..')
process.env.TZ = 'Europe/London'
const argv = process.argv.slice(2)
const SHOTS = (argv.find(a => a.startsWith('--shots=')) || '').slice(8) || null
const CAPTURE = argv.includes('--capture-before')
const FIXTURE = path.join(REPO, 'scripts/fixtures/pending-card-buttons-before.json')
const WIDTHS = [390, 640, 800, 1180, 1280]

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 500)}` : ''}`) } return !!ok }

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.css')) files.push(f) } }
  walk(root)
  return files.sort().map(f => fs.readFileSync(f, 'utf8')).join('\n')
}

const M_FILE = 'app/manage/[token]/page.tsx'
const ET = 'components/manage/EventTypes.tsx'
const ev = (o) => ({ truck_id: 'test-truck', venue_address: null, address: null, town: null, postcode: null, start_time: null, end_time: null,
  status: 'unconfirmed', auto_open: true, auto_close: true, opened_at: null, closed_at: null, confirmed_at: null, customer_note: null, notes: null,
  source: 'scraper', van_id: null, is_private: false, private_name: null, event_deals: [], venue_match_confidence: null, latitude: null, longitude: null, ...o })
const CARDS = {
  normal: ev({ id: 'normal', event_date: '2026-10-16', venue_name: 'Market Square', town: 'Harnessville', postcode: 'CB8 8XX', start_time: '17:00', end_time: '21:00',
    scraped_signature: 'Market Square', venue_match_confidence: 'high', latitude: 52.2, longitude: 0.6 }),
  private: ev({ id: 'private', event_date: '2026-10-17', venue_name: 'Private Event', scraped_signature: 'Private Event', is_private: true,
    start_time: '18:00', end_time: '22:00', venue_match_confidence: 'low', latitude: 55.378051, longitude: -3.435973 }),
  guessed: ev({ id: 'guessed', event_date: '2026-10-18', venue_name: 'The Bull', town: 'Bottisham', start_time: '17:00', end_time: '21:00',
    scraped_signature: 'The Bull', venue_match_confidence: 'low', latitude: 52.21, longitude: 0.26 }),
  disabled: ev({ id: 'disabled', event_date: '2026-10-19', venue_name: 'Village Green', town: 'Harnessville', scraped_signature: 'Village Green',
    venue_match_confidence: 'high', latitude: 52.2, longitude: 0.6 }),
  confirmation: ev({ id: 'confirmation', event_date: '2026-10-20', venue_name: 'The Plough', town: 'Great Shelford', start_time: '12:00', end_time: '15:00',
    source: 'manual', venue_match_confidence: 'high', latitude: 52.15, longitude: 0.14 }),
  confirmed: ev({ id: 'confirmed', event_date: '2026-10-21', venue_name: 'Station Road', town: 'Harnessville', start_time: '11:30', end_time: '14:00',
    status: 'confirmed', source: 'manual', venue_match_confidence: 'high', latitude: 52.2, longitude: 0.6 }),
}
const VENUE = { normal: 'Market Square', private: 'Private Event', guessed: 'The Bull', disabled: 'Village Green', confirmation: 'The Plough', confirmed: 'Station Road' }
const PENDING = ['normal', 'private', 'guessed', 'disabled']
const type = (id, name, kind = 'custom') => ({ id, name, kind, upcoming: 0 })
const PRIVATE_TYPE = type('type-private', 'Private', 'private')
const PAGES = {
  A: { events: ['normal', 'private', 'guessed', 'disabled', 'confirmation', 'confirmed'], types: [PRIVATE_TYPE, type('t-fest', 'Festival'), type('t-wed', 'Wedding')] },
  B: { events: ['normal'], types: [PRIVATE_TYPE, ...['Festival', 'Wedding', 'Corporate lunch', 'School fête', 'Farmers market', 'Beer festival', 'Christmas market', 'Sports club'].map((n, i) => type(`t-${i}`, n))] },
}

async function main() {
  const kit = require('./_render-kit.cjs')({ cacheTag: 'pending-card-buttons' })
  const FIX = require('./_lp1d-fixtures.cjs')
  kit.setNow(FIX.NOW); kit.setDeviceTz('Europe/London')
  const ctx = FIX.context(kit, REPO)
  const { h, html, states, inManage, PROVIDERS } = ctx
  const M = await kit.bundle('pending-card-buttons', [`export { ScheduleTab } from '@/${M_FILE}'`, PROVIDERS].join('\n'), {
    patches: [
      { file: M_FILE, append: 'export { ScheduleTab }' },
      { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
      { file: M_FILE, states: states(M_FILE, ['events', 'loadingEvents', 'vans', 'placeTypeChoices']) },
      { file: ET, states: states(ET, ['types', 'ready', 'usual']) },
    ],
  })
  const css = appCss()
  const noop = () => {}
  const pageHtml = (C, P) => {
    // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the shared fixture truck holds plan 'max', a key the
    // Stage A catalogue no longer has, so it resolves to the expiry fallback (payg) — and since Stage A2 WITH payg's
    // switches (schedule_graphics off), which drops the event rows' "Make post" shortcut and changed the card heights.
    // The cards are measured on the plan that stands in for Max (Stage A: max → unlimited), every feature on, as BEFORE.
    const props = { isActive: true, section: 'events', onSectionChange: noop, onOpenSocial: noop, truck: { ...C.truck, plan: 'unlimited' }, token: 'harness',
      bundles: [], categories: [], notices: null, api: async () => ({}), showToast: noop, onTruckUpdate: noop, onVerifySuccess: noop,
      onSwitchTab: noop, pendingVerifyEvents: null, onClearPendingVerify: noop, onPendingCount: noop, onEventsSaved: noop }
    const body = html({ events: P.events.map(k => CARDS[k]), loadingEvents: false, vans: [{ id: 'v1', name: 'Van 1' }], placeTypeChoices: P.types,
      types: P.types, ready: true, usual: null }, inManage(M, C, h(M.ScheduleTab, props)))
    if (body.startsWith('ERROR')) throw new Error(body)
    return `<!doctype html><html lang="${C.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>body{margin:0;background:#f8fafc}</style></head><body><main id="root" class="px-4 py-3">${body}</main></body></html>`
  }

  const before = CAPTURE ? null : JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const captured = { captured_on: '', widths: WIDTHS, heights: {}, sha390: {} }
  const heights = {}
  const outDir = path.join(REPO, 'docs/us-polish/pending-card-buttons')
  if (SHOTS) fs.mkdirSync(outDir, { recursive: true })

  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  try {
    const pg = await browser.newPage()
    for (const C of [ctx.GB, ctx.US]) for (const [pk, P] of Object.entries(PAGES)) {
      await pg.setContent(pageHtml(C, P), { waitUntil: 'load' })
      for (const w of WIDTHS) {
        const at = `${C.cc} page ${pk} ${w}px`
        await pg.setViewportSize({ width: w, height: 1200 })
        const m = await pg.evaluate(({ VENUE }) => {
          const vis = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
          const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } }
          const out = {}
          for (const inner of document.querySelectorAll('.px-4.py-3')) {
            const venueP = inner.querySelector('.flex.items-start.gap-4 > .flex-1.min-w-0 p')
            const key = venueP && Object.keys(VENUE).find(k => VENUE[k] === venueP.textContent.trim())
            if (!key) continue
            const btn = word => [...inner.querySelectorAll('button')].filter(b => vis(b) && b.textContent.trim() === word)
            const sel = inner.querySelector('[data-event-type-select]')
            const chips = sel ? [...sel.querySelectorAll('[data-event-type-pills] button')].filter(vis).map(box) : []
            const pills = sel && sel.querySelector('[data-event-type-pills]')
            // the summary line: the chooser's own `mt-1 text-xs text-slate-500` paragraph (never the caller's "why" line)
            const helper = sel ? [...sel.querySelectorAll('p.mt-1.text-xs.text-slate-500')].find(p => !p.hasAttribute('data-approve-reason')) : null
            const reason = [...inner.querySelectorAll('[data-approve-reason]')].filter(vis)
            const warn = [...inner.querySelectorAll('div,p')].filter(el => vis(el) && /bg-orange-50|bg-amber-50/.test(el.className) && /border-(orange|amber|slate)-300/.test(el.className))
            const noLoc = [...inner.querySelectorAll('div')].filter(el => vis(el) && el.className.includes('bg-slate-50 border border-slate-300'))
            const cardBox = box(inner)
            let stick = 0
            for (const el of inner.querySelectorAll('*')) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.width && r.right > cardBox.r + 0.5) stick = Math.max(stick, r.right - cardBox.r); if (r.width && r.left < cardBox.l - 0.5) stick = Math.max(stick, cardBox.l - r.left) }
            // overlap among the card's visible leaf blocks (text and controls), nested ones excluded
            const leaves = [...inner.querySelectorAll('p,button,input,label,span.rounded-full')].filter(el => vis(el) && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0)
            const overlaps = []
            for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
              const a = leaves[i], b = leaves[j]
              if (a.contains(b) || b.contains(a)) continue
              const A = a.getBoundingClientRect(), B = b.getBoundingClientRect()
              const ix = Math.min(A.right, B.right) - Math.max(A.left, B.left), iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top)
              if (ix > 0.5 && iy > 0.5) overlaps.push(`${a.tagName}"${a.textContent.trim().slice(0, 20)}" × ${b.tagName}"${b.textContent.trim().slice(0, 20)}"`)
            }
            const clipped = [...inner.querySelectorAll('*')].filter(el => vis(el) && el.scrollWidth > el.clientWidth + 0.5 && getComputedStyle(el).overflowX !== 'visible' && el.clientWidth > 0)
              .map(el => `${el.tagName}.${String(el.className).split(' ').slice(0, 3).join('.')}`)
            const bottomRow = inner.querySelector('[data-pending-actions]')
            out[key] = {
              h: Math.round(cardBox.h * 10) / 10, card: cardBox, chooser: sel && vis(sel) ? box(sel) : null, chips,
              helper: helper && vis(helper) && helper.textContent.trim() ? box(helper) : null,
              approve: btn('Approve').map(box), edit: btn('Edit').map(box), reject: btn('Reject').map(box),
              reason: reason.map(box), warnings: [...warn, ...noLoc].map(box),
              bottomRowVisible: !!(bottomRow && vis(bottomRow)), stick, overlaps, clipped,
            }
          }
          return { cards: out, scrollX: document.documentElement.scrollWidth - window.innerWidth }
        }, { VENUE })
        t(`${at} · no sideways scroll`, m.scrollX <= 0, `${m.scrollX}px`)
        for (const k of P.events) {
          const c = m.cards[k]
          if (!t(`${at} · ${k} card renders`, !!c)) continue
          heights[`${C.cc}|${pk}|${k}|${w}`] = c.h
          t(`${at} · ${k} · nothing overlaps`, c.overlaps.length === 0, c.overlaps.slice(0, 4).join(' · '))
          t(`${at} · ${k} · nothing sticks out of the card`, c.stick <= 0.5, `${c.stick}px`)
          t(`${at} · ${k} · nothing is clipped`, c.clipped.length === 0, c.clipped.slice(0, 4).join(' · '))
          if (CAPTURE) continue
          const was = before.heights[`${C.cc}|${pk}|${k}|${w}`]
          if (!PENDING.includes(k)) { t(`${at} · ${k} (not pending) · height unchanged (${was} → ${c.h})`, was === c.h); continue }
          if (w < 640) { t(`${at} · ${k} · phone height unchanged (${was} → ${c.h})`, was === c.h); continue }
          // ≥ 640px: the group on the chips' row
          const grp = [...c.approve, ...c.edit, ...c.reject]
          const one = c.approve.length === 1 && c.edit.length === 1 && c.reject.length === 1
          t(`${at} · ${k} · one visible Approve / Edit / Reject`, one, `${c.approve.length}/${c.edit.length}/${c.reject.length}`)
          t(`${at} · ${k} · no bottom action row`, !c.bottomRowVisible)
          if (!one || !c.chooser || !c.chips.length) { t(`${at} · ${k} · chooser and chips present`, false); continue }
          const G = { l: Math.min(...grp.map(b => b.l)), r: Math.max(...grp.map(b => b.r)), t: Math.min(...grp.map(b => b.t)), b: Math.max(...grp.map(b => b.b)) }
          const ch = c.chooser
          t(`${at} · ${k} · the buttons are inside the chooser`, G.l >= ch.l - 0.5 && G.r <= ch.r + 0.5 && G.t >= ch.t - 0.5 && G.b <= ch.b + 0.5, JSON.stringify({ G, ch }))
          t(`${at} · ${k} · right-aligned with the chooser`, Math.abs(G.r - ch.r) <= 1, `buttons right ${G.r} · chooser right ${ch.r}`)
          const chipsB = Math.max(...c.chips.map(b => b.b)), chipsR = Math.max(...c.chips.map(b => b.r)), first = c.chips[0]
          const beside = G.t < chipsB - 0.5
          if (beside) {
            t(`${at} · ${k} · side by side: vertically centred on the chips (±1px)`, Math.abs((G.t + G.b) / 2 - (first.t + first.b) / 2) <= 1, `buttons ${G.t}–${G.b} · chip ${first.t}–${first.b}`)
            t(`${at} · ${k} · side by side: right of every chip`, G.l >= chipsR - 0.5, `buttons left ${G.l} · chips right ${chipsR}`)
          } else t(`${at} · ${k} · wrapped: wholly below the chips`, G.t >= chipsB - 0.5)
          if (c.helper) t(`${at} · ${k} · the helper line is under the chips`, c.helper.t >= chipsB - 0.5 && c.helper.l <= first.l + 0.5, JSON.stringify(c.helper))
          if (k === 'disabled') {
            t(`${at} · ${k} · Approve off → one "why" line`, c.reason.length === 1, `${c.reason.length}`)
            if (c.reason.length === 1) {
              const r = c.reason[0]
              t(`${at} · ${k} · the "why" line is directly under the buttons (≤ 8px)`, r.t >= G.b - 0.5 && r.t - G.b <= 8, `reason top ${r.t} · buttons bottom ${G.b}`)
              t(`${at} · ${k} · the "why" line is right-aligned with the buttons`, Math.abs(r.r - G.r) <= 1, `reason right ${r.r} · buttons right ${G.r}`)
            }
          } else t(`${at} · ${k} · no "why" line`, c.reason.length === 0)
          for (const wb of c.warnings) t(`${at} · ${k} · the warning is below the chooser`, wb.t >= ch.b - 0.5, `warning top ${wb.t} · chooser bottom ${ch.b}`)
          if (k === 'guessed') t(`${at} · ${k} · the guessed-location warning is shown`, c.warnings.length >= 1)
          if (pk === 'B') t(`${at} · many types: the chips need more than the row beside the buttons — wrapped or wrapping`, !beside || c.chips.some(b => b.t > first.t + 0.5), 'all chips on one line beside the buttons')
        }
        // 390: the page as a picture, byte for byte
        if (w === 390) {
          const h2 = await pg.evaluate(() => document.documentElement.scrollHeight)
          await pg.setViewportSize({ width: w, height: h2 })
          const png = await pg.screenshot({ fullPage: true })
          const sha = crypto.createHash('sha256').update(png).digest('hex')
          if (CAPTURE) captured.sha390[`${C.cc}|${pk}`] = sha
          else t(`${C.cc} page ${pk} 390px · the screenshot is byte-identical to BEFORE`, before.sha390[`${C.cc}|${pk}`] === sha, `${before.sha390[`${C.cc}|${pk}`]} → ${sha}`)
        }
        if (SHOTS) {
          const h2 = await pg.evaluate(() => document.documentElement.scrollHeight)
          await pg.setViewportSize({ width: w, height: Math.min(Math.max(h2, 400), 4000) })
          await pg.screenshot({ path: path.join(outDir, `${SHOTS}-${C.cc}-${pk}-${w}.png`), fullPage: true })
        }
      }
    }
  } finally { await browser.close() }

  if (CAPTURE) {
    captured.heights = heights
    captured.captured_on = 'BEFORE: the tree with the pending-card actions in one row at the bottom (19 October 2026)'
    fs.writeFileSync(FIXTURE, JSON.stringify(captured, null, 1) + '\n')
    console.log(`captured ${Object.keys(heights).length} card heights and ${Object.keys(captured.sha390).length} 390px screenshots → ${path.relative(REPO, FIXTURE)}`)
  } else {
    console.log('\n  card height, px (BEFORE → AFTER):')
    for (const C of ['GB', 'US']) for (const [pk, P] of Object.entries(PAGES)) for (const k of P.events) {
      console.log(`    ${C} ${pk} ${k.padEnd(13)} ${WIDTHS.map(w => { const a = before.heights[`${C}|${pk}|${k}|${w}`], b = heights[`${C}|${pk}|${k}|${w}`]; return `${w}: ${a}${a === b ? ' =' : ` → ${b}`}` }).join(' · ')}`)
    }
  }
  console.log(`\n${fail ? '✗' : '✓'} pending-card-buttons: ${pass} passed, ${fail} failed${SHOTS ? ` · screenshots: docs/us-polish/pending-card-buttons/${SHOTS}-*.png` : ''}`)
  if (fail && !SHOTS) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
