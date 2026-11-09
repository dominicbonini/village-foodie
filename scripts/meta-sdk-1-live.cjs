#!/usr/bin/env node
// scripts/meta-sdk-1-live.cjs — meta-sdk-1 (9 November 2026; docs/meta-sdk-1-report.md), BY HAND (it fetches Meta's real SDK from
// connect.facebook.net, so the sweep never runs it — harnesses.json's excluded group). The offline proof is scripts/meta-sdk-1.cjs.
//   node scripts/meta-sdk-1-live.cjs [chromium|webkit]
// Loads Meta's REAL JavaScript SDK twice on a local page and records every request to a Meta host for 8 seconds after FB.init:
//   ours     — the REAL lib/whatsapp/embedded-signup.ts (autoLogAppEvents: false, xfbml: false), then a click on "Set up", which must
//              open Meta's Embedded Signup window from the click
//   control  — the same SDK initialised the OLD way (autoLogAppEvents: true, xfbml: true), to show what automatic logging sends
// A placeholder app id is used (the real one is configuration this script does not read); Meta answers the dialog with its own error page,
// which is enough to prove the window opens. Nothing is logged in, nothing is stored, no truck is touched.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const REPO = path.resolve(__dirname, '..')
const APP_ID = '1234567890123456', VERSION = require('fs').readFileSync(path.join(REPO, 'lib/whatsapp/embedded-signup.ts'), 'utf8').match(/SDK_GRAPH_VERSION = '(v[\d.]+)'/)?.[1] || 'v26.0'
const META = /(^|\.)(facebook\.(com|net)|fbcdn\.net|fb\.com|instagram\.com|meta\.com)$/i

async function bundle() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-meta-sdk-1-live-'))
  const entry = path.join(dir, 'entry.ts')
  fs.writeFileSync(entry, `import { loadFacebookSdk, startEmbeddedSignup } from '@/lib/whatsapp/embedded-signup'
const w = window as any; let FB: any = null
loadFacebookSdk('${APP_ID}').then(f => { FB = f; w.__ready = true }).catch(e => { w.__loadError = String(e) })
document.getElementById('setup')!.addEventListener('click', () => { if (FB) startEmbeddedSignup(FB, { configId: 'config-test-truck' }, { complete() {}, cancelled() {} }) })`)
  return (await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', logLevel: 'error', alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')] })).outputFiles[0].text
}

;(async () => {
  const engine = process.argv[2] || 'chromium'
  const ours = await bundle()
  const control = `window.fbAsyncInit = () => { FB.init({ appId: '${APP_ID}', autoLogAppEvents: true, xfbml: true, version: '${VERSION}' }); window.__ready = true };
const s = document.createElement('script'); s.src = 'https://connect.facebook.net/en_US/sdk.js'; s.async = true; s.crossOrigin = 'anonymous'; document.body.appendChild(s)`
  const page = js => `<!doctype html><html><body><button id="setup">Set up WhatsApp</button><script>${js}</script></body></html>`
  const srv = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end(page(q.url.startsWith('/control') ? control : ours)) })
  await new Promise(r => srv.listen(0, '127.0.0.1', r))
  const base = `http://localhost:${srv.address().port}`
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await pw[engine].launch()
  const out = {}
  try {
    for (const mode of ['ours', 'control']) {
      const ctx = await browser.newContext()
      const reqs = []
      ctx.on('request', r => { const u = new URL(r.url()); if (META.test(u.hostname)) reqs.push(`${r.method()} ${u.hostname}${u.pathname}`) })
      const p = await ctx.newPage()
      await p.goto(`${base}/${mode}`)
      await p.waitForFunction(() => window.__ready || window.__loadError, null, { timeout: 30000 }).catch(() => {})
      await p.waitForTimeout(8000)
      out[mode] = { beforeClick: [...reqs], loadError: await p.evaluate(() => window.__loadError || null) }
      if (mode === 'ours') {
        const popup = await Promise.all([p.waitForEvent('popup', { timeout: 15000 }), p.click('#setup')]).then(([w]) => w).catch(e => ({ error: e.message }))
        out.ours.popup = popup.error ? { error: popup.error } : { url: popup.url().slice(0, 160) }
        await p.waitForTimeout(3000)
        out.ours.afterClick = reqs.slice(out.ours.beforeClick.length)
      }
      await ctx.close()
    }
  } finally { await browser.close(); srv.close() }
  console.log(JSON.stringify(out, null, 1))
  const extra = out.ours.beforeClick.filter(r => !/connect\.facebook\.net\/en_US\/(sdk\.js|bundle\/sdk\.js\/?|sdk\/xfbml)/.test(r) && !/connect\.facebook\.net\/signals|static\.xx\.fbcdn/.test(r))
  console.log(`\nours, before the click: ${out.ours.beforeClick.length} Meta request(s); beyond the SDK's own files: ${extra.length ? extra.join(', ') : 'none'}`)
  console.log(`control, before the click: ${out.control.beforeClick.length} Meta request(s)`)
  console.log(`the click opened: ${out.ours.popup.url || out.ours.popup.error}`)
})().catch(e => { console.error(e); process.exit(1) })
