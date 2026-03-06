export interface VillageEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  truckName: string;
  venueName: string;
  
  // --- LOCATION FIELDS ---
  village?: string;
  town?: string;
  postcode?: string;
  venueLat?: number;
  venueLong?: number;
  
  // --- TRUCK DETAILS ---
  type?: string;
  websiteUrl?: string;
  menuUrl?: string;
  notes?: string;       // General Truck Notes
  eventNotes?: string;  // Specific Event Notes (From Events Tab)
  
  // --- STRUCTURED ORDER DATA ---
  phoneNumber?: string;
  orderUrl?: string;
  acceptedMethods?: string;
  orderInfo?: string;   // Keeping this for backwards compatibility
}