// app/api/webhooks/stripe-billing/route.ts — billing-1 (10 November 2026): STRIPE EVENTS FROM HATCHGRAB'S OWN (PLATFORM) ACCOUNT
// — the trucks' invoices and payment methods. A SEPARATE endpoint from /api/webhooks/stripe (which receives the CONNECTED
// accounts' events and is unchanged): Stripe sends platform events and Connect events to differently-scoped endpoints, each
// with its own signing secret — this one's is STRIPE_BILLING_WEBHOOK_SECRET.
//
// The house rules of the other endpoint, kept: the raw body is read first and verified before it is parsed; an unverified
// request gets a bare 400; every event is recorded in stripe_webhook_events BEFORE it is handled (the unique event id is the
// duplicate guard; a recorded event whose handler never finished runs again on redelivery); 200 only once recorded.
//
// 🔴 TEST MODE ONLY IN THIS BUILD: a livemode event is recorded and IGNORED (billing-1 creates nothing live, so a live event
// cannot be about anything it made).
// Handled:
//   invoice.finalized · invoice.paid · invoice.payment_succeeded · invoice.payment_failed · invoice.voided ·
//   invoice.marked_uncollectible             → our billing_invoices row and the truck's status (paying resumes ordering)
//   setup_intent.succeeded / setup_failed    → the truck's payment method on file (card, Pix Automático)
//   payment_method.detached · mandate.updated (inactive) → the method is no longer usable
// Anything else: recorded, 200, nothing done.
import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { parseSigningSecrets, verifyStripeSignature } from '@/lib/stripe/webhook-signature'
import { supabaseBillingStore } from '@/lib/billing/store'
import { applyInvoiceUpdate, applyPaymentMethod } from '@/lib/billing/engine'
import { processorInvoiceOf, stripeBillingProcessor } from '@/lib/billing/processor'
import { getPlanCatalog } from '@/lib/plans-server'

export const runtime = 'nodejs'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const INVOICE_EVENTS = new Set(['invoice.finalized', 'invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible'])

export async function POST(req: NextRequest) {
  let rawBody: string
  try { rawBody = await req.text() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const secrets = parseSigningSecrets(process.env.STRIPE_BILLING_WEBHOOK_SECRET)
  const verification = verifyStripeSignature({ rawBody, signatureHeader: req.headers.get('stripe-signature'), secrets })
  if (!verification.ok) {
    console.error(`[webhook/stripe-billing] REFUSED reason=${verification.reason} secretsConfigured=${secrets.length} bodyBytes=${rawBody.length}`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }
  let event: Stripe.Event
  try { event = JSON.parse(rawBody) as Stripe.Event } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (typeof event.id !== 'string' || typeof event.type !== 'string' || typeof event.livemode !== 'boolean') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // Record first; the unique event id arbitrates duplicates (the same idiom as /api/webhooks/stripe).
  const { error: insertErr } = await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: event.id, type: event.type, livemode: event.livemode, connected_account: null,
    api_version: typeof event.api_version === 'string' ? event.api_version : null,
    stripe_created_at: typeof event.created === 'number' ? new Date(event.created * 1000).toISOString() : null,
  })
  if (insertErr) {
    if (insertErr.code !== '23505') {
      console.error(`[webhook/stripe-billing] PERSIST FAILED id=${event.id}: ${insertErr.message}`)
      return NextResponse.json({ error: 'Not recorded' }, { status: 500 })
    }
    const { data: seen } = await supabase.from('stripe_webhook_events').select('handled').eq('stripe_event_id', event.id).maybeSingle()
    if ((seen as { handled?: boolean } | null)?.handled) return NextResponse.json({ received: true, duplicate: true })
  }

  let result = 'ignored'
  try {
    result = await handle(event)
  } catch (err) {
    // Recorded but not handled: 500 so Stripe redelivers, and the redelivery runs the handler again.
    console.error(`[webhook/stripe-billing] HANDLER FAILED id=${event.id} type=${event.type}:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
  await supabase.from('stripe_webhook_events').update({ handled: true, handled_at: new Date().toISOString(), handler_result: result.slice(0, 200) }).eq('stripe_event_id', event.id)
  return NextResponse.json({ received: true, result })
}

async function handle(event: Stripe.Event): Promise<string> {
  if (event.livemode) return 'ignored_live (billing-1 is test mode only)'
  const store = supabaseBillingStore(supabase)
  const now = new Date()

  if (INVOICE_EVENTS.has(event.type)) {
    const inv = event.data.object as Stripe.Invoice
    if ((inv.metadata ?? {}).hatchgrab !== 'billing-1') return 'ignored_not_ours'
    return `invoice_${await applyInvoiceUpdate(store, await getPlanCatalog(), processorInvoiceOf(inv), now)}`
  }

  if (event.type === 'setup_intent.succeeded' || event.type === 'setup_intent.setup_failed') {
    const si = event.data.object as Stripe.SetupIntent
    const truckId = (si.metadata ?? {}).truck_id || (await store.truckBillingBySetupIntent(si.id))?.truckId
    if (!truckId) return 'ignored_no_truck'
    if (event.type === 'setup_intent.setup_failed') {
      await applyPaymentMethod(store, await getPlanCatalog(), { truckId, pm: null, state: 'failed', livemode: false, now, by: 'stripe_webhook', setupIntentId: si.id })
      return 'payment_method_failed'
    }
    const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id
    if (!pmId) return 'ignored_no_payment_method'
    const pm = await stripeBillingProcessor().retrievePaymentMethod(pmId)
    await applyPaymentMethod(store, await getPlanCatalog(), { truckId, pm, state: 'valid', livemode: false, now, by: 'stripe_webhook', setupIntentId: si.id })
    return 'payment_method_valid'
  }

  if (event.type === 'payment_method.detached' || event.type === 'mandate.updated') {
    const obj = event.data.object as { id: string; payment_method?: string | { id: string }; status?: string }
    if (event.type === 'mandate.updated' && obj.status !== 'inactive') return 'ignored_mandate_active'
    const pmId = event.type === 'payment_method.detached' ? obj.id : typeof obj.payment_method === 'string' ? obj.payment_method : obj.payment_method?.id
    if (!pmId) return 'ignored'
    const { data } = await supabase.from('truck_billing').select('truck_id').eq('stripe_payment_method_id', pmId)
    const rows = (data ?? []) as { truck_id: string }[]
    for (const r of rows) {
      await applyPaymentMethod(store, await getPlanCatalog(), { truckId: r.truck_id, pm: null, state: event.type === 'mandate.updated' ? 'failed' : 'none', livemode: false, now, by: 'stripe_webhook' })
    }
    return `payment_method_removed:${rows.length}`
  }
  return 'ignored'
}
