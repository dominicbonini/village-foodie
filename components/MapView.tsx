'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon } from 'leaflet';
import { VillageEvent } from '@/types'; // <--- IMPORTING FROM SHARED FILE

// (Delete the interface VillageEvent { ... } block from here)


// -----------------------------------------

const truckIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px; line-height: 1;">🚚</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const plateIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px; line-height: 1;">🍽️</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

interface MapViewProps {
  events: VillageEvent[];
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
        // Skip invalid coordinates
        if (!event.venueLat || !event.venueLong) return null;

        const typeClean = event.type ? event.type.trim().toLowerCase() : '';
        
        // Default to Truck, switch to Plate if static
        let iconToUse = truckIcon; 
        if (typeClean === 'static') {
            iconToUse = plateIcon;
        }

        const mapLink = 'https://www.google.com/maps/search/?api=1&query=' + event.venueLat + ',' + event.venueLong;

        // Time formatting
        let timeDisplay = '';
        if (event.startTime && event.endTime) {
            timeDisplay = event.startTime + ' - ' + event.endTime;
        } else if (event.startTime) {
            timeDisplay = 'From ' + event.startTime;
        }

        const uniqueKey = event.date + '-' + event.truckName + '-' + index;

        return (
          <Marker 
            key={uniqueKey} 
            position={[event.venueLat, event.venueLong]}
            icon={iconToUse}
          >
            <Popup>
              <div className="text-center min-w-[150px]">
                <span className="text-3xl block mb-2">
                   {typeClean === 'static' ? '🍽️' : '🚚'}
                </span>
                <strong className="block text-slate-900 text-lg mb-1">{event.truckName}</strong>
                <p className="text-sm text-slate-600 mb-2">{event.venueName}</p>
                
                {timeDisplay && (
                  <div className="text-xs text-orange-700 font-bold bg-orange-50 inline-block px-2 py-1 rounded mb-3">
                    {timeDisplay}
                  </div>
                )}

                <a 
                  href={mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-slate-800 text-white text-xs py-2 rounded-md hover:bg-slate-700 no-underline"
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