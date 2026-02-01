"use client";

import type { VillageEvent } from "@/types";

interface EventCardProps {
  event: VillageEvent;
}

function getDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export default function EventCard({ event }: EventCardProps) {
  const icon = event.type === "Mobile" ? "🚚" : "🍽️";
  const directionsUrl = getDirectionsUrl(event.venueLat, event.venueLong);
  const timeStr =
    event.startTime && event.endTime
      ? `${event.startTime} – ${event.endTime}`
      : event.startTime || event.endTime || "";

  return (
    <article className="rounded-xl border border-[#354F52]/20 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="text-2xl" role="img" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[#354F52]">{event.truckName}</h3>
          {event.truckCuisine && (
            <span className="mt-1.5 inline-block rounded-full bg-[#84A98C]/30 px-2.5 py-0.5 text-sm font-medium text-[#354F52]">
              {event.truckCuisine}
            </span>
          )}
          <p className="mt-2 text-sm text-[#354F52]/80">{event.venueName}</p>
          {timeStr && (
            <p className="mt-0.5 text-sm font-medium text-[#E76F51]">{timeStr}</p>
          )}
          {event.notes && (
            <p className="mt-1.5 text-sm text-[#354F52]/70">{event.notes}</p>
          )}
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#E76F51] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E76F51]/90 active:bg-[#E76F51]/80"
          >
            Directions
          </a>
        </div>
      </div>
    </article>
  );
}
