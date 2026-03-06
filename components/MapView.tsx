'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon, LatLngBounds } from 'leaflet';
import { VillageEvent } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { getDistanceKm } from '@/lib/utils';
import EventListCard from '@/components/EventListCard';

// --- ICONS (Lightweight Emojis) ---
const truckIcon = divIcon({
  html: '<div style="font-size: 24px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">🚚</div>',
  className: 'bg-transparent',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -10]
});

const plateIcon = divIcon({
  html: '<div style="font-size: 24px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">🍽️</div>',
  className: 'bg-transparent',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -10]
});

const userIcon = divIcon({
  html: '<div style="font-size: 24px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));">🏠</div>',
  className: 'bg-transparent',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -10]
});

function formatDateForDisplay(dateStr: string): string {
  // Safety Guard: If date is missing or not a string, return a fallback
  if (!dateStr || typeof dateStr !== 'string') return 'Date TBC';

  const parts = dateStr.split('/');
  
  // Safety Guard: If it's not the 00/00/0000 format, just return the string as-is
  if (parts.length !== 3) return dateStr;
  
  try {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    
    const eventDate = new Date(year, month, day);
    
    // Check if the date is actually valid
    if (isNaN(eventDate.getTime())) return dateStr;

    const today = new Date();
    today.setHours(0,0,0,0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const formattedDate = eventDate.toLocaleDateString('en-GB', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
    
    if (eventDate.getTime() === today.getTime()) return `Today - ${formattedDate}`;
    if (eventDate.getTime() === tomorrow.getTime()) return `Tomorrow - ${formattedDate}`;
    
    return formattedDate.toUpperCase();
  } catch (e) {
    // If anything at all goes wrong, just return the original string instead of crashing
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
      if (radius === '10') zoomLevel = 11;
      if (radius === '20') zoomLevel = 10;
      if (radius === '30') zoomLevel = 9;

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

interface MapViewProps {
  events: VillageEvent[];
  userLocation?: { lat: number; long: number } | null;
  radius?: string;
}

export default function MapView({ events, userLocation = null, radius = 'all' }: MapViewProps) {
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
      <div className="w-full h-full bg-slate-100 animate-pulse flex items-center justify-center text-slate-400">
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
        const firstEvent = groupEvents[0];
        const isStatic = firstEvent.type?.toLowerCase().includes('static');
        
        return (
          <Marker 
            key={locKey} 
            position={[lat, long]}
            icon={isStatic ? plateIcon : truckIcon}
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
                          
                          {/* CLEAN DATE HEADER */}
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