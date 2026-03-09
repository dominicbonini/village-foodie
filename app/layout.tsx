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
    url: "https://yourwebsite.com", // 👈 IMPORTANT: Update this to your actual domain
    siteName: "Village Foodie",
    images: [
      {
        url: "/og-image.jpg", // 👈 This points to an image we need to put in your public folder
        width: 1200,
        height: 630,
        alt: "Village Foodie - Find your next meal",
      },
    ],
    locale: "en_GB", // Tells platforms this is a UK site
    type: "website",
  },
  twitter: {
    card: "summary_large_image", // Forces the "Big Image" layout on X/Twitter and iMessage
    title: "Village Foodie 🍔",
    description: "Find local food trucks and pop-ups visiting villages near you.",
    images: ["/og-image.jpg"], // 👈 Same image as above
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
        {/* 👇 We wrap the children in the provider 👇 */}
        <CSPostHogProvider>
          {children}
        </CSPostHogProvider>
      </body>
    </html>
  );
}