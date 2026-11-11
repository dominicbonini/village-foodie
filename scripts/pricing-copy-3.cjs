#!/usr/bin/env node
// scripts/pricing-copy-3.cjs — pricing-copy-3 (11 November 2026; docs/pricing-copy-3-report.md): the two decisions from
// docs/pricing-copy-2-report.md §2.
//   1 · costs-accounts-1, option A: the Manage › Reports "Pay at the truck" label (manageReports.accounts.payAtTruck) in id-ID, is-IS,
//       sr-RS and tr-TR becomes that language's own price word (planFeatures.priceWord.payAtHatch). The price word and every pricing-page
//       string are unchanged.
//   2 · Serbian dates, option (a): every date Intl formats for Serbian is in LATIN script (sr-RS → sr-Latn-RS), through ONE shared
//       mapping (lib/time-utils.ts intlDateLocale, re-exported as lib/i18n/intl-locale.ts) used by every date formatter — the truck
//       time helpers (Manage, KDS, receipts, emails: formatYmd / formatInstant / monthName / weekdayName / clocks), the legal pages'
//       date, the relative day words, the posters' dates and Admin › Countries' sample. Every other locale's output is byte-identical.
// BEFORE / AFTER for part 1 are the commit before pricing-copy-3's message commit and that commit (git log --grep '^pricing-copy-3:').
// Run: node scripts/pricing-copy-3.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  🔴 ${name}${detail === undefined ? '' : '\n      ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`) } }
const head = s => console.log(`\n── ${s}`)
const git = args => execFileSync('git', args, { cwd: REPO, maxBuffer: 256e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; if (v && typeof v === 'object') flat(v, q, out); else out[q] = v } return out }
const CYRILLIC = /[Ѐ-ӿ]/

