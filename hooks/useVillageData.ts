import { useState, useEffect, useMemo } from 'react';
import { VillageEvent } from '@/types';
import { parseDateString, getDistanceKm } from '@/lib/utils';

const BASE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub';
const EVENTS_CSV_URL = `${BASE_CSV_URL}?gid=0&single=true&output=csv`;
const TRUCKS_CSV_URL = `${BASE_CSV_URL}?gid=28504033&single=true&output=csv`;
const VENUES_CSV_URL = `${BASE_CSV_URL}?gid=1190852063&single=true&output=csv`;

// 🧠 ULTIMATE CLEANER
const cleanKey = (str: string) => {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/^the\s+/, '')       
        .replace(/&/g, 'and')         
        .replace(/['’]/g, '')         
        .replace(/[^a-z0-9]/g, '')    
        .trim();
};

// 🤝 AGGRESSIVE FUZZY MATCHER (Kept for fallback purposes)
const isMatch = (key1: string, key2: string) => {
    if (!key1 || !key2) return false;
    if (key1 === key2) return true;
    const k1 = key1.replace(/street/g, 'st');
    const k2 = key2.replace(/street/g, 'st');
    return k1.includes(k2) || k2.includes(k1);
};

// 🛡️ TRUE CSV PARSER
function parseCSV(text: string) {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
            currentCell += '"'; 
            i++; 
        } else if (char === '"') {
            inQuotes = !inQuotes; 
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell.trim());
            currentCell = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++; 
            currentRow.push(currentCell.trim());
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
    }
    return rows.map(row => row.map(c => c.replace(/^"|"$/g, '').trim()));
}

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

        // --- 1. MAP TRUCKS ---
        const trucksList: any[] = [];
        const truckRows = parseCSV(trucksCsvText).slice(1);
        truckRows.forEach(cols => {
            if (!cols[0]) return;
            const rawName = cols[0] || '';
            const key = cleanKey(rawName);
            if (key) {
                trucksList.push({
                    rawName: rawName,
                    cleanKey: key,
                    type: cols[1], 
                    phoneNumber: cols[2],     
                    orderUrl: cols[3],        
                    acceptedMethods: cols[4], 
                    truckNotes: cols[5],      
                    websiteUrl: cols[6],      
                    menuUrl: cols[7]          
                });
            }
        });

        // --- 2. MAP VENUES ---
        const venuesList: any[] = [];
        const venueRows = parseCSV(venuesCsvText).slice(1);
        venueRows.forEach(cols => {
            if (!cols[0]) return;
            const rawName = cols[0] || '';
            const key = cleanKey(rawName);
            if (key) {
                venuesList.push({
                    rawName: rawName,
                    cleanKey: key,
                    village: cols[1] || '',
                    postcode: cols[2] || '',
                    lat: parseFloat(cols[3] || '0'),
                    long: parseFloat(cols[4] || '0'),
                });
            }
        });

        // --- 3. MASTER JOIN ---
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parsedEvents: VillageEvent[] = parseCSV(eventsCsvText)
          .slice(1)
          .filter(cols => cols.length > 0 && !!cols[0])
          .map((cols, index) => {
            const rawDate = cols[0] || '';
            const rawTruck = cols[3] || '';
            const rawVenue = cols[4] || '';

            const eventTruckKey = cleanKey(rawTruck);
            // Try exact truck match first, fallback to fuzzy
            let truck = trucksList.find(t => t.cleanKey === eventTruckKey) || 
                        trucksList.find(t => isMatch(t.cleanKey, eventTruckKey)) || {};

            const eventVenueKey = cleanKey(rawVenue);
            
            // 👇 THE FIX: STRICT VENUE MATCHING 👇
            // 1. Try Exact Match First (Highly accurate because scraper standardizes names)
            let venue = venuesList.find(v => v.cleanKey === eventVenueKey);

            // 2. Safer Fallback (Only if exact match fails)
            if (!venue) {
                venue = venuesList.find(v => {
                    const fuzzyMatch = isMatch(v.cleanKey, eventVenueKey);
                    // Anti-Hijacking Safeguard: Block short words like "gate" from using fuzzy match
                    if (fuzzyMatch && eventVenueKey.length <= 5) {
                        return false; 
                    }
                    return fuzzyMatch;
                }) || {}; 
            }

            const eventObj: VillageEvent = {
              id: `event-${index}`,
              date: rawDate,
              startTime: cols[1] || '',
              endTime: cols[2] || '',
              truckName: rawTruck,
              venueName: rawVenue,
              village: venue.village || '',               
              postcode: venue.postcode || '',              
              venueLat: venue.lat, 
              venueLong: venue.long, 
              type: truck.type || 'Mobile',           
              
              phoneNumber: truck.phoneNumber || '',
              orderUrl: truck.orderUrl || '',
              acceptedMethods: truck.acceptedMethods || '',
              
              websiteUrl: truck.websiteUrl || '',            
              menuUrl: truck.menuUrl || '',               
              notes: truck.truckNotes || '',
              eventNotes: cols[5] || '',             
            };

            return eventObj;
          })
          .filter(e => {
              if (!e.date) return false;
              const eventDate = parseDateString(e.date);
              return eventDate ? eventDate >= today : false; 
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

  // --- FILTERING ---
  const { groupedEvents, mapEvents } = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const baseFiltered = events.filter(event => {
      if (filters.cuisine !== 'all') {
        const eventTypes = event.type ? event.type.toLowerCase().split(',').map(t => t.trim()) : ['mobile'];
        if (!eventTypes.includes(filters.cuisine.toLowerCase())) return false;
      }
      
      if (filters.date !== 'all') {
        const eventDate = parseDateString(event.date);
        if (!eventDate) return false;
        
        if (filters.date === 'today' && eventDate.getTime() !== today.getTime()) return false;
        
        if (filters.date === 'tomorrow') {
           const tomorrow = new Date(today);
           tomorrow.setDate(tomorrow.getDate() + 1);
           if (eventDate.getTime() !== tomorrow.getTime()) return false;
        }
        
        if (filters.date === 'next7') {
           const nextWeek = new Date(today);
           nextWeek.setDate(today.getDate() + 7);
           if (eventDate > nextWeek) return false;
        }
        
        if (filters.date === 'weekend') {
           const dayOfWeek = eventDate.getDay(); 
           if (![0, 5, 6].includes(dayOfWeek)) return false;
           
           const nextSunday = new Date(today);
           nextSunday.setDate(today.getDate() + ((7 - today.getDay()) % 7));
           nextSunday.setHours(23, 59, 59, 999);
           
           if (eventDate.getTime() > nextSunday.getTime()) return false;
        }
      }
      return true;
    });

    const listFiltered = baseFiltered.filter(event => {
      if (filters.distance !== 'all' && userLocation) {
        if (!event.venueLat || !event.venueLong) return false; 
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
    const types = new Set<string>();
    
    events.forEach(e => {
        if (e.type && e.type !== 'Mobile' && !e.type.toLowerCase().includes('static')) {
            const splitTypes = e.type.split(',').map(t => t.trim());
            splitTypes.forEach(t => {
                if (t) types.add(t);
            });
        }
    });
    
    return Array.from(types).sort();
  }, [events]);

  return { loading, groupedEvents, mapEvents, cuisineOptions };
}