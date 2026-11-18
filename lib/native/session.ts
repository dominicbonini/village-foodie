// Native PERSISTENT Supabase session (plan a). Backed by @capacitor/preferences (native UserDefaults) with
// auto-refresh → the operator "logs in once, immediate access thereafter". WEB is unchanged (it uses the
// cookie @supabase/ssr client). Singleton so the session is shared. Server-authed native endpoints
// (/api/native/my-trucks, switch-truck) receive this session as a Bearer access token — the native session
// lives in Preferences, not cookies, so the server can't read it any other way.
//
// Storage is @capacitor/preferences rather than localStorage: in the WKWebView remote-URL shell,
// localStorage did NOT survive the hard /login → /app → dashboard navigation, so the session vanished →
// hasNativeSession() false → login loop. Preferences persists across navigations and cold-kills. See
// ./preferencesStorage. persistSession/autoRefreshToken/storageKey are unchanged; only the backend differs.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isNativeApp } from './device'
import { preferencesAuthStorage } from './preferencesStorage'

let _client: SupabaseClient | null = null
/** Where the app keeps its session (Preferences). */
export const NATIVE_AUTH_STORAGE_KEY = 'hg-native-auth'

export function getNativeSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // distinct storageKey so it never clashes with the web cookie client's keys; Preferences-backed
      // storage so the session survives WKWebView navigations + cold-kill (see file header).
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: NATIVE_AUTH_STORAGE_KEY, storage: preferencesAuthStorage } },
    )
  }
  return _client
}

export async function hasNativeSession(): Promise<boolean> {
  if (!isNativeApp()) return false
  const { data } = await getNativeSupabase().auth.getSession()
  return !!data.session
}

export async function getNativeAccessToken(): Promise<string | null> {
  if (!isNativeApp()) return null
  const { data } = await getNativeSupabase().auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Authorization header for calls to shared endpoints (e.g. /api/dashboard) so the NATIVE app can identify
 * the logged-in operator/admin (it has no cookie). Returns {} on web / when there's no session → the
 * endpoint's existing cookie + token-only behaviour is completely unaffected.
 */
export async function nativeAuthHeader(): Promise<Record<string, string>> {
  const t = await getNativeAccessToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

/** LOGOUT = clear the SESSION only. Does NOT touch van_devices — the device stays pinned to its
 *  truck/van/screen so the next person lands on the same device config. */
export async function nativeSignOut(): Promise<void> {
  // 🔴 dashboard-auth-3 (18 November 2026): THIS DEVICE ONLY. `signOut()` with no options is scope 'global' — it ended every
  // session of the account, so a kitchen iPad sharing the owner's login lost its session when the owner signed out on a phone.
  // 'local' revokes only this device's session; every other device stays signed in.
  // ⚠️ AND THE STORED SESSION IS ALWAYS CLEARED. auth-js keeps the session when the server call fails (offline, a 5xx) and
  // returns an error instead of throwing; "Sign out" must still sign THIS device out, so the stored session (and its PKCE
  // verifier) is removed by hand in that case. Face ID / Touch ID app lock is separate (lib/native/appLock.ts) and untouched.
  let cleared = false
  try { const { error } = await getNativeSupabase().auth.signOut({ scope: 'local' }); cleared = !error } catch {}
  if (!cleared) {
    try { await preferencesAuthStorage.removeItem(NATIVE_AUTH_STORAGE_KEY) } catch {}
    try { await preferencesAuthStorage.removeItem(`${NATIVE_AUTH_STORAGE_KEY}-code-verifier`) } catch {}
  }
}
