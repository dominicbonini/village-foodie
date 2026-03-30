'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import Script from 'next/script'; 
import { usePostHog } from 'posthog-js/react'; 
import { useVillageData } from '@/hooks/useVillageData';
import Footer from '@/components/Footer';
import { formatFriendlyDate, createSlug } from '@/lib/utils'; 
import TruckListCard from '@/components/TruckListCard';

// 👇 Note the change here! We just pass the slug directly in as a string now.
export default function TruckClient({ slug }: { slug: string }) {
  const posthog = usePostHog();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 120);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
        logo: filtered[0].logoUrl,
        menuUrl: filtered[0].menuUrl,          
        phoneNumber: filtered[0].phoneNumber   
    } : null;

    const grouped = filtered.reduce((groups, event) => {
      const date = event.date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
      return groups;
    }, {} as Record<string, typeof mapEvents>);

    return { truckEvents: grouped, truckInfo: info };
  }, [mapEvents, slug]);

  const openTallyPopup = () => {
    if (posthog) {
      posthog.capture('clicked_newsletter_subscribe', { source: 'truck_page', truck: truckInfo?.name });
    }
    if (typeof window !== 'undefined' && (window as any).Tally) {
      (window as any).Tally.openPopup('81xAKx', { layout: 'modal', width: 400 });
    } else {
      window.open('https://tally.so/r/81xAKx', '_blank');
    }
  };

  const handleProfileShare = async () => {
    if (!truckInfo) return;
    const shareUrl = window.location.href;
    const shareData = {
      title: `${truckInfo.name} Schedule`,
      text: `Check out where ${truckInfo.name} is pitching up next! 🚚\n\n`,
      url: shareUrl
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Profile link copied to clipboard! 📋');
      }
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Script src="https://tally.so/widgets/embed.js" strategy="afterInteractive" />

      {/* 1. DYNAMIC STICKY HEADER */}
      <header className="bg-slate-900 text-white py-3 px-4 sticky top-0 z-50 shadow-md h-[60px] flex items-center">
        <div className="max-w-2xl mx-auto flex justify-between items-center w-full relative">
          
          <Link href="/" className="text-slate-300 hover:text-white transition-colors flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-800 shrink-0 z-10">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
          </Link>
          
          {truckInfo && (
            <div 
              className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${isScrolled ? 'opacity-100' : 'opacity-0'}`}
            >
              <div className="flex items-center gap-2 px-10">
                {truckInfo.logo ? (
                    <img src={truckInfo.logo} alt={truckInfo.name} className="w-7 h-7 object-contain rounded-full bg-white shadow-sm shrink-0" />
                ) : (
                    <div className="w-7 h-7 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-[10px] shrink-0">🚚</div>
                )}
                <h1 className="text-[15px] font-black tracking-tight leading-tight truncate">
                  {truckInfo.name}
                </h1>
              </div>
            </div>
          )}

          <button onClick={handleProfileShare} className="text-slate-300 hover:text-white transition-colors flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-800 shrink-0 z-10" title="Share Profile">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
          </button>
        </div>
      </header>

      {/* 2. THE MAIN PROFILE HERO */}
      {truckInfo && (
        <div className="bg-white px-4 pt-8 pb-6 border-b border-slate-200 flex flex-col items-center text-center shadow-sm relative z-0">
            {truckInfo.logo ? (
                <img src={truckInfo.logo} alt={truckInfo.name} className="w-24 h-24 object-contain rounded-full border border-slate-200 shadow-md bg-white mb-4" />
            ) : (
                <div className="w-24 h-24 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-4xl shadow-md mb-4">🚚</div>
            )}
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
              {truckInfo.name}
            </h1>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-1.5">
              {truckInfo.type}
            </p>
        </div>
      )}

      {/* 3. ACTION BUTTONS */}
      {truckInfo && (truckInfo.menuUrl || truckInfo.phoneNumber) && (
        <div className="w-full max-w-2xl mx-auto px-4 mt-5 mb-2">
            <div className="flex justify-center gap-2 w-full">
              {truckInfo.menuUrl && (
                <a href={truckInfo.menuUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 bg-slate-900 text-white font-bold py-2.5 px-2 rounded-xl flex justify-center items-center gap-1.5 text-xs hover:bg-slate-800 transition-transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap overflow-hidden">
                  📋 <span>Menu</span>
                </a>
              )}
              {truckInfo.phoneNumber && (
                <>
                  <a href={`tel:${truckInfo.phoneNumber.replace(/[^\d+]/g, '')}`} className="flex-1 min-w-0 bg-orange-600 text-white font-bold py-2.5 px-2 rounded-xl flex justify-center items-center gap-1.5 text-xs hover:bg-orange-700 transition-transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap overflow-hidden">
                    📞 <span>Call</span>
                  </a>
                  <a href={`sms:${truckInfo.phoneNumber.replace(/[^\d+]/g, '')}`} className="flex-1 min-w-0 bg-orange-600 text-white font-bold py-2.5 px-2 rounded-xl flex justify-center items-center gap-1.5 text-xs hover:bg-orange-700 transition-transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap overflow-hidden">
                    💬 <span>Message</span>
                  </a>
                </>
              )}
            </div>
        </div>
      )}

      {/* 4. THE SCHEDULE FEED */}
      <div className="flex-1 w-full max-w-2xl mx-auto p-4 pb-24">
        {loading ? (
          <div className="p-12 text-center text-slate-500 animate-pulse">Loading schedule...</div>
        ) : !truckInfo ? (
           null 
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <h2 className="text-slate-800 font-extrabold text-xl mb-4 ml-1">Upcoming Tour Dates</h2>
            
            {Object.entries(truckEvents).map(([date, events]) => (
                <div key={date} className="mb-6">
                    <div className="pt-2 pb-3 ml-1">
                        <h2 className="text-slate-900 font-black text-sm uppercase tracking-widest">
                           {formatFriendlyDate(date)}
                        </h2>
                    </div>
                    <div className="space-y-4">
                        {events.map(event => (
                            <TruckListCard key={event.id} event={event} />
                        ))}
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