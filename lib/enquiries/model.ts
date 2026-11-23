// lib/enquiries/model.ts — 🔴 THE ONE MODEL ADAPTER FOR ENQUIRIES (enquiries-backend-1, 23 November 2026). Three steps, each one
// conversation with ONE strict client tool, through the competitor checker's `converse` (reused, as lib/faq/translator.ts does —
// no tool_choice, the tool's input validated in code, a malformed call sent back once):
//   understand     — the message in English, its language, each thing asked with its topics, a country guess;
//   draft          — the reply in Dominic's style from the ANSWER PACK only, each ask matched to the pack, the customer-language version;
//   backTranslate  — the customer-language version back into English, by a separate call (so it checks the draft, not itself).
//   revise, translate — inbox-1 (Admin › Inbox): Update reply with Dominic's comments; the final English into their language before Send.
// 🔴 A STAND-IN MODEL IN EVERY TEST (scripts/enquiries-backend-1.cjs implements EnquiryModel with no network). The live adapter is
//    built only by the reply poll, only when intake is switched on and a Claude API key is configured; none is in this task.
// Nothing here sends anything anywhere except the model call itself.
import type Anthropic from '@anthropic-ai/sdk'
import { converse } from '@/lib/competitor-check/checker'
import type { Prices } from '@/lib/competitor-check/core'
import type { AskStatus } from '@/lib/enquiries/rules'

export const ENQUIRY_MODEL = 'claude-sonnet-5-5'

export interface Understood {
  /** BCP 47, e.g. "fr" or "fr-FR". */
  language: string
  english_text: string
  asks: { ask: string; topics: string[] }[]
  /** ISO country code the message itself makes plain (a town, a currency), or "". */
  country_guess: string
}
export interface Drafted {
  asks: { ask: string; topics: string[]; status: AskStatus; sources: string[]; note: string }[]
  english_draft: string
  customer_draft: string
}
export interface StepResult<T> { value: T; usd: number }

export interface EnquiryModel {
  model: string
  understand(req: { text: string; subject: string | null; knownLanguage: string | null; topics: string[]; languageHint?: string | null }): Promise<StepResult<Understood>>
  draft(req: { englishText: string; asks: Understood['asks']; packText: string; customerLanguage: string; name: string | null }): Promise<StepResult<Drafted>>
  backTranslate(req: { text: string; fromLanguage: string }): Promise<StepResult<{ english: string }>>
  /** inbox-1: Dominic's comments applied to the current English reply → a new English reply and its customer-language version. */
  revise(req: { english: string; comment: string; packText: string; customerLanguage: string; theirEnglish: string }): Promise<StepResult<{ english_draft: string; customer_draft: string }>>
  /** inbox-1: the final English (edited by hand) into the customer's language, just before Send. */
  translate(req: { text: string; toLanguage: string }): Promise<StepResult<{ text: string }>>
}

// ── the prompts ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const UNDERSTAND_SYSTEM = `You read one message sent to HatchGrab, ordering and kitchen-screen software for food trucks and market traders.
Call record_understanding once:
- language: the message's language as a BCP 47 code ("fr", "de", "en").
- english_text: the whole message in plain English, meaning exactly kept (the original if it is already English).
- asks: each separate thing the person asks or wants, one short English line each, with 1–3 topics chosen ONLY from the list given.
- country_guess: the ISO country code if the message itself makes the country plain (a town, a currency, a law), else "".
language_hint_from_address, when given, is only a hint (the address they wrote to, e.g. bonjour@): use it only when the message's own language is unclear.
Never answer the message.`

export const DRAFT_SYSTEM = `You draft Dominic's reply to an enquiry to HatchGrab. You may use ONLY the ANSWER PACK given — nothing you know otherwise.
Style: friendly, short, plain words, no technical words; answer only what was asked; sign off "Dominic".
Rules:
1. Every price, percentage, amount or number of days you write must be written in the ANSWER PACK. Never work one out or round one.
2. Card fees on online card orders are Stripe's: whenever prices, the trial or "free" come up, state them separately, and never inside "free". "Free" covers the plan fee and HatchGrab fees only.
3. Never quote or paraphrase anything under "DO NOT MENTION"; follow it as an instruction.
4. For each ask: status "available" (the pack answers it fully), "limited" (partly), "gap" (an approved GAP line covers it, or HatchGrab cannot do it), or "unknown" (the pack does not say). sources: the ids it rests on — "k:<id>" for an approved line, or "plans", "features", "faq". For "gap" or "unknown", say honestly what HatchGrab can do and that Dominic will follow up; never promise.
5. english_draft is the reply in English; customer_draft is the same reply in the customer's language, natural for a food-truck owner there.
Call record_draft once.`

export const BACK_SYSTEM = `Translate the text into plain English, sentence by sentence, adding and leaving out nothing. Call record_back_translation once.`

/** inbox-1: Update reply. The comment is an instruction about the reply, never text to paste into it. */
export const REVISE_SYSTEM = `You rewrite Dominic's reply to someone who wrote to HatchGrab, following his comments. You may use ONLY the ANSWER PACK given and what the person wrote — nothing you know otherwise.
Keep his style: friendly, short, plain words; answer only what was asked; sign off "Dominic". Keep everything he did not ask to change.
Every price, percentage, amount or number of days must be written in the ANSWER PACK or in the person's own message. Card fees on online card orders are Stripe's and are always stated separately, never inside "free". Never quote anything under "DO NOT MENTION".
english_draft is the rewritten reply in English; customer_draft is the same reply in the customer's language (the English again when that is English). Call record_revision once.`

