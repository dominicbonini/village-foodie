#!/usr/bin/env node
// docs/compare-research-1/build.cjs — turns the research agents' raw country files (docs/compare-research-1/raw/*.json) into
// the research importer's data file data/compare-research-1/competitors.json, and VALIDATES it with the importer's own
// pure rules (lib/data-import/research.ts researchProblems) plus our own checks. It NEVER connects to the database: the
// stored competitors' full ids come from docs/compare-research-1/stored-ids.json (read once with a read-only SELECT).
//
//   node docs/compare-research-1/build.cjs            build + validate (exit 1 on any problem)
//   node docs/compare-research-1/build.cjs --check    validate the existing data file only
//
// 🔴 Prices: the importer writes plans' monthly_minor AS GIVEN (no conversion). The agents record MAJOR units as the page
// shows them; this script converts with the repo's own toMinorUnits (lib/money-format.ts, which knows zero-decimal
// currencies such as JPY), and re-checks every plan: monthly_minor / 10^digits must equal the recorded amount. That is
// the guard against compare-status-1 §1.4's 100× prices.
'use strict'
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const ROOT = path.resolve(__dirname, '../..')
const jiti = require(path.join(ROOT, 'node_modules/jiti'))(__filename, { alias: { '@': ROOT }, interopDefault: true })
const { researchProblems } = jiti(path.join(ROOT, 'lib/data-import/research.ts'))
const { toMinorUnits, minorDigits } = jiti(path.join(ROOT, 'lib/money-format.ts'))
const { saysNotOffered, QUOTE_MAX } = jiti(path.join(ROOT, 'lib/competitor-check/model.ts'))

const RAW = path.join(__dirname, 'raw')
const OUT = path.join(ROOT, 'data/compare-research-1/competitors.json')
const STORED = JSON.parse(fs.readFileSync(path.join(__dirname, 'stored-ids.json'), 'utf8'))   // { prefix: { id, name, website, lifecycle } }
const FEATURE_KEYS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/comparison-features/features.json'), 'utf8')).features.map(f => f.key)
const KEYS = ['ahead', 'preorder', 'capacity', 'schedule', 'whatsapp', 'social', 'kds', 'offline', 'walkup', 'vans', 'domain', 'monthly', 'perorder', 'cardfee']
const FOCUS = ['food_truck', 'street_food_markets', 'nearest_local', 'pop_up', 'pos']
const CHECKED_ON = '2026-11-24'

const uuid = (seed) => { const h = crypto.createHash('sha1').update(`compare-research-1:${seed}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}` }
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase() } catch { return null } }
const norm = (s) => String(s ?? '').trim().toLowerCase()
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

