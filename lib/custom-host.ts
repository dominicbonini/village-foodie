/**
 * ── WHICH HOSTS ARE OURS, AND WHICH BELONG TO AN OPERATOR ───────────────────────────────────────
 *
 * 🔴 ONE DEFINITION, IMPORTED BY THE EDGE AND BY THE SERVER. Every host test in this codebase before
 * today was `host.includes('hatchgrab')` with **Village Foodie as the `else`** — a two-way answer
 * with no way to express a third state. That default is why an unknown host reached the consumer
 * discovery map (docs/custom-domain-investigation.md §6). This file adds the third answer and is the
 * only place the question is decided.
 *
 * 🔴 IT IS AN ALLOW-LIST, NOT A DENY-LIST, AND THAT DIRECTION IS DELIBERATE. A host we do not
 * recognise is treated as an operator's, which means default-deny routing and no analytics. The
 * opposite shape — list the operator domains and treat everything else as ours — would need the
 * database to answer a question the edge asks on every request, and would fail OPEN on a host we had
 * not thought of. This fails closed.
 *
 * ⚠️ `*.vercel.app` IS KEPT ON THE OURS SIDE ON PURPOSE. Preview deployments are ours, and dropping
 * them would silently turn off analytics and turn on default-deny on every preview — a change nobody
 * asked for, discovered later, on a surface used to check work.
 */

/** Hosts that are ours. Substring/suffix tests, deliberately matching the existing `includes` shape. */
export function isOwnHost(rawHost: string | null | undefined): boolean {
  if (!rawHost) return false
  // Strip any port — `localhost:3000` and `example.com:443` must classify as their bare hostnames.
  const host = rawHost.toLowerCase().split(':')[0]
  return (
    host.includes('hatchgrab') ||
    host.includes('villagefoodie') ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.vercel.app')
  )
}

/**
 * True when the request arrived on a host that is not ours — i.e. an operator's own domain.
 * ⚠️ A MISSING HOST HEADER IS NOT A CUSTOM HOST. Returning true for `''` would put every
 * header-less request (a health check, a malformed client) onto the default-deny path, which is a
 * change to behaviour that has nothing to do with this feature.
 */
export function isCustomHost(rawHost: string | null | undefined): boolean {
  return !!rawHost && !isOwnHost(rawHost)
}

/** The lookup key stored in `trucks.custom_domain`: lower-cased hostname, no port, no scheme. */
export function hostKey(rawHost: string | null | undefined): string {
  return (rawHost || '').toLowerCase().split(':')[0].trim()
}

/**
 * ── WHAT MAY SERVE ON AN OPERATOR'S DOMAIN ──────────────────────────────────────────────────────
 *
 * 🔴 WORKED BACK FROM THE APP'S SURFACES, NOT FORWARD FROM THE ONES EXPECTED TO MATTER. Everything
 * this application serves is denied on a custom host unless it appears below:
 *   the schedule page · the dashboard · /manage · /kds · /admin · /login and the password routes ·
 *   the ordering flow · the customer order page · the discovery map · /trucks and /trucks/* ·
 *   /venues/* · /contact · /hire · /signup · /setup · /app · /landing · /privacy · /terms ·
 *   the order-cancellation page · the embed routes · EVERY api route · the demo dashboard exception.
 * **Two entries survive that list.**
 */
export const CUSTOM_HOST_ALLOWED = {
  /** The schedule page itself. The proxy rewrites it to the resolver route. */
  ROOT: '/',
  /** The one endpoint the page fetches. Nothing else may answer on this host. */
  EVENTS: '/api/embed/events',
  /**
   * ── 🔴 BUILD OUTPUT. WITHOUT IT NO PAGE CAN RUN, AND THE FAILURE LOOKS LIKE SUCCESS. ──────────
   * Added 28 August 2026, on the FIRST BROWSER TEST of this feature. The page returned 200, the events
   * endpoint returned 200 with the right data, and the page still sat on "Loading schedule" for ever:
   * **all 24 script and style chunks it references were 404.** No JavaScript ran, so the component that
   * calls the endpoint never mounted. **The data path was never the problem.**
   *
   * 🔴 WHY THE 47-SURFACE PROOF DID NOT CATCH IT. That proof enumerated ROUTES — every page and API
   * family this application serves — and every one refused correctly. **A browser does not request
   * routes. It requests whatever the document references**, and not one of those is a route: they are
   * content-hashed files emitted by the build. The enumeration was complete and the wrong set. §35.
   *
   * ⚠️ THE PREFIX IS `/_next/static/` AND NOT `/_next/`. `/_next/image` is the image optimiser — a
   * SERVER surface that fetches a caller-named URL — and this page does not use it: the truck's logo is
   * a plain <img> pointing at the storage bucket, deliberately (components/embed/EmbedParts.tsx). It
   * stays denied.
   */
  STATIC: '/_next/static/',
} as const

/**
 * 🔴 `/.well-known` IS ALLOWED THROUGH UNTOUCHED, AND IT IS NOT A CONVENIENCE.
 * Vercel's SSL documentation: *"The `/.well-known` path is reserved and cannot be redirected or
 * rewritten."* Certificates are issued and renewed by the HTTP-01 challenge, which is served from
 * that path. **Deny it and the certificate fails to renew** — and the operator's visitors get a
 * browser interstitial saying their own site is unsafe, months after anyone touched this code.
 * ⚠️ The proxy's matcher does NOT exclude `/.well-known`, so without this branch it would fall into
 * the default-deny below.
 */
export function isAcmeChallenge(pathname: string): boolean {
  return pathname.startsWith('/.well-known/')
}

/** Whether a path may serve on an operator's domain. Everything not named here is refused. */
export function isAllowedOnCustomHost(pathname: string): boolean {
  return (
    pathname === CUSTOM_HOST_ALLOWED.ROOT ||
    pathname === CUSTOM_HOST_ALLOWED.EVENTS ||
    // 🔴 THE ONLY PREFIX MATCH IN THIS FUNCTION, AND IT ENDS IN A SLASH ON PURPOSE. Without the
    // trailing slash `/_next/staticANYTHING` would pass; with it, only children of that directory do.
    // ⚠️ `pathname` is Next's already-normalised path, so `..` segments are resolved before this sees
    // them — a traversal cannot arrive here still carrying the prefix. Asserted, not assumed.
    pathname.startsWith(CUSTOM_HOST_ALLOWED.STATIC) ||
    isAcmeChallenge(pathname)
  )
}
