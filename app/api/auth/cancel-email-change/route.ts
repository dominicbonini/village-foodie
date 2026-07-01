import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const supabaseAuth = await createSupabaseServerClient()
  let { data: { user } } = await supabaseAuth.auth.getUser()   // WEB (cookie) — unchanged, resolves first
  // ADDITIVE (native app): no cookie, but sends its Supabase session as a Bearer. Only reached when there's
  // no cookie user AND an Authorization header is present; a browser never enters it → web path unchanged.
  if (!user) {
    const authz = req.headers.get('authorization')
    const jwt = authz?.startsWith('Bearer ') ? authz.slice(7) : null
    if (jwt) {
      const { data: { user: bearerUser } } = await supabase.auth.getUser(jwt)
      if (bearerUser) user = bearerUser
    }
  }
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { changeId } = await req.json()
  if (!changeId) return NextResponse.json({ error: 'changeId required' }, { status: 400 })

  const { data: operator } = await supabase
    .from('operators')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!operator) return NextResponse.json({ error: 'Operator not found' }, { status: 404 })

  const { error } = await supabase
    .from('operator_email_changes')
    .delete()
    .eq('id', changeId)
    .eq('operator_id', operator.id)
    .is('verified_at', null)

  if (error) {
    console.error('[cancel-email-change] delete failed:', error)
    return NextResponse.json({ error: 'Failed to cancel change' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
