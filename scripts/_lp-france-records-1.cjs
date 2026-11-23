// scripts/_lp-france-records-1.cjs — france-records-1 (24 November 2026, docs/france-records-1-report.md): the NAMED SET-ASIDE for the harnesses
// that require every language base to hold every en-GB key (a MODULE, listed under shared_modules in scripts/harnesses.json).
// france-records-1 added the 60 strings below and, under TRANSLATE ONLY WHAT'S USED, translated them only into the 54 bases an enabled
// country uses. The five bases no enabled country uses (vi-VN, hi-IN, ur-PK, fil-PH, ta-LK) show them in English until a country uses them.
// Together with scripts/_lp-france-vat-1.cjs: `onlySetAside(l)` is true only when a base lacks EXACTLY those two lists and nothing else.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const FV1 = require('./_lp-france-vat-1.cjs')
const KEYS = [
  'errorsManage.business_owner_only',
  'errorsManage.business_too_long',
  'errorsManage.business_siren_invalid',
  'errorsManage.business_company_number_invalid',
  'errorsManage.business_vat_invalid',
  'errorsManage.business_regime_invalid',
  'errorsManage.business_regime_not_here',
  'errorsManage.business_nothing_to_save',
  'manageSettings.business.title',
  'manageSettings.business.intro',
  'manageSettings.business.ownerOnly',
  'manageSettings.business.legalName.label',
  'manageSettings.business.legalName.hint',
  'manageSettings.business.address.label',
  'manageSettings.business.address.hint',
  'manageSettings.business.address.street',
  'manageSettings.business.registration.siren',
  'manageSettings.business.registration.sirenHint',
  'manageSettings.business.registration.gb',
  'manageSettings.business.registration.gbHint',
  'manageSettings.business.registration.other',
  'manageSettings.business.registration.otherHint',
  'manageSettings.business.vat.label',
  'manageSettings.business.vat.hint',
  'manageSettings.business.vat.euHint',
  'manageSettings.business.regime.label',
  'manageSettings.business.regime.hint',
  'manageSettings.business.regime.none',
  'manageSettings.business.regime.franchise',
  'manageSettings.business.regime.reelSimplifie',
  'manageSettings.business.regime.reelNormalMonthly',
  'manageSettings.business.regime.reelNormalQuarterly',
  'manageSettings.business.regime.franchiseNote',
  'manageSettings.business.saveFailed',
  'manageReports.accountsCsv.header.receiptNo',
  'manageReports.daily.title',
  'manageReports.daily.help',
  'manageReports.daily.period',
  'manageReports.daily.custom',
  'manageReports.daily.from',
  'manageReports.daily.to',
  'manageReports.daily.button',
  'manageReports.daily.badRange',
  'manageReports.daily.failed',
  'manageReports.dailyCsv.meta.legalName',
  'manageReports.dailyCsv.meta.siren',
  'manageReports.dailyCsv.meta.registration',
  'manageReports.dailyCsv.meta.vatNumber',
  'manageReports.dailyCsv.meta.vatRegime',
  'manageReports.dailyCsv.meta.period',
  'manageReports.dailyCsv.header.date',
  'manageReports.dailyCsv.header.type',
  'manageReports.dailyCsv.header.rate',
  'manageReports.dailyCsv.header.sales',
  'manageReports.dailyCsv.header.refunds',
  'manageReports.dailyCsv.header.net',
  'manageReports.dailyCsv.header.vat',
  'manageReports.dailyCsv.goods',
  'manageReports.dailyCsv.total',
  'manageReports.dailyCsv.noRate'
]
const NEW = new Set(KEYS)
const ALL = new Set([...FV1.NEW_KEYS, ...KEYS])
/** One key, one locale: france-vat-1's or france-records-1's named set-aside? */
const setAside = (locale, key) => FV1.UNUSED_BASES.includes(locale) && ALL.has(key)
/** The base lacks EXACTLY france-vat-1's 24 and france-records-1's 60 keys, nothing else. */
function onlySetAside(locale) {
  if (!FV1.UNUSED_BASES.includes(locale)) return false
  const miss = FV1.missingKeys(locale)
  return miss.length === ALL.size && miss.every(k => ALL.has(k))
}
module.exports = { NEW_KEYS: KEYS, NEW_KEYS_MAP: () => Object.fromEntries(KEYS.map(k => [k, true])), setAside, onlySetAside, UNUSED_BASES: FV1.UNUSED_BASES, isNew: k => NEW.has(k) }
