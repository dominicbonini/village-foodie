import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://villagefoodie.co.uk"),
  title: {
    default: "Village Foodie", 
    template: "%s | Village Foodie",
  },
  description: "Find local food trucks and pop-ups visiting villages near you.",
  openGraph: {
    title: "Village Foodie",
    description: "Find local food trucks and pop-ups visiting villages near you.",
    url: "https://villagefoodie.co.uk", 
    siteName: "Village Foodie",
    images: [
      {
        url: "https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?auto=format&fit=crop&w=1200&h=630&q=80", 
        width: 1200,
        height: 630,
        alt: "Village Foodie - Find your next meal",
      },
    ],
    locale: "en_GB", 
    type: "website",
  },
  twitter: {
    card: "summary_large_image", 
    title: "Village Foodie",
    description: "Find local food trucks and pop-ups visiting villages near you.",
    images: ["https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?auto=format&fit=crop&w=1200&h=630&q=80"], 
  },
  icons: {
    icon: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🚚%3C/text%3E%3C/svg%3E",
  },
};

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