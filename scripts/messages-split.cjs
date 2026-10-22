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
//      (messages/en-GB.json, messages/en-US.json or lib/i18n/messages) — the bundle split stays split.
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
// languages-1 (22 October 2026): any authored locale file (not only en-GB / en-US), and lib/i18n/locale-files.ts — the generated
// list of them that lib/i18n/messages.ts (the server) reads — is allowed beside it.
const WHOLE = /^import (?!type )[^\n]*from '(@\/messages\/[a-z]{2}-[A-Z]{2}\.json|(@\/lib\/i18n|\.)\/(messages|locale-files))'/m
const ALLOWED = new Set(['lib/i18n/messages.ts', 'lib/i18n/request.ts', 'lib/i18n/app-config.d.ts', 'lib/i18n/locale-files.ts'])
const whole = files.filter(f => !ALLOWED.has(f) && WHOLE.test(fs.readFileSync(path.join(REPO, f), 'utf8')))
t('only the server request config imports the whole catalogue (lib/i18n/messages.ts)', whole.length === 0, whole.join(', '))

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
for (const [name, page] of Object.entries(SURFACES)) {
  const want = [...graphReads(page)].sort(), have = nsOf(name) || []
  const missing = want.filter(n => !have.includes(n))
  if (process.argv.includes('--list')) console.log(`  ${name}: ${JSON.stringify(want)}`)
  t(`NAMESPACES.${name} names every namespace ${page} and its components read`, missing.length === 0, `missing: ${missing.join(', ')}`)
}

// 5 — languages-1 (22 October 2026): a SERVER-RENDERED page hands a non-English browser the words of every namespace its CLIENT
// components carry (lib/i18n/page-words.ts). The client graph is every file from a 'use client' boundary down; its
// namespaces are its catalog imports — exactly what its bundle carries. Each must be in the page's NAMESPACES entry, and
// lib/i18n/page-words.ts must import every catalog those entries name (a server module registers its own words).
function clientCatalogs(entry) {
  const seen = new Set(), ns = new Set(), stack = [[entry, false]]
  while (stack.length) {
    const [f, client0] = stack.pop(); const key = f + '|' + client0; if (seen.has(key)) continue; seen.add(key)
    if (!/^(app|components|lib|hooks)\//.test(f) || f.startsWith('lib/i18n/')) continue
    const src = readFileSync(path.join(REPO, f), 'utf8')
    const client = client0 || /^\s*['"]use client['"]/.test(src)
    if (client) for (const m of src.matchAll(/import '@\/lib\/i18n\/catalog\/([A-Za-z0-9]+)'/g)) ns.add(m[1])
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s+'([^']+)'/g)) { const r = resolveImport(f, m[1]); if (r) stack.push([r, client]) }
  }
  return ns
}
const SEEDED = { marketing: ['app/landing/page.tsx', 'app/features/page.tsx', 'app/compare/page.tsx', 'app/about/page.tsx'], truckPage: ['app/trucks/[slug]/page.tsx'], embed: ['app/domain/page.tsx'] }
const PAGE_WORDS = readFileSync(path.join(REPO, 'lib/i18n/page-words.ts'), 'utf8')
for (const [name, pages] of Object.entries(SEEDED)) {
  const want = [...new Set(pages.flatMap(p => [...clientCatalogs(p)]))].sort(), have = nsOf(name) || []
  if (process.argv.includes('--list')) console.log(`  ${name}: ${JSON.stringify(want)}`)
  t(`NAMESPACES.${name} names every namespace the client components of ${pages.join(', ')} carry`, want.every(n => have.includes(n)), `missing: ${want.filter(n => !have.includes(n)).join(', ')}`)
  t(`lib/i18n/page-words.ts imports the catalog of every NAMESPACES.${name} namespace`, have.every(n => PAGE_WORDS.includes(`import '@/lib/i18n/catalog/${n}'`)), have.filter(n => !PAGE_WORDS.includes(`import '@/lib/i18n/catalog/${n}'`)).join(', '))
}

console.log(`\n${fail ? '✗' : '✓'} messages-split: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
