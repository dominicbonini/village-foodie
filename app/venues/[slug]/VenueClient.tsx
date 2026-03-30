'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import Script from 'next/script'; 
import { usePostHog } from 'posthog-js/react';
import { useVillageData } from '@/hooks/useVillageData';
import EventListCard from '@/components/EventListCard';
import Footer from '@/components/Footer';
import { formatFriendlyDate, createSlug } from '@/lib/utils'; 

export default function VenueClient({ slug }: { slug: string }) {
  const posthog = usePostHog();

  const { loading, mapEvents } = useVillageData(null, {
    date: 'all',
    cuisine: 'all',
    distance: '1000' 
  });

  const { venueEvents, venueInfo } = useMemo(() => {
    const filtered = mapEvents.filter(event => createSlug(event.venueName) === slug);
    
    const info = filtered.length > 0 ? {
        name: filtered[0].venueName,
        village: filtered[0].village,
        postcode: (filtered[0] as any).postcode || '',
        phone: (filtered[0] as any).venuePhone || '',
        photo: (filtered[0] as any).venuePhoto || '',     
        website: (filtered[0] as any).venueWebsite || ''  
    } : null;

    const grouped = filtered.reduce((groups, event) => {
      const date = event.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
      return groups;
    }, {} as Record<string, typeof mapEvents>);

    return { venueEvents: grouped, venueInfo: info };
  }, [mapEvents, slug]);

  const queryParts = venueInfo ? [venueInfo.name, venueInfo.village, venueInfo.postcode].filter(Boolean) : [];
  const addressQuery = encodeURIComponent(queryParts.join(', '));
  
  // Start with a standard Google Maps link to prevent hydration mismatch
  const [mapLink, setMapLink] = useState(`https://maps.google.com/?q=${addressQuery}`);

  useEffect(() => {
    // Switch to Apple Maps only on the client if it's an iOS/Mac device
    if (typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh|Mac OS X/i.test(navigator.userAgent)) {
      setMapLink(`https://maps.apple.com/?daddr=${addressQuery}&dirflg=d`);
    }
  }, [addressQuery]);

  const handleShareVenue = async () => {
    if (!venueInfo) return;
    if (posthog) posthog.capture('clicked_share_venue_profile', { venue: venueInfo.name });

    const shareUrl = window.location.href;
    const shareText = `Check out the upcoming food truck schedule for ${venueInfo.name} in ${venueInfo.village}! 🍔🍻`;
    
    try {
      if (navigator.share && navigator.canShare && navigator.canShare({ title: `${venueInfo.name} Food Trucks`, text: shareText, url: shareUrl })) {
        await navigator.share({ title: `${venueInfo.name} Food Trucks`, text: shareText, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        alert('Venue link copied to clipboard! 📋');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error('Share failed:', err);
    }
  };

  const openTallyPopup = () => {
    if (posthog) posthog.capture('clicked_newsletter_subscribe', { source: 'venue_page', venue: venueInfo?.name });
    if (typeof window !== 'undefined' && (window as any).Tally) {
      (window as any).Tally.openPopup('81xAKx', { layout: 'modal', width: 400 });
    } else {
      window.open('https://tally.so/r/81xAKx', '_blank');
    }
  };
  
  const cleanPhone = venueInfo?.phone ? venueInfo.phone.replace(/[^\d+]/g, '') : '';
  const cleanWebsite = venueInfo?.website ? (venueInfo.website.startsWith('http') ? venueInfo.website : `https://${venueInfo.website}`) : '';

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Script src="https://tally.so/widgets/embed.js" strategy="afterInteractive" />

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
          <div className="text-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm mt-8 animate-in fade-in duration-500">
             <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4 mx-auto">📍</div>
             <h2 className="text-xl font-bold text-slate-800">Venue not found</h2>
             <p className="text-slate-500 mt-2">We couldn't find any upcoming food trucks for this location.</p>
             <Link href="/" className="inline-block mt-6 bg-orange-600 hover:bg-orange-700 transition-transform hover:scale-105 text-white px-6 py-2 rounded-xl font-bold shadow-sm">
                See all venues
             </Link>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="relative w-full h-56 md:h-72 rounded-2xl overflow-hidden mb-5 shadow-sm border border-slate-200 mt-2 bg-slate-900">
                {/* REVERTED BACK TO STANDARD IMG TAG HERE 👇 */}
                {venueInfo.photo ? (
                    <img 
                        src={venueInfo.photo} 
                        alt={venueInfo.name} 
                        className="w-full h-full object-cover opacity-80"
                    />
                ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center opacity-50 absolute inset-0">
                        <span className="text-6xl">🍻</span>
                    </div>
                )}
                
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-6 md:pb-8 w-full text-center px-4">
                    <h1 className="text-3xl md:text-4xl font-black text-white leading-tight drop-shadow-lg">
                        {venueInfo.name}
                    </h1>
                    <a 
                        href={mapLink} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="inline-flex items-center justify-center gap-1.5 text-slate-200 hover:text-orange-400 font-medium text-sm transition-colors mt-1 group drop-shadow-md"
                    >
                        <span className="group-hover:scale-110 transition-transform">📍</span>
                        <span className="group-hover:underline underline-offset-2">
                            {venueInfo.village} {venueInfo.postcode && `• ${venueInfo.postcode.toUpperCase()}`}
                        </span>
                    </a>
                </div>
            </div>

            <div className="flex w-full gap-2 md:gap-3 mb-8">
                {cleanPhone && (
                    <a href={`tel:${cleanPhone}`} onClick={() => {if(posthog)posthog.capture('clicked_call_venue', {venue: venueInfo.name})}} className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 text-[13px] md:text-sm font-bold py-2.5 px-2 rounded-xl transition-all shadow-sm active:scale-95">
                        📞 Call
                    </a>
                )}
                
                {cleanWebsite && (
                    <a href={cleanWebsite} target="_blank" rel="noopener noreferrer" onClick={() => {if(posthog)posthog.capture('clicked_venue_website', {venue: venueInfo.name})}} className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 text-[13px] md:text-sm font-bold py-2.5 px-2 rounded-xl transition-all shadow-sm active:scale-95">
                        🌐 Website
                    </a>
                )}

                <button onClick={handleShareVenue} className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 text-[13px] md:text-sm font-bold py-2.5 px-2 rounded-xl transition-all shadow-sm active:scale-95">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    Share
                </button>
            </div>

            <h2 className="text-slate-800 font-extrabold text-xl mb-4 ml-1">Upcoming Food Trucks</h2>
            
            {Object.entries(venueEvents).map(([date, events]) => (
                <div key={date} className="mb-6">
                    <div className="pt-2 pb-3 ml-1">
                        <h2 className="text-slate-900 font-black text-sm uppercase tracking-widest">{formatFriendlyDate(date)}</h2>
                    </div>
                    <div className="space-y-3">
                        {events.map(event => <EventListCard key={event.id} event={event} distanceMiles={null} isVenuePage={true} />)}
                    </div>
                </div>
            ))}
          </div>
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

      <Footer onOpenTally={openTallyPopup} />
    </main>
  );
}