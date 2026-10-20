// scripts/_lp1d2-shell.cjs — Language Phase 1d Part 2, area `shell`: the Manage SHELL (ManagePage's own render — the
// tab bar, the header, the notices, the loading / error states, the toast stack, the trial popup, the profile modal),
// BillingTab and TeamTab — for a GB truck and a US truck. Run by scripts/language-phase-1d2.cjs (--areas=shell).
//
// ── HOW ──────────────────────────────────────────────────────────────────────────────────────────────────
// ONE bundle of app/manage/[token]/page.tsx. A static render runs no effects, so the loaded page is started by
// patching its useState hooks (ctx.states): truck, countrySettings, loading, activeTab, userRole, the banners'
// inputs. `use(params)` reads the params object directly (as scripts/_lp1b-dashboard.cjs does for the dashboard).
// 🔴 THE SHELL ONLY. Every tab body is a STAND-IN: the in-file tabs (MenuTab … BillingTab, TeamTab) are reassigned
// at the end of the module, and the imported ones (SocialPostsPane, PaymentsTab, ChargesCard, TakingPaymentPanel,
// KitchenCapacitySection, Walkthrough, AppHeader, UserMenu, AppLink) are module stubs. A stand-in renders
// <x-stub data-c="Name" data-p="{the props the shell passed}"> with element props and children inside it — so every
// word the shell hands a component (the header subtitle, the notices handed to Schedule / Settings) is captured, and
// a change inside the component cannot show here. The real BillingTab and TeamTab are exported before the swap and
// rendered on their own.
// HANDLERS: the shell's load / api / saveProfile and Team's five handlers are exposed on globalThis.__msH as the
// render defines them, then run against that render's closure with an in-process fetch stub (nothing is sent),
// recording every toast, every confirm() sentence and every request — `{ toasts, confirms, requests }` views.
// NOT COVERED: the ?verify= toast (set and shown in effects — a static render runs none).
const M_FILE = 'app/manage/[token]/page.tsx'
const TOASTS = 'lib/useToasts.ts'

// The page's in-file components that are tab bodies (stand-ins in the shell views).
const IN_FILE_TABS = ['MenuTab', 'ModifiersTab', 'DealsTab', 'ScheduleTab', 'SettingsTab', 'ReportsTab', 'TeamTab', 'BillingTab']
// Imported components the shell draws, answered by stand-ins.
const STUB_SPECS = ['@/components/manage/SocialPosts', '@/components/manage/PaymentsTab', '@/components/manage/ChargesCard',
  '@/components/manage/TakingPaymentPanel', '@/components/manage/KitchenCapacitySection', '@/components/manage/Walkthrough',
  '@/components/shared/AppHeader', '@/components/dashboard/UserMenu', '@/components/native/AppLink']
// Props that carry the page's DATA (not words) — summarised in a stand-in so a view stays the shell.
const DATA_PROPS = new Set(['truck', 'categories', 'items', 'subcategories', 'bundles', 'modifierGroups', 'modifierOptions', 'itemModGroups',
  'upsellRules', 'whatsappConnection', 'whatsappUsage', 'pendingVerifyEvents'])

const SHELL_STATES = ['activeTab', 'scheduleSection', 'socialSection', 'socialWide', 'menuSection', 'showTrialReminder', 'userRole', 'truck', 'countrySettings',
  'items', 'loading', 'refreshFailedAt', 'lastLoadedAt', 'currentUserName', 'currentUserEmail', 'currentUserFirstName', 'isAdmin', 'showProfileModal',
  'editProfileName', 'savingProfile', 'pendingApprovalCount', 'bannerDismissedAtCount', 'stripeActionRequired', 'stripeBannerDismissed',
  'domainBannerDismissed', 'walkthroughOpen', 'walkthroughState',
  // ⚠️ RE-PINNED (plans-data-model, Stage A): the shell holds the plan catalogue the Manage GET returns. Skipped on a
  // tree without it (states() reports it), so the same module still runs on an older commit.
  'planCatalog']
const BILLING_STATES = ['showUpgradeModal', 'upgradeTarget', 'showMatrix']
const TEAM_STATES = ['teamMembers', 'vans', 'invitingMember', 'editingMember', 'inviteName', 'inviteEmail', 'inviteRole', 'inviteVanIds', 'inviteLoading',
  'editingOwnProfile', 'ownProfileFirstName', 'ownProfileLastName', 'ownProfilePhone', 'ownProfileEmail', 'pendingEmailChange', 'resendingVerification',
  'cancellingEmailChange', 'savingOwnProfile']