/** inbox-1: the final English into the customer's language, adding and leaving out nothing. */
export const TRANSLATE_SYSTEM = `Translate Dominic's reply into the language given, natural for a food-truck owner there, sentence by sentence, adding and leaving out nothing. Keep every number, price and name exactly. Call record_translation once.`

// ── the tools (strict: every property required) ───────────────────────────────────────────────────────────────────────
const str = { type: 'string' } as const
export const UNDERSTAND_TOOL = {
  name: 'record_understanding', description: 'Record what the message says and asks.', strict: true,
  input_schema: { type: 'object', additionalProperties: false, required: ['language', 'english_text', 'asks', 'country_guess'], properties: {
    language: str, english_text: str, country_guess: str,
    asks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ask', 'topics'], properties: { ask: str, topics: { type: 'array', items: str } } } },
  } },
} as const
export const DRAFT_TOOL = {
  name: 'record_draft', description: 'Record the matched asks and the draft reply.', strict: true,
  input_schema: { type: 'object', additionalProperties: false, required: ['asks', 'english_draft', 'customer_draft'], properties: {
    english_draft: str, customer_draft: str,
    asks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ask', 'topics', 'status', 'sources', 'note'], properties: {
      ask: str, topics: { type: 'array', items: str }, status: { type: 'string', enum: ['available', 'limited', 'gap', 'unknown'] }, sources: { type: 'array', items: str }, note: str,
    } } },
  } },
} as const
export const BACK_TOOL = {
  name: 'record_back_translation', description: 'Record the English back-translation.', strict: true,
  input_schema: { type: 'object', additionalProperties: false, required: ['english'], properties: { english: str } },
} as const

export const REVISE_TOOL = {
  name: 'record_revision', description: 'Record the rewritten reply.', strict: true,
  input_schema: { type: 'object', additionalProperties: false, required: ['english_draft', 'customer_draft'], properties: { english_draft: str, customer_draft: str } },
} as const
export const TRANSLATE_TOOL = {
  name: 'record_translation', description: 'Record the translation.', strict: true,
  input_schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: str } },
} as const

// ── validation (the strict schema first; checked again here) ─────────────────────────────────────────────────────────
type V<T> = { ok: true; value: T } | { ok: false; errors: string[] }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const strs = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string')
const STATUSES: readonly AskStatus[] = ['available', 'limited', 'gap', 'unknown']

