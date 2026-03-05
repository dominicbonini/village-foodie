import { VillageEvent } from '@/types';
import { 
    getCuisineEmoji, 
    getGoogleLink, 
    getOutlookLink, 
    downloadICS,
    formatFriendlyDate
  } from '@/lib/utils';

interface EventListCardProps {
  event: VillageEvent;
  distanceMiles?: number | null;
  isMapPopup?: boolean; // Controls whether to show the outer box
}

export default function EventListCard({ event, distanceMiles, isMapPopup = false }: EventListCardProps) {
  const isStatic = event.type?.toLowerCase().includes('static');
  
// --- VENUE FORMATTING ---
const venueDisplay = event.village && 
!event.venueName.toLowerCase().includes(event.village.toLowerCase())
  ? `${event.venueName} - ${event.village}`
  : event.venueName;

// --- SMART NAVIGATION LOGIC ---
const venuePostcode = event.postcode || ''; 
const addressQuery = [venueDisplay, venuePostcode].filter(Boolean).join(', ');
const safeQuery = encodeURIComponent(addressQuery || 'Event Location');

  const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh|Mac OS X/i.test(navigator.userAgent);
  const mapLink = isApple
    ? `http://maps.apple.com/?daddr=${safeQuery}&dirflg=d` 
    : `https://www.google.com/maps/dir/?api=1&destination=${safeQuery}`;

// --- SHARE LOGIC ---
async function handleShare() {
    const displayUrl = 'villagefoodie.co.uk'; 
    const cuisine = event.type ? getCuisineEmoji(event.type) : '🍴';
    const introEmoji = cuisine !== '🍴' ? cuisine : '🤤';
    const foodName = event.type && event.type !== 'Mobile' ? event.type : 'street food';
    
    const friendlyDate = formatFriendlyDate(event.date).replace(' - ', ' '); 
    let dateSentence = '';
    
    if (friendlyDate.startsWith('Today')) dateSentence = 'today'; 
    else if (friendlyDate.startsWith('Tomorrow')) dateSentence = friendlyDate.replace('Tomorrow', 'tomorrow'); 
    else dateSentence = `on ${friendlyDate}`; 

    let menuText = '';
    if (event.menuUrl) {
      const cleanMenuUrl = event.menuUrl.replace(/^https?:\/\/(www\.)?/, '');
      menuText = `\n\nCheck out the menu: ${cleanMenuUrl}`; 
    }

    const shareText = `Fancy some ${foodName}? ${introEmoji}\n\n${event.truckName} is at ${venueDisplay} ${dateSentence} from ${event.startTime} to ${event.endTime}.${menuText}\n\nFound on ${displayUrl} 🚚`;
    const shareData = { title: `${event.truckName} at ${venueDisplay}`, text: shareText };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareText);
        alert('Event details copied to clipboard! 📋');
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message.includes('abort')) return;
      console.error('Share failed:', err);
    }
  }

