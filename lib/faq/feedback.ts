// lib/faq/feedback.ts — "Copy feedback for Claude": every question with a note that isn't done, as plain text grouped by
// section (faq-1, docs/faq-1-report.md §3). The button's count is `openNotes(...)`, the same number the header line states.
// PURE AND CLIENT-SAFE.
import { resolveItem, previewLocaleOf, type FaqWorld } from '@/lib/faq/live-values'

export interface FaqSectionRow { id: string; position: number; titleEn: string }
export interface FaqItemRow {
  id: string; sectionId: string; position: number
  questionEn: string; answerEn: string; answerSinglePlanEn: string | null; showIn: string
  status: 'draft' | 'published'; note: string | null; noteDone: boolean
  publishedAt: string | null; createdAt: string; updatedAt: string; updatedBy: string | null
}

/** A note counts while it has words and isn't ticked Done. */
export const hasOpenNote = (i: Pick<FaqItemRow, 'note' | 'noteDone'>): boolean => !!i.note?.trim() && !i.noteDone
export const openNotes = (items: Pick<FaqItemRow, 'note' | 'noteDone'>[]): number => items.filter(hasOpenNote).length

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

/**
 *   HatchGrab FAQ feedback — <date> — <n> notes
 *   ## <Section>
 *   ### <question>  [id: <uuid>] [<status>]
 *   Answer: <answer_en, tokens as typed>
 *   Answer where one plan is offered: <answer_single_plan_en, or "none">
 *   UK preview: <resolved>
 *   My note: <note>
 * `previewCode` is the marketing country (lib/marketing-country.ts); its short name labels the preview ("UK").
 */
export function feedbackText(sections: FaqSectionRow[], items: FaqItemRow[], world: FaqWorld, previewCode: string, now: Date = new Date()): string {
  const n = openNotes(items)
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  const out = [`HatchGrab FAQ feedback — ${date} — ${n} ${n === 1 ? 'note' : 'notes'}`]
  const home = world.countries.find(c => c.settings.countryCode === previewCode)
  const label = home ? (home.settings.shortName || home.settings.name) : previewCode
  for (const s of [...sections].sort(byPosition)) {
    const open = items.filter(i => i.sectionId === s.id && hasOpenNote(i)).sort(byPosition)
    if (!open.length) continue
    out.push('', `## ${s.titleEn}`)
    for (const i of open) {
      let preview: string
      if (!home) preview = 'not available (that country is switched off)'
      else {
        const r = resolveItem(i, world, home, previewLocaleOf(home.settings))
        preview = !r.shown ? 'not shown there' : r.text + (r.problems.length ? '  [doesn’t read correctly there]' : '')
      }
      out.push(
        '',
        `### ${i.questionEn}  [id: ${i.id}] [${i.status}]`,
        `Answer: ${i.answerEn}`,
        `Answer where one plan is offered: ${i.answerSinglePlanEn?.trim() ? i.answerSinglePlanEn : 'none'}`,
        `${label} preview: ${preview}`,
        `My note: ${(i.note ?? '').trim()}`,
      )
    }
  }
  return out.join('\n') + '\n'
}
