// scripts/cwv-2-proof/ — cwv-2 (6 November 2026, docs/cwv-2-report.md §7): THE PROOFS THAT NEED BUILDS. By hand, never swept: two production
// builds (HEAD and this work) in worktrees with no .env file, both against the stand-in database (scripts/_perf-1-standin.cjs), each
// `next start`ed, with hostproxy.cjs in front for the HatchGrab host, the Village Foodie host and the native app user agent.
// Nothing here reads a database, the live site or any .env file (lh-run.cjs reads the live site only when given its address).
// A stand-in PostHog on 127.0.0.1:54398: answers every request on the machine and records it (nothing leaves the machine).
const http = require('http'), zlib = require('zlib'), fs = require('fs')
const LOG = process.argv[2]
http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    const buf = Buffer.concat(chunks); let body = ''
    try { body = zlib.gunzipSync(buf).toString() } catch { body = buf.toString() }
    if (/^data=/.test(body)) { try { body = Buffer.from(decodeURIComponent(body.slice(5)), 'base64').toString() } catch {} }
    let events = []
    try { const j = JSON.parse(body); events = (Array.isArray(j) ? j : j.batch || [j]).map(e => ({ event: e.event, path: e.properties && e.properties.$pathname, metrics: Object.keys(e.properties || {}).filter(k => /^\$web_vitals_/.test(k)) })) } catch {}
    fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), method: req.method, url: req.url, events }) + '\n')
    res.writeHead(200, { 'content-type': req.url.includes('.js') ? 'application/javascript' : 'application/json', 'access-control-allow-origin': req.headers.origin || '*', 'access-control-allow-credentials': 'true' })
    res.end(req.url.includes('web-vitals') ? fs.readFileSync(require.resolve('posthog-js/dist/web-vitals.js')) : req.url.includes('.js') ? '' : '{}')
  })
}).listen(54398, '127.0.0.1')
