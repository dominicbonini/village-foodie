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
  if (t.includes('asian') || t.includes('thai') || t.includes('chinese') || t.includes('sushi')) return '🍜';
  if (t.includes('indian') || t.includes('curry')) return '🍛';
  if (t.includes('dessert') || t.includes('ice cream') || t.includes('cake') || t.includes('sweet')) return '🍰';
  if (t.includes('fish')) return '🐟';
  if (t.includes('greek') || t.includes('kebab') || t.includes('gyro')) return '🥙';
  if (t.includes('vegan') || t.includes('vegetarian') || t.includes('salad')) return '🥗';
  if (t.includes('bbq') || t.includes('meat')) return '🍖';
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