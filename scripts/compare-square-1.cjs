#!/usr/bin/env node
// scripts/compare-square-1.cjs — compare-square-1 (26 November 2026; docs/compare-square-1-report.md). Dominic's rules of 26 Nov in
// lib/comparison-publish.ts evaluateCountry, against the real module (bundled) and fixture rows — NO network, NO database:
//   1 · LIVE with at least 1 eligible priced competitor (was 2); none → not live, with the reason; AE never; Admin's switch wins
//   2 · the food-truck tools ranked class A, then class B, then unclassed food-truck focus; restaurant / till tools only make up 2
//   3 · Square (squareup.com), when publishable, always shown in the last slot: it pushes out the lowest-ranked tool; it counts towards
//       the 2 and towards SumUp's single-fallback test; Admin's hide and an unpublishable plan still keep it out
//   4 · the class reaches the publish step: competitorOut maps food_truck_class (A / B / null), the publish store selects it; the two
//       files outside lib/comparison-publish.ts gained only that field and that map entry; no page, Admin screen or UI file reads it
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_harness-tmp.cjs') // tmp-cleanup-1
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-square-1' })
const REPO = kit.REPO
const BASE = 'a3dab1e3' // the commit before compare-square-1

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

;(async () => {
  const L = await kit.bundle('cs1-lib', [
    "export { evaluateCountry, MIN_SHOWN, ALWAYS_SHOWN_DOMAINS, NEVER_AUTO } from '@/lib/comparison-publish'",
    "export { competitorOut, COLUMNS } from '@/lib/admin/pricing-check-actions'",
  ].join('\n'))

  const cc = (id, o = {}) => ({ id, name: `C-${id}`, website: `https://${id}.example`, focus: 'food_truck', lifecycle: 'active', addedAsCandidate: false, featuresVerifiedAt: null,
    checkUrls: [], checkIntervalDays: 90, checkFailures: 0, category: 'food_truck', categoryBy: 'auto', notInCountries: [], foodTruckClass: null, ...o })
  const pl = (id, cid, o = {}) => ({ id, competitorId: cid, countryCode: 'GB', planName: 'Basic', currency: 'GBP', priceHidden: false, monthlyMinor: 2900, status: 'counted', unclear: false,
    sourceUrl: `https://${cid}.example/pricing`, checkedOn: '2026-11-20', verifiedAt: null, verifiedBy: null, supersededAt: null, autoVerifiedAt: null, autoBlocked: false, ...o })
  const en = (id, cid, pid, o = {}) => ({ id, countryCode: 'GB', competitorId: cid, primaryPlanId: pid, sortOrder: 1, verifiedAt: null, pinned: false, hidden: false, autoVerifiedAt: null, autoBlocked: false, ...o })
  const va = (cid, o = {}) => ({ id: `va-${cid}`, competitorId: cid, featureKey: 'ahead', countryCode: null, value: 'partial', note: null, quote: 'Order online, collect later.',
    sourceUrl: `https://${cid}.example/order`, checkedOn: '2026-11-24', verifiedAt: null, verifiedBy: null, supersededAt: null, createdAt: null, autoVerifiedAt: null, autoBlocked: false, ...o })
  const site = c => c.website.replace(/\/$/, '')
  const X = (comps, o = {}) => ({ code: 'GB', currency: 'GBP', hasPage: true, autoPublish: true, adminOff: false, today: '2026-11-26', competitors: comps,
    plans: comps.map(c => pl(`p-${c.id}`, c.id, { sourceUrl: `${site(c)}/pricing` })), entries: comps.map(c => en(`e-${c.id}`, c.id, `p-${c.id}`, c.entry ?? {})),
    values: comps.map(c => va(c.id, { sourceUrl: `${site(c)}/order` })), priceEvidence: [], heldPlanIds: new Set(), ...o })
  const ids = v => v.shown.map(s => s.competitorId).join(',')
  const sq = (o = {}) => cc('sq', { name: 'Square', website: 'https://squareup.com/gb/en', focus: 'pos', category: 'general_pos', ...o })
  const rest = id => cc(id, { focus: 'nearest_local', category: 'restaurant' })
  const sumup = () => cc('su', { name: 'SumUp', focus: 'pos', website: 'https://www.sumup.com/en-gb/', category: 'general_pos' })

  head('1 · live with at least 1')
  t('MIN_SHOWN is 1', L.MIN_SHOWN === 1)
  const one = L.evaluateCountry(X([cc('a')]))
  t('one eligible priced competitor → live, "1 competitor shown"', one.live && ids(one) === 'a' && one.reason === '1 competitor shown', one)
  const none = L.evaluateCountry(X([cc('a')], { plans: [pl('p-a', 'a', { unclear: true, sourceUrl: 'https://a.example/pricing' })] }))
  t('none → not live, "no eligible competitor with a price (1 needed)"', !none.live && none.reason === 'no eligible competitor with a price (1 needed)', none)
  t('AE is never live, even with one', !L.evaluateCountry(X([cc('a')], { code: 'AE', currency: 'AED', plans: [pl('p-a', 'a', { countryCode: 'AE', currency: 'AED', sourceUrl: 'https://a.example/pricing' })], entries: [en('e-a', 'a', 'p-a', { countryCode: 'AE' })] })).live)
  t('Admin\'s switch wins: adminOff → not live', !L.evaluateCountry(X([cc('a'), cc('b')], { adminOff: true })).live)
  t('…auto-publish off → not live', !L.evaluateCountry(X([cc('a')], { autoPublish: false })).live)
  t('…a SumUp-only country stays not live (SumUp is still only a fallback beside one other)', !L.evaluateCountry(X([sumup()], { plans: [pl('p-su', 'su', { sourceUrl: 'https://www.sumup.com/en-gb/shop' })], values: [va('su', { sourceUrl: 'https://www.sumup.com/en-gb/x' })] })).live)

  head('2 · class A, then class B, then the rest')
  const mix = [cc('b1', { foodTruckClass: 'B', name: 'A-first-by-name' }), cc('u1', { foodTruckClass: null, name: 'AAA' }), cc('a1', { foodTruckClass: 'A', name: 'Zed' }),
    cc('b2', { foodTruckClass: 'B' }), cc('a2', { foodTruckClass: 'A' }), rest('r1')]
  const m = L.evaluateCountry(X(mix))
  t('six tools (2 A, 2 B, 1 unclassed food-truck, 1 restaurant) → A, A, B, B shown; the unclassed and the restaurant tool not', ids(m).split(',').slice(0, 2).sort().join(',') === 'a1,a2' && ids(m).split(',').slice(2).sort().join(',') === 'b1,b2' && m.shown.length === 4, ids(m))
  t('…the unclassed one is "beyond the four shown"; the restaurant tool "only make up 2"', /beyond the four shown/.test(m.competitors.find(c => c.competitorId === 'u1').reason) && /others only make up 2/.test(m.competitors.find(c => c.competitorId === 'r1').reason))
  const nonFtA = L.evaluateCountry(X([cc('x', { focus: 'nearest_local', category: 'restaurant', foodTruckClass: 'A' }), cc('b1', { foodTruckClass: 'B' })]))
  t('a class-A tool with a restaurant focus still ranks as a food-truck tool (first)', ids(nonFtA) === 'x,b1', ids(nonFtA))
  const r2 = L.evaluateCountry(X([rest('r1'), rest('r2'), rest('r3')]))
  t('no food-truck tool: restaurant tools make up 2 (not 3)', r2.live && r2.shown.length === 2)

  head('3 · Square in the last slot')
  const sqSites = { plans: null }
  const withSq = (comps) => { const x = X(comps); x.plans = x.plans.map(p => (p.competitorId === 'sq' ? { ...p, sourceUrl: 'https://squareup.com/gb/en/pricing' } : p)); x.values = x.values.map(v => (v.competitorId === 'sq' ? { ...v, sourceUrl: 'https://squareup.com/gb/en/online-store' } : v)); return x }
  const s4 = L.evaluateCountry(withSq([cc('a1', { foodTruckClass: 'A' }), cc('a2', { foodTruckClass: 'A' }), cc('b1', { foodTruckClass: 'B' }), cc('b2', { foodTruckClass: 'B', name: 'ZZZ' }), sq()]))
  t('four food-truck tools + Square → three shown and Square fourth; the lowest-ranked (a class B) pushed out', s4.shown.length === 4 && s4.shown[3].competitorId === 'sq' && s4.shown.filter(s => s.competitorId.startsWith('a')).length === 2 && s4.shown.filter(s => s.competitorId.startsWith('b')).length === 1, ids(s4))
  t('…the pushed-out tool says Square takes the fourth slot', s4.competitors.some(c => /Square takes the fourth slot/.test(c.reason)))
  const s1 = L.evaluateCountry(withSq([cc('a1', { foodTruckClass: 'A' }), rest('r1'), sq()]))
  t('one food-truck tool + a restaurant tool + Square → the food-truck tool and Square (Square counts towards the 2)', ids(s1) === 'a1,sq', ids(s1))
  const s0 = L.evaluateCountry(withSq([rest('r1'), rest('r2'), sq()]))
  t('no food-truck tool: one restaurant tool + Square make up 2', s0.shown.length === 2 && s0.shown[1].competitorId === 'sq' && s0.live, ids(s0))
  const sOnly = L.evaluateCountry(withSq([sq()]))
  t('Square alone → shown, live (1 is enough)', sOnly.live && ids(sOnly) === 'sq')
  const sSu = L.evaluateCountry({ ...withSq([cc('a1'), sq(), sumup()]), plans: [pl('p-a1', 'a1', { sourceUrl: 'https://a1.example/pricing' }), pl('p-sq', 'sq', { sourceUrl: 'https://squareup.com/gb/en/pricing' }), pl('p-su', 'su', { sourceUrl: 'https://www.sumup.com/en-gb/shop' })],
    values: [va('a1', { sourceUrl: 'https://a1.example/order' }), va('sq', { sourceUrl: 'https://squareup.com/gb/en/online-store' }), va('su', { sourceUrl: 'https://www.sumup.com/en-gb/x' })] })
  t('one tool + Square + SumUp → SumUp not shown (Square makes 2, so SumUp is no longer the single fallback)', ids(sSu) === 'a1,sq' && /single fallback/.test(sSu.competitors.find(c => c.competitorId === 'su').reason), ids(sSu))
  const sHid = L.evaluateCountry(withSq([cc('a1'), sq({ entry: { hidden: true } })]))
  t('Admin hides Square → not shown (Admin wins)', ids(sHid) === 'a1' && /hidden by Admin/.test(sHid.competitors.find(c => c.competitorId === 'sq').reason), sHid.competitors)
  const sBad = L.evaluateCountry({ ...withSq([cc('a1'), sq()]), plans: [pl('p-a1', 'a1', { sourceUrl: 'https://a1.example/pricing' }), pl('p-sq', 'sq', { currency: 'USD', sourceUrl: 'https://squareup.com/gb/en/pricing' })] })
  t('Square with a plan that doesn\'t qualify (wrong currency) → not shown', ids(sBad) === 'a1')
  t('ALWAYS_SHOWN_DOMAINS is squareup.com only', JSON.stringify(L.ALWAYS_SHOWN_DOMAINS) === '["squareup.com"]')

  head('4 · the class reaches the publish step; nothing else changed')
  t('competitorOut maps food_truck_class A → "A", B → "B", null → null', L.competitorOut({ id: 'x', food_truck_class: 'A' }).foodTruckClass === 'A' && L.competitorOut({ id: 'x', food_truck_class: 'B' }).foodTruckClass === 'B' && L.competitorOut({ id: 'x', food_truck_class: null }).foodTruckClass === null)
  t('the competitors select includes food_truck_class', L.COLUMNS.competitors.split(', ').includes('food_truck_class'))
  t('the publish store (Postgres) selects COLUMNS.competitors and the run maps them through competitorOut', /select \$\{COLUMNS\.competitors\} from public\.competitors/.test(read('lib/comparison-publish-store-pg.ts')) && /competitors\.map\(competitorOut\)/.test(read('lib/comparison-publish-run.ts')))
  const added = f => { try { return execSync(`git diff ${BASE} -- ${f}`, { cwd: REPO }).toString().split('\n').filter(l => /^[+-][^+-]/.test(l)) } catch { return ['error'] } }
  const a1 = added('lib/pricing-check.ts'), a2 = added('lib/admin/pricing-check-actions.ts')
  t('lib/pricing-check.ts: only added lines — the foodTruckClass field and its comment', a1.length > 0 && a1.every(l => l.startsWith('+')) && a1.filter(l => !/^\+\s*(\/\*\*|\*)/.test(l)).every(l => /foodTruckClass\?: 'A' \| 'B' \| null/.test(l)), a1)
  t('lib/admin/pricing-check-actions.ts: only added lines — the column-map entry and its comment', a2.length > 0 && a2.every(l => l.startsWith('+')) && a2.filter(l => !/^\+\s*\/\//.test(l)).every(l => /foodTruckClass: \{ col: 'food_truck_class', kind: \{ oneOf: \['A', 'B'\], nullable: true \} \}/.test(l)), a2)
  const uiFiles = execSync("git ls-files 'app/**/*.tsx' 'components/**/*.tsx' 'app/**/*.ts'", { cwd: REPO }).toString().split('\n').filter(Boolean)
  const readers = uiFiles.filter(f => /foodTruckClass|food_truck_class/.test(read(f)))
  t('no page, Admin screen or UI file reads the class (the Admin pricing page output is unchanged)', readers.length === 0, readers)
  // ⚠️ RE-PINNED (compare-suits-fix-2, 26 Nov 2026): compare-square-1's own commits only (BASE → c2387f92, its report) — the guide's page
  // change is compare-suits-fix-2's, on purpose.
  const changed = execSync(`git diff --name-only ${BASE} c2387f92 -- app components`, { cwd: REPO }).toString().trim()
  t('no file under app/ or components/ changed since the base commit', changed === '', changed)

  console.log(`\n${fail ? '🔴' : '✓'} compare-square-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
