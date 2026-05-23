export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[SW] Registration failed:', err)
    })
  })
}

export async function getQueueCount(): Promise<number> {
  const controller = navigator.serviceWorker?.controller
  if (!controller) return 0
  return new Promise(resolve => {
    const channel = new MessageChannel()
    channel.port1.onmessage = e => {
      if (e.data?.type === 'QUEUE_COUNT') resolve(e.data.count as number)
    }
    controller.postMessage(
      { type: 'GET_QUEUE_COUNT' },
      [channel.port2]
    )
    // Fallback if SW doesn't respond within 1s
    setTimeout(() => resolve(0), 1000)
  })
}

export function addSWMessageListener(
  callback: (count: number) => void
): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'QUEUE_COUNT') callback(event.data.count as number)
  }
  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}
