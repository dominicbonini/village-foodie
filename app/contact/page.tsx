'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ContactForm() {
  const searchParams = useSearchParams();
  const topic = searchParams.get('topic') || '';
  
  // 1. We use the Embed URL (not the standalone URL)
  // 2. transparentBackground=1 makes it blend into your page
  // 3. dynamicHeight=1 allows the form to resize automatically
  const tallyUrl = `https://tally.so/embed/7R2Ra2?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1&topic=${encodeURIComponent(topic)}`;

  return (
    <iframe 
      src={tallyUrl}
      loading="lazy" 
      width="100%" 
      height="500" 
      frameBorder="0" 
      title="Contact Village Foodie"
      className="w-full"
      style={{ minHeight: '500px' }}
    ></iframe>
  );
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Tally Widget Script handles the automatic resizing of the iframe */}
      <Script src="https://tally.so/widgets/embed.js" strategy="lazyOnload" />

      {/* Header */}
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-xl font-bold flex items-center gap-2 hover:opacity-80 transition-opacity">
            Village Foodie <span className="text-2xl">🚚</span>
          </Link>
          
          {/* UPDATED: Generic "Back" button (works for both Map and List views) */}
          <Link href="/" className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors border border-slate-700">
            ← Back
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 w-full max-w-2xl mx-auto p-4 md:p-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Get in Touch</h1>
            <p className="text-slate-500 text-center mb-6 text-sm">
              Select an option below to add a business, report an issue, or say hello.
            </p>
            
            {/* Suspense wrapper handles the loading state of the URL parameters */}
            <Suspense fallback={<div className="h-96 bg-slate-50 animate-pulse rounded-lg flex items-center justify-center text-slate-400">Loading form...</div>}>
              <ContactForm />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-900 text-slate-300 p-6 text-center mt-auto">
        <p className="text-[10px] text-slate-500">
          Village Foodie © {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}