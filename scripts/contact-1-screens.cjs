#!/usr/bin/env node
// scripts/contact-1-screens.cjs — contact-1 (2 November 2026, docs/contact-1-report.md): HATCHGRAB'S CONTACT FORM IN WEBKIT, against
// the approved layout (docs/contact-1/contact-form-mockup.png). Needs a build (`.next/static`, for landing.css and the real fonts) and
// a local WebKit; app/contact/contact-form.css is added from the source, so an older build is enough.
//   node scripts/contact-1-screens.cjs
// The page is the server render of /contact (?country=GB at 1440, ?country=DE at 430). The form is then MOUNTED LIVE in the browser
// — the real app/contact/HatchGrabContactForm.tsx, bundled for the browser, with the page's own words (contactFormWords) — so the
// field error is the form's own validation and the thank-you box its own answer to POST /api/contact, which is intercepted here
// (nothing is stored, nothing is emailed). Three photographs a page: the form, a field error, the thank-you box →
// docs/contact-1/contact-{uk-1440,de-430}-{form,error,thanks}.png
// Checks: nothing scrolls sideways; name and email side by side on a laptop, stacked on a phone; the orange button; the error under
// its field with aria-invalid and focus; "(optional)" goes when account help is chosen; the request carries the trap field (empty)
// and the signed render time; the thank-you box replaces the form.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'contact-1-screens' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const RF = require('./_real-fonts.cjs')
const { REPO } = kit
const OUT = path.join(REPO, 'docs/contact-1')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

