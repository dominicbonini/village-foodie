#!/usr/bin/env node
// scripts/pricing-copy-4.cjs — pricing-copy-4 (12 November 2026; docs/pricing-copy-4-report.md): THE PRICING WORDING SPLIT BY WHETHER
// A COUNTRY OFFERS ONLINE CARD PAYMENTS (Dominic, 12 November 2026).
//   • A CARD COUNTRY — its country_billing.payment_model offers online payments ('fee_from_payment', 'billed_online'): the trial banner's
//     "Prefer to take payment up front? Add online card payments any time." sentence (each language's own, restored from the commit
//     before 62865ee5, never retranslated), Pay as you go's "<b>{fee}*</b> on online orders only." (the asterisk back), Pro's asterisk,
//     the plan table's asterisk and the card-fee footnote.
//   • A MONTHLY-BILLING-ONLY COUNTRY — 'billed_at_truck', or no country_billing row: the banner without that sentence, Pay as you go's
//     line with no asterisk, no asterisk on Pro or the plan table, no card-fee footnote.
//   • ONE helper decides: lib/country-settings-types.ts offersOnlineCardPayments (the loader embeds the payment model in every settings
//     object). The new keys: pricing.banner.bodyCard / bodyOnlyCard, pricing.fee.feeOnlyCard (card countries) and
//     pricing.fee.includedNoMark, planTable.pay.feeNoMark (monthly-billing-only countries). Every existing key keeps its text.
//   • languages-world-2's languages (created after 62865ee5, so no card sentence on file): the 12 committed carry their CURRENT banner
//     in the card keys (Dominic: option (b)); for them and the 11 still to come, only the asterisk and footnote rules are required —
//     each of the 11 is named here and FAILS BY NAME if it arrives without them.
// Run: node scripts/pricing-copy-4.cjs
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
const tryGit = args => { try { return git(args) } catch { return null } }
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; if (v && typeof v === 'object') flat(v, q, out); else out[q] = v } return out }
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

/** pricing-copy-1's wording commit and the one before it — the text each language's card sentence is restored from. */
const PC1 = '62865ee5'
const PC1_BASE = git(['rev-parse', `${PC1}~1`]).trim()
/** This change's message commit: the one that added `bodyCard` to en-GB (and the one before it). TREE until it is committed. */
const MSG = (tryGit(['log', '--format=%H', '--reverse', '-S"bodyCard"', '--', 'messages/en-GB.json']) || '').trim().split('\n').filter(Boolean)[0] || null
const MSG_BASE = MSG ? git(['rev-parse', `${MSG}~1`]).trim() : 'HEAD'
const MSG_AFTER = MSG || 'TREE'
const at = (ref, f) => { const s = ref === 'TREE' ? (fs.existsSync(path.join(REPO, f)) ? read(f) : null) : tryGit(['show', `${ref}:${f}`]); return s == null ? null : JSON.parse(s) }

