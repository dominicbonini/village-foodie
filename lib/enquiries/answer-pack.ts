// lib/enquiries/answer-pack.ts — 🔴 THE ANSWER PACK: THE ONLY THING THE MODEL SEES BESIDES THE MESSAGE (enquiries-backend-1, 23 November
// 2026; docs/enquiries-backend-1-report.md). Pure: the inputs are read elsewhere (lib/enquiries/answer-pack-server.ts, through the same
// readers the pricing, features and FAQ pages use) and handed in.
//
// WHAT IS IN IT, AND NOTHING ELSE:
//   • the customer's country's plans and prices, the trial, and Stripe's online card fee (stated on its own, never inside "free");
//   • the public features list (the /features table's rows, English names, which plans have each, coming soon);
//   • the published FAQ for their country, in its language;
//   • APPROVED reply_knowledge lines whose topics meet the message's topics and whose countries include theirs (or are empty):
//     facts and gaps as "may be said", guidance under "DO NOT MENTION — instructions, never quoted".
// NEVER: code, the manual, docs/, internal notes, other customers' data, a 'suggested' or 'retired' line, another country's line.
import type { AskStatus } from '@/lib/enquiries/rules'

export type KnowledgeKind = 'fact' | 'guidance' | 'gap'
export type KnowledgeStatus = 'approved' | 'suggested' | 'retired'
export interface KnowledgeRow {
  id: string; kind: KnowledgeKind; topics: string[]; wording: string; customer_safe: boolean; countries: string[]
  status: KnowledgeStatus; source: 'dominic' | 'edit' | 'note'; source_ref: string | null
}

export interface PackPlan {
  name: string
  /** "€19" a month, formatted in the country's own way; "0" plans read as such. */
  monthly: string
  /** Online orders included each month: a formatted amount, "unlimited", or null when none is included. */
  includedOnline: string | null
  /** HatchGrab's fee on online orders above what is included, e.g. "0.99%"; null = none. */
  feePercent: string | null
  /** Each extra van a month, formatted; null when not sold. */
  extraVan: string | null
}
export interface PackInputs {
  country: string | null
  countryName: string | null
  /** The FAQ's language (the country's locale). */
  language: string | null
  plans: PackPlan[]
  trial: { months: number | null; planName: string | null }
  /** Stripe's fee on an online card order, e.g. "1.5% + €0.25" — null where the country takes no online card payments. */
  cardFeeOnline: string | null
  features: { name: string; comingSoon: boolean; plans: string[] }[]
  faq: { q: string; a: string }[]
}

export interface AnswerPack {
  country: string | null
  topics: string[]
  /** The approved facts and gaps given (their ids, so the draft can name its sources). */
  knowledge: { id: string; kind: 'fact' | 'gap'; wording: string }[]
  /** The approved guidance given — instructions only, never words for the customer. */
  doNotMention: { id: string; wording: string }[]
  /** The exact text the model is given (and the numbers check reads). */
  text: string
}

const norm = (t: string) => t.trim().toLowerCase()

/** The approved lines for these topics and this country. ⚠️ 'suggested' and 'retired' never pass; neither does another country's. */
export function selectKnowledge(rows: readonly KnowledgeRow[], topics: readonly string[], country: string | null): KnowledgeRow[] {
  const want = new Set(topics.map(norm))
  return rows.filter(r =>
    r.status === 'approved'
    && r.topics.some(t => want.has(norm(t)))
    && (r.countries.length === 0 || (!!country && r.countries.map(c => c.toUpperCase()).includes(country.toUpperCase()))))
}

/** Every topic the knowledge knows, plus the general ones — the vocabulary the model tags asks with. */
export const BASE_TOPICS = ['prices', 'trial', 'fees', 'payments', 'demo', 'signup', 'features', 'preorders', 'deadline', 'stock', 'prep',
  'forecasting', 'till', 'card reader', 'printing', 'kitchen screen', 'online orders', 'walk-up', 'languages', 'account', 'e-reporting',
  'accounting', 'apps', 'other'] as const
export function topicVocabulary(rows: readonly KnowledgeRow[]): string[] {
  const all = new Set<string>(BASE_TOPICS)
  for (const r of rows) if (r.status === 'approved') for (const t of r.topics) all.add(norm(t))
  return [...all].sort()
}

