// ── 🔴 KEPT AFTER THE IFRAME REMOVAL (V11.49). ITS FOLDER NAME IS HISTORY, NOT DEPENDENCY. ─────────
// The route that used to live beside this file (app/embed/[slug]/page.tsx) is deleted. This component
// is NOT part of it: it is imported by app/domain/page.tsx and renders the whole schedule body of an
// operator's own custom domain. Moving it out of this folder is a tidy-up nobody has done; deleting it
// with the folder would take the custom-domain page's content with it.
'use client'

import { useEffect, useState } from 'react'
import TruckListCard from '@/components/TruckListCard'
import type { VillageEvent } from '@/types'

/**
 * ── THE EVENT LIST. IT REUSES TruckListCard UNMODIFIED IN EVERY RESPECT BUT ONE. ─────────────────
 *
 * The one exception is `assumeHatchGrab`, a new prop with a default that leaves the three existing
 * call sites byte-identical. It exists because `isHatchGrab()` reads `window.location.hostname` and
 * returns FALSE on the server (lib/domain.ts:2), so without it the Order button would consult
 * `orderLinkVf` — default false — on the first painted frame and flicker in after hydration.
 * ⚠️ IT SELECTS THE FLAG, IT DOES NOT BYPASS IT. `trucks.order_link_hg` must still be true.
 *
 * ── ✅ THE TWO ESCAPE HATCHES ARE CLOSED (V1b) ────────────────────────────────────────────────────
 * Both links inside this card are RELATIVE, so in a frame they resolve against our origin and, left
 * alone, open IN THE FRAME. Stage 1 recorded that and did not fix it; Stage 1b does, behind two more
 * default-off props:
 *   1. `openOrderInNewTab` — the Order/Pre-order CTA gets `target="_blank"` + `rel="noopener
 *      noreferrer"`, so ordering and PAYMENT happen top-level on hatchgrab.com. That matters more
 *      than tidiness: the order page mounts Stripe's own iframe, and card entry nested two frames
 *      deep inside a third party's page is not somewhere a customer should be asked to type a card.
 *   2. `plainVenueName` — the venue name renders as TEXT. It normally links to `/venues/<slug>`, a
 *      full Village Foodie surface, which would replace the embed with our chrome on the operator's
 *      own homepage.
 * ⚠️ BOTH DEFAULT FALSE. The three pre-existing call sites pass neither and are unchanged — proven
 * by running the git-HEAD component against this one over the same matrix; see the links report.
 */
export default function EmbedSchedule({ slug, truckName, orderOrigin }: { slug: string; truckName: string; orderOrigin?: string }) {
  const [events, setEvents] = useState<VillageEvent[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    // One request, one truck, filtered in SQL. NOT /api/discovery/events — that route is on the
    // 3-per-minute STRICT bucket and returns every truck in the network (see the API route's header).
    fetch(`/api/embed/events?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setEvents(d.events ?? []) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [slug])

  if (failed) {
    // ⚠️ AN HONEST FAILURE, NOT "no events". The profile page learned this distinction the hard way —
    // a transient fetch blip must never tell a customer a real truck has nothing on.
    return <p className="py-6 text-center text-sm text-slate-500">Couldn&apos;t load the schedule just now.</p>
  }

  if (events === null) {
    return <p className="py-6 text-center text-sm text-slate-400">Loading schedule…</p>
  }

  if (events.length === 0) {
    // Names the truck, as specified. 🔴 NO CONTACT LINK — the profile page's equivalent empty state
    // sends the reader to OUR contact form ("Drop us a message to update!", TruckClient.tsx:281-288),
    // which on an operator's own website would route their customer to us.
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        No upcoming events listed for {truckName}.
      </p>
    )
  }

  // `scrollable, no cap` — every upcoming event, in the frame the operator sizes. No slice, no
  // "show more": the iframe's own height is the scroll container.
  return (
    <div className="flex flex-col">
      {events.map((event) => (
        <TruckListCard
          key={event.id}
          event={event}
          slug={slug}
          assumeHatchGrab
          openOrderInNewTab
          plainVenueName
          // Undefined on the iframe embed, which is served from our own domain, so the CTA stays
          // relative exactly as it was. Set only by the custom-domain page.
          orderOrigin={orderOrigin}
        />
      ))}
    </div>
  )
}
