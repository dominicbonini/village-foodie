import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
  const supabaseAuth = await createSupabaseServerClient()
  let { data: { user } } = await supabaseAuth.auth.getUser()   // WEB (cookie) — unchanged, resolves first
  // ADDITIVE (native app): no cookie, but sends its Supabase session as a Bearer so is_admin + identity flow
  // to the app. Only reached when there's no cookie user AND an Authorization header is present; a browser
  // never enters this branch → the web path (and its logged-out null response) is byte-for-byte unchanged.
  if (!user) {
    const authz = req.headers.get('authorization')
    const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
    if (jwt) {
      const { data: { user: bearerUser } } = await supabase.auth.getUser(jwt)
      if (bearerUser) user = bearerUser
    }
  }

  if (!user) return NextResponse.json({ name: null, email: null, first_name: null, last_name: null, phone: null })

  const { data: operator } = await supabase
    .from('operators')
    .select('name, email, first_name, last_name, phone, is_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (operator) {
    return NextResponse.json({
      name: operator.name || operator.email || null,
      email: operator.email || null,
      first_name: operator.first_name || null,
      last_name: operator.last_name || null,
      phone: operator.phone || null,
      is_admin: operator.is_admin ?? false,
    })
  }

  const { data: truckUser } = await supabase
    .from('truck_users')
    .select('name, email')
    .eq('auth_user_id', user.id)
    .single()

  if (truckUser) {
    return NextResponse.json({ name: truckUser.name || truckUser.email || null, email: user.email || null, first_name: null, last_name: null, phone: null, is_admin: false })
  }

  return NextResponse.json({ name: user.email || null, email: user.email || null, first_name: null, last_name: null, phone: null, is_admin: false })
}
