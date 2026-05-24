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

  // Find the operator record for this user
  const { data: operator } = await supabaseAdmin
    .from('operators')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!operator) redirect('/login')

  // Find their truck
  const { data: truck } = await supabaseAdmin
    .from('trucks')
    .select('dashboard_token')
    .eq('operator_id', operator.id)
    .eq('active', true)
    .single()

  if (!truck) redirect('/login')

  redirect(`/dashboard/${truck.dashboard_token}`)
}
