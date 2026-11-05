#!/usr/bin/env node
// scripts/perf-1.cjs — perf-1 (5 November 2026, docs/perf-1-report.md): the marketing pages made fast again, with no visible change.
//   node scripts/perf-1.cjs        (NO NETWORK beyond 127.0.0.1, NO DATABASE, NO .env FILE)
// The timings, the 146-page BEFORE/AFTER comparison and the revalidation proofs need a production build and run by hand
// (scripts/perf-1-local.cjs and the report's §4–§6). This proves, in order:
//    1 · the server loads a non-English language only when it is asked for — the requested language (and the en-GB base), nothing else;
//        and the words are the same: every namespace in every locale equals en-GB with its chain's files merged over it;
//    2 · localizePlans (the FAQ's hot spot) answers exactly as the old has()-based code for every locale, without a throwing lookup;
//    3 · the tagged shared cache: only a marketing render takes it; tags, 5-minute expiry, immediate expiry on a write; keyed by
//        country/locale only; a failed read is never cached (strict reads throw; the FAQ's cached pages read every input strictly);
//    4 · /api/revalidate: POST only, the secret in a header, constant-time, allow-listed tags; the scripts' list is the same list;
//    5 · every app write that feeds these pages expires its tag; db-migrate.cjs and the translation run call the endpoint and NEVER fail;
//    6 · the three page modules mark their render; the working rule; the workflow passes the secret; no new file reads a .env file;
//    7 · nothing in ordering, trucks, orders, payments, the KDS or the dashboard changed.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const http = require('http')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'perf-1' })
const { REPO } = kit

