// lib/billing/memory-store.ts — billing-1: the BillingStore IN MEMORY, for the harnesses (scripts/billing-1.cjs). PURE.
// Same contract as lib/billing/store.ts on the database — including the two guards that matter: a frozen month is never
// replaced, and (truck, period) can be claimed for an invoice only once. Not imported by any app code.
import type { CountryBilling, UsageOrder, UsageLine, PlanHistoryRow } from '@/lib/billing/rules'
import type { BillingStore, BillingSwitches, CountryBillingFacts, StoredTruck, TruckBillingRow, UsageRow, InvoiceRow, ChargeRow } from '@/lib/billing/store-types'

export interface MemoryOrder { order_key: string; truck_id: string; source: string; status: string; food_minor: number | null; placed_at: string }
export interface MemoryPayment { order_key: string; kind: 'charge' | 'refund'; amount_minor: number; application_fee_minor?: number | null; application_fee_refunded_minor?: number | null }

export interface MemoryData {
  switches: BillingSwitches
  countryBilling: CountryBilling[]
  countryFacts: CountryBillingFacts[]
  trucks: StoredTruck[]
  operators: { id: string; email: string | null; name: string | null }[]
  vans: Record<string, number>
  truckBilling: TruckBillingRow[]
  customers: { operatorId: string; stripeCustomerId: string; livemode: boolean }[]
  orders: MemoryOrder[]
  payments: MemoryPayment[]
  usage: UsageRow[]
  usageLines: (UsageLine & { truckId: string; period: string })[]
  history: (PlanHistoryRow & { truckId: string })[]
  charges: ChargeRow[]
  invoices: InvoiceRow[]
  /** Every write, in order — the harness proves "switch off = nothing written" from it. */
  writes: string[]
}

export function emptyMemoryData(): MemoryData {
  return { switches: { enabled: false, pauseAfterDays: 5 }, countryBilling: [], countryFacts: [], trucks: [], operators: [], vans: {}, truckBilling: [],
    customers: [], orders: [], payments: [], usage: [], usageLines: [], history: [], charges: [], invoices: [], writes: [] }
}

const DEFAULT_TB = (truckId: string): TruckBillingRow => ({
  truckId, postPay: false, billingTest: false, paymentMethodState: 'none', paymentMethodType: null, stripePaymentMethodId: null, stripeSetupIntentId: null,
  paymentMethodLabel: null, paymentMethodUpdatedAt: null, paymentMethodLivemode: null, status: null, statusReason: null, statusChangedAt: null,
  pendingPlanKey: null, pendingPlanFrom: null,
})

