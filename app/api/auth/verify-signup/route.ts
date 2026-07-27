// app/api/auth/verify-signup/route.ts
// The click target of the signup verification email. Marks the address confirmed, then bounces them into
// the wizard.
//
// A ROUTE HANDLER, NOT A PAGE: there is nothing to decide here and nothing to read — the only useful
// outcome is landing back where they were, already signed in. A confirmation page would be a dead end
// with a button on it. The existing /verify-email page is a page because the EMAIL-CHANGE flow has real
// failure states worth explaining; this one has one.
//
// NOT AUTHENTICATED, by design: they may open the link on their phone, in a different browser, with no
// session. The token is 256 bits of entropy and single-purpose, so it is the credential.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const origin = req.nextUrl.origin
  const back = (status: string) => NextResponse.redirect(`${origin}/setup?verify=${status}`)

  if (!token) return back('invalid')

  const { data: row } = await supabase
    .from('operator_email_verifications')
    .select('id, expires_at, verified_at')
    .eq('token', token)
    .maybeSingle()

  if (!row) return back('invalid')
  // Already used is a SUCCESS from the reader's point of view — they clicked twice, or the mail client
  // pre-fetched the link. Telling them it failed would be both false and alarming.
  if (row.verified_at) return back('ok')
  if (new Date(row.expires_at) < new Date()) return back('expired')

  const { error } = await supabase
    .from('operator_email_verifications')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', row.id)

  return back(error ? 'invalid' : 'ok')
}
