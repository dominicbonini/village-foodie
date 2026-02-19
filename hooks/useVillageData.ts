import { useState, useEffect, useMemo } from 'react';
import { VillageEvent } from '@/types';
import { parseDateString, getDistanceKm } from '@/lib/utils';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=0&single=true&output=csv';

export function useVillageData(
  userLocation: { lat: number; long: number } | null,
  filters: { cuisine: string; date: string; distance: string }
) {
  const [events, setEvents] = useState<VillageEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. FETCH DATA
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
            village: cols[5] || '',               
            postcode: cols[6] || '',              
            notes: cols[7] || '',                 
            websiteUrl: cols[8] || '',            
            menuUrl: cols[9] || '',               
            venueLat: cols[10] ? parseFloat(cols[10]) : undefined, 
            venueLong: cols[11] ? parseFloat(cols[11]) : undefined, 
            type: cols[12] || 'Mobile',           
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
  }, []);

  // 2. FILTER & GROUP DATA (Separated for Map vs List)
  const { groupedEvents, mapEvents } = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Step A: Base Filter (Date & Cuisine ONLY) - The Map gets this
    const baseFiltered = events.filter(event => {
      // Cuisine
      if (filters.cuisine !== 'all') {
        const eventType = event.type?.toLowerCase() || 'mobile';
        if (eventType !== filters.cuisine.toLowerCase()) return false;
      }
      // Date
      if (filters.date !== 'all') {
        const eventDate = parseDateString(event.date);
        if (!eventDate) return false;
        if (filters.date === 'today') {
           if (eventDate.getTime() !== today.getTime()) return false;
        } 
        else if (filters.date === 'tomorrow') {
           const tomorrow = new Date(today);
           tomorrow.setDate(tomorrow.getDate() + 1);
           if (eventDate.getTime() !== tomorrow.getTime()) return false;
        } 
        else if (filters.date === 'next7') {
           const nextWeek = new Date(today);
           nextWeek.setDate(today.getDate() + 7);
           if (eventDate > nextWeek) return false;
        }
        else if (filters.date === 'weekend') {
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

    // Step B: List Filter (Apply Distance to the Base Filter)
    const listFiltered = baseFiltered.filter(event => {
      if (filters.distance !== 'all' && userLocation && event.venueLat && event.venueLong) {
        const distKm = getDistanceKm(userLocation.lat, userLocation.long, event.venueLat, event.venueLong);
        const distMiles = distKm * 0.621371;
        if (distMiles > parseInt(filters.distance)) return false;
      }
      return true;
    });

    // Step C: Group for the List View
    const grouped = listFiltered.reduce((groups, event) => {
      const date = event.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
      return groups;
    }, {} as Record<string, VillageEvent[]>);

    return { 
      groupedEvents: grouped,   // Has Distance applied (For List)
      mapEvents: baseFiltered   // NO Distance applied (For Map)
    };

  }, [events, filters, userLocation]);

  // 3. GET CUISINE OPTIONS
  const cuisineOptions = useMemo(() => {
    const types = new Set(events.map(e => e.type).filter(t => t && t !== 'Mobile' && !t.toLowerCase().includes('static')));
    return Array.from(types).sort();
  }, [events]);

  return { loading, groupedEvents, mapEvents, cuisineOptions };
}