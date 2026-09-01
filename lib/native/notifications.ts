import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { playDing } from '@/lib/audio'
import { NOTIFICATION_SMALL_ICON } from '@/lib/native/notificationIcon'

// Device-local notification prefs (Capacitor Preferences). master = OS permission granted + master on;
// offline = the offline/paused LOCAL-alert type (default ON); neworder = mirrors van_devices.notify_enabled
// (the server PUSH — needs a connection + APNs config) for the Settings toggle's UI state.
export const NOTIFY_KEYS = { master: 'hg_notify_master', offline: 'hg_notify_offline', neworder: 'hg_notify_neworder' } as const

// CRITICAL (iOS): NEVER return/await the LocalNotifications PLUGIN OBJECT itself. A Capacitor plugin is a
// Proxy where every property access — including `.then` — routes to a native method call. An `async` fn that
// `return`s the proxy (or `await proxy`) triggers Promise assimilation, which calls `proxy.then(...)` →
// "LocalNotifications.then() is not implemented on ios". So each helper imports the plugin inline and only
// ever awaits a METHOD call (requestPermissions()/schedule()), which returns a real Promise. Web-safe:
// guarded by isNativePlatform() and wrapped in try/catch so a missing plugin never throws to the caller.

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const result = await LocalNotifications.requestPermissions()   // await a METHOD → real Promise
    return result.display === 'granted'
  } catch (err) {
    console.warn('[Notifications] requestPermissions failed:', err)
    return false
  }
}

/** Fire a LOCAL (device-generated) notification — works OFFLINE (no server). No-op on web / on failure. */
export async function notifyLocal(title: string, body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.schedule({
      notifications: [{ id: Date.now() % 2147483647, title, body, sound: 'default', smallIcon: NOTIFICATION_SMALL_ICON, actionTypeId: '', extra: null }],
    })
  } catch (err) { console.warn('[Notifications] notifyLocal failed:', err) }
}

/** Offline/paused LOCAL alerts enabled? master ON AND the offline-type toggle not explicitly off (default ON). */
export async function offlineAlertsEnabled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  // Both reads were previously UNCAUGHT — a rejection propagated to callers that have no handler, i.e. an
  // unhandled promise rejection. That is a JS-side failure a catch genuinely DOES handle (bridge
  // call.reject, or the plugin proxy failing), unlike a native throw, which no JS catch can reach
  // (Bridge.java:848-851 — see the note in keepAwake.ts). FAIL CLOSED: if we cannot read the prefs we do not
  // know the operator opted in, and firing an unwanted alert is worse than missing one.
  try {
    const master = (await Preferences.get({ key: NOTIFY_KEYS.master })).value === 'true'
    if (!master) return false
    return (await Preferences.get({ key: NOTIFY_KEYS.offline })).value !== 'false'   // default ON
  } catch (err) {
    console.warn('[Notifications] offlineAlertsEnabled pref read failed — treating as disabled:', err)
    return false
  }
}

export async function playNewOrderAlert(orderNumber: string) {
  if (!Capacitor.isNativePlatform()) { playWebBeep(); return }   // Web fallback — beep via Web Audio API
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.schedule({
      notifications: [{ id: Date.now() % 2147483647, title: 'New order', body: `Order ${orderNumber} received`, sound: 'default', smallIcon: NOTIFICATION_SMALL_ICON, actionTypeId: '', extra: null }],
    })
  } catch (err) { console.warn('[Notifications] playNewOrderAlert failed:', err); playWebBeep() }
}

export async function notifyNewOrder(count: number) {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.requestPermissions()
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now() % 2147483647,
        title: 'New order',
        body: count === 1 ? 'You have a new order' : `You have ${count} new orders`,
        // 🔴 `sound: 'beep.wav'` REMOVED — IT NAMED A FILE THAT HAS NEVER EXISTED IN THIS REPOSITORY.
        // There is no beep.wav, no res/raw/ directory, and no audio asset of any kind anywhere outside
        // node_modules. The built APK's resource table confirms it: ZERO `raw/` resources.
        // ⚠️ IT WAS INERT TWICE OVER, WHICH IS WHY NOBODY NOTICED IT WAS MISSING. (1) The plugin strips
        // the extension and resolves the base name as a RAW RESOURCE — getResourceBaseName('beep.wav')
        // gives 'beep', then getIdentifier('beep','raw',pkg) gives 0 — so getSound() falls through to the
        // config default, which resolves the same way and is also 0, returns null, and
        // LocalNotificationManager:203 calls setDefaults(DEFAULT_ALL). A SILENT fallback: no throw, no
        // log, no rejected call. (2) Even a real file would not have been heard here: every helper in
        // this module posts to the plugin's 'default' channel (none passes channelId), and on Android 8+
        // the CHANNEL's sound overrides anything set per-notification. A channel's sound also cannot be
        // changed after creation, so shipping the asset later would not retrofit an installed device.
        // 🔴 SO DO NOT RE-ADD A SOUND HERE. A custom alert tone belongs on the CHANNEL, alongside a real
        // asset in res/raw/ — not on the notification. Omitting the key is what selects the system
        // default, which is exactly what was already playing.
        actionTypeId: '',
        extra: null,
        smallIcon: NOTIFICATION_SMALL_ICON,
      }],
    })
  } catch (err) {
    console.warn('[Notifications] Failed:', err)
  }
}

// Web fallback (non-native) — use the SHARED primed AudioContext (lib/audio) so the ding actually
// plays. A fresh `new AudioContext()` here was suspended-by-autoplay-policy and silently blocked.
function playWebBeep() {
  playDing(880, 0.3, 0.3)
}
