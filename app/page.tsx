'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// --- 1. DYNAMIC MAP IMPORT (Prevents HTTP 500 Error) ---
const MapView = dynamic(() => import('@/components/MapView'), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-100 animate-pulse flex items-center justify-center text-slate-400">
      Loading Map...
    </div>
  )
});

// --- 2. INTERNAL TYPE DEFINITION (Prevents Import Errors) ---
interface VillageEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  truckName: string;
  venueName: string;
  type?: string;
  venueLat?: number;
  venueLong?: number;
}

// --- 3. YOUR GOOGLE SHEET LINK ---
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
        
        const rows = csvText.split('\n').slice(1); // Remove header
        
        const parsedEvents: VillageEvent[] = rows.map((row, index) => {
          // Robust CSV parsing
          const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(cell => 
            cell.replace(/^"|"$/g, '').trim()
          );

          // Mapping Columns 0-8
          return {
            id: `event-${index}`,
            date: cols[0] || '',
            startTime: cols[1] || '',
            endTime: cols[2] || '',
            truckName: cols[3] || 'Unknown Truck',
            venueName: cols[4] || '',
            type: cols[6] || 'Mobile',       
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

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Village Foodie 🚚</h1>
          
          {/* View Toggles */}
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
              <div className="p-4 space-y-4">
                {events.map((event) => (
                  <div key={event.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="bg-slate-100 h-12 w-12 rounded-full flex items-center justify-center text-2xl">
                      {event.type?.toLowerCase() === 'static' ? '🍽️' : '🚚'}
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-800">{event.truckName}</h2>
                      <p className="text-sm text-slate-600">
                        {event.date} • {event.venueName}
                      </p>
                      <p className="text-xs text-orange-600 font-semibold">
                        {event.startTime} - {event.endTime}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* MAP VIEW (Full Height Fix) */}
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