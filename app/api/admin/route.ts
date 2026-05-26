// app/api/admin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PLAN_META, type Plan } from '@/lib/features'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function checkAuth(secret: string) {
  return secret === process.env.ADMIN_SECRET
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') || ''
  if (!checkAuth(secret)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const section = req.nextUrl.searchParams.get('section')

  if (section === 'discovery') {
    const { data: discoveryTrucks } = await supabase
      .from('discovery_trucks')
      .select('id, name, visibility, hatchgrab_truck_id, exclude_reason')
      .order('name')
    return NextResponse.json({ discoveryTrucks: discoveryTrucks || [] })
  }

  const { data: trucks } = await supabase
    .from('trucks')
    .select('id,name,plan,trial_expires_at,feature_overrides,active,auto_accept,contact_email,onboarded_at,operator_id,is_test')
    .order('name')
  return NextResponse.json({ trucks: trucks || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { secret, truckId, discoveryTruckId, ...updates } = body
  if (!checkAuth(secret)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Discovery truck update (visibility only)
  if (discoveryTruckId) {
    const allowed = ['visibility']
    const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
    const { error } = await supabase.from('discovery_trucks').update(safe).eq('id', discoveryTruckId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  // Operator truck update
  if (updates.plan) {
    const validPlans = Object.keys(PLAN_META) as Plan[]
    if (!validPlans.includes(updates.plan)) {
      return NextResponse.json({ error: `Invalid plan: ${updates.plan}` }, { status: 400 })
    }
  }

  const allowed = ['plan', 'active', 'auto_accept', 'onboarded_at', 'trial_expires_at', 'feature_overrides', 'is_test']
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
  const { error } = await supabase.from('trucks').update(safe).eq('id', truckId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
