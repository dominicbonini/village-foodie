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

export function getNativeSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      // distinct storageKey so it never clashes with the web cookie client's keys; Preferences-backed
      // storage so the session survives WKWebView navigations + cold-kill (see file header).
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hg-native-auth', storage: preferencesAuthStorage } },
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
  try { await getNativeSupabase().auth.signOut() } catch {}
}
