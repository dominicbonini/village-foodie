// App lifecycle (Package 6). onAppResume fires when the native app returns to foreground → the caller
// pings the heartbeat immediately (shrinks the false-offline-pause window vs waiting for the 15s tick).
// No-op on web (returns a noop unsubscribe). Dynamic import keeps it off the web path.
import { Capacitor } from '@capacitor/core'

export function onAppResume(cb: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let remove: (() => void) | undefined
  import('@capacitor/app')
    .then(({ App }) => {
      const handlePromise = App.addListener('appStateChange', (state: { isActive: boolean }) => {
        if (state.isActive) cb()
      })
      Promise.resolve(handlePromise).then((handle: { remove: () => void }) => {
        remove = () => { try { handle.remove() } catch {} }
      })
    })
    .catch(() => {})
  return () => { remove?.() }
}
