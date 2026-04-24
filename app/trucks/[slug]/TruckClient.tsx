'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script'; 
import { usePostHog } from 'posthog-js/react'; 
import { useVillageData } from '@/hooks/useVillageData';
import Footer from '@/components/Footer';
import { createSlug } from '@/lib/utils'; 
import TruckListCard from '@/components/TruckListCard';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/components/MapView'), { 
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-100 animate-pulse flex items-center justify-center text-slate-400 font-bold">Loading Map...</div>
});

export default function TruckClient({ slug }: { slug: string }) {
  const posthog = usePostHog();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 120);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const { loading, mapEvents, allTrucks } = useVillageData(null, {
    date: 'unlimited', 
    cuisine: 'all',
    distance: '1000' 
  });

  const truckInfo = useMemo(() => {
    if (!allTrucks || allTrucks.length === 0) return null;
    const truck = allTrucks.find(t => t.cleanKey === slug);
    if (!truck) return null;

    return {
        name: truck.rawName,
        type: truck.type,
        logo: truck.logoUrl,
        menuUrl: truck.menuUrl,          
        phoneNumber: truck.phoneNumber,
        websiteUrl: truck.websiteUrl
    };
  }, [allTrucks, slug]);

  const truckEventsFlat = useMemo(() => {
    return mapEvents.filter(event => createSlug(event.truckName) === slug);
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

  const cleanPhone = truckInfo?.phoneNumber?.replace(/[^\d+]/g, '');

  const getDisplayWebsite = (url: string) => {
      if (!url) return '';
      const lowerUrl = url.toLowerCase();
      if (lowerUrl.includes('facebook.com')) return 'Facebook Page';
      if (lowerUrl.includes('instagram.com')) return 'Instagram';
      if (lowerUrl.includes('tiktok.com')) return 'TikTok';
      if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'X (Twitter)';
      return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Script src="https://tally.so/widgets/embed.js" strategy="afterInteractive" />

      {/* HEADER */}
      <header className="bg-slate-900 text-white py-3 px-4 sticky top-0 z-50 shadow-md h-[60px] flex items-center">
        <div className="max-w-6xl mx-auto flex justify-between items-center w-full relative">
          
          <Link href="/" className="flex items-center transition-opacity hover:opacity-90 shrink-0 z-20">
            <Image
              src="/logos/village-foodie-logo-v2.png"
              alt="Village Foodie"
              width={140}
              height={42}
              className="object-contain w-[110px] sm:w-[140px]"
              priority
            />
          </Link>
          
          {truckInfo && (
            <div 
              className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${isScrolled ? 'opacity-100' : 'opacity-0'}`}
            >
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 px-[90px] sm:px-0 w-full">
                {truckInfo.logo ? (
                    <Image src={truckInfo.logo} alt={truckInfo.name} width={24} height={24} className="w-6 h-6 sm:w-7 sm:h-7 object-contain rounded-full bg-white shadow-sm shrink-0" />
                ) : (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-[10px] shrink-0">🚚</div>
                )}
                <h1 className="text-[13px] sm:text-[15px] font-bold sm:font-black tracking-tight leading-tight truncate max-w-[110px] sm:max-w-xs">
                  {truckInfo.name}
                </h1>
              </div>
            </div>
          )}

          {/* 👇 EXACT COPY of the toggle from the main page (Hidden on Desktop) 👇 */}
          <div className="flex bg-slate-800 rounded-lg p-1 lg:hidden shrink-0 z-20 pointer-events-auto">
            <button 
                onClick={() => setMobileView('list')} 
                className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${mobileView === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
                List
            </button>
            <button 
                onClick={() => setMobileView('map')} 
                className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${mobileView === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
                Map
            </button>
          </div>
          
        </div>
      </header>

      {/* HERO SECTION */}
      {truckInfo && (
        <div className="bg-white px-4 pt-8 pb-6 border-b border-slate-200 flex flex-col items-center text-center shadow-sm relative z-0">
            <div className="absolute top-4 right-4 md:top-6 md:right-6 z-10">
                <Link 
                    href={`/contact?topic=Add%20Business&truck=${encodeURIComponent(truckInfo.name)}`}
                    className="flex items-center gap-1.5 bg-slate-50 hover:bg-orange-50 border border-slate-200 hover:border-orange-200 text-slate-500 hover:text-orange-600 text-[10px] font-bold px-2.5 py-1.5 rounded-full transition-all shadow-sm"
                    title="Own this truck? Click to update your profile"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    Own this truck?
                </Link>
            </div>

            {truckInfo.logo ? (
                <Image src={truckInfo.logo} alt={truckInfo.name} width={96} height={96} className="w-24 h-24 object-contain rounded-full border border-slate-200 shadow-md bg-white mb-4" />
            ) : (
                <div className="w-24 h-24 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-4xl shadow-md mb-4">🚚</div>
            )}
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
              {truckInfo.name}
            </h1>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-1.5">
              {truckInfo.type}
            </p>

            {truckInfo.websiteUrl && (
                <a 
                    href={truckInfo.websiteUrl.startsWith('http') ? truckInfo.websiteUrl : `https://${truckInfo.websiteUrl}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 mt-3 text-sm font-semibold text-orange-600 hover:text-orange-700 hover:underline transition-colors"
                >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    <span className="truncate max-w-[200px] md:max-w-xs">{getDisplayWebsite(truckInfo.websiteUrl)}</span>
                </a>
            )}
        </div>
      )}

      {/* ACTION BUTTONS */}
      {truckInfo && (
        <div className="w-full max-w-2xl mx-auto px-4 mt-5 mb-2">
            <div className="flex justify-center flex-wrap sm:flex-nowrap gap-2 w-full">
              {truckInfo.menuUrl && (
                <a href={truckInfo.menuUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[80px] bg-slate-900 text-white font-bold py-2.5 px-2 rounded-xl flex justify-center items-center gap-1.5 text-xs hover:bg-slate-800 transition-transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap overflow-hidden">
                  📋 <span>Menu</span>
                </a>
              )}
              {cleanPhone && (
                <>
                  <a href={`tel:${cleanPhone}`} className="flex-1 min-w-[80px] bg-orange-600 text-white font-bold py-2.5 px-2 rounded-xl flex justify-center items-center gap-1.5 text-xs hover:bg-orange-700 transition-transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap overflow-hidden">
                    📞 <span>Call</span>
                  </a>
                  <a href={`sms:${cleanPhone}`} className="flex-1 min-w-[80px] bg-orange-600 text-white font-bold py-2.5 px-2 rounded-xl flex justify-center items-center gap-1.5 text-xs hover:bg-orange-700 transition-transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap overflow-hidden">
                    💬 <span>Message</span>
                  </a>
                </>
              )}
              <button onClick={handleProfileShare} className="flex-1 min-w-[80px] bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 font-bold py-2.5 px-2 rounded-xl flex justify-center items-center gap-1.5 text-xs hover:bg-slate-200 transition-transform hover:scale-105 active:scale-95 shadow-sm whitespace-nowrap overflow-hidden">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                <span>Share</span>
              </button>
            </div>
        </div>
      )}

      <div className="flex-1 w-full max-w-6xl mx-auto p-4 pb-24 relative z-0">
        {loading ? (
          <div className="p-12 text-center text-slate-500 animate-pulse">Loading schedule...</div>
        ) : !truckInfo ? (
          <div className="p-12 flex flex-col items-center text-center animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4">🤷‍♂️</div>
            <h2 className="text-xl font-bold text-slate-800">Truck not found</h2>
            <p className="text-slate-500 mt-2 max-w-sm">We couldn't find any details for this food truck. They might have moved or updated their profile.</p>
            <Link 
              href="/trucks" 
              className="mt-6 bg-orange-600 text-white font-bold py-3 px-6 rounded-xl shadow-sm hover:bg-orange-700 transition-transform hover:scale-105"
            >
              View all trucks
            </Link>
          </div>
        ) : truckEventsFlat.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center animate-in fade-in duration-500">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4">😔</div>
            <h2 className="text-xl font-bold text-slate-800">No upcoming events found</h2>
            <p className="text-slate-500 mt-2 max-w-sm">We might be missing some details for this truck. Are you the owner, or do you know their schedule?</p>
            <Link 
              href={`/contact?topic=Add%20Business&truck=${encodeURIComponent(truckInfo.name)}`} 
              className="mt-6 bg-orange-600 text-white font-bold py-3 px-6 rounded-xl shadow-sm hover:bg-orange-700 transition-transform hover:scale-105"
            >
              Drop us a message to update!
            </Link>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <h2 className="text-slate-800 font-extrabold text-xl mb-4 ml-1 text-center lg:text-left">Upcoming Tour Dates</h2>
            
            <div className="flex flex-col lg:flex-row gap-6 w-full">
                
                {/* LEFT: FLAT EVENT LIST */}
                <div className={`flex-1 space-y-1 ${mobileView === 'map' ? 'hidden lg:block' : 'block'}`}>
                    {truckEventsFlat.map(event => (
                        <TruckListCard key={event.id} event={event} />
                    ))}
                    
                    <div className="mt-8 p-6 bg-slate-100 rounded-xl text-center border border-dashed border-slate-300">
                      <p className="m-0 text-slate-600">
                        <strong className="text-slate-800">Are we missing an event?</strong> <br />
                        If you're the owner of this truck or just a dedicated fan, help us keep this page accurate! <br />
                        <Link 
                          href={`/contact?topic=Add%20Business&truck=${encodeURIComponent(truckInfo.name)}`} 
                          className="text-orange-600 font-bold hover:underline mt-2 inline-block"
                        >
                          Contact us to add missing details.
                        </Link>
                      </p>
                    </div>
                </div>

                {/* RIGHT: REAL LEAFLET MAP */}
                <div className={`w-full lg:w-[45%] shrink-0 ${mobileView === 'list' ? 'hidden lg:block' : 'block'}`}>
                    {/* 👇 Adjusted height for map to look good on mobile and desktop 👇 */}
                    <div className="sticky top-[80px] h-[60vh] lg:h-[600px] rounded-xl overflow-hidden shadow-sm border border-slate-200 z-0">
                         <MapView events={truckEventsFlat} />
                    </div>
                </div>
            </div>

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