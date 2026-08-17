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
// ── 🔴 ONE ATTACH PER JS CONTEXT, AND THE GUARD IS NOW SYNCHRONOUS ─────────────────────────────────
// WHAT WAS WRONG: the guard was a boolean CHECKED after `await import(...)` and SET after
// `await Promise.all([...])`. Every call that reached the check before any one of them set the flag
// attached its own full set — and `registerForPush` was being called from an effect whose dependency
// chain was unstable, so it ran on every dashboard render. Six listener sets turned ONE notification tap
// into SIX identical toasts, stacked over the Confirm and Reject buttons.
//
// 🔴 THE FIX IS A HELD PROMISE, NOT A BOOLEAN, AND THAT IS WHY IT CANNOT INTERLEAVE. `attachPromise` is
// ASSIGNED SYNCHRONOUSLY, in the same tick as the test that reads it — there is no `await` between
// `if (!attachPromise)` and `attachPromise = attachListeners()`, so JavaScript's single-threaded run-to-
// completion guarantees no second caller can observe it null. Every subsequent call AWAITS THE SAME
// PROMISE instead of starting a second attach. A boolean set after an await can be raced; a promise
// assigned before one cannot.
//
// ⚠️ THE OLD COMMENT CALLED THE RACE HARMLESS, AND IT WAS WRONG BY THE TIME IT MATTERED. That reasoning
// was scoped to the `registration` listener, whose handler is an idempotent upsert — two of them write
// the same token twice and nothing notices. It was written when the TAP callback was still dead
// (`onOpenOrder` had no caller), so nobody weighed a non-idempotent handler. A tap handler is not an
// upsert: N listeners produce N navigations and N toasts.
let attachPromise: Promise<void> | null = null
// The handles, kept so they can actually be removed. `addListener` returns one per listener and they were
// previously fed straight into Promise.all and discarded — nothing in this file could detach anything.
let attachedHandles: Array<{ remove: () => void }> = []
// 🔴 THE LIVE TAP HANDLER, HELD IN MODULE STATE RATHER THAN CAPTURED IN THE LISTENER'S CLOSURE. The
// listener is attached ONCE and reads this on every press, so the newest mount's callback is always the
// one that runs and a stale closure over an unmounted screen is structurally impossible. It also means a
// changed callback costs no re-attach — which is what lets the effect depend on `token` alone.
let currentOnOpenOrder: ((orderKey: string) => void) | undefined

// -- THE ANDROID NOTIFICATION CHANNEL. ONE ID, AND IT IS DECLARED IN THREE PLACES THAT MUST AGREE. --
// Android 8+ routes every notification through a channel, and a channel the app has not created is
// supplied by the FCM SDK as an unnamed fallback. It still ARRIVES — that part was never broken — but
// everything the operator can control belongs to that fallback: importance, sound, vibration, whether it
// can bypass Do Not Disturb. CHANNEL IMPORTANCE OVERRIDES MESSAGE PRIORITY, so `priority: 'high'` in
// lib/fcm.ts was being demoted by a channel nobody chose, and an operator muting an unrecognised
// "Miscellaneous" entry would silence their order alerts with no way to connect the two.
//
// THE THREE PLACES, AND ALL THREE USE THIS CONSTANT OR ITS LITERAL VALUE:
//   1. here — created at registration time, so the channel exists before any notification can arrive;
//   2. lib/fcm.ts — `android.notification.channel_id`, so our own sends target it explicitly;
//   3. android/app/src/main/res/values/strings.xml + AndroidManifest.xml's
//      com.google.firebase.messaging.default_notification_channel_id — the fallback for anything that
//      arrives WITHOUT a channel_id, which is what stops the SDK inventing one.
// ⚠️ CHANGING THIS STRING ORPHANS THE OLD CHANNEL RATHER THAN RENAMING IT. Android keys user settings on
// the id, so a new id arrives at default importance with the operator's tuning lost. It is not a value to
// tidy.
export const ORDER_CHANNEL_ID = 'hg_orders'

