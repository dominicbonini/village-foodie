import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { canAccess } from '@/lib/features'
import { orderPageUrl } from '@/lib/custom-domain/copy'   // the one builder for the ordering address
import { hostKey } from '@/lib/custom-host'
import { Shell, TruckIdentity, PoweredBy, truckLogoUrl } from '@/components/embed/EmbedParts'
import EmbedSchedule from '@/app/embed/[slug]/EmbedSchedule'

/**
 * ── THE SCHEDULE PAGE, SERVED ON AN OPERATOR'S OWN DOMAIN ───────────────────────────────────────
 *
 * 🔴 THIS ROUTE IS NEVER NAVIGATED TO. `proxy.ts` rewrites `/` to it when the request arrives on a
 * host that is not ours, so the address bar reads `schedule.theirtruck.co.uk` throughout. It is
 * unreachable on hatchgrab.com and villagefoodie.co.uk because the proxy only rewrites here for a
 * custom host — and it is unreachable in production today regardless, because nothing writes
 * `custom_domain` yet.
 *
 * 🔴 THE HOST LOOKUP IS HERE AND NOT IN THE PROXY, DELIBERATELY. `proxy.ts` runs on the edge on every
 * request and has no database access anywhere in it — its own comment makes that point about the
 * demo-dashboard test. Putting the lookup here keeps that property intact and costs nothing: this
 * route only runs on requests the proxy has already decided are for a custom host.
 *
 * ── DEPLOY ORDERING ─────────────────────────────────────────────────────────────────────────────
 * 🔴 `supabase/migrations/20260827_trucks_custom_domain.sql` MUST BE APPLIED BEFORE THIS DEPLOYS.
 * The selects below name `custom_domain`; against a database without it PostgREST errors and every
 * custom host 404s. Additive and nullable, so applying it early is a no-op — the ordering only fails
 * in one direction.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HATCHGRAB_URL = process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'

type DomainTruck = {
  id: string
  name: string
  slug: string | null
  logo_storage_path: string | null
  plan: string
  feature_overrides: Record<string, boolean> | null
  trial_expires_at: string | null
  active: boolean
  custom_domain: string | null
  custom_domain_verified_at: string | null
}

/**
 * 🔴 BOTH CONDITIONS, AND `custom_domain_verified_at` IS THE ONE THAT BITES. A row can carry a
 * hostname the moment an operator types it; it carries a verification timestamp only once the domain
 * was confirmed to be serving. Matching on the hostname alone would serve a truck's schedule to
 * whatever host happened to be written on their row, including one they typed by mistake.
 * ⚠️ `active` is checked too, for the same reason `/embed` checks it: a deactivated truck should not
 * be publishing anywhere.
 */
async function truckForHost(rawHost: string | null): Promise<DomainTruck | null> {
  const key = hostKey(rawHost)
  if (!key) return null
  const { data, error } = await supabase
    .from('trucks')
    .select('id, name, slug, logo_storage_path, plan, feature_overrides, trial_expires_at, active, custom_domain, custom_domain_verified_at')
    .eq('custom_domain', key)
    .maybeSingle()
  if (error) {
    console.error('[domain] host lookup failed:', error.message)
    return null
  }
  const truck = data as DomainTruck | null
  if (!truck || !truck.active || !truck.custom_domain_verified_at) return null
  return truck
}

/**
 * ── THE TAB, THE LINK PREVIEW AND THE FAVICON ───────────────────────────────────────────────────
 *
 * 🔴 `title.absolute`, NOT `title`. The root layout sets a template — `` `%s | ${siteName}` `` with
 * `siteName` resolving to **"Village Foodie"** on any host that does not contain "hatchgrab"
 * (app/layout.tsx:26,35-38). A plain `title` here would render **"Real Thai Food | Village Foodie"**
 * in the tab of a page on the operator's own domain. `absolute` is the only form that escapes it.
 *
 * 🔴 `metadataBase` IS THEIR HOST, not ours. The root layout sets it to villagefoodie.co.uk, and
 * every relative metadata URL resolves against it — so without this the canonical and the preview
 * image on their page would point at Village Foodie.
 *
 * ⚠️ `openGraph.images` IS THEIR LOGO AND NOTHING ELSE. The root layout's default is
 * `/logos/village-foodie logo-sharing.png`; leaving it would preview their page with our consumer
 * brand's logo. Where the truck has no uploaded logo the array is EMPTY rather than falling back —
 * no image at all is better than the wrong company's.
 *
 * 🔴 NOINDEX STAYS. Un-indexing is slow and indexing a page nobody has yet seen rendered is the
 * mistake that persists; this is a one-line change once the page has been looked at.
 */
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const rawHost = h.get('host')
  const truck = await truckForHost(rawHost)

  if (!truck) {
    return { robots: { index: false, follow: false, nocache: true } }
  }

  const logo = truckLogoUrl(truck.logo_storage_path)
  const base = `https://${hostKey(rawHost)}`

  return {
    metadataBase: new URL(base),
    title: { absolute: truck.name },
    description: `Where ${truck.name} is trading next.`,
    icons: logo ? { icon: logo } : undefined,
    robots: { index: false, follow: false, nocache: true },
    openGraph: {
      title: truck.name,
      description: `Where ${truck.name} is trading next.`,
      url: base,
      siteName: truck.name,
      images: logo ? [{ url: logo, alt: truck.name }] : [],
      locale: 'en_GB',
      type: 'website',
    },
    twitter: {
      card: logo ? 'summary' : 'summary_large_image',
      title: truck.name,
      description: `Where ${truck.name} is trading next.`,
      images: logo ? [logo] : [],
    },
  }
}

