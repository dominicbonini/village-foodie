// app/api/manage/weather/route.ts — reviews-weather-1 (5 November 2026, docs/reviews-weather-1-report.md).
// For a future Manage or dashboard screen: POST { token } → the truck's upcoming stops with their forecast (refreshed within the
// cache rules), plus the attribution the provider requires on screen. Anyone with access to the truck (staff too).
// ⚠️ SWITCHED OFF: while platform_switches.weather_enabled is false it answers 404 and fetches nothing. No screen calls it yet.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveTruckAccessWith } from '@/lib/truck-access'
import { manageErrorBody } from '@/lib/i18n/manage-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { supabaseWeatherStore } from '@/lib/weather/store'
import { weatherForTruck } from '@/lib/weather/run'
import { weatherProvider } from '@/lib/weather/openweather'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'bad_request'), { status: 400 }) }
  const token = String(body.token ?? '')
  if (!token) return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'token_required'), { status: 401 })
  const supabase = db()
  const { data: truck } = await supabase.from('trucks').select('id, operator_id').eq('dashboard_token', token).maybeSingle()
  if (!truck) return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, 'invalid_token'), { status: 401 })
  const access = await resolveTruckAccessWith(supabase, req, truck as { id: string; operator_id: string | null })
  if (!access.ok) return NextResponse.json(manageErrorBody(DEFAULT_LOCALE, access.code), { status: access.status })
  const out = await weatherForTruck(supabaseWeatherStore(supabase), weatherProvider(), String((truck as { id: string }).id), () => new Date())
  if (!out) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(out, { headers: { 'cache-control': 'private, no-store' } })
}
