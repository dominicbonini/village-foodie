// scripts/_lp1b-native.cjs — Language Phase 1b, the NATIVE area (run by scripts/language-phase-1b.cjs; see its header).
const fs = require('fs'); const path = require('path')   // Phase 1b: does lib/native/deviceSaveText.ts exist (AFTER) or not (BEFORE)
// The native shell's words, for a GB and a US truck:
//   • components/native — OperatorDeviceConfig (the setup gate: fetch failed / no van / picker / saving / save
//     failed, and "This device" in every row and the PIN setup), OfflineBanner (offline 0/1/n, syncing, synced,
//     still-queued, payment and status conflicts — named, overflowing, unresolved — and the confirm step),
//     AppLockGate (locked, verifying, the PIN escape, wrong PIN, checking), NotificationSettings (off, on, the
//     refusal notice), VanMenuChooser (load failed, one van, several, select, switch failed) — as full HTML;
//   • lib/native — what reaches the OS: the biometric prompt's options, the Android channel, the local
//     notifications' title/body (plugins stubbed and their arguments recorded); the device-save sentences;
//     the conflict-order naming; the shared post-gate handler's queued toasts;
//   • PUSH — lib/apns.ts and lib/fcm.ts called with the network stubbed (node:http2 and fetch) and fresh
//     throwaway keys: the exact APNs body and FCM message for a GB and a US order (signatures excluded — they
//     are random by design).
// Codes in state (AFTER only): DeviceSetupGate's `saveError` holds a code — fixtures hold BEFORE's sentence and
// `__after` the code, so the card is proven to render exactly the sentence it held.
const crypto = require('crypto')

const CAP_CORE = `export const Capacitor = { isNativePlatform: () => globalThis.__native !== false, getPlatform: () => globalThis.__platform || 'ios', isPluginAvailable: () => true, Plugins: {} }
export class WebPlugin { addListener() { return Promise.resolve({ remove() {} }) } }
export function registerPlugin() { return new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : async () => ({ remove() {} })) }) }`
const PREFS = `const m = () => (globalThis.__prefs ||= {})
export const Preferences = { async get({ key }) { return { value: m()[key] ?? null } }, async set({ key, value }) { m()[key] = value }, async remove({ key }) { delete m()[key] } }`
const rec = (name, fn) => `(globalThis.__plug ||= []).push([${JSON.stringify(name)}, JSON.parse(JSON.stringify(${fn}))])`
const BIO = `export const BiometricAuth = { async checkBiometry() { return { isAvailable: true } }, async authenticate(o) { ${rec('authenticate', 'o')} } }`
const LOCALN = `export const LocalNotifications = { async requestPermissions() { return { display: 'granted' } }, async schedule(o) { ${rec('schedule', 'o.notifications.map(n => ({ title: n.title, body: n.body }))')} } }`
const PUSHN = `export const PushNotifications = { async addListener() { return { remove() {} } }, async createChannel(o) { ${rec('createChannel', 'o')} }, async requestPermissions() { return { receive: 'denied' } }, async register() {} }`
const STUBS = { '@capacitor/core': CAP_CORE, '@capacitor/preferences': PREFS, '@aparajita/capacitor-biometric-auth': BIO, '@capacitor/local-notifications': LOCALN, '@capacitor/push-notifications': PUSHN }

