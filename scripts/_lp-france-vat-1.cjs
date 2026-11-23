// scripts/_lp-france-vat-1.cjs — france-vat-1 (24 November 2026, docs/france-vat-1-report.md): THE ONE NAMED SET-ASIDE for the harnesses that
// require every language base to hold every en-GB key (a MODULE, listed under shared_modules in scripts/harnesses.json).
//
// france-vat-1 added 24 strings and, under the standing rule TRANSLATE ONLY WHAT'S USED (reference manual, V16.34), translated them only
// into the 54 bases an enabled country uses. The five bases no enabled country uses — vi-VN, hi-IN, ur-PK, fil-PH, ta-LK — show those 24
// in English until a country is switched to them. This module names exactly that, and nothing more: a harness asks `setAside(l, key)`
// for one key, or `onlySetAside(l)` for "this base lacks exactly these 24 and nothing else". Any other missing key still fails.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')

const UNUSED_BASES = ['vi-VN', 'hi-IN', 'ur-PK', 'fil-PH', 'ta-LK']
const ITEM_RATES = ['label', 'hintSome', 'hintNone', 'button', 'title', 'intro', 'setAll', 'default', 'rateAria', 'otherItems', 'noItems', 'close', 'cancel', 'save', 'saved']
const NEW_KEYS = [
  'manageCharges.noVat', 'manageCharges.noVatHint', 'manageCharges.otherRate', ...ITEM_RATES.map(k => `manageCharges.itemRates.${k}`),
  'errorsManage.charges_items_invalid', 'errorsKitchen.order_finished_edit', 'errorsKitchen.order_finished_cancel',
  'manageReports.accountsCsv.header.netAtRate', 'manageReports.accountsCsv.header.taxAtRate', 'manageReports.accountsCsv.noRate',
]
const NEW = new Set(NEW_KEYS)

const leaves = (o, p = '', out = []) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') leaves(v, p + k + '.', out); else out.push(p + k) } return out }
/** en-GB keys the locale's own file lacks (planNames.* are checked against the plan catalogue elsewhere, so left out). */
function missingKeys(locale) {
  const en = leaves(JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8')))
  const have = new Set(leaves(JSON.parse(fs.readFileSync(path.join(REPO, `messages/${locale}.json`), 'utf8'))))
  return en.filter(k => !have.has(k) && !k.startsWith('planNames.'))
}
/** One key, one locale: is it france-vat-1's named set-aside? */
const setAside = (locale, key) => UNUSED_BASES.includes(locale) && NEW.has(key)
/** The base lacks EXACTLY france-vat-1's 24 keys and nothing else (so translation-check's "Structural: 24" there is this, and only this). */
function onlySetAside(locale) {
  if (!UNUSED_BASES.includes(locale)) return false
  const miss = missingKeys(locale)
  return miss.length === NEW_KEYS.length && miss.every(k => NEW.has(k))
}
module.exports = { UNUSED_BASES, NEW_KEYS, setAside, onlySetAside, missingKeys }
