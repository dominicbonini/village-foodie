// app/api/manage/route.ts
// Truck management API — handles all CRUD for menu, modifiers, deals, events, settings
// Authenticated via dashboard token + PIN (same as orders dashboard)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  return NextResponse.json({
    truck,
    categories: categories || [],
    items: items || [],
    modifierGroups: modifierGroups || [],
    modifierOptions: modifierOptions || [],
    categoryModGroups: categoryModGroups || [],
    bundles: bundles || [],
    codes: codes || [],
    events: events || [],
  })
}

// ── POST — all mutations ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, action } = body
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })

  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  // ── CATEGORY CRUD ─────────────────────────────────────────
  if (action === 'upsert_category') {
    const { id, name, prep_secs, batch_size, sort_order } = body
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (id) {
      const { data, error } = await supabase.from('menu_categories')
        .update({ name, slug, prep_secs, batch_size, sort_order })
        .eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ category: data })
    } else {
      const maxOrder = await supabase.from('menu_categories').select('sort_order').eq('truck_id', truck.id).order('sort_order', { ascending: false }).limit(1)
      const nextOrder = ((maxOrder.data?.[0]?.sort_order || 0) + 1)
      const { data, error } = await supabase.from('menu_categories')
        .insert({ truck_id: truck.id, name, slug, prep_secs: prep_secs || 240, batch_size: batch_size || 2, sort_order: sort_order ?? nextOrder })
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

  // ── ITEM CRUD ─────────────────────────────────────────────
  if (action === 'upsert_item') {
    const { id, name, description, price, category_id, is_available, stock_count, sort_order, image_path } = body
    if (id) {
      const { data, error } = await supabase.from('menu_items_db')
        .update({ name, description, price, category_id, is_available, stock_count, sort_order, image_path, updated_at: new Date().toISOString() })
        .eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ item: data })
    } else {
      const maxOrder = await supabase.from('menu_items_db').select('sort_order').eq('truck_id', truck.id).eq('category_id', category_id).order('sort_order', { ascending: false }).limit(1)
      const nextOrder = ((maxOrder.data?.[0]?.sort_order || 0) + 1)
      const { data, error } = await supabase.from('menu_items_db')
        .insert({ truck_id: truck.id, name, description, price, category_id, is_available: is_available ?? true, stock_count: stock_count ?? null, sort_order: sort_order ?? nextOrder, image_path })
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
    const { id, venue_name, address, event_date, start_time, end_time, notes } = body
    if (id) {
      const { data, error } = await supabase.from('truck_events').update({ venue_name, address, event_date, start_time, end_time, notes, updated_at: new Date().toISOString() }).eq('id', id).eq('truck_id', truck.id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ event: data })
    } else {
      const { data, error } = await supabase.from('truck_events').insert({ truck_id: truck.id, venue_name, address, event_date, start_time, end_time, notes, source: 'manual' }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ event: data })
    }
  }

  if (action === 'delete_event') {
    await supabase.from('truck_events').update({ is_cancelled: true }).eq('id', body.id).eq('truck_id', truck.id)
    return NextResponse.json({ success: true })
  }

  // ── SETTINGS ──────────────────────────────────────────────
  if (action === 'update_settings') {
    const { name, description, cuisine_type, contact_email, contact_phone, social_instagram, social_facebook, auto_accept, logo_storage_path, website } = body
    const { data, error } = await supabase.from('trucks').update({
      name, description, cuisine_type, contact_email, contact_phone, social_instagram, social_facebook, auto_accept,
      ...(logo_storage_path !== undefined ? { logo_storage_path } : {})
, ...(website !== undefined ? { website } : {})
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

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}