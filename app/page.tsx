'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import Link from 'next/link'; 
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
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}

function deg2rad(deg: number): number {
  return deg * (Math.PI/180);
}

// 2. Fetch coordinates from Postcode
async function getCoordsFromPostcode(postcode: string): Promise<{lat: number, long: number} | null> {
  try {
    const cleanPostcode = postcode.toUpperCase().replace(/\s/g, '');
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

// --- DATE HELPER ---
function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

// --- FORMAT DATE (Friday 6th February) ---
function formatFriendlyDate(dateStr: string): string {
  const date = parseDateString(dateStr);
  if (!date) return dateStr;

  const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const monthName = date.toLocaleDateString('en-GB', { month: 'long' });
  const dayNum = date.getDate();

  let suffix = 'th';
  if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = 'st';
  else if (dayNum === 2 || dayNum === 22) suffix = 'nd';
  else if (dayNum === 3 || dayNum === 23) suffix = 'rd';

  return `${dayName} ${dayNum}${suffix} ${monthName}`;
}

// ==========================================
// --- CALENDAR LOGIC ---
// ==========================================

function formatWebDate(dateStr: string, timeStr: string): string {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month}-${day}T${timeStr}:00`;
}

function formatICSDate(dateStr: string, timeStr: string): string {
  const [day, month, year] = dateStr.split('/');
  const cleanTime = timeStr.replace(':', '');
  return `${year}${month}${day}T${cleanTime}00`;
}

function getGoogleLink(event: VillageEvent): string {
  if (!event.date || !event.startTime || !event.endTime) return '#';
  const dates = `${formatICSDate(event.date, event.startTime)}/${formatICSDate(event.date, event.endTime)}`;
  const details = `Food Truck: ${event.truckName} at ${event.venueName}. ${event.notes || ''}`;
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.truckName + ' 🚚')}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(event.venueName)}`;
}

function getOutlookLink(event: VillageEvent): string {
  if (!event.date || !event.startTime || !event.endTime) return '#';
  const start = formatWebDate(event.date, event.startTime);
  const end = formatWebDate(event.date, event.endTime);
  const details = `Food Truck: ${event.truckName} at ${event.venueName}. ${event.notes || ''}`;
  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(event.truckName + ' 🚚')}&startdt=${start}&enddt=${end}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(event.venueName)}`;
}

function downloadICS(event: VillageEvent) {
  if (!event.date || !event.startTime || !event.endTime) return;
  const start = formatICSDate(event.date, event.startTime);
  const end = formatICSDate(event.date, event.endTime);
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  
  const icsContent = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Village Foodie//EN', 'BEGIN:VEVENT',
    `UID:${event.id}@villagefoodie.co.uk`, `DTSTAMP:${now}`, `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${event.truckName} 🚚`, `DESCRIPTION:${event.notes || 'Details at villagefoodie.co.uk'}`,
    `LOCATION:${event.venueName}`, 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${event.truckName.replace(/\s+/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function handleCalendarSelect(e: React.ChangeEvent<HTMLSelectElement>, event: VillageEvent) {
  const action = e.target.value;
  e.target.value = ''; 
  if (action === 'google') window.open(getGoogleLink(event), '_blank');
  else if (action === 'outlook_web') window.open(getOutlookLink(event), '_blank');
  else if (action === 'ics') downloadICS(event);
}

// --- SHARE LOGIC ---
async function handleShare(event: VillageEvent) {
  const shareUrl = 'https://village-foodie.vercel.app/'; 
  const shareText = `How about this for dinner?\n${event.truckName} is at ${event.venueName} on ${event.date}.\n\nFound it on Village Foodie 🚚:\n${shareUrl}`;

  const shareData = {
    title: `${event.truckName} at ${event.venueName}`,
    text: shareText,
  };

  try {
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
    } else {
      throw new Error('Native share not supported');
    }
  } catch (err) {
    try {
      await navigator.clipboard.writeText(shareText);
      alert('Event details copied to clipboard! 📋');
    } catch (clipboardErr) {
      alert('Could not share. Please copy the URL manually!');
    }
  }
}

export default function Home() {
  const [events, setEvents] = useState<VillageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');

  // --- FILTERS & USER STATE ---
  const [userPostcode, setUserPostcode] = useState('');
  const postcodeRef = useRef<HTMLInputElement>(null); 

  const [userLocation, setUserLocation] = useState<{lat: number, long: number} | null>(null);
  const [distanceFilter, setDistanceFilter] = useState<string>('10'); 
  const [cuisineFilter, setCuisineFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all'); 
  const [isPostcodeLoading, setIsPostcodeLoading] = useState(false);

  // --- 1. LOAD DATA ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${CSV_URL}&t=${Date.now()}`);
        const csvText = await response.text();
        const rows = csvText.split('\n').slice(1);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

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
            websiteUrl: cols[6] || '',  
            menuUrl: cols[7] || '',     
            venueLat: cols[8] ? parseFloat(cols[8]) : undefined,  
            venueLong: cols[9] ? parseFloat(cols[9]) : undefined, 
            type: cols[10] || 'Mobile',                           
          };
        })
        .filter(e => {
            if (!e.date) return false;
            const eventDate = parseDateString(e.date);
            return eventDate && eventDate >= today;
        })
        .sort((a, b) => {
            const dateA = parseDateString(a.date);
            const dateB = parseDateString(b.date);
            if (!dateA || !dateB) return 0;
            return dateA.getTime() - dateB.getTime();
        });

        setEvents(parsedEvents);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    fetchData();
    const savedPostcode = localStorage.getItem('user_postcode');
    if (savedPostcode) {
      setUserPostcode(savedPostcode);
      if (postcodeRef.current) {
        postcodeRef.current.value = savedPostcode;
      }
      handlePostcodeSearch(savedPostcode, false); 
    }
  }, []);

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
    } else if (showAlert) {
      alert("Could not find that postcode. Please try again.");
    }
  };

  const triggerSearch = () => {
    if (postcodeRef.current) {
      handlePostcodeSearch(postcodeRef.current.value);
    }
  };

  const openTallyPopup = () => {
    const currentCode = postcodeRef.current ? postcodeRef.current.value.toUpperCase() : userPostcode;
    const params = new URLSearchParams();
    if (currentCode) params.set('postcode', currentCode); 
    if (distanceFilter) params.set('distance', distanceFilter);
    const fallbackUrl = `https://tally.so/r/81xAKx?${params.toString()}`;

    if (typeof window !== 'undefined' && (window as any).Tally) {
      (window as any).Tally.openPopup('81xAKx', {
        layout: 'modal',
        width: 400,
        hiddenFields: {
          postcode: currentCode,
          distance: distanceFilter || '10',
        },
      });
    } else {
      window.open(fallbackUrl, '_blank');
    }
  };

  const mapEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    return events.filter(event => {
      if (cuisineFilter !== 'all') {
        const eventType = event.type?.toLowerCase() || 'mobile';
        if (eventType !== cuisineFilter.toLowerCase()) return false;
      }
      if (dateFilter !== 'all') {
        const eventDate = parseDateString(event.date);
        if (!eventDate) return false;
        if (dateFilter === 'today') {
           if (eventDate.getTime() !== today.getTime()) return false;
        } 
        else if (dateFilter === 'tomorrow') {
           const tomorrow = new Date(today);
           tomorrow.setDate(tomorrow.getDate() + 1);
           if (eventDate.getTime() !== tomorrow.getTime()) return false;
        } 
        else if (dateFilter === 'next7') {
           const nextWeek = new Date(today);
           nextWeek.setDate(today.getDate() + 7);
           if (eventDate > nextWeek) return false;
        }
        else if (dateFilter === 'weekend') {
           const dayOfWeek = eventDate.getDay(); 
           const currentDayOfWeek = today.getDay(); 
           const daysUntilSunday = (7 - currentDayOfWeek) % 7; 
           const nextSunday = new Date(today);
           nextSunday.setDate(today.getDate() + daysUntilSunday);
           if (![0, 5, 6].includes(dayOfWeek)) return false;
           if (eventDate > nextSunday) return false;
        }
      }
      return true;
    });
  }, [events, cuisineFilter, dateFilter]);

  const listEvents = useMemo(() => {
    return mapEvents.filter(event => {
      if (distanceFilter !== 'all' && userLocation && event.venueLat && event.venueLong) {
        const distKm = getDistanceKm(userLocation.lat, userLocation.long, event.venueLat, event.venueLong);
        const distMiles = distKm * 0.621371;
        if (distMiles > parseInt(distanceFilter)) return false;
      }
      return true;
    });
  }, [mapEvents, distanceFilter, userLocation]);

  const cuisineOptions = useMemo(() => {
    const types = new Set(events.map(e => e.type).filter(t => t && t !== 'Mobile' && !t.toLowerCase().includes('static')));
    return Array.from(types).sort();
  }, [events]);

  const groupedEvents = listEvents.reduce((groups, event) => {
    const date = event.date;
    if (!groups[date]) groups[date] = [];
    groups[date].push(event);
    return groups;
  }, {} as Record<string, VillageEvent[]>);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Script src="https://tally.so/widgets/embed.js" strategy="afterInteractive" />

      {/* --- HEADER --- */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold flex items-center gap-2">
              Village Foodie <span className="text-2xl">🚚</span>
            </h1>
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button onClick={() => setView('list')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}>List</button>
              <button onClick={() => setView('map')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}>Map</button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-2 md:items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
            <div className="flex gap-2 flex-1 w-full md:w-auto">
              <input 
                ref={postcodeRef}
                type="text" 
                placeholder="CB8 0AA" 
                className="w-full bg-slate-900 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:border-orange-500 focus:outline-none placeholder-slate-500 uppercase" 
                onKeyDown={(e) => e.key === 'Enter' && triggerSearch()} 
                autoComplete="postal-code"
              />
              <button onClick={triggerSearch} disabled={isPostcodeLoading} className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-2 rounded text-sm font-bold transition-colors disabled:opacity-50">{isPostcodeLoading ? '...' : 'Save'}</button>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
              <select className="bg-slate-900 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:outline-none" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                <option value="all">Any Day</option>
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="weekend">This Weekend</option>
                <option value="next7">Next 7 Days</option>
              </select>

              <select className="bg-slate-900 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:outline-none" value={cuisineFilter} onChange={(e) => setCuisineFilter(e.target.value)}>
                <option value="all">All Food</option>
                {cuisineOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              
              <select className="bg-slate-900 text-white text-sm px-3 py-2 rounded border border-slate-600 focus:outline-none" value={distanceFilter} onChange={(e) => setDistanceFilter(e.target.value)} disabled={!userLocation}>
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
        {/* LIST VIEW */}
        {view === 'list' && (
              <div className="p-4 space-y-3 pb-20">
                
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center shadow-sm">
                   <h2 className="text-orange-900 font-bold text-lg">Find your next meal 🍔</h2>
                   <p className="text-orange-800 text-sm mt-1">
                     Find food trucks and pop-ups visiting villages near you.
                   </p>
                </div>

                {Object.keys(groupedEvents).length === 0 && (
                   <div className="text-center p-8 bg-white rounded-xl border border-dashed border-slate-300 mt-4">
                      <p className="text-slate-600">No events found matching your filters.</p>
                      <button onClick={() => {setCuisineFilter('all'); setDistanceFilter('10'); setDateFilter('all');}} className="text-orange-600 text-sm font-bold mt-2 hover:underline">Clear Filters</button>
                   </div>
                )}

                {Object.entries(groupedEvents).map(([date, dateEvents]) => (
                  <div key={date} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-slate-600 font-bold text-xs uppercase tracking-wider mb-2 ml-1 mt-4">
                      {formatFriendlyDate(date)}
                    </h2>
                    <div className="space-y-3">
                      {dateEvents.map((event) => {
                         const isStatic = event.type?.toLowerCase().includes('static');
                         
                         let distDisplay = null;
                         if (userLocation && event.venueLat && event.venueLong) {
                           const km = getDistanceKm(userLocation.lat, userLocation.long, event.venueLat, event.venueLong);
                           distDisplay = (km * 0.621371).toFixed(1) + ' miles away';
                         }
                         
                         const mapLink = event.venueLat 
                            ? `https://www.google.com/maps/search/?api=1&query=${event.venueLat},${event.venueLong}` 
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venueName)}`;

                         return (
                          <div key={event.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                            <div className="flex items-start gap-3">
                              <div className="bg-slate-50 h-10 w-10 rounded-full flex items-center justify-center text-xl shrink-0 border border-slate-100 mt-0.5">
                                {isStatic ? '🍽️' : '🚚'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col pr-2">
                                        <h3 className="font-bold text-slate-900 text-base leading-tight">
                                          {event.websiteUrl ? (
                                            <a href={event.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:text-orange-700 hover:underline decoration-2 underline-offset-2 transition-colors">{event.truckName}</a>
                                          ) : (
                                            event.truckName
                                          )}
                                        </h3>
                                        <p className="text-slate-600 text-xs font-medium mt-0.5">{event.venueName}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        {event.type && event.type !== 'Mobile' && !isStatic && (
                                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap">{event.type}</span>
                                        )}
                                        {distDisplay && (
                                            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">{distDisplay}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-xs font-bold text-orange-800 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">{event.startTime} - {event.endTime}</span>
                                  <a href={mapLink} target="_blank" className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline decoration-slate-300 underline-offset-2 transition-colors">Get Directions</a>
                                </div>
                                {event.notes && (
                                  <div className="mt-2 flex items-start gap-1">
                                    <span className="text-[10px] leading-4 opacity-70">ℹ️</span>
                                    <span className="text-[10px] text-slate-600 font-medium italic">{event.notes}</span>
                                  </div>
                                )}
                                {event.menuUrl && (
                                  <div className="mt-2">
                                    <a href={event.menuUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 w-full text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 py-2 rounded-md transition-colors shadow-sm">
                                      <span>📸</span> View Menu
                                    </a>
                                  </div>
                                )}

                                {/* --- FIXED BUTTONS: NO BORDER, ROUNDED-MD, HOVER ON GROUP --- */}
                                <div className="flex gap-2 mt-3 justify-end">
                                  <button 
                                    onClick={() => handleShare(event)} 
                                    className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-orange-600 hover:text-white text-slate-600 text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                    Share
                                  </button>

                                  <div className="relative group">
                                     {/* Parent Group Hover triggers this button style */}
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
                  </div>
                ))}
              </div>
            )}
            {view === 'map' && (
               <div className="h-[calc(100vh-180px)] md:h-[calc(100vh-140px)] w-full relative z-0 md:rounded-xl md:overflow-hidden md:mt-4 md:border md:border-slate-200 shadow-sm">
                 <MapView events={mapEvents} userLocation={userLocation} radius={distanceFilter} />
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

      <div className="bg-slate-900 text-slate-300 p-6 text-center mt-auto pb-24">
        <h3 className="text-white font-bold text-lg mb-2">Never miss a slice 🍕</h3>
        <p className="text-sm mb-4">Get the village food schedule sent to your inbox every week.</p>
        
        <button 
          onClick={openTallyPopup}
          className="inline-block bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-6 rounded-full transition-colors mb-4"
        >
          Get the Schedule
        </button>

        <div className="text-[10px] text-slate-500 mt-4 flex flex-col gap-2 items-center">
          <p>No Spam (but maybe Pepperoni). Unsubscribe Anytime.</p>
          
          <div className="mt-2 text-center">
             <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">Contact Us</h4>
             <div className="flex gap-4 justify-center">
                <Link href="/contact?topic=General%20Enquiry" className="hover:text-slate-300 transition-colors underline decoration-slate-700 underline-offset-2">
                  General Enquiry
                </Link>
                <span className="text-slate-700">|</span>
                <Link href="/contact?topic=Add%20Business" className="hover:text-slate-300 transition-colors underline decoration-slate-700 underline-offset-2">
                  Add my Business
                </Link>
                <span className="text-slate-700">|</span>
                <Link href="/contact?topic=Report%20Issue" className="hover:text-slate-300 transition-colors underline decoration-slate-700 underline-offset-2">
                  Report Issue
                </Link>
             </div>
          </div>
          
          <p className="mt-4 opacity-50 max-w-xs text-center leading-relaxed">
             Disclaimer: Schedules are subject to change by vendors. We do our best, but we are not responsible for cancelled trucks or sold-out burgers. Always check the vendor's social media for last-minute updates.
          </p>
        </div>
      </div>
    </main>
  );
}