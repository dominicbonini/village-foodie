'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon, LatLngBounds } from 'leaflet';
import { VillageEvent } from '@/types';
import { useEffect } from 'react';

// --- ICONS ---
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

const userIcon = divIcon({
  html: '<div style="font-size: 24px;">🏠</div>',
  className: 'bg-transparent',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// --- SMART MAP CONTROLLER ---
interface MapControllerProps {
  events: VillageEvent[];
  userLocation: { lat: number; long: number } | null;
  radius: string; // '5', '10', '20', or 'all'
}

function MapController({ events, userLocation, radius }: MapControllerProps) {
  const map = useMap();

  useEffect(() => {
    // SCENARIO 1: User wants a specific distance radius (Zoom to User)
    if (userLocation && radius !== 'all') {
      const zoomLevel = 
        radius === '5' ? 12 : 
        radius === '10' ? 11 : 
        10; // 20 miles

      map.flyTo([userLocation.lat, userLocation.long], zoomLevel, {
        animate: true,
        duration: 1.5
      });
      return;
    }

    // SCENARIO 2: "All Events" mode (Fit all trucks)
    if (events.length > 0) {
      const coords = events
        .filter(e => e.venueLat && e.venueLong)
        .map(e => [e.venueLat!, e.venueLong!] as [number, number]);

      if (coords.length > 0) {
        const bounds = new LatLngBounds(coords);
        // If we also have a user location, include them in the view
        if (userLocation) {
          bounds.extend([userLocation.lat, userLocation.long]);
        }
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
  // Default view: Center between Bury St Edmunds/Newmarket
  const defaultCenter: [number, number] = [52.24, 0.55]; 

  return (
    <MapContainer 
      center={defaultCenter} 
      zoom={10} 
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* ACTIVATE CONTROLLER */}
      <MapController events={events} userLocation={userLocation} radius={radius} />

      {/* SHOW USER LOCATION (House Icon) */}
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.long]} icon={userIcon}>
          <Popup>You are here</Popup>
        </Marker>
      )}

      {/* SHOW EVENTS */}
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
                {/* ... existing popup content ... */}
                <span className="text-xs font-bold text-orange-600 block mt-2">
                  {event.startTime} - {event.endTime}
                </span>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}