"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchEvents, parseUKDate } from "@/utils/fetchData";
import type { VillageEvent } from "@/types";
import EventCard from "@/components/EventCard";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type Tab = "list" | "map";

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getDateLabel(dateStr: string): string {
  const date = parseUKDate(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  const dayName = d.toLocaleDateString("en-GB", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${dayName} ${getOrdinal(day)} ${month}`;
}

function groupEventsByDate(events: VillageEvent[]): { label: string; events: VillageEvent[] }[] {
  const groups: Map<string, VillageEvent[]> = new Map();

  for (const event of events) {
    const key = event.date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    return parseUKDate(a).getTime() - parseUKDate(b).getTime();
  });

  return sortedKeys.map((key) => ({
    label: getDateLabel(key),
    events: groups.get(key)!,
  }));
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("list");
  const [events, setEvents] = useState<VillageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load events"))
      .finally(() => setLoading(false));
  }, []);

  const grouped = groupEventsByDate(events);

  return (
    <div className="flex min-h-screen flex-col bg-[#F9F9F9]">
      <header className="sticky top-0 z-10 border-b border-[#354F52]/20 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <h1 className="text-xl font-bold text-[#354F52]">Village Foodie</h1>
          <p className="text-sm text-[#354F52]/70">
            Find food trucks & pub kitchens near you
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-24">
        <div className="mx-auto max-w-2xl px-4 py-6">
          {loading ? (
            <p className="text-center text-[#354F52]/70">Loading events…</p>
          ) : error ? (
            <p className="rounded-lg bg-[#E76F51]/10 p-4 text-center text-[#E76F51]">
              {error}
            </p>
          ) : tab === "list" ? (
            <div className="space-y-6">
              {grouped.length === 0 ? (
                <p className="text-center text-[#354F52]/70">No events scheduled.</p>
              ) : (
                grouped.map(({ label, events: dayEvents }) => (
                  <section key={label}>
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#354F52]/80">
                      {label}
                    </h2>
                    <div className="space-y-3">
                      {dayEvents.map((event, idx) => (
                        <EventCard
                          key={`${event.date}-${event.truckName}-${event.venueName}-${idx}`}
                          event={event}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          ) : (
            <div className="h-[calc(100vh-12rem)] min-h-[400px]">
              {events.length === 0 ? (
                <p className="text-center text-[#354F52]/70">No events to show on map.</p>
              ) : (
                <MapView events={events} />
              )}
            </div>
          )}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#354F52]/20 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl">
          <button
            onClick={() => setTab("list")}
            className={`flex-1 py-4 text-center text-sm font-medium transition-colors ${
              tab === "list"
                ? "border-b-2 border-[#84A98C] text-[#354F52]"
                : "text-[#354F52]/60"
            }`}
          >
            📅 List
          </button>
          <button
            onClick={() => setTab("map")}
            className={`flex-1 py-4 text-center text-sm font-medium transition-colors ${
              tab === "map"
                ? "border-b-2 border-[#84A98C] text-[#354F52]"
                : "text-[#354F52]/60"
            }`}
          >
            🗺️ Map
          </button>
        </div>
      </nav>
    </div>
  );
}
