// app/api/manage/process-menu/route.ts
// Thin HTTP wrapper. All extraction logic (prompt, Gemini call, parse/normalise) lives in
// lib/menu-extract.ts so the server-side demo provisioner can call it directly instead of self-fetching
// this route. Behaviour over the wire is UNCHANGED — same auth, same request shape, same response shape,
// same status codes.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractMenu, MenuExtractionError } from '@/lib/menu-extract'
import { moneyFormatForTruck } from '@/lib/money-server'
import { countrySettingsForTruck } from '@/lib/country-settings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const token = formData.get('token') as string
  const text = formData.get('text') as string | null
  const file = formData.get('file') as File | null

  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: truck } = await supabase
    .from('trucks')
    .select('id, name, currency, country')
    .eq('dashboard_token', token)
    .single()

  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    // US readiness (D35): the prompt names the truck's country's allergen list (UK 14 / US 9).
    const result = await extractMenu(supabase, { id: truck.id, name: truck.name, money: await moneyFormatForTruck(truck), allergenSet: (await countrySettingsForTruck(truck)).allergenSet }, { file, text })
    return NextResponse.json(result)
  } catch (err) {
    // Same 500 + message the inline implementation returned.
    const message = err instanceof MenuExtractionError ? err.message : 'Failed to process menu'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
