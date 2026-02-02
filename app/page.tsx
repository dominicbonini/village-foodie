'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { VillageEvent } from '@/types';

// --- DYNAMIC MAP IMPORT ---
const MapView = dynamic(() => import('@/components/MapView'), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-100 animate-pulse flex items-center justify-center text-slate-400">
      Loading Map...
    </div>
  )
});

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=0&single=true&output=csv';

// --- GEOGRAPHY UTILITIES ---

// 1. Calculate distance between two coordinates (Haversine formula)
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance in km
}

function deg2rad(deg: number): number {
  return deg * (Math.PI/180);
}

// 2. Fetch coordinates from Postcode (using free UK API)
async function getCoordsFromPostcode(postcode: string): Promise<{lat: number, long: number} | null> {
  try {
    const cleanPostcode = postcode.replace(/\s/g, '');
    const res = await fetch(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
    const data = await res.json();
    if (data.status === 200) {
      return { lat: data.result.latitude, long: data.result.longitude };
    }
    return null;
  } catch (err) {
    return null;
  }
}

export default function Home() {
  const [events, setEvents] = useState<VillageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');

  // --- FILTERS & USER STATE ---
  const [userPostcode, setUserPostcode] = useState('');
  const [userLocation, setUserLocation] = useState<{lat: number, long: number} | null>(null);
  const [distanceFilter, setDistanceFilter] = useState<string>('all'); // '5', '10', '20', 'all'
  const [cuisineFilter, setCuisineFilter] = useState<string>('all');
  const [isPostcodeLoading, setIsPostcodeLoading] = useState(false);

  // --- 1. LOAD DATA ---
  useEffect(() => {
    // A. Load Events
    const fetchData = async () => {
      try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        const rows = csvText.split('\n').slice(1);
        
        const parsedEvents: VillageEvent[] = rows.map((row, index) => {
          const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(cell => 
            cell.replace(/^"|"$/g, '').trim()
          );

          return {
            id: `event-${index}`,
            date: cols[0] || '',
            startTime: cols[1] || '',
            endTime: cols[2] || '',
            truckName: cols[3] || 'Unknown Truck',
            venueName: cols[4] || '',
            notes: cols[5] || '', 
            type: cols[9] || 'Mobile',       
            venueLat: cols[7] ? parseFloat(cols[7]) : undefined,
            venueLong: cols[8] ? parseFloat(cols[8]) : undefined,
          };
        }).filter(e => e.date); 

        setEvents(parsedEvents);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    fetchData();

    // B. Load Saved Postcode
    const savedPostcode = localStorage.getItem('user_postcode');
    if (savedPostcode) {
      setUserPostcode(savedPostcode);
      handlePostcodeSearch(savedPostcode, false); // false = don't alert on error
    }
  }, []);

  // --- 2. HANDLE POSTCODE SEARCH ---
  const handlePostcodeSearch = async (code: string, showAlert = true) => {
    if (!code) return;
    setIsPostcodeLoading(true);
    const coords = await getCoordsFromPostcode(code);
    setIsPostcodeLoading(false);

    if (coords) {
      setUserLocation(coords);
      localStorage.setItem('user_postcode', code);
    } else if (showAlert) {
      alert("Could not find that postcode. Please try again.");
    }
  };

  // --- 3. FILTER LOGIC (The Brain) ---
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // A. Cuisine Filter
      if (cuisineFilter !== 'all') {
        const eventType = event.type?.toLowerCase() || 'mobile';
        if (eventType !== cuisineFilter.toLowerCase()) return false;
      }

      // B. Distance Filter
      if (distanceFilter !== 'all' && userLocation && event.venueLat && event.venueLong) {
        const distKm = getDistanceKm(userLocation.lat, userLocation.long, event.venueLat, event.venueLong);
        const distMiles = distKm * 0.621371;
        if (distMiles > parseInt(distanceFilter)) return false;
      }

      return true;
    });
  }, [events, cuisineFilter, distanceFilter, userLocation]);

  // Extract unique Cuisines for the dropdown
  const cuisineOptions = useMemo(() => {
    const types = new Set(events.map(e => e.type).filter(t => t && t !== 'Mobile' && !t.toLowerCase().includes('static')));
    return Array.from(types).sort();
  }, [events]);

  // Group filtered events by Date
  const groupedEvents = filteredEvents.reduce((groups, event) => {
    const date = event.date;
    if (!groups[date]) groups[date] = [];
    groups[date].push(event);
    return groups;
  }, {} as Record<string, VillageEvent[]>);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* --- HEADER --- */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          
          {/* Top Row: Title & View Toggle */}
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold flex items-center gap-2">
              Village Foodie <span className="text-2xl">🚚</span>
            </h1>
            
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setView('list')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setView('map')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  view === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Map
              </button>
            </div>
          </div>

          {/* Bottom Row: Filters & Postcode */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
            
            {/* Postcode Input */}
            <div className="flex gap-2 flex-1">
              <input 
                type="text" 
                placeholder="Enter Postcode (e.g. CB8 0AA)" 
                className="w-full bg-slate-900 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:border-orange-500 focus:outline-none placeholder-slate-500 uppercase"
                value={userPostcode}
                onChange={(e) => setUserPostcode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handlePostcodeSearch(userPostcode)}
              />
              <button 
                onClick={() => handlePostcodeSearch(userPostcode)}
                disabled={isPostcodeLoading}
                className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-2 rounded text-sm font-bold transition-colors disabled:opacity-50"
              >
                {isPostcodeLoading ? '...' : 'Save'}
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <select 
                className="bg-slate-900 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:outline-none"
                value={cuisineFilter}
                onChange={(e) => setCuisineFilter(e.target.value)}
              >
                <option value="all">All Food</option>
                {cuisineOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <select 
                className="bg-slate-900 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:outline-none"
                value={distanceFilter}
                onChange={(e) => setDistanceFilter(e.target.value)}
                disabled={!userLocation} // Disable if no postcode set
              >
                <option value="all">Any Distance</option>
                <option value="5">Within 5 miles</option>
                <option value="10">Within 10 miles</option>
                <option value="20">Within 20 miles</option>
              </select>
            </div>
          </div>

        </div>
      </header>

      {/* --- CONTENT AREA --- */}
      {/* Note: 'md:max-w-6xl' allows the map to be wide on desktop, while list stays readable */}
      <div className={`flex-1 w-full mx-auto relative ${view === 'list' ? 'max-w-md' : 'max-w-full md:max-w-6xl'}`}>
        
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading delicious events...</div>
        ) : (
          <>
            {/* LIST VIEW */}
            {view === 'list' && (
              <div className="p-4 space-y-6 pb-20">
                {Object.keys(groupedEvents).length === 0 && (
                   <div className="text-center p-8 bg-white rounded-xl border border-dashed border-slate-300">
                      <p className="text-slate-500">No events found matching your filters.</p>
                      <button onClick={() => {setCuisineFilter('all'); setDistanceFilter('all');}} className="text-orange-600 text-sm font-bold mt-2 hover:underline">Clear Filters</button>
                   </div>
                )}

                {Object.entries(groupedEvents).map(([date, dateEvents]) => (
                  <div key={date} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-3 ml-1">
                      {date}
                    </h2>
                    <div className="space-y-3">
                      {dateEvents.map((event) => {
                         const isStatic = event.type?.toLowerCase().includes('static');
                         
                         // Calculate distance for display
                         let distDisplay = null;
                         if (userLocation && event.venueLat && event.venueLong) {
                           const km = getDistanceKm(userLocation.lat, userLocation.long, event.venueLat, event.venueLong);
                           distDisplay = (km * 0.621371).toFixed(1) + ' miles';
                         }

                         const mapLink = event.venueLat && event.venueLong 
                           ? `https://www.google.com/maps/search/?api=1&query=${event.venueLat},${event.venueLong}`
                           : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venueName)}`;

                         return (
                          <div key={event.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
                            <div className="flex items-start gap-4">
                              <div className="bg-slate-50 h-12 w-12 rounded-full flex items-center justify-center text-2xl shrink-0 border border-slate-100">
                                {isStatic ? '🍽️' : '🚚'}
                              </div>
                              <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-slate-900 text-lg leading-tight">{event.truckName}</h3>
                                    {event.type && event.type !== 'Mobile' && !isStatic && (
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-1 rounded-md ml-2 whitespace-nowrap">
                                            {event.type}
                                        </span>
                                    )}
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                  <p className="text-slate-600 text-sm">{event.venueName}</p>
                                  {distDisplay && (
                                    <span className="text-xs font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                      {distDisplay} away
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-xs font-bold text-orange-700 bg-orange-50 px-2 py-1 rounded-md">
                                    {event.startTime} - {event.endTime}
                                  </span>
                                  <a href={mapLink} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-slate-500 hover:text-slate-800 underline decoration-slate-300 underline-offset-2">
                                    Get Directions
                                  </a>
                                </div>
                                {event.notes && (
                                  <div className="mt-2 flex items-start gap-1.5">
                                    <span className="text-[10px] leading-4 mt-0.5">ℹ️</span>
                                    <span className="text-xs text-slate-600 font-medium leading-relaxed italic">{event.notes}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* MAP VIEW */}
            {/* Height Logic: Mobile = Calc(100vh-Header), Desktop = 80vh and wider container */}
            {view === 'map' && (
               <div className="h-[calc(100vh-180px)] md:h-[calc(100vh-140px)] w-full relative z-0 md:rounded-xl md:overflow-hidden md:mt-4 md:border md:border-slate-200 shadow-sm">
                 <MapView events={filteredEvents} />
               </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}