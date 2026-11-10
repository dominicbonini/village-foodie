// lib/billing/store.ts — billing-1: the BillingStore on the database. SERVICE ROLE, SERVER ONLY.
// Every billing table is RLS-on with no policy (supabase/migrations/20261085_billing_1.sql), so the service role is the only
// reader and writer. Reads of trucks, orders and order_payments are narrow selects; NOTHING here writes to trucks, orders,
// order_payments, plans, plan_prices or country_settings.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPaymentModel, type CountryBilling, type UsageOrder, type UsageLine, type PlanHistoryRow } from '@/lib/billing/rules'
import type { BillingStore, TruckBillingRow, UsageRow, InvoiceRow, StoredTruck, ChargeRow } from '@/lib/billing/store-types'

type Row = Record<string, unknown>
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? null : String(v))
const DAY = 86_400_000

function mapCountryBilling(r: Row): CountryBilling {
  const model = String(r.payment_model)
  if (!isPaymentModel(model)) throw new Error(`[billing/store] country_billing ${r.country_code}: unknown payment_model ${model}`)
  return {
    countryCode: String(r.country_code), paymentModel: model,
    postPaySurchargeBps: num(r.post_pay_surcharge_bps), postPaySurchargeFixedMinor: num(r.post_pay_surcharge_fixed_minor),
    minChargeMinor: num(r.min_charge_minor), lateFeeMinor: num(r.late_fee_minor), updatedAt: str(r.updated_at) ?? undefined, updatedBy: str(r.updated_by),
  }
}
const cbCols = (c: CountryBilling) => ({
  country_code: c.countryCode, payment_model: c.paymentModel, post_pay_surcharge_bps: c.postPaySurchargeBps,
  post_pay_surcharge_fixed_minor: c.postPaySurchargeFixedMinor, min_charge_minor: c.minChargeMinor, late_fee_minor: c.lateFeeMinor ?? 0,
})

function mapTruckBilling(r: Row): TruckBillingRow {
  return {
    truckId: String(r.truck_id), postPay: r.post_pay === true, billingTest: r.billing_test === true,
    paymentMethodState: (str(r.payment_method_state) ?? 'none') as TruckBillingRow['paymentMethodState'],
    paymentMethodType: str(r.payment_method_type) as TruckBillingRow['paymentMethodType'],
    stripePaymentMethodId: str(r.stripe_payment_method_id), stripeSetupIntentId: str(r.stripe_setup_intent_id),
    paymentMethodLabel: str(r.payment_method_label), paymentMethodUpdatedAt: str(r.payment_method_updated_at),
    paymentMethodLivemode: typeof r.payment_method_livemode === 'boolean' ? r.payment_method_livemode : null,
    status: str(r.status) as TruckBillingRow['status'], statusReason: str(r.status_reason), statusChangedAt: str(r.status_changed_at),
    pendingPlanKey: str(r.pending_plan_key), pendingPlanFrom: r.pending_plan_from ? String(r.pending_plan_from).slice(0, 10) : null,
  }
}
const TB_COLS: Record<keyof Omit<TruckBillingRow, 'truckId'>, string> = {
  postPay: 'post_pay', billingTest: 'billing_test', paymentMethodState: 'payment_method_state', paymentMethodType: 'payment_method_type',
  stripePaymentMethodId: 'stripe_payment_method_id', stripeSetupIntentId: 'stripe_setup_intent_id', paymentMethodLabel: 'payment_method_label',
  paymentMethodUpdatedAt: 'payment_method_updated_at', paymentMethodLivemode: 'payment_method_livemode', status: 'status',
  statusReason: 'status_reason', statusChangedAt: 'status_changed_at', pendingPlanKey: 'pending_plan_key', pendingPlanFrom: 'pending_plan_from',
}

