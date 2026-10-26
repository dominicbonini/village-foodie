#!/usr/bin/env node
// scripts/pricing-check-1.cjs — proof for Admin › Pricing check (pricing-check-1, 23 October 2026;
// docs/pricing-check-1-report.md).
//   node scripts/pricing-check-1.cjs
//
// Runs lib/pricing-check.ts on fixtures built from data/pricing-research-1/*.json (the "Import research data" payload)
// and the plan catalogue as its migrations seed it, and asserts:
//   • the research report's totals, to ±1 (GB medium: our Unlimited 376, Aphelios 337, Order Tiger 366; IE busy:
//     our Unlimited 1,349, Order Tiger 1,339; NZ medium: HungryTrucks 743);
//   • GB medium, food-truck tools only, customer fees counted: "What Unlimited price would win" £29 / £39 / £59;
//   • GB small, customer fees NOT counted: "Not possible" (Beat The Queue costs the truck nothing beyond card fees);
//   • a plan whose order cap is below the volume is skipped (Qrder Gratis, 50 orders, at 150);
//   • the price-point rule, the stale rule, our key-feature cells, a planned country's proposed prices;
//   • the admin actions (lib/admin/pricing-check-actions.ts) on an in-memory store: import once and only once,
//     an edit inserts a new row and supersedes the old, verification resets, field allowlists refuse unknown fields.
// Nothing here reaches a database or the network.

/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'pricing-check-1' })
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')

const ok = [], bad = []
const t = (name, cond, detail) => { (cond ? ok : bad).push(name); if (!cond && detail !== undefined) console.log(`      ${name}: ${detail}`) }
const near = (a, b) => Math.abs(a - b) <= 1

const DATA = path.join(REPO, 'data/pricing-research-1')
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'))
const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const rowOf = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v]))