export function memoryBillingStore(d: MemoryData): BillingStore {
  let seq = 0
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
  return {
    async switches() { return { ...d.switches } },
    async countryBilling(code) { const r = d.countryBilling.find(c => c.countryCode === code); return r ? { ...r } : null },
    async listCountryBilling() { return d.countryBilling.map(r => ({ ...r })) },
    async saveCountryBilling(row, by, expectedUpdatedAt) {
      const i = d.countryBilling.findIndex(c => c.countryCode === row.countryCode)
      if (i >= 0 && expectedUpdatedAt && d.countryBilling[i].updatedAt !== expectedUpdatedAt) return null
      const saved = { ...row, updatedAt: new Date(Date.now() + ++seq).toISOString(), updatedBy: by }
      if (i >= 0) d.countryBilling[i] = saved; else d.countryBilling.push(saved)
      d.writes.push(`country_billing:${row.countryCode}`)
      return { ...saved }
    },
    async countryFacts(code) { const r = d.countryFacts.find(c => c.countryCode === code); return r ? { ...r } : null },
    async truck(id) { const t = d.trucks.find(x => x.id === id); return t ? { ...t } : null },
    async candidateTruckIds() {
      return [...new Set([...d.trucks.filter(t => t.is_customer === true).map(t => t.id), ...d.truckBilling.filter(t => t.billingTest).map(t => t.truckId)])].sort()
    },
    async operator(id) { const o = d.operators.find(x => x.id === id); return o ? { ...o } : null },
    async vanCount(truckId) { return Math.max(1, d.vans[truckId] ?? 1) },
    async truckBilling(truckId) { const r = d.truckBilling.find(x => x.truckId === truckId); return r ? { ...r } : null },
    async upsertTruckBilling(truckId, patch) {
      let r = d.truckBilling.find(x => x.truckId === truckId)
      if (!r) { r = DEFAULT_TB(truckId); d.truckBilling.push(r) }
      Object.assign(r, patch)
      d.writes.push(`truck_billing:${truckId}`)
      return { ...r }
    },
    async truckBillingBySetupIntent(id) { const r = d.truckBilling.find(x => x.stripeSetupIntentId === id); return r ? { ...r } : null },
    async customerFor(operatorId) { const c = d.customers.find(x => x.operatorId === operatorId); return c ? { stripeCustomerId: c.stripeCustomerId, livemode: c.livemode } : null },
    async saveCustomer(operatorId, stripeCustomerId, livemode) {
      d.customers = d.customers.filter(x => x.operatorId !== operatorId).concat([{ operatorId, stripeCustomerId, livemode }])
      d.writes.push(`operator_billing:${operatorId}`)
    },
    async usageOrders(truckId, startIso, endIso): Promise<UsageOrder[]> {
      return d.orders
        .filter(o => o.truck_id === truckId && o.source === 'web' && Date.parse(o.placed_at) >= Date.parse(startIso) && Date.parse(o.placed_at) < Date.parse(endIso))
        .map(o => {
          const mine = d.payments.filter(p => p.order_key === o.order_key)
          const captured = mine.filter(p => p.kind === 'charge').reduce((s, p) => s + p.amount_minor, 0)
          const refunded = mine.filter(p => p.kind === 'refund').reduce((s, p) => s + p.amount_minor, 0)
          const fee = mine.reduce((s, p) => s + (p.application_fee_minor ?? 0) - (p.application_fee_refunded_minor ?? 0), 0)
          return { orderKey: o.order_key, placedAt: o.placed_at, source: o.source, status: o.status, foodMinor: o.food_minor,
            paidOnline: captured > 0, capturedMinor: captured, refundedMinor: refunded, feeTakenMinor: Math.max(0, fee) }
        })
    },
    async usage(truckId, period) { const r = d.usage.find(u => u.truckId === truckId && u.period === period); return r ? clone(r) : null },
    async usageLines(truckId, period) { return d.usageLines.filter(l => l.truckId === truckId && l.period === period).map(({ truckId: _t, period: _p, ...l }) => { void _t; void _p; return { ...l } }) },
    async listUsage(truckId) { return d.usage.filter(u => u.truckId === truckId).sort((a, b) => b.period.localeCompare(a.period)).map(clone) },
    async replaceUsage(row, lines) {
      const i = d.usage.findIndex(u => u.truckId === row.truckId && u.period === row.period)
      if (i >= 0 && d.usage[i].state !== 'open') return false
      const r = clone({ ...row, state: 'open' as const, chargeId: null })
      if (i >= 0) d.usage[i] = r; else d.usage.push(r)
      d.usageLines = d.usageLines.filter(l => !(l.truckId === row.truckId && l.period === row.period)).concat(lines.map(l => ({ ...l, truckId: row.truckId, period: row.period })))
      d.writes.push(`billing_usage:${row.truckId}:${row.period}`)
      return true
    },
    async planHistory(truckId) {
      return d.history.filter(h => h.truckId === truckId).map(({ truckId: _t, ...h }) => { void _t; return { ...h } })
    },
    async setTruckPlan(truckId, planKey, _by, at) {
      // As the database trigger does: the first change also records the state before it ('-infinity').
      const t = d.trucks.find(x => x.id === truckId)
      if (!t) throw new Error(`[memory-store] no truck ${truckId}`)
      if (!d.history.some(h => h.truckId === truckId)) d.history.push({ truckId, planKey: String(t.plan), trialExpiresAt: t.trial_expires_at ?? null, changedAt: '-infinity' })
      t.plan = planKey
      d.history.push({ truckId, planKey, trialExpiresAt: t.trial_expires_at ?? null, changedAt: at })
      d.writes.push(`trucks.plan:${truckId}`)
    },
    async charge(truckId, period, kind, ref) { const c = d.charges.find(x => x.truckId === truckId && x.period === period && x.kind === kind && x.ref === ref); return c ? { ...c } : null },
    async listCharges(truckId) { return d.charges.filter(c => c.truckId === truckId).map(c => ({ ...c })) },
    async carriedPool(truckId) { return d.charges.filter(c => c.truckId === truckId && c.state === 'carried' && c.carriedInto === null).map(c => ({ ...c })) },
    async insertCharge(row, opts) {
      const existing = d.charges.find(x => x.truckId === row.truckId && x.period === row.period && x.kind === row.kind && x.ref === row.ref)
      if (existing) return { inserted: false, row: { ...existing } }
      const created: ChargeRow = { ...row, id: `charge-${++seq}`, carriedInto: null, computedAt: new Date().toISOString() }
      d.charges.push(created)
      for (const c of d.charges) if (opts.consume.includes(c.id) && c.carriedInto === null) c.carriedInto = created.id
      if (opts.billsUsage) { const u = d.usage.find(x => x.truckId === row.truckId && x.period === opts.billsUsage && x.state === 'open'); if (u) { u.state = 'billed'; u.chargeId = created.id } }
      d.writes.push(`billing_charges:${row.truckId}:${row.period}:${row.kind}:${row.ref}`)
      return { inserted: true, row: { ...created } }
    },
    async updateCharge(id, patch) {
      const c = d.charges.find(x => x.id === id)
      if (!c) throw new Error(`[memory-store] no charge ${id}`)
      Object.assign(c, patch)
      d.writes.push(`billing_charges_update:${id}`)
      return { ...c }
    },
    async invoiceForCharge(chargeId) { const r = d.invoices.find(i => i.chargeId === chargeId); return r ? { ...r } : null },
    async invoiceByStripeId(id) { const r = d.invoices.find(i => i.stripeInvoiceId === id); return r ? { ...r } : null },
    async listInvoices(truckId) { return d.invoices.filter(i => i.truckId === truckId).map(i => ({ ...i })) },
    async claimInvoice(row) {
      const existing = d.invoices.find(i => i.chargeId === row.chargeId)
      if (existing) return { claimed: false, row: { ...existing } }
      const created: InvoiceRow = { ...row, id: `inv-row-${++seq}`, stripeInvoiceId: null, status: 'creating', dueAt: null, attemptCount: 0, lastError: null,
        hostedInvoiceUrl: null, createdAt: new Date().toISOString(), finalizedAt: null, paidAt: null, lateFeeMinor: null, replacedStripeInvoiceId: null }
      d.invoices.push(created)
      d.writes.push(`billing_invoices:${row.chargeId}`)
      return { claimed: true, row: { ...created } }
    },
    async updateInvoice(id, patch) {
      const r = d.invoices.find(i => i.id === id)
      if (!r) throw new Error(`[memory-store] no invoice ${id}`)
      Object.assign(r, patch)
      d.writes.push(`billing_invoices_update:${id}`)
      return { ...r }
    },
  }
}
