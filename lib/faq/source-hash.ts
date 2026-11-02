// lib/faq/source-hash.ts — the sha256 of the exact English a translation is made from (faq-2; public.faq_translations.source_hash).
// SERVER AND TRANSLATOR ONLY (node:crypto). A question's hash covers its question, answer and single-plan answer; a section's, its
// title. Any edit to any of them makes every translation of it out of date until the translator re-does it.
import { createHash } from 'node:crypto'

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

export const itemSourceHash = (i: { questionEn: string; answerEn: string; answerSinglePlanEn: string | null }): string =>
  sha256(JSON.stringify(['item', i.questionEn, i.answerEn, i.answerSinglePlanEn?.trim() ? i.answerSinglePlanEn : null]))

export const sectionSourceHash = (s: { titleEn: string }): string => sha256(JSON.stringify(['section', s.titleEn]))
