#!/usr/bin/env node
// scripts/meta-sdk-1.cjs — meta-sdk-1 (9 November 2026; docs/meta-sdk-1-report.md): Meta's JavaScript SDK sends NO automatic app events, and
// the WhatsApp Embedded Signup pop-up still opens from the operator's click. No network: Meta's script is answered by a local stand-in.
//   1 · the source: lib/whatsapp/embedded-signup.ts calls FB.init with autoLogAppEvents: false and xfbml: false; it is the ONLY browser code
//       that loads anything from Meta (no Meta Pixel / fbevents.js / fbq / facebook.com/tr, no <fb:…> XFBML markup anywhere in app/,
//       components/, lib/ or public/); the manage page's WhatsApp setup control still loads the SDK on mount and calls
//       startEmbeddedSignup synchronously in its click (unchanged — meta-sdk-1 does not touch that file)
//   2 · the behaviour, in Chromium AND WebKit: the REAL lib/whatsapp/embedded-signup.ts (bundled for the browser) on a page that makes the
//       manage page's two calls — loadFacebookSdk on mount, startEmbeddedSignup on the click — for a fixture test truck. Every request to a
//       Meta host is recorded. Proves: the only Meta request before the click is the SDK script itself; FB.init receives autoLogAppEvents
//       false and xfbml false; no request to any other Meta endpoint (graph.facebook.com, facebook.com/tr, …) follows; and the click opens
//       the Embedded Signup window (Meta's OAuth dialog with the config id and the v4 extras) WHILE the click's user activation is live
//       (what Safari requires).
// The real SDK, over the network, is exercised by hand: scripts/meta-sdk-1-live.cjs.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

const META_HOST = /(^|\.)(facebook\.(com|net)|fbcdn\.net|fb\.com|facebook\.net|instagram\.com|meta\.com)$/i

/** Meta's SDK, stood in: records FB.init's options, and FB.login opens Meta's dialog with window.open synchronously (as the real SDK does). */
const STAND_IN_SDK = `(() => {
  const FB = {
    init(o) { window.__fbInit = JSON.parse(JSON.stringify(o)) },
    login(cb, opts) {
      const q = new URLSearchParams({ config_id: opts.config_id, response_type: opts.response_type, extras: JSON.stringify(opts.extras || {}) })
      window.__loginActivation = navigator.userActivation ? navigator.userActivation.isActive : 'unsupported'
      window.__popup = window.open('https://www.facebook.com/v26.0/dialog/oauth?' + q, 'es_popup', 'width=600,height=700')
      window.__loginCb = cb
    },
  }
  window.FB = FB
  setTimeout(() => window.fbAsyncInit && window.fbAsyncInit(), 0)
})()`

async function bundle() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-meta-sdk-1-'))
  const entry = path.join(dir, 'entry.ts')
  // The manage page's two calls, in its order (app/(app)/manage/[token]/page.tsx WhatsAppSetupControl): load on mount; on the click, NO
  // await — one ref read, then startEmbeddedSignup.
  fs.writeFileSync(entry, `import { loadFacebookSdk, startEmbeddedSignup } from '@/lib/whatsapp/embedded-signup'
const w = window as any
let FB: any = null
w.__ready = false
loadFacebookSdk('1234567890123456').then(f => { FB = f; w.__ready = true }).catch(e => { w.__loadError = String(e) })
document.getElementById('setup')!.addEventListener('click', () => {
  if (!FB) return
  startEmbeddedSignup(FB, { configId: 'config-test-truck' }, { complete: () => { w.__outcome = 'complete' }, cancelled: o => { w.__outcome = o.kind } })
})`)
  const r = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')] })
  return r.outputFiles[0].text
}

