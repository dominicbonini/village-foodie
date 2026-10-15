// scripts/_lp1b-printing.cjs — Language Phase 1b, area "printing" (run by scripts/language-phase-1b.cjs).
// THE PRINTED TICKET, AS BYTES, AND THE PRINTING CARD, AS HTML — for a GB truck and a US truck.
//
//   • every order fixture (every payment state, walk-up, ASAP, refunds, edits, a four-figure total) through the ONE
//     mapper (mapOrderToTicket) and the ONE renderer: the layout lines AND the ESC/POS bytes (hex), at 58 and 80 mm,
//     with the phone shown and hidden;
//   • the options that change a ticket: possible-duplicate banner (attempt 1 and 2), deliberate reprint, buzzer,
//     no paid step, held card, no notes/deals, an empty customer name (walk-up default), every payment status the
//     renderer has a line for (incl. refund_due / failed), a long id that stacks, a long name that wraps, an amount
//     the printer cannot encode (EUR → ISO code), no money format, an emoji and accents in truck data;
//   • the test ticket (GB and US clock), TicketPreview's HTML;
//   • every operator-facing printing string: the stub / wired / Bluetooth transports' errors and status details,
//     the wired-error wording per plugin code, the guard sentences, the route client's errors, the address help;
//   • PrintingSettings (Bluetooth and wired branches, every availability, scan results, guard states, waiting
//     counts, the expanded settings) and PrinterTypeChoice, rendered in full HTML; usePrinting's status.
//
// 🔴 A TRANSPORT'S ERROR IS A CODE AFTER THIS PHASE (it is set inside effects and handed across the seam) and the
// card turns it into words at render. So AFTER, each code is rendered through lib/printing/printerText — the same
// function the card uses — and must read exactly the sentence BEFORE returned. Props the card receives (statusDetail)
// are passed as the BEFORE sentence BEFORE and as the code AFTER, which proves the code renders that sentence.
const NATIVE_STUBS = {
  '@capacitor/core': `export const Capacitor = { isNativePlatform: () => globalThis.__lp.native, getPlatform: () => (globalThis.__lp.native ? 'ios' : 'web'), isPluginAvailable: (n) => (n === 'NetPrinter' ? globalThis.__lp.plugin : true) }
export const registerPlugin = () => ({}); export class WebPlugin {}`,
  '@capacitor/preferences': `const p = () => globalThis.__lp.prefs
export const Preferences = { async get({ key }) { return { value: p().has(key) ? p().get(key) : null } }, async set({ key, value }) { p().set(key, value) }, async remove({ key }) { p().delete(key) } }`,
  '@hatchgrab/net-printer': `export const NetPrinter = { probe: (o) => globalThis.__lp.probe(o), send: (o) => globalThis.__lp.send(o) }`,
  '@capacitor-community/bluetooth-le': `export const BleClient = {
  async initialize() {}, async isEnabled() { return true }, async requestLEScan() {}, async stopLEScan() {},
  async connect() { if (globalThis.__lp.bleConnectThrows) throw new Error(globalThis.__lp.bleConnectThrows) },
  async disconnect() {}, async getServices() { return globalThis.__lp.services || [] },
  async getConnectedDevices() { return globalThis.__lp.connected || [] },
  async write() { if (globalThis.__lp.writeThrows) throw new Error('GATT write rejected') },
  async writeWithoutResponse() { if (globalThis.__lp.writeThrows) throw new Error('GATT write rejected') } }
export const numbersToDataView = (a) => new DataView(new Uint8Array(a).buffer)`,
  '@/lib/native/device': `export const isNativeApp = () => globalThis.__lp.native
export const getDeviceId = () => 'device-harness'`,
  '@/lib/native/app': `export const onAppResume = () => () => {}`,
  // The card's On/Off switch lives in OrderCard (another area, edited concurrently): a fixed stand-in, the same
  // BEFORE and AFTER, so this area proves only the printing card's own words.
  '@/components/dashboard/OrderCard': `import { createElement } from 'react'
export const Toggle = ({ on }) => createElement('i', { 'data-toggle': String(on) })`,
}

