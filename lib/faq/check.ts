// lib/faq/check.ts — 🔴 "DOES THIS QUESTION READ CORRECTLY IN EVERY SWITCHED-ON COUNTRY?" (faq-1, docs/faq-1-report.md §2).
//
// Each question is resolved for EVERY switched-on country (lib/faq/live-values.ts). It fails for a country where a token is
// unknown, names a plan not offered there, or has no value (an allowance with no limit). Switched-off countries are never checked.
// The result carries the admin's sentences (English: admin pages are English-only, 35.an-20), the failing countries by their
// English names, and which of the two fixes would help:
//   • "Add an answer for those countries" — every failing country offers one plan, so the single-plan answer would be used;
//   • "Show only where <plan> is offered"  — every problem is one plan not being offered.
// PURE AND CLIENT-SAFE. Publishing is refused while it fails, and so is saving a published question (lib/admin/faq-actions.ts).
import {
  resolveItem, offersOnePlan, tokensIn, previewLocaleOf, shownIn, answerFor,
  type FaqWorld, type FaqText, type Problem, type FaqCountry,
} from '@/lib/faq/live-values'
import { offerPlans, type OfferPlan } from '@/lib/plan-offer'
import { planByKey } from '@/lib/plans'

export interface Failure { code: string; name: string; single: boolean; problems: Problem[] }
export interface CheckResult {
  ok: boolean
  /** Countries the question appears in, of the switched-on ones. */
  shownCount: number
  failures: Failure[]
  /** The admin's sentences, one per kind of problem (empty when ok). */
  sentences: string[]
  fixes: { addSingle: boolean; showOnly: { key: string; name: string } | null }
}

const englishList = (xs: string[]) => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(xs)
/** "Brazil, Mexico and Thailand" — or, past ten, "36 countries" — always in English, by name. */
const countriesPhrase = (names: string[], total: number) =>
  names.length === total && total > 1 ? `all ${total} countries` : names.length > 10 ? `${names.length} countries` : englishList([...names].sort())

/** Run the check for one question over every switched-on country. */
export function checkItem(item: FaqText, world: FaqWorld): CheckResult {
  const failures: Failure[] = []
  let shownCount = 0
  for (const country of world.countries) {
    const r = resolveItem(item, world, country, previewLocaleOf(country.settings))
    if (!r.shown) continue
    shownCount++
    if (r.problems.length) failures.push({ code: country.settings.countryCode, name: country.settings.name, single: r.single, problems: r.problems })
  }
  const sentences: string[] = []
  // A token in the question is never filled in: live values are for answers.
  const inQuestion = tokensIn(item.questionEn)
  if (inQuestion.length || /[{}]/.test(item.questionEn)) sentences.push(`The question uses ${inQuestion.length ? inQuestion.map(t => `{${t}}`).join(', ') : 'a brace'}; live values work in answers only.`)

  // One sentence per (which answer, token, kind of problem), naming its countries.
  const groups = new Map<string, { single: boolean; problem: Problem; names: string[] }>()
  for (const f of failures) for (const p of f.problems) {
    const key = `${f.single}|${p.kind}|${p.token}`
    const g = groups.get(key) ?? { single: f.single, problem: p, names: [] }
    if (!g.names.includes(f.name)) g.names.push(f.name)
    groups.set(key, g)
  }
  for (const g of groups.values()) {
    const which = g.single ? 'The answer where one plan is offered' : 'This answer'
    const where = countriesPhrase(g.names, shownCount)
    const tok = g.problem.token.length > 1 ? `{${g.problem.token}}` : `a stray “${g.problem.token}”`
    if (g.problem.kind === 'notOffered') {
      const name = planByKey(world.catalog, g.problem.planKey)?.name ?? g.problem.planKey
      sentences.push(`${which} uses ${tok}, but ${name} isn't offered in ${where}.`)
    } else if (g.problem.kind === 'empty') {
      sentences.push(`${which} uses ${tok}, which has no value in ${where}.`)
    } else {
      sentences.push(`${which} uses ${tok}, which isn't a live value we know${g.problem.token.length > 1 ? ' — see the list by the page heading' : ''}.`)
    }
  }

  // The fixes. Adding a single-plan answer helps only where the MAIN answer fails in countries that each offer one plan.
  const addSingle = failures.length > 0 && failures.every(f => !f.single && offersOnePlan(world.countries.find(c => c.settings.countryCode === f.code) as FaqCountry, world))
  const notOffered = new Set(failures.flatMap(f => f.problems.map(p => (p.kind === 'notOffered' ? p.planKey : '\u0000'))))
  const onlyKey = notOffered.size === 1 && !notOffered.has('\u0000') ? [...notOffered][0] : null
  const showOnly = onlyKey && item.showIn !== `plan:${onlyKey}` ? { key: onlyKey, name: planByKey(world.catalog, onlyKey)?.name ?? onlyKey } : null

  return { ok: sentences.length === 0, shownCount, failures, sentences, fixes: { addSingle, showOnly } }
}

/** The single-plan answer's label: "Where only <plan> is offered (<n> countries)" — computed from the switched-on countries
 *  that offer exactly one plan ("one plan" when they differ). */
export function singlePlanLabel(world: FaqWorld): string {
  const singles = world.countries.map(c => offerPlans(world.catalog, c.settings.countryCode)).filter((p): p is [OfferPlan] => p.length === 1)
  const names = [...new Set(singles.map(p => p[0].plan.name))]
  const n = singles.length
  const count = n === 0 ? 'no countries now' : `${n} ${n === 1 ? 'country' : 'countries'}`
  return names.length === 1 ? `Where only ${names[0]} is offered (${count})` : `Where only one plan is offered (${count})`
}

/** "All countries" · "Where the apps are in the stores" · "Where <plan> is offered" — the Show in choices, plans from the data. */
export function showInChoices(world: FaqWorld): [string, string][] {
  const plans = [...new Map(world.countries.flatMap(c => offerPlans(world.catalog, c.settings.countryCode)).map(p => [p.plan.key, p.plan])).values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return [['all', 'All countries'], ['apps', 'Where the iPad and Android apps are in the stores'], ...plans.map(p => [`plan:${p.key}`, `Where ${p.name} is offered`] as [string, string])]
}

/** How many switched-on countries a question appears in, and in which it reads the single-plan answer. */
export function reach(item: FaqText, world: FaqWorld): { shown: number; single: number } {
  let shown = 0, single = 0
  for (const c of world.countries) if (shownIn(item.showIn, c, world)) { shown++; if (answerFor(item, c, world).single) single++ }
  return { shown, single }
}
