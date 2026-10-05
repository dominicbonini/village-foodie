// app/p/[token]/page.tsx — THE PRIVATE LINK.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS ROUTE IS, AND WHAT IT IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// It resolves a token to one event and forwards to the NORMAL ordering page scoped to that event. It
// is not a second ordering page: there is one order flow in this product and a private event uses it,
// which is why a private event's prices, slots, deals, stock and capacity all work without a line of
// new code — they are the same code.
//
// ⛔ IT IS THE ONLY WAY IN. The event is absent from the discovery feed and the map, redacted on every
// public schedule, and never auto-detected by the menu API — so this page, and the QR code that
// encodes it, are the whole of the access.
//
// 🔴 THE TOKEN IS RESOLVED ON THE SERVER, HERE, BEFORE ANYTHING RENDERS. A client-side check would
// put the decision in the browser and the event id in the page source for a token that was refused.
//
// ⚠️ REGISTRATIONS THIS ROUTE NEEDS, AND WHY EACH ONE IS NOT OPTIONAL:
//   • `/p/(.*)` X-Robots-Tag noindex in vercel.json — a private event's page must never be indexed,
//     and `metadata` below is belt-and-braces for crawlers that read the tag only from the header.
//   • `/p` in proxy.ts's `isGeneralPublic` — without it this is an UNMETERED public database read,
//     which is exactly the regression the `/o/` note in that file records. A token is unguessable but
//     the ENDPOINT is not: anyone can hammer `/p/<junk>` forever.
// Both are registered. `scripts/private-events.cjs` asserts both, because an unregistered public
// route is invisible until it is abused.

import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { resolvePrivateLink } from '@/lib/private-events/read'
import {
  LINK_REPLACED, LINK_MADE_PUBLIC, LINK_UNKNOWN, LINK_ORDERING_OFF_GUEST, GUEST_PRIVATE_LABEL,
} from '@/lib/private-events/copy'

export const dynamic = 'force-dynamic'

/** ⛔ NOINDEX, NOFOLLOW. Same posture as `/o` and `/order`. */
export const metadata = { robots: { index: false, follow: false } }

/* 🔴 SERVICE ROLE, BECAUSE THE TOKEN **IS** THE AUTHORISATION. There is no session here — the guest
 * has no account and never will — so the row is read with the service key after the token has been
 * matched. ⚠️ Created per request rather than at module scope, so a build without the env vars does
 * not throw at import time. */
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * The one message shell.
 * 🔴 NO TRUCK BRANDING, NO LOGO, NO LINKS ANYWHERE ELSE. A dead link should say what happened and
 * stop — sending the guest to a truck's public page would be sending them to the wrong event.
 */
function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
          {GUEST_PRIVATE_LABEL}
        </p>
        <h1 className="mt-3 text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
      </div>
    </main>
  )
}

export default async function PrivateLinkPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const outcome = await resolvePrivateLink(admin(), decodeURIComponent(token || ''))

  switch (outcome.kind) {
    case 'ok': {
      /* 🔴 THE TOKEN TRAVELS ON AS `pt`, AND IT HAS TO. The submit route admits an order against a
       * private event ONLY against its current token, so the ordering page needs it to place one.
       * ⚠️ THIS IS NOT A LEAK OF A SECRET INTO A URL — the secret ARRIVED in a URL. The guest already
       * has it; forwarding it keeps the one credential in the one place they got it.
       * ⚠️ `event_id` IS THE PARAM THE ORDER PAGE ALREADY READS (page.tsx:253), so the scoping is the
       * existing deep-link path rather than a new one. */
      const slug = outcome.truck.slug
      if (!slug) return <Message title="This truck isn’t set up for online ordering yet." body={LINK_UNKNOWN} />
      redirect(`/trucks/${encodeURIComponent(slug)}/order?event_id=${encodeURIComponent(outcome.event.id)}&pt=${encodeURIComponent(token)}`)
    }

    /* The event is private and current, but the operator has switched link ordering off. The guest
     * gets told to order at the hatch — the event is real, so "this link doesn't work" would be a
     * lie. */
    case 'ordering_off':
      return <Message title="Ordering online isn’t switched on" body={LINK_ORDERING_OFF_GUEST} />

    case 'replaced':
      return (
        <Message
          title="This link has been replaced"
          body={outcome.reason === 'made_public'
            ? LINK_MADE_PUBLIC(outcome.truckName)
            : LINK_REPLACED(outcome.truckName)}
        />
      )

    /* ⛔ 'unavailable' AND 'unknown' GET THE SAME WORDS, DELIBERATELY. A guest cannot act on the
     * difference between "we could not read the database" and "that is not a link" — and telling
     * them which would tell anyone probing the endpoint whether a token exists. */
    case 'unavailable':
    case 'unknown':
    default:
      return <Message title="This link doesn’t work" body={LINK_UNKNOWN} />
  }
}
