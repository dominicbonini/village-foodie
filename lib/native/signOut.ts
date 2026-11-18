import { isNativeApp } from './device'
import { nativeSignOut } from './session'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { beginUserSignOut } from '@/lib/auth/session-observer'

/**
 * Single native-aware sign-out for every operator surface (dashboard UserMenu, manage, admin).
 *
 * NATIVE app: clears the PREFERENCES-backed native session (nativeSignOut) — the cookie signOut a web
 * client does is a no-op in the app because there's no cookie, which is exactly why manage/admin sign-out
 * previously left the native session intact (user never actually signed out). Then SOFT-routes to /login
 * via the passed router so the user stays inside the webview and lands on the app login (no hard reload to
 * the raw web page).
 *
 * WEB: cookie signOut + a hard window.location nav to /login.
 *
 * 🔴 BOTH END THIS DEVICE'S SESSION ONLY (dashboard-auth-3, 18 November 2026): scope 'local'. The default ('global') ended
 * every session of the account — on a truck that shares the owner's login, the kitchen iPad too. Every other device stays
 * signed in. (A password reset still signs out everywhere: app/(app)/reset-password/page.tsx.)
 *
 * `router` only needs `.replace()`; typed structurally so callers can pass Next's useRouter() result
 * without importing its type.
 */
export async function operatorSignOut(router: { replace: (href: string) => void }): Promise<void> {
  // ── 🔴 DECLARE THE INTENT BEFORE CAUSING THE EVENT. ──────────────────────────────────────────────
  // auth-js fires an identical `SIGNED_OUT` for this and for a rejected refresh token; nothing on the
  // event distinguishes them, so the difference has to be stated, not inferred. This is the ONLY caller
  // of beginUserSignOut(), and this function is the ONLY sign-out control (UserMenu, manage, admin all
  // route through it) — so "flag set" and "the operator asked" are the same fact.
  // ⚠️ BEFORE the await, not after: the event fires during signOut(), so setting it afterwards would
  // race the observer and show a banner on the way out the door.
  beginUserSignOut()
  if (isNativeApp()) {
    await nativeSignOut()
    router.replace('/login')
    return
  }
  const supabase = createSupabaseBrowserClient()
  await supabase.auth.signOut({ scope: 'local' })
  window.location.href = '/login'
}
