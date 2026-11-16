// app/api/signup/code/route.ts — partners-2 (16 November 2026, docs/partners-2-report.md): the signup page's "Apply".
// POST { code, locale? } → { ok: true, deal, partner } | { ok: false, reason: 'invalid' | 'expired' }.
// partners offer (16 November 2026): a deal that names a plan carries its name in `locale`'s language, and a fixed price its amount
// formatted for that locale (the field shows no amount inside the iOS app — components/PartnerCodeField.tsx).
// Public (a visitor has no account yet), read only, and it says nothing beyond what a valid code's own deal is: an unknown,
// inactive or used-up code are all just 'invalid'. The signup itself never depends on this answer (the code is checked again
// on the server when the account is created — lib/partner-codes-server.ts recordRedemption).
import { NextRequest, NextResponse } from 'next/server'
import { checkCode } from '@/lib/partner-codes-server'
import { dealArgs, formatMinor } from '@/lib/partner-codes'

export async function POST(req: NextRequest) {
  let body: { code?: unknown; locale?: unknown } = {}
  try { body = await req.json() } catch { /* empty body → invalid below */ }
  const typed = typeof body.code === 'string' ? body.code : ''
  try {
    const { supabase } = await import('@/lib/supabase')
    const { state, code } = await checkCode(supabase, typed)
    if (state !== 'ok' || !code) return NextResponse.json({ ok: false, reason: state === 'expired' ? 'expired' : 'invalid' })
    const d = dealArgs(code)
    if (d.kind === 'extraMonths' || (d.kind === 'percentOff' && !d.planKey)) return NextResponse.json({ ok: true, code: code.code, deal: d, partner: code.partnerName })
    const locale = typeof body.locale === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(body.locale) ? body.locale : 'en-GB'
    const [{ getPlanCatalog }, { localizePlans }] = await Promise.all([import('@/lib/plans-server'), import('@/lib/plan-names')])
    const named = localizePlans(await getPlanCatalog(), locale)
    const planName = named.plans.find(p => p.key === d.planKey)?.name ?? d.planKey ?? ''
    const deal = d.kind === 'fixedPrice'
      ? { kind: 'fixedPrice', months: d.months, planName, price: formatMinor(d.priceMinor, d.currency, locale) }
      : { kind: 'percentOff', pct: d.pct, months: d.months, planName }
    return NextResponse.json({ ok: true, code: code.code, deal, partner: code.partnerName })
  } catch (e) {
    console.error('[signup/code]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, reason: 'invalid' })
  }
}
