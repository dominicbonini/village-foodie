import { Metadata } from 'next';
import TruckClient from './TruckClient';
import { createSlug } from '@/lib/utils';

// This is the URL of your Trucks tab from Google Sheets
const TRUCKS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=28504033&single=true&output=csv';

// A tiny server-side function to grab the truck info before the page loads
async function getTruckMeta(slug: string) {
  try {
    const res = await fetch(TRUCKS_CSV_URL, { next: { revalidate: 3600 } }); // Caches for 1 hour to keep it fast
    if (!res.ok) return null;
    
    const text = await res.text();
    const rows = text.split('\n');
    
    // Loop through the CSV to find the matching truck slug
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(',');
      const rawName = cols[0]?.replace(/^"|"$/g, '').trim();
      
      if (createSlug(rawName) === slug) {
        return {
          name: rawName,
          // Column J is Index 9
          logo: cols[9]?.replace(/^"|"$/g, '').trim() || '' 
        };
      }
    }
  } catch (error) {
    console.error("Failed to fetch truck metadata", error);
    return null;
  }
  return null;
}

// 👇 This is the magic Next.js function that builds the WhatsApp/Social Media cards 👇
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const truck = await getTruckMeta(resolvedParams.slug);

  if (!truck) {
    return { title: 'Food Truck | Village Foodie' };
  }

  // Next.js needs an absolute URL for the image (e.g., https://villagefoodie...) 
  // If your CSV logo paths start with '/', we add your domain. If they are already full URLs, we leave them alone.
  const baseUrl = 'https://villagefoodie.co.uk';
  const imageUrl = truck.logo.startsWith('/') ? `${baseUrl}${truck.logo}` : truck.logo;

  return {
    title: `${truck.name} | Village Foodie`,
    description: `Check out where ${truck.name} is pitching up next! 🚚`,
    openGraph: {
      title: `${truck.name} Schedule`,
      description: `Check out where ${truck.name} is pitching up next! 🚚`,
      url: `${baseUrl}/trucks/${resolvedParams.slug}`,
      siteName: 'Village Foodie',
      images: imageUrl ? [{ url: imageUrl, alt: `${truck.name} Logo` }] : [],
      locale: 'en_GB',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${truck.name} Schedule`,
      description: `Check out where ${truck.name} is pitching up next! 🚚`,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

// Finally, we load the interactive Client page we just built
export default async function TruckProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  return <TruckClient slug={resolvedParams.slug} />;
}