export function buildAnswerPack(inputs: PackInputs, rows: readonly KnowledgeRow[], topics: readonly string[]): AnswerPack {
  const chosen = selectKnowledge(rows, topics, inputs.country)
  // 🔴 guidance is never customer-safe (the table refuses it); a fact or gap marked not customer-safe is held back too.
  const knowledge = chosen.filter(r => r.kind !== 'guidance' && r.customer_safe).map(r => ({ id: r.id, kind: r.kind as 'fact' | 'gap', wording: r.wording }))
  const doNotMention = chosen.filter(r => r.kind === 'guidance').map(r => ({ id: r.id, wording: r.wording }))
  const L: string[] = []
  L.push(`COUNTRY: ${inputs.countryName ?? 'unknown'}${inputs.country ? ` (${inputs.country})` : ''}`)
  L.push('', 'PLANS AND PRICES (this country):')
  if (!inputs.plans.length) L.push('- (no prices known for this country — do not state any price)')
  for (const p of inputs.plans) {
    const parts = [`${p.monthly} a month`]
    if (p.includedOnline === 'unlimited') parts.push('no HatchGrab fee on online orders')
    else if (p.includedOnline) parts.push(`online orders up to ${p.includedOnline} a month included`)
    if (p.feePercent && p.includedOnline !== 'unlimited') parts.push(`then a HatchGrab fee of ${p.feePercent} on online orders`)
    if (p.extraVan) parts.push(`each extra van ${p.extraVan} a month`)
    L.push(`- ${p.name}: ${parts.join('; ')}`)
  }
  if (inputs.trial.months) L.push(`- Free trial: ${inputs.trial.months} months${inputs.trial.planName ? ` (${inputs.trial.planName})` : ''} — free covers the plan fee and HatchGrab fees only.`)
  L.push(inputs.cardFeeOnline
    ? `- Card fees on online card orders are Stripe's, charged separately and never free: currently ${inputs.cardFeeOnline} per online card order.`
    : '- Online card payments are not offered in this country.')
  L.push('', 'FEATURES (the public features list):')
  for (const f of inputs.features) L.push(`- ${f.name}${f.comingSoon ? ' — coming soon' : ''}${f.plans.length ? ` [${f.plans.join(', ')}]` : ''}`)
  L.push('', `PUBLISHED FAQ${inputs.language ? ` (${inputs.language})` : ''}:`)
  if (!inputs.faq.length) L.push('- (none published for this country)')
  for (const q of inputs.faq) L.push(`Q: ${q.q}`, `A: ${q.a}`)
  L.push('', 'WHAT DOMINIC HAS APPROVED (may be said; a GAP must be described honestly and the ask marked "gap"):')
  if (!knowledge.length) L.push('- (nothing for these topics)')
  for (const k of knowledge) L.push(`- [k:${k.id}] ${k.kind.toUpperCase()}: ${k.wording}`)
  L.push('', 'DO NOT MENTION — instructions for you, never quoted or paraphrased to the customer:')
  if (!doNotMention.length) L.push('- (none)')
  for (const g of doNotMention) L.push(`- [k:${g.id}] ${g.wording}`)
  return { country: inputs.country, topics: [...new Set(topics.map(norm))], knowledge, doNotMention, text: L.join('\n') }
}

/** The ids a draft may name as its sources: the pack's knowledge lines, or the pack's own sections. */
export const SECTION_SOURCES = ['plans', 'features', 'faq'] as const
export function validSources(pack: AnswerPack): Set<string> {
  return new Set([...pack.knowledge.map(k => `k:${k.id}`), ...SECTION_SOURCES])
}

/**
 * 🔴 THE MODEL'S MATCH, CHECKED IN CODE. Each ask's status is the model's, then:
 *   • a source not in the pack is dropped (and flagged); 'available' with no valid source is 'unknown';
 *   • any GAP line among its sources makes it 'gap', whatever the model said.
 */
export function settleAsk(a: { ask: string; topics: string[]; status: AskStatus; sources: string[] }, pack: AnswerPack):
  { ask: string; topics: string[]; status: AskStatus; knowledge_ids: string[]; sources: string[]; dropped: string[] } {
  const ok = validSources(pack)
  const sources = a.sources.filter(s => ok.has(s))
  const dropped = a.sources.filter(s => !ok.has(s))
  const knowledgeIds = sources.filter(s => s.startsWith('k:')).map(s => s.slice(2))
  let status: AskStatus = a.status
  if (knowledgeIds.some(id => pack.knowledge.find(k => k.id === id)?.kind === 'gap')) status = 'gap'
  else if (status === 'available' && sources.length === 0) status = 'unknown'
  return { ask: a.ask, topics: a.topics, status, knowledge_ids: knowledgeIds, sources, dropped }
}
