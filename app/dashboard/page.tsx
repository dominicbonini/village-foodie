import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { DashboardIndexNativeFallback } from '@/components/native/DashboardIndexNativeFallback'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function DashboardIndexPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // No COOKIE session. WEB → /login (as before). NATIVE app (no cookie, but a native localStorage session)
  // → the fallback routes to /app instead of /login, breaking the cookie-vs-native login loop. The fallback
  // itself sends a logged-out web user to /login, so the web outcome is unchanged; only native diverges.
  if (!user) return <DashboardIndexNativeFallback />

  // ── Admin: platform admins (operators.is_admin) go straight to the admin console, BYPASSING the
  //    operator owner-path below. MUST run first — an admin who owns 0 or 2+ active trucks would
  //    otherwise null the trucks lookup and bounce to /login (the "blank"). .maybeSingle(): 0-or-1
  //    operator row, tolerates null without a spurious multi-row error.
  const { data: operator } = await supabaseAdmin
    .from('operators')
    .select('id, is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (operator?.is_admin) redirect('/admin')

  // ── Owner path: operators → trucks.operator_id. LIST (not .single()) so 2+ active trucks can't
  //    null-and-bounce: 0 → fall through to staff path; 1 → that truck; 2+ → first deterministically
  //    (order by created_at). A proper multi-truck PICKER is the backlogged future fix.
  if (operator) {
    const { data: trucks } = await supabaseAdmin
      .from('trucks')
      .select('dashboard_token')
      .eq('operator_id', operator.id)
      .eq('active', true)
      .order('created_at', { ascending: true })

    if (trucks && trucks.length > 0) redirect(`/dashboard/${trucks[0].dashboard_token}`)
  }

  // ── Staff path: truck_users → trucks. LIST (not .single()) — a user can belong to 2+ trucks
  //    (invited to multiple), which would null .single() → bounce. 0 → no membership; 1 → resolve;
  //    2+ → first deterministically (order by created_at). Multi-truck PICKER is backlogged.
  const { data: truckUsers } = await supabaseAdmin
    .from('truck_users')
    .select(`
      id, role,
      trucks!truck_id (
        dashboard_token,
        active
      ),
      truck_user_vans (
        van_id,
        truck_vans ( kds_token )
      )
    `)
    .eq('auth_user_id', user.id)
    .order('created_at', { ascending: true })

  const truckUser = truckUsers?.[0]
  if (truckUser) {
    const truck = truckUser.trucks as any
    if (!truck?.active) redirect('/login')

    // Staff with exactly one van assigned → go straight to that van's KDS
    if (truckUser.role === 'staff') {
      const vanAccess = truckUser.truck_user_vans as any[]
      if (vanAccess?.length === 1) {
        const kdsToken = vanAccess[0]?.truck_vans?.kds_token
        if (kdsToken) redirect(`/kds/${kdsToken}`)
      }
    }

    // Manager or staff with multiple vans / no van restriction → full dashboard
    redirect(`/dashboard/${truck.dashboard_token}`)
  }

  // Authenticated, but NO resolvable surface (not an admin, owns no active truck, no truck_users
  // membership) → send to login. (Future: a clearer "no truck found" page rather than a login bounce.)
  redirect('/login')
}
