#!/usr/bin/env node
// scripts/perf-1-local.cjs — perf-1 (5 November 2026, docs/perf-1-report.md): THE REVALIDATION PROOFS, on a LOCAL PRODUCTION BUILD
// against the stand-in database (scripts/_perf-1-standin.cjs). Run by hand, never by the sweep (it needs a build and two servers):
//   node scripts/_perf-1-standin.cjs --port 54399 &                 (the stand-in; fixtures only, never the real database)
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_URL=http://127.0.0.1:54399 … npx next build
//   node scripts/perf-1-local.cjs                                     (starts `next start` itself, with a throwaway secret)
// Every "database change" is the stand-in's /__standin/set — a fixture row changed, as a migration or the dashboard would. Proves:
//   1 · /api/revalidate refuses GET, no secret, a wrong secret and an unknown tag, and accepts the allow-listed ones;
//   2 · a PRICE change shows only after `marketing-plans` is revalidated — on the very next request (not stale-then-fresh);
//   3 · a FAQ edit published shows only after `marketing-faq` is revalidated — on the very next request;
//   4 · a country SWITCH-OFF: its address redirects to /uk within the proxy's 60 seconds with NO revalidate; the other pages' country
//       menu follows on the very next request after `marketing-countries` is revalidated; SWITCH-ON the same way back;
//   5 · a FAILED read is never cached: with the FAQ translations failing, /de/faq answers as before (no FAQ: 404); the moment the
//       table reads again, the very next request shows the German FAQ.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const PORT = 3501, SECRET = 'perf-1-local-test-only'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 600)}` : '')) } }
const req = (port, method, p, { body, headers = {}, host = 'www.hatchgrab.com' } = {}) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) } }, x => {
    let b = ''; x.setEncoding('utf8'); x.on('data', c => { b += c }); x.on('end', () => res({ status: x.statusCode, location: x.headers.location || null, body: b }))
  })
  r.on('error', rej); if (body) r.write(JSON.stringify(body)); r.end()
})
const page = p => req(PORT, 'GET', p)
const standin = (p, body) => req(54399, body ? 'POST' : 'GET', p, { body, host: '127.0.0.1' }).then(r => JSON.parse(r.body))
const revalidate = (tags, secret = SECRET) => req(PORT, 'POST', '/api/revalidate', { body: { tags }, headers: secret === null ? {} : { 'x-revalidate-secret': secret } })
const wait = ms => new Promise(r => setTimeout(r, ms))
const count = (s, needle) => s.split(needle).length - 1

