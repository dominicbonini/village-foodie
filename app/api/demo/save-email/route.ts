// app/api/demo/save-email/route.ts
// Stage 4 — the optional email capture, framed as SAVING what they already have.
//
// Authenticated by the demo's own dashboard_token, which the caller already holds (it's in their URL).
// That token is the demo's entire credential, so nothing weaker is needed and nothing stronger exists.
// Scoped hard to `demo-` trucks: a real operator's token must never reach this path.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'
import { saveDemoEmail, markReturnEmailSent, RETENTION_WITH_EMAIL_DAYS } from '@/lib/demo-session'
import { HATCHGRAB_SENDER, HATCHGRAB_LOGO_URL } from '@/lib/email-config'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export async function POST(req: NextRequest) {
  let token = ''
  let slug = ''
  let email = ''
  try {
    const body = await req.json()
    token = typeof body.token === 'string' ? body.token.trim() : ''
    slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    email = typeof body.email === 'string' ? body.email.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Could not read that.' }, { status: 400 })
  }

  if (!EMAIL_RE.test(email) || email.length > 320) {
    return NextResponse.json({ error: 'That doesn’t look like an email address.' }, { status: 400 })
  }

  // TOKEN *or* SLUG. The dashboard and kitchen screen hold the dashboard_token; the CUSTOMER ORDER PAGE
  // only ever knows the slug — and the CTA has to work there too, or "always visible" isn't true on one of
  // the three surfaces. Both are `demo-` prefixed and both are 130-bit random, so neither is weaker than
  // the other as a credential; the prefix check is the same either way.
  const identifier = token || slug
  if (!isDemoIdentifier(identifier)) {
    return NextResponse.json({ error: 'Not available.' }, { status: 403 })
  }

  const lookup = supabase.from('trucks').select('id, dashboard_token')
  const { data: truck } = token
    ? await lookup.eq('dashboard_token', token).single()
    : await lookup.eq('slug', slug).single()
  // The truck's OWN id is the authority — a matched row still has to be a demo truck.
  if (!truck || !isDemoIdentifier(truck.id as string)) {
    return NextResponse.json({ error: 'Not available.' }, { status: 403 })
  }

  const saved = await saveDemoEmail(supabase, truck.id as string, email)
  if (!saved.ok || !saved.expiresAt) {
    // Honest failure — the visitor asked us to keep something and we couldn't. Do not pretend otherwise.
    return NextResponse.json({ error: 'We couldn’t save that just now — please try again.' }, { status: 500 })
  }

  const deletionDate = formatDate(saved.expiresAt)
  const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
  // The return link goes through /api/demo/return, NOT straight to the dashboard: the event will be stale
  // by the time they click it, so it has to re-provision first.
  // Always the truck's OWN dashboard_token — the caller may have identified it by slug, and the return
  // link has to carry the credential the /api/demo/return handler expects.
  const returnUrl = `${base}/api/demo/return?t=${encodeURIComponent(truck.dashboard_token as string)}`

  const apiKey = process.env.BREVO_API_KEY
  if (apiKey) {
    try {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
          to: [{ email }],
          replyTo: { email: HATCHGRAB_SENDER.replyTo },
          subject: 'Your HatchGrab demo — here’s your link back',
          htmlContent: `
            <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px">
              <img src="${HATCHGRAB_LOGO_URL}" width="180" style="margin-bottom:24px;display:block"/>
              <h2 style="color:#0f172a">Your demo is saved</h2>
              <p>Here’s your link back to the demo with your menu in it. No login needed — just tap it.</p>
              <p style="margin:24px 0">
                <a href="${returnUrl}" style="background:#ea580c;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block">Open my demo</a>
              </p>
              <p>Each time you come back we’ll set up a fresh day’s trading so there’s something to play with.</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
              <!-- Stating the deletion date is REQUIRED (spec Stage 4) — and it's the same date stored in
                   demo_sessions.expires_at, so the promise and the data can't drift apart. -->
              <p style="color:#64748b;font-size:13px">
                This is a demo, so we don’t keep it forever — we’ll delete it and the menu on
                <strong>${deletionDate}</strong> (${RETENTION_WITH_EMAIL_DAYS} days). If you sign up before
                then, your menu comes with you.
              </p>
              <p style="color:#94a3b8;font-size:12px">HatchGrab · hatchgrab.com</p>
            </div>`,
        }),
      })
      await markReturnEmailSent(supabase, truck.id as string)
    } catch (err) {
      // The email is saved and the demo IS extended, so this is not a total failure — but the visitor was
      // promised a link. Tell them the truth rather than a bare success.
      console.error('[demo/save-email] return-link email failed:', err)
      return NextResponse.json({
        ok: true, emailSent: false, expiresAt: saved.expiresAt, deletionDate,
        warning: 'Saved, but we couldn’t send the email just now.',
      })
    }
  } else {
    console.warn('[demo/save-email] BREVO_API_KEY unset — demo saved but no return link sent')
    return NextResponse.json({ ok: true, emailSent: false, expiresAt: saved.expiresAt, deletionDate })
  }

  return NextResponse.json({ ok: true, emailSent: true, expiresAt: saved.expiresAt, deletionDate })
}
