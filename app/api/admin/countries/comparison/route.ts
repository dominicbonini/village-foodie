// app/api/admin/countries/comparison/route.ts — Admin › Countries › "Comparison pages" (compare-de-1, 24 October 2026).
//
//   GET    every country that can have a comparison page: its status (off | admin | live), app flags and address
//   PATCH  { code, status }  — sets country_settings.comparison_status for ONE country
//
// 🔴 ADMIN ONLY, SERVICE ROLE, SERVER ONLY, like the Countries routes beside it; anyone else gets a 404. Only
// comparison_status is written here — nothing else on the row, and never the app flags (those follow the stores and are
// set by SQL on the day, docs/compare-de-1-report.md). Before 20261042 has run the column is missing: GET says
// `ready: false` and PATCH refuses with a plain sentence. After a save both caches are cleared, so this instance shows
// the change at once and every other within 60 seconds.
import { NextRequest, NextResponse } from 'next/server'
import { adminUser } from '@/lib/auth/admin'
import { clearCountrySettingsCache, listCountrySettings } from '@/lib/country-settings'
import { clearComparisonCache, comparisonFlags, comparisonPath } from '@/lib/comparison-server'
import { isComparisonStatus } from '@/lib/comparison-types'

export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
const missing = (e: { code?: string; message: string } | null) => !!e && (e.code === '42703' || /column .* does not exist/i.test(e.message))

async function ready(): Promise<boolean> {
  const { supabase } = await import('@/lib/supabase')
  const { error } = await supabase.from('country_settings').select('comparison_status').limit(1)
  if (error && !missing(error)) throw new Error(error.message)
  return !error
}

export async function GET(req: NextRequest) {
  if (!(await adminUser(req))) return notFound()
  try {
    clearComparisonCache()
    const [countries, flags, isReady] = await Promise.all([listCountrySettings(), comparisonFlags(), ready()])
    const rows = countries
      .map(c => ({ code: c.countryCode, name: c.name, locale: c.locale, enabled: c.enabled, path: comparisonPath(c.countryCode, c.locale),
        status: flags.get(c.countryCode)?.status ?? 'off', iosApp: flags.get(c.countryCode)?.iosApp ?? false, androidApp: flags.get(c.countryCode)?.androidApp ?? false }))
      // The page is written in German (and the English base): German-language countries, plus any already switched on.
      .filter(r => r.path && (/^de(-|$)/i.test(r.locale) || r.status !== 'off'))
    return NextResponse.json({ ready: isReady, countries: rows })
  } catch (e) {
    console.error('[admin/countries/comparison]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'The comparison pages could not be loaded just now.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await adminUser(req))) return notFound()
  let b: Record<string, unknown> = {}
  try { const j = await req.json(); if (j && typeof j === 'object') b = j } catch { /* refused below */ }
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : ''
  if (!/^[A-Z]{2}$/.test(code)) return NextResponse.json({ error: 'Which country?' }, { status: 400 })
  if (!isComparisonStatus(b.status)) return NextResponse.json({ error: 'The status is off, admin or live.' }, { status: 400 })
  try {
    if (!(await ready())) return NextResponse.json({ error: 'Run supabase/migrations/20261042_compare_de_1.sql first, then reload. Nothing was changed.' }, { status: 503 })
    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.from('country_settings').update({ comparison_status: b.status }).eq('country_code', code).select('country_code, comparison_status')
    if (error) throw new Error(error.message)
    if (!data || data.length !== 1) return NextResponse.json({ error: 'That country is gone. Reload the page.' }, { status: 404 })
    clearComparisonCache(); clearCountrySettingsCache()
    return NextResponse.json({ code, status: b.status })
  } catch (e) {
    console.error('[admin/countries/comparison]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'That could not be saved just now. Nothing was changed — try again in a moment.' }, { status: 500 })
  }
}
