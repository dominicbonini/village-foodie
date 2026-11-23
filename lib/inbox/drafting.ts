// lib/inbox/drafting.ts — 🔴 DRAFTS FOR EVERY TYPE IN ADMIN › INBOX (inbox-1, 23 November 2026; docs/inbox-1-report.md).
//   • ensureDraft — the conversation's draft for its latest incoming email: the poll's (an enquiry) or, if there is none, one made now by
//     the SAME drafting core the poll uses (lib/enquiries/run.ts composeDraft): the answer pack (approved knowledge only) plus, for a
//     prospect or partner, their own history (the thread, their platform, the partner's offer and code). Prospects in English skip
//     translation (composeDraft makes no customer-language version for English).
//   • reviseDraft — Update reply: the current English and Dominic's comment → a new English draft and its customer-language version.
//     The comment is STORED (inbox_comments); it becomes a suggested knowledge line only after Send (lib/inbox/send.ts), never here.
//   • translateFinal — the English as it stands at Send, into their language.
// 🔴 NOTHING HERE SENDS, AND NOTHING APPROVES. Every model call is metered against the $5 monthly enquiry cap (enquiry_spend).
// With no model configured (no Claude key on this environment) each returns a refusal the page shows as it is.
import type { SupabaseClient } from '@supabase/supabase-js'
import { composeDraft, meteredCall, normLang, CapReached, MONTHLY_CAP_USD, type Ledger } from '@/lib/enquiries/run'
import { buildAnswerPack, topicVocabulary, type PackInputs, type KnowledgeRow } from '@/lib/enquiries/answer-pack'
import { splitNotes, numbersCheck } from '@/lib/enquiries/rules'
import { supabaseEnquiryStore } from '@/lib/enquiries/store'
import type { EnquiryModel } from '@/lib/enquiries/model'
import { offersFor } from '@/lib/partner-offers'
import { aliasLanguage } from '@/lib/inbox/aliases'
import { isEnglish } from '@/lib/inbox/language'
import { INBOX_WORDS, type InboxThread } from '@/lib/inbox/types'
import type { ThreadContext } from '@/lib/inbox/read-model'

export interface DraftDeps {
  db: SupabaseClient
  /** null: no Claude model on this environment (no key) — drafting and translation are off; reading and typing still work. */
  model: EnquiryModel | null
  packInputs(country: string | null): Promise<PackInputs>
  now(): Date
}
export type DraftOutcome = { ok: true; draft: NonNullable<InboxThread['draft']>; message?: string } | { ok: false; refusal: string; held?: 'no_model' | 'cap_reached' }

const s = (v: unknown) => (v == null ? '' : String(v))
const month = (d: Date) => d.toISOString().slice(0, 7)
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t)

/** The monthly cap's ledger, read from and written to enquiry_spend (shared with the poll's drafts). */
async function ledgerFor(deps: DraftDeps): Promise<Ledger & { spent(): number }> {
  const store = supabaseEnquiryStore(deps.db)
  const m = month(deps.now())
  let spent = await store.monthSpent(m)
  return {
    canStart: () => spent < MONTHLY_CAP_USD,
    add: async usd => { if (usd > 0) { spent += usd; await store.addSpent(m, usd) } },
    spent: () => spent,
  }
}

