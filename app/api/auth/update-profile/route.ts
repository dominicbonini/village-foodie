import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const trimmed = name.trim()

  // Update operators table if exists
  const { data: operator } = await supabase
    .from('operators')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (operator) {
    await supabase.from('operators').update({ name: trimmed }).eq('id', operator.id)
  }

  // Update truck_users table if exists
  const { data: truckUser } = await supabase
    .from('truck_users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (truckUser) {
    await supabase.from('truck_users').update({ name: trimmed }).eq('id', truckUser.id)
  }

  return NextResponse.json({ ok: true, name: trimmed })
}
