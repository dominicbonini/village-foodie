// lib/admin/faq-actions.ts — what the Admin › FAQ route DOES (faq-1, 1 November 2026; docs/faq-1-report.md §3).
//
// The database is reached only through a FaqStore, so the SAME code runs in the route (the service-role store in
// lib/admin/faq-store.ts) and in scripts/faq-1.cjs (an in-memory table). Every rule is checked here, before any write, with the
// plain sentence the page shows.
//
// 🔴 PUBLISHING IS REFUSED WHILE THE CHECK FAILS (lib/faq/check.ts), and so is a save to a PUBLISHED question's question,
// answers or Show in: the check runs on the text as it would be after the save, and a failure writes nothing — the published
// text stays. Notes are private and never change what is published, so they save without the check.
// ⛔ Nothing here is public. No page, sitemap, /llms.txt or JSON-LD reads these tables yet (faq-1 is admin only).
import { checkItem } from '@/lib/faq/check'
import { isShowIn, type FaqWorld } from '@/lib/faq/live-values'
import type { FaqItemRow, FaqSectionRow } from '@/lib/faq/feedback'

export type { FaqItemRow, FaqSectionRow }

/** The item fields a save may write, as the page names them. */
export interface FaqItemPatch {
  questionEn?: string; answerEn?: string; answerSinglePlanEn?: string | null; showIn?: string; note?: string | null; noteDone?: boolean
}

export interface FaqStore {
  sections(): Promise<FaqSectionRow[]>
  items(): Promise<FaqItemRow[]>
  /** The plan catalogue and the switched-on countries with their app flags. */
  world(): Promise<FaqWorld>
  insertSection(row: { titleEn: string; position: number }): Promise<FaqSectionRow>
  updateSection(id: string, cols: Partial<Pick<FaqSectionRow, 'titleEn' | 'position'>>): Promise<number>
  /** Deletes the section; its questions go with it (ON DELETE CASCADE). Returns how many sections were deleted. */
  deleteSection(id: string): Promise<number>
  insertItem(row: Pick<FaqItemRow, 'sectionId' | 'position' | 'questionEn' | 'answerEn'> & { updatedBy: string }): Promise<FaqItemRow>
  /** Writes ONE item. Returns the row as saved, or null when it is gone. */
  updateItem(id: string, cols: Partial<Omit<FaqItemRow, 'id' | 'createdAt'>>): Promise<FaqItemRow | null>
  deleteItem(id: string): Promise<number>
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }
const refuse = <T>(status: number, error: string): ActionResult<T> => ({ ok: false, status, error })
const GONE = 'That was changed elsewhere. Reload to see the latest.'
const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const MAX_TEXT = 4000

export type FaqState = { sections: FaqSectionRow[]; items: FaqItemRow[] }
const state = async (store: FaqStore): Promise<ActionResult<FaqState>> => ({ ok: true, data: { sections: await store.sections(), items: await store.items() } })

/** The page's first read: every section and question, and the world the check and the preview read. */
export async function listFaq(store: FaqStore): Promise<ActionResult<FaqState & { world: FaqWorld }>> {
  const [sections, items, world] = await Promise.all([store.sections(), store.items(), store.world()])
  return { ok: true, data: { sections, items, world } }
}

/** The check's refusal as one sentence: what fails, then that nothing was written. */
const failed = (sentences: string[], what: string) => `${sentences.join(' ')} ${what}`

/** Swap a row with its neighbour in `dir`. Returns false at the end of the list. */
async function swap<T extends { id: string; position: number }>(list: T[], id: string, dir: number, write: (id: string, position: number) => Promise<unknown>): Promise<boolean> {
  const sorted = [...list].sort(byPosition)
  const i = sorted.findIndex(r => r.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= sorted.length) return false
  const a = sorted[i], b = sorted[j]
  // Equal positions (never written by this page, but possible by hand) are separated rather than swapped to no effect.
  const [pa, pb] = a.position === b.position ? (dir < 0 ? [b.position - 1, b.position] : [b.position + 1, b.position]) : [b.position, a.position]
  await write(a.id, pa)
  await write(b.id, pb)
  return true
}

/**
 * One admin action. `body.action` names it:
 *   section.create {title} · section.rename {id,title} · section.move {id,dir} · section.delete {id}
 *   item.create {sectionId} · item.update {id,patch} · item.move {id,dir} · item.delete {id} · item.publish {id} · item.unpublish {id}
 */
