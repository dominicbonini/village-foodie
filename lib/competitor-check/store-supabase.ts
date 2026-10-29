// lib/competitor-check/store-supabase.ts — the checker's database access (competitor-check-1, 25 October 2026).
// SERVICE ROLE. Used by scripts/competitor-check/main.ts in GitHub Actions (the client is built there from the secrets
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, as the scraper's workflows do).
//
// 🔴 WHAT IT MAY WRITE: competitor_check_runs (insert, update), competitor_check_findings (insert), and on competitors
// ONLY the scheduling columns — setSchedule refuses anything else. There is no method that writes a plan, a price, a
// feature or a verification, so the checker cannot, whatever the model says. competitor-check-2: and on the settings row
// ONLY deep_country (setDeepCountry, the deep check moving on to the next country); country_settings is read, never written.
import type { SupabaseClient } from '@supabase/supabase-js'
import { valueOut, featureWords, type FeatureValueRow } from '@/lib/comparison-features'
import { featuresOrFile } from '@/lib/comparison-features-file'
import comparisonEn from '@/messages/ns/en-GB/comparison.json'
import { SCHEDULE_COLUMNS, type CheckerStore, type CheckSettings, type CompetitorForCheck } from './checker'
import { countriesOf, type PassState, type Prices, type QueueCountry } from './core'
import { DEFAULT_PASS, type PassSettings, type PassBatch } from './pass'
import type { StoredPlanForPrompt } from './prompts'

type Row = Record<string, unknown>
const COMPETITOR_COLS = ['id', 'name', 'website', 'focus', 'lifecycle', 'check_urls', 'check_interval_days', 'next_check_at', 'last_checked_at',
  'deep_checked_at', 'check_requested_at', 'notes'].join(', ')   // comparison-features-1: the fixed feature columns are retired
const VALUE_COLS = 'id, competitor_id, feature_key, country_code, value, note, quote, source_url, checked_on, verified_at, verified_by, superseded_at, created_at'
/** global-players-1 (20261046), read tolerantly: the select falls back to COMPETITOR_COLS before it runs. */
const GLOBAL_COLS = 'not_in_countries, deep_checked_in, pass_state'
const missingColumn = (e: { message: string; code?: string } | null) => !!e && (e.code === '42703' || /column .* does not exist/i.test(e.message))
const tableMissing = (e: { message: string; code?: string }) => e.code === '42P01' || e.code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(e.message)
const PLAN_COLS = 'id, competitor_id, plan_name, country_code, currency, price_hidden, monthly_minor, yearly_only, vat, setup_minor, truck_fee_bps, truck_fee_fixed_minor, customer_fee_bps, customer_fee_fixed_minor, card_mode, card_bps, card_fixed_minor, source_url'

