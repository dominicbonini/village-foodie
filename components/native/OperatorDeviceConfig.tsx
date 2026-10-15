'use client'
// Per-device operator config UI (Packages 3, 4, 5-config). APP-ONLY: every export renders null on web
// (isNativeApp() false) → zero behaviour change for browser users. Reads/writes the current device_id's
// van_devices row via /api/native/bind-device (truck-scoped server-side).
import { useCallback, useEffect, useRef, useState } from 'react'
import { isNativeApp, getDeviceId, fetchDeviceConfig, saveDeviceConfig, saveFailureKey, type DeviceConfig, type VanRef } from '@/lib/native/device'
import { registerForPush, releasePushHandlers } from '@/lib/native/push'
import { isAppLockEnabled, setAppLockEnabled, isBiometricAvailable, verifyIdentity, setAppLockPin, clearAppLockPin } from '@/lib/native/appLock'
import { fetchMyTrucks, switchTruck, type TruckRef } from '@/lib/native/trucks'
import { useT, useAppLocale } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/nativeShell'

// NOTE (Package 4): keep-awake is NOT owned here — it's the SINGLE "Screen on" control in the dashboard
// header/UserMenu, which routes to the per-device pref (localStorage `hg_keepawake_${token}`, default on /
// manual off) — the SAME per-device mechanism on web and in the app. Duplicating it here would fire two.

