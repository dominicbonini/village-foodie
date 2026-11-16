// app/api/signup/code/route.ts — partners-2 (16 November 2026, docs/partners-2-report.md): the signup page's "Apply".
// POST { code } → { ok: true, deal, partner } | { ok: false, reason: 'invalid' | 'expired' }.
// Public (a visitor has no account yet), read only, and it says nothing beyond what a valid code's own deal is: an unknown,
// inactive or used-up code are all just 'invalid'. The signup itself never depends on this answer (the code is checked again
// on the server when the account is created — lib/partner-codes-server.ts recordRedemption).
import { NextRequest, NextResponse } from 'next/server'
import { checkCode } from '@/lib/partner-codes-server'
import { dealArgs } from '@/lib/partner-codes'

export async function POST(req: NextRequest) {
  let body: { code?: unknown } = {}
  try { body = await req.json() } catch { /* empty body → invalid below */ }
  const typed = typeof body.code === 'string' ? body.code : ''
  try {
    const { supabase } = await import('@/lib/supabase')
    const { state, code } = await checkCode(supabase, typed)
    if (state !== 'ok' || !code) return NextResponse.json({ ok: false, reason: state === 'expired' ? 'expired' : 'invalid' })
    return NextResponse.json({ ok: true, code: code.code, deal: dealArgs(code), partner: code.partnerName })
  } catch (e) {
    console.error('[signup/code]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, reason: 'invalid' })
  }
}
