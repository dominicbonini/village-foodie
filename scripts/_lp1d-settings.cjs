// scripts/_lp1d-settings.cjs — Language Phase 1d, area `settings`: Manage › Settings, rendered whole for a GB and a US
// truck in its meaningful states, and SPLIT INTO ITS SECTIONS (by each section's `id="…"` anchor) so a view is one
// section: truck-details, contact, order-settings, truck-settings, schedule, qr-code — in scope — and auto-replies,
// account-deletion — OUT of scope (they are compared as SMOKE views: no change at all). Also WhereYouTrade alone,
// KitchenCapacityEdit's pieces and KitchenCapacityCategoryRow.
// States: the owner and a manager, Starter / Pro / Max, one van and two (with the per-van service settings, kitchen
// capacity, offline protection, stock), adding / renaming / deleting a van, the van billing and upgrade modals, the
// QR modal, schedule verify errors, the pre-order modal, the emoji picker.
const M_FILE = 'app/manage/[token]/page.tsx'
const { CATS, ITEMS, SUBCATS } = require('./_lp1d-menu.cjs')

const SECTION_IDS = ['truck-details', 'contact', 'order-settings', 'truck-settings', 'schedule', 'qr-code', 'auto-replies', 'account-deletion']
const OUT_OF_SCOPE_SECTIONS = new Set(['auto-replies', 'account-deletion'])
const van = (o) => ({ truck_id: 'test-truck', kds_token: 'kds-x', active: true, auto_pause_on_offline: false, offline_protection_mode: 'pause', offline_auto_reject_mins: 15,
  show_cooking_step: true, order_ready_enabled: true, kitchen_capacity: 6, capacity_window_mins: 10, buzzer_count: 0, collection_interval_mins: 10,
  operator_collection_interval_mins: 10, categorySettings: [], same_as_first_van: false, capacity_same_as_first_van: false, takes_cash: null, ...o })
const VANS = [
  van({ id: 'v1', name: 'Van 1' }),
  van({ id: 'v2', name: 'Big van', auto_pause_on_offline: true, offline_protection_mode: 'no_auto_accept', offline_auto_reject_mins: null, kitchen_capacity: null, buzzer_count: 12, same_as_first_van: true, takes_cash: false,
    categorySettings: [{ category_id: 'c1', prep_secs: 300, batch_size: 6, counts_toward_capacity: true }] }),
]

/** The element that carries ` id="<id>"`, whole (its matching close tag found by counting), or null. */
function elementById(html, id) {
  const i = html.indexOf(` id="${id}"`)
  if (i < 0) return null
  const start = html.lastIndexOf('<', i)
  const tag = /^<([a-zA-Z0-9]+)/.exec(html.slice(start))[1]
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g')
  re.lastIndex = start
  let d = 0, m
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { d--; if (d === 0) return html.slice(start, m.index + m[0].length) } else d++
  }
  return html.slice(start)
}
/** The page with the OUT-OF-SCOPE sections cut out (`page`), and each of those sections whole (`oos|<id>`, a smoke view). */
function sections(html) {
  if (typeof html !== 'string' || html.startsWith('ERROR')) return { page: html }
  const out = {}
  let inScope = html
  for (const id of SECTION_IDS) {
    const el = elementById(html, id)
    if (el == null) continue
    if (!OUT_OF_SCOPE_SECTIONS.has(id)) continue
    out[`oos|${id}`] = el
    inScope = inScope.replace(el, `<!-- ${id}: out of scope -->`)
  }
  out.page = inScope
  return out
}

