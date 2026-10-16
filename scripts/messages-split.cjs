#!/usr/bin/env node
// scripts/messages-split.cjs — 🔴 THE PER-NAMESPACE CATALOGUE IS COMPLETE AND IS THE ONLY ONE THE BROWSER LOADS
// (Language Phase 1b, docs/language-phase-1b-report.md Part 1).
//
//   node scripts/messages-split.cjs          check
//   node scripts/messages-split.cjs --fix    also insert any missing `import '@/lib/i18n/catalog/<ns>'` line
//
//   1. the generated files (messages/ns/**, lib/i18n/catalog/*.ts) are exactly what scripts/split-messages.cjs makes
//      from messages/en-GB.json + messages/en-US.json;
//   2. EVERY file that reads a namespace — `useT('<ns>')`, `translatorFor(…, '<ns>')` — imports that namespace's
//      catalog module, so its words are registered wherever the file runs (a missing import would show keys);
//   3. no module outside the server's request config and lib/i18n/messages.ts itself imports the whole catalogue
//      (messages/en-GB.json, messages/en-US.json or lib/i18n/messages) — the bundle split stays split; and
//      (Language Phase 1e Part C) every catalog module bundles only its en-GB base, every client component that
//      provides a server-passed locale seeds its words, and each seeded surface's NAMESPACES entry covers its graph.
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const FIX = process.argv.includes('--fix')
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`) } }

// 1
let fresh = true
try { execSync('node scripts/split-messages.cjs --check', { cwd: REPO, stdio: 'pipe' }) } catch (e) { fresh = false; console.log(String(e.stdout)) }
t('the per-namespace catalogue matches messages/en-GB.json and messages/en-US.json', fresh)

// 2
const files = execSync("git ls-files --cached --others --exclude-standard -- 'app/*.ts' 'app/*.tsx' 'components/*.ts' 'components/*.tsx' 'lib/*.ts' 'lib/*.tsx' 'hooks/*.ts' 'hooks/*.tsx'", { cwd: REPO, encoding: 'utf8' })
  // lib/i18n/typecheck.ts is never run: it names a missing namespace ON PURPOSE, to prove typed keys fail to compile.
  .split('\n').filter(f => f && fs.existsSync(path.join(REPO, f)) && !f.startsWith('lib/i18n/catalog/') && f !== 'lib/i18n/typecheck.ts')
const namespaces = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))))
/** The namespaces a file reads: the literal first argument of useT, the literal second argument of translatorFor. */
function readsOf(src) {
  const out = new Set()
  for (const m of src.matchAll(/\buseT\(\s*'([A-Za-z0-9]+)/g)) out.add(m[1])
  for (const m of src.matchAll(/\btranslatorFor(?:<[^>]*>)?\(([^;]*?),\s*'([A-Za-z0-9]+)(?:\.[A-Za-z0-9.]+)?'\s*\)/g)) out.add(m[2])
  return out
}
const insertImports = (src, lines) => {
  const all = src.split('\n')
  let last = -1
  for (let i = 0; i < all.length; i++) if (/^import .* from '[^']+';?$/.test(all[i]) || /^import '[^']+';?$/.test(all[i]) || /^\} from '[^']+';?$/.test(all[i])) last = i
  all.splice(last + 1, 0, ...lines)
  return all.join('\n')
}
let readers = 0
const missingAll = []
for (const f of files) {
  let src = fs.readFileSync(path.join(REPO, f), 'utf8')
  const reads = [...readsOf(src)]
  if (!reads.length) continue
  readers++
  const unknown = reads.filter(ns => !namespaces.has(ns))
  t(`${f}: reads only namespaces that exist`, unknown.length === 0, unknown.join(', '))
  const missing = reads.filter(ns => namespaces.has(ns) && !new RegExp(`^import '@/lib/i18n/catalog/${ns}';?$`, 'm').test(src))
  if (missing.length && FIX) {
    src = insertImports(src, missing.map(ns => `import '@/lib/i18n/catalog/${ns}'`))
    fs.writeFileSync(path.join(REPO, f), src)
    console.log(`  + ${f}: ${missing.join(', ')}`)
    continue
  }
  if (missing.length) missingAll.push(`${f}: ${missing.join(', ')}`)
}
t(`every file that reads a namespace imports its catalog module (${readers} files read one)`, missingAll.length === 0, missingAll.join('\n      '))

// 3
// A TYPE-ONLY import (`import type enGB from …`, the typed keys) is erased by the compiler and carries nothing.
const WHOLE = /^import (?!type )[^\n]*from '(@\/messages\/en-(GB|US)\.json|(@\/lib\/i18n|\.)\/messages)'/m
// lib/i18n/server-words.ts (Language Phase 1e Part C) is `server-only`: it hands a server-rendered page's client
// components their locale's overrides, from the whole en-US file.
const ALLOWED = new Set(['lib/i18n/messages.ts', 'lib/i18n/request.ts', 'lib/i18n/app-config.d.ts', 'lib/i18n/server-words.ts'])
const whole = files.filter(f => !ALLOWED.has(f) && WHOLE.test(fs.readFileSync(path.join(REPO, f), 'utf8')))
t('only the server request config imports the whole catalogue (lib/i18n/messages.ts)', whole.length === 0, whole.join(', '))
t('lib/i18n/server-words.ts is server-only', /^import 'server-only'/m.test(fs.readFileSync(path.join(REPO, 'lib/i18n/server-words.ts'), 'utf8')))

// 3b — Language Phase 1e Part C: THE BROWSER CARRIES ONLY THE en-GB BASE. Every generated catalog module imports its
// en-GB file statically and NO other locale statically: another locale is a `require` behind
// `typeof window === 'undefined'` (the server) or a lazy `import()` (the browser) — the shape lib/i18n/registry.ts
// expects. (The built chunks are checked by docs/language-phase-1e-report.md Part C's proof, not here.)
{
  const bad = []
  for (const f of fs.readdirSync(path.join(REPO, 'lib/i18n/catalog')).filter(f => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(REPO, 'lib/i18n/catalog', f), 'utf8'), ns = f.replace(/\.ts$/, '')
    const statics = [...src.matchAll(/^import [^\n]*from '(@\/messages\/[^']+)'/gm)].map(m => m[1])
    if (statics.length !== 1 || statics[0] !== `@/messages/ns/en-GB/${ns}.json`) bad.push(`${f}: static ${statics.join(', ')}`)
    for (const m of src.matchAll(/^  '(en-[A-Z]+)': (.*),$/gm)) {
      const [, l, rhs] = m
      const req = `typeof window === 'undefined' ? require('@/messages/ns/${l}/${ns}.json') : `
      if (!rhs.startsWith(req) || ![`() => import('@/messages/ns/${l}/${ns}.json')`, 'null'].includes(rhs.slice(req.length))) bad.push(`${f}: ${l}`)
    }
  }
  t('every catalog module bundles only its en-GB base; other locales are server-require / browser-lazy', bad.length === 0, bad.join('\n      '))
}
// 3c — a client component that PROVIDES a locale handed down by its server page (an I18nContext.Provider of its own,
// not lib/i18n/client.tsx's) also seeds that locale's overrides (useSeedWords), or hydration would read the base.
{
  const missing = files.filter(f => f !== 'lib/i18n/client.tsx' && /<I18nContext\.Provider/.test(fs.readFileSync(path.join(REPO, f), 'utf8')) && !/\buseSeedWords\(/.test(fs.readFileSync(path.join(REPO, f), 'utf8')))
  t('every client component that provides a server-passed locale seeds its words (useSeedWords)', missing.length === 0, missing.join(', '))
}

// 4 — each provider's NAMESPACES entry names every namespace its page's component graph reads with useT (a namespace
// it leaves out still renders — useT reads the registry — but NAMESPACES is the record of what a surface reads).
const { readFileSync } = fs
const resolveImport = (from, spec) => {
  const base = spec.startsWith('@/') ? path.join(REPO, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(path.join(REPO, from)), spec) : null
  if (!base) return null
  for (const c of [base, base + '.tsx', base + '.ts', path.join(base, 'index.tsx'), path.join(base, 'index.ts')])
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.relative(REPO, c)
  return null
}
function graphReads(entry) {
  const seen = new Set(), reads = new Set(), stack = [entry]
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f)
    if (!/^(app|components|lib|hooks)\//.test(f) || f.startsWith('lib/i18n/')) continue
    const src = readFileSync(path.join(REPO, f), 'utf8')
    for (const m of src.matchAll(/\buseT\(\s*'([A-Za-z0-9]+)/g)) reads.add(m[1])
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s+'([^']+)'/g)) { const r = resolveImport(f, m[1]); if (r) stack.push(r) }
  }
  return reads
}
const NS_SRC = readFileSync(path.join(REPO, 'lib/i18n/namespaces.ts'), 'utf8')
const nsOf = name => { const m = NS_SRC.match(new RegExp(`\\n\\s*${name}: \\[([^\\]]*)\\]`)); return m ? [...m[1].matchAll(/'([A-Za-z0-9]+)'/g)].map(x => x[1]) : null }
const SURFACES = { order: 'app/trucks/[slug]/order/page.tsx', confirmation: 'app/order/[id]/manage/page.tsx', dashboard: 'app/dashboard/[token]/page.tsx', kds: 'app/dashboard/[token]/kds/page.tsx', manage: 'app/manage/[token]/page.tsx', setup: 'app/setup/page.tsx' }
// Language Phase 1e Part C: the client components the server renders in a non-base locale. Their entry names every
// namespace the component's graph reads with useT OR translatorFor — the overrides it is handed (lib/i18n/server-words.ts)
// must cover every word it renders, or hydration would see the base where the server rendered the override.
const SEEDED = { truckProfile: 'app/trucks/[slug]/TruckClient.tsx', compare: 'app/compare/CostComparison.tsx', verifyEmail: 'app/verify-email/VerifyEmailSuccess.tsx' }
function graphReadsAll(entry) {
  const seen = new Set(), reads = new Set(), stack = [entry]
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f)
    if (!/^(app|components|lib|hooks)\//.test(f) || f.startsWith('lib/i18n/')) continue
    for (const ns of readsOf(readFileSync(path.join(REPO, f), 'utf8'))) reads.add(ns)
    for (const m of readFileSync(path.join(REPO, f), 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s+'([^']+)'/g)) { const r = resolveImport(f, m[1]); if (r) stack.push(r) }
  }
  return reads
}
for (const [name, entry] of Object.entries(SEEDED)) {
  const want = [...graphReadsAll(entry)].sort(), have = nsOf(name) || []
  const missing = want.filter(n => !have.includes(n))
  if (process.argv.includes('--list')) console.log(`  ${name}: ${JSON.stringify(want)}`)
  t(`NAMESPACES.${name} names every namespace ${entry} and its components read (the words it is seeded with)`, missing.length === 0, `missing: ${missing.join(', ')}`)
}
// …and the SERVER pages whose client components sit under lib/i18n/locale-words.tsx (the marketing pages, in the visitor's
// locale; the app/[country] pages re-export these modules). The walk reads only files at or below a 'use client' boundary —
// the code the browser runs — and every namespace it reads must be in the entries the page seeds.
const SEEDED_PAGES = { 'app/landing/page.tsx': ['marketing'], 'app/features/page.tsx': ['marketing'], 'app/compare/page.tsx': ['marketing', 'compare'] }
const isClient = f => /^\s*(?:\/\/[^\n]*\n|\s)*['"]use client['"]/.test(readFileSync(path.join(REPO, f), 'utf8'))
function clientReads(page) {
  const seen = new Set(), reads = new Set(), stack = [[page, false]]
  while (stack.length) {
    const [f, under] = stack.pop(); if (seen.has(f + under)) continue; seen.add(f + under)
    if (!/^(app|components|lib|hooks)\//.test(f) || f.startsWith('lib/i18n/')) continue
    const src = readFileSync(path.join(REPO, f), 'utf8'), client = under || isClient(f)
    if (client) for (const ns of readsOf(src)) reads.add(ns)
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s+'([^']+)'/g)) { const r = resolveImport(f, m[1]); if (r) stack.push([r, client]) }
  }
  return reads
}
for (const [page, entries] of Object.entries(SEEDED_PAGES)) {
  const want = [...clientReads(page)].sort(), have = entries.flatMap(e => nsOf(e) || [])
  const missing = want.filter(n => !have.includes(n))
  if (process.argv.includes('--list')) console.log(`  ${page} (client): ${JSON.stringify(want)}`)
  t(`${page}: NAMESPACES.${entries.join(' + ')} name every namespace its client components read`, missing.length === 0, `missing: ${missing.join(', ')}`)
  t(`${page}: its client components sit under <LocaleWords> seeded with NAMESPACES.marketing`, /<LocaleWords locale=\{[^\n]*\} words=\{wordsFor\([^\n]*, NAMESPACES\.marketing\)\}>/.test(readFileSync(path.join(REPO, page), 'utf8')))
}
for (const [name, page] of Object.entries(SURFACES)) {
  const want = [...graphReads(page)].sort(), have = nsOf(name) || []
  const missing = want.filter(n => !have.includes(n))
  if (process.argv.includes('--list')) console.log(`  ${name}: ${JSON.stringify(want)}`)
  t(`NAMESPACES.${name} names every namespace ${page} and its components read`, missing.length === 0, `missing: ${missing.join(', ')}`)
}

console.log(`\n${fail ? '✗' : '✓'} messages-split: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
