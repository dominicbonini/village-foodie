import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CSPostHogProvider } from "./providers"; // 👈 We import the provider here

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Village Foodie",
    template: "%s | Village Foodie",
  },
  description: "Find local food trucks and pop-ups visiting villages near you.",
  openGraph: {
    title: "Village Foodie 🍔",
    description: "Find local food trucks and pop-ups visiting villages near you.",
    url: "https://villagefoodie.co.uk", 
    siteName: "Village Foodie",
    images: [
      {
        url: "/og-image.png", 
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
    title: "Village Foodie 🍔",
    description: "Find local food trucks and pop-ups visiting villages near you.",
    images: ["/og-image.png"], 
  },
  // 👇 The inline 'icons' block has been completely removed! 👇
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
        {/* 👇 We wrap the children in the provider 👇 */}
        <CSPostHogProvider>
          {children}
        </CSPostHogProvider>
      </body>
    </html>
  );
}