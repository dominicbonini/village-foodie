'use client'
// Biometric/passcode APP-LOCK overlay. When enabled (per-device), covers the screen and prompts Face ID /
// passcode on launch AND on every app foreground (someone picking up a backgrounded, unlocked iPad).
// Success → renders null (reveals the console). NOT a re-login — the persistent session stays. No-op on
// web and when the per-device toggle is off.
import { useEffect, useState, useCallback } from 'react'
import { isNativeApp } from '@/lib/native/device'
import { isAppLockEnabled, verifyIdentity } from '@/lib/native/appLock'
import { onAppResume } from '@/lib/native/app'

export function AppLockGate() {
  const enabled = isNativeApp() && isAppLockEnabled()
  const [locked, setLocked] = useState(enabled)
  const [verifying, setVerifying] = useState(false)

  const attempt = useCallback(async () => {
    setVerifying(true)
    const ok = await verifyIdentity()
    setVerifying(false)
    if (ok) setLocked(false)
  }, [])

  // Lock + prompt on mount when enabled.
  useEffect(() => { if (enabled) { setLocked(true); void attempt() } }, [enabled, attempt])
  // Re-lock + prompt on every foreground.
  useEffect(() => {
    if (!enabled) return
    return onAppResume(() => { setLocked(true); void attempt() })
  }, [enabled, attempt])

  if (!enabled || !locked) return null
  return (
    <div className="fixed inset-0 z-[80] bg-slate-900 flex flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="text-5xl">🔒</div>
      <p className="text-white/80 text-sm">HatchGrab is locked</p>
      <button onClick={() => void attempt()} disabled={verifying}
        className="bg-orange-600 text-white font-bold px-6 py-3 rounded-xl text-sm disabled:opacity-50">
        {verifying ? 'Verifying…' : 'Unlock'}
      </button>
    </div>
  )
}