// --- CALENDAR LOGIC ---
function handleCalendarSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const action = e.target.value;
    e.target.value = ''; 
    const calendarEvent = { ...event, venueName: addressQuery };

    if (action === 'google') window.open(getGoogleLink(calendarEvent), '_blank');
    else if (action === 'outlook_web') window.open(getOutlookLink(calendarEvent), '_blank');
    else if (action === 'ics') downloadICS(calendarEvent);
  }

  // === UNIFIED TIGHT CONTENT ===
  const cardContent = (
    <div className="flex gap-3 items-start w-full min-w-0 font-sans">
        
        {/* LEFT COLUMN: ICON & MOBILE DISTANCE */}
        <div className="flex flex-col items-center shrink-0 w-10">
            <div className="bg-slate-50 h-10 w-10 rounded-full flex items-center justify-center text-xl shrink-0 border border-slate-100 mt-1">
                {isStatic ? '🍽️' : '🚚'}
            </div>
            {/* Mobile-only distance badge (stacks under icon) */}
            {distanceMiles != null && (
                <div className="mt-1.5 flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-md py-1 w-full shadow-sm md:hidden">
                    <span className="text-[10px] font-bold text-slate-600 leading-none">{distanceMiles.toFixed(1)}</span>
                    <span className="text-[8px] font-medium text-slate-500 leading-none lowercase mt-0.5">miles</span>
                </div>
            )}
        </div>
        
        {/* RIGHT COLUMN: MAIN CONTENT */}
        <div className="flex-1 min-w-0 flex flex-col">
            
            {/* Header: Title & Location perfectly stacked, Badges on right */}
            <div className="flex justify-between items-start">
                
                <div className="flex flex-col gap-0.5 pr-2 min-w-0">
                    <h3 className="font-bold text-slate-900 text-base leading-none !m-0 !p-0 truncate pt-0.5">
                        {event.websiteUrl ? (
                            <a href={event.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:text-orange-700 hover:underline transition-colors">
                                {event.truckName}
                            </a>
                        ) : event.truckName}
                    </h3>
                    {/* DIV blocks Leaflet CSS from injecting margins */}
                    <div className="text-slate-600 text-xs font-medium leading-none !m-0 !p-0 mt-0.5 truncate">
                        {venueDisplay}
                    </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                    {/* Cuisine Badge */}
                    {event.type && event.type !== 'Mobile' && !isStatic && (
                        <span className="text-[10px] font-bold text-orange-900 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap flex items-center gap-1">
                            <span>{getCuisineEmoji(event.type)}</span>
                            <span>{event.type}</span>
                        </span>
                    )}
                    {/* Desktop-only distance badge (top right) */}
                    {distanceMiles != null && (
                        <span className="hidden md:flex text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded whitespace-nowrap mt-0.5 shadow-sm">
                            {distanceMiles.toFixed(1)} miles away
                        </span>
                    )}
                </div>
            </div>

            {/* Time & Directions */}
            <div className="flex items-center gap-3 mt-1 shrink-0">
                <span className="text-[10px] font-bold text-orange-900 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                    {event.startTime} - {event.endTime}
                </span>
                <a href={mapLink} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline decoration-slate-300 underline-offset-2 transition-colors">
                    Directions
                </a>
            </div>

            {/* Full Width Stack (Order, Notes, Menu) */}
            <div className="mt-1.5 flex flex-col gap-1.5 w-full min-w-0 shrink-0">
                
                {/* Order Info */}
                {event.orderInfo && (
                    <div className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-md flex items-center justify-center shrink-0 min-w-0">
                        <div className="text-slate-600 text-[11px] font-medium leading-tight text-center truncate w-full !m-0 !p-0">
                            {event.orderInfo}
                        </div>
                    </div>
                )}

                {/* Truck-level Notes */}
                {event.notes && (
                    <div className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-md flex items-center justify-center shrink-0 min-w-0">
                        <div className="text-slate-600 text-[11px] font-medium leading-tight italic text-center truncate w-full !m-0 !p-0">
                            {event.notes}
                        </div>
                    </div>
                )}

                {/* Event-level Notes */}
                {event.eventNotes && (
                    <div className="w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-md flex items-center justify-center shrink-0 min-w-0">
                        <div className="text-slate-600 text-[11px] font-medium leading-tight italic text-center truncate w-full !m-0 !p-0">
                            {event.eventNotes}
                        </div>
                    </div>
                )}

                {event.menuUrl && (
                    <div className="mb-0 shrink-0">
                        <a href={event.menuUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 w-full text-[10px] font-bold text-white bg-slate-900 hover:bg-slate-800 py-1.5 px-4 rounded-md transition-colors shadow-sm min-w-0">
                            <span>📸</span> View Menu
                        </a>
                    </div>
                )}
                
                {/* Action Buttons */}
                <div className="flex gap-2 justify-end mt-0.5 shrink-0">
                    <button onClick={handleShare} className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-orange-600 hover:text-white text-slate-600 text-[10px] font-bold py-1.5 px-3 rounded-md transition-colors shadow-sm">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                        Share
                    </button>
                    <div className="relative group shrink-0">
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
  );

  // Map Popup Mode
  if (isMapPopup) {
      return cardContent;
  }

  // Standard List Mode
  return (
    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden min-w-0">
        {cardContent}
    </div>
  );
}