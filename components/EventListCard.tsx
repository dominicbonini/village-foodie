import { VillageEvent } from '@/types';
import { 
  getCuisineEmoji, 
  getGoogleLink, 
  getOutlookLink, 
  downloadICS 
} from '@/lib/utils';

interface EventListCardProps {
  event: VillageEvent;
  distanceMiles?: number | null;
}

export default function EventListCard({ event, distanceMiles }: EventListCardProps) {
  const isStatic = event.type?.toLowerCase().includes('static');
  
// --- VENUE FORMATTING ---
const venueDisplay = event.village && 
!event.venueName.toLowerCase().includes(event.village.toLowerCase())
  ? `${event.venueName} - ${event.village}`
  : event.venueName;

// --- SMART NAVIGATION LOGIC ---
// 1. Construct the destination string (Name + Postcode) using the new venueDisplay
// No need for 'as any' anymore since postcode is in your types!
const venuePostcode = event.postcode || ''; 
const addressQuery = [venueDisplay, venuePostcode].filter(Boolean).join(', ');
const safeQuery = encodeURIComponent(addressQuery || 'Event Location');

  // 2. Detect OS
  const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh|Mac OS X/i.test(navigator.userAgent);
  
  // 3. Generate "Directions Mode" Links
  // 'daddr' tells Apple Maps this is the Destination Address
  // 'dir/?api=1&destination=' tells Google the same thing.
  const mapLink = isApple
    ? `http://maps.apple.com/?daddr=${safeQuery}&dirflg=d` 
    : `https://www.google.com/maps/dir/?api=1&destination=${safeQuery}`;

  // --- SHARE LOGIC ---
  async function handleShare() {
    const shareUrl = 'https://village-foodie.vercel.app/'; 
    const shareText = `How about this for dinner?\n${event.truckName} is at ${venueDisplay} on ${event.date}.\n\nFound it on Village Foodie 🚚:\n${shareUrl}`;
    const shareData = { title: `${event.truckName} at ${venueDisplay}`, text: shareText };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        throw new Error('Native share not supported');
      }
    } catch (err) {
      alert('Could not share. Please copy the URL manually!');
    }
  }

  // --- CALENDAR LOGIC ---
  function handleCalendarSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const action = e.target.value;
    e.target.value = ''; 
    if (action === 'google') window.open(getGoogleLink(event), '_blank');
    else if (action === 'outlook_web') window.open(getOutlookLink(event), '_blank');
    else if (action === 'ics') downloadICS(event);
  }

  // --- RENDER HELPERS ---
  const distDisplayBadge = distanceMiles ? (
    <div className="mt-1 flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-md py-1 w-full shadow-sm">
      <span className="text-[10px] font-bold text-slate-600 leading-none">{distanceMiles.toFixed(1)}</span>
      <span className="text-[8px] font-medium text-slate-500 leading-none lowercase mt-0.5">miles</span>
    </div>
  ) : null;

  const distDisplayText = distanceMiles ? (
    <span className="text-[9px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap">
        {distanceMiles.toFixed(1)} miles away
    </span>
  ) : null;

  return (
    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
        
        {/* === MOBILE LAYOUT === */}
        <div className="flex gap-3 md:hidden">
            <div className="flex flex-col items-center gap-1 shrink-0 w-10">
                <div className="bg-slate-50 h-10 w-10 rounded-full flex items-center justify-center text-xl shrink-0 border border-slate-100">
                    {isStatic ? '🍽️' : '🚚'}
                </div>
                {distDisplayBadge}
            </div>
            
            <div className="min-w-0 flex-1 flex flex-col">
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-slate-900 text-base leading-tight pr-2">
                        {event.websiteUrl ? (
                            <a href={event.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:text-orange-700 hover:underline decoration-2 underline-offset-2 transition-colors">
                                {event.truckName}
                            </a>
                        ) : event.truckName}
                    </h3>
                    {event.type && event.type !== 'Mobile' && !isStatic && (
                    <span className="text-[10px] font-bold text-orange-900 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap shrink-0">
                        {getCuisineEmoji(event.type)} {event.type}
                    </span>
                    )}
                </div>

                <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-slate-600 text-xs font-medium truncate">{venueDisplay}</p>
                </div>

                <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] font-bold text-orange-800 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100 whitespace-nowrap">{event.startTime} - {event.endTime}</span>
                    
                    <a href={mapLink} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline decoration-slate-300 underline-offset-2 transition-colors">
                        Directions
                    </a>
                </div>

                <div className="mt-3 flex items-center gap-2">
                    {event.menuUrl && (
                        <a href={event.menuUrl} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-slate-900 py-2 px-4 rounded-md shadow-sm h-9 transition-colors hover:bg-slate-800">
                            <span>📸</span> View Menu
                        </a>
                    )}
                    <button onClick={handleShare} className="flex items-center justify-center bg-slate-100 text-slate-600 rounded-md shadow-sm h-9 w-9 shrink-0 hover:bg-orange-600 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    </button>
                    <div className="relative group shrink-0">
                        <button className="flex items-center justify-center bg-slate-100 text-slate-600 rounded-md shadow-sm h-9 w-9 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </button>
                        <select className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleCalendarSelect} value="">
                            <option value="" disabled>Select Calendar...</option>
                            <option value="google">Google Calendar (Web)</option>
                            <option value="outlook_web">Outlook.com (Web)</option>
                            <option value="ics">Apple / Mobile / Outlook</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        {/* === DESKTOP LAYOUT === */}
        <div className="hidden md:flex gap-3 items-start">
            <div className="bg-slate-50 h-10 w-10 rounded-full flex items-center justify-center text-xl shrink-0 border border-slate-100 mt-1">
                {isStatic ? '🍽️' : '🚚'}
            </div>
            
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-0.5 pr-2">
                        <h3 className="font-bold text-slate-900 text-base leading-none !m-0 !p-0">
                            {event.websiteUrl ? (
                                <a href={event.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:text-orange-700 hover:underline decoration-2 underline-offset-2 transition-colors">{event.truckName}</a>
                            ) : event.truckName}
                        </h3>
                        <p className="text-slate-600 text-xs font-medium leading-none !m-0 !p-0 mt-1">{venueDisplay}</p>
                        
                        <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[10px] font-bold text-orange-800 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100 whitespace-nowrap">{event.startTime} - {event.endTime}</span>
                            
                            <a href={mapLink} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline decoration-slate-300 underline-offset-2 transition-colors">
                                Directions
                            </a>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                        {event.type && event.type !== 'Mobile' && !isStatic && (
                            <span className="text-xs font-bold text-orange-900 bg-orange-100 border border-orange-200 px-2 py-1 rounded-md shadow-sm flex items-center gap-1">
                                <span>{getCuisineEmoji(event.type)}</span>
                                <span>{event.type}</span>
                            </span>
                        )}
                        {distDisplayText}
                    </div>
                </div>

                {event.notes && (
                    <div className="mt-2 flex items-start gap-1">
                        <span className="text-[10px] leading-4 opacity-70">ℹ️</span>
                        <span className="text-[10px] text-slate-600 font-medium italic">{event.notes}</span>
                    </div>
                )}

                <div className="mt-3 flex flex-col gap-2">
                    {event.menuUrl && (
                        <div className="mb-0">
                            <a href={event.menuUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 w-full text-[10px] font-bold text-white bg-slate-900 hover:bg-slate-800 py-1.5 px-4 rounded-md transition-colors shadow-sm">
                                <span>📸</span> View Menu
                            </a>
                        </div>
                    )}
                    <div className="flex gap-2 justify-end">
                        <button onClick={handleShare} className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-orange-600 hover:text-white text-slate-600 text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors shadow-sm">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                            Share
                        </button>
                        <div className="relative group">
                            <button className="flex items-center justify-center gap-1 bg-slate-100 group-hover:bg-orange-600 group-hover:text-white text-slate-600 text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors shadow-sm">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                Add to Cal
                            </button>
                            <select className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleCalendarSelect} value="">
                                <option value="" disabled>Select Calendar...</option>
                                <option value="google">Google Calendar (Web)</option>
                                <option value="outlook_web">Outlook.com (Web)</option>
                                <option value="ics">Apple / Mobile / Outlook</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}