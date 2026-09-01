'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { usePathname } from 'next/navigation'
import { isCustomHost } from '@/lib/custom-host'

/**
 * ── /embed IS THE ONE ROUTE THAT MUST NOT INITIALISE POSTHOG ────────────────────────────────────
 *
 * 🔴 WHY A CHECK INSIDE THE COMPONENT WOULD HAVE BEEN TOO LATE. `posthog.init()` below runs at MODULE
 * SCOPE. app/layout.tsx imports this file, and the root layout is inherited by every route, so the
 * init fires the moment the module is evaluated — before any component renders and before any
 * component could decide not to. The guard therefore has to be on the init itself.
 *
 * 🔴 WHY IT MATTERS ON THIS ROUTE SPECIFICALLY. /embed/<slug> renders INSIDE AN IFRAME ON THE
 * OPERATOR'S OWN DOMAIN. posthog-js sets no `persistence` option here, so it takes the library
 * default — `persistence: "localStorage+cookie"`, read from the installed posthog-js 1.386.6 bundle —
 * which means a cookie. In that frame it is a THIRD-PARTY cookie on somebody else's visitors, set by
 * us, on a page with no consent UI anywhere in the chain. Autocapture would also record their
 * visitors' clicks. Neither is ours to do.
 *
 * ── WHAT CHANGED, PRECISELY, AND WHAT DID NOT ───────────────────────────────────────────────────
 * The init call, its arguments and its TIMING are untouched for every other path: it is the same
 * `posthog.init(KEY, { api_host, person_profiles: 'identified_only' })`, at the same module-evaluation
 * moment, guarded by one added condition that is TRUE for every path that is not /embed.
 * ⚠️ KNOWN LIMIT, STATED RATHER THAN GLOSSED: the guard reads `window.location.pathname` ONCE, at
 * module evaluation, so it is decided by the ENTRY url. A client-side navigation from another route
 * INTO /embed would arrive with PostHog already initialised. Nothing in the app links to /embed and an
 * iframe always performs a fresh document load, so that path does not exist today — but if an in-app
 * link to /embed is ever added, this guard does not cover it.
 * ⚠️ AND THE BUNDLE STILL LOADS. This is a static import, so posthog-js is still in the JavaScript
 * the embed downloads. What does not happen is `init` — no cookie, no autocapture, no network call to
 * the PostHog host. "No PostHog cookie" is exact; "loads no PostHog" would not be.
 */
const IS_EMBED_ENTRY =
  typeof window !== 'undefined' && window.location.pathname.startsWith('/embed')

/**
 * 🔴 THE SAME FAILURE, ARRIVING THROUGH A DIFFERENT DOOR (V4).
 * The guard above keys on the PATH, which is exactly right for the iframe embed — it is served from
 * our own domain at `/embed/<slug>`. **It is useless on an operator's own domain**, where the same
 * page is served at `/`: the path test is false, the init runs, and `persistence: "localStorage+cookie"`
 * lands a THIRD-PARTY cookie on their visitors, on their address, with autocapture recording their
 * customers' clicks and no consent gate anywhere in the chain. That is precisely what the embed route
 * was built to avoid, and the path-shaped guard did not see it coming.
 * ⚠️ SO THE HOST IS TESTED TOO, AND IT IS AN ALLOW-LIST (lib/custom-host.ts): analytics run on hosts
 * we recognise as ours — including `*.vercel.app`, so previews are unaffected — and on nothing else.
 * A host we have not thought of gets no analytics, which is the safe direction to be wrong in.
 */
const IS_CUSTOM_HOST_ENTRY =
  typeof window !== 'undefined' && isCustomHost(window.location.host)

if (typeof window !== 'undefined' && !IS_EMBED_ENTRY && !IS_CUSTOM_HOST_ENTRY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: 'identified_only',
  })
}

/**
 * @param host the request host, passed down from the ROOT LAYOUT, which is a server component that
 *   already reads it (app/layout.tsx:23).
 *   🔴 A PROP AND NOT `window.location`, AND THE REASON IS HYDRATION. `IS_CUSTOM_HOST_ENTRY` above is
 *   derived from `window`, so it is FALSE during server render and TRUE on the client — branching the
 *   returned tree on it would render <PostHogProvider> on the server and a bare fragment on the client.
 *   The prop has the same value in both places, exactly as `usePathname()` does for the path.
 */
export function CSPostHogProvider({ children, host }: { children: React.ReactNode; host?: string }) {
  // ⚠️ `usePathname()`, NOT the module constant above, and the difference is a hydration bug avoided.
  // IS_EMBED_ENTRY is derived from `window`, so it is FALSE during server render and TRUE on the
  // client — branching the returned tree on it would render <PostHogProvider> on the server and a
  // bare fragment on the client. usePathname returns the same value in both places.
  const pathname = usePathname()
  if (pathname?.startsWith('/embed')) return <>{children}</>
  if (isCustomHost(host)) return <>{children}</>
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
