'use client';

import { VillageEvent } from '@/types';
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

export default function TruckListCard({ event, slug, hideOrderButton }: TruckListCardProps) {
  const liveNow = isEventLive(event.status);
  // Secondary "area" line under the venue name: village (only if not already in the name) + the
  // event's postcode, de-emphasised. Null-safe — filter drops missing parts, so a null postcode
  // shows the area alone with NO trailing separator, and both-null → '' → line 2 not rendered.
  const showVillage = event.village && !event.venueName.toLowerCase().includes(event.village.toLowerCase());
  const areaLine = [showVillage ? event.village : null, event.postcode].filter(Boolean).join(' · ');

  return (
    <div className="bg-white p-3.5 sm:p-4 rounded-xl shadow-sm border border-slate-200 mb-3 hover:border-orange-200 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
            
            {/* DATE AND TIME */}
            <div className="flex flex-row sm:flex-col items-center sm:items-start gap-2 sm:gap-0.5 shrink-0 sm:w-[140px]">
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
            <div className="flex-1 min-w-0 flex flex-row items-center justify-between gap-3 border-t border-slate-100 sm:border-t-0 pt-1.5 sm:pt-0 mt-1 sm:mt-0">

                {/* VENUE NAME AND VILLAGE */}
                <div className="flex-1 min-w-0">
                    <Link
                        href={`/venues/${getVenueSlug(event.venueName, event.village || '')}`}
                        className="group block min-w-0 cursor-pointer"
                        title={`View venue details for ${event.venueName}`}
                    >
                        {/* Line 1: venue NAME (primary). line-clamp-2 wraps a long name; ellipsis beyond. */}
                        <h3 className="text-slate-800 text-[14px] sm:text-[15px] font-bold leading-tight line-clamp-2 group-hover:text-orange-600 transition-colors">
                            {event.venueName}
                        </h3>
                        {/* Line 2: area · postcode (SMALLER + MUTED, de-emphasised). Hidden when empty. */}
                        {areaLine && (
                            <p className="text-slate-400 text-[11px] sm:text-xs font-medium leading-tight mt-0.5 truncate">
                                {areaLine}
                            </p>
                        )}
                    </Link>
                </div>

                {/* ORDER BUTTON — compact, right-aligned, intrinsic width (does NOT stretch full-width).
                    Gated to HatchGrab AND operator-sourced events: source==='operator' guarantees a
                    real truck_events id (orderable) and an order-taking truck (discovery events are
                    excluded). Deep-links the order FORM scoped to this exact event. Pending/unconfirmed
                    events never reach here (the discovery feed only returns confirmed/open operator
                    events). px-4 py-2 keeps a sensible tap target even when not full-width. */}
                {!hideOrderButton && isHatchGrab() && event.source === 'operator' && (
                    <a
                        href={`/trucks/${slug}/order?event_id=${event.id}`}
                        // Equal-width (min-w + justify-center) so the card layout doesn't shift between
                        // the Pre-order and Order now states. Text flips on live (status==='open').
                        className="shrink-0 inline-flex items-center justify-center min-w-[104px]
                                   bg-orange-600 hover:bg-orange-700 text-white font-semibold
                                   px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
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