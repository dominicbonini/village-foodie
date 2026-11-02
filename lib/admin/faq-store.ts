// lib/admin/faq-store.ts — Admin › FAQ's database access (faq-1). SERVICE ROLE, SERVER ONLY.
//
// Implements FaqStore (lib/admin/faq-actions.ts) against public.faq_sections and public.faq_items (RLS on, no policies, no
// grants to anon or authenticated — like plans and country_settings), plus the world the check reads: the plan catalogue
// (getPlanCatalog), the SWITCHED-ON countries (listCountrySettings, uncached as the admin Countries page reads them) and each
// country's two app flags. ⚠️ The app flags are read HERE, not added to the public loader (lib/country-settings.ts), so no
// public page's data changes; they are the columns the comparison pages read (lib/comparison-flags.ts), unchanged.

import 'server-only'
import type { FaqStore, FaqItemRow, FaqSectionRow } from '@/lib/admin/faq-actions'
import { getPlanCatalog } from '@/lib/plans-server'
import { listCountrySettings } from '@/lib/country-settings'

type Row = Record<string, unknown>
const db = async () => (await import('@/lib/supabase')).supabase

const SECTION_COLUMNS = 'id, position, title_en'
const ITEM_COLUMNS = 'id, section_id, position, question_en, answer_en, answer_single_plan_en, show_in, status, note, note_done, published_at, created_at, updated_at, updated_by'

const sectionOf = (r: Row): FaqSectionRow => ({ id: String(r.id), position: Number(r.position), titleEn: String(r.title_en) })
const itemOf = (r: Row): FaqItemRow => ({
  id: String(r.id), sectionId: String(r.section_id), position: Number(r.position),
  questionEn: String(r.question_en), answerEn: String(r.answer_en),
  answerSinglePlanEn: typeof r.answer_single_plan_en === 'string' ? r.answer_single_plan_en : null,
  showIn: String(r.show_in), status: r.status === 'published' ? 'published' : 'draft',
  note: typeof r.note === 'string' ? r.note : null, noteDone: r.note_done === true,
  publishedAt: typeof r.published_at === 'string' ? r.published_at : null,
  createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  updatedBy: typeof r.updated_by === 'string' ? r.updated_by : null,
})

/** The page's field names → the table's columns. The ONE place they meet. */
const COLUMN: Record<string, string> = {
  sectionId: 'section_id', position: 'position', questionEn: 'question_en', answerEn: 'answer_en',
  answerSinglePlanEn: 'answer_single_plan_en', showIn: 'show_in', status: 'status', note: 'note', noteDone: 'note_done',
  publishedAt: 'published_at', updatedAt: 'updated_at', updatedBy: 'updated_by', titleEn: 'title_en',
}
const columnsOf = (cols: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== undefined).map(([k, v]) => {
    if (!COLUMN[k]) throw new Error(`[faq-store] no column for ${k}`)
    return [COLUMN[k], v]
  }))

const fail = (what: string, error: { message: string } | null) => { if (error) throw new Error(`[faq-store] ${what}: ${error.message}`) }

export const serviceFaqStore: FaqStore = {
  async sections() {
    const { data, error } = await (await db()).from('faq_sections').select(SECTION_COLUMNS).order('position').order('created_at')
    fail('read sections', error)
    return ((data ?? []) as Row[]).map(sectionOf)
  },
  async items() {
    const { data, error } = await (await db()).from('faq_items').select(ITEM_COLUMNS).order('position').order('created_at')
    fail('read questions', error)
    return ((data ?? []) as Row[]).map(itemOf)
  },
  async world() {
    const [catalog, countries, flags] = await Promise.all([
      getPlanCatalog(),
      listCountrySettings(),
      (async () => {
        const { data, error } = await (await db()).from('country_settings').select('country_code, ios_app_available, android_app_available')
        fail('read app flags', error)
        return new Map(((data ?? []) as Row[]).map(r => [String(r.country_code), r.ios_app_available === true && r.android_app_available === true]))
      })(),
    ])
    return { catalog, countries: countries.filter(c => c.enabled).map(settings => ({ settings, apps: flags.get(settings.countryCode) === true })) }
  },
  async insertSection(row) {
    const { data, error } = await (await db()).from('faq_sections').insert(columnsOf(row)).select(SECTION_COLUMNS).single()
    fail('add section', error)
    return sectionOf(data as Row)
  },
  async updateSection(id, cols) {
    const { data, error } = await (await db()).from('faq_sections').update({ ...columnsOf(cols), updated_at: new Date().toISOString() }).eq('id', id).select('id')
    fail('save section', error)
    return (data ?? []).length
  },
  async deleteSection(id) {
    const { data, error } = await (await db()).from('faq_sections').delete().eq('id', id).select('id')
    fail('delete section', error)
    return (data ?? []).length
  },
  async insertItem(row) {
    const { data, error } = await (await db()).from('faq_items').insert(columnsOf(row)).select(ITEM_COLUMNS).single()
    fail('add question', error)
    return itemOf(data as Row)
  },
  async updateItem(id, cols) {
    const { data, error } = await (await db()).from('faq_items').update(columnsOf(cols)).eq('id', id).select(ITEM_COLUMNS)
    fail('save question', error)
    const rows = (data ?? []) as Row[]
    return rows.length === 1 ? itemOf(rows[0]) : null
  },
  async deleteItem(id) {
    const { data, error } = await (await db()).from('faq_items').delete().eq('id', id).select('id')
    fail('delete question', error)
    return (data ?? []).length
  },
}
