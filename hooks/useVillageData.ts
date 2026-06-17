import { useState, useEffect, useMemo } from 'react';
import { VillageEvent } from '@/types';
import { parseDateString, getDistanceKm, createSlug, getVenueSlug } from '@/lib/utils';

export function useVillageData(
  userLocation: { lat: number; long: number } | null,
  filters: { cuisine: string; date: string; distance: string }
) {
  const [events, setEvents] = useState<VillageEvent[]>([]);
  const [allTrucks, setAllTrucks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguishes a FETCH FAILURE (non-200 / network / 10s abort / JSON parse) from a successful
  // fetch that simply returned no matching row. Consumers must NOT render a "doesn't exist" state on
  // loadError — a transient /api/discovery/events blip would otherwise show a false "Truck not found"
  // (same class as the V7.1 silent-blank customer-page fix: never fail-closed a transient error to a
  // wrong state). Surfaced ONLY after bounded auto-retries are exhausted.
  const [loadError, setLoadError] = useState(false);
  // Bumped by refetch() to re-run the fetch effect (manual Retry button fallback).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let controller: AbortController | null = null;
    // Bounded retry: a single cold-start / deploy-window blip self-recovers without a reload; we only
    // surface loadError after all attempts fail. Backoff before retries 2 and 3.
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [400, 1200];

    const attemptFetch = async (attempt: number): Promise<void> => {
      controller = new AbortController();
      const localController = controller;
      const timeoutId = setTimeout(() => localController.abort(), 10000);
      try {
        const res = await fetch(`/api/discovery/events?t=${Date.now()}`, {
          signal: localController.signal,
          cache: 'no-store' as RequestCache,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Failed to fetch discovery data');
        const { events: rawEvents, trucks: rawTrucks } = await res.json();
        if (!isMounted) return;
        setEvents(rawEvents || []);
        setAllTrucks(rawTrucks || []);
        setLoadError(false);
        setLoading(false);
      } catch (error: any) {
        clearTimeout(timeoutId);
        // Unmounted (incl. the cleanup abort) → bail silently, never set state or retry.
        if (!isMounted) return;
        // Not yet exhausted → wait a short backoff and retry (covers cold-start/deploy blips + the
        // 10s timeout-abort, which fires while still mounted).
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1] ?? 1200));
          if (!isMounted) return;
          return attemptFetch(attempt + 1);
        }
        // Retries exhausted → surface an HONEST error state (NOT an empty result). allTrucks is left
        // as-is so any previously-loaded data isn't wiped.
        console.error('VillageData Sync Error (after retries):', error);
        setLoadError(true);
        setLoading(false);
      }
    };

    // Reset error/loading at the start of each fetch cycle (covers manual refetch).
    setLoadError(false);
    setLoading(true);
    attemptFetch(1);

    return () => {
        isMounted = false;
        controller?.abort();
    };
  }, [reloadKey]);

  const refetch = () => setReloadKey(k => k + 1);

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
      loadError,
      refetch,
      groupedEvents,
      mapEvents,
      dynamicCuisineOptions,
      venueStats,
      allTrucks
  };
}