function build() {
  const problems = []
  const files = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter(f => f.endsWith('.json')).sort() : []
  const vendors = new Map()   // key → merged vendor
  const notRelevant = [], unreadable = []
  for (const f of files) {
    let raw
    try { raw = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')) } catch (e) { problems.push(`${f}: not valid JSON — ${e.message}`); continue }
    const countries = Array.isArray(raw.countries) ? raw.countries : [raw.country]
    for (const v of raw.vendors ?? []) {
      const cc = String(v.country ?? countries[0] ?? '').toUpperCase()
      if (!/^[A-Z]{2}$/.test(cc)) { problems.push(`${f} · ${v.name}: no country`); continue }
      if (v.verdict === 'not_relevant') { notRelevant.push({ country: cc, name: v.name, website: v.website, stored: v.stored_id_prefix ?? null, reason: v.reason }); continue }
      if (v.verdict !== 'eligible') { unreadable.push({ country: cc, name: v.name, website: v.website, stored: v.stored_id_prefix ?? null, reason: v.reason }); continue }
      const stored = v.stored_id_prefix ? STORED[v.stored_id_prefix] : null
      if (v.stored_id_prefix && !stored) problems.push(`${f} · ${v.name}: stored_id_prefix ${v.stored_id_prefix} is not in stored-ids.json`)
      const key = stored ? stored.id : (host(v.website) ?? norm(v.name))
      const m = vendors.get(key) ?? { key, stored, name: stored?.name ?? v.name, website: v.website, focus: v.focus, countries: new Map(), answers: new Map(), check_urls: new Set(), evidence: [] }
      if (!FOCUS.includes(v.focus)) problems.push(`${f} · ${v.name}: focus "${v.focus}"`)
      if (v.focus === 'food_truck' && !(v.eligibility?.food_quote && v.eligibility?.order_quote)) problems.push(`${f} · ${v.name}: a food_truck tool needs food_quote and order_quote`)
      if (v.focus !== 'food_truck' && !v.eligibility?.order_quote) problems.push(`${f} · ${v.name}: needs an order_quote`)
      for (const q of ['food_quote', 'order_quote', 'country_quote']) if (v.eligibility?.[q] && String(v.eligibility[q]).length > QUOTE_MAX) problems.push(`${f} · ${v.name}: ${q} longer than ${QUOTE_MAX}`)
      m.evidence.push({ country: cc, ...v.eligibility, reason: v.reason })
      m.countries.set(cc, v.plans ?? [])
      for (const u of v.check_urls ?? []) if (m.check_urls.size < 10) m.check_urls.add(u)
      for (const a of v.answers ?? []) {
        if (!KEYS.includes(a.key)) continue                 // only the 14 key differentiators
        const prev = m.answers.get(a.key)
        const rank = (x) => (x ? ({ yes: 4, partial: 3, no: 2, not_mentioned: 1, unknown: 0 })[x.value] ?? 0 : -1)
        if (rank(a) > rank(prev)) m.answers.set(a.key, a)
      }
      vendors.set(key, m)
    }
  }

  // Dominic's preference order (24 Nov): restaurant (nearest_local) and till (pos) tools count only where a country has fewer
  // than 2 eligible food-truck tools WITH A PRICE. Where it has 2+, the others are left out of this file for that country
  // (listed under "not_needed"; nothing stored about them changes).
  const ftPriced = new Map()
  for (const m of vendors.values()) for (const [cc, ps] of m.countries) {
    if (['food_truck', 'street_food_markets', 'pop_up'].includes(m.focus) && ps.some(p => typeof p.price_major === 'number')) ftPriced.set(cc, (ftPriced.get(cc) ?? 0) + 1)
  }
  const notNeeded = []
  for (const m of vendors.values()) {
    if (!['nearest_local', 'pos'].includes(m.focus)) continue
    for (const cc of [...m.countries.keys()]) if ((ftPriced.get(cc) ?? 0) >= 2) { notNeeded.push({ country: cc, name: m.name, focus: m.focus }); m.countries.delete(cc) }
  }
  const competitors = [], plans = [], entries = []
  for (const m of vendors.values()) {
    if (!m.countries.size) continue
    const id = m.stored ? m.stored.id : uuid(`competitor:${m.key}`)
    const answers = []
    for (const k of KEYS) {
      const a = m.answers.get(k)
      if (!a) { answers.push({ key: k, value: 'not_mentioned' }); continue }
      const row = { key: k, value: a.value }
      if (['yes', 'partial', 'no'].includes(a.value)) { row.quote = clip(a.quote, QUOTE_MAX); row.source_url = a.url ?? a.source_url }
      if (a.value === 'unknown') row.note = clip(a.note || 'the page could not be read', 300)
      else if (a.note) row.note = clip(a.note, 300)
      if (a.value === 'no' && !saysNotOffered(row.quote ?? '', null)) { row.value = 'not_mentioned'; delete row.quote; delete row.source_url; row.note = clip(`was "no" without a negative quote — recorded as not mentioned${a.note ? `; ${a.note}` : ''}`, 300) }
      answers.push(row)
    }
    const cs = [...m.countries.keys()].sort()
    competitors.push({
      id, name: m.name, website: m.website, focus: m.focus, lifecycle: 'active', payment_providers: null,
      features_checked_on: CHECKED_ON, features_verified_at: null,
      notes: `compare-research-1 (24 Nov 2026): read on its own website; eligible — online ordering ahead (quotes in "evidence"). Countries: ${cs.join(', ')}.`,
      check_urls: [...m.check_urls].slice(0, 10), request_check: true, answers,
    })
    for (const cc of cs) {
      const ps = m.countries.get(cc)
      let primary = null, cheapest = Infinity
      for (let p of ps.slice(0, 4)) {
        const hidden = p.price_major === null || p.price_major === undefined
        const period = p.period ?? 'month'
        // A plan priced per day is estimated per month (× 365 / 12) and marked UNCLEAR, so it is never published as a stated
        // price; a multi-year prepay is a payment option of another plan — kept in the evidence, not written as a plan.
        if (!hidden && /^\d+\s*years?$/.test(String(period)) && period !== '1 year') continue
        // A one-off price with no subscription: no monthly fee, the amount is the set-up fee.
        if (!hidden && period === 'one_off') { p = { ...p, setup_major: p.price_major, price_major: 0, period: 'month', note: `one-off price ${p.price_major} ${p.currency}, no subscription${p.note ? `; ${p.note}` : ''}` } }
        if (!hidden && !['month', 'year', 'day', 'week'].includes(p.period ?? 'month')) { problems.push(`${m.name} · ${p.plan_name}: period "${period}" is not month, year, week, day or one_off`); continue }
        const yearly = (p.period ?? 'month') === 'year'
        // per day / per week: an estimate per month (× 365 / 12, × 52 / 12), marked unclear — never published as a stated price
        const perDay = ['day', 'week'].includes(p.period ?? 'month')
        const perUnit = (p.period ?? 'month') === 'week' ? 52 : 365
        const monthlyMajor = hidden ? null : (yearly ? p.price_major / 12 : perDay ? Math.round((p.price_major * perUnit / 12) * 100) / 100 : p.price_major)
        const cur = String(p.currency ?? '').toUpperCase()
        const minor = hidden ? null : toMinorUnits(monthlyMajor, cur)
        // the 100× guard: the stored value read back must be the page's amount
        if (!hidden && Math.abs(minor / 10 ** minorDigits(cur) - monthlyMajor) > 0.01) problems.push(`${m.name} · ${p.plan_name}: ${minor} does not read back as ${monthlyMajor} ${cur}`)
        const pid = uuid(`plan:${id}:${cc}:${norm(p.plan_name)}`)
        const feePct = typeof p.per_order_pct === 'number' ? Math.round(p.per_order_pct * 100) : 0
        const feeFixed = typeof p.per_order_fixed_major === 'number' ? toMinorUnits(p.per_order_fixed_major, cur) : 0
        plans.push({
          id: pid, competitor_id: id, country_code: cc, plan_name: clip(p.plan_name, 120), currency: cur,
          price_hidden: hidden, monthly_minor: minor, yearly_only: yearly, setup_minor: typeof p.setup_major === 'number' ? toMinorUnits(p.setup_major, cur) : 0,
          truck_fee_bps: feePct, truck_fee_fixed_minor: feeFixed, customer_fee_bps: 0, customer_fee_fixed_minor: 0,
          card_mode: 'unknown', card_bps: null, card_fixed_minor: null, card_rate_assumed: false,
          order_cap: null, included_orders: null, overage_fixed_minor: null,
          vat: ['incl', 'excl'].includes(p.vat) ? p.vat : 'unknown', status: hidden ? 'hidden' : 'counted', unclear: perDay, second_hand: false,
          source: 'research', source_url: p.url ?? null, checked_on: CHECKED_ON, verified_at: null, verified_by: null,
          notes: clip(`compare-research-1, read 24 Nov 2026: "${p.quote ?? ''}"${yearly ? ' (yearly price ÷ 12)' : ''}${perDay ? ` (priced per ${p.period}: ${p.price_major} ${cur} a ${p.period} × ${perUnit} ÷ 12 — an estimate, so marked unclear)` : ''}${p.note ? ` — ${p.note}` : ''}`, 1000),
        })
        if (!hidden && !perDay && monthlyMajor < cheapest && cur) { cheapest = monthlyMajor; primary = pid }
      }
      entries.push({ id: uuid(`entry:${cc}:${id}`), country_code: cc, competitor_id: id, primary_plan_id: primary, choose_when: null, sort_order: 50, verified_at: null, verified_by: null })
    }
  }
  const file = {
    $comment: 'compare-research-1 (24 Nov 2026): competitors read on their OWN websites by Claude Code, one request at a time (docs/compare-research-1-report.md). Imported automatically, once per version of this file, by the first step of the nightly competitor check (lib/data-import/). Every row source research, UNVERIFIED (35.an-1). Each answer carries the vendor’s verbatim quote and its page (35.an-4); "no" only with a quote saying it is not offered, silence is not_mentioned (35.ao-7). monthly_minor is MINOR units, converted from the page’s amount with lib/money-format.ts toMinorUnits (the 100× guard). request_check sets check_requested_at. "evidence" and "not_relevant" are for the reviewer; the import does not read them (the importer cannot mark a competitor not relevant).',
    id: 'compare-research-1', checked_on: CHECKED_ON, competitors, plans, entries,
    evidence: [...vendors.values()].map(m => ({ name: m.name, evidence: m.evidence })),
    not_relevant: notRelevant, unreadable, not_needed: notNeeded,
  }
  return { file, problems }
}

function validate(file) {
  const problems = researchProblems(file, { featureKeys: FEATURE_KEYS })
  for (const p of file.plans) if (p.status === 'counted' && !(Number.isInteger(p.monthly_minor))) problems.push(`${p.plan_name}: monthly_minor is not a whole number`)
  return problems
}

const checkOnly = process.argv.includes('--check')
let file, problems = []
if (checkOnly) file = JSON.parse(fs.readFileSync(OUT, 'utf8'))
else { const b = build(); file = b.file; problems = b.problems }
problems.push(...validate(file))
if (!checkOnly) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n') }
console.log(`not needed (2+ priced food-truck tools in the country): ${file.not_needed?.length ?? 0}`)
console.log(`competitors ${file.competitors.length}, plans ${file.plans.length} (${file.plans.filter(p => p.status === 'counted').length} priced), entries ${file.entries.length}, not relevant ${file.not_relevant?.length ?? 0}, unreadable ${file.unreadable?.length ?? 0}`)
if (problems.length) { console.log(`🔴 ${problems.length} problem(s):\n- ` + problems.join('\n- ')); process.exit(1) }
console.log('✓ the importer’s own validation (researchProblems) and the 100× guard pass — nothing written to any database')
