// app/api/contact/route.ts — 🔴 HATCHGRAB'S CONTACT FORM SENDS HERE (contact-1, 2 November 2026; docs/contact-1-report.md).
// The work is lib/contact-server.ts submitContact; this file only wires the real database (service role — contact_messages has
// RLS on and no policies), the Upstash limits and Brevo. HatchGrab host only: Village Foodie's /contact keeps its Tally form and
// never posts here.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { isHatchGrabHost } from '@/lib/brand'
import { contactIpRatelimit, contactEmailRatelimit } from '@/lib/ratelimit'
import { submitContact, brevoSend, contactSecret, type ContactRow } from '@/lib/contact-server'

export const runtime = 'nodejs'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** A limiter that fails OPEN: an Upstash outage must not refuse a person's message (lib/ratelimit.ts). */
async function under(limiter: typeof contactIpRatelimit, key: string): Promise<boolean> {
  try { return (await limiter.limit(key)).success } catch (err) {
    console.error('[contact] rate-limit check failed, allowing through:', err)
    return true
  }
}

export async function POST(req: NextRequest) {
  if (!isHatchGrabHost(req.headers.get('host') || '')) return NextResponse.json({ ok: false, code: 'failed' }, { status: 404 })
  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ ok: false, code: 'failed' }, { status: 400 }) }
  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd ? fwd.split(',')[0].trim() || null : null
  const { status, body } = await submitContact(raw, ip, {
    insert: async (row: ContactRow) => ({ error: (await supabase.from('contact_messages').insert(row)).error?.message ?? null }),
    update: async (id, patch) => ({ error: (await supabase.from('contact_messages').update(patch).eq('id', id)).error?.message ?? null }),
    limitIp: key => under(contactIpRatelimit, key),
    limitEmail: key => under(contactEmailRatelimit, key),
    send: mail => brevoSend(mail),
    now: () => new Date(),
    newId: () => randomUUID(),
    secret: contactSecret(),
  })
  return NextResponse.json(body, { status })
}
