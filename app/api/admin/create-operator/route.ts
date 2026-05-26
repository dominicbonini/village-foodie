import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { HATCHGRAB_SENDER, HATCHGRAB_LOGO_URL } from '@/lib/email-config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 12 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

export async function POST(req: NextRequest) {
  const { secret, truckId, email } = await req.json()

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Fetch truck name for welcome email
  const { data: truckData } = await supabase
    .from('trucks')
    .select('name')
    .eq('id', truckId)
    .single()
  const truckName = truckData?.name || 'your truck'

  const tempPassword = generateTempPassword()

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Create operator record
  const { data: operator, error: opError } = await supabase
    .from('operators')
    .insert({
      auth_user_id: authData.user.id,
      email,
      name: email.split('@')[0],
    })
    .select('id')
    .single()

  if (opError) {
    return NextResponse.json({ error: opError.message }, { status: 500 })
  }

  // Link operator to truck
  const { error: truckError } = await supabase
    .from('trucks')
    .update({ operator_id: operator.id })
    .eq('id', truckId)

  if (truckError) {
    console.error('Failed to link operator to truck:', truckError.message)
    return NextResponse.json({
      ok: true,
      tempPassword,
      operatorId: operator.id,
      warning: 'Account created but truck link failed: ' + truckError.message,
    })
  }

  // Send welcome email via Brevo
  const hgUrl = process.env.NEXT_PUBLIC_HATCHGRAB_URL
  const loginUrl = `${hgUrl}/login`

  const welcomeHtml = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <img src="${HATCHGRAB_LOGO_URL}"
           width="180" style="margin-bottom:24px;display:block;"/>
      <h2 style="color:#0f172a;">Welcome to HatchGrab 🚚</h2>
      <p>Hi there,</p>
      <p>Your HatchGrab dashboard for <strong>${truckName}</strong> is ready.</p>
      <p style="margin:24px 0;">
        <a href="${loginUrl}"
           style="background:#ea580c;color:white;padding:14px 28px;
                  text-decoration:none;border-radius:8px;font-weight:bold;
                  display:inline-block;">
          Open your dashboard
        </a>
      </p>
      <p><strong>Your login details:</strong></p>
      <p>Email: ${email}<br/>
      Temporary password: <code style="background:#f1f5f9;padding:2px 6px;
                                       border-radius:4px;">${tempPassword}</code></p>
      <p>You'll be asked to set a new password when you first log in.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
      <p><strong>Three things to do first:</strong></p>
      <ol>
        <li>Check your menu looks right</li>
        <li>Confirm your next event so customers can pre-order</li>
        <li>Add the dashboard to your iPad home screen for the kitchen display</li>
      </ol>
      <p>Welcome aboard,<br/>Dominic<br/>HatchGrab</p>
    </div>
  `

  if (process.env.BREVO_API_KEY) {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
        to: [{ email }],
        replyTo: { email: HATCHGRAB_SENDER.replyTo },
        subject: 'Your HatchGrab dashboard is ready 🚚',
        htmlContent: welcomeHtml,
      }),
    }).catch(err => console.error('Welcome email failed:', err))
  } else {
    console.warn('BREVO_API_KEY not set — welcome email skipped')
  }

  return NextResponse.json({ ok: true, tempPassword, operatorId: operator.id })
}
