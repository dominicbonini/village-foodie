import { Capacitor } from '@capacitor/core'

export async function configureStatusBar() {
  if (!Capacitor.isNativePlatform()) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  // OVERLAY the WebView under the status bar. The immersive-header CSS (AppHeader paddingTop:
  // env(safe-area-inset-top) + viewport-fit=cover + contentInset:'never') assumes the WebView extends under
  // the status bar. Without this the OS RESERVES the status-bar strip (pushes the WebView down) AND the CSS
  // env() padding adds a second inset → a double empty band above the header. With overlay:true the OS stops
  // reserving the strip, so env(safe-area-inset-top) is the SINGLE top inset, filled by the dark header bg.
  await StatusBar.setOverlaysWebView({ overlay: true })
  await StatusBar.setStyle({ style: Style.Dark })
  await StatusBar.setBackgroundColor({ color: '#354F52' })
}
