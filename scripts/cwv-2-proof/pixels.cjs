// scripts/cwv-2-proof/ — cwv-2 (6 November 2026, docs/cwv-2-report.md §7): THE PROOFS THAT NEED BUILDS. By hand, never swept: two production
// builds (HEAD and this work) in worktrees with no .env file, both against the stand-in database (scripts/_perf-1-standin.cjs), each
// `next start`ed, with hostproxy.cjs in front for the HatchGrab host, the Village Foodie host and the native app user agent.
// Nothing here reads a database, the live site or any .env file (lh-run.cjs reads the live site only when given its address).
// node pixels.cjs <outdir> <beforeBase> <afterBase> — full-page screenshots of every listed page at 390 and 1280 in both builds, compared
// pixel for pixel (sharp → raw RGBA). Ports: base+0 HatchGrab host, +100 Village Foodie host, +200 the native app's user agent.
const puppeteer = require('puppeteer')
const sharp = require('sharp')
const fs = require('fs'), path = require('path')
const [out, B, A] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true })
const C = ['uk','us','ie','au','nz','ca','fr','at','be','bg','hr','cy','cz','dk','ee','fi','de','gi','gr','hu','it','lv','li','lt','lu','mt','nl','no','pl','pt','ro','sk','si','es','se','ch','br','mx','jp','sg','hk','my','th','ae']
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null
const PAGES = [...C.map(c => ['hg', '/' + c]), ...C.map(c => ['hg', `/${c}/features`]), ...C.map(c => ['hg', `/${c}/faq`]),
  ['hg', '/about'], ['hg', '/uk/compare'], ['hg', '/uk/comparison/food-truck-ordering-system'], ['hg', '/contact'], ['hg', '/privacy'], ['hg', '/terms'], ['hg', '/country-terms'], ['hg', '/fr/privacy'],
  ['hg', '/a/b'], ['hg', '/zz'], ['hg', '/zz/faq'], ['hg', '/de/foo/bar'],
  ['vf', '/contact'], ['vf', '/privacy'], ['vf', '/terms'], ['vf', '/country-terms'], ['vf', '/uk'], ['vf', '/uk/faq'], ['vf', '/a/b'], ['vf', '/'],
  ['app', '/privacy'], ['app', '/terms'], ['app', '/country-terms'], ['app', '/fr/privacy']].filter(([h, p]) => !only || only.test(h + p))
const off = { hg: 0, vf: 100, app: 200 }
async function shot(b, base, host, p, w) {
  const page = await b.newPage()
  await page.setViewport({ width: w, height: w < 500 ? 844 : 800, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  const r = await page.goto(`http://127.0.0.1:${+base + off[host]}${p}`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) } window.scrollTo(0, 0) })
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 30000 }).catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await new Promise(r => setTimeout(r, 300))
  const png = await page.screenshot({ fullPage: true })
  const info = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, lang: document.documentElement.lang, dir: document.documentElement.dir, brand: document.documentElement.dataset.brand }))
  await page.close()
  return { png, status: r.status(), info }
}
;(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000 })
  const rows = []
  const J = path.join(out, 'rows.jsonl'); const done = new Map((fs.existsSync(J) ? fs.readFileSync(J, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []).map(r => [r.name, r]))
  for (const [host, p] of PAGES) for (const w of [390, 1280]) {
    const name = `${host}${p.replace(/\//g, '_')}-${w}`
    if (done.has(name)) { rows.push(done.get(name)); continue }
    const retry = async f => { try { return await f() } catch { return await f() } }
    const x = await retry(() => shot(b, B, host, p, w)), y = await retry(() => shot(b, A, host, p, w))
    const [ra, rb] = await Promise.all([x.png, y.png].map(buf => sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })))
    let diff = -1
    if (ra.info.width === rb.info.width && ra.info.height === rb.info.height) { diff = 0; for (let i = 0; i < ra.data.length; i += 4) if (ra.data[i] !== rb.data[i] || ra.data[i + 1] !== rb.data[i + 1] || ra.data[i + 2] !== rb.data[i + 2]) diff++ }
    const row = { name, status: [x.status, y.status], size: [`${ra.info.width}x${ra.info.height}`, `${rb.info.width}x${rb.info.height}`], diffPixels: diff, before: x.info, after: y.info }
    rows.push(row); fs.appendFileSync(J, JSON.stringify(row) + '\n')
    if (diff !== 0) { fs.writeFileSync(path.join(out, name + '-before.png'), x.png); fs.writeFileSync(path.join(out, name + '-after.png'), y.png) }
    console.log((diff === 0 ? 'SAME ' : 'DIFF ') + name, row.status.join('/'), row.size.join(' → '), diff, JSON.stringify(x.info) === JSON.stringify(y.info) ? '' : JSON.stringify([x.info, y.info]))
  }
  fs.writeFileSync(path.join(out, 'pixels.json'), JSON.stringify(rows, null, 1))
  console.log('identical', rows.filter(r => r.diffPixels === 0).length, 'of', rows.length)
  await b.close()
})()
