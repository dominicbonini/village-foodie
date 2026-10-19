#!/usr/bin/env node
// scripts/us-unpriced-country.cjs — a truck in a SWITCHED-OFF country with NO PLAN PRICES renders its price surfaces
// masked, never a crash (US dress rehearsal, stage 1 — docs/us-dress-rehearsal-stage1-report.md).
//
// The US row is enabled = false with all six plan price columns NULL (the CHECK country_settings_enabled_needs_prices_chk
// forbids switching it on until they are set). Every other harness renders the US with invented prices, because the
// price helpers THROW on a NULL price (requirePlanPrice) — so a real US truck (the hidden US test truck) crashed Manage:
// Billing, FeatureGate's upgrade line, the Settings van add-on for Pro / Max, and the admin truck-edit fee line.
// This harness renders them with the US row EXACTLY AS SEEDED (enabled false, prices NULL) and asserts:
//   • no throw; every amount is the masked word ("TBD" for en-US); no "$null", "NaN", "undefined", "£";
//   • planPricesDecided() is false for that row and true for GB; withPlaceholderPlanPrices(GB) is GB itself.
// GB is proven unchanged by language-phase-1d2 (Billing byte-identical) and the rest of the sweep.
// Fixtures only (Pizza Kitchen, 'test-truck'); nothing reaches a database or the network.
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'us-unpriced-country' })
const FIX = require('./_lp1d-fixtures.cjs')
const SEEDS = require('./_country-settings-gb.cjs')

const M_FILE = 'app/manage/[token]/page.tsx'
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name); if (detail !== undefined) console.log('     ', String(detail).slice(0, 400)) } }
const BAD = [/\$null/, /\bNaN\b/, /\bundefined\b/, /£/, /\bnull\/mo/]

