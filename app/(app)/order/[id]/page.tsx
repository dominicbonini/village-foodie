// app/order/[id]/page.tsx
//
// ── 🔴 THE PRINTED QR CODE RESOLVES ITS DESTINATION HERE, ON EVERY SCAN. ────────────────────────────
//
// This is `/order/<slug>` — the scan/decider address. It was renamed from `/o/<slug>` (which is now a
// permanent shim → here). The QR code and the dashboard link encode THIS URL, built by `scanUrl()`
// (lib/custom-domain/copy.ts). The decision logic is UNCHANGED and NOT reimplemented — it is the same
// `customDomainFor` (lib/custom-domain/redirect-target.ts) the old `/o/` route called, moved verbatim.
//
// 🔴 WHY THE FOLDER SEGMENT IS `[id]`, NOT `[slug]`. A sibling route already owns the `app/order/` dynamic
// segment name: `app/order/[id]/manage/page.tsx` (the customer order-manage page). Next.js forbids two
// different dynamic segment names at the same path level, so this decider MUST reuse `[id]`. The URL is
// still exactly `/order/<slug>`; only the internal param is named `id`, and it carries the truck slug.
// `/order/<orderId>/manage` (the manage page) is a deeper path and does not collide with this leaf.
//
// 🔴 IT IS A SEPARATE ADDRESS FROM THE ORDERING PAGE FOR ONE REASON: A PAGE THAT BOTH DECIDES AND SERVES
// CANNOT TELL AN INBOUND SCAN FROM A CUSTOMER COMING BACK TO BUY. That decision used to live on the
// ordering page's layout and sent a returning customer back to the page they were on. The two URLs now
// have one job each:
//      /order/<slug>          DECIDES — custom domain if the five conditions hold, else the order page.
//      /trucks/<slug>/order   SERVES — always, for every arrival, with no redirect of any kind.
//      /o/<slug>              PERMANENT shim → /order/<slug>.
//
// 🔴 RESOLVED PER REQUEST. NOTHING IS STORED. A stored target would be wrong for the window between a
// truck's state changing and something writing the new value. Resolving here means a lapsed plan, an
// unconfirmed domain or one that has stopped resolving falls back to our own page ON THE NEXT SCAN.
// `force-dynamic` is what guarantees the read actually happens each time.
import { redirect } from 'next/navigation'
import { customDomainFor } from '@/lib/custom-domain/redirect-target'

export const dynamic = 'force-dynamic'

// ⚠️ NOT INDEXED. This is a redirector, not a destination. Set both here (route metadata) AND in
// vercel.json's `/order/(.*)` header rule — the V11.51 lesson that a new prefix inherits neither the
// noindex header nor the rate-limit metering, and each must be registered per-prefix.
export const metadata = { robots: { index: false, follow: false } }

export default async function ScanRedirect({
  params,
}: { params: Promise<{ id: string }> }) {
  // `id` is the truck slug (the segment name is forced to `id` by the sibling manage route — see header).
  const { id: slug } = await params
  const host = await customDomainFor(slug)

  // 🔴 307, AND THE STATUS CODE IS A DESIGN DECISION, NOT A DEFAULT.
  // `redirect()` issues a 307 Temporary Redirect. It MUST NOT be 301 or 308: those are PERMANENT, and
  // browsers and intermediaries cache them indefinitely — often with no way for the customer to clear it.
  // On a printed code that is a trap with no recovery: a truck whose plan lapses, whose domain expires, or
  // who stops paying their registrar would have customers permanently pinned to a dead address. A
  // temporary redirect is re-decided on every scan, which is the entire point of resolving per request.
  if (host) redirect(`https://${host}/`)

  // ⚠️ THE FALLBACK IS ALSO TEMPORARY, AND FOR THE SAME REASON. A truck with no custom domain today may
  // have one next month; a permanent redirect here would pin their printed code to the ordering page.
  redirect(`/trucks/${encodeURIComponent(slug)}/order`)
}
