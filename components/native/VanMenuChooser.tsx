'use client'
// Native-only van chooser for the profile menu (UserMenu). Shows the CURRENT van this device is bound to,
// and — when the truck has more than one van — lets the operator switch it inline. Reuses the EXISTING
// per-device van-binding mechanism (saveDeviceConfig → /api/native/bind-device, truck-scoped server-side);
// after a switch it reloads so the dashboard/KDS re-scope to the new van. Renders null on web / until loaded.
//
// PERMISSION MODEL (reference-manual §"device setup"): the van-switch write path (bind-device) is gated ONLY
// by TRUCK membership — any member (owner/manager/staff) can set any ACTIVE van of the truck; `truck_user_vans`
// is a soft, UNENFORCED hint. So there is no per-user "read-only" case today: the only read-only state is a
// single-van truck (nothing to switch to). A staff-read-only restriction would need server-side enforcement
// (a role / truck_user_vans check added to bind-device) and is intentionally NOT faked in the UI.
import { useCallback, useEffect, useState } from 'react'
import { isNativeApp, fetchDeviceConfig, saveDeviceConfig, type VanRef } from '@/lib/native/device'

export function VanMenuChooser({ token }: { token: string }) {
  const [vans, setVans] = useState<VanRef[]>([])
  const [vanId, setVanId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)   // fetch failed — degrade to a Retry, don't vanish silently
  const [switching, setSwitching] = useState(false)

  const load = useCallback(async () => {
    if (!isNativeApp()) return
    setLoadError(false)
    const result = await fetchDeviceConfig(token)
    // FETCH FAILED → surface a Retry instead of rendering null (which would make the van row silently
    // disappear from the profile menu). Same failure/empty distinction as the setup gate.
    if (!result.ok) { setLoadError(true); setReady(true); return }
    setVans(result.vans)
    setVanId(result.device?.van_id ?? null)
    setReady(true)
  }, [token])

  useEffect(() => { void load() }, [load])

  // Native-only, and only once we know the van state (avoids a flash of "—" before the fetch lands).
  if (!isNativeApp() || !ready) return null

  if (loadError) {
    return (
      <div className="px-4 py-2 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-slate-700">Van</span>
          <button type="button" onClick={() => void load()} className="text-sm font-semibold text-orange-600">Couldn&apos;t load · Retry</button>
        </div>
      </div>
    )
  }

  const currentName = vans.find(v => v.id === vanId)?.name ?? '—'

  const onSwitch = async (nextVanId: string) => {
    if (!nextVanId || nextVanId === vanId || switching) return
    setSwitching(true)
    const saved = await saveDeviceConfig(token, { van_id: nextVanId })
    // Reload so the dashboard/KDS re-scope to the newly-bound van (server reads van_devices for this device).
    if (saved && typeof window !== 'undefined') { window.location.reload(); return }
    setSwitching(false)
  }

  return (
    <div className="px-4 py-2 border-b border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-700">Van</span>
        {vans.length > 1 ? (
          // Multi-van → switchable (any truck member may switch — see permission note above).
          <select value={vanId ?? ''} disabled={switching} onChange={e => void onSwitch(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm max-w-[9rem] disabled:opacity-50">
            {vanId == null && <option value="">Select…</option>}
            {vans.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        ) : (
          // Single van (or none) → read-only: nothing to switch to.
          <span className="text-sm font-semibold text-slate-900">{currentName}</span>
        )}
      </div>
    </div>
  )
}
