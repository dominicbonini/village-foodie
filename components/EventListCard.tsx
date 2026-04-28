import { usePostHog } from 'posthog-js/react';
import { VillageEvent } from '@/types';
import Link from 'next/link';
import { 
    getCuisineEmoji, 
    getGoogleLink, 
    getOutlookLink, 
    downloadICS,
    formatFriendlyDate,
    createSlug,
    getVenueSlug,
    getDistanceKm 
  } from '@/lib/utils';

interface EventListCardProps {
  events: VillageEvent[]; 
  userLocation?: { lat: number; long: number } | null;
  isMapPopup?: boolean;
  venueStatsMap?: Record<string, { eventCount: number; uniqueTrucks: number }>; 
  isVenuePage?: boolean; 
}

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

export default function EventListCard({ events, userLocation, isMapPopup = false, venueStatsMap, isVenuePage = false }: EventListCardProps) {
  const posthog = usePostHog();
  
  const primaryEvent = events[0];
  if (!primaryEvent) return null;

  const isStatic = primaryEvent.type?.toLowerCase().includes('static');
  const isMulti = events.length > 1; 

  async function handleShare(ev: VillageEvent, venueDisplay: string) {
      if (posthog) {
        posthog.capture('clicked_share', { truck_name: ev.truckName, venue: venueDisplay });
      }

      const displayUrl = 'villagefoodie.co.uk'; 
      const cuisine = ev.type ? getCuisineEmoji(ev.type) : '🍴';
      const introEmoji = cuisine !== '🍴' ? cuisine : '🤤';
      const foodName = ev.type && ev.type !== 'Mobile' ? ev.type : 'street food';
      const friendlyDate = formatFriendlyDate(ev.date).replace(' - ', ' '); 
      
      let dateSentence = '';
      if (friendlyDate.startsWith('Today')) dateSentence = 'today'; 
      else if (friendlyDate.startsWith('Tomorrow')) dateSentence = friendlyDate.replace('Tomorrow', 'tomorrow'); 
      else dateSentence = `on ${friendlyDate}`; 

      let menuText = '';
      if (ev.menuUrl) {
        const cleanMenuUrl = ev.menuUrl.replace(/^https?:\/\/(www\.)?/, '');
        menuText = `\n\nCheck out the menu: ${cleanMenuUrl}`; 
      }

      const shareText = `Fancy some ${foodName}? ${introEmoji}\n\n${ev.truckName} is at ${venueDisplay} ${dateSentence} from ${ev.startTime} to ${ev.endTime}.${menuText}\n\nFound on ${displayUrl} 🚚`;
      const shareData = { title: `${ev.truckName} at ${venueDisplay}`, text: shareText };

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

  function handleCalendarSelect(e: React.ChangeEvent<HTMLSelectElement>, ev: VillageEvent, addressQuery: string, venueDisplay: string) {
      const action = e.target.value;
      e.target.value = ''; 
      
      if (posthog) {
        posthog.capture('clicked_add_to_calendar', { calendar_type: action, truck_name: ev.truckName, venue: venueDisplay });
      }

      const calendarEvent = { ...ev, venueName: addressQuery };

      if (action === 'google') window.open(getGoogleLink(calendarEvent), '_blank');
      else if (action === 'outlook_web') window.open(getOutlookLink(calendarEvent), '_blank');
      else if (action === 'ics') downloadICS(calendarEvent);
  }

  const methodsStr = primaryEvent.acceptedMethods ? primaryEvent.acceptedMethods.toLowerCase() : '';
  const cleanPhone = primaryEvent.phoneNumber ? primaryEvent.phoneNumber.replace(/[^\d+]/g, '') : '';
  let waPhone = cleanPhone.replace('+', '');
  if (waPhone.startsWith('0')) waPhone = '44' + waPhone.slice(1);
  const hasPhone = cleanPhone !== '';
  const isMobileNumber = waPhone.startsWith('447');

  const cleanVenuePhone = primaryEvent.venuePhone ? primaryEvent.venuePhone.replace(/[^\d+]/g, '') : '';
  const hasVenuePhone = cleanVenuePhone !== '';

  const trackOrderClick = (method: string, ev: VillageEvent, venueDisplay: string) => {
      if (posthog) {
          posthog.capture('clicked_contact_button', {
              method: method, 
              truck_name: ev.truckName,
              venue: venueDisplay,
              village: ev.village,
              cuisine: ev.type
          });
      }
  };

  const wantsWebsite = methodsStr.includes('website');
  const acceptsWhatsApp = methodsStr.includes('whatsapp');
  const showWebsite = wantsWebsite || (!methodsStr && primaryEvent.orderUrl && primaryEvent.orderUrl.includes('http'));

  const PrimaryBtnClass = "flex-1 flex items-center justify-center text-center gap-1 !bg-orange-600 hover:!bg-orange-700 !text-white !no-underline text-[11px] font-bold py-2 px-1 rounded-md transition-colors shadow-sm whitespace-nowrap";
  const UtilityLinkClass = "flex items-center justify-center gap-1 text-slate-700 hover:text-orange-600 text-[10px] font-bold py-0.5 px-1.5 transition-colors whitespace-nowrap bg-transparent cursor-pointer";

  const MenuBtn = primaryEvent.menuUrl ? (
    <a href={primaryEvent.menuUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackOrderClick('Menu', primaryEvent, primaryEvent.venueName)} className={`${isMapPopup ? 'w-full' : 'flex-1'} flex items-center justify-center text-center gap-1 text-[11px] font-bold !text-white !bg-slate-900 hover:!bg-slate-800 py-2 px-1 rounded-md transition-colors shadow-sm !no-underline whitespace-nowrap`}>
        <span>📸</span> View Menu
    </a>
  ) : null;

  const getOrderMessage = (ev: VillageEvent, venueDisplay: string) => {
      let orderDateText = 'today';
      if (ev.date) {
          const parts = ev.date.split('/');
          if (parts.length === 3) {
              const eDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
              if (!isNaN(eDate.getTime())) {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                  if (eDate.getTime() === today.getTime()) orderDateText = 'today';
                  else if (eDate.getTime() === tomorrow.getTime()) orderDateText = 'tomorrow';
                  else orderDateText = 'on ' + eDate.toLocaleDateString('en-GB', { weekday: 'long' });
              }
          }
      }
      return encodeURIComponent(`Hi! I saw you are at ${venueDisplay} ${orderDateText}. I found you on Village Foodie 🚚. Could I please order...`);
  };

  const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh|Mac OS X/i.test(navigator.userAgent);
  const smsDivider = isApple ? '&' : '?';

  const ContactBtns = (ev: VillageEvent, venueDisplay: string) => (
    <>
        {showWebsite && ev.orderUrl && ev.orderUrl.includes('http') && (
            <a href={ev.orderUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackOrderClick('Website', ev, venueDisplay)} className={PrimaryBtnClass}>
                🌐 Order
            </a>
        )}
        {hasPhone && (
            <a href={`tel:${cleanPhone}`} onClick={() => trackOrderClick('Call Truck', ev, venueDisplay)} className={PrimaryBtnClass}>
                📞 Call
            </a>
        )}
        {hasPhone && isMobileNumber && acceptsWhatsApp && (
            <a href={`https://wa.me/${waPhone}?text=${getOrderMessage(ev, venueDisplay)}`} target="_blank" rel="noopener noreferrer" onClick={() => trackOrderClick('WhatsApp', ev, venueDisplay)} className={PrimaryBtnClass}>
                💬 Message
            </a>
        )}
        {hasPhone && isMobileNumber && !acceptsWhatsApp && (
            <a href={`sms:${cleanPhone}${smsDivider}body=${getOrderMessage(ev, venueDisplay)}`} onClick={() => trackOrderClick('Text', ev, venueDisplay)} className={PrimaryBtnClass}>
                💬 Message
            </a>
        )}
    </>
  );

  const cardContent = (
    <div className="flex flex-col w-full min-w-0 font-sans">
        
        {/* 👇 UPDATED: Even tighter gap-1.5 when in map popup */}
        <div className={`flex ${isMapPopup ? 'gap-1.5' : 'gap-3'} items-start w-full min-w-0`}>
            
            {/* 👇 UPDATED: Logo shrunk to 48px in map popup */}
            <div className={`flex flex-col items-center shrink-0 ${isMapPopup ? 'w-[48px]' : 'w-[64px] md:w-[72px]'} pt-1`}>
                {primaryEvent.logoUrl ? (
                    <img 
                        src={primaryEvent.logoUrl} 
                        alt={`${primaryEvent.truckName} logo`} 
                        className={`bg-white ${isMapPopup ? 'h-[48px] w-[48px]' : 'h-[64px] w-[64px] md:h-[72px] md:w-[72px]'} rounded-full object-cover shrink-0 border border-slate-200 shadow-sm transition-all`} 
                        loading="lazy" 
                    />
                ) : (
                    <div className={`bg-slate-50 ${isMapPopup ? 'h-[48px] w-[48px] text-lg' : 'h-[64px] w-[64px] md:h-[72px] md:w-[72px] text-2xl md:text-3xl'} rounded-full flex items-center justify-center shrink-0 border border-slate-100 shadow-sm transition-all`}>
                        {isStatic ? '🍽️' : "\uD83D\uDE9A"}
                    </div>
                )}
            </div>
            
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 pt-1">
                <h3 className="font-bold text-slate-900 text-[15px] leading-none !m-0 !p-0 truncate pr-1">
                    {primaryEvent.websiteUrl ? (
                    <a href={primaryEvent.websiteUrl.startsWith('http') ? primaryEvent.websiteUrl : `https://${primaryEvent.websiteUrl}`} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-1.5 min-w-0 cursor-pointer hover:underline hover:text-orange-600 transition-colors" title={`Visit ${primaryEvent.truckName}'s website or page`}>
                        {primaryEvent.truckName}
                    </a>
                    ) : (
                    <span className="text-slate-900">{primaryEvent.truckName}</span>
                    )}
                </h3>
                
                <div className="flex flex-col gap-2 mt-0.5">
                    {events.map((ev, idx) => {
                        const venueDisplay = ev.village && !ev.venueName.toLowerCase().includes(ev.village.toLowerCase()) ? `${ev.venueName} - ${ev.village}` : ev.venueName;
                        const venuePostcode = ev.postcode || ''; 
                        const addressQuery = [venueDisplay, venuePostcode].filter(Boolean).join(', ');
                        const safeQuery = encodeURIComponent(addressQuery || 'Event Location');
                        const mapLink = isApple ? `http://maps.apple.com/?daddr=${safeQuery}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=$?q=${safeQuery}`; 
                        
                        let distanceMiles: number | null = null;
                        if (userLocation && ev.venueLat && ev.venueLong) {
                            distanceMiles = getDistanceKm(userLocation.lat, userLocation.long, ev.venueLat, ev.venueLong) * 0.621371;
                        }

                        return (
                            <div key={ev.id} className={`flex flex-col gap-1 w-full ${idx > 0 ? 'pt-2.5 mt-0.5 border-t border-slate-100' : ''}`}>
                                {!isVenuePage && (
                                    <div className="flex items-center min-w-0 pr-1">
                                        {!isMapPopup ? (
                                            <Link href={`/venues/${getVenueSlug(ev.venueName, ev.village || '')}`} className="group flex items-center gap-1.5 min-w-0 cursor-pointer" title={`View venue details for ${ev.venueName}`}>
                                                <span className="text-slate-600 text-[13px] font-medium leading-tight group-hover:text-orange-600 transition-colors line-clamp-2">
                                                    {venueDisplay}
                                                </span>
                                            </Link>
                                        ) : (
                                            <span className="text-slate-600 text-[13px] font-medium leading-tight line-clamp-2">{venueDisplay}</span>
                                        )}
                                    </div>
                                )}
                                
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="text-[11px] font-bold text-slate-800 leading-none whitespace-nowrap">
                                        {ev.startTime} - {ev.endTime}
                                    </span>
                                    
                                    {!isVenuePage && (
                                        <a href={mapLink} target="_blank" rel="noopener noreferrer" onClick={() => {if(posthog){posthog.capture('clicked_directions', {truck_name: ev.truckName})}}} className="flex items-center gap-1 text-[10px] font-bold text-slate-700 hover:text-orange-600 transition-colors !no-underline cursor-pointer leading-none shrink-0">
                                            📍 <span className="underline decoration-slate-300 underline-offset-2 hover:decoration-orange-600">
                                                {distanceMiles != null ? `${distanceMiles.toFixed(1)} miles away` : 'Directions'}
                                            </span>
                                        </a>
                                    )}
                                </div>

                                {(ev.notes || ev.eventNotes) && (
                                    <div className="mt-1 flex flex-col gap-1 w-full min-w-0 shrink-0">
                                        {ev.notes && (
                                            <div className="w-full bg-slate-50 border border-slate-200 border-l-4 border-l-orange-500 px-2 py-1.5 rounded-r-md flex items-start shadow-sm">
                                                <div className="text-slate-700 text-[10px] font-semibold leading-tight w-full !m-0 !p-0">
                                                    {renderTextWithLinks(ev.notes)}
                                                </div>
                                            </div>
                                        )}
                                        {ev.eventNotes && (
                                            <div className="w-full bg-slate-50 border border-slate-200 border-l-4 border-l-orange-500 px-2 py-1.5 rounded-r-md flex items-start shadow-sm">
                                                <div className="text-slate-700 text-[10px] font-semibold leading-tight w-full !m-0 !p-0">
                                                    ⭐ {renderTextWithLinks(ev.eventNotes)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isMulti && (
                                    <div className="flex justify-end gap-3 min-w-0 shrink-0 mt-1">
                                        <div className="relative group">
                                            <button className={UtilityLinkClass}>
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                Add to Cal
                                            </button>
                                            <select className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleCalendarSelect(e, ev, addressQuery, venueDisplay)} value="">
                                                <option value="" disabled>Select Calendar...</option>
                                                <option value="google">Google Calendar (Web)</option>
                                                <option value="outlook_web">Outlook.com (Web)</option>
                                                <option value="ics">Apple / Mobile / Outlook</option>
                                            </select>
                                        </div>
                                        <button onClick={() => handleShare(ev, venueDisplay)} className={UtilityLinkClass}>
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                            Share
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 👇 UPDATED: Food photo shrunk to 48px square in map popup */}
            <div className={`flex flex-col items-end shrink-0 pt-1 ${isMapPopup ? '' : 'pl-1'}`}>
                {(primaryEvent as any).foodPhotoUrl ? (
                    <img 
                        src={(primaryEvent as any).foodPhotoUrl} 
                        alt={`${primaryEvent.truckName} food`} 
                        className={`${isMapPopup ? 'w-[48px] h-[48px]' : 'w-[96px] h-[64px] md:w-[108px] md:h-[72px]'} object-cover rounded-md shadow-sm border border-slate-200 shrink-0`} 
                        loading="lazy" 
                    />
                ) : (
                    primaryEvent.type && primaryEvent.type !== 'Mobile' && !isStatic && (
                        <div className="flex flex-col gap-1 items-end">
                            {primaryEvent.type.split(',').map((cuisineTag, idx) => {
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
                    )
                )}
            </div>
        </div>

        {(primaryEvent.menuUrl || showWebsite || hasPhone) && (
            isMapPopup ? (
                <div className="flex flex-col gap-1.5 w-full min-w-0 shrink-0 mt-2.5">
                    {MenuBtn}
                    {(showWebsite || hasPhone) && (
                        <div className="flex w-full gap-1.5">
                            {ContactBtns(primaryEvent, primaryEvent.venueName)}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex w-full gap-1.5 min-w-0 shrink-0 mt-3 pt-3 border-t border-slate-100">
                    {MenuBtn}
                    {ContactBtns(primaryEvent, primaryEvent.venueName)}
                </div>
            )
        )}
        
        {!isMulti && (
            <div className={`flex justify-end gap-3 min-w-0 shrink-0 mt-2 ${!primaryEvent.menuUrl && !showWebsite && !hasPhone ? 'pt-2 border-t border-slate-100' : ''}`}>
                {hasVenuePhone && (
                    <a href={`tel:${cleanVenuePhone}`} onClick={() => trackOrderClick('Call Venue', primaryEvent, primaryEvent.venueName)} className={UtilityLinkClass}>
                        📞 Call Venue
                    </a>
                )}
                <div className="relative group">
                    <button className={UtilityLinkClass}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Add to Cal
                    </button>
                    <select className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleCalendarSelect(e, primaryEvent, [primaryEvent.venueName, primaryEvent.postcode].filter(Boolean).join(', '), primaryEvent.venueName)} value="">
                        <option value="" disabled>Select Calendar...</option>
                        <option value="google">Google Calendar (Web)</option>
                        <option value="outlook_web">Outlook.com (Web)</option>
                        <option value="ics">Apple / Mobile / Outlook</option>
                    </select>
                </div>
                <button onClick={() => handleShare(primaryEvent, primaryEvent.venueName)} className={UtilityLinkClass}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    Share
                </button>
            </div>
        )}

    </div>
  );

  if (isMapPopup) return cardContent;

  const dateIdPart = primaryEvent.date ? primaryEvent.date.replace(/\//g, '-') : '';
  const rawIdString = `${primaryEvent.truckName}-${primaryEvent.venueName}-${dateIdPart}`;
  const safeAnchorId = rawIdString.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  return (
    <div id={safeAnchorId} className="bg-white p-3.5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden min-w-0">
        {cardContent}
    </div>
  );
}