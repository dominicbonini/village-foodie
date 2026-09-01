// lib/custom-domain/redirect-target.ts
//
// ── 🔴 THE FIVE CONDITIONS. MOVED HERE 29 August 2026, NOT REWRITTEN. ───────────────────────────────
//
// This function is `customDomainFor` lifted VERBATIM out of app/trucks/[slug]/order/layout.tsx — same
// query, same column list, same five guards in the same order, same catch. Only its home changed.
// Nothing about the decision was re-derived, because it was already proven and a second opinion about
// what "healthy" means is exactly what a printed code cannot afford.
//
// 🔴 WHY IT MOVED. The layout used to both DECIDE the destination and WRAP the ordering page, so every
// arrival at `/trucks/<slug>/order` was redirected — including the customer coming BACK from the
// operator's domain to buy. That closed a cycle with no error state (docs/qr-redirect-trace-report.md).
// The decision now belongs to `/o/<slug>`, which only ever decides; the ordering page only ever serves.
import { createClient } from '@supabase/supabase-js'
import { canAccess } from '@/lib/features'
import { STOPPED_AFTER_MS } from '@/lib/custom-domain/cadence'

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * ── THE FIVE CONDITIONS, ALL OF WHICH MUST HOLD ────────────────────────────────────────────────────
 * Every one of them is a reason a redirect would send a paying customer somewhere broken, so each is
 * ANDed rather than weighed:
 *
 *   1. a domain is set                  — nothing to redirect to otherwise;
 *   2. `custom_domain_verified_at`      — a MACHINE has seen it resolve to us at least once;
 *   3. `custom_domain_confirmed_at`     — a PERSON has opened it and said the page is right. 🔴 These
 *      two are different claims and the second is the one that matters here: a domain can resolve
 *      correctly and still show the wrong truck's schedule, and only a human catches that;
 *   4. the plan still grants the feature — a lapsed plan makes their page a name-and-link fallback, so
 *      redirecting to it would send customers somewhere they cannot order from;
 *   5. the last daily check was healthy — `custom_domain_last_ok_at` within the SAME derived threshold
 *      the admin table calls "stopped working" (lib/custom-domain/cadence.ts). 🔴 REUSED, NOT RESTATED:
 *      if the schedule changes, this moves with it, and a printed code cannot afford a second opinion
 *      about what "healthy" means.
 *
 * ⚠️ FAILS TOWARDS OUR OWN PAGE, ALWAYS. Any error, any missing row, any unreadable column serves the
 * page we control. The failure mode of a wrong answer here is a customer who cannot order.
 */
export async function customDomainFor(slug: string): Promise<string | null> {
  try {
    const { data: truck } = await supabase
      .from('trucks')
      .select('active, plan, feature_overrides, trial_expires_at, custom_domain, custom_domain_verified_at, custom_domain_confirmed_at, custom_domain_last_ok_at')
      .eq('slug', slug)
      .maybeSingle()

    if (!truck || !truck.active) return null
    if (!truck.custom_domain) return null
    if (!truck.custom_domain_verified_at) return null
    if (!truck.custom_domain_confirmed_at) return null
    if (!canAccess(truck.plan, 'embed_schedule', truck.feature_overrides ?? {}, truck.trial_expires_at)) return null

    const lastOk = truck.custom_domain_last_ok_at ? new Date(truck.custom_domain_last_ok_at as string).getTime() : null
    if (!lastOk || Date.now() - lastOk > STOPPED_AFTER_MS) return null

    return truck.custom_domain as string
  } catch (e) {
    // ⚠️ A read failure must never cost an order. Serve our own page.
    console.error('[custom-domain/redirect-target] resolve failed, serving our page:', e)
    return null
  }
}
