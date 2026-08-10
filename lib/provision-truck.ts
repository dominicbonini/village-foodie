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
import { DEMO_PREFIX } from '@/lib/demo'

// ── Reserved prefix ──────────────────────────────────────────────────────────────────────────────────
// proxy.ts grants `/dashboard/demo-*` an exception from the session gate, so for a demo the TOKEN ALONE is
// the security boundary. That makes `demo-` load-bearing: a REAL operator truck whose token began `demo-`
// would silently lose its session gate. It is reachable by accident — a truck named "Demo Kitchen" slugs
// to `demo-kitchen`, and the operator token convention is `<slug-base>-<hex>`. So this is asserted before
// every insert (assertReservedPrefix), not left to convention.
// The constant itself lives in lib/demo.ts (a leaf module) so hot request paths can test the prefix without
// importing this module's dependency graph. Re-exported here for callers already reaching for it.
export { DEMO_PREFIX } from '@/lib/demo'

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
  /** FIX 9 — demo defaults auto-accept ON so a visitor's first test order confirms itself and lands on the
   *  board immediately. A prospect who places an order and sees it sit unactioned reads that as broken. */
  autoAccept: boolean
  /** Master pre-orders switch. REQUIRED on the type, not optional, so adding a profile forces the
   *  decision — this column was previously written by nobody and a new truck simply inherited the DB
   *  default, which is how a brand-new operator found pre-orders and a pre-order deadline already ON
   *  before they had a menu.
   *
   *  🔴 THE DB DEFAULT IS NOT CHANGING. `trucks.preorders_enabled` stays `not null default true`
   *  (20260622_truck_preorders_enabled.sql): that default carries BACKFILL meaning for trucks that
   *  predate the column, and every read gates on `!== false`, so flipping it would silently switch
   *  pre-orders off for existing trucks. This writes an explicit value at PROVISION time only. */
  preordersEnabled: boolean
  /** G3 — `truck_vans.buzzer_count`: the buzzer POOL, per van. null = this van hands out no buzzers and
   *  the whole feature is hidden; 1..30 = numbered 1..n. REQUIRED on the type, not optional, for the same
   *  reason preordersEnabled is: a new profile must state its answer rather than inherit a silence.
   *
   *  ⚠️ THIS IS THE POOL, NOT THE PROMPT. The prompt is `truck_events.buzzer_prompt` and it is NOT here
   *  and CANNOT be — provisionTruck writes `trucks` and `truck_vans` and creates no event, so there is no
   *  row to carry it at this point in the sequence. It is set where the demo's event is actually inserted
   *  (lib/provision-demo-event.ts). See the note there; the two must be read together, because
   *  resolveBuzzerPrompt (lib/buzzer.ts) treats a NULL prompt as ON whenever a pool exists — so setting a
   *  count here without setting the prompt there would TURN THE PROMPT ON for demos, the exact opposite
   *  of what is wanted. */
  buzzerCount: number | null
  /** P4b — `trucks.notes_require_review`: hold an auto-accepting order that carries a customer note
   *  (an allergy, usually) for a human instead of confirming it. Its DB default is already `true`
   *  (NOT NULL DEFAULT true, live-verified), so declaring it here changes no VALUE — it converts an
   *  inherited default into a decision this file owns. That matters because the default is invisible:
   *  nothing in the product records that anyone chose it, and a DB-level change would silently move
   *  every future truck. Written explicitly for the same reason preordersEnabled is. */
  notesRequireReview: boolean
  /** P5a — `trucks.show_paid_step`: splits "Paid & collected" into "Mark paid" then "Collected" on the
   *  OPERATOR's order card, so money can be taken before the food is handed over. Truck default with a
   *  per-event override (lib/payments/paid-step.ts). NOT customer-facing. */
  showPaidStep: boolean
  /** P5b — `trucks.takes_cash`: splits the operator's payment button into "Cash" and "Card" so takings
   *  reconcile against the till. ⚠️ INERT UNLESS showPaidStep IS ON — OrderCard returns
   *  `Paid & collected` before the takesCash branch is reached. Also NOT customer-facing; see the
   *  report's P0(a). */
  takesCash: boolean
  /** P5c — `trucks.completion_presses`: does completing an UNPAID order take one press
   *  ("Mark paid and collected", firing the existing 'collected' action) or two ("Mark paid" then
   *  "Collected")? Truck-level, NO per-event override. It also decides what `undo_collected` reverses.
   *  ⚠️ INDEPENDENT OF showPaidStep, which owns the Add Order panel. Declared here rather than left to
   *  the column default for the same reason every other field on this type is: a default is invisible,
   *  and nothing in the product would record that anyone chose it. */
  completionPresses: 'one' | 'two'
}

