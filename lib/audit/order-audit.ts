// lib/audit/order-audit.ts — france-records-1 (24 November 2026, docs/france-records-1-report.md): ORDER PLACEMENT, EDIT, CANCEL AND
// REJECT, WRITTEN TO action_audit_log through the existing helper (lib/audit/actionAudit.ts logAction — BEST-EFFORT: a failed log never
// stops the order action).
//
// 🔴 WHAT A SNAPSHOT HOLDS, AND WHAT IT NEVER HOLDS. action_audit_log is swept by nothing (lib/audit/actionAudit.ts says why), so a
// snapshot carries the order's lines, deals, status and money — and NEVER the customer's name, email or phone, the order note, a line's
// `specialInstructions` or a deal's `slotNotes`: those are the free text the privacy policy promises to remove after 12 months
// (content/legal/privacy-policy.md section 7), which the retention job cannot reach inside this table.
import type { SupabaseClient } from '@supabase/supabase-js'
import { logAction } from '@/lib/audit/actionAudit'
import type { ActorSource, ResolvedActor } from '@/lib/audit/actor'

export type OrderAuditAction = 'order_placed' | 'order_edited' | 'order_cancelled' | 'order_rejected'

const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])

/** An order row as the audit log keeps it: lines, deals, status and money — no customer details, no free-text notes. */
export function orderAuditSnapshot(order: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!order) return null
  const items = asArray(order.items).map(it => { const { specialInstructions, ...rest } = it; void specialInstructions; return rest })
  const deals = asArray(order.deals).map(d => { const { slotNotes, ...rest } = d; void slotNotes; return rest })
  const pick = (k: string) => (k in order ? order[k] : undefined)
  const out: Record<string, unknown> = {
    status: pick('status'), items, deals,
    subtotal: pick('subtotal'), discount_amt: pick('discount_amt'), total: pick('total'), total_minor: pick('total_minor'),
    food_minor: pick('food_minor'), tax_minor: pick('tax_minor'), tax_rate_milli: pick('tax_rate_milli'), tax_breakdown: pick('tax_breakdown'),
    tip_minor: pick('tip_minor'), service_fee_minor: pick('service_fee_minor'), currency: pick('currency'), receipt_no: pick('receipt_no'),
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

/** One order event, best-effort. Never throws, never blocks the action it records. */
export async function logOrderEvent(supabase: SupabaseClient, e: {
  action: OrderAuditAction
  truckId: string
  orderKey: string | null | undefined
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  /** Extra facts that are not customer data (a reason code, the path). */
  note?: Record<string, unknown>
  actor?: Pick<ResolvedActor, 'actorKind' | 'actorId' | 'actorLabel'> | null
  source?: ActorSource
}): Promise<void> {
  try {
    const before = e.before ? orderAuditSnapshot(e.before) : null
    const after = e.after ? orderAuditSnapshot(e.after) : null
    const total = (after ?? before)?.total_minor
    await logAction(supabase, {
      action: e.action,
      truckId: e.truckId,
      orderKey: e.orderKey ?? null,
      amountMinor: typeof total === 'number' ? total : null,
      beforeState: before,
      afterState: after || e.note ? { ...(after ?? {}), ...(e.note ? { note: e.note } : {}) } : null,
      actor: e.actor ?? { actorKind: 'unknown', actorId: null, actorLabel: null },
      source: e.source ?? 'system',
    })
  } catch (err) {
    console.error(`[order-audit] ${e.action} not logged for ${e.orderKey ?? '-'}:`, err)
  }
}
