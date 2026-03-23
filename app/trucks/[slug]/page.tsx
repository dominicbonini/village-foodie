'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useVillageData } from '@/hooks/useVillageData';
import EventListCard from '@/components/EventListCard';
import Footer from '@/components/Footer';
import { formatFriendlyDate } from '@/lib/utils'; 

const createSlug = (str: string) => {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/^the\s+/, '')       
        .replace(/&/g, 'and')         
        .replace(/['’]/g, '')         
        .replace(/[^a-z0-9]/g, '')    
        .trim();
};

export default function TruckProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  // 👇 THE OVERRIDE: This explicitly forces the engine to show ALL upcoming dates
  const { loading, mapEvents } = useVillageData(null, {
    date: 'all', 
    cuisine: 'all',
    distance: '1000' 
  });

  const { truckEvents, truckInfo } = useMemo(() => {
    const filtered = mapEvents.filter(event => createSlug(event.truckName) === slug);
    
    const info = filtered.length > 0 ? {
        name: filtered[0].truckName,
        type: filtered[0].type,
        logo: filtered[0].logoUrl
    } : null;

    const grouped = filtered.reduce((groups, event) => {
      const date = event.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
      return groups;
    }, {} as Record<string, typeof mapEvents>);

    return { truckEvents: grouped, truckInfo: info };
  }, [mapEvents, slug]);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white py-4 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-sm font-bold flex items-center gap-2 hover:text-orange-400 transition-colors">
            ← Back to Village Foodie
          </Link>
        </div>
      </header>

      <div className="flex-1 w-full max-w-2xl mx-auto p-4 pb-24">
        {loading ? (
          <div className="p-12 text-center text-slate-500 animate-pulse">Loading schedule...</div>
        ) : !truckInfo ? (
          <div className="text-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm mt-8">
             <h2 className="text-xl font-bold text-slate-800">Truck not found 🚚</h2>
             <p className="text-slate-500 mt-2">We couldn't find any upcoming events for this food truck.</p>
             <Link href="/" className="inline-block mt-4 bg-orange-600 text-white px-6 py-2 rounded-lg font-bold">See all trucks</Link>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-8 mt-4 text-center">
                {truckInfo.logo ? (
                    <img src={truckInfo.logo} alt={truckInfo.name} className="w-24 h-24 object-contain mx-auto mb-4 rounded-full border border-slate-100 shadow-sm bg-white" />
                ) : (
                    <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 shadow-sm">🚚</div>
                )}
                <h1 className="text-3xl font-black text-slate-900">{truckInfo.name}</h1>
                <p className="text-slate-500 font-medium uppercase tracking-widest text-sm mt-1">{truckInfo.type}</p>
                <p className="text-slate-600 text-sm mt-4 max-w-md mx-auto">
                   Check out the upcoming schedule below to see where {truckInfo.name} is pitching up next!
                </p>
            </div>

            <h2 className="text-slate-800 font-extrabold text-xl mb-4 ml-1">Upcoming Tour Dates</h2>
            
            {Object.entries(truckEvents).map(([date, events]) => (
                <div key={date} className="mb-6">
                    <div className="pt-2 pb-3 ml-1">
                        <h2 className="text-slate-900 font-black text-sm uppercase tracking-widest">
                           {formatFriendlyDate(date)}
                        </h2>
                    </div>
                    <div className="space-y-3">
                        {events.map(event => (
                            <EventListCard key={event.id} event={event} distanceMiles={null} />
                        ))}
                    </div>
                </div>
            ))}
          </div>
        )}
      </div>

      <Footer onOpenTally={() => window.open('https://tally.so/r/81xAKx', '_blank')} />
    </main>
  );
}