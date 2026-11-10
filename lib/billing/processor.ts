// lib/billing/processor.ts — billing-1: THE ONE PLACE BILLING TALKS TO STRIPE (HatchGrab's PLATFORM account: Customers,
// SetupIntents, Invoices — never a connected account). SERVER ONLY.
//
// ── 🔴 TEST MODE ONLY, BY CONSTRUCTION ──────────────────────────────────────────────────────────────────────────────
// This build bills NOBODY. Its Stripe client is built from STRIPE_BILLING_TEST_SECRET_KEY and REFUSES any key that does
// not start `sk_test_` — it never falls back to STRIPE_SECRET_KEY (which is the LIVE key, locally and in production). So no
// call in this file can create a live object, whatever the switch says. Going live is a deliberate later change to
// `billingSecretKey()` below and nothing else (docs/billing-1-report.md, hand steps).
//
// The rest of billing talks to the BillingProcessor interface, so the harness (scripts/billing-1.cjs) runs every rule
// against a fake one and scripts/billing-1-stripe-test.cjs runs the same engine against Stripe's test mode.
//
// ── IDEMPOTENCY ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Every mutating call carries a key derived from the truck, the period and the step (`billing:<truck>:<period>:…`), never a
// clock or a random value — a retried month-end replays Stripe's first answer instead of creating a second invoice. The
// database's unique (truck_id, period) on billing_invoices is the outer guard.
import 'server-only'
import Stripe from 'stripe'
import { STRIPE_TIMEOUT_MS, STRIPE_MAX_NETWORK_RETRIES } from '@/lib/stripe/client'
import type { PaymentMethodType, InvoiceLine } from '@/lib/billing/rules'

export interface ProcessorInvoice {
  id: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  amountDueMinor: number
  amountPaidMinor: number
  attemptCount: number
  lastError: string | null
  finalizedAt: string | null
  paidAt: string | null
  hostedUrl: string | null
  metadata: Record<string, string>
}

export interface ProcessorPaymentMethod { id: string; type: PaymentMethodType | 'other'; label: string }

export interface BillingProcessor {
  livemode: boolean
  ensureCustomer(a: { operatorId: string; email: string | null; name: string | null; locale: string }): Promise<{ id: string }>
  createSetupIntent(a: { customerId: string; truckId: string; type: PaymentMethodType; currency: string; maxMinor?: number }): Promise<{ id: string; clientSecret: string | null; status: string }>
  retrievePaymentMethod(id: string): Promise<ProcessorPaymentMethod>
  /** TEST ONLY: attach one of Stripe's test payment methods (pm_card_visa, pm_card_chargeCustomerFail…) to the customer. */
  attachTestPaymentMethod(a: { customerId: string; testToken: string }): Promise<ProcessorPaymentMethod>
  createInvoice(a: {
    customerId: string; truckId: string; period: string; currency: string; lines: InvoiceLine[]
    paymentMethodId: string; paymentMethodType: PaymentMethodType; description: string
    /** Every Stripe call's key starts with this (one charge → one key; a late-fee re-issue adds ':late'). */
    idempotencyBase: string
  }): Promise<ProcessorInvoice>
  /** Void an open invoice (the late fee re-issues it). A paid invoice cannot be voided: it comes back as paid. */
  voidInvoice(id: string): Promise<ProcessorInvoice>
  /** Ask Stripe to collect now (Stripe's own automatic attempt and Smart Retries happen without this). */
  payInvoice(id: string, paymentMethodId?: string): Promise<ProcessorInvoice>
  retrieveInvoice(id: string): Promise<ProcessorInvoice>
}

/** 🔴 THE KEY: the billing TEST key only. Anything else is refused — never STRIPE_SECRET_KEY. */
export function billingSecretKey(): string {
  const key = process.env.STRIPE_BILLING_TEST_SECRET_KEY || ''
  if (!key) throw new Error('[billing] STRIPE_BILLING_TEST_SECRET_KEY is not set — billing-1 runs against Stripe TEST mode only')
  if (!key.startsWith('sk_test_')) throw new Error('[billing] STRIPE_BILLING_TEST_SECRET_KEY is not a test key (sk_test_…) — refused; billing-1 never touches live mode')
  return key
}

/** Is a billing test key configured? A classification only — the key is never returned or logged. */
export function billingKeyState(): 'test' | 'missing' | 'refused' {
  const key = process.env.STRIPE_BILLING_TEST_SECRET_KEY || ''
  return !key ? 'missing' : key.startsWith('sk_test_') ? 'test' : 'refused'
}

const iso = (s: number | null | undefined) => (typeof s === 'number' && s > 0 ? new Date(s * 1000).toISOString() : null)

/** A Stripe invoice (from the API or a webhook payload) in billing's own shape. */
export function processorInvoiceOf(i: Stripe.Invoice): ProcessorInvoice {
  const lastErr = (i as unknown as { last_finalization_error?: { message?: string } }).last_finalization_error?.message ?? null
  return {
    id: String(i.id),
    status: (i.status ?? 'draft') as ProcessorInvoice['status'],
    amountDueMinor: i.amount_due ?? 0,
    amountPaidMinor: i.amount_paid ?? 0,
    attemptCount: i.attempt_count ?? 0,
    lastError: lastErr,
    finalizedAt: iso(i.status_transitions?.finalized_at),
    paidAt: iso(i.status_transitions?.paid_at),
    hostedUrl: i.hosted_invoice_url ?? null,
    metadata: (i.metadata ?? {}) as Record<string, string>,
  }
}

