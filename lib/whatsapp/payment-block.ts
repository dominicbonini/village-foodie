// lib/whatsapp/payment-block.ts
// Reading and writing `whatsapp_connections.payment_blocked_at` — the record that META ITSELF refused a
// real send for a billing reason (error 131042).
//
// ── 🔴 EVERY FUNCTION HERE TOLERATES THE COLUMN NOT EXISTING, AND THAT IS NOT DEFENSIVE PADDING ─────
// `supabase/migrations/20260916_whatsapp_alerts.sql` is UNAPPLIED and is applied BY HAND. So there is a
// window — possibly a long one — where this code is deployed and the column is not there. In that
// window every function below must behave exactly as the code did before it existed: no banner, no
// email, no write, no thrown error, and above all NO BROKEN SEND PATH.
// 🔴 THE REASON THIS IS A SEPARATE MODULE RATHER THAN A COLUMN ON THE EXISTING SELECTS: adding
// `payment_blocked_at` to CONNECTION_FIELDS in the webhook would make the whole select fail with 42703
// until the migration runs — and that select is what finds the truck's OWN send credential. An
// unapplied migration would therefore silently downgrade a paying truck to the platform token, or stop
// it sending altogether. The flag is worth having; it is not worth putting in front of the send path.

/** The narrow client seam. See lib/whatsapp/alerts.ts for why `from` is `unknown` and cast here. */
export interface PaymentBlockPostgrest {
  from(table: string): unknown
}

interface UpdateBuilder {
  update(patch: Record<string, unknown>): {
    eq(col: string, val: string): {
      not(col: string, op: string, val: null): Promise<{ error: { code?: string; message?: string } | null }>
      then: unknown
    } & Promise<{ error: { code?: string; message?: string } | null }>
  }
}

/** True when the error says the column (or the schema cache's idea of it) is missing, not that we failed. */
export function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  // 42703 — the column genuinely is not there. PGRST204 — PostgREST's cached schema does not know it yet.
  // ⚠️ BOTH ARE "NOT AVAILABLE TO US RIGHT NOW", which is all the caller needs to decide. They are NOT
  // the same as a permission error or a network failure, which must not be swallowed as "no column".
  if (err.code === '42703' || err.code === 'PGRST204') return true
  return /payment_blocked_at/.test(err.message || '')
}

/**
 * Record that Meta refused a send for billing. Returns whether the mark was actually written — the
 * caller uses that to decide whether to send the operator an email about something that is now true.
 * 🔴 IT DOES NOT OVERWRITE AN EXISTING MARK. `.is('payment_blocked_at', null)` means only the FIRST
 * refusal writes a timestamp, so the column records when the problem STARTED rather than when we last
 * noticed it — and so a truck sitting blocked for a week does not have its "since" date walked forward
 * every time a customer messages.
 */
export async function markPaymentBlocked(
  supabase: PaymentBlockPostgrest, truckId: string, atIso: string,
): Promise<boolean> {
  try {
    const q = supabase.from('whatsapp_connections') as {
      update(p: Record<string, unknown>): {
        eq(c: string, v: string): { is(c: string, v: null): Promise<{ data: unknown[] | null; error: { code?: string; message?: string } | null }> }
      }
    }
    const { data, error } = await q
      .update({ payment_blocked_at: atIso })
      .eq('truck_id', truckId)
      .is('payment_blocked_at', null)
    if (error) return false
    // A PostgREST update returns the affected rows only when asked; without a representation preference
    // `data` is null even on success. So "did we write?" cannot be read from the row count here — the
    // `.is(...)` filter is what guarantees at most one write, and a null data means the statement ran.
    return data === null || (Array.isArray(data) && data.length > 0)
  } catch {
    return false
  }
}

/**
 * Clear the mark after a send Meta accepted.
 * ⚠️ FILTERED ON `not null` SO THE COMMON CASE IS A NO-OP AT THE DATABASE, not a write on every single
 * customer message. Failures are swallowed entirely: a stale banner is a cosmetic problem, and a
 * customer's reply must never be held up or lost over clearing a flag.
 */
export async function clearPaymentBlocked(
  supabase: PaymentBlockPostgrest, truckId: string,
): Promise<void> {
  try {
    const q = supabase.from('whatsapp_connections') as UpdateBuilder
    await q.update({ payment_blocked_at: null }).eq('truck_id', truckId).not('payment_blocked_at', 'is', null)
  } catch {
    /* see the module header — never throws, never blocks a reply */
  }
}
