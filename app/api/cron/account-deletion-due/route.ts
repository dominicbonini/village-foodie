// app/api/cron/account-deletion-due/route.ts
// ── 🔴 THE 30-DAY SWEEP. IT NOTIFIES. IT NEVER DELETES. ─────────────────────────────────────────────
// Nothing about account deletion executes automatically, by explicit decision. This job finds accounts
// whose 30 days have elapsed, EMAILS DOMINIC, and stops. He actions each one by hand via
// /api/admin/execute-account-deletion.
//
// 🔴 WHY NOT AUTOMATE: executeAccountDeletion is a SEQUENCE of statements, not a transaction (supabase-js
// cannot open one), so a mid-sequence failure leaves an account partially anonymised. Under a human that
// is a visible, resumable error. At 04:00 unattended it is a silent half-deletion. Keeping a person in
// the loop removes the entire class.
//
// 🔴 RE-NOTIFY, NEVER FIRE ONCE. The 30-day promise is now only as reliable as this email, so a single
// send that lands in spam is an unkept commitment with no second chance. Every run re-emails any account
// still pending whose last notification is older than RENOTIFY_INTERVAL_HOURS, and keeps doing so until
// the pending state is cleared — by execution, or by Dominic cancelling it.
//
// ⚠️ THE RECORDED FAILURE MODE APPLIES HERE TOO: "when the Vault service_role_key was deleted, every
// scheduled invocation 401'd and nothing surfaced it." Nothing inside a job that never runs can report
// that it never ran. The mitigation here is deliberately weaker than demo-cleanup's (no log table): the
// escalating repeat means a working job is loud, but a DEAD job is still silent. That gap is real.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { HATCHGRAB_SENDER } from '@/lib/email-config'
import { RENOTIFY_INTERVAL_HOURS } from '@/lib/account-deletion'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

async function notify(subject: string, html: string) {
  const apiKey = process.env.BREVO_API_KEY
  const to = HATCHGRAB_SENDER.replyTo
  if (!apiKey || !to) return false
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
        to: [{ email: to }], subject, htmlContent: html,
      }),
    })
    return true
  } catch (err) {
    console.error('[account-deletion-due] email failed:', err)
    return false
  }
}

export async function GET(req: NextRequest) {
  if (!(await authorised(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const renotifyBefore = new Date(now.getTime() - RENOTIFY_INTERVAL_HOURS * 60 * 60 * 1000).toISOString()

  // Accounts past their due date and still pending. The index on (deletion_due_at) where
  // deletion_requested_at is not null makes this cheap regardless of how many operators exist.
  const { data: due, error } = await supabase
    .from('operators')
    .select('id, email, name, deletion_requested_at, deletion_due_at, deletion_last_notified_at')
    .not('deletion_requested_at', 'is', null)
    .lte('deletion_due_at', now.toISOString())
  if (error) {
    // ⚠️ Loud. A sweep that cannot read its own worklist must not return 200 — that is indistinguishable
    // from "nothing is due", which is the failure this whole job exists to prevent.
    await notify('[ALERT] Account-deletion sweep could not read its worklist', `<p>${error.message}</p>`)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const notified: string[] = []
  const skipped: string[] = []

  for (const op of due ?? []) {
    // Re-notify only when the last reminder is old enough — so an hourly cron does not send 24 emails a
    // day, but a missed one is always followed by another.
    if (op.deletion_last_notified_at && op.deletion_last_notified_at > renotifyBefore) {
      skipped.push(op.id as string)
      continue
    }

    const { data: trucks } = await supabase.from('trucks').select('id, name').eq('operator_id', op.id)
    const truckList = (trucks ?? []).map(t => `${t.name} (${t.id})`).join(', ') || '(no trucks)'
    const daysOverdue = Math.floor((now.getTime() - new Date(op.deletion_due_at as string).getTime()) / 86400000)

    const sent = await notify(
      `[ACTION REQUIRED] Account deletion due${daysOverdue > 0 ? ` — ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue` : ''}`,
      `<p>Operator <code>${op.id}</code> (${op.email ?? 'no email'}) reached its ${''}deletion date on
         <strong>${String(op.deletion_due_at).slice(0, 10)}</strong>.</p>
       <p>Trucks: ${truckList}</p>
       <p><strong>Nothing has been deleted.</strong> This is a reminder and it will repeat every
          ${RENOTIFY_INTERVAL_HOURS}h until the account is actioned or the request is cancelled.</p>
       <p>To EXECUTE: POST /api/admin/execute-account-deletion with <code>{"operatorId":"${op.id}"}</code>.
          It anonymises orders and removes identity; it retains trucks, orders and order_payments as an
          anonymous financial record.</p>
       <p>To CANCEL: clear <code>operators.deletion_requested_at</code> and
          <code>trucks.deletion_requested_at</code> for this operator.</p>`,
    )

    if (sent) {
      // 🔴 Stamped ONLY on a successful send. If the email failed, leaving this null means the next run
      // tries again — the reminder must not be marked delivered when it was not.
      await supabase.from('operators').update({ deletion_last_notified_at: now.toISOString() }).eq('id', op.id)
      notified.push(op.id as string)
    }
  }

  return NextResponse.json({ ok: true, dueCount: due?.length ?? 0, notified, skipped, deleted: 0 })
}
