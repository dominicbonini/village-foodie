'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon, LatLngBounds } from 'leaflet';
import { VillageEvent } from '@/types';
import { useEffect } from 'react';

// Custom Icons logic
const truckIcon = divIcon({
  html: '<div style="font-size: 24px;">🚚</div>',
  className: 'bg-transparent',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const plateIcon = divIcon({
  html: '<div style="font-size: 24px;">🍽️</div>',
  className: 'bg-transparent',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// --- NEW COMPONENT: AUTO-ZOOM ---
// This invisible component watches the events and zooms the map to fit them
function AutoBounds({ events }: { events: VillageEvent[] }) {
  const map = useMap();

  useEffect(() => {
    if (events.length === 0) return;

    // 1. Collect all coordinates
    const coords = events
      .filter(e => e.venueLat && e.venueLong)
      .map(e => [e.venueLat!, e.venueLong!] as [number, number]);

    if (coords.length > 0) {
      // 2. Create a boundary box around them
      const bounds = new LatLngBounds(coords);
      
      // 3. Fly to that box (with some padding so pins aren't on the edge)
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [events, map]); // Run this every time 'events' changes

  return null;
}

interface MapViewProps {
  events: VillageEvent[];
}

export default function MapView({ events }: MapViewProps) {
  // Default view (Bury St Edmunds area) used only if no events are loaded yet
  const defaultCenter: [number, number] = [52.24, 0.71];

  return (
    <MapContainer 
      center={defaultCenter} 
      zoom={11} 
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* ACTIVATE AUTO-ZOOM */}
      <AutoBounds events={events} />

      {events.map((event) => {
        if (!event.venueLat || !event.venueLong) return null;
        
        const isStatic = event.type?.toLowerCase().includes('static');

        return (
          <Marker 
            key={event.id} 
            position={[event.venueLat, event.venueLong]}
            icon={isStatic ? plateIcon : truckIcon}
          >
            <Popup className="text-sm font-sans">
              <div className="min-w-[200px]">
                <h3 className="font-bold text-slate-900">{event.truckName}</h3>
                <p className="text-slate-600 text-xs mt-1">{event.venueName}</p>
                
                {event.type && event.type !== 'Mobile' && (
                  <span className="inline-block bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded mt-2 font-bold uppercase">
                    {event.type}
                  </span>
                )}
                
                <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
                   <span className="text-xs font-bold text-orange-600">
                     {event.startTime} - {event.endTime}
                   </span>
                   <span className="text-[10px] text-slate-400">
                     {event.date}
                   </span>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}