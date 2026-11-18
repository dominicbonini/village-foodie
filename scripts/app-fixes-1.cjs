#!/usr/bin/env node
// scripts/app-fixes-1.cjs — app-fixes-1 (14 November 2026, docs/app-fixes-1-report.md). Swept. Reads source files only:
// no server, no browser, no database. (The browser proof — screenshots, the app context, a production build — is
// scripts/app-fixes-1-screens.cjs, run by hand; the production-bundle check is scripts/turbopack-merged-modules-check.cjs.)
//   §1 the password-reset / login end states each have a way forward
//   §2 Carte & stock: one set of right-hand columns, the category counts on their own line
//   §3 Paramètres in the app: the printing import cycle is gone, one card cannot take the tab down, the error page goes back
//      to the dashboard
//   §4 only operator screens load inside the app (the list, the proxy rule, the link guard)
//   §5 the words exist in en-GB and every shipped language base
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const ts = require(path.join(REPO, 'node_modules/typescript'))
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8')
const json = p => JSON.parse(read(p))
const get = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o)
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)
/** Load a pure TS module (no imports of its own) as CommonJS. */
function loadTs(p) {
  const out = ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, require); return m.exports
}

const EN = json('messages/en-GB.json')
const BASES = JSON.parse(read('lib/i18n/locales.ts').match(/export const LANGUAGE_BASES[^=]*=\s*(\[[^\]]*\])/)[1].replace(/'/g, '"'))

// ══ §1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('§1 · every auth end state has a way forward')
{
  const forgot = read('app/(app)/forgot-password/page.tsx')
  const sent = forgot.slice(forgot.indexOf('if (sent) {'), forgot.indexOf('return (', forgot.indexOf('if (sent) {') + 30) + 900)
  // ⚠️ RE-PINNED (app-fixes-2, 15 November 2026, docs/app-fixes-2-report.md §1): "Log in" everywhere made auth.forgot.back
  // "Back to log in", the same words as app-fixes-1's auth.forgot.backToLogin, so the two were merged into auth.forgot.back,
  // and auth.reset.logIn into auth.login.submit ("Log in"). Same links, same places; only the key names changed.
  t('"email sent": a link to /login worded auth.forgot.back (app-fixes-2: merged from backToLogin)', /<Link href="\/login" data-auth-next="login"[\s\S]{0,200}\{t\('back'\)\}/.test(sent))
  const reset = read('app/(app)/reset-password/page.tsx')
  t('reset: one pair of ways forward — "Send a new link" (/forgot-password) + "Back to log in" (/login)', /<Link href="\/forgot-password" data-auth-next="forgot"[^>]*>\{t\('sendNewLink'\)\}<\/Link>\s*<Link href="\/login" data-auth-next="login"[^>]*>\{tForgot\('back'\)\}/.test(reset))
  t('reset: no token → the "invalid" card with both ways forward', /if \(!token && !isFirstLogin\) \{\s*return <EndCard state="invalid"[^>]*>\{nextSteps\}<\/EndCard>/.test(reset))
  t('reset: an expired / used / unknown link is a card with both ways forward, not a line under the form', /if \(linkError\) return <EndCard state="link-error"[^>]*>\{nextSteps\}<\/EndCard>/.test(reset) && /LINK_CODES = new Set\(\['reset_link_expired', 'reset_link_used', 'reset_link_invalid'\]\)/.test(reset))
  const api = read('app/api/auth/reset-password/route.ts')
  t('…and those are exactly the codes /api/auth/reset-password answers', ['reset_link_expired', 'reset_link_used', 'reset_link_invalid'].every(c => api.includes(`'${c}'`)))
  t('reset: success → a card with a "Log in" button to /login (no jump to /login?message=…)', /if \(done\) \{[\s\S]{0,500}<a href="\/login" data-auth-next="login"[^>]*>\{tLogin\('submit'\)\}/.test(reset) && !stripComments(reset).includes("window.location.href = '/login?message=password_reset'"))
  // ⚠️ RE-PINNED (dashboard-auth-3, 18 November 2026): the sign-out now STATES its scope — 'global', everywhere, exactly what the
  // default did — so a later change to "this device only" elsewhere can never reach the password reset by accident.
  t('reset: the sign-out before the success card still runs', /auth\.signOut\(\{ scope: 'global' \}\)\s*\n[\s\S]{0,300}setDone\(true\)/.test(reset))
  t('first login: /app in the app, /dashboard on the web', reset.includes("router.push(isNativeApp() ? '/app' : '/dashboard')"))
  const login = read('app/(app)/login/page.tsx')
  t('login: /auth/callback\'s ?error=invalid_link now shows a sentence', /searchParams\.get\('error'\) === 'invalid_link'/.test(login) && /\{t\('invalidLink'\)\}/.test(login))
  t('login in the app still goes to /app (unchanged)', /if \(isNativeApp\(\)\) \{\s*router\.push\('\/app'\); return/.test(login))
  // ⚠️ RE-PINNED (app-fixes-2): the merged keys; "Back to sign in" became "Back to log in" (scripts/app-fixes-2.cjs holds it).
  t('en-GB wording: "Back to log in", "Send a new link", "Log in" (app-fixes-2: auth.forgot.back + auth.login.submit; "Request a new reset link" unchanged)', get(EN, 'auth.forgot.back') === 'Back to log in' && get(EN, 'auth.reset.sendNewLink') === 'Send a new link' && get(EN, 'auth.login.submit') === 'Log in' && get(EN, 'auth.forgot.backToLogin') === undefined && get(EN, 'auth.reset.logIn') === undefined && get(EN, 'auth.reset.requestNew') === 'Request a new reset link')
}

// ══ §2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('§2 · Carte & stock — shared fixed columns, counts under the name')
{
  const dash = read('app/(app)/dashboard/[token]/page.tsx')
  const a = dash.indexOf("{activeTab==='stock'&&("); const blk = dash.slice(a, dash.indexOf("{tDash('stock.optionsTitle')}", a))
  const P = 'w-[3.75rem] sm:w-20', L = 'w-12 sm:w-16', O = 'w-11 sm:w-12'
  const hi = blk.lastIndexOf('<div', blk.indexOf('data-stock-head')); const head_ = blk.slice(hi, hi + 3500)
  t('the column headings use the shared widths (price · limit · on)', head_.includes(`${P} shrink-0`) && head_.includes(`${L} shrink-0`) && head_.includes(`${O} shrink-0`))
  const cat = blk.slice(blk.indexOf('data-stock-row="category"'), blk.indexOf('data-stock-row="category"') + 6000)
  t('category row: price spacer, limit and switch at the shared widths', cat.includes(`<span className="${P} shrink-0" aria-hidden />`) && cat.includes(`${L} shrink-0" data-stock-col="limit"`) && cat.includes(`<span className="${O} shrink-0 flex justify-center" data-stock-col="on">`))
  const item = blk.slice(blk.indexOf('data-stock-row="item"'))
  t('item row: price, limit and switch at the same widths', item.includes(`${P} shrink-0" data-stock-col="price"`) && item.includes(`${L} shrink-0" data-stock-col="limit"`) && item.includes(`<span className="${O} shrink-0 flex justify-center" data-stock-col="on">`))
  t('the same right inset on headings, category rows and item rows (pr-[9px] = an item row\'s p-2 + 1px border)', head_.includes('pr-[9px]') && blk.includes('pr-[9px]" data-stock-row="category"') && /data-stock-row="item" className=\{`flex items-center gap-1 sm:gap-2 p-2 rounded-xl border/.test(blk))
  const nameBlk = blk.slice(blk.indexOf('data-stock-cat-name'), blk.indexOf('data-stock-cat-name') + 1600)
  const nameP = nameBlk.match(/<p className="text-sm font-black text-orange-600[^"]*">([\s\S]*?)<\/p>/)
  t('category: the name alone on line 1', !!nameP && !/stock\.left|stock\.catSold|stock\.closed/.test(nameP[1]))
  t('category: "Reste : N", sold and closed on line 2 underneath', /data-stock-cat-counts>[\s\S]*stock\.catSold[\s\S]*stock\.left[\s\S]*stock\.closed/.test(nameBlk))
  t('item names wrap instead of pushing the columns ([overflow-wrap:anywhere], min-w-0)', /<p className=\{`font-bold text-sm min-w-0 \[overflow-wrap:anywhere\]/.test(blk))
  t('no spin buttons squeezing the limit box on phones', (blk.match(/max-sm:\[&::-webkit-inner-spin-button\]:appearance-none/g) || []).length === 2)
  t('iPad / desktop keep their widths (sm: w-20 · w-16 · w-12, gap-2, items indented)', blk.includes('sm:w-20') && blk.includes('sm:w-16') && blk.includes('sm:w-12') && blk.includes('space-y-1.5 sm:ml-2'))
  t('wording unchanged: the same message keys as before', ['stock.colLimit', 'stock.colOn', 'stock.left', 'stock.catSold', 'stock.closed', 'eventPriceColumnLabel'].every(k => blk.includes(`'${k}'`)))
}

// ══ §3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('§3 · Paramètres in the app')
{
  const dir = 'lib/printing'
  const files = fs.readdirSync(path.join(REPO, dir)).filter(f => /\.tsx?$/.test(f))
  const reqs = files.filter(f => /\brequire\s*\(/.test(stripComments(read(`${dir}/${f}`))))
  t('no require() in lib/printing (a bundled require closed the cycle Turbopack collapsed)', reqs.length === 0, reqs.join(', '))
  // value-import graph (type-only imports erased)
  const graph = {}
  for (const f of files) {
    const src = read(`${dir}/${f}`)
    graph[f.replace(/\.tsx?$/, '')] = [...src.matchAll(/^import\s+(?!type\b)([^'"]*?)\s*from\s*'\.\/([^']+)'/gm)].filter(m => !/^\{\s*type\s/.test(m[1]) || /,\s*(?!type)\w/.test(m[1])).map(m => m[2])
  }
  const cycles = []
  const walk = (n, stack) => { if (stack.includes(n)) { cycles.push([...stack.slice(stack.indexOf(n)), n].join(' → ')); return } for (const d of graph[n] || []) walk(d, [...stack, n]) }
  Object.keys(graph).forEach(n => walk(n, []))
  t('no value-import cycle among the lib/printing modules', cycles.length === 0, [...new Set(cycles)].slice(0, 5).join(' | '))
  const avail = read('lib/printing/netAvailability.ts')
  t('netAvailability.ts imports nothing from lib/printing', !/from '\.\//.test(avail) && /export function isNetPrinterAvailable/.test(avail))
  const tr = read('lib/printing/transport.ts')
  t('transport.ts re-exports isNetPrinterAvailable / NET_PRINTER_PLUGIN (callers unchanged)', tr.includes("export { NET_PRINTER_PLUGIN, isNetPrinterAvailable } from './netAvailability'"))
  t('transport.ts builds the backends from static imports', /import \{ createNetTransport \} from '\.\/netTransport'/.test(tr) && /import \{ createBleTransport \} from '\.\/bleTransport'/.test(tr) && tr.includes("_transport = kind === 'net' ? createNetTransport() : createBleTransport()"))
  t('netTransport.ts takes isNetPrinterAvailable from netAvailability, not transport', read('lib/printing/netTransport.ts').includes("import { isNetPrinterAvailable } from './netAvailability'"))
  const dash = read('app/(app)/dashboard/[token]/page.tsx')
  t('the Paramètres tab is an IsolatedSections (each card its own error boundary)', /\{activeTab==='settings'&&\([\s\S]{0,400}<IsolatedSections className="space-y-4">/.test(dash) && /<NotificationSettings token=\{token\}\/>\)\}<\/Section>\s*<\/IsolatedSections>/.test(dash))
  {
    // Every top-level child of the tab is a <Section>{() => …}</Section>: inline JSX is otherwise evaluated in the dashboard's
    // own render, where no child boundary can catch it (the online-payments card's date formatting is one such place).
    const sf = ts.createSourceFile('d.tsx', dash, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let iso = null; const v = n => { if (!iso && ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'IsolatedSections') iso = n; else if (!iso) ts.forEachChild(n, v) }; v(sf)
    const kids = iso ? iso.children.filter(c => !ts.isJsxText(c) && !(ts.isJsxExpression(c) && !c.expression)) : []
    const notSection = kids.filter(c => !(ts.isJsxElement(c) && c.openingElement.tagName.getText() === 'Section'))
    t(`every one of the ${kids.length} Paramètres cards is a deferred <Section> (its JSX built inside its own boundary)`, kids.length >= 10 && notSection.length === 0, notSection.map(c => c.getText(sf).slice(0, 80)).join(' | '))
  }
  const iso = read('components/shared/IsolatedSections.tsx')
  t('IsolatedSections: getDerivedStateFromError + a retry, no wrapper element per child, Section defers its JSX', /export function Section\(\{ children \}: \{ children: \(\) => ReactNode \}\)/.test(iso) && /static getDerivedStateFromError/.test(iso) && /Children\.toArray\(children\)\.map/.test(iso) && /t\('sectionFailed'\)/.test(iso) && /t\('retry'\)/.test(iso))
  const err = read('app/(app)/error.tsx')
  t('error page: the dashboard / Manage token → /dashboard/<token>, in the app → /app, else the home link', err.includes("const m = pathname.match(/^\\/(?:dashboard|manage)\\/([^/?#]+)/)") && err.includes("const dashboardHref = m ? `/dashboard/${m[1]}` : native ? '/app' : null") && err.includes("{t('backToDashboard')}") && err.includes('<Link href="/"'))
  const re = /^\/(?:dashboard|manage)\/([^/?#]+)/
  const cases = [['/dashboard/abc', 'abc'], ['/dashboard/abc/kds', 'abc'], ['/manage/abc', 'abc'], ['/manage/abc?tab=menu', 'abc'], ['/kds/xyz', null], ['/', null], ['/trucks/x', null]]
  t('…the token is read from every dashboard / Manage address and nothing else', cases.every(([p, want]) => (p.match(re)?.[1] ?? null) === want))
  const nf = read('app/(app)/not-found.tsx')
  t('404 in the app: "home" is /app', nf.includes("<Link href={inApp ? '/app' : '/'}") && nf.includes("includes('HatchGrabNativeApp')"))
}

// ══ §4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('§4 · only operator screens load inside the app')
{
  const { inAppRoute, browserUrlFor } = loadTs('lib/app-navigation.ts')
  const table = {
    stay: ['/app', '/dashboard/tok', '/dashboard/tok/kds', '/kds/abc', '/manage/tok', '/manage/tok?tab=menu', '/login', '/forgot-password', '/reset-password', '/verify-email', '/auth/callback', '/signup', '/setup', '/admin', '/api/menu/x', '/_next/static/x.js', '/offline.html', '/logos/hg.png'],
    browser: ['/trucks/pizza-kitchen', '/trucks/pizza-kitchen/order', '/o/abc', '/p/tok', '/order/123', '/embed/x', '/venues/x', '/hire', '/docs/tok', '/privacy', '/terms', '/country-terms', '/fr/privacy', '/fr/terms'],
    app: ['/', '/uk', '/us', '/fr', '/features', '/faq', '/compare', '/about', '/contact', '/try/x', '/demo/x', '/pricing', '/landing'],
  }
  for (const [want, paths] of Object.entries(table)) { const bad = paths.filter(p => inAppRoute(p) !== want); t(`'${want}': ${paths.length} paths`, bad.length === 0, bad.map(p => `${p} → ${inAppRoute(p)}`).join(', ')) }
  t('a customer page opens through the bare domain (both shells hand it to the browser; it 308s back to www)', browserUrlFor(new URL('https://www.hatchgrab.com/trucks/x/order?e=1')) === 'https://hatchgrab.com/trucks/x/order?e=1' && browserUrlFor(new URL('http://localhost:3000/trucks/x')) === 'http://localhost:3000/trucks/x')
  t('app-navigation.ts is pure (no imports — the edge proxy loads it)', !/^import /m.test(read('lib/app-navigation.ts')))
  const proxy = read('proxy.ts')
  const i = proxy.indexOf("includes('HatchGrabNativeApp')) {"), j = proxy.indexOf('  const isVillageFoodie =')
  t('proxy: the in-app page rule runs before the domain redirects, on our hosts (after the custom-domain block)', i > 0 && i < j && proxy.indexOf('if (isCustomHost(host)) {') < i)
  const rule = proxy.slice(i - 200, i + 600)
  t('proxy: GET only, pages only (Sec-Fetch-Dest document or the RSC header — iframes and API pass), → /app', /request\.method === 'GET'/.test(rule) && /request\.headers\.has\('rsc'\)/.test(rule) && /dest === 'document'/.test(rule) && /inAppRoute\(pathname\) !== 'stay'\) return NextResponse\.redirect\(new URL\('\/app', request\.url\)\)/.test(rule))
  t('proxy imports the same list', proxy.includes("import { inAppRoute } from '@/lib/app-navigation'"))
  const guard = read('components/native/InAppNavigationGuard.tsx')
  t('guard: app only, capture phase, same-origin only, untouched for \'stay\'', /if \(!isNativeApp\(\)\) return/.test(guard) && /addEventListener\('click', onClick, true\)/.test(guard) && /url\.origin !== window\.location\.origin\) return/.test(guard) && /if \(where === 'stay'\) return/.test(guard))
  t('guard: customer page → the phone\'s browser; anything else → /app', guard.includes("if (where === 'browser') window.location.href = browserUrlFor(url)") && guard.includes("else window.location.assign('/app')"))
  t('the (app) layout mounts the guard', /<InAppNavigationGuard \/>/.test(read('app/(app)/layout.tsx')))
}

// ══ §5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('§5 · the words, in en-GB and every shipped language base')
{
  // ⚠️ RE-PINNED (app-fixes-2): auth.reset.logIn → auth.login.submit, auth.forgot.backToLogin → auth.forgot.back (merged).
  const keys = ['auth.login.submit', 'auth.login.invalidLink', 'errorPage.backToDashboard', 'errorPage.errorBodyDashboard', 'errorPage.sectionFailed', 'auth.forgot.back', 'auth.reset.sendNewLink', 'auth.login.resetSuccess']
  t('en-GB has every key', keys.every(k => typeof get(EN, k) === 'string'))
  const missing = []
  for (const l of BASES) { const m = json(`messages/${l}.json`); for (const k of keys) if (typeof get(m, k) !== 'string') missing.push(`${l}:${k}`) }
  t(`all ${BASES.length} language bases have every key`, missing.length === 0, missing.slice(0, 20).join(', '))
  const fr = json('messages/fr-FR.json')
  t('fr-FR: "Retour au tableau de bord"', get(fr, 'errorPage.backToDashboard') === 'Retour au tableau de bord')
  t('en-GB: "Back to dashboard"', get(EN, 'errorPage.backToDashboard') === 'Back to dashboard')
  const nsEn = json('messages/ns/en-GB/errorPage.json'); const nsFr = json('messages/ns/fr-FR/errorPage.json')
  t('the namespace files were regenerated (split-messages)', nsEn.backToDashboard === 'Back to dashboard' && nsFr.backToDashboard === 'Retour au tableau de bord')
}

console.log(`\n${fail ? '🔴' : '✅'} app-fixes-1: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
