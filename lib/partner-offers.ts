// lib/partner-offers.ts — partners offer (16 November 2026, docs/partners-3-report.md §0.3): each partner's OFFER, read through a
// client the caller passes. 🔴 NO SERVER-ONLY IMPORTS: lib/partner-programme.ts (whose rules the admin table also runs in the browser)
// imports this, so it must never pull in the plan catalogue's server modules (lib/plans-server.ts → server-only).
import type { SupabaseClient } from '@supabase/supabase-js'
import { offerCodeFor, type PartnerCode } from '@/lib/partner-codes'

export const OFFER_CODE_COLUMNS = 'id, code, partner_id, deal_type, deal_value, deal_months, deal_plan_key, deal_currency, valid_until, max_uses, active, pct_year1, pct_year2, created_at'
export interface OfferCode {
  id: string; code: string; partner_id: string; deal_type: PartnerCode['dealType']; deal_value: number; deal_months: number | null
  deal_plan_key: string | null; deal_currency: string | null; valid_until: string | null; max_uses: number | null; active: boolean
  pct_year1: number; pct_year2: number; created_at: string | null
}

/**
 * Each partner's OFFER (its newest usable code — lib/partner-codes.ts offerCodeFor), for the given partners (all when omitted).
 * A partner missing from the map "Needs offer": it is never queued, sent by the scheduler, or emailed fresh from Admin.
 * Throws on a failed read (a caller then sends nothing).
 */
export async function offersFor(supabase: SupabaseClient, now = new Date(), partnerIds?: string[]): Promise<Map<string, OfferCode>> {
  let q = supabase.from('partner_codes').select(OFFER_CODE_COLUMNS).eq('active', true)
  if (partnerIds) { if (!partnerIds.length) return new Map(); q = q.in('partner_id', partnerIds) }
  const { data, error } = await q
  if (error) throw new Error(`[partner-codes] the codes could not be read: ${error.message}`)
  const codes = (data ?? []) as OfferCode[]
  const uses: Record<string, number> = {}
  if (codes.length) {
    const { data: reds, error: rErr } = await supabase.from('partner_code_redemptions').select('code_id').in('code_id', codes.map(c => c.id))
    if (rErr) throw new Error(`[partner-codes] the code uses could not be read: ${rErr.message}`)
    for (const r of (reds ?? []) as { code_id: string }[]) uses[r.code_id] = (uses[r.code_id] ?? 0) + 1
  }
  const today = now.toISOString().slice(0, 10)
  const out = new Map<string, OfferCode>()
  for (const pid of new Set(codes.map(c => c.partner_id))) { const c = offerCodeFor(codes, pid, uses, today); if (c) out.set(pid, c) }
  return out
}
