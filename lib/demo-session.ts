// lib/demo-session.ts
// Lifecycle for an anonymous demo: how long it lives, and the email that extends it (spec Stage 4, §7).
//
// Backed by the `demo_sessions` table (migration 20260723). Every write here is BEST-EFFORT by design:
// the demo must keep working if the migration hasn't been applied yet, degrading to "not persisted" —
// a demo that can't be saved is worth far more than a demo that won't provision.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isDemoIdentifier } from '@/lib/demo'
import { createSlug } from '@/lib/utils'

/** No email given — spec §7. Short, because an abandoned demo is worth nothing to anyone. */
export const RETENTION_NO_EMAIL_HOURS = 24
/** Email given — spec §7. Stated explicitly in the return-link email, so it is a promise. */
export const RETENTION_WITH_EMAIL_DAYS = 14
/** An OUTREACH demo — built by the admin for a named prospect (demo_sessions.discovery_truck_id set).
 *  ONE MONTH, expressed as 30 days so the arithmetic is the same shape as the other two tiers. */
export const RETENTION_OUTREACH_DAYS = 30

// ── 🔴 expires_at IS MONOTONIC ────────────────────────────────────────────────────────────────────
// Three writers touch expires_at after creation: touchDemoSession (return visit) and saveDemoEmail
// (email capture) here, and nothing else. Each used to write `now + <its tier>` UNCONDITIONALLY, which
// meant a 30-day outreach demo was pulled back to 24h the moment the prospect clicked the return link,
// and to 14 days the moment they typed an email. Both now EXTEND ONLY: the stored value wins whenever it
// is later than the value the writer would have set. `later()` is the single place that rule lives.
function later(stored: string | null | undefined, candidate: string): string {
  if (!stored) return candidate
  return new Date(stored).getTime() >= new Date(candidate).getTime() ? stored : candidate
}

export interface DemoSession {
  truck_id: string
  email: string | null
  created_at: string
  expires_at: string
  email_sent_at: string | null
  /** Outreach demos only (migration 20260912). Absent/undefined until that migration is applied. */
  discovery_truck_id?: string | null
  public_ref?: string | null
  /** When the prospect FIRST opened the link (migration 20260914). NULL/undefined = never. */
  first_opened_at?: string | null
}

function hoursFromNow(h: number, now = new Date()): string {
  return new Date(now.getTime() + h * 3_600_000).toISOString()
}

// ── public_ref — the readable URL segment ────────────────────────────────────────────────────────
// `createSlug(name)` ("pizzeria-gusto"), then `-<4 chars>` only when that is taken. PURE and exported so
// the collision rule can be tested without a database. Attempt 0 is the bare slug; the suffix alphabet
// is the same Crockford set demoIdentity uses, for the same read-aloud reason.
const REF_SUFFIX_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const REF_SUFFIX_CHARS = 4
export const PUBLIC_REF_MAX_ATTEMPTS = 6
export function publicRefCandidate(base: string, attempt: number, random: () => number = Math.random): string {
  const slug = createSlug(base).slice(0, 60) || 'demo'
  if (attempt === 0) return slug
  let suffix = ''
  for (let i = 0; i < REF_SUFFIX_CHARS; i++) suffix += REF_SUFFIX_ALPHABET[Math.floor(random() * REF_SUFFIX_ALPHABET.length)]
  return `${slug}-${suffix}`
}

export interface CreateDemoSessionOptions {
  /** OUTREACH: the discovery truck this demo is built for. Switches the tier to RETENTION_OUTREACH_DAYS,
   *  writes discovery_truck_id + public_ref, and makes the write STRICT (see below). */
  discoveryTruckId?: string | null
  /** The name public_ref is slugified from. Required with discoveryTruckId. */
  publicRefBase?: string | null
}

export class DemoSessionError extends Error {
  constructor(message: string) { super(message); this.name = 'DemoSessionError' }
}

