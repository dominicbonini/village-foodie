// scripts/_lp1d2-wada.cjs — Language Phase 1d Part 2, area `wada` (the WADA agent's surfaces): WhatsApp settings, account
// deletion, custom domain. A MODULE for scripts/language-phase-1d2.cjs — `views(ctx)` → { '<GB|US>|<group>|<state>': value }.
//
//   settings|<state>|auto-replies       Settings' "Auto-replies" SECTION, cut from SettingsTab rendered exactly as
//   settings|<state>|account-deletion   scripts/_lp1d-settings.cjs renders it (its elementById), in its states: WhatsApp not
//                                       connected / connected (with and without Meta's facts) / needs reauthorise /
//                                       onboarding incomplete / token missing / expiring soon, usage near and over the
//                                       monthly reply limit, the limit editor at each side of Meta's free allowance, payment
//                                       method added / missing / blocked, the disconnect confirmation open, every setup
//                                       notice, and the plans that gate it (starter / pro / max); the "Account deletion"
//                                       SECTION for an owner (summary, pending), a manager and an owner whose summary has
//                                       not loaded.
//   preview|<state>                     WhatsAppReplyPreview: empty, typing, loading, a result for each classification
//                                       (SPECIFIC_QUERY, MENU_QUERY, ALLERGEN_QUERY, IGNORE → no reply), the server's own
//                                       error, the fallback error and the network error.
//   setup|<state>                       WhatsAppSetupControl: preparing, unavailable, idle (Set up / Reconnect), waiting,
//                                       waiting with the pop-up hint, finishing, hidden (a working connection).
//   delete|<state>                      DeleteAccountSection: the summary (0 / 1 / 3 upcoming orders), the dialog with the
//                                       typed confirmation empty / partial / exact, several trucks, submitting, pending with
//                                       dates and without. ⚠️ LEGAL wording (retention law) is in every `delete|open*` view
//                                       and in the settings `account-deletion` views whose dialog is open.
//   domain|<state>                      CustomDomainSetup: the plan gate (starter → nothing), the card (no website / a
//                                       website / waiting / just went live / live), the wizard's address step (fixed
//                                       domain, typed, empty, checking, setting up, the padlock refusals, something already
//                                       there, provision failed, an error), the record step (generic rows, a provider with
//                                       no verified steps, providers WITH steps — Wix, GoDaddy, 123 Reg (trailing dot),
//                                       Cloudflare — sending, sent, a send error), resume (picking up / failed), the confirm
//                                       step (open, "No", thanked), turn-off (link, panel, busy, error).
//   copy|<state>                        CopyButton: idle / copied / failed, outline and primary.
//   email|<state>                       THE CUSTOM-DOMAIN INSTRUCTIONS EMAIL as the manage route BUILDS it for
//                                       `domain_send_instructions` (subject, text, html, recipient, sender) — DNS provider
//                                       generic / Wix / GoDaddy / 123 Reg / Namecheap, and with no operator email — plus
//                                       `email|direct|*`, lib/custom-domain/copy's instructionsEmail called directly.
//                                       ⚠️ NEVER SENT: `@/lib/email` is a recorder, `@/lib/ratelimit` a stand-in, and fetch
//                                       (DNS-over-HTTPS, the hosting API) answers canned replies; nothing leaves the process.
// 🔴 EVERY VIEW RUNS ON BOTH CODES (826471a and this tree): states through ctx.states, a code-state through __after.
const path = require('path')

const M_FILE = 'app/manage/[token]/page.tsx'
const DEL = 'components/manage/DeleteAccountSection.tsx'
const CDS = 'components/dashboard/CustomDomainSetup.tsx'
const CPY = 'components/dashboard/CopyButton.tsx'
const SETUP_MACHINE = 'lib/whatsapp/setup-machine.ts'
const SETUP_REDUCER = /useReducer\(setupReducer, INITIAL_SETUP_STATE\)/

