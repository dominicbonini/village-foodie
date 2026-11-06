#!/usr/bin/env node
// scripts/cwv-1.cjs — cwv-1 (5 November 2026, docs/cwv-1-report.md): the public HatchGrab pages lighter on a phone, with no visible
// change; real visitors' page speed in PostHog for those pages only; the Czech and Greek pages no wider than a 360px phone.
//   node scripts/cwv-1.cjs            (swept; NO NETWORK, NO DATABASE — source checks and pure functions)
//   1 · fonts: Archivo's italic is declared, not preloaded; the upright Archivo, Public Sans and the chrome's classes as before
//   2 · public pages: lib/public-page.ts's shape is true for every country's public addresses and false for every app route
//   3 · PostHog: web vitals (LCP, INP, CLS) only for a visit that starts on a public HatchGrab page, and `$web_vitals` sent only when its
//       path AND every measurement's own address are public (isPublicWebVitals, with cases); nothing else in app/providers.tsx changed
//   4 · the Czech / Greek block in landing.css (Dominic's B): ≤400px, language-scoped, appended — bands and the Greek hero button may
//       wrap, no heading rule; the rest of the file byte-identical
//   5 · scope: nothing else in the app changed since the commit this work started from (the root layout and proxy untouched)
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'cwv-1' })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const git = (...a) => execFileSync('git', a, { cwd: REPO, maxBuffer: 256e6 }).toString()
const BEFORE = 'b5a43927'   // main when this work started (manual-loyalty-1)
// This work's commit, once it exists: the scope check (7) reads its own diff, so later work elsewhere never fails it.
const OWN = (() => { try { return git('log', '--format=%H', '--grep=^cwv-1: the public pages', '-n', '1').trim() } catch { return '' } })()

