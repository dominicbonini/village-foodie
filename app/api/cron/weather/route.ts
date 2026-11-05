// app/api/cron/weather/route.ts — reviews-weather-1 (5 November 2026, docs/reviews-weather-1-report.md).
// Refreshes the forecast for every upcoming stop (lib/weather/run.ts): a location's cache daily, every 3 hours on the day.
// ⚠️ SWITCHED OFF: platform_switches.weather_enabled is false, so a run reads that one row and returns `{ enabled: false }`.
// NOT registered in vercel.json's crons yet; add it hourly when weather is switched on.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { supabaseWeatherStore } from '@/lib/weather/store'
import { refreshWeather } from '@/lib/weather/run'
import { weatherProvider } from '@/lib/weather/openweather'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also run it by hand (the other crons' gate). */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const db = createClient((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  return NextResponse.json(await refreshWeather(supabaseWeatherStore(db), weatherProvider(), { now: () => new Date() }))
}
