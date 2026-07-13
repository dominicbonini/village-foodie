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
import { getSoleActiveVanId, getVanOrderReadyDefault } from '@/lib/van-utils'
import { hasValidEventTimes, getLocalDateInTz } from '@/lib/time-utils'
import { canAccess } from '@/lib/features'
import { logAllergenChanges, diffItemAllergens, tagJson, arrEq, type Actor } from '@/lib/allergen-audit'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  // Determine the calling user's role for this truck.
  // Operator identity takes priority — if the calling user owns this truck,
  // they are always 'owner' regardless of any truck_users crew entry.
  let userRole: 'owner' | 'manager' | 'staff' = 'owner'
  let currentUserId: string | null = null
  // The AUTHED session operator (account scope) — used to scope account-level data (pending email
  // change) to the logged-in user, NOT the truck's operator_id (which can pool multiple trucks).
  let currentOperatorId: string | null = null
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (user) {
      currentUserId = user.id
      const { data: sessionOperator } = await supabase
        .from('operators')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      currentOperatorId = sessionOperator?.id ?? null
      const isOperator = !!(sessionOperator && truck.operator_id && sessionOperator.id === truck.operator_id)
      if (!isOperator) {
        const { data: truckUser } = await supabase
          .from('truck_users')
          .select('role')
          .eq('auth_user_id', user.id)
          .eq('truck_id', truck.id)
          .single()
        if (truckUser?.role) userRole = truckUser.role as 'owner' | 'manager' | 'staff'
      }
    }
  } catch { /* if auth check fails, default to owner */ }

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

  // ── Resolve requesting user's role and ID ────────────────
  let requestingUserRole: 'owner' | 'manager' | 'staff' = 'owner'
  let requestingUserId: string | null = null
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (user) {
      requestingUserId = user.id
      const isOperator = truck.operator_id
        ? (await supabase
            .from('operators')
            .select('id')
            .eq('auth_user_id', user.id)
            .eq('id', truck.operator_id)
            .maybeSingle()
          ).data !== null
        : false
      if (!isOperator) {
        const { data: truckUser } = await supabase
          .from('truck_users')
          .select('role')
          .eq('auth_user_id', user.id)
          .eq('truck_id', truck.id)
          .single()
        if (truckUser?.role) requestingUserRole = truckUser.role as 'owner' | 'manager' | 'staff'
      }
    }
  } catch {}

  // ── Allergen-write gate (B) + audit identity (A) ─────────────────────────────────────
  // Allergen/dietary/card writes are owner/admin-only. Resolve operators.is_admin for the session user.
  // KNOWN-WEAK: token-only access resolves to requestingUserRole='owner' (no session) → it passes this
  // gate. That weakness is recorded HONESTLY via auth_method ('token' vs 'authenticated') on every log.
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
  ]
  if (staffBlockedActions.includes(action) && requestingUserRole === 'staff') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
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

  // ── SETTINGS ──────────────────────────────────────────────
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
  if (action === 'update_truck') {
    const allowed = ['crew_mode', 'kds_mode', 'display_mode', 'extra_wait_mins', 'paused_until', 'plan', 'trial_expires_at', 'feature_overrides', 'whatsapp_sender', 'preferred_contact_method', 'allow_customer_cancellation', 'cancellation_cutoff_mins', 'default_auto_open', 'default_auto_close', 'qr_code_style', 'scraper_preference', 'schedule_url', 'scraper_rule', 'preorders_enabled', 'preorder_deadline_type', 'preorder_deadline_value', 'preorder_past_action', 'preorder_open_rule', 'truck_order_email_enabled']
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
      .select('id, truck_id, name, kds_token, active, auto_pause_on_offline, show_cooking_step, order_ready_enabled, display_layout, split_screen, kitchen_capacity, capacity_window_mins')
      .eq('truck_id', truck.id)
      .eq('active', true)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ vans: data || [] })
  }

  if (action === 'update_van_settings') {
    const { vanId, autoPauseOnOffline, show_cooking_step, order_ready_enabled, kitchen_capacity, capacity_window_mins } = body
    const updates: Record<string, unknown> = {}
    if (autoPauseOnOffline !== undefined) updates.auto_pause_on_offline = autoPauseOnOffline
    if (show_cooking_step !== undefined)  updates.show_cooking_step = show_cooking_step
    if (order_ready_enabled !== undefined) updates.order_ready_enabled = order_ready_enabled
    if (kitchen_capacity !== undefined)   updates.kitchen_capacity = kitchen_capacity
    if (capacity_window_mins !== undefined) updates.capacity_window_mins = capacity_window_mins
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
        <img src="${HATCHGRAB_LOGO_URL}"
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
      .select('order_key, id, customer_name, customer_email, status, slot, total, discount_amt, created_at, items, deals, event_date')
      .eq('truck_id', truck.id)
      // Reports exclude cancelled/rejected orders (confirmed/collected/etc. only). Revenue already excludes
      // them client-side (:7008) — this server filter keeps the list + the revenue calc consistent.
      .not('status', 'in', '(cancelled,rejected)')

    // Resolve event date filter and build eventsMap for venue name lookup
    let eventsQuery = supabase
      .from('truck_events')
      .select('event_date, venue_name, town')
      .eq('truck_id', truck.id)

    if (eventId) {
      const { data: ev } = await supabase
        .from('truck_events')
        .select('event_date, venue_name, town')
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

    // Build event_date → {venue_name, town} map for client-side venue lookup
    const eventsMap: Record<string, { venue_name: string | null; town: string | null }> = {}
    for (const ev of (eventRows || [])) {
      if (!eventsMap[ev.event_date]) eventsMap[ev.event_date] = { venue_name: ev.venue_name, town: ev.town }
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

function generateSlots(start: string, end: string, intervalMins: number): string[] {
  const slots: string[] = []
  const [startH, startM] = start.split(':').map(Number)
  const [endH, endM] = end.split(':').map(Number)
  let mins = startH * 60 + startM
  const endMins = endH * 60 + endM
  while (mins <= endMins) {
    slots.push(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`)
    mins += intervalMins
  }
  return slots
}