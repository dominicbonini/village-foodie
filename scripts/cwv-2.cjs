#!/usr/bin/env node
// scripts/cwv-2.cjs — cwv-2 (6 November 2026, docs/cwv-2-report.md): the public HatchGrab pages on a root layout of their own, built ahead
// and served from the CDN, with no visible change and every app route's output unchanged.
//   node scripts/cwv-2.cjs            (swept; NO NETWORK, NO DATABASE, NO BUILD — source checks only)
//   1 · the move: every route in a group; every app file moved byte-identical (two named import lines aside); the public inventory
//   2 · the public layouts carry only what a public page needs, and never import app-only code (manual 35.ap-1)
//   3 · built ahead (manual 35.ap-2): the three country routes, their tagged data, the host gate in proxy.ts, the 404s
//   4 · PostHog after idle, from today's unchanged module; the demo pop-up's code off the first screen; the Greek arrow
//   5 · nothing in ordering, payments, the KDS, the dashboard or Manage changed
// The pixel, HTML, revalidation and Lighthouse proofs need builds: scripts/cwv-2-proof/ (by hand; docs/cwv-2-report.md §7).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const MP = require('./_moved-paths.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const git = (...a) => execFileSync('git', a, { cwd: REPO, maxBuffer: 256e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const BEFORE = 'ceda135d'   // main when this work started (cwv-2's stop report), before the move
// ⚠️ RE-PINNED (demo-claim-2, 9 November 2026, docs/demo-claim-2-report.md §8): demo-claim-2 edited five files this guard watches (Manage, the
// dashboard, the KDS, the manage route and commit-menu) and added four message keys. A file of THOSE five passes when it was still its pre-move
// self (the move aside) in 64ac2eb7 — the tree demo-claim-2 started from — so every other byte this guard checks is still checked as before.
const DC2_FILES = ['app/(app)/manage/[token]/page.tsx', 'app/(app)/dashboard/[token]/page.tsx', 'app/(app)/dashboard/[token]/kds/page.tsx', 'app/api/manage/route.ts', 'app/api/manage/commit-menu/route.ts']
const DC2_START = '64ac2eb7'
const showAt = (rev, f) => { try { return git('show', `${rev}:${f}`) } catch { return null } }
const notDc2 = f => {
  if (!DC2_FILES.includes(f)) return true
  let then = showAt(BEFORE, MP.beforePath(f)) || showAt(BEFORE, f) || null   // `git show` of a path a revision lacks answers '' here
  if (then !== null) for (const [a, b] of MP.MOVE_EDITS[f] || []) then = then.split(a).join(b)
  return then === null || (showAt(DC2_START, f) || null) !== then
}
const DC2_KEY = k => k.startsWith('manageMenuImport.checkMenu.') || k === 'manageMenuImport.discard.carriedBody'
const DC2_NS_KEY = (f, k) => /\/manageMenuImport\.json$/.test(f) && (k.startsWith('checkMenu.') || k === 'discard.carriedBody')
const J = x => JSON.stringify(x)
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])

