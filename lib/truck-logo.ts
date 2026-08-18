// lib/truck-logo.ts
// Single source of truth for a truck's DISPLAY logo URL across every surface (operator manage header,
// operator dashboard header, customer order page, order confirmation).
//
// 🔴 THE OPERATOR'S UPLOAD IS THE ONLY SOURCE. There used to be a fallback here: when
// `logo_storage_path` was null this queried `discovery_trucks.logo_url` and showed the linked Village
// Foodie brand mark instead of nothing. That made REMOVAL IMPOSSIBLE TO SEE — an operator who cleared
// the logo in Settings watched the header keep showing one, because clearing the column is exactly the
// state the fallback was written to rescue. "Removed" and "never uploaded" are the same row, so no
// fallback can honour both; the setting the operator can actually reach wins.
//
// CONSEQUENCE, STATED: a truck that never uploaded a logo now shows no logo in the operator header and
// on the customer order page, where it previously borrowed its discovery mark. That is the price of
// making the Settings control tell the truth, and it is recoverable by uploading the logo.
//
// Kept async and kept `supabase`/`truckId` in the signature so the four call sites (dashboard, menu,
// manage, orders/[id]) are untouched — this is a behaviour change in one place, not a refactor.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function resolveTruckLogo(
  _supabase: SupabaseClient,
  _truckId: string,
  logoStoragePath: string | null
): Promise<string | null> {
  if (!logoStoragePath) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${logoStoragePath}`
}