/** A Stripe payment method in billing's own shape (never the full number — brand and last four only). */
export function processorPaymentMethodOf(pm: Stripe.PaymentMethod): ProcessorPaymentMethod {
  if (pm.type === 'card' && pm.card) return { id: pm.id, type: 'card', label: `${pm.card.brand} •••• ${pm.card.last4}`.slice(0, 80) }
  if (pm.type === 'pix') return { id: pm.id, type: 'pix', label: 'Pix Automático' }
  if (pm.type === 'sepa_debit' && pm.sepa_debit) return { id: pm.id, type: 'sepa_debit', label: `SEPA •••• ${pm.sepa_debit.last4}` }
  return { id: pm.id, type: 'other', label: pm.type }
}

/** The real processor, on Stripe TEST mode. Throws (before any network call) without a test key. */
export function stripeBillingProcessor(): BillingProcessor {
  const stripe = new Stripe(billingSecretKey(), { timeout: STRIPE_TIMEOUT_MS, maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES })
  return {
    livemode: false,

    async ensureCustomer(a) {
      // One Customer per truck owner. Found by our own metadata first, so a lost database row never makes a second one.
      const found = await stripe.customers.search({ query: `metadata['hatchgrab_operator_id']:'${a.operatorId.replace(/'/g, '')}'`, limit: 1 })
      if (found.data[0]) return { id: found.data[0].id }
      const c = await stripe.customers.create({
        email: a.email ?? undefined,
        name: a.name ?? undefined,
        preferred_locales: [a.locale],
        metadata: { hatchgrab_operator_id: a.operatorId, hatchgrab: 'billing-1' },
      }, { idempotencyKey: `billing:customer:${a.operatorId}` })
      return { id: c.id }
    },

    async createSetupIntent(a) {
      const params: Stripe.SetupIntentCreateParams = {
        customer: a.customerId,
        usage: 'off_session',
        payment_method_types: [a.type],
        metadata: { truck_id: a.truckId, hatchgrab: 'billing-1' },
      }
      if (a.type === 'pix') {
        // Pix Automático: a monthly mandate up to a maximum, in BRL only (SetupIntent payment_method_options.pix.mandate_options).
        params.payment_method_options = { pix: { mandate_options: {
          amount_type: 'maximum', amount: a.maxMinor ?? 40000, currency: 'brl', payment_schedule: 'monthly', reference: 'HatchGrab',
        } } }
      }
      const si = await stripe.setupIntents.create(params)
      return { id: si.id, clientSecret: si.client_secret ?? null, status: si.status }
    },

    async retrievePaymentMethod(id) { return processorPaymentMethodOf(await stripe.paymentMethods.retrieve(id)) },

    async attachTestPaymentMethod(a) {
      if (!/^pm_[a-zA-Z0-9_]+$/.test(a.testToken)) throw new Error('[billing] not a Stripe test payment method token')
      const pm = await stripe.paymentMethods.attach(a.testToken, { customer: a.customerId })
      return processorPaymentMethodOf(pm)
    },

    async createInvoice(a) {
      const key = a.idempotencyBase
      const currency = a.currency.toLowerCase()
      const inv = await stripe.invoices.create({
        customer: a.customerId,
        currency,
        collection_method: 'charge_automatically',
        auto_advance: true,
        default_payment_method: a.paymentMethodId,
        pending_invoice_items_behavior: 'exclude',
        payment_settings: { payment_method_types: [a.paymentMethodType] },
        description: a.description,
        metadata: { truck_id: a.truckId, period: a.period, hatchgrab: 'billing-1', charge: a.idempotencyBase.slice(0, 450) },
      }, { idempotencyKey: `${key}:invoice` })
      for (const l of a.lines) {
        await stripe.invoiceItems.create({
          customer: a.customerId, invoice: inv.id, currency, amount: l.amountMinor, description: l.description,
          metadata: { truck_id: a.truckId, period: a.period, line: l.key },
        }, { idempotencyKey: `${key}:item:${l.key}` })
      }
      const fin = await stripe.invoices.finalizeInvoice(String(inv.id), { auto_advance: true }, { idempotencyKey: `${key}:finalize` })
      return processorInvoiceOf(fin)
    },

    async payInvoice(id, paymentMethodId) {
      try {
        return processorInvoiceOf(await stripe.invoices.pay(id, paymentMethodId ? { payment_method: paymentMethodId } : {}))
      } catch (err) {
        // A declined attempt is an ANSWER, not an error: return the invoice as it now stands (attempt_count moved).
        const inv = processorInvoiceOf(await stripe.invoices.retrieve(id))
        return { ...inv, lastError: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500) }
      }
    },

    async retrieveInvoice(id) { return processorInvoiceOf(await stripe.invoices.retrieve(id)) },

    async voidInvoice(id) {
      try { return processorInvoiceOf(await stripe.invoices.voidInvoice(id, {}, { idempotencyKey: `billing:void:${id}` })) }
      catch (err) {
        const inv = processorInvoiceOf(await stripe.invoices.retrieve(id))
        if (inv.status === 'paid' || inv.status === 'void') return inv
        throw err
      }
    },
  }
}
