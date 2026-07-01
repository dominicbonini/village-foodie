// Client helpers for the switchable multi-truck config (plan b). Bearer-authed via the native session.
import { getDeviceId, type VanRef } from './device'
import { getNativeAccessToken } from './session'

export interface TruckRef { truck_id: string; name: string; dashboard_token: string; vans: VanRef[] }

/** The trucks the logged-in user may access + this device's current pinned config. Server is the gate. */
export async function fetchMyTrucks(): Promise<{ trucks: TruckRef[]; device: { truck_id: string; van_id: string | null; default_screen: string } | null }> {
  const jwt = await getNativeAccessToken()
  if (!jwt) return { trucks: [], device: null }
  try {
    const res = await fetch(`/api/native/my-trucks?device_id=${encodeURIComponent(getDeviceId())}`, { headers: { Authorization: `Bearer ${jwt}` } })
    if (!res.ok) return { trucks: [], device: null }
    return await res.json()
  } catch { return { trucks: [], device: null } }
}

/** Re-point this device to another permitted truck. Server verifies membership + UPDATEs the single row.
 *  Returns the target truck's dashboard_token (for the console reload), or null on failure/denied. */
export async function switchTruck(targetTruckId: string, vanId?: string | null): Promise<string | null> {
  const jwt = await getNativeAccessToken()
  if (!jwt) return null
  try {
    const res = await fetch('/api/native/switch-truck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ device_id: getDeviceId(), target_truck_id: targetTruckId, van_id: vanId ?? null }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.dashboard_token ?? null
  } catch { return null }
}