;(async () => {
  head('1 · the "Pay at the truck" report label = the language\'s own price word (id-ID, is-IS, sr-RS, tr-TR)')
  const C = git(['log', '--format=%H', '--grep=^pricing-copy-3:', '--reverse', '--', 'messages/']).trim().split('\n').filter(Boolean)
  t('pricing-copy-3 has a message commit', C.length > 0)
  const AFTER = C[0] || 'HEAD', BEFORE = C[0] ? git(['rev-parse', `${C[0]}~1`]).trim() : 'HEAD'
  const at = (ref, f) => flat(JSON.parse(ref === 'TREE' ? read(f) : git(['show', `${ref}:${f}`])))
  const FOUR = ['id-ID', 'is-IS', 'sr-RS', 'tr-TR']
  const changedFiles = C.length ? git(['show', '--name-only', '--format=', AFTER]).trim().split('\n').filter(f => /^messages\/[a-z]{2}-[A-Z]{2}\.json$/.test(f)) : []
  t('the message commit changes exactly the four locale files', JSON.stringify(changedFiles.sort()) === JSON.stringify(FOUR.map(l => `messages/${l}.json`).sort()), changedFiles)
  for (const l of FOUR) {
    const b = at(BEFORE, `messages/${l}.json`), a = at(AFTER, `messages/${l}.json`)
    const moved = Object.keys({ ...a, ...b }).filter(k => a[k] !== b[k])
    t(`${l}: only manageReports.accounts.payAtTruck moved`, JSON.stringify(moved) === JSON.stringify(['manageReports.accounts.payAtTruck']), moved)
    t(`${l}: it now equals the price word ("${a['planFeatures.priceWord.payAtHatch']}"), which did not change`, a['manageReports.accounts.payAtTruck'] === a['planFeatures.priceWord.payAtHatch'] && a['planFeatures.priceWord.payAtHatch'] === b['planFeatures.priceWord.payAtHatch'] && b['manageReports.accounts.payAtTruck'] !== b['planFeatures.priceWord.payAtHatch'])
    const bb = at(BEFORE, `docs/i18n/back/${l}.json`), ba = at(AFTER, `docs/i18n/back/${l}.json`)
    t(`${l}: its back-translation follows the price word's`, ba['manageReports.accounts.payAtTruck'] === ba['planFeatures.priceWord.payAtHatch'] && Object.keys({ ...ba, ...bb }).filter(k => ba[k] !== bb[k]).join() === 'manageReports.accounts.payAtTruck')
  }
  const BASES = JSON.parse('[' + /export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/.exec(read('lib/i18n/locales.ts'))[1].replace(/'/g, '"') + ']')
  const off = BASES.filter(l => { const m = at('TREE', `messages/${l}.json`); return m['manageReports.accounts.payAtTruck'] !== m['planFeatures.priceWord.payAtHatch'] })
  t(`every base (${BASES.length}) says the label the way its own price word does (costs-accounts-1's rule)`, off.length === 0, off)

  head('2 · Serbian dates in Latin script — one mapping')
  const kit = require('./_render-kit.cjs')({ cacheTag: 'pricing-copy-3' })
  const M = await kit.bundle('pc3', [
    "export * as TU from '@/lib/time-utils'", "export { intlDateLocale as viaI18n } from '@/lib/i18n/intl-locale'",
    "export { localLegalDate } from '@/lib/legal-documents'", "export { eventDateLabel } from '@/lib/event-display'",
    "export { shortDateTextFor, dateTextFor } from '@/lib/weekly-post/locale'", "export { LOCALES } from '@/lib/i18n/locales'",
  ].join('\n'))
  const map = M.TU.intlDateLocale
  t('lib/i18n/intl-locale.ts re-exports THE mapping (one function, defined in lib/time-utils.ts)', M.viaI18n === map && /export \{ intlDateLocale \} from '@\/lib\/time-utils'/.test(read('lib/i18n/intl-locale.ts')))
  t('sr-RS → sr-Latn-RS; sr → sr-Latn; a tag that names its script keeps it', map('sr-RS') === 'sr-Latn-RS' && map('sr') === 'sr-Latn' && map('sr-Latn-RS') === 'sr-Latn-RS' && map('sr-Cyrl-RS') === 'sr-Cyrl-RS')
  const others = M.LOCALES.filter(l => !/^sr(-|$)/.test(l))
  t(`every other app locale (${others.length}) is returned unchanged`, others.every(l => map(l) === l) && map(undefined) === undefined, others.filter(l => map(l) !== l))
  t('lib/time-utils.ts stays import-free (the engine harnesses compile it alone)', !/^import /m.test(read('lib/time-utils.ts')))

  head('2 · every date path, for a Serbian truck and reader')
  const SR = { locale: 'sr-RS', timeZone: 'Europe/Belgrade', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
  const D = '2026-11-04'
  const outs = {
    formatYmd: M.TU.formatYmd(D, SR, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    formatInstant: M.TU.formatInstant('2026-11-04T16:30:00Z', SR, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }),
    formatYmdShortMonth: M.TU.formatYmdShortMonth(D, SR, { weekday: 'short', day: 'numeric', month: 'short' }),
    monthName: M.TU.monthName(D, 'sr-RS', 'long'), weekdayName: M.TU.weekdayName(D, 'sr-RS', 'long'),
    legal: M.localLegalDate('4 November 2026', 'sr-RS'),
    eventDate: M.eventDateLabel(D, SR, 'long'),
    poster: M.shortDateTextFor(D, 'sr-RS'), posterLong: M.dateTextFor ? M.dateTextFor(D, 'long', 'sr-RS', { caps: false, raisedOrdinals: true }) : 'n/a',
  }
  for (const [k, v] of Object.entries(outs)) t(`${k}: Latin script, no Cyrillic ("${v}")`, typeof v === 'string' && v.length > 0 && !CYRILLIC.test(v), v)
  t('the legal page date reads "4. novembar 2026."', outs.legal === '4. novembar 2026.', outs.legal)
  t('the month and weekday are "novembar" and "sreda"', outs.monthName === 'novembar' && outs.weekdayName === 'sreda', [outs.monthName, outs.weekdayName])
  const today = M.TU.getLocalDateInTz('Europe/Belgrade'), tomorrow = M.TU.addDaysYmd(today, 1)
  t('the relative day words are Latin ("Danas" / "Sutra")', M.eventDateLabel(today, SR, 'compact') === 'Danas' && M.eventDateLabel(tomorrow, SR, 'compact') === 'Sutra', [M.eventDateLabel(today, SR, 'compact'), M.eventDateLabel(tomorrow, SR, 'compact')])
  t('control: Intl itself writes sr-RS in Cyrillic (so the checks above are real)', CYRILLIC.test(new Intl.DateTimeFormat('sr-RS', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 4)))))

  head('2 · every other locale byte-identical to Intl with its own tag')
  const same = []
  for (const l of others) {
    const ts = { ...SR, locale: l }
    const want = new Date(Date.UTC(2026, 10, 4)).toLocaleDateString(l, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    if (M.TU.formatYmd(D, ts, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) !== want) same.push(l)
    if (M.localLegalDate('4 November 2026', l) !== new Intl.DateTimeFormat(l, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC', calendar: 'gregory', numberingSystem: 'latn' }).format(new Date(Date.UTC(2026, 10, 4)))) same.push(l + ' (legal)')
  }
  t('formatYmd and the legal date: unchanged for every other locale', same.length === 0, same)

  head('2 · "everywhere": no date formatter is left on a raw locale')
  const files = git(['ls-files', 'app', 'components', 'lib']).trim().split('\n').filter(f => /\.(ts|tsx)$/.test(f))
  const bad = []
  const RE = /(new Intl\.(DateTimeFormat|RelativeTimeFormat)|\.toLocaleDateString|\.toLocaleTimeString|\.toLocaleString)\(([^)]*)/g
  for (const f of files) {
    const src = read(f).split('\n')
    src.forEach((line, i) => {
      for (const m of line.matchAll(RE)) {
        const arg = m[3].trim()
        // Allowed: a literal tag ('en-GB', 'en-CA' …), no locale at all only where nothing is formatted (Intl.DateTimeFormat().resolvedOptions),
        // or a locale routed through the mapping. A number's toLocaleString is not a date: allowed when its receiver is not a Date.
        if (/^['"]/.test(arg) || /^intlDateLocale\(/.test(arg)) continue
        if (arg === '' && /resolvedOptions/.test(line)) continue
        if (/\.toLocaleString/.test(m[1]) && !/Date\(|instant|date/i.test(line.slice(0, m.index))) continue
        bad.push(`${f}:${i + 1}`)
      }
    })
  }
  t('every Intl date call in app/, components/ and lib/ takes a literal tag or intlDateLocale(…)', bad.length === 0, bad)

  console.log(`\n${fail ? '🔴' : '✅'} pricing-copy-3: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
