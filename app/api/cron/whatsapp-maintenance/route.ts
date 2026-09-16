// app/api/cron/whatsapp-maintenance/route.ts
//
// ── THE DAILY WHATSAPP CONNECTION SWEEP. 03:00 UTC. ─────────────────────────────────────────────────
//
// PATTERN FOLLOWED, NOT INVENTED: a Next route under `app/api/cron/`, registered in `vercel.json`'s
// `crons`, authorised by `Bearer $CRON_SECRET` with an admin fallback for a by-hand run. The seventh
// job to do exactly that.
//
// For every truck with a WhatsApp connection: ask Meta whether its token is still valid, refresh it if
// it is getting old AND automatic refreshing is switched on, and record whether the account can pay.
//
// ── 🔴 IT NEVER EMAILS AN OPERATOR. NOT ONCE, NOT FOR ANY OUTCOME. ─────────────────────────────────
// Everything this job learns is plumbing: OAuth token lifetimes, Graph error codes, refresh failures.
// An operator can act on none of it, and a 3am email about a "token refresh" from a food-truck app is
// alarming noise about a problem they cannot touch. The three alerts it can raise all go to the admin.
// ⚠️ THE OPERATOR ALERTS (limit_80, limit_100, payment_blocked) ARE SENT BY THE WEBHOOK, not here —
// they fire on a real customer message, which is when they are true and when they are actionable.
//
// ── 🔴 RUNNING IT TWICE IN ONE DAY MUST BE HARMLESS, AND IS ────────────────────────────────────────
// Vercel can deliver a cron more than once, and an admin can trigger it by hand on the same day. Three
// things make a second run a no-op rather than a second set of consequences:
//   1. The three token alerts are keyed on the UTC DAY (utcDayKey), so the second run's claim loses the
//      unique constraint and sends nothing.
//   2. Refreshing is idempotent in effect — a second exchange returns another valid token for the same
//      account, and the second run will not even attempt one, because the first run pushed the expiry
//      back beyond REFRESH_WHEN_DAYS_LEFT_BELOW.
//   3. Every write is an overwrite of an observation, never an increment.
//
// ⚠️ NOTHING HERE CAN REPORT THAT IT NEVER RAN. Same residual gap as every other job in this directory.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { decryptToken, encryptToken, encryptionKeyConfigured } from '@/lib/whatsapp/token-crypto'
import { inspectBusinessToken, refreshBusinessToken, readPaymentStatus } from '@/lib/whatsapp/meta-admin'
import {
  planTokenWork, classifyRefreshFailure, daysUntil, utcDayKey, tokenAutoRefreshEnabled,
} from '@/lib/whatsapp/maintenance'
import { sendWhatsAppAlert, supabaseAlertStore } from '@/lib/whatsapp/alerts'
import { tokenRefreshFailingEmail, tokenRefreshUrgentEmail, tokenInvalidEmail } from '@/lib/whatsapp/alert-copy'
import { ADMIN_ALERT_TO } from '@/lib/custom-domain/alert'
import { parseMetaAppSecrets } from '@/lib/meta/webhook-signature'

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

interface Row {
  truck_id: string
  waba_id: string | null
  access_token_ciphertext: string | null
  token_expires_at: string | null
  token_revoked_at: string | null
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const now = new Date()
  const dayKey = utcDayKey(now)
  const autoRefresh = tokenAutoRefreshEnabled(process.env.WHATSAPP_TOKEN_AUTO_REFRESH)
  const store = supabaseAlertStore(supabase)

  // 🔴 REFUSED, NOT SKIPPED, WHEN THE KEY IS MISSING. Without it every decrypt fails and the job would
  // report "0 refreshed" as though the tokens were fine — a silent all-clear over a total outage.
  if (!encryptionKeyConfigured()) {
    console.error('[whatsapp-maintenance] token encryption key not configured — aborting')
    return NextResponse.json({ error: 'Token encryption key not configured' }, { status: 500 })
  }

