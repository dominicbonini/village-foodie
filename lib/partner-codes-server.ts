// lib/partner-codes-server.ts — partners-2 (16 November 2026, docs/partners-2-report.md): partner codes against the database.
// Server only (service role): public.partner_codes, partner_code_redemptions and trucks.referred_partner_code_id are never
// read or written from a browser.
//
//   findCode        — a code as the signup page's Apply and the signup route see it (with its partner and its uses so far).
//   recordRedemption — at signup: the code the operator used, and the deal as it stood. Best effort, never blocks signup.
//   applyPartnerDeal — at the truck's creation (/api/setup create_truck): the deal through the EXISTING plan mechanisms, and
//                     the truck's attribution (set once; the database refuses a change). Best effort, never fails the create.
import type { SupabaseClient } from '@supabase/supabase-js'
import { codeState, extendedTrialEnd, normaliseCode, type PartnerCode, type CodeState } from '@/lib/partner-codes'

const CODE_COLUMNS = 'id, code, partner_id, deal_type, deal_value, deal_months, valid_until, max_uses, active, pct_year1, pct_year2, basis, partner_orgs(name)'

type Row = Record<string, unknown>
function mapCode(r: Row, uses: number): PartnerCode {
  const partner = (Array.isArray(r.partner_orgs) ? r.partner_orgs[0] : r.partner_orgs) as { name?: string } | null
  return {
    id: String(r.id), code: String(r.code), partnerId: String(r.partner_id), partnerName: partner?.name ?? '',
    dealType: r.deal_type as PartnerCode['dealType'], dealValue: Number(r.deal_value),
    dealMonths: r.deal_months === null || r.deal_months === undefined ? null : Number(r.deal_months),
    validUntil: (r.valid_until as string | null) ?? null, maxUses: r.max_uses === null || r.max_uses === undefined ? null : Number(r.max_uses),
    uses, active: r.active === true, pctYear1: Number(r.pct_year1), pctYear2: Number(r.pct_year2), basis: 'plan_fees',
  }
}

/** The code as typed (any case, any spacing), or null when there is no such code. Throws only on a failed read. */
export async function findCode(supabase: SupabaseClient, typed: string): Promise<PartnerCode | null> {
  const code = normaliseCode(typed)
  if (code.length < 3) return null
  const { data, error } = await supabase.from('partner_codes').select(CODE_COLUMNS).ilike('code', code.replace(/[%_\\]/g, '\\$&')).limit(1)
  if (error) throw new Error(`[partner-codes] could not read the code: ${error.message}`)
  const r = (data ?? [])[0] as Row | undefined
  if (!r) return null
  const { count, error: cErr } = await supabase.from('partner_code_redemptions').select('id', { count: 'exact', head: true }).eq('code_id', r.id as string)
  if (cErr) throw new Error(`[partner-codes] could not count the code's uses: ${cErr.message}`)
  return mapCode(r, count ?? 0)
}

/** The code's state today (UTC date), or 'invalid' when it does not exist. */
export async function checkCode(supabase: SupabaseClient, typed: string, now = new Date()): Promise<{ state: CodeState; code: PartnerCode | null }> {
  const code = await findCode(supabase, typed)
  return { state: codeState(code, now.toISOString().slice(0, 10)), code }
}

/** At signup: record the code the new operator used (only a valid one). Never throws; returns whether it was recorded. */
export async function recordRedemption(supabase: SupabaseClient, operatorId: string, typed: string, now = new Date()): Promise<boolean> {
  try {
    const { state, code } = await checkCode(supabase, typed, now)
    if (state !== 'ok' || !code) return false
    const { error } = await supabase.from('partner_code_redemptions').insert({
      code_id: code.id, operator_id: operatorId, deal_type: code.dealType, deal_value: code.dealValue, deal_months: code.dealMonths,
    })
    if (error) { console.error(`[partner-codes] redemption not recorded for operator ${operatorId}: ${error.message}`); return false }
    return true
  } catch (e) {
    console.error(`[partner-codes] redemption not recorded for operator ${operatorId}:`, e instanceof Error ? e.message : e)
    return false
  }
}

export type ApplyOutcome = 'none' | 'applied' | 'recorded_pending' | 'already' | 'failed'

/**
 * At the truck's creation: if the operator signed up with a code, apply its deal to the truck and attribute the truck to
 * the code. extra_trial_months → trucks.trial_expires_at moves on by that many months (Admin's "Extend trial" rule).
 * percent_off → ⛔ NOT APPLIED YET: the existing promotional price (plan_price_override_*) only applies while a truck is on
 * the plan it was given, and a new truck is on the free trial — so a discount set now would never reach a paid month. The
 * redemption is recorded with the deal and the truck is attributed; how the discount reaches the paid plan is Dominic's
 * decision (docs/partners-2-report.md §3.3). Never throws.
 */
export async function applyPartnerDeal(supabase: SupabaseClient, operatorId: string, truck: { id: string },
  now = new Date()): Promise<ApplyOutcome> {
  try {
    const { data: red, error } = await supabase.from('partner_code_redemptions')
      .select('id, code_id, deal_type, deal_value, deal_months, applied_at, truck_id').eq('operator_id', operatorId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!red) return 'none'
    if (red.applied_at) return 'already'
    const { data: t, error: tErr } = await supabase.from('trucks')
      .select('id, trial_expires_at, timezone, referred_partner_code_id').eq('id', truck.id).single()
    if (tErr || !t) throw new Error(tErr?.message ?? 'truck not found')
    const update: Record<string, unknown> = {}
    if (!t.referred_partner_code_id) update.referred_partner_code_id = red.code_id
    const applied: Record<string, unknown> = { truck_id: truck.id, applied_at: now.toISOString() }
    let outcome: ApplyOutcome = 'applied'
    if (red.deal_type === 'extra_trial_months') {
      if (t.trial_expires_at) {
        const to = extendedTrialEnd(t.trial_expires_at as string, { dealType: 'extra_trial_months', dealValue: red.deal_value as number }, t.timezone as string)
        update.trial_expires_at = to
        applied.trial_extended_to = to
      } else {
        applied.apply_note = 'the truck has no trial end to extend'
        outcome = 'recorded_pending'
      }
    } else {
      applied.apply_note = 'percent_off: recorded, not applied — awaiting the decision on how it reaches the paid plan'
      outcome = 'recorded_pending'
    }
    if (Object.keys(update).length) {
      const { error: uErr } = await supabase.from('trucks').update(update).eq('id', truck.id)
      if (uErr) throw new Error(uErr.message)
    }
    const { error: rErr } = await supabase.from('partner_code_redemptions').update(applied).eq('id', red.id as string)
    if (rErr) throw new Error(rErr.message)
    return outcome
  } catch (e) {
    console.error(`[partner-codes] deal not applied to truck ${truck.id} (operator ${operatorId}):`, e instanceof Error ? e.message : e)
    return 'failed'
  }
}
