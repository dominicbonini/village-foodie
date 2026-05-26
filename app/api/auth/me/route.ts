import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()

  if (!user) return NextResponse.json({ name: null })

  const { data: operator } = await supabase
    .from('operators')
    .select('name, email')
    .eq('auth_user_id', user.id)
    .single()

  if (operator) {
    return NextResponse.json({ name: operator.name || operator.email || null })
  }

  const { data: truckUser } = await supabase
    .from('truck_users')
    .select('name, email')
    .eq('auth_user_id', user.id)
    .single()

  if (truckUser) {
    return NextResponse.json({ name: truckUser.name || truckUser.email || null })
  }

  return NextResponse.json({ name: user.email || null })
}
