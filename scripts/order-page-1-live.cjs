// scripts/order-page-1-live.cjs — order-page-1 (13 November 2026), checked on LOCALHOST against the TEST truck "App Tester"
// (slug app-tester — a test truck; never Pizzeria Gusto or a real one). BY HAND, NOT SWEPT: it needs `next start` running and
// reads the live database through it (read only — it places no order).
//   npx next start -p 3100 &   then   node scripts/order-page-1-live.cjs [eventId]
// Proves, in a real browser with the page's JavaScript running:
//   1. the event box is three lines, in order, not overlapping;
//   2. "Change event" goes to /trucks/app-tester/order and that page is the truck's event chooser — and the OLD target,
//      /trucks/app-tester, is the discovery profile that answers "Food truck not found" for this truck (the cause);
//   3. scrolling the menu, the category tabs stay pinned just under the header and the active tab follows the scroll.
// Writes docs/order-page-1/live-*.png.
// ⚠️ SUPERSEDED FOR THE EVENT BOX by order-page-2 (13 November 2026): the box is now TWO lines and one link (no "Change event"
//    text line, no pin), so this script's event-box checks describe order-page-1's box and now fail by design. The event box's
//    proof is scripts/order-page-2-live.cjs; this script's other checks (formules, full width, sticky tabs) still hold.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { chromium } = require(path.join(REPO, 'node_modules/playwright'))
const BASE = process.env.BASE || 'http://localhost:3100'
const SLUG = 'app-tester'
const EVENT = process.argv[2] || 'bac2f2c7-6338-4037-b8e4-073eadbec96a'
const OUT = path.join(REPO, 'docs/order-page-1')
let bad = 0
const check = (ok, label, detail) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}${!ok && detail !== undefined ? `\n      ${JSON.stringify(detail)}` : ''}`); if (!ok) bad++ }

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const pg = await ctx.newPage()

  console.log('\n── 1 · the event box ─────────────────────────────────────────────────────────────────────')
  await pg.goto(`${BASE}/trucks/${SLUG}/order?event_id=${EVENT}`, { waitUntil: 'networkidle' })
  await pg.waitForSelector('[data-event-box]', { timeout: 30000 })
  await pg.waitForSelector('[data-menu]', { timeout: 30000 })
  const box = await pg.evaluate(() => {
    const b = document.querySelector('[data-event-box]')
    return [...b.children].map(c => { const r = c.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, text: c.innerText.replace(/\s+/g, ' ').trim() } })
  })
  check(box.length === 3, `three lines: ${box.map(l => `"${l.text}"`).join(' / ')}`, box)
  check(box.every((l, i) => i === 0 || l.top >= box[i - 1].bottom - 0.5), 'in order, none overlapping')
  const scrollW = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(scrollW <= 0, 'no sideways scroll', scrollW)
  await pg.screenshot({ path: path.join(OUT, 'live-app-tester-390-top.png') })

  console.log('\n── 2 · "Change event" ────────────────────────────────────────────────────────────────────')
  const href = await pg.getAttribute('[data-change-event]', 'href')
  check(href === `/trucks/${SLUG}/order`, `its href is ${href}`)
  await pg.click('[data-change-event]')
  await pg.waitForURL(u => new URL(u).pathname === `/trucks/${SLUG}/order` && !new URL(u).searchParams.has('event_id'), { timeout: 20000 })
  await pg.waitForSelector(`a[href*="/trucks/${SLUG}/order?event_id="]`, { timeout: 20000 })
  const chooser = await pg.evaluate(slug => ({ url: location.pathname + location.search, cards: document.querySelectorAll(`a[href*="/trucks/${slug}/order?event_id="]`).length,
    eventBox: !!document.querySelector('[data-event-box]'), notFound: /not found/i.test(document.body.innerText) }), SLUG)
  check(chooser.cards > 1 && !chooser.eventBox && !chooser.notFound, `opens ${chooser.url}: the truck's event chooser (${chooser.cards} events to pick), not "not found"`, chooser)
  await pg.screenshot({ path: path.join(OUT, 'live-app-tester-390-change-event.png') })
  const old = await ctx.newPage()
  await old.goto(`${BASE}/trucks/${SLUG}`, { waitUntil: 'networkidle' })
  const oldText = await old.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200))
  console.log(`  · the OLD target /trucks/${SLUG} shows: "${oldText.slice(0, 90)}…"`)
  await old.screenshot({ path: path.join(OUT, 'live-app-tester-390-old-target.png') })
  await old.close()

  console.log('\n── 3 · sticky tabs, active tab following the scroll ──────────────────────────────────────')
  await pg.goto(`${BASE}/trucks/${SLUG}/order?event_id=${EVENT}`, { waitUntil: 'networkidle' })
  await pg.waitForSelector('[data-menu] .sticky.z-30 button', { timeout: 30000 })
  const sections = await pg.evaluate(() => [...document.querySelectorAll('[data-menu] .sticky.z-30 button')].map(b => b.innerText.trim()))
  // Scroll the way a person does (wheel steps) from the top of the menu to the end, recording the pinned bar and the lit tab.
  const seen = []
  await pg.mouse.move(195, 500)
  for (let i = 0; i < 60; i++) {
    await pg.mouse.wheel(0, 250)
    await pg.waitForTimeout(100)
    const s = await pg.evaluate(() => {
      const bar = document.querySelector('[data-menu] .sticky.z-30')
      const active = [...bar.querySelectorAll('button')].find(b => b.className.includes('bg-orange-600'))
      return { y: Math.round(scrollY), barTop: Math.round(bar.getBoundingClientRect().top), want: parseInt(bar.style.top, 10), pinned: bar.getBoundingClientRect().top <= parseInt(bar.style.top, 10) + 0.5, active: active ? active.innerText.trim() : null }
    })
    if (s.pinned) seen.push(s)
    if (i === 6) await pg.screenshot({ path: path.join(OUT, 'live-app-tester-390-scrolled.png') })
  }
  const order = seen.map(s => s.active).filter((a, k, all) => k === 0 || a !== all[k - 1])
  check(seen.length > 10 && seen.every(s => s.barTop === s.want), `the tabs stay pinned at ${seen[0]?.want}px (just under the header) through ${seen.length} scroll steps`, seen.slice(0, 3))
  check(order.length > 1, `the active tab follows the scroll: ${order.join(' → ')} (tabs: ${sections.join(', ')})`, order)

  await browser.close()
  console.log(`\n${bad ? '🔴 ' + bad + ' FAILED' : '✅ order-page-1-live: event box, Change event and sticky tabs checked on localhost (App Tester)'}`)
  process.exit(bad ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
