// lib/inbox/language.ts — 🔴 WHAT LANGUAGE AN EMAIL IS IN, WITHOUT A MODEL (inbox-1, 23 November 2026). Pure.
//
// The model's own answer (lib/enquiries/model.ts understand) wins whenever there is one. Until Dominic adds the Claude key there is
// none, and the page still has to know whether a reply can go in English — so this makes a cautious guess from the script and from
// common words, and says when it is SURE. When it is not, the address they wrote to is the hint (lib/inbox/aliases.ts aliasLanguage),
// then the country's language, then English.

export interface LanguageGuess { language: string; sure: boolean }

const SCRIPTS: [RegExp, string][] = [
  [/[぀-ヿ]/, 'ja'], [/[가-힯]/, 'ko'], [/[一-鿿]/, 'zh'], [/[฀-๿]/, 'th'], [/[֐-׿]/, 'he'],
  [/[؀-ۿ]/, 'ar'], [/[Ͱ-Ͽ]/, 'el'], [/[ऀ-ॿ]/, 'hi'], [/[Ѐ-ӿ]/, 'ru'],
]
/** Common short words. A language needs several distinct hits, and a clear lead over the next, to count as sure. */
const WORDS: Record<string, string[]> = {
  en: ['the', 'and', 'is', 'are', 'you', 'your', 'for', 'with', 'we', 'have', 'do', 'can', 'how', 'what', 'thanks', 'hello', 'hi', 'would', 'please', 'our'],
  fr: ['le', 'la', 'les', 'et', 'est', 'vous', 'nous', 'pour', 'avec', 'une', 'des', 'du', 'je', 'bonjour', 'merci', 'pas', 'que', 'est-ce', 'votre', 'mon'],
  de: ['der', 'die', 'das', 'und', 'ist', 'sie', 'wir', 'für', 'mit', 'ein', 'eine', 'ich', 'nicht', 'hallo', 'danke', 'auch', 'wie', 'haben', 'ihr', 'mein'],
  es: ['el', 'la', 'los', 'las', 'y', 'es', 'para', 'con', 'una', 'que', 'hola', 'gracias', 'pero', 'nuestro', 'su', 'mi', 'por', 'como', 'tengo', 'del'],
  it: ['il', 'lo', 'gli', 'e', 'è', 'per', 'con', 'una', 'che', 'ciao', 'grazie', 'sono', 'non', 'come', 'mio', 'della', 'del', 'abbiamo', 'vorrei', 'buongiorno'],
  nl: ['de', 'het', 'een', 'en', 'is', 'voor', 'met', 'wij', 'ik', 'niet', 'hallo', 'dank', 'ook', 'hoe', 'onze', 'mijn', 'van', 'graag', 'bedankt', 'jullie'],
  pt: ['o', 'os', 'as', 'e', 'é', 'para', 'com', 'uma', 'que', 'olá', 'obrigado', 'obrigada', 'não', 'como', 'meu', 'nosso', 'do', 'da', 'você', 'bom'],
}

export function guessLanguage(text: string | null | undefined): LanguageGuess | null {
  const t = String(text ?? '')
  if (!t.trim()) return null
  for (const [re, lang] of SCRIPTS) {
    const hits = (t.match(new RegExp(re.source, 'g')) || []).length
    if (hits >= 6) return { language: lang, sure: lang !== 'ru' }   // Cyrillic is several languages (ru, bg, sr, uk…): not sure
  }
  const tokens = t.toLowerCase().replace(/[^\p{L}\p{M}'-]+/gu, ' ').split(' ').filter(Boolean)
  if (!tokens.length) return null
  const scores = Object.entries(WORDS).map(([lang, words]) => {
    const set = new Set(words)
    const distinct = new Set(tokens.filter(w => set.has(w)))
    return { lang, n: tokens.filter(w => set.has(w)).length, distinct: distinct.size }
  }).sort((a, b) => b.n - a.n)
  const [top, next] = scores
  if (!top || top.n === 0) return null
  const sure = top.distinct >= 3 && top.n >= 2 * Math.max(1, next?.n ?? 0)
  return { language: top.lang, sure }
}

/** The language a reply is written in: a stored answer first, then a sure guess, then the hints in order, then English. */
export function settleLanguage(o: { stored?: string | null; text?: string | null; hints?: (string | null | undefined)[] }): { language: string; from: 'stored' | 'detected' | 'hint' | 'default' } {
  const base = (l: string | null | undefined) => (l ? String(l).trim() : '')
  if (base(o.stored)) return { language: base(o.stored), from: 'stored' }
  const g = guessLanguage(o.text)
  if (g?.sure) return { language: g.language, from: 'detected' }
  for (const h of o.hints ?? []) if (base(h)) return { language: base(h), from: 'hint' }
  if (g) return { language: g.language, from: 'detected' }
  return { language: 'en', from: 'default' }
}

export const isEnglish = (l: string | null | undefined) => /^en(-|$)/i.test(String(l ?? '').trim())

/** "fr" → "French", "pt-BR" → "Brazilian Portuguese" (English names). */
export function languageName(code: string | null | undefined): string {
  const c = String(code ?? '').trim()
  if (!c) return 'English'
  try {
    const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(c)
    if (n && n.toLowerCase() !== c.toLowerCase()) return n
  } catch { /* an odd code */ }
  return c
}