export default async function CustomDomainPage() {
  const h = await headers()
  const rawHost = h.get('host')
  const truck = await truckForHost(rawHost)

  // 🔴 A REAL 404, NOT THE VILLAGE FOODIE MAP. The investigation's §6 finding was that an unknown host
  // fell through to `app/page.tsx` — our consumer discovery map, on the operator's domain. A host with
  // no matching, verified, active truck reaches this line and gets nothing at all.
  // ⚠️ NOT the name-and-link fallback either: that fallback exists for a truck we KNOW, whose embed
  // has lapsed. Here there is no truck to name.
  if (!truck) notFound()

  const planGrants = canAccess(
    truck.plan as never,
    'embed_schedule',
    truck.feature_overrides ?? {},
    truck.trial_expires_at
  )

  /**
   * ── THE LAPSED-PLAN FALLBACK: their name, one link onward, the brand line. ──────────────────────
   * It must look deliberate — this is what a customer on the operator's own domain sees the moment
   * their page stops serving its schedule.
   *
   * 🔴 IT POINTED AT A PAGE THAT SAYS "TRUCK NOT FOUND" (fixed 29 August 2026). It built
   * `/trucks/<createSlug(name)>`, and its own comment flagged half the problem — two slug spaces, one
   * URL shape. The other half is worse: `/trucks/<slug>` takes its truck IDENTITY from
   * `discovery_trucks` only (api/discovery/events/route.ts:336, "Trucks list (discovery only)"), and a
   * GRADUATED truck's scraped shadow carries `excluded = true` so that its duplicate stops appearing.
   * **Every truck that becomes a real customer therefore disappears from that page.** Observed for
   * Pizzeria Gusto: the page renders "Truck not found" while the same payload holds two of its events.
   * See docs/truck-profile-not-found-report.md.
   *
   * 🔴 SO IT POINTS AT THE ORDER PAGE, AND AT THE `trucks.slug` COLUMN. `/trucks/<slug>/order` reads
   * the operator's own `truck_events`, lists their real dates, and carries one Village Foodie logo
   * rather than a directory of competing trucks. It is the only page on hatchgrab.com that shows an
   * operator's schedule.
   * ⚠️ THE COLUMN, NOT THE NAME. The order page resolves `.eq('slug', …)` against `trucks.slug`
   * (api/events/route.ts:43); `/trucks/<slug>` resolved by `createSlug(name)`. Using the wrong one here
   * is the original bug, so `createSlug` is no longer imported by this file at all.
   * ⚠️ `orderPageUrl` IS THE SHARED BUILDER — the QR card and the turn-off panel already call it, and
   * the QR code encodes exactly this URL. Composing it inline here is how the three would drift.
   * ⚠️ NO SLUG, NO LINK. `trucks.slug` is nullable; a button to `/trucks//order` is worse than a page
   * that simply names the truck.
   * ⚠️ THE LABEL IS THE DESTINATION'S OWN HEADING, WORD FOR WORD (29 August 2026). The order page renders
   * `Order from {truckName}` (app/trucks/[slug]/order/page.tsx:2461), so the button and the page a
   * customer lands on say the same thing. It replaced "See <name>'s dates and order", which produced a
   * double possessive on any name already ending in s — "See Bob's Burgers & Co's dates and order".
   */
  if (!planGrants) {
    return (
      <Shell>
        <TruckIdentity name={truck.name} logoPath={truck.logo_storage_path} />
        {truck.slug && (
          <a
            href={orderPageUrl(truck.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Order from {truck.name}
          </a>
        )}
        <PoweredBy />
      </Shell>
    )
  }

  return (
    <Shell>
      <TruckIdentity name={truck.name} logoPath={truck.logo_storage_path} />
      {/* 🔴 `orderOrigin` IS THE WHOLE POINT ON THIS ROUTE. The CTA's href is relative, so without it
          the Order button would resolve to the operator's OWN domain — putting our ordering flow, and
          the payment provider's frame inside it, on an address we do not control. */}
      <EmbedSchedule slug={truck.slug ?? ''} truckName={truck.name} orderOrigin={HATCHGRAB_URL} />
      <PoweredBy />
    </Shell>
  )
}
