// Shared bits for the three US landing screenshots (see README.md in this folder).
const fs = require('fs'); const path = require('path'); const http = require('http')
const REPO = path.resolve(__dirname, '../..')

/** The work dir (argv[2]) for the intermediates, and the output dir (argv[3]) for a frame step's final image. */
function dirs() {
  const [work, out] = process.argv.slice(2)
  if (!work) { console.error(`usage: node ${path.relative(REPO, process.argv[1])} <workDir> [outDir]  (or run us-screens.cjs)`); process.exit(2) }
  fs.mkdirSync(work, { recursive: true })
  if (out) { assertNotPublic(out); fs.mkdirSync(out, { recursive: true }) }
  return { WORK: path.resolve(work), OUT: out && path.resolve(out) }
}

/** These scripts never write into public/: a replacement image is copied in by hand. */
function assertNotPublic(dir) {
  const rel = path.relative(path.join(REPO, 'public'), path.resolve(dir))
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) { console.error(`refusing to write into public/ (${dir}) — render elsewhere and copy the image in yourself`); process.exit(2) }
}

/** Every compiled CSS file of the last `next build` (.next/static). */
function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('.next/static is missing — run `npx next build` first (the pages are painted with the compiled CSS)')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.css')) files.push(f) } }
  walk(root)
  return files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
}

/** The <body> classes that switch on the app's next/font faces (Geist, Geist Mono), read from the compiled CSS. */
function fontClasses(css) {
  const sans = (css.match(/\.(geist_[0-9a-f]+-module__[A-Za-z0-9_-]+__variable)\b/) || [])[1] || 'geist_a71539c9-module__T19VSG__variable'
  const mono = (css.match(/\.(geist_mono_[0-9a-f]+-module__[A-Za-z0-9_-]+__variable)\b/) || [])[1] || 'geist_mono_8d43a2aa-module__8Li5zG__variable'
  return `${sans} ${mono} antialiased`
}

/** Serve `html` at /, and public/ files for every other path — on 127.0.0.1 only (no network). The compiled
 *  CSS references /_next/static/media/*.woff2 for the fonts; those come from .next/static. */
function serve(html) {
  const types = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.css': 'text/css', '.woff2': 'font/woff2' }
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (u === '/' || u === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html()) }
    let f = path.join(REPO, 'public', u)
    if (u.startsWith('/_next/static/')) f = path.join(REPO, '.next/static', u.slice('/_next/static/'.length))
    if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': types[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
  })
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() })))
}

module.exports = { REPO, dirs, assertNotPublic, appCss, fontClasses, serve }
