// scripts/cwv-2-proof/ — cwv-2 (6 November 2026, docs/cwv-2-report.md §7): THE PROOFS THAT NEED BUILDS. By hand, never swept: two production
// builds (HEAD and this work) in worktrees with no .env file, both against the stand-in database (scripts/_perf-1-standin.cjs), each
// `next start`ed, with hostproxy.cjs in front for the HatchGrab host, the Village Foodie host and the native app user agent.
// Nothing here reads a database, the live site or any .env file (lh-run.cjs reads the live site only when given its address).
// node capture.cjs <worktree> <port> <outdir> — starts `next start` in <worktree>, fetches every URL (host-aware), twice, saves bodies + status.
const { spawn } = require('child_process'); const http = require('http'); const fs = require('fs'); const path = require('path')
const [dir, port, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true })
const HG = 'www.hatchgrab.com', VF = 'www.villagefoodie.co.uk'
const countries = ['uk','us','ie','au','nz','ca','fr','at','be','bg','hr','cy','cz','dk','ee','fi','de','gi','gr','hu','it','lv','li','lt','lu','mt','nl','no','pl','pt','ro','sk','si','es','se','ch','br','mx','jp','sg','hk','my','th','ae']
const URLS = []
const add = (host, p, ua) => URLS.push({ host, p, ua })
for (const p of ['/manage', '/manage/cwv2-fixture-token-000000000000', '/dashboard', '/dashboard/demo-cwv2fixture', '/dashboard/demo-cwv2fixture/kds', '/kds/cwv2-fixture-kds',
  '/admin', '/setup', '/signup', '/login', '/forgot-password', '/reset-password', '/verify-email', '/try/cwv2-fixture-truck', '/o/cwv2-fixture-truck',
  '/order/cwv2-fixture-truck', '/trucks/cwv2-fixture-truck/order', '/order/00000000-0000-4000-8000-00000000c2a1/manage', '/p/cwv2-fixture-token', '/app', '/domain',
  '/privacy', '/terms', '/country-terms', '/contact', '/fr/privacy', '/de/terms', '/jp/country-terms', '/a/b', '/zz', '/zz/faq', '/zz/features', '/zz/x/y', '/de/foo/bar', '/no-such/page/at/all',
  '/robots.txt', '/sitemap.xml', '/llms.txt', '/about', '/landing', '/1ng7n4p5omux2gdk9kqvwz', '/uk/compare', '/de/compare', '/uk/comparison/food-truck-ordering-system', '/de/vergleich/foodtruck-bestellsystem'])
  add(HG, p)
for (const c of countries) { add(HG, '/' + c); add(HG, '/' + c + '/features'); add(HG, '/' + c + '/faq') }
for (const p of ['/', '/trucks', '/hire', '/contact', '/privacy', '/terms', '/country-terms', '/uk', '/uk/faq', '/uk/features', '/zz', '/a/b', '/trucks/cwv2-fixture-truck', '/venues/cwv2-fixture-venue']) add(VF, p)
for (const p of ['/privacy', '/terms', '/country-terms', '/fr/privacy']) add(HG, p, 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 HatchGrabNativeApp')
const get = (u) => new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port, path: u.p, headers: { host: u.host, 'x-vercel-ip-country': 'GB', 'x-forwarded-for': '127.0.0.1', ...(u.ua ? { 'user-agent': u.ua } : {}) } }, x => {
  let b = ''; x.setEncoding('utf8'); x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, location: x.headers.location || '', cache: x.headers['cache-control'] || '', body: b })) }); r.on('error', rej); r.end() })
;(async () => {
  const srv = spawn('npx', ['next', 'start', '-p', port], { cwd: dir, env: process.env, stdio: 'ignore', detached: true })
  try {
    for (;;) { try { await get({ host: HG, p: '/robots.txt' }); break } catch { await new Promise(r => setTimeout(r, 300)) } }
    const index = []
    for (const pass of [1, 2]) for (const u of URLS) {
      const r = await get(u); const key = `${u.host === HG ? 'hg' : 'vf'}${u.ua ? '-app' : ''}${u.p.replace(/[^a-z0-9]+/gi, '_')}`
      fs.writeFileSync(path.join(out, `${key}.${pass}.html`), r.body)
      if (pass === 2) index.push({ key, host: u.host, p: u.p, app: !!u.ua, status: r.status, location: r.location, cache: r.cache })
    }
    fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1)); console.log('captured', index.length)
  } finally { process.kill(-srv.pid) }
})()
