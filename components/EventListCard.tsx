import { usePostHog } from 'posthog-js/react';
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
  isMapPopup?: boolean;
}

// 🌐 ADVANCED LINK RENDERER
const renderTextWithLinks = (text: string) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (urlRegex.test(part)) {
         const href = part.startsWith('www.') ? `https://${part}` : part;
         return (
           <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">
               {part.replace(/^https?:\/\//, '')}
           </a>
         );
      }
      return <span key={i}>{part}</span>;
    });
};

export default function EventListCard({ event, distanceMiles, isMapPopup = false }: EventListCardProps) {
  const posthog = usePostHog();
  
  const isStatic = event.type?.toLowerCase().includes('static');
  
  const venueDisplay = event.village && !event.venueName.toLowerCase().includes(event.village.toLowerCase())
    ? `${event.venueName} - ${event.village}`
    : event.venueName;

  const venuePostcode = event.postcode || ''; 
  const addressQuery = [venueDisplay, venuePostcode].filter(Boolean).join(', ');
  const safeQuery = encodeURIComponent(addressQuery || 'Event Location');

  const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh|Mac OS X/i.test(navigator.userAgent);
  const mapLink = isApple
    ? `http://maps.apple.com/?daddr=${safeQuery}&dirflg=d` 
    : `https://www.google.com/maps/dir/?api=1&destination=${safeQuery}`;

  async function handleShare() {
      if (posthog) {
        posthog.capture('clicked_share', {
          truck_name: event.truckName,
          venue: venueDisplay
        });
      }

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

  function handleCalendarSelect(e: React.ChangeEvent<HTMLSelectElement>) {
      const action = e.target.value;
      e.target.value = ''; 
      
      if (posthog) {
        posthog.capture('clicked_add_to_calendar', {
          calendar_type: action,
          truck_name: event.truckName,
          venue: venueDisplay
        });
      }

      const calendarEvent = { ...event, venueName: addressQuery };

      if (action === 'google') window.open(getGoogleLink(calendarEvent), '_blank');
      else if (action === 'outlook_web') window.open(getOutlookLink(calendarEvent), '_blank');
      else if (action === 'ics') downloadICS(calendarEvent);
  }

  const methodsStr = event.acceptedMethods ? event.acceptedMethods.toLowerCase() : '';
  
  // Clean phone number for links
  const cleanPhone = event.phoneNumber ? event.phoneNumber.replace(/[^\d+]/g, '') : '';
  
  let waPhone = cleanPhone.replace('+', '');
  if (waPhone.startsWith('0')) {
      waPhone = '44' + waPhone.slice(1);
  }
  
  const hasPhone = cleanPhone !== '';
  const isMobileNumber = waPhone.startsWith('447');

  const cleanVenuePhone = event.venuePhone ? event.venuePhone.replace(/[^\d+]/g, '') : '';
  const hasVenuePhone = cleanVenuePhone !== '';
  
  const targetPhoneToCall = hasPhone ? cleanPhone : cleanVenuePhone;
  const showCallButton = hasPhone || hasVenuePhone;
  const callButtonLabel = hasPhone ? "📞 Call" : "📞 Call Venue";

  let orderDateText = 'today';
  if (event.date) {
      const parts = event.date.split('/');
      if (parts.length === 3) {
          const eDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          
          if (!isNaN(eDate.getTime())) {
              const today = new Date();
              today.setHours(0,0,0,0);
              
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);

              if (eDate.getTime() === today.getTime()) {
                  orderDateText = 'today';
              } else if (eDate.getTime() === tomorrow.getTime()) {
                  orderDateText = 'tomorrow';
              } else {
                  orderDateText = 'on ' + eDate.toLocaleDateString('en-GB', { weekday: 'long' });
              }
          }
      }
  }

  const orderMessage = encodeURIComponent(`Hi! I saw you are at ${venueDisplay} ${orderDateText}. I found you on Village Foodie 🚚. Could I please order...`);
  
  const smsDivider = isApple ? '&' : '?';

  const trackOrderClick = (method: string) => {
      if (posthog) {
          posthog.capture('clicked_contact_button', {
              method: method, 
              truck_name: event.truckName,
              venue: venueDisplay,
              village: event.village,
              cuisine: event.type
          });
      }
  };

  const wantsWebsite = methodsStr.includes('website');
  const acceptsWhatsApp = methodsStr.includes('whatsapp');

  const showWebsite = wantsWebsite || (!methodsStr && event.orderUrl && event.orderUrl.includes('http'));

  // --- BUTTON RENDERERS ---
  const MenuBtn = event.menuUrl ? (
    <a href={event.menuUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackOrderClick('Menu')} className={`${isMapPopup ? 'w-full' : 'flex-1'} flex items-center justify-center text-center gap-1 text-[11px] font-bold !text-white !bg-slate-900 hover:!bg-slate-800 py-2 px-1 rounded-md transition-colors shadow-sm !no-underline whitespace-nowrap`}>
        <span>📸</span> View Menu
    </a>
  ) : null;

  const ContactBtns = (
    <>
        {showWebsite && event.orderUrl && event.orderUrl.includes('http') && (
            <a href={event.orderUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackOrderClick('Website')} className="flex-1 flex items-center justify-center text-center gap-1 !bg-orange-600 hover:!bg-orange-700 !text-white !no-underline text-[11px] font-bold py-2 px-1 rounded-md transition-colors shadow-sm whitespace-nowrap">
                🌐 Order
            </a>
        )}
        
        {showCallButton && (
            <a href={`tel:${targetPhoneToCall}`} onClick={() => trackOrderClick('Call')} className="flex-1 flex items-center justify-center text-center gap-1 !bg-orange-600 hover:!bg-orange-700 !text-white !no-underline text-[11px] font-bold py-2 px-1 rounded-md transition-colors shadow-sm whitespace-nowrap">
                {callButtonLabel}
            </a>
        )}

        {hasPhone && isMobileNumber && acceptsWhatsApp && (
            <a href={`https://wa.me/${waPhone}?text=${orderMessage}`} target="_blank" rel="noopener noreferrer" onClick={() => trackOrderClick('WhatsApp')} className="flex-1 flex items-center justify-center text-center gap-1 !bg-orange-600 hover:!bg-orange-700 !text-white !no-underline text-[11px] font-bold py-2 px-1 rounded-md transition-colors shadow-sm whitespace-nowrap">
                💬 Message
            </a>
        )}

        {hasPhone && isMobileNumber && !acceptsWhatsApp && (
            <a href={`sms:${cleanPhone}${smsDivider}body=${orderMessage}`} onClick={() => trackOrderClick('Text')} className="flex-1 flex items-center justify-center text-center gap-1 !bg-orange-600 hover:!bg-orange-700 !text-white !no-underline text-[11px] font-bold py-2 px-1 rounded-md transition-colors shadow-sm whitespace-nowrap">
                💬 Message
            </a>
        )}
    </>
  );

// === UNIFIED TIGHT CONTENT ===
const cardContent = (
    <div className="flex gap-3 items-start w-full min-w-0 font-sans">
        
        {/* 👇 FIX: w-12 on mobile (48px), md:w-16 on desktop (64px) 👇 */}
        <div className="flex flex-col items-center shrink-0 w-12 md:w-16">
            
            {event.logoUrl ? (
                <img 
                    src={event.logoUrl} 
                    alt={`${event.truckName} logo`} 
                    // 👇 FIX: Responsive heights and widths added here 👇
                    className="bg-white h-12 w-12 md:h-16 md:w-16 rounded-full object-cover shrink-0 border border-slate-200 mt-1 shadow-sm transition-all"
                    loading="lazy"
                />
            ) : (
                // 👇 FIX: Fallback emoji circle made responsive to match 👇
                <div className="bg-slate-50 h-12 w-12 md:h-16 md:w-16 rounded-full flex items-center justify-center text-2xl md:text-3xl shrink-0 border border-slate-100 mt-1 shadow-sm transition-all">
                    {isStatic ? '🍽️' : "\uD83D\uDE9A"}
                </div>
            )}
            
            {distanceMiles != null && (
                <div className="mt-1.5 flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-md py-1 w-full shadow-sm md:hidden">
                    <span className="text-[10px] font-bold text-slate-700 leading-none">{distanceMiles.toFixed(1)}</span>
                    <span className="text-[8px] font-medium text-slate-600 leading-none lowercase mt-0.5">miles</span>
                </div>
            )}
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col">
            
            <div className="flex justify-between items-start">
                <div className="flex flex-col gap-0 min-w-0 pr-2">
                    <h3 className="font-bold text-slate-900 text-base leading-tight !m-0 !p-0 truncate">
                        {event.orderUrl && wantsWebsite ? (
                            <a href={event.orderUrl} target="_blank" rel="noopener noreferrer" className="hover:text-orange-700 hover:underline transition-colors">
                                {event.truckName}
                            </a>
                        ) : event.truckName}
                    </h3>
                    <div className="text-slate-600 text-xs font-medium leading-tight !m-0 !p-0 truncate">
                        {venueDisplay}
                    </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                    {event.type && event.type !== 'Mobile' && !isStatic && (
                        <div className="flex flex-col gap-1 items-end">
                            {event.type.split(',').map((cuisineTag, idx) => {
                                const cleanCuisine = cuisineTag.trim();
                                if (!cleanCuisine) return null;
                                return (
                                    <span key={idx} className="text-[10px] font-bold text-orange-900 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap flex items-center gap-1">
                                        <span>{getCuisineEmoji(cleanCuisine)}</span>
                                        <span className="capitalize">{cleanCuisine}</span>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    {distanceMiles != null && (
                        <span className="hidden md:flex text-[9px] font-bold text-slate-700 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded whitespace-nowrap mt-0.5 shadow-sm">
                            {distanceMiles.toFixed(1)} miles away
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 mt-1.5 shrink-0">
                <span className="text-[10px] font-bold text-orange-900 bg-orange-100 border border-orange-200 px-2 py-1 rounded-md shadow-sm whitespace-nowrap">
                    {event.startTime} - {event.endTime}
                </span>
                <a href={mapLink} target="_blank" rel="noopener noreferrer" onClick={() => {if(posthog){posthog.capture('clicked_directions', {truck_name: event.truckName})}}} className="flex items-center gap-1 text-[10px] font-bold text-slate-700 hover:text-orange-600 underline decoration-slate-300 underline-offset-2 hover:decoration-orange-600 transition-colors !no-underline">
                    📍 Directions
                </a>
            </div>

            <div className="mt-1.5 flex flex-col gap-1.5 w-full min-w-0 shrink-0">
                
                {event.notes && (
                    <div className="w-full bg-slate-50 border border-slate-200 border-l-4 border-l-orange-500 px-2.5 py-2 rounded-r-md flex items-start shrink-0 min-w-0 shadow-sm">
                        <div className="text-slate-700 text-[11px] font-semibold leading-tight w-full !m-0 !p-0">
                            {renderTextWithLinks(event.notes)}
                        </div>
                    </div>
                )}
                {event.eventNotes && (
                    <div className="w-full bg-slate-50 border border-slate-200 border-l-4 border-l-orange-500 px-2.5 py-2 rounded-r-md flex items-start shrink-0 min-w-0 shadow-sm">
                        <div className="text-slate-700 text-[11px] font-semibold leading-tight w-full !m-0 !p-0">
                            ⭐ {renderTextWithLinks(event.eventNotes)}
                        </div>
                    </div>
                )}

                {(event.menuUrl || showWebsite || showCallButton) && (
                    isMapPopup ? (
                        <div className="flex flex-col gap-1.5 w-full min-w-0 shrink-0 mt-0.5">
                            {MenuBtn}
                            {(showWebsite || showCallButton) && (
                                <div className="flex w-full gap-1.5">
                                    {ContactBtns}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex w-full gap-1.5 min-w-0 shrink-0 mt-0.5">
                            {MenuBtn}
                            {ContactBtns}
                        </div>
                    )
                )}
                
                <div className="flex gap-2 justify-end shrink-0 mt-0.5">
                    <button onClick={handleShare} className="flex items-center justify-center gap-1 bg-slate-50 border border-slate-200 hover:bg-orange-50 hover:border-orange-200 text-slate-700 hover:text-orange-600 text-[10px] font-bold py-1.5 px-3 rounded-md transition-all shadow-sm">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                        Share
                    </button>
                    <div className="relative group shrink-0">
                        <button className="flex items-center justify-center gap-1 bg-slate-50 border border-slate-200 group-hover:bg-orange-50 group-hover:border-orange-200 text-slate-700 group-hover:text-orange-600 text-[10px] font-bold py-1.5 px-3 rounded-md transition-all shadow-sm">
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

  if (isMapPopup) {
      return cardContent;
  }

  const dateIdPart = event.date ? event.date.replace(/\//g, '-') : '';
  const rawIdString = `${event.truckName}-${event.venueName}-${dateIdPart}`;
  const safeAnchorId = rawIdString.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  return (
    <div id={safeAnchorId} className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden min-w-0">
        {cardContent}
    </div>
  );
}