/** A prospect's or partner's own history, as the answer pack's "THIS CONVERSATION" section. Numbers in it are theirs or ours already. */
export async function conversationPack(deps: DraftDeps, ctx: ThreadContext): Promise<string | null> {
  if (ctx.kind === 'enquiry') return null
  const lines: string[] = []
  const c = ctx.thread.conversation
  if (ctx.kind === 'prospect') {
    lines.push(`A food truck Dominic contacted: ${c.organisation ?? c.name}${c.organisation ? ` (contact: ${c.name})` : ''}.`)
    if (ctx.platform) lines.push(`The ordering platform they use now: ${ctx.platform}.`)
  } else {
    lines.push(`A partner organisation: ${c.organisation ?? c.name}${c.organisation ? ` (contact: ${c.name})` : ''}.`)
    try {
      const code = (await offersFor(deps.db, deps.now(), [ctx.id])).get(ctx.id)
      if (code) lines.push(`Their partner code: ${code.code} — ${code.deal_type} ${code.deal_value ?? ''}${code.deal_months ? ` for ${code.deal_months} months` : ''}${code.deal_plan_key ? ` (plan ${code.deal_plan_key})` : ''}.`)
      else lines.push('No partner code has been created for them yet: do not offer one.')
    } catch { lines.push('Their partner code could not be read: do not offer one.') }
  }
  const earlier = ctx.thread.messages.filter(m => m.id !== ctx.thread.latest.id).slice(-6)
  if (earlier.length) {
    lines.push('The emails so far (oldest first):')
    for (const m of earlier) lines.push(`${m.direction === 'out' ? 'Dominic wrote' : 'They wrote'}${m.at ? ` (${m.at.slice(0, 10)})` : ''}: ${clip(m.text.replace(/\s+/g, ' ').trim(), 1200)}`)
  }
  return lines.join('\n')
}

async function knowledge(deps: DraftDeps): Promise<KnowledgeRow[]> {
  return supabaseEnquiryStore(deps.db).approvedKnowledge()
}

async function saveDraft(deps: DraftDeps, ctx: ThreadContext, patch: Record<string, unknown>): Promise<void> {
  const c = ctx.thread.conversation
  const row = {
    conversation_key: c.key, enquiry_id: ctx.kind === 'enquiry' ? ctx.id : null, source_message_id: c.latestInboundId, updated_at: deps.now().toISOString(), ...patch,
  }
  const { error } = await deps.db.from('inbox_drafts').upsert(row, { onConflict: 'conversation_key,source_message_id' })
  if (error) throw new Error(`save draft: ${error.message}`)
}

/** The conversation's draft — the one already made, or a new one now. */
export async function ensureDraft(deps: DraftDeps, ctx: ThreadContext): Promise<DraftOutcome> {
  if (ctx.thread.draft) return { ok: true, draft: ctx.thread.draft }
  if (!deps.model) return { ok: false, refusal: INBOX_WORDS.draftingOff, held: 'no_model' }
  const ledger = await ledgerFor(deps)
  if (!ledger.canStart()) return { ok: false, refusal: 'This month’s drafting budget is used up.', held: 'cap_reached' }
  const c = ctx.thread.conversation
  const e = ctx.enquiry
  try {
    const made = await composeDraft({
      text: ctx.thread.latest.text, subject: ctx.thread.latest.subject,
      knownLanguage: ctx.kind === 'enquiry' ? (s(ctx.latestRow.original_language) || s(e?.language) || null) : null,
      replyLanguage: ctx.kind === 'enquiry' ? (s(e?.language) || s(ctx.latestRow.original_language) || null) : null,
      languageHint: aliasLanguage(c.wroteTo), name: c.name, country: ctx.country, conversationPack: await conversationPack(deps, ctx),
    }, await knowledge(deps), deps.packInputs, deps.model, ledger)
    const lang = normLang(made.language) ?? 'en'
    const english = isEnglish(lang)
    await saveDraft(deps, ctx, {
      their_language: normLang(made.understood.language), their_english: made.understood.english_text, english_draft: made.english,
      customer_draft: english ? null : made.customer, translated_from: made.english, back_translation: made.back, asks: made.asks, flags: made.flags,
      numbers_check: made.numbers.result, numbers_details: { unknown: made.numbers.unknown, checked: made.numbers.checked }, model: deps.model.model,
      cost_usd: Math.round(made.cost * 1e6) / 1e6,
    })
    if (ctx.kind === 'enquiry' && !s(ctx.latestRow.english_text)) {
      await deps.db.from('enquiry_messages').update({ english_text: made.understood.english_text.slice(0, 40000), original_language: s(ctx.latestRow.original_language) || normLang(made.understood.language) }).eq('id', c.latestInboundId)
    }
    return { ok: true, draft: { english: made.english, customer: english ? null : made.customer, translatedFrom: made.english, language: lang } }
  } catch (err) {
    if (err instanceof CapReached) return { ok: false, refusal: 'This month’s drafting budget is used up.', held: 'cap_reached' }
    return { ok: false, refusal: `The draft could not be made just now (${s(err instanceof Error ? err.message : err).split('\n')[0].slice(0, 120)}).` }
  }
}

