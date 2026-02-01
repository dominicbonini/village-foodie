'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon } from 'leaflet';
import { Event } from '../types';

// 1. Create the Custom Icons
const truckIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px; line-height: 1;">🚚</div>',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
  popupAnchor: [0, -10]
});

const plateIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px; line-height: 1;">🍽️</div>',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
  popupAnchor: [0, -10]
});

const defaultIcon = divIcon({
  className: 'custom-icon',
  html: '<div style="font-size: 24px; line-height: 1;">📍</div>',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
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
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {events.map((event, index) => {
        if (!event.venueLat || !event.venueLong) return null;

        let iconToUse = defaultIcon;
        if (event.type === 'Mobile') iconToUse = truckIcon;
        if (event.type === 'Static') iconToUse = plateIcon;

        return (
          <Marker 
            key={`${event.truckName}-${index}`} 
            position={[event.venueLat, event.venueLong]}
            icon={iconToUse}
          >
            <Popup>
              <div className="text-center">
                <span className="text-2xl block mb-1">
                   {event.type === 'Mobile' ? '🚚' : '🍽️'}
                </span>
                <strong className="block text-slate-800">{event.truckName}</strong>
                <p className="text-sm text-slate-600 m-0">{event.venueName}</p>
                <p className="text-xs text-orange-600 font-bold mt-1">
                  {event.startTime} - {event.endTime}
                </p>
                {/* This link was the problem - it is fixed now */}
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${event.venueLat},${event.venueLong}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-2 bg-slate-700 text-white text-xs py-1 px-2 rounded hover:bg-slate-600 no-underline"
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