// lib/company.ts — 🔴 HATCHGRAB'S OWN LEGAL IDENTITY, NAMED ONCE (legal follow-ups, 19 October 2026).
//
// The company's registered name, number and registered office, as Companies House holds them. Every place
// that states them (the outreach email footer first — lib/outreach-mail-message.ts) passes these values into
// a message (`companyFooter`-style ICU args), so the WORDS live in messages/ and the FACTS live here.
// ⚠️ DATA, NOT COPY: a change here is a change of registered details, never a rewording.
// PURE AND CLIENT-SAFE — no imports.
export const COMPANY = {
  name: 'HatchGrab Ltd',
  number: '17381557',
  address: 'Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom',
  /** ai-search-1 (21 October 2026): the country of registration as an ISO code — the JSON-LD Organization's addressCountry. */
  countryCode: 'GB',
} as const
