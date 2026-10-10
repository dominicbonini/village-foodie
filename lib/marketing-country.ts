// lib/marketing-country.ts — WHICH COUNTRY'S PRICES THE PUBLIC PAGES SHOW. Named once, here.
//
// The landing page, /features (FeatureComparison), /compare and Admin's plan matrix all quote ONE
// country's plan prices, allowances and card fees, and before 10 October 2026 that country was implicit
// in a dozen constants. It is now this one value, read through lib/country-settings.ts.
//
// 🔴 SINCE PHASE 2D-1 THIS IS THE FALLBACK, NOT THE ANSWER. The marketing pages show the VISITOR's country
// (lib/visitor-country.ts: ?country → the hg_country cookie → x-vercel-ip-country → this), switched-on only.
// It is still the country signup pre-fills when the visitor's is not open, and what admin-side marketing
// copy (outreach, Admin's plan matrix) quotes. Operator surfaces (Manage → Billing / Payments, one truck in
// Admin) do NOT use this — they use the truck's own country.
export const MARKETING_COUNTRY = 'GB'
