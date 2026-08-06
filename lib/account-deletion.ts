// lib/account-deletion.ts
// ── ACCOUNT DELETION = ANONYMISE + REMOVE IDENTITY. IT IS NOT ROW DELETION. ──────────────────────────
//
// 🔴 TWO OPERATIONS EXIST AND THEY MUST NEVER BE CONFUSED:
//
//   (a) HARD DELETE — lib/delete-truck.ts `deleteTruckCascade`. Removes the truck and everything under
//       it. Correct ONLY for demo/test trucks that carry no legal record. Its behaviour is unchanged.
//       🔴 IT DELETES `orders` FIRST, and order_payments cascades from BOTH orders(order_key) AND
//       trucks(id) — so running it on a real truck destroys the accounting record. The admin route now
//       REFUSES when payment rows exist (Guard 3); this module is the reason that guard has an
//       alternative to point at.
//
//   (b) ACCOUNT DELETION — this module. Anonymises and removes identity. It MUST NOT call
//       deleteTruckCascade, and MUST NOT delete trucks, orders or order_payments.
//
// ── WHY: THE POLICY IS "KEEP THE RECORD, STRIP THE IDENTIFIERS" ─────────────────────────────────────
// The published privacy policy commits to retaining accounting records for six years and anonymising
// order details at twelve months. The schema already supports exactly that:
//   • order_payments carries NO customer identifiers — no name, no email, no phone. It needs no
//     scrubbing whatsoever. It needs to survive, which it does by simply not being deleted.
//   • orders carries exactly THREE personal columns. Null them and the row is anonymous but financially
//     complete — total, total_minor, payment_status, amount_paid, line items and timestamps all intact.
//   • action_audit_log has no FKs, so nothing cascades to it. Verified live on 6 Aug 2026: 63 rows, no
//     email-shaped strings and no customer_* keys in before_state/after_state. No scrub needed.
//
// ── 🔴 MULTI-TRUCK: THE ACCOUNT IS THE OPERATOR, SO EVERY TRUCK IT OWNS IS IN SCOPE ──────────────────
// One operator can own several trucks (trucks.operator_id pools them — see /api/manage). "Delete the
// whole account" therefore means EVERY truck that operator owns. A second truck is NOT spared: it is the
// same account, the same legal entity and the same person's data. Sparing it would leave a live business
// attached to a deleted identity, with no owner able to log in.
// ⚠️ trucks.operator_id is NULLABLE. An unclaimed truck has no account and is unreachable from here —
// it can only be dealt with as a hard delete or by hand.
import type { SupabaseClient } from '@supabase/supabase-js'

/** The pending window. Stored on the operator row at request time so changing this never moves an
 *  already-running countdown. */
export const DELETION_WINDOW_DAYS = 30

/** How often the due-sweep re-emails Dominic while an account sits actioned-but-not-executed.
 *  🔴 RE-NOTIFY, NEVER FIRE ONCE — the whole mechanism is only as reliable as the email. */
export const RENOTIFY_INTERVAL_HOURS = 24

/** The placeholder written over a nulled-out identity, so an anonymised row is legible as anonymised
 *  rather than looking like missing data or a bug. */
export const ANON_LABEL = '[deleted]'

export class AccountDeletionError extends Error {
  readonly step: string
  constructor(step: string, cause: string) {
    super(`account deletion failed at step "${step}": ${cause}`)
    this.name = 'AccountDeletionError'
    this.step = step
  }
}

export interface AccountDeletionResult {
  operatorId: string
  truckIds: string[]
  ordersAnonymised: number
  staffRemoved: number
  authUsersDeleted: number
  /** 🔴 Always 0 by construction. Reported so the invariant is visible in the response, not just asserted. */
  paymentsDeleted: 0
}

/**
 * Execute an account deletion. ADMIN-ONLY, service-role client, run by hand — never on a timer.
 *
 * ⚠️ NOT TRANSACTIONAL. supabase-js cannot open a transaction, so this is a sequence of statements and a
 * mid-sequence failure leaves the account PARTIALLY anonymised. It throws on the first failing step,
 * naming it, rather than limping on. Every step is idempotent, so re-running after a failure is safe and
 * is the intended recovery. This is the same constraint deleteTruckCascade documents.
 *
 * @throws {AccountDeletionError} on the first failing step.
 */
