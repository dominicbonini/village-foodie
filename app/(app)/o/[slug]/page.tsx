// app/o/[slug]/page.tsx
//
// ── 🔴 PERMANENT SHIM. `/o/<slug>` → `/order/<slug>`. NEVER REMOVED. ────────────────────────────────
//
// The scan/decider route was renamed `/o/<slug>` → `/order/<slug>`. This route USED to hold the decider;
// it now forwards to it. It is kept FOREVER (no deprecation date) because `/o/<slug>` codes may already
// be printed on hatches, boards and flyers — a printed pattern cannot be changed, so this address must
// keep resolving. The decision itself lives at `/order/<slug>` (app/order/[id]/page.tsx), which re-decides
// on every scan; this file only forwards to it.
//
// 🔴 307, NOT 308 — DELIBERATELY, AND IT IS STILL "PERMANENT". "Permanent" here means the ROUTE is kept
// forever, not that the HTTP status is 308. The whole `/o/` and `/order/` design forbids a browser-cached
// permanent redirect on a printed code (a 308 pins the code in the customer's browser with no way to
// clear it). A 307 forwards every scan to `/order/<slug>`, which is where the real per-scan decision is
// re-made. Same discipline the decider itself uses.
//
// ⚠️ THIS ROUTE KEEPS ITS OWN REGISTRATIONS. The `/o/(.*)` noindex header (vercel.json) and the `/o`
// GENERAL rate-limit entry (proxy.ts isGeneralPublic) stay in place, alongside the new `/order/` ones.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// ⚠️ NOT INDEXED — a redirector, not a destination. Kept from when this route decided; still correct.
export const metadata = { robots: { index: false, follow: false } }

export default async function ScanShim({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Permanent (lifetime) shim → the decider. 307 for the reason in the header — a printed code must not
  // be pinned by a cached permanent redirect.
  redirect(`/order/${encodeURIComponent(slug)}`)
}
