// scripts/_lp1d-schedule.cjs — Language Phase 1d, area `schedule`: Manage › Schedule, rendered whole (full HTML) for a
// GB and a US truck — the event list (empty, loading, populated with confirmed / to-approve / cancelled / private /
// past events, two vans and the van filter), the Add event modal (place picker, empty form, errors, address open, the
// phone's second step, a private event), Edit event with the hour pickers, Tidy up places, the import modal (paste,
// upload, the extracted events review), the cancel modal, the private link panel, SchedulePlaces' PlaceList /
// PlaceDetail / TidyUpPlaces, EventTimeSelect at morning / noon / evening / midnight times, the status badges, the
// Event types panel (and its type select), and VanFilter.
// A MODULE run by scripts/language-phase-1d.cjs; every view runs on 756ca09 and on this tree.
const M_FILE = 'app/manage/[token]/page.tsx'
const SP = 'components/manage/SchedulePlaces.tsx'
const ET = 'components/manage/EventTypes.tsx'
const PL = 'components/manage/PrivateLinkPanel.tsx'
const { BUNDLES, CATS } = require('./_lp1d-menu.cjs')

const ev = (o) => ({ truck_id: 'test-truck', venue_address: null, address: null, town: 'Harnessville', postcode: null, start_time: '17:00', end_time: '21:00',
  status: 'confirmed', auto_open: true, auto_close: true, opened_at: null, closed_at: null, confirmed_at: '2026-10-01T09:00:00Z', customer_note: null, notes: null,
  source: 'operator', van_id: null, is_private: false, private_name: null, event_deals: [], ...o })
const EVENTS = (cc) => [
  ev({ id: 'e1', event_date: '2026-10-10', venue_name: 'The Green', postcode: cc === 'US' ? '62701' : 'CB8 8XX', address: cc === 'US' ? '12 Main St' : '12 High St', van_id: 'v1', event_deals: [{ bundle_id: 'b1', active: true, overridden: false }] }),
  ev({ id: 'e2', event_date: '2026-10-11', venue_name: 'Market Square', start_time: '11:30', end_time: '14:00', status: 'unconfirmed', source: 'scraper', confirmed_at: null, van_id: 'v2' }),
  ev({ id: 'e3', event_date: '2026-10-17', venue_name: 'Smith wedding', is_private: true, private_name: 'Smith wedding', start_time: '12:00', end_time: '00:00', van_id: 'v1' }),
  ev({ id: 'e4', event_date: '2026-10-18', venue_name: 'Village Hall', status: 'cancelled', notes: 'Rained off' }),
  ev({ id: 'e5', event_date: '2026-10-09', venue_name: 'The Green', status: 'open', start_time: '16:00', end_time: '20:30', opened_at: '2026-10-09T15:00:00Z' }),
  ev({ id: 'e6', event_date: '2026-10-01', venue_name: 'Old Market', status: 'closed', closed_at: '2026-10-01T20:00:00Z' }),
]
const VANS = [{ id: 'v1', name: 'Van 1' }, { id: 'v2', name: 'Big van' }]
const place = (o) => ({ venue_id: null, short_name: null, address: null, area: 'Harnessville', postcode: null, is_favourite: false, is_hidden: false, merged_into_id: null,
  next_event_date: null, next_start_time: null, next_end_time: null, last_event_date: '2026-09-26', last_start_time: '17:00', last_end_time: '21:00', traded_last_year: 3, ...o })
const PLACES = [
  place({ id: 'p1', name_key: 'the green', name: 'The Green', is_favourite: true, next_event_date: '2026-10-10', next_start_time: '17:00', next_end_time: '21:00', address: '12 High St' }),
  place({ id: 'p2', name_key: 'market square', name: 'Market Square', traded_last_year: 0, last_event_date: null, last_start_time: null, last_end_time: null }),
  place({ id: 'p3', name_key: 'the crown', name: 'The Crown', is_hidden: true }),
]
const EXTRACTED = [
  { date: '2026-10-24', event_date: '2026-10-24', venue_name: 'The Green', town: 'Harnessville', start_time: '17:00', end_time: '21:00', postcode: '', notes: '' },
  { date: '2026-10-25', event_date: '2026-10-25', venue_name: 'Farmers Market', town: 'Harnessville', start_time: '09:00', end_time: '13:00', postcode: '', notes: 'Bring the gazebo' },
]
const FORM = (o) => ({ venue_name: '', town: '', postcode: '', address: '', event_date: '2026-10-24', start_time: '17:00', end_time: '21:00', notes: '', van_id: null, truck_place_id: null, is_private: false, private_name: '', ...o })

