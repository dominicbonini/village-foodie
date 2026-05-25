// app/api/manage/route.ts
// Truck management API — handles all CRUD for menu, modifiers, deals, events, settings
// Authenticated via dashboard token + PIN (same as orders dashboard)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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
        .insert({ truck_id: truck.id, name, slug, prep_secs: prep_secs || 240, batch_size: batch_size || 2, allow_notes: !!allow_notes, sort_order: sort_order ?? nextOrder })
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

  // ── UPDATE TRUCK (KDS / operational fields) ──────────────────
  if (action === 'update_truck') {
    const allowed = ['crew_mode', 'kds_mode', 'display_mode', 'extra_wait_mins', 'paused_until', 'plan', 'trial_expires_at', 'feature_overrides', 'whatsapp_sender']
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
      .select('id, truck_id, name, kds_token, active')
      .eq('truck_id', truck.id)
      .eq('active', true)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ vans: data || [] })
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
    const roleLabel = role === 'manager' ? 'Manager' : 'Staff'

    const html = `
      <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
        <img src="${process.env.NEXT_PUBLIC_BASE_URL}/logos/village-foodie-logo-v2.png"
             width="160" style="margin-bottom:24px;display:block;"/>
        <h2 style="color:#0f172a;margin:0 0 16px;">
          You've been invited to join ${truck.name} on HatchGrab
        </h2>
        <p>Hi ${name || 'there'},</p>
        <p>${truck.name} has invited you to join their team as ${roleLabel === 'Manager' ? 'a Manager' : 'a Staff member'} on HatchGrab.</p>
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
        sender: { name: 'HatchGrab', email: 'hello@villagefoodie.co.uk' },
        to: [{ email }],
        replyTo: { email: 'hello@villagefoodie.co.uk' },
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

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}