const U_COLS: Record<keyof UsageRow, string> = {
  truckId: 'truck_id', period: 'period', currency: 'currency', countryCode: 'country_code', paymentModel: 'payment_model', postPay: 'post_pay',
  planKey: 'plan_key', preorderCount: 'preorder_count', countedOnlineMinor: 'counted_online_minor', countedAtTruckMinor: 'counted_at_truck_minor',
  countedMinor: 'counted_minor', allowanceMinor: 'allowance_minor', allowanceUsedMinor: 'allowance_used_minor', feeBps: 'fee_bps',
  feeDueMinor: 'fee_due_minor', feeTakenMinor: 'fee_taken_minor', feeBilledMinor: 'fee_billed_minor', periodDays: 'period_days',
  surchargeMinor: 'surcharge_minor', inputsDigest: 'inputs_digest', state: 'state', chargeId: 'charge_id', computedAt: 'computed_at',
}
function mapUsage(r: Row): UsageRow {
  const out = {} as Record<string, unknown>
  for (const [k, c] of Object.entries(U_COLS)) out[k] = r[c] ?? null
  out.period = String(r.period).slice(0, 10)
  return out as unknown as UsageRow
}
const usageCols = (u: UsageRow) => Object.fromEntries(Object.entries(U_COLS).map(([k, c]) => [c, (u as unknown as Row)[k]]))

const I_COLS: Record<keyof InvoiceRow, string> = {
  id: 'id', chargeId: 'charge_id', truckId: 'truck_id', period: 'period', currency: 'currency', amountMinor: 'amount_minor', livemode: 'livemode',
  stripeInvoiceId: 'stripe_invoice_id', status: 'status', dueAt: 'due_at', attemptCount: 'attempt_count', lastError: 'last_error',
  hostedInvoiceUrl: 'hosted_invoice_url', createdAt: 'created_at', finalizedAt: 'finalized_at', paidAt: 'paid_at',
  lateFeeMinor: 'late_fee_minor', replacedStripeInvoiceId: 'replaced_stripe_invoice_id',
}
function mapInvoice(r: Row): InvoiceRow {
  const out = {} as Record<string, unknown>
  for (const [k, c] of Object.entries(I_COLS)) out[k] = r[c] ?? null
  out.period = String(r.period).slice(0, 10)
  out.attemptCount = num(r.attempt_count)
  return out as unknown as InvoiceRow
}

const C_COLS: Record<keyof ChargeRow, string> = {
  id: 'id', truckId: 'truck_id', period: 'period', kind: 'kind', ref: 'ref', currency: 'currency', planKey: 'plan_key', fromPlanKey: 'from_plan_key',
  planMinor: 'plan_minor', planDays: 'plan_days', periodDays: 'period_days', vansMinor: 'vans_minor', usagePeriod: 'usage_period',
  usageFeeMinor: 'usage_fee_minor', surchargeMinor: 'surcharge_minor', carriedInMinor: 'carried_in_minor', amountDueMinor: 'amount_due_minor',
  chargedMinor: 'charged_minor', carriedOutMinor: 'carried_out_minor', carriedInto: 'carried_into', minChargeMinor: 'min_charge_minor',
  state: 'state', inputsDigest: 'inputs_digest', computedAt: 'computed_at',
}
function mapCharge(r: Row): ChargeRow {
  const out = {} as Record<string, unknown>
  for (const [k, c] of Object.entries(C_COLS)) out[k] = r[c] ?? null
  out.period = String(r.period).slice(0, 10)
  out.usagePeriod = r.usage_period ? String(r.usage_period).slice(0, 10) : null
  out.ref = String(r.ref ?? '')
  return out as unknown as ChargeRow
}

