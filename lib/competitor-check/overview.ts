// lib/competitor-check/overview.ts — the Automatic checks tab's tiles, from the rows (competitor-check-1). PURE.
import { addDays, deepRemaining, routineQuota, deepQueueOf, defaultDeepQueue, deepCountryProgress, queueFrom, type SchedRow, type QueueCountry } from './core'

type Row = Record<string, unknown>
export interface Overview {
  deep: { requested: boolean; total: number; done: number; remaining: number; perDay: number; finishOn: string | null
    /** competitor-check-2: the country the deep check is on (null: none running), its progress, and the countries after it. */
    country: string | null; countryTotal: number; countryDone: number; then: string[] }
  /** competitor-check-2: the deep queue — as stored (empty: the default), the default, and the one in force. */
  queue: { stored: string[]; default: string[]; inForce: string[] }
  spend: { monthUsd: number; todayUsd: number; monthlyCapUsd: number; dailyCapUsd: number }
  routine: { active: number; intervalDays: number; perDay: number; nextDue: { name: string; on: string }[] }
  couldNotCheck: { blocked: number; pageGone: number }
  toReview: number
  confirmedUnchanged: number
  paused: boolean
}
export const schedOf = (r: Row): SchedRow => ({
  id: String(r.id), name: String(r.name), lifecycle: (r.lifecycle as SchedRow['lifecycle']) ?? 'active', checkIntervalDays: Number(r.check_interval_days) || 90,
  nextCheckAt: (r.next_check_at as string | null) ?? null, lastCheckedAt: (r.last_checked_at as string | null) ?? null,
  deepCheckedAt: (r.deep_checked_at as string | null) ?? null, checkRequestedAt: (r.check_requested_at as string | null) ?? null,
  countries: Array.isArray(r.countries) ? (r.countries as string[]) : [],
})
export function overviewOf(a: { settings: Row; competitors: Row[]; runs: Row[]; findings: Row[]; today: string; countries?: QueueCountry[] }): Overview {
  const s = a.settings
  const withUrl = a.competitors.filter(c => (Array.isArray(c.check_urls) && c.check_urls.length > 0) || !!c.website).map(schedOf)
  const requestedAt = (s.deep_requested_at as string | null) ?? null
  const pool = withUrl.filter(c => c.lifecycle === 'active' || c.lifecycle === 'candidate')
  const remaining = deepRemaining(pool, requestedAt)
  const perDay = Number(s.deep_per_day) || 0
  const month = a.today.slice(0, 7)
  const runCost = (r: Row) => Number(r.cost_usd || 0)
  const active = withUrl.filter(c => c.lifecycle === 'active')
  const interval = Number(s.check_interval_days) || 90
  const pending = a.findings.filter(f => f.review_status === 'pending')
  const stored = Array.isArray(s.deep_queue) ? (s.deep_queue as string[]) : []
  const inForce = deepQueueOf(stored, a.countries ?? [], withUrl)
  const country = typeof s.deep_country === 'string' ? s.deep_country : null
  const cp = country ? deepCountryProgress(withUrl, country, requestedAt) : null
  // While a country is running, "done by" counts what is left from it to the end of the queue.
  const left = country ? queueFrom(inForce, country).reduce((n, code, i, all) => n + deepCountryProgress(withUrl, code, requestedAt).pending.filter(r => !all.slice(0, i).some(c => r.countries?.includes(c))).length, 0) : remaining
  return {
    deep: { requested: !!requestedAt, total: pool.length, done: pool.length - remaining, remaining, perDay,
      finishOn: requestedAt && (country ? left : 0) && perDay ? addDays(a.today, Math.ceil(left / perDay)) : null,
      country, countryTotal: cp?.total ?? 0, countryDone: cp?.done ?? 0, then: country ? queueFrom(inForce, country).slice(1) : [] },
    queue: { stored, default: defaultDeepQueue(a.countries ?? [], withUrl), inForce },
    spend: { monthUsd: a.runs.filter(r => String(r.started_at).slice(0, 7) === month).reduce((t, r) => t + runCost(r), 0),
      todayUsd: a.runs.filter(r => String(r.started_at).slice(0, 10) === a.today).reduce((t, r) => t + runCost(r), 0),
      monthlyCapUsd: Number(s.monthly_cap_usd), dailyCapUsd: Number(s.daily_cap_usd) },
    routine: { active: active.length, intervalDays: interval, perDay: Math.ceil(active.length / interval) || 0,
      nextDue: active.filter(c => c.nextCheckAt).sort((x, y) => String(x.nextCheckAt).localeCompare(String(y.nextCheckAt))).slice(0, 4).map(c => ({ name: c.name, on: String(c.nextCheckAt) })) },
    couldNotCheck: { blocked: pending.filter(f => f.outcome === 'blocked').length, pageGone: pending.filter(f => f.outcome === 'page_gone').length },
    toReview: pending.length,
    confirmedUnchanged: pending.filter(f => f.outcome === 'unchanged' && f.quote_in_page === true && f.second_check === 'confirmed').length,
    paused: s.paused === true,
  }
}
export { routineQuota }
