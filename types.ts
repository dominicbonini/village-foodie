export interface VillageEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  truckName: string;
  venueName: string;
  postcode?: string;
  type?: string;
  venueLat?: number;
  venueLong?: number;
  notes?: string;
}