function resetNative(over = {}) {
  globalThis.__lp = { native: true, plugin: true, prefs: new Map(), services: [], connected: [],
    probe: async () => ({ ok: true }), send: async () => ({ ok: true, bytesWritten: 10 }), ...over }
}

async function views(ctx) {
  const { kit, h, html, GB, US, AFTER } = ctx
  resetNative()
  const entry = [
    "export * as T from '@/lib/printing/ticket'",
    "export * as MAP from '@/lib/printing/mapOrderToTicket'",
    "export * as TEST from '@/lib/printing/testTicket'",
    "export * as TR from '@/lib/printing/transport'",
    "export * as NET from '@/lib/printing/netTransport'",
    "export * as BLE from '@/lib/printing/bleTransport'",
    "export * as G from '@/lib/printing/networkGuard'",
    "export * as ADDR from '@/lib/printing/netAddress'",
    "export { usePrinting } from '@/lib/printing/usePrinting'",
    "export { PrintingSettings } from '@/components/printing/PrintingSettings'",
    "export { PrinterTypeChoice } from '@/components/printing/PrinterTypeChoice'",
    "export { TicketPreview } from '@/components/printing/TicketPreview'",
    ...(AFTER ? ["export * as PT from '@/lib/printing/printerText'"] : []),
  ].join('\n')
  const SETTINGS_STATES = ['ready', 'enabled', 'printer', 'lead', 'paper', 'expanded', 'scanning', 'found', 'pairingError', 'availability',
    'localConnected', 'localName', 'connectingId', 'showOther', 'kind', 'netAddress', 'netInfo', 'netGuard', 'netBusy', 'netMsg', 'netOk', 'netAvailability']
  const m = await kit.bundle('lp1b-printing', entry, {
    stubs: NATIVE_STUBS,
    patches: [
      { file: 'components/printing/PrintingSettings.tsx', states: SETTINGS_STATES },
      { file: 'lib/printing/usePrinting.ts', states: ['enabled', 'ready', 'kind', 'netGuard', 'status'] },
    ],
  })
  // A transport answer as the operator reads it: BEFORE a sentence; AFTER a code rendered by the card's own helper.
  const said = (x, locale = 'en-GB') => (x == null || typeof x === 'string' || !AFTER ? x : m.PT.printerMessageText(locale, x))
  const res = r => (r && typeof r === 'object' && 'ok' in r ? { ...r, ...('error' in r ? { error: said(r.error) } : {}) } : r)
  const stat = s => (s && typeof s === 'object' ? { ...s, ...('detail' in s ? { detail: said(s.detail) } : {}) } : s)
  const out = {}
  const hex = u => Buffer.from(u).toString('hex')

  // ══ 1 · TICKETS — every fixture order, both countries, both widths, phone on and off ══════════════════════
  for (const C of [GB, US]) {
    const cc = C.cc
    const ticketOf = (k, extra = {}, truck = C.TRUCK, orderOver = {}) => m.MAP.mapOrderToTicket({
      order: { ...C.ORDERS[k], ...orderOver }, truck, event: C.EVENT, ledgerRows: C.ORDER_CASES[k].ledger,
      printedLabel: cc === 'US' ? 'Oct 9 12:37pm' : '9 Oct 18:37', heldAuthorisation: C.ORDER_CASES[k].held, ...extra,
    })
    const put = (label, t, widths = [58, 80], phones = [true, false]) => {
      for (const w of widths) for (const phone of phones) {
        const cfg = { paper_width: w, show_phone: phone }
        out[`ticket|${cc}|${label}|${w}|phone=${phone}`] = { lines: m.T.buildTicketLines(t, cfg), bytes: hex(m.T.renderTicket(t, cfg)) }
      }
    }
    for (const k of Object.keys(C.ORDERS)) put(k, ticketOf(k))
    // The options that change a ticket, on a paid, an unpaid (ASAP), a held and a walk-up order.
    for (const k of ['card_paid', 'asap', 'card_held', 'walk_up', 'part_paid']) {
      put(`${k}|dup2`, ticketOf(k, { reprint: m.MAP.reprintFromContext({ attempt: 2, mayDuplicate: true }) }), [58, 80], [true])
      put(`${k}|dup1`, ticketOf(k, { reprint: { reason: 'possible_duplicate', attempt: 1 } }), [58, 80], [true])
      put(`${k}|retryClean`, ticketOf(k, { reprint: m.MAP.reprintFromContext({ attempt: 3, mayDuplicate: false }) ?? null }), [80], [true])
      put(`${k}|reprint`, ticketOf(k, { reprint: { reason: 'reprint' } }), [58, 80], [true])
      put(`${k}|buzzer`, ticketOf(k, {}, C.TRUCK, { buzzer_number: 12 }), [58, 80], [true])
      put(`${k}|noPaidStep`, ticketOf(k, {}, { ...C.TRUCK, show_paid_step: false }), [58, 80], [true])
      put(`${k}|bare`, ticketOf(k, {}, C.TRUCK, { notes: null, deals: [], customer_phone: null }), [58, 80], [true])
      put(`${k}|noName`, ticketOf(k, {}, C.TRUCK, { customer_name: '' }), [58], [true])
      put(`${k}|noTruck`, ticketOf(k, { printedLabel: undefined }, null), [80], [true])
    }
    // The renderer's own branches, on hand-built tickets (what no fixture order reaches through the mapper).
    const base = ticketOf('card_paid')
    const hand = {
      refund_due: { ...base, showPaidStep: true, paymentStatus: 'refund_due' },
      failed: { ...base, showPaidStep: true, paymentStatus: 'failed' },
      refunded: { ...base, showPaidStep: true, paymentStatus: 'refunded' },
      part_refunded: { ...base, showPaidStep: true, paymentStatus: 'part_refunded' },
      unpaid: { ...base, showPaidStep: true, paymentStatus: 'unpaid', balanceMinor: 4390 },
      held: { ...base, showPaidStep: true, paymentStatus: 'unpaid', heldAuthorisation: true },
      longId: { ...base, id: 'A12345', buzzer_number: 7, reprint: { reason: 'possible_duplicate', attempt: 4 } },
      longName: { ...base, customer_name: 'Bartholomew Fitzwilliam-Montgomery the Third', customer_phone: '+44 7700 900123' },
      noMoney: { ...base, money: null },
      euro: { ...base, money: { currency: 'EUR', locale: 'fr-FR' } },
      truckData: { ...base, customer_name: 'José 🍕 Müller', truck_name: 'Café Crème — “Le Bus”', notes: 'Nut allergy… très grave 🥜' },
      asapNoPhone: { ...base, collection_time: null, customer_phone: null, notes: '   ', deals: null, items: [] },
    }
    for (const [k, t] of Object.entries(hand)) put(`hand|${k}`, t, [58, 80], [true])
    // TicketPreview — the on-screen twin of the paper.
    for (const [k, t] of [['card_paid', base], ['dup', hand.longId], ['data', hand.truckData]]) {
      for (const w of [58, 80]) out[`preview|${cc}|${k}|${w}`] = html(null, h(m.TicketPreview, { order: t, config: { paper_width: w, show_phone: true } }))
    }
    // The test ticket, on the truck's clock.
    for (const w of [58, 80]) {
      out[`test|${cc}|${w}`] = hex(m.TEST.renderTestTicket({ truckName: 'Pizza Kitchen', paper: w, at: new Date('2026-10-09T17:37:00Z'), time: C.time }))
      out[`test|${cc}|${w}|noName`] = hex(m.TEST.renderTestTicket({ truckName: null, paper: w, at: new Date('2026-10-09T17:37:00Z'), time: C.time }))
    }
  }

  // ══ 2 · THE OPERATOR'S PRINTING STRINGS — transports, guard, address ═════════════════════════════════════
  const addr = '192.168.1.50:9100'
  out['net|describe'] = Object.fromEntries(['permission', 'refused', 'timeout', 'unreachable', 'invalid', 'unsupported', 'io', undefined]
    .map(c => [String(c), said(m.NET.describeNetError(c, addr))]))
  out['addr|help'] = m.ADDR.NET_ADDRESS_HELP
  out['guard|copy'] = AFTER ? Object.fromEntries(['other', 'unknown', 'unbound', 'pin'].map(s => [s, said({ code: 'guard', state: s })])) : m.G.NET_GUARD_COPY
  out['guard|move'] = AFTER ? said({ code: 'guardMove' }) : m.G.NET_GUARD_MOVE_BUTTON
  const transports = {}
  await kit.quietAsync(async () => {
    const stub = m.TR.createStubTransport(() => {})
    transports.stub = { connect: res(await stub.connect('x')), send: res(await stub.sendBytes(new Uint8Array([1]))), status: stat(await stub.status()) }
    // wired
    resetNative({ native: false })
    let net = m.NET.createNetTransport()
    transports.netWeb = { connect: res(await net.connect(addr)), send: res(await net.sendBytes(new Uint8Array([1]))), status: stat(await net.status()) }
    resetNative()
    net = m.NET.createNetTransport()
    transports.netNoAddr = { send: res(await net.sendBytes(new Uint8Array([1]))), status: stat(await net.status()), bad: res(await net.connect('not an address')) }
    for (const code of ['permission', 'refused', 'timeout', 'unreachable', 'unsupported', 'io']) {
      resetNative({ probe: async () => ({ ok: false, errorCode: code }) })
      net = m.NET.createNetTransport()
      transports[`netProbe|${code}`] = { connect: res(await net.connect('192.168.1.50')), status: stat(await net.status()), avail: await net.availability() }
    }
    resetNative({ probe: async () => { throw new Error('bridge gone') } })
    net = m.NET.createNetTransport()
    transports.netProbeThrows = { connect: res(await net.connect('192.168.1.50')) }
    resetNative({ probe: async () => { throw 'not an error' } })   // eslint-disable-line no-throw-literal
    net = m.NET.createNetTransport()
    transports.netProbeThrowsBare = { connect: res(await net.connect('192.168.1.50')) }
    resetNative({ send: async () => ({ ok: false, bytesWritten: 0, errorCode: 'timeout' }) })
    globalThis.__lp.prefs.set('hg_net_printer_address', addr)
    net = m.NET.createNetTransport()
    transports.netSendFail = { send: res(await net.sendBytes(new Uint8Array([1, 2]))), status: stat(await net.status()) }
    resetNative({ send: async () => ({ ok: false, bytesWritten: 1, errorCode: 'refused' }) })
    globalThis.__lp.prefs.set('hg_net_printer_address', addr)
    net = m.NET.createNetTransport()
    try { await net.sendBytes(new Uint8Array([1, 2])) } catch (e) { transports.netSendPartial = String(e.message) }
    // Bluetooth
    resetNative({ native: false })
    let ble = m.BLE.createBleTransport()
    transports.bleWeb = { connect: res(await ble.connect('p1')), status: stat(await ble.status()), send: res(await ble.sendBytes(new Uint8Array([1]))) }
    resetNative()
    ble = m.BLE.createBleTransport()
    transports.bleNone = { status: stat(await ble.status()) }
    globalThis.__lp.prefs.set('hg_printer_name', 'MUNBYN-58')
    transports.bleStored = { status: stat(await ble.status()) }
    resetNative({ services: [] })
    ble = m.BLE.createBleTransport()
    transports.bleNoChannel = { connect: res(await ble.connect('p1')) }
    resetNative({ services: [{ uuid: '18f0', characteristics: [{ uuid: '2af1', properties: { write: true, writeWithoutResponse: false } }] }], writeThrows: true })
    ble = m.BLE.createBleTransport()
    transports.bleRefused = { connect: res(await ble.connect('p1')) }
    resetNative({ services: [{ uuid: '18f0', characteristics: [{ uuid: '2af1', properties: { write: true, writeWithoutResponse: false } }] }] })
    ble = m.BLE.createBleTransport()
    transports.bleUnnamed = { connect: res(await ble.connect('p1')), status: stat(await ble.status()) }
    resetNative({ bleConnectThrows: 'Peripheral timed out' })
    ble = m.BLE.createBleTransport()
    transports.bleThrows = { connect: res(await ble.connect('p1')) }
    // the route client
    const realFetch = globalThis.fetch
    try {
      globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
      transports.post500 = res(await m.G.claimNetPrinting('t', 'd'))
      globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'Server words' }) })
      transports.post400 = res(await m.G.setNetPrinterAddress('t', 'd', 'x'))
      globalThis.fetch = async () => { throw new Error('offline') }
      transports.postThrows = res(await m.G.releaseNetPrinting('t', 'd'))
    } finally { globalThis.fetch = realFetch }
  })
  out.transports = transports

  // ══ 3 · THE CARD — PrintingSettings, PrinterTypeChoice — full HTML ══════════════════════════════════════
  resetNative()
  const card = (state, props = {}) => {
    const p = { plan: 'max', featureOverrides: { ticket_printing: true }, trialExpiresAt: null, mode: 'lead_time', onChangeMode: async () => {},
      connected: false, waitingCount: 0, time: GB.time, ...props }
    return html({ ready: true, enabled: true, ...state }, h(m.PrintingSettings, p))
  }
  const det = (before, code) => (AFTER ? code : before)   // a statusDetail prop: the sentence BEFORE, the code AFTER
  const S = {}
  S.off = card({ enabled: false })
  S.webNull = (() => { globalThis.__lp.native = false; try { return card({}) } finally { globalThis.__lp.native = true } })()
  S.planNull = card({}, { featureOverrides: { ticket_printing: false } })
  S.bleIdle = card({})
  S.bleIdleWaiting1 = card({}, { waitingCount: 1 })
  S.bleIdleWaiting5 = card({}, { waitingCount: 5 })
  S.bleDetailStub = card({}, { statusDetail: det('No printer support in this build', { code: 'noSupport' }), waitingCount: 2 })
  S.bleDetailStored = card({}, { statusDetail: det('MUNBYN-58 is not connected', { code: 'bleNotConnected', name: 'MUNBYN-58' }) })
  S.bleDetailUnchecked = card({}, { statusDetail: det('The printer connection could not be checked', { code: 'statusUnchecked' }) })
  S.bleDetailGuard = card({}, { statusDetail: det('Printing is on another device. Move printing to this device?', { code: 'guard', state: 'other' }) })
  S.bleDetailNative = card({}, { statusDetail: 'Peripheral timed out' })
  S.scanning = card({ scanning: true })
  for (const a of ['off', 'unauthorised', 'unsupported', 'available']) S[`avail|${a}`] = card({ availability: a })
  // A state an effect or handler now holds as a CODE: BEFORE the sentence, AFTER (`__after`) the code it must render as.
  S.pairingError = card({ pairingError: 'That device does not look like a printer — it refused a printer command', __after: { pairingError: { code: 'notPrinterRefused' } } })
  S.pairingErrorNoChannel = card({ pairingError: 'That device does not look like a printer — it has no channel a ticket could be sent on', __after: { pairingError: { code: 'notPrinterNoChannel' } } })
  S.pairingErrorFallback = card({ pairingError: 'Could not connect to that printer', __after: { pairingError: { code: 'couldNotConnectPrinter' } } })
  S.pairingErrorNative = card({ pairingError: 'Peripheral timed out' })
  S.scanFallback = card({ pairingError: 'The scan could not be started', __after: { pairingError: { code: 'scanFailed' } } })
  S.foundNone = card({ found: [] })
  const devs = [{ id: 'a', name: 'MUNBYN-58', class: 'ble', likely: true }, { id: 'b', name: "Dominic's AirPods", class: 'ble', likely: false }, { id: 'c', name: 'Watch', class: 'ble', likely: false }]
  S.foundMixed = card({ found: devs })
  S.foundMixedOpen = card({ found: devs, showOther: true })
  S.foundMixedConnecting = card({ found: devs, connectingId: 'a' })
  S.foundOnlyOther = card({ found: devs.filter(d => !d.likely) })
  S.connectedLocal = card({ localConnected: true, localName: 'MUNBYN-58', printer: 'MUNBYN-58' })
  S.connectedProp = card({}, { connected: true })
  S.connectedBadge = card({ printer: 'MUNBYN-58', localConnected: true })
  S.expanded = card({ expanded: true, printer: 'MUNBYN-58' })
  S.expandedNoPrinter = card({ expanded: true })
  S.expandedOnConfirmed = card({ expanded: true }, { mode: 'on_confirmed' })
  S.collapsedOnConfirmed = card({ paper: 58 }, { mode: 'on_confirmed' })
  S.lead25 = card({ lead: 25, expanded: true })
  // wired
  const info = { columnsAvailable: true, vanId: 'van-1', vanName: 'Van 1', truckName: 'Pizza Kitchen', address: addr, printingDeviceId: 'device-harness' }
  S.netPin = card({ kind: 'net', netInfo: 'pin' })
  S.netNull = card({ kind: 'net', netInfo: null, netGuard: 'unknown' })
  S.netNoColumns = card({ kind: 'net', netInfo: { ...info, columnsAvailable: false }, netGuard: 'unknown' })
  S.netUnbound = card({ kind: 'net', netInfo: { ...info, vanId: null }, netGuard: 'unbound' })
  S.netEmpty = card({ kind: 'net', netInfo: info, netGuard: 'ok', netAddress: '' })
  S.netBadAddress = card({ kind: 'net', netInfo: info, netGuard: 'ok', netAddress: '192.168' })
  S.netOk = card({ kind: 'net', netInfo: info, netGuard: 'ok', netAddress: '192.168.1.50', netOk: true })
  const net = (st, props) => card({ kind: 'net', netInfo: info, netGuard: 'ok', netAddress: '192.168.1.50', ...st }, props)
  S.netOkMsg = net({ netOk: true, netMsg: 'Connected to 192.168.1.50:9100', __after: { netMsg: { code: 'connectedTo', address: addr } } })
  S.netOkMsgSaved = net({ netOk: true, netMsg: 'Connected to 192.168.1.50:9100. Request failed (500)', __after: { netMsg: { code: 'connectedToSaveFailed', address: addr, error: { code: 'requestFailed', status: '500' } } } })
  S.netOkMsgSavedOffline = net({ netOk: true, netMsg: 'Connected to 192.168.1.50:9100. Could not reach HatchGrab right now.', __after: { netMsg: { code: 'connectedToSaveFailed', address: addr, error: { code: 'couldNotReachHatchGrab' } } } })
  S.netOkMsgSavedServer = net({ netOk: true, netMsg: 'Connected to 192.168.1.50:9100. Server words', __after: { netMsg: { code: 'connectedToSaveFailed', address: addr, error: 'Server words  ' } } })
  S.netOkMsgSavedNone = net({ netOk: true, netMsg: 'Connected to 192.168.1.50:9100.', __after: { netMsg: { code: 'connectedToSaveFailed', address: addr } } })
  S.netCantReachMsg = net({ netOk: false, netMsg: "Can't reach the printer at 192.168.1.50", __after: { netMsg: { code: 'netCantReach', address: '192.168.1.50' } } })
  S.netPermissionMsg = net({ netOk: false, netMsg: 'HatchGrab needs permission to reach your printer. Turn on Local Network for HatchGrab in Settings.', __after: { netMsg: { code: 'netPermission' } } })
  S.netRefusedMsg = net({ netOk: false, netMsg: "Can't reach the printer at 192.168.1.50:9100 — it isn't accepting connections.", __after: { netMsg: { code: 'netRefused', address: addr } } })
  S.netUnreachableMsg = net({ netOk: false, netMsg: "Can't reach the printer at 192.168.1.50:9100 — check it's on the same network.", __after: { netMsg: { code: 'netUnreachable', address: addr } } })
  S.netAppOnlyMsg = net({ netOk: false, netMsg: 'Printing is only available in the app', __after: { netMsg: { code: 'appOnly' } } })
  S.netNoPrinterMsg = net({ netOk: false, netMsg: 'No printer connected', __after: { netMsg: { code: 'noPrinter' } } })
  S.netHelpMsg = net({ netOk: false, netMsg: "Enter the printer's address as 192.168.1.50 or 192.168.1.50:9100.", __after: { netMsg: { code: 'addressHelp' } } })
  S.netCouldNotReachMsg = net({ netOk: false, netMsg: 'Could not reach the printer', __after: { netMsg: { code: 'couldNotReachPrinter' } } })
  S.netTestNotPrinted = net({ netOk: false, netMsg: 'The test ticket did not print.', __after: { netMsg: { code: 'testNotPrinted' } } })
  S.netTestPartialBare = net({ netOk: false, netMsg: 'The test ticket may have printed only partly.', __after: { netMsg: { code: 'testPartial', detail: '' } } })
  S.netFail = card({ kind: 'net', netInfo: info, netGuard: 'ok', netAddress: '192.168.1.50', netOk: false })
  S.netFailMsg = net({ netOk: false, netMsg: "Can't reach the printer at 192.168.1.50:9100 — it didn't answer in time.", __after: { netMsg: { code: 'netTimeout', address: addr } } })
  S.netTestSent = net({ netOk: true, netMsg: 'Test ticket sent — check the printer.', __after: { netMsg: { code: 'testSent' } } })
  S.netTestPartial = net({ netOk: false, netMsg: 'The test ticket may have printed only partly. partial write after 1 of 2 bytes: x', __after: { netMsg: { code: 'testPartial', detail: 'partial write after 1 of 2 bytes: x' } } })
  S.netBusyConnect = card({ kind: 'net', netInfo: info, netGuard: 'ok', netAddress: '192.168.1.50', netBusy: 'connect' })
  S.netBusyTest = card({ kind: 'net', netInfo: info, netGuard: 'ok', netAddress: '192.168.1.50', netOk: true, netBusy: 'test' })
  S.netOther = card({ kind: 'net', netInfo: { ...info, printingDeviceId: 'other' }, netGuard: 'other', netAddress: '192.168.1.50' }, { waitingCount: 3 })
  S.netOther1 = card({ kind: 'net', netInfo: { ...info, printingDeviceId: 'other' }, netGuard: 'other' }, { waitingCount: 1 })
  S.netUnknown = card({ kind: 'net', netInfo: info, netGuard: 'unknown' })
  S.netUnauthorised = card({ kind: 'net', netInfo: info, netGuard: 'ok', netAvailability: 'unauthorised' })
  S.netUnsupported = card({ kind: 'net', netInfo: info, netGuard: 'ok', netAvailability: 'unsupported' })
  S.netMoveFail = card({ kind: 'net', netInfo: info, netGuard: 'other', netMsg: 'Could not move printing', __after: { netMsg: { code: 'couldNotMove' } } })
  for (const [k, v] of Object.entries(S)) out[`card|${k}`] = v
  // The type choice, alone: present, and absent on a binary without the plugin.
  out['type|ble'] = html(null, h(m.PrinterTypeChoice, { kind: 'ble', onChoose() {} }))
  out['type|net'] = html(null, h(m.PrinterTypeChoice, { kind: 'net', onChoose() {} }))
  globalThis.__lp.plugin = false
  out['type|absent'] = html(null, h(m.PrinterTypeChoice, { kind: 'ble', onChoose() {} }))
  globalThis.__lp.plugin = true

  // ══ 4 · usePrinting's status — what the card is handed ═════════════════════════════════════════════════
  const Probe = props => { globalThis.__lpStatus = m.usePrinting(props); return null }
  const hook = (state) => {
    delete globalThis.__lpStatus
    html(state, h(Probe, { token: 'harness', orders: Object.values(GB.ORDERS), truck: GB.TRUCK, event: GB.EVENT, payments: GB.PAYMENTS,
      heldAuthorisations: GB.HELD, canPrint: true, mode: 'lead_time' }))
    const s = globalThis.__lpStatus
    return s ? { active: s.active, waitingCount: s.waitingCount, status: stat(s.status) } : 'ERROR no status'
  }
  for (const g of ['other', 'unknown', 'unbound', 'pin', 'ok']) out[`hook|net|${g}`] = hook({ enabled: true, ready: true, kind: 'net', netGuard: g })
  out['hook|ble|unchecked'] = hook({ enabled: true, ready: true, kind: 'ble', status: { connected: false, detail: 'The printer connection could not be checked' },
    __after: { status: { connected: false, detail: { code: 'statusUnchecked' } } } })
  out['hook|ble|idle'] = hook({ enabled: true, ready: true, kind: 'ble' })
  return out
}

module.exports = { views }
