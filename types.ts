export interface VillageEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  truckName: string;
  venueName: string;
  // 'open' = operator-STARTED/auto-opened = LIVE (live-redefinition); else Pre-order. Present on
  // operator truck_events (discovery feed maps it through); absent on scraped discovery events.
  status?: string;
  
  // --- LOCATION FIELDS ---
  village?: string;
  /** Canonical venue-page key. Set by /api/discovery/events from the LINKED venue row, so every event
   *  sharing a `venue_id` groups together whatever its own `village` text says. Absent for events the
   *  feed does not resolve a venue for — `venueGroupKey` falls back to name+village there. */
  venueSlug?: string;
  town?: string;
  postcode?: string;
  /** The event's two-letter state — only a US event saved with one (lib/event-address.ts). */
  region?: string;
  /** address-formats-1: the truck's address format key (lib/address-formats.ts) — how the card writes the area line. */
  addressFormat?: string;
  venueLat?: number;
  venueLong?: number;
  /** The event's country as `country_settings.short_name` ("UK", "Ireland") — for the directions link (lib/maps-links.ts). */
  countryName?: string;
  venuePhone?: string;
  venueWebsite?: string; 
  venuePhoto?: string; 
  
  // --- TRUCK DETAILS ---
  type?: string;
  websiteUrl?: string;
  menuUrl?: string;
  notes?: string;       // General Truck Notes
  eventNotes?: string;  // Specific Event Notes (From Events Tab)
  logoUrl?: string;
  foodPhotoUrl?: string; // 👈 NEW: Added for the food images!
  
  // --- STRUCTURED ORDER DATA ---
  phoneNumber?: string;
  orderUrl?: string;
  acceptedMethods?: string;
  orderInfo?: string;   // Keeping this for backwards compatibility
  source?: 'operator' | 'discovery';
  // Per-site order-link flags (operator events only). The listing gates the Order/Pre-order CTA by host:
  // HG uses orderLinkHg (default true), VF uses orderLinkVf (default false). See TruckListCard.
  orderLinkVf?: boolean;
  orderLinkHg?: boolean;
}