const PROVISION_PROFILES: Record<ProvisionKind, ProvisionProfile> = {
  // Readable ids stay valuable for real trucks: trucks.id is the STORAGE PATH PREFIX (get_upload_url
  // builds `${truck.id}/…`), and it's what you read in the admin console and in logs.
  operator: {
    identity: 'readable',
    // ── Y1: 'trial', NOT 'demo' (4 August 2026) ──────────────────────────────────────────────────
    // 🔴 THE COMMENT THIS REPLACES SAID: "pre-trial setup mode — NOT 'trial'. canAccess() returns
    // false for EVERY feature when plan==='trial' && trial_expires_at is null." That was TRUE when
    // written and is the reason 'demo' was chosen; canAccess has since been changed so a NULL expiry
    // means NOT STARTED and grants the trial feature set (lib/features.ts). The workaround is no
    // longer needed, and 'demo' cost more than it saved — it is a prospect-sandbox value, so a
    // signed-up operator sat on a plan the Billing tab has no branch for and rendered EMPTY
    // (docs/billing-tab-report.md).
    // ⚠️ ACCESS IS UNCHANGED BY THIS SWITCH. PLAN_FEATURES.demo is `new Set(TRIAL_FEATURES)` — the
    // same set 'trial' grants — so a self-serve operator can do exactly what they could before.
    // ⚠️ THE DEMO PROFILE BELOW STAYS ON 'demo'. A prospect's throwaway truck is not a signup.
    plan: 'trial',
    nameRequired: true,
    truckOrderEmailEnabled: true,
    allergenDisplayMode: null,    // operator chooses in the wizard
    // P4a — ON. 🔴 THIS REVERSES THE PREVIOUS DECISION ("an operator decides this deliberately"), and
    // the reversal is the point: off meant a brand-new operator's very first order sat unconfirmed
    // until they found the dashboard, which reads as the product being broken rather than as a setting
    // awaiting their attention. The two guards that make it safe are already in place and unchanged —
    // a full slot is never auto-confirmed, and notesRequireReview below holds anything carrying a
    // customer note. It is also the first row on the end-of-wizard review screen, so it is a decision
    // they are shown and can reverse in one tap, not one made silently on their behalf.
    autoAccept: true,
    // OFF at creation. Pre-orders are a decision about how they trade, and a truck with no menu and no
    // event cannot take one — showing the deadline section already switched on before there is anything
    // to pre-order presents a configured feature as a fait accompli. Settings is where it goes on.
    preordersEnabled: false,
    // 🔴 UNCHANGED BY G3 — null, exactly as before. A real operator decides whether their van carries
    // buzzers at all, in Manage → van settings. Provisioning must not answer that for them.
    buzzerCount: null,
    // P4b — ON. Same value as the DB default; now an explicit decision. This is what makes P4a's
    // auto-accept safe: an order with an allergy note still stops for a human.
    notesRequireReview: true,
    // P5a — ON. A real change (DB default is false). Taking money is a separate moment from handing
    // food over for most trucks, and an operator who does not need the split turns it off in Settings;
    // an operator who DOES need it would otherwise have no way to record payment before collection.
    showPaidStep: true,
    // P5b — OFF, matching the DB default, now explicit. See the report's P0(a): this is an OPERATOR
    // button-layout setting, not a customer payment method, so off is a neutral default and not a dead
    // end. Turning it on for a truck that has not asked would put a Cash/Card choice in front of every
    // order they take.
    takesCash: false,
    // P5c — TWO, matching this profile's showPaidStep: true, so a truck provisioned today behaves
    // exactly as one provisioned yesterday. 🔴 NOT DERIVED FROM showPaidStep AT RUNTIME — the two are
    // independent settings and this is a separate decision that merely happens to agree with it now.
    // The migration backfills existing trucks by the same rule, so new and old trucks match.
    completionPresses: 'two',
  },
  demo: {
    identity: 'random',
    plan: 'demo',
    nameRequired: false,
    truckOrderEmailEnabled: false, // defaults true → every demo order would email the truck's contact
    // NEVER 'per_dish' for a demo: import commits every item allergens_verified=false, and the per-dish
    // customer-menu gate HIDES unverified items → the demo would render an EMPTY MENU.
    allergenDisplayMode: 'card',
    autoAccept: true,
    // OFF for a demo too: the demo's whole story is a walk-up order placed and served in one loop, and a
    // pre-order deadline has nothing to act on in it.
    preordersEnabled: false,
    // G3 — a demo ships with a rack of 10, so the buzzer feature is CONFIGURED and explorable rather
    // than hidden behind a setting a prospect has to find first. 10 is BUZZER_DEFAULT_COUNT
    // (lib/buzzer.ts) — the same number Manage offers an operator when they first switch buzzers on, so
    // the demo shows what a normal truck looks like, not a special case.
    buzzerCount: 10,
    // 🔴 ALL THREE MATCH TODAY'S DB DEFAULTS, SO THE DEMO IS BEHAVIOURALLY UNCHANGED. They are declared
    // only because the type now requires them — which is the whole point of the required-field pattern:
    // the compiler made this an explicit "no change" rather than letting the demo drift silently the
    // next time a default moves. A demo's story is one walk-up order placed and served in a single
    // loop, so a split payment step and a Cash/Card choice would both be scenery a prospect has to get
    // past rather than product they came to see.
    notesRequireReview: true,
    showPaidStep: false,
    takesCash: false,
    // P5c — ONE press, matching this profile's showPaidStep: false, so the demo's story stays a single
    // walk-up order placed and served in one loop. A second completion tap would be scenery.
    completionPresses: 'one',
  },
}

