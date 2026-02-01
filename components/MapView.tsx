"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import type { VillageEvent } from "@/types";

interface MapViewProps {
  events: VillageEvent[];
}

export default function MapView({ events }: MapViewProps) {
  return (
    <div className="h-full w-full min-h-[400px] rounded-xl overflow-hidden border border-[#354F52]/20">
      <MapContainer
        center={[52.1901, 0.5456]}
        zoom={12}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {events.map((event, idx) => (
          <Marker
            key={`${event.date}-${event.truckName}-${event.venueName}-${idx}`}
            position={[event.venueLat, event.venueLong]}
          >
            <Popup>
              <div className="min-w-[200px]">
                <span className="text-xl" role="img" aria-hidden>
                  {event.type === "Mobile" ? "🚚" : "🍽️"}
                </span>
                <p className="font-bold text-[#354F52] mt-1">{event.truckName}</p>
                {event.truckCuisine && (
                  <span className="text-xs text-[#84A98C] font-medium">
                    {event.truckCuisine}
                  </span>
                )}
                <p className="text-sm text-[#354F52]/80 mt-1">{event.venueName}</p>
                {(event.startTime || event.endTime) && (
                  <p className="text-sm text-[#E76F51] font-medium">
                    {event.startTime} – {event.endTime}
                  </p>
                )}
                {event.notes && (
                  <p className="text-xs text-[#354F52]/70 mt-1">{event.notes}</p>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${event.venueLat},${event.venueLong}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-[#E76F51] hover:underline"
                >
                  Get directions →
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
