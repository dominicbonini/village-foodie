import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { playDing } from '@/lib/audio'

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
      notifications: [{ id: Date.now() % 2147483647, title, body, sound: 'default', smallIcon: 'ic_launcher', actionTypeId: '', extra: null }],
    })
  } catch (err) { console.warn('[Notifications] notifyLocal failed:', err) }
}

/** Offline/paused LOCAL alerts enabled? master ON AND the offline-type toggle not explicitly off (default ON). */
export async function offlineAlertsEnabled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const master = (await Preferences.get({ key: NOTIFY_KEYS.master })).value === 'true'
  if (!master) return false
  return (await Preferences.get({ key: NOTIFY_KEYS.offline })).value !== 'false'   // default ON
}

export async function playNewOrderAlert(orderNumber: string) {
  if (!Capacitor.isNativePlatform()) { playWebBeep(); return }   // Web fallback — beep via Web Audio API
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.schedule({
      notifications: [{ id: Date.now() % 2147483647, title: 'New order', body: `Order ${orderNumber} received`, sound: 'default', smallIcon: 'ic_launcher', actionTypeId: '', extra: null }],
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
        sound: 'beep.wav',
        actionTypeId: '',
        extra: null,
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
