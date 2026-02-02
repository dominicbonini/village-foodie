'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { VillageEvent } from '@/types'; // Using shared types

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

export default function Home() {
  const [events, setEvents] = useState<VillageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        
        const rows = csvText.split('\n').slice(1);
        
        const parsedEvents: VillageEvent[] = rows.map((row, index) => {
          // Robust CSV parsing
          const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(cell => 
            cell.replace(/^"|"$/g, '').trim()
          );

          // --- EXACT COLUMN MAPPING ---
          // 0: Date, 1: Start, 2: End, 3: Truck, 4: Venue
          // 5: Notes (Pre-order advised), 6: Source (Skip), 7: Lat, 8: Long, 9: Cuisine
          
          return {
            id: `event-${index}`,
            date: cols[0] || '',
            startTime: cols[1] || '',
            endTime: cols[2] || '',
            truckName: cols[3] || 'Unknown Truck',
            venueName: cols[4] || '',
            
            // LOGISTICS NOTE (Col F / Index 5)
            notes: cols[5] || '', 

            // CUISINE TYPE (Col J / Index 9)
            // If empty, default to 'Mobile'
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
  }, []);

  // Group events by Date
  const groupedEvents = events.reduce((groups, event) => {
    const date = event.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(event);
    return groups;
  }, {} as Record<string, VillageEvent[]>);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Village Foodie 🚚</h1>
          
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                view === 'list' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView('map')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                view === 'map' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Map
            </button>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 max-w-md mx-auto w-full relative">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading food...</div>
        ) : (
          <>
            {/* LIST VIEW */}
            {view === 'list' && (
              <div className="p-4 space-y-6">
                {Object.entries(groupedEvents).map(([date, dateEvents]) => (
                  <div key={date} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-3 ml-1">
                      {date}
                    </h2>
                    
                    <div className="space-y-3">
                      {dateEvents.map((event) => {
                         const isStatic = event.type?.toLowerCase().includes('static');
                         
                         // Fixed Google Maps Link
                         const mapLink = event.venueLat && event.venueLong 
                           ? `https://www.google.com/maps/search/?api=1&query=${event.venueLat},${event.venueLong}`
                           : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venueName)}`;

                         return (
                          <div key={event.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
                            
                            <div className="flex items-start gap-4">
                              {/* Icon based on Static vs Mobile */}
                              <div className="bg-slate-50 h-12 w-12 rounded-full flex items-center justify-center text-2xl shrink-0 border border-slate-100">
                                {isStatic ? '🍽️' : '🚚'}
                              </div>
                              
                              <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-slate-900 text-lg leading-tight">
                                      {event.truckName}
                                    </h3>
                                    {/* CUISINE BADGE (Col J) */}
                                    {event.type && event.type !== 'Mobile' && !isStatic && (
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-1 rounded-md ml-2 whitespace-nowrap">
                                            {event.type}
                                        </span>
                                    )}
                                </div>
                                
                                <p className="text-slate-600 text-sm mt-1">
                                  {event.venueName}
                                </p>

                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-xs font-bold text-orange-700 bg-orange-50 px-2 py-1 rounded-md">
                                    {event.startTime} - {event.endTime}
                                  </span>
                                  
                                  <a 
                                    href={mapLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-medium text-slate-500 hover:text-slate-800 underline decoration-slate-300 underline-offset-2"
                                  >
                                    Get Directions
                                  </a>
                                </div>

                                {/* NOTES SECTION (Col F) - Clean Style */}
                                {event.notes && (
                                  <div className="mt-2 flex items-start gap-1.5">
                                    <span className="text-[10px] leading-4 mt-0.5">ℹ️</span>
                                    <span className="text-xs text-slate-600 font-medium leading-relaxed italic">
                                      {event.notes}
                                    </span>
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
            {view === 'map' && (
               <div className="h-[calc(100vh-80px)] w-full relative z-0">
                 <MapView events={events} />
               </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}