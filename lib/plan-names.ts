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
import { namespaceMessages, registryVersion } from '@/lib/i18n/registry'
import { resolveLocale } from '@/lib/i18n/locales'
import '@/lib/i18n/catalog/planNames'
import type { PlanCatalog, PlanRow } from '@/lib/plans'

type Field = 'name' | 'description' | 'subtitle'
type Loose = (key: string) => string

/* ── perf-1 (5 November 2026, docs/perf-1-report.md): THE SAME ANSWER, WITHOUT THE COST ─────────────────────────────────────────
 * The FAQ resolves its plan tokens for every switched-on country on every uncached render, and each call here built a translator
 * and asked `t.has(key)` for every plan field — and next-intl's `has` answers "no" by THROWING and catching an Error. That was
 * ~10 s of CPU on a cold FAQ page (docs/perf-1-report.md §1). Now:
 *   • "is the word there" is read from the same merged tree the translator is given (namespaceMessages — en-GB with the locale's
 *     files over it), so nothing throws; the word itself still comes from the translator, so its formatting is unchanged;
 *   • the result is remembered per catalogue OBJECT (a WeakMap: a new catalogue — the plan cache refreshed — is a new key) and per
 *     locale and registry version (the version moves when a language's words arrive in the browser, so nothing goes stale). */
const MEMO = new WeakMap<object, Map<string, unknown>>()
const hasWord = (tree: unknown, key: string): boolean => {
  let at: unknown = tree
  for (const part of key.split('.')) { if (!at || typeof at !== 'object') return false; at = (at as Record<string, unknown>)[part] }
  return typeof at === 'string'
}

/** The catalogue with its plans' words in the locale's language — the SAME object when the language names none (English). */
export function localizePlans<C extends Pick<PlanCatalog, 'plans'>>(catalog: C, locale: string | null | undefined): C {
  const memoKey = `${resolveLocale(locale)}|${registryVersion()}`
  let byLocale = MEMO.get(catalog)
  if (!byLocale) { byLocale = new Map(); MEMO.set(catalog, byLocale) }
  if (byLocale.has(memoKey)) return byLocale.get(memoKey) as C
  const words = namespaceMessages(locale, 'planNames')
  let t: Loose | null = null
  let changed = false
  const plans = catalog.plans.map((p: PlanRow) => {
    let out = p
    for (const f of ['name', 'description', 'subtitle'] as Field[]) {
      const key = `${p.key}.${f}`
      if (!hasWord(words, key)) continue
      if (out === p) out = { ...p }
      t ??= translatorFor(locale, 'planNames' as never) as unknown as Loose
      ;(out as Record<Field, string | null>)[f] = t(key)
      changed = true
    }
    return out
  })
  const result = changed ? { ...catalog, plans } : catalog
  byLocale.set(memoKey, result)
  return result
}
