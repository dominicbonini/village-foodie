'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { divIcon, LatLngBounds } from 'leaflet';
import { VillageEvent } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { 
  getDistanceKm, 
  getGoogleLink, 
  getOutlookLink, 
  downloadICS,
  getCuisineEmoji,
  formatFriendlyDate 
} from '@/lib/utils';

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

// --- HELPER: Smart Date Formatter (Specific to Map Popup) ---
function formatDateForDisplay(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  
  const eventDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (eventDate.getTime() === today.getTime()) return 'Today';
  if (eventDate.getTime() === tomorrow.getTime()) return 'Tomorrow';
  
  return eventDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
}

// --- HANDLERS ---

function handleCalendarSelect(e: React.ChangeEvent<HTMLSelectElement>, event: VillageEvent) {
  const action = e.target.value;
  e.target.value = ''; 

  // Recreate the venue logic so the calendar drops a perfect pin
  const venueDisplay = event.village && !event.venueName.toLowerCase().includes(event.village.toLowerCase())
    ? `${event.venueName} - ${event.village}`
    : event.venueName;
  const venuePostcode = event.postcode || ''; 
  const addressQuery = [venueDisplay, venuePostcode].filter(Boolean).join(', ');

  const calendarEvent = {
    ...event,
    venueName: addressQuery
  };

  if (action === 'google') window.open(getGoogleLink(calendarEvent), '_blank');
  else if (action === 'outlook_web') window.open(getOutlookLink(calendarEvent), '_blank');
  else if (action === 'ics') downloadICS(calendarEvent);
}

