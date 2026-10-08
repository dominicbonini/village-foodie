// app/api/manage/route.ts
// Truck management API — handles all CRUD for menu, modifiers, deals, events, settings
// Authenticated via dashboard token + PIN (same as orders dashboard)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveTruckLogo } from '@/lib/truck-logo'
// 🔴 THE SERVER-SIDE REDUCTION. This is the ONLY thing that reads whatsapp_connections for the client,
// and it returns no token, no ciphertext and no ids — see lib/whatsapp/connection-read.ts.
import { readWhatsAppConnection, type WhatsAppConnectionView } from '@/lib/whatsapp/connection-read'
import { isMonthlyReplyLimit, MONTHLY_REPLY_LIMIT_CHOICES, DEFAULT_MONTHLY_REPLY_LIMIT } from '@/lib/whatsapp/reply-cap'
import { readMonthlyUsage } from '@/lib/whatsapp/usage'
import { planDisconnect } from '@/lib/whatsapp/disconnect-plan'
import { decryptToken } from '@/lib/whatsapp/token-crypto'
import { GRAPH_VERSION } from '@/lib/whatsapp/graph-version'
import { WHATSAPP_LIVE } from '@/lib/whatsapp-live'
import { hasWhatsAppSetupPreview } from '@/lib/whatsapp/setup-preview'
import { HATCHGRAB_SENDER, HATCHGRAB_LOGO_URL } from '@/lib/email-config'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { generateSlots } from '@/lib/slots'   // EXTRACTED from this file — now shared with the demo provisioner
import { getSoleActiveVanId, getVanOrderReadyDefault } from '@/lib/van-utils'
import { hasValidEventTimes, getLocalDateInTz } from '@/lib/time-utils'
import { canAccess } from '@/lib/features'
/* ⚠️ THE ONE PLAN SENTENCE FOR SOCIAL MEDIA, shared with the screen and with `/api/weekly-post` — see
 * the header of `lib/copy/weeklyPost.ts` for why it is not written out twice. */
import { WEEKLY_POST_PLAN_REFUSAL } from '@/lib/copy/weeklyPost'
/* ── 🔴 PRIVATE EVENTS (20261014) ─────────────────────────────────────────────────────────────────
 * `applyPrivacy` is the ONLY writer of is_private / private_name / private_token / the private type
 * on an event — see its header. Nothing in this file writes those columns directly, and
 * scripts/private-events.cjs proves it. */
import { applyPrivacy, replacePrivateLink, privateLinkUrl } from '@/lib/private-events/write'
import { readPrivateType } from '@/lib/private-events/type'
import { resolveLinkOrdering } from '@/lib/private-events/resolve'
import { logAllergenChanges, diffItemAllergens, tagJson, arrEq, type Actor } from '@/lib/allergen-audit'
import { isDemoIdentifier, DEMO_PREFIX } from '@/lib/demo'
import { normaliseUrl } from '@/lib/url-normalise'
import { checkSubdomain, suggestFromWebsite } from '@/lib/custom-domain/apex'
import { checkCaa, detectDnsProvider, checkApexViaSoa } from '@/lib/custom-domain/dns'
import { addDomain, getDomainConfig, releaseDomain } from '@/lib/custom-domain/vercel'
import { recordRows, instructionsEmail as domainInstructionsEmail, liveEmail } from '@/lib/custom-domain/copy'
import { domainPreflightRatelimit, domainInstructionsRatelimit, domainCheckRatelimit } from '@/lib/ratelimit'
// 🔴 THE SHARED CHECK — the SAME function the cron runs. See lib/custom-domain/check.ts.
import { runDomainCheck } from '@/lib/custom-domain/check'
import { sendAdminDomainAlert } from '@/lib/custom-domain/alert'
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
import { INTERVAL_CHOICES, isIntervalChoice, readVanIntervalsForTruck, DEFAULT_INTERVAL } from '@/lib/slot-interval'
import {
  readVanCategorySettings, readVanCategorySettingsForTruck, readVanSameAsFirst,
  effectiveCategorySettings, firstVanId, vanCopyPayload, vanCategoryCopyRows, VAN_COPY_FIELDS,
  CAPACITY_COPY_FIELDS, capacityCopyPayload, capacityAllSame,
} from '@/lib/van-category-settings'
/* 🔴 "Do you take cash?" PER VAN (5 October 2026). Its own PROBED reader, for the reason that file's
 * header gives: naming `takes_cash` on `get_vans`' select would empty the van list on a 42703. */
import { readVanTakesCashForTruck } from '@/lib/payments/van-cash'
// 🔴 ONE DEFINITION OF "WHICH PLACE IS THIS EVENT AT", IMPORTED NOT RE-WRITTEN. Stages 2 and 3 import
// the same module; a second normaliser here would make events stop finding their place with no error.
import {
  normalisePlaceName, planPlaceSeed, nextEventAt, lastEventAt, tradedCountInLastYear,
  groupEventsByPlace, seedWindowStart, mergeRefusal, mergePatch, resolvePlaceMerge, placesById,
  /* 🔴 `countsAsTraded` FOR THE PLACES TAB'S "used N times" (20261015) — the SAME predicate the
   * last-year count uses, so one place cannot be "used 9 times" by one rule and 7 by another. */
  /* ⛔ `countsAsUpcoming` WENT WITH `sg_place_events` (5 October 2026). It split that action's rows
   * into upcoming and past; `sg_places` uses `nextEventAt`/`lastEventAt`, which do their own. */
  countsAsTraded,
  /* 🔴 `placeForEvent` FOR THE HISTORY RULE'S PER-PLACE ANSWER — it resolves a place to its MERGE
   * TARGET, so a merged pitch takes the history its events now belong to. (It fed the old
   * "Automatic (…)" label; the label is gone, the answer is what the Places tab's pill row selects.) */
  placeForEvent,
  type PlaceEvent, type Place as SgPlace,
} from '@/lib/schedule-graphics/places'
/* 🔴 THE AUTOMATIC RULE AND THE WORD "Standard", both from the event-types module, so the Places
 * control's label and the Add event pre-selection are the same rule and the same word. */
import { readPlaceTypeHistory, STANDARD_TYPE_NAME } from '@/lib/event-types/read'
/* ⛔ `readImageInfo` WAS IMPORTED HERE (5 October 2026). It measured an uploaded `place_pictures` row
 * server-side rather than trusting the browser's numbers. That pane and its four routes are deleted;
 * the POST picture is measured by the same function on /api/weekly-post, which is where it always was. */

// ── PER-ROUTE CEILING ─────────────────────────────────────────────────────────────────────────────
// THE MANAGE PAYLOAD. One GET assembling the whole console: truck, categories, items, subcategories,
// modifier groups/options, category+item group links, bundles with stock, codes, events, upsell rules,
// operator identity and any pending email change. No Stripe API call.
// SLOWEST LEGITIMATE CASE: a truck with a large menu and many events — the widest fan-out of sequential
// reads in the app, wider than /api/dashboard. Given the same ~50ms round trip, a healthy run is low
// hundreds of milliseconds; 30s is the same ceiling /api/dashboard carries and ample for the fan-out.
// IF EXCEEDED: 504. The page's load() catch shows the standing staleness bar and keeps what it has.
export const maxDuration = 30


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

/**
 * The `truck_places` row an operator-created event should link to, or null.
 *
 * 🔴 THREE OUTCOMES, AND `null` IS A FIRST-CLASS ONE:
 *   1. they picked a place → verify it is this truck's, follow any merge, use it;
 *   2. they typed a venue name → upsert the place for that normalised name and use it;
 *   3. anything unexpected → null, and matching falls back to the venue anchor and the name.
 *
 * ⚠️ IT SWALLOWS ITS OWN ERRORS ON PURPOSE. This runs in the middle of adding an event. A place table
 * that is missing (the migration not applied yet), a permission problem or a race must cost the LINK,
 * never the event — `truck_place_id` is an optimisation of matching, not a requirement for it.
 * ⚠️ THE MERGE IS FOLLOWED HERE TOO, so a picked place that has since been merged stores its target
 * rather than a row that is no longer in the list.
 */
