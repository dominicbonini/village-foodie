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
// compare-autopublish-1 (7 November 2026, Dominic's Q1 = C / Q2 = A): every English- or German-language country is listed, with its
// AUTO-PUBLISH switch (public.comparison_publish — not a protected table) and the automatic verdict. `status` is Admin's own
// (country_settings); `effective` is what the site shows (live when Admin says live, or auto-publish on and the evaluation says live).
//   PATCH { code, status }       — as before; setting 'off' is now RECORDED (admin_off) and always wins over auto-publish; 'admin' /
//                                  'live' lift it.
//   PATCH { code, autoPublish }  — the country's auto-publish switch. The UAE's stays off (refused).
import { NextRequest, NextResponse } from 'next/server'
import { adminUser } from '@/lib/auth/admin'
import { clearCountrySettingsCache, listCountrySettings } from '@/lib/country-settings'
import { clearComparisonCache, comparisonFlags, comparisonPath } from '@/lib/comparison-server'
import { isComparisonStatus, NEVER_AUTO_PUBLISH } from '@/lib/comparison-types'
import { revalidateMarketing } from '@/lib/marketing-cache'   // perf-1: the marketing pages' cached data, expired on a write
import { MARKETING_TAGS } from '@/lib/marketing-tags'

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
    const { supabase } = await import('@/lib/supabase')
    const [countries, flags, isReady, own, pub] = await Promise.all([listCountrySettings(), comparisonFlags(), ready(),
      supabase.from('country_settings').select('country_code, comparison_status'),
      supabase.from('comparison_publish').select('country_code, auto_publish, auto_live, admin_off, shown, evaluated_at')])
    const ownOf = new Map(((own.data ?? []) as { country_code: string; comparison_status: string }[]).map(r => [r.country_code, r.comparison_status]))
    const pubOf = new Map(((pub.error ? [] : pub.data ?? []) as Record<string, unknown>[]).map(r => [String(r.country_code), r]))
    const rows = countries
      .map(c => {
        const p = pubOf.get(c.countryCode)
        return { code: c.countryCode, name: c.name, locale: c.locale, enabled: c.enabled, path: comparisonPath(c.countryCode, c.locale),
          status: isComparisonStatus(ownOf.get(c.countryCode)) ? ownOf.get(c.countryCode)! : 'off', effective: flags.get(c.countryCode)?.status ?? 'off',
          iosApp: flags.get(c.countryCode)?.iosApp ?? false, androidApp: flags.get(c.countryCode)?.androidApp ?? false,
          autoPublish: !NEVER_AUTO_PUBLISH.includes(c.countryCode) && (p ? p.auto_publish !== false : true), autoLocked: NEVER_AUTO_PUBLISH.includes(c.countryCode),
          autoLive: p?.auto_live === true, adminOff: p?.admin_off === true, evaluatedAt: (p?.evaluated_at as string | null) ?? null,
          shown: Array.isArray(p?.shown) ? (p!.shown as { name: string }[]).map(s => s.name) : [] }
      })
      // The page is written in German and English: every country whose language has it.
      .filter(r => r.path)
    return NextResponse.json({ ready: isReady, countries: rows })
  } catch (e) {
    console.error('[admin/countries/comparison]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'The comparison pages could not be loaded just now.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const me = await adminUser(req)
  if (!me) return notFound()
  let b: Record<string, unknown> = {}
  try { const j = await req.json(); if (j && typeof j === 'object') b = j } catch { /* refused below */ }
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : ''
  if (!/^[A-Z]{2}$/.test(code)) return NextResponse.json({ error: 'Which country?' }, { status: 400 })
  // compare-autopublish-1: the auto-publish switch (comparison_publish, upserted).
  if ('autoPublish' in b) {
    if (typeof b.autoPublish !== 'boolean') return NextResponse.json({ error: 'Auto-publish is on or off.' }, { status: 400 })
    if (NEVER_AUTO_PUBLISH.includes(code) && b.autoPublish) return NextResponse.json({ error: 'This country is never published automatically.' }, { status: 400 })
    try {
      const { supabase } = await import('@/lib/supabase')
      const { error } = await supabase.from('comparison_publish').upsert({ country_code: code, auto_publish: b.autoPublish, ...(b.autoPublish ? {} : { auto_live: false }),
        updated_at: new Date().toISOString(), updated_by: me.id }, { onConflict: 'country_code' })
      if (error) throw new Error(error.message)
      clearComparisonCache()
      revalidateMarketing([MARKETING_TAGS.countries], 'admin/countries/comparison auto-publish')
      return NextResponse.json({ code, autoPublish: b.autoPublish })
    } catch (e) {
      console.error('[admin/countries/comparison]', e instanceof Error ? e.message : e)
      return NextResponse.json({ error: 'That could not be saved just now. Nothing was changed — try again in a moment.' }, { status: 500 })
    }
  }
  if (!isComparisonStatus(b.status)) return NextResponse.json({ error: 'The status is off, admin or live.' }, { status: 400 })
  try {
    if (!(await ready())) return NextResponse.json({ error: 'Run supabase/migrations/20261042_compare_de_1.sql first, then reload. Nothing was changed.' }, { status: 503 })
    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.from('country_settings').update({ comparison_status: b.status }).eq('country_code', code).select('country_code, comparison_status')
    if (error) throw new Error(error.message)
    if (!data || data.length !== 1) return NextResponse.json({ error: 'That country is gone. Reload the page.' }, { status: 404 })
    // compare-autopublish-1 (Q2 = A): an explicit "off" is recorded and always wins over auto-publish; any other status lifts it.
    {
      const off = b.status === 'off', at = new Date().toISOString()
      const { error: pe } = await supabase.from('comparison_publish').upsert({ country_code: code, admin_off: off, admin_off_at: off ? at : null,
        ...(NEVER_AUTO_PUBLISH.includes(code) ? { auto_publish: false, auto_live: false } : {}), updated_at: at, updated_by: me.id }, { onConflict: 'country_code' })
      if (pe) console.error('[admin/countries/comparison] the explicit off was not recorded:', pe.message)
    }
    clearComparisonCache(); clearCountrySettingsCache()
    // perf-1: the comparison status is a country setting the marketing pages read (their comparison links, hreflang).
    revalidateMarketing([MARKETING_TAGS.countries], 'admin/countries/comparison')
    return NextResponse.json({ code, status: b.status })
  } catch (e) {
    console.error('[admin/countries/comparison]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'That could not be saved just now. Nothing was changed — try again in a moment.' }, { status: 500 })
  }
}
