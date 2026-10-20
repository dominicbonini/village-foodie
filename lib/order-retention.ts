// lib/order-retention.ts — THE PRIVACY POLICY'S 12-MONTH PROMISE, KEPT (19 October 2026; docs/legal-follow-ups-report.md).
//
// The published policy (content/legal/privacy-policy.md, section 7) says order records containing customer details are
// kept for 12 months, "after which the customer's name, email and phone are removed and only anonymised order data
// remains". Until this file NOTHING DID THAT — no cron, no pg_cron job; only account deletion and the draft erase at
// promotion blanked those columns. This is the job, run daily by app/api/cron/order-retention.
//
// For every ORDER (and every PROMOTED card draft) created more than RETENTION_MONTHS ago it removes:
//   • customer_name → '' (the column is NOT NULL; the empty string is the smallest safe value — every screen already
//     falls back to "Unknown customer" for a blank name), customer_email → null, customer_phone → null (drafts: all three
//     null — nullable there, and erasePii already nulls them at promotion);
//   • notes → null (the order note, which can carry allergy or dietary text);
//   • each item's `specialInstructions` → '' (the per-dish note) and each deal's `slotNotes` → {} (per-slot notes).
// 🔴 IT KEEPS EVERYTHING ELSE: totals, line items (names, quantities, prices, modifiers), deals, payments, timestamps —
// the anonymised trading history the policy says remains. order_payments carries no customer identifiers and is not
// touched. IDEMPOTENT: a row with nothing left to remove is not written.
// It also calls purge_order_drafts() — the existing GDPR erasure of ABANDONED card drafts (expired, never placed, no live
// card hold), which nothing was calling: it was never scheduled.
// And (Dominic, 19 October 2026; privacy section 7, "WhatsApp messages your customers send a truck, and our automatic
// replies: 12 months") it DELETES every `whatsapp_logs` row and every `messages` row (the WhatsApp send log) created
// more than RETENTION_MONTHS ago — the whole row: the customer's number, their message and our reply are all it holds.
// A row with no `created_at` cannot be aged and is left (none exist today). Bounded and idempotent like the rest: a
// deleted row is not there to delete twice.
import type { SupabaseClient } from '@supabase/supabase-js'

export const RETENTION_MONTHS = 12
/** Work per run: bounded, so one run cannot outlive its timeout; the next day's run takes the rest. */
export const RETENTION_BATCH = 500
export const RETENTION_MAX_PER_RUN = 5000
/** A row created within this many days BEFORE the cutoff is always looked at, even with its name already blank, so a
 *  note on an order that never had a name (or a run that was missed) is still caught. Older rows are looked at only
 *  while they still hold a name, email, phone or note. */
export const RETENTION_RECHECK_DAYS = 30

/** The instant before which an order's customer details are removed: RETENTION_MONTHS calendar months ago (UTC). */
export function retentionCutoff(now: Date = new Date()): Date {
  const d = new Date(now.getTime())
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS)
  return d
}

type Json = unknown
const blank = (v: unknown) => v == null || (typeof v === 'string' && v === '')

/** Items with every `specialInstructions` blanked. Returns the same array (by value) when there was nothing to blank. */
export function scrubItems(items: Json): { value: Json; changed: boolean } {
  if (!Array.isArray(items)) return { value: items, changed: false }
  let changed = false
  const value = items.map(it => {
    if (it && typeof it === 'object' && 'specialInstructions' in it && !blank((it as Record<string, unknown>).specialInstructions)) {
      changed = true
      return { ...(it as Record<string, unknown>), specialInstructions: '' }
    }
    return it
  })
  return { value: changed ? value : items, changed }
}

/** Deals with every `slotNotes` emptied ({}). */
export function scrubDeals(deals: Json): { value: Json; changed: boolean } {
  if (!Array.isArray(deals)) return { value: deals, changed: false }
  let changed = false
  const value = deals.map(d => {
    const notes = d && typeof d === 'object' ? (d as Record<string, unknown>).slotNotes : undefined
    if (notes && typeof notes === 'object' && Object.values(notes as Record<string, unknown>).some(n => !blank(n))) {
      changed = true
      return { ...(d as Record<string, unknown>), slotNotes: {} }
    }
    return d
  })
  return { value: changed ? value : deals, changed }
}

interface Row { order_key: string; customer_name?: string | null; customer_email?: string | null; customer_phone?: string | null; notes?: string | null; items?: Json; deals?: Json }

/** What to write to one row, or null when it holds nothing left to remove. `nameEmpty` is the value a cleared name takes. */
export function retentionPatch(row: Row, nameEmpty: '' | null): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  if (!blank(row.customer_name)) patch.customer_name = nameEmpty
  if (!blank(row.customer_email)) patch.customer_email = null
  if (!blank(row.customer_phone)) patch.customer_phone = null
  if (!blank(row.notes)) patch.notes = null
  const items = scrubItems(row.items); if (items.changed) patch.items = items.value
  const deals = scrubDeals(row.deals); if (deals.changed) patch.deals = deals.value
  return Object.keys(patch).length ? patch : null
}

