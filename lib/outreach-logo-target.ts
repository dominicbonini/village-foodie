// lib/outreach-logo-target.ts
// WHICH ROW OWNS A PROSPECT'S LOGO. One pure function, shared by the outreach route (which reads and
// writes) and reported to the admin UI (which must warn before a write reaches a real business).
//
// 🔴 OPTION A, THE RULE DOMINIC CHOSE: `trucks.logo_storage_path` is authoritative the moment a truck
// exists. `discovery_trucks.logo_url` keeps its job only while there is no truck. Nothing is copied and
// nothing is kept in sync — there is one store per state, and this function says which state a row is in.
//
// 🔴 A PROSPECT CAN BE LINKED TWO DIFFERENT WAYS, AND THEY ARE NOT THE SAME THING:
//   • `discovery_trucks.hatchgrab_truck_id` — a REAL truck. A business that signed up. Its logo is on
//     its customer order page, its confirmation email and its QR poster.
//   • `demo_sessions.discovery_truck_id`    — a DEMO truck. Disposable, expires, exists to be shown off.
// A prospect can have BOTH: a demo built during outreach, and a real truck after they converted.
// 🔴 THE REAL TRUCK WINS. A logo change is meant for the business, and a demo that outlived the signup
// is the less current of the two. The demo keeps whatever it was provisioned with; it expires anyway.
//
// ⚠️ THIS FILE DOES NOT ADD A FALLBACK. `resolveTruckLogo` still returns null for a null path, so an
// operator who clears their logo in Settings sees it cleared — see lib/truck-logo.ts for why that
// matters. This function chooses which ROW to read; it never substitutes one row's value for another's.

export type LogoTargetKind =
  | 'truck'       // a real HatchGrab truck — trucks.logo_storage_path is authoritative
  | 'demo'        // a live demo truck and no real one — still trucks.logo_storage_path
  | 'prospect'    // neither — discovery_trucks.logo_url is authoritative, as before

/** The `trucks` columns this decision reads. Structural, so the route's richer row satisfies it. */
export type LogoTruckRow = {
  id: string
  name?: string | null
  active?: boolean | null
  excluded?: boolean | null
  show_on_vf?: boolean | null
  show_on_hg?: boolean | null
}

export type LogoTarget = {
  kind: LogoTargetKind
  /** The trucks.id to read and write. Null only for 'prospect'. */
  truckId: string | null
  /** For the confirmation sentence. Null when there is no truck row to name. */
  truckName: string | null
  /** 🔴 THE GUSTO PREDICATE. True when this write would change what a customer sees. */
  publiclyVisible: boolean
}

/**
 * 🔴 PUBLICLY VISIBLE IS THE SAME TEST THE PHOTO-DELETE REFUSAL ALREADY USES — `active && !excluded &&
 * (show_on_vf || show_on_hg)`. Copied in shape deliberately so the two guards cannot disagree about what
 * "live" means; the photo guard is left where it is because it also tests `cover_image_path`, which has
 * no logo equivalent.
 * ⚠️ STRUCTURAL, NOT SCHEDULE-BASED. Whether the truck has an event this week is not part of it — that
 * would make the same click succeed today and refuse tomorrow with nothing visible having changed.
 */
export const isPubliclyVisible = (t: LogoTruckRow | null | undefined): boolean =>
  !!t && t.active === true && t.excluded !== true && (t.show_on_vf === true || t.show_on_hg === true)

export function resolveLogoTarget(input: {
  hatchgrabTruckId?: string | null
  demoTruckId?: string | null
  /** The `trucks` row for whichever id wins, already fetched by the caller. */
  truckRow?: LogoTruckRow | null
}): LogoTarget {
  const real = (input.hatchgrabTruckId ?? '').trim() || null
  const demo = (input.demoTruckId ?? '').trim() || null
  // 🔴 REAL FIRST. See the header: a logo change is for the business, not for a disposable demo.
  const truckId = real ?? demo
  if (!truckId) return { kind: 'prospect', truckId: null, truckName: null, publiclyVisible: false }
  const row = input.truckRow ?? null
  return {
    kind: real ? 'truck' : 'demo',
    truckId,
    truckName: (row?.name ?? '').trim() || null,
    publiclyVisible: isPubliclyVisible(row),
  }
}

/**
 * 🔴 WHEN A WRITE MUST BE CONFIRMED BY NAME. A real truck that is live to customers: changing or
 * removing its logo changes its order page, its confirmation email and its QR poster.
 * ⚠️ A DEMO IS NOT GATED. It is disposable, it expires, and nothing on the public map renders it — so a
 * confirmation there would be noise, and noise is how a real confirmation stops being read.
 * ⚠️ NOR IS A LINKED TRUCK THAT IS NOT PUBLIC (inactive, excluded, or shown on neither site). Nothing a
 * customer can reach changes, so there is nothing to warn about.
 */
export const needsTruckConfirmation = (t: LogoTarget): boolean =>
  t.kind === 'truck' && t.publiclyVisible
