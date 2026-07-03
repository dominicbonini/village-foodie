import { Capacitor } from '@capacitor/core'

export async function configureStatusBar() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    console.log('[statusBar] configureStatusBar: native — setting overlay + style')   // TEMP: confirm it fires on cold launch (Safari Web Inspector)
    // OVERLAY the WebView under the status bar. The immersive-header CSS (AppHeader paddingTop:
    // env(safe-area-inset-top) + viewport-fit=cover + contentInset:'never') assumes the WebView extends under
    // the status bar. Without this the OS RESERVES the status-bar strip (pushes the WebView down) AND the CSS
    // env() padding adds a second inset → a double empty band above the header. With overlay:true the OS stops
    // reserving the strip, so env(safe-area-inset-top) is the SINGLE top inset, filled by the dark header bg.
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#354F52' })
    console.log('[statusBar] configureStatusBar: done ✓')                              // TEMP
  } catch (e) {
    console.warn('[statusBar] configureStatusBar FAILED:', e)                          // TEMP: surface a plugin/bridge error
  }
}
