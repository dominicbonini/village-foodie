import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { playDing } from '@/lib/audio'

// Device-local notification prefs (Capacitor Preferences). master = OS permission granted + master on;
// offline = the offline/paused LOCAL-alert type (default ON); neworder = mirrors van_devices.notify_enabled
// (the server PUSH — needs a connection + APNs config) for the Settings toggle's UI state.
export const NOTIFY_KEYS = { master: 'hg_notify_master', offline: 'hg_notify_offline', neworder: 'hg_notify_neworder' } as const

async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  return LocalNotifications
}

export async function requestNotificationPermission(): Promise<boolean> {
  const plugin = await getPlugin()
  if (!plugin) return false
  const result = await plugin.requestPermissions()
  return result.display === 'granted'
}

/** Fire a LOCAL (device-generated) notification — works OFFLINE (no server). No-op on web. */
export async function notifyLocal(title: string, body: string): Promise<void> {
  const plugin = await getPlugin()
  if (!plugin) return
  try {
    await plugin.schedule({
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
  const plugin = await getPlugin()
  if (!plugin) {
    // Fallback — play a beep via Web Audio API
    playWebBeep()
    return
  }
  await plugin.schedule({
    notifications: [{
      id: Date.now(),
      title: 'New order',
      body: `Order ${orderNumber} received`,
      sound: 'default',
      smallIcon: 'ic_launcher',
      actionTypeId: '',
      extra: null,
    }]
  })
}

export async function notifyNewOrder(count: number) {
  const plugin = await getPlugin()
  if (!plugin) return
  try {
    await plugin.requestPermissions()
    await plugin.schedule({
      notifications: [{
        id: Date.now(),
        title: 'New order',
        body: count === 1 ? 'You have a new order' : `You have ${count} new orders`,
        sound: 'beep.wav',
        actionTypeId: '',
        extra: null,
      }]
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
