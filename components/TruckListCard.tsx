'use client';

import { VillageEvent } from '@/types';
import Link from 'next/link';
import { getVenueSlug } from '@/lib/utils';
import { isHatchGrab } from '@/lib/domain';

interface TruckListCardProps {
  event: VillageEvent;
  slug: string;
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

export default function TruckListCard({ event, slug }: TruckListCardProps) {
  const showVillage = event.village && !event.venueName.toLowerCase().includes(event.village.toLowerCase());
  const venueDisplay = showVillage ? `${event.venueName} - ${event.village}` : event.venueName;
  
  return (
    <div className="bg-white p-3.5 sm:p-4 rounded-xl shadow-sm border border-slate-200 mb-3 hover:border-orange-200 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
            
            {/* DATE AND TIME */}
            <div className="flex flex-row sm:flex-col items-center sm:items-start gap-2 sm:gap-0.5 shrink-0 sm:w-[140px]">
                <span className="text-[13px] sm:text-sm font-bold text-orange-600 leading-none uppercase tracking-wide">
                    {formatStandardDate(event.date)}
                </span>
                <span className="text-[12px] font-bold text-slate-500 leading-none mt-0.5">
                    {event.startTime} - {event.endTime}
                </span>
            </div>

            {/* VENUE NAME AND VILLAGE */}
            <div className="flex-1 min-w-0 flex flex-col border-t border-slate-100 sm:border-t-0 pt-1.5 sm:pt-0 mt-1 sm:mt-0">
                <Link 
                    href={`/venues/${getVenueSlug(event.venueName, event.village || '')}`}
                    className="group min-w-0 cursor-pointer w-fit"
                    title={`View venue details for ${event.venueName}`}
                >
                    {/* 👇 UPDATED: Changed from font-black to font-bold, slightly smaller and softer color 👇 */}
                    <h3 className="text-slate-800 text-[14px] sm:text-[15px] font-bold leading-tight truncate group-hover:text-orange-600 transition-colors">
                        {venueDisplay}
                    </h3>
                </Link>
            </div>

            {/* ORDER BUTTON — compact, right-aligned on the event row. Gated to HatchGrab AND
                operator-sourced events: source==='operator' guarantees a real truck_events id
                (orderable) and an order-taking truck (discovery events are excluded). Deep-links
                the order FORM scoped to this exact event. Pending/unconfirmed events never reach
                here (the discovery feed only returns confirmed/open operator events). On mobile the
                row stacks, so self-start keeps it boxed (not full-width). */}
            {isHatchGrab() && event.source === 'operator' && (
                <a
                    href={`/trucks/${slug}/order?event_id=${event.id}`}
                    className="shrink-0 self-start sm:self-auto inline-flex items-center gap-1.5
                               bg-orange-600 hover:bg-orange-700 text-white font-semibold
                               px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
                >
                    🛒 Order
                </a>
            )}

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