#!/usr/bin/env node
// scripts/vercel-cost-1.cjs — vercel-cost-1 (23 November 2026, docs/vercel-cost-1-report.md): THE MARKETING COUNTRY PAGES WITH NO TIMER,
// BUILT AHEAD ONLY FOR THE BUSIEST COUNTRIES, REFRESHED ON DEMAND — AND NOTHING IN LIVE ORDERING CHANGED.
//   node scripts/vercel-cost-1.cjs     (swept; NO NETWORK, NO DATABASE, NO BUILD, NO .env FILE — source and git checks only)
// The first-visit and refresh proofs need a production build on the stand-in database: scripts/vercel-cost-1-local.cjs (by hand).
//   1 · no timer: the three country page modules revalidate = false, dynamicParams true; the shared data has no expiry and is keyed by
//       deployment; nothing else under app/(public) or the marketing cache sets a numeric revalidate
//   2 · built ahead: lib/built-ahead-countries.ts — the English-speaking six first, every one a real address; the pages use it
//   3 · on demand: /api/revalidate unchanged since BASE (perf-1's secure route); scripts/revalidate-pages.cjs refreshes every tag when
//       run directly and never reads a .env file; every writer calls it (Admin in-process, the translator, the competitor check,
//       db-migrate.cjs); both workflows pass REVALIDATE_SECRET
//   4 · compare and the three legal pages are still rendered per request (no ISR entry, nothing to rebuild)
//   5 · 🔴 LIVE ORDERING: every ordering, payment, KDS, dashboard, heartbeat, auth, Manage, admin and app path — and every cache they share
//       with the marketing pages — is byte-identical to BASE; and this work's own files are exactly the list below
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
/** The commit before vercel-cost-1. */
const BASE = 'd309e4ef'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])

const PAGES = ['app/(public)/[country]/page.tsx', 'app/(public)/[country]/features/page.tsx', 'app/(public)/[country]/faq/page.tsx']