async function views(ctx) {
  const { kit, h, html, states, GB, US, inManage, PROVIDERS } = ctx
  const out = {}
  const ST = states(M_FILE, ['vans', 'firstVanId', 'intervalsAvailable', 'perVanCategoriesAvailable', 'vanCashAvailable', 'addingVan', 'newVanName', 'renamingVanId', 'renameVanName',
    'deletingVan', 'showVanBillingModal', 'showVanUpgradeModal', 'qrPreviews', 'qrModal', 'settingsExclusionList', 'verifying', 'verifyError', 'poSel', 'poModalOpen', 'preordersOn',
    'gType', 'gVal', 'gAction', 'gOpen', 'showEmojiPicker', 'crewMode', 'kdsMode', 'displayMode', 'preferredContact', 'allowCancellation', 'cancellationCutoff', 'savingSameAsFirst',
    'copiedOrderLink', 'generatingQR', 'qrCodeStyle', 'setupNotice', 'disconnectOpen', 'monthlyLimit'])
  let M
  try {
    M = await kit.bundle('lp1d-settings', [
      `export { SettingsTab } from '@/${M_FILE}'`,
      "export * as WYT from '@/components/manage/WhereYouTrade'",
      "export * as KCE from '@/components/manage/KitchenCapacityEdit'",
      "export * as KCR from '@/components/manage/KitchenCapacityCategoryRow'",
      PROVIDERS,
    ].join('\n'), {
      patches: [
        { file: M_FILE, append: 'export { SettingsTab }' },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
        { file: M_FILE, states: ST },
        { file: 'components/manage/WhereYouTrade.tsx', states: states('components/manage/WhereYouTrade.tsx', ['error']) },
      ],
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return out }
  const noop = () => {}
  const api = async () => ({})

  for (const C of [GB, US]) {
    const cc = C.cc
    const W = el => inManage(M, C, el)
    const truck = { ...C.truck }
    const props = (o = {}) => ({ userRole: 'owner', truck, whatsappConnection: null, whatsappUsage: null, onConnectionUpdate: noop, token: 'harness', api, showToast: noop,
      onVerifySuccess: noop, onSwitchTab: noop, categories: CATS, items: ITEMS, subcategories: SUBCATS, onTruckUpdate: noop, onItemsPatch: noop, onCategoriesPatch: noop,
      onOpenWalkthrough: noop, notices: null, ...o })
    const base = { vans: VANS.slice(0, 1), firstVanId: 'v1', intervalsAvailable: true, perVanCategoriesAvailable: true, vanCashAvailable: true, settingsExclusionList: [{ id: 'x1', term: 'private' }] }
    const set = (k, st, o) => {
      const page = html({ ...base, ...st }, W(h(M.SettingsTab, props(o))))
      for (const [sec, v] of Object.entries(sections(page))) out[`${cc}|${k}|${sec}`] = v
    }
    set('owner', {})
    set('twoVans', { vans: VANS })
    set('manager', {}, { userRole: 'manager' })
    set('starter', {}, { truck: { ...truck, plan: 'starter' } })
    set('pro', { vans: VANS }, { truck: { ...truck, plan: 'pro' } })
    set('legacy', { intervalsAvailable: false, perVanCategoriesAvailable: false, vanCashAvailable: false })
    set('addingVan', { vans: VANS, addingVan: true, newVanName: 'Little van' })
    set('renamingVan', { vans: VANS, renamingVanId: 'v2', renameVanName: 'Big van' })
    set('deletingVan', { vans: VANS, deletingVan: VANS[1] })
    set('vanBilling', { vans: VANS, showVanBillingModal: true })
    set('vanUpgrade', { showVanUpgradeModal: true }, { truck: { ...truck, plan: 'starter' } })
    set('qrModal', { qrModal: { style: 'branded', dataUrl: 'data:image/png;base64,AAAA', displayUrl: 'hatchgrab.test/test-kitchen' } })
    set('qrPreviews', { qrPreviews: { standard: 'data:image/png;base64,AAAA', branded: 'data:image/png;base64,BBBB' }, copiedOrderLink: true })
    set('verifyError', { verifyError: 'We couldn’t find any events on that page.' }, { truck: { ...truck, schedule_url: 'https://pizzakitchen.example/events' } })
    set('verifying', { verifying: true }, { truck: { ...truck, schedule_url: 'https://pizzakitchen.example/events', scraper_preference: 'auto' } })
    set('preorders', { poModalOpen: true, poSel: new Set(['i1']), preordersOn: true, gType: 'daily_cutoff', gVal: 18, gAction: 'force_pending', gOpen: '2d' })
    set('preordersOff', { preordersOn: false })
    set('emoji', { showEmojiPicker: true })
    set('kds', { crewMode: 'full', kdsMode: true, displayMode: 'grid', preferredContact: 'whatsapp', allowCancellation: false, cancellationCutoff: 60 })
    set('noCuisine', {}, { truck: { ...truck, cuisine_type: null, description: null, website: null, social_instagram: null } })
    set('setup', {}, { truck: { ...truck, setup_step: 'settings' } })
    set('trial', {}, { truck: { ...truck, plan: 'pro', trial_expires_at: '2026-10-20T00:00:00Z' } })
    set('noBase', {}, { truck: { ...truck, base_place_id: null, base_place_name: null, base_region: null, base_lat: null, base_lng: null } })

    // ── WhereYouTrade alone ──
    const wyt = M.WYT && M.WYT.WhereYouTrade
    if (wyt) {
      const w = (k, st, o) => { out[`${cc}|whereYouTrade|${k}`] = html(st, W(h(wyt, { truck, api, showToast: noop, onTruckUpdate: noop, ...o }))) }
      w('set', {})
      w('unset', {}, { truck: { ...truck, base_place_id: null, base_place_name: null, base_region: null, base_lat: null, base_lng: null } })
      w('readOnly', {}, { readOnly: true })
      w('error', { error: 'We couldn’t save that town.' })
    }
    // ── KitchenCapacityEdit's pieces and the category row ──
    const kce = M.KCE || {}
    if (kce.BatchSizeSelect) for (const v of [0, 1, 4, 12]) out[`${cc}|batchSize|${v}`] = html({}, W(h(kce.BatchSizeSelect, { value: v, onChange: noop })))
    if (kce.KitchenCapacityEdit) for (const [k, o] of Object.entries({
      plain: { categoryName: 'Pizzas', prepSecs: 480, batchSize: 4 },
      none: { categoryName: 'Drinks', prepSecs: 0, batchSize: 0 },
      counts: { categoryName: 'Sides', prepSecs: 120, batchSize: null, showCountsToward: true, countsToward: false, onCountsChange: noop, countsTitle: undefined },
      countsDisabled: { categoryName: 'Sides', prepSecs: 120, batchSize: 2, showCountsToward: true, countsToward: true, countsDisabled: true },
      noBadge: { prepSecs: 90, batchSize: 1, showBadge: false, showInstantNote: false },
    })) out[`${cc}|capacityEdit|${k}`] = html({}, W(h(kce.KitchenCapacityEdit, { onPrepChange: noop, onBatchChange: noop, ...o })))
    const kcr = M.KCR && M.KCR.KitchenCapacityCategoryRow
    if (kcr) for (const c of CATS) out[`${cc}|capacityRow|${c.id}`] = html({}, W(h(kcr, { categoryName: c.name, prepSecs: c.prep_secs, batchSize: c.batch_size, onPrepChange: noop, onBatchChange: noop,
      showCountsColumn: true, countsToward: c.counts_toward_capacity, onCountsChange: noop, locked: c.id === 'c3', capDisabled: false })))
  }
  return out
}

module.exports = { views, sections, SECTION_IDS, OUT_OF_SCOPE_SECTIONS, VANS }
