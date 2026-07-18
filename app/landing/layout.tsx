// SERVER-SIDE gate for the /landing preview. In PRODUCTION this route is ADMIN-ONLY: any non-admin visitor is
// redirected (server-side, before any HTML ships) to the public home `/` — which is NOT gated (see proxy.ts
// isPublic), so there is no redirect loop. Runs in the layout so app/landing/page.tsx content is untouched.
//
// Uses the app's canonical admin check (operators.is_admin) via lib/auth/admin — the same gate the admin
// panel/API use — not a new one. force-dynamic + reading cookies means this evaluates per-request (the page is
// never statically served past the gate). Dev is intentionally left open so local iteration isn't blocked.
import { redirect } from 'next/navigation'
import { verifyAdmin } from '@/lib/auth/admin'

export const dynamic = 'force-dynamic'

export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' && !(await verifyAdmin())) {
    redirect('/')
  }
  return <>{children}</>
}