// ── First-launch setup gate ─────────────────────────────────────────────────────────────────────────
// Shows a one-time setup card (native + unconfigured) BEFORE the operator uses the console: default screen
// (always asked) + van (single-van → auto-bind silently; multi-van → explicit pick, pre-filled from a
// single-van staff hint only). Renders null once configured (and on web). Also registers push + applies
// the keep-awake default once bound.
// -- onOpenOrder — THE PUSH TAP HANDLER, THREADED THROUGH FROM THE DASHBOARD ────────────────────
// registerForPush has ALWAYS accepted this and NO CALLER HAS EVER PASSED IT, so
// `if (orderKey && onOpenOrder)` in lib/native/push.ts could never fire. The listener was attached, the
// payload was correct on both platforms, and the callback was undefined — dead on iOS AND Android since
// the day it was written, invisible only because iOS has never obtained a token.
// NOTE: OPTIONAL, so nothing that renders this without a handler changes behaviour. The dashboard is the one
// caller that supplies one; it is also the only surface this component is mounted on.
export function DeviceSetupGate({ token, onOpenOrder }: { token: string; onOpenOrder?: (orderKey: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)   // fetchDeviceConfig FAILED (network/429/500) — NOT "no van"
  const [needsSetup, setNeedsSetup] = useState(false)
  const [dismissed, setDismissed] = useState(false)      // "Later" — never trap; card re-appears next launch until set up
  const [vans, setVans] = useState<VanRef[]>([])
  const [screen, setScreen] = useState<'dashboard' | 'kds'>('dashboard')
  const [vanId, setVanId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  // 🔴 A FAILED WRITE NOW HAS SOMEWHERE TO GO. Every save on this card used to resolve to `null` and be
  // dropped: the button returned from "Saving…" to "Continue" and the modal sat there looking untouched,
  // which reads as "nothing happened" — not as "that failed". One plain sentence, no internal cause.
  // ⚠️ HOLDS A CODE (Language Phase 1b) — `runSetup` is a useCallback, so it sets `deviceSave.network` /
  // `deviceSave.server` and the words are made at render. The translator is never one of its dependencies.
  const [saveError, setSaveError] = useState<string | null>(null)
  const t = useT('nativeShell')
  // The Android channel's words follow the app's locale. A REF, written in an effect, because `runSetup` is a
  // useCallback whose identity drives the setup effect — a locale in its deps would re-run setup on arrival.
  const locale = useAppLocale()
  const localeRef = useRef(locale)
  useEffect(() => { localeRef.current = locale }, [locale])
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  // ── 🔴 THE TAP HANDLER, HELD IN A REF SO THE EFFECT DOES NOT DEPEND ON IT ───────────────────────
  // `onOpenOrder` is `openOrderFromPush`, a useCallback over `showToast`. `showToast` is memoised now,
  // so this is stable in practice — but the ref makes the effect's independence STRUCTURAL rather than
  // conditional on a hook two files away staying memoised. registerForPush reads the handler from module
  // state at press time, so passing the ref's current value is enough and a change costs no re-attach.
  // ⚠️ WRITTEN IN AN EFFECT, NOT DURING RENDER — a ref write during render is the `react-hooks/refs`
  // finding this file already carries elsewhere, and there is no reason to add another. Effects run
  // top-down, so this one lands before runSetup's effect below reads the ref.
  const onOpenOrderRef = useRef(onOpenOrder)
  useEffect(() => { onOpenOrderRef.current = onOpenOrder }, [onOpenOrder])

  // 🔴 CLEAR THE HANDLER ON UNMOUNT. Without this an unmounted dashboard's callback stays reachable from
  // the module-level listener and fires into a screen that no longer exists. Handles are captured and
  // removable in lib/native/push.ts (releasePushHandlers(true)); the plugin listeners themselves are
  // deliberately NOT torn down here — see that function's note on the registration listener.
  useEffect(() => () => { releasePushHandlers() }, [])

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
    if (device && device.van_id) { void registerForPush(token, onOpenOrderRef.current, localeRef.current); setLoading(false); return }
    // Single active van → auto-bind SILENTLY (no van question; screen defaults to 'dashboard', changeable in
    // This-device settings). Per spec: single van = no modal.
    if (vanList.length === 1) {
      const saved = await saveDeviceConfig(token, { van_id: vanList[0].id, default_screen: device?.default_screen ?? 'dashboard' })
      if (!mounted.current) return
      if (saved.ok) { void registerForPush(token, onOpenOrderRef.current, localeRef.current); setLoading(false); return }
      // 🔴 A SILENT AUTO-BIND THAT FAILS MUST NOT STAY SILENT. This branch used to fall straight through
      // to setLoading(false) whatever happened, so the device ended up bound to nothing and the operator
      // was shown a perfectly normal dashboard. It is the only save on this card with no button behind it,
      // which is exactly why its failure was invisible. Fall through to the card — pre-filled with the one
      // van it tried — so there is something to press. Success is untouched: it still shows no modal.
      setVans(vanList)
      setVanId(vanList[0].id)
      setScreen(device?.default_screen ?? 'dashboard')
      setSaveError(saveFailureKey(saved))
      setNeedsSetup(true)
      setLoading(false); return
    }
    // Genuinely 0 (fetch OK, no active vans) OR >1 → show the card. Pre-fill van from the single-van staff hint.
    setVans(vanList)
    setVanId(result.vanHint ?? '')
    setScreen(device?.default_screen ?? 'dashboard')
    setNeedsSetup(true)
    setLoading(false)
    // ── 🔴 `token` ONLY. `onOpenOrder` IS DELIBERATELY *OUT* OF THE DEPS NOW, AND THAT IS THE FIX. ────
    // It used to be in them, on the reasoning that a stale closure would otherwise be attached forever.
    // That reasoning was right about the problem and wrong about the remedy: `onOpenOrder` changed
    // identity on every dashboard render, so this callback did too, so the effect below re-ran on every
    // render — and each run raced the attach latch until SIX listener sets were live and one tap produced
    // six toasts. The staleness is now handled where it belongs, by module state that the listener reads
    // at press time (see onOpenOrderRef above and `currentOnOpenOrder` in lib/native/push.ts), so this
    // effect can be stable AND current at once.
  }, [token])

  useEffect(() => { void runSetup() }, [runSetup])

  if (!isNativeApp() || loading || dismissed) return null
  if (!fetchError && !needsSetup) return null

  const onSave = async () => {
    setSaving(true)
    setSaveError(null)   // clear the previous attempt's line before this one reports
    const saved = await saveDeviceConfig(token, { van_id: vanId, default_screen: screen })
    setSaving(false)
    // 🔴 THE MODAL STAYS OPEN ON FAILURE, AND THAT IS THE POINT. setNeedsSetup(false) is the ONLY thing
    // that closes it, and it is reachable only from the success branch — a card that closed on a failed
    // save would be indistinguishable from one that saved. Unchanged behaviour on success.
    if (saved.ok) { void registerForPush(token, onOpenOrderRef.current, localeRef.current); setNeedsSetup(false); return }
    setSaveError(saveFailureKey(saved))
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
              <h2 className="text-base font-black text-slate-900">{t('setup.fetchErrorTitle')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.rich('setup.fetchErrorBody', { b: c => <strong>{c}</strong> })}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void runSetup()} className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm">{t('setup.retry')}</button>
              <button type="button" onClick={() => setDismissed(true)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">{t('setup.later')}</button>
            </div>
          </>
        ) : vans.length === 0 ? (
          // ── GENUINELY NO ACTIVE VAN ───────────────────────────────────────────────────────────
          <>
            <div>
              <h2 className="text-base font-black text-slate-900">{t('setup.noVanTitle')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.rich('setup.noVanBody', { b: c => <strong>{c}</strong> })}</p>
            </div>
            <div className="flex gap-2">
              <a href={`/manage/${token}?tab=settings`} className="flex-1 text-center bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm">{t('setup.goToVans')}</a>
              <button type="button" onClick={() => setDismissed(true)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">{t('setup.later')}</button>
            </div>
          </>
        ) : (
          // ── MULTI-VAN PICKER (>1 active van) ──────────────────────────────────────────────────
          <>
            <div>
              <h2 className="text-base font-black text-slate-900">{t('setup.title')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.rich('setup.body', { b: c => <strong>{c}</strong> })}</p>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 mb-1.5">{t('setup.whichScreen')}</p>
              <div className="flex gap-2">
                {(['dashboard', 'kds'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setScreen(s)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold border ${screen === s ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-300 text-slate-600'}`}>
                    {s === 'dashboard' ? t('setup.dashboard') : t('setup.kds')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 mb-1.5">{t('setup.whichVan')}</p>
              <select value={vanId} onChange={e => setVanId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="">{t('setup.selectVan')}</option>
                {vans.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            {/* Same shape and vocabulary as this file's own set-PIN error (`pinSetupErr`, below) and as
                Manage's verify line — `text-[11px] text-red-500`, sitting directly above the action it
                refers to. Not a new pattern. */}
            {saveError && <p className="text-[11px] text-red-500 -mb-1">{t.has(saveError as never) ? t(saveError as never) : saveError}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={!vanId || saving} onClick={onSave}
                className="flex-1 bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-40">
                {saving ? t('setup.saving') : saveError ? t('setup.tryAgain') : t('setup.continue')}
              </button>
              <button type="button" onClick={() => setDismissed(true)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 border border-slate-200">{t('setup.later')}</button>
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
  // Enabling app-lock REQUIRES setting a backup PIN (the offline escape hatch) — a biometric-only lock is how
  // an operator gets permanently locked out. `pinSetup` shows the set-PIN form; enabling isn't committed until
  // a valid matching 4–6 digit PIN is stored.
  const [pinSetup, setPinSetup] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinSetupErr, setPinSetupErr] = useState('')
  const [myTrucks, setMyTrucks] = useState<TruckRef[]>([])
  const [switching, setSwitching] = useState(false)
  // Inline write-failure line for the three per-device settings below. See `patch()`.
  const [patchError, setPatchError] = useState<string | null>(null)
  const t = useT('nativeShell')
  const locale = useAppLocale()

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

  // 🔴 THE REVERT IS STRUCTURAL, THE MESSAGE IS THE NEW PART. Every control below is CONTROLLED by
  // `cfg`, so not calling setCfg is already what puts the select and the checkbox back — but a control
  // that silently springs back reads as a mis-tap, not as a failure. `label` names the setting so one
  // shared line can serve three controls without being vague about which one did not save.
  // ⚠️ `setting` is an ID, not the row's label (Language Phase 1b): the sentence picks the setting's name.
  const patch = async (p: Parameters<typeof saveDeviceConfig>[1], setting: 'van' | 'defaultScreen' | 'notifications') => {
    setPatchError(null)
    const saved = await saveDeviceConfig(token, p)
    if (saved.ok) { setCfg(saved.device); return }
    setPatchError(t('device.patchFailed', { setting, reason: t(saveFailureKey(saved)) }))
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
        <h3 className="text-sm font-bold text-slate-900">{t('device.title')}</h3>
        {/* Which truck/van this device is currently showing — always visible, so the operator can SEE
            what they're viewing before deciding whether to switch. */}
        <p className="text-sm text-slate-700 mt-1">{vanName
          ? t.rich('device.viewingVan', { truck: truckName ?? '—', van: vanName, b: c => <strong>{c}</strong> })
          : t.rich('device.viewing', { truck: truckName ?? '—', b: c => <strong>{c}</strong> })}</p>
        <p className="text-xs text-slate-400 mt-0.5">{t('device.only', { id: getDeviceId().slice(0, 8) })}</p>
      </div>

      {/* TRUCK — switch to another truck the user is a MEMBER of (only when >1 permitted; hidden/silent for
          single-truck users). Sick-cover / multi-truck edge. Server-gated (my-trucks / switch-truck). */}
      {myTrucks.length > 1 && (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-slate-700">{t('device.truck')}</span>
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
          <span className="font-semibold text-slate-700">{t('device.van')}</span>
          <select value={cfg?.van_id ?? ''} onChange={e => patch({ van_id: e.target.value }, 'van')}
            className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
            <option value="">—</option>
            {vans.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      )}

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-700">{t('device.defaultScreen')}</span>
        <select value={cfg?.default_screen ?? 'dashboard'} onChange={e => patch({ default_screen: e.target.value as 'dashboard' | 'kds' }, 'defaultScreen')}
          className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
          <option value="dashboard">{t('setup.dashboard')}</option>
          <option value="kds">{t('setup.kds')}</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-700">{t('device.orderNotifications')}</span>
        <input type="checkbox" checked={cfg?.notify_enabled ?? true} onChange={e => patch({ notify_enabled: e.target.checked }, 'notifications')} />
      </label>
      {/* One line for all three settings above — same `text-[11px] text-red-500` as the set-PIN error
          further down this card. It sits under the group because the control that failed has already
          snapped back to its stored value, and the sentence is what says why. */}
      {patchError && <p className="text-[11px] text-red-500 -mt-1">{patchError}</p>}

      {/* APP-LOCK — device-level biometric gate (per-device, default off). SEPARATE from login.
          NOTE: THE COPY NAMES THE CONCEPT, NOT A VENDOR. lib/native/appLock.ts uses
          @aparajita/capacitor-biometric-auth, which is registered in android/capacitor.settings.gradle as
          well as on iOS — so "Face ID / Touch ID" was false on every Android device, in all three strings
          below. "fingerprint or face unlock" is the one phrase true on both, and it is used verbatim in
          each of them so they cannot drift apart.
          Enabling opens the backup-PIN setup (required) — it's committed only once a valid PIN is stored. */}
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-700">{t('device.requireBiometric')}</span>
        <input type="checkbox" checked={appLock}
          onChange={async e => {
            const on = e.target.checked
            if (on) {
              const ok = await verifyIdentity(t('appLock.confirmEnable'), locale)
              if (!ok) return
              setNewPin(''); setConfirmPin(''); setPinSetupErr(''); setPinSetup(true)   // require a backup PIN before committing
            } else {
              await clearAppLockPin(); setAppLockEnabled(false); setAppLock(false); setPinSetup(false)
            }
          }} />
      </label>
      {pinSetup && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2 -mt-1">
          <p className="text-xs font-semibold text-slate-700">{t('device.pinTitle')}</p>
          <p className="text-[11px] text-slate-500 -mt-1">{t('device.pinHelp')}</p>
          <input type="tel" inputMode="numeric" value={newPin} placeholder={t('device.pinPlaceholder')}
            onChange={e => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinSetupErr('') }}
            className="text-center tracking-[0.3em] font-bold border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          <input type="tel" inputMode="numeric" value={confirmPin} placeholder={t('device.confirmPinPlaceholder')}
            onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinSetupErr('') }}
            className="text-center tracking-[0.3em] font-bold border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          {pinSetupErr && <p className="text-[11px] text-red-500">{pinSetupErr}</p>}
          <div className="flex gap-2">
            <button type="button"
              onClick={async () => {
                if (newPin.length < 4) { setPinSetupErr(t('device.pinTooShort')); return }
                if (newPin !== confirmPin) { setPinSetupErr(t('device.pinMismatch')); return }
                await setAppLockPin(newPin)
                setAppLockEnabled(true); setAppLock(true); setPinSetup(false); setNewPin(''); setConfirmPin('')
              }}
              className="flex-1 bg-orange-600 text-white font-bold py-2 rounded-lg text-sm">{t('device.setPin')}</button>
            <button type="button"
              onClick={() => { setPinSetup(false); setNewPin(''); setConfirmPin(''); setPinSetupErr('') }}
              className="px-3 bg-slate-200 text-slate-600 font-bold py-2 rounded-lg text-sm">{t('device.cancel')}</button>
          </div>
        </div>
      )}
      {appLock && !bioAvailable && <p className="text-[11px] text-amber-600 -mt-1">{t('device.noBiometric')}</p>}

      <p className="text-[11px] text-slate-400 mt-0.5">{t('device.footer')}</p>
    </div>
  )
}
