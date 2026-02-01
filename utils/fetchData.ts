/**
 * Village Foodie - Fetch and parse events from Google Sheet CSV
 */

import Papa from "papaparse";
import type { VillageEvent } from "@/types";

/** Replace this with your published Google Sheet CSV URL */
export const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=0&single=true&output=csv";

/**
 * Parse UK date format (DD/MM/YYYY) into a JavaScript Date object.
 * Returns Invalid Date if parsing fails.
 */
export function parseUKDate(dateStr: string): Date {
  if (!dateStr || typeof dateStr !== "string") {
    return new Date(NaN);
  }

  const trimmed = dateStr.trim();
  const parts = trimmed.split(/[\/\-.]/);

  if (parts.length !== 3) {
    return new Date(NaN);
  }

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
  const year = parseInt(parts[2], 10);

  if (
    isNaN(day) ||
    isNaN(month) ||
    isNaN(year) ||
    day < 1 ||
    day > 31 ||
    month < 0 ||
    month > 11
  ) {
    return new Date(NaN);
  }

  const date = new Date(year, month, day);
  if (isNaN(date.getTime()) || date.getDate() !== day || date.getMonth() !== month) {
    return new Date(NaN);
  }

  return date;
}

/**
 * Parse a row from the CSV into a VillageEvent.
 * Skips rows with invalid coordinates or required fields.
 */
function parseRow(row: Record<string, string>): VillageEvent | null {
  const lat = parseFloat(row["Venue Lat"]?.trim() ?? "");
  const lng = parseFloat(row["Venue Long"]?.trim() ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return null;
  }

  const type = row["Type"]?.trim() === "Static" ? "Static" : "Mobile";
  const parsedDate = parseUKDate(row["Date"] ?? "");

  if (isNaN(parsedDate.getTime())) {
    return null;
  }

  return {
    date: row["Date"]?.trim() ?? "",
    startTime: row["Start Time"]?.trim() ?? "",
    endTime: row["End Time"]?.trim() ?? "",
    truckName: row["Truck Name"]?.trim() ?? "",
    venueName: row["Venue Name"]?.trim() ?? "",
    notes: row["Notes"]?.trim() ?? "",
    source: row["Source"]?.trim() ?? "",
    venueLat: lat,
    venueLong: lng,
    truckCuisine: row["Truck Cuisine"]?.trim() ?? "",
    type,
  };
}

/**
 * Fetch the CSV from the Google Sheet URL and parse into VillageEvent[].
 * Sorted by Date then Start Time.
 */
export async function fetchEvents(): Promise<VillageEvent[]> {
  const response = await fetch(GOOGLE_SHEET_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn("CSV parse warnings:", result.errors);
  }

  const events = result.data
    .map(parseRow)
    .filter((e): e is VillageEvent => e !== null);

  return sortEvents(events);
}

/**
 * Sort events by Date then Start Time.
 */
export function sortEvents(events: VillageEvent[]): VillageEvent[] {
  return [...events].sort((a, b) => {
    const dateA = parseUKDate(a.date).getTime();
    const dateB = parseUKDate(b.date).getTime();

    if (dateA !== dateB) return dateA - dateB;
    return (a.startTime || "").localeCompare(b.startTime || "");
  });
}