/** competitor-check-3: the quick pass's settings, each falling back to its default before 20261049 runs. */
export function passSettingsOut(r: Row): PassSettings {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const b = r.pass_batch && typeof r.pass_batch === 'object' && !Array.isArray(r.pass_batch) ? r.pass_batch as PassBatch : null
  return {
    extractorModel: typeof r.pass_extractor_model === 'string' ? r.pass_extractor_model : DEFAULT_PASS.extractorModel,
    verifierModel: typeof r.pass_verifier_model === 'string' ? r.pass_verifier_model : DEFAULT_PASS.verifierModel,
    perDay: n(r.pass_per_day, DEFAULT_PASS.perDay), requestedAt: (r.pass_requested_at as string | null) ?? null,
    country: typeof r.pass_country === 'string' && /^[A-Z]{2}$/.test(r.pass_country) ? r.pass_country : null,
    maxFetches: n(r.pass_max_fetches, DEFAULT_PASS.maxFetches), maxSearches: n(r.pass_max_searches, DEFAULT_PASS.maxSearches),
    maxPageTokens: n(r.pass_max_page_tokens, DEFAULT_PASS.maxPageTokens), batch: b && typeof b.id === 'string' ? b : null,
  }
}
export function settingsOut(r: Row): CheckSettings {
  return {
    paused: r.paused === true, dailyCapUsd: Number(r.daily_cap_usd), monthlyCapUsd: Number(r.monthly_cap_usd), deepPerDay: Number(r.deep_per_day),
    checkIntervalDays: Number(r.check_interval_days), deepRequestedAt: (r.deep_requested_at as string | null) ?? null,
    extractorModel: String(r.extractor_model), verifierModel: String(r.verifier_model), prices: r.prices as Prices,
    // competitor-check-2 (20261045), read tolerantly: before it runs, no country deep check.
    deepCountry: typeof r.deep_country === 'string' && /^[A-Z]{2}$/.test(r.deep_country) ? r.deep_country : null,
    deepQueue: Array.isArray(r.deep_queue) ? (r.deep_queue as unknown[]).filter((c): c is string => typeof c === 'string' && /^[A-Z]{2}$/.test(c)) : [],
    // competitor-check-3 (20261049), read tolerantly: before it runs, the defaults and no pass started.
    pass: passSettingsOut(r),
  }
}
export function competitorForCheck(r: Row, plans: Row[], allCodes: readonly string[] = [], values: readonly FeatureValueRow[] = []): CompetitorForCheck {
  const own = plans.filter(p => p.competitor_id === r.id)
  const notIn = Array.isArray(r.not_in_countries) ? (r.not_in_countries as string[]) : []
  return {
    id: String(r.id), name: String(r.name), website: (r.website as string | null) ?? null, focus: (r.focus as string | null) ?? null,
    lifecycle: r.lifecycle as CompetitorForCheck['lifecycle'], checkUrls: Array.isArray(r.check_urls) ? (r.check_urls as string[]) : [],
    checkIntervalDays: Number(r.check_interval_days) || 90, nextCheckAt: (r.next_check_at as string | null) ?? null,
    lastCheckedAt: (r.last_checked_at as string | null) ?? null, deepCheckedAt: (r.deep_checked_at as string | null) ?? null,
    checkRequestedAt: (r.check_requested_at as string | null) ?? null,
    featureValues: values.filter(v => v.competitorId === String(r.id)),
    plans: own as unknown as StoredPlanForPrompt[],
    countries: countriesOf(String(r.lifecycle), own.map(p => String(p.country_code)), r.notes, { focus: (r.focus as string | null) ?? null, notIn, allCodes }),
    deepCheckedIn: r.deep_checked_in && typeof r.deep_checked_in === 'object' && !Array.isArray(r.deep_checked_in) ? r.deep_checked_in as Record<string, string> : {},
    passState: r.pass_state && typeof r.pass_state === 'object' && !Array.isArray(r.pass_state) ? r.pass_state as PassState : {},   // competitor-check-3
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
      const [c0, p, k] = await Promise.all([
        db.from('competitors').select(`${COMPETITOR_COLS}, ${GLOBAL_COLS}`).order('name'),
        db.from('competitor_plans').select(PLAN_COLS).is('superseded_at', null),
        db.from('country_settings').select('country_code').eq('enabled', true),
      ])
      // Before 20261049 there is no pass_state; before 20261046 neither not_in_countries nor deep_checked_in.
      const c1 = missingColumn(c0.error) ? await db.from('competitors').select(`${COMPETITOR_COLS}, not_in_countries, deep_checked_in`).order('name') : c0
      const c = missingColumn(c1.error) ? await db.from('competitors').select(COMPETITOR_COLS).order('name') : c1
      if (c.error) fail('read competitors', c.error)
      if (p.error) fail('read plans', p.error)
      if (k.error) fail('read countries', k.error)
      const plans = (p.data ?? []) as unknown as Row[]
      const allCodes = ((k.data ?? []) as Row[]).map(r => String(r.country_code))
      // comparison-features-1: every current answer (paged); none while 20261047 has not run.
      const values: FeatureValueRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from('competitor_feature_values').select(VALUE_COLS).is('superseded_at', null).order('id').range(from, from + 999)
        if (error) { if (tableMissing(error)) break; fail('read feature values', error) }
        values.push(...((data ?? []) as Row[]).map(valueOut))
        if ((data ?? []).length < 1000) break
      }
      return ((c.data ?? []) as unknown as Row[]).map(r => competitorForCheck(r, plans, allCodes, values))
    },
    async features() {
      // The CHECKED features with their English words: an Admin-added one's own, a seeded one's from the en-GB messages.
      const { data, error } = await db.from('comparison_features').select('key, group_key, sort_order, checked, show_scope, show_countries, hatchgrab_source, labels, explanations, updated_at')
      if (error && !tableMissing(error)) fail('read features', error)
      const msgs = (comparisonEn as unknown as { features?: Record<string, { label?: string; explain?: string }> }).features ?? {}
      // competitor-check-3: with where each shows, and whether its answer comes from the plans (the pass asks only about the
      // features shown on a country's page, and reads prices from the plans).
      return featuresOrFile(error ? null : (data as Row[])).features.filter(f => f.checked)
        .map(f => ({ key: f.key, ...featureWords(f, 'en-GB', k => (k.endsWith('.label') ? msgs[f.key]?.label : msgs[f.key]?.explain) ?? f.key),
          showScope: f.showScope, showCountries: f.showCountries, fromPlans: /(^|;)\s*price:(monthly|perorder|cardfee|setup)\b/.test(f.hatchgrabSource) }))
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
      let { error } = await db.from('competitors').update(cols).eq('id', id)
      // Before 20261046 runs there is no deep_checked_in: the rest of the schedule is still written.
      // Before 20261046 / 20261049 there is no deep_checked_in / pass_state: the rest of the schedule is still written.
      if (missingColumn(error) && ('deep_checked_in' in cols || 'pass_state' in cols)) {
        const { deep_checked_in: _x, pass_state: _y, ...rest } = cols; void _x; void _y
        ;({ error } = Object.keys(rest).length ? await db.from('competitors').update(rest).eq('id', id) : { error: null })
      }
      if (error) fail('write schedule', error)
    },
    async countries() {
      const { data, error } = await db.from('country_settings').select('country_code, enabled, comparison_status')
      if (error) fail('read countries', error)
      return ((data ?? []) as Row[]).map(r => ({ code: String(r.country_code), enabled: r.enabled === true, comparisonStatus: (r.comparison_status as string | null) ?? null })) as QueueCountry[]
    },
    async setPassBatch(batch) {
      const { error } = await db.from('competitor_check_settings').update({ pass_batch: batch }).eq('id', true)
      if (error) fail('record the quick pass batch', error)
    },
    async setDeepCountry(code) {
      if (code !== null && !/^[A-Z]{2}$/.test(code)) throw new Error(`[competitor-check] refused: "${code}" is not a country code`)
      const { error } = await db.from('competitor_check_settings').update({ deep_country: code }).eq('id', true)
      if (error) fail('move the deep check on', error)
    },
  }
}
