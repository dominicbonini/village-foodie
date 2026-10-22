// lib/plan-names.ts — 🔴 A PLAN'S NAME, DESCRIPTION AND SUBTITLE IN A LANGUAGE (languages-1, 22 October 2026,
// docs/languages-1-report.md §1.6).
//
// The `plans` row (public.plans, lib/plans.ts) holds them in English — the base, and what every English locale shows. A
// NON-ENGLISH language translates them in its own messages file, under `planNames.<plan key>.{name,description,subtitle}`;
// en-GB's `planNames` is empty, so an English catalogue passes through here untouched (the same object).
// WHY MESSAGES, NOT A plan_translations TABLE (europe-readiness §C option 2, chosen over option 1): a country is ONE prompt
// and ONE language file (Dominic, 22 October 2026). Kept in that file the plan names are translated, reviewed and checked
// (scripts/translation-check.cjs: present for every public plan, glossary terms, "Pro" never translated) with every other
// word, need no migration, no admin screen and no second loader, and fall back to the row's English when absent — so a NEW
// plan added as data still shows (in English, flagged by the check) until its language file names it.
// ⚠️ Sentences must not decline a name ("{plan} plan"): each language's message owns its own frame.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/planNames'
import type { PlanCatalog, PlanRow } from '@/lib/plans'

type Field = 'name' | 'description' | 'subtitle'
type Loose = { has(key: string): boolean; (key: string): string }

/** The catalogue with its plans' words in the locale's language — the SAME object when the language names none (English). */
export function localizePlans<C extends Pick<PlanCatalog, 'plans'>>(catalog: C, locale: string | null | undefined): C {
  const t = translatorFor(locale, 'planNames' as never) as unknown as Loose
  let changed = false
  const plans = catalog.plans.map((p: PlanRow) => {
    let out = p
    for (const f of ['name', 'description', 'subtitle'] as Field[]) {
      const key = `${p.key}.${f}`
      if (!t.has(key)) continue
      if (out === p) out = { ...p }
      ;(out as Record<Field, string | null>)[f] = t(key)
      changed = true
    }
    return out
  })
  return changed ? { ...catalog, plans } : catalog
}
