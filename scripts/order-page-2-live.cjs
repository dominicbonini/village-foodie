// scripts/order-page-2-live.cjs — order-page-2 (13 November 2026), checked on LOCALHOST against the TEST truck "App Tester"
// (slug app-tester — a test truck; never Pizzeria Gusto or a real one). BY HAND, NOT SWEPT: it needs `next start` running and
// reads the live database through it (read only — it places no order, writes nothing).
//   npx next start -p 3100 &   then   node scripts/order-page-2-live.cjs
// ⚠️ App Tester's events have no postcode and the truck is English, so the BROWSER's copy of two responses is edited in flight
// (Playwright route; nothing is written anywhere): /api/events gets a venue/town/postcode on the chosen event, and both it and
// /api/menu get the truck's time settings' `locale` — the one field the page takes its language from (useTruckLocale).
// Proves, in a real browser with the page's JavaScript running (Chromium and WebKit, 390 px and 320 px):
//   1. EVENT BOX: two lines — date · range · status / the FULL venue · postcode on one wrapping line, never clipped; no pin;
//      no "Change event" text line; a chevron on the right, vertically centred; balanced left/right padding; the WHOLE box is one
//      link to /trucks/app-tester/order whose accessible name is the language's existing "Change event" words; tapping it goes there.
//   2. ALLERGEN POP-UP: every name is the language's allergen word — exactly what allergenLabel gives the dish chips — in French,
//      German and Japanese; the chips on the page are the same words.
// Writes docs/order-page-2/*.png and docs/order-page-2/measurements.json.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const pw = require(path.join(REPO, 'node_modules/playwright'))
const BASE = process.env.BASE || 'http://localhost:3100'
const SLUG = 'app-tester'
const EVENT = process.argv[2] || 'e1b6a164-52ba-48ba-b733-c66b72938719'   // App Tester's event that is open today → "● Live" shows
const OUT = path.join(REPO, 'docs/order-page-2')
fs.mkdirSync(OUT, { recursive: true })
let bad = 0
const check = (ok, label, detail) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}${!ok && detail !== undefined ? `\n      ${JSON.stringify(detail)}` : ''}`); if (!ok) bad++ }
const msgs = l => JSON.parse(fs.readFileSync(path.join(REPO, `messages/${l}.json`), 'utf8'))
const ADDR = {
  short: { venue_name: 'The Green', village: 'Comberton', postcode: 'CB23 7ED' },
  long: { venue_name: 'The Old Schoolhouse Community Garden and Village Green Car Park (behind the Methodist Church)', village: 'Great Shelford', postcode: 'CB22 5EW' },
}
const measurements = []

async function openPage(ctx, locale, addr, { onMenu } = {}) {
  const pg = await ctx.newPage()
  await pg.route(`**/api/events?truck=${SLUG}*`, async route => {
    const r = await route.fetch(); const j = await r.json()
    if (j.time) j.time = { ...j.time, locale }
    for (const e of j.events || []) if (e.id === EVENT && addr) Object.assign(e, ADDR[addr])
    await route.fulfill({ response: r, json: j })
  })
  await pg.route(`**/api/menu/${SLUG}*`, async route => {
    const r = await route.fetch(); const j = await r.json()
    if (j.truck?.time) j.truck.time = { ...j.truck.time, locale }
    if (onMenu) onMenu(j)
    await route.fulfill({ response: r, json: j })
  })
  await pg.goto(`${BASE}/trucks/${SLUG}/order?event_id=${EVENT}`, { waitUntil: 'networkidle' })
  await pg.waitForSelector('[data-event-box]', { timeout: 30000 })
  await pg.waitForSelector('[data-menu]', { timeout: 30000 })
  await pg.waitForFunction(l => document.documentElement.lang === l || document.documentElement.lang.startsWith(l.slice(0, 2)), locale, { timeout: 15000 }).catch(() => {})
  await pg.waitForTimeout(400)
  return pg
}

;(async () => {
  console.log('\n── 1 · the event box ─────────────────────────────────────────────────────────────────────')
  for (const engine of ['chromium', 'webkit']) {
    const browser = await pw[engine].launch()
    for (const width of [390, 320]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 })
      for (const locale of ['en-GB', 'de-DE', 'fi-FI']) for (const addr of ['short', 'long']) {
        if (width === 320 && addr === 'short') continue
        const want = msgs(locale).order.changeEvent
        const pg = await openPage(ctx, locale, addr)
        const m = await pg.evaluate(() => {
          const box = document.querySelector('[data-event-box]')
          const R = el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height } }
          const when = box.querySelector('[data-event-line="when"]'), where = box.querySelector('[data-event-line="where"]')
          const chev = box.querySelector('[data-event-chevron]'), link = box.querySelector('[data-change-event]')
          const row = chev && chev.parentElement
          const pts = []
          const b = R(box)
          const bw = parseFloat(getComputedStyle(box).borderTopWidth)   // the link fills the box INSIDE its 1px border
          for (const [fx, fy] of [[0.03, 0.1], [0.5, 0.5], [0.97, 0.9], [0.2, 0.3], [0.6, 0.75], [0.95, 0.5]]) {
            const el = document.elementFromPoint(b.l + (b.r - b.l) * fx, b.t + b.h * fy)
            pts.push(!!el && (el === link || !!el.closest('[data-change-event]')))
          }
          const whereR = R(where), textRange = document.createRange(); textRange.selectNodeContents(where)
          const lineH = parseFloat(getComputedStyle(where).lineHeight)
          return {
            lang: document.documentElement.lang,
            boxText: box.innerText.replace(/\s+/g, ' ').trim(),
            whenText: when.innerText.replace(/\s+/g, ' ').trim(), whereText: where.textContent,
            whenBottom: R(when).b, whereTop: whereR.t,
            whereLines: Math.round(whereR.h / lineH), whereClipped: where.scrollWidth > where.clientWidth + 0.5 || getComputedStyle(where).textOverflow === 'ellipsis' || getComputedStyle(where).webkitLineClamp !== 'none' && getComputedStyle(where).webkitLineClamp !== '',
            pin: !!box.querySelector('svg:not([data-event-chevron])'),
            chevCentre: chev ? (R(chev).t + R(chev).b) / 2 : null, rowCentre: row ? (R(row).t + R(row).b) / 2 : null,
            padL: R(when).l - b.l, padR: chev ? b.r - R(chev).r : null,
            link: link ? { href: link.getAttribute('href'), aria: link.getAttribute('aria-label'), cover: [R(link).l - b.l, b.r - R(link).r, R(link).t - b.t, b.b - R(link).b].every(d => d >= 0 && d <= bw + 0.01) } : null,
            hits: pts, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          }
        })
        const tag = `${engine} ${width}px ${locale} ${addr}`
        const a = ADDR[addr]
        const ok = m.lang.startsWith(locale.slice(0, 2)) &&
          m.whenBottom <= m.whereTop + 0.5 &&
          m.whereText === `${a.venue_name} · ${a.village} · ${a.postcode}` && !m.whereClipped &&
          !m.pin && !m.boxText.includes(want) &&
          m.link && m.link.href === `/trucks/${SLUG}/order` && m.link.aria === want && m.link.cover && m.hits.every(Boolean) &&
          Math.abs(m.chevCentre - m.rowCentre) <= 1 && Math.abs(m.padL - m.padR) <= 1 && m.sideways <= 0
        check(ok, `${tag}: "${m.whenText}" / "${m.whereText.replace(/ /g, ' ')}" (${m.whereLines} line${m.whereLines > 1 ? 's' : ''}) · link "${m.link?.aria}" covers the box · chevron centred · padding ${m.padL.toFixed(1)}/${m.padR?.toFixed(1)}`, m)
        measurements.push({ tag, ...m })
        await pg.locator('[data-event-box]').screenshot({ path: path.join(OUT, `box-${engine}-${width}-${locale}-${addr}.png`) })
        if (engine === 'chromium' && width === 390) await pg.screenshot({ path: path.join(OUT, `page-${locale}-${addr}-390.png`) })
        if (engine === 'chromium' && width === 390 && locale === 'de-DE' && addr === 'long') {
          // a tap anywhere on the box (here near its bottom-left, away from the text) opens the truck's events page
          const b = await pg.locator('[data-event-box]').boundingBox()
          await pg.mouse.click(b.x + 6, b.y + b.height - 4)
          await pg.waitForURL(u => new URL(u).pathname === `/trucks/${SLUG}/order` && !new URL(u).searchParams.has('event_id'), { timeout: 20000 }).catch(() => {})
          const u = new URL(pg.url())
          check(u.pathname === `/trucks/${SLUG}/order` && !u.searchParams.has('event_id'), `a tap at the box's bottom-left corner opens ${u.pathname}${u.search} (the events page)`)
        }
        await pg.close()
      }
      await ctx.close()
    }
    await browser.close()
  }

  console.log('\n── 2 · the allergen pop-up ───────────────────────────────────────────────────────────────')
  const browser = await pw.chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  for (const locale of ['fr-FR', 'de-DE', 'ja-JP', 'en-GB']) {
    let stored = []
    const pg = await openPage(ctx, locale, null, { onMenu: j => { stored = [...new Set((j.menu?.items || []).flatMap(i => i.allergens || []))] } })
    const M = msgs(locale), names = (M.menuBadges || {}).allergen || {}
    const expected = stored.map(v => locale.startsWith('en') ? v : (names[v.replace(/[^A-Za-z]/g, '')] ?? v)).sort()
    const chips = await pg.evaluate(() => [...new Set([...document.querySelectorAll('[data-menu] span.bg-amber-50.text-amber-700.rounded-md')].map(s => s.textContent.trim()))])
    await pg.getByRole('button', { name: M.order.allergenInfo }).click()
    await pg.waitForSelector('.fixed.inset-0 span.rounded-lg.bg-amber-50', { timeout: 10000 })
    const shown = await pg.evaluate(() => [...document.querySelectorAll('.fixed.inset-0 span.rounded-lg.bg-amber-50')].map(s => s.textContent.trim()))
    const english = shown.filter(s => stored.includes(s) && !Object.values(names).includes(s))
    check(stored.length > 0 && JSON.stringify([...shown].sort()) === JSON.stringify(expected) && (locale.startsWith('en') || english.length === 0) && chips.every(c => shown.includes(c)),
      `${locale}: ${shown.length} names, each the language's word (${shown.slice(0, 5).join(', ')}…); the dish chips (${chips.length}) are the same words`, { shown, expected, chips, english })
    measurements.push({ tag: `allergens ${locale}`, stored, shown, chips })
    await pg.screenshot({ path: path.join(OUT, `allergens-${locale}-390.png`) })
    await pg.close()
  }
  await browser.close()

  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(measurements, null, 2))
  console.log(`\n${bad ? '🔴 ' + bad + ' FAILED' : '✅ order-page-2-live: the event box and the allergen pop-up checked on localhost (App Tester)'}`)
  process.exit(bad ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
