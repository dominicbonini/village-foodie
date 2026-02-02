export interface Event {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  truckName: string;
  venueName: string;
  // These are the new fields we added for the map:
  type?: 'Mobile' | 'Static';
  venueLat?: number;
  venueLong?: number;
}