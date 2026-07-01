// Native push registration (Package 5, device side). Follows the repo pattern: dynamic import guarded by
// isNativePlatform, no-op on web.
//
// ⚠️ CANNOT BE VALIDATED WITHOUT: the Push Notifications capability/entitlement on the iOS app, the APNs
// cert (.p8) on the server, and a physical device. On the simulator APNs registration does not deliver a
// real token. Build-complete here; smoke-test on device in the paid-account phase.
import { Capacitor } from '@capacitor/core'
import { saveDeviceConfig } from './device'

/**
 * Request push permission, register with APNs, and attach the resulting device token to THIS device's
 * van_devices row (via /api/native/bind-device). Also wires the tap handler → deep-link to the pending
 * order. Safe no-op on web. Call once the device is bound to a van (Package 3).
 */
export async function registerForPush(token: string, onOpenOrder?: (orderKey: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    // APNs token → persist to this device's row so the server push path can target it.
    PushNotifications.addListener('registration', (t: { value: string }) => {
      void saveDeviceConfig(token, { push_token: t.value })
    })
    PushNotifications.addListener('registrationError', (err: unknown) => {
      console.warn('[push] registration error:', err)
    })
    // Tapped a notification (app was background/closed) → deep-link into the pending order.
    PushNotifications.addListener('pushNotificationActionPerformed', (action: { notification: { data?: Record<string, unknown> } }) => {
      const data = action?.notification?.data
      const orderKey = data && typeof data.orderKey === 'string' ? data.orderKey : null
      if (orderKey && onOpenOrder) onOpenOrder(orderKey)
    })

    await PushNotifications.register()
  } catch (e) {
    console.warn('[push] register failed:', (e as Error).message)
  }
}
