import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// Language Phase 1c: a refusal of ours is `{ error, code, params }` (lib/i18n/onboarding-errors.ts). No truck is
// known on this route, so its words are en-GB (docs/language-phase-1c-report.md).
import { onboardingErrorBody } from '@/lib/i18n/onboarding-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { token, password } = await req.json()

  if (!token || !password) {
    return NextResponse.json(
      onboardingErrorBody(DEFAULT_LOCALE, 'token_and_password_required'),
      { status: 400 }
    )
  }

  // ⚠️ This route's sentence has no full stop; signup's has one (app/api/signup/route.ts) — kept, two codes.
  if (password.length < 8) {
    return NextResponse.json(
      onboardingErrorBody(DEFAULT_LOCALE, 'new_password_too_short', { min: 8 }),
      { status: 400 }
    )
  }

  const { data: resetToken } = await supabase
    .from('password_reset_tokens')
    .select('id, operator_id, expires_at, used_at')
    .eq('token', token)
    .single()

  if (!resetToken) {
    return NextResponse.json(
      onboardingErrorBody(DEFAULT_LOCALE, 'reset_link_invalid'),
      { status: 400 }
    )
  }

  if (resetToken.used_at) {
    return NextResponse.json(
      onboardingErrorBody(DEFAULT_LOCALE, 'reset_link_used'),
      { status: 400 }
    )
  }

  if (new Date(resetToken.expires_at) < new Date()) {
    return NextResponse.json(
      onboardingErrorBody(DEFAULT_LOCALE, 'reset_link_expired'),
      { status: 400 }
    )
  }

  const { data: operator } = await supabase
    .from('operators')
    .select('id, email, auth_user_id')
    .eq('id', resetToken.operator_id)
    .single()

  if (!operator?.auth_user_id) {
    return NextResponse.json(
      onboardingErrorBody(DEFAULT_LOCALE, 'account_not_found'),
      { status: 400 }
    )
  }

  console.log('[reset-password] updating auth user:', {
    auth_user_id: operator.auth_user_id,
    operator_email: operator.email,
    operator_id: operator.id,
  })

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    operator.auth_user_id,
    {
      password,
      user_metadata: { must_change_password: false },
    }
  )

  if (updateError) {
    return NextResponse.json(
      onboardingErrorBody(DEFAULT_LOCALE, 'password_update_failed'),
      { status: 500 }
    )
  }

  // Mark token as used
  await supabase
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', resetToken.id)

  // Accept invite: set accepted_at on any pending truck_users row for this auth account
  await supabase
    .from('truck_users')
    .update({ accepted_at: new Date().toISOString() })
    .eq('auth_user_id', operator.auth_user_id)
    .is('accepted_at', null)

  return NextResponse.json({ ok: true })
}
