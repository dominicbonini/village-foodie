import { Metadata } from 'next';
import TruckClient from './TruckClient';
import { createSlug } from '@/lib/utils';
import { VILLAGE_FOODIE_COUNTRY } from '@/lib/discovery-country';
import { supabase } from '@/lib/supabase';
import { localeForTruck } from '@/lib/i18n/server-locale';
import { translatorFor } from '@/lib/i18n/translator';
import { wordsFor } from '@/lib/i18n/server-words';
import { NAMESPACES } from '@/lib/i18n/namespaces';
import '@/lib/i18n/catalog/truckPage';

// ── Language Phase 1e: THIS PAGE SPEAKS ITS TRUCK'S LANGUAGE, NOT THE VISITOR'S ─────────────────────────
// It is the truck's own page, so its words, share text and link-preview text use the truck's country's locale.
// The country is the HatchGrab truck's own (`trucks.country`, found by `trucks.slug` — the same column the order
// page at /trucks/<slug>/order resolves). A truck with no HatchGrab row is a discovery truck, and discovery is
// Village Foodie's market only (lib/discovery-country.ts: a row of any other country is hidden on both sites), so
// its country is VILLAGE_FOODIE_COUNTRY. This decides words only: a lookup that fails reads that same default.
async function truckLocale(slug: string) {
  let country: string | null = null;
  try {
    const { data } = await supabase.from('trucks').select('country').eq('slug', slug).maybeSingle();
    country = (data as { country?: string | null } | null)?.country ?? null;
  } catch {
    country = null;
  }
  return localeForTruck({ country: country || VILLAGE_FOODIE_COUNTRY });
}

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
  const locale = await truckLocale(resolvedParams.slug);
  const t = translatorFor(locale, 'truckPage');

  if (!truck) {
    return { title: t('meta.fallbackTitle') };
  }

  // Next.js needs an absolute URL for the image (e.g., https://villagefoodie...) 
  // If your CSV logo paths start with '/', we add your domain. If they are already full URLs, we leave them alone.
  const baseUrl = 'https://villagefoodie.co.uk';
  const imageUrl = truck.logo.startsWith('/') ? `${baseUrl}${truck.logo}` : truck.logo;

  // NAME IS USED RAW HERE, deliberately. Do NOT apply displayTruckName() (lib/demo.ts) to this block:
  // getTruckMeta above reads the Google Sheets CSV, NOT trucks.name, so a demo truck — the only source
  // of a trailing "(code)" suffix — can never reach this page. The strip would fix nothing and would
  // mangle a live truck legitimately trading as "Name (Something)" in its tab title and link previews.
  const share = t('shareText', { truck: truck.name });
  return {
    title: t('meta.title', { truck: truck.name }),
    description: share,
    openGraph: {
      title: t('shareTitle', { truck: truck.name }),
      description: share,
      url: `${baseUrl}/trucks/${resolvedParams.slug}`,
      siteName: 'Village Foodie',
      images: imageUrl ? [{ url: imageUrl, alt: t('meta.logoAlt', { truck: truck.name }) }] : [],
      locale: locale.replace('-', '_'),
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('shareTitle', { truck: truck.name }),
      description: share,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

// Finally, we load the interactive Client page we just built
export default async function TruckProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const locale = await truckLocale(resolvedParams.slug);
  // Language Phase 1e Part C: the locale's overrides for the client page's namespaces (null for en-GB), so it
  // hydrates with the words rendered here (lib/i18n/server-words.ts).
  return <TruckClient slug={resolvedParams.slug} locale={locale} words={wordsFor(locale, NAMESPACES.truckProfile)} />;
}