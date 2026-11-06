// app/contact/ContactForm.tsx
// THE TALLY EMBED, AND THE ONLY CLIENT CODE ON /contact. Lifted out of app/contact/page.tsx when that
// page became a SERVER component so it could read the Host header.
//
// 🔴 THE FORM IS UNTOUCHED AND THERE IS STILL ONLY ONE. Same id `7R2Ra2`, same five flags in the same
// order, same three query parameters, same encodeURIComponent on each. Both brands embed THIS, so the
// two cannot drift the way two pages did.
//
// 🔴 IT STAYS A CLIENT COMPONENT BECAUSE OF useSearchParams, AND FOR NO OTHER REASON. The brand branch
// is decided on the SERVER in page.tsx — never here. `topic`, `venue` and `truck` are sent by the
// existing links on the discovery surfaces (Footer.tsx, TruckClient.tsx, VenueClient.tsx) and must
// keep arriving at the form.
//
// ── ⚠️ WHY THE FRAME'S PRESENTATION IS PROPS AND THE URL IS NOT ────────────────────────────────────
// The two brands wrap the same form in different chrome, and one of those differences is not cosmetic:
// the accessible name. It read "Contact Village Foodie" on every host, which is the exact branding
// leak this change exists to remove — a screen reader on hatchgrab.com announced the other brand.
// app/support/page.tsx used "Contact HatchGrab support"; that string moves here with the rest of it.
// 🔴 EVERY PROP IS PASSED EXPLICITLY AT BOTH CALL SITES AND NONE HAS A DEFAULT. A default is what
// would let a future third call site inherit the wrong brand's name silently.
// ⚠️ `height` IS A STRING, NOT A NUMBER, deliberately: the Village Foodie page rendered height="500"
// from a string literal, and a string prop serialises to the identical attribute. Nothing about that
// page's bytes may move.
'use client';

import { useSearchParams } from 'next/navigation';
import type { CSSProperties } from 'react';

export interface ContactFormProps {
  /** iframe accessible name. Brand-specific — see the note above. */
  title: string;
  /** Rendered verbatim as the height attribute. String, so the markup is byte-stable. */
  height: string;
  className: string;
  style: CSSProperties;
}

export function ContactForm({ title, height, className, style }: ContactFormProps) {
  const searchParams = useSearchParams();
  const topic = searchParams.get('topic') || '';
  const venue = searchParams.get('venue') || ''; 
  const truck = searchParams.get('truck') || ''; // 👇 Catch the truck name
  
  let tallyUrl = `https://tally.so/embed/7R2Ra2?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1&topic=${encodeURIComponent(topic)}`;
  if (venue) tallyUrl += `&venue=${encodeURIComponent(venue)}`;
  if (truck) tallyUrl += `&truck=${encodeURIComponent(truck)}`; // 👇 Pass it to Tally

  return (
    <iframe 
      src={tallyUrl}
      loading="lazy" 
      width="100%" 
      height={height} 
      frameBorder="0" 
      title={title}
      className={className}
      style={style}
    ></iframe>
  );
}
