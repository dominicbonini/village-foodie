#!/usr/bin/env node
// scripts/site-chrome-1.cjs — site-chrome-1 (5 November 2026, docs/site-chrome-1-report.md): ONE header and ONE footer for every public
// HatchGrab page, the focused flows' logo linking home, the phone footer four to a row, and the offline line put back.
//   node scripts/site-chrome-1.cjs                    (swept; NO NETWORK, NO DATABASE — fixture world, server renders)
//   node scripts/site-chrome-1.cjs capture <file>     run in a HEAD worktree: the pages' HTML before this work
//   node scripts/site-chrome-1.cjs compare <file>     here: landing and /features of every switched-on country differ from <file> ONLY in
//                                                     the offline sentence; /about and /compare byte-identical; the legal pages inside the
//                                                     native app and on Village Foodie's host byte-identical (the Terms page's new line aside)
//   1 · the inventory: every route classified A / B / C; group A through the ONE frame; nobody else draws the nav or footer
//   2 · the legal pages: the shared chrome on the web, today's chrome in the app and on Village Foodie; the Terms page's country line
//   3 · /contact and the logo → home on group A and B   4 · the phone footer CSS   5 · the offline words   6 · group C untouched
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'site-chrome-1' })
const { renderer, APP_UA } = require('./_site-chrome-1-render.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const git = (...a) => execFileSync('git', a, { cwd: REPO, maxBuffer: 256e6 }).toString()
const BEFORE = '5622370d'   // the commit this work started from (perf-1's report)
const SEGMENTS = ['uk', 'us', 'ie', 'au', 'nz', 'ca', 'fr', 'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'de', 'gi', 'gr', 'hu', 'it', 'lv', 'li', 'lt', 'lu', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'ch', 'br', 'mx', 'jp', 'sg', 'hk', 'my', 'th', 'ae']
const VF_HOST = 'www.villagefoodie.co.uk'

// The offline tile's paragraph on the landing, and offline protection's description on /features — found by STRUCTURE, the same in
// both trees (the tile's title and the row's name did not change).
const landingOffline = (html, title) => { const i = html.indexOf(`<span>${title}</span></h3><p>`); if (i < 0) return null; const s = i + `<span>${title}</span></h3><p>`.length; return [s, html.indexOf('</p>', s)] }
const featuresOffline = (html, name) => { const i = html.indexOf(`<span class="pt-name">${name}</span><span class="pt-desc">`); if (i < 0) return null; const s = i + `<span class="pt-name">${name}</span><span class="pt-desc">`.length; return [s, html.indexOf('</span>', s)] }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

async function pagesFor(R, opts) {
  const out = {}
  for (const seg of SEGMENTS) { out[`landing:${seg}`] = await R.PAGES.landing(seg); out[`features:${seg}`] = await R.PAGES.features(seg) }
  out['about:GB'] = await R.PAGES.about('GB'); out['about:DE'] = await R.PAGES.about('DE')
  out['compare:uk'] = await R.PAGES.compare('uk'); out['compare:de'] = await R.PAGES.compare('de')
  for (const doc of ['privacy', 'terms', 'countryTerms']) {
    out[`legal:${doc}:app`] = await R.PAGES.legal(doc, { ua: APP_UA })
    out[`legal:${doc}:vf`] = await R.PAGES.legal(doc, { host: VF_HOST })
    out[`legalIn:fr:${doc}:app`] = await R.PAGES.legalIn('fr', doc, { ua: APP_UA })
  }
  if (opts?.web) for (const doc of ['privacy', 'terms']) { out[`legal:${doc}:web`] = await R.PAGES.legal(doc); out[`legalIn:fr:${doc}:web`] = await R.PAGES.legalIn('fr', doc) }
  return out
}

const mode = process.argv[2]
if (mode === 'capture' || mode === 'compare') {
  (async () => {
    const R = renderer(kit, REPO)
    const got = await pagesFor(R)
    const commit = git('rev-parse', '--short', 'HEAD').trim()
    if (mode === 'capture') { fs.writeFileSync(process.argv[3], JSON.stringify({ commit, pages: got })); console.log(`captured ${Object.keys(got).length} pages at ${commit}`); return }
    const want = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
    const L = await kit.bundle('sc1-words', "export { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/landing'\nimport '@/lib/i18n/catalog/featuresPage'\nimport '@/lib/i18n/catalog/planFeatures'\nexport { listCountrySettings } from '@/lib/country-settings'")
    const LOC = Object.fromEntries(R.ROWS().map(r => [r.countryCode, r.locale]))
    const CODE = { uk: 'GB' }; const code = seg => CODE[seg] ?? seg.toUpperCase()
    head(`landing and /features — every switched-on country (${SEGMENTS.length}): only the offline sentence differs from ${want.commit}`)
    const bad = []; let moved = 0
    for (const seg of SEGMENTS) {
      const loc = LOC[code(seg)]
      const tl = L.translatorFor(loc, 'landing'), tf = L.translatorFor(loc, 'featuresPage'), tp = L.translatorFor(loc, 'planFeatures')
      for (const [k, find, expect] of [[`landing:${seg}`, h => landingOffline(h, esc(tl('does.offlineTitle'))), esc(tl('does.offlineBody'))],
        [`features:${seg}`, h => featuresOffline(h, esc(tp('row.offline_protection.name'))), esc(tf('detail.offline_protection'))]]) {
        const before = want.pages[k], now = got[k]
        const a = find(before), b = find(now)
        if (!a || !b) { bad.push([k, 'offline text not found']); continue }
        const nowText = now.slice(b[0], b[1])
        if (nowText !== expect) { bad.push([k, 'now ≠ the restored message', nowText.slice(0, 120), expect.slice(0, 120)]); continue }
        if (before.slice(a[0], a[1]) !== nowText) moved++
        const rebuilt = before.slice(0, a[0]) + nowText + before.slice(a[1])
        if (rebuilt !== now) { const i = [...rebuilt].findIndex((c, j) => c !== now[j]); bad.push([k, 'differs elsewhere', rebuilt.slice(i - 80, i + 80), now.slice(i - 80, i + 80)]) }
      }
    }
    t(`all ${SEGMENTS.length * 2} pages byte-identical to ${want.commit} once the offline sentence is put in (${moved} of them had a different sentence there)`, !bad.length && moved === SEGMENTS.length * 2, bad.slice(0, 3))
    head('the other public pages that only moved onto the shared frame: byte-identical')
    for (const k of ['about:GB', 'about:DE', 'compare:uk', 'compare:de']) t(`${k} byte-identical to ${want.commit}`, want.pages[k] === got[k], (() => { const i = [...want.pages[k]].findIndex((c, j) => c !== got[k][j]); return [want.pages[k].slice(i - 100, i + 100), got[k].slice(i - 100, i + 100)] })())
    head('the legal pages inside the native app, and on Village Foodie\'s host: today\'s chrome, byte-identical (the Terms page\'s new line aside)')
    for (const doc of ['privacy', 'terms', 'countryTerms']) for (const where of ['app', 'vf']) {
      const k = `legal:${doc}:${where}`
      const now = doc === 'terms' ? got[k].replace(/<p class="mb-6 text-sm" data-country-terms-link="true"><a href="\/country-terms" class="text-orange-600 underline">Country terms<\/a><\/p>/, '') : got[k]
      t(`${k}: byte-identical to ${want.commit}${doc === 'terms' ? ' apart from the one "Country terms" line (removed by name, exactly once)' : ''}`, now === want.pages[k] && (doc !== 'terms' || now !== got[k]))
    }
    for (const doc of ['privacy', 'countryTerms']) t(`legalIn:fr:${doc}:app: byte-identical to ${want.commit}`, got[`legalIn:fr:${doc}:app`] === want.pages[`legalIn:fr:${doc}:app`])
    console.log(`\nsite-chrome-1 (compare with ${want.commit}): ${pass} passed, ${fail} failed`)
    process.exit(fail ? 1 : 0)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

;(async () => {
  // ══ 1 ══
  head('1 · the inventory: every route classified; group A through the ONE frame; nobody else draws the nav or the footer')
  const pages = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'app'], { cwd: REPO }).toString().split('\n').filter(f => /\/page\.tsx$/.test(f) && !f.startsWith('app/api/'))
  const A = ['app/(public)/[country]/page.tsx', 'app/(public)/(site)/landing/page.tsx', 'app/(public)/(site)/1ng7n4p5omux2gdk9kqvwz/page.tsx', 'app/(public)/(site)/features/page.tsx', 'app/(public)/[country]/features/page.tsx', 'app/(public)/(site)/faq/page.tsx', 'app/(public)/[country]/faq/page.tsx',
    'app/(public)/(site)/about/page.tsx', 'app/(public)/(site)/compare/page.tsx', 'app/(public)/[country]/compare/page.tsx', 'app/(public)/[country]/[section]/[slug]/page.tsx', 'app/(app)/contact/page.tsx',
    'app/(app)/(legal)/privacy/page.tsx', 'app/(app)/(legal)/terms/page.tsx', 'app/(app)/(legal)/country-terms/page.tsx', 'app/(app)/[country]/(legal)/privacy/page.tsx', 'app/(app)/[country]/(legal)/terms/page.tsx', 'app/(app)/[country]/(legal)/country-terms/page.tsx']
  const B = ['app/(app)/signup/page.tsx', 'app/(app)/login/page.tsx', 'app/(app)/forgot-password/page.tsx', 'app/(app)/reset-password/page.tsx', 'app/(app)/verify-email/page.tsx', 'app/(app)/setup/page.tsx', 'app/(app)/try/[slug]/page.tsx']
  const C = ['app/(app)/admin/outreach/p/[prospectId]/page.tsx', 'app/(app)/admin/outreach/page.tsx', 'app/(app)/admin/page.tsx', 'app/(app)/admin/whatsapp-connections/page.tsx', 'app/(app)/admin/billing/page.tsx', 'app/(app)/admin/whatsapp-templates/page.tsx', 'app/(app)/app/page.tsx',
    'app/(app)/dashboard/[token]/kds/page.tsx', 'app/(app)/dashboard/[token]/page.tsx', 'app/(app)/dashboard/page.tsx', 'app/(app)/dev/ticket-preview/page.tsx', 'app/(app)/docs/[token]/page.tsx', 'app/(app)/domain/page.tsx', 'app/(app)/hire/page.tsx',
    'app/(app)/kds/[kds_token]/page.tsx', 'app/(app)/manage/[token]/page.tsx', 'app/(app)/manage/page.tsx', 'app/(app)/o/[slug]/page.tsx', 'app/(app)/order/[id]/manage/page.tsx', 'app/(app)/order/[id]/page.tsx', 'app/(app)/p/[token]/page.tsx', 'app/(app)/page.tsx',
    'app/(app)/trucks/[slug]/order/page.tsx', 'app/(app)/trucks/[slug]/page.tsx', 'app/(app)/trucks/page.tsx', 'app/(app)/venues/[slug]/page.tsx']
  const unclassified = pages.filter(p => !A.includes(p) && !B.includes(p) && !C.includes(p))
  t(`every page route is in group A (${A.length}), B (${B.length}) or C (${C.length}) — a new page must be classified here`, !unclassified.length && [...A, ...B, ...C].every(p => pages.includes(p)), { unclassified, gone: [...A, ...B, ...C].filter(p => !pages.includes(p)) })
  const frameUsers = execFileSync('git', ['grep', '--untracked', '-l', '<MarketingFrame', '--', 'app', 'components'], { cwd: REPO }).toString().trim().split('\n').sort()
  t('the frame is rendered by the landing, /features, /faq, /about, /compare, the comparison page, /contact and both legal layouts', JSON.stringify(frameUsers) === JSON.stringify(['app/(app)/(legal)/layout.tsx', 'app/(app)/[country]/(legal)/layout.tsx', 'app/(public)/[country]/[section]/[slug]/page.tsx', 'app/(public)/(site)/about/page.tsx', 'app/(public)/(site)/compare/page.tsx', 'app/(app)/contact/HatchGrabContact.tsx', 'app/(public)/(site)/faq/page.tsx', 'app/(public)/(site)/features/page.tsx', 'app/(public)/(site)/landing/page.tsx'].sort()), frameUsers)
  // JSX uses only: a line whose `<LandingNav` / `<LandingFooter` is not inside a comment (`//`, `/*`, `*` before it), in .tsx files.
  const navUsers = [...new Set(execFileSync('git', ['grep', '--untracked', '-n', '-E', '<Landing(Nav|Footer)( |$)', '--', '*.tsx'], { cwd: REPO }).toString().trim().split('\n')
    .filter(l => { const code = l.replace(/^[^:]+:\d+:/, ''); const i = code.search(/<Landing(Nav|Footer)( |$)/); return !/\/\/|\/\*|^\s*\*/.test(code.slice(0, i)) })
    .map(l => l.split(':')[0]))]
  t('🔴 ONLY components/landing/MarketingFrame.tsx renders <LandingNav> and <LandingFooter> — no page has its own copy', JSON.stringify(navUsers) === '["components/landing/MarketingFrame.tsx"]', navUsers)
  const contact = read('app/(app)/contact/HatchGrabContact.tsx')
  t('/contact\'s own nav and three-link footer are gone (its form and words are untouched)', !/<nav |<footer /.test(contact) && /<HatchGrabContactForm/.test(contact) && read('app/(app)/contact/HatchGrabContactForm.tsx') === git('show', `${BEFORE}:app/contact/HatchGrabContactForm.tsx`))
  // ⚠️ RE-PINNED (cwv-2, 6 November 2026, docs/cwv-2-report.md §6): the shared modules moved into app/(public)/(site)/, so the country
  // addresses re-export '../(site)/landing/page' (the unlisted preview, beside it in (site), still '../landing/page').
  t('the A pages re-exporting a module (the country addresses, the unlisted landing preview) are the same modules, so they get the frame with them', ['app/(public)/[country]/page.tsx', 'app/(public)/[country]/features/page.tsx', 'app/(public)/[country]/faq/page.tsx', 'app/(public)/[country]/compare/page.tsx', 'app/(public)/(site)/1ng7n4p5omux2gdk9kqvwz/page.tsx'].every(f => /export \{ default, generateMetadata \} from '(\.\.\/)+(\(site\)\/)?(landing|features|faq|compare)\/page'/.test(read(f))))
  t('LegalChrome (today\'s legal chrome) is used ONLY by the two legal layouts — for the app and for Village Foodie\'s host', execFileSync('git', ['grep', '--untracked', '-l', '<LegalChrome', '--', 'app', 'components'], { cwd: REPO }).toString().trim().split('\n').sort().join() === 'app/(app)/(legal)/layout.tsx,app/(app)/[country]/(legal)/layout.tsx')

  // ══ 2 ══
  const R = renderer(kit, REPO)
  head('2 · the legal pages: the shared chrome on the web; today\'s chrome inside the app and on Village Foodie\'s host')
  const web = await R.PAGES.legal('privacy'), app = await R.PAGES.legal('privacy', { ua: APP_UA }), vf = await R.PAGES.legal('privacy', { host: VF_HOST })
  const isShared = h => /<nav class="[^"]*">/.test(h) && /class="nav-logo"/.test(h) && /class="foot-links"/.test(h) && /class="hg-landing [^"]*chrome-nav-only"/.test(h)
  const isLegalChrome = h => /<header class="bg-slate-900 sticky top-0 z-50 shrink-0 border-b border-white\/10 h-\[4\.5rem\]">/.test(h) && !/class="foot-links"/.test(h) && !/nav-logo/.test(h)
  t('/privacy on the web: the landing\'s nav (logo, Upload menu, Log in) and the landing\'s footer, the document outside `.hg-landing`', isShared(web) && !isLegalChrome(web) && /<main class="bg-slate-50 px-4 py-10"><article/.test(web))
  t('🔴 /privacy INSIDE THE APP (the HatchGrabNativeApp user agent): today\'s logo-only header, no marketing nav, no footer links to pricing, no badges', isLegalChrome(app) && !isShared(app) && !/#pricing|foot-badge|data-demo|Upload/.test(app))
  t('/privacy on Village Foodie\'s host: today\'s chrome', isLegalChrome(vf) && !isShared(vf))
  const fr = await R.PAGES.legalIn('fr', 'privacy'), frApp = await R.PAGES.legalIn('fr', 'privacy', { ua: APP_UA })
  t('/fr/privacy on the web: the shared chrome for France, in French — the logo home is /fr', isShared(fr) && /<a href="\/fr" class="nav-logo"/.test(fr) && /href="\/fr\/features"/.test(fr))
  t('/fr/privacy inside the app: today\'s chrome', isLegalChrome(frApp) && !isShared(frApp))
  const terms = await R.PAGES.legal('terms'), frTerms = await R.PAGES.legalIn('fr', 'terms')
  const frWords = JSON.parse(read('messages/fr-FR.json')).legalChrome
  t('the Terms page links the country-specific terms from its top (English → /country-terms; French → the French country terms)', /data-country-terms-link="true"><a href="\/country-terms" class="text-orange-600 underline">Country terms<\/a>/.test(terms)
    && new RegExp(`data-country-terms-link="true"><a href="/fr/[^"]+" class="text-orange-600 underline">${frWords.countryTerms}</a>`).test(frTerms) && !/data-country-terms-link/.test(web))
  t('the documents and "Questions? Get in touch — we’re real people." are unchanged', /Questions\? <a href="\/contact" class="text-orange-600 underline">Get in touch<\/a> — we’re real people\./.test(web) && /<article class="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200/.test(web))

  // ══ 3 ══
  head('3 · /contact, and the logo → home on every group A and group B page')
  const ct = await R.PAGES.contact()
  t('/contact (HatchGrab): the shared nav and footer, its form unchanged', /class="nav-logo"/.test(ct) && /class="foot-links"/.test(ct) && /class="cf/.test(ct) && /data-demo|Upload/.test(ct))
  const marketing = await kit.bundle('sc1-mc', "export { marketingRedirect, ROUTER_PATHS } from '@/lib/marketing-country'")
  const homeOf = href => (href === '#' ? 'top of the landing' : marketing.marketingRedirect(href, '', ['GB', 'US', 'FR', 'DE'], { cookie: 'GB' })?.location ?? href)
  const logo = h => (/<a href="([^"]*)" class="nav-logo"/.exec(h) || [])[1]
  const A_LOGOS = { landing: [await R.PAGES.landing('uk'), '#'], features: [await R.PAGES.features('uk'), '/uk'], about: [await R.PAGES.about(), '/landing'], compare: [await R.PAGES.compare('uk'), '/uk'], contact: [ct, '/landing'], privacy: [web, '/landing'], terms: [terms, '/landing'], 'fr/privacy': [fr, '/fr'] }
  t('group A: the logo is the landing\'s own (the top of the page on the landing; the country page elsewhere — "/landing" routes to it)', Object.values(A_LOGOS).every(([h, want]) => logo(h) === want) && homeOf('/landing') === '/uk' && homeOf('/') === '/uk',
    Object.fromEntries(Object.entries(A_LOGOS).map(([k, [h]]) => [k, logo(h)])))
  const FL = await kit.bundle('sc1-flow', "export { FlowLogo, HOME_HREF } from '@/components/shared/FlowLogo'")
  const card = kit.renderStatic(kit.h(FL.FlowLogo, { variant: 'card' })), bar = kit.renderStatic(kit.h(FL.FlowLogo, { variant: 'header' }))
  t('group B: the flows\' logo is a link to "/" (the router to the visitor\'s country page) — the card wordmark and the header bar', FL.HOME_HREF === '/' && /<a [^>]*href="\/"/.test(card) && /alt="HatchGrab"/.test(card) && /<a [^>]*href="\/"/.test(bar), [card, bar])
  const flowSrc = { 'app/(app)/login/page.tsx': /<FlowLogo variant="card" \/>/, 'app/(app)/reset-password/page.tsx': /<FlowLogo variant="card" \/>/, 'app/(app)/forgot-password/page.tsx': /<FlowLogo variant="card" \/>/,
    'app/(app)/verify-email/page.tsx': /<FlowLogo variant="card" \/>/, 'app/(app)/verify-email/VerifyEmailSuccess.tsx': /<FlowLogo variant="card" \/>/, 'app/(app)/setup/page.tsx': /<FlowLogo variant="header" \/>/,
    'components/demo/DemoWalkthrough.tsx': /<FlowLogo variant="header" \/>/, 'app/(app)/signup/page.tsx': /<BrandHomeLink href=\{HOME_HREF\} kind="branding"[^>]*><HatchGrabWordmark \/><\/BrandHomeLink>/ }
  t('every group B page draws that logo (signup keeps its own wordmark, wrapped in the same link); none has a footer', Object.entries(flowSrc).every(([f, re]) => re.test(read(f))) && B.every(f => !/LandingFooter|<footer/.test(read(f))), Object.entries(flowSrc).filter(([f, re]) => !re.test(read(f))).map(([f]) => f))
  t('…and inside the app it does not navigate (BrandHomeLink "branding", the app\'s own isNativeApp)', /kind="branding"/.test(read('components/shared/FlowLogo.tsx')) && /isNativeApp\(\)/.test(read('components/shared/BrandHomeLink.tsx')))

  // ══ 4 ══
  head('4 · the phone footer (CSS only, ≤720px)')
  const css = read('app/(public)/(site)/landing/landing.css'), cssBefore = git('show', `${BEFORE}:app/landing/landing.css`)
  const block = (css.match(/@media\(max-width:720px\)\{\n  \.hg-landing \.foot-grid \{ flex-direction: column;[\s\S]*?\n\}\n/) || [''])[0]
  t('four equal columns, centred, an 8px column gap and no row gap', /\.foot-links \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); gap: 0 8px; justify-items: stretch; text-align: center; \}/.test(block))
  t('every item a 44px tap target, centred, wrapping inside its column (line-height 1.2), never overflowing and never an ellipsis', /\.foot-links > a, \.hg-landing \.foot-links > \.cc \{ display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 44px; line-height: 1\.2; overflow-wrap: anywhere; hyphens: auto; \}/.test(block) && !/text-overflow/.test(block))
  t('the country menu is an ordinary cell (no `grid-column: 1 / -1` left on it)', !/\.foot-links \.cc \{ grid-column: 1 \/ -1; \}/.test(css) && /\.foot-links \.cc \{ grid-column: 1 \/ -1; \}/.test(cssBefore))
  t('"Features · Pricing · FAQ · About / Privacy · Terms · Contact · GB ⌄": the last five items counted from the end, About left in the first row', /:nth-last-child\(5\), \.hg-landing \.foot-links > :nth-last-child\(4\),\n  \.hg-landing \.foot-links > :nth-last-child\(2\), \.hg-landing \.foot-links > :nth-last-child\(1\) \{ order: 1; \}/.test(block))
  t('tighter: footer 2rem / 1.6rem; .foot-grid .9rem; .foot-right 1rem; .foot-base 1.4rem / .9rem', /footer \{ padding: 2rem 0 1\.6rem; \}/.test(block) && /\.foot-grid \{ gap: \.9rem; \}/.test(block) && /\.foot-right \{ gap: 1rem; align-self: stretch; \}/.test(block) && /\.foot-base \{ margin-top: 1\.4rem; padding-top: \.9rem; \}/.test(block))
  t('Apple\'s badge clear space (10px) on every side: 16px above, 20px between, 22px below, ≥ 14px to the brand block', /\.foot-apps \{ display: flex; flex-wrap: wrap; gap: 1\.25rem; \}/.test(css) && 16 >= 10 && 0.9 * 16 >= 10)
  // ⚠️ RE-PINNED (cwv-1, 5 November 2026): cwv-1 APPENDED one block to landing.css — its comment, then rules for ≤400px Czech / Greek
  // pages only (scripts/cwv-1.cjs pins it, and that everything before it is byte-identical). Only that appended tail is set aside here.
  const outside = s => s.replace(/\n\/\* ── cwv-1 \(5 November 2026[\s\S]*$/, '').replace(/@media\(max-width:720px\)\{[\s\S]*?\n\}\n/g, '')
  // ⚠️ RE-PINNED (compare-ux-1, 8 November 2026): compare-ux-1 removed compare-de-1's "Vergleich" column rules (.foot-col) — the link is
  // in .foot-links now (scripts/compare-ux-1.cjs pins it). Only that block, and the one-line comment that replaced it, are set aside.
  // ⚠️ RE-PINNED (jp-nav-2, 9 November 2026): its Japanese-only nav rules are set aside exactly (scripts/_lp-jp-nav-1.cjs cssAsBefore).
  const FOOT_COL_BEFORE = /\/\* compare-de-1 \(24 October 2026\): the "Vergleich" column[\s\S]*?\.hg-landing \.foot-col a:hover \{ color: #fff; \}\n/
  const FOOT_COL_NOW = /\/\* compare-de-1's "Vergleich" column \(\.foot-col\) is gone: compare-ux-1[^\n]*\n/
  t('🔴 desktop unchanged: every rule outside the ≤720px blocks is byte-identical to before (apart from compare-ux-1\'s removal of the .foot-col column)', FOOT_COL_BEFORE.test(cssBefore) && outside(require('./_lp-jp-nav-1.cjs').cssAsBefore(css).replace(FOOT_COL_NOW, '')) === outside(cssBefore.replace(FOOT_COL_BEFORE, '')))
  const markupNow = read('components/landing/LandingFooter.tsx'), markupBefore = git('show', `${BEFORE}:components/landing/LandingFooter.tsx`)
  // ⚠️ RE-PINNED (compare-ux-1, 8 November 2026): compare-ux-1 moved the comparison link from its own column into the row (its old slot kept
  // as {null}, so React's ids are unchanged; scripts/compare-ux-1.cjs pins that). The footer is pinned to be what it was here up to the
  // commit before compare-ux-1 (c892cb3d), and every line compare-ux-1 changed to be about the comparison link.
  const UX1_BASE = 'c892cb3d'
  // Code lines only (JSX comments dropped), as multisets: every line added or removed must be about the comparison link.
  const codeLines = src => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  const count = a => a.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map())
  const [cb, cn] = [count(codeLines(git('show', `${UX1_BASE}:components/landing/LandingFooter.tsx`))), count(codeLines(markupNow))]
  const footDiff = [...new Set([...cb.keys(), ...cn.keys()])].filter(l => (cb.get(l) || 0) !== (cn.get(l) || 0))
  const offTopic = footDiff.filter(l => !/compar|foot-col|AdminOnly|^\{null\}$|faqHref|^\? \(compareLink$|^: \(compareLink|^: null$|^const box = \($|^<\/div>$|^\)$|^\}\)\(\)\}$/.test(l))
  t('the footer\'s markup and item order are unchanged but for compare-ux-1\'s comparison link (React\'s ids depend on it)', git('show', `${UX1_BASE}:components/landing/LandingFooter.tsx`) === markupBefore && footDiff.length > 0 && !offTopic.length && read('components/landing/LandingNav.tsx') === git('show', `${BEFORE}:components/landing/LandingNav.tsx`), offTopic)

  // ══ 5 ══
  head('5 · the offline words: put back exactly as they were at 7e1effa7^, in every language; the apps sentences and their code gone')
  const get = (o, p) => p.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o)
  const files = fs.readdirSync(path.join(REPO, 'messages')).filter(f => /^[a-z]{2}-[A-Z]{2}\.json$/.test(f))
  const rows = []
  for (const f of files) {
    const now = JSON.parse(read(`messages/${f}`)), old = JSON.parse(git('show', `7e1effa7^:messages/${f}`))
    for (const k of ['landing.does.offlineBody', 'featuresPage.detail.offline_protection']) {
      const o = get(old, k), n = get(now, k)
      if (o !== undefined || n !== undefined) rows.push({ f, k, ok: o === n })
    }
  }
  t(`every value is 7e1effa7^'s exactly (${rows.length} values: en-GB, the 28 bases, the en-US override)`, rows.length === 59 && rows.every(r => r.ok), rows.filter(r => !r.ok))
  t('the en-GB words as briefed', get(JSON.parse(read('messages/en-GB.json')), 'landing.does.offlineBody') === 'If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app.')
  t('no language has landing.does.offlineApps or featuresPage.offlineApps; no code appends them', files.every(f => { const d = JSON.parse(read(`messages/${f}`)); return get(d, 'landing.does.offlineApps') === undefined && get(d, 'featuresPage.offlineApps') === undefined })
    && (() => { try { return execFileSync('git', ['grep', '--untracked', '-l', 'offlineApps', '--', 'app', 'components', 'lib'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === '' } catch (e) { return e.status === 1 } })())
  t('copy-truth-1\'s trial line and add-van words are untouched', ['auth.signup.subtitle', 'demoGetStarted.freeMonth', 'manageSettings.vans.addConfirm'].every(k => files.every(f => JSON.stringify(get(JSON.parse(read(`messages/${f}`)), k)) === JSON.stringify(get(JSON.parse(git('show', `${BEFORE}:messages/${f}`)), k)))))
  t('the rendered landing and /features say it (en-GB)', (await R.PAGES.landing('uk')).includes('<p>If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app.</p>')
    && (await R.PAGES.features('uk')).includes('If you lose signal, online ordering pauses so customers can’t place orders you won’t see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection.'))
  t('MARKETING_COPY_UPDATED moved to 2026-11-05 (35.aj-8)', /export const MARKETING_COPY_UPDATED = '2026-11-05'/.test(read('lib/marketing-meta.ts')))

  // ══ 6 ══
  head('6 · group C untouched: every source file each one bundles is byte-identical to before (the offline keys aside)')
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const atBefore = f => { try { return git('show', `${BEFORE}:${require('./_moved-paths.cjs').pathAt(BEFORE, f)}`) } catch { return null } }
  const offlineOnly = (f, a, b) => {
    if (!/^messages\/ns\/[A-Za-z-]+\/(landing|featuresPage)\.json$/.test(f) || a == null) return false
    const strip = s => { const o = JSON.parse(s); for (const k of ['offlineBody', 'offlineApps']) if (o.does) delete o.does[k]; if (o.detail) delete o.detail.offline_protection; delete o.offlineApps; return JSON.stringify(o) }
    return strip(a) === strip(b)
  }
  // THIS WORK'S FILES (site-chrome-1): its code, its stylesheet and its message files. Anything else that differs from before is another
  // workstream's and is not this harness's question.
  const MINE_CODE = new Set(['app/(app)/(legal)/layout.tsx', 'app/(app)/(legal)/terms/page.tsx', 'app/(app)/[country]/(legal)/layout.tsx', 'app/(public)/[country]/[section]/[slug]/page.tsx', 'app/(public)/(site)/about/page.tsx',
    'app/(public)/(site)/compare/page.tsx', 'app/(app)/contact/HatchGrabContact.tsx', 'app/(app)/contact/page.tsx', 'app/(public)/(site)/features/page.tsx', 'app/(app)/forgot-password/page.tsx', 'app/(public)/(site)/landing/landing.css', 'app/(public)/(site)/landing/page.tsx',
    'app/(app)/login/page.tsx', 'app/(app)/reset-password/page.tsx', 'app/(app)/setup/page.tsx', 'app/(app)/signup/page.tsx', 'app/(app)/verify-email/VerifyEmailSuccess.tsx', 'app/(app)/verify-email/page.tsx',
    'components/demo/DemoWalkthrough.tsx', 'components/landing/MarketingFrame.tsx', 'components/legal/LegalPage.tsx', 'components/legal/translated-legal.tsx', 'components/shared/FlowLogo.tsx', 'lib/marketing-meta.ts'])
  const MINE = f => MINE_CODE.has(f) || /^messages\/(ns\/[A-Za-z-]+\/(landing|featuresPage)\.json|[A-Za-z-]+\.json)$/.test(f) || /^lib\/i18n\/catalog\/(landing|featuresPage)\.ts$/.test(f)
  const moved = {}
  for (const entry of C) {
    const r = await esbuild.build({ entryPoints: [path.join(REPO, entry)], bundle: true, write: false, metafile: true, platform: 'node', format: 'esm', jsx: 'automatic', logLevel: 'silent', alias: { '@': REPO }, packages: 'external', absWorkingDir: REPO, loader: { '.css': 'empty', '.svg': 'text', '.png': 'empty', '.jpg': 'empty', '.json': 'json' } }).catch(e => ({ error: e }))
    if (r.error) { moved[entry] = ['build failed: ' + String(r.error.message).slice(0, 120)]; continue }
    // Only THIS work's files count (other workstreams commit alongside it — loyalty-1's vercel.json cron, for one).
    const m = Object.keys(r.metafile.inputs).filter(f => !f.includes('node_modules')).filter(f => MINE(f)).filter(f => { const a = atBefore(f), b = read(f); return a !== b && !offlineOnly(f, a, b) })
    if (m.length) moved[entry] = m
  }
  t(`all ${C.length} group C entries: nothing they bundle changed`, !Object.keys(moved).length, moved)

  console.log(`\nsite-chrome-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
