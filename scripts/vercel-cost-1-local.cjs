#!/usr/bin/env node
// scripts/vercel-cost-1-local.cjs — vercel-cost-1 (23 November 2026, docs/vercel-cost-1-report.md): THE FIRST-VISIT AND REFRESH PROOFS, on a
// LOCAL PRODUCTION BUILD against the stand-in database (scripts/_perf-1-standin.cjs — fixtures only, never the real database, refuses
// every write). Run by hand, never by the sweep (it needs a build and two servers):
//   node scripts/_perf-1-standin.cjs --port 54399 &
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_URL=http://127.0.0.1:54399 npx next build
//   node scripts/vercel-cost-1-local.cjs        (starts `next start` itself, with a throwaway REVALIDATE_SECRET)
// Proves:
//   1 · the build: exactly the built-ahead countries' landing, /features and /faq are prerendered, each with NO timer (revalidate false)
//   2 · a country NOT built ahead answers 200 on its first visit, is then served from the cache (HIT), with no timer in its header
//   3 · a price change (plan_prices, as a migration makes it) is NOT shown until /api/revalidate is called; then the VERY NEXT request
//       shows it — on a built-ahead page and on a first-visit page alike
//   4 · a FAQ that went empty (a cached 404) comes back on the very next request after its tag is refreshed — nothing waits for a timer
//   5 · the route stays closed: no secret or a wrong one → 401
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const PORT = 3502, SECRET = 'vercel-cost-1-local-test-only'
const BUILT = ['uk', 'us', 'ie', 'au', 'nz', 'ca', 'fr', 'de']

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 700)}` : '')) } }
const req = (port, method, p, { body, headers = {}, host = 'www.hatchgrab.com' } = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) } }, x => {
    let b = ''; x.setEncoding('utf8'); x.on('data', c => { b += c }); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: b }))
  })
  r.on('error', rej); if (body) r.write(JSON.stringify(body)); r.end()
})
const page = p => req(PORT, 'GET', p)
const standin = (p, body) => req(54399, body ? 'POST' : 'GET', p, { body, host: '127.0.0.1' }).then(r => JSON.parse(r.body))
const revalidate = (tags, secret = SECRET) => req(PORT, 'POST', '/api/revalidate', { body: { tags }, headers: secret === null ? {} : { 'x-revalidate-secret': secret } })
const wait = ms => new Promise(r => setTimeout(r, ms))
const count = (s, needle) => s.split(needle).length - 1
const cacheState = r => r.headers['x-nextjs-cache'] || '-'

;(async () => {
  console.log('\n── 1 · the build')
  const pm = JSON.parse(fs.readFileSync(path.join(REPO, '.next/prerender-manifest.json'), 'utf8'))
  const country = Object.keys(pm.routes).filter(r => /^\/[a-z]{2}(\/(features|faq))?$/.test(r))
  const expected = BUILT.flatMap(s => [`/${s}`, `/${s}/features`, `/${s}/faq`])
  t(`prerendered country pages: exactly the ${BUILT.length} built-ahead countries × landing, /features, /faq (${expected.length})`,
    JSON.stringify([...country].sort()) === JSON.stringify([...expected].sort()), { got: country.length, missing: expected.filter(r => !country.includes(r)), extra: country.filter(r => !expected.includes(r)) })
  const timers = country.map(r => [r, pm.routes[r].initialRevalidateSeconds])
  t('…every one with NO timer (initialRevalidateSeconds false)', timers.every(([, v]) => v === false), timers.filter(([, v]) => v !== false))
  const dyn = Object.keys(pm.dynamicRoutes || {})
  t('…and the three [country] routes are open to other countries (fallback, not 404: dynamicParams true)',
    ['/[country]', '/[country]/features', '/[country]/faq'].every(r => dyn.includes(r) && pm.dynamicRoutes[r].fallback !== false), dyn)

  fs.rmSync(path.join(REPO, '.next/cache/fetch-cache'), { recursive: true, force: true })   // start with an empty data cache
  const srv = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: REPO, env: { ...process.env, REVALIDATE_SECRET: SECRET }, stdio: 'ignore', detached: true })
  try {
    for (;;) { try { await page('/robots.txt'); break } catch { await wait(200) } }

    console.log('\n── 2 · a country NOT built ahead, on its first visit (/mt, Malta)')
    const m1 = await page('/mt'), m2 = await page('/mt')
    t('first visit: 200, its own page (canonical /mt), rendered now (MISS)', m1.status === 200 && /<link rel="canonical" href="https:\/\/www\.hatchgrab\.com\/mt"/.test(m1.body) && cacheState(m1) === 'MISS', { status: m1.status, cache: cacheState(m1) })
    t('second visit: served from the cache (HIT), the same page', m2.status === 200 && cacheState(m2) === 'HIT' && m2.body.length > 10000, { status: m2.status, cache: cacheState(m2) })
    const cc = m2.headers['cache-control'] || ''
    t(`…with no timer in its header (${cc})`, /s-maxage=31536000/.test(cc) && !/s-maxage=300\b/.test(cc), cc)
    const f1 = await page('/mt/features'), q1 = await page('/mt/faq')
    t('/mt/features and /mt/faq: 200 on first visit too', f1.status === 200 && q1.status === 200, [f1.status, q1.status])
    const u1 = await page('/uk')
    t(`a built-ahead page (/uk): 200 from the build (${cacheState(u1)}), no timer (${u1.headers['cache-control']})`, u1.status === 200 && /HIT|STALE/.test(cacheState(u1)) && /s-maxage=31536000/.test(u1.headers['cache-control'] || ''))

    console.log('\n── 3 · a price change, as a migration makes it (plan_prices in the stand-in)')
    const p0 = (await page('/uk')).body, mt0 = (await page('/mt')).body
    const proGB = (await standin('/rest/v1/plan_prices?select=monthly_minor&plan_key=eq.pro&country_code=eq.GB'))[0].monthly_minor
    const proMT = (await standin('/rest/v1/plan_prices?select=monthly_minor&plan_key=eq.pro&country_code=eq.MT'))[0].monthly_minor
    const gbOld = `£${proGB / 100}`, gbNew = `£${proGB / 100 + 4}`, mtOld = `€${proMT / 100}`, mtNew = `€${proMT / 100 + 4}`
    await standin('/__standin/set', { table: 'plan_prices', match: { plan_key: 'pro', country_code: 'GB' }, set: { monthly_minor: proGB + 400 } })
    await standin('/__standin/set', { table: 'plan_prices', match: { plan_key: 'pro', country_code: 'MT' }, set: { monthly_minor: proMT + 400 } })
    await wait(3000)
    const p1 = (await page('/uk')).body, mt1 = (await page('/mt')).body
    t(`before the refresh: /uk still shows ${gbOld} and /mt ${mtOld} for Pro (kept — no timer, nothing told)`,
      count(p0, gbOld) > 0 && count(p1, gbOld) === count(p0, gbOld) && count(p1, gbNew) === 0 && count(mt0, mtOld) > 0 && count(mt1, mtNew) === 0,
      { uk: [count(p1, gbOld), count(p1, gbNew)], mt: [count(mt1, mtOld), count(mt1, mtNew)] })
    const r = await revalidate(['marketing-plans'])
    const p2 = (await page('/uk')).body, mt2 = (await page('/mt')).body
    t(`after POST /api/revalidate {"tags":["marketing-plans"]}: the VERY NEXT /uk shows ${gbNew} and /mt ${mtNew}`,
      r.status === 200 && count(p2, gbNew) === count(p0, gbOld) && count(p2, gbOld) === 0 && count(mt2, mtNew) === count(mt0, mtOld) && count(mt2, mtOld) === 0,
      { status: r.status, uk: [count(p2, gbOld), count(p2, gbNew)], mt: [count(mt2, mtOld), count(mt2, mtNew)] })
    const p3 = await page('/uk')
    t('…and that new page is then kept (HIT on the next request)', cacheState(p3) === 'HIT' && count(p3.body, gbNew) > 0, cacheState(p3))
    await standin('/__standin/set', { table: 'plan_prices', match: { plan_key: 'pro', country_code: 'GB' }, set: { monthly_minor: proGB } })
    await standin('/__standin/set', { table: 'plan_prices', match: { plan_key: 'pro', country_code: 'MT' }, set: { monthly_minor: proMT } })
    await revalidate(['marketing-plans'])
    t('…and back: the old prices on the next request after a refresh', count((await page('/uk')).body, gbOld) === count(p0, gbOld) && count((await page('/mt')).body, mtOld) === count(mt0, mtOld))

    console.log('\n── 4 · a FAQ that went empty, then came back (a cached 404 is refreshed by its tag too)')
    await standin('/__standin/set', { table: 'faq_items', match: { status: 'published' }, set: { status: 'draft' } })
    await revalidate(['marketing-faq'])
    const e1 = await page('/mt/faq'), e2 = await page('/mt/faq')
    t('every question unpublished + refreshed: /mt/faq 404, and the 404 is what is kept', e1.status === 404 && e2.status === 404, [e1.status, e2.status, cacheState(e2)])
    await standin('/__standin/set', { table: 'faq_items', match: { status: 'draft' }, set: { status: 'published' } })
    const e3 = await page('/mt/faq')
    t('published again, nothing told yet: still the kept 404', e3.status === 404, e3.status)
    await revalidate(['marketing-faq'])
    const e4 = await page('/mt/faq')
    t('after the refresh: the VERY NEXT /mt/faq answers 200 with its questions', e4.status === 200 && /faq/i.test(e4.body), e4.status)

    console.log('\n── 5 · the route stays closed')
    const none = await revalidate(['marketing-faq'], null), wrong = await revalidate(['marketing-faq'], 'not-the-secret'), bad = await revalidate(['orders'])
    t('no secret → 401, a wrong secret → 401, a tag off the allow-list → 400', none.status === 401 && wrong.status === 401 && bad.status === 400, [none.status, wrong.status, bad.status])
  } finally {
    try { process.kill(-srv.pid) } catch { /* gone */ }
  }
  console.log(`\n${fail ? '🔴' : '✅'} vercel-cost-1-local: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