export interface RetentionResult {
  cutoff: string; ordersExamined: number; ordersCleared: number; draftsExamined: number; draftsCleared: number; draftsPurged: number | null
  whatsappLogsDeleted: number; messagesDeleted: number; failures: string[]
}

const COLS = 'order_key, created_at, customer_name, customer_email, customer_phone, notes, items, deals'

/** One table's pass: page through the old rows that may still hold details, write each patch. */
async function pass(supabase: SupabaseClient, table: 'orders' | 'order_drafts', cutoffIso: string, recheckFromIso: string, nameEmpty: '' | null,
  out: { examined: number; cleared: number; failures: string[] }): Promise<void> {
  let after: string | null = null
  while (out.examined < RETENTION_MAX_PER_RUN) {
    let q = supabase.from(table).select(COLS).lt('created_at', cutoffIso)
    // Only rows that may still hold something: a name, email, phone or note — or anything in the recheck window.
    q = q.or(`customer_name.neq."",customer_email.not.is.null,customer_phone.not.is.null,notes.not.is.null,created_at.gte."${recheckFromIso}"`)
    if (table === 'order_drafts') q = q.not('promoted_at', 'is', null)   // abandoned drafts are DELETED by purge_order_drafts
    if (after) q = q.gt('order_key', after)
    const { data, error } = await q.order('order_key', { ascending: true }).limit(RETENTION_BATCH)
    if (error) { out.failures.push(`${table} read: ${error.message}`); return }
    const rows = (data || []) as Row[]
    if (!rows.length) return
    for (const r of rows) {
      out.examined++
      const patch = retentionPatch(r, nameEmpty)
      if (!patch) continue
      const { error: wErr } = await supabase.from(table).update(patch).eq('order_key', r.order_key)
      if (wErr) out.failures.push(`${table} ${r.order_key}: ${wErr.message}`)
      else out.cleared++
    }
    after = rows[rows.length - 1].order_key
    if (rows.length < RETENTION_BATCH) return
  }
}

/** The WhatsApp logs past the cutoff, deleted in id-keyed batches (both tables' `id` is their primary key). */
export const WHATSAPP_TABLES = ['whatsapp_logs', 'messages'] as const
async function deleteOld(supabase: SupabaseClient, table: (typeof WHATSAPP_TABLES)[number], cutoffIso: string, failures: string[]): Promise<number> {
  let deleted = 0
  while (deleted < RETENTION_MAX_PER_RUN) {
    const { data, error } = await supabase.from(table).select('id').lt('created_at', cutoffIso).order('id', { ascending: true }).limit(RETENTION_BATCH)
    if (error) { failures.push(`${table} read: ${error.message}`); return deleted }
    const ids = ((data || []) as { id: string | number }[]).map(r => r.id)
    if (!ids.length) return deleted
    const { error: dErr } = await supabase.from(table).delete().in('id', ids)
    if (dErr) { failures.push(`${table} delete: ${dErr.message}`); return deleted }
    deleted += ids.length
    if (ids.length < RETENTION_BATCH) return deleted
  }
  return deleted
}

/** The daily run: purge abandoned drafts, clear the details of every order and promoted draft past the cutoff, and
 *  delete the WhatsApp logs past it. */
export async function runOrderRetention(supabase: SupabaseClient, now: Date = new Date()): Promise<RetentionResult> {
  const cutoff = retentionCutoff(now)
  const recheckFrom = new Date(cutoff.getTime() - RETENTION_RECHECK_DAYS * 86400000)
  const failures: string[] = []
  // 1 · abandoned card drafts (expired, never placed, no live card hold) — the existing function, now actually called.
  let draftsPurged: number | null = null
  const { data: purged, error: pErr } = await supabase.rpc('purge_order_drafts')
  if (pErr) failures.push(`purge_order_drafts: ${pErr.message}`)
  else draftsPurged = typeof purged === 'number' ? purged : null
  // 2 · orders, and 3 · promoted drafts (their name, email and phone are already gone; their notes are not)
  const o = { examined: 0, cleared: 0, failures }
  await pass(supabase, 'orders', cutoff.toISOString(), recheckFrom.toISOString(), '', o)
  const d = { examined: 0, cleared: 0, failures }
  await pass(supabase, 'order_drafts', cutoff.toISOString(), recheckFrom.toISOString(), null, d)
  // 4 · the WhatsApp logs: the customer's messages to a truck and our automatic replies, and the send log
  const whatsappLogsDeleted = await deleteOld(supabase, 'whatsapp_logs', cutoff.toISOString(), failures)
  const messagesDeleted = await deleteOld(supabase, 'messages', cutoff.toISOString(), failures)
  return {
    cutoff: cutoff.toISOString(), ordersExamined: o.examined, ordersCleared: o.cleared, draftsExamined: d.examined, draftsCleared: d.cleared,
    draftsPurged, whatsappLogsDeleted, messagesDeleted, failures,
  }
}