// `const <name> = <head>` → also stored on globalThis.__msH.<name> as the render defines it.
const HANDLERS = [
  ['load', 'useCallback(async (silent = false) => {'],
  ['saveProfile', 'async () => {'],
  ['api', 'useCallback(async (action: string, extra: Record<string, any> = {}) => {'],
  ['saveOwnProfile', 'async () => {'],
  ['handleResendVerification', 'async (changeId: string) => {'],
  ['handleCancelEmailChange', 'async () => {'],
  ['sendInvite', 'async () => {'],
  ['removeMember', 'async (memberId: string) => {'],
]

/** Stand-in modules for the imported components, from this code's own import lines. */
function importStubs(src) {
  const stubs = {}
  for (const spec of STUB_SPECS) {
    const esc = spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    const lines = [...src.matchAll(new RegExp(`^import\\s+(?:(\\w+)\\s*,?\\s*)?(?:\\{([^}]*)\\})?\\s*from\\s*'${esc}'`, 'gm'))]
    const named = new Set(), defs = new Set()
    for (const [, def, n] of lines) {
      if (def) defs.add(def)
      for (const x of (n || '').split(',').map(s => s.trim()).filter(s => s && !s.startsWith('type '))) named.add(x.split(/\s+as\s+/)[0])
    }
    if (!named.size && !defs.size) continue
    stubs[spec] = [...named].map(n => `export const ${n} = props => globalThis.__msStub(${JSON.stringify(n)}, props)`).join('\n') +
      ([...defs].map(d => `\nexport default props => globalThis.__msStub(${JSON.stringify(d)}, props)`).slice(0, 1).join(''))
  }
  return stubs
}
function installStub(kit) {
  const React = require(require('path').join(kit.REPO || require('path').resolve(__dirname, '..'), 'node_modules/react'))
  const replacer = (k, v) => (v instanceof Set ? { set: [...v] } : v instanceof Map ? { map: [...v] } : v instanceof Date ? `[date ${v.toISOString()}]` : v)
  globalThis.__msStub = (name, props) => {
    const kids = []; const data = {}
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'children') { kids.push(React.createElement('x-children', { key: 'c' }, v)); continue }
      if (typeof v === 'function') { data[k] = '[fn]'; continue }
      if (React.isValidElement(v)) { data[k] = '[element]'; kids.push(React.createElement('x-prop', { key: k, 'data-k': k }, v)); continue }
      if (DATA_PROPS.has(k) && v != null) { data[k] = '[data]'; continue }
      data[k] = v
    }
    return React.createElement('x-stub', { 'data-c': name, 'data-p': JSON.stringify(data, replacer) }, ...kids)
  }
}

