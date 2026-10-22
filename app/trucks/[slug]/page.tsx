import { Metadata } from 'next';
import TruckClient from './TruckClient';
import { createSlug } from '@/lib/utils';
import { VILLAGE_FOODIE_COUNTRY } from '@/lib/discovery-country';
import { supabase } from '@/lib/supabase';
import { localeForTruck } from '@/lib/i18n/server-locale';
import { pageSeedProps } from '@/lib/i18n/page-words';
import { truckTimeSettings } from '@/lib/truck-time';
import type { TimeSettings } from '@/lib/time-utils';
import { translatorFor } from '@/lib/i18n/translator';
import '@/lib/i18n/catalog/truckPage';
import { headers } from 'next/headers';
import { isHatchGrabHost } from '@/lib/brand';
import { headerFromOperatorRow, type OperatorTruckRow } from '@/lib/truck-header';
import { hatchGrabTruckMetadata } from '@/lib/truck-share-meta';

// ── Language Phase 1e: THIS PAGE SPEAKS ITS TRUCK'S LANGUAGE, NOT THE VISITOR'S ─────────────────────────
// It is the truck's own page, so its words, share text and link-preview text use the truck's country's locale.
// The country is the HatchGrab truck's own (`trucks.country`, found by `trucks.slug` — the same column the order
// page at /trucks/<slug>/order resolves). A truck with no HatchGrab row is a discovery truck, and discovery is
// Village Foodie's market only (lib/discovery-country.ts: a row of any other country is hidden on both sites), so
// its country is VILLAGE_FOODIE_COUNTRY. This decides words only: a lookup that fails reads that same default.
// 19 October 2026 (US dress rehearsal Findings 1–2): the same one read also carries what the header needs when the
// truck has no discovery row (lib/truck-header.ts) — read by slug, used only for a HatchGrab-public truck.
async function truckRow(slug: string) {
  try {
    const { data } = await supabase.from('trucks')
      .select('country, timezone, name, slug, logo_storage_path, cuisine_type, contact_phone, website, social_instagram, social_facebook, active, excluded, show_on_hg')
      .eq('slug', slug).maybeSingle();
    return data as ({ country?: string | null; timezone?: string | null } & OperatorTruckRow) | null;
  } catch {
    return null;
  }
}
async function truckCountry(slug: string) {
  return (await truckRow(slug))?.country || VILLAGE_FOODIE_COUNTRY;
}
// 🔴 THE EVENT CARDS READ IN THE TRUCK'S OWN STYLE (US "Wed, Sep 30 · 11:30 AM – 10:45 PM"): a HatchGrab truck's
// TimeSettings (lib/truck-time.ts — its zone, else its country's). A discovery-only truck (no HatchGrab row), or one
// whose settings cannot be read, passes nothing and the cards keep DISCOVERY_TIME_SETTINGS (GB) exactly as before. A GB
// HatchGrab truck's settings ARE the GB row, which DISCOVERY_TIME_SETTINGS mirrors, so its cards are unchanged too.
async function truckTime(row: { country?: string | null; timezone?: string | null } | null): Promise<TimeSettings | undefined> {
  if (!row?.country) return undefined;
  try {
    return await truckTimeSettings(row);
  } catch {
    return undefined;
  }
}
const truckLocale = async (slug: string) => localeForTruck({ country: await truckCountry(slug) });
// The request's host — '' when there is no request to ask (a build-time or test render), which is "not HatchGrab".
async function requestHost(): Promise<string> {
  try {
    return (await headers()).get('host') || '';
  } catch {
    return '';
  }
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
  // 🔴 ON HATCHGRAB THE PREVIEW COMES FROM THE TRUCK ITSELF (US polish batch, 19 October 2026; lib/truck-share-meta.ts):
  // its name, its own cover/logo (else HatchGrab's share card), HatchGrab branding, this page's HatchGrab URL, in the
  // truck's language — no Google Sheet. Village Foodie: the code below, unchanged.
  if (isHatchGrabHost(await requestHost())) return hatchGrabTruckMetadata(resolvedParams.slug, 'page');
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
  const row = await truckRow(resolvedParams.slug);
  const country = row?.country || VILLAGE_FOODIE_COUNTRY;
  // 🔴 VILLAGE FOODIE'S DISCOVERY PROMPTS ONLY IN ITS OWN MARKET (Language Phase 1e tidy): the newsletter, the weekly
  // schedule button, Hire / Add my Business / Truck Directory and the claim links invite a visitor into Village
  // Foodie, which is UK-only (lib/discovery-country.ts). A truck of any other country shows its page without them.
  // 🔴 THE OPERATOR TRUCK'S OWN HEADER (lib/truck-header.ts): built only on the HatchGrab host and only for a truck
  // public there; TruckClient uses it only when the discovery list has no row for this slug. Village Foodie: never.
  const onHatchGrab = isHatchGrabHost(await requestHost());
  const operatorHeader = onHatchGrab ? headerFromOperatorRow(row, process.env.NEXT_PUBLIC_SUPABASE_URL || '') : null;
  // languages-1: a non-English truck's page hands its browser the words its client components read (none for English).
  const locale = await localeForTruck({ country });
  return <TruckClient slug={resolvedParams.slug} locale={locale} discovery={country === VILLAGE_FOODIE_COUNTRY} time={await truckTime(row)}
    {...(operatorHeader ? { operatorHeader } : {})} {...pageSeedProps(locale, 'truckPage')} />;
}