async function handleShare(event: VillageEvent) {
  const displayUrl = 'villagefoodie.co.uk'; 

  // Format Venue
  const venueDisplay = event.village && !event.venueName.toLowerCase().includes(event.village.toLowerCase())
    ? `${event.venueName} - ${event.village}`
    : event.venueName;
  
  // Smart Emoji & Cuisine Logic
  const cuisine = event.type ? getCuisineEmoji(event.type) : '🍴';
  const introEmoji = cuisine !== '🍴' ? cuisine : '🤤';
  const foodName = event.type && event.type !== 'Mobile' ? event.type : 'street food';
  
  // Format the Date Sentence
  const friendlyDate = formatFriendlyDate(event.date).replace(' - ', ' '); 
  let dateSentence = '';
  
  if (friendlyDate.startsWith('Today')) {
    dateSentence = 'today'; 
  } else if (friendlyDate.startsWith('Tomorrow')) {
    dateSentence = friendlyDate.replace('Tomorrow', 'tomorrow'); 
  } else {
    dateSentence = `on ${friendlyDate}`; 
  }

  // Clean up the Menu URL
  let menuText = '';
  if (event.menuUrl) {
    const cleanMenuUrl = event.menuUrl.replace(/^https?:\/\/(www\.)?/, '');
    menuText = `\n\nCheck out the menu: ${cleanMenuUrl}`; 
  }

  // Combine into a natural, personal SMS
  const shareText = `Fancy some ${foodName}? ${introEmoji}\n\n${event.truckName} is at ${venueDisplay} ${dateSentence} from ${event.startTime} to ${event.endTime}.${menuText}\n\nFound on ${displayUrl} 🚚`;

  const shareData = {
    title: `${event.truckName} at ${venueDisplay}`,
    text: shareText,
  };

  try {
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareText);
      alert('Event details copied to clipboard! 📋');
    }
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message.includes('abort')) {
      return;
    }
    console.error('Share failed:', err);
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
      const zoomLevel = radius === '5' ? 12 : radius === '10' ? 11 : 10; 
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
  
  // --- GROUP EVENTS BY LOCATION ---
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

      {/* User Location Marker */}
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.long]} icon={userIcon}>
          <Popup>You are here 🏠</Popup>
        </Marker>
      )}

      {/* RENDER GROUPED MARKERS */}
      {Object.entries(groupedEvents).map(([locKey, groupEvents]) => {
        const [lat, long] = locKey.split(',').map(Number);
        
        // Use the first event to decide the icon
        const firstEvent = groupEvents[0];
        const isStatic = firstEvent.type?.toLowerCase().includes('static');
        
        // Calculate distance
        let distDisplay = null;
        if (userLocation) {
          const km = getDistanceKm(userLocation.lat, userLocation.long, lat, long);
          distDisplay = (km * 0.621371).toFixed(1) + ' miles away';
        }

        const mapLink = `https://www.google.com/maps/search/?api=1&query=${lat},${long}`;

        return (
          <Marker 
            key={locKey} 
            position={[lat, long]}
            icon={isStatic ? plateIcon : truckIcon}
          >
            <Popup className="custom-popup" minWidth={280} maxWidth={300}>
               
               {/* SCROLLABLE CONTAINER FOR MULTIPLE EVENTS */}
               <div className="font-sans max-h-[300px] overflow-y-auto pr-1">
                  
                  {groupEvents.map((event, index) => {
                     const displayDate = formatDateForDisplay(event.date);
                     
                     // Generate dynamic Venue Display
                     const venueDisplay = event.village && !event.venueName.toLowerCase().includes(event.village.toLowerCase())
                       ? `${event.venueName} - ${event.village}`
                       : event.venueName;
                     
                     return (
                      <div key={event.id} className={index > 0 ? "mt-4 pt-4 border-t border-slate-200 border-dashed" : ""}>
                          {/* DATE HEADER */}
                          <div className="mb-2 pb-2 border-b border-slate-100 flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              {displayDate}
                            </span>
                          </div>

                          {/* EVENT CARD */}
                          <div className="flex items-start gap-3">
                              
                              {/* 1. ICON */}
                              <div className="bg-slate-50 h-10 w-10 rounded-full flex items-center justify-center text-xl shrink-0 border border-slate-100 mt-1">
                                {event.type?.toLowerCase().includes('static') ? '🍽️' : '🚚'}
                              </div>
                              
                              {/* 2. MAIN CONTENT */}
                              <div className="flex-1 min-w-0">
                                
                                {/* HEADER */}
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col gap-0.5 pr-2">
                                        <h3 className="font-bold text-slate-900 text-base leading-none !m-0 !p-0">
                                            {event.truckName}
                                        </h3>
                                        <p className="text-slate-600 text-xs font-medium leading-none !m-0 !p-0 mt-1">{venueDisplay}</p>
                                    </div>

                                    {/* CUISINE TYPE & DISTANCE */}
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        {event.type && event.type !== 'Mobile' && !event.type.toLowerCase().includes('static') && (
                                            <span className="text-[9px] font-bold text-orange-900 bg-orange-100 px-1.5 py-0.5 rounded border border-orange-200 shadow-sm whitespace-nowrap flex items-center gap-1">
                                                <span>{getCuisineEmoji(event.type)}</span>
                                                <span>{event.type}</span>
                                            </span>
                                        )}
                                        {distDisplay && (
                                            <span className="text-[9px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                                                {distDisplay}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* TIME & DIRECTIONS */}
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-[10px] font-bold text-orange-800 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100 whitespace-nowrap">
                                    {event.startTime} - {event.endTime}
                                  </span>
                                  
                                  <a href={mapLink} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline decoration-slate-300 underline-offset-2 transition-colors">
                                    Directions
                                  </a>
                                </div>

                                {/* MENU BUTTON */}
                                {event.menuUrl && (
                                  <div className="mt-2">
                                    <a 
                                      href={event.menuUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="inline-flex items-center justify-center gap-1.5 w-full text-[10px] font-bold text-white bg-slate-900 hover:bg-slate-800 py-1.5 rounded-md transition-colors shadow-sm"
                                    >
                                      <span>📸</span> Menu
                                    </a>
                                  </div>
                                )}

                                {/* FOOTER (SHARE / CAL) */}
                                <div className="flex gap-2 mt-3 justify-end">
                                   <button 
                                     onClick={() => handleShare(event)} 
                                     className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-orange-600 hover:text-white text-slate-600 text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors"
                                   >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                    Share
                                  </button>
                                  
                                  <div className="relative group">
                                     <button className="flex items-center justify-center gap-1 bg-slate-100 group-hover:bg-orange-600 group-hover:text-white text-slate-600 text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        Add to Cal
                                     </button>
                                     <select 
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onChange={(e) => handleCalendarSelect(e, event)}
                                        value=""
                                     >
                                        <option value="" disabled>Select Calendar...</option>
                                        <option value="google">Google Calendar (Web)</option>
                                        <option value="outlook_web">Outlook.com (Web)</option>
                                        <option value="ics">Apple / Mobile / Outlook</option>
                                     </select>
                                  </div>
                                </div>

                              </div>
                          </div>
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