/**
 * Open a session at provision time.
 *
 * ANONYMOUS (no discoveryTruckId): best-effort, exactly as before — a failure must never fail the
 * provisioning, and the row shape written is byte-identical to what it was (truck_id + expires_at).
 *
 * OUTREACH (discoveryTruckId set): 🔴 STRICT. The link and the readable URL are the whole point of an
 * outreach demo; a demo that silently lost them would hand the admin a dashboard link with no /demo URL
 * and no branding. So this THROWS DemoSessionError, and the caller (provisionDemo) surfaces it with the
 * truck id — the truck has no menu and no event at this point, so the orphan sweep reclaims it.
 * public_ref collisions (23505 on demo_sessions_public_ref_key) retry with a random suffix.
 */
export async function createDemoSession(
  supabase: SupabaseClient, truckId: string, now = new Date(), opts: CreateDemoSessionOptions = {},
): Promise<{ publicRef: string | null }> {
  if (!opts.discoveryTruckId) {
    try {
      await supabase.from('demo_sessions').upsert({
        truck_id: truckId,
        expires_at: hoursFromNow(RETENTION_NO_EMAIL_HOURS, now),
      }, { onConflict: 'truck_id' })
    } catch (err) {
      console.warn(`[demo-session] could not open session for ${truckId} (migration applied?):`, err)
    }
    return { publicRef: null }
  }

  const base = (opts.publicRefBase ?? '').trim()
  if (!base) throw new DemoSessionError('publicRefBase is required for an outreach demo session')
  const expiresAt = hoursFromNow(RETENTION_OUTREACH_DAYS * 24, now)
  let lastError = ''
  for (let attempt = 0; attempt < PUBLIC_REF_MAX_ATTEMPTS; attempt++) {
    const publicRef = publicRefCandidate(base, attempt)
    const { error } = await supabase.from('demo_sessions').upsert({
      truck_id: truckId,
      expires_at: expiresAt,
      discovery_truck_id: opts.discoveryTruckId,
      public_ref: publicRef,
    }, { onConflict: 'truck_id' })
    if (!error) return { publicRef }
    lastError = error.message
    // Unique violation on public_ref → try a suffixed candidate. Any other error is final.
    if (error.code === '23505' && /public_ref/.test(error.message)) continue
    throw new DemoSessionError(`could not open outreach session for ${truckId}: ${lastError}`)
  }
  throw new DemoSessionError(`could not find a free public_ref for "${base}" after ${PUBLIC_REF_MAX_ATTEMPTS} attempts (last: ${lastError})`)
}

/** Push the expiry out on a return visit, keeping whatever retention tier they're on.
 *  EXTEND ONLY: a stored expiry later than this visit's tier would give (a 30-day outreach demo, or a
 *  14-day one revisited on day 2 with no email) is left where it is. */