export async function executeAccountDeletion(
  supabase: SupabaseClient,
  operatorId: string,
): Promise<AccountDeletionResult> {
  // ── 1. Resolve the account's scope ───────────────────────────────────────────────────────────────
  const { data: operator, error: opErr } = await supabase
    .from('operators')
    .select('id, auth_user_id, deletion_requested_at')
    .eq('id', operatorId)
    .maybeSingle()
  if (opErr) throw new AccountDeletionError('load_operator', opErr.message)
  if (!operator) throw new AccountDeletionError('load_operator', `no operator ${operatorId}`)
  // 🔴 Refuse an account that was never requested, or whose request Dominic has cancelled. The pending
  // state IS the authorisation; without it this is just an admin deleting someone's data.
  if (!operator.deletion_requested_at) {
    throw new AccountDeletionError('not_pending', 'this account has no pending deletion request')
  }

  const { data: trucks, error: trucksErr } = await supabase
    .from('trucks')
    .select('id')
    .eq('operator_id', operatorId)
  if (trucksErr) throw new AccountDeletionError('load_trucks', trucksErr.message)
  const truckIds = (trucks ?? []).map(t => t.id as string)

  // ── 2. ANONYMISE ORDERS — the three personal columns, nothing else ───────────────────────────────
  // 🔴 THE ROWS SURVIVE. Totals, payment status, line items and timestamps are the financial record and
  // are untouched. order_payments is not referenced here at all — it holds no identifiers, so there is
  // nothing in it to anonymise, and deleting the orders (which would cascade to it) is exactly what this
  // function exists to avoid.
  let ordersAnonymised = 0
  for (const truckId of truckIds) {
    const { data, error } = await supabase
      .from('orders')
      .update({ customer_name: ANON_LABEL, customer_email: null, customer_phone: null })
      .eq('truck_id', truckId)
      .select('order_key')
    if (error) throw new AccountDeletionError(`anonymise_orders:${truckId}`, error.message)
    ordersAnonymised += data?.length ?? 0
  }

  // ── 3. STAFF — memberships and their auth users ──────────────────────────────────────────────────
  // ⚠️ A staff member may belong to trucks under ANOTHER account. Their auth user is deleted ONLY when
  // no membership survives anywhere; deleting it with the first truck would lock them out of a business
  // that has nothing to do with this deletion.
  let staffRemoved = 0
  let authUsersDeleted = 0
  const staffAuthIds = new Set<string>()
  for (const truckId of truckIds) {
    const { data: members, error } = await supabase
      .from('truck_users')
      .select('id, auth_user_id')
      .eq('truck_id', truckId)
    if (error) throw new AccountDeletionError(`load_staff:${truckId}`, error.message)
    for (const m of members ?? []) if (m.auth_user_id) staffAuthIds.add(m.auth_user_id as string)
    const { error: delErr } = await supabase.from('truck_users').delete().eq('truck_id', truckId)
    if (delErr) throw new AccountDeletionError(`delete_staff:${truckId}`, delErr.message)
    staffRemoved += members?.length ?? 0
  }

  for (const authId of staffAuthIds) {
    if (authId === operator.auth_user_id) continue          // the owner is handled below
    const { count, error } = await supabase
      .from('truck_users')
      .select('*', { count: 'exact', head: true })
      .eq('auth_user_id', authId)
    if (error) throw new AccountDeletionError(`staff_membership_check:${authId}`, error.message)
    if ((count ?? 0) > 0) continue                          // still works elsewhere — leave the login alone
    const { error: authErr } = await supabase.auth.admin.deleteUser(authId)
    if (authErr) throw new AccountDeletionError(`delete_staff_auth:${authId}`, authErr.message)
    authUsersDeleted++
  }

  // ── 4. TRUCK CONTACT DETAILS — personal data on a retained row ───────────────────────────────────
  // 🔴 THE TRUCK ROW IS RETAINED, because order_payments.truck_id references it with ON DELETE CASCADE:
  // deleting the truck would destroy the ledger just as surely as deleting the orders. Its personal
  // columns are cleared in place instead, and `active: false` stops it trading.
  for (const truckId of truckIds) {
    const { error } = await supabase
      .from('trucks')
      .update({ contact_email: null, contact_phone: null, phone: null, active: false, operator_id: null })
      .eq('id', truckId)
    if (error) throw new AccountDeletionError(`anonymise_truck:${truckId}`, error.message)
  }

  // ── 5. ACCOUNT-SCOPED PERSONAL DATA ──────────────────────────────────────────────────────────────
  for (const table of ['operator_email_changes', 'operator_email_verifications', 'password_reset_tokens'] as const) {
    const { error } = await supabase.from(table).delete().eq('operator_id', operatorId)
    // ⚠️ Non-fatal: these tables predate supabase/migrations/, so their exact column names are not
    // provable from this repo. A miss here leaves a stale token row, not personal data of consequence —
    // but it is logged rather than swallowed so the gap is visible.
    if (error) console.warn(`[account-deletion] could not clear ${table} for ${operatorId}: ${error.message}`)
  }

  // ── 6. THE OPERATOR IDENTITY ─────────────────────────────────────────────────────────────────────
  // Nulled, not deleted: the row is referenced by nothing that must die, and keeping a tombstone means a
  // re-signup with the same email cannot silently inherit an old account's history.
  const { error: anonOpErr } = await supabase
    .from('operators')
    .update({
      email: null, first_name: null, last_name: null, name: ANON_LABEL, phone: null,
      auth_user_id: null, deletion_requested_by: null,
    })
    .eq('id', operatorId)
  if (anonOpErr) throw new AccountDeletionError('anonymise_operator', anonOpErr.message)

  // ── 7. THE OWNER'S AUTH USER — LAST, because it is the one irreversible step ─────────────────────
  if (operator.auth_user_id) {
    const { error } = await supabase.auth.admin.deleteUser(operator.auth_user_id as string)
    if (error) throw new AccountDeletionError('delete_owner_auth', error.message)
    authUsersDeleted++
  }

  return { operatorId, truckIds, ordersAnonymised, staffRemoved, authUsersDeleted, paymentsDeleted: 0 }
}
