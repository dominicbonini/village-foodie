import { Metadata } from 'next';
import VenueClient from './VenueClient';
import { createSlug } from '@/lib/utils';

// 👇 FIX 1: Converted your link to the raw CSV export format
const VENUES_CSV_URL = 'https://docs.google.com/spreadsheets/d/1yMVpKmnFRE-U3xHtJdA9OXJMC_cpIVMTQqE_D5nQdXw/pub?gid=1190852063&single=true&output=csv';

const VENUE_NAME_COLUMN_INDEX = 0;  // Column A
const VENUE_PHOTO_COLUMN_INDEX = 12; // Column M

// A smart parser that ignores commas inside quotation marks
function parseCSVRow(row: string) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      inQuotes = !inQuotes; // Toggle quote state
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim()); // Split only if we are NOT inside quotes
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function getVenueMeta(slug: string) {
  try {
    const res = await fetch(VENUES_CSV_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    
    const text = await res.text();
    const rows = text.split('\n');
    
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) continue; // Skip empty rows at the bottom of the sheet
      
      const cols = parseCSVRow(rows[i]);
      const rawName = cols[VENUE_NAME_COLUMN_INDEX]; 
      
      if (rawName && createSlug(rawName) === slug) {
        return {
          name: rawName,
          photo: cols[VENUE_PHOTO_COLUMN_INDEX] || '' 
        };
      }
    }
  } catch (error) {
    console.error("Failed to fetch venue metadata", error);
    return null;
  }
  return null;
}

// Builds the WhatsApp / Social Media Preview Card
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const resolvedParams = await params;
    const venue = await getVenueMeta(resolvedParams.slug);
  
    if (!venue) {
      return { title: 'Venue | Village Foodie' };
    }
  
    const baseUrl = 'https://villagefoodie.co.uk';
    let finalImageUrl = '';
    
    if (venue.photo) {
      let photoUrl = venue.photo;

      if (photoUrl.includes('maps.googleapis.com')) {
        // 👇 FIX 2: Shrink to 600px for WhatsApp speed, and route through proxy
        photoUrl = photoUrl.replace('maxwidth=1200', 'maxwidth=600');
        finalImageUrl = `${baseUrl}/api/venue-image?url=${encodeURIComponent(photoUrl)}`;
        
        // 👇 FIX 3: Force Vercel to cache it immediately
        fetch(finalImageUrl).catch(() => {}); 
      } else if (photoUrl.startsWith('/')) {
        finalImageUrl = `${baseUrl}${photoUrl}`;
      } else {
        finalImageUrl = photoUrl;
      }
    }
  
    return {
      title: `${venue.name} | Village Foodie`,
      description: `Check out the upcoming street food schedule at ${venue.name}! 🍻`,
      openGraph: {
        title: `Street Food at ${venue.name}`,
        description: `Check out the upcoming street food schedule at ${venue.name}! 🍻`,
        url: `${baseUrl}/venues/${resolvedParams.slug}`,
        siteName: 'Village Foodie',
        images: finalImageUrl ? [{ url: finalImageUrl, width: 600, height: 400, alt: `${venue.name} Photo` }] : [],
        locale: 'en_GB',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: `Street Food at ${venue.name}`,
        description: `Check out the upcoming street food schedule at ${venue.name}! 🍻`,
        images: finalImageUrl ? [finalImageUrl] : [],
      },
    };
  }

// Renders the interactive client page
export default async function VenueProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  return <VenueClient slug={resolvedParams.slug} />;
}