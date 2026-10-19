// lib/truck-header.ts — what the public truck page (/trucks/[slug]) puts in its header: name, cuisine, logo,
// contact and links. Client-safe: types and pure projections only.
//
// 🔴 ONE SOURCE PER TRUCK, NEVER A MIX. A truck with a discovery row is drawn from that row exactly as it always
// was (`headerFromDiscoveryListRow` is the projection TruckClient made inline, moved here unchanged). A truck with
// NO discovery row — a self-serve signup, or any truck outside Village Foodie's market (discovery is GB-only) —
// used to read "Truck not found" even when public. 19 October 2026 (US dress rehearsal Findings 1–2): such a truck
// is drawn from its own operator row, but ONLY when it is public on HatchGrab (active, not excluded, show_on_hg)
// and ONLY on the HatchGrab host. Village Foodie never builds it.

export interface TruckHeader {
  name: string
  type: string
  logo: string
  menuUrl: string | null
  phoneNumber: string | null
  websiteUrl: string | null
  orderUrl: string | null
  /** The operator's own Instagram / Facebook links — only an operator-built header has them. */
  socials?: string[]
}

/** The fields of the feed's `trucks` entry (app/api/discovery/events) the header reads. */
export interface DiscoveryListTruck {
  rawName: string
  type: string
  logoUrl: string
  menuUrl: string | null
  phoneNumber: string | null
  websiteUrl: string | null
  orderUrl?: string | null
}

/** The discovery list's truck (the feed's `trucks`), projected exactly as TruckClient always did. */
export function headerFromDiscoveryListRow(truck: DiscoveryListTruck): TruckHeader {
  return {
    name: truck.rawName,
    type: truck.type,
    logo: truck.logoUrl,
    menuUrl: truck.menuUrl,
    phoneNumber: truck.phoneNumber,
    websiteUrl: truck.websiteUrl,
    orderUrl: truck.orderUrl || null,
  }
}

export interface OperatorTruckRow {
  name?: string | null
  slug?: string | null
  logo_storage_path?: string | null
  cuisine_type?: string | null
  contact_phone?: string | null
  website?: string | null
  social_instagram?: string | null
  social_facebook?: string | null
  active?: boolean | null
  excluded?: boolean | null
  show_on_hg?: boolean | null
}

/** Public on HatchGrab: the same three tests the feed's operator leg applies to its events. */
export const isPublicOnHatchGrab = (row: OperatorTruckRow | null | undefined): boolean =>
  !!row && row.active === true && row.excluded !== true && row.show_on_hg === true

// A stored handle ("@pizzakitchen") becomes the profile URL, the way the confirmation email writes Instagram;
// a stored URL (or bare domain) is kept for hrefFromStoredUrl to finish.
const socialUrl = (value: string | null | undefined, site: 'instagram.com' | 'facebook.com'): string | null => {
  const v = (value || '').trim()
  if (!v) return null
  if (/^https?:/i.test(v) || v.includes('.')) return v
  return `https://${site}/${v.replace(/^@/, '')}`
}

/** The operator truck itself, for a HatchGrab-public truck with no discovery row. Null for any other truck. */
export function headerFromOperatorRow(row: OperatorTruckRow | null | undefined, supabaseUrl: string): TruckHeader | null {
  if (!isPublicOnHatchGrab(row) || !row?.name) return null
  const socials = [socialUrl(row.social_instagram, 'instagram.com'), socialUrl(row.social_facebook, 'facebook.com')].filter((s): s is string => !!s)
  return {
    name: row.name,
    type: row.cuisine_type || '',
    logo: row.logo_storage_path && supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/truck-media/${row.logo_storage_path}` : '',
    menuUrl: null,
    phoneNumber: row.contact_phone || null,
    websiteUrl: row.website || null,
    orderUrl: null,
    ...(socials.length ? { socials } : {}),
  }
}
