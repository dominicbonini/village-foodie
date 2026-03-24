'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { usePostHog } from 'posthog-js/react';
import { useVillageData } from '@/hooks/useVillageData';
import EventListCard from '@/components/EventListCard';
import Footer from '@/components/Footer';
import { formatFriendlyDate, createSlug } from '@/lib/utils'; 

export default function VenueProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const posthog = usePostHog();
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  const { loading, mapEvents } = useVillageData(null, {
    date: 'all',
    cuisine: 'all',
    distance: '1000' 
  });

  const { venueEvents, venueInfo } = useMemo(() => {
    const filtered = mapEvents.filter(event => createSlug(event.venueName) === slug);
    
    // 👇 UPDATED: Added venuePhone extraction
    const info = filtered.length > 0 ? {
        name: filtered[0].venueName,
        village: filtered[0].village,
        postcode: (filtered[0] as any).postcode || '',
        phone: (filtered[0] as any).venuePhone || ''
    } : null;

    const grouped = filtered.reduce((groups, event) => {
      const date = event.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
      return groups;
    }, {} as Record<string, typeof mapEvents>);

    return { venueEvents: grouped, venueInfo: info };
  }, [mapEvents, slug]);

  const handleShareVenue = async () => {
    if (!venueInfo) return;
    
    if (posthog) {
      posthog.capture('clicked_share_venue_profile', { venue: venueInfo.name });
    }

    const shareUrl = window.location.href;
    const shareText = `Check out the upcoming food truck schedule for ${venueInfo.name} in ${venueInfo.village}! 🍔🍻`;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${venueInfo.name} Food Trucks`,
          text: shareText,
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        alert('Venue link copied to clipboard! 📋');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error('Share failed:', err);
    }
  };

  const addressQuery = venueInfo ? encodeURIComponent(`${venueInfo.name}, ${venueInfo.village}, ${venueInfo.postcode}`) : '';
  const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh|Mac OS X/i.test(navigator.userAgent);
  const mapLink = isApple
    ? `http://maps.apple.com/?daddr=${addressQuery}&dirflg=d` 
    : `https://www.google.com/maps/dir/?api=1&destination=${addressQuery}`;

  // Clean phone number for the tel: link
  const cleanPhone = venueInfo?.phone ? venueInfo.phone.replace(/[^\d+]/g, '') : '';

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
        ) : !venueInfo ? (
          <div className="text-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm mt-8">
             <h2 className="text-xl font-bold text-slate-800">Venue not found 📍</h2>
             <p className="text-slate-500 mt-2">We couldn't find any upcoming food trucks for this location.</p>
             <Link href="/" className="inline-block mt-4 bg-orange-600 text-white px-6 py-2 rounded-lg font-bold">See all venues</Link>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            
{/* 👇 POLISHED VENUE HERO CARD 👇 */}
<div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-8 mt-4 text-center relative overflow-hidden">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-3 shadow-sm">🍻</div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">{venueInfo.name}</h1>
                
                {/* 👇 ADDRESS & BUTTONS CLUSTER 👇 */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-4">
                    {/* Address is the clickable map link */}
                    <a 
                        href={mapLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 text-slate-500 hover:text-orange-600 font-medium text-sm transition-colors group cursor-pointer"
                    >
                        <span className="group-hover:scale-110 transition-transform">📍</span>
                        <span className="group-hover:underline underline-offset-2">
                            {venueInfo.village}
                            {venueInfo.postcode && ` • ${venueInfo.postcode.toUpperCase()}`}
                        </span>
                    </a>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        {cleanPhone && (
                            <a 
                                href={`tel:${cleanPhone}`}
                                onClick={() => {if(posthog){posthog.capture('clicked_call_venue', {venue: venueInfo.name})}}}
                                className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold py-1.5 px-3 rounded-md transition-all shadow-sm"
                            >
                                📞 Call Venue
                            </a>
                        )}

                        <button 
                            onClick={handleShareVenue}
                            className="flex items-center justify-center gap-1.5 bg-slate-50 border border-slate-200 hover:bg-orange-50 hover:border-orange-200 text-slate-700 hover:text-orange-600 text-[11px] font-bold py-1.5 px-3 rounded-md transition-all shadow-sm"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                            Share
                        </button>
                    </div>
                </div>
            </div>

            <h2 className="text-slate-800 font-extrabold text-xl mb-4 ml-1">Upcoming Food Trucks</h2>
            
            {Object.entries(venueEvents).map(([date, events]) => (
                <div key={date} className="mb-6">
                    <div className="pt-2 pb-3 ml-1">
                        <h2 className="text-slate-900 font-black text-sm uppercase tracking-widest">
                           {formatFriendlyDate(date)}
                        </h2>
                    </div>
                    <div className="space-y-3">
                        {events.map(event => (
                            <EventListCard 
                                key={event.id} 
                                event={event} 
                                distanceMiles={null} 
                                isVenuePage={true} 
                            />
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