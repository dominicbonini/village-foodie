// lib/billing/notify.ts — billing-2: SEND THE BILLING EMAILS THAT ARE DUE (the hourly run). No server-only import (the harness runs
// it with an in-memory store and a fake Mailer).
// 🔴 Only while billing is switched on, or for a billing_test truck — the same visibility rule as the screens (billing-2 "who
// sees what"); every other truck gets none. Which email is due is lib/billing/view.ts emailsDue; the words are lib/billing/emails.ts.
import type { PlanCatalog } from '@/lib/plans'
import { billableOf } from '@/lib/billing/rules'
import { billingContextFor } from '@/lib/billing/engine'
import { billingScreenOf, emailsDue } from '@/lib/billing/view'
import { sendDueEmails, planNameIn, type Mailer } from '@/lib/billing/emails'
import type { BillingStore } from '@/lib/billing/store-types'

export async function runBillingEmails(store: BillingStore, mailer: Mailer, catalog: PlanCatalog, a: { truckId: string; now: Date; base: string }) {
  const truck = await store.truck(a.truckId)
  if (!truck) return []
  const ctx = await billingContextFor(store, truck, catalog, a.now, { forceSwitch: true })
  if (!ctx.switchOn || !billableOf(ctx).billable) return []
  const [history, tb, invoices, charges, vanCount, sent, facts] = await Promise.all([
    store.planHistory(truck.id), store.truckBilling(truck.id), store.listInvoices(truck.id), store.listCharges(truck.id), store.vanCount(truck.id),
    store.emailsSent(truck.id), store.countryFacts(truck.country),
  ])
  const view = billingScreenOf({ ctx, catalog, history, truckBilling: tb, invoices, charges, usageSoFar: null, vanCount })
  const due = emailsDue({ view, ctx, invoices, sent })
  if (!due.length) return []
  const op = truck.operator_id ? await store.operator(truck.operator_id) : null
  const locale = facts?.locale ?? 'en-GB'
  return sendDueEmails(store, mailer, {
    truckId: truck.id, due, to: op?.email ?? null,
    ctx: { locale, timeZone: truck.timezone || 'Europe/London', money: { currency: truck.currency, locale }, truckName: truck.name,
      firstName: op?.firstName ?? null, billingUrl: `${a.base.replace(/\/$/, '')}/manage?tab=billing`, planName: planNameIn(locale, catalog) },
  })
}
