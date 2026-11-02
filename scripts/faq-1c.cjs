#!/usr/bin/env node
// scripts/faq-1c.cjs — faq-1c (2 November 2026, docs/faq-1c-report.md): PAY AT HATCH IS THE FREE TRIAL'S ONLY, PROVED.
//   node scripts/faq-1c.cjs                     the proof (in scripts/harnesses.json)
//   node scripts/faq-1c.cjs --capture <file>    write the HEAD hashes (run once at the commit before the change, in a worktree)
//
//   1 · THE PIN: replaying every migration in order, plans.pay_at_hatch_allowed is true on the trial and false on every public plan.
//       🔴 This is the fact the FAQ (…0010) and the pricing banner now state. If a later migration turns it on for a plan, this
//       FAILS on purpose — update the banner and the FAQ in the same change.
//   2 · Pizzeria Gusto resolves Pay at Hatch ON (its override), on the trial and after it; a test truck on Pay as you go resolves it
//       OFF; Manage › Payments shows the new line in that slot (and no upgrade prompt to a plan that does not exist)
//   3 · the old banner sentence is gone in all 28 bases (and en-GB, en-US, en-AU, es-MX); the new one is there
//   4 · the FAQ rows as 20261056 + 20261057 leave them read correctly in every switched-on country, with no digit, sign or plan name
//       outside a live value
//   5 · the landing page for GB, US, BR and JP — rendered with the public plans' Pay at Hatch OFF — differs from HEAD only in the
//       banner sentence: the first card still says "Online ordering"; /llms.txt byte-identical
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const kit = require('./_render-kit.cjs')({ cacheTag: 'faq-1c' })
const WF = require('./_world-countries-1-fixtures.cjs')
const { snake } = require('./_lp1e-fixtures.cjs')
const { REPO } = kit
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const sha = s => crypto.createHash('sha256').update(String(s ?? 'null')).digest('hex')
const SEG = { GB: 'uk', US: 'us', BR: 'br', JP: 'jp' }
const HEAD_FILE = 'scripts/fixtures/faq-1c-head.json'
const MIG = 'supabase/migrations/20261057_faq_1c.sql'

let pass = 0, fail = 0
const t = (label, ok, d) => { if (ok) pass++; else { fail++; console.log('  🔴 ' + label + (d !== undefined ? `\n      ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700)}` : '')) } }
const head = s => console.log('\n' + s)

/** The trial banner's words cut out (both sides), so every other byte is compared. */
const cutBanner = html => {
  const re = /(<div class="trial-banner"><strong>[\s\S]*?<\/strong><span>)([\s\S]*?)(<\/span><\/div>)/
  if (!re.test(html)) throw new Error('no trial banner in the landing page')
  return html.replace(re, '$1§BANNER§$3')
}
/** The pages with the public plans' Pay at Hatch as `allowed`. */
async function views(tag, allowed) {
  const R = WF.renderer(kit, tag)
  for (const p of R.catalog.plans) if (p.isPublic) p.payAtHatchAllowed = allowed
  for (const p of R.tables.plans) if (p.is_public) p.pay_at_hatch_allowed = allowed
  const rows = WF.rowsWith(WF.WORLD)
  const out = {}, html = {}
  for (const [cc, seg] of Object.entries(SEG)) {
    const P = await kit.quietAsync(() => R.page('landing', seg, rows))
    html[cc] = P.html
    out[`${cc}/landing`] = sha(cutBanner(P.html)) + ':' + sha(JSON.stringify(P.meta))
  }
  out.llms = sha(await R.llms(rows))
  return { out, html }
}

