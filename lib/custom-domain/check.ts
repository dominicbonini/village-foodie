// lib/custom-domain/check.ts
//
// ── ONE DOMAIN CHECK. TWO CALLERS. ──────────────────────────────────────────────────────────────
//
// 🔴 EXTRACTED FROM THE CRON ON 5 SEPTEMBER 2026, NOT REWRITTEN. Every line below was inline in
// `app/api/cron/custom-domain-check/route.ts`. The on-demand check an operator triggers by opening the
// setup box MUST be the same check, not a second implementation of it: two implementations of "is this
// domain working" would disagree eventually, and the disagreement would present as a page that the
// dashboard says is live and the cron says is not.
//
// ── 🔴 WHY AN ON-DEMAND CHECK EXISTS AT ALL ─────────────────────────────────────────────────────
// `custom_domain_verified_at` was writable ONLY by the 07:00 UTC cron. The first operator through this
// feature had DNS resolving and a certificate issued and **a dead page for eleven hours**, because the
// row was one timestamp short and nothing but a daily job could write it. Every future operator would
// have hit the same wall on the same day of their setup.
//
// ⚠️ THE CHECK IS TRIGGERED BY OPENING THE SETUP BOX, NOT BY FINISHING THE WIZARD. An operator who has
// just added a record will refresh; a single check fired at completion nearly always fails on
// propagation and looks broken. Opening the box is the gesture that means "has it worked yet".
import { resolveCname } from './dns'
import { getDomainConfig } from './vercel'
import { CHECK_INTERVAL_MS, STOPPED_AFTER_MS } from './cadence'

/** The row columns this check reads. Named so both callers select the same set. */
export type DomainCheckInput = {
  host: string
  verifiedAt: string | null
  lastOkAt: string | null
  lastCheckedAt: string | null
  setupStartedAt: string | null
}

export type DomainCheckResult = {
  /** `unknown` = we could not ask. NOT an outage — see below. */
  state: 'ok' | 'not_resolving' | 'unknown'
  seen: string | null
  expected: string | null
  /** 🔴 THE COLUMNS TO WRITE. Additive only — see `patch` below. */
  patch: Record<string, unknown>
  /** True exactly once, on the first successful check. Drives the operator's "it's live" email. */
  goingLive: boolean
  /** Whether the admin should be told, and why. See `decideAdminAlert`. */
  alert: AdminAlert | null
}

/**
 * ── 🔴 THE PATCH IS ADDITIVE. IT CAN NEVER CLEAR, DOWNGRADE OR CHURN A WORKING ROW. ─────────────
 * This is the property that makes an on-demand check safe to run against a LIVE truck's row while
 * that truck is trading:
 *   • `custom_domain_verified_at` is written ONLY on the going-live transition and is NEVER cleared.
 *   • `custom_domain_last_ok_at` is written ONLY when the check passes.
 *   • `custom_domain`, `custom_domain_setup_state` and `custom_domain_confirmed_at` are NEVER touched.
 * So a failed check on a live domain records what it saw and nothing else — the page keeps serving,
 * because `app/domain/page.tsx` reads `custom_domain_verified_at`, which this cannot unset.
 * 🔴 DO NOT ADD A "CLEAR verified_at WHEN IT STOPS RESOLVING" BRANCH. A resolver hiccup would take a
 * trading truck's page down, and the admin alert below exists precisely so that is not needed.
 */
export async function runDomainCheck(input: DomainCheckInput, now: Date = new Date()): Promise<DomainCheckResult> {
  const { host } = input

  // One lookup per truck, recording WHAT IS ACTUALLY THERE.
  const [seen, cfg] = await Promise.all([resolveCname(host), getDomainConfig(host)])
  const expected = cfg.ok ? cfg.recommendedCNAME : null

  // ⚠️ A RESOLVER FAILURE IS NOT AN OUTAGE. `reachable: false` means we could not ask, so the row is
  // left exactly as it was apart from the checked-at stamp. Writing "not resolving" here would
  // manufacture an outage out of our own network trouble — and, now that an alert hangs off this,
  // would email the admin about our own connectivity.
  if (!seen.reachable) {
    return {
      state: 'unknown', seen: null, expected,
      patch: { custom_domain_last_checked_at: now.toISOString() },
      goingLive: false,
      alert: null,
    }
  }

  const ok = !!seen.value && !!expected && seen.value === expected.toLowerCase().replace(/\.$/, '')
  const patch: Record<string, unknown> = {
    custom_domain_last_checked_at: now.toISOString(),
    custom_domain_last_seen_value: seen.value,
  }
  if (ok) patch.custom_domain_last_ok_at = now.toISOString()

  // 🔴 THE ONE-TIME TRANSITION. `verified_at` is set the FIRST time it resolves correctly, and only
  // then — which is what makes the operator's "it's live" email fire once rather than every day.
  const goingLive = ok && !input.verifiedAt
  if (goingLive) patch.custom_domain_verified_at = now.toISOString()

  return {
    state: ok ? 'ok' : 'not_resolving',
    seen: seen.value,
    expected,
    patch,
    goingLive,
    alert: ok ? null : decideAdminAlert(input, now),
  }
}