async function resolveEventPlaceId(
  truckId: string,
  pickedPlaceId: string | null,
  venueName: unknown,
  town: unknown,
): Promise<string | null> {
  try {
    if (pickedPlaceId) {
      // ⚠️ SCOPED BY `truck_id`: a place id is a uuid a client supplies, and one truck must never be
      // able to link its event to another truck's place.
      const { data } = await supabase
        .from('truck_places').select('id, merged_into_id').eq('truck_id', truckId)
      const all = (data ?? []) as SgPlace[]
      const picked = placesById(all).get(pickedPlaceId)
      if (!picked) return null
      return resolvePlaceMerge(picked, placesById(all)).id
    }
    const name = String(venueName ?? '').trim()
    const name_key = normalisePlaceName(name)
    if (!name_key) return null
    /* 🔴 THE SAME IDEMPOTENT RULE AS THE SEEDER — `on conflict (truck_id, name_key) do nothing`, so
     * two events added at the same moment for a new venue produce ONE place. `ignoreDuplicates` then a
     * read-back: never `do update`, which would overwrite a name the operator had edited. */
    await supabase.from('truck_places').upsert(
      { truck_id: truckId, venue_id: null, name_key, name, area: String(town ?? '').trim() || null },
      { onConflict: 'truck_id,name_key', ignoreDuplicates: true },
    )
    const { data: row } = await supabase
      .from('truck_places').select('id, merged_into_id').eq('truck_id', truckId).eq('name_key', name_key).maybeSingle()
    if (!row) return null
    const place = row as SgPlace
    if (!place.merged_into_id) return place.id
    const { data: all } = await supabase.from('truck_places').select('id, merged_into_id').eq('truck_id', truckId)
    return resolvePlaceMerge(place, placesById((all ?? []) as SgPlace[])).id
  } catch (e) {
    console.warn('[resolveEventPlaceId] no place linked:', e instanceof Error ? e.message : String(e))
    return null
  }
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

  // ── 🔴 THE WHATSAPP CONNECTION VIEW (S2). REDUCED SERVER-SIDE; NO TOKEN TRAVELS. ──────────────────
  // `readWhatsAppConnection` collapses the stored ciphertext to `tokenPresent: boolean` before anything
  // leaves the server, and returns only { state, offerSignup, offerReauthorise, expiringSoon }.
  // ⚠️ IT IS DELIBERATELY NOT SPREAD INTO `truck`. `truck` is the row read with `select('*')`, and mixing
  // a derived security-relevant view into it is how a future column ends up somewhere nobody looked.
  // 🔴 FAILS TO 'not_connected' IF THE TABLE IS ABSENT — supabase/migrations/20260904_whatsapp_connections.sql
  // is applied BY HAND and may not have been run. That must not take out the Settings tab.
  const whatsappConnection = await readWhatsAppConnection(supabase, truck.id)

  // ── 🔴 THIS MONTH'S USAGE, THROUGH THE SAME FUNCTION THE WEBHOOK ENFORCES WITH ──────────────────
  // `readMonthlyUsage` owns the month boundary and the "what counts" rule. If this line computed its own
  // window, the operator could read "120 of 250" while the webhook had already gone silent — the single
  // worst thing a usage display can do.
  // ⚠️ NON-FATAL. A failed count must not take Settings down; `used: 0` with the real limit is an honest
  // "we could not read it" that still renders the row.
  let whatsappUsage: { used: number; limit: number; resetsOn: string; atLimit: boolean } | null = null
  try {
    const limit = (truck.whatsapp_monthly_reply_limit as number | null) ?? DEFAULT_MONTHLY_REPLY_LIMIT
    const u = await readMonthlyUsage({
      truckId: truck.id,
      timezone: (truck.timezone as string | null) ?? null,
      limit,
      count: async (truckId, sinceIso) => {
        const { count } = await supabase
          .from('whatsapp_logs')
          .select('*', { count: 'exact', head: true })
          .eq('truck_id', truckId)
          .not('response_sent', 'is', null)
          .gte('created_at', sinceIso)
        return count ?? 0
      },
    })
    whatsappUsage = { used: u.used, limit: u.limit, resetsOn: u.resetsOn, atLimit: u.atLimit }
  } catch (e) {
    console.warn('[manage] whatsapp usage read failed — row still renders', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    truck: { ...truck, logo },
    whatsappConnection,
    whatsappUsage,
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
/**
 * The event type id from a request body, checked against this truck's own types.
 *
 * ⚠️ RETURNS NULL FOR ANYTHING IT CANNOT CONFIRM — absent, blank, malformed, another truck's, or a
 * read failure. The event is then created as Standard, which is exactly what it would have been
 * before this feature existed, so a bad id costs the type and never the event.
 */
async function resolveRequestedTypeId(truckId: string, raw: unknown): Promise<string | null> {
  const id = typeof raw === 'string' && raw.trim() ? raw.trim() : null
  if (!id) return null
  try {
    const { data, error } = await supabase
      .from('event_types').select('id').eq('id', id).eq('truck_id', truckId).maybeSingle()
    if (error || !data) return null
    return String((data as { id: string }).id)
  } catch { return null }
}

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
    // Schedule › Places. ⚠️ `sg_places` IS A WRITE DESPITE READING LIKE A READ — opening the pane
    // seeds a place row per pitch in the schedule, so it belongs on this list with the rest. The
    // Schedule tab is owner/manager, so staff never reach it; this is the half a request cannot skip.
    // ⚠️ UNCHANGED BY THE PLAN-GATE REMOVAL: dropping the plan gate widens WHICH PLANS may use this,
    // never WHICH ROLES. Staff are still refused.
    'sg_places', 'sg_upsert_place', 'sg_merge_place',
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
    'domain_preflight', 'domain_status', 'domain_check', 'domain_provision', 'domain_confirm', 'domain_send_instructions', 'domain_turn_off',
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

  /* ══ 🔴 THE LINK & QR PANEL: READ (20261014) ══════════════════════════════════════════════════════
   * Returns the event's live link, its name, and whether link ordering is on for it. The TOKEN itself
   * is returned, because the panel has to show the link, offer Copy, and draw a QR code of it — there
   * is no way to do that without the secret, and the caller is the operator's own dashboard token.
   * ⛔ IT IS SCOPED TO THE TOKEN'S TRUCK. `.eq('truck_id', truck.id)` on the read means an operator
   * cannot ask for another truck's event, which matters more here than almost anywhere else in this
   * file: the answer is a working credential.
   * ⚠️ THE URL IS BUILT BY `privateLinkUrl`, the one definition the QR, the Copy button and the
   * printed cards all use — three places that would otherwise drift. */
  if (action === 'private_link') {
    if (!canAccess(truck.plan, 'private_events', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return NextResponse.json({ error: 'Private events are part of the Pro plan.', upgrade: true }, { status: 403 })
    }
    const eventId = String(body.id ?? '')
    const { data: ev, error } = await supabase
      .from('truck_events')
      .select('id, is_private, private_name, private_token, private_link_ordering_override, event_date, start_time, end_time')
      .eq('id', eventId).eq('truck_id', truck.id).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (!ev.is_private) return NextResponse.json({ error: 'This event is not private.' }, { status: 400 })

    const type = await readPrivateType(supabase, truck.id)
    const linkOrdering = resolveLinkOrdering(ev, type)
    return NextResponse.json({
      ok: true,
      eventId: ev.id,
      name: ev.private_name ?? null,
      date: ev.event_date,
      startTime: ev.start_time ?? '',
      endTime: ev.end_time ?? '',
      linkOrdering,
      /* ⚠️ null WHEN ORDERING BY LINK IS OFF — there genuinely is no link then, and returning a stale
       * token would let the panel draw a QR code for something that refuses orders. */
      token: linkOrdering ? (ev.private_token ?? null) : null,
      url: linkOrdering && ev.private_token ? privateLinkUrl(ev.private_token) : null,
      truckName: truck.name,
    })
  }

  /* ══ 🔴 "MAKE A NEW LINK" (20261014, decision 7) ═══════════════════════════════════════════════════
   * The old token stops working immediately and is RETIRED, so a printed card says "replaced" rather
   * than 404ing. The whole of that is in `replacePrivateLink`; this is the gate and the plumbing.
   * ⛔ THE OPERATOR HAS ALREADY CONFIRMED IN THE UI, and the confirm names the consequence that cannot
   * be undone — the cards already on the tables. The route does not re-ask, but it also cannot be
   * reached by accident: it is its own action with its own name. */
  if (action === 'private_new_link') {
    if (!canAccess(truck.plan, 'private_events', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
      return NextResponse.json({ error: 'Private events are part of the Pro plan.', upgrade: true }, { status: 403 })
    }
    const r = await replacePrivateLink(supabase, truck.id, String(body.id ?? ''))
    if (!r.ok) return NextResponse.json({ error: r.error || 'Could not make a new link.' }, { status: 400 })
    return NextResponse.json({
      ok: true, token: r.token,
      url: r.token ? privateLinkUrl(r.token) : null,
      name: r.name, truckName: truck.name,
    })
  }

  // ── EVENT CRUD ────────────────────────────────────────────
  if (action === 'upsert_event') {
    const { id, venue_name, town, postcode, address, event_date, start_time, end_time, notes, latitude, longitude, van_id } = body
    /* ── 🔴 `truck_place_id` IS READ HERE AND USED ONLY IN THE INSERT BRANCH ───────────────────────
     * The destructure above is a FIXED list and nothing in this handler spreads `body`, so an edit
     * cannot carry a stray column into the update — that is why the client is free to send the whole
     * `editingEvent` object, as it always has.
     * 🔴 AND IT IS DELIBERATELY NOT IN THE UPDATE OBJECT BELOW. Editing an event must never clear or
     * change its place: the operator is changing a date or a time, and re-deriving the link from an
     * edited venue name is exactly how a correction for one evening would silently move a pitch's
     * whole history. Asserted from source by scripts/schedule-graphics-places.cjs. */
    const pickedPlaceId = typeof body.truck_place_id === 'string' && body.truck_place_id ? body.truck_place_id : null
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

      /* ══ 🔴 THE PRIVATE TICK ON AN EDIT — BOTH DIRECTIONS (20261014) ════════════════════════════
       * ⛔ ONLY WHEN THE CLIENT ACTUALLY SENT THE KEY. `body.is_private === undefined` means "this
       * form did not ask about privacy", and treating that as `false` would make every OTHER editor
       * of an event silently publish a private one. The Edit event panel always sends it; nothing
       * else does.
       * 🔴 UNTICKING IS THE DESTRUCTIVE DIRECTION AND IT IS THE ONE THE HELPER HANDLES CAREFULLY: it
       * retires the token (so printed cards say "replaced" rather than 404), clears the name and
       * clears the Private type. Decision 8: "Unticking makes the event normal/public and clears its
       * link."
       * ⚠️ THE GATE IS CHECKED ONLY WHEN TURNING PRIVACY **ON**. A downgraded truck must still be able
       * to make a private event public — refusing that would strand them, and it is the safe
       * direction anyway. */
      if (body.is_private !== undefined) {
        const wantPrivate = body.is_private === true
        if (wantPrivate
          && !canAccess(truck.plan, 'private_events', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
          return NextResponse.json({ error: 'Private events are part of the Pro plan.', upgrade: true }, { status: 403 })
        }
        const pr = await applyPrivacy(supabase, targetTruckId, String(id), {
          isPrivate: wantPrivate,
          name: body.private_name,
        })
        if (!pr.ok) return NextResponse.json({ error: pr.error || 'Could not save this event’s privacy.' }, { status: 400 })
        savedEvent = {
          ...(savedEvent as Record<string, unknown>),
          is_private: pr.isPrivate, private_name: pr.name, private_token: pr.token,
        }
      }
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
      /* ══ 🔴 THE MERGE OF BOTH BRANCHES' INSERTS (October 2026) ══════════════════════════════════
       * BOTH changes to this one statement survive, and they are independent of each other:
       *   • `truck_place_id` (schedule-graphics) — the operator's picked place, or the place the typed
       *     venue name belongs to. Every hand-made event carries its link, so the Places list is
       *     complete without backfilling a row.
       *   • `event_type_id` + the order-ready seed rule (event-types) — see below.
       * ⚠️ NEITHER MAY FAIL THE SEND. Both resolvers fall back to `null`, which is the state of every
       * event in the table today: no place link, no type, exactly today's behaviour.
       * ⚠️ BOTH KEYS ARE NAMED UNCONDITIONALLY rather than spread in behind a ternary. Both columns are
       * nullable with no default, so an explicit `null` and an omitted key are the same write — and a
       * named literal is one the AST reader in the harness can SEE, which is what lets it prove this is
       * the only insert that writes `truck_place_id` and that no update does. */
      /* ── 🔴 THE ONE NEW THING THIS INSERT DOES ─────────────────────────────────────────────────
       * `resolvedPlaceId` is the operator's picked place, or — when they typed a venue instead of
       * picking — the place that venue name belongs to, created if it is new. So every event the
       * operator creates by hand carries its link, which is what makes the Places list complete
       * without ever backfilling an existing row.
       * ⚠️ IT NEVER FAILS THE SEND. Every branch below falls back to `null`, which is the state of
       * every event in the table today: matching then uses the venue anchor and the name, exactly as
       * it did in stage 1. A place-lookup problem must not stop an operator adding an event.
       * ⚠️ THE KEY IS NAMED UNCONDITIONALLY, `truck_place_id: resolvedPlaceId`, rather than spread in
       * behind a ternary. The column is nullable with no default, so an explicit `null` and an omitted
       * key are the same write — and a named literal is one the AST reader in the harness can SEE, which
       * is what lets it prove this is the only insert that writes it and that no update does. */
      const resolvedPlaceId = await resolveEventPlaceId(targetTruckId, pickedPlaceId, venue_name, town)
      /* ── 🔴 THE EVENT TYPE, AND THE ONE REASON THE SEED IS SKIPPED ─────────────────────────────
       * `event_type_id` is the whole of what a type does to an event: nothing is copied onto it.
       *
       * 🔴 WHEN A TYPE IS CHOSEN, order_ready_override IS NOT SEEDED. That column is the one per-event
       * override that is seeded at creation AND bulk-written when the van default flips, so a seeded
       * value would make the type's mark-ready setting permanently inert on this event — offered on
       * the type screen and silently doing nothing. Leaving it NULL lets the type supply it, and the
       * truck can still override it on the dashboard afterwards (which records 'truck' and wins).
       * ⚠️ UNTYPED EVENTS ARE SEEDED EXACTLY AS BEFORE — same value, same column, same van lookup. The
       * ternary is the whole difference, and it can only take the new branch when a type was picked.
       * ⚠️ VALIDATED AGAINST THIS TRUCK'S OWN TYPES. An id from another truck, or one that does not
       * exist, resolves to NULL rather than erroring: the event is still created, as Standard, which is
       * what it would have been without the field. The foreign key would refuse a bad id anyway; this
       * makes the refusal a silent fallback rather than a failed save of a real event. */
      const typedEventTypeId = await resolveRequestedTypeId(targetTruckId, body.event_type_id)
      const { data, error } = await supabase.from('truck_events').insert({ truck_id: targetTruckId, venue_name, town: town ?? null, postcode: postcode ?? null, address, event_date, start_time, end_time, notes, latitude: latitude ?? null, longitude: longitude ?? null, van_id: resolvedVanId ?? null, order_ready_override: typedEventTypeId ? null : seededOrderReady, order_ready_source: typedEventTypeId ? null : 'seed', event_type_id: typedEventTypeId, source: 'manual', status: eventStatus, confirmed_at: eventStatus === 'confirmed' ? now : null, auto_open: truck.default_auto_open ?? true, auto_close: truck.default_auto_close ?? true, truck_place_id: resolvedPlaceId }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      savedEvent = data

      /* ══ 🔴 THE PRIVATE TICK, APPLIED AFTER THE INSERT (20261014) ═══════════════════════════════
       * ⛔ NOT A COLUMN IN THE INSERT ABOVE, AND THAT IS DELIBERATE. Making an event private is FOUR
       * coupled writes (is_private, the Private type, the name, a freshly generated token) plus a
       * lazily created type row — so it goes through the one helper that owns all of them together.
       * Spreading them into this insert would make this the second writer of a state whose
       * inconsistent combinations are all defects, and would need the type to exist first.
       * ⚠️ A FAILURE DOES NOT UNDO THE EVENT. The event is created either way and the operator is told
       * the privacy part failed — losing an event they just typed in, because a type row could not be
       * made, would be the worse trade. The event is simply public until they save again.
       * ⚠️ AND IT IS SKIPPED ENTIRELY WHEN THE TICK IS OFF, which is every event today: `applyPrivacy`
       * returns without writing for a public event that stays public, so this adds no write to any
       * existing flow. */
      if (body.is_private === true) {
        const gate = canAccess(truck.plan, 'private_events', truck.feature_overrides ?? {}, truck.trial_expires_at)
        if (!gate) {
          return NextResponse.json({ error: 'Private events are part of the Pro plan.', upgrade: true }, { status: 403 })
        }
        const pr = await applyPrivacy(supabase, targetTruckId, String(data.id), {
          isPrivate: true,
          name: body.private_name,
        })
        if (!pr.ok) return NextResponse.json({ error: pr.error || 'Could not make this event private.' }, { status: 400 })
        savedEvent = { ...(savedEvent as Record<string, unknown>), is_private: true, private_name: pr.name, private_token: pr.token }
      }

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

  /**
   * ── 🔴 THE ON-DEMAND CHECK. THE FIX FOR THE ELEVEN-HOUR DEAD PAGE. ────────────────────────────
   *
   * `custom_domain_verified_at` was writable ONLY by the 07:00 UTC cron. The first operator through
   * this feature had DNS resolving and a certificate issued and a dead page until the next morning,
   * because the row was one timestamp short and nothing but a daily job could write it.
   *
   * ⚠️ FIRED WHEN THE SETUP BOX OPENS, NOT WHEN THE WIZARD FINISHES. An operator who has just added a
   * record will come back and look; a single check at completion nearly always fails on propagation
   * and reads as broken. Opening the box IS the gesture that means "has it worked yet".
   *
   * 🔴 IT RUNS THE SAME CHECK AS THE CRON — literally the same function, `runDomainCheck`. Two
   * implementations of "is this domain working" would disagree, and the disagreement would present as
   * a dashboard that says live and a cron that says not.
   *
   * 🔴 IT CANNOT HARM A LIVE ROW. `runDomainCheck`'s patch is additive: `custom_domain_verified_at` is
   * written only on the going-live transition and is NEVER cleared, and `custom_domain`,
   * `custom_domain_setup_state` and `custom_domain_confirmed_at` are never touched. A failing check on
   * a trading truck records what it saw and leaves the page serving. See that module.
   */
  if (action === 'domain_check') {
    if (!truck.custom_domain) {
      return NextResponse.json({ ok: false, reason: 'no_domain' }, { status: 200 })
    }

    // ── THE LIMIT, KEYED ON THE TRUCK ────────────────────────────────────────────────────────────
    // 🔴 ENFORCED HERE, NOT IN proxy.ts. That file limits a POSITIVE ALLOWLIST of public,
    // bulk-scrapeable paths and operator surfaces are structurally excluded from it — its own comment
    // makes that point. An authenticated operator route's limit belongs with the operator route.
    // ⚠️ A REFUSAL IS NOT AN ERROR HERE. The operator gets the state we already hold rather than a
    // failure: they opened a box, they did not ask for a network call.
    let checkedNow = false
    if (process.env.NODE_ENV === 'production') {
      try {
        const { success } = await domainCheckRatelimit.limit(`domain_check:${truck.id}`)
        checkedNow = success
        if (!success) console.warn(`[domain_check] rate limited truck=${truck.id}`)
      } catch (e) {
        // ⚠️ FAILS OPEN, and the cache is the only thing that can fail here. Refusing the check
        // because Redis is unwell would recreate the dead-page bug for the sake of a rate limit.
        console.warn('[domain_check] limiter unavailable, proceeding:', e instanceof Error ? e.message : String(e))
        checkedNow = true
      }
    } else {
      checkedNow = true   // dev bypass, mirroring the whatsapp-preview route
    }

    if (!checkedNow) {
      return NextResponse.json({
        ok: true, rate_limited: true,
        live: !!truck.custom_domain_verified_at,
        state: truck.custom_domain_verified_at ? 'ok' : 'waiting',
      })
    }

    const result = await runDomainCheck({
      host: truck.custom_domain,
      verifiedAt: truck.custom_domain_verified_at ?? null,
      lastOkAt: truck.custom_domain_last_ok_at ?? null,
      lastCheckedAt: truck.custom_domain_last_checked_at ?? null,
      setupStartedAt: truck.custom_domain_setup_started_at ?? null,
    })

    // 🔴 THE WRITE HAPPENS BEFORE THE EMAILS. A failed send must not cost us a correct row.
    const { error: writeErr } = await supabase.from('trucks').update(result.patch).eq('id', truck.id)
    if (writeErr) console.error('[domain_check] write failed:', writeErr.message)

    // ⚠️ THE OPERATOR'S "IT'S LIVE" EMAIL FIRES HERE TOO, and it still fires ONCE — the transition is
    // `verified_at` going from null to set, which can only happen on one check whichever caller sees
    // it first. Without this an operator who is told by the screen would never get the email.
    if (result.goingLive && truck.contact_email) {
      try {
        const mail = liveEmail({ truckName: truck.name, address: truck.custom_domain })
        await sendConfirmationEmail({ to: truck.contact_email, subject: mail.subject, html: mail.html, text: mail.text, senderName: 'HatchGrab' })
      } catch (e) {
        console.warn('[domain_check] live email failed:', e instanceof Error ? e.message : String(e))
      }
    }

    // 🔴 THE ADMIN ALERT IS EVALUATED HERE TOO, AND THAT IS NOT OPTIONAL. This route writes
    // `custom_domain_last_checked_at`, and the once-per-transition rule compares the threshold against
    // that column — so if only the cron sent, an operator opening the box could step the timestamp
    // past the line and the cron would never see the transition. The alert would be swallowed by the
    // very feature meant to help. See lib/custom-domain/check.ts.
    if (result.alert) {
      await sendAdminDomainAlert({
        alert: result.alert,
        truckName: truck.name,
        truckId: truck.id,
        address: truck.custom_domain,
        startedAt: truck.custom_domain_setup_started_at ?? null,
        lastOkAt: truck.custom_domain_last_ok_at ?? null,
        lastSeenValue: result.seen,
        expected: result.expected,
      })
    }

    return NextResponse.json({
      ok: true,
      // 🔴 `live` IS WHAT THE PAGE ACTUALLY SERVES ON: verified_at, either already set or set by this
      // check. Never `result.state === 'ok'` alone — a passing check on a row that was already live is
      // still live, and a failing check on a live row does NOT make it not live.
      live: !!(truck.custom_domain_verified_at || result.patch.custom_domain_verified_at),
      went_live: result.goingLive,
      state: result.state,
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
    const allowed = ['crew_mode', 'kds_mode', 'display_mode', 'extra_wait_mins', 'paused_until', 'whatsapp_sender', 'preferred_contact_method', 'allow_customer_cancellation', 'cancellation_cutoff_mins', 'default_auto_open', 'default_auto_close', 'qr_code_style', 'scraper_preference', 'schedule_url', 'scraper_rule', 'preorders_enabled', 'preorder_deadline_type', 'preorder_deadline_value', 'preorder_past_action', 'preorder_open_rule', 'truck_order_email_enabled', 'setup_step', 'show_paid_step', 'takes_cash', 'completion_presses', 'whatsapp_monthly_reply_limit']
    const safeData = Object.fromEntries(
      Object.entries(body.data || {}).filter(([key]) => allowed.includes(key))
    )

    // ── 🔴 THE FIRST VALUE VALIDATION ON THIS ROUTE, AND IT NEEDED TO BE ────────────────────────────
    // Every other key here is a free-text or boolean field where any value is a legitimate (if odd)
    // choice. This one has a DATABASE CHECK behind it, so an unlisted number would come back as a raw
    // Postgres 23514 rendered straight into a toast — a constraint name where a sentence should be.
    // ⚠️ THE CHECK STAYS AS THE BACKSTOP. This is not a replacement for it: this is the layer that can
    // say something useful, and the constraint is the one that cannot be bypassed.
    // 🔴 THE TWO COLLECTION INTERVALS — validated here for the same reason the reply limit is: both
    // columns carry a DATABASE CHECK (20260916_collection_intervals), so an unlisted value would come
    // back as a raw 23514. This layer says the sentence; the CHECK is the backstop. Both must be one of
    // INTERVAL_CHOICES; a null is refused (the UI never sends one — "Every 5 minutes" sends 5).
    if ('whatsapp_monthly_reply_limit' in safeData && !isMonthlyReplyLimit(safeData.whatsapp_monthly_reply_limit)) {
      return NextResponse.json({
        error: `Monthly reply limit must be one of ${MONTHLY_REPLY_LIMIT_CHOICES.join(', ')}.`,
      }, { status: 400 })
    }
    const { error } = await supabase.from('trucks').update(safeData).eq('id', truck.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }


  // ── 🔴 DISCONNECT WHATSAPP ───────────────────────────────────────────────────────────────────────
  // Same token scoping as every other write here: `getTruck(token)` resolved the truck above and every
  // statement below is `.eq('truck_id', truck.id)`. A token holder cannot name another truck.
  //
  // 🔴 IT NEVER CALLS `/{phone_number_id}/deregister`, AND THERE IS NO BRANCH THAT COULD. For a
  // coexistence truck the number is their own, working in the WhatsApp Business app; deregistering it
  // would break the phone they answer customers on in order to tidy up our side. Disconnect removes OUR
  // access. The operation list comes from `planDisconnect`, whose type has no deregister member.
  //
  // ⚠️ IT NEVER TOUCHES `trucks.phone_number_id` OR `trucks.whatsapp_sender`. test-truck holds Meta's
  // test number in the former and it must survive; the latter is the webhook's sender fallback and
  // customer-email contact value.
  if (action === 'disconnect_whatsapp') {
    // Gated exactly like the signup route — the UI hides the link, but the UI is not the enforcement.
    if (!WHATSAPP_LIVE && !hasWhatsAppSetupPreview(truck.feature_overrides)) {
      return NextResponse.json({ error: 'WhatsApp setup is not available for this account yet.' }, { status: 403 })
    }

    const { data: row } = await supabase
      .from('whatsapp_connections')
      .select('truck_id, waba_id, access_token_ciphertext, token_expires_at, token_revoked_at')
      .eq('truck_id', truck.id)
      .maybeSingle()

    // 🔴 "USABLE" IS DECIDED BY THE SAME RULES THE SEND PATH USES — present, not revoked, not expired,
    // and it must actually decrypt. Deciding it here rather than inside the plan keeps the plan pure.
    let token: string | null = null
    if (row?.access_token_ciphertext && !row.token_revoked_at) {
      const exp = row.token_expires_at ? Date.parse(row.token_expires_at as string) : NaN
      if (!Number.isNaN(exp) && exp > Date.now()) {
        try { token = decryptToken(row.access_token_ciphertext as string) } catch { token = null }
      }
    }

    const plan = planDisconnect({
      connection: row ? { wabaId: (row.waba_id as string | null) ?? null } : null,
      tokenUsable: !!token,
    })

    if (plan.alreadyDisconnected) {
      // Idempotent: the operator's intent is already satisfied.
      console.info('[manage] disconnect_whatsapp', { truck_id: truck.id, outcome: 'already_disconnected' })
      return NextResponse.json({ ok: true, unsubscribed: true, alreadyDisconnected: true })
    }

    let unsubscribed = false
    for (const op of plan.ops) {
      if (op.kind === 'unsubscribe_app') {
        try {
          const res = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(op.wabaId)}/subscribed_apps`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
          )
          unsubscribed = res.ok
        } catch {
          unsubscribed = false
        }
      } else {
        // 🔴 ALWAYS, EVEN WHEN META REFUSED. The operator asked us to stop; keeping the row would keep
        // replies going out on a connection they have disowned. Removing it deletes the stored key too —
        // the ciphertext lives on this row and nowhere else.
        const del = await supabase.from('whatsapp_connections').delete().eq('truck_id', truck.id)
        if (del.error) {
          console.error('[manage] disconnect_whatsapp', { truck_id: truck.id, outcome: 'row_delete_failed' })
          return NextResponse.json({ error: 'Could not disconnect. Nothing was changed — please try again.' }, { status: 500 })
        }
      }
    }

    // ⚠️ TRUCK ID AND OUTCOME ONLY. No WABA id, no token, no number.
    console.info('[manage] disconnect_whatsapp', { truck_id: truck.id, outcome: unsubscribed ? 'unsubscribed' : 'row_deleted_meta_not_reached' })
    return NextResponse.json({ ok: true, unsubscribed, alreadyDisconnected: false })
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
      // 🔴 THE INTERVAL COLUMNS ARE DELIBERATELY NOT NAMED HERE. This is the HEAD column list, and it
      // must stay that way. PostgREST fails the WHOLE statement with 42703 when one named column does
      // not exist, so adding a new column here does not degrade one field — it returns NO VANS, and
      // with them no Kitchen capacity box, no offline protection, no buzzers, no display settings.
      // OBSERVED on localhost, 17 September 2026, for exactly that reason. Deployed ahead of its
      // migration it would have hidden Pizzeria Gusto's only van from its own operator.
      // ⚠️ THE SAME TRAP STILL APPLIES TO buzzer_count (20260803) AND TO ANY FUTURE COLUMN: a setting
      // whose column may not exist yet belongs in a SEPARATE, probed read — see below — not here.
      .select('id, truck_id, name, kds_token, active, auto_pause_on_offline, offline_protection_mode, offline_auto_reject_mins, show_cooking_step, order_ready_enabled, display_layout, split_screen, kitchen_capacity, capacity_window_mins, buzzer_count')
      .eq('truck_id', truck.id)
      .eq('active', true)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // The intervals, SEPARATELY and tolerantly. `ok: false` ⇒ the columns could not be read at all;
    // every van still comes back, at the values every van holds anyway (5 / null), and the client is
    // told so it can say the setting is unavailable rather than silently showing a wrong default.
    const intervals = await readVanIntervalsForTruck(supabase, truck.id)
    const vans = (data || []).map(v => {
      const iv = intervals.byVanId.get((v as { id: string }).id)
      return {
        ...v,
        collection_interval_mins: iv ? iv.customer : DEFAULT_INTERVAL,
        // 🔴 THE RAW STORED OVERRIDE, never the resolved `truck`. The tickbox is derived from this
        // being non-null, and an override deliberately set EQUAL to the customer value is still an
        // override — deriving it from `truck !== customer` would untick the box on the next load.
        operator_collection_interval_mins: iv ? iv.rawOverride : null,
      }
    })
    /* ══ 🔴 THE PER-VAN CATEGORY SETTINGS AND THE "SAME AS VAN 1" SWITCH ════════════════════
     * ⚠️ TWO SEPARATE, PROBED READS — the rule stated on the named select above: a table or column
     * that may not exist yet must not be able to fail the statement that returns the vans, or an
     * operator would lose sight of their own vans the moment this shipped ahead of its migration.
     * Both degrade to "no per-van rows, every switch off", which is exactly the pre-migration truth.
     * 🔴 `firstVanId` IS COMPUTED FROM THE LIST THIS HANDLER JUST ORDERED, so the switch's label names
     * the van at the top of the operator's own list and cannot drift from it. */
    const vanCats = await readVanCategorySettingsForTruck(supabase, truck.id)
    const sameAs = await readVanSameAsFirst(supabase, truck.id)
    /* 🔴 A THIRD PROBED READ, FOR THE SAME REASON (5 October 2026). `truck_vans.takes_cash` is added
     * by 20261012; naming it on the select above would empty the van list on a 42703, and Settings
     * draws every van from that list. Its failure is an empty map, which every caller reads as "every
     * van follows the truck" — today's truth for every van in the table. See lib/payments/van-cash.ts. */
    const vanCash = await readVanTakesCashForTruck(supabase, truck.id)
    const vansOut = vans.map(v => ({
      ...v,
      categorySettings: vanCats.byVanId.get((v as { id: string }).id) ?? [],
      same_as_first_van: sameAs.byVanId.get((v as { id: string }).id) ?? false,
      /* 🔴 THE RAW NULLABLE VALUE, NOT A RESOLVED BOOLEAN. `null` means "follow `trucks.takes_cash`",
       * and Settings has to be able to show that state rather than a flattened true/false — otherwise
       * a van that follows the truck would look like a van that had chosen the truck's value, and
       * changing the truck would appear not to work. `resolveVanTakesCash` does the flattening where
       * it is drawn. */
      takes_cash: vanCash.byVanId.get((v as { id: string }).id) ?? null,
      /* 🔴 THE CAPACITY SWITCH, SENT ALONGSIDE (October 2026). Menu › Kitchen capacity owns it and
       * Settings › Truck settings owns the other; they are two columns because a truck must be able
       * to give Van 2 the same service settings and a different kitchen. `readVanSameAsFirst` falls
       * the capacity flag back to the OLD one when the column is absent, so a deploy ahead of
       * 20261010 shows every van exactly the switch it has today. */
      capacity_same_as_first_van: sameAs.capacityByVanId.get((v as { id: string }).id) ?? false,
    }))
    return NextResponse.json({
      vans: vansOut,
      intervalsAvailable: intervals.ok,
      // The first van, by the ONE rule (oldest active). The client renders the switch on every van but
      // this one, and labels it with this van's name.
      firstVanId: firstVanId(vans as Array<{ id: string; active?: boolean | null; created_at?: string | null }>)
        ?? (vans[0] as { id?: string } | undefined)?.id ?? null,
      perVanCategoriesAvailable: vanCats.ok && sameAs.ok,
      /* 🔴 FALSE ⇒ 20261012 IS NOT APPLIED, and the per-van cash control is NOT drawn — the truck-level
       * one stays. A switch that cannot store anything is worse than no switch: the operator would set
       * it, see it save, and the hatch would go on using the truck value. */
      vanCashAvailable: vanCash.ok,
    })
  }

  // ── 🔴 THIS DESTRUCTURE IS AN ALLOWLIST, AND IT DROPS SILENTLY. ────────────────────────────────
  // A key that is not named on the line below never reaches `updates`, the UPDATE still succeeds with
  // whatever remains, and the handler returns { ok: true }. The toggle animates, the toast says saved,
  // and nothing was written — with no error anywhere. This is the same failure class as update_truck's
  // array allowlist (:854), which carries the same warning. ADD NEW SETTINGS IN BOTH PLACES:
  // here AND in get_vans' named select above, or the value writes but never reads back.
  if (action === 'update_van_settings') {
    const { vanId, autoPauseOnOffline, offlineProtectionMode, offlineAutoRejectMins, show_cooking_step, order_ready_enabled, kitchen_capacity, capacity_window_mins, buzzer_count, collection_interval_mins, operator_collection_interval_mins, takes_cash } = body
    const updates: Record<string, unknown> = {}
    // Written in their OWN statement — see the two-statement note at the write below.
    const intervalUpdates: Record<string, unknown> = {}
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
    /* ── 🔴 "Do you take cash?" PER VAN (5 October 2026, 20261012) ─────────────────────────────────
     * `truck_vans.takes_cash` is NULLABLE and the three states are all real:
     *   true  — this van takes cash
     *   false — this van does not
     *   NULL  — this van follows `trucks.takes_cash`, which is EVERY van before the migration is run
     * So this is `!== undefined` with an explicit null branch, NEVER a truthiness test: a truthy read
     * would make "no" unwritable and would make "follow the truck" unreachable once set. Same shape as
     * `buzzer_count` and the interval override above, for the same reason.
     *
     * ⚠️ IT IS A SEPARATE FIELD FROM `trucks.takes_cash`, WHICH `update_truck` STILL OWNS. The truck
     * value is the fallback, not a duplicate — and nothing here writes it.
     * 🔴 ANYTHING OTHER THAN true/false/null IS DROPPED, not coerced. `Boolean('false')` is true, and a
     * stringly-typed body is exactly how a van would come to take cash because somebody sent "false". */
    if (takes_cash !== undefined) {
      if (takes_cash === null || takes_cash === true || takes_cash === false) updates.takes_cash = takes_cash
    }
    // ── COLLECTION INTERVALS — VALIDATED, NOT SILENTLY DROPPED ──────────────────────────────────────
    // 🔴 THESE TWO RETURN A 400 RATHER THAN BEING SKIPPED. Every other field in this handler drops a bad
    // value, which is right for a toggle nobody can mistype. These come from a <select> whose options
    // ARE the vocabulary, so a value outside it means something is wrong an operator should be told
    // about rather than left wondering why "Every 15 minutes" keeps reverting.
    // ⚠️ NULL IS A REAL VALUE FOR THE OVERRIDE AND MEANS "follow the customer setting" — it is what
    // UNTICKING the box writes. So this is `!== undefined` with an explicit null branch, never a
    // truthiness test, or the box could be ticked and never unticked.
    if (collection_interval_mins !== undefined) {
      if (!isIntervalChoice(collection_interval_mins)) {
        return NextResponse.json({ error: `Collection times must be every ${INTERVAL_CHOICES.join(', ')} minutes.` }, { status: 400 })
      }
      intervalUpdates.collection_interval_mins = collection_interval_mins
    }
    if (operator_collection_interval_mins !== undefined) {
      if (operator_collection_interval_mins !== null && !isIntervalChoice(operator_collection_interval_mins)) {
        return NextResponse.json({ error: `Collection times must be every ${INTERVAL_CHOICES.join(', ')} minutes.` }, { status: 400 })
      }
      intervalUpdates.operator_collection_interval_mins = operator_collection_interval_mins
    }
    // 🔴 TWO STATEMENTS, ON PURPOSE. An UPDATE naming a column PostgREST cannot see fails ENTIRELY, so
    // one missing interval column in a combined statement would silently discard the buzzer count, the
    // capacity and everything else the operator changed in the same save. Keeping the interval write
    // separate means a missing column can only ever cost the interval.
    // ⚠️ THIS FIRST WRITE IS UNCHECKED, EXACTLY AS IT HAS ALWAYS BEEN. Not an oversight to fix in
    // passing: changing it would alter how every existing van setting reports failure, which is not
    // this change's business.
    if (Object.keys(updates).length) {
      await supabase
        .from('truck_vans')
        .update(updates)
        .eq('id', vanId)
        .eq('truck_id', truck.id)
    }
    // 🔴 THE INTERVAL WRITE IS CHECKED, AND A FAILURE IS VISIBLE. Without this an operator changing
    // "Every 15 minutes" on a database that has not been migrated would get a green toast and no
    // write — the silent-success shape this file's own allowlist comment warns about. A 42703 here
    // says the migration has not been applied, and the operator is told rather than misled.
    if (Object.keys(intervalUpdates).length) {
      const { error: ivErr } = await supabase
        .from('truck_vans')
        .update(intervalUpdates)
        .eq('id', vanId)
        .eq('truck_id', truck.id)
      if (ivErr) {
        const code = (ivErr as { code?: string }).code
        if (code === 'PGRST204') console.warn(`[slot-interval] van ${vanId}: interval save rejected — columns not in PostgREST's schema cache (PGRST204); reload the schema`)
        else if (code === '42703') console.warn(`[slot-interval] van ${vanId}: interval save rejected — columns absent (42703); migration not applied`)
        else console.warn(`[slot-interval] van ${vanId}: interval save failed (${code ?? 'no code'}): ${ivErr.message}`)
        return NextResponse.json({ error: 'Collection times could not be saved right now.' }, { status: 500 })
      }
    }
    // ── MASTER SWITCH (collection times): a Manage change RESETS this van's events ─────────────────
    // 🔴 DOMINIC'S DECISION, 17 September 2026, taken against the alternative. The codebase carries TWO
    // rules for this and says so out loud: order_ready_override is bulk-written when the default flips
    // ("they reset to the new value, by design"), while the paid-step family is deliberately the
    // opposite — lib/payments/paid-step.ts calls the bulk write "WRONG here" for a setting an operator
    // sets per event. Collection times follow the ORDER-READY rule: Manage is the master switch, and a
    // change here puts every one of this van's events back in step.
    //
    // 🔴 IT CLEARS TO NULL RATHER THAN WRITING THE NEW NUMBER, AND THAT IS NOT A SHORTCUT. Writing the
    // van's value into every event would leave each event permanently HOLDING an override — and the
    // customer column being non-null is the definition of "this event has its own pair". Every event
    // would stop following the van forever, the revert control would have nothing to revert, and the
    // NEXT Manage change would be the only thing that could move them. Clearing gives the same
    // effective grid today AND keeps them following the van tomorrow, which is what "reset" means.
    //
    // ⚠️ SCOPE IS THIS VAN'S EVENTS, NOT THE TRUCK'S. order_ready's bulk write is `.eq('truck_id', …)`
    // because order_ready_enabled is one value per van applied truck-wide by that switch; collection
    // times are per-van, so resetting another van's events for a change that cannot affect them would
    // be a bug wearing consistency's clothes. Same rule, correct scope.
    // ⚠️ NO DATE FILTER, matching order_ready. A past event's grid is inert, and filtering would make
    // the two master switches differ in a way nobody could remember.
    // ⚠️ BEST-EFFORT AND UNCHECKED, LIKE order_ready's. A failure here leaves an event on its own pair,
    // which is visible on the dashboard and fixable there — it must never fail the van save itself.
    if (Object.keys(intervalUpdates).length) {
      const { error: resetErr } = await supabase
        .from('truck_events')
        .update({ collection_interval_mins_override: null, operator_collection_interval_mins_override: null })
        .eq('truck_id', truck.id)
        .eq('van_id', vanId)
      if (resetErr) console.warn(`[slot-interval] van ${vanId}: could not reset event overrides (${(resetErr as { code?: string }).code ?? 'no code'}): ${resetErr.message}`)
    }
    // MASTER SWITCH (order-ready): flipping the Settings default bulk-writes order_ready_override onto
    // EVERY event for this truck — including events previously toggled on the dashboard (they reset to the
    // new value, by design). Scope = all of the truck's events (simplest; single-van trucks are the norm).
    // van.order_ready_enabled above stays the seed for NEW events.
    if (order_ready_enabled !== undefined) {
      await supabase
        .from('truck_events')
        /* ⚠️ `order_ready_source: 'seed'` IS THE TRUTH ABOUT THIS WRITE, NOT A NEW BEHAVIOUR. This
         * statement already overwrites every event "including events previously toggled on the
         * dashboard (they reset to the new value, by design)" — so after it runs, no event's value is
         * a per-event choice any more, and saying so is what lets an event type win for this setting
         * afterwards. The VALUE written is unchanged, and so is the set of rows. */
        .update({ order_ready_override: order_ready_enabled, order_ready_source: 'seed' })
        .eq('truck_id', truck.id)
    }
    /* ══ 🔴 "SAME AS VAN 1" — THE WRITE FAN-OUT ═════════════════════════════════════
     * When the van just edited IS the first van, every van following it is written in THIS request —
     * "while on, every change to the first van is also written to every van with the switch on".
     *
     * 🔴 A COPY, NOT A LOOKUP. Each following van's own row ends up holding the values, so every
     * reader on the order path keeps reading one van's own settings with no second query and no
     * indirection. Turning the switch off is then a no-op for ordering.
     * ⚠️ ONLY THE FIELDS THAT WERE JUST WRITTEN are fanned out, not the whole van: a save that
     * changed only the buzzer count must not also overwrite a following van's printer address with the
     * first van's — and `VAN_COPY_FIELDS` exists to say which fields may travel at all.
     * ⚠️ BEST-EFFORT AND PROBED. A failure here leaves the first van saved and a follower briefly
     * behind, which is recoverable by re-saving; failing the whole request would lose the edit the
     * operator actually made. Logged, never thrown.
     * ⚠️ IT CANNOT RUN BEFORE THE MIGRATION: with no `same_as_first_van` column the probed read
     * returns ok:false and an empty map, so there are no followers and this is a no-op.
     * 🔴 AND IT NO LONGER CARRIES CAPACITY (October 2026). `kitchen_capacity` and
     * `capacity_window_mins` moved out of `VAN_COPY_FIELDS` into `CAPACITY_COPY_FIELDS`, which the
     * CAPACITY switch owns — so a change to the first van's capacity fans out to the vans following
     * its CAPACITY, not to the vans following its service settings. The block below this one does
     * that, keyed on the other flag. */
    {
      const fanFields: Record<string, unknown> = {}
      for (const f of VAN_COPY_FIELDS) {
        if (f in updates) fanFields[f] = updates[f]
        else if (f in intervalUpdates) fanFields[f] = intervalUpdates[f]
      }
      if (Object.keys(fanFields).length) {
        const same = await readVanSameAsFirst(supabase, truck.id)
        if (same.ok) {
          const vanRows = [...same.createdAt.entries()].map(([id, created_at]) => ({ id, created_at, active: same.activeById.get(id) !== false }))
          const first = firstVanId(vanRows)
          if (first && first === vanId) {
            const followers = [...same.byVanId.entries()].filter(([id, on]) => on && id !== first).map(([id]) => id)
            for (const fid of followers) {
              const { error: fanErr } = await supabase
                .from('truck_vans')
                .update(fanFields)
                .eq('id', fid)
                .eq('truck_id', truck.id)
              if (fanErr) console.warn(`[van-same-as-first] van ${fid}: follow-the-first-van write failed (${(fanErr as { code?: string }).code ?? 'no code'}): ${fanErr.message}`)
            }
          }
        }
      }

    /* ── 🔴 THE CAPACITY FAN-OUT — THE SAME SHAPE, THE OTHER FLAG ─────────────────────────────────
     * A change to the FIRST van's capacity reaches every van following its CAPACITY, in this request.
     * Two blocks rather than one because the two switches are independent: a van may follow Van 1's
     * service settings and keep its own kitchen, or the reverse, and a single loop over one flag would
     * get one of those two wrong.
     * ⚠️ BEST-EFFORT AND PROBED, exactly as the block above: a failure leaves the first van saved and
     * one follower briefly behind, which re-saving fixes; failing the request would lose the edit. */
    {
      const capFields: Record<string, unknown> = {}
      for (const f of CAPACITY_COPY_FIELDS) {
        if (f in updates) capFields[f] = updates[f]
        else if (f in intervalUpdates) capFields[f] = intervalUpdates[f]
      }
      if (Object.keys(capFields).length) {
        const same = await readVanSameAsFirst(supabase, truck.id)
        if (same.ok) {
          const vanRows = [...same.createdAt.entries()].map(([id, created_at]) => ({ id, created_at, active: same.activeById.get(id) !== false }))
          const first = firstVanId(vanRows)
          if (first && first === vanId) {
            const followers = [...same.capacityByVanId.entries()].filter(([id, on]) => on && id !== first).map(([id]) => id)
            for (const fid of followers) {
              const { error: fanErr } = await supabase
                .from('truck_vans')
                .update(capFields)
                .eq('id', fid)
                .eq('truck_id', truck.id)
              if (fanErr) console.warn(`[van-capacity-same-as-first] van ${fid}: follow-the-first-van capacity write failed (${(fanErr as { code?: string }).code ?? 'no code'}): ${fanErr.message}`)
            }
          }
        }
      }
    }
    }
    return NextResponse.json({ ok: true })
  }

  /* ══ 🔴 PER-VAN CATEGORY CAPACITY SETTINGS ═════════════════════════════════════════
   * Prep / Items / "Counts to total capacity" on a VAN's card. These used to write `menu_categories`
   * through `upsert_category`, which is truck-level — so editing Van 2 edited Van 1. See
   * docs/settings-and-preview-report.md §4.
   *
   * 🔴 `upsert_category` IS UNTOUCHED AND STILL WRITES `menu_categories`. The Menu tab's category
   * editor is a MENU setting — the truck's default for any van that has not been given its own — and
   * its wording is unchanged. This action is only for the per-van cards.
   */
  if (action === 'upsert_van_category') {
    const { vanId, categoryId, prep_secs, batch_size, counts_toward_capacity } = body
    if (!vanId || !categoryId) return NextResponse.json({ error: 'vanId and categoryId are required' }, { status: 400 })

    /* 🔴 OWNERSHIP IS CHECKED ON BOTH IDS, not just the token. `truck` comes from the operator's
     * token, but `vanId` and `categoryId` arrive from the client — so both are confirmed to belong to
     * THIS truck before anything is written. Without this, a crafted request could set another truck's
     * van capacity, which decides whether that truck accepts orders. */
    const [{ data: van }, { data: cat }] = await Promise.all([
      supabase.from('truck_vans').select('id').eq('id', vanId).eq('truck_id', truck.id).maybeSingle(),
      supabase.from('menu_categories').select('id, prep_secs, batch_size, counts_toward_capacity')
        .eq('id', categoryId).eq('truck_id', truck.id).maybeSingle(),
    ])
    if (!van) return NextResponse.json({ error: 'Van not found' }, { status: 404 })
    if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

    /* 🔴 THE FIRST EDIT SEEDS FROM WHAT THIS VAN IS ALREADY RESOLVING, SO NOTHING JUMPS. A row is a
     * WHOLE-row override carrying all three fields; writing only the edited field would leave the other
     * two null and silently change this van's batch size or capacity membership at the moment the
     * operator touched prep. `effectiveCategorySettings` is the same resolution every reader uses. */
    const existing = await readVanCategorySettings(supabase, vanId)
    const base = effectiveCategorySettings(cat as { id: string } & Record<string, unknown>, existing.byCategoryId)
    const row = {
      truck_id: truck.id,
      van_id: vanId as string,
      category_id: categoryId as string,
      // ⚠️ `!== undefined`, NEVER A TRUTHINESS TEST. prep_secs 0 is a real value ("instant"), and so
      // is counts_toward_capacity false — a truthy test would make both unsettable.
      prep_secs: prep_secs !== undefined ? (prep_secs === null ? null : Number(prep_secs)) : base.prep_secs,
      batch_size: batch_size !== undefined ? (batch_size === null ? null : Number(batch_size)) : base.batch_size,
      counts_toward_capacity: counts_toward_capacity !== undefined ? !!counts_toward_capacity : base.counts_toward_capacity,
      updated_at: new Date().toISOString(),
    }

    const { error: upErr } = await supabase
      .from('van_category_settings')
      .upsert(row, { onConflict: 'van_id,category_id' })
    if (upErr) {
      /* 🔴 A VISIBLE FAILURE, NOT A GREEN TOAST ON NOTHING — the silent-success shape this file's
       * own allowlist comment warns about. Before the migration this is the only thing that tells an
       * operator why a per-van prep time will not stick. */
      const code = (upErr as { code?: string }).code
      if (code === 'PGRST205' || code === '42P01') console.warn(`[van-category-settings] van ${vanId}: table absent (${code}) — migration not applied`)
      else console.warn(`[van-category-settings] van ${vanId}: save failed (${code ?? 'no code'}): ${upErr.message}`)
      return NextResponse.json({ error: 'That van\'s capacity settings could not be saved right now.' }, { status: 500 })
    }

    /* 🔴 THE SAME FAN-OUT AS THE VAN FIELDS: a change to the FIRST van reaches every van following
     * it, in this request. Each follower gets its own row, so no reader indirects through the switch.
     * 🔴 KEYED ON THE **CAPACITY** FLAG (October 2026). These rows ARE the capacity table — per-category
     * batch sizes and prep times — so they travel with the capacity switch, not with Settings' one. A
     * van following Van 1's service settings but set up with its own kitchen must keep its own rows. */
    const same = await readVanSameAsFirst(supabase, truck.id)
    const fannedTo: string[] = []
    if (same.ok) {
      const first = firstVanId([...same.createdAt.entries()].map(([id, created_at]) => ({ id, created_at, active: same.activeById.get(id) !== false })))
      if (first && first === vanId) {
        for (const [fid, on] of same.capacityByVanId.entries()) {
          if (!on || fid === first) continue
          const { error: fanErr } = await supabase
            .from('van_category_settings')
            .upsert({ ...row, van_id: fid }, { onConflict: 'van_id,category_id' })
          if (fanErr) console.warn(`[van-same-as-first] van ${fid}: category follow-write failed (${(fanErr as { code?: string }).code ?? 'no code'}): ${fanErr.message}`)
          else fannedTo.push(fid)
        }
      }
    }
    return NextResponse.json({ ok: true, fannedTo })
  }

  /* ══ 🔴 THE "SAME AS VAN 1" SWITCH ══════════════════════════════════════════════════
   * Switching ON copies EVERYTHING the first van owns into this van, in one request, and records the
   * switch. Switching OFF records the switch and writes nothing else — the copied values stay, which
   * is what an operator means by "stop following Van 1".
   */
  if (action === 'set_van_same_as_first') {
    const { vanId, on } = body
    if (!vanId) return NextResponse.json({ error: 'vanId is required' }, { status: 400 })
    const { data: van } = await supabase
      .from('truck_vans').select('id').eq('id', vanId).eq('truck_id', truck.id).maybeSingle()
    if (!van) return NextResponse.json({ error: 'Van not found' }, { status: 404 })

    const same = await readVanSameAsFirst(supabase, truck.id)
    if (!same.ok) return NextResponse.json({ error: 'That switch is unavailable until the database is updated.' }, { status: 503 })
    const first = firstVanId([...same.createdAt.entries()].map(([id, created_at]) => ({ id, created_at, active: same.activeById.get(id) !== false })))
    /* ⛔ THE FIRST VAN CANNOT FOLLOW ITSELF. The UI only renders the switch on vans 2+, but the
     * handler refuses it too — a van following itself would make its own edits fan out to itself. */
    if (first && first === vanId) return NextResponse.json({ error: 'The first van cannot follow itself.' }, { status: 400 })

    if (on) {
      if (!first) return NextResponse.json({ error: 'There is no first van to follow.' }, { status: 400 })
      /* 🔴 COPY THE VAN'S OWN FIELDS. Read with `select('*')` so a column this deploy does not know
       * about is still carried by `vanCopyPayload`'s allowlist rather than being silently left behind —
       * and so a named select cannot 42703 the whole copy. */
      const { data: src } = await supabase.from('truck_vans').select('*').eq('id', first).maybeSingle()
      const payload = vanCopyPayload(src as Record<string, unknown> | null)
      if (Object.keys(payload).length) {
        const { error: cpErr } = await supabase.from('truck_vans').update(payload).eq('id', vanId).eq('truck_id', truck.id)
        if (cpErr) {
          console.warn(`[van-same-as-first] van ${vanId}: copying the first van's settings failed (${(cpErr as { code?: string }).code ?? 'no code'}): ${cpErr.message}`)
          return NextResponse.json({ error: 'The first van\'s settings could not be copied right now.' }, { status: 500 })
        }
      }
      /* 🔴 AND REPLACE THE CATEGORY ROWS — DELETE THEN INSERT, never a merge. If this van had its own
       * row for a category the first van does not override, merging would leave that category still
       * different while the switch claimed "same". An empty source row set is correct and means "both
       * vans inherit the truck defaults". */
      /* ⛔ THE CATEGORY ROWS ARE NO LONGER COPIED HERE (October 2026). They are the capacity table's
       * rows, and capacity has its own switch — `set_van_capacity_same_as_first` below does the
       * delete-then-insert, with the same reasoning about why it is a replacement and not a merge.
       * Copying them here too would make Settings' switch silently set a van's kitchen. */
    }

    const { error: swErr } = await supabase
      .from('truck_vans').update({ same_as_first_van: !!on }).eq('id', vanId).eq('truck_id', truck.id)
    if (swErr) {
      console.warn(`[van-same-as-first] van ${vanId}: switch write failed (${(swErr as { code?: string }).code ?? 'no code'}): ${swErr.message}`)
      return NextResponse.json({ error: 'That switch could not be saved right now.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, copiedFrom: on ? first : null })
  }

  /* ── 🔴 THE CAPACITY SWITCH — "Same capacity as Van 1" (Menu › Kitchen capacity) ───────────────
   * The same model as `set_van_same_as_first` above, over capacity's own fields and rows:
   *   • turning it ON copies the first van's `kitchen_capacity` + `capacity_window_mins` AND replaces
   *     its `van_category_settings` rows — delete-then-insert, never a merge;
   *   • while it is on, every change to the first van's capacity is also written to this van, in the
   *     same request (the two fan-outs in `update_van_settings` and `upsert_van_category`);
   *   • turning it OFF writes only the switch. The copied values stay — "stop following", not
   *     "revert to something".
   *
   * 🔴 A COPY, NEVER A LOOKUP, and the reason is the same one the report gives for the other switch:
   * a read-time `if (capacity_same_as_first_van) use van 1` would put a second van lookup on order
   * ACCEPTANCE, where capacity is enforced. Because it is a copy, every van's own row is complete and
   * the engine never resolves through a switch.
   *
   * ⚠️ DELETE-THEN-INSERT, NOT A MERGE. If this van kept a row for a category the first van does not
   * override, the switch would claim "same capacity" while one category still differed. An empty
   * source set is correct and means "both vans inherit the truck defaults".
   */
  /**
   * ── 🔴 COPY THE FIRST VAN'S CAPACITY ONTO ANOTHER VAN ─────────────────────────────────────────
   * Extracted from the switch below (October 2026) because `add_van` now has to do exactly the same
   * thing for a new van. Two copies of a delete-then-insert is how one of them comes to merge instead
   * of replace — the failure the switch's own comment warns about.
   *
   * 🔴 DELETE-THEN-INSERT, NEVER A MERGE. If the target kept a row for a category the source does not
   * override, it would differ while claiming to be the same. An empty source set is correct and means
   * "both vans inherit the truck defaults".
   * ⚠️ `select('*')` SO A COLUMN THIS DEPLOY DOES NOT KNOW ABOUT CANNOT 42703 THE WHOLE COPY —
   * `capacityCopyPayload`'s allowlist decides what travels, not the select.
   *
   * @returns null on success, or a message for the caller to return.
   */
  async function copyCapacityFromFirst(firstId: string, targetVanId: string, truckId: string): Promise<string | null> {
    const { data: src } = await supabase.from('truck_vans').select('*').eq('id', firstId).maybeSingle()
    const payload = capacityCopyPayload(src as Record<string, unknown> | null)
    if (Object.keys(payload).length) {
      const { error: cpErr } = await supabase.from('truck_vans').update(payload).eq('id', targetVanId).eq('truck_id', truckId)
      if (cpErr) {
        console.warn(`[van-capacity-copy] van ${targetVanId}: copying the first van's capacity failed (${(cpErr as { code?: string }).code ?? 'no code'}): ${cpErr.message}`)
        return 'The first van\'s capacity could not be copied right now.'
      }
    }
    const srcRows = await readVanCategorySettings(supabase, firstId)
    const { error: delErr } = await supabase.from('van_category_settings').delete().eq('van_id', targetVanId)
    if (delErr) console.warn(`[van-capacity-copy] van ${targetVanId}: clearing old category rows failed (${(delErr as { code?: string }).code ?? 'no code'}): ${delErr.message}`)
    const rows = vanCategoryCopyRows(srcRows.byCategoryId, truckId, targetVanId)
    if (rows.length) {
      const { error: insErr } = await supabase.from('van_category_settings').insert(rows)
      if (insErr) {
        console.warn(`[van-capacity-copy] van ${targetVanId}: copying category rows failed (${(insErr as { code?: string }).code ?? 'no code'}): ${insErr.message}`)
        return 'The first van\'s category settings could not be copied right now.'
      }
    }
    return null
  }

  if (action === 'set_van_capacity_same_as_first') {
    const { vanId, on } = body
    if (!vanId) return NextResponse.json({ error: 'vanId is required' }, { status: 400 })
    const { data: van } = await supabase
      .from('truck_vans').select('id').eq('id', vanId).eq('truck_id', truck.id).maybeSingle()
    if (!van) return NextResponse.json({ error: 'Van not found' }, { status: 404 })

    const same = await readVanSameAsFirst(supabase, truck.id)
    if (!same.ok) return NextResponse.json({ error: 'That switch is unavailable until the database is updated.' }, { status: 503 })
    const first = firstVanId([...same.createdAt.entries()].map(([id, created_at]) => ({ id, created_at, active: same.activeById.get(id) !== false })))
    /* ⛔ THE FIRST VAN CANNOT FOLLOW ITSELF — its own edits would fan out to itself. */
    if (first && first === vanId) return NextResponse.json({ error: 'The first van cannot follow itself.' }, { status: 400 })

    if (on) {
      if (!first) return NextResponse.json({ error: 'There is no first van to follow.' }, { status: 400 })
      /* 🔴 `select('*')` SO A COLUMN THIS DEPLOY DOES NOT KNOW ABOUT CANNOT 42703 THE WHOLE COPY —
       * `capacityCopyPayload`'s allowlist decides what travels, not the select. */
      const failure = await copyCapacityFromFirst(first, vanId as string, truck.id)
      if (failure) return NextResponse.json({ error: failure }, { status: 500 })
    }

    const { error: swErr } = await supabase
      .from('truck_vans').update({ capacity_same_as_first_van: !!on }).eq('id', vanId).eq('truck_id', truck.id)
    if (swErr) {
      console.warn(`[van-capacity-same-as-first] van ${vanId}: switch write failed (${(swErr as { code?: string }).code ?? 'no code'}): ${swErr.message}`)
      return NextResponse.json({ error: 'That switch could not be saved right now.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, copiedFrom: on ? first : null })
  }

  if (action === 'add_van') {
    const { name } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    /* ── 🔴 THE NEW VAN'S KITCHEN CAPACITY IS DECIDED BEFORE IT EXISTS ──────────────────────────
     * Menu › Kitchen capacity asks one question of a multi-van truck: "Same kitchen capacity for all
     * vans?". A van added to a truck whose answer is YES must arrive already following — otherwise
     * the answer silently becomes NO the moment a van is added, and the operator is shown a screen
     * full of per-van boxes they never asked for.
     *
     * 🔴 "YES" IS READ, NOT STORED. There is no column for the answer: it IS "does every non-first
     * active van follow the first van". A one-van truck satisfies that vacuously, which is why a
     * truck's SECOND van follows by default — the common case, and the one the brief calls out.
     * ⚠️ READ BEFORE THE INSERT. Afterwards the new van is itself a non-first van with the column
     * default (false), so the answer would read NO for every truck and no van would ever follow.
     * ⛔ AND THE COLUMN DEFAULT IS NOT CHANGED — this writes the flag explicitly. A `default true`
     * would make every van on every truck follow, including trucks that answered No.
     */
    const same = await readVanSameAsFirst(supabase, truck.id)
    const existing = [...same.createdAt.entries()]
      .map(([id, created_at]) => ({ id, created_at, active: same.activeById.get(id) !== false }))
    const first = firstVanId(existing)
    /* 🔴 THE SAME `capacityAllSame` THE SCREEN READS. An inline `.every(...)` here would be a second
     * rule, and the one that drifted would be this one — where nobody would see it until a truck's new
     * van quietly stopped matching its siblings. */
    const answerIsYes = same.ok && capacityAllSame(
      existing.map(v => ({ ...v, capacity_same_as_first_van: same.capacityByVanId.get(v.id) === true })),
      first,
    )

    const { data, error } = await supabase
      .from('truck_vans')
      .insert({ truck_id: truck.id, name: name.trim(), active: true })
      .select('id, truck_id, name, kds_token, active')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const newId = (data as { id?: string } | null)?.id
    /* 🔴 THE VALUES ARE COPIED EITHER WAY; ONLY THE FLAG DIFFERS. Under "No" the new van still starts
     * from the first van's numbers — a van that arrived at the truck's defaults while its siblings
     * were configured would be a van quietly running a different kitchen. What "No" means is that it
     * then diverges on its own, not that it starts from nothing. */
    let followed = false
    if (newId && first && first !== newId) {
      const failure = await copyCapacityFromFirst(first, newId, truck.id)
      /* ⚠️ A COPY FAILURE DOES NOT FAIL THE VAN. The van exists and is usable; its capacity can be set
       * on the screen. Returning an error here would leave a created van behind an error message. */
      if (failure) console.warn(`[add-van] van ${newId}: ${failure}`)
      if (same.ok && answerIsYes) {
        const { error: flagErr } = await supabase
          .from('truck_vans').update({ capacity_same_as_first_van: true }).eq('id', newId).eq('truck_id', truck.id)
        if (flagErr) console.warn(`[add-van] van ${newId}: could not set the capacity flag (${(flagErr as { code?: string }).code ?? 'no code'}): ${flagErr.message}`)
        else followed = true
      }
    }
    /* `followed` is reported so the screen can say what happened rather than guess. */
    return NextResponse.json({ ok: true, van: data, capacityFollowsFirstVan: followed })
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

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // SCHEDULE › PLACES — the operator's own list of pitches
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 `truck_events` AND `venues` ARE READ-ONLY TO EVERY ACTION BELOW, and for `truck_events` that is
  // now the load-bearing rule of the whole feature: it is the table live ordering reads. There is no
  // update, upsert or delete against it anywhere in this block — the ONE write is `truck_place_id` on
  // the INSERT in `upsert_event`, and nothing here or there touches an existing row. `venues` is
  // shared across every truck (scraper reference data), so a truck's own name for a pitch must never
  // be written there.
  //
  // 🔴 NO PLAN GATE ON PLACES (3 October 2026). It was behind `schedule_graphics` in stage 1. That
  // Feature now gates ONLY the Weekly post sub-tab: Places and the Add event picker are how an
  // operator keeps their own schedule tidy, which every plan pays for. `resolveTruckAccess` and the
  // staff gate are unchanged — access is still deny-by-default and still owner/manager for the writes.
  //
  /* ══ 🔴 THE TAB-ONLY ACTIONS FOLLOW THE PLAN (10 October 2026 · launch) ══════════════════════════
   * ⛔ IT WAS `places_posts_preview`, A Feature IN NO PLAN, held only through `trucks.feature_overrides`
   * and granted to one truck. **Social media is launched, so the gate is the plan key** —
   * `schedule_graphics`, Pro / Max / trial — which is the same key the Social media tab, the weekly and
   * event post routes and every other surface of this feature now use. ⚠️ ONE KEY, EVERYWHERE.
   *
   * 🔴 AND THE SPLIT IS THE WHOLE POINT, so read it before adding an action to either side:
   *   UNGATED — `sg_places` and `sg_upsert_place`. They are NOT the Places tab's private API. The Add
   *     event modal's place picker and "Tidy up places" both call them (app/manage/[token]/page.tsx
   *     mounts `usePlaces` when the modal opens), and every truck on this branch already has those.
   *     Gating either one would switch off a shipped control to hide a preview tab — the exact mistake
   *     the "no plan gate on Places" note above was written to prevent. `sg_merge_place` stays with
   *     them: it is the tidy-up write, and it is listed as currently unreachable in SchedulePlaces.
   *   GATED — everything that exists ONLY inside the tab. ⛔ THAT IS NOW ONE ACTION: the usual-type
   *     WRITE. The pictures pane and "Events here" were deleted on 5 October 2026 and their five
   *     actions went with them — see the tombstone where they used to be. ⚠️ THE USUAL-TYPE *READ* IS
   *     NOT GATED: it arrives with the `sg_places` rows and is what pre-selects a type in the Add event
   *     modal, which every truck keeps.
   *   ⚠️ A ONE-ENTRY LIST IS STILL A LIST, AND STILL AN ARRAY. Collapsing it to `action === '…'` would
   *     lose the name that says what the rule is, and the next tab-only action would have to re-derive
   *     it.
   * ⚠️ THE MESSAGE NAMES THE PLAN NOW. It said "not switched on for this truck", which was true while
   * no plan sold it and is a lie the moment one does — a Starter truck is being asked to upgrade, not
   * told to wait. ⛔ IT IS THE **SHARED** SENTENCE, from `lib/copy/weeklyPost.ts`, so the screen and the
   * route cannot disagree about which plan this is on. */
  const PLACES_TAB_ONLY = ['sg_place_usual_type']
  if (PLACES_TAB_ONLY.includes(action)
      && !canAccess(truck.plan, 'schedule_graphics', truck.feature_overrides ?? {}, truck.trial_expires_at)) {
    return NextResponse.json({ error: WEEKLY_POST_PLAN_REFUSAL }, { status: 403 })
  }

  if (action === 'sg_places') {
    /* ── THE READ, THEN THE SEED, THEN THE READ THAT ANSWERS ──────────────────────────────────────
     * ⚠️ A NAMED SELECT, AND EVERY COLUMN IN IT IS ONE THE BRIEF VERIFIED IN PRODUCTION. A column
     * PostgREST cannot see returns 42703 for the WHOLE statement, which here would read as "this
     * truck has no schedule" and seed nothing — silently.
     * ⚠️ `truck_place_id` IS SELECTED, not written: it is the first and strongest step of matching. */
    const windowStart = seedWindowStart(new Date())
    const { data: evRows, error: evErr } = await supabase
      .from('truck_events')
      .select('id, truck_place_id, venue_id, venue_name, event_date, start_time, end_time, status, venue_address, address, postcode, town')
      .eq('truck_id', truck.id)
      .gte('event_date', windowStart)
      .order('event_date', { ascending: true })
      .limit(2000)
    if (evErr) {
      console.error('[sg_places] schedule read failed:', evErr.code, evErr.message)
      return NextResponse.json({ error: "Couldn't read your schedule, so places could not be worked out." }, { status: 400 })
    }
    const events = (evRows ?? []) as PlaceEvent[]

    /* ⚠️ THE THREE POST-PICTURE COLUMNS JOINED THIS LIST (20261015), and they are safe to name here:
     * `event_bg_path/width/height` are added by 20261007, which is long applied — the same migration
     * the single-event post has depended on since it shipped. ⛔ THE PIN IS **NOT** HERE: it comes
     * from its own probed read, because 20261015 may not be applied and one 42703 in this select
     * would empty the whole Places screen rather than show every place with nothing stored. */
    const PLACE_COLS = 'id, venue_id, name_key, name, short_name, address, postcode, area, is_favourite, is_hidden, merged_into_id, event_bg_path, event_bg_width, event_bg_height'
    const readPlaces = async () => {
      const { data, error } = await supabase
        .from('truck_places').select(PLACE_COLS).eq('truck_id', truck.id).order('name', { ascending: true })
      return { rows: (data ?? []) as SgPlace[], error }
    }

    const before = await readPlaces()
    if (before.error) {
      // 🔴 THE MIGRATION NOT BEING APPLIED LANDS HERE (PGRST205/42703). Named, not swallowed: a pane
      // that showed "no places yet" on a missing table would look like a truck with no schedule.
      console.error('[sg_places] places read failed:', before.error.code, before.error.message)
      return NextResponse.json({ error: "Couldn't load places. If this is new, the schedule-places migration may not be applied yet." }, { status: 400 })
    }

    /* ── 🔴 THE IDEMPOTENT SEED ───────────────────────────────────────────────────────────────────
     * The DATABASE decides there is one row: `on conflict (truck_id, name_key) do nothing` resolves
     * against truck_places_truck_name_key_uidx. Two tabs opening at the same moment both insert, one
     * wins, and both then re-read the same rows.
     * ⚠️ `ignoreDuplicates` IS WHAT MAKES IT `do nothing` RATHER THAN `do update`. An update on
     * conflict would overwrite `name` — the operator's edit — on every refresh.
     * 🔴 AND THE PLAN NEVER TOUCHES A HIDDEN OR MERGED ROW. See `planPlaceSeed`. */
    const plan = planPlaceSeed({ events, places: before.rows, now: new Date() })
    if (plan.inserts.length > 0) {
      const { error } = await supabase.from('truck_places').upsert(
        plan.inserts.map(i => ({ ...i, truck_id: truck.id })),
        { onConflict: 'truck_id,name_key', ignoreDuplicates: true },
      )
      if (error) console.error('[sg_places] seed insert failed:', error.code, error.message)
    }
    for (const a of plan.adopts) {
      // ⚠️ `.is('venue_id', null)` IS THE CONCURRENCY GUARD, not a tidy-up: if another tab adopted this
      // place a millisecond ago, this matches no row instead of overwriting its anchor.
      const { error } = await supabase.from('truck_places')
        .update({ venue_id: a.venue_id, updated_at: new Date().toISOString() })
        .eq('id', a.placeId).eq('truck_id', truck.id).is('venue_id', null)
      if (error) console.error('[sg_places] adopt failed:', error.code, error.message)
    }
    for (const f of plan.fills) {
      /* ⚠️ ONE STATEMENT PER BLANK COLUMN, each with its own `.is(<literal>, null)`. A combined update
       * could not express "fill the address only if it is blank" and would overwrite an operator's
       * address whenever the postcode happened to be empty.
       * 🔴 WRITTEN OUT RATHER THAN LOOPED, and the schema census is why: a `.is(col, null)` over a loop
       * variable is a column name it cannot read, and it failed loudly on exactly that — correctly.
       * A column named by a literal is one the census can check against the migrations. */
      const stamp = new Date().toISOString()
      if (f.address !== undefined) {
        await supabase.from('truck_places').update({ address: f.address, updated_at: stamp })
          .eq('id', f.placeId).eq('truck_id', truck.id).is('address', null)
      }
      if (f.postcode !== undefined) {
        await supabase.from('truck_places').update({ postcode: f.postcode, updated_at: stamp })
          .eq('id', f.placeId).eq('truck_id', truck.id).is('postcode', null)
      }
      if (f.area !== undefined) {
        await supabase.from('truck_places').update({ area: f.area, updated_at: stamp })
          .eq('id', f.placeId).eq('truck_id', truck.id).is('area', null)
      }
    }
    if (plan.collisions.length > 0) {
      // 🔴 LOGGED, NOT RESOLVED. Either two venue anchors want one name_key, or the key belongs to a
      // place the operator hid or merged. Inventing a suffix would name a place they never chose.
      console.warn('[sg_places] name_key collisions (one place kept per key):',
        plan.collisions.map(c => `${c.name_key} <- venue ${c.venue_id}`).join(', '))
    }

    const after = plan.inserts.length || plan.adopts.length || plan.fills.length ? await readPlaces() : before
    if (after.error) {
      console.error('[sg_places] re-read failed:', after.error.code, after.error.message)
      return NextResponse.json({ error: "Couldn't load places." }, { status: 400 })
    }
    const places = after.rows

    // ⚠️ THE TRUCK'S OWN TODAY, not the server's. The same helper every other date-sensitive read in
    // this route uses; a UTC "today" shows tomorrow's pitch as next from 00:00 UK time in winter.
    const todayLocal = getLocalDateInTz((truck as { timezone?: string | null }).timezone ?? 'Europe/London')
    // 🔴 GROUPED THROUGH `placeForEvent`, SO A MERGED PLACE'S EVENTS LAND ON ITS TARGET. That is what
    // makes "B gains A's events" true for Next, Last and the count without rewriting a single event row.
    const { byPlace } = groupEventsByPlace(events, places)

    /* ══ 🔴 THE PIN, FROM ITS OWN PROBED READ (20261015) ═══════════════════════════════════════
     * `truck_places.usual_event_type_id` is added by 20261015. Naming it in `PLACE_COLS` would mean
     * one 42703 fails the WHOLE select and the Places screen shows nothing — a pin migration taking
     * down the place list. Two reads; one blast radius each, the rule this build follows throughout.
     * ⚠️ IT FAILS **OPEN** TO "NOTHING STORED", which is what every place is today and is a true
     * answer: no choice is stored, so the existing newest-event rule decides and the pill row shows
     * that rule's answer. Nothing is published either way. */
    const usualTypeByPlace = new Map<string, string>()
    /** Place ids pinned to STANDARD (20261016). ⚠️ A SET, because the value is the membership. */
    const standardPinned = new Set<string>()
    {
      /* ⚠️ 20261016'S COLUMN IS NAMED HERE, AND A 42703 COSTS THE PINS TOO — so the read is retried
       * with only 20261015's column. A truck on 20261015 must not lose the pins it has already set
       * because a newer column it does not have yet failed the statement. */
      let pins: { id: string; usual_event_type_id: string | null; usual_type_is_standard?: boolean | null }[] = []
      const first = await supabase
        .from('truck_places').select('id, usual_event_type_id, usual_type_is_standard').eq('truck_id', truck.id)
      if (!first.error) {
        pins = (first.data as typeof pins | null) ?? []
      } else if (['42703', 'PGRST204'].includes(first.error.code || '')) {
        const again = await supabase
          .from('truck_places').select('id, usual_event_type_id').eq('truck_id', truck.id)
        if (!again.error) pins = (again.data as typeof pins | null) ?? []
      } else if (!['42P01', 'PGRST205'].includes(first.error.code || '')) {
        console.error('[sg_places] pin read failed:', first.error.code, first.error.message)
      }
      for (const r of pins) {
        if (r.usual_type_is_standard === true) { standardPinned.add(r.id); continue }
        if (r.usual_event_type_id) usualTypeByPlace.set(r.id, r.usual_event_type_id)
      }
    }

    /* ══ 🔴 WHAT THE HISTORY RULE GIVES EACH PLACE, RESOLVED HERE (5 October 2026) ════════════════
     * ⛔ THIS BEGAN AS A LABEL AND IS NOW THE ANSWER ITSELF. The dropdown's first option used to read
     * "Automatic (Standard)" for every place, always — a hardcoded word. For a wedding venue whose last
     * three bookings were Private that was simply false, and it was false on the screen whose job is to
     * tell the operator what will happen. The dropdown is gone; the pill row SELECTS this type for a
     * place nobody has set, with no special label, so it is no longer describing a mechanism — it is the
     * truck's answer to "what comes up when I pick this place?".
     *
     * 🔴 IT IS THE SAME FUNCTION THE PRE-SELECTION USES. `readPlaceTypeHistory` is the automatic rule
     * (§70.3, "the newest event at this place supplies the type") lifted out of
     * `usualTypeForPlace` so there is ONE definition: the label and the behaviour cannot drift.
     * ⚠️ `placeForEvent` RESOLVES EACH PLACE TO ITS MERGE TARGET before the lookup, because a pitch
     * the operator merged away has no history of its own — its events belong to the target now, which
     * is the same thing `groupEventsByPlace` above does for Next and Last.
     * ⚠️ THE NAMES COME FROM ONE MORE CHEAP READ, and an id with no name resolves to Standard. The
     * client could have mapped ids to names from the list it already holds, but that list excludes
     * the Private type on a truck without the key — and the label would then silently say Standard.
     * ⚠️ A FAILED READ MEANS NO ANSWER, NOT A WRONG ONE: both fields are null, and the pill row falls
     * back to Standard — which is what the rule itself returns with no history, so the fallback is the
     * rule's own answer rather than a guess. */
    const autoByPlace = new Map<string, string | null>()
    let autoNames = new Map<string, string>()
    let autoOk = false
    {
      const hist = await readPlaceTypeHistory(supabase, truck.id, placeForEvent)
      autoOk = hist.ok
      if (hist.ok) {
        for (const p of places) {
          const target = placeForEvent({ truck_place_id: p.id }, places)
          const key = target?.id ?? p.id
          autoByPlace.set(p.id, hist.newestTypeByPlace.has(key) ? (hist.newestTypeByPlace.get(key) ?? null) : null)
        }
        const wanted = [...new Set([...autoByPlace.values()].filter((v): v is string => !!v))]
        if (wanted.length) {
          const { data: tn } = await supabase
            .from('event_types').select('id, name').eq('truck_id', truck.id).in('id', wanted)
          autoNames = new Map(((tn as { id: string; name: string }[] | null) ?? []).map(t => [t.id, t.name]))
        }
      }
    }

    return NextResponse.json({
      ok: true,
      places: places.map(p => {
        const mine = byPlace.get(p.id) ?? []
        const next = nextEventAt(mine, todayLocal)
        const last = lastEventAt(mine, todayLocal)
        return {
          id: p.id,
          venue_id: p.venue_id ?? null,
          /* 🔴 `name_key` IS RETURNED SO THE CLIENT CAN USE THE SHARED MATCHING RULE. The Add event
           * modal needs "which events happened at this place" to default the van, and
           * `placeForEvent` needs all three identities — the link, the anchor and the key. Sending
           * only two would have meant a weaker rule on the client than on the server. */
          name_key: p.name_key,
          name: p.name ?? '',
          short_name: p.short_name ?? null,
          address: p.address ?? null,
          area: p.area ?? null,
          postcode: p.postcode ?? null,
          is_favourite: p.is_favourite === true,
          is_hidden: p.is_hidden === true,
          merged_into_id: p.merged_into_id ?? null,
          next_event_date: next?.event_date ?? null,
          next_start_time: next?.start_time ?? null,
          next_end_time: next?.end_time ?? null,
          last_event_date: last?.event_date ?? null,
          last_start_time: last?.start_time ?? null,
          last_end_time: last?.end_time ?? null,
          traded_last_year: tradedCountInLastYear(mine, todayLocal),
          /* ── 🔴 THE PLACES TAB'S OWN FOUR FIELDS (20261015) ───────────────────────────────────
           * ⚠️ READ FROM `p`, WHICH IS A `select(PLACE_COLS)` — so the three post-picture columns and
           * the pin had to join that list. They are all on `truck_places` already except the pin,
           * which 20261015 adds; `usualTypeByPlace` is a SEPARATE probed read for the reason every
           * other new column in this build is read separately (see its own note). */
          event_bg_path: (p as { event_bg_path?: string | null }).event_bg_path ?? null,
          event_bg_width: (p as { event_bg_width?: number | null }).event_bg_width ?? null,
          event_bg_height: (p as { event_bg_height?: number | null }).event_bg_height ?? null,
          usual_event_type_id: usualTypeByPlace.get(p.id) ?? null,
          /* 🔴 "Stored as Standard" AS A REAL STATE (20261016) — distinct from an unset row, which is
           * NULL in both columns. See the migration for why it cannot be a sentinel in the id column. */
          usual_type_is_standard: standardPinned.has(p.id),
          /* 🔴 WHAT THE RULE GIVES THIS PLACE **TODAY** — the pill the row shows when nothing is
           * stored. ⚠️ null/null WHEN THE HISTORY READ FAILED, which the pill row draws as Standard,
           * because that is the rule's own answer with no history. */
          usual_automatic_type_id: autoOk ? (autoByPlace.get(p.id) ?? null) : null,
          usual_automatic_type_name: autoOk
            ? (autoNames.get(autoByPlace.get(p.id) ?? '') ?? STANDARD_TYPE_NAME)
            : null,
          /* 🔴 "used N times" — EVERY traded event at this place, not the last year's. The list line
           * already shows "N times in the last year"; the detail pane's heading is the lifetime
           * figure, which is the one that answers "is this a regular pitch?". */
          used_count: mine.filter(e => countsAsTraded(e.status)).length,
        }
      }),
    })
  }

  if (action === 'sg_upsert_place') {
    const id = typeof body.id === 'string' && body.id ? body.id : null
    const name = String(body.name ?? '').trim()

    if (!id) {
      // ── "+ New place" — a manual place, no venue anchor ─────────────────────────────────────────
      if (!name) return NextResponse.json({ error: 'A place needs a name.' }, { status: 400 })
      const name_key = normalisePlaceName(name)
      if (!name_key) return NextResponse.json({ error: 'That name has no letters or numbers in it.' }, { status: 400 })
      /* 🔴 CONFLICT-TOLERANT, AND IT ANSWERS WITH THE EXISTING ROW. Typing the name of a place the
       * seeder already created is not an error to show an operator — it is the place they were looking
       * for. `ignoreDuplicates` then a read-back returns it, selected, rather than a red message.
       * ⚠️ THAT INCLUDES A HIDDEN OR MERGED ROW: the insert is dropped and the existing row comes back,
       * so typing the name of something they hid does not create a duplicate and does not un-hide it.
       * The pane then shows it under "Show hidden places", which is where it is. */
      const { error } = await supabase.from('truck_places').upsert(
        { truck_id: truck.id, venue_id: null, name_key, name, address: null, postcode: null, area: null },
        { onConflict: 'truck_id,name_key', ignoreDuplicates: true },
      )
      if (error) {
        console.error('[sg_upsert_place] insert failed:', error.code, error.message)
        return NextResponse.json({ error: "Couldn't add that place." }, { status: 400 })
      }
      const { data: row } = await supabase.from('truck_places')
        .select('id').eq('truck_id', truck.id).eq('name_key', name_key).maybeSingle()
      return NextResponse.json({ ok: true, id: row?.id ?? null })
    }

    // ── An edit to the detail cards, or a Favourite / Hide toggle ──────────────────────────────────
    /* ⚠️ ONLY KEYS PRESENT IN THE BODY ARE WRITTEN, the rule `update_settings` follows: a partial save
     * must never null the fields it did not mention. `''` becomes NULL for the optional fields, because
     * a cleared box means "not set". */
    const patch: Record<string, unknown> = {}
    if ('name' in body) {
      if (!name) return NextResponse.json({ error: 'A place needs a name.' }, { status: 400 })
      /* 🔴 `name_key` IS NOT RE-DERIVED FROM AN EDITED NAME, and this is the one that would be easy to
       * get wrong. The key is what the truck's EVENTS say; "Name on posts" is what the operator wants
       * the public to read. Re-keying on a rename would silently orphan every event at that place —
       * the row would survive with no dates under it and no error anywhere. */
      patch.name = name
    }
    for (const k of ['short_name', 'address', 'postcode', 'area'] as const) {
      if (k in body) {
        const v = String(body[k] ?? '').trim()
        patch[k] = v === '' ? null : v
      }
    }
    // The two booleans. ⚠️ STRICT `=== true/false`, so a missing key is "leave it" and never "false".
    if (typeof body.is_favourite === 'boolean') patch.is_favourite = body.is_favourite
    if (typeof body.is_hidden === 'boolean') {
      patch.is_hidden = body.is_hidden
      /* 🔴 UN-HIDING A MERGED PLACE ALSO UN-MERGES IT, and that is the only way back. "Show hidden
       * places" exists so a hide can be undone; a place that came back into the list while still
       * pointing at another one would show with none of its own events, because they all resolve to
       * the target. One control, one coherent outcome. */
      if (body.is_hidden === false) patch.merged_into_id = null
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })
    patch.updated_at = new Date().toISOString()
    const { error } = await supabase.from('truck_places')
      .update(patch).eq('id', id).eq('truck_id', truck.id)
    if (error) {
      console.error('[sg_upsert_place] update failed:', error.code, error.message)
      return NextResponse.json({ error: "Couldn't save that place." }, { status: 400 })
    }
    return NextResponse.json({ ok: true, id })
  }

  /* ══ 🔴 THE PLACES TAB: THE PIN (20261015) ═══════════════════════════════════════════════════════
   * Writes `truck_places.usual_event_type_id`. NULL is "nothing stored" — the existing rule that the
   * newest event at this place supplies the type (§70.3) — and that is the whole vocabulary.
   * ⚠️ THE **SCREEN** NO LONGER OFFERS THAT THIRD CHOICE (5 October 2026). The Places tab is a pill row
   * and `savePin` sends `'standard'` or a uuid, never null. This route still accepts null, because the
   * storage is unchanged and `clearOwn` and any older caller send it — removing it would be a breaking
   * change to a wire format for no gain.
   *
   * ⛔ THE TYPE ID IS VALIDATED AGAINST THE TOKEN'S TRUCK, AND A FOREIGN ONE BECOMES NULL rather than
   * an error. The database cannot enforce it (a composite FK would need `event_types (id, truck_id)`
   * unique, which it is not declared as — see 20261015's note), so this is the only guard. Silently
   * resolving to "nothing stored" is the same posture `resolveRequestedTypeId` takes for an event's
   * type: the FK would refuse a non-existent id anyway, and a failed save of a real edit is worse for
   * the operator than quietly getting the honest answer.
   * ⚠️ IT ALSO ACCEPTS THE PRIVATE TYPE, deliberately. A wedding venue that only ever has private
   * bookings should come up as Private — and it is not silent: Add event opens the purple panel with
   * the explanation, so the operator sees it before saving. Confirmed by Dominic, 5 October 2026. */
  if (action === 'sg_place_usual_type') {
    const placeId = String(body.placeId ?? '')
    if (!placeId) return NextResponse.json({ error: 'placeId required' }, { status: 400 })
    /* ══ 🔴 THREE CHOICES, AND EACH WRITES **BOTH** COLUMNS (20261016) ═════════════════════════════
     * The vocabulary on the wire is: absent/null/'' ⇒ nothing stored · `'standard'` ⇒ Standard · a
     * uuid ⇒ that type. And the three writes are:
     *     nothing stored → usual_event_type_id = NULL,  usual_type_is_standard = false
     *     Standard       → usual_event_type_id = NULL,  usual_type_is_standard = TRUE
     *     a type         → usual_event_type_id = <id>,  usual_type_is_standard = false
     * ⚠️ ONLY THE SECOND AND THIRD ARE REACHABLE FROM THE SCREEN NOW — the pill row cannot say
     * "neither". The first stays because it is the state every unset row is already in.
     * 🔴 BOTH COLUMNS, IN ONE STATEMENT, EVERY TIME. Writing only the one that changed is how
     * (true, <uuid>) gets created — switch a place from Standard to Private and the boolean would
     * still say Standard, which the resolution order then obeys. One statement cannot be half done.
     * ⛔ `'standard'` IS A LITERAL ON THE WIRE, NOT A RESERVED UUID. Standard has no `event_types`
     * row — it IS the truck's own settings (§70.2) — so there is no id to send. 20261016's note
     * records why a magic uuid was refused.
     *
     * ⛔ A TYPE ID IS VALIDATED AGAINST THE TOKEN'S TRUCK, AND A FOREIGN ONE STORES NOTHING rather
     * than erroring. The database cannot enforce it (a composite FK would need `event_types
     * (id, truck_id)` unique, which it is not declared as — see 20261015's note), so this is the only
     * guard. Silently storing nothing is the posture `resolveRequestedTypeId` takes for an
     * event's type: the FK would refuse a non-existent id anyway, and a failed save of a real edit is
     * worse for the operator than quietly getting the honest answer. */
    const raw = body.typeId === null || body.typeId === undefined || body.typeId === ''
      ? null : String(body.typeId)
    const wantStandard = raw === 'standard'
    const wanted = wantStandard ? null : raw
    let typeId: string | null = null
    if (wanted) {
      const { data: t } = await supabase
        .from('event_types').select('id').eq('id', wanted).eq('truck_id', truck.id).maybeSingle()
      typeId = (t as { id: string } | null)?.id ?? null
    }
    const { error } = await supabase
      .from('truck_places')
      .update({
        usual_event_type_id: typeId,
        // ⚠️ NEVER BOTH. A type id and the Standard flag are mutually exclusive by construction here.
        usual_type_is_standard: wantStandard && !typeId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', placeId).eq('truck_id', truck.id)
    if (error) {
      /* ⚠️ THE MISSING MIGRATION IS NAMED, not swallowed: an operator pressing a control that cannot
       * store anything deserves to be told why rather than watching it snap back. */
      const missing = ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code || '')
      return NextResponse.json({
        error: missing
          /* ⚠️ BOTH MIGRATIONS ARE NAMED. The statement writes both columns, so either one missing
           * fails it — and telling the operator to run 20261015 when it is 20261016 that is absent
           * sends them to check something that is already applied. */
          ? 'The usual event type isn’t available yet — migrations 20261015 and 20261016 must both be applied.'
          : error.message,
      }, { status: 400 })
    }
    return NextResponse.json({ ok: true, usual_event_type_id: typeId, usual_type_is_standard: wantStandard && !typeId })
  }

  /* ══ ⛔ FIVE ACTIONS WERE DELETED HERE (5 October 2026, Dominic) ═══════════════════════════════
   *
   *   `sg_place_pictures` · `sg_place_picture_url` · `sg_place_picture_save` · `sg_place_picture_remove`
   *   `sg_place_events`
   *
   * ── 🔴 THE FOUR PICTURE ACTIONS: THE ONLY SCREEN THAT CALLED THEM IS GONE ────────────────────────
   * They served "Your own pictures" on the Places tab — a per-place reference library in
   * `place_pictures`. Nothing read it: no post, no feed, no export, no other screen. The pane's own
   * copy had to say so in capitals every time it was drawn, and a feature whose description is mostly a
   * warning about what it is NOT is a feature nobody asked for. "Picture for posts" — the one picture
   * that does reach a poster — was always `truck_places.event_bg_path` and goes through
   * /api/weekly-post, which is untouched.
   * ⚠️ `public.place_pictures` IS STILL THERE, WITH ITS ROWS AND ITS OBJECTS. Dropping the table is a
   * migration this change does not need, and the files an operator uploaded are theirs. Nothing reads
   * it from this route any more, and `scripts/places-tab.cjs` asserts that nothing reads it at all.
   * ⛔ SO DO NOT "TIDY UP" THE TABLE WITHOUT ASKING. Deleting it would delete somebody's photographs.
   *
   * ── 🔴 `sg_place_events`: THE SCHEDULE IS THE ANSWER TO "WHAT HAPPENS HERE" ──────────────────────
   * It fed the two "Events here" boxes — one under the place's fields, one at the bottom of the page —
   * which printed the next event, the last few events and a lifetime count on the screen whose job is a
   * place's SETTINGS. The Events section, one pill away, is the real schedule, and it is the one that
   * can be filtered, edited and posted from. Two renderings of the same events, one of them read-only,
   * is how a reader comes to doubt both.
   * ⚠️ NEXT AND LAST ARE STILL COMPUTED, in `sg_places`, because the LIST rows show them. That is the
   * same `groupEventsByPlace` + `placeForEvent` grouping this action used — nothing about merged places
   * was lost with it.
   *
   * ⛔ NOTHING ELSE CALLED EITHER SET. They were Places-tab-only, which is exactly why they were on the
   * gated side of `PLACES_TAB_ONLY` — and that list is now one entry long. */

  if (action === 'sg_merge_place') {
    /* ── 🔴 "A IS REALLY B" ───────────────────────────────────────────────────────────────────────
     * One write to ONE row: A gets `merged_into_id` and `is_hidden`. B gains A's events through
     * MATCHING, not through a rewrite — no `truck_events` row is touched, which is the whole reason
     * this is safe to offer on a table live ordering reads.
     * ⚠️ THE DECISION IS MADE IN THE SHARED MODULE (`mergeRefusal` / `mergePatch`), over the truck's
     * own rows, so the refusals are the same ones the harness tests and the pane can predict. */
    const fromId = String(body.id ?? '')
    const intoId = String(body.into_id ?? '')
    const { data: rows, error: readErr } = await supabase
      .from('truck_places').select('id, name, name_key, is_hidden, merged_into_id')
      .eq('truck_id', truck.id)
    if (readErr) {
      console.error('[sg_merge_place] read failed:', readErr.code, readErr.message)
      return NextResponse.json({ error: "Couldn't read your places." }, { status: 400 })
    }
    const all = (rows ?? []) as SgPlace[]
    const refusal = mergeRefusal({ fromId, intoId, places: all })
    if (refusal) return NextResponse.json({ error: refusal }, { status: 400 })
    const patch = mergePatch({ fromId, intoId, places: all })
    if (!patch) return NextResponse.json({ error: "Those places can't be merged." }, { status: 400 })
    const { error } = await supabase.from('truck_places')
      .update({ merged_into_id: patch.merged_into_id, is_hidden: true, updated_at: new Date().toISOString() })
      .eq('id', patch.placeId).eq('truck_id', truck.id)
    if (error) {
      console.error('[sg_merge_place] write failed:', error.code, error.message)
      return NextResponse.json({ error: "Couldn't merge those places." }, { status: 400 })
    }
    return NextResponse.json({ ok: true, into_id: patch.merged_into_id })
  }


  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

