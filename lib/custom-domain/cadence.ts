// lib/custom-domain/cadence.ts
//
// ── THE "STOPPED WORKING" THRESHOLD, DERIVED FROM THE CHECK SCHEDULE ITSELF ──────────────────────
//
// 🔴 WHY THIS FILE EXISTS. The admin table's threshold was the literal `36 * 3600e3`, written twice.
// A literal encodes an ANSWER whose QUESTION lives somewhere else entirely — in this case in
// `vercel.json`'s cron schedule. Change the schedule to twice a day and the label keeps claiming a
// domain is fine for 36 hours, which is now three missed checks instead of one. Nothing breaks, no
// test fails, and the table quietly lies. The two could drift because they were never connected.
//
// 🔴 HOW THEY ARE CONNECTED: this module READS `vercel.json` — the same file Vercel reads — finds the
// entry for this job BY PATH, and derives the interval from its cron expression. There is exactly one
// definition of the cadence in the repository and it is the one the platform obeys. Editing the
// schedule moves the threshold in the same commit, with no second place to remember.
//
// ⚠️ WHY NOT A SHARED CONSTANT. A `CHECK_INTERVAL_HOURS = 24` next to the cron entry would be a
// RESTATEMENT of the schedule, not the schedule — two things that must agree, which is the drift this
// removes rather than a fix for it.
//
// ⚠️ THIS IS IMPORTED BY A CLIENT COMPONENT (`app/admin/page.tsx` is 'use client'), so `vercel.json`
// enters the client bundle. It is 1.3 KB of function config, headers and cron paths, and holds no
// secret of any kind — every value in it is already discoverable from the deployed site's behaviour.
import vercelConfig from '@/vercel.json'

/** The job whose cadence governs the threshold. Matched against `vercel.json`'s `crons[].path`. */
export const CHECK_CRON_PATH = '/api/cron/custom-domain-check'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Cron expression to a run interval. Covers the shapes this repository actually uses — `*_/N * * * *`,
 * `M * * * *`, `M H * * *` — and returns null for anything else rather than guessing, because a
 * confident wrong interval is worse than an admitted unknown.
 */
export function intervalMsFromCron(expr: string): number | null {
  const f = expr.trim().split(/\s+/)
  if (f.length !== 5) return null
  const [min, hour, dom, mon, dow] = f
  // Only a schedule that repeats every day can be reduced to a single interval here.
  if (dom !== '*' || mon !== '*' || dow !== '*') return null

  const everyMin = /^\*\/(\d+)$/.exec(min)
  if (everyMin && hour === '*') return Number(everyMin[1]) * MINUTE   // */10 * * * *  → 10 minutes
  if (min === '*' && hour === '*') return MINUTE                      // *    * * * *  → every minute

  const everyHour = /^\*\/(\d+)$/.exec(hour)
  if (everyHour && /^\d+$/.test(min)) return Number(everyHour[1]) * HOUR  // 0 */6 * * * → 6 hours
  if (hour === '*' && /^\d+$/.test(min)) return HOUR                     // 0 *   * * * → hourly
  if (/^\d+$/.test(hour) && /^\d+$/.test(min)) return DAY                // 0 7   * * * → daily
  return null
}

/** The schedule string as `vercel.json` states it, or null if this job has no cron entry. */
export const CHECK_CRON_EXPRESSION: string | null =
  (vercelConfig as { crons?: Array<{ path: string; schedule: string }> }).crons
    ?.find(c => c.path === CHECK_CRON_PATH)?.schedule ?? null

const derived = CHECK_CRON_EXPRESSION ? intervalMsFromCron(CHECK_CRON_EXPRESSION) : null

/**
 * ⚠️ THE FALLBACK IS LOUD, NOT SILENT. If the cron entry is missing or its expression is a shape the
 * parser does not cover, we assume daily AND set `CADENCE_DERIVED` false, which the admin table
 * renders as a visible note. A silent fallback would reintroduce exactly the drift this file removes,
 * with the added insult of looking derived.
 */
export const CADENCE_DERIVED: boolean = derived !== null
export const CHECK_INTERVAL_MS: number = derived ?? DAY

/**
 * ── THE RULE, IN CHECKS RATHER THAN IN HOURS ────────────────────────────────────────────────────
 * A domain is called "stopped working" once it has missed this many consecutive checks, plus a margin
 * of half a cadence so a job that runs slightly late never flips a healthy domain to a problem.
 *
 * 🔴 THESE TWO NUMBERS ARE THE ONLY THING TO TUNE, AND THEY ARE IN CHECKS, NOT HOURS — which is the
 * whole point. They mean the same thing at any schedule.
 */
export const MISSED_CHECKS_BEFORE_STOPPED = 2
export const MARGIN_IN_CHECKS = 0.5

/** `now - custom_domain_last_ok_at` beyond this reads as "stopped working". */
export const STOPPED_AFTER_MS =
  (MISSED_CHECKS_BEFORE_STOPPED + MARGIN_IN_CHECKS) * CHECK_INTERVAL_MS

/** For prose in the admin table. Whole hours where it divides, otherwise one decimal. */
export const STOPPED_AFTER_LABEL: string = (() => {
  const h = STOPPED_AFTER_MS / HOUR
  return h >= 1
    ? `${Number.isInteger(h) ? h : h.toFixed(1)}h`
    : `${Math.round(STOPPED_AFTER_MS / MINUTE)}m`
})()
