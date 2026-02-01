/**
 * Village Foodie - Data types for CSV-sourced events
 */

export type EventType = "Mobile" | "Static";

export interface VillageEvent {
  /** Date in DD/MM/YYYY format */
  date: string;
  /** Start time e.g. 17:00 */
  startTime: string;
  /** End time e.g. 20:00 */
  endTime: string;
  truckName: string;
  venueName: string;
  notes: string;
  source: string;
  /** Latitude as number */
  venueLat: number;
  /** Longitude as number */
  venueLong: number;
  truckCuisine: string;
  type: EventType;
}

/** Raw row from CSV before parsing */
export interface CsvRow {
  Date: string;
  "Start Time": string;
  "End Time": string;
  "Truck Name": string;
  "Venue Name": string;
  Notes: string;
  Source: string;
  "Venue Lat": string;
  "Venue Long": string;
  "Truck Cuisine": string;
  Type: string;
}
