// ── 🔴 SERVER-SIDE GATE FOR EVERYTHING UNDER /dev — PRODUCTION RETURNS 404 ──────────────────────────
// `/dev/ticket-preview` was publicly reachable in production: app/dev/ had no layout, and proxy.ts lists
// it in neither `isProtected` nor `isPublic`, so it fell through to "not protected" and served to anyone
// who guessed the URL.
//
// 🔴 THIS GATES THE DIRECTORY, NOT A ROUTE. Every page under app/dev/ — including ones added later — is
// covered because a Next.js layout wraps its whole subtree. A per-page gate would protect the page whose
// author remembered it and silently expose the next one.
//
// notFound() rather than a redirect: in production these routes genuinely do not exist, and a 404 says so
// without advertising that something is there. (app/landing/layout.tsx redirects instead because /landing
// IS a real production route that is merely admin-only. Different situation, deliberately different verb.)
//
// ⚠️ DEV IS UNTOUCHED, AND THAT IS LOAD-BEARING. /dev/ticket-preview is the ONLY way anyone can see a
// kitchen ticket before hardware exists — breaking local access would be worse than leaving it exposed.
// The condition is on NODE_ENV alone, so `next dev` never evaluates the gate.
//
// ⚠️ KNOWN LIMIT: a layout wraps pages, not Route Handlers. If a `route.ts` is ever added under app/dev/,
// this will NOT gate it and it will need its own guard (or a proxy.ts rule). There are none today.
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound()
  return <>{children}</>
}
