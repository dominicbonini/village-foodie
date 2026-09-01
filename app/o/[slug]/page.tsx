// app/o/[slug]/page.tsx
//
// ── 🔴 THE PRINTED QR CODE RESOLVES ITS DESTINATION HERE, ON EVERY SCAN. ────────────────────────────
//
// THE PROBLEM THIS SOLVES. The order QR code is PRINTED — on hatches, boards, menus, flyers. A printed
// pattern cannot be changed. So the URL it encodes must never change, and it does not: it is
// `hatchgrab.com/o/<slug>`, built by `scanUrl()` (lib/custom-domain/copy.ts) and passed straight to the
// generator. An operator who sets up their own address later does not reprint anything.
//
// 🔴 THE STATIC-VERSUS-DYNAMIC DISTINCTION, WHICH IS THE WHOLE DESIGN. A "static" QR carries its
// destination in the pattern; changing where it points means reprinting it. A "dynamic" one carries a
// permanent address that DECIDES the destination when it is visited. This file is that decision.
//
// 🔴 AND IT IS A SEPARATE ADDRESS FROM THE ORDERING PAGE FOR ONE REASON: A PAGE THAT BOTH DECIDES AND
// SERVES CANNOT TELL AN INBOUND SCAN FROM A CUSTOMER COMING BACK TO BUY. This decision used to live on
// `/trucks/<slug>/order`'s layout, so it fired on EVERY arrival at the ordering page — including the
// customer returning from the operator's own domain by tapping Order. They were sent back to the page
// they were already on. Each hop was a valid 307 then a 200, and the return leg was a user click, so no
// browser reported a loop and nothing reached monitoring. It armed only when setup SUCCEEDED.
// See docs/qr-redirect-trace-report.md and docs/qr-redirect-fix-report.md.
//
// ✅ SO THE TWO URLS NOW HAVE ONE JOB EACH:
//      /o/<slug>              DECIDES — custom domain if the five conditions hold, else the order page.
//      /trucks/<slug>/order   SERVES — always, for every arrival, with no redirect of any kind.
//
// 🔴 RESOLVED PER REQUEST. NOTHING IS STORED. A stored target would be wrong for the whole window
// between a truck's state changing and something writing the new value — and every scan in that window
// would go to the wrong place, or nowhere. Resolving here means a lapsed plan, an unconfirmed domain or
// one that has stopped resolving falls back to our own page ON THE NEXT SCAN, with no job to run first
// and no row to fix. `force-dynamic` is what guarantees the read actually happens each time.
import { redirect } from 'next/navigation'
import { customDomainFor } from '@/lib/custom-domain/redirect-target'

export const dynamic = 'force-dynamic'

// ⚠️ NOT INDEXED. This is a redirector, not a destination — an indexed copy of it would compete with
// the pages it points at and would cache a decision that is meant to be re-made on every visit.
export const metadata = { robots: { index: false, follow: false } }

export default async function ScanRedirect({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const host = await customDomainFor(slug)

  // 🔴 307, AND THE STATUS CODE IS A DESIGN DECISION, NOT A DEFAULT.
  // `redirect()` issues a 307 Temporary Redirect. It MUST NOT be 301 or 308: those are PERMANENT, and
  // browsers and intermediaries cache them indefinitely — often with no way for the customer to clear
  // it. On a printed code that is a trap with no recovery: a truck whose plan lapses, whose domain
  // expires, or who simply stops paying their registrar would have customers permanently pinned to a
  // dead address by a redirect WE issued, and reprinting the code would not undo it because the code is
  // not what is cached. A temporary redirect is re-decided on every scan, which is the entire point of
  // resolving per request — a permanent one would silently convert this dynamic code back into a static
  // one, with the destination baked into the customer's browser instead of the paper.
  if (host) redirect(`https://${host}/`)

  // ⚠️ THE FALLBACK IS ALSO TEMPORARY, AND FOR THE SAME REASON. A truck with no custom domain today may
  // have one next month; a permanent redirect here would pin their printed code to the ordering page
  // for every customer who ever scanned it before they set one up.
  redirect(`/trucks/${encodeURIComponent(slug)}/order`)
}
