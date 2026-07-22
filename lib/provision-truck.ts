// lib/provision-truck.ts
// THE app-side truck-creation path. Before this, creating a truck was out-of-band SQL only (blocker B1 in
// docs/onboarding-flow.md) — hand-authored TEXT id, hand-formed dashboard_token, hand-set visibility flags.
//
// ONE function serves both callers. The differences between an admin onboarding a real operator and an
// anonymous demo are DATA, not control flow, so they live in PROVISION_PROFILES below rather than in a
// fork. (Same idiom as PLAN_FEATURES in lib/features.ts — one code path, a table for the deltas.)
//
// SCOPE: truck + van. Event creation is deliberately NOT here — events are recurring where trucks are
// one-shot, and `upsert_event` (app/api/manage/route.ts) already handles slot_capacity generation, the
// production_slot_usage rebuild and event_deals seeding correctly. Duplicating that would fork the slot
// engine. The demo's event (status:'open', computed window) lands in Phase 2 alongside its own extraction.

import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Plan } from '@/lib/features'
import { createSlug } from '@/lib/utils'
import { deleteTruckCascade } from '@/lib/delete-truck'

// ── Reserved prefix ──────────────────────────────────────────────────────────────────────────────────
// proxy.ts grants `/dashboard/demo-*` an exception from the session gate, so for a demo the TOKEN ALONE is
// the security boundary. That makes `demo-` load-bearing: a REAL operator truck whose token began `demo-`
// would silently lose its session gate. It is reachable by accident — a truck named "Demo Kitchen" slugs
// to `demo-kitchen`, and the operator token convention is `<slug-base>-<hex>`. So this is asserted before
// every insert (assertReservedPrefix), not left to convention.
export const DEMO_PREFIX = 'demo-'

// ── Identity generation ──────────────────────────────────────────────────────────────────────────────
// Crockford-style base32: no i/l/o/u, so nothing is ambiguous when read aloud or pasted from a support
// thread. 32 chars = 5 bits each, and 256 is a multiple of 32, so `byte & 31` is unbiased.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const DEMO_TOKEN_CHARS = 26   // 26 × 5 = 130 bits

function randomToken(chars: number): string {
  const bytes = randomBytes(chars)
  let out = ''
  for (let i = 0; i < chars; i++) out += ALPHABET[bytes[i] & 31]
  return out
}

// ── Visibility ───────────────────────────────────────────────────────────────────────────────────────
// All six columns are written EXPLICITLY, including the three whose DB defaults are already correct.
// Deliberate: these are a security property, the defaults are exactly what migration 20260702 changed and
// could change again, and someone auditing "is this truck hidden?" should find the whole answer in one
// place. Three lines of redundancy against a class of silent-exposure bug.
//
// `active` is NOT a visibility control and is always true — /api/orders/submit filters .eq('active', true),
// so active=false would break order placement rather than hide the truck. Hiding is excluded + show_on_*.
const HIDDEN_VISIBILITY = {
  show_on_vf: false,
  show_on_hg: false,      // DB default is TRUE — must override
  order_link_vf: false,
  order_link_hg: false,   // DB default is TRUE — must override
  is_customer: false,
  excluded: true,         // master hide
} as const

// The go-live state (§4.3). HG only — whether Village Foodie exposure follows is a separate product
// decision (O3), so show_on_vf/order_link_vf stay false here.
const PUBLIC_VISIBILITY = {
  show_on_vf: false,
  show_on_hg: true,
  order_link_vf: false,
  order_link_hg: true,
  is_customer: true,
  excluded: false,
} as const

// ── Profiles ─────────────────────────────────────────────────────────────────────────────────────────
export type ProvisionKind = 'operator' | 'demo'

interface ProvisionProfile {
  identity: 'readable' | 'random'
  plan: Plan
  nameRequired: boolean
  truckOrderEmailEnabled: boolean
  allergenDisplayMode: 'per_dish' | 'card' | 'both' | null
}