async function views(ctx) {
  const { kit, h, html, states, GB, US, inManage, PROVIDERS } = ctx
  const out = {}
  const ST = states(M_FILE, ['events', 'loadingEvents', 'showPast', 'editingEvent', 'modalView', 'phoneStep', 'addrOpen', 'formErrors', 'vans', 'vanFilter', 'addMode',
    'uploadText', 'uploadProcessing', 'extractedEvents', 'editedEvents', 'selectedEvents', 'editingEventIdx', 'showImportModal', 'importModalTitle', 'showEventCancelModal',
    'cancellingEvent', 'affectedOrderCount', 'linkPanel', 'placeTypeChoices', 'pendingTypes', 'pendingNames', 'eventTypeId', 'exclusionTerms', 'conflictAckId', 'expandedEventIds',
    'hiddenShown', 'showVenueSuggestions', 'placeSearch', 'editSaving', 'saving', 'alwaysUseType', 'savingExtracted', 'focusedEventIds'])
  let M
  try {
    M = await kit.bundle('lp1d-schedule', [
      `export { ScheduleTab, EventTimeSelect, EventStatusBadge } from '@/${M_FILE}'`,
      `export * as SP from '@/${SP}'`, `export * as ET from '@/${ET}'`, `export * as PL from '@/${PL}'`,
      "export * as VF from '@/components/manage/VanFilter'",
      PROVIDERS,
    ].join('\n'), {
      patches: [
        { file: M_FILE, append: 'export { ScheduleTab, EventTimeSelect, EventStatusBadge }' },
        { file: M_FILE, from: "import { createPortal } from 'react-dom'", to: 'const createPortal = (el: any) => el' },
        { file: M_FILE, states: ST },
        { file: SP, states: states(SP, ['places', 'error', 'starError', 'search', 'showHidden', 'selectedId']) },
        { file: ET, states: states(ET, ['loading', 'types', 'canTypes', 'standard', 'vans', 'pricingReady', 'pricing', 'menu', 'showItems', 'ready', 'usual']) },
        { file: PL, states: states(PL, ['qr', 'copied', 'busy', 'err']) },
      ],
    })
  } catch (e) { for (const cc of ['GB', 'US']) out[`${cc}|bundle`] = 'ERROR ' + String(e.message).slice(0, 300); return out }
  const noop = () => {}
  const api = async () => ({})

  for (const C of [GB, US]) {
    const cc = C.cc
    const W = el => inManage(M, C, el)
    const truck = { ...C.truck }
    const evs = EVENTS(cc)
    const props = (o = {}) => ({ isActive: true, section: 'events', onSectionChange: noop, onOpenSocial: noop, truck, token: 'harness', bundles: BUNDLES, categories: CATS,
      notices: null, api, showToast: noop, onTruckUpdate: noop, onVerifySuccess: noop, onSwitchTab: noop, pendingVerifyEvents: null, onClearPendingVerify: noop,
      onPendingCount: noop, onEventsSaved: noop, ...o })
    const base = { events: evs, loadingEvents: false, vans: VANS, places: PLACES }
    const sched = (k, st, o) => { out[`${cc}|tab|${k}`] = html({ ...base, ...st }, W(h(M.ScheduleTab, props(o)))) }
    // ── the list ──
    sched('list', {})
    sched('list|past', { showPast: true })
    sched('list|oneVan', { vans: VANS.slice(0, 1) })
    sched('list|vanFilter', { vanFilter: 'v2' })
    sched('list|expanded', { expandedEventIds: new Set(['e1', 'e3']) })
    sched('empty', { events: [] })
    sched('loading', { events: [], loadingEvents: true })
    sched('pending', {}, { pendingVerifyEvents: EXTRACTED })
    sched('starter', {}, { truck: { ...truck, plan: 'starter' } })
    sched('eventTypes', { loading: false, types: [], canTypes: true }, { section: 'event-types' })
    // ── add / edit ──
    const add = FORM({})
    sched('add|picker', { editingEvent: add, modalView: 'add', addMode: 'manual', phoneStep: 1 })
    sched('add|phone2', { editingEvent: add, modalView: 'add', addMode: 'manual', phoneStep: 2 })
    sched('add|addressOpen', { editingEvent: FORM({ venue_name: 'The Green', town: 'Harnessville', postcode: C.zip }), modalView: 'add', addMode: 'manual', phoneStep: 2, addrOpen: true })
    sched('add|errors', { editingEvent: FORM({ start_time: '21:00', end_time: '17:00' }), modalView: 'add', addMode: 'manual', phoneStep: 2,
      formErrors: { venue_name: 'Venue name is required', town: 'Area is required', event_date: 'Date is required', end_time: 'End time must be after start time' } })
    sched('add|private', { editingEvent: FORM({ venue_name: 'Smith wedding', is_private: true, private_name: 'Smith wedding' }), modalView: 'add', addMode: 'manual', phoneStep: 2 })
    sched('add|upload', { editingEvent: add, modalView: 'add', addMode: 'upload', uploadText: 'Sat 24 Oct, The Green, 5-9pm' })
    sched('add|uploadProcessing', { editingEvent: add, modalView: 'add', addMode: 'upload', uploadProcessing: true })
    sched('add|uploadReview', { editingEvent: add, modalView: 'add', addMode: 'upload', extractedEvents: EXTRACTED, editedEvents: EXTRACTED, selectedEvents: new Set([0, 1]) })
    sched('tidy', { editingEvent: add, modalView: 'tidy' })
    const editForm = FORM({ id: 'e1', venue_name: 'The Green', town: 'Harnessville', postcode: C.zip, address: cc === 'US' ? '12 Main St' : '12 High St', event_date: '2026-10-10', van_id: 'v1', truck_place_id: 'p1' })
    sched('edit', { editingEvent: editForm, modalView: 'add' })
    for (const [k, s, e] of [['morning', '07:00', '11:30'], ['noon', '12:00', '12:05'], ['evening', '18:45', '23:55'], ['midnight', '20:00', '00:00']])
      sched(`edit|times|${k}`, { editingEvent: { ...editForm, start_time: s, end_time: e }, modalView: 'add' })
    sched('edit|private', { editingEvent: FORM({ id: 'e3', venue_name: 'Smith wedding', is_private: true, private_name: 'Smith wedding', event_date: '2026-10-17', start_time: '12:00', end_time: '00:00' }), modalView: 'add' })
    sched('edit|saving', { editingEvent: editForm, modalView: 'add', editSaving: true })
    // ── the import modal ──
    sched('import|paste', { showImportModal: true, addMode: 'upload' })
    sched('import|text', { showImportModal: true, addMode: 'upload', uploadText: 'Sat 24 Oct, The Green, 5-9pm' })
    sched('import|processing', { showImportModal: true, addMode: 'upload', uploadProcessing: true })
    sched('import|review', { showImportModal: true, extractedEvents: EXTRACTED, editedEvents: EXTRACTED, selectedEvents: new Set([0]), exclusionTerms: ['private'] })
    sched('import|reviewEditing', { showImportModal: true, extractedEvents: EXTRACTED, editedEvents: EXTRACTED, selectedEvents: new Set([0, 1]), editingEventIdx: 1 })
    sched('import|saving', { showImportModal: true, extractedEvents: EXTRACTED, editedEvents: EXTRACTED, selectedEvents: new Set([0, 1]), savingExtracted: true })
    // ── cancel, link ──
    sched('cancel', { showEventCancelModal: true, cancellingEvent: evs[0], affectedOrderCount: 3 })
    sched('cancel|none', { showEventCancelModal: true, cancellingEvent: evs[0], affectedOrderCount: 0 })
    const link = { eventId: 'e3', name: 'Smith wedding', linkOrdering: true, token: 'tok-private', url: 'https://hatchgrab.test/p/tok-private', truckName: 'Pizza Kitchen', date: '2026-10-17', startTime: '12:00', endTime: '00:00' }
    sched('privateLink', { linkPanel: link })

    // ── SchedulePlaces ──
    const sp = M.SP
    if (sp && sp.PlaceList) {
      const pl = (k, o) => { out[`${cc}|places|list|${k}`] = html({}, W(h(sp.PlaceList, { places: PLACES, onSelect: noop, onFavourite: noop, search: '', onSearch: noop, ...o }))) }
      pl('default', {})
      pl('selected', { selectedId: 'p1' })
      pl('hidden', { showHidden: true, hiddenSection: true })
      pl('search', { search: 'zzz', emptyHint: undefined })
      pl('starError', { starError: 'Couldn’t save that star' })
      pl('empty', { places: [] })
    }
    if (sp && sp.PlaceDetail) for (const p of PLACES) out[`${cc}|places|detail|${p.id}`] = html({}, W(h(sp.PlaceDetail, { place: p, api, showToast: noop, onChanged: noop })))
    if (sp && sp.TidyUpPlaces) {
      const ctl = { places: PLACES, loading: false, error: null, starError: null, reload: noop, patchLocal: noop, setFavourite: noop }
      out[`${cc}|places|tidy`] = html({}, W(h(sp.TidyUpPlaces, { ctl, api, showToast: noop, onBack: noop })))
      out[`${cc}|places|tidy|hidden`] = html({ showHidden: true, selectedId: 'p3' }, W(h(sp.TidyUpPlaces, { ctl, api, showToast: noop, onBack: noop })))
    }
    if (sp && sp.shortDay) for (const d of ['2026-10-10', '2026-12-31', null]) out[`${cc}|places|shortDay|${d}`] = String(sp.shortDay(d, C.time))
    if (sp && sp.placeSubLine) for (const p of PLACES) out[`${cc}|places|subLine|${p.id}`] = String(sp.placeSubLine(p, C.time))

    // ── EventTimeSelect / EventStatusBadge ──
    if (M.EventTimeSelect) for (const v of ['07:00', '12:00', '12:05', '18:45', '23:55', '00:00', '']) {
      out[`${cc}|timeSelect|${v || 'empty'}`] = html({}, W(h(M.EventTimeSelect, { value: v, onChange: noop, className: 'ts', label: 'Start' })))
      // ⚠️ RE-PINNED (events that run past midnight, 17 October 2026, docs/midnight-and-format-fixes-report.md): the end
      // field's guard is `notSameAs` now (was `minExclusive`). BOTH are passed with the same start, so 756ca09 / 826471a
      // (which read minExclusive and ignore notSameAs) render exactly the BEFORE they captured, and this code exercises
      // the new rule (scripts/_lp1d-named.cjs midnight-end-select-not-same-as takes 11:30 as these views' start).
      out[`${cc}|timeSelect|${v || 'empty'}|end`] = html({}, W(h(M.EventTimeSelect, { value: v, onChange: noop, className: 'ts', minExclusive: '11:30', notSameAs: '11:30', label: 'End' })))
    }
    if (M.EventStatusBadge) for (const e of evs) out[`${cc}|badge|${e.id}`] = html({}, W(h(M.EventStatusBadge, { status: e.status, event_date: e.event_date, end_time: e.end_time })))

    // ── Event types ──
    const et = M.ET
    if (et && et.EventTypesPanel) {
      const type = { id: 't1', truck_id: 'test-truck', name: 'Festival', sort_order: 0, buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null, upcoming: 2, kind: 'custom', colour: 'amber' }
      const type2 = { ...type, id: 't2', name: 'Pub', sort_order: 1, upcoming: 0, colour: 'sky' }
      const priv = { ...type, id: 't3', name: 'Private event', sort_order: 2, upcoming: 1, kind: 'private', colour: 'violet' }
      const standard = { buzzer_prompt: { value: false, perVan: false }, takes_cash: { value: true, perVan: false }, order_ready: { value: true, perVan: false }, collection_interval_mins: { value: 10, perVan: false }, offline_protection: { enabled: false, mode: 'pause', perVan: false } }
      const pricing = { t1: { price_change_on: true, price_mode: 'add_amount', price_amount: 1.5, price_rounding: 'nearest_1', typed: { i2: 13 } }, t2: { price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none', typed: {} } }
      const menu = { categories: [{ id: 'c1', name: 'Pizzas', items: [{ id: 'i1', name: 'Margherita', price: 9.5 }, { id: 'i2', name: 'Pepperoni', price: 11 }] }] }
      const st = { loading: false, types: [type, type2, priv], canTypes: true, standard, vans: [], pricingReady: true, pricing, menu, showItems: true }
      const etv = (k, s, o) => { out[`${cc}|eventTypes|${k}`] = html({ ...st, ...s }, W(h(et.EventTypesPanel, { token: 'harness', manageApi: api, inline: true, ...o }))) }
      etv('grid', {})
      etv('empty', { types: [] })
      etv('loading', { loading: true })
      etv('locked', { canTypes: false })
      etv('noItems', { showItems: false })
      etv('twoVans', { vans: [{ id: 'v1', name: 'Van 1', values: {} }, { id: 'v2', name: 'Big van', values: { takes_cash: false } }] })
      etv('modal', {}, { inline: false, onClose: noop })
      if (et.EventTypeSelect) {
        const sel = (k, s, o) => { out[`${cc}|eventTypes|select|${k}`] = html({ types: [type, type2, priv], ready: true, usual: null, ...s }, W(h(et.EventTypeSelect, { token: 'harness', venueName: 'The Green', placeId: 'p1', value: 't1', onChange: noop, ...o }))) }
        sel('festival', {})
        sel('usual', { usual: 't2' }, { value: null })
        sel('private', {}, { value: 't3', privateName: 'Smith wedding', onPrivateName: noop })
        sel('notReady', { ready: false })
      }
    }
    // ── VanFilter ──
    const vf = M.VF
    if (vf && vf.VanFilter) {
      out[`${cc}|vanFilter|two`] = html({}, W(h(vf.VanFilter, { vans: VANS, value: 'all', onChange: noop, showUnassigned: true })))
      out[`${cc}|vanFilter|one`] = html({}, W(h(vf.VanFilter, { vans: VANS.slice(0, 1), value: 'all', onChange: noop })))
      for (const f of ['all', 'unassigned', 'v2']) out[`${cc}|vanFilter|label|${f}`] = String(vf.vanFilterLabel(VANS, f, C.locale))
    }
    // ── PrivateLinkPanel alone ──
    const pp = M.PL
    if (pp && pp.PrivateLinkPanel) {
      const data = { eventId: 'e3', name: 'Smith wedding', linkOrdering: true, token: 'tok-private', url: 'https://hatchgrab.test/p/tok-private', truckName: 'Pizza Kitchen', date: '2026-10-17', startTime: '12:00', endTime: '00:00' }
      out[`${cc}|privateLink|on`] = html({}, W(h(pp.PrivateLinkPanel, { data })))
      out[`${cc}|privateLink|off`] = html({}, W(h(pp.PrivateLinkPanel, { data: { ...data, linkOrdering: false } })))
      out[`${cc}|privateLink|noLink`] = html({ err: null }, W(h(pp.PrivateLinkPanel, { data: { ...data, token: null, url: null }, editable: false })))
      out[`${cc}|privateLink|copied`] = html({ copied: true, qr: 'data:image/png;base64,AAAA' }, W(h(pp.PrivateLinkPanel, { data })))
    }
  }
  return out
}

module.exports = { views, EVENTS, VANS, PLACES, EXTRACTED }
