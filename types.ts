export interface VillageEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  truckName: string;
  venueName: string;
  notes?: string;
  orderInfo?: string; // <-- ADDED THIS LINE
  venueLat?: number;
  venueLong?: number;
  type?: string;
  websiteUrl?: string;
  menuUrl?: string;
  eventNotes?: string;  //
  // --- ADDED LOCATION FIELDS ---
  postcode?: string;
  village?: string;
  town?: string;
}