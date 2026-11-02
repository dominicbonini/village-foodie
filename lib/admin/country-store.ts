// lib/admin/country-store.ts — the admin Countries page's database access. SERVICE ROLE, SERVER ONLY.
//
// Implements CountryStore (lib/admin/country-actions.ts) against public.country_settings and
// public.trucks. It reads with the loader's own column list and row mapper (lib/country-settings.ts), so
// the page shows exactly what every price surface reads. Writes are one row at a time; `update` carries
// the stale-save condition in its WHERE clause, so a save that lost a race writes nothing at all.

import 'server-only'
import type { CountryStore } from '@/lib/admin/country-actions'
import type { CountrySettings } from '@/lib/country-settings-types'
import { mapCountryRow, listCountrySettings, readAllCountryRows, selectWithFallback } from '@/lib/country-settings'

type Row = Record<string, unknown>
const db = async () => (await import('@/lib/supabase')).supabase

// ── faq-1 (1 November 2026): THE APP FLAGS, read beside the loader's columns ─────────────────────────────────────────────
// country_settings.ios_app_available / android_app_available (20261042) are not loader columns — the public pages read them only
// through lib/comparison-flags.ts — so this store reads them in a second select and adds them to each row it hands the page.
// A save writes them only when the page sent them (lib/admin/country-actions.ts valuesToColumns).
const APP_FLAGS = 'country_code, ios_app_available, android_app_available'
async function withAppFlags(rows: CountrySettings[]): Promise<CountrySettings[]> {
  if (!rows.length) return rows
  const { data, error } = await (await db()).from('country_settings').select(APP_FLAGS).in('country_code', rows.map(r => r.countryCode))
  if (error) throw new Error(`[country-store] app flags: ${error.message}`)
  const by = new Map(((data ?? []) as Row[]).map(r => [String(r.country_code), r]))
  return rows.map(r => {
    const f = by.get(r.countryCode)
    return f ? { ...r, iosAppAvailable: f.ios_app_available === true, androidAppAvailable: f.android_app_available === true } : r
  })
}

export const serviceCountryStore: CountryStore = {
  list: async () => withAppFlags(await listCountrySettings()),
  unreadable: async () => (await readAllCountryRows()).unreadable,

  async get(code) {
    const s = await db()
    const { data, error } = await selectWithFallback(cols => s.from('country_settings').select(cols).eq('country_code', code).maybeSingle())
    if (error) throw new Error(`[country-store] read ${code}: ${error.message}`)
    return data ? (await withAppFlags([mapCountryRow(data as unknown as Row)]))[0] : null
  },

  async truckCounts(codes) {
    const s = await db()
    const pairs = await Promise.all(codes.map(async code => {
      const { count, error } = await s.from('trucks').select('id', { count: 'exact', head: true }).eq('country', code)
      if (error) throw new Error(`[country-store] truck count for ${code}: ${error.message}`)
      return [code, count ?? 0] as const
    }))
    return Object.fromEntries(pairs)
  },

  async update(code, expectedUpdatedAt, columns) {
    // world-countries-1: the returned row is read with the loader's columns; a database before 20261054 refuses the update's
    // RETURNING list with 42703 BEFORE writing (one statement), so the retry writes once.
    const s = await db()
    const { data, error } = await selectWithFallback(cols => s.from('country_settings')
      .update(columns)
      .eq('country_code', code)
      .eq('updated_at', expectedUpdatedAt)   // 🔴 the stale-save condition — no match, no write
      .select(cols))
    if (error) throw new Error(`[country-store] save ${code}: ${error.message}`)
    const rows = (data ?? []) as unknown as Row[]
    return rows.length === 1 ? (await withAppFlags([mapCountryRow(rows[0])]))[0] : null
  },

  async insert(columns) {
    const s = await db()
    const { data, error } = await selectWithFallback(cols => s.from('country_settings').insert(columns).select(cols).single())
    if (error) throw new Error(`[country-store] add: ${error.message}`)
    return (await withAppFlags([mapCountryRow(data as unknown as Row)]))[0]
  },

  async remove(code) {
    const { data, error } = await (await db()).from('country_settings').delete().eq('country_code', code).select('country_code')
    if (error) throw new Error(`[country-store] remove ${code}: ${error.message}`)
    return (data ?? []).length
  },
}
