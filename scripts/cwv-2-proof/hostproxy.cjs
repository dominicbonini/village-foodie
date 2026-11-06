// scripts/cwv-2-proof/ — cwv-2 (6 November 2026, docs/cwv-2-report.md §7): THE PROOFS THAT NEED BUILDS. By hand, never swept: two production
// builds (HEAD and this work) in worktrees with no .env file, both against the stand-in database (scripts/_perf-1-standin.cjs), each
// `next start`ed, with hostproxy.cjs in front for the HatchGrab host, the Village Foodie host and the native app user agent.
// Nothing here reads a database, the live site or any .env file (lh-run.cjs reads the live site only when given its address).
// node hostproxy.cjs <listen> <target> <host> [ua] — forwards to 127.0.0.1:<target> with Host: <host> (and an optional user agent).
const http = require('http'); const [listen, target, host, ua] = process.argv.slice(2)
http.createServer((req, res) => {
  const headers = { ...req.headers, host, 'x-vercel-ip-country': 'GB', 'x-forwarded-for': '127.0.0.1' }; if (ua) headers['user-agent'] = ua
  const p = http.request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers }, r => {
    const h = { ...r.headers }; if (h.location) h.location = h.location.replace(/^https?:\/\/[^/]+/, '')
    res.writeHead(r.statusCode, h); r.pipe(res) })
  p.on('error', e => { res.writeHead(502); res.end(String(e)) }); req.pipe(p)
}).listen(+listen, '127.0.0.1')