/**
 * Stop routing taps to a handler that is going away, and drop the plugin listeners.
 *
 * 🔴 THE HANDLER IS CLEARED UNCONDITIONALLY; THE LISTENERS ARE ONLY REMOVED WHEN ASKED. A dashboard
 * unmount must stop its own callback firing — that is the leak this closes — but tearing the plugin
 * listeners down on every unmount would also throw away the `registration` listener, and a token
 * delivered while nothing is listening is GONE (no queue, no replay — see the note below). So the
 * default is the cheap, correct half.
 *
 * @param full also remove the plugin listeners and allow a fresh attach. For teardown, not for a remount.
 */
export function releasePushHandlers(full = false): void {
  currentOnOpenOrder = undefined
  if (!full) return
  for (const h of attachedHandles) { try { h.remove() } catch { /* already gone */ } }
  attachedHandles = []
  attachPromise = null
}

/**
 * Request push permission, register with APNs, and attach the resulting device token to THIS device's
 * van_devices row (via /api/native/bind-device). Also wires the tap handler → deep-link to the pending
 * order. Safe no-op on web. Call once the device is bound to a van (Package 3).
 */
export async function registerForPush(token: string, onOpenOrder?: (orderKey: string) => void): Promise<void> {
  // 🔴 SET SYNCHRONOUSLY, BEFORE ANY AWAIT, so the attached listener is pointing at the newest handler
  // even if the attach below is already in flight or long finished.
  currentOnOpenOrder = onOpenOrder
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
    // 🔴 SINGLE-FLIGHT. The test and the assignment are in one synchronous step — see the note on
    // `attachPromise` above — so N concurrent callers produce exactly ONE listener set and the other
    // N-1 await it.
    if (!attachPromise) {
      attachPromise = (async () => {
        const handles = await Promise.all([
          // FCM/APNs token → persist to this device's row so the server push path can target it.
          PushNotifications.addListener('registration', (t: { value: string }) => {
            void saveDeviceConfig(token, { push_token: t.value })
          }),
          PushNotifications.addListener('registrationError', (err: unknown) => {
            console.warn('[push] registration error:', err)
          }),
          // Tapped a notification (app was background/closed) → deep-link into the pending order. Attached
          // here too: a tap that LAUNCHES the app can fire this before any later attach point is reached.
          // 🔴 IT CALLS `currentOnOpenOrder`, NOT A CAPTURED ARGUMENT. One listener, always the newest
          // handler — which is what makes N mounts produce N-times-nothing instead of N navigations.
          PushNotifications.addListener('pushNotificationActionPerformed', (action: { notification: { data?: Record<string, unknown> } }) => {
            const data = action?.notification?.data
            const orderKey = data && typeof data.orderKey === 'string' ? data.orderKey : null
            if (orderKey && currentOnOpenOrder) currentOnOpenOrder(orderKey)
          }),
        ])
        attachedHandles = handles
      })()
      // ⚠️ A FAILED ATTACH MUST NOT LATCH. Clearing the holder on rejection restores the retry the old
      // set-after-success boolean gave us, without restoring its race.
      attachPromise.catch(() => { attachPromise = null })
    }
    await attachPromise

    // -- THE CHANNEL, BEFORE register(). ANDROID ONLY — createChannel is a no-op the plugin does not
    // implement on iOS, so it is guarded rather than called blind. Created BEFORE registration so it
    // exists before the first notification can be delivered; createChannel is idempotent, so the repeat
    // on every launch simply re-asserts the same definition.
    // ⚠️ importance 5 = IMPORTANCE_HIGH — heads-up, with sound. A new order needing confirmation is the
    // one alert this app sends, and it is time-critical at a hatch. `visibility: 1` is VISIBILITY_PUBLIC:
    // the content shows on a lock screen, which is the point of an alert on a counter tablet.
    // ⚠️ A FAILURE HERE MUST NOT STOP REGISTRATION. Without a channel the notification still arrives on
    // the SDK's fallback — worse-looking, not lost — whereas a throw here would skip register() and cost
    // the token.
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: ORDER_CHANNEL_ID,
          name: 'New orders',
          description: 'Alerts when an order needs confirming.',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
          lights: true,
        })
      } catch (chErr) {
        console.warn('[push] createChannel failed — notifications will use the SDK fallback channel:', (chErr as Error).message)
      }
    }

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    await PushNotifications.register()
  } catch (e) {
    console.warn('[push] register failed:', (e as Error).message)
  }
}
