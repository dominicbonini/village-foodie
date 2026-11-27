#!/usr/bin/env node
// scripts/deploy-prep-1.cjs — deploy-prep-1 (Dominic, 27 November 2026; docs/deploy-prep-1-report.md): the translation checker accepts
// the 15 English-only comparison.fit guide keys (docs/i18n/english-only-keys.json) in every non-English language — and nothing more.
// No network, no database.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const TC = require('./translation-check.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const json = f => JSON.parse(fs.readFileSync(path.join(REPO, f), 'utf8'))
const EN = json('messages/en-GB.json')
const list = json('docs/i18n/english-only-keys.json')
const keys = list['comparison.fit']?.keys ?? []
const enFlat = TC.flat(EN)

console.log('\n── 1 · the list')
t('one group, comparison.fit: exactly 15 keys, every one in en-GB, every one under comparison.fit, notFor empty',
  Object.keys(list).filter(k => k !== '$comment').length === 1 && keys.length === 15 && new Set(keys).size === 15
  && keys.every(k => k in enFlat && k.startsWith('comparison.fit.')) && (list['comparison.fit'].notFor ?? []).length === 0, keys)
t('…and they are exactly the keys fr-FR lacks (no other key is excused)',
  JSON.stringify(Object.keys(enFlat).filter(k => !(k in TC.flat(json('messages/fr-FR.json')))).sort()) === JSON.stringify([...keys].sort()))

console.log('\n── 2 · the checker')
const fr = json('messages/fr-FR.json')
t('fr-FR: 0 missing (the 15 are accepted)', TC.check({ locale: 'fr-FR', messages: fr, en: EN }).S.missing.length === 0)
const frLess = JSON.parse(JSON.stringify(fr)); delete frLess.comparison.faq.whatQ
t('control: a comparison key NOT on the list, removed from fr-FR, is still missing', JSON.stringify(TC.check({ locale: 'fr-FR', messages: frLess, en: EN }).S.missing) === '["comparison.faq.whatQ"]')
const enLess = JSON.parse(JSON.stringify(EN)); delete enLess.comparison.fit.mayNot
t('control: an English locale is never excused — comparison.fit.mayNot removed from an English file is missing',
  TC.check({ locale: 'en-IE', messages: enLess, en: EN }).S.missing.includes('comparison.fit.mayNot'))
t('englishOnly: true for a listed key in fr, de-AT, ja; false in en-GB, en-US; false for an unlisted key',
  TC.englishOnly('comparison.fit.mayNot', 'fr-FR') && TC.englishOnly('comparison.fit.mayNot', 'de-AT') && TC.englishOnly('comparison.fit.deliveryNone', 'ja-JP')
  && !TC.englishOnly('comparison.fit.mayNot', 'en-GB') && !TC.englishOnly('comparison.fit.mayNot', 'en-US') && !TC.englishOnly('comparison.faq.whatQ', 'fr-FR'))
const frBad = JSON.parse(JSON.stringify(fr)); frBad.comparison.fit.deliveryNamed = '{oops'
t('control: a listed key a language DOES carry is still parsed and compared (ICU caught)', TC.check({ locale: 'fr-FR', messages: frBad, en: EN }).S.icu.some(x => x.startsWith('comparison.fit.deliveryNamed')))

console.log('\n── 3 · no non-English text added')
const bases = fs.readdirSync(path.join(REPO, 'messages')).filter(f => /^[a-z]{2,3}-[A-Z]{2}\.json$/.test(f) && !f.startsWith('en-'))
const carrying = bases.filter(f => keys.some(k => k in TC.flat(json(`messages/${f}`))))
t(`none of the ${bases.length} non-English message files carries any of the 15 keys`, bases.length > 50 && !carrying.length, carrying)

console.log(`\n${fail ? '🔴' : '✓'} deploy-prep-1: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
