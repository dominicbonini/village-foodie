import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { CSPostHogProvider } from "./providers";

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
          url: "/logos/village-foodie logo-sharing.png",
          width: 1200,
          height: 630,
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
      images: ["/logos/village-foodie logo-sharing.png"],
    },
    icons: {
      icon: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🚚%3C/text%3E%3C/svg%3E",
      apple: "/apple-touch-icon.png",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CSPostHogProvider>
          {children}
        </CSPostHogProvider>
      </body>
    </html>
  );
}