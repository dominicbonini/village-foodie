// Per-device biometric / passcode APP-LOCK. DEVICE-level security (someone picks up the unlocked iPad) —
// SEPARATE from authentication (the login/session stays). Toggle is per-device (localStorage), OFF by
// default. No-op on web. Backed by @aparajita/capacitor-biometric-auth (native project).
//
// ⚠️ HARDWARE-GATED: real Face ID / Touch ID behaviour only confirms on a physical device; the simulator
// can fake a match. Needs `npx cap sync ios` + the Face ID usage description (NSFaceIDUsageDescription).
import { Capacitor } from '@capacitor/core'

const APP_LOCK_KEY = 'hg_app_lock'

export function isAppLockEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(APP_LOCK_KEY) === 'on'   // default OFF
}

export function setAppLockEnabled(on: boolean): void {
  if (typeof window !== 'undefined') localStorage.setItem(APP_LOCK_KEY, on ? 'on' : 'off')
}

/** Is any biometric/passcode available to lock behind? False on web. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    const info = await BiometricAuth.checkBiometry()
    return !!(info.isAvailable || info.strongBiometryIsAvailable)
  } catch { return false }
}

/**
 * Prompt Face ID / Touch ID with device-passcode fallback. Resolves true on success, false on
 * cancel/failure. On web (non-native) resolves TRUE (no lock off-shell — this gates the app, it doesn't
 * protect data, which the session already governs).
 */
export async function verifyIdentity(reason = 'Unlock HatchGrab'): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    await BiometricAuth.authenticate({
      reason,
      allowDeviceCredential: true,   // passcode fallback when biometry isn't enrolled/available
      iosFallbackTitle: 'Use passcode',
      cancelTitle: 'Cancel',
    })
    return true   // authenticate() resolves on success, throws on cancel/failure
  } catch { return false }
}
