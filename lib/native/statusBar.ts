import { Capacitor } from '@capacitor/core'

export async function configureStatusBar() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    console.log('[statusBar] configureStatusBar: native — setting overlay + style')   // TEMP: confirm it fires on cold launch (Safari Web Inspector)
    // OVERLAY the WebView under the status bar — THIS PARAGRAPH DESCRIBES iOS ONLY (it predates Android;
    // see the Android note below, where the OS behaves differently). The immersive-header CSS (AppHeader paddingTop:
    // env(safe-area-inset-top) + viewport-fit=cover + contentInset:'never') assumes the WebView extends under
    // the status bar. Without this the OS RESERVES the status-bar strip (pushes the WebView down) AND the CSS
    // env() padding adds a second inset → a double empty band above the header. With overlay:true the OS stops
    // reserving the strip, so env(safe-area-inset-top) is the SINGLE top inset, filled by the dark header bg.
    //
    // ⚠️ WHAT ACTUALLY WORKS ON ANDROID — do not assume these three behave the same on both platforms.
    // Verified against the INSTALLED plugin source (@capacitor/status-bar 8.0.2), not the docs:
    //   • setOverlaysWebView — INERT on Android 15+. Implemented only with the deprecated
    //     SYSTEM_UI_FLAG_LAYOUT_STABLE|LAYOUT_FULLSCREEN + Window.setStatusBarColor
    //     (android/.../statusbar/StatusBar.java:102-119, every call via a *Deprecated() wrapper); the
    //     typedef says "Not available on Android 15+" (dist/esm/definitions.d.ts:197). KEPT because it is
    //     LOAD-BEARING ON iOS — it is the V8.7 fix that collapsed the double band (ios/.../StatusBar.swift:114
    //     removes the status-bar background view so the WebView extends under the strip).
    //   • setStyle — the ONLY one of the three that still works on Android (StatusBar.java:42-52 →
    //     setAppearanceLightStatusBars, ungated by any API check). Style.Dark = "Light text for dark
    //     backgrounds" (definitions.d.ts:46-52), i.e. LIGHT icons — correct against the navy header.
    //   • setBackgroundColor — REMOVED (was '#354F52'). Verified no-op on Android for API >= 36:
    //     StatusBar.java:66-68 wraps the whole body in shouldSetStatusBarColor(), which returns false
    //     unconditionally for deviceApi > VANILLA_ICE_CREAM (StatusBar.java:121-133) — and that branches on
    //     the DEVICE SDK_INT, so lowering targetSdk would not bring it back. On iOS it had no visible
    //     effect either: setOverlaysWebView(true) above removes the background view it would have coloured
    //     (StatusBar.swift:114-121), and we never set overlay false. The colour itself was stale — a
    //     slate-GREEN matching nothing: the header is HEADER_BG = bg-slate-900 = #0F172A (lib/brand.ts).
    //     The Android strip is now painted by the WINDOW BACKGROUND instead —
    //     android/app/src/main/res/values/styles.xml (AppTheme.NoActionBar → @color/hgHeaderNavy).
    //     (Only hypothetical iOS delta: if anyone ever calls setOverlaysWebView(false), the strip would use
    //     the plugin's default .black (StatusBarConfig.swift:5) rather than the green. Nothing does.)
    //
    // 🚫 DO NOT ADD env(safe-area-inset-top) OR --safe-area-inset-top HANDLING FOR ANDROID.
    // ONLY ONE MECHANISM MAY OWN THE INSET. On Android 15+ Capacitor's core SystemBars plugin has ALREADY
    // padded the WebView's parent down by the status-bar height (@capacitor/android .../plugin/SystemBars.java,
    // the non-passthrough branch) and zeroed the insets it hands the WebView. Adding CSS padding on top of
    // that pads TWICE: a second navy band inside the WebView, BELOW a strip we still would not have filled —
    // exactly the two-band bug V8.7 removed on iOS (where contentInset + the CSS env() padding were both
    // claiming the same inset). AppHeader's paddingTop: env(safe-area-inset-top) is safe precisely BECAUSE
    // env() resolves to 0 there. Note Capacitor 8 injects a CSS CUSTOM PROPERTY (--safe-area-inset-top), NOT
    // env(), so nothing here reads it today. This only becomes relevant on the PASSTHROUGH branch
    // (WebView >= 140 AND viewport-fit=cover), where env() is populated natively and AppHeader already works
    // unchanged — so even then the variable is not needed. Passthrough is UNVERIFIED on our devices.
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: Style.Dark })
    console.log('[statusBar] configureStatusBar: done ✓')                              // TEMP
  } catch (e) {
    console.warn('[statusBar] configureStatusBar FAILED:', e)                          // TEMP: surface a plugin/bridge error
  }
}
