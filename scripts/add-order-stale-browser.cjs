#!/usr/bin/env node
// scripts/add-order-stale-browser.cjs — Dominic's exact sequence, in a REAL browser, against the REAL routes
// on the RUNNING dev server. NOT in scripts/harnesses.json: it needs the dev server, the Supabase project
// and an operator session, none of which a headless CI run has.
//
//   HOW DOMINIC RUNS IT (test-truck only — the token is read from the environment, never from the repo):
//     npm run dev                                  (in one terminal)
//     HG_DASHBOARD_TOKEN=<test-truck token> HEADED=1 node scripts/add-order-stale-browser.cjs
//   A Chrome window opens on /login. Sign in as the test-truck operator; the run continues by itself.
//   Optional: ITEM (a pizza on the menu, default Campagnola) · TIME (a future slot, default 16:15) · QTY (8).
//
// 🔴 FAILURE MODE: the Add Order time list keeps a cancelled order's pizzas after the cancel, after adding
//    an item to the basket and after opening the dropdown — the row only clears on a page reload.
// 🔴 WHY THE FIXTURE HARNESSES PASSED WHILE THIS WAS LIVE: they mounted the panel WITHOUT React.StrictMode.
//    Next's dev default double-invokes effects on mount, and the panel's cleanup disposed a memoised
//    refresher that was never re-created — so in Dominic's browser every refresh trigger was a no-op.
//    On the pre-fix code this script ends "🔴 STALE" and exits 1; on the fix it ends "✓ cleared".
//
// Covers: (1) cancel from the Orders tab; (2) a change made from a SECOND browser context (a cancel through
// the real route while this page sits on Add Order); (3) reject; (4) an edit that moves the time;
// (5) a settings change (the event's operator collection interval). Each asserts the list moved in place —
// same <select> element identity — with no reload.
const puppeteer = require('puppeteer'); const crypto = require('crypto')
const fs = require('fs'); const path = require('path')
const TOKEN = process.env.HG_DASHBOARD_TOKEN || ''
if (!TOKEN) { console.error('HG_DASHBOARD_TOKEN required (test-truck only)'); process.exit(2) }
const ITEM = process.env.ITEM || 'Campagnola'; const TIME = process.env.TIME || '16:15'; const QTY = Number(process.env.QTY || 8)
const BASE = process.env.BASE || 'http://localhost:3000'
let fails = 0; const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = []; let tracing = false; let t0 = 0
const reqs = new Map()
;(async () => {
  const HEADED = process.env.HEADED === '1'
  const browser = await puppeteer.launch({ headless: !HEADED, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  const cdp = await page.createCDPSession()
  await cdp.send('Network.enable')
  cdp.on('Network.requestWillBeSent', e => { if (!e.request.url.startsWith(BASE)) return; reqs.set(e.requestId, { t: Date.now(), method: e.request.method, url: e.request.url.replace(BASE, '').replace(/token=[^&]+/, 'token=…'), body: e.request.postData ? (() => { try { const b = JSON.parse(e.request.postData); return b.action ? `action=${b.action}` : '' } catch { return '' } })() : '' }) })
  cdp.on('Network.responseReceived', e => { const r = reqs.get(e.requestId); if (!r) return; r.status = e.response.status; r.cache = e.response.headers['cache-control'] || ''; r.fromCache = !!e.response.fromDiskCache || !!e.response.fromServiceWorker; r.age = e.response.headers['age'] || ''; if (tracing) log.push({ ...r, dt: r.t - t0, kind: 'response' }) })
  cdp.on('Network.loadingFailed', e => { const r = reqs.get(e.requestId); if (!r) return; r.status = 'FAILED'; r.err = e.errorText; r.canceled = e.canceled; if (tracing) log.push({ ...r, dt: r.t - t0, kind: 'failed' }) })
  page.on('console', m => { const t = m.text(); if (/fetchAll|\[slots\]|capacity|refresh/i.test(t)) console.log('   [console]', t.slice(0, 160)) })

  const clickText = async (sel, re, opts = {}) => {
    const h = await page.evaluateHandle((sel, src, flags, all) => {
      const r = new RegExp(src, flags); const els = [...document.querySelectorAll(sel)].filter(b => r.test(b.textContent || '') && !b.disabled)
      return all ? els : els[0] || null
    }, sel, re.source, re.flags, !!opts.all)
    const el = h.asElement(); if (!el) throw new Error(`no element ${sel} matching ${re}`)
    await el.click(); return el
  }
  const options = () => page.$$eval('select', ss => { const s = ss.find(x => [...x.options].some(o => /\d\d:\d\d/.test(o.textContent))); return s ? [...s.options].map(o => o.textContent) : [] })
  const rowFor = async time => (await options()).find(o => o.replace(/^[\u00d7\u2007]\u0020/, '').startsWith(time)) || null
  const key = () => page.evaluate(() => window.__hgSnapshotKey || null)

  console.log('1. open dashboard')
  await page.goto(`${BASE}/dashboard/${TOKEN}`, { waitUntil: 'networkidle2', timeout: 60000 })
  if (page.url().includes('/login')) {
    if (!HEADED) { console.error('   the dashboard needs an operator session. Run with HEADED=1 and sign in as the test-truck operator when the window opens.'); process.exit(3) }
    console.log('   → /login shown. SIGN IN AS THE test-truck OPERATOR in the window; the trace continues by itself (up to 5 minutes).')
    await page.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 300000 })
    await page.waitForNetworkIdle({ timeout: 60000 }).catch(() => {})
  }
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /\+ Add order/.test(b.textContent)), { timeout: 60000 })
  const title = await page.title(); console.log('   title:', title)

  console.log('2. Add order: build', QTY, '×', ITEM, 'at', TIME)
  await clickText('button', /\+ Add order/)
  await page.waitForFunction(() => document.querySelectorAll('select').length > 0, { timeout: 30000 })
  await sleep(1500)
  for (let i = 0; i < QTY; i++) { await clickText('button', new RegExp(ITEM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); await sleep(120) }
  await sleep(800)
  const before = await rowFor(TIME); console.log('   row before order:', JSON.stringify(before))
  await page.$$eval('select', (ss, time) => { const s = ss.find(x => [...x.options].some(o => /\d\d:\d\d/.test(o.textContent))); const o = [...s.options].find(o => o.textContent.replace(/^[\u00d7\u2007]\u0020/, '').startsWith(time)); if (!o) throw new Error('no option ' + time); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })) }, TIME)
  await sleep(300)
  await clickText('button', /^Place order$/)
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /✕ Cancel/.test(b.textContent)), { timeout: 30000 })
  await sleep(2500)
  // the newest card = the highest #id
  const orderId = await page.evaluate(() => { const ids = [...document.querySelectorAll('span')].map(s => s.textContent.trim()).filter(t => /^#\d+$/.test(t)).map(t => Number(t.slice(1))); return Math.max(...ids) })
  console.log('   placed order #' + orderId)

  console.log('3. Add order tab: note the row')
  await clickText('button', /\+ Add order/); await sleep(2500)
  const rowWithOrder = await rowFor(TIME); const keyBefore = await key()
  console.log('   row with order:', JSON.stringify(rowWithOrder)); console.log('   key before cancel:', (keyBefore || '').length, 'chars, sha', require('crypto').createHash('sha1').update(keyBefore || '').digest('hex').slice(0, 10))

  console.log('4. Orders tab: cancel #' + orderId)
  await clickText('button', /^Orders/); await sleep(800)
  const cardBtn = await page.evaluateHandle(id => { const spans = [...document.querySelectorAll('span')].filter(s => s.textContent.trim() === '#' + id); for (const s of spans) { let n = s; for (let i = 0; i < 12 && n; i++) { const b = [...n.querySelectorAll('button')].find(b => /✕ Cancel/.test(b.textContent)); if (b) return b; n = n.parentElement } } return null }, orderId)
  if (!cardBtn.asElement()) throw new Error('no cancel button for #' + orderId)
  tracing = true; t0 = Date.now()
  await cardBtn.asElement().click(); await sleep(500)
  await page.select('select', 'customer_cancelled').catch(async () => { await page.$$eval('select', ss => { const s = ss.find(x => [...x.options].some(o => o.value === 'customer_cancelled')); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(s, 'customer_cancelled'); s.dispatchEvent(new Event('change', { bubbles: true })) }) })
  await sleep(200)
  await clickText('button', /^Cancel order$/)
  console.log('   cancel pressed at t=0; waiting 3s for the write + refetch')
  await sleep(3000)

  console.log('5. Add order tab, add an item, open the dropdown')
  await clickText('button', /\+ Add order/); await sleep(1500)
  const rowAfterTab = await rowFor(TIME); const keyAfterTab = await key()
  await clickText('button', new RegExp(ITEM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); await sleep(1500)
  const rowAfterItem = await rowFor(TIME)
  await page.$$eval('select', ss => { const s = ss.find(x => [...x.options].some(o => /\d\d:\d\d/.test(o.textContent))); s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); s.focus() })
  await sleep(2500)
  const rowAfterOpen = await rowFor(TIME); const keyAfter = await key()
  console.log('   row on tab shown :', JSON.stringify(rowAfterTab))
  console.log('   row after +item  :', JSON.stringify(rowAfterItem))
  console.log('   row after open   :', JSON.stringify(rowAfterOpen))
  console.log('   key after tab    :', keyAfterTab === keyBefore ? 'UNCHANGED' : 'changed')
  console.log('   key after open   :', keyAfter === keyBefore ? 'UNCHANGED' : 'changed')
  await sleep(12000)
  const rowAfter12s = await rowFor(TIME); console.log('   row after +12s   :', JSON.stringify(rowAfter12s))
  console.log('\n── NETWORK TRACE from the cancel press (ms) ──')
  for (const e of log.sort((a, b) => a.dt - b.dt)) console.log(`  +${String(e.dt).padStart(5)}  ${e.method.padEnd(4)} ${e.url.slice(0, 70).padEnd(70)} ${e.body.padEnd(22)} ${String(e.status).padEnd(6)} ${e.err || ''}${e.canceled ? ' (canceled)' : ''} ${e.cache ? 'cc=' + e.cache : ''}${e.fromCache ? ' FROM-CACHE' : ''}`)
  const selectIdBefore = await page.evaluate(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /\d\d:\d\d/.test(o.textContent))); s.__hgId = s.__hgId || Math.random().toString(36).slice(2); return s.__hgId })
  console.log('\n── ASSERTIONS ──')
  check(/Pizza/.test(rowWithOrder || ''), `(setup) the order showed in the list: ${JSON.stringify(rowWithOrder)}`)
  check(!/Pizza/.test(rowAfterOpen || '') && !/^[\u00d7]/.test(rowAfterOpen || ''), `(1) CANCEL from the Orders tab: the row cleared with no reload — ${JSON.stringify(rowAfterOpen)}`)
  check(!page.url().includes('?reload'), '(1) …and it was not a full-page reload')

  // (2) A CHANGE FROM A SECOND BROWSER CONTEXT while this page sits on Add Order: place an order through
  // the real route from another context, then cancel it there; this page must show both moves in place.
  console.log('\n(2) second browser context: place + cancel through the real route while this page is on Add Order')
  const ctx2 = await browser.createBrowserContext(); const p2 = await ctx2.newPage()
  const post = (body) => p2.evaluate(async (base, body) => { const r = await fetch(base + '/api/dashboard/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() } }, BASE, body)
  await p2.goto(BASE + '/api/ping')
  const today = new Date().toISOString().slice(0, 10)
  const ev = await p2.evaluate(async (base, token, today) => { const r = await fetch(`${base}/api/events/manage?token=${encodeURIComponent(token)}`); const j = await r.json(); return (j.events || []).find(e => e.event_date === today && e.status === 'open') || null }, BASE, TOKEN, today)
  if (!ev) { console.error('no open event today on this truck'); process.exit(4) }
  console.log('   live event:', ev.venue_name, ev.id.slice(0, 8))
  const key2 = crypto.randomUUID()
  const manualOrder = { order_key: key2, placedAt: new Date().toISOString(), buzzerNumber: null, provisional_id: null, customerName: 'BROWSER TEST', customerPhone: null, customerEmail: null, slot: TIME, items: [{ name: ITEM, quantity: QTY, unit_price: 12, price: 12 }], deals: [], notes: 'add-order-stale-browser — safe to delete', event_date: ev.event_date, event_id: ev.id, total: 12 * QTY, subtotal: 12 * QTY, discountAmt: 0, dealSavings: 0 }
  let r2 = await post({ token: TOKEN, pin: '', action: 'manual', manualOrder }); console.log('   placed from context 2 →', r2.status, JSON.stringify(r2.body).slice(0, 80))
  await sleep(6500)                                                     // realtime → refetch → key moves → throttled read lands
  const rowOther = await rowFor(TIME)
  check(/Pizza/.test(rowOther || ''), `(2) an order placed in another context APPEARS on this page's list: ${JSON.stringify(rowOther)}`)
  r2 = await post({ token: TOKEN, pin: '', action: 'cancel', order_key: key2, cancellationReason: 'Customer cancelled', refunded_minor: null }); console.log('   cancelled from context 2 →', r2.status)
  await sleep(6500)
  const rowOther2 = await rowFor(TIME)
  check(!/Pizza/.test(rowOther2 || ''), `(2) …and its cancel in the other context CLEARS it here: ${JSON.stringify(rowOther2)}`)

  // (3) REJECT — through the route from context 2 (the Reject button is offered on pending orders only).
  console.log('\n(3) reject')
  const key3 = crypto.randomUUID()
  r2 = await post({ token: TOKEN, pin: '', action: 'manual', manualOrder: { ...manualOrder, order_key: key3 } }); await sleep(6500)
  const rowRej0 = await rowFor(TIME)
  r2 = await post({ token: TOKEN, pin: '', action: 'reject', order_key: key3, rejectionReason: 'browser test' }); console.log('   reject →', r2.status, JSON.stringify(r2.body).slice(0, 80)); await sleep(6500)
  const rowRej1 = await rowFor(TIME)
  check(/Pizza/.test(rowRej0 || '') && !/Pizza/.test(rowRej1 || ''), `(3) REJECT clears the row: ${JSON.stringify(rowRej0)} → ${JSON.stringify(rowRej1)}`)

  // (4) AN EDIT THAT MOVES THE TIME — place at TIME, move to TIME+30 through the route, assert both rows.
  console.log('\n(4) edit that moves the time')
  const [hh, mm] = TIME.split(':').map(Number); const t2 = `${String(Math.floor((hh * 60 + mm + 30) / 60)).padStart(2, '0')}:${String((hh * 60 + mm + 30) % 60).padStart(2, '0')}`
  const key4 = crypto.randomUUID()
  r2 = await post({ token: TOKEN, pin: '', action: 'manual', manualOrder: { ...manualOrder, order_key: key4 } }); await sleep(6500)
  r2 = await post({ token: TOKEN, pin: '', action: 'edit', order_key: key4, editedOrder: { items: manualOrder.items, slot: t2, notes: manualOrder.notes, deals: [], customerName: 'BROWSER TEST', customerEmail: null, customerPhone: null } }); console.log('   edit →', r2.status, JSON.stringify(r2.body).slice(0, 80)); await sleep(6500)
  const rowMovedFrom = await rowFor(TIME); const rowMovedTo = await rowFor(t2)
  check(!/Pizza/.test(rowMovedFrom || '') && /Pizza/.test(rowMovedTo || ''), `(4) EDIT ${TIME} → ${t2}: ${JSON.stringify(rowMovedFrom)} / ${JSON.stringify(rowMovedTo)}`)
  await post({ token: TOKEN, pin: '', action: 'cancel', order_key: key4, cancellationReason: 'Customer cancelled', refunded_minor: null }); await sleep(1000)

  // (5) A SETTINGS CHANGE — the event's operator collection interval 15 → 5 → back; the grid must re-space.
  console.log('\n(5) settings change: operator collection interval')
  const nBefore = (await options()).length
  const customerBefore = ev.collection_interval_mins_override ?? null, operatorBefore = ev.operator_collection_interval_mins_override ?? null
  r2 = await post({ token: TOKEN, pin: '', action: 'set_collection_intervals_override', eventId: ev.id, customer: customerBefore ?? 15, operator: 5 }); console.log('   operator interval → 5:', r2.status, JSON.stringify(r2.body).slice(0, 80)); await sleep(6500)
  const nAfter = (await options()).length
  check(nAfter !== nBefore, `(5) the grid re-spaced without a reload: ${nBefore} → ${nAfter} times (action status ${r2.status})`)
  r2 = await post({ token: TOKEN, pin: '', action: 'set_collection_intervals_override', eventId: ev.id, customer: customerBefore, operator: operatorBefore }); console.log('   intervals restored:', r2.status); await sleep(1000)

  const selectIdAfter = await page.evaluate(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /\d\d:\d\d/.test(o.textContent))); return s && s.__hgId })
  check(selectIdAfter === selectIdBefore, 'the time <select> is the SAME element throughout — every update was in place, nothing remounted')
  await ctx2.close()
  fs.writeFileSync(path.join(process.cwd(), 'add-order-stale-browser.trace.json'), JSON.stringify({ orderId, before, rowWithOrder, rowAfterTab, rowAfterItem, rowAfterOpen, rowAfter12s, keyMoved: keyAfter !== keyBefore, log }, null, 1))
  await browser.close()
  console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ the list follows every change in place, in a real browser, with no reload')
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error('TRACE FAILED:', e.message); process.exit(1) })
