import { Capacitor } from '@capacitor/core'
import { playDing } from '@/lib/audio'

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
