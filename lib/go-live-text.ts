// lib/go-live-text.ts — 🔴 THE WORDS FOR A GO-LIVE ISSUE (Language Phase 1c, docs/language-phase-1c-report.md).
//
// lib/go-live-checks.ts decides and stays import-free: an issue is a code and its values. This is the ONE place
// those become the operator's words (messages/en-GB.json `goLive`), in the truck's language — so the checklist
// (Phase 4), the nomination gate's refusal (Phase 5) and scripts/audit-go-live.mjs can never word a code two ways.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/goLive'
import type { GoLiveIssue } from '@/lib/go-live-checks'

export interface GoLiveIssueWords {
  /** Short, operator-facing. Names the thing, not the rule. */
  title: string
  /** The CONSEQUENCE of ignoring it, in the operator's terms — not a restatement of the check. */
  detail: string
  /** Where they go to resolve it. */
  where: string
}

/** The title, detail and where of a go-live issue, in `locale` (the truck's; en-GB when absent). */
export function goLiveIssueText(issue: GoLiveIssue, locale?: string | null): GoLiveIssueWords {
  const t = translatorFor(locale, 'goLive')
  switch (issue.code) {
    case 'allergens_unanswered':
      return { title: t('allergensUnanswered.title'), detail: t('allergensUnanswered.detail'), where: t('allergensUnanswered.where') }
    case 'allergens_card_missing':
      return { title: t('allergensCardMissing.title'), detail: t('allergensCardMissing.detail'), where: t('allergensCardMissing.where') }
    case 'allergens_items_unverified': {
      const { unverified, total } = issue.params
      return {
        title: t('allergensItemsUnverified.title', { n: unverified, count: String(unverified) }),
        detail: t('allergensItemsUnverified.detail', { n: total, u: unverified, unverified: String(unverified), total: String(total) }),
        where: t('allergensItemsUnverified.where'),
      }
    }
    case 'no_van':
      return { title: t('noVan.title'), detail: t('noVan.detail'), where: t('noVan.where') }
    case 'kitchen_capacity_unset': {
      // ⚠️ Joined with ", " by hand, as it always was — Intl.ListFormat would add "and" (a visible change).
      const vans = issue.params.vans.map(name => name || t('kitchenCapacityUnset.unnamedVan')).join(', ')
      return { title: t('kitchenCapacityUnset.title'), detail: t('kitchenCapacityUnset.detail', { vans }), where: t('kitchenCapacityUnset.where') }
    }
    case 'no_prep_bearing_category':
      return {
        title: t('noPrepBearingCategory.title'),
        detail: t('noPrepBearingCategory.detail', { categories: issue.params.categories }),
        where: t('noPrepBearingCategory.where'),
      }
    case 'email_unverified':
      return issue.params.status === 'unknown'
        ? { title: t('emailUnknown.title'), detail: t('emailUnknown.detail'), where: t('emailUnknown.where') }
        : { title: t('emailUnverified.title'), detail: t('emailUnverified.detail'), where: t('emailUnverified.where') }
  }
}
