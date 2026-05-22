import { Capacitor } from '@capacitor/core'

async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null
  const { KeepAwake } = await import('@capacitor-community/keep-awake')
  return KeepAwake
}

export async function enableKeepAwake() {
  const plugin = await getPlugin()
  await plugin?.keepAwake()
}

export async function disableKeepAwake() {
  const plugin = await getPlugin()
  await plugin?.allowSleep()
}
