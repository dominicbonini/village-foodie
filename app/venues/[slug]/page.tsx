import { Metadata } from 'next';
import VenueClient from './VenueClient';
import { createSlug } from '@/lib/utils';

// 👇 PASTE YOUR VENUES CSV URL HERE 👇
const VENUES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/.../pub?output=csv';

// We mapped these directly to your A-M columns
const VENUE_NAME_COLUMN_INDEX = 0;  // Column A: Venue Name
const VENUE_PHOTO_COLUMN_INDEX = 12; // Column M: Photo URL

async function getVenueMeta(slug: string) {
  try {
    const res = await fetch(VENUES_CSV_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    
    const text = await res.text();
    const rows = text.split('\n');
    
    // Skip the header row (i = 1)
    for (let i = 1; i < rows.length; i++) {
      // Split the CSV row by commas. 
      // (Note: If your sheet has commas inside the venue names, let me know, we might need a slightly smarter CSV parser here).
      const cols = rows[i].split(',');
      const rawName = cols[VENUE_NAME_COLUMN_INDEX]?.replace(/^"|"$/g, '').trim(); 
      
      if (createSlug(rawName) === slug) {
        return {
          name: rawName,
          photo: cols[VENUE_PHOTO_COLUMN_INDEX]?.replace(/^"|"$/g, '').trim() || '' 
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
  const imageUrl = venue.photo.startsWith('/') ? `${baseUrl}${venue.photo}` : venue.photo;

  return {
    title: `${venue.name} | Village Foodie`,
    description: `Check out the upcoming street food schedule at ${venue.name}! 🍻`,
    openGraph: {
      title: `Street Food at ${venue.name}`,
      description: `Check out the upcoming street food schedule at ${venue.name}! 🍻`,
      url: `${baseUrl}/venues/${resolvedParams.slug}`,
      siteName: 'Village Foodie',
      images: imageUrl ? [{ url: imageUrl, alt: `${venue.name} Photo` }] : [],
      locale: 'en_GB',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `Street Food at ${venue.name}`,
      description: `Check out the upcoming street food schedule at ${venue.name}! 🍻`,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

// Renders the interactive client page
export default async function VenueProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  return <VenueClient slug={resolvedParams.slug} />;
}