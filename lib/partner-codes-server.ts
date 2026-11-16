// lib/partner-codes-server.ts — partners-2 (16 November 2026, docs/partners-2-report.md): partner codes against the database.
// Server only (service role): public.partner_codes, partner_code_redemptions and trucks.referred_partner_code_id are never
// read or written from a browser.
//
//   findCode        — a code as the signup page's Apply and the signup route see it (with its partner and its uses so far).
//   recordRedemption — at signup: the code the operator used, and the deal as it stood. Best effort, never blocks signup.
//   applyPartnerDeal — at the truck's creation (/api/setup create_truck): the deal through the EXISTING plan mechanisms, and
//                     the truck's attribution (set once; the database refuses a change). Best effort, never fails the create.
//   applyPartnerPrice — Dominic's decision 1 = A (16 November 2026): when a referred truck MOVES ONTO A PAID PLAN, a percent-off or
//                     fixed-price deal becomes the existing promotional price (trucks.plan_price_override_*) from that day for N
//                     months. Called after every plan write (lib/billing/store.ts setTruckPlan, Admin's plan change). Never throws.
import type { SupabaseClient } from '@supabase/supabase-js'
import { codeState, extendedTrialEnd, normaliseCode, isPriceDeal, priceOverrideFor, type PartnerCode, type CodeState } from '@/lib/partner-codes'
import { planByKey, planPriceFor } from '@/lib/plans'
import { localDateOfInstant } from '@/lib/time-utils'

const CODE_COLUMNS = 'id, code, partner_id, deal_type, deal_value, deal_months, deal_plan_key, deal_currency, valid_until, max_uses, active, pct_year1, pct_year2, basis, partner_orgs(name)'

type Row = Record<string, unknown>
function mapCode(r: Row, uses: number): PartnerCode {
  const partner = (Array.isArray(r.partner_orgs) ? r.partner_orgs[0] : r.partner_orgs) as { name?: string } | null
  return {
    id: String(r.id), code: String(r.code), partnerId: String(r.partner_id), partnerName: partner?.name ?? '',
    dealType: r.deal_type as PartnerCode['dealType'], dealValue: Number(r.deal_value),
    dealMonths: r.deal_months === null || r.deal_months === undefined ? null : Number(r.deal_months),
    dealPlanKey: (r.deal_plan_key as string | null) ?? null, dealCurrency: (r.deal_currency as string | null) ?? null,
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
      deal_plan_key: code.dealPlanKey ?? null, deal_currency: code.dealCurrency ?? null,
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
 * percent_off / fixed_price → recorded and attributed here; the price itself is set when the truck moves onto a paid plan
 * (applyPartnerPrice — decision 1 = A), because the promotional price only applies while a truck is on the plan it was given and
 * a new truck is on the free trial. Never throws.
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
      applied.apply_note = `${red.deal_type}: recorded — the price is set when the truck moves onto a paid plan`
      outcome = 'recorded_pending'
    }
    if (Object.keys(update).length) {
      const { error: uErr } = await supabase.from('trucks').update(update).eq('id', truck.id)
      if (uErr) throw new Error(uErr.message)
    }
    const { error: rErr } = await supabase.from('partner_code_redemptions').update(applied).eq('id', red.id as string)
    if (rErr) throw new Error(rErr.message)
    if (red.deal_type !== 'extra_trial_months' && (await applyPartnerPrice(supabase, truck.id, now)) === 'applied') return 'applied'
    return outcome
  } catch (e) {
    console.error(`[partner-codes] deal not applied to truck ${truck.id} (operator ${operatorId}):`, e instanceof Error ? e.message : e)
    return 'failed'
  }
}

// The plan catalogue through this client — imported when needed, so modules that only name these helpers (the harnesses' bundles)
// never load the server-only catalogue modules.
async function catalogVia(supabase: SupabaseClient) {
  const { readPlanCatalog } = await import('@/lib/plans-server')
  return readPlanCatalog(supabase as unknown as Parameters<typeof readPlanCatalog>[0])
}

export type PriceOutcome = 'none' | 'applied' | 'pending' | 'already' | 'failed'

/**
 * Decision 1 = A: after a truck's plan is written, apply its partner code's price deal if it has one that is still waiting. The
 * deal names a plan (or any paid plan); the price is the plan's monthly price in the truck's country, less the percentage, or the
 * fixed price (same currency only), from the truck's local today for deal_months months — written as the EXISTING promotional
 * price, so billing, Admin and the plan pills read it as they read a hand-set one. A promotional price already set by hand and
 * still running is never overwritten (the redemption notes it and stays pending). Applied once. Never throws.
 */
