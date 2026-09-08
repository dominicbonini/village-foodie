// lib/whatsapp-hint.ts
// ── THE ONE DERIVATION FOR "phone → call/message affordances", SHARED BY THE LIVE BUTTON AND OUTREACH ──
// 🔴 THIS IS LIFTED BYTE-FOR-BYTE FROM THE INLINE LOGIC IN components/EventListCard.tsx (V12.1), which
// renders the CUSTOMER-FACING Call / Message / Text buttons on the live Village Foodie site. It was
// extracted so the outreach admin page can show the SAME scraped WhatsApp hint the public button acts on,
// and the two can never disagree — a single source rather than two copies that drift. The extraction is
// behaviour-neutral: every field below is the same expression the component computed, in the same order.
// Characterised and mutation-tested before shipping — see docs/whatsapp-extraction-report.md.
//
// ⚠️ DO NOT "TIDY" THE NORMALISATION. `replace(/[^\d+]/g, '')` then strip '+', then a leading '0' → '44'.
// That exact sequence is what the wa.me link and the 447-mobile test depend on; a "cleaner" libphonenumber
// pass would change which trucks show a Message button on a trading day.

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
  /** The wa.me number: cleanPhone without '+', a leading 0 rewritten to 44. */
  waPhone: string
  hasPhone: boolean
  /** True when waPhone starts with '447' (a UK mobile). */
  isMobileNumber: boolean
  /** accepted_methods, lower-cased, contains the substring 'whatsapp'. */
  acceptsWhatsApp: boolean
  hint: WhatsAppHint
}

export function phoneWhatsApp(
  phoneNumber: string | null | undefined,
  acceptedMethods: string | null | undefined,
): PhoneWhatsApp {
  const methodsStr = acceptedMethods ? acceptedMethods.toLowerCase() : ''
  const cleanPhone = phoneNumber ? phoneNumber.replace(/[^\d+]/g, '') : ''
  let waPhone = cleanPhone.replace('+', '')
  if (waPhone.startsWith('0')) waPhone = '44' + waPhone.slice(1)
  const hasPhone = cleanPhone !== ''
  const isMobileNumber = waPhone.startsWith('447')
  const acceptsWhatsApp = methodsStr.includes('whatsapp')

  const hint: WhatsAppHint =
    hasPhone && isMobileNumber && acceptsWhatsApp ? 'advertises'
      : hasPhone && isMobileNumber ? 'mobile_not_advertised'
        : 'none'

  return { cleanPhone, waPhone, hasPhone, isMobileNumber, acceptsWhatsApp, hint }
}