export function supabaseBillingStore(db: SupabaseClient): BillingStore {
  const fail = (what: string, e: { message: string } | null) => { if (e) throw new Error(`[billing/store] ${what}: ${e.message}`) }
  return {
    async switches() {
      const { data, error } = await db.from('platform_switches').select('billing_enabled, billing_pause_after_days').eq('id', true).maybeSingle()
      // 🔴 A READ FAILURE IS "OFF" — billing never acts on a switch it could not read.
      if (error || !data) return { enabled: false, pauseAfterDays: 5 }
      return { enabled: (data as Row).billing_enabled === true, pauseAfterDays: num((data as Row).billing_pause_after_days, 5) }
    },
    async countryBilling(code) {
      const { data, error } = await db.from('country_billing').select('*').eq('country_code', code).maybeSingle()
      fail(`country_billing ${code}`, error)
      return data ? mapCountryBilling(data as Row) : null
    },
    async listCountryBilling() {
      const { data, error } = await db.from('country_billing').select('*').order('country_code')
      fail('country_billing list', error)
      return ((data ?? []) as Row[]).map(mapCountryBilling)
    },
    async saveCountryBilling(row, by, expectedUpdatedAt) {
      const cols = { ...cbCols(row), updated_at: new Date().toISOString(), updated_by: by }
      if (expectedUpdatedAt) {
        const { data, error } = await db.from('country_billing').update(cols).eq('country_code', row.countryCode).eq('updated_at', expectedUpdatedAt).select('*')
        fail(`save country_billing ${row.countryCode}`, error)
        const rows = (data ?? []) as Row[]
        return rows.length === 1 ? mapCountryBilling(rows[0]) : null
      }
      const { data, error } = await db.from('country_billing').insert(cols).select('*').single()
      fail(`add country_billing ${row.countryCode}`, error)
      return mapCountryBilling(data as Row)
    },
    async countryFacts(code) {
      const { data, error } = await db.from('country_settings').select('country_code, currency, locale, platform_fee_enabled, platform_fee_allowed').eq('country_code', code).maybeSingle()
      fail(`country_settings ${code}`, error)
      if (!data) return null
      const r = data as Row
      return { countryCode: String(r.country_code), currency: String(r.currency), locale: String(r.locale),
        platformFeeEnabled: r.platform_fee_enabled === true, platformFeeAllowed: r.platform_fee_allowed !== false }
    },

    async truck(id) {
      const { data, error } = await db.from('trucks')
        .select('id, slug, name, plan, trial_expires_at, plan_price_override_minor, plan_price_override_until, plan_price_override_note, country, currency, timezone, is_customer, operator_id')
        .eq('id', id).maybeSingle()
      fail(`truck ${id}`, error)
      return (data as StoredTruck | null) ?? null
    },
    async candidateTruckIds() {
      const [{ data: customers, error: e1 }, { data: tests, error: e2 }] = await Promise.all([
        db.from('trucks').select('id').eq('is_customer', true),
        db.from('truck_billing').select('truck_id').eq('billing_test', true),
      ])
      fail('customer trucks', e1); fail('billing test trucks', e2)
      return [...new Set([...((customers ?? []) as Row[]).map(r => String(r.id)), ...((tests ?? []) as Row[]).map(r => String(r.truck_id))])].sort()
    },
    async operator(id) {
      const { data, error } = await db.from('operators').select('id, email, name, first_name, last_name').eq('id', id).maybeSingle()
      fail(`operator ${id}`, error)
      if (!data) return null
      const r = data as Row
      const name = str(r.name) || [str(r.first_name), str(r.last_name)].filter(Boolean).join(' ') || null
      return { id: String(r.id), email: str(r.email), name }
    },
    async vanCount(truckId) {
      const { count, error } = await db.from('truck_vans').select('id', { count: 'exact', head: true }).eq('truck_id', truckId)
      fail(`vans ${truckId}`, error)
      return Math.max(1, count ?? 1)
    },

    async truckBilling(truckId) {
      const { data, error } = await db.from('truck_billing').select('*').eq('truck_id', truckId).maybeSingle()
      fail(`truck_billing ${truckId}`, error)
      return data ? mapTruckBilling(data as Row) : null
    },
    async upsertTruckBilling(truckId, patch, by) {
      const cols: Row = { truck_id: truckId, updated_at: new Date().toISOString(), updated_by: by }
      for (const [k, v] of Object.entries(patch)) { const c = TB_COLS[k as keyof typeof TB_COLS]; if (c) cols[c] = v }
      const { data, error } = await db.from('truck_billing').upsert(cols, { onConflict: 'truck_id' }).select('*').single()
      fail(`save truck_billing ${truckId}`, error)
      return mapTruckBilling(data as Row)
    },
    async truckBillingBySetupIntent(id) {
      const { data, error } = await db.from('truck_billing').select('*').eq('stripe_setup_intent_id', id).maybeSingle()
      fail(`truck_billing by setup intent`, error)
      return data ? mapTruckBilling(data as Row) : null
    },

    async customerFor(operatorId) {
      const { data, error } = await db.from('operator_billing').select('stripe_customer_id, livemode').eq('operator_id', operatorId).maybeSingle()
      fail(`operator_billing ${operatorId}`, error)
      return data ? { stripeCustomerId: String((data as Row).stripe_customer_id), livemode: (data as Row).livemode === true } : null
    },
    async saveCustomer(operatorId, stripeCustomerId, livemode) {
      const { error } = await db.from('operator_billing').upsert({ operator_id: operatorId, stripe_customer_id: stripeCustomerId, livemode }, { onConflict: 'operator_id' })
      fail(`save operator_billing ${operatorId}`, error)
    },

    async usageOrders(truckId, startIso, endIso) {
      // placed_at is the instant that decides the month; older rows without it fall back to created_at. The read is widened
      // by a week either side and filtered here, so neither column's index shape matters.
      const lo = new Date(Date.parse(startIso) - 7 * DAY).toISOString(), hi = new Date(Date.parse(endIso) + 7 * DAY).toISOString()
      const { data, error } = await db.from('orders')
        .select('order_key, source, status, food_minor, placed_at, created_at')
        .eq('truck_id', truckId).eq('source', 'web').gte('created_at', lo).lt('created_at', hi)
      fail(`orders ${truckId}`, error)
      const orders = ((data ?? []) as Row[])
        .map(r => ({ r, placedAt: String(r.placed_at ?? r.created_at) }))
        .filter(x => x.r.order_key && Date.parse(x.placedAt) >= Date.parse(startIso) && Date.parse(x.placedAt) < Date.parse(endIso))
      if (!orders.length) return []
      const keys = orders.map(x => String(x.r.order_key))
      const pays: Row[] = []
      for (let i = 0; i < keys.length; i += 200) {
        const { data: p, error: pe } = await db.from('order_payments')
          .select('order_key, kind, amount_minor, application_fee_minor, application_fee_refunded_minor')
          .in('order_key', keys.slice(i, i + 200)).eq('channel', 'online').eq('state', 'succeeded')
        fail(`order_payments ${truckId}`, pe)
        pays.push(...((p ?? []) as Row[]))
      }
      return orders.map(({ r, placedAt }): UsageOrder => {
        const mine = pays.filter(p => String(p.order_key) === String(r.order_key))
        const captured = mine.filter(p => p.kind === 'charge').reduce((s, p) => s + num(p.amount_minor), 0)
        const refunded = mine.filter(p => p.kind === 'refund').reduce((s, p) => s + num(p.amount_minor), 0)
        const fee = mine.reduce((s, p) => s + num(p.application_fee_minor), 0) - mine.reduce((s, p) => s + num(p.application_fee_refunded_minor), 0)
        return {
          orderKey: String(r.order_key), placedAt, source: str(r.source), status: str(r.status),
          foodMinor: typeof r.food_minor === 'number' ? r.food_minor : null,
          paidOnline: captured > 0, capturedMinor: captured, refundedMinor: refunded, feeTakenMinor: Math.max(0, fee),
        }
      })
    },

    async usage(truckId, period) {
      const { data, error } = await db.from('billing_usage').select('*').eq('truck_id', truckId).eq('period', period).maybeSingle()
      fail(`usage ${truckId} ${period}`, error)
      return data ? mapUsage(data as Row) : null
    },
    async usageLines(truckId, period) {
      const { data, error } = await db.from('billing_usage_orders').select('*').eq('truck_id', truckId).eq('period', period).order('placed_at')
      fail(`usage lines ${truckId} ${period}`, error)
      return ((data ?? []) as Row[]).map(r => ({
        orderKey: String(r.order_key), placedAt: String(r.placed_at), paidOnline: r.paid_online === true, foodMinor: num(r.food_minor),
        countedMinor: num(r.counted_minor), allowanceBeforeMinor: num(r.allowance_before_minor), feeMinor: num(r.fee_minor),
        feeVia: String(r.fee_via) as UsageLine['feeVia'], feeTakenMinor: num(r.fee_taken_minor), planKey: str(r.plan_key), feeBps: num(r.fee_bps),
      }))
    },
    async listUsage(truckId) {
      const { data, error } = await db.from('billing_usage').select('*').eq('truck_id', truckId).order('period', { ascending: false }).limit(24)
      fail(`usage list ${truckId}`, error)
      return ((data ?? []) as Row[]).map(mapUsage)
    },
    async replaceUsage(row, lines) {
      const existing = await this.usage(row.truckId, row.period)
      if (existing && existing.state !== 'open') return false
      const { error: dl } = await db.from('billing_usage_orders').delete().eq('truck_id', row.truckId).eq('period', row.period)
      fail('clear usage lines', dl)
      const { error: up } = await db.from('billing_usage').upsert(usageCols({ ...row, state: 'open', chargeId: null }), { onConflict: 'truck_id,period' })
      fail('save usage', up)
      if (lines.length) {
        const { error: li } = await db.from('billing_usage_orders').insert(lines.map(l => ({
          order_key: l.orderKey, truck_id: row.truckId, period: row.period, placed_at: l.placedAt, paid_online: l.paidOnline,
          food_minor: l.foodMinor, counted_minor: l.countedMinor, allowance_before_minor: l.allowanceBeforeMinor,
          fee_minor: l.feeMinor, fee_via: l.feeVia, fee_taken_minor: l.feeTakenMinor, plan_key: l.planKey, fee_bps: l.feeBps,
        })))
        fail('save usage lines', li)
      }
      return true
    },

    async planHistory(truckId): Promise<PlanHistoryRow[]> {
      const { data, error } = await db.from('truck_plan_history').select('plan_key, trial_expires_at, changed_at').eq('truck_id', truckId).order('changed_at').order('id')
      fail(`plan history ${truckId}`, error)
      return ((data ?? []) as Row[]).map(r => ({
        planKey: String(r.plan_key), trialExpiresAt: str(r.trial_expires_at),
        // PostgREST renders -infinity as the string "-infinity"
        changedAt: String(r.changed_at) === '-infinity' ? '-infinity' : String(r.changed_at),
      }))
    },
    async setTruckPlan(truckId, planKey) {
      // 🔴 the only write billing makes to trucks: the plan, for an upgrade now or a downgrade on the 1st (the trigger records it)
      const { error } = await db.from('trucks').update({ plan: planKey }).eq('id', truckId)
      fail(`set plan ${truckId}`, error)
    },

    async charge(truckId, period, kind, ref) {
      const { data, error } = await db.from('billing_charges').select('*').eq('truck_id', truckId).eq('period', period).eq('kind', kind).eq('ref', ref).maybeSingle()
      fail(`charge ${truckId} ${period} ${kind}`, error)
      return data ? mapCharge(data as Row) : null
    },
    async listCharges(truckId) {
      const { data, error } = await db.from('billing_charges').select('*').eq('truck_id', truckId).order('computed_at', { ascending: false }).limit(48)
      fail(`charges ${truckId}`, error)
      return ((data ?? []) as Row[]).map(mapCharge)
    },
    async carriedPool(truckId) {
      const { data, error } = await db.from('billing_charges').select('*').eq('truck_id', truckId).eq('state', 'carried').is('carried_into', null)
      fail(`carried ${truckId}`, error)
      return ((data ?? []) as Row[]).map(mapCharge)
    },
    async insertCharge(row, opts) {
      const cols: Row = {}
      for (const [k, c] of Object.entries(C_COLS)) if (k !== 'id' && k !== 'computedAt' && k !== 'carriedInto') cols[c] = (row as unknown as Row)[k]
      const { data, error } = await db.from('billing_charges').insert(cols).select('*').single()
      if (error?.code === '23505') {
        const existing = await this.charge(row.truckId, row.period, row.kind, row.ref)
        if (!existing) throw new Error('[billing/store] charge claim collided but no row was found')
        return { inserted: false, row: existing }
      }
      fail('insert charge', error)
      const created = mapCharge(data as Row)
      if (opts.consume.length) {
        const { error: ce } = await db.from('billing_charges').update({ carried_into: created.id }).in('id', opts.consume).is('carried_into', null)
        fail('consume carried', ce)
      }
      if (opts.billsUsage) {
        const { error: ue } = await db.from('billing_usage').update({ state: 'billed', charge_id: created.id }).eq('truck_id', row.truckId).eq('period', opts.billsUsage).eq('state', 'open')
        fail('bill usage', ue)
      }
      return { inserted: true, row: created }
    },
    async updateCharge(id, patch) {
      const { data, error } = await db.from('billing_charges').update({ ...(patch.state ? { state: patch.state } : {}) }).eq('id', id).select('*').single()
      fail('update charge', error)
      return mapCharge(data as Row)
    },

    async invoiceForCharge(chargeId) {
      const { data, error } = await db.from('billing_invoices').select('*').eq('charge_id', chargeId).maybeSingle()
      fail('invoice for charge', error)
      return data ? mapInvoice(data as Row) : null
    },
    async invoiceByStripeId(id) {
      const { data, error } = await db.from('billing_invoices').select('*').eq('stripe_invoice_id', id).maybeSingle()
      fail('invoice by stripe id', error)
      return data ? mapInvoice(data as Row) : null
    },
    async listInvoices(truckId) {
      const { data, error } = await db.from('billing_invoices').select('*').eq('truck_id', truckId).order('created_at', { ascending: false }).limit(48)
      fail(`invoices ${truckId}`, error)
      return ((data ?? []) as Row[]).map(mapInvoice)
    },
    async claimInvoice(row) {
      const { data, error } = await db.from('billing_invoices').insert({
        charge_id: row.chargeId, truck_id: row.truckId, period: row.period, currency: row.currency, amount_minor: row.amountMinor, livemode: row.livemode, status: 'creating',
      }).select('*').single()
      if (error?.code === '23505') {
        const existing = await this.invoiceForCharge(row.chargeId)
        if (!existing) throw new Error('[billing/store] invoice claim collided but no row was found')
        return { claimed: false, row: existing }
      }
      fail('claim invoice', error)
      return { claimed: true, row: mapInvoice(data as Row) }
    },
    async updateInvoice(id, patch) {
      const cols: Row = { updated_at: new Date().toISOString() }
      for (const [k, v] of Object.entries(patch)) { const c = I_COLS[k as keyof InvoiceRow]; if (c) cols[c] = v }
      const { data, error } = await db.from('billing_invoices').update(cols).eq('id', id).select('*').single()
      fail('update invoice', error)
      return mapInvoice(data as Row)
    },
  }
}

/** The server's store, on the shared service-role client. */
export async function serverBillingStore(): Promise<BillingStore> {
  const { supabase } = await import('@/lib/supabase')
  return supabaseBillingStore(supabase as unknown as SupabaseClient)
}
