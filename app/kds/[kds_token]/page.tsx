import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function VanKdsPage({
  params,
}: {
  params: Promise<{ kds_token: string }>
}) {
  const { kds_token } = await params

  const { data: van } = await supabase
    .from('truck_vans')
    .select('id, name, truck_id, active')
    .eq('kds_token', kds_token)
    .single()

  if (!van || !van.active) redirect('/login')

  const { data: truck } = await supabase
    .from('trucks')
    .select('dashboard_token, active')
    .eq('id', van.truck_id)
    .single()

  if (!truck || !truck.active) redirect('/login')

  redirect(
    `/dashboard/${truck.dashboard_token}/kds?van_id=${van.id}&van_name=${encodeURIComponent(van.name)}`
  )
}
