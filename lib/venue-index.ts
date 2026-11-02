// lib/venue-index.ts — is a Village Foodie venue page worth indexing? (faq-2-seo-geo-2 B1, 2 November 2026). SERVER ONLY.
//
// A venue page with no upcoming public events is an empty shell to a search engine ("Crawled – currently not indexed"), so it says
// `noindex, follow` until it has one; with events it stays indexable. Decided on the server, from the SAME feed the page's own
// schedule reads in the browser — app/api/discovery/events (public, upcoming or running, private events never included), as
// Village Foodie's host sees it — and the SAME key the page filters by (lib/utils.ts venueGroupKey). So the robots tag and the
// visible schedule can never disagree. No route is deleted; nothing is hidden from visitors.
// A failed read answers null: the page keeps today's behaviour (indexable) rather than drop out of the index on a blip.
import 'server-only'
import { NextRequest } from 'next/server'
import { venueGroupKey } from '@/lib/utils'
import { VF_ORIGIN } from '@/lib/host-redirects'

export async function venueHasUpcomingEvents(slug: string): Promise<boolean | null> {
  try {
    const { GET } = await import('@/app/api/discovery/events/route')
    const res = await GET(new NextRequest(`${VF_ORIGIN}/api/discovery/events`, { headers: { host: new URL(VF_ORIGIN).host } }))
    if (!res.ok) return null
    const { events } = (await res.json()) as { events?: { venueSlug?: string; venueName: string; village?: string }[] }
    return (events ?? []).some(e => venueGroupKey(e) === slug)
  } catch (e) {
    console.error('[venue-index] could not read the events feed:', e instanceof Error ? e.message : e)
    return null
  }
}

/** The page's robots: `noindex, follow` without events; with events (or when unknown) nothing is added — indexable, as today. */
export const venueRobots = (has: boolean | null) => (has === false ? { robots: { index: false, follow: true } } : {})
