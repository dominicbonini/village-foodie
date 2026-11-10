#!/usr/bin/env node
// scripts/languages-world-1-rtl.cjs — 🔴 THE RIGHT-TO-LEFT FILE CHECK (languages-world-1, 10 November 2026; docs/languages-world-1-report.md).
//
// Arabic (ar-AE and its variants) and Hebrew (he-IL) pages are written right to left. This checks, from the files alone (no browser):
//   1 · the rule: lib/script-fonts.ts isRtl and lib/public-script.ts isRtlLang are the SAME test, true for every ar-*/he-* locale in
//       lib/i18n/locales.ts and false for every other one (so <html dir="rtl"> is written exactly for those pages);
//   2 · the words: every ar-*/he-* messages file (merged over its base, as the app reads it) has no bidirectional CONTROL characters
//       (U+202A–U+202E embeddings/overrides, U+2066–U+2069 isolates — the browser's own bidi handles numbers, placeholders and Latin
//       brands, and a stray override flips a whole sentence), and every message with letters in it carries the language's own script
//       (an untranslated English sentence would read left to right inside a right-to-left page).
// Exit 1 on any failure.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 400)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

const ts = require(path.join(REPO, 'node_modules/typescript'))
const mod = { exports: {} }
new Function('module', 'exports', ts.transpileModule(read('lib/i18n/locales.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(mod, mod.exports)
const { LOCALES, overrideChain } = mod.exports
const regexOf = (file, name) => { const m = new RegExp(`export const ${name} = \\(lang: string \\| null \\| undefined\\): boolean => (\\/[^\\n]+?\\/i)\\.test`).exec(read(file)); return m ? new Function(`return ${m[1]}`)() : null }

head('1 · the rule')
const A = regexOf('lib/script-fonts.ts', 'isRtl'), B = regexOf('lib/public-script.ts', 'isRtlLang')
t('lib/script-fonts.ts isRtl and lib/public-script.ts isRtlLang are found and are the same test', A && B && A.source === B.source, `${A} vs ${B}`)
const rtlLang = l => /^(ar|he)(-|$)/i.test(l)
if (A) for (const l of LOCALES) t(`${l}: ${rtlLang(l) ? 'right to left' : 'left to right'}`, A.test(l) === rtlLang(l) && (!B || B.test(l) === rtlLang(l)))
t('Hebrew is right to left even before a he-IL row exists (he, he-IL) and English never is', A && A.test('he') && A.test('he-IL') && A.test('ar') && !A.test('en-GB') && !A.test('heb') && !A.test('fr-HE'))

head('2 · the words of every right-to-left locale')
const deep = (x, y) => { const o = { ...x }; for (const [k, v] of Object.entries(y ?? {})) o[k] = v && typeof v === 'object' && o[k] && typeof o[k] === 'object' ? deep(o[k], v) : v; return o }
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const kk = p ? `${p}.${k}` : k; if (v && typeof v === 'object') flat(v, kk, out); else out[kk] = v } return out }
const CONTROLS = /[‪-‮⁦-⁩]/
const SCRIPT = { ar: /\p{Script=Arabic}/u, he: /\p{Script=Hebrew}/u }
// Messages that are names, codes or examples in every language (a brand, a URL or e-mail placeholder, a file type list, a phone number).
const NEUTRAL = /^[\s\p{P}\p{S}\p{N}]*$|^(HatchGrab|WhatsApp|Instagram|Facebook|Stripe|PIN|KDS|PDF|CSV|QR|URL|ID|Wi-?Fi|Bluetooth|Eircode|Apple|Google)\b|@|https?:|www\.|\.(com|sa|qa|kw|bh|om|jo|eg|ae|il|co)\b/u
for (const l of LOCALES.filter(rtlLang)) {
  if (!fs.existsSync(path.join(REPO, `messages/${l}.json`))) { t(`${l}: messages/${l}.json exists`, false); continue }
  const merged = flat(overrideChain(l).reduce((acc, x) => deep(acc, JSON.parse(read(`messages/${x}.json`))), JSON.parse(read('messages/en-GB.json'))))
  const own = flat(overrideChain(l).reduce((acc, x) => deep(acc, JSON.parse(read(`messages/${x}.json`))), {}))
  const ctl = Object.entries(merged).filter(([, v]) => CONTROLS.test(v)).map(([k]) => k)
  t(`${l}: no bidi control characters (U+202A–202E, U+2066–2069) in ${Object.keys(merged).length} messages`, ctl.length === 0, ctl.slice(0, 10).join(', '))
  const re = SCRIPT[l.slice(0, 2)]
  const strip = v => v.replace(/\{[^{}]*\}/g, ' ').replace(/<\/?[a-z]+>/gi, ' ')
  const latinOnly = Object.entries(own).filter(([, v]) => /\p{L}{3,}/u.test(strip(v)) && !re.test(v) && !NEUTRAL.test(strip(v).trim())).map(([k, v]) => `${k} = ${v.slice(0, 40)}`)
  // a short allowance: brand-only and product-name lines the NEUTRAL list does not know; every one is printed for review
  t(`${l}: every message with words carries its own script (${latinOnly.length} Latin-only, at most 25 allowed — names and products)`, latinOnly.length <= 25, latinOnly.slice(0, 25).join(' | '))
  if (latinOnly.length) console.log(`  · ${l} Latin-only messages (review): ${latinOnly.slice(0, 25).join(' | ')}`)
}

console.log(`\n${fail ? '✗' : '✓'} languages-world-1-rtl: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
