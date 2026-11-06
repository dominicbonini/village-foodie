// scripts/cwv-2-proof/ — cwv-2 (6 November 2026, docs/cwv-2-report.md §7): THE PROOFS THAT NEED BUILDS. By hand, never swept.
// node demoproof.cjs <proxyPort> <label> — the landing's demo funnel: hero button → pop-up → test email → sample menu → the request it
// sends (intercepted and answered here, so nothing reaches /api/demo or the database). Reports when the pop-up's code loaded and what
// was sent. public.demo_events is written by /api/demo on the server (lib/demo-events.ts), which cwv-2 did not touch (cwv-2.cjs §4).
const puppeteer = require('puppeteer')
const [port, label] = process.argv.slice(2)
;(async () => {
  const b = await puppeteer.launch({ headless: 'new' }); const p = await b.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await p.setRequestInterception(true)
  const sent = [], t0 = Date.now(), js = []
  p.on('request', r => {
    const u = r.url()
    if (/\/_next\/static\/chunks\/.*\.js/.test(u)) js.push([Date.now() - t0, u.split('/').pop()])
    if (/\/api\/demo/.test(u)) {
      const body = r.postData() || ''
      sent.push({ method: r.method(), path: new URL(u).pathname, fields: [...body.matchAll(/name="([^"]+)"/g)].map(m => m[1]) })
      return r.respond({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'cwv2_test', error: 'stubbed by the cwv-2 proof' }) })
    }
    r.continue()
  })
  await p.goto(`http://127.0.0.1:${port}/uk`, { waitUntil: 'networkidle0' })
  const loaded = Date.now() - t0
  await p.click('#hero-cta')
  await p.waitForSelector('[data-demo-email] input', { timeout: 15000 })
  const openAt = Date.now() - t0
  await p.type('[data-demo-email] input', 'cwv2-proof@example.com')
  for (const h of await p.$$('button')) { const tx = await h.evaluate(n => n.textContent || ''); if (/sample menu/i.test(tx)) { await h.click(); break } }
  await new Promise(r => setTimeout(r, 2500))
  console.log(JSON.stringify({ label, loadedAt: loaded, modalOpenAt: openAt, sent, jsAfterLoad: js.filter(([t]) => t > loaded).map(([t, f]) => `${t}ms ${f}`) }))
  await b.close()
})().catch(e => { console.log(JSON.stringify({ label, error: String(e) })); process.exit(1) })
