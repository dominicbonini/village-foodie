'use client'
// Per-device operator config UI (Packages 3, 4, 5-config). APP-ONLY: every export renders null on web
// (isNativeApp() false) → zero behaviour change for browser users. Reads/writes the current device_id's
// van_devices row via /api/native/bind-device (truck-scoped server-side).
import { useCallback, useEffect, useRef, useState } from 'react'
import { isNativeApp, getDeviceId, fetchDeviceConfig, saveDeviceConfig, type DeviceConfig, type VanRef } from '@/lib/native/device'
import { registerForPush } from '@/lib/native/push'
import { isAppLockEnabled, setAppLockEnabled, isBiometricAvailable, verifyIdentity } from '@/lib/native/appLock'
import { fetchMyTrucks, switchTruck, type TruckRef } from '@/lib/native/trucks'

// NOTE (Package 4): keep-awake is NOT owned here — it's the SINGLE "Screen on" control in the dashboard
// header/UserMenu, which routes to the per-device mechanism in-app (localStorage 'hg_keepawake', default
// on / manual off) and the truck setting on web. Duplicating it here would fire two mechanisms in the app.

// ── First-launch setup gate ─────────────────────────────────────────────────────────────────────────
// Shows a one-time setup card (native + unconfigured) BEFORE the operator uses the console: default screen
// (always asked) + van (single-van → auto-bind silently; multi-van → explicit pick, pre-filled from a
// single-van staff hint only). Renders null once configured (and on web). Also registers push + applies
// the keep-awake default once bound.
export function DeviceSetupGate({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)   // fetchDeviceConfig FAILED (network/429/500) — NOT "no van"
  const [needsSetup, setNeedsSetup] = useState(false)
  const [dismissed, setDismissed] = useState(false)      // "Later" — never trap; card re-appears next launch until set up
  const [vans, setVans] = useState<VanRef[]>([])
  const [screen, setScreen] = useState<'dashboard' | 'kds'>('dashboard')
  const [vanId, setVanId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const runSetup = useCallback(async () => {
    if (!isNativeApp()) { setLoading(false); return }
    setFetchError(false); setLoading(true)
    const result = await fetchDeviceConfig(token)
    if (!mounted.current) return
    // FETCH FAILED (null/network/non-OK) — do NOT show "no active van"; offer Retry. This is where a transient
    // 429/500 used to masquerade as "no van" and trap the operator.
    if (!result.ok) { setFetchError(true); setLoading(false); return }
    const device = result.device
    const vanList = result.vans
    // Already configured (row exists WITH a van) → apply side effects, no card.
    if (device && device.van_id) { void registerForPush(token); setLoading(false); return }
    // Single active van → auto-bind SILENTLY (no van question; screen defaults to 'dashboard', changeable in
    // This-device settings). Per spec: single van = no modal.
    if (vanList.length === 1) {
      const saved = await saveDeviceConfig(token, { van_id: vanList[0].id, default_screen: device?.default_screen ?? 'dashboard' })
      if (!mounted.current) return
      if (saved) void registerForPush(token)
      setLoading(false); return
    }
    // Genuinely 0 (fetch OK, no active vans) OR >1 → show the card. Pre-fill van from the single-van staff hint.
    setVans(vanList)
    setVanId(result.vanHint ?? '')
    setScreen(device?.default_screen ?? 'dashboard')
    setNeedsSetup(true)
    setLoading(false)
  }, [token])

  useEffect(() => { void runSetup() }, [runSetup])

  if (!isNativeApp() || loading || dismissed) return null
  if (!fetchError && !needsSetup) return null

  const onSave = async () => {
    setSaving(true)
    const saved = await saveDeviceConfig(token, { van_id: vanId, default_screen: screen })
    setSaving(false)
    if (saved) { void registerForPush(token); setNeedsSetup(false) }
  }

  // NEVER TRAP: every state has an escape — Retry (error), "Go to Settings → Vans" (no van), Continue (picker),
  // and a "Later" dismiss on all of them. No permanently-disabled Continue with no way out.
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5 flex flex-col gap-4">
        {fetchError ? (
          // ── FETCH FAILED ──────────────────────────────────────────────────────────────────────
          <>
            <div>
              <h2 className="text-base font-black text-slate-900">Couldn&apos;t load device setup</h2>
              <p className="text-xs text-slate-500 mt-0.5">We couldn&apos;t reach the server to set up <strong>this iPad</strong>. Check the connection and try again — your orders and settings are unaffected.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void runSetup()} className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm">Retry</button>
              <button type="button" onClick={() => setDismissed(true)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">Later</button>
            </div>
          </>
        ) : vans.length === 0 ? (
          // ── GENUINELY NO ACTIVE VAN ───────────────────────────────────────────────────────────
          <>
            <div>
              <h2 className="text-base font-black text-slate-900">No active van</h2>
              <p className="text-xs text-slate-500 mt-0.5">This truck has no active van yet. Activate one in <strong>Settings → Vans</strong>, then this device sets up automatically — no further steps here.</p>
            </div>
            <div className="flex gap-2">
              <a href={`/manage/${token}?tab=settings`} className="flex-1 text-center bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm">Go to Settings → Vans</a>
              <button type="button" onClick={() => setDismissed(true)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">Later</button>
            </div>
          </>
        ) : (
          // ── MULTI-VAN PICKER (>1 active van) ──────────────────────────────────────────────────
          <>
            <div>
              <h2 className="text-base font-black text-slate-900">Set up this device</h2>
              <p className="text-xs text-slate-500 mt-0.5">One-time setup for <strong>this iPad</strong>: the screen it opens to and which van it runs. Applies to this device only — other devices are set separately, and you can change these later from the profile menu → &ldquo;This device&rdquo;.</p>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 mb-1.5">Which screen should this device open to?</p>
              <div className="flex gap-2">
                {(['dashboard', 'kds'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setScreen(s)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold border ${screen === s ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-300 text-slate-600'}`}>
                    {s === 'dashboard' ? 'Dashboard' : 'KDS'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 mb-1.5">Which van is this device?</p>
              <select value={vanId} onChange={e => setVanId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Select a van…</option>
                {vans.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={!vanId || saving} onClick={onSave}
                className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-40">
                {saving ? 'Saving…' : 'Continue'}
              </button>
              <button type="button" onClick={() => setDismissed(true)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">Later</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── "This device" settings section (ongoing changes) ─────────────────────────────────────────────────
// Hierarchy: [You're viewing: truck — van] → TRUCK (only when the user has >1 permitted truck; wired in the
// approve-first login/switch work) → VAN (of the truck; only when >1) → DEFAULT SCREEN → NOTIFICATIONS →
// APP-LOCK. All per-device. The van switcher is already secure (bind-device gates van.truck_id===truck.id).
export function ThisDeviceSettings({ token }: { token: string }) {
  const [cfg, setCfg] = useState<DeviceConfig | null>(null)
  const [vans, setVans] = useState<VanRef[]>([])
  const [truckName, setTruckName] = useState<string | null>(null)
  const [appLock, setAppLock] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [myTrucks, setMyTrucks] = useState<TruckRef[]>([])
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    if (!isNativeApp()) return
    setAppLock(isAppLockEnabled())
    void isBiometricAvailable().then(setBioAvailable)
    void (async () => {
      const c = await fetchDeviceConfig(token)
      if (c.ok) { setCfg(c.device); setVans(c.vans); setTruckName(c.truck?.name ?? null) }
      const mt = await fetchMyTrucks()
      setMyTrucks(mt.trucks)
    })()
  }, [token])

  if (!isNativeApp()) return null

  const patch = async (p: Parameters<typeof saveDeviceConfig>[1]) => {
    const saved = await saveDeviceConfig(token, p)
    if (saved) setCfg(saved)
  }
  const vanName = vans.find(v => v.id === cfg?.van_id)?.name ?? null

  // TRUCK switch (sick-cover / multi-truck): re-point the device to another PERMITTED truck. Server gates
  // membership + UPDATEs the single van_devices row (push_token carries over). Full reload re-scopes the
  // whole console to the new truck. Does NOT log out.
  const onSwitchTruck = async (targetTruckId: string) => {
    if (!targetTruckId || targetTruckId === cfg?.truck_id) return
    setSwitching(true)
    const newToken = await switchTruck(targetTruckId)
    setSwitching(false)
    if (newToken && typeof window !== 'undefined') window.location.href = `/dashboard/${newToken}`
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold text-slate-900">This device</h3>
        {/* Which truck/van this device is currently showing — always visible, so the operator can SEE
            what they're viewing before deciding whether to switch. */}
        <p className="text-sm text-slate-700 mt-1">You&apos;re viewing: <strong>{truckName ?? '—'}</strong>{vanName ? <> — <strong>{vanName}</strong></> : ''}</p>
        <p className="text-xs text-slate-400 mt-0.5">This device only — other devices are set separately. (ID: {getDeviceId().slice(0, 8)}…)</p>
      </div>

      {/* TRUCK — switch to another truck the user is a MEMBER of (only when >1 permitted; hidden/silent for
          single-truck users). Sick-cover / multi-truck edge. Server-gated (my-trucks / switch-truck). */}
      {myTrucks.length > 1 && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-slate-700">Truck</span>
          <select value={cfg?.truck_id ?? ''} disabled={switching} onChange={e => void onSwitchTruck(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm disabled:opacity-50">
            {myTrucks.map(t => <option key={t.truck_id} value={t.truck_id}>{t.name}</option>)}
          </select>
        </label>
      )}

      {/* VAN — switch to another van of this truck (only when the truck has >1 van). Already truck-scoped
          server-side (bind-device). "If permissions allow switch to another van." */}
      {vans.length > 1 && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-slate-700">Van</span>
          <select value={cfg?.van_id ?? ''} onChange={e => patch({ van_id: e.target.value })}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
            <option value="">—</option>
            {vans.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      )}

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-700">Default screen</span>
        <select value={cfg?.default_screen ?? 'dashboard'} onChange={e => patch({ default_screen: e.target.value as 'dashboard' | 'kds' })}
          className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
          <option value="dashboard">Dashboard</option>
          <option value="kds">KDS</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-700">Order notifications</span>
        <input type="checkbox" checked={cfg?.notify_enabled ?? true} onChange={e => patch({ notify_enabled: e.target.checked })} />
      </label>

      {/* APP-LOCK — device-level Face ID / passcode gate (per-device, default off). SEPARATE from login. */}
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-700">Require Face&nbsp;ID / passcode to open</span>
        <input type="checkbox" checked={appLock}
          onChange={async e => {
            const on = e.target.checked
            if (on) { const ok = await verifyIdentity('Confirm to enable app lock'); if (!ok) return }
            setAppLock(on); setAppLockEnabled(on)
          }} />
      </label>
      {appLock && !bioAvailable && <p className="text-[11px] text-amber-600 -mt-1">No Face ID / passcode enrolled on this device — set one up in iOS Settings.</p>}

      <p className="text-[11px] text-slate-400 mt-0.5">These settings apply to this device only — other devices are configured separately.</p>
    </div>
  )
}