const PROVISION_PROFILES: Record<ProvisionKind, ProvisionProfile> = {
  // Readable ids stay valuable for real trucks: trucks.id is the STORAGE PATH PREFIX (get_upload_url
  // builds `${truck.id}/…`), and it's what you read in the admin console and in logs.
  operator: {
    identity: 'readable',
    plan: 'demo',                 // pre-trial "setup mode" — NOT 'trial'. canAccess() returns false for
                                  // EVERY feature when plan==='trial' && trial_expires_at is null.
    nameRequired: true,
    truckOrderEmailEnabled: true,
    allergenDisplayMode: null,    // operator chooses in the wizard
  },
  demo: {
    identity: 'random',
    plan: 'demo',
    nameRequired: false,
    truckOrderEmailEnabled: false, // defaults true → every demo order would email the truck's contact
    // NEVER 'per_dish' for a demo: import commits every item allergens_verified=false, and the per-dish
    // customer-menu gate HIDES unverified items → the demo would render an EMPTY MENU.
    allergenDisplayMode: 'card',
  },
}

// ── Public types ─────────────────────────────────────────────────────────────────────────────────────
export interface ProvisionVanOptions {
  name?: string                   // default 'Van 1' — NOT NULL, no DB default
  kitchen_capacity?: number       // default 5 — nullable with NO default, but without it upsert_event
                                  // writes NO slot_capacity and the capacity engine is inert
  capacity_window_mins?: number   // omit → DB default 5 (NOT NULL, CHECK 1–20)
}

export interface ProvisionTruckOptions {
  kind: ProvisionKind
  name?: string
  slug?: string
  plan?: Plan
  visibility?: 'hidden' | 'public'
  contactEmail?: string | null
  cuisineType?: string | null
  van?: ProvisionVanOptions | false
}

export interface ProvisionResult {
  truck: {
    id: string
    slug: string
    name: string
    plan: Plan
    dashboard_token: string
    active: boolean
    excluded: boolean
    show_on_vf: boolean
    show_on_hg: boolean
  }
  van: { id: string; name: string; kds_token: string | null } | null
  warnings: string[]
}

export type ProvisionErrorCode =
  | 'validation'
  | 'unique_exhausted'
  | 'reserved_prefix'
  | 'insert_failed'
  | 'van_failed'

export class ProvisionError extends Error {
  readonly code: ProvisionErrorCode
  /** Set only when a truck row was created but a later step failed AND the compensating delete ALSO
   *  failed — i.e. a real orphan is sitting in the DB and needs sweeping. */
  readonly orphanTruckId?: string
  constructor(code: ProvisionErrorCode, message: string, orphanTruckId?: string) {
    super(message)
    this.name = 'ProvisionError'
    this.code = code
    this.orphanTruckId = orphanTruckId
  }
}

const VALID_PLANS: Plan[] = ['starter', 'pro', 'max', 'trial', 'demo', 'tester']
const MAX_INSERT_ATTEMPTS = 5

interface Identity { id: string; slug: string; dashboard_token: string }

function demoIdentity(): Identity {
  // id, slug and token are generated INDEPENDENTLY. All three are publicly resolvable (/api/menu and
  // /api/events each accept id or slug), so leaking one must not hand over the others. Costs nothing.
  return {
    id: DEMO_PREFIX + randomToken(DEMO_TOKEN_CHARS),
    slug: DEMO_PREFIX + randomToken(DEMO_TOKEN_CHARS),
    dashboard_token: DEMO_PREFIX + randomToken(DEMO_TOKEN_CHARS),
  }
}

function operatorIdentity(name: string, slugOverride: string | undefined, attempt: number): Identity {
  const base = createSlug(slugOverride || name)
  const suffixed = attempt === 0 ? base : `${base}-${attempt + 1}`
  return {
    id: suffixed,
    slug: suffixed,
    // Existing convention, kept for support-desk readability: `gusto-3d87b5d15a6f`.
    dashboard_token: `${suffixed.slice(0, 24)}-${randomBytes(6).toString('hex')}`,
  }
}

