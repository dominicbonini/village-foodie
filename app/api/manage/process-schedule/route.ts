import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractScheduleEvents } from '@/lib/schedule-extract'
import { truckTimeSettings } from '@/lib/truck-time'
// Phase 2D-2: the truck's name, base, country and recent towns, and its country's location lines.
import { scheduleContextForTruck } from '@/lib/schedule-context'
// Language Phase 1d: a refusal of ours is `{ error: <today's English>, …, code, params }` (lib/i18n/manage-errors.ts), in the
// truck's language (en-GB before the truck is known). A database's or exception's message is passed on as it comes.
import { manageErrorBody } from '@/lib/i18n/manage-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { localeForTruck } from '@/lib/i18n/server-locale'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const token = formData.get('token') as string | null
  const file = formData.get('file') as File | null
  const text = formData.get('text') as string | null

  if (!token) {
    return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'token_required'), { status: 400 })
  }

  const { data: truck } = await supabase
    .from('trucks')
    .select('id, name, timezone, country, base_place_name, base_region')
    .eq('dashboard_token', token)
    .single()

  if (!truck) {
    return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'unauthorised'), { status: 401 })
  }

  try {
    let events
    const context = await scheduleContextForTruck(supabase, truck)
    if (file && file.size > 0) {
      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      events = await extractScheduleEvents({ mimeType: file.type, base64 }, await truckTimeSettings(truck), { context })
    } else {
      events = await extractScheduleEvents(text ?? '', await truckTimeSettings(truck), { context })
    }
    return NextResponse.json({ events })
  } catch (err) {
    console.error('[process-schedule] error:', err)
    return NextResponse.json(manageErrorBody(await localeForTruck(truck), 'events_extract_failed'), { status: 500 })
  }
}
