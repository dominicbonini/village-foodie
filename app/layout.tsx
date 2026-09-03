import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { CSPostHogProvider } from "./providers";
// Mounted ONCE, here, at the app boundary — not per-surface. It starts the auth-state observer and
// renders the involuntary-sign-out banner. Harmless on customer pages: with no session, no SIGNED_OUT
// can fire, so it renders null and costs one client construction.
import { SessionAlertBanner } from "@/components/auth/SessionAlertBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const host = headersList.get('host') || ''
  const isHG = host.includes('hatchgrab')

  const siteName = isHG ? 'HatchGrab' : 'Village Foodie'
  const description = isHG
    ? 'The food truck management platform'
    : 'Find local food trucks and pop-ups visiting villages near you.'
  const baseUrl = isHG ? 'https://hatchgrab.com' : 'https://villagefoodie.co.uk'

  // ── 🔴 THE SHARE IMAGE IS NOW ON THE SAME BRANCH AS EVERYTHING ELSE (3 September 2026) ──────────
  // It was the ONE value on this object that was not. `siteName`, `description`, `baseUrl` and the
  // image's own `alt` all branched on `isHG` correctly, while `openGraph.images[0].url` and
  // `twitter.images[0]` were string literals pointing at `/logos/village-foodie logo-sharing.png`.
  // 🔴 SO A HATCHGRAB LINK PREVIEW SHOWED THE CONSUMER BRAND'S LOGO, LABELLED "HatchGrab Logo" —
  // because the alt text was derived from the branched `siteName` while the image was not.
  // ⚠️ THAT IS WHY IT SURVIVED REVIEW: every value a reader checks to confirm the branding is
  // host-aware WAS host-aware. A wrong value derived from a correct variable reads as correct.
  // Measured on production before the fix, not inferred — see docs/share-preview-report.md.
  //
  // ⚠️ ABSOLUTE, AND BUILT FROM THE REQUEST HOST — NOT A RELATIVE PATH.
  // A relative URL resolves against `metadataBase`, which is the APEX (`https://hatchgrab.com`), and
  // the apex 307s to `www` for static assets — so the declared og:image was a REDIRECT rather than an
  // image. Crawlers are not obliged to follow one. `host` is whatever actually served this response,
  // so this URL cannot redirect by construction, on production or on a preview deployment.
  // 🔴 `baseUrl` IS DELIBERATELY UNTOUCHED. og:url and metadataBase still read the apex; changing
  // them is a separate decision and was explicitly out of scope for this change.
  //
  // 🔴 THE DIMENSIONS BELOW ARE MEASURED FROM THE FILE, NOT INTENDED. The previous pair said
  // 1200x630 over a file that was actually 2397x1270 — the tags did not describe the resource they
  // pointed at. If the card is ever re-rendered, re-read its PNG header and update these two numbers.
  const shareImage = isHG
    ? { url: `https://${host}/logos/hatchgrab-share-card.png`, width: 1200, height: 630 }
    : { url: '/logos/village-foodie logo-sharing.png', width: 1200, height: 630 }

  return {
    metadataBase: new URL(baseUrl),
    manifest: "/manifest.json",
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description,
    openGraph: {
      title: siteName,
      description,
      url: baseUrl,
      siteName,
      images: [
        {
          url: shareImage.url,
          width: shareImage.width,
          height: shareImage.height,
          alt: `${siteName} Logo`,
        },
      ],
      locale: "en_GB",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: siteName,
      description,
      // Same one value as openGraph above — NOT a second literal. The two used to be independent
      // strings saying the same thing, which is how one could be corrected without the other.
      images: [shareImage.url],
    },
    // ── 🔴 THE TAB ICON IS HOST-BRANDED, LIKE THE NAME AND THE DESCRIPTION ABOVE. ────────────────
    // It was ONE data-URI of a 🚚 EMOJI on BOTH hosts. That is right for Village Foodie — a consumer
    // directory of food trucks — and wrong for HatchGrab, whose mark is the bolt. The two brands were
    // sharing an icon the way they were never allowed to share a name.
    // 🔴 AND THE EMOJI WAS NOT WHAT ANYONE ACTUALLY SAW ON HATCHGRAB. `public/favicon.ico` is served
    // at the root whatever this says, and browsers fall back to it whenever an SVG data URI does not
    // render — Safari among them. So the reported "orange bolt on a blue background" was favicon.ico,
    // not this line. Fixing one without the other would have changed nothing.
    // ⚠️ `?v=3` IS DELIBERATE AND IS NOT DECORATION. A favicon is one of the most aggressively cached
    // things a browser holds; without a changed URL the old icon survives a deploy indefinitely. The
    // FILE at /favicon.ico is also replaced, for the implicit root request that carries no query.
    icons: isHG
      ? {
          icon: [
            { url: "/favicon.ico?v=3", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
            { url: "/icons/icon-192.png?v=3", sizes: "192x192", type: "image/png" },
            { url: "/icons/icon-512.png?v=3", sizes: "512x512", type: "image/png" },
          ],
          apple: "/apple-touch-icon.png?v=3",
        }
      : {
          icon: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🚚%3C/text%3E%3C/svg%3E",
          apple: "/apple-touch-icon.png?v=3",
        },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // viewport-fit=cover lets the page extend under the device safe areas so env(safe-area-inset-*) is
  // populated (used by the operator AppHeader to fill the status-bar strip in the native app). No-op in a
  // normal browser (no safe area) → web unchanged.
  viewportFit: 'cover',
}

// ASYNC because it now reads the request host — `headers()` is async in this Next version and an
// `await` cannot sit in a synchronous component. (TS1308, caught by the typecheck rather than in a
// browser; the same class the dashboard hit during the deny-by-default work.)
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 🔴 READ ONCE, HERE. `generateMetadata` above reads the same header for its own branding; this is
  // the same value handed to the analytics provider so its server and client renders agree.
  const host = (await headers()).get('host') ?? undefined
  // 🔴 THE BRAND, RESOLVED SERVER-SIDE AND PUT ON <html> SO CSS CAN SWITCH ON IT WITH NO FLICKER.
  // The customer ordering page and the truck schedule page are both client components, and
  // lib/domain.ts's isHatchGrab() returns FALSE on the server — so branching on it there would render
  // the Village Foodie mark into the SSR HTML and swap it after hydration, which is a visible logo
  // flash on every load. This value comes from the SAME `host` read directly above, so the server and
  // the client cannot disagree.
  // ⚠ ADDITIVE ONLY. Nothing reads this attribute except the two customer surfaces named in
  // docs/brand-consolidation-report.md; no operator surface changes appearance because of it.
  const brand = host?.includes('hatchgrab') ? 'hatchgrab' : 'villagefoodie'
  return (
    <html lang="en" data-brand={brand}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CSPostHogProvider host={host}>
          {children}
          <SessionAlertBanner />
        </CSPostHogProvider>
      </body>
    </html>
  );
}