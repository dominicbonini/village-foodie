#!/usr/bin/env node
// scripts/split-messages.cjs — 🔴 THE ONE WAY THE PER-NAMESPACE CATALOGUE IS MADE (Language Phase 1b,
// docs/language-phase-1b-report.md Part 1).
//
//   node scripts/split-messages.cjs           write the generated files from messages/en-GB.json + every other locale's file
//   node scripts/split-messages.cjs --check   change nothing; exit 1 if any generated file is missing, stale or extra
//
// The AUTHORED files stay messages/en-GB.json (the full base) and messages/<locale>.json for every other locale. From them
// this writes, for every top-level namespace <ns> of en-GB:
//   messages/ns/en-GB/<ns>.json   that namespace's base
//   messages/ns/en-US/<ns>.json   that namespace's US overrides ({} when there are none)
//   lib/i18n/catalog/<ns>.ts      the module a file imports to read the namespace — it registers the pair with
//                                 lib/i18n/registry.ts, so a client bundle carries exactly the namespaces it uses.
// and lib/i18n/locale-files.ts — every authored locale file, for lib/i18n/messages.ts (the server's whole catalogue).
// The JSON sits under messages/, so next.config.ts's message precompile compiles it like the authored files.
// ⚠️ GENERATED FILES ARE COMMITTED AND NEVER EDITED BY HAND. `npm run build` and `npm run dev` run this first
// (package.json prebuild / predev), and scripts/messages-split.cjs fails the sweep if they are ever out of step.
//
// 🔴 languages-1 (22 October 2026, docs/languages-1-report.md §1): THE LOCALE LIST IS READ FROM lib/i18n/locales.ts — the one
// place it is written. A NON-ENGLISH base (LANGUAGE_BASES) gets a namespace file for every namespace its file has, and the
// catalog module registers it with registerLanguage(): on the server at once (a plain require — the server always has every
// word), in the browser only as a loader that runs when a page is in that language. Next replaces `typeof window` at build
// time, so the browser bundle never contains the require — an English page carries no other language. With no base locale
// (today) every catalog module is exactly as before.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const CHECK = process.argv.includes('--check')

/** lib/i18n/locales.ts, evaluated (it is pure and imports nothing) — so its lists are read, never restated here. */
function readLocales() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a CommonJS script, like the requires above
  const ts = require(path.join(REPO, 'node_modules/typescript'))
  const src = fs.readFileSync(path.join(REPO, 'lib/i18n/locales.ts'), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const mod = { exports: {} }
  new Function('module', 'exports', js)(mod, mod.exports)
  return mod.exports
}
const L = readLocales()
const LOCALES = [...L.LOCALES]
const BASES = new Set(L.LANGUAGE_BASES)
if (LOCALES[0] !== 'en-GB' || L.DEFAULT_LOCALE !== 'en-GB') throw new Error('lib/i18n/locales.ts: en-GB must be the first locale and the default')
// ireland-1 (20 October 2026): en-US is DENSE (a file per namespace, `{}` when it overrides nothing — as it always was);
// a later English locale is SPARSE: its per-namespace file is written, and imported by the catalog module, only where it
// overrides something. en-IE overrides three namespaces, so the other catalog modules stay byte-identical.
// canada-1 (22 October 2026): en-CA, sparse — authored over en-US (LOCALE_PARENT); its namespace files hold only its own keys,
// and lib/i18n/registry.ts merges en-US's first.
const DENSE = new Set(['en-US'])
const read = f => JSON.parse(fs.readFileSync(path.join(REPO, f), 'utf8'))
const base = read('messages/en-GB.json')
const OTHERS = LOCALES.slice(1)
// europe-languages-1 (22 October 2026): a REGIONAL VARIANT of a language base (de-AT, de-CH over de-DE; de-LI over de-CH —
// LOCALE_PARENT) is that language too: its few words are registered lazily with the base's, never bundled into English pages.
const isLanguage = l => { for (let x = l; x; x = (L.LOCALE_PARENT ?? {})[x]) if (BASES.has(x)) return true; return false }
const ENGLISH = OTHERS.filter(l => !isLanguage(l))
const over = Object.fromEntries(OTHERS.map(l => [l, read(`messages/${l}.json`)]))
const json = o => JSON.stringify(o, null, 2) + '\n'
const ident = ns => /^[A-Za-z][A-Za-z0-9]*$/.test(ns) ? ns : (() => { throw new Error(`namespace "${ns}" is not a plain identifier`) })()
const varOf = l => l.replace(/-/g, '')

