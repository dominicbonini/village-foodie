export interface VillageEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  truckName: string;
  venueName: string;
  notes?: string;
  venueLat?: number;
  venueLong?: number;
  type?: string;
  // --- ADD THESE TWO LINES ---
  websiteUrl?: string;
  menuUrl?: string;
}