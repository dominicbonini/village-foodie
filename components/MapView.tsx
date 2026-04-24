'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon, LatLngBounds } from 'leaflet';
import { VillageEvent } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { getDistanceKm } from '@/lib/utils';
import EventListCard from '@/components/EventListCard';

const userIcon = divIcon({
  html: '<div style="font-size: 24px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">🏠</div>',
  className: 'bg-transparent',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -10]
});

// 👇 NEW: Dynamic Icon Generator. Creates a big glowing pin if hovered! 👇
const createDynamicIcon = (isStatic: boolean, isHighlighted: boolean) => {
    const emoji = isStatic ? '🍽️' : '🚚';
    const size = isHighlighted ? '36px' : '24px';
    const shadow = isHighlighted ? 'drop-shadow(0 4px 10px rgba(234,88,12,0.9))' : 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))';
    const transform = isHighlighted ? 'scale(1.1) translateY(-4px)' : 'scale(1) translateY(0px)';
    
    return divIcon({
      html: `<div style="font-size: ${size}; filter: ${shadow}; transform: ${transform}; transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); line-height: 1;">${emoji}</div>`,
      className: 'bg-transparent',
      iconSize: [40, 40], // Extra room so the glow doesn't clip
      iconAnchor: [20, 20],
      popupAnchor: [0, -10]
    });
};

function formatDateForDisplay(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return 'Date TBC';
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  
  try {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    const eventDate = new Date(year, month, day);
    if (isNaN(eventDate.getTime())) return dateStr;

    const today = new Date();
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const formattedDate = eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (eventDate.getTime() === today.getTime()) return `Today - ${formattedDate}`;
    if (eventDate.getTime() === tomorrow.getTime()) return `Tomorrow - ${formattedDate}`;
    return formattedDate.toUpperCase();
  } catch (e) {
    return dateStr;
  }
}

// --- SMART MAP CONTROLLER ---
interface MapControllerProps {
  events: VillageEvent[];
  userLocation: { lat: number; long: number } | null;
  radius: string; 
}

function MapController({ events, userLocation, radius }: MapControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (userLocation && radius !== 'all') {
      let zoomLevel = 10;
      if (radius === '11') zoomLevel = 11;
      if (radius === '16') zoomLevel = 10;
      if (radius === '21') zoomLevel = 9;

      map.flyTo([userLocation.lat, userLocation.long], zoomLevel, { animate: true, duration: 0.5 });
      return;
    }

    if (events.length > 0) {
      const coords = events
        .filter(e => e.venueLat && e.venueLong)
        .map(e => [e.venueLat!, e.venueLong!] as [number, number]);

      if (coords.length > 0) {
        const bounds = new LatLngBounds(coords);
        if (userLocation) bounds.extend([userLocation.lat, userLocation.long]);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [events, userLocation, radius, map]);

  return null;
}

// 👇 NEW: Added hoveredEventId and onMarkerClick props 👇
interface MapViewProps {
  events: VillageEvent[];
  userLocation?: { lat: number; long: number } | null;
  radius?: string;
  hoveredEventId?: string | null;
  onMarkerClick?: (eventId: string) => void;
}

export default function MapView({ events, userLocation = null, radius = 'all', hoveredEventId, onMarkerClick }: MapViewProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const defaultCenter: [number, number] = [52.24, 0.55]; 
  
  const groupedEvents = useMemo(() => {
    const groups: Record<string, VillageEvent[]> = {};
    events.forEach(event => {
      if (event.venueLat && event.venueLong) {
        const key = `${event.venueLat},${event.venueLong}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(event);
      }
    });
    return groups;
  }, [events]);

  if (!mounted) {
    return (
      <div className="w-full h-full bg-slate-100 animate-pulse flex items-center justify-center text-slate-400 font-bold">
        Loading Map...
      </div>
    );
  }

  return (
    <MapContainer 
      center={defaultCenter} 
      zoom={10} 
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='© OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapController events={events} userLocation={userLocation} radius={radius} />

      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.long]} icon={userIcon}>
          <Popup>You are here 🏠</Popup>
        </Marker>
      )}

      {Object.entries(groupedEvents).map(([locKey, groupEvents]) => {
        const [lat, long] = locKey.split(',').map(Number);
        
        // Find the first event in this specific location stack
        const firstEvent = groupEvents[0];
        const isStatic = firstEvent.type?.toLowerCase().includes('static') ?? false;
        
        // 👇 NEW: Check if ANY event parked at this location matches the hovered item 👇
        const isHighlighted = hoveredEventId ? groupEvents.some(e => e.id === hoveredEventId) : false;
        
        return (
          <Marker 
            key={locKey} 
            position={[lat, long]}
            icon={createDynamicIcon(isStatic, isHighlighted)}
            zIndexOffset={isHighlighted ? 1000 : 0} // Brings the hovered pin to the front!
            eventHandlers={{
                click: () => {
                    // Triggers the scroll function passed down from page.tsx
                    if (onMarkerClick) {
                        onMarkerClick(firstEvent.id);
                    }
                }
            }}
          >
            <Popup className="custom-popup" minWidth={280} maxWidth={320}>
               <div className="font-sans max-h-[400px] overflow-y-auto pr-1">
                  {groupEvents.map((event, index) => {
                     const displayDate = formatDateForDisplay(event.date);
                     
                     let distMiles = null;
                     if (userLocation) {
                       const km = getDistanceKm(userLocation.lat, userLocation.long, lat, long);
                       distMiles = km * 0.621371;
                     }
                     
                     return (
                      <div key={event.id} className={index > 0 ? "mt-4 pt-4 border-t border-slate-100" : ""}>
                          
                          <div className="mb-2">
                            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                              {displayDate}
                            </span>
                          </div>

                          <EventListCard 
                            event={event} 
                            distanceMiles={distMiles} 
                            isMapPopup={true} 
                          />
                          
                      </div>
                     );
                  })}
               </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}