module.exports.views = async function views(ctx) {
  const { kit, h, html, AFTER } = ctx
  const out = {}
  const i18n = AFTER ? `export { I18nContext } from '@/lib/i18n/use-t'\n` : ''
  const wrap = (m, cc, el) => (m.I18nContext ? h(m.I18nContext.Provider, { value: { locale: cc === 'US' ? 'en-US' : 'en-GB', setLocale() {} } }, el) : el)

  // ══ 1 · the components ══════════════════════════════════════════════════════════════════════════════════
  const C = await kit.bundle('native-components', `export * from '@/components/native/OperatorDeviceConfig'
export { OfflineBanner } from '@/components/native/OfflineBanner'
export { AppLockGate } from '@/components/native/AppLockGate'
export { NotificationSettings } from '@/components/native/NotificationSettings'
export { VanMenuChooser } from '@/components/native/VanMenuChooser'
export { AppLink } from '@/components/native/AppLink'
export { DashboardIndexNativeFallback } from '@/components/native/DashboardIndexNativeFallback'
${i18n}`, {
    stubs: STUBS,
    patches: [
      { file: 'components/native/OperatorDeviceConfig.tsx', states: ['loading', 'fetchError', 'needsSetup', 'dismissed', 'vans', 'screen', 'vanId', 'saving', 'saveError',
        'cfg', 'truckName', 'appLock', 'bioAvailable', 'pinSetup', 'newPin', 'confirmPin', 'pinSetupErr', 'myTrucks', 'switching', 'patchError'] },
      { file: 'components/native/OfflineBanner.tsx', states: ['phase', 'queued', 'lastSynced', 'confirming'] },
      { file: 'components/native/AppLockGate.tsx', states: ['locked', 'verifying', 'fails', 'showPin', 'pin', 'pinError', 'pinChecking'] },
      { file: 'components/native/NotificationSettings.tsx', states: ['ready', 'master', 'offlineAlerts', 'newOrder', 'notice'] },
      { file: 'components/native/VanMenuChooser.tsx', states: ['vans', 'vanId', 'ready', 'loadError', 'switching', 'switchError'] },
    ],
  })
  const VANS = [{ id: 'v1', name: 'Van 1' }, { id: 'v2', name: 'Van 2' }]
  const NET = 'Couldn’t reach the server — check the connection and try again.'
  const SRV = 'Couldn’t save that just now. Please try again.'
  const CFG = { id: 'd1', truck_id: 't1', van_id: 'v1', device_id: 'dev', push_token: null, platform: 'ios', default_screen: 'kds', notify_enabled: true }
  const conflict = (n, kind, key) => ({ op_id: `op-${n}`, kind, order_key: key ?? `k${n}`, provisional_id: '' })
  const labels = { k1: '#12', k2: '#14', k3: '#15', k4: '#16', k5: '#17' }
  const resolveLabel = c => labels[c.order_key] ?? null
  for (const cc of ['GB', 'US']) {
    const r = (k, st, el) => { out[`${cc}|${k}`] = html(st, wrap(C, cc, el)) }
    const gate = h(C.DeviceSetupGate, { token: 'harness' })
    r('gate|fetchError', { loading: false, fetchError: true }, gate)
    r('gate|noVan', { loading: false, needsSetup: true, vans: [] }, gate)
    r('gate|picker', { loading: false, needsSetup: true, vans: VANS, vanId: '', screen: 'dashboard' }, gate)
    r('gate|pickerKds', { loading: false, needsSetup: true, vans: VANS, vanId: 'v2', screen: 'kds' }, gate)
    r('gate|saving', { loading: false, needsSetup: true, vans: VANS, vanId: 'v1', saving: true }, gate)
    r('gate|saveFailedServer', { loading: false, needsSetup: true, vans: VANS, vanId: 'v1', saveError: SRV, __after: { saveError: 'deviceSave.server' } }, gate)
    r('gate|saveFailedNetwork', { loading: false, needsSetup: true, vans: VANS, vanId: 'v1', saveError: NET, __after: { saveError: 'deviceSave.network' } }, gate)
    const dev = h(C.ThisDeviceSettings, { token: 'harness' })
    r('device|bare', {}, dev)
    r('device|full', { cfg: CFG, vans: VANS, truckName: 'Pizza Kitchen', myTrucks: [{ truck_id: 't1', name: 'Pizza Kitchen' }, { truck_id: 't2', name: 'Pasta Van' }], appLock: true, bioAvailable: false }, dev)
    r('device|patchError', { cfg: CFG, vans: VANS, truckName: 'Pizza Kitchen', patchError: `Default screen didn’t save. ${SRV}` }, dev)
    r('device|pinSetup', { cfg: CFG, truckName: 'Pizza Kitchen', pinSetup: true, newPin: '12', confirmPin: '', pinSetupErr: 'Use at least 4 digits.' }, dev)
    r('device|pinMismatch', { cfg: CFG, truckName: 'Pizza Kitchen', pinSetup: true, newPin: '1234', confirmPin: '1235', pinSetupErr: 'PINs don’t match.' }, dev)
    const banner = (conflicts) => h(C.OfflineBanner, { conflicts, resolveLabel, onAcknowledge() {}, onSynced() {} })
    r('banner|offline0', { phase: 'offline', queued: 0 }, banner([]))
    r('banner|offline1', { phase: 'offline', queued: 1 }, banner([]))
    r('banner|offline3', { phase: 'offline', queued: 3 }, banner([]))
    r('banner|syncing1', { phase: 'syncing', queued: 1 }, banner([]))
    r('banner|syncing2', { phase: 'syncing', queued: 2 }, banner([]))
    r('banner|synced', { phase: 'synced', lastSynced: 2 }, banner([]))
    r('banner|stillQueued1', { phase: 'online', queued: 1 }, banner([]))
    r('banner|stillQueued4', { phase: 'online', queued: 4 }, banner([]))
    r('banner|online', { phase: 'online', queued: 0 }, banner([]))
    r('banner|payment1', { phase: 'online' }, banner([conflict(1, 'payment', 'k1')]))
    r('banner|paymentMany', { phase: 'online' }, banner([1, 2, 3, 4, 5].map(n => conflict(n, 'payment', `k${n}`)).concat([conflict(9, 'payment', 'kx')])))
    r('banner|paymentConfirm', { phase: 'online', confirming: true }, banner([conflict(1, 'payment', 'k1'), conflict(2, 'payment', 'k2')]))
    r('banner|statusUnresolved1', { phase: 'offline', queued: 2 }, banner([conflict(7, 'status', 'zz')]))
    r('banner|statusUnresolved2', { phase: 'online' }, banner([conflict(7, 'status', 'zz'), conflict(8, 'status', 'zy')]))
    r('banner|both', { phase: 'online' }, banner([conflict(1, 'payment', 'k1'), conflict(2, 'status', 'k2'), conflict(3, 'status', 'q')]))
    // AppLockGate reads the lock setting from localStorage — present only for its render.
    const lock = h(C.AppLockGate)
    const withLock = fn => { globalThis.window = {}; globalThis.localStorage = { getItem: k => (k === 'hg_app_lock' ? 'on' : null), setItem() {} }; try { return fn() } finally { delete globalThis.window; delete globalThis.localStorage } }
    withLock(() => {
      r('lock|locked', {}, lock)
      r('lock|verifying', { verifying: true }, lock)
      r('lock|pinOffered', { fails: 2 }, lock)
      r('lock|pinWrong', { showPin: true, pin: '', pinError: true }, lock)
      r('lock|pinChecking', { showPin: true, pin: '1234', pinChecking: true }, lock)
    })
    const notif = h(C.NotificationSettings, { token: 'harness' })
    r('notify|off', { ready: true, master: false }, notif)
    r('notify|on', { ready: true, master: true, newOrder: true, offlineAlerts: false }, notif)
    r('notify|refused', { ready: true, master: false, notice: 'Notifications need to be enabled in your device Settings to turn this on.' }, notif)
    const van = h(C.VanMenuChooser, { token: 'harness' })
    r('van|loadError', { ready: true, loadError: true }, van)
    r('van|single', { ready: true, vans: [VANS[0]], vanId: 'v1' }, van)
    r('van|none', { ready: true, vans: [], vanId: null }, van)
    r('van|multi', { ready: true, vans: VANS, vanId: 'v2' }, van)
    r('van|unbound', { ready: true, vans: VANS, vanId: null }, van)
    r('van|switchFailed', { ready: true, vans: VANS, vanId: 'v1', switchError: NET }, van)
    r('appLink', {}, h(C.AppLink, { href: '/dashboard/x', title: 'Back' }, 'Dashboard'))
    r('indexFallback', {}, h(C.DashboardIndexNativeFallback))
  }

  // ══ 2 · lib/native — what reaches the OS, and the shared sentences ══════════════════════════════════════
  const L = await kit.bundle('native-lib', `export * as appLock from '@/lib/native/appLock'
export * as notifications from '@/lib/native/notifications'
export * as push from '@/lib/native/push'
export * as device from '@/lib/native/device'${fs.existsSync(path.join(ctx.REPO, 'lib/native/deviceSaveText.ts')) ? "\nexport * as deviceText from '@/lib/native/deviceSaveText'" : ''}
export * as conflicts from '@/lib/native/useOutboxConflicts'
export { useGatedActionResult } from '@/lib/native/useGatedActionResult'
${i18n}`, { stubs: STUBS })
  for (const cc of ['GB', 'US']) {
    const loc = cc === 'US' ? 'en-US' : 'en-GB'
    const plug = async fn => { globalThis.__plug = []; await kit.quietAsync(fn); return globalThis.__plug }
    out[`${cc}|lib|verifyIdentity`] = await plug(() => L.appLock.verifyIdentity(undefined, loc))
    out[`${cc}|lib|verifyIdentityReason`] = await plug(() => L.appLock.verifyIdentity('Confirm to enable app lock', loc))
    globalThis.__platform = 'android'
    out[`${cc}|lib|pushChannel`] = await plug(() => L.push.registerForPush('harness', undefined, loc))
    globalThis.__platform = 'ios'
    out[`${cc}|lib|notifyNewOrder1`] = await plug(() => L.notifications.notifyNewOrder(1, loc))
    out[`${cc}|lib|notifyNewOrder3`] = await plug(() => L.notifications.notifyNewOrder(3, loc))
    out[`${cc}|lib|playNewOrderAlert`] = await plug(() => L.notifications.playNewOrderAlert('#12', loc))
    // saveFailureMessage moved to lib/native/deviceSaveText.ts in Phase 1b (device.ts is in every bundle); same function.
    const sfm = (L.deviceText || L.device).saveFailureMessage
    out[`${cc}|lib|saveFailure`] = [sfm({ ok: false, status: null, reason: null, networkError: true }, loc),
      sfm({ ok: false, status: 400, reason: 'x', networkError: false }, loc)]
    const named = (list, limit) => L.conflicts.nameConflictOrders(list, resolveLabel, limit, loc)
    out[`${cc}|lib|nameConflicts`] = [
      named([conflict(1, 'payment', 'k1')]), named([conflict(1, 'payment', 'k1'), conflict(2, 'payment', 'k1')]),
      named([1, 2, 3, 4, 5].map(n => conflict(n, 'status', `k${n}`))), named([1, 2, 3, 4, 5].map(n => conflict(n, 'status', `k${n}`)), 2),
      named([conflict(7, 'status', 'zz')]), named([conflict(7, 'status', 'zz'), conflict(8, 'status', 'zy')]),
      named([conflict(1, 'status', 'k1'), conflict(7, 'status', 'zz'), conflict(8, 'status', 'zy')]), named([]),
    ]
    // The shared post-gate handler's QUEUED branch (the online branches are exercised on the KDS, area kds).
    const toasts = []
    let handle = null
    const Probe = () => {
      handle = L.useGatedActionResult({
        showToast: (msg, type, opts) => { toasts.push({ msg: typeof msg === 'string' ? msg : kit.renderStatic(msg), type: type ?? null, action: opts?.action?.label ?? null, duration: opts?.duration ?? null }); return 1 },
        findOrder: k => (k === 'k1' ? { order_key: 'k1', id: 12 } : undefined),
        refreshPendingStatus() {}, dropOverlayEntry() {}, scheduleReadyEmail() {}, undoReady() {}, runAction() {}, refetch() {}, setActionLoading() {},
      })
      return null
    }
    html({}, wrap(L, cc, h(Probe)))
    for (const a of ['ready', 'collected', 'confirm', 'mark_paid']) await handle({ queued: true }, a, 'k1')
    await handle({ queued: true }, 'confirm', 'unknown')
    out[`${cc}|lib|gateQueued`] = toasts
  }

  // ══ 3 · PUSH — APNs and FCM, network stubbed ════════════════════════════════════════════════════════════
  const sent = []
  const HTTP2 = `export default { connect(host) {
  const client = { on() { return client }, close() {}, request(headers) {
    const hs = {}; const req = { on(ev, cb) { (hs[ev] ||= []).push(cb); return req }, end(body) {
      const h = { ...headers }; delete h.authorization
      ;(globalThis.__sent ||= []).push({ via: 'apns', host, headers: h, body: JSON.parse(body) })
      setImmediate(() => { (hs.response || []).forEach(f => f({ ':status': 200, 'apns-id': 'id' })); (hs.end || []).forEach(f => f()) })
    } }
    return req } }
  return client } }`
  const P = await kit.bundle('push', `export * as apns from '@/lib/apns'\nexport * as fcm from '@/lib/fcm'`, { stubs: { 'node:http2': HTTP2 } })
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' })
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })
  const ENV = { APNS_KEY_ID: 'HARNESSKEY', APNS_TEAM_ID: 'HARNESSTEAM', APNS_BUNDLE_ID: 'com.hatchgrab.harness', APNS_KEY: ec,
    FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'harness-project', client_email: 'harness@example.test', private_key: rsa, token_uri: 'http://127.0.0.1:9/token' }) }
  const saved = Object.fromEntries(Object.keys(ENV).concat('APNS_ENV').map(k => [k, process.env[k]]))
  Object.assign(process.env, ENV); delete process.env.APNS_ENV
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'harness-access', expires_in: 3600 }) }
    const h = { ...(init.headers || {}) }; delete h.authorization
    ;(globalThis.__sent ||= []).push({ via: 'fcm', url, headers: h, body: JSON.parse(init.body) })
    return { ok: true, status: 200, json: async () => ({ name: 'projects/harness-project/messages/1' }) }
  }
  try {
    for (const cc of ['GB', 'US']) {
      const loc = cc === 'US' ? 'en-US' : 'en-GB'
      for (const [k, payload] of [['order', { orderKey: ctx[cc].ORDERS.asap.order_key, orderNumber: 52, truckName: 'Pizza Kitchen' }],
        ['orderString', { orderKey: 'k', orderNumber: '#7', truckName: 'Sam & Tom’s “Café” <Van>' }]]) {
        globalThis.__sent = []
        const a = await kit.quietAsync(() => P.apns.sendOrderPendingPush(['ios-token-aaaaaa', 'ios-token-bbbbbb'], payload, loc))
        const f = await kit.quietAsync(() => P.fcm.sendOrderPendingPush(['android-token-cccccc'], payload, loc))
        out[`${cc}|push|${k}`] = { apns: a, fcm: f, sent: globalThis.__sent }
      }
    }
  } finally {
    globalThis.fetch = realFetch
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    delete globalThis.__sent
  }
  void sent
  return out
}

// AFTER only: the words no render or call reaches — the strings an EFFECT writes (the offline alert, which only
// fires 8s after a disconnect) and the app-lock reason passed from a checkbox handler.
module.exports.after = async function after(ctx) {
  const { kit, t, AFTER } = ctx
  if (!AFTER) return
  const m = await kit.bundle('native-msgs', `import '@/lib/i18n/catalog/nativeShell'\nexport { translatorFor } from '@/lib/i18n/translator'`)
  for (const loc of ['en-GB', 'en-US']) {
    const tr = m.translatorFor(loc, 'nativeShell')
    const eq = (k, want) => t(`native · ${k} (${loc})`, tr(k) === want, tr(k))
    eq('offlineAlert.pausedTitle', 'Ordering paused')
    eq('offlineAlert.pausedBody', 'You’re offline — customer ordering is paused.'.replace('’', "'"))
    eq('offlineAlert.offlineTitle', "You're offline")
    eq('offlineAlert.offlineBody', 'This device has lost its connection.')
    eq('appLock.confirmEnable', 'Confirm to enable app lock')
  }
}
