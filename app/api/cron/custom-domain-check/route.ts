// app/api/cron/custom-domain-check/route.ts
//
// ── THE DAILY CHECK, AND THE ORPHAN SWEEP ───────────────────────────────────────────────────────
//
// PATTERN FOLLOWED, NOT INVENTED: a Next route under `app/api/cron/`, registered in `vercel.json`'s
// `crons`, authorised by `Bearer $CRON_SECRET` with an admin fallback for a by-hand run. That is what
// the five existing jobs do (demo-cleanup, account-deletion-due, cancel-stale-authorizations,
// capture-stranded-authorizations, auto-reject-offline-orders) and this is the sixth.
//
// 🔴 NO EMAIL TO THE TEAM. The existing jobs email on failure because their failure is invisible; this
// one writes state that the admin table reads, and that table IS the read path. An email per run would
// be a second channel for a fact already on screen.
// ⚠️ IT DOES EMAIL THE OPERATOR, ONCE, WHEN THEIR DOMAIN FIRST GOES LIVE — setup ends with them closing
// the tab, so a dashboard-only notice reaches nobody. That transition is detectable exactly once
// (`custom_domain_verified_at` was null and is about to be set), which is what makes it not a nag.
//
// ⚠️ NOTHING HERE CAN REPORT THAT IT NEVER RAN. `custom_domain_last_checked_at` going stale is the
// signal, and only a human reading the admin table sees it. Same residual gap demo-cleanup records.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { resolveCname } from '@/lib/custom-domain/dns'
import { getDomainConfig, releaseDomain } from '@/lib/custom-domain/vercel'
import { sendConfirmationEmail } from '@/lib/email'
import { liveEmail } from '@/lib/custom-domain/copy'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

/**
 * ── THE ORPHAN WINDOW — 14 DAYS ─────────────────────────────────────────────────────────────────
 *
 * 🔴 THIS IS NOT HOUSEKEEPING. A domain registered against the project and never pointed at us
 * **blocks that same domain from being added later** — the hosting API returns 409 *"The domain is
 * already assigned to another Vercel project"*. So the operator's own web person, doing it properly
 * six weeks later, is refused by our abandoned attempt. We would be blocking our own operator with
 * something they cannot see and we forgot about.
 *
 * ⚠️ 14 DAYS, AND THE NUMBER IS SET BY THE SLOWEST LEGITIMATE PATH, NOT THE FASTEST. The operator who
 * needs this is the one who does not hold their own domain login: they email whoever built the site,
 * that person replies next week, and the record goes in the week after. Two days would delete a
 * live-but-slow setup out from under them. Two months would leave the block in place long enough to
 * be the very problem it exists to prevent.
 */
