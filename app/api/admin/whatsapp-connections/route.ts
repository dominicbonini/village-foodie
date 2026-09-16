// app/api/admin/whatsapp-connections/route.ts
// 🔴 ADMIN ONLY. The per-connection support tools: see what state every truck's WhatsApp credential is
// in, and run by hand the three things the nightly job does on its own.
//
// ── ✅ THE EXISTING PATTERN, NOT A NEW ONE ─────────────────────────────────────────────────────────
// A sibling of app/api/admin/{create-truck,delete-truck,whatsapp-templates,…}: `verifyAdmin(req)` first,
// a bare `{ error }` 401 on failure, `NextRequest` in, `NextResponse.json` out.
//
// ── 🔴 NOT ONE RESPONSE FROM THIS ROUTE CONTAINS A TOKEN, A CIPHERTEXT, OR A FUNDING ID ────────────
// The GET reports token PRESENCE, expiry and validity — never the credential. `readPaymentStatus`
// returns 'added'/'missing' and discards the funding id inside the Graph call itself. This is an admin
// screen, but "admin" is not a reason to put a live business token into a browser tab, a proxy log, or
// a screenshot pasted into a support thread.
//
// ── ⚠️ "Refresh token now" WRITES A LIVE CREDENTIAL FOR A REAL TRUCK ───────────────────────────────
// It is the only destructive action here. It is deliberately NOT gated on WHATSAPP_TOKEN_AUTO_REFRESH:
// that flag exists to control what happens UNATTENDED at 3am, and an admin pressing a button is the
// attended case the flag was protecting. The old token is discarded on success — Meta invalidates it
// anyway — so a failure part-way leaves the old one in place rather than a half-written row.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { decryptToken, encryptToken, encryptionKeyConfigured } from '@/lib/whatsapp/token-crypto'
import { inspectBusinessToken, refreshBusinessToken, readPaymentStatus, inspectionNeverExpires } from '@/lib/whatsapp/meta-admin'
import { parseMetaAppSecrets } from '@/lib/meta/webhook-signature'
import { daysUntil } from '@/lib/whatsapp/maintenance'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const FIELDS =
  'truck_id, waba_id, phone_number_id, access_token_ciphertext, token_expires_at, token_issued_at, token_revoked_at, payment_method_present, display_phone_number, verified_name'

/** App credentials, or a named reason they are unusable. Never returns the secret itself. */
function appCreds(): { ok: true; appId: string; appSecret: string } | { ok: false; reason: string } {
  const appId = process.env.NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID || ''
  const secrets = parseMetaAppSecrets(process.env.META_WHATSAPP_APP_SECRET)
  if (!appId) return { ok: false, reason: 'NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID is not set' }
  if (secrets.length === 0) return { ok: false, reason: 'META_WHATSAPP_APP_SECRET is not set' }
  return { ok: true, appId, appSecret: secrets[0] }
}

/** Decrypt one row's token, or say why not. 🔴 The plaintext never leaves the calling function. */
function tokenOf(row: { access_token_ciphertext: string | null }): { ok: true; token: string } | { ok: false; reason: string } {
  if (!encryptionKeyConfigured()) return { ok: false, reason: 'Token encryption key is not configured' }
  if (!row.access_token_ciphertext) return { ok: false, reason: 'This connection holds no token' }
  try {
    return { ok: true, token: decryptToken(row.access_token_ciphertext) }
  } catch {
    // ⚠️ NO DETAIL. A decrypt failure message can describe the ciphertext's shape; the admin only needs
    // to know it failed, and the usual cause is the key having been rotated without re-encrypting.
    return { ok: false, reason: 'Token could not be decrypted (wrong or rotated key?)' }
  }
}

/**
 * GET — every connection, reduced to what a support screen needs.
 * ⚠️ MAKES NO META CALLS. It is the cheap question, answerable without spending a request per truck —
 * the same split the templates route draws between `?section=config` and the live list.
 */
export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabase.from('whatsapp_connections').select(FIELDS)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })

  const now = new Date()
  const rows = (data || []) as Record<string, unknown>[]
  const ids = rows.map(r => r.truck_id as string)
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: trucks } = await supabase.from('trucks').select('id, name').in('id', ids)
    for (const t of (trucks || []) as { id: string; name: string }[]) names.set(t.id, t.name)
  }

  const connections = rows.map(r => {
    const truckId = r.truck_id as string
    const expiresAt = (r.token_expires_at as string | null) ?? null
    return {
      truckId,
      truckName: names.get(truckId) ?? truckId,
      wabaId: (r.waba_id as string | null) ?? null,
      phoneNumberId: (r.phone_number_id as string | null) ?? null,
      displayPhoneNumber: (r.display_phone_number as string | null) ?? null,
      verifiedName: (r.verified_name as string | null) ?? null,
      // 🔴 PRESENCE, NOT THE VALUE. The same reduction lib/whatsapp/connection-read.ts performs.
      tokenPresent: !!r.access_token_ciphertext,
      tokenIssuedAt: (r.token_issued_at as string | null) ?? null,
      tokenExpiresAt: expiresAt,
      tokenRevokedAt: (r.token_revoked_at as string | null) ?? null,
      daysLeft: daysUntil(expiresAt, now),
      paymentMethodPresent: (r.payment_method_present as boolean | null) ?? null,
    }
  })

  return NextResponse.json({ ok: true, connections, autoRefresh: process.env.WHATSAPP_TOKEN_AUTO_REFRESH === 'on' })
}