/* 🔴 THE TREE BEFORE perf-1, PINNED BY SHA (never HEAD). 7bc53b81 is reviews-weather-1's report, the commit perf-1 sits on. */
const BEFORE = '7bc53b81'
const gitShow = f => execFileSync('git', ['show', `${BEFORE}:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const isTree = x => x && typeof x === 'object' && !Array.isArray(x)
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isTree(v) && isTree(o[k]) ? merge(o[k], v) : v; return o }
const json = f => JSON.parse(read(f))

;(async () => {
  const LOC = await kit.bundle('perf-1-locales', "export * from '@/lib/i18n/locales'")
  const NAMESPACES = fs.readdirSync(path.join(REPO, 'lib/i18n/catalog')).filter(f => f.endsWith('.ts')).map(f => f.slice(0, -3)).sort()

  // ── 1 · one language at a time ────────────────────────────────────────────────────────────────────────────────────────
  head('1 · the server reads a language the first time it is asked for — and the words are unchanged')
  {
    const R = await kit.bundle('perf-1-lazy', [
      "export { namespaceMessages, loadedNamespaces } from '@/lib/i18n/registry'",
      "export { messagesFor, loadedLocaleFiles } from '@/lib/i18n/messages'",
      ...NAMESPACES.map(ns => `import '@/lib/i18n/catalog/${ns}'`),
    ].join('\n'))
    const bases = LOC.LANGUAGE_BASES
    const anyLoaded = () => bases.filter(l => R.loadedNamespaces(l).loaded.length)
    t(`after every catalog module has loaded (${NAMESPACES.length} namespaces): no non-English language's words are loaded`, anyLoaded().length === 0 && R.loadedLocaleFiles().length === 0, anyLoaded())
    t('…each of the 28 languages is registered as a loader for every namespace it has', bases.length === 28 && bases.every(l => R.loadedNamespaces(l).waiting.length > 50))
    R.namespaceMessages('de-DE', 'faq')
    t('asking for de-DE faq loads exactly that: de-DE has [faq], every other language nothing', JSON.stringify(R.loadedNamespaces('de-DE').loaded) === '["faq"]' && anyLoaded().join() === 'de-DE', { de: R.loadedNamespaces('de-DE').loaded, others: anyLoaded() })
    R.namespaceMessages('de-CH', 'landing')
    t('de-CH (a variant written over de-DE) loads de-CH and de-DE for that namespace only', JSON.stringify(R.loadedNamespaces('de-DE').loaded) === '["faq","landing"]' && anyLoaded().join() === 'de-DE', R.loadedNamespaces('de-DE').loaded)
    R.namespaceMessages('ja-JP', 'landing')
    t('switching to ja-JP loads ja-JP landing on demand, and nothing else', JSON.stringify(R.loadedNamespaces('ja-JP').loaded) === '["landing"]' && anyLoaded().sort().join() === 'de-DE,ja-JP', anyLoaded())
    R.messagesFor('th-TH')
    t('next-intl\'s whole-catalogue reader (lib/i18n/messages.ts) requires only the file asked for: [th-TH]', JSON.stringify(R.loadedLocaleFiles()) === '["th-TH"]', R.loadedLocaleFiles())
    // The words: every namespace, every locale = en-GB with the locale's chain merged over it (the definition, computed here).
    const fileOf = l => (fs.existsSync(path.join(REPO, `messages/${l}.json`)) ? json(`messages/${l}.json`) : {})
    const enGB = json('messages/en-GB.json')
    const bad = []
    for (const l of LOC.LOCALES) {
      const chain = LOC.overrideChain(l)
      for (const ns of NAMESPACES) {
        const want = chain.reduce((acc, x) => (fileOf(x)[ns] ? merge(acc, fileOf(x)[ns]) : acc), enGB[ns])
        if (JSON.stringify(R.namespaceMessages(l, ns)) !== JSON.stringify(want)) bad.push(`${l}/${ns}`)
      }
      const whole = chain.reduce((acc, x) => merge(acc, fileOf(x)), enGB)
      if (JSON.stringify(R.messagesFor(l)) !== JSON.stringify(whole)) bad.push(`${l}/(whole)`)
    }
    t(`the words: all ${NAMESPACES.length} namespaces × ${LOC.LOCALES.length} locales, and the whole catalogue per locale, are en-GB with the chain merged over it`, bad.length === 0, bad.slice(0, 10))
    const cat = read('lib/i18n/catalog/faq.ts')
    t('the browser branch is unchanged: `typeof window === \'undefined\' ? serverWords(() => require(…)) : () => import(…)`', /typeof window === 'undefined' \? serverWords\(\(\) => require\('@\/messages\/ns\/fr-FR\/faq\.json'\)\) : \(\) => import\('@\/messages\/ns\/fr-FR\/faq\.json'\)/.test(cat)
      && /typeof window === 'undefined' \? require\('@\/messages\/ns\/fr-FR\/faq\.json'\) : \(\) => import\('@\/messages\/ns\/fr-FR\/faq\.json'\)/.test(gitShow('lib/i18n/catalog/faq.ts')))
    t('serverWords only WRAPS the require (nothing runs until the language is asked for): `return { [SERVER_WORDS]: load }`', /export function serverWords\(load: \(\) => unknown\): ServerWords \{ return \{ \[SERVER_WORDS\]: load \} \}/.test(read('lib/i18n/registry.ts')))
    t('the generator is in step with the catalogues (split-messages --check)', /matches/.test(execFileSync('node', ['scripts/split-messages.cjs', '--check'], { cwd: REPO, encoding: 'utf8' })))
  }

  // ── 2 · localizePlans ─────────────────────────────────────────────────────────────────────────────────────────────────
  head('2 · localizePlans — the same answer for every locale, with no throwing lookup')
  {
    const P = await kit.bundle('perf-1-plans', "export { localizePlans } from '@/lib/plan-names'\nexport { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/planNames'")
    const catalog = require('./_plans-catalog-fixture.cjs').catalog ? require('./_plans-catalog-fixture.cjs').catalog() : null
    const base = catalog ?? { plans: ['payg', 'pro', 'unlimited', 'trial', 'demo', 'tester'].map((key, i) => ({ key, name: key.toUpperCase(), description: `${key} description`, subtitle: `${key} subtitle`, sortOrder: i })), prices: [], features: [] }
    /** The code before perf-1, verbatim in behaviour: a fresh translator, `t.has` per field. */
    const old = (c, locale) => {
      const tr = P.translatorFor(locale, 'planNames'); let changed = false
      const plans = c.plans.map(p => { let out = p; for (const f of ['name', 'description', 'subtitle']) { const key = `${p.key}.${f}`; if (!tr.has(key)) continue; if (out === p) out = { ...p }; out[f] = tr(key); changed = true } return out })
      return changed ? { ...c, plans } : c
    }
    const diff = LOC.LOCALES.filter(l => JSON.stringify(P.localizePlans(base, l)) !== JSON.stringify(old(base, l)))
    t(`every one of the ${LOC.LOCALES.length} locales: the same catalogue, word for word, as the has()-based code`, diff.length === 0, diff)
    t('English returns the SAME object (no plan word is translated in en-GB), as before', P.localizePlans(base, 'en-GB') === base && old(base, 'en-GB') === base)
    const a = P.localizePlans(base, 'fr-FR'), b = P.localizePlans(base, 'fr-FR'), other = P.localizePlans({ ...base }, 'fr-FR')
    t('remembered per catalogue object and locale: the same answer object twice; a new catalogue is worked out afresh', a === b && other !== a && JSON.stringify(other) === JSON.stringify(a))
    const src = read('lib/plan-names.ts')
    t('no translator `.has(` left in lib/plan-names.ts (the throwing lookup is gone)', !/\bt\.has\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')))
  }

  // ── 3 · the tagged shared cache ───────────────────────────────────────────────────────────────────────────────────────
  head('3 · the tagged shared cache — only a marketing render, tags, expiry, never a failed read')
  {
    const mc = read('lib/marketing-cache.ts') + '\n' + read('lib/faq/public-cache.ts'), code = mc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    t('Next 16 data cache: unstable_cache with tags and revalidate MARKETING_REVALIDATE_SECONDS (300), deduplicated per render by React cache', /cache\(unstable_cache\(read, \['perf-1', key\], \{ tags, revalidate: MARKETING_REVALIDATE_SECONDS \}\)\)/.test(code) && /MARKETING_REVALIDATE_SECONDS = 300/.test(read('lib/marketing-tags.ts')))
    t('a write EXPIRES the tag at once — revalidateTag(tag, { expire: 0 }), not the stale-then-refresh profile', /revalidateTag\(t, \{ expire: 0 \}\)/.test(code) && !/revalidateTag\([^)]*'max'/.test(code))
    t('the country and plan readers never pull the FAQ code in: lib/marketing-cache.ts imports nothing from lib/faq', !/lib\/faq/.test(read('lib/marketing-cache.ts').replace(/\/\/.*$/gm, '')))
    t('keyed by country/locale only: the cache module reads no header, cookie, host, visitor, truck or order', !/next\/headers|cookies\(|headers\(|visitor|truck_id|order_key|from\('orders'\)|from\('trucks'\)/.test(code)
      && /marketingFaqPage = shared\('faq-page', ALL, async \(code: string, locale: string\)/.test(code))
    t('strict reads throw: the comparison switches (except a missing column, which is every country off — a real answer), the FAQ rows (translations unreadable → throws)',
      /throw new Error\(`comparison switches: \$\{error\.message\}`\)/.test(code) && /readPublished\(true\)/.test(code) && /if \(tr\.error && strict\) throw new Error/.test(read('lib/faq/public.ts')))
    const pub = read('lib/faq/public.ts')
    const computeFaq = pub.slice(pub.indexOf('export async function computeFaqPage'), pub.indexOf('function resolveFaqPage')).replace(/\/\/.*$/gm, '')
    t('the cached FAQ page reads EVERY input strictly (country list, rows, catalogue, switches) — never published()/world(), whose failures read as degraded answers', /mc\.marketingCountryList\(\), fc\.marketingFaqRows\(\), mc\.marketingPlanCatalog\(\), mc\.marketingComparisonEntries\(\)/.test(computeFaq) && !/published\(\)|world\(\)/.test(computeFaq))
    // Each shared reader: the marketing branch first, and everything after it as it was.
    const readers = [
      ['lib/country-settings.ts', 'export async function listCountrySettingsCached', "if (isMarketingRender()) return (await import('@/lib/marketing-cache')).marketingCountryList()"],
      ['lib/plans-server.ts', 'export async function getPlanCatalog', "if (isMarketingRender()) return (await import('@/lib/marketing-cache')).marketingPlanCatalog()"],
      ['lib/comparison-flags.ts', 'export async function comparisonFlags', 'if (isMarketingRender()) {'],
      ['lib/faq/public.ts', 'export async function faqPage', 'if (isMarketingRender()) {', 2],
      ['lib/faq/public.ts', 'export async function faqCountries', 'if (isMarketingRender()) {'],
    ]
    for (const [f, sig, branch, after = 0] of readers) {
      const s = read(f), body = s.slice(s.indexOf(sig))
      const code = body.split('\n').slice(1).filter(l => l.trim() && !l.trim().startsWith('//'))
      // faqPage first names its two inputs (const code / const locale), then branches — before any cache or read.
      t(`${f} ${sig.split(' ').pop()}: the marketing branch comes before any cache or read${after ? ` (after its ${after} input names)` : ''}`, code[after] && code[after].trim() === branch && code.slice(0, after).every(l => /^\s*const \w+ = settings\.\w+$/.test(l)), code.slice(0, after + 1))
    }
    const listNow = read('lib/country-settings.ts'), listBefore = gitShow('lib/country-settings.ts')
    const after = s => s.slice(s.indexOf('  if (listCache && Date.now()'), s.indexOf('return value', s.indexOf('  if (listCache && Date.now()')))
    t('…and the non-marketing path of the country list is byte-identical to before (the proxy and every other caller: the 60-second copy)', after(listNow) === after(listBefore) && after(listNow).length > 50)
    const rend = read('lib/marketing-render.ts')
    t('"a marketing render" is React\'s request-scoped cache (one flag per server render; outside a render it never reads true)', /const flag = cache\(\(\): \{ on: boolean \} => \(\{ on: false \}\)\)/.test(rend))
    const F = await kit.bundle('perf-1-flag', "export { isMarketingRender, markMarketingRender } from '@/lib/marketing-render'")
    F.markMarketingRender()
    t('…proved: outside a React render, marking does not stick — every route handler, the proxy and every script read the old way', F.isMarketingRender() === false)
  }

  // ── 4 · /api/revalidate ───────────────────────────────────────────────────────────────────────────────────────────────
  head('4 · /api/revalidate — POST, a header secret compared in constant time, allow-listed tags')
  {
    const calls = []
    const E = await kit.bundle('perf-1-endpoint', "export { POST } from '@/app/api/revalidate/route'\nexport { secretMatches } from '@/lib/revalidate-secret'\nexport { MARKETING_TAG_LIST } from '@/lib/marketing-tags'", {
      stubs: { 'next/cache': 'export const revalidateTag = (t, p) => { globalThis.__revalidated.push([t, p]) }; export const unstable_cache = f => f' },
    })
    globalThis.__revalidated = calls
    const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
    const post = async (headers, body) => { const res = await kit.quietAsync(() => E.POST(new NextRequest('http://127.0.0.1:3999/api/revalidate', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }))); return { status: res.status, body: await res.json() } }
    delete process.env.REVALIDATE_SECRET
    const unset = await post({ 'x-revalidate-secret': 'x' }, { tags: ['marketing-faq'] })
    process.env.REVALIDATE_SECRET = 'harness-secret-not-real'
    const none = await post({}, { tags: ['marketing-faq'] }), wrong = await post({ 'x-revalidate-secret': 'harness-secret-not-reaL' }, { tags: ['marketing-faq'] })
    const unknown = await post({ 'x-revalidate-secret': 'harness-secret-not-real' }, { tags: ['marketing-faq', 'orders'] }), empty = await post({ 'x-revalidate-secret': 'harness-secret-not-real' }, { tags: [] })
    t('no secret configured → 503; no header → 401; one character wrong → 401; an unknown tag → 400; none → 400 — and nothing expired', unset.status === 503 && none.status === 401 && wrong.status === 401 && unknown.status === 400 && empty.status === 400 && calls.length === 0, [unset.status, none.status, wrong.status, unknown.status, empty.status, calls.length])
    const ok = await post({ 'x-revalidate-secret': 'harness-secret-not-real' }, { tags: ['marketing-plans', 'marketing-plans', 'marketing-countries'] })
    t('the right secret and allow-listed tags → 200, each tag expired ONCE with { expire: 0 }', ok.status === 200 && JSON.stringify(calls) === '[["marketing-plans",{"expire":0}],["marketing-countries",{"expire":0}]]', { ok, calls })
    delete process.env.REVALIDATE_SECRET
    const route = read('app/api/revalidate/route.ts')
    t('POST is the only method; the secret is read from process.env and a header, never the URL', !/export async function (GET|PUT|DELETE|PATCH)/.test(route) && /process\.env\.REVALIDATE_SECRET/.test(route) && /req\.headers\.get\('x-revalidate-secret'\)/.test(route) && !/searchParams/.test(route))
    t('constant time: both sides SHA-256-hashed to 32 bytes, then crypto.timingSafeEqual', /timingSafeEqual\(digest\(given \?\? ''\), digest\(expected\)\)/.test(read('lib/revalidate-secret.ts')) && E.secretMatches('a', 'a') && !E.secretMatches('a', 'b') && !E.secretMatches(null, 'a') && !E.secretMatches('', ''))
    const RP = require('./revalidate-pages.cjs')
    t('the scripts send the same allow-list the endpoint accepts', JSON.stringify(RP.TAGS) === JSON.stringify(E.MARKETING_TAG_LIST) && RP.DEFAULT_BASE === 'https://www.hatchgrab.com')
  }

  // ── 5 · every writer ──────────────────────────────────────────────────────────────────────────────────────────────────
  head('5 · every write that feeds these pages expires its tag; the scripts never fail')
  {
    const countries = read('app/api/admin/countries/route.ts'), comparison = read('app/api/admin/countries/comparison/route.ts'), faq = read('app/api/admin/faq/route.ts')
    t('Admin › Countries (save, add, switch on/off, remove): after a successful write → marketing-countries', /if \(writes && r\.ok\) \{\n\s+clearCountrySettingsCache\(\)\n[^\n]*\n\s+revalidateMarketing\(\[MARKETING_TAGS\.countries\], 'admin\/countries'\)/.test(countries))
    t('Admin › Countries › comparison status (PATCH): → marketing-countries', /clearComparisonCache\(\); clearCountrySettingsCache\(\)\n[^\n]*\n\s+revalidateMarketing\(\[MARKETING_TAGS\.countries\], 'admin\/countries\/comparison'\)/.test(comparison))
    t('Admin › FAQ (every POST: save, publish, unpublish, move, delete): → marketing-faq', /\} finally \{\n\s+clearPublicFaqCache\(\)\n(\s+\/\/[^\n]*\n)+\s+revalidateMarketing\(\[MARKETING_TAGS\.faq\], 'admin\/faq'\)/.test(faq))
    const writers = execFileSync('git', ['grep', '-lE', "from\\('(country_settings|plans|plan_prices|plan_features|faq_sections|faq_items|faq_translations)'\\)[^;]*\\.(update|upsert|insert|delete)\\(", '--', 'app', 'lib', 'scripts/faq-translate'], { cwd: REPO, encoding: 'utf8' }).trim().split('\n').sort()
    t('the app\'s writers of those tables are exactly the ones wired (and the translator script); plans are written only by migrations', JSON.stringify(writers) === JSON.stringify(['app/api/admin/countries/comparison/route.ts', 'lib/admin/country-store.ts', 'lib/admin/faq-store.ts', 'scripts/faq-translate/main.ts']), writers)
    const mig = read('scripts/db-migrate.cjs')
    t('db-migrate.cjs: after a file APPLIED (not --probe, no failure) it calls the endpoint, inside a try — a failure is a WARNING line only',
      /if \(!probe && !process\.exitCode\) \{\n\s+try \{ await require\('\.\/revalidate-pages\.cjs'\)\.revalidatePages\(undefined, \{ why: `migration \$\{rel\}`/.test(mig) && /catch \(e\) \{ console\.log\(`db-migrate: WARNING/.test(mig))
    const tr = read('scripts/faq-translate/main.ts')
    t('the translation run: after a run that wrote or removed (never a dry run, never fixtures) it calls the endpoint with marketing-faq', /if \(!dryRun && !fixtures && \(report\.done > 0 \|\| report\.removed > 0\)\) \{[\s\S]{0,400}await revalidatePages\(\['marketing-faq'\], \{ why: 'faq-translate', log \}\)/.test(tr))
    const RP = require('./revalidate-pages.cjs')
    const logs = []
    const saved = { s: process.env.REVALIDATE_SECRET, b: process.env.REVALIDATE_BASE_URL }
    delete process.env.REVALIDATE_SECRET
    const noSecret = await RP.revalidatePages(undefined, { why: 'harness', log: m => logs.push(m) })
    process.env.REVALIDATE_SECRET = 'harness-secret-not-real'; process.env.REVALIDATE_BASE_URL = 'http://127.0.0.1:9'
    const unreachable = await RP.revalidatePages(undefined, { why: 'harness', log: m => logs.push(m) })
    t('the helper never throws: no secret → false and one WARNING; an unreachable site → false and one WARNING', noSecret === false && unreachable === false && logs.length === 2 && logs.every(l => l.startsWith('WARNING')), logs)
    const seen = []
    const srv = http.createServer((q, r) => { let b = ''; q.on('data', c => { b += c }); q.on('end', () => { seen.push({ method: q.method, url: q.url, secret: q.headers['x-revalidate-secret'], body: b }); r.writeHead(q.headers['x-revalidate-secret'] === 'harness-secret-not-real' ? 200 : 401); r.end('{}') }) })
    await new Promise(r => srv.listen(0, '127.0.0.1', r))
    process.env.REVALIDATE_BASE_URL = `http://127.0.0.1:${srv.address().port}/`
    const sent = await RP.revalidatePages(['marketing-faq'], { why: 'harness', log: m => logs.push(m) })
    process.env.REVALIDATE_SECRET = 'wrong'
    const refused = await RP.revalidatePages(['marketing-faq'], { why: 'harness', log: m => logs.push(m) })
    srv.close()
    t('…and when the site answers: POST /api/revalidate, the secret in the header (never the URL), {"tags":[…]}; a refusal → false and a WARNING',
      sent === true && refused === false && seen[0].method === 'POST' && seen[0].url === '/api/revalidate' && seen[0].secret === 'harness-secret-not-real' && seen[0].body === '{"tags":["marketing-faq"]}' && /^WARNING/.test(logs[logs.length - 1]), { seen, logs })
    if (saved.s === undefined) delete process.env.REVALIDATE_SECRET; else process.env.REVALIDATE_SECRET = saved.s
    if (saved.b === undefined) delete process.env.REVALIDATE_BASE_URL; else process.env.REVALIDATE_BASE_URL = saved.b
  }

  // ── 6 · the pages, the rule, the workflow, no .env ────────────────────────────────────────────────────────────────────
  head('6 · the three page modules mark their render; the working rule; the workflow; no .env file is read')
  {
    for (const f of ['app/landing/page.tsx', 'app/features/page.tsx', 'app/faq/page.tsx']) {
      const s = read(f)
      const firsts = [...s.matchAll(/^export (?:default )?async function (\w+)\([^\n]*\{\n(.*)$/gm)].map(m => [m[1], m[2].trim()])
      t(`${f}: its page and its generateMetadata both start with markMarketingRender()`, firsts.length === 2 && firsts.every(([, l]) => l.startsWith('markMarketingRender()')), firsts)
    }
    t('the [country] modules are unchanged (they re-export the same three; no route group, no layout change)', ['app/[country]/page.tsx', 'app/[country]/features/page.tsx', 'app/[country]/faq/page.tsx', 'app/layout.tsx', 'proxy.ts'].every(f => read(f) === gitShow(f)))
    const rules = read('.cursor/rules/working-rules.mdc')
    t('.cursor/rules/working-rules.mdc: the .env.local instruction is gone; the standing rule is there in one line', !/lives in `\.env\.local`/.test(rules) && /Never open, read, list, parse or test any `\.env\*` file in any form/.test(rules))
    const wf = read('.github/workflows/faq-translate.yml')
    t('the translation workflow passes REVALIDATE_SECRET from the repository secrets to the Translate step', /REVALIDATE_SECRET: \$\{\{ secrets\.REVALIDATE_SECRET \}\}/.test(wf))
    const NEW = ['lib/marketing-cache.ts', 'lib/faq/public-cache.ts', 'lib/marketing-render.ts', 'lib/marketing-tags.ts', 'lib/revalidate-secret.ts', 'app/api/revalidate/route.ts', 'scripts/revalidate-pages.cjs', 'scripts/_perf-1-standin.cjs', 'scripts/_perf-1-tables.cjs', 'scripts/perf-1-local.cjs']
    // A file NAME ending .env…, dotenv, or a file read with "env" in its path — process.env reads are what the code is meant to do.
    const envHits = NEW.filter(f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').split('\n').some(l => /['"`/]\.env[\w.-]*['"`]|dotenv|readFileSync\([^)\n]*env/i.test(l)))
    t('no new file names or reads a .env file (process.env only)', envHits.length === 0, envHits)
  }

  // ── 7 · untouched ─────────────────────────────────────────────────────────────────────────────────────────────────────
  head('7 · nothing in ordering, trucks, orders, payments, the KDS or the dashboard changed')
  {
    const PATHS = ['app/api/orders', 'app/order', 'app/o', 'app/api/menu', 'app/kds', 'app/api/kds', 'app/dashboard', 'app/api/dashboard', 'app/trucks', 'app/manage', 'app/api/manage', 'app/api/webhooks', 'components/dashboard',
      'lib/payments', 'lib/printing', 'lib/orders', 'lib/order-charges.ts', 'lib/order-charge-rules.ts', 'lib/menu-loader.ts', 'proxy.ts', 'app/layout.tsx'].filter(p => fs.existsSync(path.join(REPO, p)))
    let diff = ''
    try { diff = execFileSync('git', ['diff', '--stat', BEFORE, '--', ...PATHS], { cwd: REPO, encoding: 'utf8' }) } catch (e) { diff = String(e) }
    t(`${PATHS.length} ordering, payment, KDS, dashboard, Manage and proxy paths: no change against ${BEFORE}`, diff.trim() === '', diff)
    // ⚠️ RE-PINNED (loyalty-1, 5 November 2026, docs/loyalty-1-report.md): this compared BEFORE with the WORKING TREE, so loyalty-1's
    // lib/loyalty/ and its two privacy hooks read as perf-1's. It now compares BEFORE with perf-1's own last commit (5622370d, its report).
    t('the shared modules that did change are exactly the reviewed list (i18n loading, localizePlans, the four readers)', (() => {
      const changed = execFileSync('git', ['diff', '--name-only', BEFORE, '5622370d', '--', 'lib'], { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(f => !f.startsWith('lib/i18n/catalog/'))
      return JSON.stringify(changed.sort()) === JSON.stringify(['lib/comparison-flags.ts', 'lib/country-settings.ts', 'lib/faq/public-cache.ts', 'lib/faq/public.ts', 'lib/i18n/locale-files.ts', 'lib/i18n/messages.ts', 'lib/i18n/registry.ts', 'lib/marketing-cache.ts', 'lib/marketing-render.ts', 'lib/marketing-tags.ts', 'lib/plan-names.ts', 'lib/plans-server.ts', 'lib/revalidate-secret.ts'])
    })())
  }

  console.log(`\nperf-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