/** Update reply. 🔴 An empty comment is refused before anything else; with no model, the "not switched on" words. */
export async function reviseDraft(deps: DraftDeps, ctx: ThreadContext, req: { english: string; comment: string }): Promise<DraftOutcome> {
  const comment = s(req.comment).trim()
  if (!comment) return { ok: false, refusal: INBOX_WORDS.needComment }
  if (!deps.model) return { ok: false, refusal: INBOX_WORDS.draftingOff, held: 'no_model' }
  const ledger = await ledgerFor(deps)
  if (!ledger.canStart()) return { ok: false, refusal: 'This month’s drafting budget is used up.', held: 'cap_reached' }
  const c = ctx.thread.conversation
  const lang = ctx.thread.theirLanguage
  const english = isEnglish(lang)
  // the comment is kept whatever the model then does (Dominic's words are the record)
  const { data: kept, error: cErr } = await deps.db.from('inbox_comments').insert({
    conversation_key: c.key, enquiry_id: ctx.kind === 'enquiry' ? ctx.id : null, source_message_id: c.latestInboundId,
    comment: comment.slice(0, 4000), english_before: s(req.english).slice(0, 40000),
  }).select('id').single()
  if (cErr) return { ok: false, refusal: `Your comment could not be saved (${cErr.message}).` }
  try {
    const kn = await knowledge(deps)
    const pack = buildAnswerPack(await deps.packInputs(ctx.country), kn, topicVocabulary(kn))
    const extra = await conversationPack(deps, ctx)
    const packText = extra ? `${pack.text}\n\nTHIS CONVERSATION\n${extra}` : pack.text
    let cost = 0
    const call = meteredCall(ledger, usd => { cost += usd })
    const r = await call(() => deps.model!.revise({ english: s(req.english), comment, packText, customerLanguage: lang, theirEnglish: ctx.thread.theirEnglish ?? ctx.thread.latest.text }))
    const en = splitNotes(r.english_draft).text
    const cu = english ? null : splitNotes(r.customer_draft).text
    const nums = numbersCheck([en, cu ?? ''], `${packText}\n${ctx.thread.latest.text}\n${ctx.thread.theirEnglish ?? ''}`)
    await saveDraft(deps, ctx, {
      english_draft: en, customer_draft: cu, translated_from: en, their_language: normLang(lang), their_english: ctx.thread.theirEnglish,
      numbers_check: nums.result, numbers_details: { unknown: nums.unknown, checked: nums.checked }, model: deps.model.model,
    })
    await deps.db.from('inbox_comments').update({ english_after: en.slice(0, 40000) }).eq('id', (kept as { id: string }).id)
    void cost
    return { ok: true, draft: { english: en, customer: cu, translatedFrom: en, language: lang }, message: INBOX_WORDS.rewritten }
  } catch (err) {
    if (err instanceof CapReached) return { ok: false, refusal: 'This month’s drafting budget is used up.', held: 'cap_reached' }
    return { ok: false, refusal: `The reply could not be rewritten just now (${s(err instanceof Error ? err.message : err).split('\n')[0].slice(0, 120)}).` }
  }
}

/** The English as it stands at Send, in their language. 🔴 Only called when the English changed after the last translation. */
export async function translateFinal(deps: DraftDeps, english: string, toLanguage: string): Promise<{ ok: true; text: string } | { ok: false; refusal: string }> {
  if (!deps.model) return { ok: false, refusal: INBOX_WORDS.translationOff }
  const ledger = await ledgerFor(deps)
  if (!ledger.canStart()) return { ok: false, refusal: 'This month’s translation budget is used up, so nothing was sent.' }
  try {
    const call = meteredCall(ledger, () => {})
    const r = await call(() => deps.model!.translate({ text: english, toLanguage }))
    return { ok: true, text: splitNotes(r.text).text }
  } catch (err) {
    return { ok: false, refusal: `The reply could not be translated just now, so nothing was sent (${s(err instanceof Error ? err.message : err).split('\n')[0].slice(0, 120)}).` }
  }
}
