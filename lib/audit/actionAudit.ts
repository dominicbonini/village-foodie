// ── THE ACTION AUDIT LOG — APPEND-ONLY, GENERAL, NOT PAYMENTS-SPECIFIC ───────────────────────────────
// One row per operator action. This is NOT the payment ledger and the distinction is the whole point:
//
//   order_payments  — MUTABLE. Models what is currently OWED. undo_collected DELETES its row, which is
//                     correct: the money is no longer owed and the idempotency key must be freed.
//   action_audit_log — APPEND-ONLY. Models what PEOPLE DID. A deletion in the ledger is itself an event
//                     that gets recorded here. The ledger can forget; the log never does.
//
// 🔴 APPEND-ONLY BY INTENT. Nothing in this codebase may ever UPDATE or DELETE from action_audit_log.
// This helper only ever INSERTs, and it is the only writer. If you find yourself wanting to amend a row,
// write a NEW row describing the amendment — a log you can edit is not a log. There are also NO FOREIGN
// KEYS on the table (see the migration): the record must survive deletion of the truck or order it
// describes, which is exactly where order_payments gets it wrong (it cascades on both).
//
// ── 🔴 before_state / after_state MUST STAY FREE OF CUSTOMER IDENTIFIERS ────────────────────────────
// NOTHING SWEEPS THIS TABLE. It has no foreign keys, so account deletion cannot reach it by cascade, and
// the anonymisation pass nulls named COLUMNS on `orders` — it cannot reach inside a JSONB blob. Anything
// personal written into these snapshots is therefore retained indefinitely and would outlive the erasure
// the privacy policy promises.
//
// ✅ VERIFIED LIVE against production on 6 August 2026: 63 rows, NONE containing an email-shaped string
// or a customer_* key in before_state / after_state. No scrub was needed and none was built.
//
// ⚠️ THAT IS A PROPERTY OF WHAT CALLERS HAPPEN TO PASS TODAY, NOT AN ENFORCED CONSTRAINT. Never put
// `customer_name`, `customer_email`, `customer_phone` or a free-text customer note into these fields.
// Pass ids, amounts, statuses and timestamps. If a future action genuinely needs customer context, the
// right move is a reference the anonymisation pass can follow (order_key), never a copy of the value.
//
// ⚠️ `actor_id` / `actor_label` are OPERATOR identifiers and are a deliberate exception — an audit log
// that cannot say who acted is not an audit log. They are pseudonymous (auth user id / display label),
// and account deletion retains them for the same reason it retains the financial record.

// ── ADDING A NEW ACTION ─────────────────────────────────────────────────────────────────────────────
// `cancel`, `reject`, `edit` and the stock overrides are all intended callers and need NO signature
// change — pass the action name and whichever of order_key / amount_minor / before_state / after_state
// apply. They are deliberately NOT wired this pass. `action` is free text on purpose: a CHECK constraint
// would make every new caller a deploy-coupled migration, which is how an audit log quietly stops being
// written to.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorKind, ActorSource, ResolvedActor } from '@/lib/audit/actor'

export interface AuditEntry {
  /** The action name, matching the `action` value on /api/dashboard/action (e.g. 'collected'). */
  action: string
  truckId: string
  orderKey?: string | null
  /** Integer minor units where money is involved, else null. Never pounds. */
  amountMinor?: number | null
  /** What was true BEFORE. For a deletion this MUST fully reconstruct the deleted row. */
  beforeState?: unknown
  /** What was true AFTER. */
  afterState?: unknown
  actor: Pick<ResolvedActor, 'actorKind' | 'actorId' | 'actorLabel'>
  source: ActorSource
}

function row(entry: AuditEntry) {
  return {
    action: entry.action,
    truck_id: entry.truckId,
    order_key: entry.orderKey ?? null,
    amount_minor: entry.amountMinor ?? null,
    before_state: entry.beforeState ?? null,
    after_state: entry.afterState ?? null,
    actor_kind: entry.actor.actorKind satisfies ActorKind,
    actor_id: entry.actor.actorId,
    actor_label: entry.actor.actorLabel,
    source: entry.source,
  }
}

/**
 * BEST-EFFORT write. Logs and swallows on failure — matching lib/allergen-audit.ts:28-35, whose comment
 * reads "A logging failure must NOT fail the underlying write (the data change is already committed)".
 *
 * ⚠️ Use this for actions where the data change has ALREADY happened. For an action that DESTROYS
 * evidence — undo_collected — use `logActionOrThrow` instead and write BEFORE the destruction.
 */
export async function logAction(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await supabase.from('action_audit_log').insert(row(entry))
    if (error) console.error(`[action-audit] insert failed for action=${entry.action} order_key=${entry.orderKey ?? '-'}:`, error.message)
  } catch (e) {
    console.error(`[action-audit] insert threw for action=${entry.action} order_key=${entry.orderKey ?? '-'}:`, e)
  }
}

/**
 * STRICT write — THROWS on failure. For the case where the audit row must exist before something
 * irreversible happens, so that a failed log BLOCKS the irreversible step rather than losing it.
 *
 * The only caller today is undo_collected, which deletes a payment row. See the comment at that branch:
 * collect fails OPEN (blocking a hatch mid-service is worse than a recoverable gap), undo fails CLOSED
 * (erasing a payment record with no log is the exact state this table exists to prevent).
 */
export async function logActionOrThrow(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from('action_audit_log').insert(row(entry))
  if (error) {
    throw new Error(`[action-audit] insert failed for action=${entry.action} order_key=${entry.orderKey ?? '-'}: ${error.message}`)
  }
}
