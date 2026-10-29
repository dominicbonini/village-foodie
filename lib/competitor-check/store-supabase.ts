// lib/competitor-check/store-supabase.ts — the checker's database access (competitor-check-1, 25 October 2026).
// SERVICE ROLE. Used by scripts/competitor-check/main.ts in GitHub Actions (the client is built there from the secrets
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, as the scraper's workflows do).
//
// 🔴 WHAT IT MAY WRITE: competitor_check_runs (insert, update), competitor_check_findings (insert), and on competitors
// ONLY the scheduling columns — setSchedule refuses anything else. There is no method that writes a plan, a price, a
// feature or a verification, so the checker cannot, whatever the model says. competitor-check-2: and on the settings row
// ONLY deep_country (setDeepCountry, the deep check moving on to the next country); country_settings is read, never written.
import type { SupabaseClient } from '@supabase/supabase-js'
import { FEATURE_FIELDS } from './model'
import { SCHEDULE_COLUMNS, type CheckerStore, type CheckSettings, type CompetitorForCheck } from './checker'
import { countriesOf, type Prices, type QueueCountry } from './core'
import type { StoredPlanForPrompt } from './prompts'

type Row = Record<string, unknown>
const COMPETITOR_COLS = ['id', 'name', 'website', 'focus', 'lifecycle', 'check_urls', 'check_interval_days', 'next_check_at', 'last_checked_at',
  'deep_checked_at', 'check_requested_at', 'min_term', 'payment_methods', 'notes', ...FEATURE_FIELDS].join(', ')
const PLAN_COLS = 'id, competitor_id, plan_name, country_code, currency, price_hidden, monthly_minor, yearly_only, vat, setup_minor, truck_fee_bps, truck_fee_fixed_minor, customer_fee_bps, customer_fee_fixed_minor, card_mode, card_bps, card_fixed_minor, source_url'

export function settingsOut(r: Row): CheckSettings {
  return {
    paused: r.paused === true, dailyCapUsd: Number(r.daily_cap_usd), monthlyCapUsd: Number(r.monthly_cap_usd), deepPerDay: Number(r.deep_per_day),
    checkIntervalDays: Number(r.check_interval_days), deepRequestedAt: (r.deep_requested_at as string | null) ?? null,
    extractorModel: String(r.extractor_model), verifierModel: String(r.verifier_model), prices: r.prices as Prices,
    // competitor-check-2 (20261045), read tolerantly: before it runs, no country deep check.
    deepCountry: typeof r.deep_country === 'string' && /^[A-Z]{2}$/.test(r.deep_country) ? r.deep_country : null,
    deepQueue: Array.isArray(r.deep_queue) ? (r.deep_queue as unknown[]).filter((c): c is string => typeof c === 'string' && /^[A-Z]{2}$/.test(c)) : [],
  }
}
export function competitorForCheck(r: Row, plans: Row[]): CompetitorForCheck {
  const own = plans.filter(p => p.competitor_id === r.id)
  return {
    id: String(r.id), name: String(r.name), website: (r.website as string | null) ?? null, focus: (r.focus as string | null) ?? null,
    lifecycle: r.lifecycle as CompetitorForCheck['lifecycle'], checkUrls: Array.isArray(r.check_urls) ? (r.check_urls as string[]) : [],
    checkIntervalDays: Number(r.check_interval_days) || 90, nextCheckAt: (r.next_check_at as string | null) ?? null,
    lastCheckedAt: (r.last_checked_at as string | null) ?? null, deepCheckedAt: (r.deep_checked_at as string | null) ?? null,
    checkRequestedAt: (r.check_requested_at as string | null) ?? null, minTerm: (r.min_term as string | null) ?? null,
    paymentMethods: (r.payment_methods as string | null) ?? null,
    features: Object.fromEntries(FEATURE_FIELDS.map(f => [f, String(r[f] ?? 'unknown')])),
    plans: own as unknown as StoredPlanForPrompt[],
    countries: countriesOf(String(r.lifecycle), own.map(p => String(p.country_code)), r.notes),
  }
}

export function supabaseCheckerStore(db: SupabaseClient): CheckerStore {
  const fail = (what: string, e: { message: string }) => { throw new Error(`[competitor-check] ${what}: ${e.message}`) }
  return {
    async settings() {
      const { data, error } = await db.from('competitor_check_settings').select('*').eq('id', true).single()
      if (error) fail('read settings', error)
      return settingsOut(data as Row)
    },
    async competitors() {
      const [c, p] = await Promise.all([
        db.from('competitors').select(COMPETITOR_COLS).order('name'),
        db.from('competitor_plans').select(PLAN_COLS).is('superseded_at', null),
      ])
      if (c.error) fail('read competitors', c.error)
      if (p.error) fail('read plans', p.error)
      const plans = (p.data ?? []) as unknown as Row[]
      return ((c.data ?? []) as unknown as Row[]).map(r => competitorForCheck(r, plans))
    },
    async spend(today) {
      const month = `${today.slice(0, 7)}-01T00:00:00Z`
      const { data, error } = await db.from('competitor_check_runs').select('started_at, cost_usd, competitors_checked').gte('started_at', month).order('started_at', { ascending: false })
      if (error) fail('read runs', error)
      const rows = (data ?? []) as { started_at: string; cost_usd: number | string; competitors_checked: number }[]
      const sum = (rs: typeof rows) => rs.reduce((s, r) => s + Number(r.cost_usd || 0), 0)
      const recent = rows.filter(r => r.competitors_checked > 0).slice(0, 10)
      const n = recent.reduce((s, r) => s + r.competitors_checked, 0)
      return { todayUsd: sum(rows.filter(r => r.started_at.slice(0, 10) === today)), monthUsd: sum(rows), priorAvgUsd: n ? sum(recent) / n : null }
    },
    async createRun(row) {
      const { data, error } = await db.from('competitor_check_runs').insert(row).select('id').single()
      if (error) fail('create run', error)
      return String((data as Row).id)
    },
    async updateRun(id, cols) {
      const { error } = await db.from('competitor_check_runs').update(cols).eq('id', id)
      if (error) fail('update run', error)
    },
    async insertFindings(rows) {
      const { error } = await db.from('competitor_check_findings').insert(rows)
      if (error) fail('write findings', error)
    },
    async setSchedule(id, cols) {
      const bad = Object.keys(cols).filter(k => !(SCHEDULE_COLUMNS as readonly string[]).includes(k))
      if (bad.length) throw new Error(`[competitor-check] refused: the checker may only write the scheduling columns, not ${bad.join(', ')}`)
      const { error } = await db.from('competitors').update(cols).eq('id', id)
      if (error) fail('write schedule', error)
    },
    async countries() {
      const { data, error } = await db.from('country_settings').select('country_code, enabled, comparison_status')
      if (error) fail('read countries', error)
      return ((data ?? []) as Row[]).map(r => ({ code: String(r.country_code), enabled: r.enabled === true, comparisonStatus: (r.comparison_status as string | null) ?? null })) as QueueCountry[]
    },
    async setDeepCountry(code) {
      if (code !== null && !/^[A-Z]{2}$/.test(code)) throw new Error(`[competitor-check] refused: "${code}" is not a country code`)
      const { error } = await db.from('competitor_check_settings').update({ deep_country: code }).eq('id', true)
      if (error) fail('move the deep check on', error)
    },
  }
}
