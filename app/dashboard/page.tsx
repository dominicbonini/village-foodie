import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function DashboardIndexPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // ── Owner path: operators → trucks.operator_id ────────────────
  const { data: operator } = await supabaseAdmin
    .from('operators')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (operator) {
    const { data: truck } = await supabaseAdmin
      .from('trucks')
      .select('dashboard_token')
      .eq('operator_id', operator.id)
      .eq('active', true)
      .single()

    if (truck) redirect(`/dashboard/${truck.dashboard_token}`)
  }

  // ── Staff path: truck_users → trucks ──────────────────────────
  const { data: truckUser } = await supabaseAdmin
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
    .single()

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

  // No truck found for this user
  redirect('/login')
}
