// lib/utils.ts

import { VillageEvent } from '@/types';

// ==========================================
// --- GEOGRAPHY UTILITIES ---
// ==========================================

export function deg2rad(deg: number): number {
  return deg * (Math.PI/180);
}

export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}

export async function getCoordsFromPostcode(postcode: string): Promise<{lat: number, long: number} | null> {
  try {
    const cleanPostcode = postcode.toUpperCase().replace(/\s/g, '');
    const res = await fetch(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
    const data = await res.json();
    if (data.status === 200) {
      return { lat: data.result.latitude, long: data.result.longitude };
    }
    return null;
  } catch (err) {
    return null;
  }
}

// ==========================================
// --- DATE & FORMATTING HELPER ---
// ==========================================

export function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

export function formatFriendlyDate(dateStr: string): string {
  const date = parseDateString(dateStr);
  if (!date) return dateStr;

  // Set times to midnight for accurate comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  // Standard Format
  const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const monthName = date.toLocaleDateString('en-GB', { month: 'long' });
  const dayNum = date.getDate();

  let suffix = 'th';
  if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = 'st';
  else if (dayNum === 2 || dayNum === 22) suffix = 'nd';
  else if (dayNum === 3 || dayNum === 23) suffix = 'rd';

  const standardDate = `${dayName} ${dayNum}${suffix} ${monthName}`;

  // Add Prefix
  if (checkDate.getTime() === today.getTime()) {
    return `Today - ${standardDate}`;
  } else if (checkDate.getTime() === tomorrow.getTime()) {
    return `Tomorrow - ${standardDate}`;
  }

  return standardDate;
}

export function getCuisineEmoji(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('pizza')) return '🍕';
  if (t.includes('burger')) return '🍔';
  if (t.includes('coffee') || t.includes('cafe')) return '☕';
  if (t.includes('mexican') || t.includes('taco')) return '🌮';
  if (t.includes('asian') || t.includes('thai') || t.includes('chinese')) return '🍜';
  if (t.includes('indian') || t.includes('curry')) return '🍛';
  if (t.includes('dessert') || t.includes('ice cream') || t.includes('cake') || t.includes('sweet')) return '🍰';
  if (t.includes('fish') || t.includes('seafood')|| t.includes('sushi')) return '🐟';
  if (t.includes('greek') || t.includes('kebab') || t.includes('gyro')) return '🥙';
  if (t.includes('vegan') || t.includes('vegetarian') || t.includes('salad')) return '🥗';
  if (t.includes('bbq') || t.includes('meat')) return '🍖';
  if (t.includes('pie')) return '🥧';
  if (t.includes('cheese')) return '🧀';
  if (t.includes('bagel')) return '🥯';
  if (t.includes('pasta')) return '🍝'; 
  if (t.includes('crepe') || t.includes('pancake')) return '🥞';
  return '🍴'; // Default cutlery
}

// ==========================================
// --- CALENDAR LOGIC ---
// ==========================================

export function formatWebDate(dateStr: string, timeStr: string): string {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month}-${day}T${timeStr}:00`;
}

export function formatICSDate(dateStr: string, timeStr: string): string {
  const [day, month, year] = dateStr.split('/');
  const cleanTime = timeStr.replace(':', '');
  return `${year}${month}${day}T${cleanTime}00`;
}

// Helper to build a highly specific location string for calendar mapping
export function getFullLocation(event: VillageEvent): string {
  const postcode = (event as any).postcode || '';
  const settlement = (event as any).village || (event as any).town || '';
  
  // This array filters out missing data so you don't end up with weird floating commas
  return [event.venueName, settlement, postcode].filter(Boolean).join(', ');
}

export function getGoogleLink(event: VillageEvent): string {
  if (!event.date || !event.startTime || !event.endTime) return '#';
  const dates = `${formatICSDate(event.date, event.startTime)}/${formatICSDate(event.date, event.endTime)}`;
  const details = `Food Truck: ${event.truckName} at ${event.venueName}. ${event.notes || ''}`;
  const fullLocation = getFullLocation(event);
  
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.truckName + ' 🚚')}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(fullLocation)}`;
}

