// lib/admin/country-store.ts — the admin Countries page's database access. SERVICE ROLE, SERVER ONLY.
//
// Implements CountryStore (lib/admin/country-actions.ts) against public.country_settings and
// public.trucks. It reads with the loader's own column list and row mapper (lib/country-settings.ts), so
// the page shows exactly what every price surface reads. Writes are one row at a time; `update` carries
// the stale-save condition in its WHERE clause, so a save that lost a race writes nothing at all.

import 'server-only'
import type { CountryStore } from '@/lib/admin/country-actions'
import { COUNTRY_SETTINGS_COLUMNS, mapCountryRow, listCountrySettings } from '@/lib/country-settings'

type Row = Record<string, unknown>
const db = async () => (await import('@/lib/supabase')).supabase

export const serviceCountryStore: CountryStore = {
  list: () => listCountrySettings(),

  async get(code) {
    const { data, error } = await (await db()).from('country_settings').select(COUNTRY_SETTINGS_COLUMNS).eq('country_code', code).maybeSingle()
    if (error) throw new Error(`[country-store] read ${code}: ${error.message}`)
    return data ? mapCountryRow(data as unknown as Row) : null
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
    const { data, error } = await (await db()).from('country_settings')
      .update(columns)
      .eq('country_code', code)
      .eq('updated_at', expectedUpdatedAt)   // 🔴 the stale-save condition — no match, no write
      .select(COUNTRY_SETTINGS_COLUMNS)
    if (error) throw new Error(`[country-store] save ${code}: ${error.message}`)
    const rows = (data ?? []) as unknown as Row[]
    return rows.length === 1 ? mapCountryRow(rows[0]) : null
  },

  async insert(columns) {
    const { data, error } = await (await db()).from('country_settings').insert(columns).select(COUNTRY_SETTINGS_COLUMNS).single()
    if (error) throw new Error(`[country-store] add: ${error.message}`)
    return mapCountryRow(data as unknown as Row)
  },

  async remove(code) {
    const { data, error } = await (await db()).from('country_settings').delete().eq('country_code', code).select('country_code')
    if (error) throw new Error(`[country-store] remove ${code}: ${error.message}`)
    return (data ?? []).length
  },
}