/** The live form, for the browser: React, the form and lib/contact, bundled; mounted in place of the server-rendered <form>. */
async function browserScript() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const r = await esbuild.build({
    stdin: { contents: "import { createElement } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { HatchGrabContactForm } from '@/app/contact/HatchGrabContactForm'\nconst form = document.querySelector('form.cf')\nconst holder = document.createElement('div')\nform.replaceWith(holder)\ncreateRoot(holder).render(createElement(HatchGrabContactForm, window.__CF_PROPS))\nwindow.__CF_MOUNTED = true", resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': REPO }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  })
  return r.outputFiles[0].text
}

;(async () => {
  kit.setNow('2026-11-02T18:30:05Z')
  const ctx = LP1E.context(kit, REPO)
  const M = await ctx.bundle('c1-screens', "export { default } from '@/app/contact/page'\nexport { contactFormWords } from '@/app/contact/HatchGrabContact'\nexport { legalPath } from '@/lib/legal'")
  const ROWS = WF.rowsWith(WF.WORLD)
  const render = cc => kit.quietAsync(() => ctx.withReq({ rows: ROWS }, () => ctx.prerender(kit.h(M.default, { searchParams: Promise.resolve({ country: cc }) }))))
  const bundle = await browserScript()
  const B = RF.built()
  const css = fs.readFileSync(path.join(REPO, 'app/contact/contact-form.css'), 'utf8')
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await webkit.launch()
  fs.mkdirSync(OUT, { recursive: true })
  try {
    for (const { cc, locale, width, name } of [{ cc: 'GB', locale: 'en-GB', width: 1440, name: 'uk-1440' }, { cc: 'DE', locale: 'de-DE', width: 430, name: 'de-430' }]) {
      console.log(`\n── /contact?country=${cc} at ${width} (WebKit)`)
      const html = await render(cc)
      const words = M.contactFormWords(locale)
      const props = { words, initialTopic: 'question', rendered: '1793644195000.' + 'a'.repeat(64), country: cc, locale, privacyHref: M.legalPath('privacy', { country: cc, locale }) }
      const { page, ctx: bctx } = await RF.open(browser, { html, lang: locale, width, height: 900, B, script: `window.__CF_PROPS = ${JSON.stringify(props)};\n${bundle}` })
      const posted = []
      await page.route(`${RF.ORIGIN}/api/contact`, async route => { posted.push(JSON.parse(route.request().postData() || '{}')); await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) })
      await page.addStyleTag({ content: css })
      await page.addStyleTag({ content: 'nav{position:static!important}' })
      await page.waitForFunction(() => window.__CF_MOUNTED === true)
      await page.waitForTimeout(250)
      const shot = async kind => { const f = path.join(OUT, `contact-${name}-${kind}.png`); await page.screenshot({ path: f, fullPage: true }); return f }

      // 1 · the form
      const layout = await page.evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect()
        const btn = getComputedStyle(document.querySelector('.cf-send .btn'))
        return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, name: r('#cf-name'), email: r('#cf-email'), btnBg: btn.backgroundColor, btnColor: btn.color,
          optional: !!document.querySelector('.cf-optional'), heading: [...document.querySelectorAll('.does-item h3')].map(h => h.textContent), select: r('#cf-topic').height }
      })
      t('nothing scrolls sideways', layout.scrollW <= layout.innerW, layout)
      if (width >= 1000) t('laptop: name and email side by side', Math.abs(layout.name.top - layout.email.top) < 1 && layout.email.left > layout.name.right, layout)
      else t('phone: name and email stacked, each the full width', layout.email.top > layout.name.bottom && Math.abs(layout.email.left - layout.name.left) < 1, layout)
      t('the orange button (the landing\'s .btn-primary), white text', layout.btnBg === 'rgb(239, 139, 44)' && layout.btnColor === 'rgb(255, 255, 255)', layout)
      t(`"${words.optional}" beside the truck name while a question is chosen; the heading "${layout.heading[1]}"`, layout.optional && layout.heading.includes(JSON.parse(fs.readFileSync(path.join(REPO, `messages/${locale}.json`), 'utf8')).contactPage.formHeading))
      t('every word on the form is the page\'s language', await page.evaluate(w => document.querySelector('.cf').textContent.includes(w.send) && document.querySelector('.cf').textContent.includes(w.privacyLine), words))
      await shot('form')

      // 2 · a field error — the form's own validation
      if (cc === 'GB') {
        await page.click('.cf-send .btn')
      } else {
        await page.selectOption('#cf-topic', 'account')
        t(`account help: "${words.optional}" goes, the truck name becomes required`, await page.evaluate(() => !document.querySelector('.cf-optional') && document.querySelector('#cf-business').required))
        await page.fill('#cf-name', 'Ana Müller'); await page.fill('#cf-email', 'ana@example.de'); await page.fill('#cf-message', 'Mein Bestellbildschirm lädt seit heute Morgen nicht mehr.')
        await page.click('.cf-send .btn')
      }
      await page.waitForTimeout(150)
      const field = cc === 'GB' ? 'name' : 'business', want = cc === 'GB' ? words.errors.nameRequired : words.errors.businessRequired
      const err = await page.evaluate(f => ({ invalid: document.querySelector(`#cf-${f}`).getAttribute('aria-invalid'), describedBy: document.querySelector(`#cf-${f}`).getAttribute('aria-describedby'),
        text: document.querySelector(`#cf-${f}-error`)?.textContent, focused: document.activeElement?.id, under: (() => { const a = document.querySelector(`#cf-${f}`).getBoundingClientRect(), b = document.querySelector(`#cf-${f}-error`)?.getBoundingClientRect(); return b ? b.top >= a.bottom && b.top - a.bottom < 20 : false })() }), field)
      t(`the error "${want}" sits under its field, aria-invalid, described by it, and the field has focus`, err.invalid === 'true' && err.describedBy === `cf-${field}-error` && err.text === want && err.focused === `cf-${field}` && err.under, err)
      t('nothing was sent while a field was wrong', posted.length === 0)
      await shot('error')

      // 3 · send → the thank-you box
      if (cc === 'GB') { await page.fill('#cf-name', 'Sam Taylor'); await page.fill('#cf-email', 'sam@example.co.uk'); await page.fill('#cf-message', 'Can I use HatchGrab at two markets on the same day?') }
      else await page.fill('#cf-business', 'Pizza Kitchen')
      await page.click('.cf-send .btn')
      await page.waitForSelector('.cf-thanks')
      const done = await page.evaluate(() => ({ form: !!document.querySelector('form.cf'), title: document.querySelector('.cf-thanks-title')?.textContent, body: document.querySelectorAll('.cf-thanks p')[1]?.textContent, focused: document.activeElement?.className }))
      t(`the thank-you box replaces the form: "${words.thanksTitle}" / "${words.thanksBody}"`, !done.form && done.title === words.thanksTitle && done.body === words.thanksBody && done.focused === 'cf-thanks', done)
      const p = posted[0] || {}
      t('one POST to /api/contact, with the fields, the empty trap field and the signed render time, the country and language', posted.length === 1 && p.website === '' && p.rendered === props.rendered && p.country === cc && p.locale === locale && p.topic === (cc === 'GB' ? 'question' : 'account') && typeof p.page === 'string', p)
      await shot('thanks')
      await bctx.close()
    }
  } finally { await browser.close() }
  console.log(`\ncontact-1-screens: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
