// app/api/manage/route.ts
// Truck management API — handles all CRUD for menu, modifiers, deals, events, settings
// Authenticated via dashboard token + PIN (same as orders dashboard)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveTruckLogo } from '@/lib/truck-logo'
import { HATCHGRAB_SENDER, HATCHGRAB_LOGO_URL } from '@/lib/email-config'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { generateSlots } from '@/lib/slots'   // EXTRACTED from this file — now shared with the demo provisioner
import { getSoleActiveVanId, getVanOrderReadyDefault } from '@/lib/van-utils'
import { hasValidEventTimes, getLocalDateInTz } from '@/lib/time-utils'
import { canAccess } from '@/lib/features'
import { logAllergenChanges, diffItemAllergens, tagJson, arrEq, type Actor } from '@/lib/allergen-audit'
import { isDemoIdentifier, DEMO_PREFIX } from '@/lib/demo'
import { normaliseUrl } from '@/lib/url-normalise'
import { checkSubdomain, suggestFromWebsite } from '@/lib/custom-domain/apex'
import { checkCaa, detectDnsProvider, checkApexViaSoa } from '@/lib/custom-domain/dns'
import { addDomain, getDomainConfig, releaseDomain } from '@/lib/custom-domain/vercel'
import { recordRows, instructionsEmail as domainInstructionsEmail } from '@/lib/custom-domain/copy'
import { domainPreflightRatelimit, domainInstructionsRatelimit } from '@/lib/ratelimit'
import { logAction } from '@/lib/audit/actionAudit'
import { pseudonymiseEmail } from '@/lib/audit/pseudonymise'
import { resolveActorSource } from '@/lib/audit/actor'

// ── DETECTION BUDGETS (Stage 2b) ────────────────────────────────────────────────────────────────
// 🔴 SIX SECONDS, AND THE NUMBER IS CHOSEN FROM THE OPERATOR'S SIDE, NOT THE SERVER'S. This runs
// while a person watches a spinner having just typed their own web address. Past about six seconds
// they conclude it is broken — and because detection is ADVISORY, waiting longer buys a pre-selected
// radio button and nothing more. A slow site simply lands on the picker with nothing selected, which
// is the same screen, one click further from done. Vercel would allow far longer; the operator will not.
const DETECT_TIMEOUT_MS = 6_000
// Fingerprints are in the served shell, so 256KB is generous. The cap exists so a server that never
// stops sending cannot make us hold what it sends.
const DETECT_BODY_CAP_BYTES = 256 * 1024

// ── 🔴 WHAT AN OPERATOR IS TOLD WHEN THE ADDRESS COULD NOT BE ADDED. ─────────────────────────────
// One entry per `reason` from lib/custom-domain/vercel.ts, and NOTHING ELSE is ever sent. See the
// comment at the `addDomain` call site for why this is a map and not a passed-through message.
// ⚠️ "Nothing has changed at your end" is on the two that are OUR fault, and it is the whole point of
// them: an operator who has just watched a setup fail will otherwise go looking at their own web
// address for damage that is not there.
const PROVISION_FAILED: Record<'taken' | 'not_configured' | 'refused' | 'error', string> = {
  not_configured: 'Something is not set up on our side, so we could not add your address. Nothing has changed at your end. Try again shortly.',
  taken: 'That address is already in use somewhere else.',
  refused: 'We were not allowed to add that address.',
  error: 'We could not add that address just now. Nothing has changed at your end. Try again shortly.',
}
import { sendConfirmationEmail } from '@/lib/email'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ══ 🔴 DENY BY DEFAULT. THE TOKEN SAYS WHICH TRUCK; THE SESSION SAYS WHO. ═════════════════════════
// This route used to initialise the caller's role to 'owner' and only NARROW it when a session
// resolved — so NO SESSION MEANT OWNER, and possession of a dashboard_token was full authority over
// somebody's business. The three-role system below (24 staff-blocked actions) was fully built and
// simply never ran for the unauthenticated case, because `'staff'` was unreachable without a session.
//
// The inversion is the whole fix: no resolved caller ⇒ no access. Nothing new is built — the operators
// and truck_users lookups below are the ones that were already here, moved from "narrow the default" to
// "grant the access".
//
// ⚠️ TWO CREDENTIALS, ONE ANSWER. Web sends a cookie session (@supabase/ssr). The NATIVE app has no
// cookie — its session lives in @capacitor/preferences — and sends a Bearer JWT instead. Reading only
// the cookie is what made the native app depend on the 'owner' default, so both are read here or the
// inversion would sign every native operator out of Manage.

/** Native app: `Authorization: Bearer <access_token>`. Same shape as /api/native/my-trucks. */
async function userIdFromBearer(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!jwt) return null
  try {
    const { data } = await supabase.auth.getUser(jwt)
    return data.user?.id ?? null
  } catch { return null }
}

/** Cookie session (web) first, then the native Bearer. Null = no caller could be established. */
async function resolveCallerId(req: NextRequest): Promise<string | null> {
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (user) return user.id
  } catch { /* no cookie / transient auth fault — fall through to the Bearer */ }
  return userIdFromBearer(req)
}

type TruckAccess =
  | { ok: true; role: 'owner' | 'manager' | 'staff'; userId: string | null; operatorId: string | null; via: 'demo' | 'admin' | 'owner' | 'member' }
  | { ok: false; status: 401 | 403; error: string }

/**
 * 🔴 THE ONE PLACE ACCESS IS DECIDED, for both GET and POST.
 *
 * 🔴 THE DEMO CARVE-OUT IS KEYED ON THE TRUCK ID PREFIX, NOT ON `operator_id IS NULL`.
 * A demo truck has no owner BY CONSTRUCTION — lib/provision-truck.ts writes `operator_id: null`, and a
 * prospect works one with no account at all, so there is no session to resolve and never will be.
 * ⚠️ THE `operator_id IS NULL` SHAPE WAS REJECTED DELIBERATELY: it would silently re-open this hole for
 * any REAL truck that ends up unowned — and an unowned real truck is the normal state immediately after
 * provisioning, before /api/admin/create-operator runs. A rule that grants owner to "whoever asks" the
 * moment a column is null is the same defect wearing a different condition.
 * The prefix rule is the one lib/demo.ts defines and the demo-cleanup cron already enforces before it
 * will delete anything (`isDemoIdentifier` → `startsWith('demo-')`), and assertReservedPrefix() in
 * provision-truck guarantees no operator truck can ever carry it. Same rule, same source, three places.
 */
async function resolveTruckAccess(req: NextRequest, truck: { id: string; operator_id: string | null }): Promise<TruckAccess> {
  // ── The carve-out. Narrow, explicit, and first so the reasoning is impossible to miss.
  if (isDemoIdentifier(truck.id)) {
    return { ok: true, role: 'owner', userId: null, operatorId: null, via: 'demo' }
  }

  const userId = await resolveCallerId(req)
  // 🔴 THE INVERSION. No caller ⇒ no access. This is the line the whole workstream exists to add.
  if (!userId) {
    return { ok: false, status: 401, error: 'Sign in required' }
  }

  const { data: op } = await supabase
    .from('operators').select('id, is_admin').eq('auth_user_id', userId).maybeSingle()

  // Platform admin — the same bypass /api/native/my-trucks grants, kept consistent.
  if (op?.is_admin) return { ok: true, role: 'owner', userId, operatorId: op.id, via: 'admin' }

  // Owner of THIS truck. ⚠️ `truck.operator_id &&` matters: without it, two nulls compare equal and
  // every unowned truck would hand ownership to any operator who asked.
  if (op && truck.operator_id && op.id === truck.operator_id) {
    return { ok: true, role: 'owner', userId, operatorId: op.id, via: 'owner' }
  }

  // Crew member on THIS truck. The role stored here is what the 24-action gate below reads.
  const { data: truckUser } = await supabase
    .from('truck_users').select('role').eq('auth_user_id', userId).eq('truck_id', truck.id).maybeSingle()
  if (truckUser?.role) {
    return { ok: true, role: truckUser.role as 'owner' | 'manager' | 'staff', userId, operatorId: op?.id ?? null, via: 'member' }
  }

  // 🔴 AUTHENTICATED, BUT NOT ON THIS TRUCK. A token is not a grant.
  return { ok: false, status: 403, error: 'You do not have access to this truck' }
}

// ── Auth helper ───────────────────────────────────────────────
async function getTruck(token: string) {
  const { data } = await supabase
    .from('trucks')
    .select('*')
    .eq('dashboard_token', token)
    .single()
  return data
}

// ── GET — fetch all management data ──────────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })

  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // 🔴 DENY BY DEFAULT. Was: `let userRole = 'owner'` narrowed only on a resolved session, so no
  // session meant owner. Now the role is GRANTED by resolveTruckAccess or the request is refused.
  const access = await resolveTruckAccess(req, truck)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const userRole = access.role
  const currentUserId = access.userId
  // The AUTHED session operator (account scope) — used to scope account-level data (pending email
  // change) to the logged-in user, NOT the truck's operator_id (which can pool multiple trucks).
  const currentOperatorId = access.operatorId

  const [
    { data: categories },
    { data: items },
    { data: subcategories },
    { data: modifierGroups },
    { data: modifierOptions },
    { data: categoryModGroups },
    { data: itemModGroups },
    { data: bundles },
    { data: codes },
    { data: events },
    { data: upsellRules },
  ] = await Promise.all([
    supabase.from('menu_categories').select('*').eq('truck_id', truck.id).eq('is_active', true).order('sort_order'),
    supabase.from('menu_items_db').select('*').eq('truck_id', truck.id).eq('is_active', true).order('sort_order'),
    supabase.from('menu_subcategories').select('id, category_id, name, sort_order').eq('truck_id', truck.id).eq('is_active', true).order('sort_order'),
    supabase.from('modifier_groups').select('*').eq('truck_id', truck.id),
    supabase.from('modifier_options').select('*').in('group_id',
      (await supabase.from('modifier_groups').select('id').eq('truck_id', truck.id)).data?.map(g => g.id) || []
    ).order('sort_order'),
    supabase.from('category_modifier_groups').select('*'),
    // Stage B: per-item links so the dish-picker (Part 2) + item editor reverse-view (Part 4) can
    // render current state. Scoped to THIS truck's groups (cross-truck links can't exist anyway).
    supabase.from('item_modifier_groups').select('menu_item_id, group_id, excluded_option_ids').in('group_id',
      (await supabase.from('modifier_groups').select('id').eq('truck_id', truck.id)).data?.map(g => g.id) || []
    ),
    supabase.from('bundles_db').select('*').eq('truck_id', truck.id).order('sort_order'),
    supabase.from('discount_codes_db').select('*').eq('truck_id', truck.id),
    supabase.from('truck_events').select('*').eq('truck_id', truck.id)
      .gte('event_date', new Date().toISOString().split('T')[0])
      .order('event_date'),
    // Upsell rules — folded into the initial parallel load (was a SEPARATE deferred get_upsell_rules POST
    // that fired on tab-open, so the Upsells section lagged ~2s behind the instant Custom-Extras/Deals).
    supabase.from('upsell_rules').select('*').eq('truck_id', truck.id).order('created_at', { ascending: true }),
  ])

  // Stock check: mark bundles where any slot category has no available items
  const slotKeys = ['slot_1_category', 'slot_2_category', 'slot_3_category', 'slot_4_category', 'slot_5_category', 'slot_6_category'] as const
  const stockCheckedBundles = (bundles || []).map(b => {
    const slotCategories = slotKeys.map(k => (b as any)[k]).filter(Boolean) as string[]
    if (slotCategories.length === 0) return { ...b, stock_warning: null }
    const unavailableSlot = slotCategories.find(slug => {
      const cat = (categories || []).find((c: any) => c.slug === slug || c.name?.toLowerCase() === slug?.toLowerCase())
      if (!cat) return false
      const catItems = (items || []).filter((i: any) => i.category_id === cat.id)
      return !catItems.some((i: any) => i.is_available && (i.stock_count === null || i.stock_count > 0))
    })
    return { ...b, stock_warning: unavailableSlot ? `No available items in "${unavailableSlot}"` : null }
  })

  // SECURITY: never return another truck's dashboard_token (an auth credential) to the client.
  // Only id + name (non-sensitive) — and even those are unused by the operator console now that the
  // multi-truck Schedule picker is removed (single-truck console). Kept minimal for back-compat.
  const { data: operatorTrucks } = truck.operator_id
    ? await supabase
        .from('trucks')
        .select('id, name')
        .eq('operator_id', truck.operator_id)
        .eq('active', true)
        .order('name')
    : { data: [] }

  // Owner identity for the Team page owner row — the truck's ACTUAL operator (trucks.operator_id),
  // resolved to email + auth_user_id so the client renders the REAL owner and only badges "(you)"
  // when the viewer IS the owner (not just any admin viewing). Null when the truck is unclaimed.
  const { data: ownerOperator } = truck.operator_id
    ? await supabase
        .from('operators')
        .select('email, auth_user_id')
        .eq('id', truck.operator_id)
        .maybeSingle()
    : { data: null }

  // SECURITY: scope to the AUTHED operator (account-level), NOT truck.operator_id — a shared/pooled
  // operator_id must not surface another context's pending email change in this truck's console.
  // Logged-out (token-only) access ⇒ no session operator ⇒ no banner (email-change requires login).
  const { data: pendingEmailChange } = currentOperatorId
    ? await supabase
        .from('operator_email_changes')
        .select('id, new_email, requested_at, expires_at')
        .eq('operator_id', currentOperatorId)
        .is('verified_at', null)
        .gte('expires_at', new Date().toISOString())
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  // Header logo: operator upload → Village Foodie discovery fallback (shared resolver, Section 14/27).
  // `logo_storage_path` stays raw on the truck for the Settings upload card (the operator's OWN logo);
  // `logo` is the resolved DISPLAY url the header uses, so it matches the dashboard + customer surfaces.
  const logo = await resolveTruckLogo(supabase, truck.id, truck.logo_storage_path)

  return NextResponse.json({
    truck: { ...truck, logo },
    categories: categories || [],
    items: items || [],
    subcategories: subcategories || [],
    modifierGroups: modifierGroups || [],
    modifierOptions: modifierOptions || [],
    categoryModGroups: categoryModGroups || [],
    itemModGroups: itemModGroups || [],
    bundles: stockCheckedBundles,
    codes: codes || [],
    events: events || [],
    upsellRules: upsellRules || [],
    userRole,
    currentUserId,
    ownerEmail: ownerOperator?.email ?? null,
    ownerAuthUserId: ownerOperator?.auth_user_id ?? null,
    operatorTrucks: operatorTrucks || [],
    pendingEmailChange: pendingEmailChange || null,
  })
}

