'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon } from 'leaflet';
import { Event } from '../types';

// Define the icons
const truckIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px; line-height: 1;">🚚</div>',
  iconSize: [30, 30], // Made slightly bigger
  iconAnchor: [15, 15],
  popupAnchor: [0, -10]
});

const plateIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px; line-height: 1;">🍽️</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -10]
});

const defaultIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px; line-height: 1;">📍</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -10]
});

interface MapViewProps {
  events: Event[];
}

export default function MapView({ events }: MapViewProps) {
  return (
    <MapContainer 
      center={[52.1901, 0.5456]} 
      zoom={12} 
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='© OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {events.map((event, index) => {
        // Safety check: skip invalid coordinates
        if (!event.venueLat || !event.venueLong) return null;

        // Smart Icon Logic (Handles lowercase and spaces)
        const typeClean = event.type ? event.type.trim().toLowerCase() : '';
        
        let iconToUse = defaultIcon; // Default to Red Pin
        if (typeClean === 'mobile') iconToUse = truckIcon;
        if (typeClean === 'static') iconToUse = plateIcon;

        return (
          <Marker 
            key={`${event.truckName}-${index}`} 
            position={[event.venueLat, event.venueLong]}
            icon={iconToUse}
          >
            <Popup>
              <div className="text-center">
                <span className="text-3xl block mb-2">
                   {typeClean === 'mobile' ? '🚚' : (typeClean === 'static' ? '🍽️' : '📍')}
                </span>
                <strong className="block text-slate-800 text-lg">{event.truckName}</strong>
                <p className="text-sm text-slate-600 m-0">{event.venueName}</p>
                <p className="text-xs text-orange-600 font-bold mt-1 mb-2">
                  {event.startTime} - {event.endTime}
                </p>
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${event.venueLat},${event.venueLong}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-slate-700 text-white text-xs py-2 px-4 rounded-full hover:bg-slate-600 no-underline"
                >
                  Get Directions →
                </a>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}