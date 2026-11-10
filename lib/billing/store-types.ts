// lib/billing/store-types.ts — billing-1: WHAT BILLING READS AND WRITES, as one interface. PURE (types only).
// lib/billing/store.ts implements it on the database (service role); lib/billing/memory-store.ts implements it in memory
// for the harnesses. The engine (lib/billing/engine.ts) and the gate (lib/billing/gate.ts) only ever see this interface,
// so the rules the harness proves are the rules the server runs.
import type { CountryBilling, PaymentMethodState, PaymentMethodType, BillingStatus, BillingTruck, UsageOrder, UsageLine, PlanHistoryRow } from '@/lib/billing/rules'

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
  /** A downgrade waiting for the 1st (correction decision 3). */
  pendingPlanKey: string | null
  pendingPlanFrom: string | null
}

/** One month's USAGE (billed on the next 1st, in arrears). */
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
  periodDays: number
  surchargeMinor: number
  inputsDigest: string
  /** 'open' (rebuilt from orders) until a monthly charge bills it ('billed', chargeId). */
  state: 'open' | 'billed'
  chargeId: string | null
  computedAt: string
}

export type ChargeKind = 'monthly' | 'trial_end' | 'upgrade'
export type ChargeState = 'invoicing' | 'invoiced' | 'carried' | 'nothing'

/** One public.billing_charges row: something HatchGrab charges (or carries) — the monthly charge, a trial end, an upgrade. */
export interface ChargeRow {
  id: string
  truckId: string
  period: string
  kind: ChargeKind
  ref: string
  currency: string
  planKey: string
  fromPlanKey: string | null
  planMinor: number
  planDays: number
  periodDays: number
  vansMinor: number
  usagePeriod: string | null
  usageFeeMinor: number
  surchargeMinor: number
  carriedInMinor: number
  amountDueMinor: number
  chargedMinor: number
  carriedOutMinor: number
  carriedInto: string | null
  minChargeMinor: number
  state: ChargeState
  inputsDigest: string
  computedAt: string
}

export type InvoiceStatus = 'creating' | 'open' | 'paid' | 'failed' | 'void' | 'uncollectible'

export interface InvoiceRow {
  id: string
  chargeId: string
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
  /** The late-payment fee added (null = not decided yet; 0 = decided at the pause: none). */
  lateFeeMinor: number | null
  replacedStripeInvoiceId: string | null
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
  /** Replace an OPEN (or absent) usage month and its lines. Refuses (false) once it is billed. */
  replaceUsage(row: UsageRow, lines: UsageLine[]): Promise<boolean>

  /** The truck's plan history (truck_plan_history), oldest first. */
  planHistory(truckId: string): Promise<PlanHistoryRow[]>
  /** Set trucks.plan (a downgrade on the 1st, an upgrade at once). The database records the history by trigger (at its own
   *  now(); `at` is the in-memory store's clock). */
  setTruckPlan(truckId: string, planKey: string, by: string, at: string): Promise<void>

  charge(truckId: string, period: string, kind: ChargeKind, ref: string): Promise<ChargeRow | null>
  listCharges(truckId: string): Promise<ChargeRow[]>
  /** Carried charges not yet added to a monthly charge. */
  carriedPool(truckId: string): Promise<ChargeRow[]>
  /**
   * 🔴 THE CLAIM: insert a charge — unique (truck, period, kind, ref). `inserted: false` = it exists (returned), never a second.
   * When inserted: the carried charges `consume` point at it (carried_into), and the usage month `billsUsage` is marked billed.
   */
  insertCharge(row: Omit<ChargeRow, 'id' | 'computedAt' | 'carriedInto'>, opts: { consume: string[]; billsUsage: string | null }): Promise<{ inserted: boolean; row: ChargeRow }>
  updateCharge(id: string, patch: Partial<Pick<ChargeRow, 'state'>>): Promise<ChargeRow>

  invoiceForCharge(chargeId: string): Promise<InvoiceRow | null>
  invoiceByStripeId(stripeInvoiceId: string): Promise<InvoiceRow | null>
  listInvoices(truckId: string): Promise<InvoiceRow[]>
  /** 🔴 One invoice per charge: insert as 'creating'. `claimed: false` = it exists (returned). */
  claimInvoice(row: { chargeId: string; truckId: string; period: string; currency: string; amountMinor: number; livemode: boolean }): Promise<{ claimed: boolean; row: InvoiceRow }>
  updateInvoice(id: string, patch: Partial<Omit<InvoiceRow, 'id' | 'truckId' | 'period' | 'chargeId'>>): Promise<InvoiceRow>
}
