'use client'
// Biometric APP-LOCK overlay. When enabled (per-device), covers the screen and prompts Face ID / Touch ID
// on launch AND on every genuine app foreground (someone picking up a backgrounded, unlocked iPad). Success →
// renders null (reveals the console). NOT a re-login — the persistent session stays. No-op on web / when off.
//
// TWO safety fixes (both hardware-only reproducible — the simulator masked them):
//  1. LOOP: presenting the biometric prompt makes iOS resign-active, and dismissing it (even on SUCCESS) makes
//     it become-active → the resume handler re-locked + re-prompted → infinite loop (hard lockout). We guard
//     with authInProgress and CONSUME it on the resume event itself (see below), so our prompt's own dismissal
//     can't re-lock, while a genuine background→foreground still does.
//  2. ESCAPE HATCH: a biometric-only lock with the "off" switch INSIDE the app = permanent lockout if the
//     prompt won't present. A backup PIN (offline: Preferences + Web-Crypto, no plugin/network) is offered via
//     a link and auto-surfaced after 2 failed/cancelled attempts.
import { useEffect, useState, useCallback, useRef } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { isAppLockEnabled, verifyIdentity, verifyAppLockPin } from '@/lib/native/appLock'
import { onAppResume } from '@/lib/native/app'
import { useT, useAppLocale } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/nativeShell'

export function AppLockGate() {
  const enabled = isNativeApp() && isAppLockEnabled()
  const [locked, setLocked] = useState(enabled)
  const [verifying, setVerifying] = useState(false)
  const [fails, setFails] = useState(0)
  const [showPin, setShowPin] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [pinChecking, setPinChecking] = useState(false)
  // LOOP GUARD: set before authenticate(); CONSUMED on the first resume after — that become-active is our
  // prompt's dismissal, not a genuine return, so it's ignored. Consume-on-event (NOT a fixed delay: a clock
  // can be raced by a slow become-active on a slow device). A LATER resume (real background→foreground, guard
  // already consumed) still re-locks, so the feature's purpose survives.
  const authInProgress = useRef(false)
  const t = useT('nativeShell')
  // The system prompt's words follow the app's locale (Language Phase 1b). A REF, written in an effect: `attempt`
  // is a dependency of the lock effects below, and a locale in its deps would re-lock and re-prompt the moment
  // the language arrived.
  const locale = useAppLocale()
  const localeRef = useRef(locale)
  useEffect(() => { localeRef.current = locale }, [locale])

  const attempt = useCallback(async () => {
    authInProgress.current = true
    setVerifying(true)
    const ok = await verifyIdentity(undefined, localeRef.current)
    setVerifying(false)
    if (ok) { setLocked(false); setShowPin(false); setPin('') }
    else setFails(f => f + 1)
    // authInProgress is NOT cleared here — the resume event from this prompt's dismissal consumes it.
  }, [])

  // Lock + prompt on mount when enabled.
  useEffect(() => { if (enabled) { setLocked(true); void attempt() } }, [enabled, attempt])
  // Re-lock on GENUINE foreground; ignore (consume) the foreground caused by our own auth prompt.
  useEffect(() => {
    if (!enabled) return
    return onAppResume(() => {
      if (authInProgress.current) { authInProgress.current = false; return }   // our prompt's dismissal → ignore
      setFails(0); setShowPin(false); setPin(''); setLocked(true); void attempt()   // real background→foreground → re-lock
    })
  }, [enabled, attempt])

  const submitPin = useCallback(async () => {
    setPinChecking(true)
    const ok = await verifyAppLockPin(pin)   // OFFLINE: Preferences + Web-Crypto, no plugin/network
    setPinChecking(false)
    if (ok) { setLocked(false); setShowPin(false); setPin(''); setFails(0) }
    else { setPinError(true); setPin('') }
  }, [pin])

  if (!enabled || !locked) return null
  const offerPin = showPin || fails >= 2   // auto-surface the escape after 2 failed/cancelled attempts
  return (
    <div className="fixed inset-0 z-[80] bg-slate-900 flex flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="text-5xl">🔒</div>
      <p className="text-white/80 text-sm">{t('lock.locked')}</p>
      {!offerPin ? (
        <>
          <button onClick={() => void attempt()} disabled={verifying}
            className="bg-orange-600 text-white font-bold px-6 py-3 rounded-xl text-sm disabled:opacity-50">
            {verifying ? t('lock.verifying') : t('lock.unlock')}
          </button>
          <button onClick={() => setShowPin(true)} className="text-white/50 text-xs underline">
            {t('lock.cantUseBiometric')}
          </button>
        </>
      ) : (
        <div className="w-full max-w-[220px] flex flex-col gap-3">
          <p className="text-white/60 text-xs">{t('lock.enterPin')}</p>
          <input
            type="tel" inputMode="numeric" autoFocus value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError(false) }}
            onKeyDown={e => { if (e.key === 'Enter' && pin.length >= 4) void submitPin() }}
            className="text-center tracking-[0.4em] text-lg font-bold bg-white/10 text-white rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
            placeholder="••••"
          />
          {pinError && <p className="text-red-400 text-xs">{t('lock.wrongPin')}</p>}
          <button onClick={() => void submitPin()} disabled={pin.length < 4 || pinChecking}
            className="bg-orange-600 text-white font-bold px-6 py-3 rounded-xl text-sm disabled:opacity-40">
            {pinChecking ? t('lock.checking') : t('lock.unlock')}
          </button>
          <button onClick={() => { setShowPin(false); setPin(''); setPinError(false); void attempt() }}
            className="text-white/50 text-xs underline">{t('lock.tryBiometric')}</button>
          <p className="text-white/30 text-[11px] mt-1">{t('lock.forgot')}</p>
        </div>
      )}
    </div>
  )
}
