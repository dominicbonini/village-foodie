import { useState, useEffect, useMemo } from 'react';
import { VillageEvent } from '@/types';
import { parseDateString, getDistanceKm } from '@/lib/utils';

const BASE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub';
const EVENTS_CSV_URL = `${BASE_CSV_URL}?gid=0&single=true&output=csv`;
const TRUCKS_CSV_URL = `${BASE_CSV_URL}?gid=28504033&single=true&output=csv`;
const VENUES_CSV_URL = `${BASE_CSV_URL}?gid=1190852063&single=true&output=csv`;

// Robust Helper to strip spaces, punctuation, and "The" for perfect matching
const cleanKey = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '').trim();
};

export function useVillageData(
  userLocation: { lat: number; long: number } | null,
  filters: { cuisine: string; date: string; distance: string }
) {
  const [events, setEvents] = useState<VillageEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [eventsRes, trucksRes, venuesRes] = await Promise.all([
            fetch(`${EVENTS_CSV_URL}&t=${Date.now()}`),
            fetch(`${TRUCKS_CSV_URL}&t=${Date.now()}`),
            fetch(`${VENUES_CSV_URL}&t=${Date.now()}`)
        ]);

        const [eventsCsvText, trucksCsvText, venuesCsvText] = await Promise.all([
            eventsRes.text(), trucksRes.text(), venuesRes.text()
        ]);

        // --- 1. MAP TRUCKS (Cuisine, URLs, Order Info) ---
        const truckDataMap = new Map<string, any>();
        trucksCsvText.split('\n').slice(1).forEach(row => {
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
            const key = cleanKey(cols[0] || '');
            if (key) {
                truckDataMap.set(key, { 
                    type: cols[1], orderInfo: cols[2], truckNotes: cols[3], websiteUrl: cols[4], menuUrl: cols[5] 
                });
            }
        });

        // --- 2. MAP VENUES (Village, Postcode, Lat, Long) ---
        const venuesList: any[] = [];
        venuesCsvText.split('\n').slice(1).forEach(row => {
            // FIXED REGEX TYPO HERE!
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
            const rawName = cols[0] || '';
            const key = cleanKey(rawName);
            if (key) {
                venuesList.push({
                    rawName: rawName,
                    cleanKey: key,
                    village: cols[1] || '',
                    postcode: cols[2] || '',
                    lat: parseFloat(cols[3]),
                    long: parseFloat(cols[4]),
                });
            }
        });

        // --- 3. MASTER JOIN ---
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parsedEvents: VillageEvent[] = eventsCsvText.split('\n').slice(1).map((row, index) => {
          const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
          
          const rawTruck = cols[3] || '';
          const rawVenue = cols[4] || '';

          // Look up Truck (Exact cleaned match)
          const truck = truckDataMap.get(cleanKey(rawTruck)) || {};
          
          // Look up Venue (Fuzzy Match: Finds if the names partially overlap)
          const eventVenueKey = cleanKey(rawVenue);
          let venue = venuesList.find(v => v.cleanKey === eventVenueKey);
          
          // Fallback if exact clean match fails
          if (!venue && eventVenueKey) {
             venue = venuesList.find(v => eventVenueKey.includes(v.cleanKey) || v.cleanKey.includes(eventVenueKey));
          }
          if (!venue) venue = {}; // Prevent crashes if completely missing

          return {
            id: `event-${index}`,
            date: cols[0] || '',
            startTime: cols[1] || '',
            endTime: cols[2] || '',
            truckName: rawTruck,
            venueName: rawVenue,
            village: venue.village || '',               
            postcode: venue.postcode || '',              
            venueLat: venue.lat, 
            venueLong: venue.long, 
            type: truck.type || 'Mobile',           
            websiteUrl: truck.websiteUrl || '',            
            menuUrl: truck.menuUrl || '',               
            orderInfo: truck.orderInfo || '', 
            notes: truck.truckNotes || '',
            eventNotes: cols[5] || '',             
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
        console.error('VillageData Sync Error:', error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- FILTERING & DISTANCE CALCULATION ---
  const { groupedEvents, mapEvents } = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const baseFiltered = events.filter(event => {
      if (filters.cuisine !== 'all') {
        const eventType = event.type?.toLowerCase() || 'mobile';
        if (eventType !== filters.cuisine.toLowerCase()) return false;
      }
      if (filters.date !== 'all') {
        const eventDate = parseDateString(event.date);
        if (!eventDate) return false;
        if (filters.date === 'today' && eventDate.getTime() !== today.getTime()) return false;
        if (filters.date === 'tomorrow') {
           const tomorrow = new Date(today);
           tomorrow.setDate(today.getDate() + 1);
           if (eventDate.getTime() !== tomorrow.getTime()) return false;
        }
        if (filters.date === 'next7') {
           const nextWeek = new Date(today);
           nextWeek.setDate(today.getDate() + 7);
           if (eventDate > nextWeek) return false;
        }
        if (filters.date === 'weekend' && ![0, 5, 6].includes(eventDate.getDay())) return false;
      }
      return true;
    });

    const listFiltered = baseFiltered.filter(event => {
      if (filters.distance !== 'all' && userLocation && event.venueLat && event.venueLong) {
        const distKm = getDistanceKm(userLocation.lat, userLocation.long, event.venueLat, event.venueLong);
        const distMiles = distKm * 0.621371;
        if (distMiles > parseInt(filters.distance)) return false;
      }
      return true;
    });

    const grouped = listFiltered.reduce((groups, event) => {
      const date = event.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
      return groups;
    }, {} as Record<string, VillageEvent[]>);

    return { groupedEvents: grouped, mapEvents: baseFiltered };
  }, [events, filters, userLocation]);

  const cuisineOptions = useMemo(() => {
    const types = new Set(events.map(e => e.type).filter(t => t && t !== 'Mobile' && !t.toLowerCase().includes('static')));
    return Array.from(types).sort();
  }, [events]);

  return { loading, groupedEvents, mapEvents, cuisineOptions };
}