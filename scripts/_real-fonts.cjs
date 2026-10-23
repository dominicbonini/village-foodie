// scripts/_real-fonts.cjs — A RENDERED VIEW WITH THE REAL BUILT FONTS (europe-languages-2, 23 October 2026,
// docs/europe-languages-2-report.md §5). A MODULE for the screenshot harnesses: `page.setContent()` has no origin, so the built
// CSS's `url(/_next/static/media/…)` fonts never load and a screenshot shows the system fallback — fine for layout, useless
// for "does Greek / Cyrillic actually draw in our font". This serves the view from a fake origin instead: the page HTML and
// `.next/static/**` (the real CSS chunks and woff2 files of `npm run build`), and wraps the view in the body classes the root
// layout gives it (app/layout.tsx: Geist's variable always; the Greek/Cyrillic fallback's only on an el / bg page).
// Nothing is fetched from the network; every font request is recorded, so a harness can prove which files a page loaded.
'use strict'
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const ORIGIN = 'http://hatchgrab.local'
const STATIC = path.join(REPO, '.next/static')

/** The built CSS chunks, their text, and the next/font variable classes and @font-face blocks in them. */
function built() {
  const dir = path.join(STATIC, 'chunks')
  if (!fs.existsSync(dir)) throw new Error('no .next/static — run `npm run build` first')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.css'))
  const css = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
  const classOf = v => (new RegExp(`\\.([A-Za-z0-9_-]+)\\{--${v}:([^;}]+)`).exec(css) || [])
  const [, geistClass] = classOf('font-geist-sans')
  const [, monoClass] = classOf('font-geist-mono')
  const [, scriptClass, scriptStack] = classOf('font-script-fallback')
  const scriptFamily = scriptStack ? scriptStack.split(',')[0].trim().replace(/^['"]|['"]$/g, '') : null
  // Every @font-face: its family, its file and its unicode-range.
  const faces = [...css.matchAll(/@font-face\{([^}]*)\}/g)].map(m => {
    const b = m[1]
    return { family: (/font-family:([^;]+)/.exec(b) || [])[1]?.trim().replace(/^['"]|['"]$/g, ''), src: (/url\(([^)]+)\)/.exec(b) || [])[1]?.replace(/^['"]|['"]$/g, ''), range: (/unicode-range:([^;}]+)/.exec(b) || [])[1]?.trim() ?? '' }
  })
  // Every next/font variable class by its variable (--font-archivo → the class that defines it), for swapping the render
  // kit's stand-in classes ("font-Archivo") for the real ones.
  const varClass = Object.fromEntries([...css.matchAll(/\.([A-Za-z0-9_-]+)\{(--font-[a-z-]+):/g)].map(m => [m[2], m[1]]))
  return { files, css, geistClass, monoClass, scriptClass, scriptFamily, faces, varClass }
}

const NEEDS_SCRIPT_FALLBACK = /^(el|bg)(-|$)/i

/** Open `html` (a view's markup) at `width` in `browser`, as the root layout would wrap it for `lang`, with the real fonts.
 *  Returns { page, fonts } — `fonts`: every font file the page requested (paths under /_next/static/media). */
async function open(browser, { html, lang, width = 390, height = 900, B = built() }) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  const fonts = []
  await page.route('**/*', async route => {
    const u = new URL(route.request().url())
    if (u.origin !== ORIGIN) return route.abort()
    if (u.pathname === '/view') {
      // The render kit stubs next/font: a page's wrapper carries "font-Archivo" where the build has the Archivo variable class.
      html = html.replace(/\bfont-([A-Z][A-Za-z]*(?:_[A-Z][A-Za-z]*)*)\b/g, (m, X) => B.varClass[`--font-${X.toLowerCase().replace(/_/g, '-')}`] ?? m)
      const body = [B.geistClass, B.monoClass, NEEDS_SCRIPT_FALLBACK.test(lang) ? B.scriptClass : null, 'antialiased'].filter(Boolean).join(' ')
      const links = B.files.map(f => `<link rel="stylesheet" href="/_next/static/chunks/${f}">`).join('')
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${links}<style>body{background:#fff;margin:0}</style></head><body class="${body}">${html}</body></html>` })
    }
    if (u.pathname.startsWith('/_next/static/')) {
      const file = path.join(STATIC, decodeURIComponent(u.pathname.slice('/_next/static/'.length)))
      if (!file.startsWith(STATIC) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' })
      if (/\.(woff2?|ttf|otf)$/.test(file)) fonts.push(u.pathname)
      const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'
      return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) })
    }
    return route.fulfill({ status: 404, body: '' })
  })
  await page.goto(`${ORIGIN}/view`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  return { page, ctx, fonts }
}

module.exports = { built, open, NEEDS_SCRIPT_FALLBACK, ORIGIN }