/**
 * POST — the three by-hand actions.
 * 🔴 EVERY FAILURE IS A 200 WITH `ok: false` AND A SENTENCE, except the admin gate. An admin pressing
 * "Check token" wants to be told what Meta said, not to be shown a browser error page.
 */
export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let body: { action?: string; truckId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Bad request body' }) }

  const action = body.action || ''
  const truckId = body.truckId || ''
  if (!truckId) return NextResponse.json({ ok: false, error: 'Missing truckId' })
  if (action !== 'refresh_token' && action !== 'check_token' && action !== 'check_payment') {
    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` })
  }

  const { data, error } = await supabase
    .from('whatsapp_connections').select(FIELDS).eq('truck_id', truckId).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message })
  if (!data) return NextResponse.json({ ok: false, error: 'No WhatsApp connection for that truck' })
  const row = data as { access_token_ciphertext: string | null; waba_id: string | null; token_expires_at: string | null }

  const creds = appCreds()
  const tok = tokenOf(row)
  if (!tok.ok) return NextResponse.json({ ok: false, error: tok.reason })

  const now = new Date()

  if (action === 'check_payment') {
    if (!row.waba_id) return NextResponse.json({ ok: false, error: 'This connection has no WABA id' })
    const probe = await readPaymentStatus({ wabaId: row.waba_id, businessToken: tok.token })
    if (probe.status === 'error') {
      return NextResponse.json({ ok: false, error: `Meta could not be asked (${probe.reason}, code ${probe.code ?? 'none'})` })
    }
    // Recorded, so the operator's own Settings card stops saying "unknown" the moment we have looked.
    await supabase.from('whatsapp_connections')
      .update({ payment_method_present: probe.status === 'added', updated_at: now.toISOString() })
      .eq('truck_id', truckId)
    console.warn(`[admin/whatsapp-connections] check_payment ${truckId} -> ${probe.status}`)
    return NextResponse.json({ ok: true, action, paymentStatus: probe.status })
  }

  if (!creds.ok) return NextResponse.json({ ok: false, error: creds.reason })

  if (action === 'check_token') {
    const res = await inspectBusinessToken({ appId: creds.appId, appSecret: creds.appSecret, token: tok.token })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Meta could not be asked (${res.reason}, code ${res.code ?? 'none'})` })
    }
    const i = res.inspection
    console.warn(`[admin/whatsapp-connections] check_token ${truckId} -> valid=${i.isValid}`)
    return NextResponse.json({
      ok: true, action,
      isValid: i.isValid,
      neverExpires: inspectionNeverExpires(i),
      // 🔴 ZERO IS META'S "NEVER EXPIRES" SENTINEL, so it is reported as a flag and NOT converted into
      // a 1970 date that would read as sixty years expired.
      expiresAt: i.expiresAt === 0 || i.expiresAt === null ? null : new Date(i.expiresAt * 1000).toISOString(),
      scopes: i.scopes,
    })
  }

  // action === 'refresh_token'
  const res = await refreshBusinessToken({ appId: creds.appId, appSecret: creds.appSecret, currentToken: tok.token })
  if (!res.ok) {
    console.error(`[admin/whatsapp-connections] refresh_token FAILED ${truckId}`)
    return NextResponse.json({ ok: false, error: `Meta refused the refresh (${res.reason}, code ${res.code ?? 'none'})` })
  }
  const patch: Record<string, unknown> = {
    access_token_ciphertext: encryptToken(res.accessToken),
    token_issued_at: now.toISOString(),
    // A successful refresh means the credential works again, so a stale revocation mark must not linger
    // and keep the truck's Settings card showing "Reconnect".
    token_revoked_at: null,
    updated_at: now.toISOString(),
  }
  // 🔴 ONLY WHEN META SAID SO. `set_token_expires_in_60_days=true` is what we ASKED for, not a promise;
  // writing 60 days when Meta returned no `expires_in` would be inventing the one date this whole
  // feature is built around.
  if (res.expiresIn !== null) patch.token_expires_at = new Date(now.getTime() + res.expiresIn * 1000).toISOString()

  const { error: upErr } = await supabase.from('whatsapp_connections').update(patch).eq('truck_id', truckId)
  if (upErr) {
    // 🔴 THE WORST OUTCOME IN THIS FILE AND IT IS REPORTED PLAINLY. Meta has issued a new token and
    // invalidated the old one, and we failed to store the new one — the truck is now disconnected and
    // only a reconnect fixes it. Silence here would leave an admin believing the refresh worked.
    console.error(`[admin/whatsapp-connections] refresh_token WROTE NOTHING ${truckId}: ${upErr.message}`)
    return NextResponse.json({ ok: false, error: `Meta issued a new token but saving it FAILED (${upErr.message}). This truck must reconnect.` })
  }
  console.warn(`[admin/whatsapp-connections] refresh_token ok ${truckId}`)
  return NextResponse.json({ ok: true, action, expiresIn: res.expiresIn })
}
