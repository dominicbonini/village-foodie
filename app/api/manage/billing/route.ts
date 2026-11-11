// app/api/manage/billing/route.ts — billing-2 (11 November 2026; docs/billing-2-report.md): MANAGE › BILLING's data and actions.
// POST { token, action, … } — the Manage pattern (dashboard token + the signed-in OWNER; crew and KDS never).
//   view               the Billing tab's data (lib/billing/view.ts) — or { visible: false }
//   notice             the one billing notice for the other tabs — or null
//   add_card           a Stripe-HOSTED card set-up (Checkout, setup mode) → { url }
//   add_pix            Pix Automático through Stripe's hosted instructions page (Brazil) → { url }
//   setup_return       { sessionId } — back from Checkout: the card on file, then every unpaid invoice tried on it at once
//   plan_preview       { planKey } — what "Switch to {plan}" will do (up: charged today; down: from the 1st)
//   change_plan        { planKey } — lib/billing/engine.ts requestPlanChange (billing-3: during the trial, the plan it ends into)
//   pre_order_payment  { value: 'online' | 'at_truck' } — truck_billing.post_pay, the ONE setting for it (no second is created)
// 🔴 VISIBLE ONLY while billing is switched on, or for a billing_test truck: every other truck gets { visible: false } and no action
// runs, so Manage › Billing stays exactly as today. Stripe calls go through lib/billing/processor.ts — TEST MODE ONLY.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveTruckAccessWith } from '@/lib/truck-access'
import { manageErrorBody } from '@/lib/i18n/manage-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { supabaseBillingStore } from '@/lib/billing/store'
import { loadBillingScreen } from '@/lib/billing/screen-server'
import { planChangePreview } from '@/lib/billing/view'
import { applyPaymentMethod, payOpenInvoices, requestPlanChange, refreshTruckBillingStatus, ensureCustomer } from '@/lib/billing/engine'
import { stripeBillingProcessor, type BillingProcessor } from '@/lib/billing/processor'
import { stripeLocaleFor } from '@/lib/billing/rules'
import { getPlanCatalog } from '@/lib/plans-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const db = () => createClient((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } })

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json(manageErrorBody(DEFAULT_LOCALE, 'bad_request'), 400) }
  const token = String(body.token ?? '')
  if (!token) return json(manageErrorBody(DEFAULT_LOCALE, 'token_required'), 401)
  const supabase = db()
  const { data: row } = await supabase.from('trucks').select('id, operator_id').eq('dashboard_token', token).maybeSingle()
  if (!row) return json(manageErrorBody(DEFAULT_LOCALE, 'invalid_token'), 401)
  const truckRow = row as { id: string; operator_id: string | null }
  const access = await resolveTruckAccessWith(supabase, req, truckRow)
  if (!access.ok) return json(manageErrorBody(DEFAULT_LOCALE, access.code), access.status)
  // 🔴 THE TRUCK OWNER ONLY — billing is the account's, never crew's.
  if (access.role !== 'owner') return json({ visible: false })

  const store = supabaseBillingStore(supabase)
  const catalog = await getPlanCatalog()
  const now = new Date()
  const loaded = await loadBillingScreen(store, catalog, truckRow.id, now)
  if (!loaded.visible) return json({ visible: false })
  const action = String(body.action ?? 'view')
  if (action === 'view') return json(loaded.view)
  if (action === 'notice') return json({ visible: true, notice: loaded.view.notice })
  if (action === 'plan_preview') return json(planChangePreview({ ...loaded.input, toPlanKey: String(body.planKey ?? '') }))
  if (action === 'pre_order_payment') {
    const value = body.value === 'at_truck' ? 'at_truck' : body.value === 'online' ? 'online' : null
    if (!value) return json({ error: 'bad_value', code: 'bad_value' }, 400)
    if (value === 'online' && !loaded.view.preOrderPayment.onlineAllowed) return json({ error: 'online_not_allowed', code: 'online_not_allowed' }, 400)
    await store.upsertTruckBilling(truckRow.id, { postPay: value === 'at_truck' }, `owner:${access.userId ?? 'demo'}`)
    await refreshTruckBillingStatus(store, catalog, truckRow.id, now, 'owner')
    return json((await loadBillingScreen(store, catalog, truckRow.id, now) as { view: unknown }).view)
  }

  // ── the actions that talk to Stripe (TEST MODE ONLY in this build) ──
  let processor: BillingProcessor
  try { processor = stripeBillingProcessor() } catch (e) {
    console.error('[manage/billing]', e instanceof Error ? e.message : e)
    return json({ error: 'billing_unavailable', code: 'billing_unavailable' }, 503)
  }
  const testRun = true   // visibility already proved: billing is on, or this is a billing_test truck
  const by = `owner:${access.userId ?? 'demo'}`
  const back = `${req.nextUrl.origin}/manage/${encodeURIComponent(token)}?tab=billing`
  try {
    if (action === 'add_card') {
      if (!loaded.truck.operator_id) return json({ error: 'no_owner', code: 'no_owner' }, 400)
      const cust = await ensureCustomer(store, processor, loaded.truck)
      const facts = await store.countryFacts(loaded.truck.country)
      const cs = await processor.createSetupCheckout({ customerId: cust, truckId: truckRow.id, currency: loaded.view.currency, locale: stripeLocaleFor(facts?.locale),
        successUrl: `${back}&setup={CHECKOUT_SESSION_ID}`, cancelUrl: back })
      return json({ url: cs.url })
    }
    if (action === 'add_pix') {
      if (!loaded.view.pixOffered) return json({ error: 'pix_not_offered', code: 'pix_not_offered' }, 400)
      const cust = await ensureCustomer(store, processor, loaded.truck)
      const si = await processor.createPixHostedSetup({ customerId: cust, truckId: truckRow.id, returnUrl: back })
      await store.upsertTruckBilling(truckRow.id, { stripeSetupIntentId: si.setupIntentId, paymentMethodState: 'pending', paymentMethodUpdatedAt: now.toISOString() }, by)
      return json({ url: si.hostedUrl ?? back })
    }
    if (action === 'setup_return') {
      const sessionId = String(body.sessionId ?? '')
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return json({ error: 'bad_session', code: 'bad_session' }, 400)
      const s = await processor.retrieveSetupCheckout(sessionId)
      if (s.truckId !== truckRow.id) return json({ error: 'wrong_truck', code: 'wrong_truck' }, 400)
      if (s.complete && s.paymentMethod) {
        await applyPaymentMethod(store, catalog, { truckId: truckRow.id, pm: s.paymentMethod, state: 'valid', livemode: false, now, by, setupIntentId: s.setupIntentId })
        await payOpenInvoices(store, processor, catalog, { truckId: truckRow.id, now, by })
      }
      return json((await loadBillingScreen(store, catalog, truckRow.id, new Date()) as { view: unknown }).view)
    }
    if (action === 'change_plan') {
      const out = await requestPlanChange(store, processor, catalog, { truckId: truckRow.id, planKey: String(body.planKey ?? ''), now, by, testRun })
      // billing-3: during the trial the outcome is 'trial_choice' — stored as the plan the trial ends into, nothing charged.
      if (out.outcome === 'skipped') return json({ error: out.outcome, code: out.outcome }, 400)
      return json({ outcome: out.outcome, view: (await loadBillingScreen(store, catalog, truckRow.id, new Date()) as { view: unknown }).view })
    }
  } catch (e) {
    console.error(`[manage/billing] ${action} failed:`, e instanceof Error ? e.message : e)
    return json({ error: 'billing_failed', code: 'billing_failed' }, 502)
  }
  return json({ error: 'unknown_action', code: 'unknown_action' }, 400)
}
