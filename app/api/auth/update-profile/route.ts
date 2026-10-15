import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
// Language Phase 1c: a refusal of ours is `{ error, code, params }` (lib/i18n/onboarding-errors.ts). No truck is
// known on this route, so its words are en-GB (docs/language-phase-1c-report.md).
import { onboardingErrorBody } from '@/lib/i18n/onboarding-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { createClient } from '@supabase/supabase-js'

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
  if (!user) return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'unauthenticated'), { status: 401 })

  const { name, first_name, last_name, phone } = await req.json()

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name.trim()
  if (first_name !== undefined) updates.first_name = first_name
  if (last_name !== undefined) updates.last_name = last_name
  if (phone !== undefined) updates.phone = phone

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'no_fields_to_update'), { status: 400 })
  }

  // Update operators table if exists
  const { data: operator } = await supabase
    .from('operators')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (operator) {
    await supabase.from('operators').update(updates).eq('id', operator.id)
  }

  // Update truck_users (name only — no first_name/phone columns there)
  if (updates.name) {
    const { data: truckUser } = await supabase
      .from('truck_users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (truckUser) {
      await supabase.from('truck_users').update({ name: updates.name }).eq('id', truckUser.id)
    }
  }

  return NextResponse.json({ ok: true, name: updates.name || null })
}
