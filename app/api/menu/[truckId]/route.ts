// app/api/menu/[truckId]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { loadTruckMenuSafe } from '@/lib/menu-loader'

export const revalidate = 300

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
    return NextResponse.json(
      { error: 'Truck not found' },
      { status: 404 }
    )
  }

  const menu = await loadTruckMenuSafe(truck.sheet_id)

  if (!menu) {
    return NextResponse.json(
      { error: 'Menu unavailable — please try again shortly' },
      { status: 503 }
    )
  }

  return NextResponse.json({
    truck: {
      id:         truck.id,
      name:       truck.name,
      mode:       truck.mode,
      venue_name: truck.venue_name,
    },
    menu,
  })
}