// ── Public types ─────────────────────────────────────────────────────────────────────────────────────
export interface ProvisionVanOptions {
  name?: string                   // default 'Van 1' — NOT NULL, no DB default
  /** Default 5. Pass an EXPLICIT null to leave it unset — a demo does that deliberately so the per-category
   *  batch is the only ceiling (see lib/provision-demo). Omitting the key still gets the default. */
  kitchen_capacity?: number | null
  capacity_window_mins?: number   // omit → DB default 5 (NOT NULL, CHECK 1–20)
}

export interface ProvisionTruckOptions {
  kind: ProvisionKind
  name?: string
  slug?: string
  plan?: Plan
  visibility?: 'hidden' | 'public'
  contactEmail?: string | null
  // ── P2/P3: CONTACT DETAILS ARE PER-SIGNUP INPUTS, NOT PROFILE CONSTANTS ─────────────────────────
  // 🔴 DELIBERATELY OPTIONS AND NOT ProvisionProfile FIELDS, unlike everything else in this change.
  // The required-profile-field pattern exists so a fixed POLICY cannot be forgotten by a new profile.
  // A phone number is not a policy — it is data typed by one person at one moment, so there is no
  // value either profile could sensibly declare, and putting it on the type would force the demo
  // profile to invent a phone number for a truck that has no operator to own one. Contact details
  // therefore ride with `contactEmail`, which is already an option for exactly this reason.
  // The demo passes neither, so a demo truck's contact fields stay empty exactly as they are today.
  /** P2 — written to BOTH `contact_phone` and `whatsapp`. One number, two columns, by design. */
  contactPhone?: string | null
  /** P3 — the wizard's "This number is on WhatsApp" tick. Decides preferred_contact_method. */
  phoneIsWhatsapp?: boolean
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
  // P2/P3 — normalised once, here, so the insert reads plainly and an empty string can never be
  // mistaken for a number. Empty/whitespace ⇒ null ⇒ no phone, no whatsapp, no preferred method.
  const contactPhone = (opts.contactPhone ?? '').trim() || null
  const phoneIsWhatsapp = opts.phoneIsWhatsapp === true

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
        // 🔴 STAYS NULL, and now MEANS something: "trial not started". Nomination — the operator
        // choosing which event starts it — is what sets a date, and does not exist yet. canAccess
        // reads NULL as not-started and grants the trial set; a PAST date still denies.
        trial_expires_at: null,   // nomination sets this (§8)
        operator_id: null,        // set afterwards by /api/admin/create-operator — a separate concern
        contact_email: opts.contactEmail ?? null,
        // ── P2/P3: THE CONTACT BLOCK ────────────────────────────────────────────────────────────
        // P2 — the SAME number into both columns. `contact_phone` is the customer-facing contact
        // number; `trucks.whatsapp` is the customer-facing WhatsApp number. (Neither is
        // `whatsapp_sender`, which is the WhatsApp Business API sender under Auto-replies and is not
        // a contact detail — see the report's P0(b).)
        //
        // ⚠️ `whatsapp` FALLS BACK TO '' AND NEVER TO null. The reference manual records a live 400
        // caused by exactly this: `trucks.whatsapp` was NOT NULL and an untick sent null. The
        // DROP NOT NULL has since been applied (manual §3164), so null would work today — but ''
        // satisfies both shapes and is what `waFromPhone` returns for the cleared case, so this
        // matches the app's own convention rather than depending on a constraint having been dropped.
        contact_phone: contactPhone,
        whatsapp: contactPhone ?? '',
        phone_is_whatsapp: phoneIsWhatsapp,
        // P3 — 'whatsapp' when they ticked it, 'phone' otherwise, and null when there is no number to
        // point at (the demo). Both values are in the set lib/email.ts's contact map renders; see the
        // report's P0(c). A null renders no contact section at all, which is correct for a truck with
        // no contact details rather than a broken one.
        preferred_contact_method: contactPhone ? (phoneIsWhatsapp ? 'whatsapp' : 'phone') : null,
        cuisine_type: opts.cuisineType ?? null,
        truck_order_email_enabled: profile.truckOrderEmailEnabled,
        auto_accept: profile.autoAccept,
        allergen_display_mode: profile.allergenDisplayMode,
        // Written EXPLICITLY. The column's `default true` is a backfill default for pre-existing trucks,
        // not the right answer for a truck being created now — see the note on ProvisionProfile.
        preorders_enabled: profile.preordersEnabled,
        // P4/P5 — all FIVE written explicitly from the profile, never inherited. notes_require_review
        // and takes_cash happen to match their DB defaults today; that is a fact about the database
        // right now, not a contract, and this is what stops a default change moving new trucks.
        notes_require_review: profile.notesRequireReview,
        show_paid_step: profile.showPaidStep,
        takes_cash: profile.takesCash,
        // P5c — the operator profile writes 'two' here, which is NOT the column default ('one'). A truck
        // created before the migration is applied would carry no value at all, and the resolver's
        // show_paid_step fallback covers that; once applied, this is what makes the decision explicit.
        completion_presses: profile.completionPresses,
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
        // `?? 5` would coerce an intentional null back to 5, so distinguish "omitted" from "explicitly
        // null": omitted → 5 (a real truck wants a ceiling), explicit null → null (demo: batch-only).
        kitchen_capacity: 'kitchen_capacity' in vanOpts ? vanOpts.kitchen_capacity : 5,
        // capacity_window_mins omitted deliberately — NOT NULL DEFAULT 5 is exactly what we want.
        ...(vanOpts.capacity_window_mins !== undefined
          ? { capacity_window_mins: vanOpts.capacity_window_mins }
          : {}),
        // kds_token omitted deliberately — DB default encode(gen_random_bytes(24),'hex').
        // G3 — the buzzer POOL, from the profile (demo 10, operator null). Written unconditionally: the
        // column is nullable with no default, so an explicit null is identical to the omission it
        // replaces and the operator path is byte-for-byte what it was.
        buzzer_count: profile.buzzerCount,
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