export async function applyPartnerPrice(supabase: SupabaseClient, truckId: string, now = new Date()): Promise<PriceOutcome> {
  try {
    const { data: red, error } = await supabase.from('partner_code_redemptions')
      .select('id, deal_type, deal_value, deal_months, deal_plan_key, deal_currency, price_applied_at').eq('truck_id', truckId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!red || !isPriceDeal(String(red.deal_type))) return 'none'
    if (red.price_applied_at) return 'already'
    const { data: t, error: tErr } = await supabase.from('trucks')
      .select('id, plan, country, currency, timezone, plan_price_override_minor, plan_price_override_until').eq('id', truckId).single()
    if (tErr || !t) throw new Error(tErr?.message ?? 'truck not found')
    const catalog = await catalogVia(supabase)
    const plan = planByKey(catalog, t.plan as string)
    if (!plan) return 'pending'
    const today = localDateOfInstant(now, (t.timezone as string) || 'Europe/London')
    const row = planPriceFor(catalog, plan.key, t.country as string)
    const price = row ? { monthlyMinor: row.monthlyMinor, currency: String(t.currency ?? '') } : null
    const deal = { dealType: red.deal_type as PartnerCode['dealType'], dealValue: Number(red.deal_value), dealMonths: red.deal_months as number | null,
      dealPlanKey: red.deal_plan_key as string | null, dealCurrency: red.deal_currency as string | null }
    const o = priceOverrideFor(deal, { key: plan.key, isTrial: plan.isTrial }, price, today)
    const note = async (apply_note: string) => { await supabase.from('partner_code_redemptions').update({ apply_note }).eq('id', red.id as string) }
    if (o.ok === false) { await note(`price pending (${today}): ${'reason' in o ? o.reason : ''}`); return 'pending' }
    const handSet = typeof t.plan_price_override_minor === 'number' && (!t.plan_price_override_until || String(t.plan_price_override_until).slice(0, 10) >= today)
    if (handSet) { await note(`price pending (${today}): a promotional price is already set on this truck — not overwritten`); return 'pending' }
    const { error: uErr } = await supabase.from('trucks').update({ plan_price_override_minor: o.minor, plan_price_override_until: o.until,
      plan_price_override_note: `Partner code deal (${deal.dealType}${deal.dealPlanKey ? ` on ${deal.dealPlanKey}` : ''}), ${deal.dealMonths} months from ${today}` }).eq('id', truckId)
    if (uErr) throw new Error(uErr.message)
    const { error: rErr } = await supabase.from('partner_code_redemptions').update({ price_applied_at: now.toISOString(), price_plan_key: plan.key,
      override_minor: o.minor, override_until: o.until, apply_note: `price applied on ${plan.key} from ${today} to ${o.until}` }).eq('id', red.id as string)
    if (rErr) throw new Error(rErr.message)
    return 'applied'
  } catch (e) {
    console.error(`[partner-codes] price deal not applied to truck ${truckId}:`, e instanceof Error ? e.message : e)
    return 'failed'
  }
}

// partners offer: the offer lookup lives in lib/partner-offers.ts (no server-only imports, so the admin table's rules can use it);
// re-exported here for the server routes.
export { offersFor, OFFER_CODE_COLUMNS, type OfferCode } from '@/lib/partner-offers'

/** The language an email is written in → the messages locale its plan names come from (lib/plan-names.ts). */
const PLAN_NAME_LOCALE: Record<string, string> = { en: 'en-GB', fr: 'fr-FR', nl: 'nl-NL', de: 'de-DE', es: 'es-ES', it: 'it-IT', sv: 'sv-SE' }

/** A plan key → its name in `lang` ("Pro" stays "Pro"; "unlimited" → "Illimité" in French), read from the plan table. */
export async function planNamer(supabase: SupabaseClient, lang: string | null | undefined): Promise<(key: string) => string> {
  const catalog = await catalogVia(supabase)
  const { localizePlans } = await import('@/lib/plan-names')
  const named = localizePlans(catalog, PLAN_NAME_LOCALE[(lang || 'en').toLowerCase()] ?? 'en-GB')
  return key => named.plans.find(p => p.key === key)?.name ?? key
}
