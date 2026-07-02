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
  town?: string;
  postcode?: string;
  venueLat?: number;
  venueLong?: number;
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