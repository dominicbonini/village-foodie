import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const supabaseAuth = await createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { changeId } = await req.json()
  if (!changeId) return NextResponse.json({ error: 'changeId required' }, { status: 400 })

  const { data: change } = await supabase
    .from('operator_email_changes')
    .select('id, operator_id, new_email, token, expires_at, verified_at')
    .eq('id', changeId)
    .single()

  if (!change) return NextResponse.json({ error: 'Verification request not found' }, { status: 404 })
  if (change.verified_at) return NextResponse.json({ error: 'Email already verified' }, { status: 400 })

  // Verify ownership
  const { data: operator } = await supabase
    .from('operators')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!operator || operator.id !== change.operator_id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Extend expiry by 24 hours
  const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await supabase
    .from('operator_email_changes')
    .update({ expires_at: newExpiry })
    .eq('id', changeId)

  const verifyUrl = `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/verify-email?token=${change.token}`

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
      subject: 'Verify your new HatchGrab email address',
      htmlContent: `
        <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
          <h2 style="color:#0f172a;">Verify your email address</h2>
          <p>You requested to change your HatchGrab email to this address.</p>
          <p>Click below to verify. This link expires in 24 hours.</p>
          <p style="margin:32px 0;">
            <a href="${verifyUrl}"
               style="background:#ea580c;color:white;padding:14px 28px;
                      text-decoration:none;border-radius:8px;font-weight:bold;
                      display:inline-block;">
              Verify email address
            </a>
          </p>
          <p style="color:#64748b;font-size:13px;">
            If you didn't request this, ignore this email.
            Your current email remains active.
          </p>
        </div>
      `,
    }),
  })

  if (!brevoRes.ok) {
    const brevoError = await brevoRes.text()
    console.error('[resend-verification] Brevo failed:', brevoRes.status, brevoError)
    return NextResponse.json({ error: 'Failed to send email. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
