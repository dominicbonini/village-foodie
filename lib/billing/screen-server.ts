// lib/billing/screen-server.ts — billing-2: build the Billing screen's data for one truck, on the server. SERVER ONLY.
// 🔴 VISIBLE only while billing is switched on, or for a billing_test truck (billing-2 "who sees what"); for every other truck
// `visible: false`, and Manage › Billing, the notices and the emails stay exactly as today.
import 'server-only'
import type { PlanCatalog } from '@/lib/plans'
import { billableOf, periodOf } from '@/lib/billing/rules'
import { billingContextFor, computeUsage } from '@/lib/billing/engine'
import { billingScreenOf, type BillingScreenView, type ScreenInput } from '@/lib/billing/view'
import type { BillingStore, StoredTruck } from '@/lib/billing/store-types'

export type LoadedScreen = { visible: false } | { visible: true; view: BillingScreenView; input: ScreenInput; truck: StoredTruck }

export async function loadBillingScreen(store: BillingStore, catalog: PlanCatalog, truckId: string, now: Date): Promise<LoadedScreen> {
  const truck = await store.truck(truckId)
  if (!truck) return { visible: false }
  // forceSwitch: true → switchOn is true when billing is on OR this is a billing_test truck — exactly the visibility rule.
  const ctx = await billingContextFor(store, truck, catalog, now, { forceSwitch: true })
  if (!ctx.switchOn || !billableOf(ctx).billable) return { visible: false }
  const [history, tb, invoices, charges, vanCount] = await Promise.all([
    store.planHistory(truckId), store.truckBilling(truckId), store.listInvoices(truckId), store.listCharges(truckId), store.vanCount(truckId),
  ])
  const u = await computeUsage(store, catalog, truck, ctx, periodOf(now, truck.timezone || 'Europe/London'), now)
  const input: ScreenInput = { ctx, catalog, history, truckBilling: tb, invoices, charges, usageSoFar: u.ok ? u.usage : null, vanCount }
  return { visible: true, view: billingScreenOf(input), input, truck }
}