// ── POST — all mutations ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, action } = body
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })

  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // ── 🔴 DENY BY DEFAULT. Was: `let requestingUserRole = 'owner'` narrowed only on a resolved
  // session. Every write below — including the 24 staff-blocked actions — now runs behind a caller
  // this route has actually established.
  const access = await resolveTruckAccess(req, truck)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const requestingUserRole = access.role
  const requestingUserId = access.userId

  // ── Allergen-write gate (B) + audit identity (A) ─────────────────────────────────────
  // Allergen/dietary/card writes are owner/admin-only. Resolve operators.is_admin for the session user.
  // ⛔ THE "KNOWN-WEAK" NOTE THAT STOOD HERE IS STRUCK — token-only access no longer resolves to
  // 'owner'; resolveTruckAccess refuses it outright, so this gate is now reachable only by a caller
  // this route established. ⚠️ `auth_method` IS KEPT AND IS STILL HONEST: it now reads 'token' only for
  // the demo carve-out, which is the one path with no user id — so the audit trail continues to name
  // exactly which rows were written without an authenticated person behind them.
  let requestingIsAdmin = false
  if (requestingUserId) {
    const { data: op } = await supabase.from('operators').select('is_admin').eq('auth_user_id', requestingUserId).maybeSingle()
    requestingIsAdmin = op?.is_admin === true
  }
  const authMethod: 'token' | 'authenticated' = requestingUserId ? 'authenticated' : 'token'
  const canEditAllergens = requestingUserRole === 'owner' || requestingIsAdmin
  const actor: Actor = { actor_user_id: requestingUserId, actor_role: requestingUserRole, auth_method: authMethod }
  const ALLERGEN_FORBIDDEN = NextResponse.json({ error: 'Only the owner can change allergen information' }, { status: 403 })

  // Staff gate for all write actions except update_member (staff can edit themselves)
  const staffBlockedActions = [
    'upsert_event', 'upsert_item', 'upsert_category', 'delete_item', 'delete_category', 'bulk_delete_items',
    'upsert_subcategory', 'delete_subcategory',
    'update_truck', 'update_settings', 'add_van', 'rename_van', 'delete_van',
    'invite_team_member', 'remove_team_member', 'upsert_bundle', 'delete_bundle',
    'upsert_modifier_group', 'delete_modifier_group', 'upsert_modifier_option', 'delete_modifier_option',
    'set_item_modifier_group', 'set_item_modifier_groups_bulk', 'set_item_group_excluded_options', 'set_item_preorder_bulk',
    'upsert_upsell_rule', 'delete_upsell_rule',
    // Website-embed Stage 2. Both put a truck's schedule on a public page or send mail on the
    // truck's behalf; neither is a service-time action, so they sit with the other owner/manager
    // writes. `get_embed_status` is a READ and is deliberately absent — see the wizard's own note.
    'save_embed_setup',
    // Custom domain (Stage 5). `domain_provision` attaches a domain to the hosting project — a side
    // effect OUTSIDE this database — and `domain_send_instructions` sends mail on the truck's behalf.
    // `domain_preflight` and `domain_status` are reads and are deliberately absent.
    'domain_provision', 'domain_send_instructions', 'domain_confirm', 'domain_turn_off',
  ]
  if (staffBlockedActions.includes(action) && requestingUserRole === 'staff') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // ── 🔴 THE FOUR CUSTOM-DOMAIN ACTIONS REFUSE A DEMO IDENTITY. ───────────────────────────────────
  // resolveTruckAccess short-circuits to `role: 'owner', userId: null` for any truck whose id starts
  // `demo-`, and a demo truck's dashboard_token is minted by a PUBLIC endpoint and handed to an
  // ANONYMOUS visitor (app/api/demo, 5/hour/IP). That carve-out is load-bearing — the whole demo
  // depends on it — so it is NOT touched. Instead the four actions that must never run without a real
  // person behind them opt OUT of it, HERE, keyed on the action name.
  //
  // 🔴 THE REFUSAL IS AT THE ACTION, NOT AT THE IDENTITY LAYER, AND THE DIFFERENCE IS THE WHOLE POINT.
  // Narrowing resolveTruckAccess would change access for every one of the ~60 actions on this route and
  // for GET as well — a live-surface decision. This list changes access for exactly four.
  //
  // ⚠️ WHY EACH ONE IS ON THE LIST, since "all four for symmetry" would be the wrong reason:
  //   domain_preflight          — drives 3-5 outbound lookups on a caller-named host.
  //   domain_provision          — attaches a domain to the hosting PROJECT: a side effect outside this
  //                               database, and a demo plan passes the feature check.
  //   domain_send_instructions  — sends mail to a caller-supplied address on a shared allowance.
  //   domain_status / _confirm  — read and write only this truck's own row and are harmless on their
  //                               own, but a demo identity has no business in this flow at all, and a
  //                               partial list invites "why is that one different" later.
  //
  // ⚠️ DEFENCE IN DEPTH, NOT THE ONLY GUARD. app/dashboard/[token]/page.tsx:4485 already gates the
  // setup card on `!isDemo`, so no demo dashboard renders it. This closes the API, which is what the
  // audit found reachable.
  // ⚠️ `via` is the ONLY correct test. `!requestingUserId` is true for the same callers today, but it
  // describes a symptom; `via === 'demo'` names the branch that granted access.
  const demoBlockedActions = [
    'domain_preflight', 'domain_status', 'domain_provision', 'domain_confirm', 'domain_send_instructions', 'domain_turn_off',
  ]
  if (demoBlockedActions.includes(action) && access.via === 'demo') {
    return NextResponse.json({ error: 'Not available on a demo truck' }, { status: 403 })
  }

  // ── CATEGORY CRUD ─────────────────────────────────────────
  if (action === 'upsert_category') {
    const { id, name, prep_secs, batch_size, allow_notes, default_stock, sort_order, counts_toward_capacity } = body
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (id) {
      const { data, error } = await supabase.from('menu_categories')
        // Only set counts_toward_capacity when explicitly provided — a partial save (e.g. the
        // modal's notes toggle, which omits it) must NOT reset the flag to false.
        .update({ name, slug, prep_secs, batch_size, allow_notes: !!allow_notes, default_stock: default_stock ?? null, sort_order, ...(counts_toward_capacity !== undefined ? { counts_toward_capacity: !!counts_toward_capacity } : {}) })
        .eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ category: data })
    } else {
      const maxOrder = await supabase.from('menu_categories').select('sort_order').eq('truck_id', truck.id).order('sort_order', { ascending: false }).limit(1)
      const nextOrder = ((maxOrder.data?.[0]?.sort_order || 0) + 1)
      const { data, error } = await supabase.from('menu_categories')
        .insert({ truck_id: truck.id, name, slug, prep_secs: prep_secs ?? 0, batch_size: batch_size ?? 999, allow_notes: !!allow_notes, default_stock: default_stock ?? null, sort_order: sort_order ?? nextOrder, counts_toward_capacity: !!counts_toward_capacity })
        .select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ category: data })
    }
  }

  if (action === 'delete_category') {
    const { id } = body
    await supabase.from('menu_categories').update({ is_active: false }).eq('id', id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  // ── SUB-CATEGORY CRUD (display-only labels; NO capacity/stock/prep) ──────────
  if (action === 'upsert_subcategory') {
    const { id, category_id, name } = body
    const trimmed = (typeof name === 'string' ? name.trim() : '')
    if (!trimmed) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    // Edit existing by id
    if (id) {
      const { data, error } = await supabase.from('menu_subcategories')
        .update({ name: trimmed }).eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ subcategory: data })
    }

    if (!category_id) return NextResponse.json({ error: 'Category required' }, { status: 400 })

    // Dedupe IN-APP (no DB unique): case-insensitive name match within this category+truck.
    // ACTIVE same-name → return it (no dup). SOFT-DELETED same-name → reactivate-and-reuse (mirrors
    // the commit-menu fix — avoids a swallowed collision / orphaned re-add).
    const { data: sameName, error: lookupErr } = await supabase.from('menu_subcategories')
      .select('id, category_id, name, sort_order, is_active')
      .eq('truck_id', truck.id).eq('category_id', category_id).ilike('name', trimmed)
    if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 400 })

    const existing = (sameName || []).find(s => (s.name || '').trim().toLowerCase() === trimmed.toLowerCase())
    if (existing && existing.is_active) {
      return NextResponse.json({ subcategory: existing })
    }
    if (existing && !existing.is_active) {
      const { data, error } = await supabase.from('menu_subcategories')
        .update({ is_active: true, name: trimmed }).eq('id', existing.id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ subcategory: data })
    }

    // No same-name row → insert with next sort_order for this category
    const maxOrder = await supabase.from('menu_subcategories')
      .select('sort_order').eq('truck_id', truck.id).eq('category_id', category_id).eq('is_active', true)
      .order('sort_order', { ascending: false }).limit(1)
    const nextOrder = ((maxOrder.data?.[0]?.sort_order || 0) + 1)
    const { data, error } = await supabase.from('menu_subcategories')
      .insert({ truck_id: truck.id, category_id, name: trimmed, sort_order: nextOrder, is_active: true })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ subcategory: data })
  }

  if (action === 'delete_subcategory') {
    const { id } = body
    // EMPTY-GUARD: refuse to delete a sub-category that still has active items.
    const { count } = await supabase.from('menu_items_db')
      .select('id', { count: 'exact', head: true })
      .eq('truck_id', truck.id).eq('subcategory_id', id).eq('is_active', true)
    if ((count ?? 0) > 0) {
      // Soft guard — 200 so the client reads { error:'not_empty', count } directly (api() throws on non-2xx).
      return NextResponse.json({ ok: false, error: 'not_empty', count: count ?? 0 })
    }
    await supabase.from('menu_subcategories').update({ is_active: false }).eq('id', id).eq('truck_id', truck.id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_subcategory_order') {
    const { id, sort_order } = body
    await supabase.from('menu_subcategories').update({ sort_order }).eq('id', id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'bulk_delete_items') {
    const { category_id } = body
    await supabase
      .from('menu_items_db')
      .update({ is_active: false })
      .eq('category_id', category_id)
      .eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'save_slot_capacity') {
    const { eventDate, startTime, endTime, maxOrdersPerSlot } = body
    if (!maxOrdersPerSlot) {
      await supabase.from('slot_capacity').delete().eq('truck_id', truck.id).eq('event_date', eventDate)
      return NextResponse.json({ ok: true })
    }
    const slots = generateSlots(startTime, endTime, 5)
    const rows = slots.map((slot: string) => ({
      truck_id: truck.id,
      event_date: eventDate,
      slot,
      max_orders: maxOrdersPerSlot,
    }))
    await supabase.from('slot_capacity').upsert(rows, { onConflict: 'truck_id,event_date,slot' })
    return NextResponse.json({ ok: true })
  }

  // ── ITEM CRUD ─────────────────────────────────────────────
  if (action === 'upsert_item') {
    const { id, name, description, price, category_id, subcategory_id, is_available, stock_count, default_stock, sort_order, image_path, allergens, dietary_info, spiciness, auto_accept, preorder_enabled, allergens_verified, _allergenSource } = body
    // Card→dish matcher writes tag the audit as 'card_match' (vs a manual 'edit'). Optional; manual edits omit.
    const allergenChangeType = _allergenSource === 'card' ? ('card_match' as const) : undefined
    // Managed sub-category reference (nullable; null = ungrouped). The legacy text `subcategory`
    // column is the rollback source — no longer WRITTEN here (we write only subcategory_id now).
    const subcatId = (typeof subcategory_id === 'string' && subcategory_id) ? subcategory_id : null
    // PRE-ORDER (V7.8 global-config): per-item stores ONLY `preorder_enabled` (inclusion). The
    // deadline type/value/action live ONCE on the truck row (trucks.preorder_*), read by both effects
    // — never written per-item (single-source). The per-item type/value/action columns remain in the
    // DB but inert (never written/read). enabled `?? null` only when present (partial saves untouched).
    const preorderCols = preorder_enabled === undefined ? {} : { preorder_enabled: preorder_enabled ?? null }
    // §69: only write allergens_verified when present (partial saves untouched). Editing allergens in
    // the modal passes true → clears the "allergens not set" flag.
    const verifiedCol = allergens_verified === undefined ? {} : { allergens_verified: allergens_verified === true }
    if (id) {
      // (A)+(B): diff allergen fields against the stored row → gate non-owner/admin when they CHANGE
      // (a manager editing only price/stock sends unchanged allergens → no diff → allowed), then log.
      const { data: prevItem } = await supabase.from('menu_items_db').select('allergens, dietary_info, allergens_verified').eq('id', id).eq('truck_id', truck.id).single()
      const auditRows = diffItemAllergens({ truckId: truck.id, itemId: id, actor, prev: prevItem, next: { allergens, dietary_info, allergens_verified }, changeTypeOverride: allergenChangeType })
      if (auditRows.length && !canEditAllergens) return ALLERGEN_FORBIDDEN
      const { data, error } = await supabase.from('menu_items_db')
        .update({ name, description, price, category_id, subcategory_id: subcatId, is_available, stock_count, default_stock: default_stock ?? null, sort_order, image_path, allergens, dietary_info, spiciness: spiciness ?? null, auto_accept: auto_accept ?? true, ...preorderCols, ...verifiedCol, updated_at: new Date().toISOString() })
        .eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await logAllergenChanges(supabase, auditRows)
      return NextResponse.json({ item: data })
    } else {
      // New item: gate only when it's created WITH allergen data (empty = a plain item managers can add).
      const auditRows = diffItemAllergens({ truckId: truck.id, itemId: null, actor, prev: null, next: { allergens, dietary_info, allergens_verified } })
      if (auditRows.length && !canEditAllergens) return ALLERGEN_FORBIDDEN
      const maxOrder = await supabase.from('menu_items_db').select('sort_order').eq('truck_id', truck.id).eq('category_id', category_id).order('sort_order', { ascending: false }).limit(1)
      const nextOrder = ((maxOrder.data?.[0]?.sort_order || 0) + 1)
      const { data, error } = await supabase.from('menu_items_db')
        .insert({ truck_id: truck.id, name, description, price, category_id, subcategory_id: subcatId, is_available: is_available ?? true, stock_count: stock_count ?? null, default_stock: default_stock ?? null, sort_order: sort_order ?? nextOrder, image_path, allergens: allergens ?? [], allergens_verified: allergens_verified ?? true, dietary_info: dietary_info ?? [], spiciness: spiciness ?? null, auto_accept: auto_accept ?? true, ...preorderCols })
        .select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await logAllergenChanges(supabase, auditRows.map(r => ({ ...r, item_id: data.id })))
      return NextResponse.json({ item: data })
    }
  }

  if (action === 'delete_item') {
    const { id } = body
    await supabase.from('menu_items_db').update({ is_active: false }).eq('id', id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'toggle_item') {
    const { id, is_available } = body
    await supabase.from('menu_items_db').update({ is_available, updated_at: new Date().toISOString() }).eq('id', id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  // ── MODIFIER GROUP CRUD ───────────────────────────────────
  if (action === 'upsert_modifier_group') {
    const { id, name, is_required, min_choices, max_choices } = body
    if (id) {
      const { data } = await supabase.from('modifier_groups').update({ name, is_required, min_choices, max_choices }).eq('id', id).eq('truck_id', truck.id).select().single()
      return NextResponse.json({ group: data })
    } else {
      const { data, error } = await supabase.from('modifier_groups').insert({ truck_id: truck.id, name, is_required: is_required || false, min_choices: min_choices || 0, max_choices: max_choices || 99 }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ group: data })
    }
  }

  // ── UPSELL RULES ──────────────────────────────────────────────────────────
  if (action === 'upsert_upsell_rule') {
    const { id, trigger_category, suggest_category, max_suggestions, show_at_checkout } = body
    if (!trigger_category || !suggest_category) {
      return NextResponse.json({ error: 'trigger_category and suggest_category required' }, { status: 400 })
    }
    if (id) {
      const { data, error } = await supabase
        .from('upsell_rules')
        .update({ trigger_category, suggest_category, max_suggestions: max_suggestions ?? 3, show_at_checkout: show_at_checkout ?? false })
        .eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ rule: data })
    } else {
      const { data, error } = await supabase
        .from('upsell_rules')
        .insert({ truck_id: truck.id, trigger_category, suggest_category, max_suggestions: max_suggestions ?? 3, show_at_checkout: show_at_checkout ?? false })
        .select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ rule: data })
    }
  }

  if (action === 'delete_upsell_rule') {
    await supabase.from('upsell_rules').delete().eq('id', body.id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'get_upsell_rules') {
    const { data } = await supabase.from('upsell_rules').select('*').eq('truck_id', truck.id).order('created_at', { ascending: true })
    return NextResponse.json({ rules: data || [] })
  }

  if (action === 'delete_modifier_group') {
    await supabase.from('modifier_groups').delete().eq('id', body.id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'upsert_modifier_option') {
    const { id, group_id, name, price_adjustment, type, sort_order, allergens, dietary_info, available, stock_count } = body
    // (A)+(B): option allergens/dietary (modifier_options has NO allergens_verified column). Gate
    // non-owner/admin on a CHANGE; log per changed field (item_id null — these aren't menu items).
    const optAllergenRows = (prevA: string[], prevD: string[]): any[] => {
      const rows: any[] = []
      if (!arrEq(allergens ?? [], prevA)) rows.push({ ...actor, truck_id: truck.id, item_id: null, change_type: 'edit', field: 'allergens', old_value: tagJson(prevA), new_value: tagJson(allergens ?? []) })
      if (!arrEq(dietary_info ?? [], prevD)) rows.push({ ...actor, truck_id: truck.id, item_id: null, change_type: 'edit', field: 'dietary', old_value: tagJson(prevD), new_value: tagJson(dietary_info ?? []) })
      return rows
    }
    if (id) {
      // TRUCK-OWNERSHIP GATE (mirrors set_item_group_excluded_options :525): modifier_options has no
      // truck_id — ownership is via group_id → modifier_groups.truck_id. Fetch the EXISTING option's
      // group and verify it belongs to THIS truck before writing. A foreign option id → not found for
      // this truck → 403, no write. (Closes the cross-truck allergen-write gap from the scoping audit.)
      const { data: prevOpt } = await supabase.from('modifier_options').select('group_id, allergens, dietary_info').eq('id', id).single()
      const { data: ownGrp } = prevOpt?.group_id
        ? await supabase.from('modifier_groups').select('id').eq('id', prevOpt.group_id).eq('truck_id', truck.id).maybeSingle()
        : { data: null }
      if (!ownGrp) return NextResponse.json({ error: 'Option not found for this truck' }, { status: 403 })
      const rows = optAllergenRows(prevOpt?.allergens ?? [], prevOpt?.dietary_info ?? [])
      if (rows.length && !canEditAllergens) return ALLERGEN_FORBIDDEN
      const { data } = await supabase.from('modifier_options').update({ name, price_adjustment, type, sort_order, allergens: allergens ?? [], dietary_info: dietary_info ?? [], available: available ?? true, stock_count: stock_count ?? null }).eq('id', id).select().single()
      await logAllergenChanges(supabase, rows)
      return NextResponse.json({ option: data })
    } else {
      // Verify the SUPPLIED group_id belongs to this truck before inserting (same gate as above).
      const { data: ownGrp } = await supabase.from('modifier_groups').select('id').eq('id', group_id).eq('truck_id', truck.id).maybeSingle()
      if (!ownGrp) return NextResponse.json({ error: 'Group not found for this truck' }, { status: 403 })
      const rows = optAllergenRows([], [])
      if (rows.length && !canEditAllergens) return ALLERGEN_FORBIDDEN
      const { data, error } = await supabase.from('modifier_options').insert({ group_id, name, price_adjustment: price_adjustment || 0, type: type || 'add', sort_order: sort_order || 0, allergens: allergens ?? [], dietary_info: dietary_info ?? [], available: available ?? true, stock_count: stock_count ?? null }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await logAllergenChanges(supabase, rows)
      return NextResponse.json({ option: data })
    }
  }

  if (action === 'delete_modifier_option') {
    // TRUCK-OWNERSHIP GATE (mirrors upsert_modifier_option + set_item_group_excluded_options :537):
    // modifier_options has no truck_id — resolve the option's group → verify it's THIS truck's before
    // deleting. A foreign option id → not found for this truck → 403, no delete.
    const { data: opt } = await supabase.from('modifier_options').select('group_id').eq('id', body.id).single()
    const { data: ownGrp } = opt?.group_id
      ? await supabase.from('modifier_groups').select('id').eq('id', opt.group_id).eq('truck_id', truck.id).maybeSingle()
      : { data: null }
    if (!ownGrp) return NextResponse.json({ error: 'Option not found for this truck' }, { status: 403 })
    await supabase.from('modifier_options').delete().eq('id', body.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'assign_modifier_to_category') {
    const { category_id, group_id } = body
    await supabase.from('category_modifier_groups').upsert({ category_id, group_id })
    return NextResponse.json({ success: true })
  }

  if (action === 'unassign_modifier_from_category') {
    const { category_id, group_id } = body
    await supabase.from('category_modifier_groups').delete().eq('category_id', category_id).eq('group_id', group_id)
    return NextResponse.json({ success: true })
  }

  // ── PER-ITEM modifier-group links (Stage B) ───────────────────────────────
  // item_modifier_groups(menu_item_id, group_id) is the SOLE resolution source. Both writes are
  // token-scoped: the group AND every item must belong to THIS truck or the write is rejected
  // (no cross-truck link writes).
  if (action === 'set_item_modifier_group') {
    const { group_id, menu_item_id, attached } = body
    // Verify the group belongs to this truck.
    const { data: grp } = await supabase.from('modifier_groups').select('id').eq('id', group_id).eq('truck_id', truck.id).maybeSingle()
    if (!grp) return NextResponse.json({ error: 'Group not found for this truck' }, { status: 403 })
    // Verify the item belongs to this truck.
    const { data: itm } = await supabase.from('menu_items_db').select('id').eq('id', menu_item_id).eq('truck_id', truck.id).maybeSingle()
    if (!itm) return NextResponse.json({ error: 'Item not found for this truck' }, { status: 403 })
    if (attached) {
      await supabase.from('item_modifier_groups').upsert({ menu_item_id, group_id }, { onConflict: 'menu_item_id,group_id', ignoreDuplicates: true })
    } else {
      await supabase.from('item_modifier_groups').delete().eq('menu_item_id', menu_item_id).eq('group_id', group_id)
    }
    return NextResponse.json({ success: true })
  }

  if (action === 'set_item_modifier_groups_bulk') {
    const { group_id, menu_item_ids, attached } = body as { group_id: string; menu_item_ids: string[]; attached: boolean }
    const { data: grp } = await supabase.from('modifier_groups').select('id').eq('id', group_id).eq('truck_id', truck.id).maybeSingle()
    if (!grp) return NextResponse.json({ error: 'Group not found for this truck' }, { status: 403 })
    // Restrict to items that genuinely belong to this truck (filters out any spoofed ids).
    const { data: ownItems } = await supabase.from('menu_items_db').select('id').eq('truck_id', truck.id).in('id', menu_item_ids || [])
    const validIds = (ownItems || []).map(i => i.id)
    if (validIds.length === 0) return NextResponse.json({ success: true })
    if (attached) {
      await supabase.from('item_modifier_groups').upsert(validIds.map(menu_item_id => ({ menu_item_id, group_id })), { onConflict: 'menu_item_id,group_id', ignoreDuplicates: true })
    } else {
      await supabase.from('item_modifier_groups').delete().eq('group_id', group_id).in('menu_item_id', validIds)
    }
    return NextResponse.json({ success: true })
  }

  // ── Per-DISH option exclusions (model C, phase 1 persistence) ──────────────
  // Sets item_modifier_groups.excluded_option_ids for ONE (menu_item_id, group_id) link — the options
  // this dish does NOT offer from the shared group. Default '{}' = all offered. Token-scoped like the
  // link writes above: group AND item must belong to THIS truck, and the ids are filtered to options
  // that actually belong to the group (drops spoofed/stale ids → clean data). The phase-2 matrix UI
  // calls this. Upsert so it also creates the link if missing (excluding implies the dish has the group).
  if (action === 'set_item_group_excluded_options') {
    const { group_id, menu_item_id, excluded_option_ids } = body as { group_id: string; menu_item_id: string; excluded_option_ids: string[] }
    const { data: grp } = await supabase.from('modifier_groups').select('id').eq('id', group_id).eq('truck_id', truck.id).maybeSingle()
    if (!grp) return NextResponse.json({ error: 'Group not found for this truck' }, { status: 403 })
    const { data: itm } = await supabase.from('menu_items_db').select('id').eq('id', menu_item_id).eq('truck_id', truck.id).maybeSingle()
    if (!itm) return NextResponse.json({ error: 'Item not found for this truck' }, { status: 403 })
    const { data: groupOpts } = await supabase.from('modifier_options').select('id').eq('group_id', group_id)
    const validOptIds = new Set((groupOpts || []).map(o => o.id))
    const cleaned = Array.from(new Set((excluded_option_ids || []).filter(id => validOptIds.has(id))))
    const { error } = await supabase.from('item_modifier_groups').upsert({ menu_item_id, group_id, excluded_option_ids: cleaned }, { onConflict: 'menu_item_id,group_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  // PRE-ORDER (Stage 5): bulk-apply ONE pre-order config to several items (or clear, when clear=true
  // sets all 4 to null). Mirrors set_item_modifier_groups_bulk: truck-ownership filter on the ids,
  // then a single bulk UPDATE of the 4 menu_items_db columns. Writes only those 4 columns.
  if (action === 'set_item_preorder_bulk') {
    // Server-side plan gate (defense-in-depth): pre-orders is Pro (advance_preordering). The READ
    // effects (menu sold-out / submit force-pending) already gate, so off-plan config is inert — but
    // reject the dedicated bulk WRITE at the source too. (Per-row edits use a 1-element bulk → same gate.)
    if (!canAccess(truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return NextResponse.json({ error: 'Pre-orders requires the Pro plan' }, { status: 403 })
    }
    // SINGLE-SOURCE (V7.8 global-config): this action sets ONLY the per-item inclusion flag
    // (preorder_enabled). The deadline type/value/action live ONCE on the truck row (update_truck) and
    // are read by both effects — never written per-item. clear:true (or enabled false) = excluded.
    const { menu_item_ids, clear, preorder_enabled } =
      body as { menu_item_ids: string[]; clear?: boolean; preorder_enabled?: boolean | null }
    const { data: ownItems } = await supabase.from('menu_items_db').select('id').eq('truck_id', truck.id).in('id', menu_item_ids || [])
    const validIds = (ownItems || []).map(i => i.id)
    if (validIds.length === 0) return NextResponse.json({ success: true })
    const patch = clear ? { preorder_enabled: null } : { preorder_enabled: preorder_enabled ?? null }
    const { error } = await supabase.from('menu_items_db').update(patch).eq('truck_id', truck.id).in('id', validIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, count: validIds.length })
  }

  if (action === 'update_category_order') {
    const { id, sort_order } = body
    await supabase.from('menu_categories').update({ sort_order }).eq('id', id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  // ── BUNDLE CRUD ───────────────────────────────────────────
  if (action === 'upsert_bundle') {
    const { id, stock_warning, ...fields } = body
    delete fields.token; delete fields.action
    if (id) {
      const { data, error } = await supabase.from('bundles_db').update(fields).eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ bundle: data })
    } else {
      const { data, error } = await supabase.from('bundles_db').insert({ ...fields, truck_id: truck.id }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ bundle: data })
    }
  }

  if (action === 'delete_bundle') {
    await supabase.from('bundles_db').delete().eq('id', body.id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  // ── EVENT CRUD ────────────────────────────────────────────
  if (action === 'upsert_event') {
    const { id, venue_name, town, postcode, address, event_date, start_time, end_time, notes, latitude, longitude, van_id } = body
    let savedEvent: Record<string, unknown> | null = null

    // SECURITY (tenant isolation): events are ALWAYS written to the TOKEN's truck. A token-scoped
    // operator console must never write another truck's events — body.truck_id is ignored (the prior
    // operator_id-gated sibling-write branch is removed).
    const targetTruckId = truck.id

    if (id) {
      // LIVE-TIME GATE (edit): a DRAFT (unconfirmed) may keep null times — the operator is editing to add
      // them. But a LIVE event (confirmed/open) must never be left timeless, so block clearing times on one.
      const { data: cur } = await supabase.from('truck_events').select('status').eq('id', id).eq('truck_id', targetTruckId).single()
      const isLive = cur?.status === 'confirmed' || cur?.status === 'open'
      if (isLive && !hasValidEventTimes(start_time, end_time)) {
        return NextResponse.json({ error: 'A live event needs a start and end time — add them before saving.' }, { status: 400 })
      }
      const { data, error } = await supabase.from('truck_events').update({ venue_name, town: town ?? null, postcode: postcode ?? null, address, event_date, start_time, end_time, notes, latitude: latitude ?? null, longitude: longitude ?? null, van_id: van_id ?? null, updated_at: new Date().toISOString() }).eq('id', id).eq('truck_id', targetTruckId).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      savedEvent = data
    } else {
      // LIVE-TIME GATE (create): manual events auto-confirm (go live immediately) → both times required.
      if (!hasValidEventTimes(start_time, end_time)) {
        return NextResponse.json({ error: 'Add a start and end time before this event can go live.' }, { status: 400 })
      }
      const now = new Date().toISOString()
      const eventStatus = 'confirmed'
      // FIX 3 (single-van auto-assign): if the operator didn't pick a van and the
      // truck has exactly one active van, assign it so capacity etc. can resolve.
      // Multi-van trucks leave van selection to the operator (van_id stays null).
      const resolvedVanId = van_id ?? await getSoleActiveVanId(supabase, targetTruckId)
      // Seed order_ready_override from the van's current default so the new event starts matching the
      // Settings master switch (master-switch model).
      const seededOrderReady = await getVanOrderReadyDefault(supabase, targetTruckId, resolvedVanId)
      const { data, error } = await supabase.from('truck_events').insert({ truck_id: targetTruckId, venue_name, town: town ?? null, postcode: postcode ?? null, address, event_date, start_time, end_time, notes, latitude: latitude ?? null, longitude: longitude ?? null, van_id: resolvedVanId ?? null, order_ready_override: seededOrderReady, source: 'manual', status: eventStatus, confirmed_at: eventStatus === 'confirmed' ? now : null, auto_open: truck.default_auto_open ?? true, auto_close: truck.default_auto_close ?? true }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      savedEvent = data

      // Auto-create event_deals from current bundle defaults
      const newEventId = data.id
      const { data: bundles } = await supabase
        .from('bundles_db')
        .select('id, apply_to_new_events')
        .eq('truck_id', targetTruckId)
        .eq('is_available', true)

      if (bundles && bundles.length > 0 && newEventId) {
        const eventDeals = bundles.map((bundle: { id: string; apply_to_new_events: boolean }) => ({
          event_id: newEventId,
          bundle_id: bundle.id,
          active: bundle.apply_to_new_events,
          overridden: false,
        }))
        await supabase
          .from('event_deals')
          .upsert(eventDeals, { onConflict: 'event_id,bundle_id', ignoreDuplicates: true })
      }
    }

    // Write slot_capacity rows from van kitchen_capacity if a van is assigned
    if (savedEvent?.van_id && start_time && end_time) {
      const { data: van } = await supabase
        .from('truck_vans')
        .select('kitchen_capacity')
        .eq('id', savedEvent.van_id as string)
        .single()

      if (van?.kitchen_capacity) {
        const slots = generateSlots(start_time, end_time, 5)
        const rows = slots.map((slot: string) => ({
          truck_id: targetTruckId,
          event_date,
          slot,
          max_orders: van.kitchen_capacity,
        }))
        await supabase
          .from('slot_capacity')
          .upsert(rows, { onConflict: 'truck_id,event_date,slot' })
      }
    }

    // Gap 3: self-heal production_slot_usage whenever an event is created/confirmed,
    // alongside the slot_capacity regen. Best-effort — never block the event save.
    if (event_date) {
      try {
        await rebuildProductionSlotUsage(supabase, targetTruckId, event_date)
      } catch (err) {
        console.warn('[upsert_event] production_slot_usage rebuild failed (drift risk):', err)
      }
    }

    return NextResponse.json({ event: savedEvent })
  }

  if (action === 'update_event_deal') {
    const { eventId, bundleId, active } = body
    const { error } = await supabase
      .from('event_deals')
      .upsert({ event_id: eventId, bundle_id: bundleId, active, overridden: true }, { onConflict: 'event_id,bundle_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_bundle_default') {
    const { bundleId, applyToNewEvents } = body
    const { error } = await supabase
      .from('bundles_db')
      .update({ apply_to_new_events: applyToNewEvents })
      .eq('id', bundleId)
      .eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete_event') {
    const { data: ev } = await supabase
      .from('truck_events')
      .select('event_date')
      .eq('id', body.id)
      .eq('truck_id', truck.id)
      .single()
    await supabase.from('truck_events').update({ status: 'cancelled' }).eq('id', body.id).eq('truck_id', truck.id)
    // Recompute the date's production_slot_usage from LIVE orders so a removed event
    // no longer leaves stale load for other same-date events (best-effort).
    if (ev?.event_date) {
      try {
        await rebuildProductionSlotUsage(supabase, truck.id, ev.event_date)
      } catch (err) {
        console.warn('[delete_event] production_slot_usage rebuild failed (drift risk):', err)
      }
    }
    return NextResponse.json({ success: true })
  }

  // ── WEBSITE EMBED (Stage 2) ───────────────────────────────
  //
  // 🔴 THREE COLUMNS, NAMED LITERALLY, AND THE ONES DELIBERATELY ABSENT ARE THE POINT.
  // This handler writes `website`, `embed_enabled` and NOTHING ELSE. It does NOT write
  // `schedule_url`, `scraper_preference` or `scraper_rule`, does not read them as defaults, and
  // does not accept them from the body — the update object is built from named locals, never
  // spread from `body`, so a caller cannot smuggle a column in.
  // ⚠️ WHY THAT MATTERS ENOUGH TO SAY TWICE: `trucks.schedule_url` DRIVES THE SCRAPER. Writing an
  // operator's homepage there would silently re-point scraping on a live trading truck at a page
  // that is not their schedule, and the first sign would be wrong events on a customer's map.
  // The two fields even look interchangeable in the UI — both are "your website address" — which is
  // exactly why the separation is enforced here rather than left to whoever edits the wizard next.
  // ── 🔴 KEPT WITH NO UI (V11.49). THE WIZARD THAT CALLED THIS IS DELETED. ─────────────────────────
  // It survives because `trucks.embed_enabled` is the gate on /api/embed/events, which is what feeds the
  // CUSTOM-DOMAIN page — so this is the only supported way to turn that column OFF for a truck without
  // hand-written SQL. Nothing in the product calls it today; it is an operational lever, not a feature.
  // ⚠️ IF YOU DELETE IT, the only remaining writer is `domain_provision` (one-way, true), and switching a
  // truck off means editing the database by hand on a table a live truck trades on.
  if (action === 'save_embed_setup') {
    // 🔴 THE PLAN GATE, SERVER-SIDE. The wizard also checks, but a UI check is a courtesy; this is
    // the one a request cannot skip. Note that /embed itself checks AGAIN at render (Stage 1), so
    // even a row that somehow held `embed_enabled = true` off-plan would still show the fallback.
    if (!canAccess(truck.plan, 'embed_schedule', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return NextResponse.json({ error: 'Not available on this plan' }, { status: 403 })
    }

    const enabled = body.enabled === true
    const patch: { embed_enabled: boolean; website?: string } = { embed_enabled: enabled }

    // ⛔ THE `plan_answer` BRANCH IS GONE (V11.49). Its only source was the plan-requirement screen in
    // the removed wizard, so nothing could send it. 🔴 `trucks.embed_plan_answer` IS NOT DROPPED — the
    // column keeps whatever it already held. This stops writing it; it does not erase it.

    // The operator's website address. Only written when they actually typed something that reads as
    // an address — `normaliseUrl` returns null rather than guessing, and a null here means "leave
    // whatever is already on the row alone", never "clear it".
    if (typeof body.website === 'string' && body.website.trim()) {
      const url = normaliseUrl(body.website)
      if (!url) {
        return NextResponse.json({ error: 'That does not look like a web address' }, { status: 400 })
      }
      patch.website = url
    }

    const { error } = await supabase.from('trucks').update(patch).eq('id', truck.id)
    if (error) {
      console.error('[save_embed_setup] update failed:', error.message)
      return NextResponse.json({ error: 'Could not save' }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      embed_enabled: enabled,
      website: patch.website ?? truck.website ?? null,
    })
  }

  // Read-only. Polled by the wizard's verification step, so it is deliberately cheap and returns
  // only what that step renders. NOT in staffBlockedActions: it writes nothing, and a staff member
  // who somehow reached it learns whether a public page they can already visit has been loaded.
  // ── 🔴 KEPT WITH NO UI (V11.49), and it is the diagnostic for the silent failure above. ──────────
  // `embed_enabled` decides whether a custom domain shows any events at all, and NOTHING ON THE
  // CUSTOM-DOMAIN PAGE READS OR REPORTS IT — app/domain/page.tsx neither selects nor checks the column.
  // This is the one endpoint that will answer "is that truck's schedule actually going to appear".
  if (action === 'get_embed_status') {
    return NextResponse.json({
      embed_enabled: truck.embed_enabled === true,
      website: truck.website ?? null,
      // ⛔ `last_seen_at`, `last_referer` and `plan_answer` REMOVED FROM THIS RESPONSE (V11.49).
      // The load stamp was written by the public iframe route, which is deleted, so those two columns
      // can only ever go staler — returning them would be a claim nothing keeps true. `plan_answer`'s
      // writer is gone for the same reason. 🔴 ALL THREE COLUMNS REMAIN ON THE TABLE, UNDROPPED.
      can_embed: canAccess(truck.plan, 'embed_schedule', truck.feature_overrides ?? {}, truck.trial_expires_at),
    })
  }

  if (action === 'domain_preflight') {
    // ── 🔴 THE ONLY ACTION HERE WHOSE OUTBOUND FAN-OUT IS DRIVEN BY CALLER INPUT. ──────────────────
    // Below, one request becomes a CAA lookup and an NS lookup (each falling through Cloudflare to
    // Google on failure) plus one authenticated GET to api.vercel.com — three to five outbound
    // requests, on a host the caller names. Ten per ten minutes per truck; sizing in lib/ratelimit.ts.
    // ⚠️ SCOPED TO THIS BRANCH. It is checked here rather than in proxy.ts precisely so that no other
    // action on /api/manage — and no other route — shares this bucket. See the bucket's own note.
    // ⚠️ LIMITER UNREACHABLE → FAIL OPEN, following the convention this repo already sets in FOUR
    // places: app/api/demo/route.ts, app/api/demo/build-request/route.ts, app/api/signup/route.ts and
    // app/api/manage/whatsapp-preview/route.ts. Every one of them justifies the direction by naming a
    // control that STILL APPLIES when Redis is down, and that test is what decides it here too:
    // this branch reaches NO third party and spends NO shared allowance — it makes outbound lookups on
    // our own infrastructure — and a caller must still be an authenticated operator with a role on this
    // truck, with demo identities refused outright above. The blast radius is bounded to real operators.
    // 🔴 THE SEND BRANCH BELOW TAKES THE OPPOSITE DIRECTION, DELIBERATELY. The same test gives the
    // opposite answer there, because that one does reach a third party's inbox on a shared cap.
    try {
      const pre = await domainPreflightRatelimit.limit(`preflight:${truck.id}`)
      if (!pre.success) {
        console.warn(`[ratelimit] REFUSED limiter=domain-preflight key=preflight:${truck.id} — returning 429`)
        return NextResponse.json({ error: 'Too many checks just now. Try again in a few minutes.' }, { status: 429 })
      }
    } catch (err) {
      console.error('[domain_preflight] rate-limit check failed, allowing through:', err)
    }
    const verdict = checkSubdomain(typeof body.address === 'string' ? body.address : '')
    if (!verdict.ok) {
      // 🔴 THE APEX GUARD, SERVER-SIDE. The screen checks too, but a UI check is a courtesy.
      return NextResponse.json({ ok: false, reason: verdict.reason, message: verdict.message })
    }

    // 🔴 BOTH LOOKUPS TARGET THE PARENT, NEVER THE NEW SUBDOMAIN — see lib/custom-domain/dns.ts for
    // why asking about a name that does not exist yet poisons every later answer.
    // ⚠️ CONCURRENT, so the screen waits for the slower of the two rather than their sum.
    const [caa, dns] = await Promise.all([checkCaa(verdict.host), detectDnsProvider(verdict.host)])

    // (c) Already on another hosting project. ⚠️ THIS IS A SIGNAL, NOT A PROOF, AND IT IS LABELLED AS
    // ONE. A read-only config lookup can say the name already resolves to the host; only the add call
    // returns the definitive 409, and that has a side effect so it is not run here.
    let alreadyElsewhere: boolean | null = null
    try {
      const cfg = await getDomainConfig(verdict.host)
      alreadyElsewhere = cfg.ok ? cfg.configuredBy !== null : null
    } catch { alreadyElsewhere = null }

    return NextResponse.json({
      ok: true,
      address: verdict.host,
      caa: { state: caa.state, issuers: caa.issuers, queried: caa.queried },
      provider: dns.provider,
      nameservers: dns.nameservers,
      queried: dns.queried,
      already_elsewhere: alreadyElsewhere,
    })
  }

  /** Resume. An operator who closed the tab returns to where they were, not to the start. */
  if (action === 'domain_status') {
    const address = truck.custom_domain ?? null
    let target: string | null = null
    if (address) {
      const cfg = await getDomainConfig(address)
      target = cfg.ok ? cfg.recommendedCNAME : null
    }
    return NextResponse.json({
      address,
      state: truck.custom_domain_setup_state ?? null,
      started_at: truck.custom_domain_setup_started_at ?? null,
      verified_at: truck.custom_domain_verified_at ?? null,
      // 🔴 RE-READ FROM THE API ON RESUME, never stored. The value is a property of the project and
      // the domain, not a fact about this truck, and a copy in our database would be a hardcoded
      // target with extra steps.
      cname_target: target,
      // Stage 6 — what the daily check last saw. Derived state for the banner and the confirm step;
      // nothing here is stored a second time.
      last_checked_at: truck.custom_domain_last_checked_at ?? null,
      last_ok_at: truck.custom_domain_last_ok_at ?? null,
      last_seen_value: truck.custom_domain_last_seen_value ?? null,
      confirmed_at: truck.custom_domain_confirmed_at ?? null,
      suggestion: suggestFromWebsite(truck.website ?? null),
    })
  }

  if (action === 'domain_provision') {
    if (!canAccess(truck.plan, 'embed_schedule', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return NextResponse.json({ error: 'Not available on this plan' }, { status: 403 })
    }
    // 🔴 THE GUARD RUNS AGAIN HERE, BEFORE THE HOSTING CALL. Not because the screen is untrusted, but
    // because this is the last line before a side effect that takes over a website if it is wrong.
    const verdict = checkSubdomain(typeof body.address === 'string' ? body.address : '')
    if (!verdict.ok) {
      return NextResponse.json({ ok: false, reason: verdict.reason, message: verdict.message }, { status: 400 })
    }

    // ── 🔴 `www` IS REFUSED HERE, AND NEITHER APEX GUARD COVERS IT. ────────────────────────────────
    // `www.theirdomain.com` is a PERFECTLY VALID SUBDOMAIN. The suffix-list guard above parses it as
    // subdomain "www" of "theirdomain.com" and passes it; the SOA guard below finds no SOA at that name
    // and passes it too. Both are working correctly — www simply is not the thing either one looks for.
    //
    // 🔴 BUT FOR MOST OPERATORS IT IS THE ADDRESS THEIR EXISTING WEBSITE ANSWERS ON, so pointing it at
    // us replaces their homepage with this schedule page. That is the SAME HARM as an apex, arriving
    // through a door neither guard watches — which is exactly why it needs its own line rather than a
    // widening of one of theirs.
    //
    // ⚠️ THE CLIENT ALREADY REFUSES IT AND THAT IS NOT ENOUGH. A UI check is a courtesy; this is the
    // last line before a side effect that takes over a website. The client can be bypassed by anything
    // that can POST — which, on this route, is any authenticated operator with a role on this truck.
    //
    // ⚠️ THE FIRST LABEL, NOT THE WHOLE SUBDOMAIN. `checkSubdomain` has already lower-cased the host, so
    // case is handled. Testing the leading label catches `www.theirdomain.com` and also
    // `www.shop.theirdomain.com`; it deliberately does NOT refuse `shop.www-cafe.com`, where "www" is
    // part of a name rather than the conventional web prefix.
    // ── 🔴 A SECOND `www` CASE, ADDED 28 AUGUST 2026, AND IT IS NOT THE TAKEOVER ONE. ─────────────
    // The test below catches the DANGEROUS case — the submitted host IS `www.theirdomain.com`, so
    // pointing it at us replaces their homepage. That case is unchanged and still refused.
    // ⚠️ WHAT THIS ADDS IS NOT DANGEROUS, IT IS NONSENSE. With the word in front fixed to `events`, a
    // caller can submit `events.www.theirdomain.com`, whose FIRST label is `events` — so the test below
    // never fires, and we would register a doubled-up name. It does not replace anything: their homepage
    // is `www.theirdomain.com` and this is a different name entirely. It is refused because it is a name
    // nobody meant to ask for, not because it is a hazard.
    // ⚠️ THE INTERFACE CAN NO LONGER PRODUCE IT — the field normalises `www.theirdomain.com` down to the
    // registrable domain before it builds the address. This is the same class as the apex guards: the
    // last line before a side effect, defending a path a screen no longer reaches.
    // 🔴 `shop.www-cafe.com` IS STILL ALLOWED. The test is on whole LABELS, so "www" as part of a name
    // is untouched — the same distinction the first-label test was written to preserve.
    if ((verdict.subdomain ?? '').split('.').includes('www') && (verdict.subdomain ?? '').split('.')[0] !== 'www') {
      return NextResponse.json({
        ok: false, reason: 'www_inner',
        message: `That address has www in the middle of it. Take the www. off the front of your web address and try again.`,
      }, { status: 400 })
    }

    if ((verdict.subdomain ?? '').split('.')[0] === 'www') {
      return NextResponse.json({
        ok: false, reason: 'www',
        message: `${verdict.host} is usually where your existing website already lives. If you point that at us, your website is replaced by this page. Use a different word in front, like events.`,
      }, { status: 400 })
    }

    // 🔴 THE SECOND GUARD, AND IT SHARES NO DATA WITH THE FIRST. The list guard above is permissive by
    // construction — a suffix registered after the bundled snapshot means an apex under it parses as a
    // subdomain and passes. This one asks the zone: an apex has an SOA at its own name. BOTH must pass.
    // ⚠️ FAILS OPEN on a resolver error ('unknown'), because the list guard is primary and has cleared it.
    const soa = await checkApexViaSoa(verdict.host)
    if (soa.state === 'apex') {
      return NextResponse.json({
        ok: false, reason: 'apex',
        message: `${verdict.host} is your whole website address. If you point that at us, your website is replaced by this page. Put a word in front of it instead.`,
      }, { status: 400 })
    }

    const added = await addDomain(verdict.host)
    if (!added.ok) {
      // ⚠️ NOTHING IS WRITTEN ON FAILURE. A truck that could not register keeps whatever state it had,
      // so a retry is a retry and not a resume into a state that never happened.
      //
      // ── 🔴 THE HOSTING LAYER'S OWN MESSAGE NEVER REACHES THE OPERATOR. ──────────────────────────
      // It used to be forwarded verbatim, and two of its values are the names of environment variables:
      // `VERCEL_PROJECT_ID is not set` (reason 'not_configured') and `VERCEL_API_TOKEN is not set`
      // (thrown inside call(), caught, and returned as reason 'error'). Both rendered straight onto an
      // operator's screen, in red, under "Setting up…".
      // 🔴 SO THE BRANCH IS ON `reason`, AND THE MESSAGE IS OURS. Branching on the reason is what makes
      // this safe by construction rather than by spotting each bad string: every value comes from the
      // map below, so nothing internal can leak through this return no matter what the hosting API or a
      // thrown error puts in `message`. Do not go back to forwarding `added.message`.
      // ⚠️ THE RAW STRING IS KEPT — in the SERVER LOG, with the reason and the status beside it, which is
      // where whoever has to fix it will look. Nothing diagnostic is lost; it just stops being copy.
      console.error('[domain_provision] addDomain failed:', added.reason, added.status, added.message)
      return NextResponse.json({ ok: false, reason: added.reason, message: PROVISION_FAILED[added.reason] }, { status: 200 })
    }

    // The record VALUE, from the response — never a constant. See lib/custom-domain/vercel.ts.
    const cfg = await getDomainConfig(verdict.host)
    const target = cfg.ok ? cfg.recommendedCNAME : null

    const patch = {
      custom_domain: verdict.host,
      // ── 🔴 THIS LINE IS WHY THE CUSTOM DOMAIN HAS ANY CONTENT AT ALL. DO NOT REMOVE IT. ──────────
      // The custom-domain page renders <EmbedSchedule>, which fetches /api/embed/events, which returns
      // an EMPTY LIST unless `trucks.embed_enabled` is true (that route's own guard). `embed_enabled` is
      // NOT NULL DEFAULT false, and after the iframe wizard was removed (V11.49) THIS IS THE ONLY PLACE
      // IN THE CODEBASE THAT SETS IT TRUE.
      // 🔴 WITHOUT IT THE FAILURE IS SILENT AND LOOKS FINE: the page returns 200 and renders the truck's
      // name, logo and "Powered by" — with no events, for ever. Nothing errors, nothing logs, and a test
      // asserting "the page renders" passes while the feature is dead. Assert the EVENTS, never the render.
      // ⚠️ Set at PROVISION rather than at verification, deliberately: provisioning is the one step that
      // always happens and happens once, so the column cannot be left false by an operator who completes
      // setup and never returns. It grants no iframe surface — that route no longer exists.
      embed_enabled: true,
      // 🔴 'registered' RECORDS A SIDE EFFECT OUTSIDE THIS DATABASE. If the operator walks away now,
      // this row is the only trace that a domain is attached to the hosting project with no DNS
      // pointing at it. Without it that orphan is invisible until someone reads the dashboard by hand.
      custom_domain_setup_state: target ? 'awaiting_dns' : 'registered',
      custom_domain_setup_started_at: truck.custom_domain_setup_started_at ?? new Date().toISOString(),
    }
    const { error } = await supabase.from('trucks').update(patch).eq('id', truck.id)
    if (error) {
      console.error('[domain_provision] update failed:', error.message)
      return NextResponse.json({ ok: false, reason: 'error', message: 'Could not save' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      address: verdict.host,
      subdomain_label: verdict.subdomain,
      cname_target: target,
      verification: added.verification,
      state: patch.custom_domain_setup_state,
    })
  }

  /**
   * The operator's acknowledgement. ONE column, and it gates nothing — a truck that never confirms
   * keeps a fully working page. It exists so the admin table can tell "live, and a person looked" from
   * "live as far as a machine can tell", which are different claims.
   */
  if (action === 'domain_confirm') {
    if (!truck.custom_domain || !truck.custom_domain_verified_at) {
      return NextResponse.json({ error: 'There is nothing to confirm yet' }, { status: 400 })
    }
    const { error } = await supabase.from('trucks')
      .update({ custom_domain_confirmed_at: new Date().toISOString() }).eq('id', truck.id)
    if (error) {
      console.error('[domain_confirm] update failed:', error.message)
      return NextResponse.json({ error: 'Could not save' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  /**
   * ── 🔴 TURNING IT OFF. RELEASE FIRST, CLEAR ONLY ON SUCCESS. ────────────────────────────────────
   *
   * 🔴 THE ORDER IS THE WHOLE DESIGN, AND IT IS THE ORPHAN SWEEP'S LESSON APPLIED A SECOND TIME.
   * `app/api/cron/custom-domain-check/route.ts` records why, and the same three outcomes hold here:
   *   release → clear, release FAILS  → the row survives, the operator retries. RECOVERABLE.
   *   release → clear, the CLEAR fails → detached at the hosting side but our row still names it; the
   *                                      operator retries, gets `gone`, and it converges. RECOVERABLE.
   *   clear → release, release FAILS  → attached at the hosting side with NO row anywhere. The
   *                                      operator's web person hits "already assigned to another
   *                                      project" weeks later and nothing explains why. UNRECOVERABLE.
   * ⚠️ `releaseDomain` treats a 404 as released, which is what makes the retry converge, and treats
   * missing credentials as a FAILURE — so a misconfigured environment cannot clear the row while the
   * domain stays attached.
   *
   * ⚠️ NO PLAN GATE, DELIBERATELY. Every other domain action is gated on `embed_schedule`; this one is
   * not, because an operator whose plan has lapsed must still be able to switch off a page that is
   * still serving. Gating removal behind the plan that pays for it is how a truck ends up unable to
   * stop something they no longer want.
   *
   * ⚠️ `embed_enabled` IS DELIBERATELY LEFT TRUE. It is what makes /api/embed/events return anything,
   * and its only reader is the custom-domain page — which now 404s, because the host resolves to no
   * truck. Clearing it would buy nothing and would have to be un-cleared on the next setup.
   */
  if (action === 'domain_turn_off') {
    const host = truck.custom_domain
    // Idempotent: nothing attached is the state this action exists to reach.
    if (!host) return NextResponse.json({ ok: true, alreadyOff: true })

    const release = await releaseDomain(host)
    if (!release.ok) {
      // 🔴 NOTHING IS WRITTEN. The row still names the domain, so a retry is a retry.
      console.error(`[domain_turn_off] release failed for ${host}: ${release.reason} — row kept`)
      return NextResponse.json({
        ok: false, reason: release.reason,
        message: 'We could not switch that off just now. Nothing has changed — your address is still working. Try again shortly.',
      }, { status: 200 })
    }

    const { error } = await supabase.from('trucks').update({
      custom_domain: null,
      custom_domain_verified_at: null,
      custom_domain_confirmed_at: null,
      custom_domain_setup_state: null,
      custom_domain_setup_started_at: null,
      custom_domain_last_checked_at: null,
      custom_domain_last_ok_at: null,
      custom_domain_last_seen_value: null,
    }).eq('id', truck.id)
    if (error) {
      console.error('[domain_turn_off] update failed after a successful release:', error.message)
      return NextResponse.json({
        ok: false, reason: 'clear_failed',
        message: 'We could not switch that off just now. Nothing has changed — your address is still working. Try again shortly.',
      }, { status: 500 })
    }
    return NextResponse.json({ ok: true, released: release.reason })
  }

  if (action === 'domain_send_instructions') {
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: 'That does not look like an email address' }, { status: 400 })
    }
    const address = truck.custom_domain
    if (!address) return NextResponse.json({ error: 'No address has been set up yet' }, { status: 400 })

    // ── 🔴 THREE PER TRUCK PER ROLLING 24 HOURS. ───────────────────────────────────────────────────
    // The recipient stays CALLER-SUPPLIED because that is the requirement — the operator is emailing
    // their web person, an address we do not hold and could not look up. So the constraint is on the
    // VOLUME, not on the value. Sizing and the comparison with signupEmailRatelimit: lib/ratelimit.ts.
    // ⚠️ CHECKED BEFORE THE TWO OUTBOUND LOOKUPS BELOW, not just before the send, so a refused caller
    // costs us nothing at all rather than costing us the DNS and Vercel calls.
    // 🔴 LIMITER UNREACHABLE → FAIL CLOSED. A DELIBERATE EXCEPTION TO THIS REPO'S CONVENTION, and the
    // exception is argued rather than assumed. The four existing fail-open sites each justify their
    // direction by naming a control that survives the outage; apply that same test here and it gives the
    // opposite answer. This branch reaches A THIRD PARTY'S INBOX, from our domain, on a SHARED Brevo
    // allowance whose first casualty when exhausted is order confirmations for live trucks. An unmetered
    // path to someone else's inbox is the exact thing this bucket was added for, so losing the meter
    // must close the path, not open it.
    // ⚠️ 503, not 429: nothing was counted, so "too many requests" would be a lie about why.
    // 🔴 AND THE REFUSAL CARRIES A WAY THROUGH, which is what stops it being a dead end. The record
    // details are on screen with per-row Copy buttons (CustomDomainSetup.tsx:278), so an operator in a
    // hurry sends the same information themselves from their own address and loses nothing but our
    // formatting.
    let sendLimit: { success: boolean }
    try {
      sendLimit = await domainInstructionsRatelimit.limit(`instructions:${truck.id}`)
    } catch (err) {
      console.error(`[ratelimit] UNAVAILABLE limiter=domain-instructions key=instructions:${truck.id} — refusing (fail closed):`, err)
      // 🔴 RECORDED WHERE ABUSE IS READ, NOT ONLY IN A LOG LINE. A limiter outage and a limiter refusal
      // are the two reasons a send does not happen, and inferring the first from an ABSENCE of rows is
      // exactly the reading nobody does. Distinct action name so flapping Redis is countable next to the
      // sends themselves rather than mistaken for quiet.
      await logAction(supabase, {
        action: 'domain_send_instructions_limiter_unavailable',
        truckId: truck.id,
        afterState: { address, recipient_hash: pseudonymiseEmail(to), outcome: 'refused_fail_closed' },
        actor: { actorKind: requestingUserRole === 'owner' ? 'owner' : 'staff', actorId: requestingUserId, actorLabel: null },
        source: resolveActorSource(req, body),
      })
      return NextResponse.json({
        error: 'We could not send that just now. Try again shortly — or copy the details on this screen and email them across yourself, which works just as well.',
      }, { status: 503 })
    }
    if (!sendLimit.success) {
      console.warn(`[ratelimit] REFUSED limiter=domain-instructions key=instructions:${truck.id} — returning 429`)
      return NextResponse.json({
        error: 'You have sent these instructions a few times today already. Try again tomorrow, or forward the email you already have.',
      }, { status: 429 })
    }

    const cfg = await getDomainConfig(address)
    const target = cfg.ok ? cfg.recommendedCNAME : null
    if (!target) return NextResponse.json({ error: 'Could not read the record just now' }, { status: 502 })

    const dns = await detectDnsProvider(address)
    const verdict = checkSubdomain(address)
    const mail = domainInstructionsEmail({
      truckName: truck.name,
      address,
      providerLabel: dns.provider?.label ?? null,
      rows: recordRows({
        provider: dns.provider,
        subdomainLabel: verdict.ok ? verdict.subdomain : address,
        cnameTarget: target,
      }),
      // 🔴 THE SAME RECORD THE SCREEN RENDERS, AND THE ONLY PLACE THIS EMAIL LEARNS ANY STEPS.
      // `undefined` for a provider with no verified steps, which sends the email exactly as before.
      steps: dns.provider?.steps ?? null,
      operatorEmail: truck.contact_email ?? null,
    })
    try {
      // The existing Brevo path, and the sender is the TRUCK — see the embed wizard's note.
      await sendConfirmationEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, senderName: truck.name })
    } catch (e) {
      console.error('[domain_send_instructions] send failed:', e instanceof Error ? e.message : String(e))
      return NextResponse.json({ error: 'Could not send' }, { status: 502 })
    }

    // ── 🔴 THE ADDRESS IS RECORDED, SO ABUSE IS VISIBLE AFTER THE FACT. ───────────────────────────
    // A rate limit caps the volume; it does not say WHERE the mail went. Without this, "why did this
    // inbox get our mail" has no answer and a limiter tuned wrong leaves no trace of what it allowed.
    // The existing append-only action_audit_log is the right home: free-text `action` by design, no
    // foreign keys, and it already carries the actor. NO MIGRATION IS NEEDED — the table is applied.
    //
    // 🔴 THE RECIPIENT IS PSEUDONYMISED, NOT STORED. An earlier pass wrote the raw address here and that
    // was wrong: it extended this module's stated no-identifiers rule and broke its verified-clean claim,
    // for a person who is not a user of this platform — the operator's web person — in a table that
    // NOTHING SWEEPS and that the anonymisation pass cannot reach inside.
    // ⚠️ CLUSTERING IS THE REQUIREMENT, READABILITY IS NOT. A keyed, normalised pseudonym still shows
    // forty sends to ONE inbox as forty rows sharing one value, which is the whole signal. Brevo holds
    // the address itself, and at three sends per truck per day that trail is short.
    // See lib/audit/pseudonymise.ts for why it is HMAC rather than a bare digest.
    //
    // ⚠️ BEST-EFFORT, AFTER the send. The mail has already left; failing the response now would tell
    // the operator it did not send when it did. `logAction` swallows and logs, which is the right
    // direction here (contrast logActionOrThrow, for actions that DESTROY evidence).
    await logAction(supabase, {
      action: 'domain_send_instructions',
      truckId: truck.id,
      afterState: { address, recipient_hash: pseudonymiseEmail(to), provider: dns.provider?.id ?? null },
      actor: {
        actorKind: requestingUserRole === 'owner' ? 'owner' : 'staff',
        actorId: requestingUserId,
        actorLabel: null,
      },
      source: resolveActorSource(req, body),
    })
    return NextResponse.json({ success: true })
  }

  if (action === 'update_settings') {
    // ALLOWLIST the writable columns (mirrors update_truck below) so ONE unknown / schema-drifted
    // field can never poison the whole multi-field UPDATE. (The trucks.website incident: `website`
    // wasn't a column, so PostgREST 400'd the entire statement, silently reverting cuisine/contact/
    // social together. saveFormField also spreads the full truck form — id, dashboard_token, plan,
    // etc. — which the allowlist now drops instead of attempting to write.) Only keys PRESENT in the
    // body are written, so a partial save never nulls omitted fields.
    const ALLOWED = [
      'name', 'description', 'cuisine_type', 'contact_email', 'contact_phone',
      'social_instagram', 'social_facebook', 'auto_accept', 'logo_storage_path',
      'website', 'allergen_info_url', 'allergen_info_text', 'allergen_display_mode', 'truck_emoji',
      // Customer-facing WhatsApp (the phone number, when the operator ticks "this number is on
      // WhatsApp") + the tick flag. SEPARATE from whatsapp_sender (Auto-replies/Connect) — not written here.
      'whatsapp', 'phone_is_whatsapp',
      // Per-truck sound policy (jsonb: which sounds fire). REQUIRED here or the write is silently dropped.
      'sound_config',
    ]
    const safeData = Object.fromEntries(
      Object.entries(body).filter(([key, val]) => ALLOWED.includes(key) && val !== undefined)
    )
    if (Object.keys(safeData).length === 0) {
      return NextResponse.json({ truck: null })
    }
    // (A)+(B): the allergen card + display-mode are allergen writes. Gate non-owner/admin when one
    // CHANGES (a manager saving contact/social via the same action is unaffected); log each as card_save.
    const ALLERGEN_SETTING_KEYS = ['allergen_info_url', 'allergen_info_text', 'allergen_display_mode']
    const touchedAllergenKeys = ALLERGEN_SETTING_KEYS.filter(k => k in safeData && (safeData as any)[k] !== (truck as any)[k])
    if (touchedAllergenKeys.length && !canEditAllergens) return ALLERGEN_FORBIDDEN
    const { data, error } = await supabase.from('trucks').update(safeData).eq('id', truck.id).select().single()
    if (error) {
      // Log the real cause server-side (schema drift, constraint, etc.); show the operator a clear,
      // non-cryptic message instead of the raw "column ... does not exist".
      console.error('[update_settings] write failed:', error.message, '| fields:', Object.keys(safeData).join(', '))
      return NextResponse.json({ error: "Couldn't save settings — please try again." }, { status: 400 })
    }
    await logAllergenChanges(supabase, touchedAllergenKeys.map(k => ({
      ...actor, truck_id: truck.id, item_id: null, change_type: 'card_save', field: 'card',
      old_value: (truck as any)[k] ?? null, new_value: (safeData as any)[k] ?? null,
    })))
    return NextResponse.json({ truck: data })
  }

  // ── IMAGE UPLOAD URL ──────────────────────────────────────
  if (action === 'get_upload_url') {
    const { filename, content_type } = body
    const path = `${truck.id}/${Date.now()}-${filename}`
    const { data, error } = await supabase.storage.from('truck-media').createSignedUploadUrl(path)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ upload_url: data.signedUrl, path })
  }

  // ── UPDATE TRUCK (KDS / operational fields) ──────────────────
  // ⚠️ GATING STATE IS DELIBERATELY ABSENT — DO NOT RE-ADD `plan`, `trial_expires_at` OR `feature_overrides`.
  // This route authenticates on `dashboard_token` ALONE (no session required — see getTruck above), so
  // EVERY key on this allowlist is writable by any holder of the token. Those three fields ARE the paid-
  // feature gate — they are the exact inputs to canAccess(plan, feature, featureOverrides, trialExpiresAt)
  // — so putting them here let a token holder grant themselves the product:
  //   • `plan` / `trial_expires_at` — set your own tier and your own trial expiry.
  //   • `feature_overrides` — worse, because canAccess checks it FIRST and it wins over BOTH the plan and
  //     the expiry (lib/features.ts: `if (feature in featureOverrides) return featureOverrides[feature] === true`),
  //     so an EXPIRED trial could re-grant itself every paid feature one key at a time.
  // All three are admin-owned. Their home is `/api/admin` (POST, `verifyAdmin` = Supabase session →
  // `operators.is_admin`), which is what the admin console already posts to — the console's plan/trial
  // chips and per-feature override tickboxes all write there. Nothing ever wrote them through this path.
  // The rule: gating state is never writable by a credential the gated party holds.
  if (action === 'update_truck') {
    // ⚠️ 'add_order_layout' WAS ON THIS LIST AND WAS REMOVED, 14 August 2026 — NOT AN OVERSIGHT.
    // Its only writer moved to DASHBOARD → Settings, which writes trucks columns through bespoke
    // one-column actions (`set_add_order_layout`, app/api/dashboard/action/route.ts) rather than
    // through here, so after the move nothing posted the key to update_truck and the entry was
    // unreachable. Grep-verified before removal.
    // 🔴 RE-ADD IT BEFORE PUTTING ANY MANAGE CONTROL FOR IT BACK: the filter below drops unlisted keys
    // SILENTLY, so a control without the entry appears to save, returns {ok:true}, and writes nothing.
    const allowed = ['crew_mode', 'kds_mode', 'display_mode', 'extra_wait_mins', 'paused_until', 'whatsapp_sender', 'preferred_contact_method', 'allow_customer_cancellation', 'cancellation_cutoff_mins', 'default_auto_open', 'default_auto_close', 'qr_code_style', 'scraper_preference', 'schedule_url', 'scraper_rule', 'preorders_enabled', 'preorder_deadline_type', 'preorder_deadline_value', 'preorder_past_action', 'preorder_open_rule', 'truck_order_email_enabled', 'setup_step', 'show_paid_step', 'takes_cash', 'completion_presses']
    const safeData = Object.fromEntries(
      Object.entries(body.data || {}).filter(([key]) => allowed.includes(key))
    )
    const { error } = await supabase.from('trucks').update(safeData).eq('id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ── TEAM CRUD ─────────────────────────────────────────────────
  if (action === 'get_team') {
    const { data, error } = await supabase
      .from('truck_users')
      .select(`
        id, email, name, role, accepted_at, auth_user_id,
        truck_user_vans (
          van_id,
          truck_vans ( name )
        )
      `)
      .eq('truck_id', truck.id)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const members = (data || []).map((m: any) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.role,
      accepted_at: m.accepted_at,
      auth_user_id: m.auth_user_id,
      van_names: (m.truck_user_vans || []).map((tuv: any) => tuv.truck_vans?.name).filter(Boolean),
    }))
    return NextResponse.json({ members })
  }

  if (action === 'invite_member') {
    const { name, email, role, van_ids } = body
    if (!email?.trim()) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    const { data: member, error } = await supabase
      .from('truck_users')
      .insert({ truck_id: truck.id, email: email.trim().toLowerCase(), name: name?.trim() || null, role })
      .select('id, email, name, role, accepted_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (van_ids?.length > 0) {
      await supabase.from('truck_user_vans').insert(
        van_ids.map((van_id: string) => ({ truck_user_id: member.id, van_id }))
      )
    }
    return NextResponse.json({ ok: true, member: { ...member, van_names: [] } })
  }

  if (action === 'update_member') {
    if (requestingUserRole === 'staff') {
      const { data: selfRow } = await supabase
        .from('truck_users')
        .select('id')
        .eq('auth_user_id', requestingUserId!)
        .eq('truck_id', truck.id)
        .single()
      if (!selfRow || selfRow.id !== body.memberId) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
    }
    if (requestingUserRole === 'manager') {
      const { data: target } = await supabase
        .from('truck_users')
        .select('role')
        .eq('id', body.memberId)
        .single()
      if (target?.role !== 'staff') {
        return NextResponse.json({ error: 'Managers can only edit staff members' }, { status: 403 })
      }
    }

    const { memberId, name, role, van_ids } = body
    const { error } = await supabase
      .from('truck_users')
      .update({ name: name?.trim() || null, role })
      .eq('id', memberId)
      .eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('truck_user_vans').delete().eq('truck_user_id', memberId)
    if (van_ids?.length > 0) {
      await supabase.from('truck_user_vans').insert(
        van_ids.map((van_id: string) => ({ truck_user_id: memberId, van_id }))
      )
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'remove_member') {
    const { memberId } = body
    const { error } = await supabase
      .from('truck_users')
      .delete()
      .eq('id', memberId)
      .eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── VAN CRUD ──────────────────────────────────────────────────
  if (action === 'get_vans') {
    const { data, error } = await supabase
      .from('truck_vans')
      // ⚠️ NAMED SELECT — `buzzer_count` is added by 20260803_buzzer_settings.sql. A named select over
      // a column PostgREST cannot see returns 42703 and fails the whole statement, which here means
      // Manage → Settings renders no vans at all. Apply the migration BEFORE deploying.
      .select('id, truck_id, name, kds_token, active, auto_pause_on_offline, offline_protection_mode, offline_auto_reject_mins, show_cooking_step, order_ready_enabled, display_layout, split_screen, kitchen_capacity, capacity_window_mins, buzzer_count')
      .eq('truck_id', truck.id)
      .eq('active', true)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ vans: data || [] })
  }

  // ── 🔴 THIS DESTRUCTURE IS AN ALLOWLIST, AND IT DROPS SILENTLY. ────────────────────────────────
  // A key that is not named on the line below never reaches `updates`, the UPDATE still succeeds with
  // whatever remains, and the handler returns { ok: true }. The toggle animates, the toast says saved,
  // and nothing was written — with no error anywhere. This is the same failure class as update_truck's
  // array allowlist (:854), which carries the same warning. ADD NEW SETTINGS IN BOTH PLACES:
  // here AND in get_vans' named select above, or the value writes but never reads back.
  if (action === 'update_van_settings') {
    const { vanId, autoPauseOnOffline, offlineProtectionMode, offlineAutoRejectMins, show_cooking_step, order_ready_enabled, kitchen_capacity, capacity_window_mins, buzzer_count } = body
    const updates: Record<string, unknown> = {}
    if (autoPauseOnOffline !== undefined) updates.auto_pause_on_offline = autoPauseOnOffline
    // The MODE beside the switch. Validated to the same vocabulary as the DB CHECK so a bad value is a
    // dropped field rather than a 23514 — and an absent field is untouched, per this handler's rule.
    if (offlineProtectionMode === 'pause' || offlineProtectionMode === 'no_auto_accept') updates.offline_protection_mode = offlineProtectionMode
    // The auto-reject delay beside the mode. 🔴 NULL IS A REAL VALUE HERE AND MEANS OFF, so this is
    // `!== undefined` like buzzer_count and NOT a truthiness test — a truthy read would make "Off"
    // unwritable and an operator could never turn it back off. Range-checked to the same 5-30 the DB
    // CHECK enforces, so a bad number is a dropped field rather than a 23514.
    if (offlineAutoRejectMins !== undefined) {
      if (offlineAutoRejectMins === null) updates.offline_auto_reject_mins = null
      else if (typeof offlineAutoRejectMins === 'number' && Number.isInteger(offlineAutoRejectMins)
               && offlineAutoRejectMins >= 5 && offlineAutoRejectMins <= 30) {
        updates.offline_auto_reject_mins = offlineAutoRejectMins
      }
    }
    if (show_cooking_step !== undefined)  updates.show_cooking_step = show_cooking_step
    if (order_ready_enabled !== undefined) updates.order_ready_enabled = order_ready_enabled
    if (kitchen_capacity !== undefined)   updates.kitchen_capacity = kitchen_capacity
    if (capacity_window_mins !== undefined) updates.capacity_window_mins = capacity_window_mins
    // Buzzers: null = this van has no buzzers (the toggle off), 1..BUZZER_MAX_COUNT = rack size. The
    // range is a UI affordance only — there is deliberately no clamp here and no DB CHECK, so the sole
    // definition lives at lib/buzzer.ts. `!== undefined` and
    // not a truthiness test, so an explicit null CLEARS rather than being skipped.
    if (buzzer_count !== undefined)       updates.buzzer_count = buzzer_count
    await supabase
      .from('truck_vans')
      .update(updates)
      .eq('id', vanId)
      .eq('truck_id', truck.id)
    // MASTER SWITCH (order-ready): flipping the Settings default bulk-writes order_ready_override onto
    // EVERY event for this truck — including events previously toggled on the dashboard (they reset to the
    // new value, by design). Scope = all of the truck's events (simplest; single-van trucks are the norm).
    // van.order_ready_enabled above stays the seed for NEW events.
    if (order_ready_enabled !== undefined) {
      await supabase
        .from('truck_events')
        .update({ order_ready_override: order_ready_enabled })
        .eq('truck_id', truck.id)
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'add_van') {
    const { name } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('truck_vans')
      .insert({ truck_id: truck.id, name: name.trim(), active: true })
      .select('id, truck_id, name, kds_token, active')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, van: data })
  }

  if (action === 'delete_van') {
    const { vanId } = body
    // Count active vans that would REMAIN after this deletion
    const { count } = await supabase
      .from('truck_vans')
      .select('*', { count: 'exact', head: true })
      .eq('truck_id', truck.id)
      .eq('active', true)
      .neq('id', vanId)
    if ((count ?? 0) === 0) {
      return NextResponse.json({ error: 'Cannot remove the last van' }, { status: 400 })
    }
    // Soft delete — preserves all historical orders, events, and reports
    await supabase
      .from('truck_vans')
      .update({ active: false })
      .eq('id', vanId)
      .eq('truck_id', truck.id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'rename_van') {
    const { vanId, name } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }
    const { error } = await supabase
      .from('truck_vans')
      .update({ name: name.trim() })
      .eq('id', vanId)
      .eq('truck_id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── STAFF INVITE (full: auth user + email) ───────────────────
  if (action === 'invite_team_member') {
    if (!['owner', 'manager'].includes(requestingUserRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (requestingUserRole === 'manager' && ['owner', 'manager'].includes(body.role || 'staff')) {
      return NextResponse.json({ error: 'Managers can only invite staff' }, { status: 403 })
    }

    const { email, name, role, vanIds } = body

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    // Validate van selection when truck has multiple vans
    const { data: allVans } = await supabase.from('truck_vans').select('id').eq('truck_id', truck.id).eq('active', true)
    if ((allVans?.length ?? 0) > 1 && (!vanIds || vanIds.length === 0)) {
      return NextResponse.json({ error: 'Please select at least one van' }, { status: 400 })
    }

    // Check not already a member
    const { data: existing } = await supabase
      .from('truck_users')
      .select('id')
      .eq('truck_id', truck.id)
      .eq('email', email.toLowerCase().trim())
      .single()

    if (existing) {
      return NextResponse.json({ error: 'This person is already a team member' }, { status: 400 })
    }

    // Create truck_user record
    const { data: newMember, error: memberError } = await supabase
      .from('truck_users')
      .insert({
        truck_id: truck.id,
        email: email.toLowerCase().trim(),
        name: name || null,
        role: role || 'staff',
      })
      .select('id')
      .single()

    if (memberError || !newMember) {
      return NextResponse.json({ error: 'Failed to create member' }, { status: 500 })
    }

    // Assign van access if specified
    if (vanIds && vanIds.length > 0) {
      await supabase
        .from('truck_user_vans')
        .insert(vanIds.map((vanId: string) => ({
          truck_user_id: newMember.id,
          van_id: vanId,
        })))
    }

    // Create Supabase Auth user
    const tempPassword = crypto.randomBytes(16).toString('hex')
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        must_change_password: true,
        truck_user_id: newMember.id,
      },
    })

    let authUserId: string | null = authData?.user?.id ?? null

    // Auth user already exists (e.g. invited twice, or person has an operator account)
    // Fall back to finding the existing auth_user_id via the operators table
    if (!authUserId && authError) {
      const { data: existingOp } = await supabase
        .from('operators')
        .select('auth_user_id')
        .eq('email', email.toLowerCase().trim())
        .not('auth_user_id', 'is', null)
        .maybeSingle()
      authUserId = existingOp?.auth_user_id ?? null
    }

    if (authUserId) {
      await supabase
        .from('truck_users')
        .update({ auth_user_id: authUserId })
        .eq('id', newMember.id)

      await supabase
        .from('operators')
        .upsert({
          auth_user_id: authUserId,
          email: email.toLowerCase().trim(),
          name: name || null,
        }, { onConflict: 'auth_user_id' })
    }

    // Generate password reset / invite token
    const inviteToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const { data: operatorData } = await supabase
      .from('operators')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (operatorData) {
      await supabase
        .from('password_reset_tokens')
        .insert({
          operator_id: operatorData.id,
          token: inviteToken,
          expires_at: expiresAt.toISOString(),
        })
    }

    // Send invite email via Brevo
    const inviteUrl = `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/reset-password?token=${inviteToken}&invite=true`
    const roleLabel = role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'Staff'
    const firstName = (name || '').split(' ')[0] || 'there'

    const html = `
      <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
        <img src="${HATCHGRAB_LOGO_URL}" alt="HatchGrab"
             width="180" style="margin-bottom:24px;display:block;"/>
        <h2 style="color:#0f172a;margin:0 0 16px;">
          You've been invited to join ${truck.name} on HatchGrab
        </h2>
        <p>Hi ${firstName},</p>
        <p>${truck.name} has invited you to join their team as ${roleLabel === 'Owner' ? 'an Owner' : roleLabel === 'Manager' ? 'a Manager' : 'a Staff member'} on HatchGrab.</p>
        <p>Click the button below to set your password and get started. This link expires in 7 days.</p>
        <p style="margin:32px 0;">
          <a href="${inviteUrl}"
             style="background:#ea580c;color:white;padding:14px 28px;
                    text-decoration:none;border-radius:8px;font-weight:bold;
                    display:inline-block;">
            Accept invitation
          </a>
        </p>
        <p style="color:#64748b;font-size:13px;">
          If you weren't expecting this invitation, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
        <p style="color:#94a3b8;font-size:12px;">HatchGrab</p>
      </div>
    `

    const inviteBrevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: HATCHGRAB_SENDER.name, email: HATCHGRAB_SENDER.email },
        to: [{ email }],
        replyTo: { email: HATCHGRAB_SENDER.replyTo },
        subject: `You've been invited to join ${truck.name} on HatchGrab`,
        htmlContent: html,
      }),
    })

    if (!inviteBrevoRes.ok) {
      const brevoError = await inviteBrevoRes.text()
      console.error('[team-invite] Brevo send failed:', inviteBrevoRes.status, brevoError)
      // Member row is created — don't roll back. Operator can resend manually.
    }

    return NextResponse.json({ ok: true, memberId: newMember.id })
  }

  if (action === 'remove_team_member') {
    if (requestingUserRole === 'staff') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (requestingUserRole === 'manager') {
      const { data: target } = await supabase
        .from('truck_users')
        .select('role')
        .eq('id', body.memberId)
        .single()
      if (target?.role !== 'staff') {
        return NextResponse.json({ error: 'Managers can only remove staff members' }, { status: 403 })
      }
    }

    const { memberId } = body
    await supabase
      .from('truck_users')
      .delete()
      .eq('id', memberId)
      .eq('truck_id', truck.id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'get_report') {
    const { dateFrom, dateTo, eventId } = body

    let query = supabase
      .from('orders')
      // customer_email used client-side to infer order type: null = operator-placed, set = customer online
      // No source/is_manual column exists yet — customer_email IS NULL is the best available signal.
      // order_key (uuid) is the STABLE React key for the report list — `id` is the per-event DISPLAY
      // number and is NOT unique across events (a multi-event date would collide keys).
      // event_id (V9.6): the VAN FILTER selects EVENTS, and an order is in scope iff its event is.
      // 🔴 orders.van_id is deliberately NOT selected and plays NO part in reporting — it is a KDS
      // ROUTING field with no accounting meaning (NULL on ~78% of live orders, because the walk-up path
      // never sets it while the customer path does). Filtering money by it would silently drop revenue.
      .select('order_key, id, customer_name, customer_email, status, slot, total, discount_amt, created_at, items, deals, event_date, event_id')
      .eq('truck_id', truck.id)
      // Reports exclude cancelled/rejected orders (confirmed/collected/etc. only). Revenue already excludes
      // them client-side (:7008) — this server filter keeps the list + the revenue calc consistent.
      .not('status', 'in', '(cancelled,rejected)')

    // Resolve event date filter and build eventsMap for venue name lookup
    let eventsQuery = supabase
      .from('truck_events')
      .select('id, event_date, venue_name, town, van_id')
      .eq('truck_id', truck.id)

    if (eventId) {
      const { data: ev } = await supabase
        .from('truck_events')
        .select('id, event_date, venue_name, town, van_id')
        .eq('id', eventId)
        .eq('truck_id', truck.id)
        .single()
      if (ev?.event_date) {
        // Scope ORDERS by event_id (set by place_order_atomic), NOT event_date — so a single-event report
        // shows ONLY that event's orders. event_date would pull every same-date event's orders → duplicate
        // display numbers (the key=1-7 crash) + wrong report totals on multi-event dates. The eventsQuery
        // (venue lookup) stays by date — it's only used to label rows by event_date.
        query = query.eq('event_id', eventId)
        eventsQuery = eventsQuery.eq('event_date', ev.event_date)
      }
    } else if (dateFrom && dateTo) {
      query = query.gte('event_date', dateFrom).lte('event_date', dateTo)
      eventsQuery = eventsQuery.gte('event_date', dateFrom).lte('event_date', dateTo)
    } else if (dateFrom) {
      query = query.eq('event_date', dateFrom)
      eventsQuery = eventsQuery.eq('event_date', dateFrom)
    }

    const waFrom = dateFrom ?? new Date().toISOString().split('T')[0]
    const waTo   = dateTo   ?? waFrom
    const [{ data: orders }, { data: waLogs }, { data: eventRows }] = await Promise.all([
      query,
      supabase
        .from('whatsapp_logs')
        .select('classification, possible_miss')
        .eq('truck_id', truck.id)
        .gte('created_at', `${waFrom}T00:00:00`)
        .lte('created_at', `${waTo}T23:59:59`),
      eventsQuery,
    ])

    // ── EVENT LOOKUP MAPS (V9.6) ───────────────────────────────────────────────────────────────────
    // eventsMap is now keyed by event ID, not event_date. Every consumer is a DISPLAY LABEL (the order
    // history row's venue, the Orders CSV "Event" column, the Items CSV "Event" column) — none feeds a
    // total — so the re-key cannot change a number.
    // 🔴 KEYING BY DATE WAS A LATENT BUG, NOT A FEATURE: `if (!eventsMap[ev.event_date])` meant the FIRST
    // event on a date won, so on a two-event date every order was labelled with the wrong venue half the
    // time. Same class as `id` (the per-event display number) vs `order_key`. This is a FIX.
    // van_id rides along so the client can filter by the EVENT's van.
    const eventsMap: Record<string, { venue_name: string | null; town: string | null; van_id: string | null }> = {}
    for (const ev of (eventRows || [])) {
      eventsMap[ev.id] = { venue_name: ev.venue_name, town: ev.town, van_id: ev.van_id ?? null }
    }
    // ⚠️ DATE FALLBACK, RETAINED DELIBERATELY. An order with a NULL event_id (pre-event_id history, or any
    // path that never stamped it) would otherwise drop from "Unknown event" labelling that today resolves
    // via its date. Same first-wins rule as the old map, so those rows label EXACTLY as they do now — the
    // re-key is a strict improvement with no regression for anyone.
    const eventsByDate: Record<string, { venue_name: string | null; town: string | null }> = {}
    for (const ev of (eventRows || [])) {
      if (!eventsByDate[ev.event_date]) eventsByDate[ev.event_date] = { venue_name: ev.venue_name, town: ev.town }
    }

    const whatsappStats = waLogs && waLogs.length > 0 ? {
      total:   waLogs.length,
      handled: waLogs.filter((w: any) => w.classification !== 'IGNORE').length,
      misses:  waLogs.filter((w: any) => w.possible_miss).length,
    } : null

    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, report: whatsappStats ? { whatsappStats } : null })
    }

    // Revenue-by-category: order items jsonb carries NO category, so join the truck's menu here by item
    // NAME → category NAME (itemCategories), plus the menu's category order (categoryOrder) for display.
    const [{ data: catRows }, { data: menuRows }] = await Promise.all([
      supabase.from('menu_categories').select('id, name, sort_order').eq('truck_id', truck.id).eq('is_active', true).order('sort_order'),
      supabase.from('menu_items_db').select('name, category_id').eq('truck_id', truck.id),
    ])
    const catById: Record<string, string> = {}
    for (const c of (catRows || [])) catById[c.id] = c.name
    const itemCategories: Record<string, string> = {}
    for (const mi of (menuRows || [])) {
      if (mi.name && mi.category_id && catById[mi.category_id]) itemCategories[mi.name] = catById[mi.category_id]
    }
    const categoryOrder = (catRows || []).map((c: any) => c.name)

    const totalRevenue = orders.reduce((s: number, o: any) => s + (o.total || 0), 0)
    const dealsRedeemed = orders.filter((o: any) => (o.discount_amt || 0) > 0).length
    const dealSavings = orders.reduce((s: number, o: any) => s + (o.discount_amt || 0), 0)

    const itemMap: Record<string, { qty: number; revenue: number }> = {}
    orders.forEach((order: any) => {
      const items = Array.isArray(order.items) ? order.items : []
      items.forEach((item: any) => {
        const key = item.name
        if (!itemMap[key]) itemMap[key] = { qty: 0, revenue: 0 }
        itemMap[key].qty += item.quantity || 1
        itemMap[key].revenue += (item.unit_price || 0) * (item.quantity || 1)
      })
    })

    const topItems = Object.entries(itemMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)

    return NextResponse.json({
      ok: true,
      report: {
        totalOrders: orders.length,
        totalRevenue,
        avgOrder: totalRevenue / orders.length,
        topItems,
        dealsRedeemed,
        dealSavings,
        upsellRevenue: 0,
        whatsappStats,
        orders,
        eventsMap,
        eventsByDate,
        itemCategories,
        categoryOrder,
      },
    })
  }

  if (action === 'get_exclusion_terms') {
    const { data } = await supabase
      .from('excluded_terms')
      .select('id, term, created_at')
      .eq('truck_id', truck.id)
      .order('created_at', { ascending: false })
    return NextResponse.json({ terms: data ?? [] })
  }

  if (action === 'add_exclusion_term') {
    const { normaliseExclusionTerm } = await import('@/lib/schedule-extract')
    const normalised = normaliseExclusionTerm(body.term ?? '')
    if (!normalised) return NextResponse.json({ error: 'Empty term' }, { status: 400 })
    const { data: upserted } = await supabase.from('excluded_terms').upsert(
      { truck_id: truck.id, term: normalised },
      { onConflict: 'truck_id,term' }
    ).select('id').single()
    return NextResponse.json({ ok: true, id: upserted?.id ?? null })
  }

  if (action === 'remove_exclusion_term') {
    const { id } = body
    await supabase.from('excluded_terms').delete().eq('id', id).eq('truck_id', truck.id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'get_recent_events') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    // Reports are about past/present activity — NO future events. Upper-bound at truck-local today (server
    // filter so the limit(20) budget is spent on real past events, not crowded out by future ones).
    const todayLocal = getLocalDateInTz((truck as any).timezone ?? 'Europe/London')
    const { data: events } = await supabase
      .from('truck_events')
      .select('id, venue_name, event_date, status')
      .eq('truck_id', truck.id)
      .gte('event_date', thirtyDaysAgo)
      .lte('event_date', todayLocal)   // ≤ today only — never a future event in the Reports picker
      // Report on events that actually happened — confirmed/open/closed only. Excludes 'cancelled'
      // (rejected events, per the reject flow) and 'unconfirmed' (scraped-but-unapproved) from the picker.
      .in('status', ['confirmed', 'open', 'closed'])
      .order('event_date', { ascending: false })
      .limit(20)
    return NextResponse.json({ ok: true, events: events || [] })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