export async function touchDemoSession(
  supabase: SupabaseClient, truckId: string, now = new Date(),
): Promise<void> {
  try {
    const { data } = await supabase
      .from('demo_sessions').select('email, expires_at').eq('truck_id', truckId).maybeSingle()
    const hours = data?.email ? RETENTION_WITH_EMAIL_DAYS * 24 : RETENTION_NO_EMAIL_HOURS
    await supabase.from('demo_sessions').upsert({
      truck_id: truckId, expires_at: later(data?.expires_at as string | null | undefined, hoursFromNow(hours, now)),
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
  // EXTEND ONLY. The 14-day tier is a floor, not a reset: an outreach demo on its 30-day tier keeps that
  // date, and the date returned here — which the email states to the visitor — is the one actually stored.
  const { data: current } = await supabase
    .from('demo_sessions').select('expires_at').eq('truck_id', truckId).maybeSingle()
  const expiresAt = later(current?.expires_at as string | null | undefined, hoursFromNow(RETENTION_WITH_EMAIL_DAYS * 24, now))
  const { error } = await supabase.from('demo_sessions').upsert({
    truck_id: truckId, email: email.trim().toLowerCase(), expires_at: expiresAt,
  }, { onConflict: 'truck_id' })
  if (error) {
    console.error(`[demo-session] save-email failed for ${truckId}:`, error.message)
    return { ok: false, expiresAt: null, error: error.message }
  }
  return { ok: true, expiresAt }
}

// ── FIRST OPEN ───────────────────────────────────────────────────────────────────────────────────
/**
 * Claim "this demo link has never been opened before", atomically.
 *
 * 🔴 A COMPARE-AND-SET, NOT A READ-THEN-WRITE. The predicate `first_opened_at IS NULL` is part of the
 * UPDATE, and `.select('truck_id')` makes the affected-row count observable — an UPDATE matching nothing
 * is NOT an error in PostgREST, so checking `error` alone would let the zero-row case through (the same
 * lesson as the promote's `.is('hatchgrab_truck_id', null)` guard).
 *
 * TWO SIMULTANEOUS OPENS PRODUCE ONE CLAIM, and that is Postgres doing it, not us: both statements
 * target the same primary-key row, so the second blocks on the first's row lock; when the first commits,
 * the second re-evaluates its WHERE against the updated row under READ COMMITTED (EvalPlanQual), sees a
 * non-null `first_opened_at`, and matches ZERO rows. No advisory lock, no explicit transaction, no
 * serialisable retry loop. The loser is told `already-opened` and does nothing.
 *
 * 🔴 `discovery_truck_id IS NOT NULL` IS PART OF THE PREDICATE, SO AN ANONYMOUS DEMO IS NEVER CLAIMED.
 * A landing-page demo is provisioned and then IMMEDIATELY navigated to — components/landing/DemoUpload
 * calls `window.location.assign(data.redirectTo)` the moment /api/demo answers — so its first open is
 * seconds after its board was seeded against that same clock, and restarting would delete the orders the
 * visitor just watched being built. An OUTREACH demo is the opposite shape: built by an admin at one
 * moment, opened by a prospect at another, possibly days later. The gate is in the SQL rather than in a
 * caller so no future caller can forget it.
 */
export type FirstOpenClaim =
  | { claimed: true; at: string }
  | { claimed: false; reason: 'already-opened' | 'no-session' | 'not-outreach' | 'unavailable'; detail?: string }

export async function claimDemoFirstOpen(
  supabase: SupabaseClient, truckId: string, now = new Date(),
): Promise<FirstOpenClaim> {
  if (!isDemoIdentifier(truckId)) return { claimed: false, reason: 'no-session', detail: 'not a demo truck' }
  const at = now.toISOString()
  const { data, error } = await supabase
    .from('demo_sessions')
    .update({ first_opened_at: at })
    .eq('truck_id', truckId)
    .not('discovery_truck_id', 'is', null)
    .is('first_opened_at', null)
    .select('truck_id')

  // A missing column (migration 20260914 unapplied) arrives HERE as a PostgREST error, and it must read
  // as "cannot claim", never as "claimed". The caller does not restart on `unavailable` — an unclaimable
  // first open that still restarted would wipe the board on EVERY load.
  if (error) return { claimed: false, reason: 'unavailable', detail: error.message }
  if (data && data.length > 0) return { claimed: true, at }

  // Zero rows. Classify it, because "already opened", "anonymous demo" and "no session row at all" are
  // three different things and collapsing them would make the logs useless. One extra read, and only on
  // the path that is NOT the first open.
  const { data: row } = await supabase
    .from('demo_sessions').select('truck_id, discovery_truck_id, first_opened_at').eq('truck_id', truckId).maybeSingle()
  if (!row) return { claimed: false, reason: 'no-session' }
  if (!(row as { discovery_truck_id?: string | null }).discovery_truck_id) return { claimed: false, reason: 'not-outreach' }
  return { claimed: false, reason: 'already-opened' }
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
