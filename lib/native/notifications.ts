import { Capacitor } from '@capacitor/core'

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

function playWebBeep() {
  try {
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.3)
  } catch {}
}
