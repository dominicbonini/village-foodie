// lib/ai-language.ts — THE OUTPUT LANGUAGE AN AI PROMPT NAMES (ireland-1, 20 October 2026; .cursor/rules/language.mdc
// rule 10: every prompt states the language it wants back). PURE AND CLIENT-SAFE.
//
// A locale tag → the English name of its language, which is how the prompts are written: 'en-GB', 'en-US' and 'en-IE'
// → "English"; 'de-AT' → "German"; 'nl-BE' → "Dutch". Intl names it, so a new language needs no table here. Anything
// unreadable is English — every truck today trades in English.

/** The English name of a locale's language ("English", "German", …); "English" for a missing or unknown tag. */
export function outputLanguageName(locale: string | null | undefined): string {
  const lang = String(locale ?? '').trim().split(/[-_]/)[0]?.toLowerCase()
  if (!lang) return 'English'
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang)
    return name && name.toLowerCase() !== lang ? name : 'English'
  } catch {
    return 'English'
  }
}
