// app/api/manage/route.ts
// Truck management API — handles all CRUD for menu, modifiers, deals, events, settings
// Authenticated via dashboard token + PIN (same as orders dashboard)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { HATCHGRAB_SENDER, HATCHGRAB_LOGO_URL } from '@/lib/email-config'

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

  // Determine the calling user's role for this truck
  let userRole: 'owner' | 'manager' | 'staff' = 'owner'
  try {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (user) {
      const { data: truckUser } = await supabase
        .from('truck_users')
        .select('role')
        .eq('auth_user_id', user.id)
        .eq('truck_id', truck.id)
        .single()
      if (truckUser?.role) userRole = truckUser.role as 'owner' | 'manager' | 'staff'
    }
  } catch { /* if auth check fails, default to owner */ }

  const [
    { data: categories },
    { data: items },
    { data: modifierGroups },
    { data: modifierOptions },
    { data: categoryModGroups },
    { data: bundles },
    { data: codes },
    { data: events },
  ] = await Promise.all([
    supabase.from('menu_categories').select('*').eq('truck_id', truck.id).order('sort_order'),
    supabase.from('menu_items_db').select('*').eq('truck_id', truck.id).eq('is_active', true).order('sort_order'),
    supabase.from('modifier_groups').select('*').eq('truck_id', truck.id),
    supabase.from('modifier_options').select('*').in('group_id',
      (await supabase.from('modifier_groups').select('id').eq('truck_id', truck.id)).data?.map(g => g.id) || []
    ).order('sort_order'),
    supabase.from('category_modifier_groups').select('*'),
    supabase.from('bundles_db').select('*').eq('truck_id', truck.id).order('sort_order'),
    supabase.from('discount_codes_db').select('*').eq('truck_id', truck.id),
    supabase.from('truck_events').select('*').eq('truck_id', truck.id)
      .gte('event_date', new Date().toISOString().split('T')[0])
      .order('event_date'),
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

  return NextResponse.json({
    truck,
    categories: categories || [],
    items: items || [],
    modifierGroups: modifierGroups || [],
    modifierOptions: modifierOptions || [],
    categoryModGroups: categoryModGroups || [],
    bundles: stockCheckedBundles,
    codes: codes || [],
    events: events || [],
    userRole,
  })
}

// ── POST — all mutations ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, action } = body
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })

  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // ── Staff permission gate ─────────────────────────────────
  const writeActions = [
    'upsert_event', 'upsert_item', 'upsert_category', 'delete_item', 'delete_category',
    'update_truck', 'update_settings', 'add_van', 'rename_van', 'delete_van',
    'invite_team_member', 'remove_team_member', 'upsert_bundle', 'delete_bundle',
    'upsert_modifier_group', 'delete_modifier_group', 'upsert_modifier_option', 'delete_modifier_option',
  ]
  if (writeActions.includes(action)) {
    const supabaseAuth = await createSupabaseServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (user) {
      const { data: truckUser } = await supabase
        .from('truck_users')
        .select('role')
        .eq('auth_user_id', user.id)
        .eq('truck_id', truck.id)
        .single()
      if (truckUser?.role === 'staff') {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
    }
  }

  // ── CATEGORY CRUD ─────────────────────────────────────────
  if (action === 'upsert_category') {
    const { id, name, prep_secs, batch_size, allow_notes, sort_order } = body
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (id) {
      const { data, error } = await supabase.from('menu_categories')
        .update({ name, slug, prep_secs, batch_size, allow_notes: !!allow_notes, sort_order })
        .eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ category: data })
    } else {
      const maxOrder = await supabase.from('menu_categories').select('sort_order').eq('truck_id', truck.id).order('sort_order', { ascending: false }).limit(1)
      const nextOrder = ((maxOrder.data?.[0]?.sort_order || 0) + 1)
      const { data, error } = await supabase.from('menu_categories')
        .insert({ truck_id: truck.id, name, slug, prep_secs: prep_secs ?? 0, batch_size: batch_size ?? 999, allow_notes: !!allow_notes, sort_order: sort_order ?? nextOrder })
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
    const { id, name, description, price, category_id, is_available, stock_count, sort_order, image_path, allergens, dietary_info } = body
    if (id) {
      const { data, error } = await supabase.from('menu_items_db')
        .update({ name, description, price, category_id, is_available, stock_count, sort_order, image_path, allergens, dietary_info, updated_at: new Date().toISOString() })
        .eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ item: data })
    } else {
      const maxOrder = await supabase.from('menu_items_db').select('sort_order').eq('truck_id', truck.id).eq('category_id', category_id).order('sort_order', { ascending: false }).limit(1)
      const nextOrder = ((maxOrder.data?.[0]?.sort_order || 0) + 1)
      const { data, error } = await supabase.from('menu_items_db')
        .insert({ truck_id: truck.id, name, description, price, category_id, is_available: is_available ?? true, stock_count: stock_count ?? null, sort_order: sort_order ?? nextOrder, image_path, allergens: allergens ?? [], dietary_info: dietary_info ?? [] })
        .select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
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

  if (action === 'delete_modifier_group') {
    await supabase.from('modifier_groups').delete().eq('id', body.id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'upsert_modifier_option') {
    const { id, group_id, name, price_adjustment, type, sort_order } = body
    if (id) {
      const { data } = await supabase.from('modifier_options').update({ name, price_adjustment, type, sort_order }).eq('id', id).select().single()
      return NextResponse.json({ option: data })
    } else {
      const { data, error } = await supabase.from('modifier_options').insert({ group_id, name, price_adjustment: price_adjustment || 0, type: type || 'add', sort_order: sort_order || 0 }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ option: data })
    }
  }

  if (action === 'delete_modifier_option') {
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

  if (action === 'update_category_order') {
    const { id, sort_order } = body
    await supabase.from('menu_categories').update({ sort_order }).eq('id', id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  // ── BUNDLE CRUD ───────────────────────────────────────────
  if (action === 'upsert_bundle') {
    const { id, ...fields } = body
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
    const { id, venue_name, town, postcode, address, event_date, start_time, end_time, notes, latitude, longitude } = body
    if (id) {
      const { data, error } = await supabase.from('truck_events').update({ venue_name, town: town ?? null, postcode: postcode ?? null, address, event_date, start_time, end_time, notes, latitude: latitude ?? null, longitude: longitude ?? null, updated_at: new Date().toISOString() }).eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ event: data })
    } else {
      const { data, error } = await supabase.from('truck_events').insert({ truck_id: truck.id, venue_name, town: town ?? null, postcode: postcode ?? null, address, event_date, start_time, end_time, notes, latitude: latitude ?? null, longitude: longitude ?? null, source: 'manual' }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })

      // Auto-create event_deals from current bundle defaults
      const newEventId = data.id
      const { data: bundles } = await supabase
        .from('bundles_db')
        .select('id, apply_to_new_events')
        .eq('truck_id', truck.id)
        .eq('is_available', true)

      if (bundles && bundles.length > 0 && newEventId) {
        const eventDeals = bundles.map(bundle => ({
          event_id: newEventId,
          bundle_id: bundle.id,
          active: bundle.apply_to_new_events,
          overridden: false,
        }))
        await supabase
          .from('event_deals')
          .upsert(eventDeals, { onConflict: 'event_id,bundle_id', ignoreDuplicates: true })
      }

      return NextResponse.json({ event: data })
    }
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
    await supabase.from('truck_events').update({ status: 'cancelled' }).eq('id', body.id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  // ── SETTINGS ──────────────────────────────────────────────
  if (action === 'update_settings') {
    const { name, description, cuisine_type, contact_email, contact_phone, social_instagram, social_facebook, auto_accept, logo_storage_path, website, allergen_info_url, allergen_info_text } = body
    const { data, error } = await supabase.from('trucks').update({
      name, description, cuisine_type, contact_email, contact_phone, social_instagram, social_facebook, auto_accept,
      ...(logo_storage_path !== undefined ? { logo_storage_path } : {}),
      ...(website !== undefined ? { website } : {}),
      ...(allergen_info_url !== undefined ? { allergen_info_url } : {}),
      ...(allergen_info_text !== undefined ? { allergen_info_text } : {}),
    }).eq('id', truck.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
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
    const allowed = ['crew_mode', 'kds_mode', 'display_mode', 'extra_wait_mins', 'paused_until', 'plan', 'trial_expires_at', 'feature_overrides', 'whatsapp_sender', 'preferred_contact_method', 'allow_customer_cancellation', 'cancellation_cutoff_mins']
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
        id, email, name, role, accepted_at,
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
      .select('id, truck_id, name, kds_token, active, auto_pause_on_offline, show_cooking_step, display_layout, split_screen')
      .eq('truck_id', truck.id)
      .eq('active', true)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ vans: data || [] })
  }

  if (action === 'update_van_settings') {
    const { vanId, autoPauseOnOffline, show_cooking_step } = body
    const updates: Record<string, unknown> = {}
    if (autoPauseOnOffline !== undefined) updates.auto_pause_on_offline = autoPauseOnOffline
    if (show_cooking_step !== undefined)  updates.show_cooking_step = show_cooking_step
    await supabase
      .from('truck_vans')
      .update(updates)
      .eq('id', vanId)
      .eq('truck_id', truck.id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'add_van') {
    const { name } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('truck_vans')
      .insert({ truck_id: truck.id, name: name.trim() })
      .select('id, truck_id, name, kds_token, active')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, van: data })
  }

  if (action === 'delete_van') {
    const { vanId } = body
    const { count } = await supabase
      .from('truck_vans')
      .select('*', { count: 'exact', head: true })
      .eq('truck_id', truck.id)
      .eq('active', true)
    if (!count || count <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last van' }, { status: 400 })
    }
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

    if (authError) {
      console.warn('Auth user creation failed:', authError.message)
    }

    if (authData?.user) {
      await supabase
        .from('truck_users')
        .update({ auth_user_id: authData.user.id })
        .eq('id', newMember.id)

      await supabase
        .from('operators')
        .upsert({
          auth_user_id: authData.user.id,
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

    await fetch('https://api.brevo.com/v3/smtp/email', {
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

    return NextResponse.json({ ok: true, memberId: newMember.id })
  }

  if (action === 'remove_team_member') {
    const { memberId } = body
    await supabase
      .from('truck_users')
      .delete()
      .eq('id', memberId)
      .eq('truck_id', truck.id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'get_report') {
    const { date, eventId } = body

    let query = supabase
      .from('orders')
      .select('id, total, discount_amt, created_at, items, deals, event_date')
      .eq('truck_id', truck.id)
      .in('status', ['confirmed', 'collected', 'ready', 'cooking'])

    // If a specific event is selected, resolve its date and filter by event_date
    if (eventId) {
      const { data: ev } = await supabase
        .from('truck_events')
        .select('event_date')
        .eq('id', eventId)
        .eq('truck_id', truck.id)
        .single()
      if (ev?.event_date) {
        query = query.eq('event_date', ev.event_date)
      }
    } else if (date) {
      query = query
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`)
    }

    const { data: orders } = await query

    if (!orders || orders.length === 0) {
      return NextResponse.json({ ok: true, report: null })
    }

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
      },
    })
  }

  if (action === 'get_recent_events') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data: events } = await supabase
      .from('truck_events')
      .select('id, venue_name, event_date, status')
      .eq('truck_id', truck.id)
      .gte('event_date', thirtyDaysAgo)
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