;(async () => {
  const cap = process.argv.indexOf('--capture')
  if (cap > 0) {
    const { out } = await views('f1c-capture', true)   // HEAD: every plan allows Pay at Hatch
    fs.writeFileSync(process.argv[cap + 1], JSON.stringify(out, null, 2) + '\n')
    console.log(`captured ${Object.keys(out).length} views → ${process.argv[cap + 1]}`)
    return
  }

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the pin: Pay at Hatch is the free trial\'s only (every migration replayed)')
  const files = fs.readdirSync(path.join(REPO, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()
  const flag = { payg: true, pro: true, unlimited: true, trial: true, demo: true, tester: true }   // 20261024_plans.sql: every plan true
  const writes = []
  for (const f of files) {
    const sql = read(`supabase/migrations/${f}`).replace(/--[^\n]*/g, '')
    for (const m of sql.matchAll(/update\s+public\.plans\s+set\s+pay_at_hatch_allowed\s*=\s*(true|false)\s+where\s+key\s+(?:in\s*\(([^)]*)\)|=\s*'([a-z_]+)')/gi)) {
      const keys = m[2] ? [...m[2].matchAll(/'([a-z_]+)'/g)].map(x => x[1]) : [m[3]]
      for (const k of keys) flag[k] = m[1].toLowerCase() === 'true'
      writes.push(`${f}: ${keys.join(',')} → ${m[1]}`)
    }
  }
  t('the trial keeps Pay at Hatch', flag.trial === true, flag)
  t('🔴 Pay as you go, Pro and Unlimited do not (if this fails, a migration turned it on — update the banner and FAQ …0010 too)', !flag.payg && !flag.pro && !flag.unlimited, { flag, writes })
  t('demo and tester as they were', flag.demo === true && flag.tester === true)
  const last = k => [...writes].reverse().find(w => w.split(': ')[1].split(' → ')[0].split(',').includes(k))
  t('the last write to each public plan\'s switch is 20261057_faq_1c.sql', ['payg', 'pro', 'unlimited'].every(k => (last(k) || '').startsWith('20261057_faq_1c.sql')), writes)

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · who resolves Pay at Hatch on')
  const P = await kit.bundle('f1c-plans', "export { payAtHatchOn, featureAccess, PAY_AT_HATCH_FEATURE, truckPlanSwitch } from '@/lib/plans'\nexport { featureBlock } from '@/lib/features'\nexport { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/managePayments'\nimport '@/lib/i18n/catalog/pricing'")
  const cat = WF.CATALOG()
  for (const p of cat.plans) if (p.key in flag) p.payAtHatchAllowed = flag[p.key]
  const sql = read(MIG)
  const gustoOverride = /update public\.trucks\s+set feature_overrides = coalesce\(feature_overrides, '\{\}'::jsonb\) \|\| jsonb_build_object\('online_ordering_pay_at_hatch', true\)\s+where slug = 'pizzeria-gusto'/.test(sql)
  t('the migration writes the override on pizzeria-gusto only (and touches no other column)', gustoOverride && (sql.match(/update public\.trucks/g) || []).length === 1)
  const gusto = { plan: 'trial', trial_expires_at: '2026-12-31T23:59:59Z', feature_overrides: { online_ordering_pay_at_hatch: true } }
  t('Pizzeria Gusto: ON during its trial', P.payAtHatchOn(gusto, cat, new Date('2026-11-02T12:00:00Z')))
  t('Pizzeria Gusto: still ON after its trial ends (Pay as you go), by its override', P.payAtHatchOn(gusto, cat, new Date('2027-01-15T12:00:00Z')))
  t('Pizzeria Gusto on any public plan: ON', ['payg', 'pro', 'unlimited'].every(plan => P.payAtHatchOn({ ...gusto, plan, trial_expires_at: null }, cat)))
  const test = { plan: 'payg', trial_expires_at: null, feature_overrides: {} }
  const acc = P.featureAccess(test, cat, P.PAY_AT_HATCH_FEATURE)
  t('a test truck on Pay as you go: OFF, blocked by the PLAN, with no plan to upgrade to', !P.payAtHatchOn(test, cat) && acc.block === 'plan' && acc.upgradeTo === null, acc)
  t('a truck on its trial: ON', P.payAtHatchOn({ plan: 'trial', trial_expires_at: '2026-12-31T23:59:59Z', feature_overrides: {} }, cat, new Date('2026-11-02T12:00:00Z')))
  t('a truck whose trial ended (→ Pay as you go): OFF', !P.payAtHatchOn({ plan: 'trial', trial_expires_at: '2026-09-30T23:59:59Z', feature_overrides: {} }, cat, new Date('2026-11-02T12:00:00Z')))
  const PT = read('components/manage/PaymentsTab.tsx')
  t('Manage › Payments: when the PLAN blocks it, the slot shows the new line — no PlanPrompt', /features\.block\(PAY_AT_HATCH_FEATURE\) === 'plan' && \(\s*<p [^>]*data-pay-at-hatch-trial-only>\{t\('online\.payAtHatchTrialOnly', \{ brand: priceText\(PRICE_WORD\.payAtHatch, appLocale\) \}\)\}<\/p>/.test(PT) && !/<PlanPrompt/.test(PT))
  t('…and its words: "Pay at Hatch is part of your free trial. Customers now pay for pre-orders online by card — connect Stripe below."', P.translatorFor('en-GB', 'managePayments')('online.payAtHatchTrialOnly', { brand: 'Pay at Hatch' }) === 'Pay at Hatch is part of your free trial. Customers now pay for pre-orders online by card — connect Stripe below.')
  const bases = ['fr-FR', 'de-DE', 'es-ES', 'it-IT', 'pt-PT', 'nl-NL', 'sv-SE', 'da-DK', 'nb-NO', 'pl-PL', 'cs-CZ', 'hu-HU', 'sk-SK', 'ro-RO', 'hr-HR', 'sl-SI', 'fi-FI', 'et-EE', 'lv-LV', 'lt-LT', 'el-GR', 'bg-BG', 'pt-BR', 'ms-MY', 'ja-JP', 'zh-HK', 'th-TH', 'ar-AE']
  t('…in all 28 languages (the brand word in each)', bases.every(l => { const s = P.translatorFor(l, 'managePayments')('online.payAtHatchTrialOnly', { brand: '¤BRAND¤' }); return s.includes('¤BRAND¤') && s.includes('Stripe') && !/[{}]/.test(s) }))

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · the banner: the old sentence gone, the new one there')
  const OLD = JSON.parse(read('scripts/fixtures/faq-1c-old-banner.json')).old
  const get = (d, k) => k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), d)
  const left = [], missingNew = []
  for (const [loc, first] of Object.entries(OLD)) {
    const d = JSON.parse(read(`messages/${loc}.json`))
    for (const k of ['pricing.banner.body', 'pricing.banner.bodyOnly']) { const v = get(d, k); if (v && v.includes(first)) left.push(`${loc} ${k}`); if (v && v.includes('{brand}')) missingNew.push(`${loc} ${k}`) }
  }
  t(`the old first sentence is in no banner (${Object.keys(OLD).length} files: en-GB, en-US, en-AU, es-MX and the 28 bases)`, Object.keys(OLD).length === 32 && left.length === 0, left)
  t('no banner still names {brand} (the sentence that held it is gone)', missingNew.length === 0, missingNew)
  const gbBody = P.translatorFor('en-GB', 'pricing').markup('banner.body', { brand: 'Pay at Hatch', fallback: 'Pay as you go', fallbackFree: 'yes', plan: c => c })
  t('en-GB: "During your free trial, customers can order ahead and pay when they collect, so you can start before connecting card payments. After your trial, pre-orders are paid online by card." — the rest unchanged', gbBody.startsWith('During your free trial, customers can order ahead and pay when they collect, so you can start before connecting card payments. After your trial, pre-orders are paid online by card. Prefer to take payment up front? Add online card payments any time. When your trial ends you move to') && gbBody.endsWith('No card to start, no contract, cancel anytime.'), gbBody)
  t('en-US says "pick up"', JSON.parse(read('messages/en-US.json')).pricing.banner.body.startsWith('During your free trial, customers can order ahead and pay when they pick up,'))
  t('every base renders both banners with no braces left', bases.every(l => ['body', 'bodyOnly'].every(k => !/[{}]/.test(P.translatorFor(l, 'pricing').markup(`banner.${k}`, { brand: 'X', fallback: 'Y', fallbackFree: 'no', price: '¤1', plan: c => c })))))
  t('the first card\'s "Online ordering" bullet follows online card payments, not Pay at Hatch', /\{ key: 'online', feature: 'online_payments' \}/.test(read('lib/feature-table.ts')) && !/online_ordering_pay_at_hatch/.test(read('lib/feature-table.ts').replace(/\/\/[^\n]*/g, '')))
  const fj = JSON.parse(read('data/comparison-features/features.json'))
  const fRow = (Array.isArray(fj) ? fj : fj.features).find(f => f.key === 'payattruck')
  t('the comparison row: "partial — During the free trial" (features file and migration agree)', fRow?.hatchgrab_source === 'fixed:partial:note' && /update public\.comparison_features set hatchgrab_source = 'fixed:partial:note'\s+where key = 'payattruck'/.test(sql)
    && JSON.parse(read('messages/en-GB.json')).comparison.features.payattruck.ours === 'During the free trial')

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the FAQ rows after 20261057')
  const L = await kit.bundle('f1c-faq', "export * from '@/lib/faq/live-values'\nexport * from '@/lib/faq/check'\nexport { mapCountryRow } from '@/lib/country-settings'")
  const countries = WF.rowsWith(WF.WORLD).filter(r => r.enabled).map(r => ({ settings: L.mapCountryRow(snake(r)), apps: r.countryCode === 'GB' }))
  const world = { catalog: cat, countries }
  const seed = parseSeed()
  const byId = Object.fromEntries(seed.items.map(i => [i.id.slice(-4), { ...i }]))
  const dq = (body, tag) => { const m = new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`).exec(body); return m ? m[1] : null }
  const blockOf = id => { const i = sql.indexOf(`where id = 'fa000002-0000-4000-8000-00000000${id}'`); const s = sql.lastIndexOf('update public.faq_items set', i); return sql.slice(s, i) }
  { const b = blockOf('0002'); byId['0002'].questionEn = dq(b, 'q'); byId['0002'].answerEn = dq(b, 'a'); byId['0002'].answerSinglePlanEn = dq(b, 's') }
  { const x = dq(blockOf('0003'), 'x'); byId['0003'].answerEn += x; byId['0003'].answerSinglePlanEn += x }
  byId['0006'].answerEn = byId['0006'].answerEn.replace('and connect Stripe if you want online card payments', 'and connect Stripe so customers can pay online')
  for (const id of ['0007', '0010', '0015']) byId[id].answerEn = dq(blockOf(id), 'a')
  t('the six rows rebuilt from the migration', ['0002', '0003', '0006', '0007', '0010', '0015'].every(id => byId[id].answerEn && !byId[id].answerEn.includes('$')) && byId['0002'].questionEn === 'What do I pay on each order?')
  for (const id of ['0002', '0003', '0006', '0007', '0010', '0015']) {
    const c = L.checkItem(byId[id], world)
    t(`…${id} reads correctly in every switched-on country (${c.shownCount})`, c.ok && c.shownCount === 44, c.sentences)
    const bare = [byId[id].questionEn, byId[id].answerEn, byId[id].answerSinglePlanEn || ''].join(' ').replace(/\{[^{}]*\}/g, ' ').replace('under 60 seconds', '')
    t(`…${id}: no digit, currency sign or plan name outside a live value`, !/\d/.test(bare) && !/\p{Sc}/u.test(bare) && !cat.plans.some(p => new RegExp(`\\b${p.name}\\b`).test(bare)))
  }
  t('…0015 is about 80 words or fewer', byId['0015'].answerEn.split(/\s+/).length <= 80, byId['0015'].answerEn.split(/\s+/).length)
  t('…0010 keeps its question; the pay-on-collection claim is the trial\'s only', byId['0010'].questionEn === 'Can customers pay at the truck instead of online?' && byId['0010'].answerEn.startsWith('During your free trial, yes:'))
  t('notes: done on every CHECK note and on …0002, …0007, …0010, …0015 — no note text written', /set note_done = true\s+where note like 'CHECK \(Cursor\): %'/.test(sql) && !/set note\s*=/.test(sql) && !/,\s*note\s*=/.test(sql))
  t('every FAQ write is guarded by the row\'s text as read live, and statuses are not written', (sql.match(/is not as read live/g) || []).length === 6 && !/status\s*=/.test(sql))

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the landing page: only the banner sentence differs from HEAD (Pay at Hatch off on every public plan)')
  const pinned = JSON.parse(read(HEAD_FILE))
  const { out, html } = await views('f1c-now', false)
  for (const k of Object.keys(pinned)) t(`${k}: identical to HEAD${/landing/.test(k) ? ' apart from the banner sentence' : ''}`, out[k] === pinned[k], { now: out[k], head: pinned[k] })
  t('GB: the new banner sentence, and the first card still says "Online ordering"', html.GB.includes('During your free trial, customers can order ahead and pay when they collect') && /<li>[^<]*Online ordering<\/li>|>Online ordering</.test(html.GB))
  t('BR (one plan): the single-plan banner carries the new sentence too', /During your free trial|Durante o teste grátis/.test(html.BR))

  console.log(`\nfaq-1c: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })

