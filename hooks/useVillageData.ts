import { useState, useEffect, useMemo } from 'react';
import { VillageEvent } from '@/types';
import { parseDateString, getDistanceKm, createSlug, getVenueSlug } from '@/lib/utils'; // 👈 ADDED getVenueSlug

const BASE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub';
const EVENTS_CSV_URL = `${BASE_CSV_URL}?gid=0&single=true&output=csv`;
const TRUCKS_CSV_URL = `${BASE_CSV_URL}?gid=28504033&single=true&output=csv`;
const VENUES_CSV_URL = `${BASE_CSV_URL}?gid=1190852063&single=true&output=csv`;

// 🤝 AGGRESSIVE FUZZY MATCHER
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
    let isMounted = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const fetchData = async () => {
      try {
        const fetchOpts = { 
            signal: controller.signal, 
            cache: 'no-store' as RequestCache 
        };

        const [eventsRes, trucksRes, venuesRes] = await Promise.all([
            fetch(`${EVENTS_CSV_URL}&t=${Date.now()}`, fetchOpts),
            fetch(`${TRUCKS_CSV_URL}&t=${Date.now()}`, fetchOpts),
            fetch(`${VENUES_CSV_URL}&t=${Date.now()}`, fetchOpts)
        ]);

        clearTimeout(timeoutId);

        if (!eventsRes.ok || !trucksRes.ok || !venuesRes.ok) {
            throw new Error("Failed to fetch data from source.");
        }

        const [eventsCsvText, trucksCsvText, venuesCsvText] = await Promise.all([
            eventsRes.text(), trucksRes.text(), venuesRes.text()
        ]);

        // --- 1. MAP TRUCKS ---
        const trucksList: any[] = [];
        const truckRows = parseCSV(trucksCsvText).slice(1);
        truckRows.forEach(cols => {
            if (!cols[0]) return;
            const rawName = cols[0] || '';
            const key = createSlug(rawName); 
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
                    menuUrl: cols[7],
                    logoUrl: cols[9] || ''          
                });
            }
        });

        // --- 2. MAP VENUES ---
        const venuesList: any[] = [];
        const venueRows = parseCSV(venuesCsvText).slice(1);
        venueRows.forEach(cols => {
            if (!cols[0]) return;
            const rawName = cols[0] || '';
            const village = cols[1] || '';
            
            // 👇 THE FIX: Create a highly specific unique ID using the village name
            const key = getVenueSlug(rawName, village); 
            
            if (key) {
                venuesList.push({
                    rawName: rawName,
                    cleanKey: key, // Now equals e.g. "the-plough-shepreth"
                    village: village,
                    postcode: cols[2] || '',
                    lat: parseFloat(cols[3] || '0'),
                    long: parseFloat(cols[4] || '0'),
                    venuePhone: cols[6] || '',
                    venueWebsite: cols[8] || '', 
                    venuePhoto: cols[12] || ''   
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
            const rawEventVillage = cols[5] || ''; 

            const eventTruckKey = createSlug(rawTruck);
            let truck = trucksList.find(t => t.cleanKey === eventTruckKey) || 
                        trucksList.find(t => isMatch(t.cleanKey, eventTruckKey)) || {};

            // 👇 THE FIX: Match using the exact same specific slug format
            const eventVenueKey = getVenueSlug(rawVenue, rawEventVillage);
            
            let venue = venuesList.find(v => v.cleanKey === eventVenueKey);
            
            // Fallback: If exact specific match fails, try fuzzy matching just the venue name
            if (!venue) {
                const genericVenueKey = createSlug(rawVenue);
                venue = venuesList.find(v => {
                    // Have to extract just the venue name from the cleanKey (which is now name+village)
                    // The easiest way is to re-create the generic slug from the raw name
                    const fuzzyMatch = isMatch(createSlug(v.rawName), genericVenueKey);
                    if (fuzzyMatch && genericVenueKey.length <= 5) {
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
              
              village: rawEventVillage || venue.village || '',               
              
              postcode: venue.postcode || '',              
              venueLat: venue.lat, 
              venueLong: venue.long, 
              venuePhone: venue.venuePhone || '',
              venueWebsite: venue.venueWebsite || '',
              venuePhoto: venue.venuePhoto || '',

              type: truck.type || 'Mobile',           
              phoneNumber: truck.phoneNumber || '',
              orderUrl: truck.orderUrl || '',
              acceptedMethods: truck.acceptedMethods || '',
              websiteUrl: truck.websiteUrl || '',            
              menuUrl: truck.menuUrl || '',               
              notes: truck.truckNotes || '',
              eventNotes: cols[6] || '',    
              logoUrl: truck.logoUrl || '',         
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

        if (isMounted) {
            setEvents(parsedEvents);
            setLoading(false);
        }

      } catch (error: any) {
        if (error.name !== 'AbortError') {
            console.error('VillageData Sync Error:', error);
        }
        if (isMounted) {
            setLoading(false);
        }
      }
    };
    
    fetchData();

    return () => {
        isMounted = false;
        controller.abort();
        clearTimeout(timeoutId);
    };
  }, []);

  const { groupedEvents, mapEvents, dynamicCuisineOptions } = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const dateFiltered = events.filter(event => {
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

    const distanceAndDateFiltered = dateFiltered.filter(event => {
      if (filters.distance !== 'all' && userLocation) {
        if (!event.venueLat || !event.venueLong) return false; 
        const distKm = getDistanceKm(userLocation.lat, userLocation.long, event.venueLat, event.venueLong);
        const distMiles = distKm * 0.621371;
        if (distMiles > parseInt(filters.distance)) return false;
      }
      return true;
    });

    const types = new Set<string>();
    distanceAndDateFiltered.forEach(e => {
        if (e.type && e.type !== 'Mobile' && !e.type.toLowerCase().includes('static')) {
            const splitTypes = e.type.split(',').map(t => t.trim());
            splitTypes.forEach(t => {
                if (t) types.add(t);
            });
        }
    });
    const dynamicCuisines = Array.from(types).sort();

    const finalFilteredList = distanceAndDateFiltered.filter(event => {
      if (filters.cuisine !== 'all') {
        const eventTypes = event.type ? event.type.toLowerCase().split(',').map(t => t.trim()) : ['mobile'];
        if (!eventTypes.includes(filters.cuisine.toLowerCase())) return false;
      }
      return true;
    });

    const finalMapEvents = dateFiltered.filter(event => {
        if (filters.cuisine !== 'all') {
          const eventTypes = event.type ? event.type.toLowerCase().split(',').map(t => t.trim()) : ['mobile'];
          if (!eventTypes.includes(filters.cuisine.toLowerCase())) return false;
        }
        return true;
    });

    const grouped = finalFilteredList.reduce((groups, event) => {
      const date = event.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
      return groups;
    }, {} as Record<string, VillageEvent[]>);

    return { 
        groupedEvents: grouped, 
        mapEvents: finalMapEvents, 
        dynamicCuisineOptions: dynamicCuisines 
    };

  }, [events, filters, userLocation]);

  const venueStats = useMemo(() => {
    const stats: Record<string, { eventCount: number, trucks: Set<string> }> = {};
    
    events.forEach(e => {
        // 👇 Join Venue + Village in the background to create a globally unique ID for this pub
        const uniqueVenueId = getVenueSlug(e.venueName, e.village || '');
        const truckSlug = createSlug(e.truckName);

        if (!uniqueVenueId) return;

        if (!stats[uniqueVenueId]) {
            stats[uniqueVenueId] = { eventCount: 0, trucks: new Set() };
        }
        
        stats[uniqueVenueId].eventCount += 1;
        stats[uniqueVenueId].trucks.add(truckSlug);
    });

    const processed: Record<string, { eventCount: number, uniqueTrucks: number }> = {};
    for (const [id, data] of Object.entries(stats)) {
        processed[id] = {
            eventCount: data.eventCount,
            uniqueTrucks: data.trucks.size
        };
    }
    
    return processed;
  }, [events]);

return { 
    loading, 
    groupedEvents, 
    mapEvents, 
    dynamicCuisineOptions, 
    venueStats 
};
}