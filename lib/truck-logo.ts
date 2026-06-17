// lib/truck-logo.ts
// Single source of truth for a truck's DISPLAY logo URL across every surface (operator manage header,
// operator dashboard header, customer order page). Prefers the operator's own uploaded logo
// (truck-media bucket); when none, falls back to the linked Village Foodie discovery logo
// (discovery_trucks.logo_url) so a truck without an uploaded logo still shows its brand mark instead
// of a blank — matching the customer profile/order surfaces. The discovery_trucks query runs ONLY
// when logo_storage_path is null, so a truck WITH an uploaded logo incurs no extra query (no
// regression). Returns null when neither exists. (Section 14/27 systemic logo fallback.)

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatImageUrl } from './image-utils'

export async function resolveTruckLogo(
  supabase: SupabaseClient,
  truckId: string,
  logoStoragePath: string | null
): Promise<string | null> {
  if (logoStoragePath) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${logoStoragePath}`
  }
  const { data: discoveryTruck } = await supabase
    .from('discovery_trucks')
    .select('logo_url')
    .eq('hatchgrab_truck_id', truckId)
    .maybeSingle()
  return formatImageUrl(discoveryTruck?.logo_url ?? null, 'logos') || null
}