function assertReservedPrefix(identity: Identity, kind: ProvisionKind): void {
  if (kind === 'demo') return
  const offending = (Object.keys(identity) as (keyof Identity)[])
    .filter(k => identity[k].startsWith(DEMO_PREFIX))
  if (offending.length > 0) {
    throw new ProvisionError(
      'reserved_prefix',
      `"${DEMO_PREFIX}" is a reserved prefix (it grants the /dashboard session-gate exception) and cannot ` +
      `be used by an operator truck — offending field(s): ${offending.join(', ')}. Choose a different slug.`,
    )
  }
}

/**
 * Create a working truck (row + van) with fail-safe hidden visibility.
 *
 * @param supabase MUST be a service-role client — injected, never constructed here, so callers own env.
 * @throws {ProvisionError}
 */
export async function provisionTruck(
  supabase: SupabaseClient,
  opts: ProvisionTruckOptions,
): Promise<ProvisionResult> {
  const profile = PROVISION_PROFILES[opts.kind]
  if (!profile) throw new ProvisionError('validation', `Unknown provision kind "${opts.kind}"`)

  const warnings: string[] = []

  const name = (opts.name ?? '').trim()
  if (profile.nameRequired && !name) {
    throw new ProvisionError('validation', 'name is required for an operator truck')
  }

  const plan = opts.plan ?? profile.plan
  if (!VALID_PLANS.includes(plan)) {
    // Caught app-side so the caller gets a clear message instead of a raw 23514 trucks_plan_check violation.
    throw new ProvisionError('validation', `Invalid plan "${plan}" — must be one of ${VALID_PLANS.join(', ')}`)
  }

  // Fail-safe: hidden unless a human explicitly asks for public. A real truck goes public at NOMINATION
  // (§4.3), not at creation, so 'hidden' is correct for both kinds and 'public' is opt-in.
  const visibility = opts.visibility ?? 'hidden'
  const visibilityCols = visibility === 'public' ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY
  if (visibility === 'public') {
    warnings.push('Truck created PUBLIC — it is discoverable on HatchGrab immediately.')
  }

  if (opts.kind === 'operator' && !opts.contactEmail && profile.truckOrderEmailEnabled) {
    warnings.push('No contact_email set — truck order-notification emails have nowhere to go until one is added.')
  }

  // ── Insert the truck, retrying on unique violations ────────────────────────────────────────────────
  // Three unique indexes can fire: trucks_pkey (id), trucks_slug_key, trucks_dashboard_token_key.
  // INSERT-AND-RETRY, never SELECT-then-INSERT: a pre-check is TOCTOU-racy against a concurrent provision;
  // the insert is authoritative.
  //
  // On 23505 we regenerate the WHOLE identity rather than parsing which constraint fired. Parsing the
  // constraint name out of the PostgREST error is the tidier fix, but its exact shape is unverified and
  // building retry logic on an unverified error shape is how silent bugs start. Regenerating all three is
  // correct regardless of which one collided. The error message IS logged, so the shape becomes observable
  // in practice and this can be tightened later with evidence.
  let created: Record<string, unknown> | null = null
  let identity: Identity | null = null
  let lastError = ''

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    identity = profile.identity === 'random'
      ? demoIdentity()
      : operatorIdentity(name, opts.slug, attempt)

    assertReservedPrefix(identity, opts.kind)

    const truckName = name || `Demo Kitchen (${identity.id.slice(DEMO_PREFIX.length, DEMO_PREFIX.length + 6)})`

    const { data, error } = await supabase
      .from('trucks')
      .insert({
        id: identity.id,
        slug: identity.slug,
        name: truckName,
        dashboard_token: identity.dashboard_token,
        // verifyToken (api/dashboard/action) REJECTS when a pin is set and unmatched — a provisioned truck
        // must never carry one.
        dashboard_pin: null,
        // 🔴 LEGACY LANDMINE: trucks.sheet_id is NOT NULL with NO DEFAULT (a dead Google Sheets column —
        // it is referenced only as a type field in lib/supabase.ts and read nowhere at runtime). ANY insert
        // omitting it FAILS. Empty string is the established convention: the live test-truck row carries
        // sheet_id = '' (verified July 2026), which also confirms there is no unique index on the column.
        sheet_id: '',
        active: true,
        plan,
        trial_expires_at: null,   // nomination sets this (§8)
        operator_id: null,        // set afterwards by /api/admin/create-operator — a separate concern
        contact_email: opts.contactEmail ?? null,
        cuisine_type: opts.cuisineType ?? null,
        truck_order_email_enabled: profile.truckOrderEmailEnabled,
        allergen_display_mode: profile.allergenDisplayMode,
        // Read by upsert_event when creating events (`truck.default_auto_open ?? true`).
        default_auto_open: true,
        default_auto_close: true,
        ...visibilityCols,
      })
      .select('id, slug, name, plan, dashboard_token, active, excluded, show_on_vf, show_on_hg')
      .single()

    if (!error && data) { created = data; break }

    lastError = error?.message ?? 'unknown insert error'
    if (error?.code === '23505') {
      console.warn(`[provision-truck] unique violation on attempt ${attempt + 1}: ${lastError}`)
      continue
    }
    throw new ProvisionError('insert_failed', `Truck insert failed: ${lastError}`)
  }

  if (!created || !identity) {
    throw new ProvisionError(
      'unique_exhausted',
      `Could not find a free id/slug/token after ${MAX_INSERT_ATTEMPTS} attempts (last error: ${lastError})`,
    )
  }

  const truckId = created.id as string

  // ── Van ────────────────────────────────────────────────────────────────────────────────────────────
  // Default-on, because a truck without a van is not "working": upsert_event only writes slot_capacity
  // when the event's van carries kitchen_capacity, so a vanless truck has an inert capacity engine (the
  // exact gap recorded for Gusto in the reference manual).
  let van: ProvisionResult['van'] = null

  if (opts.van !== false) {
    const vanOpts = opts.van ?? {}
    const { data: vanRow, error: vanError } = await supabase
      .from('truck_vans')
      .insert({
        truck_id: truckId,
        name: vanOpts.name?.trim() || 'Van 1',       // NOT NULL, no default
        active: true,
        // Nullable with NO default — but leaving it null makes the capacity engine inert, so always set.
        kitchen_capacity: vanOpts.kitchen_capacity ?? 5,
        // capacity_window_mins omitted deliberately — NOT NULL DEFAULT 5 is exactly what we want.
        ...(vanOpts.capacity_window_mins !== undefined
          ? { capacity_window_mins: vanOpts.capacity_window_mins }
          : {}),
        // kds_token omitted deliberately — DB default encode(gen_random_bytes(24),'hex').
      })
      .select('id, name, kds_token')
      .single()

    if (vanError || !vanRow) {
      // ── COMPENSATING DELETE ──────────────────────────────────────────────────────────────────────
      // Not transactional: the van needs truck_id, so the truck must commit first and a partial state is
      // possible by construction. Roll the truck back rather than leaving a vanless husk. commit-menu is
      // the cautionary precedent — its partial inserts hurt precisely because nothing surfaces them, so
      // this fails LOUDLY AND COMPLETELY instead of half-succeeding quietly.
      try {
        await deleteTruckCascade(supabase, truckId)
      } catch (cleanupErr) {
        // The compensation itself failed (e.g. connection dropped between the two calls) → a real orphan
        // exists. Greppable tag + id so it can be swept; the Phase-3 cleanup job's rule (a demo- truck with
        // no van and no menu is an orphan) covers the demo case automatically.
        console.error(
          `[provision-truck] PROVISION_ORPHAN_TRUCK truck_id=${truckId} — van insert failed AND the ` +
          `compensating delete failed. Manual cleanup required.`,
          cleanupErr,
        )
        throw new ProvisionError(
          'van_failed',
          `Van creation failed (${vanError?.message ?? 'unknown'}) and rollback failed — truck ${truckId} is orphaned.`,
          truckId,
        )
      }
      throw new ProvisionError('van_failed', `Van creation failed, truck rolled back: ${vanError?.message ?? 'unknown'}`)
    }

    van = { id: vanRow.id as string, name: vanRow.name as string, kds_token: (vanRow.kds_token as string) ?? null }
  } else {
    warnings.push('No van created — slot_capacity will not be written for this truck’s events and the capacity engine stays inert.')
  }

  return {
    truck: created as unknown as ProvisionResult['truck'],
    van,
    warnings,
  }
}
