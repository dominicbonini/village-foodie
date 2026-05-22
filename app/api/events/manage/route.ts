import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const status = req.nextUrl.searchParams.get('status') // optional filter
  const upcoming = req.nextUrl.searchParams.get('upcoming') // 'true' for future only

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const { data: truck } = await supabase
    .from('trucks')
    .select('id')
    .eq('dashboard_token', token)
    .single()

  if (!truck) return NextResponse.json({ error: 'Truck not found' }, { status: 404 })

  let query = supabase
    .from('truck_events')
    .select('*')
    .eq('truck_id', truck.id)
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (status) query = query.eq('status', status)
  if (upcoming === 'true') {
    const today = new Date().toISOString().split('T')[0]
    query = query.gte('event_date', today)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data })
}
