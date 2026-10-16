// scripts/_lp1d-fixtures.cjs — the shared GB and US fixtures for scripts/language-phase-1d.cjs (Language Phase 1d Part 1).
// A MODULE, not a harness. The GB truck is Pizza Kitchen ('test-truck' / 'test-kitchen'); the US truck is the same
// kitchen in the US: USD, en-US, 12-hour, month-day-year, Sunday weeks, America/Chicago, the US address style
// (zip_state), from the US seed row. Orders, menu and clock are Phase 1b's (scripts/_lp1b-fixtures.cjs).
//
// ctx.html(state, el)  full HTML of `el`, with useState hooks started from `state` (render-kit `states` patches).
//   • state.__after = { when: RegExp, file?: 'path', set: {…} } — applied only when `file` (default the Manage page)
//     matches `when`: a state an effect now holds as a CODE (or a new state) is given on the new code only, so the same
//     view proves it renders exactly the sentence BEFORE held.
// ctx.states(file, names)  the names this code has as `const [name, …] = useState` — a name the code does not have is
//     skipped (and reported), so one module runs on 756ca09 and on this tree.
const fs = require('fs'); const path = require('path')
const base = require('./_lp1b-fixtures.cjs')
const SEEDS = require('./_country-settings-gb.cjs')

const MANAGE = 'app/manage/[token]/page.tsx'
const NOW = base.NOW   // 2026-10-09T17:20:00Z — a Friday

function country(cc) {
  const c = base.country(cc)
  const US = cc === 'US'
  // The US row as language-phase-2 renders it (scripts/_lp2-extra.cjs US_ON): enabled, with plan prices decided (the
  // seed leaves them null, and Manage refuses to show a price that is not set).
  const settings = US ? { ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 3900, proMonthlyMinor: 5900, maxMonthlyMinor: 9900, proAllowanceMinor: 30000, maxAllowanceMinor: 100000, platformFeePct: 1.5 } : SEEDS.gbFromSeed()
  const truck = {
    ...c.TRUCK,
    id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', description: 'Wood-fired pizza from a vintage truck.',
    cuisine_type: 'Pizza', logo_storage_path: null, logo: null, contact_email: 'kitchen@example.test',
    contact_phone: US ? '(201) 555-0123' : '07700 900123', social_instagram: 'pizzakitchen', social_facebook: null,
    website: 'https://pizzakitchen.example', whatsapp: null, phone_is_whatsapp: false, auto_accept: false,
    truck_order_email_enabled: true, dashboard_token: 'harness', crew_mode: 'solo', kds_mode: false, keep_screen_on: false,
    plan: 'max', feature_overrides: {}, features: {}, trial_expires_at: null, hide_pricing: false, whatsapp_sender: null,
    allergen_info_url: null, allergen_info_text: null, allergen_display_mode: 'per_dish', preferred_contact_method: 'email',
    allow_customer_cancellation: true, cancellation_cutoff_mins: 30, default_auto_open: true, default_auto_close: true,
    qr_code_style: 'standard', truck_emoji: '🍕', scraper_preference: 'both', schedule_url: null, preorders_enabled: true,
    preorder_deadline_type: 'hours_before', preorder_deadline_value: 2, preorder_past_action: 'sold_out', preorder_open_rule: 'on_confirm',
    setup_step: null, show_paid_step: true, takes_cash: true, completion_presses: 'two', add_order_layout: 'tabs', event_post_wording: null,
    timezone: c.time.timeZone, country: cc, base_place_id: US ? 'place-us' : 'place-gb', base_place_name: US ? 'Springfield' : 'Harnessville',
    base_region: US ? 'Illinois' : 'Suffolk', base_lat: US ? 39.78 : 52.2, base_lng: US ? -89.65 : 0.6, time: c.time,
    tax_rate_milli: US ? 8250 : null, tipping_enabled: US, service_fee_enabled: false, service_fee_bps: null, service_fee_fixed_minor: null,
    currency: c.fmt.currency, custom_domain: null, embed_enabled: false, display_mode: 'list',
  }
  return { ...c, cc, settings, truck, locale: US ? 'en-US' : 'en-GB', zip: US ? '62701' : 'CB8 8XX' }
}

/** The Manage page's providers around `el`, as the page mounts them, in the country's locale. */
function inManage(M, C, el) {
  const h = (...a) => require(path.join(base.REPO || path.resolve(__dirname, '..'), 'node_modules/react')).createElement(...a)
  let x = el
  if (M.I18nContext) x = h(M.I18nContext.Provider, { value: { locale: C.locale, setLocale() {} } }, x)
  if (M.PricingPolicyProvider) x = h(M.PricingPolicyProvider, { hidePricing: false }, x)
  if (M.TruckTimeContext) x = h(M.TruckTimeContext.Provider, { value: C.time }, x)
  if (M.MoneyProvider) x = h(M.MoneyProvider, { fmt: C.fmt }, x)
  if (M.CountrySettingsProvider) x = h(M.CountrySettingsProvider, { settings: C.settings }, x)
  return x
}
const PROVIDERS = [
  "export { I18nContext } from '@/lib/i18n/use-t'",
  "export { CountrySettingsProvider } from '@/components/CountrySettingsProvider'",
  "export { MoneyProvider } from '@/components/MoneyContext'",
  "export { TruckTimeContext } from '@/components/TruckTimeContext'",
  "export { PricingPolicyProvider } from '@/components/PricingPolicy'",
].join('\n')

function context(kit, REPO) {
  const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
  const skipped = []
  const srcCache = new Map()
  const src = f => { if (!srcCache.has(f)) srcCache.set(f, fs.existsSync(path.join(REPO, f)) ? read(f) : ''); return srcCache.get(f) }
  /** The names `file` has as `const [name, setX] = useState…` — the others are skipped, and reported. */
  const states = (file, names) => names.filter(n => {
    const ok = new RegExp(`const\\s*\\[\\s*${n}\\s*,\\s*\\w+\\s*\\]\\s*=\\s*useState`).test(src(file))
    if (!ok) skipped.push(`${path.basename(file)}:${n}`)
    return ok
  })
  const html = (state, el, search) => {
    let st = state
    if (st && st.__after) {
      const a = st.__after
      const list = Array.isArray(a) ? a : [a]
      st = { ...st }; delete st.__after
      for (const x of list) if (x.when.test(src(x.file || MANAGE))) Object.assign(st, x.set)
    }
    globalThis.__ms = st
    if (search != null) globalThis.__msSearch = search
    try { return kit.quiet(() => kit.renderStatic(el)) } catch (e) { return 'ERROR ' + String(e && e.message || e).slice(0, 300) }
    finally { delete globalThis.__ms; delete globalThis.__msSearch }
  }
  const GB = country('GB'), US = country('US')
  return { kit, h: kit.h, html, states, skipped, src, read, REPO, GB, US, NOW, MANAGE, PROVIDERS, inManage, noop: () => {} }
}

module.exports = { country, context, inManage, PROVIDERS, MANAGE, NOW, BEFORE_REF: '756ca09' }