;(async () => {
  const m = await kit.bundle('engine', "export * from '@/lib/pricing-check'\nexport * as actions from '@/lib/admin/pricing-check-actions'")
  const raw = { competitors: read('competitors.json'), plans: read('plans.json'), benchmarks: read('benchmarks.json') }
  const competitors = raw.competitors.map(rowOf)
  const plans = raw.plans.map(p => ({ ...rowOf(p), verifiedAt: null, verifiedBy: null, supersededAt: null, createdAt: null }))
  const benchmarks = raw.benchmarks.map(b => ({ ...rowOf(b), supersededAt: null, createdAt: null }))
  t('data: 46 benchmarks, 128 competitors and 242 plans (the CSV + 4 tools and 10 plans from the manual)', benchmarks.length === 46 && competitors.length === 128 && plans.length === 242,
    `${benchmarks.length} / ${competitors.length} / ${plans.length}`)

  // The catalogue as the plans migrations seed it (GB, US), plus the IE and NZ rows OBSERVED live on 23 Oct 2026.
  const catalog = seedCatalog(REPO)
  catalog.prices = [...catalog.prices.filter(p => p.countryCode !== 'IE' && p.countryCode !== 'NZ'),
    ...catalog.prices.filter(p => p.countryCode === 'GB').map(p => ({ ...p, countryCode: 'IE' })),
    ...[['payg', 0, 0, 99], ['pro', 4900, 700000, 99], ['unlimited', 11900, null, 0]].map(([k, mo, inc, bps]) =>
      ({ planKey: k, countryCode: 'NZ', monthlyMinor: mo, includedOnlineMinor: inc, feeBps: bps, extraVanMonthlyMinor: mo }))]
  const COUNTRIES = {
    GB: { countryCode: 'GB', name: 'United Kingdom', enabled: true, currency: 'GBP', cardFeeOnlinePct: 1.5, cardFeeOnlineFixedMinor: 20 },
    IE: { countryCode: 'IE', name: 'Ireland', enabled: true, currency: 'EUR', cardFeeOnlinePct: 1.5, cardFeeOnlineFixedMinor: 25 },
    NZ: { countryCode: 'NZ', name: 'New Zealand', enabled: true, currency: 'NZD', cardFeeOnlinePct: 2.65, cardFeeOnlineFixedMinor: 30 },
    NL: { countryCode: 'NL', name: 'Netherlands', enabled: true, currency: 'EUR', cardFeeOnlinePct: 1.5, cardFeeOnlineFixedMinor: 25 },
  }
  catalog.prices.push(...catalog.prices.filter(p => p.countryCode === 'GB').map(p => ({ ...p, countryCode: 'NL' })))
  const rates = m.eurRates(benchmarks)
  const run = (code, options = m.DEFAULT_OPTIONS) => m.checkCountry({ countryCode: code, benchmark: benchmarks.find(b => b.countryCode === code) ?? null,
    country: COUNTRIES[code] ?? null, catalog, plans, competitors, rates }, options)
  const vol = (r, k) => r.volumes.find(v => v.key === k)
  const rival = (v, name, plan) => v.rivals.find(x => x.competitor && x.competitor.name.startsWith(name) && (!plan || x.plan.planName.startsWith(plan)))
  const our = (v, sortIndex) => v.ours[sortIndex]   // plans in sort order; the catalogue names them

  // ── the report's totals ──
  const gb = run('GB'), gbMed = vol(gb, 'medium')
  const unlimited = gbMed.ours[gbMed.ours.length - 1]
  t('GB medium: our cheapest plan is the last public plan (the unlimited one), 376', gbMed.best === unlimited && near(unlimited.totalMinor / 100, 376), unlimited.totalMinor / 100)
  t('GB medium: Aphelios 337', near(rival(gbMed, 'Aphelios').truckMinor / 100, 337), rival(gbMed, 'Aphelios').truckMinor / 100)
  t('GB medium: Order Tiger 366', near(rival(gbMed, 'Order Tiger').truckMinor / 100, 366), rival(gbMed, 'Order Tiger').truckMinor / 100)
  const ieBusy = vol(run('IE'), 'busy')
  t('IE busy: our Unlimited 1,349', near(ieBusy.best.totalMinor / 100, 1349), ieBusy.best.totalMinor / 100)
  t('IE busy: Order Tiger 1,339', near(rival(ieBusy, 'Order Tiger').truckMinor / 100, 1339), rival(ieBusy, 'Order Tiger').truckMinor / 100)
  const nzMed = vol(run('NZ'), 'medium')
  t('NZ medium: HungryTrucks 743', near(rival(nzMed, 'HungryTrucks').truckMinor / 100, 743), rival(nzMed, 'HungryTrucks').truckMinor / 100)
  t('GB medium: our plans 431 / 420 / 376 (the report §4)', [431, 420, 376].every((x, i) => near(our(gbMed, i).totalMinor / 100, x)), gbMed.ours.map(o => o.totalMinor / 100).join(' / '))

  // ── the suggestion ──
  const sug = gbMed.suggestion
  t('GB medium, food-truck only, customer fees counted: the rival to beat is Aphelios', sug && sug.rival.competitor.name.startsWith('Aphelios'), sug && sug.rival.competitor.name)
  t('GB medium: the suggestion is for our cheapest plan at medium (by name from the catalogue)', sug && sug.plan.name === unlimited.plan.name)
  t('GB medium: £29 / £39 / £59', sug && sug.cards.map(c => c.priceMinor / 100).join('/') === '29/39/59', sug && sug.cards.map(c => `${c.state}:${c.priceMinor}`).join(' '))
  t('GB medium: the £29 suggestion is flagged at or below Pro’s price', sug && sug.cards[0].atOrBelow && sug.cards[0].atOrBelow.monthlyMinor === 2900)
  t('GB medium: "Today" is 11.6% more than Aphelios', sug && Math.abs(sug.diffPct - 11.57) < 0.1, sug && sug.diffPct)
  const gbSmallNoCust = vol(run('GB', { ...m.DEFAULT_OPTIONS, countCustomerFees: false }), 'small')
  t('GB small, customer fees not counted: the rival is Beat The Queue at card cost only', gbSmallNoCust.cheapestRival && gbSmallNoCust.cheapestRival.competitor.name === 'Beat The Queue' && near(gbSmallNoCust.cheapestRival.comparableMinor / 100, 77))
  t('GB small, customer fees not counted: "Not possible"', gbSmallNoCust.suggestion && gbSmallNoCust.suggestion.cards[0].state === 'not_possible', gbSmallNoCust.suggestion && gbSmallNoCust.suggestion.cards.map(c => c.state).join())
  const gbSmall = vol(gb, 'small')
  t('GB small: Beat The Queue’s 50p shown as the customer’s (£75), not the truck’s', near(rival(gbSmall, 'Beat The Queue', 'Customer').customerMinor / 100, 75) && near(rival(gbSmall, 'Beat The Queue', 'Customer').truckMinor / 100, 77))
  t('GB small: with customer fees counted, its comparable total is 152', near(rival(gbSmall, 'Beat The Queue', 'Customer').comparableMinor / 100, 152))
  t('GB: Storekit (nearest-local) is dimmed by "Food-truck tools only", not dropped', rival(gbMed, 'Storekit').filteredOut === true && rival(gbMed, 'Storekit').reason === null)
  t('GB: Storekit’s card rate is assumed (not published)', rival(gbMed, 'Storekit').cardAssumed === true)
  t('GB: GloriaFood is not counted (closed)', rival(gbMed, 'GloriaFood').reason === 'Closed to new customers')

  // ── order caps ──
  const nlSmall = vol(run('NL'), 'small')
  const gratis = rival(nlSmall, 'Qrder', 'Gratis')
  t('NL small: Qrder Gratis (50 orders a month) is skipped at 150 orders', gratis && gratis.reason && /at most 50/.test(gratis.reason), gratis && gratis.reason)
  t('NL small: Qrder Lite (150) still counts at 150', rival(nlSmall, 'Qrder', 'Lite').reason === null)
  t('NL medium: Qrder Lite is skipped at 600', /at most 150/.test(rival(vol(run('NL'), 'medium'), 'Qrder', 'Lite').reason || ''))

  // ── planned countries: proposed prices placed by shape, never by name ──
  const jp = run('JP')
  t('JP: proposed, not live', jp.our.live === false && jp.our.problem === null)
  t('JP: ¥0 / ¥1,980 incl. ¥250,000 / ¥2,980, fees as the live rows', jp.our.plans.map(p => `${p.monthlyMinor}:${p.includedOnlineMinor}:${p.feeBps}`).join(' ') === '0:0:99 1980:250000:99 2980:null:0', jp.our.plans.map(p => `${p.monthlyMinor}:${p.includedOnlineMinor}:${p.feeBps}`).join(' '))
  t('JP: card rate from the benchmark (3.6%)', jp.card && jp.card.bps === 360 && jp.card.source === 'benchmark')
  const id = run('ID')
  t('ID: no card rate (cards not taken there)', id.card === null)
  const fr = run('FR')
  t('FR: one benchmark, €29 incl. €4,000 / €69 (france-1’s block), card 1.5% + 25', benchmarks.filter(b => b.countryCode === 'FR').length === 1 && fr.our.plans.map(p => p.monthlyMinor).join() === '0,2900,6900' && fr.card.bps === 150 && fr.card.fixedMinor === 25)
  t('IE and PT: meal source flagged "not Numbeo — check"', ['IE', 'PT'].every(c => { const b = benchmarks.find(x => x.countryCode === c); return b.mealSourceOk === false && /not Numbeo — check/.test(b.notes) }))
  t('every other country: meal source OK', benchmarks.filter(b => !['IE', 'PT'].includes(b.countryCode)).every(b => b.mealSourceOk))

  // ── the price-point rule ──
  const pp = m.pricePointAtOrBelow
  const cases = [[29.99, 29], [46.85, 39], [63.71, 59], [9, 9], [8.9, null], [99.5, 99], [100, 99], [149.5, 149], [212, 199], [999, 999], [1000, 990], [1500, 1490], [6999, 6990], [17250, 14900], [129375, 99000]]
  t('price points: ' + cases.map(c => c.join('→')).join(', '), cases.every(([x, y]) => pp(x) === y), cases.map(([x]) => `${x}→${pp(x)}`).join(' '))

  // ── stale ──
  t('stale: older than six months', m.isStale('2026-04-22', '2026-10-23') && !m.isStale('2026-04-23', '2026-10-23') && !m.isStale('2026-10-23', '2026-10-23'))

  // ── our key-feature cells, from the catalogue's switches ──
  const cell = (col, code) => m.ourFeatureCell(catalog, m.KEY_FEATURES.find(f => f.column === col), benchmarks.find(b => b.countryCode === code))
  const names = catalog.plans.filter(p => p.isPublic && p.active).sort((a, b) => a.sortOrder - b.sortOrder).map(p => p.name)
  t(`features: WhatsApp = "${names.slice(1).join(' & ')}" (the plans whose switch is on)`, cell('whatsapp', 'GB') === names.slice(1).join(' & '), cell('whatsapp', 'GB'))
  t('features: social posts the same', cell('socialPosts', 'GB') === names.slice(1).join(' & '))
  t('features: pre-orders and own web address on every plan → Yes', cell('preOrders', 'GB') === 'Yes' && cell('ownDomain', 'GB') === 'Yes')
  t('features: Android in GB → Yes; in IE → Not in this country', cell('androidApp', 'GB') === 'Yes' && cell('androidApp', 'IE') === 'Not in this country')
  t('features: iPhone app, store countries not recorded', /not recorded/.test(cell('iosApp', 'GB')))

  // ── no plan named in the engine (manual §81) ──
  const src = fs.readFileSync(path.join(REPO, 'lib/pricing-check.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  t('lib/pricing-check.ts names no plan key, price or allowance', !/'(payg|pro|unlimited|trial|demo|tester)'/.test(src) && !/\b(2900|6900|400000)\b/.test(src))

  // ── the admin actions on an in-memory store ──
  await actionsProof(m.actions, raw)

  console.log(`\npricing-check-1: ${ok.length} passed, ${bad.length} failed`)
  for (const b of bad) console.log('  ✗ ' + b)
  process.exit(bad.length ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })

// An in-memory PricingStore with the database's two rules that matter here: at most one current benchmark per country,
// and a supersede that only touches a row still current.
function memoryStore() {
  const db = { competitors: [], plans: [], benchmarks: [] }
  let n = 0
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  return {
    db,
    async counts() { return { competitors: db.competitors.length, plans: db.plans.length, benchmarks: db.benchmarks.length, research: db.plans.filter(p => p.source === 'research').length } },
    async listAll() { return { competitors: db.competitors.map(x => ({ ...x })), plans: db.plans.map(x => ({ ...x })), benchmarks: db.benchmarks.map(x => ({ ...x })) } },
    async insertMany(table, rows) { for (const r of rows) db[table].push({ superseded_at: null, verified_at: null, verified_by: null, created_at: '2026-10-23T09:00:00Z', ...r, id: r.id ?? id() }); return rows.length },
    async getPlan(planId) { return db.plans.find(p => p.id === planId) ?? null },
    async insertPlan(row) { const r = { superseded_at: null, verified_at: null, verified_by: null, created_at: '2026-10-23T09:00:00Z', ...row, id: id() }; db.plans.push(r); return { ...r } },
    async supersedePlan(planId, at) { const p = db.plans.find(x => x.id === planId && x.superseded_at === null); if (!p) return false; p.superseded_at = at; return true },
    async deletePlan(planId) { db.plans = db.plans.filter(p => p.id !== planId) },
    async setPlanVerified(planId, at, by) { const p = db.plans.find(x => x.id === planId && x.superseded_at === null); if (!p) return null; p.verified_at = at; p.verified_by = by; return { ...p } },
    async getCompetitor(cid) { return db.competitors.find(c => c.id === cid) ?? null },
    async findCompetitorByName(name) { return db.competitors.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null },
    async insertCompetitor(row) { if (db.competitors.some(c => c.name.trim().toLowerCase() === row.name.trim().toLowerCase())) throw new Error('duplicate name'); const r = { ...row, id: id() }; db.competitors.push(r); return { ...r } },
    async updateCompetitor(cid, cols) { const c = db.competitors.find(x => x.id === cid); if (!c) return null; Object.assign(c, cols); return { ...c } },
    async currentBenchmark(code) { return db.benchmarks.find(b => b.country_code === code && b.superseded_at === null) ?? null },
    async supersedeBenchmark(bid, at) { const b = db.benchmarks.find(x => x.id === bid && x.superseded_at === null); if (!b) return false; b.superseded_at = at; return true },
    async unsupersedeBenchmark(bid) { const b = db.benchmarks.find(x => x.id === bid); if (b) b.superseded_at = null },
    async insertBenchmark(row) {
      if (db.benchmarks.some(b => b.country_code === row.country_code && b.superseded_at === null)) throw new Error('one current benchmark per country')
      const r = { superseded_at: null, created_at: '2026-10-23T09:00:00Z', ...row, id: id() }; db.benchmarks.push(r); return { ...r }
    },
    // ⚠️ RE-PINNED (compare-de-1 / competitor-check-1, 25 October 2026): PricingStore gained the comparison entries
    // (20261042); loadState asks entriesReady(). This store has no entries table — as before 20261042 runs.
    async entriesReady() { return false },
    async listEntries() { return [] },
    async insertEntry() { throw new Error('no comparison_entries in this store') },
    async updateEntry() { return null },
    async deleteEntry() {},
    async existingIds(table, ids) { const t = { competitors: db.competitors, plans: db.plans, benchmarks: db.benchmarks }[table] || []; return t.filter(r => ids.includes(r.id)).map(r => r.id) },
  }
}

async function actionsProof(A, raw) {
  const s = memoryStore()
  const stamp = { by: '11111111-1111-4111-8111-111111111111', at: '2026-10-23T10:00:00.000Z', today: '2026-10-23' }
  const st = await A.loadState(s)
  t('actions: an empty store says so (the Import button shows)', st.ok && st.data.empty === true && st.data.importable === true)
  const imp = await A.importResearch(s, raw)
  t('actions: import inserts the research payload', imp.ok && s.db.competitors.length === raw.competitors.length && s.db.plans.length === raw.plans.length && s.db.benchmarks.length === raw.benchmarks.length, imp.error)
  const again = await A.importResearch(s, raw)
  t('actions: a second import is refused (a research row exists)', !again.ok && again.status === 409)
  const st2 = await A.loadState(s)
  t('actions: after import the button is gone', st2.ok && st2.data.empty === false && st2.data.importable === false)

  const btq = s.db.plans.find(p => p.country_code === 'GB' && p.plan_name === 'Customer Covers Fee (Option 1)')
  const v = await A.act(s, { action: 'verify', id: btq.id }, stamp)
  t('actions: Mark verified stamps who and when', v.ok && s.db.plans.find(p => p.id === btq.id).verified_by === stamp.by)
  const e = await A.act(s, { action: 'edit_plan', id: btq.id, fields: { monthlyMinor: 500, notes: 'Now £5 a month' } }, stamp)
  const old = s.db.plans.find(p => p.id === btq.id)
  const fresh = e.ok ? s.db.plans.find(p => p.id === e.data.plan.id) : null
  t('actions: an edit inserts a NEW row and supersedes the old one', e.ok && old.superseded_at === stamp.at && fresh && fresh.superseded_at === null && fresh.monthly_minor === 500, e.error)
  t('actions: the new row keeps the rest of the plan and starts unverified, source admin', fresh && fresh.customer_fee_fixed_minor === 50 && fresh.verified_at === null && fresh.source === 'admin' && fresh.checked_on === stamp.today)
  t('actions: the old row keeps its price (history)', old.monthly_minor === 0)
  const e2 = await A.act(s, { action: 'edit_plan', id: btq.id, fields: { monthlyMinor: 700 } }, stamp)
  t('actions: editing a superseded row is refused', !e2.ok && e2.status === 409)
  const bad1 = await A.act(s, { action: 'edit_plan', id: fresh.id, fields: { supersededAt: null, monthlyMinor: 100 } }, stamp)
  t('actions: an unknown field is refused (allowlist)', !bad1.ok && bad1.status === 400)
  const bad2 = await A.act(s, { action: 'edit_plan', id: fresh.id, fields: { cardMode: 'free' } }, stamp)
  t('actions: a bad value is refused', !bad2.ok && bad2.status === 400)

  const gbB = s.db.benchmarks.find(b => b.country_code === 'GB' && b.superseded_at === null)
  const eb = await A.act(s, { action: 'edit_benchmark', countryCode: 'GB', fields: { mealMinor: 1500 } }, stamp)
  const gbNow = s.db.benchmarks.filter(b => b.country_code === 'GB' && b.superseded_at === null)
  t('actions: editing country data supersedes the old benchmark (one current row)', eb.ok && gbNow.length === 1 && gbNow[0].meal_minor === 1500 && gbB.superseded_at === stamp.at && gbNow[0].eur_rate === gbB.eur_rate, eb.error)

  const f = await A.act(s, { action: 'set_feature', competitorId: btq.competitor_id, column: 'whatsapp', value: 'no' }, stamp)
  const c = s.db.competitors.find(x => x.id === btq.competitor_id)
  t('actions: a feature cell saves and stamps today', f.ok && c.whatsapp === 'no' && c.features_checked_on === stamp.today && c.features_verified_at === stamp.at)
  const f2 = await A.act(s, { action: 'set_feature', competitorId: btq.competitor_id, column: 'name', value: 'yes' }, stamp)
  t('actions: only the six feature columns can be set', !f2.ok && f2.status === 400)

  const add = await A.act(s, { action: 'add_competitor', competitor: { name: 'Test Truck Tool', website: 'https://example.com', focus: 'food_truck' },
    plan: { countryCode: 'GB', planName: 'Basic', currency: 'GBP', monthlyMinor: 1900, cardMode: 'unknown', checkedOn: '2026-10-23' } }, stamp)
  t('actions: Add competitor creates the tool and one plan (source admin)', add.ok && s.db.competitors.some(x => x.name === 'Test Truck Tool') && s.db.plans.some(p => p.plan_name === 'Basic' && p.source === 'admin'), add.error)
  const dup = await A.act(s, { action: 'add_competitor', competitor: { name: 'test truck tool ' }, plan: { countryCode: 'GB', planName: 'X', currency: 'GBP', monthlyMinor: 100 } }, stamp)
  t('actions: the same name in another case adds a plan to the existing tool', dup.ok && s.db.competitors.filter(x => x.name.toLowerCase().trim() === 'test truck tool').length === 1)
  const u = await A.act(s, { action: 'nope' }, stamp)
  t('actions: an unknown action is refused', !u.ok && u.status === 400)
}