/** The five new keys: [new key, its sibling]. */
const NEW = [
  ['pricing.banner.bodyCard', 'pricing.banner.body'],
  ['pricing.banner.bodyOnlyCard', 'pricing.banner.bodyOnly'],
  ['pricing.fee.feeOnlyCard', 'pricing.fee.feeOnly'],
  ['pricing.fee.includedNoMark', 'pricing.fee.included'],
  ['planTable.pay.feeNoMark', 'planTable.pay.fee'],
]
const NEW_KEYS = NEW.map(x => x[0])
/** languages-world-2's 23 languages (docs/languages-world-2-report.md §2): 12 committed, 11 still to come. */
const LW2_DONE = ['uk-UA', 'ru-KZ', 'kk-KZ', 'uz-UZ', 'az-AZ', 'ka-GE', 'hy-AM', 'mn-MN', 'hi-IN', 'bn-BD', 'ur-PK', 'ne-NP']
const LW2_TO_COME = ['fil-PH', 'sq-AL', 'mk-MK', 'bs-BA', 'ca-AD', 'si-LK', 'ta-LK', 'km-KH', 'lo-LA', 'sw-TZ', 'am-ET']
const BASES = JSON.parse('[' + /export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/.exec(read('lib/i18n/locales.ts'))[1].replace(/'/g, '"') + ']')

/** The asterisk and footnote rules, for one file's flat messages (`m`). Returns the failures. */
function markRules(m) {
  const bad = []
  const fo = m['pricing.fee.feeOnly'], foc = m['pricing.fee.feeOnlyCard']
  if (fo !== undefined || foc !== undefined) {
    if (typeof fo !== 'string' || typeof foc !== 'string') bad.push('pricing.fee.feeOnly / feeOnlyCard: both must be there')
    else {
      if (fo.includes('*')) bad.push('pricing.fee.feeOnly (monthly-billing-only) has an asterisk')
      if (foc !== fo.replace('<b>{fee}</b>', '<b>{fee}*</b>') || !fo.includes('<b>{fee}</b>')) bad.push(`pricing.fee.feeOnlyCard must be feeOnly with the asterisk after the fee, inside the bold: ${JSON.stringify(foc)}`)
    }
  }
  for (const [nk, k] of [['pricing.fee.includedNoMark', 'pricing.fee.included'], ['planTable.pay.feeNoMark', 'planTable.pay.fee']]) {
    const v = m[k], nv = m[nk]
    if (v === undefined && nv === undefined) continue
    if (typeof v !== 'string' || typeof nv !== 'string') { bad.push(`${k} / ${nk}: both must be there`); continue }
    if ((v.match(/\*/g) || []).length !== 1) bad.push(`${k} (card countries) must keep exactly one asterisk: ${JSON.stringify(v)}`)
    if (nv.includes('*') || nv !== v.replace('*', '')) bad.push(`${nk} must be ${k} without its asterisk: ${JSON.stringify(nv)}`)
  }
  for (const [nk, k] of NEW.slice(0, 2)) if ((m[k] === undefined) !== (m[nk] === undefined)) bad.push(`${k} / ${nk}: both or neither`)
  return bad
}

;(async () => {
  head('1 · the one helper, and the loader that feeds it')
  const kit = require('./_render-kit.cjs')({ cacheTag: 'pricing-copy-4' })
  const L = await kit.bundle('pc4-lib', [
    "export { offersOnlineCardPayments } from '@/lib/country-settings-types'",
    "export { mapCountryRow, COUNTRY_SETTINGS_COLUMNS, COUNTRY_SETTINGS_COLUMNS_BEFORE_PC4 } from '@/lib/country-settings'",
    "export { COUNTRY_PAYMENT_MODELS } from '@/lib/country-settings-types'", "export { PAYMENT_MODELS } from '@/lib/billing/rules'",
  ].join('\n'))
  const ok = L.offersOnlineCardPayments
  t('fee_from_payment and billed_online are card countries', ok({ paymentModel: 'fee_from_payment' }) && ok({ paymentModel: 'billed_online' }))
  t('billed_at_truck is monthly billing only', ok({ paymentModel: 'billed_at_truck' }) === false)
  t('the settings type lists the same three payment models as Billing (lib/billing/rules.ts PAYMENT_MODELS)', JSON.stringify(L.COUNTRY_PAYMENT_MODELS) === JSON.stringify(L.PAYMENT_MODELS))
  t('neither settings module imports lib/billing (some harnesses compile them against older files)', !/from '@\/lib\/billing\//.test(read('lib/country-settings-types.ts') + read('lib/country-settings.ts')))
  t('no country_billing row (null) is monthly billing only (Dominic)', ok({ paymentModel: null }) === false)
  t('a settings object the loader did not build (no field: a harness fixture) renders as today\'s live countries do', ok({}) === true)
  t('the loader embeds the payment model in its one read', L.COUNTRY_SETTINGS_COLUMNS.endsWith(', country_billing(payment_model)') && !L.COUNTRY_SETTINGS_COLUMNS_BEFORE_PC4.includes('country_billing'))
  const LP1E = require('./_lp1e-fixtures.cjs')
  const gbRow = LP1E.snake(LP1E.GB())
  const map = cb => { try { return L.mapCountryRow(cb === 'ABSENT' ? gbRow : { ...gbRow, country_billing: cb }) } catch (e) { return 'THROWS' } }
  t('mapCountryRow: an embedded row → its model; null → null (no row); [] → null; [row] → its model', map({ payment_model: 'billed_online' }).paymentModel === 'billed_online' && map(null).paymentModel === null && map([]).paymentModel === null && map([{ payment_model: 'billed_at_truck' }]).paymentModel === 'billed_at_truck')
  t('mapCountryRow: no embed → no field (every fixture and pin stays byte-identical)', !('paymentModel' in map('ABSENT')))
  t('mapCountryRow refuses an unknown payment model', map({ payment_model: 'cash' }) === 'THROWS')

  head('1 · every pricing surface asks the helper — no per-page list')
  const users = {
    'components/pricing/PricingSection.tsx': [/cards \? 'fee\.feeOnlyCard' : 'fee\.feeOnly'/, /cards \? 'fee\.included' : 'fee\.includedNoMark'/, /cards \? 'banner\.bodyOnlyCard' : 'banner\.bodyOnly'/, /cards \? 'banner\.bodyCard' : 'banner\.body'/, /\{cards && <p className="price-note">\{t\('footnote'/],
    'components/pricing/PlanTable.tsx': [/offersOnlineCardPayments\(settings\) \? 'pay\.fee' : 'pay\.feeNoMark'/],
    'app/(public)/(site)/features/page.tsx': [/\{offersOnlineCardPayments\(settings\) && <p>\{tPricing\('footnote'/],
    'app/(app)/manage/[token]/page.tsx': [/\{offersOnlineCardPayments\(countryRow\) && <p className="text-xs text-slate-500 mt-3 px-1">\{tPricing\('footnote'/],
    'lib/plans-pdf.ts': [/cardsOn \? 'banner\.bodyOnlyCard' : 'banner\.bodyOnly'/, /cardsOn \? 'banner\.bodyCard' : 'banner\.body'/, /cardsOn \? 'fee\.feeOnlyCard' : 'fee\.feeOnly'/, /cardsOn \? 'fee\.included' : 'fee\.includedNoMark'/, /cardsOn \? 'pay\.fee' : 'pay\.feeNoMark'/, /\(cardsOn \? `<p>\$\{esc\(tp\('footnote'/],
    'lib/llms-text.ts': [/if \(offersOnlineCardPayments\(c\)\) L\.push\(`- \$\{cardSentence\(c\)\}`\)/],
  }
  for (const [f, res] of Object.entries(users)) {
    const s = read(f)
    t(`${f}: every switch goes through offersOnlineCardPayments`, /offersOnlineCardPayments/.test(s) && res.every(r => r.test(s)), res.filter(r => !r.test(s)).map(String))
  }
  // Nothing else renders these keys or the footnote, and nothing reads the payment model for wording except the helper.
  const files = git(['ls-files', 'app', 'components', 'lib']).trim().split('\n').filter(f => /\.(ts|tsx)$/.test(f) && !f.startsWith('lib/i18n/catalog'))
  const renders = files.filter(f => /(['"])(fee\.feeOnly|fee\.included|banner\.body|banner\.bodyOnly|pay\.fee)\1|\b(t|tp|tPricing)\('footnote'/.test(read(f)))
  const stray = renders.filter(f => !Object.keys(users).includes(f))
  t('no other file renders the banner, the fee lines, the plan table\'s fee row or the footnote', stray.length === 0, stray)
  const modelReaders = files.filter(f => /\bpaymentModel\b/.test(read(f)) && !/^lib\/billing\//.test(f) && !/^lib\/country-settings(-types)?\.ts$/.test(f) && !/(admin|billing)/i.test(f))
  t('no page or component reads paymentModel itself (only the helper and Billing)', modelReaders.length === 0, modelReaders)
  const route = read('app/api/admin/billing/route.ts')
  t('Admin › Billing: saving a country\'s model drops the settings cache and expires the marketing pages\' country data', /clearCountrySettingsCache\(code as string\)\s*\n\s*revalidateMarketing\(\[MARKETING_TAGS\.countries\]/.test(route))

  head('2 · every locale file at HEAD — the five keys, as asked')
  const files2 = fs.readdirSync(path.join(REPO, 'messages')).filter(f => /^[a-z]{2}-[A-Z]{2}\.json$/.test(f))
  let restored = 0, current = 0
  for (const f of files2) {
    const loc = f.slice(0, -5)
    const now = flat(at(MSG_AFTER, `messages/${f}`)); const was = at(MSG_BASE, `messages/${f}`); const before = was ? flat(was) : null
    const old = at(PC1_BASE, `messages/${f}`), oldF = old ? flat(old) : null
    const carries = NEW.some(([, k]) => now[k] !== undefined)
    if (!carries) continue
    // nothing but the five keys moved
    if (before) {
      const moved = Object.keys({ ...now, ...before }).filter(k => now[k] !== before[k])
      t(`${loc}: only the new keys were added, every other key unchanged`, moved.every(k => NEW_KEYS.includes(k) && before[k] === undefined), moved.filter(k => !NEW_KEYS.includes(k) || before[k] !== undefined))
    }
    // every sibling has its variant
    for (const [nk, k] of NEW) if (now[k] !== undefined) t(`${loc}: ${k} has its ${nk.split('.').pop()} beside it`, typeof now[nk] === 'string', nk)
    const bad = markRules(now)
    t(`${loc}: the asterisk and footnote rules`, bad.length === 0, bad)
    // the banner
    for (const [nk, k] of NEW.slice(0, 2)) {
      if (now[k] === undefined) continue
      if (oldF && oldF[k] !== undefined) {
        restored++
        t(`${loc}: ${nk} is the language's own text from before 62865ee5, exactly (restored, not retranslated)`, now[nk] === oldF[k], { now: now[nk], then: oldF[k] })
        t(`${loc}: ${k} (monthly billing only) is pricing-copy-1's text, unchanged`, now[k] === flat(at(PC1, `messages/${f}`))[k])
      } else {
        current++
        t(`${loc}: no card sentence on file (created after 62865ee5), so ${nk} is the current text (Dominic, option b)`, now[nk] === now[k], { card: now[nk], current: now[k] })
      }
    }
  }
  t(`the card sentence was restored in the ${restored / 2} older files and the current text used in the ${current / 2} newer ones`, restored > 0 && current > 0, { restored, current })

  head('2 · en-GB, word for word (the brief)')
  const GB = flat(at(MSG_AFTER, 'messages/en-GB.json'))
  t('en-GB bodyCard', GB['pricing.banner.bodyCard'] === 'With {brand}, customers order ahead and pay when they collect, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. When your trial ends you move to <plan>{fallback}</plan>{fallbackFree, select, yes { — no monthly fee —} other {}} unless you choose a plan. No card to start, no contract, cancel anytime.')
  t('en-GB feeOnlyCard', GB['pricing.fee.feeOnlyCard'] === '<b>{fee}*</b> on online orders only. Walk-up orders are always free.')
  t('en-GB feeOnly (monthly billing only) is the current text, no asterisk', GB['pricing.fee.feeOnly'] === '<b>{fee}</b> on online orders only. Walk-up orders are always free.')

  head('2 · back-translations follow (docs/i18n/back)')
  for (const f of fs.readdirSync(path.join(REPO, 'docs/i18n/back')).filter(x => /^[a-z]{2}-[A-Z]{2}\.json$/.test(x))) {
    const loc = f.slice(0, -5)
    const b = at(MSG_AFTER, `docs/i18n/back/${f}`), bb = at(MSG_BASE, `docs/i18n/back/${f}`), ob = at(PC1_BASE, `docs/i18n/back/${f}`)
    if (!NEW.some(([, k]) => b[k] !== undefined)) continue
    if (bb) {
      const moved = Object.keys({ ...b, ...bb }).filter(k => b[k] !== bb[k])
      t(`${loc} back: only the new keys were added`, moved.every(k => NEW_KEYS.includes(k) && bb[k] === undefined), moved)
    }
    const bad = markRules(b)
    t(`${loc} back: the asterisk rules`, bad.length === 0, bad)
    for (const [nk, k] of NEW.slice(0, 2)) if (b[k] !== undefined) t(`${loc} back: ${nk} — the back-translation from before 62865ee5, or the current one`, b[nk] === (ob && ob[k] !== undefined ? ob[k] : b[k]))
  }

  head('2 · languages-world-2 — the 12 committed and the 11 still to come (each by name)')
  for (const loc of [...LW2_DONE, ...LW2_TO_COME]) {
    const m = at(MSG_AFTER, `messages/${loc}.json`)
    if (!m) { t(`${loc}: still to come — must be a committed language already`, LW2_TO_COME.includes(loc)); console.log(`  · ${loc}: not written yet — this check fails by name if it arrives without the asterisk and footnote rules`); continue }
    const fm = flat(m)
    const missing = NEW_KEYS.filter(k => typeof fm[k] !== 'string')
    t(`${loc}: carries all five keys (a missing one would show English)`, missing.length === 0, missing)
    t(`${loc}: the asterisk and footnote rules`, markRules(fm).length === 0, markRules(fm))
    t(`${loc}: a language base`, BASES.includes(loc))
    if (LW2_DONE.includes(loc)) t(`${loc}: its card banner is its current banner (no card sentence on file)`, fm['pricing.banner.bodyCard'] === fm['pricing.banner.body'] && fm['pricing.banner.bodyOnlyCard'] === fm['pricing.banner.bodyOnly'])
  }

  head('3 · the pages, rendered — a card country and the same country as monthly billing only (fixtures, never the database)')
  const WF = require('./_world-countries-1-fixtures.cjs')
  const R = WF.renderer(kit, 'pc4')
  const base = WF.rowsWith(WF.WORLD)
  const withModel = (cc, model) => base.map(r => (r.countryCode === cc ? { ...r, countryBilling: model === undefined ? undefined : model === null ? null : { payment_model: model } } : r))
  const section = html => { const i = html.indexOf('class="trial-banner"'); const j = html.indexOf('class="price-note"'); return html.slice(i, j > i ? html.indexOf('</p>', j) + 4 : html.indexOf('class="plans', i) + 4000) }
  const span = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; let j = 0; while (j < a.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++; return a.slice(i, a.length - j).trim() }
  const textOf = h => h.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  for (const [seg, cc, loc] of [['uk', 'GB', 'en-GB'], ['fr', 'FR', 'fr-FR'], ['br', 'BR', 'pt-BR']]) {
    const M = flat(at(MSG_AFTER, `messages/${loc}.json`))
    const one = cc === 'BR'   // BR offers Unlimited only — its banner is bodyOnly
    const sentence = span(M[one ? 'pricing.banner.bodyOnlyCard' : 'pricing.banner.bodyCard'], M[one ? 'pricing.banner.bodyOnly' : 'pricing.banner.body'])
    const footStart = esc(M['pricing.footnote'].split('{')[0].slice(0, 20))
    for (const [label, model, cards] of [['card (fee_from_payment)', 'fee_from_payment', true], ['card (billed_online)', 'billed_online', true], ['card (fixture, no field)', undefined, true],
      ['monthly billing only (billed_at_truck)', 'billed_at_truck', false], ['monthly billing only (no country_billing row)', null, false]]) {
      if (cc === 'BR' && model === 'fee_from_payment') continue
      const rows = withModel(cc, model)
      const P = await kit.quietAsync(() => R.page('landing', seg, rows))
      const html = P.html ?? ''
      const sec = section(html)
      t(`/${seg} ${label}: the page renders`, html.length > 1000 && sec.length > 100, P.redirectedTo)
      t(`/${seg} ${label}: the banner ${cards ? 'has' : 'has no'} "${sentence.slice(0, 40)}…"`, sec.includes(esc(sentence)) === cards)
      if (!one) t(`/${seg} ${label}: Pay as you go's fee ${cards ? 'has' : 'has no'} asterisk`, cards ? /<b>[^<]*\*<\/b>[^<]*\S/.test(sec) && (sec.match(/\*<\/b>/g) || []).length === 2 : !sec.includes('*'))
      t(`/${seg} ${label}: ${cards ? 'the' : 'no'} card-fee footnote`, sec.includes('class="price-note"') === cards && html.includes(footStart) === cards)
      if (!cards) t(`/${seg} ${label}: no asterisk anywhere in the pricing section`, !textOf(sec).includes('*'))
      if (cc === 'GB' && cards && model === 'fee_from_payment') {
        const banner = textOf(sec.slice(0, sec.indexOf('</div>')))
        t('/uk card: the banner reads the brief word for word', banner.includes('Your first 3 months are completely free — every feature unlocked.') && banner.includes('With Pay at Hatch, customers order ahead and pay when they collect, so you can take online orders without connecting a card processor at all. Prefer to take payment up front? Add online card payments any time. When your trial ends you move to Pay as you go — no monthly fee — unless you choose a plan. No card to start, no contract, cancel anytime.'), banner)
        t('/uk card: "0.99%* on online orders only. Walk-up orders are always free."', sec.includes('<b>0.99%*</b> on online orders only. Walk-up orders are always free.'))
      }
      if (seg !== 'br') {
        const F = await kit.quietAsync(() => R.page('features', seg, rows))
        const fh = F.html ?? ''
        const row = esc(M[cards ? 'planTable.pay.fee' : 'planTable.pay.feeNoMark'])
        t(`/${seg}/features ${label}: the plan table's fee row ${cards ? 'with' : 'without'} its asterisk, ${cards ? 'and' : 'no'} footnote`, fh.includes(`>${row}<`) && fh.includes(footStart) === cards && (cards || !fh.includes(`>${esc(M['planTable.pay.fee'])}<`)), { row })
      }
      const pdf = await R.pdf(rows, cc)
      t(`plans PDF (${cc}) ${label}: the banner sentence, the asterisks and the footnote ${cards ? 'shown' : 'hidden'}`, pdf.includes(esc(sentence)) === cards && pdf.includes(footStart) === cards && (cards ? textOf(pdf.replace(/<style[\s\S]*?<\/style>/g, '')).includes('*') : !textOf(pdf.replace(/<style[\s\S]*?<\/style>/g, '')).includes('*')))
    }
  }

  head('3 · /llms.txt — the card sentence only for a card country')
  const cardLine = 'Plus ' + flat(at(MSG_AFTER, 'messages/en-GB.json'))['pricing.footnote'].split('Plus ')[1].split('(')[0].trim()
  const gbBlock = s => s.split('### United Kingdom')[1].split('###')[0]
  const llCard = await R.llms(withModel('GB', 'fee_from_payment')), llOff = await R.llms(withModel('GB', 'billed_at_truck'))
  t('GB, card: its card sentence is listed', gbBlock(llCard).includes(cardLine))
  t('GB, monthly billing only: no card sentence; its plans are listed as before', !gbBlock(llOff).includes(cardLine) && /- Pay as you go: £0 per truck per month\. 0\.99% on online orders\./.test(gbBlock(llOff)))
  t('every other country\'s block is unchanged', llCard.split('### United Kingdom')[0] === llOff.split('### United Kingdom')[0] && llCard.split('### United Kingdom')[1].split('###').slice(1).join('###') === llOff.split('### United Kingdom')[1].split('###').slice(1).join('###'))
  t('the Pay as you go line never has an asterisk (it never had one)', !/Pay as you go:[^\n]*\*/.test(llCard))

  console.log(`\n${fail ? '🔴' : '✅'} pricing-copy-4: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