// ── THE ADMIN ALERT ─────────────────────────────────────────────────────────────────────────────

export type AdminAlert = {
  kind: 'setup_stalled' | 'stopped_working'
  /** Why this run crossed the line, for the email body and the log. */
  reason: string
}

/**
 * ── 🔴 THE GRACE WINDOW, IN CHECKS RATHER THAN HOURS. ───────────────────────────────────────────
 * `lib/custom-domain/cadence.ts` already establishes the rule this follows: a threshold written as an
 * hours literal encodes an ANSWER whose QUESTION lives in `vercel.json`'s cron schedule, and the two
 * drift silently. So this is expressed in CHECKS and multiplied by the derived interval.
 *
 * ONE CHECK. The reasoning, so it can be argued with:
 *   • It is the same number the operator is told — "occasionally up to 24 hours" — **by derivation and
 *     not by coincidence**: at the current daily cadence both are one interval. Change the schedule and
 *     both move together.
 *   • Alerting sooner means alerting while DNS is simply propagating, which is the ordinary case and
 *     would make this an ignored folder within a week.
 *   • Alerting later means an operator sits with a dead page for a second day before anyone knows.
 * ⚠️ NO MARGIN IS ADDED, unlike `STOPPED_AFTER_MS`. That threshold guards against a job running late
 * flipping a HEALTHY domain to "problem"; this one measures wall-clock since the operator started and
 * has no such failure mode.
 */
export const SETUP_GRACE_IN_CHECKS = 1
export const SETUP_GRACE_MS = SETUP_GRACE_IN_CHECKS * CHECK_INTERVAL_MS

/**
 * ── 🔴 ONE EMAIL PER TRANSITION, AND THE MECHANISM NEEDS NO NEW COLUMN. ─────────────────────────
 *
 * "One email" is the whole point: an email per failed check is a folder nobody opens, and then the one
 * that mattered is in it. The transition is detected by comparing the line against **now** and against
 * **the previous check's own timestamp**, both of which the row already carries:
 *
 *     crossedNow    = now                - anchor > window
 *     crossedBefore = custom_domain_last_checked_at - anchor > window
 *     send  ⟺  crossedNow AND NOT crossedBefore
 *
 * 🔴 THAT IS EXACTLY ONCE. The run that steps over the line sends; every run after it sees
 * `crossedBefore` true and stays quiet.
 *
 * 🔴 AND IT RESETS BY ITSELF, WITH NOTHING TO CLEAR:
 *   • `stopped_working` is anchored on `custom_domain_last_ok_at`. A domain that recovers gets a fresh
 *     `last_ok_at` from this very check, which moves the anchor forward and makes `crossedBefore` false
 *     again — so a second outage weeks later sends a second email.
 *   • `setup_stalled` is anchored on `custom_domain_setup_started_at`, which the provisioning route
 *     re-stamps only when a setup begins. Going live ends it permanently, because a passing check
 *     returns `alert: null` before this function is ever called.
 * ⚠️ A NEW COLUMN WOULD HAVE BEEN THE OBVIOUS ANSWER AND IT IS NOT NEEDED. `last_checked_at` already
 * records "when we last looked", which is precisely the state a once-per-transition rule requires.
 *
 * ⚠️ THE ON-DEMAND CALLER MUST EVALUATE THIS TOO, AND THAT IS NOT OPTIONAL. It writes
 * `last_checked_at`, so if only the cron sent, an operator opening the box could move `crossedBefore`
 * past the line and the cron would then never see the transition at all — the alert would be silently
 * swallowed by the thing that was supposed to help.
 */
export function decideAdminAlert(input: DomainCheckInput, now: Date): AdminAlert | null {
  const t = (v: string | null) => (v ? new Date(v).getTime() : null)
  const nowMs = now.getTime()
  const lastChecked = t(input.lastCheckedAt)

  // ── WAS WORKING, NOW FAILING ──────────────────────────────────────────────────────────────────
  // Tested FIRST: a truck that has ever been live is a trading truck with a page that has gone dark,
  // which outranks a setup that never finished.
  const lastOk = t(input.lastOkAt)
  if (lastOk !== null) {
    const crossedNow = nowMs - lastOk > STOPPED_AFTER_MS
    // ⚠️ NO PREVIOUS CHECK ⇒ NOT CROSSED BEFORE. A row that has never been checked cannot have
    // already alerted, so the first check that finds it over the line is the transition.
    const crossedBefore = lastChecked !== null && lastChecked - lastOk > STOPPED_AFTER_MS
    if (crossedNow && !crossedBefore) {
      return { kind: 'stopped_working', reason: `no successful check since ${input.lastOkAt}` }
    }
    return null
  }

  // ── NEVER WORKED: THE SETUP GRACE WINDOW ──────────────────────────────────────────────────────
  const started = t(input.setupStartedAt)
  if (started === null) return null   // nothing to measure from
  const crossedNow = nowMs - started > SETUP_GRACE_MS
  const crossedBefore = lastChecked !== null && lastChecked - started > SETUP_GRACE_MS
  if (crossedNow && !crossedBefore) {
    return { kind: 'setup_stalled', reason: `setup started ${input.setupStartedAt} and has never resolved` }
  }
  return null
}