const want = new Map()
for (const ns of Object.keys(base).map(ident)) {
  want.set(`messages/ns/en-GB/${ns}.json`, json(base[ns]))
  const used = ENGLISH.filter(l => DENSE.has(l) || over[l][ns] !== undefined)
  for (const l of used) want.set(`messages/ns/${l}/${ns}.json`, json(over[l][ns] ?? {}))
  const langs = OTHERS.filter(l => isLanguage(l) && over[l][ns] !== undefined)
  for (const l of langs) want.set(`messages/ns/${l}/${ns}.json`, json(over[l][ns]))
  const from = [...used, ...langs].map(l => `messages/${l}.json`)
  want.set(`lib/i18n/catalog/${ns}.ts`, [
    `// GENERATED by scripts/split-messages.cjs from messages/en-GB.json${from.length ? ' and ' + from.join(' and ') : ''} — DO NOT EDIT.`,
    `// Import this module (\`import '@/lib/i18n/catalog/${ns}'\`) in any file that reads the "${ns}" namespace.`,
    `import base from '@/messages/ns/en-GB/${ns}.json'`,
    ...used.map(l => `import ${varOf(l)} from '@/messages/ns/${l}/${ns}.json'`),
    `import { registerNamespace${langs.length ? ', registerLanguage' : ''} } from '@/lib/i18n/registry'`,
    ``,
    `registerNamespace('${ns}', base, { ${used.map(l => `'${l}': ${varOf(l)}`).join(', ')} })`,
    ...(langs.length ? [
      `// languages-1: each non-English language — on the server now; in the browser only when a page is in that language.`,
      ...langs.map(l => [
        `// eslint-disable-next-line @typescript-eslint/no-require-imports -- the server's copy; Next drops this branch from the browser bundle`,
        `registerLanguage('${ns}', '${l}', typeof window === 'undefined' ? require('@/messages/ns/${l}/${ns}.json') : () => import('@/messages/ns/${l}/${ns}.json'))`,
      ].join('\n')),
    ] : []),
    ``,
  ].join('\n'))
}
// lib/i18n/locale-files.ts — every authored file but en-GB's, for the server's whole catalogue (lib/i18n/messages.ts).
want.set('lib/i18n/locale-files.ts', [
  `// GENERATED by scripts/split-messages.cjs from lib/i18n/locales.ts — DO NOT EDIT. Every authored messages file but en-GB's`,
  `// (the base), for lib/i18n/messages.ts — the SERVER's whole catalogue. No browser module imports this file.`,
  // europe-languages-1 (22 October 2026): a NON-ENGLISH file (a language base, ~390 KB, or its regional override) is read with
  // require(), so TypeScript does not infer a literal type for every one of its keys — each language added ~25 MB to the editor's
  // TypeScript server for a value that is `unknown` here anyway. English files keep their typed imports, exactly as before.
  ...OTHERS.filter(l => l.startsWith('en-')).map(l => `import ${varOf(l)} from '@/messages/${l}.json'`),
  `import type { AppLocale } from './locales'`,
  ...(OTHERS.some(l => !l.startsWith('en-')) ? [
    `/* eslint-disable @typescript-eslint/no-require-imports -- untyped on purpose (see scripts/split-messages.cjs) */`,
    ...OTHERS.filter(l => !l.startsWith('en-')).map(l => `const ${varOf(l)}: unknown = require('@/messages/${l}.json')`),
    `/* eslint-enable @typescript-eslint/no-require-imports */`,
  ] : []),
  ``,
  `export const LOCALE_FILES: Partial<Record<AppLocale, unknown>> = { ${OTHERS.map(l => `'${l}': ${varOf(l)}`).join(', ')} }`,
  ``,
].join('\n'))
// A namespace in an override that en-GB lacks is a parity failure (scripts/messages-parity.cjs §2), not something to split.
const existing = [
  ...LOCALES.flatMap(l => { const d = path.join(REPO, 'messages/ns', l); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => `messages/ns/${l}/${f}`) : [] }),
  ...(fs.existsSync(path.join(REPO, 'lib/i18n/catalog')) ? fs.readdirSync(path.join(REPO, 'lib/i18n/catalog')).filter(f => f.endsWith('.ts')).map(f => `lib/i18n/catalog/${f}`) : []),
]
const problems = []
for (const [f, content] of want) {
  const abs = path.join(REPO, f)
  const now = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null
  if (now === content) continue
  problems.push(`${now === null ? 'missing' : 'stale'}: ${f}`)
  if (!CHECK) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content) }
}
for (const f of existing) {
  if (want.has(f)) continue
  problems.push(`extra: ${f}`)
  if (!CHECK) fs.unlinkSync(path.join(REPO, f))
}
if (CHECK) {
  if (problems.length) { console.log(`✗ the per-namespace catalogue is out of step with messages/*.json — run node scripts/split-messages.cjs\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`✓ the per-namespace catalogue matches messages/*.json (${Object.keys(base).length} namespaces)`)
} else {
  console.log(problems.length ? `split-messages: ${problems.length} file(s) written or removed` : 'split-messages: up to date')
}