;(async () => {
  fs.rmSync(path.join(REPO, '.next/cache/fetch-cache'), { recursive: true, force: true })   // start with an empty data cache
  const srv = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: REPO, env: { ...process.env, REVALIDATE_SECRET: SECRET }, stdio: 'ignore', detached: true })
  try {
    for (;;) { try { await page('/robots.txt'); break } catch { await wait(200) } }

    console.log('\n── 1 · /api/revalidate refuses what it must')
    const g = await req(PORT, 'GET', '/api/revalidate')
    const none = await revalidate(['marketing-faq'], null), wrong = await revalidate(['marketing-faq'], 'not-the-secret'), bad = await revalidate(['orders']), empty = await revalidate([])
    const ok = await revalidate(['marketing-faq', 'marketing-plans'])
    t('GET → 405; no secret → 401; a wrong secret → 401; an unknown tag → 400; no tag → 400', g.status === 405 && none.status === 401 && wrong.status === 401 && bad.status === 400 && empty.status === 400, [g.status, none.status, wrong.status, bad.status, empty.status])
    t('the allow-listed tags → 200 {"revalidated":["marketing-faq","marketing-plans"]}', ok.status === 200 && ok.body === '{"revalidated":["marketing-faq","marketing-plans"]}', ok)

    console.log('\n── 2 · a price change (plan_prices, as a migration would make it)')
    const p0 = (await page('/uk')).body
    await standin('/__standin/set', { table: 'plan_prices', match: { plan_key: 'pro', country_code: 'GB' }, set: { monthly_minor: 3300 } })
    const p1 = (await page('/uk')).body
    t('before revalidating: /uk still shows the cached £29 for Pro (the data is cached)', count(p0, '£29') > 0 && count(p1, '£29') === count(p0, '£29') && count(p1, '£33') === 0, { before: count(p0, '£29'), cached: count(p1, '£29') })
    const r2 = await revalidate(['marketing-plans'])
    const p2 = (await page('/uk')).body
    t('after revalidating marketing-plans: the VERY NEXT /uk shows £33 where it showed £29', r2.status === 200 && count(p2, '£33') === count(p0, '£29') && count(p2, '£29') === 0, { '£33': count(p2, '£33'), '£29': count(p2, '£29') })
    await standin('/__standin/set', { table: 'plan_prices', match: { plan_key: 'pro', country_code: 'GB' }, set: { monthly_minor: 2900 } }); await revalidate(['marketing-plans'])
    t('…and back: £29 on the next request', count((await page('/uk')).body, '£29') === count(p0, '£29'))

    console.log('\n── 3 · a FAQ edit published (faq_items, as Admin › FAQ saves it — Admin calls the same revalidateMarketing in-process)')
    const MARK = 'Perf one marker: is this question new?'
    const items = await standin('/rest/v1/faq_items?select=id,question_en,status&status=eq.published&order=position.asc&limit=1')
    const item = items[0]
    const f0 = (await page('/uk/faq')).body
    await standin('/__standin/set', { table: 'faq_items', match: { id: item.id }, set: { question_en: MARK } })
    const f1 = (await page('/uk/faq')).body
    t('before revalidating: /uk/faq still shows the published question (cached)', f0.includes(item.question_en.replace(/'/g, '&#x27;')) || f0.includes(item.question_en) ? !f1.includes(MARK) : false, item.question_en)
    const r3 = await revalidate(['marketing-faq'])
    const f2 = (await page('/uk/faq')).body
    t('after revalidating marketing-faq: the VERY NEXT /uk/faq shows the new question', r3.status === 200 && f2.includes(MARK))
    await standin('/__standin/set', { table: 'faq_items', match: { id: item.id }, set: { question_en: item.question_en } }); await revalidate(['marketing-faq'])

    console.log('\n── 4 · a country switched off, then on (country_settings.enabled — Malta, /mt)')
    const m0 = await page('/mt'), u0 = (await page('/uk')).body
    t('to start: /mt answers 200 and the /uk country menu offers Malta', m0.status === 200 && u0.includes('href="/mt"'), { mt: m0.status, menu: u0.includes('href="/mt"') })
    await standin('/__standin/set', { table: 'country_settings', match: { country_code: 'MT' }, set: { enabled: false } })
    const tOff = Date.now(); let offAfter = null
    for (let i = 0; i < 16; i++) { const r = await page('/mt'); if (r.status === 302 || r.status === 307) { offAfter = { ms: Date.now() - tOff, status: r.status, location: r.location }; break } await wait(5000) }
    t('SWITCH-OFF with NO revalidate: /mt redirects to /uk within the proxy\'s 60 seconds', offAfter && offAfter.ms <= 65000 && /\/uk$/.test(offAfter.location || ''), offAfter)
    const u1 = (await page('/uk')).body
    t('…while the /uk menu still offers Malta until the country data is revalidated (or 5 minutes)', u1.includes('href="/mt"'))
    await revalidate(['marketing-countries'])
    const u2 = (await page('/uk')).body
    t('after revalidating marketing-countries: the VERY NEXT /uk no longer offers Malta', !u2.includes('href="/mt"'))
    await standin('/__standin/set', { table: 'country_settings', match: { country_code: 'MT' }, set: { enabled: true } })
    await revalidate(['marketing-countries'])
    const u3 = (await page('/uk')).body
    t('SWITCH-ON, revalidated: the VERY NEXT /uk offers Malta again', u3.includes('href="/mt"'))
    const tOn = Date.now(); let onAfter = null
    for (let i = 0; i < 16; i++) { const r = await page('/mt'); if (r.status === 200) { onAfter = { ms: Date.now() - tOn }; break } await wait(5000) }
    t('…and /mt answers 200 again within the proxy\'s 60 seconds', onAfter && onAfter.ms <= 65000, onAfter)

    console.log('\n── 5 · a failed read is never cached (faq_translations failing)')
    // ⚠️ RE-PINNED (cwv-2, 6 November 2026, docs/cwv-2-report.md §4): /de/faq is BUILT AHEAD now. Per request it answered a failed
    // read with "no translations" (404); built ahead, that 404 would be STORED with the page, so a failed read throws instead
    // (lib/marketing-render.ts isBuiltAheadRender). Unannounced, the stored good page keeps answering; right after a revalidation the
    // render fails (500) and nothing is stored. What perf-1 proves is unchanged: the failure is never kept (the check after this one).
    const d0 = await page('/de/faq')
    await standin('/__standin/fail', { table: 'faq_translations', on: true })
    const dA = await page('/de/faq')
    await revalidate(['marketing-faq'])
    const d1 = await page('/de/faq')
    t('while the translations fail: the built-ahead /de/faq keeps its last good page (200) until a revalidation, then fails (500) rather than storing a degraded page', d0.status === 200 && dA.status === 200 && d1.status === 500, [d0.status, dA.status, d1.status])
    await standin('/__standin/fail', { table: 'faq_translations', on: false })
    const d2 = await page('/de/faq')
    t('the moment the table reads again, the VERY NEXT /de/faq shows the German FAQ (the failure was not kept)', d2.status === 200)
  } finally {
    try { process.kill(-srv.pid) } catch { /* gone */ }
  }
  console.log(`\nperf-1-local: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