// ══ 1 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · the move')
const appFiles = walk('app').filter(f => !f.endsWith('.DS_Store'))
const routeFiles = appFiles.filter(f => /\/(page|layout|not-found|error|template|loading)\.tsx$/.test(f))
t('every page, layout, not-found, error, loading and template file is inside app/(app) or app/(public) (global-error and global-not-found aside)',
  routeFiles.every(f => /^app\/\((app|public)\)\//.test(f)), routeFiles.filter(f => !/^app\/\((app|public)\)\//.test(f)))
t('no app/layout.tsx: two root layouts — app/(app)/layout.tsx (today\'s, moved) and the public ones', !fs.existsSync(path.join(REPO, 'app/layout.tsx')) && fs.existsSync(path.join(REPO, 'app/(app)/layout.tsx')))
const PUBLIC_ROOTS = ['app/(public)/(site)/layout.tsx', 'app/(public)/[country]/layout.tsx']
t('the public root layouts are exactly (site) and [country]', J(appFiles.filter(f => /^app\/\(public\)\/[^/]+\/layout\.tsx$/.test(f) || f === 'app/(public)/layout.tsx').sort()) === J(PUBLIC_ROOTS.slice().sort()))
const PUBLIC_PAGES = ['app/(public)/(site)/1ng7n4p5omux2gdk9kqvwz/page.tsx', 'app/(public)/(site)/about/page.tsx', 'app/(public)/(site)/compare/page.tsx',
  'app/(public)/(site)/faq/page.tsx', 'app/(public)/(site)/features/page.tsx', 'app/(public)/(site)/landing/page.tsx', 'app/(public)/[country]/[section]/[slug]/page.tsx',
  'app/(public)/[country]/compare/page.tsx', 'app/(public)/[country]/faq/page.tsx', 'app/(public)/[country]/features/page.tsx', 'app/(public)/[country]/page.tsx']
t('the public pages are exactly group A minus /contact and the legal pages (Dominic\'s Q1 = B)', J(appFiles.filter(f => /^app\/\(public\)\/.*\/page\.tsx$/.test(f)).sort()) === J(PUBLIC_PAGES))
t('/contact, /privacy, /terms, /country-terms and /<c>/ legal pages stay on the app\'s layout',
  ['app/(app)/contact/page.tsx', 'app/(app)/(legal)/privacy/page.tsx', 'app/(app)/(legal)/terms/page.tsx', 'app/(app)/(legal)/country-terms/page.tsx',
    'app/(app)/[country]/(legal)/privacy/page.tsx', 'app/(app)/[country]/(legal)/terms/page.tsx', 'app/(app)/[country]/(legal)/country-terms/page.tsx'].every(f => fs.existsSync(path.join(REPO, f))))
t('outside the groups: only route handlers, metadata routes, the two global pages and the embed component',
  J([...new Set(appFiles.filter(f => !/^app\/\((app|public)\)\//.test(f)).map(f => f.split('/').slice(0, 2).join('/')))].sort())
  === J(['app/api', 'app/auth', 'app/demo', 'app/embed', 'app/global-error.tsx', 'app/global-not-found.tsx', 'app/llms.txt', 'app/robots.ts', 'app/sitemap.ts']))
const appChanged = MP.changedSince(BEFORE, ['app/(app)']).filter(notDc2)
t('🔴 every file under app/(app) is its pre-move self, byte for byte (the two import lines the move had to change, named in _moved-paths.cjs, aside)',
  appChanged.length === 0, appChanged)
t('the moved root layout, its provider and its stylesheet are byte-identical to before', ['app/(app)/layout.tsx', 'app/(app)/providers.tsx', 'app/(app)/globals.css']
  .every(f => read(f) === git('show', `${BEFORE}:${MP.beforePath(f)}`)))
t('the move\'s two import-line edits are exactly those (and the files are otherwise unchanged — the check above)', J(Object.keys(MP.MOVE_EDITS).sort()) === J(['app/(app)/contact/HatchGrabContact.tsx', 'app/(app)/kds/[kds_token]/page.tsx']))
const gnf = read('app/global-not-found.tsx')
t('an address no route matches renders today\'s 404: the app\'s document (lang, dir, data-brand, its stylesheet, PostHog, the session banner) around the app\'s not-found card (global-not-found)',
  /import NotFound from '\.\/\(app\)\/not-found'/.test(gnf) && /import '\.\/\(app\)\/globals\.css'/.test(gnf) && /<CSPostHogProvider host=\{host\}>\n\s*<NotFound \/>\n\s*<SessionAlertBanner \/>/.test(gnf)
  && /<html lang=\{lang\} data-brand=\{brand\} \{\.\.\.\(isRtlLang\(lang\) \? \{ dir: 'rtl' \} : \{\}\)\}>/.test(gnf))
t('🔴 …WITHOUT Geist, the app\'s layout or the script fonts: Next adds this file\'s fonts to every route\'s preloads, so Geist here meant Geist on every public page',
  !/\(app\)\/layout|Geist|script-fonts/.test(gnf.replace(/^\/\/.*$/gm, '')))
const NC = read('next.config.ts')
t('next.config: experimental globalNotFound and rootParams on; inlineCss NOT on (it cannot be limited to public pages)',
  /experimental: \{\s*globalNotFound: true,[\s\S]*?rootParams: true,\s*\}/.test(NC) && !/inlineCss/.test(NC.replace(/\/\*[\s\S]*?\*\//g, '')))

// ══ 2 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · the public layouts carry only what a public page needs (manual 35.ap-1)')
const resolve = (from, spec) => {
  let base
  if (spec.startsWith('@/')) base = path.join(REPO, spec.slice(2))
  else if (spec.startsWith('.')) base = path.join(path.dirname(path.join(REPO, from)), spec)
  else return { pkg: spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0], spec }
  for (const c of [base, base + '.ts', base + '.tsx', base + '.js', base + '/index.ts', base + '/index.tsx']) if (fs.existsSync(c) && fs.statSync(c).isFile()) return { file: path.relative(REPO, c) }
  return { missing: spec }
}
const staticImports = src => [...src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  .matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g)].map(m => m[1])
/** The STATIC import graph from the public entries: every module, which of them are client modules, and the packages each side reaches. */
function graph(entries) {
  const seen = new Map()   // file → { client }
  const pkgs = { server: new Set(), client: new Set() }
  const visit = (f, client) => {
    const prev = seen.get(f)
    if (prev && (prev.client || !client)) return
    const src = /\.(css)$/.test(f) ? '' : read(f)
    const isClient = client || /^\s*['"]use client['"]/.test(src)
    seen.set(f, { client: isClient })
    for (const spec of staticImports(src)) {
      const r = resolve(f, spec)
      if (r.file) visit(r.file, isClient)
      else if (r.pkg) pkgs[isClient ? 'client' : 'server'].add(r.spec)
    }
  }
  for (const e of entries) visit(e, false)
  return { seen, pkgs }
}
const PUBLIC_ENTRIES = [...PUBLIC_ROOTS, ...PUBLIC_PAGES, ...appFiles.filter(f => /^app\/\(public\)\/.*\/(not-found|error)\.tsx$/.test(f))]
const G = graph(PUBLIC_ENTRIES)
const files = [...G.seen.keys()]
const FORBIDDEN = ['components/auth/SessionAlertBanner.tsx', 'lib/script-fonts.ts', 'app/(app)/layout.tsx', 'app/(app)/providers.tsx', 'app/(app)/globals.css', 'lib/supabase-browser.ts', 'lib/supabase/client.ts']
t('🔴 no public page or layout statically imports the session banner, the all-language script fonts, the app\'s layout, provider or stylesheet, or the browser Supabase client',
  FORBIDDEN.every(f => !G.seen.has(f)), FORBIDDEN.filter(f => G.seen.has(f)))
const clientPkgs = [...G.pkgs.client]
t('🔴 nothing the browser runs on a public page imports @supabase/* or posthog-js statically', !clientPkgs.some(p => /^(@supabase\/|posthog-js)/.test(p)), clientPkgs.filter(p => /^(@supabase\/|posthog-js)/.test(p)))
t('no Geist and no leaflet anywhere in the public pages\' graph', !files.some(f => /Geist\(|Geist_Mono\(/.test(/\.css$/.test(f) ? '' : read(f))) && ![...G.pkgs.server, ...clientPkgs].some(p => p.startsWith('leaflet')))
const PD = read('components/public/PublicDocument.tsx')
t('PublicDocument: <html lang data-brand> (+ dir="rtl" for Arabic) and <body class="antialiased[ hg-script-<key>]"> — the script class only for that language',
  /<html lang=\{lang\} data-brand=\{brand\} \{\.\.\.\(isRtlLang\(lang\) \? \{ dir: 'rtl' \} : \{\}\)\}>/.test(PD) && /className=\{`antialiased\$\{script \? ` \$\{scriptClassOf\(script\)\}` : ''\}`\}/.test(PD)
  && /\{script && <ScriptFont script=\{script\} \/>\}/.test(PD))
const SF = read('lib/script-fonts.ts'), PS = read('lib/public-script.ts')
const chain = s => (s.match(/const l = String\(lang \?\? ''\)\.toLowerCase\(\)\n\s*if \(\/\^\(el\|bg\)\(-\|\$\)\/\.test\(l\)\) return (\S+)\n\s*return l\.startsWith\('ja'\) \? (\S+) : l\.startsWith\('zh'\) \? (\S+) : l\.startsWith\('th'\) \? (\S+) : l\.startsWith\('ar'\) \? (\S+) : null/) || []).slice(1)
t('lib/public-script.ts answers the language test of lib/script-fonts.ts, line for line (greek-cyrillic, ja, zh-hk, th, ar)',
  J(chain(SF)) === J(['greekCyrillic.variable', 'ja.variable', 'zhHk.variable', 'th.variable', 'ar.variable']) && J(chain(PS)) === J(["'greek-cyrillic'", "'ja'", "'zh-hk'", "'th'", "'ar'"])
  && /isRtl = \(lang: string \| null \| undefined\): boolean => \/\^\(ar\|he\|ur\)\(-\|\$\)\/i\.test/.test(SF) && /isRtlLang = \(lang: string \| null \| undefined\): boolean => \/\^\(ar\|he\|ur\)\(-\|\$\)\/i\.test/.test(PS))   // ⚠️ RE-PINNED (languages-world-1): + Hebrew; (languages-world-2, 11 November 2026): + Urdu
const callOf = (src, fn) => (src.match(new RegExp(`${fn}\\((\\{[^)]*\\})\\)`)) || [])[1]
const FONTS = { 'greek-cyrillic': 'Noto_Sans', ja: 'Noto_Sans_JP', 'zh-hk': 'Noto_Sans_HK', th: 'Noto_Sans_Thai', ar: 'Noto_Sans_Arabic' }
t('each script\'s own module makes lib/script-fonts.ts\'s font call exactly (family, subsets, variable, no preload, swap)',
  Object.entries(FONTS).every(([k, fn]) => { const m = read(`components/public/script-fonts/${k}.tsx`); return callOf(m, fn) && callOf(m, fn) === callOf(SF, fn) }))
t('…and sets that variable on `.hg-script-<key>` from next/font\'s own family string', Object.entries(FONTS).every(([k]) => {
  const v = (callOf(SF, FONTS[k]).match(/variable: '([^']+)'/) || [])[1]
  return read(`components/public/script-fonts/${k}.tsx`).includes(`<style href="hg-script-${k}" precedence="default">{\`.hg-script-${k}{${v}:\${font.style.fontFamily}}\`}</style>`) }))
t('ScriptFont loads each script\'s module with next/dynamic only (so its stylesheet reaches only that language\'s pages)',
  Object.keys(FONTS).every(k => read('components/public/ScriptFont.tsx').includes(`dynamic(() => import('./script-fonts/${k}'))`)) && !files.some(f => /^components\/public\/script-fonts\//.test(f)))
const GL = read('app/(app)/globals.css'), PCSS = read('app/(public)/public.css')
t('public.css is app/(app)/globals.css with exactly one line taken out — leaflet\'s map CSS — under a header comment',
  PCSS.replace(/^\/\*[\s\S]*?\*\/\n/, '') === GL.replace('@import "leaflet/dist/leaflet.css";\n', '') && GL.includes('@import "leaflet/dist/leaflet.css";\n'))
t('MarketingFrame (the shared header and footer) is unchanged apart from where landing.css now lives',
  read('components/landing/MarketingFrame.tsx') === git('show', `${BEFORE}:components/landing/MarketingFrame.tsx`).replace("import '@/app/landing/landing.css'", "import '@/app/(public)/(site)/landing/landing.css'"))

// ══ 3 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · built ahead and served from the CDN (manual 35.ap-2)')
const SECS = +(read('lib/marketing-tags.ts').match(/MARKETING_REVALIDATE_SECONDS = (\d+)/) || [])[1]
for (const [f, mod] of [['app/(public)/[country]/page.tsx', 'landing'], ['app/(public)/[country]/features/page.tsx', 'features'], ['app/(public)/[country]/faq/page.tsx', 'faq']]) {
  const s = read(f)
  t(`${f}: re-exports (site)/${mod}, revalidate = ${SECS} (the tags' 5-minute expiry), dynamicParams true, every country listed, nothing per request`,
    new RegExp(`export \\{ default, generateMetadata \\} from '\\.\\.(/\\.\\.)?/\\(site\\)/${mod}/page'`).test(s) && new RegExp(`^export const revalidate = ${SECS}$`, 'm').test(s)
    && /^export const dynamicParams = true$/m.test(s) && /Object\.values\(COUNTRY_PATH_SEGMENTS\)\.map\(country => \(\{ country \}\)\)/.test(s) && !/^export const dynamic\b/m.test(s))
}
for (const [f, page] of [['app/(public)/(site)/landing/page.tsx', 'landing'], ['app/(public)/(site)/features/page.tsx', 'features'], ['app/(public)/(site)/faq/page.tsx', 'faq']]) {
  const s = read(f)
  t(`${f}: at a country address it reads nothing from the request (resolveBuiltAheadCountry; the host check and ?country only without one)`,
    new RegExp(`resolveBuiltAheadCountry\\(segment, '${page}'\\)`).test(s) && !/resolveCountryAddress\(/.test(s) && !/segment: \(await params\)\?\.country/.test(s))
}
const CL = read('app/(public)/[country]/layout.tsx'), CNF = read('app/(public)/[country]/not-found.tsx')
t('the [country] root layout and its 404 read nothing from the request (no next/headers; the 404 reads next/root-params)',
  !/next\/headers|headers\(\)/.test(CL) && !/next\/headers|headers\(\)/.test(CNF) && /from 'next\/root-params'/.test(CNF) && /const HOST = 'www\.hatchgrab\.com'/.test(CL))
const PX = read('proxy.ts')
t('proxy.ts: a country-shaped address off HatchGrab or with no such country, and ANY one-segment address with no route or file of its own, get the app\'s own 404 (an unmatched rewrite) before anything else is read',
  PX.includes("const countryShaped = /^\\/([a-z]{2})(?:\\/(?:features|faq|compare)|\\/[a-z0-9-]+\\/[a-z0-9-]+)?$/.exec(pathname)")
  && PX.includes("const oneSegment = /^\\/([^/]+)$/.exec(pathname)")
  && PX.includes("  if ((countryShaped && (!countryOfSegment(countryShaped[1]) || !isHatchGrab(host)))\n    || (oneSegment && !countryOfSegment(oneSegment[1]) && !isOwnOneSegment(oneSegment[1]))) {\n    return NextResponse.rewrite(new URL('/__cwv2/no/such/country/page', request.url))")
  && PX.indexOf('const countryShaped') < PX.indexOf('request.headers.delete(PAGE_LANG_HEADER)') && PX.indexOf('const countryShaped') > PX.indexOf('export async function proxy('))
t('proxy.ts is otherwise exactly as before (the switched-off redirects, Village Foodie, the language header, the session)',
  // ⚠️ RE-PINNED (gsc-index-2, 9 November 2026): its /support block taken back exactly first (scripts/_lp-gsc-index-2.cjs asBefore).
  require('./_lp-gsc-index-2.cjs').asBefore('proxy.ts', PX).replace(/\n  \/\/ ── cwv-2 \(6 November 2026[\s\S]*?\n  \}\n\n/, '\n').replace("import { isOwnOneSegment } from '@/lib/top-level-routes'\n", '') === git('show', `${BEFORE}:proxy.ts`))
const TL = read('lib/top-level-routes.ts')
const listOf = name => JSON.parse('[' + (TL.match(new RegExp(`export const ${name}: readonly string\\[\\] = \\[([\\s\\S]*?)\\]`)) || [, ''])[1].replace(/'/g, '"') + ']')
const oneSeg = [...new Set(appFiles.map(f => f.split('/').slice(1).filter(p => !/^\(.*\)$/.test(p))).flatMap(p => (p.length === 2 && /^(page|route)\.(tsx?|js)$/.test(p[1]) && !p[0].startsWith('[') ? [p[0]]
  : p.length === 1 && /^(robots|sitemap)\.ts$/.test(p[0]) ? [p[0].startsWith('robots') ? 'robots.txt' : 'sitemap.xml'] : [])))].sort()
const pubFiles = fs.readdirSync(path.join(REPO, 'public'), { withFileTypes: true }).filter(e => e.isFile() && !e.name.startsWith('.')).map(e => e.name).sort()
t('lib/top-level-routes.ts names exactly the one-segment routes and the top-level public files there are (so proxy.ts sends nothing real to the 404)',
  J(listOf('ONE_SEGMENT_ROUTES')) === J(oneSeg) && J(listOf('PUBLIC_TOP_FILES')) === J(pubFiles), { routes: listOf('ONE_SEGMENT_ROUTES').length, oneSeg, pubFiles })
const RD = read('lib/marketing-render.ts')
t('a failed shared read THROWS on a built-ahead render (never stored with the page) and degrades exactly as before everywhere else',
  /export function markBuiltAheadRender\(\): void/.test(RD) && ['lib/comparison-flags.ts', 'lib/faq/public.ts'].every(f => {
    const s = read(f); return (s.match(/\} catch \(e\) \{ if \(isBuiltAheadRender\(\)\) throw e \/\* cwv-2: never stored with a built-ahead page \*\/ \}/g) || []).length === (f.endsWith('flags.ts') ? 1 : 3) && !/answered below, as before \*\/ \}/.test(s) }))
t('resolveBuiltAheadCountry marks the render, then is resolveCountryAddress (resolveCountryPage = the host check + the same)',
  /export async function resolveBuiltAheadCountry\(segment: string, page: MarketingPage\): Promise<VisitorCountry> \{\n\s*markBuiltAheadRender\(\)\n\s*return resolveCountryAddress\(segment, page\)/.test(read('lib/visitor-country.ts'))
  && /if \(!isHatchGrabHost\(\(await headers\(\)\)\.get\('host'\) \|\| ''\)\) notFound\(\)\n\s*return resolveCountryAddress\(segment, page\)/.test(read('lib/visitor-country.ts')))

// ══ 4 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · PostHog after idle; the demo pop-up off the first screen; the Greek arrow')
const PA = read('components/public/PublicAnalytics.tsx')
t('PublicAnalytics imports today\'s PostHog module (app/(app)/providers.tsx, unchanged) only with import(), after load and idle',
  /void import\('@\/app\/\(app\)\/providers'\)/.test(PA) && /requestIdleCallback/.test(PA) && /addEventListener\('load', whenIdle, \{ once: true \}\)/.test(PA) && !/^import .*posthog/m.test(PA))
t('nothing on a public page captures to PostHog itself (no posthog import, no usePostHog) — so no event needs queueing',
  !files.some(f => !/\.css$/.test(f) && /usePostHog\(|posthog\.capture\(|from 'posthog-js/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))))
const DU = read('components/landing/DemoUpload.tsx'), DB = read('components/landing/DemoModalBody.tsx'), DU0 = git('show', `${BEFORE}:components/landing/DemoUpload.tsx`)
const modal0 = DU0.slice(DU0.indexOf('// ── The modal ──')).replace("export function DemoModal() {\n  const { open, setOpen } = useDemoModal()\n", "export default function DemoModalBody({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {\n")
const consts0 = DU0.slice(DU0.indexOf('\ntype Phase = '), DU0.indexOf('// ── Context ──'))
t('🔴 the pop-up\'s code moved byte for byte into DemoModalBody.tsx (only its signature takes open/setOpen as props)', DB.endsWith(consts0 + modal0))
t('the context, the provider and the buttons are as before; the buttons only add the preload on point / focus / touch',
  DU.includes(DU0.slice(DU0.indexOf('// ── Context ──'), DU0.indexOf('// ── The modal ──')).replace('onClick={() => setOpen(true)}>', 'onClick={() => setOpen(true)}\n      onPointerEnter={preloadDemoModal} onFocus={preloadDemoModal} onTouchStart={preloadDemoModal}>')))
t('the pop-up renders nothing until first opened, then stays mounted; its code loads on idle or on intent (next/dynamic, ssr: false)',
  /const DemoModalBody = dynamic\(\(\) => import\('\.\/DemoModalBody'\), \{ ssr: false \}\)/.test(DU) && /if \(open && !shown\) setShown\(true\)/.test(DU) && /return shown \? <DemoModalBody open=\{open\} setOpen=\{setOpen\} \/> : null/.test(DU))
const DEMO = ['app/api/demo', 'app/api/signup/route.ts', 'app/(app)/try', 'app/demo', 'lib/demo-events.ts', 'lib/provision-demo-event.ts', 'lib/demo-board-build.ts', 'lib/demo-session.ts']
const demoChanged = MP.changedSince(BEFORE, DEMO)
t('🔴 the demo funnel is untouched: its routes (/api/demo, the build request, the walkthrough, signup), /try, /demo/<ref> and lib/demo-events.ts (public.demo_events) — and the pop-up still posts to /api/demo and /api/demo/build-request',
  demoChanged.length === 0 && DB.includes("fetch('/api/demo', { method: 'POST', body: fd, signal: ac.signal })") && DB.includes("fetch('/api/demo/build-request', {"), demoChanged)
const leaves = (o, p = '') => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => leaves(v, p ? `${p}.${k}` : k)) : [[p, o]])
// ⚠️ RE-PINNED (pricing-copy-2, 11 November 2026): the two language checks below compare cwv-2's OWN commits — the parent of its first
// commit after BEFORE against its last — instead of BEFORE against the working tree. Every later brief that touched every language file
// (languages-world-1's new keys, billing-2/3, pricing-copy-1/2, …) otherwise had to be named here one by one (AP1, IOS, DC2, JP_NAV
// below are those names); anchored on cwv-2's commits, the checks still prove exactly what cwv-2 changed and nothing later can move them.
const CWV2 = git('log', '--format=%H', '--reverse', `${BEFORE}..HEAD`, '--grep=^cwv-2:').trim().split('\n').filter(Boolean)
const CWV2_FROM = CWV2.length ? git('rev-parse', `${CWV2[0]}~1`).trim() : BEFORE, CWV2_TO = CWV2.length ? CWV2[CWV2.length - 1] : 'HEAD'
t('cwv-2\'s commits are found after its base (the anchor the language checks use)', CWV2.length >= 2, CWV2)
const el = Object.fromEntries(leaves(JSON.parse(git('show', `${CWV2_TO}:messages/el-GR.json`)))), el0 = Object.fromEntries(leaves(JSON.parse(git('show', `${CWV2_FROM}:messages/el-GR.json`))))
// ⚠️ RE-PINNED (compare-autopublish-1, 7 November 2026): that brief's own keys — the contact form's "comparison" topic, the "Not listed"
// methodology sentence (no help centre), the comparison page's methodology and admin words — are left out of both checks below.
const AP1_KEY = k => k === 'contactPage.form.topics.comparison' || k === 'comparisonSuits.method.notListed' || k.startsWith('comparison.')
// ⚠️ RE-PINNED (ios-intl-1, 9 November 2026): every language gained nativeShell.binary.* — the iOS app's permission prompts and offline
// screen, generated into the binary (scripts/ios/native-strings.cjs; scripts/ios-intl-1.cjs proves them). A NEW key in that one subtree only.
const IOS_KEY = k => k.startsWith('nativeShell.binary.')
const elChanged = Object.keys({ ...el, ...el0 }).filter(k => el[k] !== el0[k] && !AP1_KEY(k) && !IOS_KEY(k) && !DC2_KEY(k))
t('Greek: exactly one value changed — landing.hero.cta, a non-breaking space before the arrow (el-GR; el-CY inherits it)',
  J(elChanged) === J(['landing.hero.cta']) && el['landing.hero.cta'] === el0['landing.hero.cta'].replace(' →', ' →') && !/"cta"/.test(read('messages/el-CY.json').slice(0, 0)))
const nsAp1 = f => /^messages\/ns\/[a-z]{2}-[A-Z]{2}\/(contactPage|comparisonSuits|comparison)\.json$/.test(f)
// A changed file passes when it is the Greek pair, a split file of a compare-autopublish-1 namespace, or every changed key is that brief's.
// ⚠️ RE-PINNED (jp-nav-1, 9 November 2026): Japanese's short nav label gained one zero-width space after "メニューを" (its break
// opportunity on a phone; scripts/jp-nav-1.cjs). That key passes only when its value is the old one with exactly that space added.
const JP_NAV = (k, a, b) => (k === 'landingNav.ctaShort' || k === 'ctaShort') && typeof b === 'string' && a === b.replace('メニューを', 'メニューを\u200B')
const onlyAp1 = f => { try { const a = Object.fromEntries(leaves(JSON.parse(read(f)))), b = Object.fromEntries(leaves(JSON.parse(git('show', `${BEFORE}:${f}`)))); return Object.keys({ ...a, ...b }).filter(k => a[k] !== b[k]).every(k => AP1_KEY(k) || IOS_KEY(k) || DC2_KEY(k) || (DC2_NS_KEY(f, k) && b[k] === undefined) || (/\/nativeShell\.json$/.test(f) && k.startsWith('binary.') && b[k] === undefined) || (/ja-JP/.test(f) && JP_NAV(k, a[k], b[k]))) } catch { return false } }
// ⚠️ RE-PINNED (pricing-copy-2): the files cwv-2's own commits changed (not the working tree's difference from BEFORE).
const otherLangFiles = [...new Set(CWV2.flatMap(c => git('show', '--name-only', '--format=', c, '--', 'messages/').trim().split('\n')))].filter(f => /\.json$/.test(f))
  .filter(f => !(f === 'messages/el-GR.json' || f === 'messages/ns/el-GR/landing.json' || nsAp1(f) || onlyAp1(f)))
t('no other language file changed (the generated split file messages/ns/el-GR/landing.json follows el-GR)', otherLangFiles.length === 0, otherLangFiles)

// ══ 5 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · nothing in ordering, payments, the KDS, the dashboard or Manage (Pizzeria Gusto unaffected)')
const CRIT = ['app/api/orders', 'app/api/payments', 'app/api/webhooks', 'app/api/menu', 'app/api/kds', 'app/api/dashboard', 'app/api/manage', 'lib/payments', 'lib/orders', 'lib/printing',
  'lib/order-charges.ts', 'lib/order-charge-rules.ts', 'lib/menu-loader.ts', 'app/(app)/order', 'app/(app)/o', 'app/(app)/trucks', 'app/(app)/kds', 'app/(app)/dashboard', 'app/(app)/manage',
  'app/(app)/p', 'components/dashboard'].filter(p => fs.existsSync(path.join(REPO, p)))
const critChanged = MP.changedSince(BEFORE, CRIT).filter(notDc2)
t(`🔴 ${CRIT.length} ordering, payment, KDS, dashboard and Manage paths: unchanged since ${BEFORE} (the move aside)`, CRIT.length >= 18 && critChanged.length === 0, critChanged)

console.log(`\n${fail ? '🔴' : '✅'} cwv-2: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