;(async () => {
  const ctx = FIX.context(kit, REPO)
  const { html, h, PROVIDERS, inManage, GB } = ctx
  const usSeed = SEEDS.usFromSeed()
  // The US truck as the hidden test truck would be: the fixtures' US kitchen, with the row exactly as seeded.
  const US = { ...ctx.US, settings: { ...usSeed } }

  console.log('── the helpers')
  const T = await kit.bundle('us-unpriced-types', "export * from '@/lib/country-settings-types'\nexport * as PF from '@/lib/plan-features'")
  t('the US row as seeded is switched off with every plan price NULL',
    usSeed.enabled === false && ['starterMonthlyMinor', 'proMonthlyMinor', 'maxMonthlyMinor', 'proAllowanceMinor', 'maxAllowanceMinor', 'platformFeePct'].every(f => usSeed[f] === null), JSON.stringify(usSeed))
  t('planPricesDecided: US (seeded) false, GB true', T.planPricesDecided(usSeed) === false && T.planPricesDecided(GB.settings) === true)
  t('withPlaceholderPlanPrices returns GB\'s own row (the same object — a country with prices is untouched)', T.withPlaceholderPlanPrices(GB.settings) === GB.settings)
  let threw = null; try { T.PF.planPrices(usSeed) } catch (e) { threw = e.message }
  t('the guard still holds: a raw price read of the unpriced US row throws (nothing quietly borrows a number)', !!threw && /not been decided/.test(threw), threw)
  t('the van add-on reads the placeholder row without throwing (Pro / Max)',
    ['pro', 'max'].every(p => T.PF.vanAddonMonthlyMinor(p, T.withPlaceholderPlanPrices(usSeed)) === 1))

  console.log('── Manage › Billing, FeatureGate and Settings for a US truck with no plan prices')
  let M
  try {
    M = await kit.bundle('us-unpriced-manage', [
      `export { BillingTab, SettingsTab } from '@/${M_FILE}'`,
      "export { FeatureGate } from '@/components/FeatureGate'",
      PROVIDERS,
    ].join('\n'), {
      patches: [
        { file: M_FILE, append: 'export { BillingTab, SettingsTab }' },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
        { file: M_FILE, states: ctx.states(M_FILE, ['showUpgradeModal', 'upgradeTarget', 'showMatrix']) },
      ],
    })
  } catch (e) { t('the Manage page bundles', false, e.message); return finish() }

  // `bad`: the patterns that must not appear — every one for a US render; for the GB control only the broken values
  // ("£" is GB's own currency).
  const clean = (k, out, bad = BAD) => {
    const isErr = typeof out === 'string' && out.startsWith('ERROR')
    t(`${k}: renders (no throw)`, !isErr, isErr ? out : undefined)
    if (isErr) return
    const hit = bad.find(re => re.test(out))
    t(`${k}: no ${bad === BAD ? '"$null" / "NaN" / "undefined" / "£"' : '"NaN" / "undefined"'}`, !hit, hit && out.slice(Math.max(0, out.search(hit) - 120), out.search(hit) + 80))
    return out
  }
  const dollars = new Set()   // every "$n" left on a US Billing render — card-fee hedges only, reported below
  const billing = (C, truck, st = {}) => html(st, inManage(M, C, h(M.BillingTab, { truck })))
  for (const plan of ['trial', 'starter', 'pro', 'max']) {
    const truck = { ...US.truck, plan, trial_expires_at: plan === 'trial' ? '2026-12-31T23:59:59Z' : null }
    const out = clean(`US Billing · ${plan}`, billing(US, truck))
    if (out) {
      t(`US Billing · ${plan}: the plan amounts read "TBD"`, /TBD/.test(out))
      dollars.add(JSON.stringify((out.match(/\$[\d.,]+/g) || []).sort()))
    }
  }
  console.log('     dollar amounts left on US Billing (expected: card processing fees only):', [...dollars].join(' '))
  {
    const out = clean('US Billing · upgrade modal (Max)', billing(US, { ...US.truck, plan: 'pro' }, { showUpgradeModal: true, upgradeTarget: 'max' }))
    if (out) t('US Billing · upgrade modal: "TBD", no dollar amount', /TBD/.test(out) && !/\$\d/.test(out), out.match(/\$[\d.,]+/g))
  }
  {
    const all = billing(US, { ...US.truck, plan: 'starter' }, { showMatrix: true })
    const out = clean('US Billing · comparison matrix open', all)
    if (out) t('US Billing · matrix: no plan amount in dollars (the card fee hedges are not plan prices)', /TBD/.test(out), out.match(/\$[\d.,]+/g))
  }
  // FeatureGate refusing (a starter truck on a Pro feature): its upgrade line quotes the plan price.
  {
    const gate = html({}, inManage(M, US, h(M.FeatureGate, { feature: 'weekly_post', plan: 'starter', overrides: {}, trialExpiresAt: null })))
    const out = clean('US FeatureGate · refused', gate)
    if (out) t('US FeatureGate · refused: the price reads "TBD"', /TBD/.test(out), out.slice(0, 300))
  }
  // GB control: Billing still shows a real or masked GB price word, and never "TBD" (GB's masked word is "TBC").
  {
    const out = clean('GB Billing · pro (control)', billing(GB, { ...GB.truck, plan: 'pro' }), [/\bNaN\b/, /\bundefined\b/])
    if (out) t('GB Billing · pro: GB words, no "TBD"', !/TBD/.test(out))
  }
  // Settings tab for a US Pro / Max truck: the van add-on price is built (masked) rather than thrown.
  for (const plan of ['pro', 'max']) {
    const truck = { ...US.truck, plan }
    const noop = () => {}
    const props = { userRole: 'owner', truck, whatsappConnection: null, whatsappUsage: null, onConnectionUpdate: noop, token: 'harness', api: async () => ({}), showToast: noop,
      onVerifySuccess: noop, onSwitchTab: noop, categories: [], items: [], subcategories: [], onTruckUpdate: noop, onItemsPatch: noop, onCategoriesPatch: noop,
      onOpenWalkthrough: noop, notices: null }
    clean(`US Settings · ${plan}`, html({ vans: [{ id: 'v1', name: 'Van 1', active: true }], firstVanId: 'v1' }, inManage(M, US, h(M.SettingsTab, props))))
  }
  finish()
})().catch(e => { console.error(e); process.exit(1) })

function finish() {
  console.log(`\n${fail ? '✗' : '✓'} us-unpriced-country: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
