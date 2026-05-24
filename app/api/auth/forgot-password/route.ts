import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL!

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
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

  // Send reset email via Brevo
  const resetUrl = `${BASE_URL}/reset-password?token=${token}`

  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <img src="${BASE_URL}/logos/village-foodie-logo-v2.png"
           width="160" style="margin-bottom:24px;display:block;"/>
      <h2 style="color:#0f172a;margin:0 0 16px;">Reset your password</h2>
      <p>We received a request to reset the password for your Village Foodie account.</p>
      <p>Click the button below to choose a new password. This link expires in 1 hour.</p>
      <p style="margin:32px 0;">
        <a href="${resetUrl}"
           style="background:#0f9488;color:white;padding:14px 28px;
                  text-decoration:none;border-radius:8px;font-weight:bold;
                  display:inline-block;">
          Reset password
        </a>
      </p>
      <p style="color:#64748b;font-size:13px;">
        If you didn't request this, you can safely ignore this email.
        Your password won't change until you click the link above.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
      <p style="color:#94a3b8;font-size:12px;">Village Foodie</p>
    </div>
  `

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Village Foodie', email: 'hello@villagefoodie.co.uk' },
      to: [{ email: operator.email }],
      replyTo: { email: 'hello@villagefoodie.co.uk' },
      subject: 'Reset your Village Foodie password',
      htmlContent: html,
    }),
  })

  return NextResponse.json({ ok: true })
}
