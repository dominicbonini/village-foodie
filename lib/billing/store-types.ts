// lib/billing/store-types.ts — billing-1: WHAT BILLING READS AND WRITES, as one interface. PURE (types only).
// lib/billing/store.ts implements it on the database (service role); lib/billing/memory-store.ts implements it in memory
// for the harnesses. The engine (lib/billing/engine.ts) and the gate (lib/billing/gate.ts) only ever see this interface,
// so the rules the harness proves are the rules the server runs.
import type { CountryBilling, PaymentMethodState, PaymentMethodType, BillingStatus, BillingTruck, UsageOrder, UsageLine } from '@/lib/billing/rules'

export interface BillingSwitches { enabled: boolean; pauseAfterDays: number }

export interface CountryBillingFacts {
  countryCode: string
  currency: string
  locale: string
  platformFeeEnabled: boolean
  platformFeeAllowed: boolean
}

export type StoredTruck = BillingTruck & { operator_id: string | null; name: string; country: string; currency: string; slug?: string | null }

export interface TruckBillingRow {
  truckId: string
  postPay: boolean
  billingTest: boolean
  paymentMethodState: PaymentMethodState
  paymentMethodType: PaymentMethodType | null
  stripePaymentMethodId: string | null
  stripeSetupIntentId: string | null
  paymentMethodLabel: string | null
  paymentMethodUpdatedAt: string | null
  paymentMethodLivemode: boolean | null
  status: BillingStatus | null
  statusReason: string | null
  statusChangedAt: string | null
}

export interface UsageRow {
  truckId: string
  period: string
  currency: string
  countryCode: string
  paymentModel: string
  postPay: boolean
  planKey: string
  preorderCount: number
  countedOnlineMinor: number
  countedAtTruckMinor: number
  countedMinor: number
  allowanceMinor: number | null
  allowanceUsedMinor: number
  feeBps: number
  feeDueMinor: number
  feeTakenMinor: number
  feeBilledMinor: number
  planFeeMinor: number
  planDays: number
  periodDays: number
  extraVansMinor: number
  surchargeMinor: number
  carriedInMinor: number
  amountDueMinor: number
  chargedMinor: number
  carriedOutMinor: number
  minChargeMinor: number
  inputsDigest: string
  state: 'open' | 'invoiced' | 'carried' | 'nothing'
  computedAt: string
}

export type InvoiceStatus = 'creating' | 'open' | 'paid' | 'failed' | 'void' | 'uncollectible'

export interface InvoiceRow {
  id: string
  truckId: string
  period: string
  currency: string
  amountMinor: number
  livemode: boolean
  stripeInvoiceId: string | null
  status: InvoiceStatus
  dueAt: string | null
  attemptCount: number
  lastError: string | null
  hostedInvoiceUrl: string | null
  createdAt: string
  finalizedAt: string | null
  paidAt: string | null
}

export interface BillingStore {
  switches(): Promise<BillingSwitches>
  countryBilling(code: string): Promise<CountryBilling | null>
  listCountryBilling(): Promise<CountryBilling[]>
  /** Upsert one country's row; `expectedUpdatedAt` (when given) is the stale-save guard — no match, no write (null). */
  saveCountryBilling(row: CountryBilling, by: string, expectedUpdatedAt?: string | null): Promise<CountryBilling | null>
  countryFacts(code: string): Promise<CountryBillingFacts | null>

  truck(id: string): Promise<StoredTruck | null>
  /** Trucks that could be billed: customers, and test trucks that opted in (truck_billing.billing_test). */
  candidateTruckIds(): Promise<string[]>
  operator(id: string): Promise<{ id: string; email: string | null; name: string | null } | null>
  vanCount(truckId: string): Promise<number>

  truckBilling(truckId: string): Promise<TruckBillingRow | null>
  upsertTruckBilling(truckId: string, patch: Partial<Omit<TruckBillingRow, 'truckId'>>, by: string): Promise<TruckBillingRow>
  truckBillingBySetupIntent(setupIntentId: string): Promise<TruckBillingRow | null>

  customerFor(operatorId: string): Promise<{ stripeCustomerId: string; livemode: boolean } | null>
  saveCustomer(operatorId: string, stripeCustomerId: string, livemode: boolean): Promise<void>

  /** The truck's pre-orders (source 'web') placed in [startIso, endIso), with their online payment and fee facts. */
  usageOrders(truckId: string, startIso: string, endIso: string): Promise<UsageOrder[]>

  usage(truckId: string, period: string): Promise<UsageRow | null>
  usageLines(truckId: string, period: string): Promise<UsageLine[]>
  listUsage(truckId: string): Promise<UsageRow[]>
  /** Replace an OPEN (or absent) month and its lines. Refuses (returns false) once the month is frozen. */
  replaceUsage(row: UsageRow, lines: UsageLine[]): Promise<boolean>
  /** Freeze a month (open → invoiced | carried | nothing). */
  freezeUsage(truckId: string, period: string, state: 'invoiced' | 'carried' | 'nothing'): Promise<void>

  invoice(truckId: string, period: string): Promise<InvoiceRow | null>
  invoiceByStripeId(stripeInvoiceId: string): Promise<InvoiceRow | null>
  listInvoices(truckId: string): Promise<InvoiceRow[]>
  /** 🔴 THE CLAIM: insert (truck, period) as 'creating'. `claimed: false` = a row already exists (returned) — never a second. */
  claimInvoice(row: Omit<InvoiceRow, 'id' | 'createdAt' | 'finalizedAt' | 'paidAt' | 'stripeInvoiceId' | 'status' | 'attemptCount' | 'lastError' | 'hostedInvoiceUrl' | 'dueAt'>): Promise<{ claimed: boolean; row: InvoiceRow }>
  updateInvoice(id: string, patch: Partial<Omit<InvoiceRow, 'id' | 'truckId' | 'period'>>): Promise<InvoiceRow>
}