export async function faqAction(store: FaqStore, body: Record<string, unknown>, stamp: { by: string; at: string }): Promise<ActionResult<unknown>> {
  const action = str(body.action)
  const id = str(body.id) ?? ''
  const dir = body.dir === -1 || body.dir === 1 ? body.dir : 0

  switch (action) {
    case 'section.create': {
      const title = (str(body.title) ?? '').trim()
      if (!title) return refuse(400, 'Give the section a name.')
      const sections = await store.sections()
      await store.insertSection({ titleEn: title, position: Math.max(0, ...sections.map(s => s.position)) + 1 })
      return state(store)
    }
    case 'section.rename': {
      const title = (str(body.title) ?? '').trim()
      if (!title) return refuse(400, 'A section needs a name.')
      if (title.length > 200) return refuse(400, 'That name is too long (200 characters at most).')
      if ((await store.updateSection(id, { titleEn: title })) !== 1) return refuse(409, GONE)
      return state(store)
    }
    case 'section.move': {
      if (!dir) return refuse(400, 'Say which way to move it.')
      await swap(await store.sections(), id, dir, (sid, position) => store.updateSection(sid, { position }))
      return state(store)
    }
    case 'section.delete': {
      if ((await store.deleteSection(id)) !== 1) return refuse(409, GONE)
      return state(store)
    }
    case 'item.create': {
      const sectionId = str(body.sectionId) ?? ''
      if (!(await store.sections()).some(s => s.id === sectionId)) return refuse(400, 'Add a section first, then a question in it.')
      const siblings = (await store.items()).filter(i => i.sectionId === sectionId)
      await store.insertItem({ sectionId, position: Math.max(0, ...siblings.map(i => i.position)) + 1, questionEn: 'New question', answerEn: '', updatedBy: stamp.by })
      return state(store)
    }
    case 'item.move': {
      // Up from a section's first question moves it to the end of the section above; down from its last, to the top of the
      // section below — so a question can change section without a drag.
      if (!dir) return refuse(400, 'Say which way to move it.')
      const items = await store.items()
      const item = items.find(i => i.id === id)
      if (!item) return refuse(409, GONE)
      const siblings = items.filter(i => i.sectionId === item.sectionId)
      const moved = await swap(siblings, id, dir, (iid, position) => store.updateItem(iid, { position }))
      if (!moved) {
        const sections = [...(await store.sections())].sort(byPosition)
        const next = sections[sections.findIndex(s => s.id === item.sectionId) + dir]
        if (next) {
          const there = items.filter(i => i.sectionId === next.id).map(i => i.position)
          const position = dir < 0 ? Math.max(0, ...there) + 1 : Math.min(1, ...there) - 1
          await store.updateItem(id, { sectionId: next.id, position })
        }
      }
      return state(store)
    }
    case 'item.delete': {
      if ((await store.deleteItem(id)) !== 1) return refuse(409, GONE)
      return state(store)
    }
    case 'item.update':
    case 'item.publish':
    case 'item.unpublish':
      return itemWrite(store, action, id, body.patch, stamp)
    default:
      return refuse(400, 'Unknown action.')
  }
}

/** Parse an untrusted patch into the fields a save may write, or a sentence saying what is wrong. */
export function asPatch(x: unknown): FaqItemPatch | string {
  if (!x || typeof x !== 'object') return 'That save was incomplete. Reload the page and try again.'
  const o = x as Record<string, unknown>
  const out: FaqItemPatch = {}
  for (const k of ['questionEn', 'answerEn'] as const) if (k in o) {
    if (typeof o[k] !== 'string') return 'That save was incomplete. Reload the page and try again.'
    if ((o[k] as string).length > MAX_TEXT) return `That is too long (${MAX_TEXT} characters at most).`
    out[k] = o[k] as string
  }
  if ('questionEn' in out && !out.questionEn?.trim()) return 'A question can’t be empty.'
  for (const k of ['answerSinglePlanEn', 'note'] as const) if (k in o) {
    if (o[k] !== null && typeof o[k] !== 'string') return 'That save was incomplete. Reload the page and try again.'
    if (typeof o[k] === 'string' && (o[k] as string).length > MAX_TEXT) return `That is too long (${MAX_TEXT} characters at most).`
    out[k] = typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string) : null
  }
  if ('showIn' in o) { if (!isShowIn(o.showIn)) return 'Choose where the question shows.'; out.showIn = o.showIn }
  if ('noteDone' in o) { if (typeof o.noteDone !== 'boolean') return 'That save was incomplete. Reload the page and try again.'; out.noteDone = o.noteDone }
  return out
}

async function itemWrite(store: FaqStore, action: 'item.update' | 'item.publish' | 'item.unpublish', id: string, rawPatch: unknown, stamp: { by: string; at: string }): Promise<ActionResult<{ item: FaqItemRow }>> {
  const item = (await store.items()).find(i => i.id === id)
  if (!item) return refuse(409, GONE)

  if (action === 'item.unpublish') {
    const saved = await store.updateItem(id, { status: 'draft', updatedAt: stamp.at, updatedBy: stamp.by })
    return saved ? { ok: true, data: { item: saved } } : refuse(409, GONE)
  }
  if (action === 'item.publish') {
    if (!item.questionEn.trim() || !item.answerEn.trim()) return refuse(400, 'Write the question and its answer before publishing.')
    const check = checkItem(item, await store.world())
    if (!check.ok) return refuse(400, failed(check.sentences, "It can't be published until it reads correctly in every country."))
    const saved = await store.updateItem(id, { status: 'published', publishedAt: stamp.at, updatedAt: stamp.at, updatedBy: stamp.by })
    return saved ? { ok: true, data: { item: saved } } : refuse(409, GONE)
  }

  const patch = asPatch(rawPatch)
  if (typeof patch === 'string') return refuse(400, patch)
  const textChanged = (['questionEn', 'answerEn', 'answerSinglePlanEn', 'showIn'] as const).some(k => k in patch && patch[k] !== item[k])
  if (item.status === 'published' && textChanged) {
    const after = { ...item, ...patch }
    if (!after.answerEn.trim()) return refuse(400, 'A published question needs an answer. Unpublish it first to clear the answer.')
    const check = checkItem(after, await store.world())
    if (!check.ok) return refuse(400, failed(check.sentences, 'Not saved: this question is published, so the published text stays until the new text reads correctly in every country.'))
  }
  const saved = await store.updateItem(id, { ...patch, ...(textChanged ? { updatedAt: stamp.at, updatedBy: stamp.by } : {}) })
  return saved ? { ok: true, data: { item: saved } } : refuse(409, GONE)
}