export function getOutlookLink(event: VillageEvent): string {
  if (!event.date || !event.startTime || !event.endTime) return '#';
  const start = formatWebDate(event.date, event.startTime);
  const end = formatWebDate(event.date, event.endTime);
  const details = `Food Truck: ${event.truckName} at ${event.venueName}. ${event.notes || ''}`;
  const fullLocation = getFullLocation(event);
  
  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(event.truckName + ' 🚚')}&startdt=${start}&enddt=${end}&body=${encodeURIComponent(details)}&location=${encodeURIComponent(fullLocation)}`;
}

export function downloadICS(event: VillageEvent) {
  if (!event.date || !event.startTime || !event.endTime) return;
  const start = formatICSDate(event.date, event.startTime);
  const end = formatICSDate(event.date, event.endTime);
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const fullLocation = getFullLocation(event);
  
  const icsContent = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Village Foodie//EN', 'BEGIN:VEVENT',
    `UID:${event.id}@villagefoodie.co.uk`, `DTSTAMP:${now}`, `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${event.truckName} 🚚`, `DESCRIPTION:${event.notes || 'Details at villagefoodie.co.uk'}`,
    `LOCATION:${fullLocation}`, 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${event.truckName.replace(/\s+/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==========================================
// --- URL GENERATION HELPERS ---
// ==========================================

export function createSlug(str: string): string {
  if (!str) return '';
  return str.toLowerCase()
      .replace(/&/g, 'and')         
      .replace(/['’]/g, '')         
      .replace(/[^a-z0-9\s-]/g, '') 
      .trim()
      .replace(/\s+/g, '-')         
      .replace(/-+/g, '-');         
}

export function getVenueSlug(venueName: string, village: string): string {
    if (!venueName) return '';
    const nameSlug = createSlug(venueName);
    const villageSlug = createSlug(village || '');
    
    if (!villageSlug || nameSlug.includes(villageSlug)) {
        return nameSlug;
    }
    
    return `${nameSlug}-${villageSlug}`;
}

// ==========================================
// --- TRUCK ALIAS NORMALIZATION ---
// ==========================================

export function getCanonicalTruckName(rawName: string, trucksData: any[]): string {
  if (!rawName || !trucksData || !Array.isArray(trucksData)) return rawName;

  const cleanRaw = rawName.toLowerCase().trim();

  for (const truck of trucksData) {
      // Check common property names for the canonical Truck Name
      const canonicalName = truck.name || truck.truckName || truck.Name || truck['Truck Name'] || '';
      // Check common property names for Aliases
      const aliases = truck.aliases || truck.Aliases || '';

      // 1. If it already exactly matches Column A, return it
      if (canonicalName && canonicalName.toLowerCase().trim() === cleanRaw) {
          return canonicalName;
      }

      // 2. Check the aliases list
      if (aliases) {
          // Splits "Alias 1, Alias 2" into an array and cleans spaces
          const aliasList = aliases.split(',').map((a: string) => a.toLowerCase().trim());
          if (aliasList.includes(cleanRaw)) {
              return canonicalName; // Returns the clean Column A name!
          }
      }
  }

  // Fallback: If no match is found at all, just return the raw scraped name
  return rawName; 
}
// --- FUZZY MATCHING LOGIC ---

export function washTruckName(name: string): string {
  if (!name) return '';

  // 1. Lowercase and replace '&' with 'and'
  let clean = name.toLowerCase().replace(/&/g, 'and');

  // 2. Remove apostrophes completely (so "anto's" becomes "antos")
  clean = clean.replace(/['`’]/g, '');

  // 3. Replace any non-alphanumeric char with a space
  clean = clean.replace(/[^a-z0-9]/g, ' ');

  // 4. Split into words
  let words = clean.split(/\s+/).filter(w => w.length > 0);

  // 5. Remove industry filler words
  const stopWords = new Set(['the', 'street', 'st', 'food', 'ltd', 'and', 'company']);
  words = words.filter(w => !stopWords.has(w));

  // 6. Remove trailing 's' from every remaining word
  words = words.map(w => w.endsWith('s') ? w.slice(0, -1) : w);

  // 7. Combine into a single core string (e.g., "guacomexican")
  return words.join('');
}

export function getLevenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
              matrix[i][j] = matrix[i - 1][j - 1];
          } else {
              matrix[i][j] = Math.min(
                  matrix[i - 1][j - 1] + 1, // substitution
                  Math.min(
                      matrix[i][j - 1] + 1, // insertion
                      matrix[i - 1][j] + 1  // deletion
                  )
              );
          }
      }
  }
  return matrix[b.length][a.length];
}