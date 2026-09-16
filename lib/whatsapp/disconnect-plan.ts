// lib/whatsapp/disconnect-plan.ts
// 🔴 WHAT DISCONNECTING DOES, AS AN ORDERED LIST OF OPERATIONS. Pure: no Supabase, no fetch, no env.
// The route executes this list; it decides nothing of its own, so "does disconnect ever deregister?" is
// a question a harness answers rather than one a reader has to trace through a handler.
//
// ── 🔴 THE RULE THAT MUST NEVER BE BROKEN: NO DEREGISTER. EVER. ─────────────────────────────────────
// Meta's `/{phone_number_id}/deregister` unbinds the number from the Cloud API. For a COEXISTENCE truck
// that is their own working number in the WhatsApp Business app — deregistering it would break the phone
// they answer customers on, to tidy up our side. Disconnect removes OUR ACCESS; it does not touch THEIR
// number. There is no branch in this file that can emit one, and the operation type has no member for it.
//
// ── WHY THE ROW IS DELETED EVEN WHEN META REFUSES ───────────────────────────────────────────────────
// The operator asked us to stop. If Meta is unreachable and we keep the row, replies keep going out on a
// connection they have disowned — the one outcome nobody wants. Deleting the row stops sending
// immediately and unconditionally; the Meta call is best-effort and its failure is REPORTED, with an
// instruction the operator can act on themselves.

export type DisconnectOp =
  /** DELETE {GRAPH}/{waba_id}/subscribed_apps with the business token. Best effort. */
  | { kind: 'unsubscribe_app'; wabaId: string }
  /** DELETE the truck's whatsapp_connections row. Always last, always runs. */
  | { kind: 'delete_connection_row' }

export interface DisconnectPlan {
  ops: DisconnectOp[]
  /** True when there was nothing to do — the caller returns success without touching anything. */
  alreadyDisconnected: boolean
  /** Why the Meta call was skipped, for the operator-facing result. Null when it is in the plan. */
  unsubscribeSkippedReason: 'no_connection' | 'no_waba' | 'no_usable_token' | null
}

export interface DisconnectInput {
  /** The row, or null when the truck has none. */
  connection: { wabaId: string | null } | null
  /**
   * Whether a token can actually authorise the Meta call. Decided by the CALLER from the same rules the
   * send path uses (present, not revoked, not expired, decryptable) — this module does not re-derive it,
   * so the two cannot disagree about what "usable" means.
   */
  tokenUsable: boolean
}

export function planDisconnect(input: DisconnectInput): DisconnectPlan {
  if (!input.connection) {
    // 🔴 IDEMPOTENT. Disconnecting an already-disconnected truck is a success, not an error: the
    // operator's intent is satisfied. An error here would invite a retry loop against nothing.
    return { ops: [], alreadyDisconnected: true, unsubscribeSkippedReason: 'no_connection' }
  }

  const waba = (input.connection.wabaId ?? '').trim()
  const ops: DisconnectOp[] = []
  let skipped: DisconnectPlan['unsubscribeSkippedReason'] = null

  if (!waba) skipped = 'no_waba'
  else if (!input.tokenUsable) skipped = 'no_usable_token'
  else ops.push({ kind: 'unsubscribe_app', wabaId: waba })

  // 🔴 ALWAYS, AND ALWAYS LAST. Not conditional on the line above succeeding, and not before it — the
  // row holds the token the unsubscribe needs.
  ops.push({ kind: 'delete_connection_row' })

  return { ops, alreadyDisconnected: false, unsubscribeSkippedReason: skipped }
}
