// lib/whatsapp-hint.ts
// ── THE ONE DERIVATION FOR "phone → call/message affordances", SHARED BY THE LIVE BUTTON AND OUTREACH ──
// 🔴 THIS IS LIFTED BYTE-FOR-BYTE FROM THE INLINE LOGIC IN components/EventListCard.tsx (V12.1), which
// renders the CUSTOMER-FACING Call / Message / Text buttons on the live Village Foodie site. It was
// extracted so the outreach admin page can show the SAME scraped WhatsApp hint the public button acts on,
// and the two can never disagree — a single source rather than two copies that drift. The extraction is
// behaviour-neutral: every field below is the same expression the component computed, in the same order.
// Characterised and mutation-tested before shipping — see docs/whatsapp-extraction-report.md.
//
// 🔴 THE wa.me NUMBER COMES FROM lib/phone.ts (Phase 2C, 10 October 2026), read in the caller's country.
// It was `replace(/[^\d+]/g, '')`, strip '+', a leading '0' → '44'. For every real UK number in the ways
// people write one, the result is byte-identical (scripts/phone-parity.cjs). It differs only where the old
// sequence built a number WhatsApp cannot open — "+44 (0)7…" / "+44 07…" became "4407…", an extension was
// folded into the digits, a "00…" string was prefixed with 44 — and there it is now the real number, or
// '' when there is none. ⚠️ So a scraped "+44 (0)7…" mobile now counts as a 447 mobile and gets its Message
// button, which it should always have had. The 447-mobile test itself is unchanged: these callers are the
// discovery site and admin outreach, which are the marketing country's (GB) until they carry a country.

import { phoneLinkDigits, type PhoneCountry } from '@/lib/phone'

/** The three states the outreach hint renders, mirroring the three button configurations exactly:
 *  - 'advertises'            → a 447 mobile whose accepted_methods mention whatsapp  (live: Call + WhatsApp)
 *  - 'mobile_not_advertised' → a 447 mobile with no whatsapp tag                      (live: Call + Text/SMS)
 *  - 'none'                  → no phone, or a number that is not a 447 mobile         (live: Call only, or nothing)
 *  🔴 'none' does NOT mean "no WhatsApp" — a non-mobile or absent number simply has no messaging affordance.
 *  An absent tag on a mobile is 'mobile_not_advertised', still worth messaging, and MUST stay distinct. */
export type WhatsAppHint = 'advertises' | 'mobile_not_advertised' | 'none'

export interface PhoneWhatsApp {
  /** Digits and '+' only — used for tel: and sms: links. */
  cleanPhone: string
  /** The wa.me number: country code + number as digits (lib/phone.ts), or '' when not a plausible number. */
  waPhone: string
  hasPhone: boolean
  /** True when waPhone is a mobile: '447…' (UK) or '3538[3-9]…' (Ireland, 083–089). */
  isMobileNumber: boolean
  /** accepted_methods, lower-cased, contains the substring 'whatsapp'. */
  acceptsWhatsApp: boolean
  hint: WhatsAppHint
}

export function phoneWhatsApp(
  phoneNumber: string | null | undefined,
  acceptedMethods: string | null | undefined,
  /** The country a nationally written number is read in — the caller's, named explicitly. */
  country: PhoneCountry,
): PhoneWhatsApp {
  const methodsStr = acceptedMethods ? acceptedMethods.toLowerCase() : ''
  const cleanPhone = phoneNumber ? phoneNumber.replace(/[^\d+]/g, '') : ''
  const waPhone = phoneLinkDigits(phoneNumber, country) ?? ''
  const hasPhone = cleanPhone !== ''
  // ireland-1 (20 October 2026): an Irish mobile (+353 83–89) is a mobile too. A UK number answers exactly as before.
  const isMobileNumber = waPhone.startsWith('447') || /^3538[3-9]/.test(waPhone)
  const acceptsWhatsApp = methodsStr.includes('whatsapp')

  const hint: WhatsAppHint =
    hasPhone && isMobileNumber && acceptsWhatsApp ? 'advertises'
      : hasPhone && isMobileNumber ? 'mobile_not_advertised'
        : 'none'

  return { cleanPhone, waPhone, hasPhone, isMobileNumber, acceptsWhatsApp, hint }
}
