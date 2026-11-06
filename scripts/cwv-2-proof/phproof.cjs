// scripts/cwv-2-proof/ — cwv-2 (6 November 2026, docs/cwv-2-report.md §7): THE PROOFS THAT NEED BUILDS. By hand, never swept: two production
// builds (HEAD and this work) in worktrees with no .env file, both against the stand-in database (scripts/_perf-1-standin.cjs), each
// `next start`ed, with hostproxy.cjs in front for the HatchGrab host, the Village Foodie host and the native app user agent.
// Nothing here reads a database, the live site or any .env file (lh-run.cjs reads the live site only when given its address).
// node phproof.cjs <proxyPort> <label> <phlog> — visit as Android Chrome: /uk, a tap, tab hidden; report PostHog's requests and timing.
const puppeteer = require('puppeteer'), fs = require('fs')
const [port, label, LOG, pathArg] = process.argv.slice(2); const P = pathArg || '/uk'
;(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--disable-blink-features=AutomationControlled'] }); const p = await b.newPage()
  await p.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'webdriver', { get: () => false })); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36')
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  const reqs = []; const t0 = Date.now()
  p.on('request', r => { const u = r.url(); if (/54398/.test(u)) reqs.push([Date.now() - t0, 'PH ' + u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]]); else if (/\/_next\/static\/chunks\//.test(u)) reqs.push([Date.now() - t0, u.replace(/^https?:\/\/[^/]+/, '')]) })
  const start = fs.statSync(LOG).size
  await p.goto(`http://hatchgrab.localhost:${port}${P}`, { waitUntil: 'load' })
  const loadAt = Date.now() - t0
  const initial = await p.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.src.replace(/^https?:\/\/[^/]+/, '')))
  await new Promise(r => setTimeout(r, 3000))
  await p.tap('h1').catch(() => {})
  await new Promise(r => setTimeout(r, 6500))
  const other = await b.newPage(); await other.bringToFront(); await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await new Promise(r => setTimeout(r, 3000))
  const lines = fs.readFileSync(LOG, 'utf8').slice(start).split('\n').filter(Boolean).map(l => JSON.parse(l))
  const posthogChunk = reqs.find(([, u]) => /\/_next\/static\/chunks\//.test(u) && !initial.includes(u))
  console.log(JSON.stringify({ label, loadAt, initialScripts: initial.length,
    firstPosthogRequestAt: (reqs.find(([, u]) => /^PH /.test(u)) || [null])[0],
    lateChunks: reqs.filter(([, u]) => /\/_next\/static\/chunks\//.test(u) && !initial.includes(u)).map(([t, u]) => `${t}ms ${u}`),
    sent: lines.map(l => `${l.method} ${l.url.split('?')[0]} ${l.events.map(e => `${e.event}@${e.path}${e.metrics.length ? '[' + e.metrics.join(',') + ']' : ''}`).join(' ')}`) }, null, 1))
  await b.close()
})()