// ══ 1 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · no timer')
for (const f of PAGES) {
  const s = read(f)
  t(`${f}: revalidate = false, dynamicParams = true (cwv-2: false would 404 a page not built ahead), no dynamic export`,
    /^export const revalidate = false$/m.test(s) && !/^export const revalidate = \d/m.test(s) && /^export const dynamicParams = true$/m.test(s) && !/^export const dynamic\b/m.test(s))
}
const tags = read('lib/marketing-tags.ts'), mc = noComments(read('lib/marketing-cache.ts'))
t('lib/marketing-tags.ts: MARKETING_REVALIDATE = false, and no seconds constant left', /^export const MARKETING_REVALIDATE = false$/m.test(tags) && !/MARKETING_REVALIDATE_SECONDS\s*=/.test(tags))
t('lib/marketing-cache.ts: every shared read is unstable_cache(read, [\'perf-1\', key, DEPLOYMENT_KEY], { tags, revalidate: MARKETING_REVALIDATE })',
  /cache\(unstable_cache\(read, \['perf-1', key, DEPLOYMENT_KEY\], \{ tags, revalidate: MARKETING_REVALIDATE \}\)\)/.test(mc) && (mc.match(/unstable_cache\(/g) || []).length === 1)
t('DEPLOYMENT_KEY: Vercel\'s deployment id, else the commit, else "local" (an entry from older code is never read by newer code)',
  /export const DEPLOYMENT_KEY = process\.env\.VERCEL_DEPLOYMENT_ID \|\| process\.env\.VERCEL_GIT_COMMIT_SHA \|\| 'local'/.test(mc))
t('lib/faq/public-cache.ts reads only through shared() (so it inherits both), with no revalidate of its own',
  !/unstable_cache|revalidate/.test(noComments(read('lib/faq/public-cache.ts'))) && /shared\('faq-page'/.test(read('lib/faq/public-cache.ts')))
{
  const pub = walk('app/(public)').filter(f => /\.(ts|tsx)$/.test(f))
  // ⚠️ RE-PINNED (compare-cache-1, 27 November 2026, docs/compare-cache-1-report.md): the comparison page is the ONE deliberate exception —
  // Dominic's 30-day revalidate (2,592,000 s), refreshed on demand under its own tag comparison-<CC> (scripts/compare-cache-1.cjs proves it).
  const CMP = 'app/(public)/[country]/[section]/[slug]/page.tsx'
  const numeric = pub.filter(f => f !== CMP).filter(f => /^export const revalidate = \d/m.test(read(f)) || /next:\s*\{\s*revalidate:\s*\d/.test(read(f)) || /unstable_cache\(/.test(read(f)))
  t(`no file under app/(public) (${pub.length}) sets a numeric revalidate, a fetch revalidate or its own unstable_cache — but the comparison page's 30 days`, numeric.length === 0 && /^export const revalidate = 2592000/m.test(read(CMP)), numeric)
}

// ══ 2 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · built ahead: only the busiest countries')
{
  const src = read('lib/built-ahead-countries.ts')
  const list = JSON.parse((src.match(/BUILT_AHEAD_COUNTRIES: readonly string\[\] = (\[[^\]]*\])/) || [])[1].replace(/'/g, '"'))
  const segs = read('lib/marketing-country.ts')
  t(`the list is ${list.join(' ')}: the English-speaking six first (GB US IE AU NZ CA), then FR and DE`, JSON.stringify(list.slice(0, 6)) === JSON.stringify(['GB', 'US', 'IE', 'AU', 'NZ', 'CA']) && list.length === 8 && list.includes('FR') && list.includes('DE'))
  t('every listed country has an address in COUNTRY_PATH_SEGMENTS (so no undefined segment is built)', list.every(c => new RegExp(`\\b${c}: '[a-z]{2}'`).test(segs)), list)
  t('lib/built-ahead-countries.ts is pure (no import)', !/^import /m.test(src))
  for (const f of PAGES) t(`${f}: generateStaticParams maps BUILT_AHEAD_COUNTRIES to their addresses, and nothing else`,
    /export function generateStaticParams\(\) \{\n  return BUILT_AHEAD_COUNTRIES\.map\(code => \(\{ country: COUNTRY_PATH_SEGMENTS\[code\] \}\)\)\n\}/.test(read(f)) && !/Object\.values\(COUNTRY_PATH_SEGMENTS\)/.test(noComments(read(f))))
}

// ══ 3 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · refreshed on demand')
const unchanged = f => { try { return git('show', `${BASE}:${f}`) === read(f) } catch { return false } }
// ⚠️ RE-PINNED (compare-cache-1, 27 November 2026): the route's allow-list also takes comparison-<CC> (Dominic's decision 1); perf-1's rules
// are checked as rules now — POST only, the secret in a header compared in constant time (lib/revalidate-secret.ts byte-identical), 503 unset.
{ const r = read('app/api/revalidate/route.ts')
t('app/api/revalidate/route.ts keeps perf-1\'s rules (POST only, REVALIDATE_SECRET in a header, constant time, allow-listed tags, 503 when unset); lib/revalidate-secret.ts byte-identical to BASE',
  unchanged('lib/revalidate-secret.ts') && /export async function POST\(/.test(r) && !/export async function (GET|PUT|DELETE)/.test(r) && /if \(!expected\) return NextResponse\.json\(\{ error: 'Revalidation is not configured\.' \}, \{ status: 503 \}\)/.test(r)
  && /secretMatches\(req\.headers\.get\('x-revalidate-secret'\), expected\)/.test(r) && /!tags\.every\(isRefreshTag\)/.test(r) && /status: 400/.test(r)) }
{
  const rp = read('scripts/revalidate-pages.cjs')
  t('scripts/revalidate-pages.cjs, run directly: every tag by default (or the tags named), exit 0 only on a 200', /if \(require\.main === module\) \{\n  const named = process\.argv\.slice\(2\)\n  revalidatePages\(named\.length \? named : TAGS/.test(rp) && /process\.exit\(ok \? 0 : 1\)/.test(rp))
  t('…its tag list is the route\'s allow-list', /const TAGS = \['marketing-countries', 'marketing-plans', 'marketing-faq'\]/.test(rp) && /countries: 'marketing-countries',\n  plans: 'marketing-plans',\n  faq: 'marketing-faq',/.test(tags))
  t('…reads REVALIDATE_SECRET from process.env only — no .env file, no dotenv', /process\.env\.REVALIDATE_SECRET/.test(rp) && !/['"`/]\.env|dotenv|readFileSync/.test(noComments(rp)))
  t('…and its warning no longer promises "within 5 minutes"', !/within 5 minutes/.test(rp) && !/within 5 minutes/.test(read('scripts/competitor-check/main.ts')))
}
t('Admin\'s writes expire the tags in-process: Countries, its comparison status, Billing\'s payment model, FAQ',
  /revalidateMarketing\(\[MARKETING_TAGS\.countries\], 'admin\/countries'\)/.test(read('app/api/admin/countries/route.ts'))
  && /revalidateMarketing\(\[MARKETING_TAGS\.countries\], 'admin\/countries\/comparison'\)/.test(read('app/api/admin/countries/comparison/route.ts'))
  && /revalidateMarketing\(\[MARKETING_TAGS\.countries\], 'admin\/billing country model'\)/.test(read('app/api/admin/billing/route.ts'))
  && /revalidateMarketing\(\[MARKETING_TAGS\.faq\], 'admin\/faq'\)/.test(read('app/api/admin/faq/route.ts')))
t('the FAQ translator refreshes after a run that wrote; the competitor check after a verdict changed; db-migrate.cjs after every migration',
  /if \(!dryRun && !fixtures && \(report\.done > 0 \|\| report\.removed > 0\)\) \{[\s\S]{0,400}revalidatePages\(\['marketing-faq'\]/.test(read('scripts/faq-translate/main.ts'))
  && /revalidate: \(codes, liveChanged\) => revalidateCountries\(codes, liveChanged,/.test(read('scripts/competitor-check/main.ts'))   // ⚠️ RE-PINNED (compare-cache-1): the changed countries only
  && /require\('\.\/revalidate-pages\.cjs'\)\.revalidatePages\(undefined, \{ why: `migration \$\{rel\}`/.test(read('scripts/db-migrate.cjs')))
t('both workflows pass REVALIDATE_SECRET from the repository secrets',
  ['.github/workflows/faq-translate.yml', '.github/workflows/competitor-check.yml'].every(f => /REVALIDATE_SECRET: \$\{\{ secrets\.REVALIDATE_SECRET \}\}/.test(read(f))))
t('no competitor table feeds a cached page: the landing reads only the comparison SWITCHES (country_settings, tag marketing-countries); the comparison pages themselves are per request',
  /comparisonFlagsOf/.test(read('app/(public)/(site)/landing/page.tsx')) && !/comparisonPage\(|comparisonData\(|comparison_entries|competitors/.test(noComments(read('app/(public)/(site)/landing/page.tsx')))
  // ⚠️ RE-PINNED (compare-cache-1, 27 November 2026): the comparison pages are cached now — for 30 days, under their own tag comparison-<CC>
  // ONLY (never marketing-countries, so no landing or migration refresh touches them; scripts/compare-cache-1.cjs).
  && /^export const revalidate = 2592000/m.test(read('app/(public)/[country]/[section]/[slug]/page.tsx')) && !/force-dynamic/.test(noComments(read('app/(public)/[country]/[section]/[slug]/page.tsx'))))

// ══ 4 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · compare and the legal pages: per request, unchanged')
for (const f of ['app/(public)/[country]/compare/page.tsx', 'app/(app)/[country]/(legal)/privacy/page.tsx', 'app/(app)/[country]/(legal)/terms/page.tsx', 'app/(app)/[country]/(legal)/country-terms/page.tsx'])
  t(`${f}: force-dynamic (no ISR entry, no timer) and byte-identical to BASE`, /^export const dynamic = 'force-dynamic'$/m.test(read(f)) && unchanged(f))

// ══ 5 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · 🔴 live ordering unchanged')
const ORDERING = [
  'app/(app)/trucks', 'app/(app)/order', 'app/(app)/o', 'app/(app)/p', 'app/(app)/dashboard', 'app/(app)/kds', 'app/(app)/manage', 'app/(app)/admin',
  'app/(app)/login', 'app/(app)/signup', 'app/(app)/setup', 'app/(app)/forgot-password', 'app/(app)/reset-password', 'app/(app)/verify-email', 'app/(app)/app', 'app/(app)/layout.tsx', 'app/(app)/providers.tsx',
  'app/api/orders', 'app/api/menu', 'app/api/events', 'app/api/slots', 'app/api/dashboard', 'app/api/heartbeat', 'app/api/stripe', 'app/api/webhooks', 'app/api/payments',
  'app/api/auth', 'app/api/manage', 'app/api/admin', 'app/api/native', 'app/api/printing', 'app/api/account', 'app/api/cron', 'app/api/ping', 'app/api/signup', 'app/api/setup',
  'components/dashboard', 'components/manage', 'components/admin', 'components/native', 'components/WebOfflineBanner.tsx',
  'lib/orders', 'lib/payments', 'lib/auth', 'lib/native', 'lib/printing', 'lib/admin', 'lib/billing', 'lib/stripe.ts', 'lib/slot-availability.ts', 'lib/slot-bookings.ts', 'lib/slot-capacity.ts',
  'lib/menu-loader.ts', 'lib/order-calculations.ts', 'lib/order-charges.ts', 'lib/preorder.ts', 'proxy.ts', 'vercel.json', 'next.config.ts', 'android', 'ios', 'capacitor.config.ts',
].filter(p => fs.existsSync(path.join(REPO, p)))
/** The caches ordering shares with the marketing pages (the in-memory 60-second readers and what they call) — left exactly as they were. */
const SHARED = ['lib/country-settings.ts', 'lib/plans-server.ts', 'lib/comparison-flags.ts', 'lib/comparison-server.ts', 'lib/faq/public.ts', 'lib/supabase.ts',
  'lib/marketing-render.ts', 'lib/visitor-country.ts', 'lib/marketing-country.ts', 'lib/country-settings-types.ts', 'lib/plans.ts']
{
  const changed = git('diff', '--name-only', BASE, '--', ...ORDERING).trim()
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...ORDERING).trim()
  t(`🔴 ${ORDERING.length} ordering, checkout, payment, KDS, dashboard, Add order, heartbeat, auth, Manage, admin and app paths: byte-identical to ${BASE} (committed and working tree), no new file`,
    changed === '' && untracked === '', { changed, untracked })
  const sharedChanged = git('diff', '--name-only', BASE, '--', ...SHARED).trim()
  t(`🔴 the ${SHARED.length} shared readers (country settings, plans, comparison switches, FAQ, the proxy's country table): byte-identical to ${BASE}`, sharedChanged === '', sharedChanged)
}
{
  /** This work's own files — everything it changed. */
  const MINE = new Set([...PAGES, 'lib/built-ahead-countries.ts', 'lib/marketing-tags.ts', 'lib/marketing-cache.ts', 'scripts/revalidate-pages.cjs', 'scripts/competitor-check/main.ts',
    '.github/workflows/faq-translate.yml', 'scripts/cwv-2.cjs', 'scripts/perf-1.cjs', 'scripts/vercel-cost-1.cjs', 'scripts/vercel-cost-1-local.cjs'])
  const own = git('log', '--format=', '--name-only', '--grep=^vercel-cost-1', `${BASE}..HEAD`).split('\n').filter(Boolean)
  const working = git('diff', '--name-only', 'HEAD').split('\n').filter(Boolean).concat(git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean))
    .filter(f => !f.startsWith('docs/'))
  const extra = [...new Set([...own, ...working])].filter(f => !MINE.has(f))
  t('this work changed only its own files (the three page modules, the two cache files, the new list, the refresh script, two warnings, the harnesses) — docs/ aside', extra.length === 0, extra)
}

console.log(`\n${fail ? '🔴' : '✅'} vercel-cost-1: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