async function views(ctx) {
  const { kit, h, html, states, GB, US, inManage, PROVIDERS, safe, safeAsync } = ctx
  const out = {}
  installStub(kit)
  const src = ctx.read(M_FILE)
  const ST = states(M_FILE, [...new Set([...SHELL_STATES, ...BILLING_STATES, ...TEAM_STATES])])
  const toastStates = states(TOASTS, ['toasts'])
  const append = [
    'export const __msReal = { BillingTab, TeamTab }',
    // The tab bodies become stand-ins (a function declaration is a mutable binding; the shell reads it at render).
    ...IN_FILE_TABS.map(n => `${n} = (p: any) => (globalThis as any).__msStub(${JSON.stringify(n)}, p)`),
  ].join('\n')
  let M
  try {
    M = await kit.bundle('lp1d2-shell', [
      `export { default as ManagePage } from '@/${M_FILE}'`,
      `export { __msReal } from '@/${M_FILE}'`,
      PROVIDERS,
    ].join('\n'), {
      patches: [
        { file: M_FILE, append },
        { file: M_FILE, from: 'const { token } = use(params)', to: 'const { token } = params as any' },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el', optional: true },
        { file: M_FILE, from: 'const { toasts, showToast, dismissToast } = useToasts()',
          to: 'const { toasts, showToast: __msShowToast, dismissToast } = useToasts(); const showToast = ((m: any, ty?: any, o?: any) => { const r = (globalThis as any).__msToasts; if (r) r.push(ty === undefined ? [m] : [m, ty]); return __msShowToast(m, ty, o) }) as any' },
        ...HANDLERS.map(([name, head]) => ({ file: M_FILE, from: `const ${name} = ${head}`, to: `const ${name} = ((globalThis as any).__msH ||= {}).${name} = ${head}` })),
        { file: M_FILE, states: ST },
        ...(toastStates.length ? [{ file: TOASTS, states: toastStates }] : []),
      ],
      stubs: {
        ...importStubs(src),
        // the iOS switch: purchaseCtaAllowed() is false while globalThis.__msIos is set
        '@/lib/commerce-policy': 'export function purchaseCtaAllowed() { return !globalThis.__msIos }',
      },
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return out }
  const Billing = M.__msReal && M.__msReal.BillingTab, Team = M.__msReal && M.__msReal.TeamTab
  const noop = () => {}
  const ios = (fn) => () => { globalThis.__msIos = true; try { return fn() } finally { delete globalThis.__msIos } }

  /** Runs `name` from the last render's closure with `fetch` answering from `answers` (url → {status, body} | Error),
   *  recording toasts (the page's own and a toast prop), confirm() sentences and every request. */
  const runHandler = async (name, args, { answers = {}, confirm = true, toastsInto } = {}) => {
    const fn = globalThis.__msH && globalThis.__msH[name]
    if (typeof fn !== 'function') return 'ERROR no handler ' + name
    const rec = { toasts: toastsInto || [], confirms: [], requests: [] }
    const realFetch = globalThis.fetch, hadWindow = 'window' in globalThis, realWindow = globalThis.window
    globalThis.__msToasts = rec.toasts
    globalThis.fetch = async (url, init) => {
      const u = String(url)
      rec.requests.push([u, init && init.body ? JSON.parse(init.body) : null])
      const key = Object.keys(answers).find(k => u.startsWith(k))
      const a = key ? answers[key] : { status: 200, body: {} }
      if (a instanceof Error) throw a
      return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body }
    }
    globalThis.window = { confirm: m => { rec.confirms.push(m); return confirm }, location: { search: '', pathname: '/manage/harness', href: 'http://x/manage/harness' } }
    try { await kit.quietAsync(async () => { try { await fn(...args) } catch (e) { rec.threw = String(e && e.message || e) } }) }
    finally {
      globalThis.fetch = realFetch
      if (hadWindow) globalThis.window = realWindow; else delete globalThis.window
      delete globalThis.__msToasts
    }
    return rec
  }

  for (const C of [GB, US]) {
    const cc = C.cc
    const W = el => inManage(M, C, el)
    const S = (k, fn) => safe(out, `${cc}|${k}`, fn)
    const SA = (k, fn) => safeAsync(out, `${cc}|${k}`, fn)
    const truck = { ...C.truck, custom_domain_verified_at: null, custom_domain_confirmed_at: null }
    const page = () => W(h(M.ManagePage, { params: { token: 'harness' } }))
    const loaded = { loading: false, truck, countrySettings: C.settings, items: [], userRole: 'owner', currentUserName: 'Olive Owner', currentUserEmail: 'owner@example.test',
      ...(ctx.PLAN_CATALOG ? { planCatalog: ctx.PLAN_CATALOG } : {}) }

    // ══ THE SHELL ══════════════════════════════════════════════════════════════════════════════════════
    S('shell|loading', () => html({ loading: true }, page()))
    S('shell|invalidToken', () => html({ loading: false, truck: null }, page()))
    S('shell|noCountrySettings', () => html({ ...loaded, countrySettings: null }, page()))
    // every tab active, each with its own sub-tab bar where the shell draws one
    for (const tab of ['menu', 'schedule', 'social', 'reports', 'team', 'settings', 'payments', 'billing'])
      S(`shell|tab|${tab}`, () => html({ ...loaded, activeTab: tab }, page()))
    for (const sec of ['extras', 'deals']) S(`shell|tab|menu|${sec}`, () => html({ ...loaded, activeTab: 'menu', menuSection: sec }, page()))
    for (const sec of ['locations']) S(`shell|tab|social|${sec}`, () => html({ ...loaded, activeTab: 'social', socialSection: sec }, page()))
    S('shell|tab|social|wide', () => html({ ...loaded, activeTab: 'social', socialWide: true }, page()))
    S('shell|tab|schedule|eventTypes', () => html({ ...loaded, activeTab: 'schedule', scheduleSection: 'event-types' }, page()))
    // roles and plans: the tab bar each sees
    S('shell|role|manager', () => html({ ...loaded, userRole: 'manager', activeTab: 'reports' }, page()))
    S('shell|role|staff', () => html({ ...loaded, userRole: 'staff', activeTab: 'reports' }, page()))
    S('shell|plan|starter', () => html({ ...loaded, truck: { ...truck, plan: 'starter' }, activeTab: 'reports' }, page()))
    S('shell|plan|tester', () => html({ ...loaded, truck: { ...truck, plan: 'tester' }, activeTab: 'reports' }, page()))
    S('shell|plan|trial', () => html({ ...loaded, truck: { ...truck, plan: 'trial', trial_expires_at: '2026-11-20T00:00:00Z' }, activeTab: 'billing' }, page()))
    S('shell|plan|socialOverride', () => html({ ...loaded, truck: { ...truck, plan: 'starter', feature_overrides: { schedule_graphics: true } }, activeTab: 'reports' }, page()))
    S('shell|admin|header', () => html({ ...loaded, isAdmin: true, currentUserName: null, currentUserFirstName: 'Ada', activeTab: 'reports' }, page()))
    // the notices, one at a time, on a tab with no sub-tab bar (they render at the top of the page)
    const n = (k, st) => S(`shell|notice|${k}`, () => html({ ...loaded, activeTab: 'reports', ...st }, page()))
    n('none', {})
    n('tour', { walkthroughState: 'remind' })
    n('tourMidSetup', { walkthroughState: 'remind', truck: { ...truck, setup_step: 'menu' } })
    n('approval1', { pendingApprovalCount: 1 })
    n('approval3', { pendingApprovalCount: 3 })
    n('approvalDismissed', { pendingApprovalCount: 3, bannerDismissedAtCount: 3 })
    n('allergens', { items: [{ id: 'i1', name: 'Margherita', allergens_verified: false }] })
    n('allergensCardMode', { items: [{ id: 'i1', name: 'Margherita', allergens_verified: false }], truck: { ...truck, allergen_display_mode: 'card' } })
    n('domainLive', { truck: { ...truck, custom_domain: 'order.pizzakitchen.example', custom_domain_verified_at: '2026-10-08T10:00:00Z' } })
    n('domainDismissed', { truck: { ...truck, custom_domain: 'order.pizzakitchen.example', custom_domain_verified_at: '2026-10-08T10:00:00Z' }, domainBannerDismissed: true })
    n('stripe', { stripeActionRequired: true })
    n('stripeDismissed', { stripeActionRequired: true, stripeBannerDismissed: true })
    n('missing1', { truck: { ...truck, contact_phone: '' } })
    n('missingAll', { truck: { ...truck, name: '', cuisine_type: ' ', contact_email: null, contact_phone: '' } })
    n('stale', { refreshFailedAt: new Date('2026-10-09T17:15:00Z'), lastLoadedAt: new Date('2026-10-09T16:05:00Z') })
    n('staleNoTime', { refreshFailedAt: new Date('2026-10-09T17:15:00Z'), lastLoadedAt: null })
    const ALL = { walkthroughState: 'remind', pendingApprovalCount: 2, items: [{ id: 'i1', name: 'Margherita', allergens_verified: false }], stripeActionRequired: true,
      truck: { ...truck, custom_domain: 'order.pizzakitchen.example', custom_domain_verified_at: '2026-10-08T10:00:00Z', cuisine_type: '' },
      refreshFailedAt: new Date('2026-10-09T17:15:00Z'), lastLoadedAt: new Date('2026-10-09T16:05:00Z') }
    // every notice at once, on each tab (the badges on the tab bar; the suppressions per tab; under a sub-tab bar)
    for (const tab of ['menu', 'schedule', 'social', 'reports', 'settings', 'payments', 'billing'])
      S(`shell|notices|all|${tab}`, () => html({ ...loaded, ...ALL, activeTab: tab }, page()))
    // the trial popup, the profile modal, the walkthrough, the toast stack
    S('shell|trialPopup|dated', () => html({ ...loaded, truck: { ...truck, plan: 'trial', trial_expires_at: '2026-11-20T00:00:00Z' }, showTrialReminder: true, activeTab: 'billing' }, page()))
    S('shell|trialPopup|undated', () => html({ ...loaded, truck: { ...truck, plan: 'trial', trial_expires_at: null }, showTrialReminder: true, activeTab: 'billing' }, page()))
    S('shell|trialPopup|ios', ios(() => html({ ...loaded, truck: { ...truck, plan: 'trial', trial_expires_at: '2026-11-20T00:00:00Z' }, showTrialReminder: true, activeTab: 'billing' }, page())))
    S('shell|profileModal', () => html({ ...loaded, activeTab: 'reports', showProfileModal: true, editProfileName: 'Olive Owner' }, page()))
    S('shell|profileModal|saving', () => html({ ...loaded, activeTab: 'reports', showProfileModal: true, editProfileName: 'Olive Owner', savingProfile: true }, page()))
    S('shell|walkthrough', () => html({ ...loaded, activeTab: 'menu', walkthroughOpen: true }, page()))
    if (toastStates.length) S('shell|toasts', () => html({ ...loaded, activeTab: 'reports', toasts: [
      { id: 1, msg: 'Saved', type: 'success' }, { id: 2, msg: 'Could not save', type: 'error', action: { label: 'Undo', run: noop } }] }, page()))
    // the shell's handlers: the words they toast
    const shellRun = async (k, st, name, args, opts) => SA(`shell|handler|${k}`, async () => { html({ ...loaded, activeTab: 'reports', ...st }, page()); return runHandler(name, args, opts) })
    await shellRun('saveProfile|ok', { editProfileName: 'Olive Owner' }, 'saveProfile', [], { answers: { '/api/auth/update-profile': { status: 200, body: { name: 'Olive Owner' } } } })
    await shellRun('saveProfile|serverError', { editProfileName: 'Olive Owner' }, 'saveProfile', [], { answers: { '/api/auth/update-profile': { status: 400, body: { error: 'Name too long' } } } })
    await shellRun('saveProfile|noMessage', { editProfileName: 'Olive Owner' }, 'saveProfile', [], { answers: { '/api/auth/update-profile': { status: 500, body: {} } } })
    await shellRun('load|serverError', {}, 'load', [], { answers: { '/api/manage': { status: 403, body: { error: 'Not allowed' } } } })
    await shellRun('load|noMessage', {}, 'load', [], { answers: { '/api/manage': { status: 500, body: {} } } })
    await shellRun('load|silentFail', {}, 'load', [true], { answers: { '/api/manage': { status: 500, body: {} } } })
    await shellRun('api|noMessage', {}, 'api', ['get_team'], { answers: { '/api/manage': { status: 500, body: {} } } })

    // ══ BILLING ═══════════════════════════════════════════════════════════════════════════════════════
    if (Billing) {
      const B = (k, t, st = {}, opts = {}) => S(`billing|${k}`, () => {
        const el = h(Billing, { truck: t })
        const inner = opts.hidePricing && M.PricingPolicyProvider ? h(M.PricingPolicyProvider, { hidePricing: true }, el) : el
        return html(st, W(inner))
      })
      const trialDated = { ...truck, plan: 'trial', trial_expires_at: '2026-11-20T00:00:00Z' }
      const trialNull = { ...truck, plan: 'trial', trial_expires_at: null }
      const trialPast = { ...truck, plan: 'trial', trial_expires_at: '2026-10-01T00:00:00Z' }
      B('trial', trialDated)
      B('trial|notStarted', trialNull)
      B('trial|expired', trialPast)
      S('billing|trial|ios', ios(() => html({}, W(h(Billing, { truck: trialDated })))))
      S('billing|trial|notStarted|ios', ios(() => html({}, W(h(Billing, { truck: trialNull })))))
      B('trial|hidePricing', trialDated, {}, { hidePricing: true })
      B('trial|upgradeMax', trialDated, { showUpgradeModal: true, upgradeTarget: 'max' })
      B('trial|upgradePro', trialDated, { showUpgradeModal: true, upgradeTarget: 'pro' })
      S('billing|trial|upgradeMax|ios', ios(() => html({ showUpgradeModal: true, upgradeTarget: 'max' }, W(h(Billing, { truck: trialDated })))))
      B('starter', { ...truck, plan: 'starter' })
      S('billing|starter|ios', ios(() => html({}, W(h(Billing, { truck: { ...truck, plan: 'starter' } })))))
      B('starter|hidePricing', { ...truck, plan: 'starter' }, {}, { hidePricing: true })
      B('starter|upgradePro', { ...truck, plan: 'starter' }, { showUpgradeModal: true, upgradeTarget: 'pro' })
      B('starter|withTrialDate', { ...truck, plan: 'starter', trial_expires_at: '2026-09-01T00:00:00Z' })
      B('pro', { ...truck, plan: 'pro' })
      B('pro|matrix', { ...truck, plan: 'pro' }, { showMatrix: true })
      B('pro|matrix|hidePricing', { ...truck, plan: 'pro' }, { showMatrix: true }, { hidePricing: true })
      B('max', { ...truck, plan: 'max' })
      B('max|matrix', { ...truck, plan: 'max' }, { showMatrix: true })
      B('max|upgradeMax', { ...truck, plan: 'max' }, { showUpgradeModal: true, upgradeTarget: 'max' })
      B('tester', { ...truck, plan: 'tester' })
      B('noTruck', null)
      // ── plans-data-model (Stage A): the catalogue's plans, each with and without a promotional price override, an
      // ended plan, and the data-driven plan buttons' modal. On a tree without the catalogue these render the old branches.
      if (ctx.PLAN_CATALOG) {
        const promo = { plan_price_override_minor: 1900, plan_price_override_until: '2026-12-31', plan_price_override_note: 'Launch offer' }
        for (const key of ['trial', 'demo', 'payg', 'pro', 'unlimited', 'tester']) {
          const end = key === 'trial' ? '2026-11-20T00:00:00Z' : null
          B(`plan|${key}`, { ...truck, plan: key, trial_expires_at: end })
          B(`plan|${key}|promo`, { ...truck, plan: key, trial_expires_at: end, ...promo })
        }
        B('plan|pro|promoNoEnd', { ...truck, plan: 'pro', trial_expires_at: null, ...promo, plan_price_override_until: null })
        B('plan|pro|promoLapsed', { ...truck, plan: 'pro', trial_expires_at: null, ...promo, plan_price_override_until: '2026-10-01' })
        B('plan|pro|ended', { ...truck, plan: 'pro', trial_expires_at: '2026-10-01T00:00:00Z', ...promo })
        B('plan|payg|switchToPro', { ...truck, plan: 'payg' }, { showUpgradeModal: true, upgradeTarget: 'pro' })
        S('billing|plan|payg|ios', ios(() => html({}, W(h(Billing, { truck: { ...truck, plan: 'payg' } })))))
      }
    }

    // ══ TEAM ══════════════════════════════════════════════════════════════════════════════════════════
    if (Team) {
      const base = { truck, token: 'harness', api: async () => ({}), showToast: noop, currentUserEmail: 'owner@example.test', currentUserFirstName: 'Olive',
        currentUserLastName: 'Owner', currentUserPhone: C.truck.contact_phone, currentUserId: 'u-1', ownerEmail: 'owner@example.test', ownerAuthUserId: 'u-1',
        userRole: 'owner', initialPendingEmailChange: null, onProfileSaved: noop }
      const MEMBERS = [
        { id: 'm1', email: 'stan@example.test', name: 'Stan Staff', role: 'staff', accepted_at: '2026-09-01T00:00:00Z', auth_user_id: 'u-staff', van_names: ['Van 1'] },
        { id: 'm2', email: 'mia@example.test', name: 'Mia Manager', role: 'manager', accepted_at: '2026-08-01T00:00:00Z', auth_user_id: 'u-mgr', van_names: ['Van 1', 'Big van'] },
        { id: 'm3', email: 'new@example.test', name: null, role: 'staff', accepted_at: null, auth_user_id: null, van_names: [] },
      ]
      const VAN1 = [{ id: 'v1', name: 'Van 1' }], VAN2 = [{ id: 'v1', name: 'Van 1' }, { id: 'v2', name: 'Big van' }]
      const PENDING = { id: 'chg-1', new_email: 'olive.new@example.test', requested_at: '2026-10-09T10:00:00Z', expired_at: '2026-10-10T10:00:00Z' }
      const T = (k, st, props = {}) => S(`team|${k}`, () => html(st, W(h(Team, { ...base, ...props }))))
      T('owner|empty', {})
      T('owner|members', { teamMembers: MEMBERS, vans: VAN2 })
      T('owner|noName', { teamMembers: MEMBERS }, { currentUserFirstName: null })
      T('owner|notOwnerViewer', { teamMembers: MEMBERS }, { currentUserId: 'u-admin' })
      T('owner|noOwnerEmail', {}, { currentUserId: 'u-admin', ownerEmail: null })
      T('manager|members', { teamMembers: MEMBERS, vans: VAN2 }, { userRole: 'manager', currentUserId: 'u-mgr' })
      T('staff|self', { teamMembers: MEMBERS, vans: VAN2 }, { userRole: 'staff', currentUserId: 'u-staff' })
      T('staff|noRow', { teamMembers: MEMBERS }, { userRole: 'staff', currentUserId: 'u-other' })
      // the invite / edit modal
      T('invite|noVans', { invitingMember: true })
      T('invite|oneVan', { invitingMember: true, vans: VAN1, inviteVanIds: ['v1'] })
      T('invite|twoVansNone', { invitingMember: true, vans: VAN2, inviteVanIds: [] })
      T('invite|twoVansOne', { invitingMember: true, vans: VAN2, inviteVanIds: ['v2'], inviteName: 'Sarah', inviteEmail: 'sarah@example.test', inviteRole: 'manager' })
      T('invite|sending', { invitingMember: true, vans: VAN1, inviteVanIds: ['v1'], inviteEmail: 'sarah@example.test', inviteLoading: true })
      T('invite|manager', { invitingMember: true, vans: VAN1 }, { userRole: 'manager', currentUserId: 'u-mgr' })
      T('invite|ownerRole', { invitingMember: true, vans: VAN1, inviteRole: 'owner' }, { userRole: 'staff' })
      T('edit|member', { teamMembers: MEMBERS, vans: VAN2, invitingMember: true, editingMember: MEMBERS[0], inviteName: 'Stan Staff', inviteEmail: 'stan@example.test', inviteVanIds: ['v1'] })
      T('edit|saving', { teamMembers: MEMBERS, vans: VAN2, invitingMember: true, editingMember: MEMBERS[1], inviteName: 'Mia Manager', inviteEmail: 'mia@example.test', inviteRole: 'manager', inviteVanIds: ['v1', 'v2'], inviteLoading: true })
      // own profile and the pending email change
      const prof = { editingOwnProfile: true, ownProfileFirstName: 'Olive', ownProfileLastName: 'Owner', ownProfilePhone: '', ownProfileEmail: 'owner@example.test' }
      T('profile|edit', prof)
      T('profile|emailChanged', { ...prof, ownProfileEmail: 'olive.new@example.test' })
      T('profile|missingName', { ...prof, ownProfileLastName: '' })
      T('profile|saving', { ...prof, savingOwnProfile: true })
      T('profile|pendingInEditor', { ...prof, pendingEmailChange: PENDING })
      T('pending', {}, { initialPendingEmailChange: PENDING })
      T('pending|resending', { pendingEmailChange: PENDING, resendingVerification: true })
      T('pending|cancelling', { pendingEmailChange: PENDING, cancellingEmailChange: true })
      // Team's handlers: every toast, the remove confirm, every request
      const teamRun = (k, st, props, name, args, opts = {}) => SA(`team|handler|${k}`, async () => {
        const toasts = []
        const showToast = (m, ty) => { toasts.push(ty === undefined ? [m] : [m, ty]) }
        const saved = []
        html(st, W(h(Team, { ...base, showToast, onProfileSaved: (...a) => saved.push(a), ...props })))
        apiLog = []
        const r = await runHandler(name, args, { ...opts, toastsInto: toasts })
        if (typeof r === 'object') { r.requests.push(...apiLog); if (saved.length) r.profileSaved = saved }
        apiLog = null
        return r
      })
      // the `api` prop records every action it is asked for (into the view's `requests`, as ['api:<action>', extra])
      let apiLog = null
      const apiOk = async (a, e) => { if (apiLog) apiLog.push([`api:${a}`, e ?? null]); return { members: [], vans: [] } }
      const apiErr = msg => async (a, e) => { if (apiLog) apiLog.push([`api:${a}`, e ?? null]); if (a === 'get_team' || a === 'get_vans') return {}; throw new Error(msg) }
      await teamRun('saveOwnProfile|ok', prof, {}, 'saveOwnProfile', [], { answers: { '/api/auth/update-profile': { status: 200, body: { ok: true } } } })
      await teamRun('saveOwnProfile|emailChange', { ...prof, ownProfileEmail: 'olive.new@example.test' }, {}, 'saveOwnProfile', [],
        { answers: { '/api/auth/update-profile': { status: 200, body: { ok: true } }, '/api/auth/change-email': { status: 200, body: { ok: true, changeId: 'chg-2' } } } })
      await teamRun('saveOwnProfile|emailChangeError', { ...prof, ownProfileEmail: 'taken@example.test' }, {}, 'saveOwnProfile', [],
        { answers: { '/api/auth/update-profile': { status: 200, body: { ok: true } }, '/api/auth/change-email': { status: 409, body: { ok: false, error: 'That email is already in use' } } } })
      await teamRun('saveOwnProfile|emailChangeNoMessage', { ...prof, ownProfileEmail: 'taken@example.test' }, {}, 'saveOwnProfile', [],
        { answers: { '/api/auth/update-profile': { status: 200, body: { ok: true } }, '/api/auth/change-email': { status: 500, body: { ok: false } } } })
      await teamRun('saveOwnProfile|fail', prof, {}, 'saveOwnProfile', [], { answers: { '/api/auth/update-profile': { status: 500, body: {} } } })
      await teamRun('resend|ok', { pendingEmailChange: PENDING }, {}, 'handleResendVerification', ['chg-1'], { answers: { '/api/auth/resend-verification': { status: 200, body: { ok: true } } } })
      await teamRun('resend|error', { pendingEmailChange: PENDING }, {}, 'handleResendVerification', ['chg-1'], { answers: { '/api/auth/resend-verification': { status: 429, body: { ok: false, error: 'Please wait a minute' } } } })
      await teamRun('resend|noMessage', { pendingEmailChange: PENDING }, {}, 'handleResendVerification', ['chg-1'], { answers: { '/api/auth/resend-verification': { status: 500, body: { ok: false } } } })
      await teamRun('cancelChange|ok', { pendingEmailChange: PENDING }, {}, 'handleCancelEmailChange', [], { answers: { '/api/auth/cancel-email-change': { status: 200, body: { ok: true } } } })
      await teamRun('cancelChange|error', { pendingEmailChange: PENDING }, {}, 'handleCancelEmailChange', [], { answers: { '/api/auth/cancel-email-change': { status: 400, body: { ok: false, error: 'Already verified' } } } })
      await teamRun('cancelChange|noMessage', { pendingEmailChange: PENDING }, {}, 'handleCancelEmailChange', [], { answers: { '/api/auth/cancel-email-change': { status: 500, body: { ok: false } } } })
      await teamRun('cancelChange|network', { pendingEmailChange: PENDING }, {}, 'handleCancelEmailChange', [], { answers: { '/api/auth/cancel-email-change': new Error('network down') } })
      const inv = { invitingMember: true, vans: VAN1, inviteVanIds: ['v1'], inviteName: 'Sarah', inviteEmail: 'sarah@example.test', inviteRole: 'staff' }
      await teamRun('invite|ok', inv, { api: apiOk }, 'sendInvite', [])
      await teamRun('invite|error', inv, { api: apiErr('sarah@example.test is already on your team') }, 'sendInvite', [])
      await teamRun('edit|ok', { ...inv, editingMember: MEMBERS[0] }, { api: apiOk }, 'sendInvite', [])
      await teamRun('edit|error', { ...inv, editingMember: MEMBERS[0] }, { api: apiErr('You can’t change that member') }, 'sendInvite', [])
      await teamRun('remove|ok', { teamMembers: MEMBERS }, { api: apiOk }, 'removeMember', ['m1'])
      await teamRun('remove|error', { teamMembers: MEMBERS }, { api: apiErr('Member not found') }, 'removeMember', ['m1'])
      await teamRun('remove|declined', { teamMembers: MEMBERS }, { api: apiOk }, 'removeMember', ['m1'], { confirm: false })
    }
  }
  delete globalThis.__msH
  return out
}

module.exports = { views }
