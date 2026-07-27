// Native push registration (Package 5, device side). Follows the repo pattern: dynamic import guarded by
// isNativePlatform, no-op on web.
//
// ⚠️ CANNOT BE VALIDATED WITHOUT: the Push Notifications capability/entitlement on the iOS app, the APNs
// cert (.p8) on the server, and a physical device. On the simulator APNs registration does not deliver a
// real token. Build-complete here; smoke-test on device in the paid-account phase.
import { Capacitor } from '@capacitor/core'
import { saveDeviceConfig } from './device'

// Module-level, i.e. one per JS context (= one per page load in the WebView). registerForPush is called
// from THREE sites in components/native/OperatorDeviceConfig.tsx (:43 already-configured, :49 single-van
// auto-bind, :69 card save) and runSetup can re-run (the Retry button, or a remount), so without this the
// listeners would stack a duplicate set on every call.
// SET AFTER a successful attach, deliberately, NOT before: if attaching throws, the flag stays false and
// the next call retries. The alternative (set-first) would permanently lock out a device whose first
// attach failed — it would then call register() with no listener and drop the token silently, which is
// exactly the bug this file is fixing. The cost of set-after is a theoretical concurrent double-attach,
// which is harmless: two listeners both call saveDeviceConfig with the same token, and that write is an
// idempotent upsert.
let listenersAttached = false

/**
 * Request push permission, register with APNs, and attach the resulting device token to THIS device's
 * van_devices row (via /api/native/bind-device). Also wires the tap handler → deep-link to the pending
 * order. Safe no-op on web. Call once the device is bound to a van (Package 3).
 */
export async function registerForPush(token: string, onOpenOrder?: (orderKey: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  // ⚠️ INVARIANT (still true, do not delete): A JS try/catch CANNOT protect against a NATIVE throw from a
  // Capacitor plugin. On Android, @capacitor/push-notifications is FCM-backed: with no valid Firebase
  // config, PushNotificationsPlugin.register() (PushNotificationsPlugin.java:103) calls
  // FirebaseMessaging.getInstance(), which throws IllegalStateException "Default FirebaseApp is not
  // initialized" INSIDE THE BRIDGE, before control returns to JS — so the catch below never runs and the app
  // PROCESS DIES (confirmed in logcat 2026-07-27, reproduced twice, PIDs 8344/8584). THE PLATFORMS ARE NOT
  // SYMMETRIC: iOS is safe because an unconfigured APNs sender merely no-ops (registration never yields a
  // token); FCM hard-fails.
  //
  // The temporary Android early-return that stood here was REMOVED on 2026-07-27 once Firebase was
  // configured: android/app/google-services.json exists with package_name "com.hatchgrab.app", matching
  // capacitor.config.ts appId and android/app/build.gradle applicationId+namespace. That match is the actual
  // precondition — the google-services Gradle plugin generates the google_app_id resource FirebaseApp
  // auto-initialises from, and a package mismatch is the realistic way to get the crash back.
  //
  // ⚠️ THERE IS NO JS-SIDE PROTECTION FOR THIS. It is not defended; it is made not-arise. If
  // google-services.json is deleted, replaced with another project's file, or the applicationId changes,
  // the crash returns at first launch and NOTHING in this file can stop it. Guard it at BUILD time (keep
  // the file committed; keep applicationId and package_name equal), never by adding a catch here.
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // ⚠️ LISTENERS FIRST — AND AWAITED — BEFORE requestPermissions() AND BEFORE register().
    // A Capacitor plugin event FIRES WHETHER OR NOT ANYONE IS LISTENING. The native side keeps a listener
    // map; notifyListeners() with an empty map logs "No listeners found for event <name>" and DROPS the
    // payload. There is no queue and no replay — a token delivered to nobody is gone.
    // THE BUG THIS FIXES (Android emulator, deployed build dpl_2MJdE35s…, logcat):
    //     Capacitor/PushNotificationsPlugin  V  Notifying listeners for event registration
    //     Capacitor/PushNotificationsPlugin  D  No listeners found for event registration
    // Registration SUCCEEDED — Firebase initialised, FCM returned a token — and the token was discarded,
    // leaving van_devices.push_token null. Previously `await requestPermissions()` sat BETWEEN the plugin
    // becoming available and the listeners being attached, and the three addListener() calls were not
    // awaited, so their native-side registration was not guaranteed to have completed before register()
    // ran. FCM CACHES THE TOKEN, so on any relaunch register() resolves almost immediately and the event
    // fires effectively synchronously — the listener loses the race deterministically, not occasionally.
    // A first-ever install (no cached token, a real network round-trip) probably wins it, which is exactly
    // what makes this the kind of bug that looks intermittent and "works on my machine".
    // SAME FAMILY AS the manual's "wiring is not data flow": every layer existed and every layer was
    // correct — permission, registration, listener, save, endpoint, column — and the event had no
    // receiver at the instant it fired. Do not reorder these back above the awaits.
    if (!listenersAttached) {
      await Promise.all([
        // FCM/APNs token → persist to this device's row so the server push path can target it.
        PushNotifications.addListener('registration', (t: { value: string }) => {
          void saveDeviceConfig(token, { push_token: t.value })
        }),
        PushNotifications.addListener('registrationError', (err: unknown) => {
          console.warn('[push] registration error:', err)
        }),
        // Tapped a notification (app was background/closed) → deep-link into the pending order. Attached
        // here too: a tap that LAUNCHES the app can fire this before any later attach point is reached.
        PushNotifications.addListener('pushNotificationActionPerformed', (action: { notification: { data?: Record<string, unknown> } }) => {
          const data = action?.notification?.data
          const orderKey = data && typeof data.orderKey === 'string' ? data.orderKey : null
          if (orderKey && onOpenOrder) onOpenOrder(orderKey)
        }),
      ])
      listenersAttached = true
    }

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    await PushNotifications.register()
  } catch (e) {
    console.warn('[push] register failed:', (e as Error).message)
  }
}
