// app/api/menu/[truckId]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { loadTruckMenuSafe } from '@/lib/menu-loader'

const TRUCKS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=28504033&single=true&output=csv'

export const revalidate = 300

// Fetch truck logo from the master CSV — same source as TruckClient
async function getTruckLogo(truckId: string): Promise<string | null> {
  try {
    const res = await fetch(TRUCKS_CSV_URL, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const text = await res.text()
    const rows = text.split('\n').slice(1)
    for (const row of rows) {
      const cols = row.split(',')
      const name = cols[0]?.replace(/^"|"$/g, '').trim()
      const slug = name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
      if (slug === truckId) {
        const logo = cols[9]?.replace(/^"|"$/g, '').trim()
        return logo || null
      }
    }
  } catch { return null }
  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ truckId: string }> }
) {
  const { truckId } = await params

  const { data: truck, error } = await supabase
    .from('trucks')
    .select('*')
    .eq('id', truckId)
    .eq('active', true)
    .single()

  if (error || !truck) {
    return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
  }

  const [menu, logo] = await Promise.all([
    loadTruckMenuSafe(truck.sheet_id),
    getTruckLogo(truckId),
  ])

  if (!menu) {
    return NextResponse.json({ error: 'Menu unavailable — please try again shortly' }, { status: 503 })
  }

  // Apply sold-out overrides from Supabase
  const { data: overrides } = await supabase
    .from('item_overrides')
    .select('item_name, available')
    .eq('truck_id', truck.id)
    .eq('available', false)

  const soldOutNames = new Set((overrides || []).map((o: any) => o.item_name))

  if (soldOutNames.size > 0 && menu) {
    menu.items = menu.items.map(item => ({
      ...item,
      available: soldOutNames.has(item.name) ? false : item.available
    })).filter(item => item.available)
  }

  return NextResponse.json({
    truck: {
      id:         truck.id,
      name:       truck.name,
      logo:       logo,
      mode:       truck.mode,
      venue_name: truck.venue_name,
    },
    menu,
  })
}