// app/api/admin/outreach/settings/route.ts — read and write the signature and the opt-out sentence.
//
// 🔴 IT TOUCHES EXACTLY TWO KEYS. `outreach_settings` is a key/value table and this route may write
// `signature` and `opt_out` and nothing else — the allow-list is a constant, not a validated
// parameter, so a future key added by some other feature cannot be overwritten from this screen.
// 🔴 AND IT WRITES NOTHING ELSE ANYWHERE. No template, no snippet, no prospect, no contact.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  SIGNATURE_KEY, OPT_OUT_KEY, parseSignature, parseOptOut,
} from '@/lib/outreach-signature'
import { readOutreachSettings } from '@/lib/outreach-settings-read'
import { dbDetail } from '@/lib/outreach-messages-table'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  const read = await readOutreachSettings(supabase)
  if (read.error) return NextResponse.json({ ok: false, refusal: `The signature settings could not be read (${read.error}).` })
  return NextResponse.json({ ok: true, signature: read.values.signature, optOut: read.values.optOut })
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad body' }, { status: 400 }) }

  // 🔴 PARSED WITH THE SAME FUNCTIONS THE SENDER USES. A shape this route accepts but the sender
  // cannot read would be saved successfully and then refuse every send — the worst possible split.
  const signature = parseSignature(body.signature)
  const optOut = parseOptOut(body.optOut)
  if (!signature) return NextResponse.json({ ok: false, refusal: 'That signature could not be saved: every line needs its text, even an empty one.' })
  if (!optOut) return NextResponse.json({ ok: false, refusal: 'The opt-out line cannot be empty — it is the sentence that lets a prospect stop the emails.' })

  const now = new Date().toISOString()
  const { error } = await supabase.from('outreach_settings').upsert([
    { key: SIGNATURE_KEY, value: signature, updated_at: now },
    { key: OPT_OUT_KEY, value: optOut, updated_at: now },
  ], { onConflict: 'key' })
  if (error) return NextResponse.json({ ok: false, refusal: `That could not be saved (${dbDetail(error)}).` })

  // Read it back, so what the screen shows next is what the table holds — not what was posted.
  const read = await readOutreachSettings(supabase)
  return NextResponse.json({ ok: true, signature: read.values.signature, optOut: read.values.optOut })
}