// ── the seed, read out of 20261056 (strings with '' escapes, null, integers) — as scripts/faq-1.cjs reads it ──────────
function parseSeed() {
  const src = read('supabase/migrations/20261056_faq_1.sql')
  const a = src.indexOf('insert into public.faq_items'), body = src.slice(src.indexOf('values', a) + 6, src.indexOf('on conflict', a))
  const out = []; let i = 0, cur = null
  while (i < body.length) {
    const ch = body[i]
    if (ch === '-' && body[i + 1] === '-') { i = body.indexOf('\n', i); if (i < 0) break; continue }
    if (ch === "'") { let v = ''; i++; for (;;) { if (body[i] === "'" && body[i + 1] === "'") { v += "'"; i += 2 } else if (body[i] === "'") { i++; break } else v += body[i++] } cur.push(v); continue }
    if (ch === '(') { cur = []; i++; continue }
    if (ch === ')') { out.push(cur); cur = null; i++; continue }
    const m = /^(null|-?\d+)/.exec(body.slice(i))
    if (m && cur) { cur.push(m[1] === 'null' ? null : Number(m[1])); i += m[1].length; continue }
    i++
  }
  return { items: out.map(([id, sectionId, position, questionEn, answerEn, answerSinglePlanEn, showIn, note]) => ({ id, sectionId, position, questionEn, answerEn, answerSinglePlanEn, showIn, note })) }
}
