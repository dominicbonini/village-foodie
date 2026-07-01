import { isNativeApp } from './device'
import { nativeSignOut } from './session'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Single native-aware sign-out for every operator surface (dashboard UserMenu, manage, admin).
 *
 * NATIVE app: clears the PREFERENCES-backed native session (nativeSignOut) — the cookie signOut a web
 * client does is a no-op in the app because there's no cookie, which is exactly why manage/admin sign-out
 * previously left the native session intact (user never actually signed out). Then SOFT-routes to /login
 * via the passed router so the user stays inside the webview and lands on the app login (no hard reload to
 * the raw web page).
 *
 * WEB: byte-for-byte the old behaviour — cookie signOut + a hard window.location nav to /login.
 *
 * `router` only needs `.replace()`; typed structurally so callers can pass Next's useRouter() result
 * without importing its type.
 */
export async function operatorSignOut(router: { replace: (href: string) => void }): Promise<void> {
  if (isNativeApp()) {
    await nativeSignOut()
    router.replace('/login')
    return
  }
  const supabase = createSupabaseBrowserClient()
  await supabase.auth.signOut()
  window.location.href = '/login'
}
