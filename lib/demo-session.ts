// lib/demo-session.ts
// Lifecycle for an anonymous demo: how long it lives, and the email that extends it (spec Stage 4, §7).
//
// Backed by the `demo_sessions` table (migration 20260723). Every write here is BEST-EFFORT by design:
// the demo must keep working if the migration hasn't been applied yet, degrading to "not persisted" —
// a demo that can't be saved is worth far more than a demo that won't provision.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'

/** No email given — spec §7. Short, because an abandoned demo is worth nothing to anyone. */
export const RETENTION_NO_EMAIL_HOURS = 24
/** Email given — spec §7. Stated explicitly in the return-link email, so it is a promise. */
export const RETENTION_WITH_EMAIL_DAYS = 14

export interface DemoSession {
  truck_id: string
  email: string | null
  created_at: string
  expires_at: string
  email_sent_at: string | null
}

function hoursFromNow(h: number, now = new Date()): string {
  return new Date(now.getTime() + h * 3_600_000).toISOString()
}

/** Open a session at provision time. Best-effort: a failure must never fail the provisioning. */
export async function createDemoSession(
  supabase: SupabaseClient, truckId: string, now = new Date(),
): Promise<void> {
  try {
    await supabase.from('demo_sessions').upsert({
      truck_id: truckId,
      expires_at: hoursFromNow(RETENTION_NO_EMAIL_HOURS, now),
    }, { onConflict: 'truck_id' })
  } catch (err) {
    console.warn(`[demo-session] could not open session for ${truckId} (migration applied?):`, err)
  }
}

/** Push the expiry out on a return visit, keeping whatever retention tier they're on. */
export async function touchDemoSession(
  supabase: SupabaseClient, truckId: string, now = new Date(),
): Promise<void> {
  try {
    const { data } = await supabase
      .from('demo_sessions').select('email').eq('truck_id', truckId).maybeSingle()
    const hours = data?.email ? RETENTION_WITH_EMAIL_DAYS * 24 : RETENTION_NO_EMAIL_HOURS
    await supabase.from('demo_sessions').upsert({
      truck_id: truckId, expires_at: hoursFromNow(hours, now),
    }, { onConflict: 'truck_id' })
  } catch (err) {
    console.warn(`[demo-session] could not touch session for ${truckId}:`, err)
  }
}

export interface SaveEmailResult {
  ok: boolean
  /** The date stated to the visitor AND in the email. Same value both places — never two answers. */
  expiresAt: string | null
  error?: string
}

/** Capture the email and move the demo onto the 14-day tier. NOT best-effort — the visitor is waiting on
 *  an answer, so a failure here must be reported rather than swallowed. */
export async function saveDemoEmail(
  supabase: SupabaseClient, truckId: string, email: string, now = new Date(),
): Promise<SaveEmailResult> {
  if (!isDemoIdentifier(truckId)) return { ok: false, expiresAt: null, error: 'Not a demo truck' }
  const expiresAt = hoursFromNow(RETENTION_WITH_EMAIL_DAYS * 24, now)
  const { error } = await supabase.from('demo_sessions').upsert({
    truck_id: truckId, email: email.trim().toLowerCase(), expires_at: expiresAt,
  }, { onConflict: 'truck_id' })
  if (error) {
    console.error(`[demo-session] save-email failed for ${truckId}:`, error.message)
    return { ok: false, expiresAt: null, error: error.message }
  }
  return { ok: true, expiresAt }
}

export async function markReturnEmailSent(
  supabase: SupabaseClient, truckId: string, now = new Date(),
): Promise<void> {
  try {
    await supabase.from('demo_sessions')
      .update({ email_sent_at: now.toISOString() }).eq('truck_id', truckId)
  } catch { /* non-fatal — the email already went */ }
}

export async function getDemoSession(
  supabase: SupabaseClient, truckId: string,
): Promise<DemoSession | null> {
  const { data } = await supabase
    .from('demo_sessions').select('*').eq('truck_id', truckId).maybeSingle()
  return (data as DemoSession) ?? null
}
