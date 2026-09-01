'use client';

import { ReactNode } from 'react';
import { VillageEvent } from '@/types';
import { GREEN_SOLID, ORANGE_SOLID } from '@/lib/ui-tokens';
import Link from 'next/link';
import { getVenueSlug } from '@/lib/utils';
import { isHatchGrab } from '@/lib/domain';
import { formatTimeRange } from '@/lib/time-utils';

interface TruckListCardProps {
  event: VillageEvent;
  slug: string;
  /** Suppress the Order/Pre-order CTA — used on the order page's selected-event header, where the
   *  customer is already ordering for this event (the button would deep-link back to itself). */
  hideOrderButton?: boolean;
  /** Bypass the isHatchGrab() HOST gate on the Order CTA — set ONLY by the order-page event chooser,
   *  where the customer is already on the order page so the CTA must render on ANY host (localhost +
   *  villagefoodie.co.uk included). Discovery/listing usages omit this → keep the host gate. The other
   *  conditions (!hideOrderButton, source==='operator') still apply. */
  forceOrderButton?: boolean;
  /** COMPACT density+layout variant (order-page selected card). Default off → profile + chooser
   *  render the original card. When on: tighter padding, horizontal on mobile too (date/time left,
   *  venue/postcode right), no internal divider — roughly half the height. */
  compact?: boolean;
  /** Optional node pinned to the card's top-right corner (e.g. a "Change event" link). Default
   *  undefined → nothing rendered. Only used with `compact` on the order page. */
  cornerAction?: ReactNode;
  /** ── HATCHGRAB SEMANTICS WITHOUT ASKING THE BROWSER WHAT HOST IT IS ON (V1, /embed) ──────────
   *  Set ONLY by /embed/<slug>, which is a HatchGrab surface served INSIDE AN IFRAME ON THE
   *  OPERATOR'S OWN DOMAIN. It cannot use the host test the other call sites use: `isHatchGrab()`
   *  reads `window.location.hostname` and returns FALSE during server render (lib/domain.ts:2), so
   *  the first painted frame would take the Village Foodie branch and consult `orderLinkVf` — which
   *  defaults to false — and the Order button would flicker in rather than render.
   *  🔴 DEFAULT FALSE, AND THE `||` SHORT-CIRCUIT IS WHY THIS IS SAFE. When it is false the guard
   *  below evaluates `isHatchGrab()` exactly as it always did; when it is true, `isHatchGrab()` is
   *  never called at all. The three existing call sites pass nothing → byte-identical behaviour.
   *  ⚠️ This chooses WHICH FLAG IS CONSULTED. It does not bypass one: `orderLinkHg` (i.e.
   *  `trucks.order_link_hg`) must still be true, exactly as on hatchgrab.com. */
  assumeHatchGrab?: boolean;
  /** ── ORDERING MUST NOT HAPPEN INSIDE SOMEBODY ELSE'S IFRAME (V1b, /embed) ────────────────────
   *  Set ONLY by /embed/<slug>. The CTA's href is RELATIVE, so in a frame it resolves against our
   *  origin and loads the whole ordering flow INSIDE the operator's widget-sized box — card entry
   *  included, since the order page mounts Stripe's own iframe inside it. `_blank` puts checkout in
   *  the TOP-LEVEL context on hatchgrab.com, where the address bar shows our domain and our padlock.
   *  🔴 `rel="noopener noreferrer"` TRAVELS WITH IT, ALWAYS. A `_blank` link without `noopener` hands
   *  the opened page a live `window.opener` handle on the frame that opened it; `noreferrer` also
   *  stops the operator's page URL leaking to us as a Referer. They are one decision, not two.
   *  ⚠️ DEFAULT FALSE, and when false BOTH attributes are `undefined`, which React omits entirely —
   *  so the existing call sites emit the exact same `<a>` they always have. */
  openOrderInNewTab?: boolean;
  /** ── THE VENUE NAME IS A LINK OUT OF THE EMBED, AND IT LANDS ON VILLAGE FOODIE (V1b) ─────────
   *  Set ONLY by /embed/<slug>. The name normally links to `/venues/<slug>` — a full Village Foodie
   *  surface, logo and footer and newsletter and all. Relative again, so inside a frame it replaces
   *  the embed with VF chrome on the operator's own homepage. That is the chrome problem one hop
   *  past the one the inventory checked, which only ever looked at what RENDERS.
   *  🔴 PLAIN TEXT, NOT A DISABLED LINK. There is no destination worth offering here: the operator
   *  put this widget on their site to show their schedule, not to route their customers to our
   *  directory. Removing the anchor also removes the pointer cursor and the hover colour, so it stops
   *  LOOKING clickable — a link that looks live and goes nowhere is worse than plain text.
   *  ⚠️ DEFAULT FALSE → the `<Link>`, its href, its title and its classes are untouched elsewhere. */
  plainVenueName?: boolean;
  /** ── THE CTA'S ORIGIN, WHERE THE PAGE IS NOT ON OUR DOMAIN (V4, custom domain) ────────────────
   *  Set ONLY by the custom-domain schedule page. The href below is RELATIVE, which is correct on
   *  every one of our own surfaces and **wrong the moment the page is served from an operator's own
   *  address**: it would resolve to `schedule.theirtruck.co.uk/trucks/<slug>/order`, putting our
   *  ordering flow — and the payment provider's own frame inside it — on a domain we do not control
   *  and whose certificate we do not own.
   *  🔴 DEFAULT `undefined`, AND THE TEMPLATE IS UNCHANGED WHEN IT IS. `${orderOrigin ?? ''}` prefixes
   *  nothing, so the four call sites that pass no origin emit the byte-identical relative href they
   *  always have. Proven by running the committed component against this one over the same matrix.
   *  ⚠️ It carries an ORIGIN, never a path — `https://www.hatchgrab.com`, no trailing slash. */
  orderOrigin?: string;
}

