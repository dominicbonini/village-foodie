// lib/inbox/model-server.ts — the Claude model for Admin › Inbox, or null (inbox-1, 23 November 2026).
// 🔴 THERE IS NO CLAUDE API LOGIN ON VERCEL YET (enquiries-backend-1 §7, decision 1). Until Dominic adds ANTHROPIC_API_KEY this returns null
// and the Inbox reads, and sends replies typed by hand in English; Update reply says "Drafting isn't switched on yet." and a non-English
// reply "Translation isn't switched on yet.". The same adapter as the poll's (lib/enquiries/model.ts liveEnquiryModel), priced from
// competitor_check_settings.prices (data, never typed), the same $5 monthly cap (enquiry_spend).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnquiryModel } from '@/lib/enquiries/model'

export function draftingConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export async function inboxModel(db: SupabaseClient, deadline: number): Promise<EnquiryModel | null> {
  if (!draftingConfigured()) return null
  const { data } = await db.from('competitor_check_settings').select('prices').limit(1).maybeSingle()
  const prices = (data as { prices?: unknown } | null)?.prices
  if (!prices || typeof prices !== 'object') return null
  const [{ default: Anthropic }, { liveEnquiryModel }] = await Promise.all([import('@anthropic-ai/sdk'), import('@/lib/enquiries/model')])
  const client = new Anthropic()
  return liveEnquiryModel((params, opts) => client.beta.messages.create(params as never, opts) as never, prices as never, { deadline })
}
