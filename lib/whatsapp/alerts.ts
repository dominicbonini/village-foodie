// lib/whatsapp/alerts.ts
// Sending a WhatsApp alert email AT MOST ONCE, and re-opening the door when the send fails.
//
// ── 🔴 THE SEQUENCE IS CLAIM → SEND → RELEASE-ON-FAILURE, AND THE ORDER IS THE WHOLE DESIGN ─────────
//   1. INSERT the whatsapp_alerts row first, with `on conflict do nothing`.
//   2. If the insert returned no row, someone else already claimed this alert. SEND NOTHING. Stop.
//   3. Only the winner sends.
//   4. If the send fails, DELETE the row so a later run can claim it again.
//
// Checking "have we already sent this?" and then sending is the check-then-act race, and the webhook is
// exactly where it bites: two customer messages crossing the 80% threshold milliseconds apart both read
// "not yet sent" and both send. Making the INSERT the check moves the decision into the database, where
// the unique constraint arbitrates. There is no window between deciding and recording, because the
// record IS the decision.
//
// ── ⚠️ THE FAILURE MODE THIS DELIBERATELY ACCEPTS ───────────────────────────────────────────────────
// A process that dies between a SUCCESSFUL send and a successful nothing — or between a failed send and
// a failed release — can send the same alert twice. That is accepted knowingly. The alternative ordering
// (send first, record after) fails the other way: a crash after sending means the alert is never
// recorded and fires again on every single run. Between "occasionally twice" and "possibly forever", and
// between "a duplicate warning" and "a suppressed warning", this picks duplicates every time.
//
// ── 🔴 WHAT IS LOGGED: TRUCK ID AND ALERT KIND. NOTHING ELSE. ───────────────────────────────────────
// Not the recipient, not the subject, not the body, not a token, not a Meta error message. An alert log
// line is an operational breadcrumb, and the address it went to is the operator's personal email.

import { sendConfirmationEmail } from '@/lib/email'
import type { AlertEmail } from '@/lib/whatsapp/alert-copy'

/**
 * The six alerts. 🔴 THE DATABASE HAS NO CHECK CONSTRAINT ON `kind` BY HOUSE RULE — this union is the
 * enforcement, and it works because rows are written in exactly one place: `claim` below.
 */
export type WhatsAppAlertKind =
  | 'limit_80'
  | 'limit_100'
  | 'payment_blocked'
  | 'token_refresh_failing'
  | 'token_refresh_urgent'
  | 'token_invalid'

/** Which alerts go to the operator. Everything else goes to the admin. Used to pick the recipient. */
export const OPERATOR_ALERTS: ReadonlySet<WhatsAppAlertKind> =
  new Set<WhatsAppAlertKind>(['limit_80', 'limit_100', 'payment_blocked'])

/**
 * The two-call surface the sequence needs, named as an interface so a harness can drive every branch —
 * claim wins, claim loses, claim errors, release fails — with no database.
 * 🔴 `claim` RETURNS FALSE FOR BOTH "already claimed" AND "the insert errored", and that is correct:
 * both mean WE DO NOT HOLD THE CLAIM, and sending without the claim is the one thing that must not
 * happen. It fails closed — no table (the migration is unapplied) means no email, not a duplicate email.
 */
export interface AlertStore {
  claim(truckId: string, kind: WhatsAppAlertKind, periodKey: string): Promise<boolean>
  release(truckId: string, kind: WhatsAppAlertKind, periodKey: string): Promise<void>
}

/**
 * Just enough of a PostgREST table handle to write this table, so nothing here imports supabase-js.
 * ⚠️ `from` IS TYPED AS RETURNING `unknown` AND CAST BELOW. supabase-js's builder carries generics that
 * no hand-written structural type matches, and the alternative — importing SupabaseClient — would pull
 * the database client into a module whose entire point is not to hold one. The cast is confined to the
 * two lines that use it, and a wrong shape shows up immediately as a failed claim, which fails closed.
 */
interface AlertTable {
  insert(rows: Record<string, unknown>[], opts?: unknown): {
    select(cols: string): { limit(n: number): Promise<{ data: unknown[] | null; error: unknown }> }
  }
  delete(): {
    match(criteria: Record<string, unknown>): Promise<{ error: unknown }>
  }
}

export interface AlertPostgrest {
  from(table: string): unknown
}

/** The real store. Takes an already-constructed service-role client; holds no credential of its own. */
export function supabaseAlertStore(supabase: AlertPostgrest): AlertStore {
  const table = () => supabase.from('whatsapp_alerts') as AlertTable
  return {
    async claim(truckId, kind, periodKey) {
      try {
        const { data, error } = await table()
          // 🔴 `ignoreDuplicates: true` IS WHAT MAKES THIS `on conflict do nothing`. Without it a second
          // insert raises 23505 and this returns false via the catch — same outcome, but as an error
          // rather than an expected event, which would fill the logs with alarm about normal operation.
          .insert([{ truck_id: truckId, kind, period_key: periodKey }], { onConflict: 'truck_id,kind,period_key', ignoreDuplicates: true })
          // ⚠️ THE SELECT IS NOT DECORATION. With `ignoreDuplicates`, a losing insert succeeds with NO
          // ERROR and NO ROWS. The returned row count is the only thing that distinguishes winner from
          // loser, so the claim is `data.length > 0` — never `!error`.
          .select('id')
          .limit(1)
        if (error) return false
        return Array.isArray(data) && data.length > 0
      } catch {
        return false
      }
    },
    async release(truckId, kind, periodKey) {
      try {
        await table().delete().match({ truck_id: truckId, kind, period_key: periodKey })
      } catch {
        // Swallowed. A failed release means this alert stays suppressed for its period — bad, but the
        // caller is already handling a failed send and must not be turned into a 500 on top of it.
      }
    },
  }
}

export type AlertOutcome = 'sent' | 'duplicate' | 'send_failed'

/**
 * 🔴 NEVER THROWS. Every caller is a webhook handling a customer's message or a cron sweeping trucks;
 * neither may be brought down by the mail step.
 */
export async function sendWhatsAppAlert(args: {
  store: AlertStore
  kind: WhatsAppAlertKind
  truckId: string
  /** 'YYYY-MM' for the allowance alerts, 'YYYY-MM-DD' for the token ones. See the migration. */
  periodKey: string
  to: string
  email: AlertEmail
  /** Injected in harnesses. Defaults to the Brevo sender, which now reports success. */
  sendImpl?: (p: { to: string; subject: string; html: string; text: string; senderName?: string }) => Promise<boolean>
}): Promise<AlertOutcome> {
  const send = args.sendImpl ?? sendConfirmationEmail

  const claimed = await args.store.claim(args.truckId, args.kind, args.periodKey)
  if (!claimed) return 'duplicate'

  let ok = false
  try {
    ok = await send({
      to: args.to,
      subject: args.email.subject,
      html: args.email.html,
      text: args.email.text,
      senderName: 'HatchGrab',
    })
  } catch {
    // sendConfirmationEmail does not throw, but an injected sender might.
    ok = false
  }

  if (!ok) {
    await args.store.release(args.truckId, args.kind, args.periodKey)
    console.error(`[whatsapp-alert] send failed, claim released: ${args.truckId} ${args.kind}`)
    return 'send_failed'
  }

  console.warn(`[whatsapp-alert] sent: ${args.truckId} ${args.kind}`)
  return 'sent'
}
