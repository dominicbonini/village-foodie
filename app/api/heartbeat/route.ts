import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { vanId, token } = await req.json()

    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }

    // Verify token — accept either a dashboard_token (truck) or a kds_token (van)
    let resolvedVanId = vanId as string | undefined

    if (!resolvedVanId) {
      // No van specified — stamp all active vans for this truck
      const { data: truck } = await supabaseAdmin
        .from('trucks')
        .select('id')
        .eq('dashboard_token', token)
        .eq('active', true)
        .single()

      if (!truck) {
        return NextResponse.json({ error: 'invalid token' }, { status: 401 })
      }

      await supabaseAdmin
        .from('truck_vans')
        .update({ last_heartbeat_at: new Date().toISOString() })
        .eq('truck_id', truck.id)
        .eq('active', true)

      return NextResponse.json({ ok: true })
    }

    // Van heartbeat — verify token is dashboard_token OR kds_token of this van
    const { data: vanByKds } = await supabaseAdmin
      .from('truck_vans')
      .select('id, truck_id')
      .eq('kds_token', token)
      .eq('active', true)
      .single()

    if (vanByKds) {
      await supabaseAdmin
        .from('truck_vans')
        .update({ last_heartbeat_at: new Date().toISOString(), online_paused_until: null })
        .eq('id', vanByKds.id)

      return NextResponse.json({ ok: true })
    }

    // Fall back to dashboard_token — verify the van belongs to this truck
    const { data: truck } = await supabaseAdmin
      .from('trucks')
      .select('id')
      .eq('dashboard_token', token)
      .eq('active', true)
      .single()

    if (!truck) {
      return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    }

    const { data: van } = await supabaseAdmin
      .from('truck_vans')
      .select('id')
      .eq('id', resolvedVanId)
      .eq('truck_id', truck.id)
      .eq('active', true)
      .single()

    if (!van) {
      return NextResponse.json({ error: 'van not found' }, { status: 404 })
    }

    await supabaseAdmin
      .from('truck_vans')
      .update({ last_heartbeat_at: new Date().toISOString(), online_paused_until: null })
      .eq('id', van.id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
