import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { HATCHGRAB_SENDER } from '@/lib/email-config'
// Language Phase 1c: a refusal of ours is `{ error, code, params }` (lib/i18n/onboarding-errors.ts). No truck is
// known on this route, so its words are en-GB (docs/language-phase-1c-report.md).
import { onboardingErrorBody } from '@/lib/i18n/onboarding-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
// The reset email's words: messages/en-GB.json `emailAccount` (Language Phase 1c), in en-GB — the operator's
// language is not known on this route (docs/language-phase-1c-report.md). The markup and the link stay here.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/emailAccount'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HG_URL = process.env.NEXT_PUBLIC_HATCHGRAB_URL!

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'email_required'), { status: 400 })
  }

  const { data: operator } = await supabase
    .from('operators')
    .select('id, email')
    .eq('email', email.toLowerCase().trim())
    .single()

  // Always return success — prevents email enumeration
  if (!operator) {
    return NextResponse.json({ ok: true })
  }

  // Generate secure random token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  // Invalidate any existing unused tokens for this operator
  await supabase
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('operator_id', operator.id)
    .is('used_at', null)

  // Store new token
  await supabase
    .from('password_reset_tokens')
    .insert({
      operator_id: operator.id,
      token,
      expires_at: expiresAt.toISOString(),
    })

  // Reset link points to HatchGrab (operator platform)
  const resetUrl = `${HG_URL}/reset-password?token=${token}`
  const t = translatorFor(DEFAULT_LOCALE, 'emailAccount.passwordReset')

  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <h2 style="color:#0f172a;margin:0 0 16px;">${t('heading')}</h2>
      <p>${t('requested')}</p>
      <p>${t('click')}</p>
      <p style="margin:32px 0;">
        <a href="${resetUrl}"
           style="background:#ea580c;color:white;padding:14px 28px;
                  text-decoration:none;border-radius:8px;font-weight:bold;
                  display:inline-block;">
          ${t('button')}
        </a>
      </p>
      <p style="color:#64748b;font-size:13px;">
        ${t('ignore')}
        ${t('unchanged')}
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
      <p style="color:#94a3b8;font-size:12px;">HatchGrab</p>
    </div>
  `

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
      to: [{ email: operator.email }],
      replyTo: { email: HATCHGRAB_SENDER.replyTo },
      subject: t('subject'),
      htmlContent: html,
    }),
  })

  if (!brevoRes.ok) {
    const brevoError = await brevoRes.text()
    console.error('[forgot-password] Brevo send failed:', brevoRes.status, brevoError)
    // Clean up the token — email not sent, user can't use it, don't block retries
    await supabase.from('password_reset_tokens').delete().eq('token', token)
    return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'reset_email_failed'), { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
