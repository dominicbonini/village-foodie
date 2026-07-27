// app/api/demo/build-request/route.ts
// "We'll build your menu for you" — the §11 fallback that is a PROMISE OF HUMAN WORK.
//
// ⚠️ FULFILMENT IS UNDECIDED (spec O5). This route does the one thing that must not be skipped: it captures
// the email and puts the request somewhere a human will actually see it. It deliberately does NOT pretend
// to more than that — there is no leads table, no queue, no SLA, and no tracking of whether the promise was
// kept. At low volume an email to the team inbox is genuinely sufficient; at scale it is not, and the copy
// on the client side is written to promise only "we'll be in touch", never a timeframe.
//
// If/when fulfilment is designed, the likely shape is a `demo_build_requests` table (email, truck_id,
// created_at, status) so requests can be worked through and closed off — that needs a migration and a
// decision about who works the queue, so it is NOT invented here.

import { NextRequest, NextResponse } from 'next/server'
import { HATCHGRAB_SENDER } from '@/lib/email-config'
import { demoRatelimit } from '@/lib/ratelimit'

// Same shape as lib/contact-validation's rule, inlined to keep this route dependency-light.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let email = ''
  let truckId = ''
  try {
    const body = await req.json()
    email = typeof body.email === 'string' ? body.email.trim() : ''
    truckId = typeof body.truckId === 'string' ? body.truckId.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Could not read that.' }, { status: 400 })
  }

  if (!EMAIL_RE.test(email) || email.length > 320) {
    return NextResponse.json({ error: 'That doesn’t look like an email address.' }, { status: 400 })
  }

  // Shares the demo bucket: this is reached from the same failure screen, and someone hammering it is the
  // same someone. Fails open for the same reason.
  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd ? fwd.split(',')[0].trim() : '127.0.0.1'
  const isDev = process.env.NODE_ENV !== 'production'
  if (!isDev && fwd) {
    try {
      const { success } = await demoRatelimit.limit(`build:${ip}`)
      if (!success) return NextResponse.json({ error: 'Please try again shortly.' }, { status: 429 })
    } catch (err) {
      console.error('[demo/build-request] rate-limit check failed, allowing through:', err)
    }
  }

  // Log FIRST and unconditionally. If Brevo is down or unconfigured, the request must still be recoverable
  // from the function logs rather than silently lost — this is a promise to a real person.
  console.warn(`[demo/build-request] MENU BUILD REQUESTED email=${email} truckId=${truckId || 'none'}`)

  const apiKey = process.env.BREVO_API_KEY
  const to = HATCHGRAB_SENDER.replyTo
  if (apiKey && to) {
    try {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
          to: [{ email: to }],
          subject: '🛠 Menu build requested (demo)',
          htmlContent:
            `<div style="font-family:Arial,sans-serif;color:#334155">
              <h2 style="color:#0f172a">Someone asked us to build their menu</h2>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Demo truck:</strong> ${truckId || '—'}</p>
              <p style="color:#64748b;font-size:13px">Their menu photo could not be read automatically.
              This is a promise of human work — reply to them.</p>
            </div>`,
        }),
      })
    } catch (err) {
      console.error('[demo/build-request] team notification failed (request IS in the logs above):', err)
    }
  } else {
    console.warn('[demo/build-request] BREVO_API_KEY unset — request captured in logs only')
  }

  return NextResponse.json({ ok: true })
}