const renderTextWithLinks = (text: string) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (urlRegex.test(part)) {
         const href = part.startsWith('www.') ? `https://${part}` : part;
         return (
           <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">
               {part.replace(/^https?:\/\//, '')}
           </a>
         );
      }
      return <span key={i}>{part}</span>;
    });
};

function formatStandardDate(dateStr: string) {
    if (!dateStr) return '';
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        }
    }
    return dateStr;
}


// LIVE-REDEFINITION (V7.0): live = operator STARTED the event (status==='open', from the Start
// button or auto-event-scheduler), NOT the published clock window. Published times stay DISPLAY-only.
function isEventLive(status?: string): boolean {
  return status === 'open';
}

export default function TruckListCard({ event, slug, hideOrderButton, forceOrderButton, compact, cornerAction, assumeHatchGrab = false, openOrderInNewTab = false, plainVenueName = false, orderOrigin }: TruckListCardProps) {
  const liveNow = isEventLive(event.status);
  // Secondary "area" line under the venue name: village (only if not already in the name) + the
  // event's postcode, de-emphasised. Null-safe — filter drops missing parts, so a null postcode
  // shows the area alone with NO trailing separator, and both-null → '' → line 2 not rendered.
  const showVillage = event.village && !event.venueName.toLowerCase().includes(event.village.toLowerCase());
  const areaLine = [showVillage ? event.village : null, event.postcode].filter(Boolean).join(' · ');

  // Lifted out of the markup so the linked and the plain rendering below cannot drift apart — the two
  // differ ONLY in their wrapper element. `group-hover:text-orange-600` stays on the h3 in both: with
  // no `group` ancestor it simply never matches, and keeping it makes the two branches diffable.
  const venueLines = (
    <>
      {/* Line 1: venue NAME (primary). Compact uses line-clamp-1 (single tight row);
          default uses line-clamp-2. */}
      <h3 className={`text-slate-800 text-[14px] sm:text-[15px] font-bold leading-tight group-hover:text-orange-600 transition-colors ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>
        {event.venueName}
      </h3>
      {/* Line 2: area · postcode (SMALLER + MUTED, de-emphasised). Hidden when empty. */}
      {areaLine && (
        <p className="text-slate-400 text-[11px] sm:text-xs font-medium leading-tight mt-0.5 truncate">
          {areaLine}
        </p>
      )}
    </>
  );

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 hover:border-orange-200 transition-colors ${compact ? 'relative px-3 py-2 mb-2' : 'p-3.5 sm:p-4 mb-3'}`}>
        {/* Top-right corner slot (compact variant) — e.g. "Change event". Inert when not provided. */}
        {cornerAction && <div className="absolute top-2 right-2 z-10">{cornerAction}</div>}
        <div className={compact ? 'flex flex-row items-center gap-3' : 'flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4'}>

            {/* DATE AND TIME */}
            <div className={compact ? 'flex flex-col items-start gap-0.5 shrink-0 w-[112px]' : 'flex flex-row sm:flex-col items-center sm:items-start gap-2 sm:gap-0.5 shrink-0 sm:w-[140px]'}>
                {/* Date in normal case (was ALL-CAPS) — softer; keeps the orange accent. */}
                <span className="text-[13px] sm:text-sm font-bold text-orange-600 leading-none">
                    {formatStandardDate(event.date)}
                </span>
                {/* Time + INLINE "● Live" on ONE line (status-driven). Inline (not its own row) so a
                    live card is the SAME HEIGHT as a non-live card. Live condition + button flip unchanged. */}
                <span className="flex items-center gap-2 text-[12px] font-bold text-slate-500 leading-none mt-0.5">
                    <span>{formatTimeRange(event.startTime, event.endTime)}</span>
                    {liveNow && (
                        <span className="inline-flex items-center gap-1 text-green-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Live
                        </span>
                    )}
                </span>
            </div>

            {/* VENUE NAME (left) + ORDER BUTTON (right) — side-by-side on ONE row at all widths
                (mobile included). The name column is flex-1 min-w-0 so a long venue name wraps to
                two lines (line-clamp-2) within its own width while the button stays right-aligned,
                vertically centred, and never gets pushed off-screen or clipped against the button.
                The mobile separator (border-t/pt/mt, sm-cleared) now spans the whole name+button row. */}
            <div className={`flex-1 min-w-0 flex flex-row items-center justify-between gap-3 ${compact ? 'pr-20' : 'border-t border-slate-100 sm:border-t-0 pt-1.5 sm:pt-0 mt-1 sm:mt-0'}`}>

                {/* VENUE NAME AND VILLAGE */}
                <div className="flex-1 min-w-0">
                    {plainVenueName ? (
                        // No anchor, no href, no title, no cursor-pointer — see plainVenueName above.
                        <div className="block min-w-0">{venueLines}</div>
                    ) : (
                        <Link
                            href={`/venues/${getVenueSlug(event.venueName, event.village || '')}`}
                            className="group block min-w-0 cursor-pointer"
                            title={`View venue details for ${event.venueName}`}
                        >
                            {venueLines}
                        </Link>
                    )}
                </div>

                {/* ORDER BUTTON — compact, right-aligned, intrinsic width (does NOT stretch full-width).
                    Gated to operator-sourced events (real truck_events id + order-taking truck) AND the
                    per-site order-link flag: on HatchGrab → event.orderLinkHg (default true), on Village
                    Foodie → event.orderLinkVf (default false, so no VF order link until a truck is graduated
                    post-trial). forceOrderButton bypasses the host gate (order-page chooser). Deep-links the
                    order FORM scoped to this exact event; unconfirmed events never reach here. */}
                {!hideOrderButton && (forceOrderButton || ((assumeHatchGrab || isHatchGrab()) ? event.orderLinkHg : event.orderLinkVf)) && event.source === 'operator' && (
                    <a
                        href={`${orderOrigin ?? ''}/trucks/${slug}/order?event_id=${event.id}`}
                        // `undefined` when the prop is off, and React omits an undefined attribute
                        // entirely — so the three existing call sites emit an unchanged <a>.
                        target={openOrderInNewTab ? '_blank' : undefined}
                        rel={openOrderInNewTab ? 'noopener noreferrer' : undefined}
                        // Equal-width (min-w + justify-center) so the card layout doesn't shift between
                        // the Pre-order and Order now states. Text flips on live (status==='open').
                        //
                        // COLOUR FLIPS WITH THE TEXT, ON THE SAME `liveNow`. Every event's CTA used to be
                        // brand orange, so a live event and one three weeks away were the same colour and
                        // only the label told them apart — read second, if at all, in a list of cards.
                        // GREEN ALREADY MEANS "LIVE" ON THIS EXACT CARD: the "Live" dot two elements above
                        // is text-green-600 / bg-green-500 and is gated on the SAME `liveNow`. The button
                        // now agrees with the dot instead of contradicting it.
                        // The tokens are the SHARED ones from lib/ui-tokens.ts, which exists precisely so a
                        // green defined in two places cannot drift apart. Pre-order keeps the brand orange
                        // it has always had, unchanged.
                        className={`shrink-0 inline-flex items-center justify-center min-w-[104px]
                                   ${liveNow ? GREEN_SOLID : ORANGE_SOLID} font-semibold
                                   px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap`}
                    >
                        {liveNow ? 'Order now' : 'Pre-order'}
                    </a>
                )}
            </div>

        </div>

        {/* EVENT NOTES */}
        {(event.notes || event.eventNotes) && (
            <div className="mt-3 flex flex-col gap-1.5 w-full min-w-0 shrink-0">
                {event.notes && (
                    <div className="w-full bg-slate-50 border border-slate-200 border-l-4 border-l-orange-500 px-2.5 py-2 rounded-r-md flex items-start shrink-0 min-w-0 shadow-sm">
                        <div className="text-slate-700 text-[11px] font-semibold leading-tight w-full !m-0 !p-0">
                            {renderTextWithLinks(event.notes)}
                        </div>
                    </div>
                )}
                {event.eventNotes && (
                    <div className="w-full bg-slate-50 border border-slate-200 border-l-4 border-l-orange-500 px-2.5 py-2 rounded-r-md flex items-start shrink-0 min-w-0 shadow-sm">
                        <div className="text-slate-700 text-[11px] font-semibold leading-tight w-full !m-0 !p-0">
                            ⭐ {renderTextWithLinks(event.eventNotes)}
                        </div>
                    </div>
                )}
            </div>
        )}

    </div>
  );
}