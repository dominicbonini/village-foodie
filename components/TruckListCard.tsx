'use client';

// Removed 'Link' import since the card is no longer clickable
import { createSlug, getGoogleLink, getOutlookLink, downloadICS } from '@/lib/utils';
import { VillageEvent } from '@/types';
import { usePostHog } from 'posthog-js/react';

export default function TruckListCard({ event }: { event: VillageEvent }) {
  const posthog = usePostHog();
  // venueSlug is no longer needed since we aren't linking to the venue, but kept for future proofing if needed.
  const showVillage = event.village && !event.venueName.toLowerCase().includes(event.village.toLowerCase());
  
  // SHARE HANDLER
  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();

    if (posthog) {
        posthog.capture('clicked_share', { truck_name: event.truckName, venue: event.venueName });
    }

    const shareText = `Catch ${event.truckName} at ${event.venueName} on ${event.date} from ${event.startTime} to ${event.endTime}!\n\nFound on villagefoodie.co.uk 🚚`;
    const shareData = { title: `${event.truckName} at ${event.venueName}`, text: shareText };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareText);
        alert('Event details copied to clipboard! 📋');
      }
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  // CALENDAR HANDLER
  function handleCalendarSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    e.preventDefault();
    e.stopPropagation();
    
    const action = e.target.value;
    e.target.value = ''; 
    
    if (posthog) {
      posthog.capture('clicked_add_to_calendar', { calendar_type: action, truck_name: event.truckName, venue: event.venueName });
    }

    if (action === 'google') window.open(getGoogleLink(event), '_blank');
    else if (action === 'outlook_web') window.open(getOutlookLink(event), '_blank');
    else if (action === 'ics') downloadICS(event);
  }

  return (
    // Changed from <Link> to a static <div>. Removed cursor-pointer and hover effects that imply it's a link.
    <div className="block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm relative">
      <div className="flex p-3 gap-3 items-start">
        
        {/* LEFT: STRICTLY FIXED IMAGE SIZE (140px wide x 104px tall) */}
        <div className="w-[140px] h-[104px] shrink-0 rounded-lg overflow-hidden border border-slate-100 shadow-inner bg-slate-100 relative">
          {event.venuePhoto ? (
            <img 
              src={event.venuePhoto} 
              alt={event.venueName} 
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl text-slate-400 absolute inset-0">
                📍
            </div>
          )}
        </div>
        
        {/* RIGHT: Text and Buttons Column */}
        <div className="flex-1 min-w-0 flex flex-col min-h-[104px] py-0.5">
            
            {/* Top Right: Venue Title */}
            <h3 className="font-black text-slate-900 text-base leading-tight tracking-tight line-clamp-2">
              {event.venueName}
            </h3>
            
            {/* Middle Right: Village & Time Grouped Together */}
            <div className="flex items-center gap-2 mt-1.5 w-full">
                {showVillage && (
                  <p className="text-[13px] font-semibold text-slate-500 truncate">
                    {event.village}
                  </p>
                )}
                <span className="bg-orange-100 text-orange-900 text-[10px] font-black px-2 py-1 rounded-md whitespace-nowrap shrink-0">
                  {event.startTime} - {event.endTime}
                </span>
            </div>
            
            {/* Bottom Right: Buttons pushed perfectly to the bottom */}
            <div className="mt-auto pt-2 flex justify-end gap-1.5 w-full">
                
                {/* Add to Cal Pill - WITH ORANGE HOVER STATES */}
                <div className="relative group shrink-0">
                    <button className="flex items-center justify-center gap-1 bg-slate-50 border border-slate-200 group-hover:bg-orange-50 group-hover:border-orange-200 text-slate-700 group-hover:text-orange-600 text-[10px] font-bold py-1.5 px-2.5 rounded-md shadow-sm transition-all">
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

                {/* Share Pill - WITH ORANGE HOVER STATES */}
                <button onClick={handleShare} className="shrink-0 flex items-center justify-center gap-1 bg-slate-50 border border-slate-200 hover:bg-orange-50 hover:border-orange-200 text-slate-700 hover:text-orange-600 text-[10px] font-bold py-1.5 px-2.5 rounded-md shadow-sm transition-all">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    Share
                </button>
                
            </div>

        </div>
      </div>
    </div>
  );
}