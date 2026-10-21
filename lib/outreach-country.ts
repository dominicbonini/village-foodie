// lib/outreach-country.ts — WHICH COUNTRY AN OUTREACH PROSPECT'S PHONE NUMBER IS READ IN (ireland-1, 20 October 2026).
// PURE AND CLIENT-SAFE: the outreach route and the admin panels (ProspectWorkspace, OutreachPanel, TemplatesPanel) all
// call it, so the server's WhatsApp hint and the panels' WhatsApp channel read a number the same way.
// Before Ireland every prospect was read in the marketing country (GB); a prospect now carries its discovery row's
// country, and a row without one is still GB — so every GB prospect is read exactly as before.
import { MARKETING_COUNTRY } from '@/lib/marketing-country'

/** The prospect's own country (discovery_trucks.country, ISO alpha-2), else the marketing country (GB). */
export const prospectPhoneCountry = (p: { country?: string | null } | null | undefined): string =>
  (p?.country && /^[A-Za-z]{2}$/.test(p.country.trim()) ? p.country.trim().toUpperCase() : MARKETING_COUNTRY)
