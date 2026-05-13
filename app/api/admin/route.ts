// app/api/admin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function checkAuth(secret: string) {
  return secret === process.env.ADMIN_SECRET
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') || ''
  if (!checkAuth(secret)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: trucks } = await supabase.from('trucks').select('id,name,slug,plan,is_active,auto_accept,contact_email,onboarded_at').order('name')
  return NextResponse.json({ trucks: trucks || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { secret, truckId, ...updates } = body
  if (!checkAuth(secret)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const allowed = ['plan','is_active','auto_accept','onboarded_at']
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))
  const { error } = await supabase.from('trucks').update(safe).eq('id', truckId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}