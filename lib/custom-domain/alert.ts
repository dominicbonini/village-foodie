// lib/custom-domain/alert.ts
//
// ── SENDING THE ADMIN ALERT. ONE FUNCTION, AND IT CANNOT BREAK ITS CALLER. ───────────────────────
//
// 🔴 IT SWALLOWS EVERY FAILURE AND RETURNS A BOOLEAN. Both callers are inside a loop over trucks (the
// cron) or an operator's request (the on-demand check). A thrown Brevo error must not abort a sweep
// that still has trucks to check, and must not turn an operator's "has it worked yet" into a 500.
// ⚠️ THE CALLER WRITES THE ROW FIRST AND SENDS SECOND, deliberately — so the database is correct even
// when the mail never goes. A dropped alert is recoverable by the next run; a dropped write is not.
import { adminDomainAlertEmail } from './copy'
import { STOPPED_AFTER_LABEL } from './cadence'
import { SETUP_GRACE_MS, type AdminAlert } from './check'
import { sendConfirmationEmail } from '@/lib/email'

/**
 * 🔴 WHERE THESE GO. Not an env var: it is not a secret, it is not per-environment, and a missing
 * variable would silently route the one email that matters to nobody. A constant fails loudly in code
 * review instead of quietly at 3am.
 */
export const ADMIN_ALERT_TO = 'admin@hatchgrab.com'

/** Hours label for the grace window, derived like everything else in cadence.ts — never a literal. */
const GRACE_LABEL = (() => {
  const h = SETUP_GRACE_MS / 3_600_000
  return h >= 1 ? `${Number.isInteger(h) ? h : h.toFixed(1)} hours` : `${Math.round(SETUP_GRACE_MS / 60_000)} minutes`
})()

export async function sendAdminDomainAlert(args: {
  alert: AdminAlert
  truckName: string
  truckId: string
  address: string
  startedAt: string | null
  lastOkAt: string | null
  lastSeenValue: string | null
  expected: string | null
}): Promise<boolean> {
  const mail = adminDomainAlertEmail({
    kind: args.alert.kind,
    truckName: args.truckName,
    truckId: args.truckId,
    address: args.address,
    startedAt: args.startedAt,
    lastOkAt: args.lastOkAt,
    lastSeenValue: args.lastSeenValue,
    expected: args.expected,
    // ⚠️ THE TWO KINDS QUOTE DIFFERENT WINDOWS, and both are derived from the cron cadence rather than
    // written as hours: the setup window from SETUP_GRACE_MS, the outage window from cadence.ts's own
    // STOPPED_AFTER_LABEL. Change `vercel.json`'s schedule and both move.
    graceLabel: args.alert.kind === 'stopped_working' ? STOPPED_AFTER_LABEL : GRACE_LABEL,
  })

  try {
    await sendConfirmationEmail({
      to: ADMIN_ALERT_TO,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      // The existing Brevo path. `senderName` is the same override the live-domain email uses, so the
      // alert arrives from the same sender as everything else this feature sends.
      senderName: 'HatchGrab',
    })
    console.warn(`[custom-domain] admin alert sent: ${args.alert.kind} ${args.address} — ${args.alert.reason}`)
    return true
  } catch (e) {
    // 🔴 LOGGED, NOT THROWN. See the module header.
    console.error('[custom-domain] admin alert FAILED to send:', e instanceof Error ? e.message : String(e))
    return false
  }
}
