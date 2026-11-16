// lib/partner-commission.ts — partners-2 (16 November 2026, docs/partners-2-report.md §4): what each partner is owed.
// Server only. Commission = pct_year1 / pct_year2 of the PLAN FEES a referred truck actually paid: billing_charges.plan_minor on a
// charge whose billing_invoices row is paid. Billing is switched off, so until it is on every amount here is 0 — the ledger is
// right, just empty. Payments are Dominic's own ("Mark paid": month, amount, date, reference — partner_commission_payments).
import type { SupabaseClient } from '@supabase/supabase-js'
import { commissionByMonth, ledger, type PlanFeePaid } from '@/lib/partner-codes'

export interface CodeLedger {
  codeId: string; code: string; trucks: { id: string; name: string; signedUpAt: string }[]
  owed: ReturnType<typeof commissionByMonth>
}
export interface PartnerLedger {
  partnerId: string; codes: CodeLedger[]
  months: ReturnType<typeof ledger>
  payments: { id: string; month: string; currency: string; amountMinor: number; paidOn: string; reference: string }[]
}

/** Every code's referred trucks and the commission they earned, and the partner's month-by-month ledger. */
export async function partnerLedger(supabase: SupabaseClient, partnerId: string): Promise<PartnerLedger> {
  const { data: codes, error } = await supabase.from('partner_codes').select('id, code, pct_year1, pct_year2').eq('partner_id', partnerId)
  if (error) throw new Error(`[commission] codes unreadable: ${error.message}`)
  const codeRows = (codes ?? []) as { id: string; code: string; pct_year1: number; pct_year2: number }[]
  const { data: pays, error: payErr } = await supabase.from('partner_commission_payments')
    .select('id, month, currency, amount_minor, paid_on, reference').eq('partner_id', partnerId).order('month')
  if (payErr) throw new Error(`[commission] payments unreadable: ${payErr.message}`)
  const payments = ((pays ?? []) as { id: string; month: string; currency: string; amount_minor: number; paid_on: string; reference: string }[])
    .map(p => ({ id: p.id, month: p.month, currency: p.currency, amountMinor: p.amount_minor, paidOn: p.paid_on, reference: p.reference }))
  if (!codeRows.length) return { partnerId, codes: [], months: ledger([], payments), payments }

  const { data: trucks, error: tErr } = await supabase.from('trucks').select('id, name, created_at, referred_partner_code_id')
    .in('referred_partner_code_id', codeRows.map(c => c.id))
  if (tErr) throw new Error(`[commission] referred trucks unreadable: ${tErr.message}`)
  const truckRows = (trucks ?? []) as { id: string; name: string; created_at: string; referred_partner_code_id: string }[]
  const paid: PlanFeePaid[] = []
  if (truckRows.length) {
    const { data: charges, error: cErr } = await supabase.from('billing_charges').select('id, truck_id, currency, plan_minor')
      .in('truck_id', truckRows.map(t => t.id))
    if (cErr) throw new Error(`[commission] charges unreadable: ${cErr.message}`)
    const chargeRows = (charges ?? []) as { id: string; truck_id: string; currency: string; plan_minor: number | null }[]
    if (chargeRows.length) {
      const { data: invoices, error: iErr } = await supabase.from('billing_invoices').select('charge_id, paid_at, status')
        .in('charge_id', chargeRows.map(c => c.id)).eq('status', 'paid')
      if (iErr) throw new Error(`[commission] invoices unreadable: ${iErr.message}`)
      const paidAt = new Map(((invoices ?? []) as { charge_id: string; paid_at: string | null }[]).filter(i => i.paid_at).map(i => [i.charge_id, i.paid_at!]))
      for (const c of chargeRows) {
        const at = paidAt.get(c.id)
        if (at && (c.plan_minor ?? 0) > 0) paid.push({ truckId: c.truck_id, paidAt: at, currency: c.currency, planMinor: c.plan_minor! })
      }
    }
  }
  const signupAt = Object.fromEntries(truckRows.map(t => [t.id, t.created_at]))
  const codesOut: CodeLedger[] = codeRows.map(c => {
    const mine = truckRows.filter(t => t.referred_partner_code_id === c.id)
    const ids = new Set(mine.map(t => t.id))
    return {
      codeId: c.id, code: c.code,
      trucks: mine.map(t => ({ id: t.id, name: t.name, signedUpAt: t.created_at })),
      owed: commissionByMonth(paid.filter(p => ids.has(p.truckId)), signupAt, { pctYear1: Number(c.pct_year1), pctYear2: Number(c.pct_year2) }),
    }
  })
  return { partnerId, codes: codesOut, months: ledger(codesOut.flatMap(c => c.owed), payments), payments }
}