;(async () => {
  // ══ 1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · fonts — Archivo italic declared, not preloaded')
  const MF = read('components/landing/MarketingFrame.tsx')
  t('the upright Archivo: latin, normal, --font-archivo, swap — preloaded (no preload: false)',
    /^const archivo = Archivo\(\{ subsets: \['latin'\], style: \['normal'\], variable: '--font-archivo', display: 'swap' \}\)$/m.test(MF))
  t('its italic: a second instance, same family, latin, swap, preload: false, no variable, no fallback face of its own',
    /^const archivoItalic = Archivo\(\{ subsets: \['latin'\], style: \['italic'\], display: 'swap', preload: false, adjustFontFallback: false \}\)$/m.test(MF))
  t('exactly two Archivo calls, both in MarketingFrame; none anywhere else in app/, components/ or lib/',
    (MF.match(/Archivo\(\{/g) || []).length === 2
    && git('grep', '-l', 'Archivo({', '--', 'app', 'components', 'lib').trim().split('\n').filter(Boolean).join() === 'components/landing/MarketingFrame.tsx')
  t('Public Sans and Courier Prime and the chrome class string are as before',
    MF.includes("const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' })")
    && MF.includes("const courierPrime = Courier_Prime({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-courier-prime', display: 'swap', preload: false })")
    && MF.includes('const CHROME = `hg-landing ${archivo.variable} ${publicSans.variable} ${courierPrime.variable}`'))
  t('the italic is still used where it was (landing.css: the quote mark, the testimonial, the step numbers)',
    (read('app/(public)/(site)/landing/landing.css').match(/font-style: italic/g) || []).length >= 3)

  // ══ 2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · which requests are public pages')
  const PP = await kit.bundle('cwv1-pp', "export * from '@/lib/public-page'")
  const MC = await kit.bundle('cwv1-mc', "export * from '@/lib/marketing-country'; export { legalAddressOf } from '@/lib/legal'")
  const segments = Object.values(MC.COUNTRY_PATH_SEGMENTS)
  const comparisonPaths = fs.readdirSync(path.join(REPO, 'messages')).filter(f => /^[a-z]{2}-[A-Z]{2}\.json$/.test(f))
    .map(f => JSON.parse(read('messages/' + f)).comparison?.path).filter(Boolean)
  const publicAddrs = ['/about', '/contact', '/privacy', '/terms', '/country-terms']
  for (const s of segments) for (const x of ['', '/features', '/faq', '/compare', '/privacy', '/terms', '/country-terms']) publicAddrs.push(`/${s}${x}`)
  for (const s of segments) for (const c of comparisonPaths) publicAddrs.push(`/${s}/${c.section}/${c.slug}`)
  t(`every public address has the shape (${publicAddrs.length}: ${segments.length} countries × 7 pages, each country × ${comparisonPaths.length} comparison addresses, 5 English pages)`,
    publicAddrs.every(p => PP.isPublicPagePath(p)), publicAddrs.filter(p => !PP.isPublicPagePath(p)).slice(0, 5))
  t('…and they are real: every segment is a country (countryOfSegment), its pages and legal documents the proxy\'s own addresses',
    segments.every(s => MC.countryOfSegment(s) && MC.countryPageOf(`/${s}`) && MC.countryPageOf(`/${s}/faq`) && MC.legalAddressOf(`/${s}/privacy`)))
  const appRoutes = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/setup', '/admin', '/app', '/hire',
    '/manage/abc-123', '/dashboard/abc-123', '/dashboard/abc-123/kds', '/kds/x', '/order/abc', '/trucks/pizzeria-gusto', '/trucks/pizzeria-gusto/order',
    '/try/pizzeria-gusto', '/demo/ref1', '/embed/pizzeria-gusto', '/o/abc', '/p/abc', '/docs/tok', '/venues/x', '/domain', '/api/revalidate',
    '/uk/comparison/food-truck-ordering-system.md', '/uk/comparison/food-truck-ordering-system.json', '/uk/', '/landing', '/features', '/faq', '/compare', '/llms.txt', '/sitemap.xml']
  t(`no app route, twin or redirecting address has the shape (${appRoutes.length} checked)`, appRoutes.every(p => !PP.isPublicPagePath(p)), appRoutes.filter(p => PP.isPublicPagePath(p)))
  t('the app\'s top-level routes: none is two letters (so `/xx…` can only be a country address)',
    fs.readdirSync(path.join(REPO, 'app'), { withFileTypes: true }).filter(d => d.isDirectory() && /^[a-z]{2}$/.test(d.name)).length === 0)

  // ══ 3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · PostHog — web vitals on the public pages only')
  const PV = read('app/(app)/providers.tsx')
  t('IS_PUBLIC_ENTRY: read once at module evaluation — a HatchGrab host AND a public page\'s address',
    PV.includes("const IS_PUBLIC_ENTRY =\n  typeof window !== 'undefined' && window.location.hostname.includes('hatchgrab') && isPublicPagePath(window.location.pathname)"))
  t('capture_performance only for that entry: web_vitals true, exactly LCP, INP and CLS (the one capture_performance in the file)',
    PV.includes("...(IS_PUBLIC_ENTRY ? { capture_performance: { web_vitals: true, web_vitals_allowed_metrics: ['LCP', 'INP', 'CLS'] as ('LCP' | 'INP' | 'CLS')[] } } : {}),")
    && (PV.match(/capture_performance/g) || []).length === 1)
  t('before_send: credential paths dropped as before; `$web_vitals` dropped unless its path AND every measurement\'s address are public',
    PV.includes('if (isCredentialPath(path)) return null') && PV.includes("if (event.event === '$web_vitals' && !isPublicWebVitals(path, props)) return null")
    && PV.indexOf('if (isCredentialPath(path)) return null') < PV.indexOf("if (event.event === '$web_vitals'"))
  const H = 'https://www.hatchgrab.com', m = (u) => ({ name: 'X', value: 1, $current_url: u })
  const WV = [
    ['/uk, its LCP measured on /uk', '/uk', { $web_vitals_LCP_event: m(H + '/uk'), $web_vitals_LCP_value: 1 }, true],
    ['/uk/faq, LCP + INP + CLS all on /uk/faq', '/uk/faq', { $web_vitals_LCP_event: m(H + '/uk/faq'), $web_vitals_INP_event: m(H + '/uk/faq'), $web_vitals_CLS_event: m(H + '/uk/faq?x=1') }, true],
    ['sent on /uk, but an INP measured on /dashboard/<token>', '/uk', { $web_vitals_LCP_event: m(H + '/uk'), $web_vitals_INP_event: m(H + '/dashboard/example-truck-0123456789ab') }, false],
    ['sent on /uk, but a CLS measured on /signup', '/uk', { $web_vitals_CLS_event: m(H + '/signup') }, false],
    ['sent on /signup (measured on /uk)', '/signup', { $web_vitals_LCP_event: m(H + '/uk') }, false],
    ['a measurement with no address', '/uk', { $web_vitals_LCP_event: { name: 'LCP', value: 1 } }, false],
    ['a measurement with an unreadable address', '/uk', { $web_vitals_LCP_event: m('not a url') }, false],
    ['no path at all', '', { $web_vitals_LCP_event: m(H + '/uk') }, false],
  ]
  for (const [label, p, props, want] of WV) t(`isPublicWebVitals: ${label} → ${want ? 'sent' : 'dropped'}`, PP.isPublicWebVitals(p, props) === want)
  const pvBefore = git('show', `${BEFORE}:app/providers.tsx`)
  const stripped = PV.replace(/import \{ isPublicPagePath, isPublicWebVitals \}[^\n]*\n/, '')
    .replace(/\/\*\*\n \* cwv-1 \(5 November 2026[\s\S]*?isPublicPagePath\(window\.location\.pathname\)\n\n/, '')
    .replace(/\n\s*\/\/ cwv-1 \(5 November 2026, docs\/cwv-1-report\.md\): REAL VISITORS[\s\S]*?: \{\}\),/, '')
    .replace(/if \(isCredentialPath\(path\)\) return null\n[\s\S]*?return event\n/, 'return isCredentialPath(path) ? null : event\n')
  t('nothing else in providers.tsx changed (the guards, the init options, the provider, the provider\'s timing)', stripped === pvBefore)
  // ⚠️ RE-PINNED (cwv-2, 6 November 2026, docs/cwv-2-report.md §6): a diff BETWEEN TWO OLD COMMITS names each file as it was there (the
  // routes moved in cwv-2) — beforePath gives that name; in the working-tree branch changedSince is blind to the move and nothing else.
  const { beforePath, changedSince } = require('./_moved-paths.cjs')
  t('the root layout and the proxy are untouched', (OWN ? git('diff', '--name-only', `${OWN}^`, OWN, '--', beforePath('app/(app)/layout.tsx'), 'proxy.ts') : changedSince(BEFORE, ['app/(app)/layout.tsx', 'proxy.ts']).join('\n')).trim() === '')

  // ══ 4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · Czech and Greek at 360px')
  const CSS = read('app/(public)/(site)/landing/landing.css'), cssBefore = git('show', `${BEFORE}:app/landing/landing.css`)
  const RULES = '@media (max-width: 400px) {\n  :root:lang(el) .hg-landing .hero-cta-row .btn-lg { white-space: normal; }\n  :root:is(:lang(cs), :lang(el)) .hg-landing .cheap-band { white-space: normal; }\n}\n'
  t('the block is ≤400px and language-scoped: the Greek hero button may wrap; the Czech / Greek bands may wrap (Dominic\'s B)', CSS.endsWith(RULES))
  t('no heading rule: nothing in the block touches the hero h1, hyphens or overflow-wrap', !/h1|hyphens|overflow-wrap/.test(RULES))
  t('the rule it relaxes is still the one-line hero button rule above it', CSS.includes('.hg-landing .hero-cta-row .btn-lg { width: 100%; justify-content: center; white-space: nowrap; }'))
  t('it is appended: every byte before it is the file as it was', CSS.startsWith(cssBefore) && /^\n\/\* ── cwv-1[\s\S]*\*\/\n$/.test(CSS.slice(cssBefore.length, CSS.length - RULES.length)))

  // ══ 5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · scope')
  const EXPECTED = ['app/(public)/(site)/landing/landing.css', 'app/(app)/providers.tsx', 'components/landing/MarketingFrame.tsx', 'lib/public-page.ts'].map(f => (OWN ? beforePath(f) : f)).sort()
  const changed = (OWN ? git('diff', '--name-only', `${OWN}^`, OWN) : git('diff', '--name-only', BEFORE) + git('ls-files', '--others', '--exclude-standard'))
    .split('\n').filter(f => f && !/^(docs|scripts)\//.test(f))
  t(`the app files this work changed are exactly these ${EXPECTED.length}${OWN ? ` (its commit ${OWN.slice(0, 8)})` : ' (the working tree)'}`,
    [...new Set(changed)].sort().join() === EXPECTED.join(), [...new Set(changed)].sort())

  console.log(`\n${fail ? '🔴' : '✅'} cwv-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