const ORPHAN_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // `?dry=1` reports without writing. Mirrors auto-reject-offline-orders; cron never sends it.
  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const now = new Date()

  const { data: trucks, error } = await supabase
    .from('trucks')
    .select('id, name, slug, contact_email, custom_domain, custom_domain_verified_at, custom_domain_setup_state, custom_domain_setup_started_at, custom_domain_last_ok_at')
    .not('custom_domain', 'is', null)

  if (error) {
    console.error('[custom-domain-check] truck read failed:', error.message)
    return NextResponse.json({ error: 'read failed' }, { status: 500 })
  }

  const checked: Array<Record<string, unknown>> = []
  const released: string[] = []
  const releaseFailed: Array<{ host: string; reason: string }> = []

  for (const t of trucks ?? []) {
    const host = t.custom_domain as string

    // ── THE ORPHAN SWEEP ────────────────────────────────────────────────────────────────────────
    // 🔴 IT MUST NEVER RELEASE A DOMAIN THAT IS VERIFIED OR SERVING, and the guard is the FIRST thing
    // tested rather than an `else` at the bottom — a released live domain takes an operator's page
    // down, which is strictly worse than leaving an orphan in place for another day.
    const started = t.custom_domain_setup_started_at ? new Date(t.custom_domain_setup_started_at as string) : null
    const isOrphan =
      !t.custom_domain_verified_at &&                                   // never went live
      !t.custom_domain_last_ok_at &&                                    // and was never once seen working
      !!started &&
      now.getTime() - started.getTime() > ORPHAN_DAYS * DAY_MS
    if (isOrphan) {
      // ── 🔴 RELEASE FIRST. CLEAR ONLY ON SUCCESS. ──────────────────────────────────────────────
      // THE PREVIOUS ORDER CLEARED THE COLUMN WHETHER OR NOT THE HOSTING SIDE COOPERATED, AND THAT
      // WAS WORSE THAN THE ORPHAN IT REPLACED. A failed release left the domain attached there with
      // NOTHING on our side pointing at it — so the operator's web person, adding it properly weeks
      // later, hits *"already assigned to another project"* and we have no row that explains why.
      // The `registered` state at least left a trace; clearing after a failed release left none.
      //
      // 🔴 THE ORDERING IS CHOSEN FOR WHICH FAILURE IS RECOVERABLE, not for which is tidier:
      //   release → clear, release FAILS  → the row survives, the next sweep retries. RECOVERABLE.
      //   release → clear, the CLEAR fails → the domain is detached but our row still names it; the
      //                                      next sweep re-releases, gets 404, and converges. RECOVERABLE.
      //   clear → release, release FAILS  → attached at the hosting side with NO row anywhere.
      //                                      Nothing to retry from. UNRECOVERABLE — this is the old order.
      if (!dry) {
        const release = await releaseDomain(host)
        if (release.ok) {
          await supabase.from('trucks').update({
            custom_domain: null,
            custom_domain_setup_state: null,
            custom_domain_setup_started_at: null,
            custom_domain_last_checked_at: now.toISOString(),
            custom_domain_last_seen_value: `released after ${ORPHAN_DAYS} days without going live`,
          }).eq('id', t.id)
          released.push(host)
        } else {
          // 🔴 THE ROW SURVIVES, DELIBERATELY, AND IT IS THE RETRY QUEUE. `custom_domain` is left set,
          // so the next run re-enters this same branch and tries again — no separate queue, no flag.
          // ⚠️ RECORDED WHERE THE ADMIN TABLE ACTUALLY SHOWS IT. The table filters on a non-null
          // `custom_domain` and renders `custom_domain_last_seen_value` under any non-live row, so this
          // sentence appears beneath the row. It is phrased to read correctly after that cell's
          // "Resolving to: " prefix, which is why it starts with `nothing`.
          await supabase.from('trucks').update({
            custom_domain_last_checked_at: now.toISOString(),
            custom_domain_last_seen_value:
              `nothing — release failed (${release.reason}), still attached at the hosting side, will retry`,
          }).eq('id', t.id)
          releaseFailed.push({ host, reason: release.reason })
          console.warn(`[custom-domain-check] release failed for ${host}: ${release.reason} — row kept for the next sweep`)
        }
      } else {
        released.push(host)
      }
      continue
    }

    // ── THE CHECK ───────────────────────────────────────────────────────────────────────────────
    // One lookup per truck, recording WHAT IS ACTUALLY THERE.
    const [seen, cfg] = await Promise.all([resolveCname(host), getDomainConfig(host)])
    const expected = cfg.ok ? cfg.recommendedCNAME : null

    // ⚠️ A RESOLVER FAILURE IS NOT AN OUTAGE. `reachable: false` means we could not ask, so the row is
    // left exactly as it was apart from the checked-at stamp. Writing "not resolving" here would
    // manufacture an outage out of our own network trouble.
    if (!seen.reachable) {
      if (!dry) await supabase.from('trucks').update({ custom_domain_last_checked_at: now.toISOString() }).eq('id', t.id)
      checked.push({ host, state: 'unknown', seen: null })
      continue
    }

    const ok = !!seen.value && !!expected && seen.value === expected.toLowerCase().replace(/\.$/, '')
    const patch: Record<string, unknown> = {
      custom_domain_last_checked_at: now.toISOString(),
      custom_domain_last_seen_value: seen.value,
    }
    if (ok) patch.custom_domain_last_ok_at = now.toISOString()

    // 🔴 THE ONE-TIME TRANSITION. `verified_at` is set the FIRST time it resolves correctly, and only
    // then — which is what makes the email below fire once rather than every day.
    const goingLive = ok && !t.custom_domain_verified_at
    if (goingLive) patch.custom_domain_verified_at = now.toISOString()

    if (!dry) {
      await supabase.from('trucks').update(patch).eq('id', t.id)
      if (goingLive && t.contact_email) {
        try {
          const mail = liveEmail({ truckName: t.name as string, address: host })
          await sendConfirmationEmail({ to: t.contact_email as string, subject: mail.subject, html: mail.html, text: mail.text, senderName: 'HatchGrab' })
        } catch (e) {
          // A failed email must not roll back a domain that is genuinely live.
          console.warn('[custom-domain-check] live email failed:', e instanceof Error ? e.message : String(e))
        }
      }
    }
    checked.push({ host, state: ok ? (goingLive ? 'went_live' : 'ok') : 'not_resolving', seen: seen.value, expected })
  }

  return NextResponse.json({
    dry, checked: checked.length, released: released.length, releaseFailed: releaseFailed.length,
    rows: checked, releasedHosts: released, releaseFailures: releaseFailed,
  })
}

