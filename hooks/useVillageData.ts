import { useState, useEffect, useMemo } from 'react';
import { VillageEvent } from '@/types';
import { parseDateString, getDistanceKm, createSlug, getVenueSlug } from '@/lib/utils'; 

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
  const [allTrucks, setAllTrucks] = useState<any[]>([]);
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
                    logoUrl: cols[9] || '',
                    aliases: cols[17] || ''          
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
            
            const key = getVenueSlug(rawName, village); 
            
            if (key) {
                venuesList.push({
                    rawName: rawName,
                    cleanKey: key, 
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
            
            let truck = trucksList.find(t => t.cleanKey === eventTruckKey);
            
            if (!truck) {
                truck = trucksList.find(t => {
                    if (!t.aliases) return false;
                    const aliasArray = t.aliases.split(',').map((a: string) => createSlug(a.trim()));
                    return aliasArray.includes(eventTruckKey);
                });
            }

            if (!truck) {
                truck = trucksList.find(t => isMatch(t.cleanKey, eventTruckKey));
            }
            
            truck = truck || {}; 

            const eventVenueKey = getVenueSlug(rawVenue, rawEventVillage);
            
            // 1. The Exact Match (Safe because it combines Venue + Village)
            let venue = venuesList.find(v => v.cleanKey === eventVenueKey);
            
            // 👇 2. THE NEW, ULTRA-SAFE SCORING FALLBACK 👇
            if (!venue) {
                let bestMatch = null;
                let highestScore = -1;

                const cleanEventVenue = createSlug(rawVenue);
                const cleanEventVillage = createSlug(rawEventVillage);
                // We strip spaces from the notes so we can easily scan for postcodes like "CB88PD"
                const eventNotesClean = (cols[6] || '').toLowerCase().replace(/\s/g, ''); 
                
                // The "Danger List" of highly duplicated UK names
                const genericNames = ['villagehall', 'townhall', 'communitycentre', 'sportsclub', 'recreationground', 'theplough', 'theredlion', 'thecrown', 'thebell', 'theswan', 'thewhitehorse'];
                const isGeneric = genericNames.some(g => cleanEventVenue.includes(g));

                venuesList.forEach(v => {
                    let score = 0;
                    const vNameClean = createSlug(v.rawName);
                    const vVillageClean = createSlug(v.village);
                    const vPostcodeClean = (v.postcode || '').toLowerCase().replace(/\s/g, '');

                    // SCORE 1: Postcode Match (The Absolute Gold Standard)
                    if (vPostcodeClean && vPostcodeClean.length > 4 && eventNotesClean.includes(vPostcodeClean)) {
                        score += 1000; 
                    }

                    // SCORE 2: Village Match
                    const villageExact = vVillageClean && cleanEventVillage && vVillageClean === cleanEventVillage;
                    const villageFuzzy = vVillageClean && cleanEventVillage && (vVillageClean.includes(cleanEventVillage) || cleanEventVillage.includes(vVillageClean));
                    
                    if (villageExact) score += 100;
                    else if (villageFuzzy) score += 50;

                    // SCORE 3: Venue Name Match
                    const nameExact = vNameClean === cleanEventVenue;
                    const nameFuzzy = isMatch(vNameClean, cleanEventVenue);
                    
                    if (nameExact) score += 100;
                    else if (nameFuzzy) score += 50;

                    // 🚨 CRITICAL GUARDRAIL 🚨
                    // If the venue is generic (e.g. "The Plough") but the village doesn't match 
                    // AND the postcode isn't in the notes, completely disqualify it!
                    if (isGeneric && score < 150) { 
                        score = -1; 
                    }
                    
                    // Accept the match if it has a decent score (e.g., at least a fuzzy name + fuzzy village)
                    if (score > highestScore && score >= 50) {
                        highestScore = score;
                        bestMatch = v;
                    }
                });

                venue = bestMatch || {};
            }
            // 👆 END OF NEW SCORING LOGIC 👆

            const eventObj: VillageEvent = {
              id: `event-${index}`, // We use this index later to check Recency!
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

        // --- 4. SMART DEDUPLICATION LOGIC ---
        
        // Step A: Pre-calculate venue popularity (How many unique trucks visit each venue slug?)
        const tempVenueStats: Record<string, Set<string>> = {};
        parsedEvents.forEach(e => {
            const vKey = getVenueSlug(e.venueName, e.village || '');
            const tKey = createSlug(e.truckName);
            if (vKey) {
                if (!tempVenueStats[vKey]) tempVenueStats[vKey] = new Set();
                tempVenueStats[vKey].add(tKey);
            }
        });

        // Step B: Group events by Date + Truck + Postcode
        const deduplicatedEvents: VillageEvent[] = [];
        const eventGroups = new Map<string, VillageEvent[]>();

        parsedEvents.forEach(event => {
            // If they don't have a postcode, fall back to the venue slug so it still groups safely
            const locationKey = event.postcode ? event.postcode.toLowerCase().replace(/\s/g, '') : getVenueSlug(event.venueName, event.village || '');
            const uniqueKey = `${event.date}|${createSlug(event.truckName)}|${locationKey}`;

            if (!eventGroups.has(uniqueKey)) {
                eventGroups.set(uniqueKey, []);
            }
            eventGroups.get(uniqueKey)!.push(event);
        });

        // Step C: Score and Merge
        eventGroups.forEach(group => {
            if (group.length === 1) {
                deduplicatedEvents.push(group[0]);
                return;
            }

            let bestEvent = group[0];
            let highestScore = -1;

            group.forEach(evt => {
                let score = 0;
                const vKey = getVenueSlug(evt.venueName, evt.village || '');

                // Priority 1: Master Venue (More trucks = higher score)
                const truckCount = tempVenueStats[vKey]?.size || 0;
                score += truckCount * 100;

                // Priority 2: Data Completeness
                if (evt.eventNotes) score += 10;
                if (evt.village) score += 10;
                if (evt.startTime && evt.endTime) score += 5;

                // Priority 3: Recency (Higher Row Index = Newer)
                const rowNum = parseInt(evt.id.split('-')[1] || '0');
                score += rowNum; // 1 point per row number (newer rows win ties)

                if (score > highestScore) {
                    highestScore = score;
                    bestEvent = evt;
                }
            });

            // Priority 4: Data Merging (Absorb useful missing data from the losers!)
            const finalMergedEvent = { ...bestEvent };
            group.forEach(evt => {
                if (!finalMergedEvent.village && evt.village) finalMergedEvent.village = evt.village;
                if (!finalMergedEvent.eventNotes && evt.eventNotes) finalMergedEvent.eventNotes = evt.eventNotes;
                if (!finalMergedEvent.postcode && evt.postcode) finalMergedEvent.postcode = evt.postcode;
            });

            deduplicatedEvents.push(finalMergedEvent);
        });

        if (isMounted) {
            // Set the state using our newly cleaned and merged list!
            setEvents(deduplicatedEvents);
            setAllTrucks(trucksList);
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
      if (filters.date === 'unlimited') return true;
      
      const eventDate = parseDateString(event.date);
      if (!eventDate) return false;
      
      if (filters.date === 'all') {
        const twoWeeks = new Date(today);
        twoWeeks.setDate(today.getDate() + 14);
        if (eventDate > twoWeeks) return false;
      }
      
      if (filters.date !== 'all') {
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
      venueStats,
      allTrucks 
  };
}