  const secrets = parseMetaAppSecrets(process.env.META_WHATSAPP_APP_SECRET)
  const appId = process.env.NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID || ''
  const appSecret = secrets.length > 0 ? secrets[0] : ''
  if (!appId || !appSecret) {
    console.error('[whatsapp-maintenance] app credentials not configured — aborting')
    return NextResponse.json({ error: 'App credentials not configured' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('truck_id, waba_id, access_token_ciphertext, token_expires_at, token_revoked_at')
  if (error) {
    console.error('[whatsapp-maintenance] connection read failed:', error.message)
    return NextResponse.json({ error: 'Read failed' }, { status: 500 })
  }

  const rows = (data || []) as Row[]
  const summary = { checked: 0, refreshed: 0, invalid: 0, paymentAdded: 0, paymentMissing: 0, skipped: 0, alerts: 0 }

  for (const row of rows) {
    // Nothing to inspect without a credential, and a row already known revoked is not news.
    if (!row.access_token_ciphertext || row.token_revoked_at) { summary.skipped++; continue }

    let token: string
    try {
      token = decryptToken(row.access_token_ciphertext)
    } catch {
      // ⚠️ TRUCK ID ONLY. A decrypt failure must not log the ciphertext or the key state per row.
      console.error(`[whatsapp-maintenance] decrypt failed: ${row.truck_id}`)
      summary.skipped++
      continue
    }

    summary.checked++

    const inspected = await inspectBusinessToken({ appId, appSecret, token })
    const plan = planTokenWork({
      inspection: inspected.ok ? inspected.inspection : null,
      autoRefreshEnabled: autoRefresh,
      expiresAt: row.token_expires_at,
      now,
    })

    if (plan.markRevoked) {
      summary.invalid++
      await supabase.from('whatsapp_connections')
        .update({ token_revoked_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('truck_id', row.truck_id)
    }

    if (plan.alert === 'token_invalid') {
      const name = await truckName(row.truck_id)
      const outcome = await sendWhatsAppAlert({
        store, kind: 'token_invalid', truckId: row.truck_id, periodKey: dayKey, to: ADMIN_ALERT_TO,
        email: tokenInvalidEmail({
          truckName: name, truckId: row.truck_id,
          code: inspected.ok ? null : inspected.code,
          subcode: inspected.ok ? null : inspected.subcode,
        }),
      })
      if (outcome === 'sent') summary.alerts++
    }

    if (plan.refresh) {
      const refreshed = await refreshBusinessToken({ appId, appSecret, currentToken: token })
      if (refreshed.ok) {
        summary.refreshed++
        // 🔴 THE EXPIRY IS COMPUTED FROM WHAT META ACTUALLY RETURNED, never from the 60 days we asked
        // for. A null `expires_in` means Meta did not say, and the existing expiry is kept rather than
        // a fabricated one written over it.
        const patch: Record<string, unknown> = {
          access_token_ciphertext: encryptToken(refreshed.accessToken),
          token_issued_at: now.toISOString(),
          updated_at: now.toISOString(),
        }
        if (refreshed.expiresIn !== null) {
          patch.token_expires_at = new Date(now.getTime() + refreshed.expiresIn * 1000).toISOString()
        }
        await supabase.from('whatsapp_connections').update(patch).eq('truck_id', row.truck_id)
      } else {
        const left = daysUntil(row.token_expires_at, now)
        const kind = classifyRefreshFailure(left)
        const name = await truckName(row.truck_id)
        const email = kind === 'token_refresh_urgent'
          ? tokenRefreshUrgentEmail({ truckName: name, truckId: row.truck_id, daysLeft: left, code: refreshed.code, subcode: refreshed.subcode })
          : tokenRefreshFailingEmail({ truckName: name, truckId: row.truck_id, daysLeft: left, code: refreshed.code, subcode: refreshed.subcode })
        const outcome = await sendWhatsAppAlert({ store, kind, truckId: row.truck_id, periodKey: dayKey, to: ADMIN_ALERT_TO, email })
        if (outcome === 'sent') summary.alerts++
      }
    }

    // ── PAYMENT STATUS ──────────────────────────────────────────────────────────────────────────────
    // Runs regardless of the refresh flag: it is a read, it changes nothing at Meta, and it is the only
    // thing that ever populates `payment_method_present`, which both signup paths write as null.
    if (row.waba_id) {
      const probe = await readPaymentStatus({ wabaId: row.waba_id, businessToken: token })
      if (probe.status === 'added') {
        summary.paymentAdded++
        await supabase.from('whatsapp_connections').update({ payment_method_present: true, updated_at: now.toISOString() }).eq('truck_id', row.truck_id)
      } else if (probe.status === 'missing') {
        summary.paymentMissing++
        await supabase.from('whatsapp_connections').update({ payment_method_present: false, updated_at: now.toISOString() }).eq('truck_id', row.truck_id)
      }
      // 🔴 'error' WRITES NOTHING. A failed lookup must never become `payment_method_present: false` —
      // that is a claim about the operator's account made on the strength of a network blip, and it
      // would show them a "no payment method" warning they cannot act on because it is not true.
    }
  }

  console.warn(`[whatsapp-maintenance] ${JSON.stringify(summary)} autoRefresh=${autoRefresh ? 'on' : 'off'}`)
  return NextResponse.json({ ok: true, ...summary, autoRefresh })
}

/** Best-effort display name for an alert email. The truck id is always included separately. */
async function truckName(truckId: string): Promise<string> {
  const { data } = await supabase.from('trucks').select('name').eq('id', truckId).maybeSingle()
  return (data?.name as string | undefined) || truckId
}
