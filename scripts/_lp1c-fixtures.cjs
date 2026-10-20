// scripts/_lp1c-fixtures.cjs — the shared fixtures for scripts/language-phase-1c.cjs (Language Phase 1c,
// docs/language-phase-1c-report.md). The GB and US trucks, orders and clock are Phase 1b's (scripts/_lp1b-fixtures.cjs);
// what changes is the commit BEFORE is captured on.
// 🔴 BEFORE_REF is HEAD when the phase began. Step 0 made no commit: the Phase 1b work was already committed by
// `89b3f29` ("template update"), and `accbb61` is the head that carries it.
const path = require('path')
const base = require('./_lp1b-fixtures.cjs')

// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): provisioning (lib/provision-truck.ts) now resolves the
// plan BY ROLE through getPlanCatalog() — public.plans / public.plan_prices — so every fake db that provisions a truck
// carries the catalogue AS THE MIGRATION SEEDS IT (scripts/_plans-catalog-fixture.cjs), in the table's own snake_case
// columns. These two tables are fixture INPUT, never part of a recorded view (PLAN_TABLES is filtered out of them).
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): plan_features is fixture input too — never recorded.
const PLAN_TABLES = ['plans', 'plan_prices', 'plan_features']
function planTables() {
  const cat = require('./_plans-catalog-fixture.cjs').seedCatalog(path.resolve(__dirname, '..'))
  if (!cat) return {}
  return {
    plans: cat.plans.map(p => ({
      key: p.key, name: p.name, description: p.description, sort_order: p.sortOrder, is_public: p.isPublic, is_internal: p.isInternal,
      is_trial: p.isTrial, is_signup_default: p.isSignupDefault, is_expiry_fallback: p.isExpiryFallback, is_demo: p.isDemo,
      pay_at_hatch_allowed: p.payAtHatchAllowed, active: p.active,
      // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the two columns 20261025 adds.
      included_vans: p.includedVans, trial_months: p.trialMonths,
      // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the two columns 20261026 adds.
      is_highlighted: p.isHighlighted, subtitle: p.subtitle,
    })),
    plan_prices: cat.prices.map(r => ({
      plan_key: r.planKey, country_code: r.countryCode, monthly_minor: r.monthlyMinor, included_online_minor: r.includedOnlineMinor,
      fee_bps: r.feeBps, extra_van_monthly_minor: r.extraVanMonthlyMinor,
    })),
    // ⚠️ RE-PINNED (Stage A2): the plans' feature switches (public.plan_features), as 20261025 seeds them.
    plan_features: (cat.features || []).map(f => ({ plan_key: f.planKey, feature: f.feature, enabled: f.enabled })),
  }
}

module.exports = { ...base, BEFORE_REF: 'accbb61', planTables, PLAN_TABLES }