export function validateUnderstood(v: unknown): V<Understood> {
  if (!isObj(v)) return { ok: false, errors: ['input must be an object'] }
  const e: string[] = []
  if (typeof v.language !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(v.language)) e.push('language must be a code like "fr"')
  if (typeof v.english_text !== 'string' || !v.english_text.trim()) e.push('english_text is required')
  if (typeof v.country_guess !== 'string' || (v.country_guess && !/^[A-Za-z]{2}$/.test(v.country_guess))) e.push('country_guess must be "" or a two-letter code')
  if (!Array.isArray(v.asks) || !v.asks.every(a => isObj(a) && typeof a.ask === 'string' && strs(a.topics))) e.push('asks must be [{ask, topics[]}]')
  if (e.length) return { ok: false, errors: e }
  return { ok: true, value: { language: String(v.language), english_text: String(v.english_text), country_guess: String(v.country_guess).toUpperCase(), asks: (v.asks as { ask: string; topics: string[] }[]).map(a => ({ ask: a.ask, topics: a.topics })) } }
}
export function validateDrafted(v: unknown): V<Drafted> {
  if (!isObj(v)) return { ok: false, errors: ['input must be an object'] }
  const e: string[] = []
  if (typeof v.english_draft !== 'string' || !v.english_draft.trim()) e.push('english_draft is required')
  if (typeof v.customer_draft !== 'string' || !v.customer_draft.trim()) e.push('customer_draft is required')
  if (!Array.isArray(v.asks) || !v.asks.every(a => isObj(a) && typeof a.ask === 'string' && strs(a.topics) && STATUSES.includes(a.status as AskStatus) && strs(a.sources) && typeof a.note === 'string')) e.push('asks must be [{ask, topics[], status, sources[], note}]')
  if (e.length) return { ok: false, errors: e }
  return { ok: true, value: v as unknown as Drafted }
}
export function validateBack(v: unknown): V<{ english: string }> {
  return isObj(v) && typeof v.english === 'string' && v.english.trim() ? { ok: true, value: { english: v.english } } : { ok: false, errors: ['english is required'] }
}
export function validateRevision(v: unknown): V<{ english_draft: string; customer_draft: string }> {
  return isObj(v) && typeof v.english_draft === 'string' && v.english_draft.trim() && typeof v.customer_draft === 'string' && v.customer_draft.trim()
    ? { ok: true, value: { english_draft: v.english_draft, customer_draft: v.customer_draft } } : { ok: false, errors: ['english_draft and customer_draft are required'] }
}
export function validateTranslation(v: unknown): V<{ text: string }> {
  return isObj(v) && typeof v.text === 'string' && v.text.trim() ? { ok: true, value: { text: v.text } } : { ok: false, errors: ['text is required'] }
}

/**
 * The live adapter. `api` is one Messages API call (the SDK's client.beta.messages.create); `deadline` (epoch ms) is when the reply
 * poll must be finished — no turn starts after it and a call in flight is aborted, so the cron never runs past its time.
 */
export function liveEnquiryModel(api: (params: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<Anthropic.Beta.BetaMessage>,
  prices: Prices, o: { deadline: number; model?: string }): EnquiryModel {
  const model = o.model ?? ENQUIRY_MODEL
  async function step<T>(system: string, user: string, tool: Record<string, unknown>, validate: (v: unknown) => V<T>, maxTokens: number): Promise<StepResult<T>> {
    const abort = new AbortController()
    const meter = { spend: { inputTokens: 0, outputTokens: 0, webSearches: 0, webFetches: 0, usd: 0 }, deadline: o.deadline, abort }
    const timer = setTimeout(() => abort.abort(), Math.max(0, o.deadline - Date.now()))
    try {
      const r = await converse({ api, meter, now: () => new Date() }, {
        model, maxTokens, effort: 'medium', maxTurns: 3, prices, system, user, tools: [tool], toolName: String(tool.name), validate,
      })
      return { value: r.value, usd: r.spend.usd }
    } catch (e) {
      // What the failed conversation cost still counts towards the cap.
      throw Object.assign(e instanceof Error ? e : new Error(String(e)), { usd: meter.spend.usd })
    } finally { clearTimeout(timer) }
  }
  return {
    model,
    understand: req => step(UNDERSTAND_SYSTEM, JSON.stringify({ subject: req.subject, language_if_known: req.knownLanguage, ...(req.languageHint ? { language_hint_from_address: req.languageHint } : {}), topics_to_choose_from: req.topics, message: req.text }),
      UNDERSTAND_TOOL as unknown as Record<string, unknown>, validateUnderstood, 4000),
    draft: req => step(DRAFT_SYSTEM, `ANSWER PACK\n${req.packText}\n\nTHE ENQUIRY (in English)\n${JSON.stringify({ name: req.name, customer_language: req.customerLanguage, asks: req.asks, message: req.englishText })}`,
      DRAFT_TOOL as unknown as Record<string, unknown>, validateDrafted, 6000),
    backTranslate: req => step(BACK_SYSTEM, JSON.stringify({ from: req.fromLanguage, text: req.text }), BACK_TOOL as unknown as Record<string, unknown>, validateBack, 3000),
    revise: req => step(REVISE_SYSTEM, `ANSWER PACK\n${req.packText}\n\nWHAT THEY WROTE (in English)\n${req.theirEnglish}\n\n${JSON.stringify({ customer_language: req.customerLanguage, current_reply_in_english: req.english, dominics_comments: req.comment })}`,
      REVISE_TOOL as unknown as Record<string, unknown>, validateRevision, 6000),
    translate: req => step(TRANSLATE_SYSTEM, JSON.stringify({ to: req.toLanguage, text: req.text }), TRANSLATE_TOOL as unknown as Record<string, unknown>, validateTranslation, 4000),
  }
}
