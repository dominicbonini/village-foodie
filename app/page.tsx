'use client';

import { useState, useRef, Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation'; 
import { usePostHog } from 'posthog-js/react'; 
import EventListCard from '@/components/EventListCard';
import Footer from '@/components/Footer';
import { useVillageData } from '@/hooks/useVillageData';
import { 
  getDistanceKm, 
  getCoordsFromPostcode, 
  formatFriendlyDate 
} from '@/lib/utils';

// --- DYNAMIC MAP IMPORT ---
const MapView = dynamic(() => import('@/components/MapView'), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-100 animate-pulse flex items-center justify-center text-slate-400">
      Loading Map...
    </div>
  )
});

// --- MAIN CONTENT COMPONENT ---
function VillageFoodieContent() {
  const posthog = usePostHog(); 
  const searchParams = useSearchParams();
  const [view, setView] = useState<'list' | 'map'>('list');
  
  // --- USER STATE ---
  const [userPostcode, setUserPostcode] = useState('');
  const [userLocation, setUserLocation] = useState<{lat: number, long: number} | null>(null);
  const [isPostcodeLoading, setIsPostcodeLoading] = useState(false);
  const postcodeRef = useRef<HTMLInputElement>(null); 

  // --- FILTERS ---
  const [filters, setFilters] = useState({
    date: 'all',
    cuisine: 'all',
    distance: '10'
  });

  // --- CUSTOM HOOK (Data Logic) ---
  const { loading, groupedEvents, mapEvents, cuisineOptions } = useVillageData(userLocation, filters);

  // --- EFFECT: HANDLE URL PARAMS & RESTORE STATE ---
  useEffect(() => {
    const urlPostcode = searchParams.get('postcode');
    const urlDistance = searchParams.get('distance');
    const savedPostcode = localStorage.getItem('user_postcode');
    const targetPostcode = urlPostcode || savedPostcode;

    if (targetPostcode) {
      setUserPostcode(targetPostcode);
      if (postcodeRef.current) postcodeRef.current.value = targetPostcode;
      handlePostcodeSearch(targetPostcode, false); 
    }
    if (urlDistance) setFilters(prev => ({ ...prev, distance: urlDistance }));
  }, [searchParams]);

  // --- EFFECT: SCROLL TO TRUCK AFTER DATA LOADS ---
  useEffect(() => {
    if (!loading && typeof window !== 'undefined' && window.location.hash) {
      setTimeout(() => {
        const id = window.location.hash.substring(1);
        const element = document.getElementById(id);
        
        if (element) {
          const isMobile = window.innerWidth < 768;
          const exactHeaderHeight = isMobile ? 204 : 190; 
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.scrollY - exactHeaderHeight;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'auto'
          });
        }
      }, 100);
    }
  }, [loading, groupedEvents]);

  // --- HANDLERS ---
  const handlePostcodeSearch = async (code: string, showAlert = true) => {
    if (!code) return;
    setIsPostcodeLoading(true);
    const coords = await getCoordsFromPostcode(code);
    setIsPostcodeLoading(false);
    
    if (coords) {
      setUserLocation(coords);
      const cleanCode = code.toUpperCase();
      localStorage.setItem('user_postcode', cleanCode);
      setUserPostcode(cleanCode); 
      
      if (posthog) {
        posthog.capture('searched_postcode', {
          postcode: cleanCode,
          distance_filter: filters.distance
        });
      }

    } else if (showAlert) {
      alert("Could not find that postcode. Please try again.");
    }
  };

  const openTallyPopup = () => {
    const currentCode = postcodeRef.current ? postcodeRef.current.value.toUpperCase() : userPostcode;
    const params = new URLSearchParams();
    
    if (currentCode) params.set('postcode', currentCode); 
    
    if (filters.distance) params.set('distance', `${filters.distance} Miles`);

    const fallbackUrl = `https://tally.so/r/81xAKx?${params.toString()}`;

    if (posthog) {
      posthog.capture('clicked_newsletter_subscribe', {
        postcode: currentCode
      });
    }

    if (typeof window !== 'undefined' && (window as any).Tally) {
      (window as any).Tally.openPopup('81xAKx', {
        layout: 'modal',
        width: 400,
        hiddenFields: { 
          postcode: currentCode, 
          distance: `${filters.distance || '10'} Miles` 
        },
      });
    } else {
      window.open(fallbackUrl, '_blank');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Script src="https://tally.so/widgets/embed.js" strategy="afterInteractive" />

      {/* --- HEADER --- */}
      <header className="bg-slate-900 text-white py-3 px-4 md:p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-4xl mx-auto flex flex-col gap-3 md:gap-4">
          <div className="flex justify-between items-center">
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
              Village Foodie <span className="text-xl md:text-2xl">🚚</span>
            </h1>
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button onClick={() => { setView('list'); window.scrollTo(0, 0); }} className={`px-3 py-1 md:px-4 md:py-1.5 rounded-md text-sm font-medium transition-all ${view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}>List</button>
              <button onClick={() => { setView('map'); window.scrollTo(0, 0); }} className={`px-3 py-1 md:px-4 md:py-1.5 rounded-md text-sm font-medium transition-all ${view === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}>Map</button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-2 md:items-center bg-slate-800 p-2 md:p-3 rounded-lg border border-slate-700">
            <div className="flex gap-2 flex-1 w-full md:w-auto">
              <input 
                ref={postcodeRef} 
                type="text" 
                placeholder="CB8 0AA" 
                className="w-full bg-slate-900 text-white text-base md:text-sm px-3 py-1.5 md:py-2 rounded border border-slate-600 focus:border-orange-500 focus:outline-none placeholder-slate-500 uppercase" 
                onKeyDown={(e) => e.key === 'Enter' && handlePostcodeSearch(postcodeRef.current?.value || '')} 
                autoComplete="postal-code" 
              />
              <button onClick={() => handlePostcodeSearch(postcodeRef.current?.value || '')} disabled={isPostcodeLoading} className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 md:py-2 rounded text-base md:text-sm font-bold transition-colors disabled:opacity-50">{isPostcodeLoading ? '...' : 'Save'}</button>
            </div>
            
            <div className="grid grid-cols-3 md:flex gap-1.5 md:gap-2 w-full md:w-auto">
              <select 
                className="w-full md:w-auto min-w-0 bg-slate-900 text-white text-base md:text-sm px-1.5 sm:px-3 py-1.5 md:py-2 rounded border border-slate-600 focus:outline-none truncate" 
                value={filters.date} 
                onChange={(e) => setFilters({...filters, date: e.target.value})}
              >
                <option value="all">Any Day</option>
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="weekend">This Weekend</option>

              </select>

              <select 
                className="w-full md:w-auto min-w-0 bg-slate-900 text-white text-base md:text-sm px-1.5 sm:px-3 py-1.5 md:py-2 rounded border border-slate-600 focus:outline-none truncate" 
                value={filters.cuisine} 
                onChange={(e) => setFilters({...filters, cuisine: e.target.value})}
              >
                <option value="all">All Food</option>
                {cuisineOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              
              <select 
                className="w-full md:w-auto min-w-0 bg-slate-900 text-white text-base md:text-sm px-1.5 sm:px-3 py-1.5 md:py-2 rounded border border-slate-600 focus:outline-none truncate" 
                value={filters.distance} 
                onChange={(e) => setFilters({...filters, distance: e.target.value})} 
                disabled={!userLocation}
              >
                <option value="10">10 Miles</option>
                <option value="20">20 Miles</option>
                <option value="30">30 Miles</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* --- CONTENT AREA --- */}
      <div className={`flex-1 w-full mx-auto relative ${view === 'list' ? 'max-w-md' : 'max-w-full md:max-w-6xl'}`}>
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading delicious events...</div>
        ) : (
          <>
            {view === 'list' && (
              <div className="p-4 space-y-3 pb-20">
                <div className="pt-5 pb-3 px-4 text-center">
                   <h2 className="text-slate-800 font-extrabold text-2xl tracking-tight">Find your next meal 🍔</h2>
                   <p className="text-slate-600 text-sm mt-1.5 font-medium">Find food trucks and pop-ups visiting villages near you.</p>
                </div>
                {Object.keys(groupedEvents).length === 0 && (
                   <div className="text-center p-8 bg-white rounded-xl border border-dashed border-slate-300 mt-4">
                      <p className="text-slate-600">No events found matching your filters.</p>
                      <button onClick={() => setFilters({date: 'all', cuisine: 'all', distance: '10'})} className="text-orange-600 text-sm font-bold mt-2 hover:underline">Clear Filters</button>
                   </div>
                )}

              {Object.entries(groupedEvents).map(([date, dateEvents]) => {
                  const now = new Date();
                  console.log(`RAW DATA FOR ${date}:`, dateEvents);
                  const isToday = new Date(date).toDateString() === now.toDateString();

                  // 👇 FIXED: This helper merges Column A (Date) + Column B/C (Time) perfectly 👇
                  const getActualDate = (timeVal: any) => {
                     if (!timeVal) return null;
                     
                     // Force whatever Google sent us into a string so we can hunt for the HH:MM
                     const timeString = String(timeVal);
                     const match = timeString.match(/(\d{1,2}):(\d{2})/);
                     
                     if (match) {
                        const baseDate = new Date(date); // Grab the actual day of the event
                        let hours = parseInt(match[1], 10);
                        const minutes = parseInt(match[2], 10);
                        
                        // Handle 12-hour AM/PM formatting just in case
                        if (timeString.toLowerCase().includes('pm') && hours < 12) hours += 12;
                        if (timeString.toLowerCase().includes('am') && hours === 12) hours = 0;
                        
                        // Smash them together!
                        baseDate.setHours(hours, minutes, 0, 0);
                        return baseDate;
                     }
                     return null;
                  };

                  // Check every possible variation of how the Google Sheet columns might be named
                  const getStartTime = (event: any) => event.TimeStart || event.StartTime || event['Start Time'] || event.startTime || event.start;
                  const getEndTime = (event: any) => event.TimeEnd || event.EndTime || event['Time End'] || event.endTime || event.end;

                  // 1. FILTER: Remove finished events ONLY if the event is happening today
                  const activeEvents = dateEvents.filter(event => {
                    if (!isToday) return true; 

                    const eventEnd = getEndTime(event);
                    if (!eventEnd) return true; 
                    
                    const endTime = getActualDate(eventEnd);
                    if (!endTime) return true; 
                    
                    return endTime > now;
                  });

                  if (activeEvents.length === 0) return null;

                  // 2. SORT: Chronological first, Distance second
                  const sortedEvents = activeEvents.sort((a, b) => {
                    const aStartVal = getStartTime(a);
                    const bStartVal = getStartTime(b);

                    const dateA = getActualDate(aStartVal);
                    const dateB = getActualDate(bStartVal);

                    const isAValid = dateA !== null;
                    const isBValid = dateB !== null;

                    // Push trucks with NO valid times (like "Contact Venue") to the bottom
                    if (isAValid && !isBValid) return -1;
                    if (!isAValid && isBValid) return 1;

                    // If BOTH have valid times, sort chronologically
                    if (isAValid && isBValid && dateA.getTime() !== dateB.getTime()) {
                      return dateA.getTime() - dateB.getTime();
                    }

                    // Secondary Sort: If both have identical times OR both say "TBC", sort by distance
                    if (!userLocation || !a.venueLat || !a.venueLong || !b.venueLat || !b.venueLong) return 0;
                    const distA = getDistanceKm(userLocation.lat, userLocation.long, a.venueLat, a.venueLong);
                    const distB = getDistanceKm(userLocation.lat, userLocation.long, b.venueLat, b.venueLong);
                    return distA - distB;
                  });

                  return (
                    <div key={date} className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-1 md:pb-2">
                        <div className="sticky top-[156px] md:top-[140px] z-30 bg-slate-50 pt-5 md:pt-6 pb-1">
                            <h2 className="text-slate-900 font-black text-sm uppercase tracking-widest">
                               {formatFriendlyDate(date)}
                            </h2>
                        </div>
                        <div className="space-y-3">
                        {sortedEvents.map((event) => {
                            let distanceMiles: number | null = null;
                            if (userLocation && event.venueLat && event.venueLong) {
                                const km = getDistanceKm(userLocation.lat, userLocation.long, event.venueLat, event.venueLong);
                                distanceMiles = km * 0.621371;
                            }
                            return (
                                <EventListCard 
                                    key={event.id} 
                                    event={event} 
                                    distanceMiles={distanceMiles} 
                                />
                            );
                        })}
                        </div>
                    </div>
                  );
                })}</div>
            )}
            {view === 'map' && (
               <div className="h-[calc(100vh-180px)] md:h-[calc(100vh-140px)] w-full relative z-0 md:rounded-xl md:overflow-hidden md:mt-4 md:border md:border-slate-200 shadow-sm">
                 <MapView events={mapEvents} userLocation={userLocation} radius={filters.distance} />
               </div>
            )}
          </>
        )}
      </div>

      <div className="fixed bottom-6 left-0 right-0 flex justify-center z-40 pointer-events-none">
        <button 
          onClick={openTallyPopup}
          className="pointer-events-auto bg-slate-900 text-white font-bold py-3 px-6 rounded-full shadow-lg border border-slate-700 flex items-center gap-2 hover:bg-slate-800 transition-transform hover:scale-105 active:scale-95"
        >
          <span>Get Weekly Schedule 🍕</span>
        </button>
      </div>

      <Footer onOpenTally={openTallyPopup} />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">Loading...</div>}>
      <VillageFoodieContent />
    </Suspense>
  );
}