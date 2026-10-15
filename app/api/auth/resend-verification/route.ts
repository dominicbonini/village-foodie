import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
// Language Phase 1c: a refusal of ours is `{ error, code, params }` (lib/i18n/onboarding-errors.ts). No truck is
// known on this route, so its words are en-GB (docs/language-phase-1c-report.md).
import { onboardingErrorBody } from '@/lib/i18n/onboarding-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
// The verification email's words: messages/en-GB.json `emailAccount` (Language Phase 1c), in en-GB — the operator's
// language is not known on this route (docs/language-phase-1c-report.md). The markup and the link stay here.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/emailAccount'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
  if (!user) return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'unauthorised'), { status: 401 })

  const { changeId } = await req.json()
  if (!changeId) return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'change_id_required'), { status: 400 })

  const { data: change } = await supabase
    .from('operator_email_changes')
    .select('id, operator_id, new_email, token, expires_at, verified_at')
    .eq('id', changeId)
    .single()

  if (!change) return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'verification_request_not_found'), { status: 404 })
  if (change.verified_at) return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'email_already_verified'), { status: 400 })

  // Verify ownership
  const { data: operator } = await supabase
    .from('operators')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!operator || operator.id !== change.operator_id) {
    return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'unauthorised'), { status: 401 })
  }

  // Extend expiry by 24 hours
  const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await supabase
    .from('operator_email_changes')
    .update({ expires_at: newExpiry })
    .eq('id', changeId)

  const verifyUrl = `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/verify-email?token=${change.token}`
  const t = translatorFor(DEFAULT_LOCALE, 'emailAccount')

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'HatchGrab', email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hello@villagefoodie.co.uk' },
      to: [{ email: change.new_email }],
      subject: t('newEmail.subject'),
      htmlContent: `
        <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
          <h2 style="color:#0f172a;">${t('newEmail.heading')}</h2>
          <p>${t('resendVerification.requested')}</p>
          <p>${t('resendVerification.click')}</p>
          <p style="margin:32px 0;">
            <a href="${verifyUrl}"
               style="background:#ea580c;color:white;padding:14px 28px;
                      text-decoration:none;border-radius:8px;font-weight:bold;
                      display:inline-block;">
              ${t('newEmail.button')}
            </a>
          </p>
          <p style="color:#64748b;font-size:13px;">
            ${t('resendVerification.ignore')}
            ${t('resendVerification.stillActive')}
          </p>
        </div>
      `,
    }),
  })

  if (!brevoRes.ok) {
    const brevoError = await brevoRes.text()
    console.error('[resend-verification] Brevo failed:', brevoRes.status, brevoError)
    return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'email_send_failed'), { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
