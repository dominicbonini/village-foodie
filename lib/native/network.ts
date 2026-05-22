import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'

export type NetworkStatus = 'online' | 'offline'

export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (!Capacitor.isNativePlatform()) {
    return navigator.onLine ? 'online' : 'offline'
  }
  const status = await Network.getStatus()
  return status.connected ? 'online' : 'offline'
}

export function addNetworkListener(
  callback: (status: NetworkStatus) => void
): () => void {
  if (!Capacitor.isNativePlatform()) {
    const onOnline = () => callback('online')
    const onOffline = () => callback('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }
  const handle = Network.addListener('networkStatusChange', s => {
    callback(s.connected ? 'online' : 'offline')
  })
  return () => { handle.then(h => h.remove()) }
}
