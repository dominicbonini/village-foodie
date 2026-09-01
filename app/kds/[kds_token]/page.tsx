// ── 🔴 THIS ROUTE USED TO HAND OUT THE OWNER CREDENTIAL. IT NO LONGER DOES. ─────────────────────────
// It was a TOKEN-EXCHANGE endpoint: look up the van by its `kds_token`, then
//   redirect(`/dashboard/${truck.dashboard_token}/kds?van_id=…&van_name=…`)
// So a printed kitchen-screen link escalated to the truck's FULL dashboard_token and put it in the
// address bar — and therefore in browser history, in Vercel's request logs, and in PostHog's
// `$current_url`. Live dashboard tokens have already been confirmed in PostHog. A `kds_token` is a
// van-scoped credential meant for a screen on a wall; a `dashboard_token` reaches refunds, customer
// personal data, prices and the menu. Trading one for the other on a redirect was the defect.
//
// ── WHY THIS IS A ROUTE CHANGE AND NOT A REDIRECT CHANGE ────────────────────────────────────────────
// The KDS genuinely NEEDS the dashboard_token downstream: it sends it to /api/dashboard,
// /api/dashboard/action, /api/events/manage and /api/events/action, and every one of those
// authenticates on `dashboard_token` alone. Making them accept a `kds_token` would mean changing the
// dashboard access checks, which is a separate workstream. So the token is not removed — it is moved
// OFF the URL: resolved HERE, on the server, and handed to the client component as a prop. It is never
// in a redirect target, never in the address bar, never in a query string.
//
// 🔴 WHAT THIS WIDENS, STATED PLAINLY — because swapping one leaked credential for another would be no
// fix at all. `kds_token` now stays in the address bar for the whole session, where before it appeared
// for one navigation and was replaced by the dashboard_token. So kds_token's exposure INCREASES: it now
// reaches history, logs and analytics persistently rather than once.
// ⚠️ THE TRADE IS DELIBERATE AND IT IS NOT SYMMETRIC. What leaks is now a VAN-SCOPED screen credential
// instead of the truck's OWNER credential, and dashboard_token's exposure on this path drops to ZERO.
// A leaked kds_token reaches this screen; a leaked dashboard_token reaches refunds and every customer's
// phone number. ⚠️ It is still a bearer credential in a URL and should not be treated as solved — the
// per-device model in the auth investigation is the actual answer.
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import KdsPage from '@/app/dashboard/[token]/kds/page'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function VanKdsPage({
  params,
}: {
  params: Promise<{ kds_token: string }>
}) {
  const { kds_token } = await params

  // ⚠️ THE TWO LOOKUPS AND BOTH FAILURE REDIRECTS ARE UNCHANGED, deliberately. An invalid or inactive
  // token still lands on /login exactly as it did; this task moves a credential, it does not touch what
  // counts as a valid one.
  const { data: van } = await supabase
    .from('truck_vans')
    .select('id, name, truck_id, active')
    .eq('kds_token', kds_token)
    .single()

  if (!van || !van.active) redirect('/login')

  const { data: truck } = await supabase
    .from('trucks')
    .select('dashboard_token, active')
    .eq('id', van.truck_id)
    .single()

  if (!truck || !truck.active) redirect('/login')

  // 🔴 RENDERED, NOT REDIRECTED. `truck.dashboard_token` crosses to the client as a prop in the RSC
  // payload. That is not a URL: it is not in the address bar, not in history, not in the Referer header,
  // not in a request path a log or an analytics `$current_url` can capture.
  // ⚠️ IT IS NOT A SECRET FROM THIS BROWSER, AND IT WAS NEVER GOING TO BE. The KDS must send it on every
  // fetch it makes, so it is necessarily readable by client JS on this page — the same as it always was.
  // What changes is that it stops being broadcast to every system that records URLs.
  // ⚠️ Suspense because the child reads useSearchParams(); this page is dynamic (it awaits params and
  // queries the database), so it would not be prerendered anyway — the boundary is belt-and-braces.
  return (
    <Suspense fallback={null}>
      <KdsPage token={truck.dashboard_token} vanId={van.id} vanName={van.name} />
    </Suspense>
  )
}
