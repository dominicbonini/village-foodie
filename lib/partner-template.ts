// lib/partner-template.ts — partners-2 (16 November 2026, docs/partners-2-report.md): a partner template's merge fields.
// Pure. The template itself is an ordinary outreach_templates row (slug `partner-<assoc|dir>-<step>-<language>`, created only
// after Dominic signs the wording off); its {{signature}} and {{opt_out}} lines are expanded exactly as truck outreach expands
// them (lib/outreach-doc.ts docFromTemplateText), so the opt-out works the same way: reply "no thanks".
//
// Fields: {{contact_name}} (with a fallback, {{contact_name|there}}, as none of the imported organisations has a name yet), {{org}},
// {{code}}, {{deal}}, {{commission}}. A field with no value is REFUSED, never sent blank (literalTokenRefusal would otherwise
// catch a raw "{{…}}" too late). A US partner's email ends with HatchGrab's postal address (CAN-SPAM).
export const PARTNER_FIELDS = ['contact_name', 'org', 'code', 'deal', 'commission'] as const
export type PartnerField = (typeof PARTNER_FIELDS)[number]

export function renderPartnerText(text: string, values: Partial<Record<PartnerField, string>>):
  { ok: true; text: string } | { ok: false; missing: string[] } {
  const missing: string[] = []
  // {{field}} or {{field|fallback}} — the fallback (in the template's own language, e.g. {{contact_name|there}} /
  // {{contact_name|à toute l'équipe}}) is used when the field has no value; without one, a missing value is refused.
  const out = text.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (whole, name: string, fallback: string | undefined) => {
    if (!(PARTNER_FIELDS as readonly string[]).includes(name)) return whole            // signature / opt_out: expanded later
    const v = values[name as PartnerField]
    if (v === undefined || v === null || v === '') {
      if (fallback !== undefined && fallback.trim()) return fallback.trim()
      missing.push(name); return whole
    }
    return v
  })
  return missing.length ? { ok: false, missing: [...new Set(missing)] } : { ok: true, text: out }
}

/** The body with the postal address line a US email needs, placed before the opt-out line when there is one. */
export function withPostalAddress(body: string, address: string | null, countryCode: string | null): string {
  if (countryCode !== 'US' || !address) return body
  const at = body.search(/\{\{\s*opt_out\s*\}\}/)
  return at >= 0 ? `${body.slice(0, at)}${address}\n\n${body.slice(at)}` : `${body}\n\n${address}`
}

/** "20% of plan fees in year 1, 10% in year 2" — the commission as the email says it (English; templates translate around it). */
export function commissionText(pctYear1: number, pctYear2: number): string {
  const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))
  return pctYear2 > 0 ? `${n(pctYear1)}% of plan fees in year 1 and ${n(pctYear2)}% in year 2` : `${n(pctYear1)}% of plan fees for the first year`
}