;(async () => {
  console.log('── 1 · the source')
  const lib = read('lib/whatsapp/embedded-signup.ts')
  const init = /window\.FB!\.init\(\{([\s\S]*?)\}\)/.exec(lib)?.[1] ?? ''
  t('FB.init is called with autoLogAppEvents: false and xfbml: false', /autoLogAppEvents:\s*false/.test(init) && /xfbml:\s*false/.test(init) && !/:\s*true/.test(init), init.replace(/\s+/g, ' '))
  const files = execFileSync('git', ['ls-files', 'app', 'components', 'lib', 'public'], { cwd: REPO }).toString().split('\n').filter(f => /\.(tsx?|jsx?|html|mjs|cjs)$/.test(f))
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const loads = files.filter(f => /connect\.facebook\.net|fbevents\.js|\bfbq\(|facebook\.com\/tr\b/.test(strip(read(f))))
  t('the only browser code that loads anything from Meta is lib/whatsapp/embedded-signup.ts (no Meta Pixel, fbevents.js, fbq or facebook.com/tr)', JSON.stringify(loads) === JSON.stringify(['lib/whatsapp/embedded-signup.ts']), loads)
  const xfbml = files.filter(f => /<fb:|class(Name)?="fb-/.test(strip(read(f))))   // comments excluded (embedded-signup.ts names <fb:…> in one)
  t('no XFBML markup (<fb:…>, fb-* plugin classes) anywhere — so xfbml: false loses nothing', !xfbml.length, xfbml)
  const graphInBrowser = files.filter(f => /graph\.facebook\.com/.test(strip(read(f))) && /^['"]use client['"]/.test(read(f).trimStart()))
  t('graph.facebook.com is called only from server code (no client component calls it)', !graphInBrowser.length, graphInBrowser)
  const page = read('app/(app)/manage/[token]/page.tsx')
  t('the manage page still loads the SDK on mount and calls startEmbeddedSignup synchronously in the click (unchanged by meta-sdk-1)',
    /useEffect\(\(\) => \{[\s\S]{0,400}loadFacebookSdk\(appId\)/.test(page) && /const onClick = \(\) => \{\s*const FB = fbRef\.current[\s\S]{0,400}startEmbeddedSignup\(FB, \{ configId \}/.test(page))

  console.log('\n── 2 · the behaviour (Chromium and WebKit, a fixture test truck)')
  const js = await bundle()
  const html = '<!doctype html><html><body><h1>Manage › Settings › WhatsApp (fixture test truck)</h1><button id="setup">Set up WhatsApp</button><script src="/app.js"></script></body></html>'
  const srv = http.createServer((q, s) => { if (q.url === '/app.js') { s.writeHead(200, { 'content-type': 'text/javascript' }); return s.end(js) } s.writeHead(200, { 'content-type': 'text/html' }); s.end(html) })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${srv.address().port}/`
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await pw[engine].launch()
      try {
        const ctx = await browser.newContext()
        const meta = []
        await ctx.route('**/*', async route => {
          const u = new URL(route.request().url())
          if (u.hostname === '127.0.0.1') return route.continue()
          if (META_HOST.test(u.hostname)) meta.push(`${u.hostname}${u.pathname}`)
          if (u.href === 'https://connect.facebook.net/en_US/sdk.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: STAND_IN_SDK })
          if (u.hostname === 'www.facebook.com' && u.pathname.includes('/dialog/oauth')) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Embedded Signup (stand-in)</title>' })
          return route.abort()   // nothing leaves the machine
        })
        const page = await ctx.newPage()
        await page.goto(url)
        await page.waitForFunction(() => window.__ready === true || window.__loadError, null, { timeout: 10000 })
        await page.waitForTimeout(1500)   // time for any automatic logging to fire
        const before = [...meta]
        const fbInit = await page.evaluate(() => window.__fbInit)
        t(`${engine}: before the click the only Meta request is the SDK script itself`, JSON.stringify(before) === JSON.stringify(['connect.facebook.net/en_US/sdk.js']), before)
        t(`${engine}: FB.init received autoLogAppEvents: false, xfbml: false (and the app id and Graph version)`, fbInit && fbInit.autoLogAppEvents === false && fbInit.xfbml === false && fbInit.appId === '1234567890123456' && /^v\d+\.\d+$/.test(fbInit.version), fbInit)
        const [popup] = await Promise.all([page.waitForEvent('popup', { timeout: 10000 }), page.click('#setup')])
        await popup.waitForLoadState().catch(() => {})
        const pu = new URL(popup.url())
        const extras = JSON.parse(pu.searchParams.get('extras') || '{}')
        t(`${engine}: the click opens the Embedded Signup window — Meta's OAuth dialog with the config id, response_type=code and the v4 extras`, pu.hostname === 'www.facebook.com' && pu.pathname.includes('/dialog/oauth') && pu.searchParams.get('config_id') === 'config-test-truck' && pu.searchParams.get('response_type') === 'code' && extras.version === 'v4', popup.url())
        const act = await page.evaluate(() => window.__loginActivation)
        t(`${engine}: FB.login runs while the click's user activation is live (what lets Safari open the window)`, act === true || act === 'unsupported', act)
        const after = meta.filter(m => !/^connect\.facebook\.net\/en_US\/sdk\.js$|^www\.facebook\.com\/v[\d.]+\/dialog\/oauth$/.test(m))
        t(`${engine}: no request to any other Meta endpoint (graph.facebook.com, facebook.com/tr, …) before or after the click`, !after.length, after)
      } finally { await browser.close() }
    }
  } finally { srv.close() }

  console.log(`\n${fail ? '🔴' : '✅'} meta-sdk-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
