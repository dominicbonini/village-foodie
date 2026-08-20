// app/contact/page.tsx
// ONE ROUTE, TWO BRANDS. /contact is THE support page for both products, and it is the Support URL
// given to App Store review: https://www.hatchgrab.com/contact
//
// ── 🔴 THE BRANCH IS DECIDED ON THE SERVER, FROM THE Host HEADER ────────────────────────────────────
// `isHatchGrabHost` from lib/brand.ts — the SAME predicate app/layout.tsx already branches metadata on
// and proxy.ts deliberately mirrors. There is no second host test in this codebase and this file does
// not add one.
// 🔴 NOT ON THE CLIENT. A client-side host branch would ship both brands' markup to both audiences and
// paint the wrong one for a frame; on a page a reviewer opens, that frame is the whole impression.
// ⚠️ THIS ROUTE WAS ALREADY `ƒ (Dynamic)` BEFORE THIS CHANGE — confirmed in the build route table, and
// it has to be: useSearchParams in the embed already opted it out of static prerendering. Reading
// headers() therefore costs NOTHING here. It would have been a real cost on a static route.
//
// ── 🔴 THE VILLAGE FOODIE RENDER BELOW IS UNCHANGED, CHARACTER FOR CHARACTER ────────────────────────
// Same wrapper, same header, same copy, same footer, same classes, same Suspense fallback. The only
// edit is that the embed now arrives as an imported island instead of a function defined in this file,
// which changes no markup. Verified by diffing the served HTML before and after — see
// docs/contact-host-branding.md.
//
// ── 🔴 PUBLIC AND UNGATED ON BOTH HOSTS, AND IT MUST STAY THAT WAY ─────────────────────────────────
// This route sits at the top level, NOT under app/landing/, whose layout.tsx is an admin-only gate in
// production. A support page behind that gate would redirect Apple's reviewer and the Support URL
// would be dead on arrival. Nothing in proxy.ts matches /contact either: its root rewrite is guarded
// on `pathname === '/'`. Do not move this route under a gated segment.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Script from 'next/script';
import Link from 'next/link';
import { Suspense } from 'react';
import { isHatchGrabHost } from '@/lib/brand';
import { BrandHomeLink } from '@/components/shared/BrandHomeLink';
import { ContactForm } from './ContactForm';

/** The one place this route asks which brand it is serving. */
async function onHatchGrab(): Promise<boolean> {
  const headersList = await headers();
  return isHatchGrabHost(headersList.get('host') || '');
}

// ── METADATA ───────────────────────────────────────────────────────────────────────────────────────
// 🔴 THE VILLAGE FOODIE BRANCH RETURNS AN EMPTY OBJECT ON PURPOSE. That page had no metadata export at
// all, so its <head> came entirely from app/layout.tsx's host-branched generateMetadata: <title> reads
// "Village Foodie" and there is no robots meta. Returning {} overrides nothing and keeps that head
// identical. Adding so much as an explicit robots tag here would change bytes on a page this change is
// required to leave alone.
// ⚠️ INDEXABLE ON BOTH HOSTS BY DEFAULT, WHICH IS THE REQUIREMENT. Nothing emits noindex for this
// route: vercel.json scopes its `X-Robots-Tag: noindex` to `/api/(.*)` and `/trucks/(.*)`, and the
// landing's `robots: { index: false }` belongs to app/landing/page.tsx alone. The HatchGrab branch
// states index/follow explicitly anyway — /support did, and this is the page Apple was given.
// ⚠️ `title: 'Support'` RENDERS AS "Support | HatchGrab" via the root layout's template. /support said
// 'Support — HatchGrab' and rendered the brand TWICE, "Support — HatchGrab | HatchGrab". Not copied.
export async function generateMetadata(): Promise<Metadata> {
  if (!(await onHatchGrab())) return {};
  return {
    title: 'Support',
    description: 'Get help with HatchGrab. Send us a message and we will come back to you by email.',
    robots: { index: true, follow: true },
  };
}

export default async function ContactPage() {
  if (await onHatchGrab()) {
    // 🔴 DYNAMIC import, NOT A TOP-LEVEL ONE. That module imports the landing's stylesheet and three
    // next/font faces at module scope; a static import would attach their <link> tags to this route
    // for BOTH brands. Measured, not assumed — see the note in HatchGrabContact.tsx.
    const { HatchGrabContact } = await import('./HatchGrabContact');
    return <HatchGrabContact />;
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Script src="https://tally.so/widgets/embed.js" strategy="lazyOnload" />

      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          {/* NON-NAVIGATING INSIDE THE NATIVE SHELL. This page is reachable in the app: the legal
              layout's footer links /contact, and the legal pages are the App-Store-required in-app
              link. href="/" is the Village Foodie DISCOVERY MAP, a different product, with no back
              button to return from once a WebView lands there.
              kind="branding": this is the site's wordmark, so the app renders it unchanged and simply
              does not navigate. A non-clickable logo reads as identity, not as a control.
              WEB IS BYTE-IDENTICAL: the same <Link href="/"> with the same classes.
              (Comment kept ASCII-only: this file has never held an em dash or an emoji marker, and the
              non-ASCII census flags any file that gains a character class it never had.) */}
          <BrandHomeLink href="/" kind="branding" className="text-xl font-bold flex items-center gap-2 hover:opacity-80 transition-opacity">
            Village Foodie <span className="text-2xl">🚚</span>
          </BrandHomeLink>
          <Link href="/" className="text-xs font-bold bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors border border-slate-700">
            ← Back
          </Link>
        </div>
      </header>

      <div className="flex-1 w-full max-w-2xl mx-auto p-4 md:p-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Get in Touch</h1>
            <p className="text-slate-500 text-center mb-6 text-sm">
              Select an option below to add a business, report an issue, or say hello.
            </p>
            
            <Suspense fallback={<div className="h-96 bg-slate-50 animate-pulse rounded-lg flex items-center justify-center text-slate-400">Loading form...</div>}>
              <ContactForm
                title="Contact Village Foodie"
                height="500"
                className="w-full"
                style={{ minHeight: '500px' }}
              />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 text-slate-300 p-6 text-center mt-auto">
        <p className="text-[10px] text-slate-500">
          Village Foodie © {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
