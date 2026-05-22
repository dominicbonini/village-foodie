import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getTruck(token: string) {
  const { data } = await supabase
    .from('trucks')
    .select('id, plan, feature_overrides, trial_expires_at')
    .eq('dashboard_token', token)
    .single()
  return data
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, action, eventId, payload } = body

  if (!token || !action) {
    return NextResponse.json({ error: 'Token and action required' }, { status: 400 })
  }

  const truck = await getTruck(token)
  if (!truck) return NextResponse.json({ error: 'Truck not found' }, { status: 404 })

  const now = new Date().toISOString()

  // ── CONFIRM ──────────────────────────────────────────────
  if (action === 'confirm') {
    const { auto_open, auto_close, venue_address, customer_note } = payload

    if (typeof auto_open !== 'boolean' || typeof auto_close !== 'boolean') {
      return NextResponse.json(
        { error: 'auto_open and auto_close are required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('truck_events')
      .update({
        status: 'confirmed',
        confirmed_at: now,
        auto_open,
        auto_close,
        venue_address: venue_address || null,
        customer_note: customer_note || null,
      })
      .eq('id', eventId)
      .eq('truck_id', truck.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── OPEN ─────────────────────────────────────────────────
  if (action === 'open') {
    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'open', opened_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .in('status', ['confirmed']) // can only open a confirmed event

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── CLOSE ────────────────────────────────────────────────
  if (action === 'close') {
    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'closed', closed_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)
      .eq('status', 'open') // can only close an open event

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── UPDATE ───────────────────────────────────────────────
  if (action === 'update') {
    const allowed = [
      'venue_name', 'venue_address', 'start_time', 'end_time',
      'customer_note', 'auto_open', 'auto_close', 'notes'
    ]
    const safe = Object.fromEntries(
      Object.entries(payload).filter(([k]) => allowed.includes(k))
    )

    const { error } = await supabase
      .from('truck_events')
      .update({ ...safe, updated_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── CANCEL ───────────────────────────────────────────────
  if (action === 'cancel') {
    const { error } = await supabase
      .from('truck_events')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