async function views(ctx) {
  const { kit, h, html, states, GB, US, inManage, PROVIDERS } = ctx
  const out = {}
  const { sections } = require('./_lp1d-settings.cjs')
  const { CATS, ITEMS, SUBCATS } = require('./_lp1d-menu.cjs')
  const VANS = require('./_lp1d-settings.cjs').VANS

  const ST = states(M_FILE, ['vans', 'firstVanId', 'intervalsAvailable', 'perVanCategoriesAvailable', 'vanCashAvailable', 'settingsExclusionList',
    'setupNotice', 'disconnectOpen', 'monthlyLimit', 'message', 'loading', 'result', 'error', 'asked'])
  let M
  try {
    M = await kit.bundle('lp1d2-wada', [
      `export { SettingsTab, WhatsAppReplyPreview, WhatsAppSetupControl } from '@/${M_FILE}'`,
      "export * as DEL from '@/components/manage/DeleteAccountSection'",
      "export { default as CustomDomainSetup } from '@/components/dashboard/CustomDomainSetup'",
      "export * as CPY from '@/components/dashboard/CopyButton'",
      "export * as CDCOPY from '@/lib/custom-domain/copy'",
      "export { DNS_PROVIDERS } from '@/lib/custom-domain/dns'",
      PROVIDERS,
    ].join('\n'), {
      patches: [
        { file: M_FILE, append: 'export { SettingsTab, WhatsAppReplyPreview, WhatsAppSetupControl }' },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
        // WhatsAppSetupControl's reducer starts from globalThis.__msSetup when a view gives one (its phase is a code).
        { file: M_FILE, from: SETUP_REDUCER, to: 'useReducer(setupReducer, ((globalThis as any).__msSetup ?? INITIAL_SETUP_STATE))', optional: true },
        { file: M_FILE, states: ST },
        { file: DEL, states: states(DEL, ['summary', 'loadFailed', 'open', 'typed', 'submitting']) },
        { file: CDS, states: states(CDS, ['open', 'step', 'typedDomain', 'busy', 'error', 'pre', 'rows', 'provider', 'emailTo', 'emailSent', 'confirmed', 'saidNo',
          'offAsking', 'offBusy', 'offError', 'turnedOff', 'resumeFailed', 'provisionFailed', 'phase', 'justWentLive']) },
        { file: CPY, states: states(CPY, ['state']) },
      ],
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return out }
  const reducerPatched = ctx.has(M_FILE, SETUP_REDUCER)
  const noop = () => {}
  const api = async () => ({})

  for (const C of [GB, US]) {
    const cc = C.cc
    const US_ = cc === 'US'
    const W = el => inManage(M, C, el)
    const truck = { ...C.truck, whatsapp_monthly_reply_limit: 1000 }
    const v = (k, fn) => ctx.safe(out, `${cc}|${k}`, fn)

    // ══ 1. SETTINGS › Auto-replies and Account deletion (SettingsTab whole, the two sections cut out) ══════════════
    const number = US_ ? '+1 201-555-0123' : '+44 7700 900123'
    const conn = o => ({ state: 'ready', offerSignup: false, offerReauthorise: false, expiringSoon: false, displayPhoneNumber: number, verifiedName: 'Pizza Kitchen',
      paymentMethodPresent: null, paymentBlockedAt: null, ...o })
    const usage = (used, limit = 1000) => ({ used, limit, resetsOn: '2026-11-01', atLimit: used >= limit })
    const props = (o = {}) => ({ userRole: 'owner', truck, whatsappConnection: null, whatsappUsage: null, onConnectionUpdate: noop, token: 'harness', api, showToast: noop,
      onVerifySuccess: noop, onSwitchTab: noop, categories: CATS, items: ITEMS, subcategories: SUBCATS, onTruckUpdate: noop, onItemsPatch: noop, onCategoriesPatch: noop,
      onOpenWalkthrough: noop, notices: null, ...o })
    const base = { vans: VANS.slice(0, 1), firstVanId: 'v1', intervalsAvailable: true, perVanCategoriesAvailable: true, vanCashAvailable: true, settingsExclusionList: [] }
    const summary1 = { ownerEmail: 'owner@example.test', trucks: [{ id: 'test-truck', name: 'Pizza Kitchen' }], upcomingOrders: 2, pending: false, requestedAt: null, dueAt: null }
    /** SettingsTab in a state → the two sections (only those `want` names). */
    const set = (k, st, o, want = ['auto-replies']) => {
      let page
      // The Set up control as an operator sees it once Meta's SDK has loaded (idle: "Set up" / "Reconnect").
      if (reducerPatched) globalThis.__msSetup = { phase: 'idle', attempt: null, lastAttempt: 0, showPopupHint: false, notice: null }
      try { page = html({ ...base, summary: summary1, ...st }, W(h(M.SettingsTab, props(o)))) } catch (e) { page = 'ERROR ' + String(e.message).slice(0, 200) }
      finally { delete globalThis.__msSetup }
      for (const id of want) {
        const key = `${cc}|settings|${k}|${id}`
        if (typeof page !== 'string' || page.startsWith('ERROR')) { out[key] = page; continue }
        const el = sections(page)[`oos|${id}`]     // _lp1d-settings.cjs cuts exactly these two (its elementById)
        out[key] = el == null ? `ERROR no section "${id}" in SettingsTab` : el
      }
    }
    // A notice our own code raises is a CODE on the new code (lib/whatsapp/setup-machine.ts SetupNoticeCode) and the
    // sentence it always was on 826471a — the same screen either way.
    const notice = (tone, code, text) => ({ setupNotice: { tone, text }, __after: { file: SETUP_MACHINE, when: /SetupNoticeCode/, set: { setupNotice: { tone, code } } } })
    if (typeof sections !== 'function') out[`${cc}|settings|module`] = 'ERROR _lp1d-settings.cjs has no sections()'
    set('notConnected', {}, {}, ['auto-replies', 'account-deletion'])
    set('connected', {}, { whatsappConnection: conn(), whatsappUsage: usage(120) })
    set('connectedNoFacts', {}, { whatsappConnection: conn({ displayPhoneNumber: null, verifiedName: null }), whatsappUsage: usage(0) })
    set('connectedNumberOnly', {}, { whatsappConnection: conn({ verifiedName: null }), whatsappUsage: null })
    set('needsReauthorise', {}, { whatsappConnection: conn({ state: 'revoked', offerReauthorise: true }), whatsappUsage: usage(40) })
    set('onboardingIncomplete', {}, { whatsappConnection: conn({ state: 'onboarding_incomplete', offerReauthorise: true, displayPhoneNumber: null, verifiedName: null }) })
    set('tokenMissing', {}, { whatsappConnection: conn({ state: 'token_missing' }) })
    set('expiringSoon', {}, { whatsappConnection: conn({ expiringSoon: true, offerReauthorise: true }), whatsappUsage: usage(300) })
    set('usageNear', {}, { whatsappConnection: conn(), whatsappUsage: usage(850) })
    set('usageOver', {}, { whatsappConnection: conn(), whatsappUsage: usage(1000) })
    set('limitAboveAllowance', { monthlyLimit: 5000 }, { whatsappConnection: conn(), whatsappUsage: usage(1200, 5000) })
    set('limitAbovePaymentMissing', { monthlyLimit: 2000 }, { whatsappConnection: conn({ paymentMethodPresent: false }), whatsappUsage: usage(10, 2000) })
    set('paymentAdded', { monthlyLimit: 2000 }, { whatsappConnection: conn({ paymentMethodPresent: true }), whatsappUsage: usage(10, 2000) })
    set('paymentBlocked', {}, { whatsappConnection: conn({ paymentBlockedAt: '2026-10-08T09:00:00Z' }), whatsappUsage: usage(600) })
    set('disconnectOpen', { disconnectOpen: true }, { whatsappConnection: conn(), whatsappUsage: usage(120) })
    set('notice|disconnected', notice('ok', 'disconnected', 'WhatsApp is disconnected. Auto-replies have stopped.'), {})
    set('notice|disconnectedUnreachable', notice('warn', 'disconnectedUnreachable', 'WhatsApp is disconnected. We couldn’t reach Meta to remove access. Please remove HatchGrab in WhatsApp Business → Settings → Account → Business Platform.'), {})
    set('notice|sdkUnavailable', notice('error', 'sdkUnavailable', 'WhatsApp setup is not available in this environment.'), {})
    set('notice|closed', notice('warn', 'closed', 'Setup was closed before it finished. Nothing was changed — press Set up to try again.'), {})
    set('notice|metaError', notice('error', 'metaError', 'Meta reported a problem during setup. Nothing was changed. Try again, and contact us if it keeps happening.'), {})
    set('notice|setupFailed', notice('error', 'setupFailed', 'Setup could not be completed. Nothing was changed.'), {})
    set('notice|serverMessage', { setupNotice: { tone: 'ok', text: 'WhatsApp is connected. Auto-replies are on.' } }, { whatsappConnection: conn() })
    set('starter', {}, { truck: { ...truck, plan: 'starter' } }, ['auto-replies', 'account-deletion'])
    set('pro', {}, { truck: { ...truck, plan: 'pro' }, whatsappConnection: conn(), whatsappUsage: usage(120) })
    set('manager', {}, { userRole: 'manager' }, ['account-deletion'])
    set('summaryNotLoaded', { summary: null }, {}, ['account-deletion'])
    set('deletionPending', { summary: { ...summary1, pending: true, requestedAt: '2026-10-08T10:00:00Z', dueAt: '2026-11-07T10:00:00Z' } }, {}, ['account-deletion'])
    set('deletionDialog', { open: true, typed: 'Pizza' }, {}, ['account-deletion'])

    // ══ 2. WhatsAppReplyPreview, WhatsAppSetupControl ══════════════════════════════════════════════════════════
    const P = st => html(st, W(h(M.WhatsAppReplyPreview, { token: 'harness' })))
    v('preview|empty', () => P({}))
    v('preview|typing', () => P({ message: 'Do you do gluten-free bases?' }))
    v('preview|loading', () => P({ message: 'Where are you tonight?', asked: 'Where are you tonight?', loading: true }))
    const asked = 'Where are you tonight?'
    v('preview|result|SPECIFIC_QUERY', () => P({ message: asked, asked, result: { reply: 'Tonight we’re at The Green, 5pm–9pm. Order ahead: hatchgrab.com/o/test-kitchen', classification: 'SPECIFIC_QUERY' } }))
    v('preview|result|MENU_QUERY', () => P({ message: 'Do you do pepperoni?', asked: 'Do you do pepperoni?', result: { reply: 'Yes — Pepperoni is £11.50.\nSee the full menu: hatchgrab.com/o/test-kitchen', classification: 'MENU_QUERY' } }))
    v('preview|result|ALLERGEN_QUERY', () => P({ message: 'Is the margherita nut free?', asked: 'Is the margherita nut free?', result: { reply: 'For allergen information please check the menu or ask us at the hatch.', classification: 'ALLERGEN_QUERY' } }))
    v('preview|result|IGNORE', () => P({ message: 'Can you do my wedding?', asked: 'Can you do my wedding?', result: { reply: null, classification: 'IGNORE' } }))
    // The error the route sent is shown as it came; the fallback and the network error are ours (a code on the new code
    // only if WADA makes them one — then add an __after here).
    v('preview|error|server', () => P({ message: asked, asked, error: 'You have tried a lot of previews in a short time. Try again in a minute.' }))
    v('preview|error|fallback', () => P({ message: asked, asked, error: 'Could not build a preview just now.' }))
    v('preview|error|network', () => P({ message: asked, asked, error: 'Could not reach the server. Check your connection and try again.' }))

    const setupProps = o => ({ token: 'harness', offerReauthorise: false, showButton: true, onNotice: noop, onConnectionUpdate: noop, ...o })
    const S = (st, o) => {
      if (!reducerPatched) return 'ERROR the WhatsAppSetupControl reducer line changed — this module cannot start it in a state'
      globalThis.__msSetup = st && { phase: 'idle', attempt: null, lastAttempt: 0, showPopupHint: false, notice: null, ...st }
      try { return html({}, W(h(M.WhatsAppSetupControl, setupProps(o)))) } finally { delete globalThis.__msSetup }
    }
    v('setup|preparing', () => S(null))
    v('setup|unavailable', () => S({ phase: 'unavailable' }))
    v('setup|idle', () => S({ phase: 'idle' }))
    v('setup|idleReauthorise', () => S({ phase: 'idle' }, { offerReauthorise: true }))
    v('setup|waiting', () => S({ phase: 'waiting', attempt: 1, lastAttempt: 1 }))
    v('setup|waitingHint', () => S({ phase: 'waiting', attempt: 1, lastAttempt: 1, showPopupHint: true }))
    v('setup|finishing', () => S({ phase: 'submitting', attempt: 1, lastAttempt: 1 }))
    v('setup|hidden', () => S({ phase: 'idle' }, { showButton: false }))

    // ══ 3. DeleteAccountSection ════════════════════════════════════════════════════════════════════════════════
    if (M.DEL && M.DEL.DeleteAccountSection) {
      const D = (st, o) => html(st, W(h(M.DEL.DeleteAccountSection, { truckName: 'Pizza Kitchen', showToast: noop, ...o })))
      const sum = (o = {}) => ({ ...summary1, upcomingOrders: 0, ...o })
      const two = sum({ trucks: [{ id: 'test-truck', name: 'Pizza Kitchen' }, { id: 'truck-2', name: 'Pasta Van' }], upcomingOrders: 3 })
      v('delete|notLoaded', () => D({}))
      v('delete|summary', () => D({ summary: sum() }))
      v('delete|open|noOrders', () => D({ summary: sum(), open: true, typed: '' }))
      v('delete|open|oneOrder', () => D({ summary: sum({ upcomingOrders: 1 }), open: true, typed: '' }))
      v('delete|open|partial', () => D({ summary: sum({ upcomingOrders: 3 }), open: true, typed: 'Pizza' }))
      v('delete|open|exact', () => D({ summary: sum({ upcomingOrders: 3 }), open: true, typed: 'Pizza Kitchen' }))
      v('delete|open|severalTrucks', () => D({ summary: two, open: true, typed: 'Pizza Kitchen' }))
      v('delete|open|submitting', () => D({ summary: sum(), open: true, typed: 'Pizza Kitchen', submitting: true }))
      v('delete|pending', () => D({ summary: sum({ pending: true, requestedAt: '2026-10-08T10:00:00Z', dueAt: '2026-11-07T10:00:00Z' }) }))
      v('delete|pendingNoDates', () => D({ summary: sum({ pending: true }) }))
    } else out[`${cc}|delete|module`] = 'ERROR DeleteAccountSection is not exported'

    // ══ 4. CustomDomainSetup, CopyButton ═══════════════════════════════════════════════════════════════════════
    const tld = US_ ? 'com' : 'co.uk'
    const host = `pizzakitchen.${tld}`
    const address = `events.${host}`
    const cdProps = (o = {}) => ({ token: 'harness', plan: 'max', featureOverrides: {}, trialExpiresAt: null, truckName: 'Pizza Kitchen', slug: 'test-kitchen',
      website: `https://www.${host}`, customDomain: null, setupState: null, setupStartedAt: null, verifiedAt: null, time: C.time, confirmedAt: null, ...o })
    const D = (st, o) => html(st, W(h(M.CustomDomainSetup, cdProps(o))))
    const provider = id => {
      const p = (M.DNS_PROVIDERS || []).find(x => x.id === id)
      if (!p) return null
      const rest = { ...p }; delete rest.nsMatch   // the provider minus its detection regex (not part of a view)
      return rest
    }
    const CNAME = 'cname.vercel-dns.com.'
    // The rows the wizard holds, built by the code's own recordRows (the truck's locale passed — ignored on 826471a).
    const rowsFor = p => M.CDCOPY.recordRows({ locale: C.locale, provider: p, subdomainLabel: 'events', cnameTarget: CNAME })
    v('domain|starter', () => D({}, { plan: 'starter' }))
    v('domain|card|noWebsite', () => D({}, { website: null }))
    v('domain|card|website', () => D({}))
    v('domain|card|waiting', () => D({}, { customDomain: address, setupState: 'awaiting_dns', setupStartedAt: '2026-10-04T09:30:00Z' }))
    v('domain|card|waitingNoDate', () => D({}, { customDomain: address, setupState: 'awaiting_dns' }))
    v('domain|card|justWentLive', () => D({ justWentLive: true }, { customDomain: address, setupState: 'awaiting_dns', setupStartedAt: '2026-10-04T09:30:00Z' }))
    v('domain|address|fixed', () => D({ open: true, step: 'address' }))
    v('domain|address|typedEmpty', () => D({ open: true, step: 'address', typedDomain: '' }, { website: null }))
    v('domain|address|typed', () => D({ open: true, step: 'address', typedDomain: host }, { website: null }))
    v('domain|address|checking', () => D({ open: true, step: 'address', busy: true, phase: 'checking' }))
    v('domain|address|setting', () => D({ open: true, step: 'address', busy: true, phase: 'setting' }))
    v('domain|address|padlockRestricted', () => D({ open: true, step: 'address', pre: { ok: true, address, caa: { state: 'restricted', issuers: ['digicert.com'] } }, provider: provider('godaddy') }))
    v('domain|address|padlockBlocked', () => D({ open: true, step: 'address', pre: { ok: true, address, caa: { state: 'blocked', issuers: [] }, already_elsewhere: true } }))
    v('domain|address|refused', () => D({ open: true, step: 'address', error: 'That address will not work.' }))
    v('domain|address|provisionFailed', () => D({ open: true, step: 'address', error: 'That address could not be set up.', provisionFailed: true }))
    v('domain|resume|picking', () => D({ open: true, step: 'idle' }, { customDomain: address, setupState: 'awaiting_dns' }))
    v('domain|resume|failed', () => D({ open: true, step: 'idle', resumeFailed: true }, { customDomain: address, setupState: 'awaiting_dns' }))
    v('domain|record|generic', () => D({ open: true, step: 'record', rows: rowsFor(null) }))
    v('domain|record|noSteps', () => D({ open: true, step: 'record', rows: rowsFor(provider('namecheap')), provider: provider('namecheap') }))
    for (const id of ['wix', 'godaddy', '123reg', 'cloudflare']) v(`domain|record|${id}`, () => D({ open: true, step: 'record', rows: rowsFor(provider(id)), provider: provider(id) }))
    v('domain|record|sending', () => D({ open: true, step: 'record', rows: rowsFor(null), emailTo: 'web@example.test', busy: true }))
    v('domain|record|sent', () => D({ open: true, step: 'record', rows: rowsFor(null), emailTo: 'web@example.test', emailSent: true }))
    v('domain|record|sendError', () => D({ open: true, step: 'record', rows: rowsFor(null), emailTo: 'web@example', error: 'That does not look like an email address' }))
    const live = { customDomain: address, setupState: null, setupStartedAt: '2026-10-04T09:30:00Z', verifiedAt: '2026-10-08T12:00:00Z' }
    v('domain|live|confirm', () => D({}, live))
    v('domain|live|saidNo', () => D({ saidNo: true }, live))
    v('domain|live|thanked', () => D({ confirmed: true }, live))
    v('domain|live|confirmed', () => D({}, { ...live, confirmedAt: '2026-10-08T13:00:00Z' }))
    v('domain|live|viewSetup', () => D({ open: true, step: 'record', rows: rowsFor(null) }, { ...live, confirmedAt: '2026-10-08T13:00:00Z' }))
    v('domain|turnOff|panel', () => D({ offAsking: true }, { ...live, confirmedAt: '2026-10-08T13:00:00Z' }))
    v('domain|turnOff|busy', () => D({ offAsking: true, offBusy: true }, { ...live, confirmedAt: '2026-10-08T13:00:00Z' }))
    v('domain|turnOff|error', () => D({ offAsking: true, offError: 'We could not switch that off just now. Nothing has changed — your address is still working. Try again shortly.' }, { ...live, confirmedAt: '2026-10-08T13:00:00Z' }))
    v('domain|turnOff|done', () => D({ turnedOff: true }, { ...live, confirmedAt: '2026-10-08T13:00:00Z' }))

    const CB = M.CPY && M.CPY.CopyButton
    if (CB) {
      const B = (st, o) => html({ state: st }, W(h(CB, { value: 'cname.vercel-dns.com', ...o })))
      v('copy|idle', () => B('idle', {}))
      v('copy|copied', () => B('copied', { describedAs: 'Value' }))
      v('copy|failed', () => B('failed', { describedAs: 'Value' }))
      v('copy|failedUnnamed', () => B('failed', {}))
      v('copy|primaryCopied', () => B('copied', { label: 'Copy link', tone: 'primary', describedAs: 'the order link' }))
    } else out[`${cc}|copy|module`] = 'ERROR CopyButton is not exported'

    // ══ 5a. the instructions email, called directly (provider steps from the code's own provider records) ══════
    const IE = M.CDCOPY && M.CDCOPY.instructionsEmail
    if (IE) {
      const mail = (p, operatorEmail = 'kitchen@example.test') => IE({ truckName: 'Pizza Kitchen', address, providerLabel: p ? p.label : null, rows: rowsFor(p), operatorEmail, steps: p ? p.steps ?? null : null, locale: C.locale })
      v('email|direct|generic', () => mail(null))
    }
  }

  // ══ 5b. the instructions email as the manage route builds it (domain_send_instructions) ══════════════════════
  await routeEmails(ctx, out)
  return out
}

/** `domain_send_instructions` through app/api/manage's POST, on a fake database, with the send recorded (never made). */
async function routeEmails(ctx, out) {
  const { kit, REPO } = ctx
  const { makeFakePg } = require('./_fake-pg.cjs')
  const SEEDS = require('./_country-settings-gb.cjs')
  let M
  try {
    M = await kit.bundle('lp1d2-wada-route', "export { POST as managePOST } from '@/app/api/manage/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", {
      stubs: {
        '@/lib/supabase/server': 'export async function createSupabaseServerClient() { return { auth: { getUser: async () => ({ data: { user: globalThis.__harnessUser ?? null }, error: null }) } } }',
        // Every limiter allows: the email is what this area renders (the refusals are the api area's).
        '@/lib/ratelimit': "const limiter = { limit: async () => ({ success: true, limit: 99, remaining: 98, reset: 0 }) }\nmodule.exports = Object.create(new Proxy({}, { get: (_, k) => (k === '__esModule' || typeof k === 'symbol' ? undefined : limiter) }))",
        '@/lib/email': "module.exports = Object.create(new Proxy({}, { get: (_, k) => (k === '__esModule' || typeof k === 'symbol' ? undefined : async (...a) => { (globalThis.__mails ||= []).push({ fn: k, args: a }) }) }))",
      },
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|email|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return }
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
  const NS = { generic: 'ns1.example-dns.test.', wix: 'ns2.wixdns.net.', godaddy: 'ns51.domaincontrol.com.', '123reg': 'ns.123-reg.co.uk.', namecheap: 'dns1.registrar-servers.com.' }

  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    const host = cc === 'US' ? 'pizzakitchen.com' : 'pizzakitchen.co.uk'
    const tables = (o = {}) => ({
      country_settings: [snake(SEEDS.gbFromSeed()), snake(ctx.US.settings)],
      trucks: [{ id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', dashboard_token: 'tok', operator_id: 'op-1', country: cc, timezone: C.time.timeZone,
        plan: 'max', feature_overrides: {}, trial_expires_at: null, currency: cc === 'US' ? 'USD' : 'GBP', contact_email: 'kitchen@example.test',
        custom_domain: `events.${host}`, custom_domain_setup_state: 'awaiting_dns', ...(o.truck || {}) }],
      operators: [{ id: 'op-1', auth_user_id: 'u-1', is_admin: false }],
      truck_users: [], audit_log: [], admin_audit_log: [],
    })
    const send = async (k, ns, o = {}) => {
      const key = `${cc}|email|${k}`
      const db = makeFakePg(tables(o), {})
      globalThis.__harnessDb = { ...db, auth: { getUser: async () => ({ data: { user: null }, error: null }) } }
      globalThis.__harnessUser = { id: 'u-1' }
      globalThis.__mails = []
      const fetches = []
      const realFetch = globalThis.fetch
      const env = { VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN, VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID, VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID }
      // A stand-in token so the hosting lookup reaches fetch — which is ALSO a stand-in: nothing leaves this process.
      process.env.VERCEL_API_TOKEN = 'harness-not-a-token'; process.env.VERCEL_PROJECT_ID = 'harness-project'; delete process.env.VERCEL_TEAM_ID
      globalThis.fetch = async (u) => {
        const url = String(u)
        fetches.push(url.replace(/\?.*$/, '?…'))
        const json = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) })
        if (/api\.vercel\.com\/v6\/domains\/.*\/config/.test(url)) return json({ misconfigured: true, configuredBy: null, recommendedCNAME: [{ rank: 1, value: 'cname.vercel-dns.com.' }] })
        if (/cloudflare-dns\.com|dns\.google/.test(url)) {
          const type = /type=([A-Z]+)/.exec(url)?.[1]
          if (type === 'NS') return json({ Status: 0, Answer: [{ name: host, type: 2, TTL: 300, data: ns }] })
          return json({ Status: 0, Answer: [] })
        }
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
      }
      M.clearCountrySettingsCache?.()
      try {
        const req = new NextRequest('http://127.0.0.1/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: 'tok', action: 'domain_send_instructions', to: 'web@example.test' }) })
        const res = await kit.quietAsync(() => M.managePOST(req))
        const mails = (globalThis.__mails || []).map(m => ({ fn: m.fn, ...(m.args[0] && typeof m.args[0] === 'object' ? m.args[0] : { args: m.args }) }))
        out[key] = { status: res.status, body: await res.text(), mails, fetches }
      } catch (e) { out[key] = 'ERROR ' + String(e && e.message || e).slice(0, 300) }
      finally {
        globalThis.fetch = realFetch
        for (const [k2, v2] of Object.entries(env)) { if (v2 === undefined) delete process.env[k2]; else process.env[k2] = v2 }
        delete globalThis.__harnessDb; delete globalThis.__harnessUser; delete globalThis.__mails
      }
    }
    await send('generic', NS.generic)
    await send('wix', NS.wix)
    await send('godaddy', NS.godaddy)
    await send('123reg', NS['123reg'])
    await send('namecheap', NS.namecheap)
    await send('noOperatorEmail', NS.generic, { truck: { contact_email: null } })
  }
}

module.exports = { views }
