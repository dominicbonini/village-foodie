// Per-device biometric / passcode APP-LOCK. DEVICE-level security (someone picks up the unlocked iPad) —
// SEPARATE from authentication (the login/session stays). Toggle is per-device (localStorage), OFF by
// default. No-op on web. Backed by @aparajita/capacitor-biometric-auth (native project).
//
// ⚠️ HARDWARE-GATED: real Face ID / Touch ID behaviour only confirms on a physical device; the simulator
// can fake a match. Needs `npx cap sync ios` + the Face ID usage description (NSFaceIDUsageDescription).
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const APP_LOCK_KEY = 'hg_app_lock'
const PIN_KEY = 'hg_app_lock_pin'   // native Preferences (NOT localStorage) — {salt,hash}, never the PIN itself

export function isAppLockEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(APP_LOCK_KEY) === 'on'   // default OFF (sync — gates the overlay on mount)
}

export function setAppLockEnabled(on: boolean): void {
  if (typeof window !== 'undefined') localStorage.setItem(APP_LOCK_KEY, on ? 'on' : 'off')
}

// ── BACKUP PIN — the offline escape hatch ─────────────────────────────────────────────────────────────
// The ONLY way out when the biometric prompt won't present (hardware/plugin fault) — and it MUST work with
// NO network, NO biometric, NO plugin (a rural venue with no signal is the operating condition, not an edge
// case). Stored HASHED in native Preferences via Web-Crypto PBKDF2-SHA256 (100k iterations, random 16-byte
// salt): a webview has no bcrypt, PBKDF2 is the Web-Crypto-native KDF and is adequate to guard a KITCHEN
// device (physical possession + the operator's own iPad, not a bank) — non-reversible, and the iterations
// meaningfully slow an offline brute-force of a 4–6 digit PIN without making a real unlock feel slow.
// crypto.subtle needs a SECURE CONTEXT — the app runs on https://hatchgrab.com so it's present (it would be
// absent over http-LAN, which the app never uses in production). Enabling app-lock REQUIRES a PIN (enforced
// in OperatorDeviceConfig) — a biometric-only lock is exactly how an operator gets permanently locked out.
async function pbkdf2(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin) as BufferSource, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' }, key, 256)
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

/** Store (or replace) the backup unlock PIN. Persists PBKDF2(pin, random salt) — never the PIN. */
export async function setAppLockPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(pin, salt)
  await Preferences.set({ key: PIN_KEY, value: JSON.stringify({ salt: toB64(salt), hash }) })
}
export async function hasAppLockPin(): Promise<boolean> {
  try { return !!(await Preferences.get({ key: PIN_KEY })).value } catch { return false }
}
/** Offline verify — Preferences read + Web-Crypto hash; NO network/biometric/plugin. */
export async function verifyAppLockPin(pin: string): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: PIN_KEY })
    if (!value) return false
    const { salt, hash } = JSON.parse(value) as { salt: string; hash: string }
    return (await pbkdf2(pin, fromB64(salt))) === hash
  } catch { return false }
}
export async function clearAppLockPin(): Promise<void> { try { await Preferences.remove({ key: PIN_KEY }) } catch {} }

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
