'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon } from 'leaflet';
import { Event } from '../types';

const truckIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px;">🚚</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const plateIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px;">🍽️</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const defaultIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px;">📍</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
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
        if (!event.venueLat || !event.venueLong) return null;

        const typeClean = event.type ? event.type.trim().toLowerCase() : '';
        
        let iconToUse = defaultIcon;
        if (typeClean === 'mobile') iconToUse = truckIcon;
        if (typeClean === 'static') iconToUse = plateIcon;

        // Safe map link generation
        const mapLink = 'http://maps.google.com/?q=' + event.venueLat + ',' + event.venueLong;

        // Check if we have times to display
        const hasTime = event.startTime || event.endTime;

        return (
          <Marker 
            key={index} 
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
                
                {/* Only render this if times actually exist */}
                {hasTime && (
                  <p className="text-xs text-orange-600 font-bold mt-1 mb-2">
                    {event.startTime} - {event.endTime}
                  </p>
                )}

                <a 
                  href={mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-slate-700 text-white text-xs py-2 px-4 rounded-full hover:bg-slate-600 no-underline"
                >
                  Get Directions
                </a>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}