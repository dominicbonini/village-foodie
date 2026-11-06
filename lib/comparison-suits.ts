// lib/comparison-suits.ts — 🔴 "WHICH SUITS YOUR FOOD TRUCK?": QUESTIONS AND ANSWERS GENERATED FROM CHECKED DATA ONLY (compare-suits-1,
// 6 November 2026; docs/compare-suits-1-report.md). PURE, client-safe. lib/comparison.ts builds the input from the same view the
// table is built from; the page, comparisonMarkdown and comparisonJson all print what this returns, so the three never disagree.
//
// ── NOTHING HERE IS FREE-WRITTEN ─────────────────────────────────────────────────────────────────────────────────────
// Every sentence is a message pattern (comparisonSuits.*) with tokens; names, numbers and dates come from data. The patterns are the
// wording rules, so the rules hold in every language:
//   • a quoted "no" (its quote and page stored)          → "<name> doesn't offer this"
//   • "not listed" (absence means no, every page read)    → "<name> doesn't list <feature> on its website" — never "doesn't have/offer"
//   • "not mentioned"                                     → "<name>'s website doesn't say" (situations 1, 2 and 9 only), else not shown
//   • "none of the other products compared lists it"      → ONLY when every other shown product is a quoted or inferred no
//   • "the best fit among the products compared"          → never "best", "best overall" or "the only"
//   • ties name every tied product; HatchGrab is named only from its own data (plans, plan switches, prices).
//   • ⛔ No card reader, till, card machine or offline card payment in this section, for anyone (never_competitor_strength features
//     never produce an answer; no pattern names one; scripts/compare-suits-1.cjs scans every language).
// A situation shows ONLY when every input it needs is known for every shown column (yes, a quoted no or not listed — and, for 1, 2
// and 9, "not mentioned" too, described as the website not saying). One unknown, partly or unquoted "no" hides the whole answer.
import type { CellState } from '@/lib/comparison-features'

export type SuitsT = (key: string, values?: Record<string, string | number>) => string

/** HatchGrab's own answer for a feature, from its sources (lib/comparison-features.ts ourAnswer). */
export interface OurState { value: 'yes' | 'no' | 'partial' | 'unknown'; fromPlan: string | null; soon: boolean }
export interface SuitsColumn { key: string; name: string; us: boolean; unverified: boolean; category: string | null }
/** One competitor cell, as the answers read it. */
export interface SuitsCell { state: CellState; source: string | null; checkedOn: string | null; quote: string | null
  pages: { url: string; kind: string; ok: boolean; status: string }[] | null; helpCentre: string | null }
export interface SuitsFeature { key: string; label: string; group: string; neverStrength: boolean; ours: OurState; cells: Record<string, SuitsCell> }

/** One product's monthly software cost at one volume (lib/pricing-check.ts, card processing taken out). */
export interface PriceLine { key: string; name: string; us: boolean; plan: string; unlimitedFlat: boolean; currency: string
  subMinor: number; setupMinor: number; feesMinor: number; overageMinor: number; totalMinor: number; customerFees: boolean; checkedOn: string | null; source: string | null }
export interface PriceCalc { country: string; currency: string; orders: number; orderMinor: number; revenueMinor: number; date: string; lines: PriceLine[]; lowest: string[] }

export interface SuitsInput {
  locale: string
  today: string
  /** The shown columns, HatchGrab first. */
  columns: SuitsColumn[]
  /** The rows shown in the table, with HatchGrab's answer and every shown competitor's cell. */
  features: SuitsFeature[]
  /** HatchGrab's automatic pause when the signal drops (plan switch offline_protection). */
  offlinePause: OurState
  /** The competitors' "keeps working offline" answers (the `offline` row), when it is shown. */
  offline: SuitsFeature | null
  /** null when any shown column's cost at that volume is not known. */
  priceLow: PriceCalc | null
  priceHigh: PriceCalc | null
  /** The shown marketplaces' and HatchGrab's verified per-order fee structures (situation 8), or null. */
  commission: { name: string; fee: string; unverified: boolean; source: string | null; checkedOn: string | null }[] | null
  money: (minor: number, currency: string) => string
  date: (ymd: string) => string
}

export type EvidenceRow = { tool: string; feature: string; state: CellState | 'ours'; answer: string; source: string | null; quote: string | null
  pages: SuitsCell['pages']; helpCentre: string | null; checkedOn: string | null }
export interface SuitsAnswer {
  key: string
  question: string
  answer: string
  /** The products the answer compares. */
  products: string[]
  checkedOn: string
  checkedLabel: string
  evidence: { kind: 'features'; rows: EvidenceRow[] } | { kind: 'price'; calculation: PriceCalc }
  /** The evidence in the page's words, one line each, with its source link when there is one (page, Markdown and JSON). */
  evidenceLines: { text: string; url: string | null }[]
  /** An unverified column is in it (an admin's full view only). */
  unverified: boolean
}

/** The feature rows situations 1–5 read, and their message keys. */
export const SITUATION_FEATURES = { preorder: 'preorder', capacity: 'capacity', whatsapp: 'whatsapp', social: 'social', schedule: 'schedule' } as const
/** Situations where "not mentioned" may be described as the website not saying (the brief's 1, 2 and 9). */
const DOESNT_SAY_OK = new Set(['preorder', 'capacity', 'offline'])
/** Price and contract rows are never "strengths": their "yes" is a cost (a set-up fee, a minimum term), not a feature. */
const NOT_A_STRENGTH = new Set(['monthly', 'perorder', 'cardfee', 'setup', 'term'])

const maxDate = (ds: (string | null | undefined)[]) => ds.filter((d): d is string => !!d).sort().pop() ?? null

export function buildSuits(input: SuitsInput, t: SuitsT): SuitsAnswer[] {
  const list = (names: string[]) => { try { return new Intl.ListFormat(input.locale, { style: 'long', type: 'conjunction' }).format(names) } catch { return names.join(', ') } }
  const rivals = input.columns.filter(c => !c.us)
  const us = input.columns.find(c => c.us) ?? null
  const out: SuitsAnswer[] = []
  if (!us) return out
  const ourName = (o: OurState) => (o.fromPlan ? t('ours.fromPlan', { name: us.name, plan: o.fromPlan }) : us.name)
  const pageWords = (r: EvidenceRow) => (r.pages?.length ? list(r.pages.map(p => t(p.ok ? 'ev.pageRead' : 'ev.pageNotRead', { page: t(`ev.page.${p.kind}`) }))) : null)
  const linesOf = (rows: EvidenceRow[] | null, calc: PriceCalc | null): { text: string; url: string | null }[] => {
    if (calc) {
      const m = (x: number) => input.money(x, calc.currency)
      return [{ text: t('ev.calc.volume', { orders: calc.orders, order: m(calc.orderMinor), revenue: m(calc.revenueMinor) }), url: null },
        ...calc.lines.map(l => ({ text: t('ev.calc.line', { name: l.name, plan: l.plan, sub: m(l.subMinor), setup: m(l.setupMinor), fees: m(l.feesMinor), over: m(l.overageMinor), total: m(l.totalMinor) }), url: l.source })),
        { text: t('ev.calc.excluded'), url: null }, { text: t('ev.calc.date', { date: input.date(calc.date) }), url: null }]
    }
    return (rows ?? []).map(r => {
      const pages = pageWords(r)
      const bits = [t('ev.row', { tool: r.tool, feature: r.feature, answer: r.answer }), ...(r.quote ? [t('ev.quote', { quote: r.quote })] : []),
        ...(pages ? [t('ev.pages', { pages })] : []), ...(r.helpCentre ? [t(`ev.help.${r.helpCentre}`)] : [])]
      return { text: bits.join(' '), url: r.source }
    })
  }
  const answer = (key: string, q: string, a: string, products: string[], rows: EvidenceRow[] | null, calc: PriceCalc | null, dates: (string | null)[], unverified: boolean) => {
    const checkedOn = maxDate(dates) ?? input.today
    out.push({ key, question: q, answer: a, products, checkedOn, checkedLabel: t('checked', { date: input.date(checkedOn) }),
      evidence: calc ? { kind: 'price', calculation: calc } : { kind: 'features', rows: rows ?? [] }, evidenceLines: linesOf(rows, calc), unverified })
  }
  const evidenceOf = (f: SuitsFeature, keys: string[]): EvidenceRow[] => [
    { tool: us.name, feature: f.label, state: 'ours', answer: t(`ev.ours.${f.ours.value === 'yes' ? 'yes' : 'no'}`, { us: us.name }), source: null, quote: null, pages: null, helpCentre: null, checkedOn: input.today },
    ...rivals.filter(r => keys.includes(r.key)).map(r => { const c = f.cells[r.key]; return { tool: r.name, feature: f.label, state: c.state, answer: t(`ev.state.${c.state}`),
      source: c.source, quote: c.state === 'no_quoted' || c.state === 'yes' ? c.quote : null, pages: c.pages, helpCentre: c.helpCentre, checkedOn: c.checkedOn } }),
  ]

  // ── 1–5: which product does this ──
  for (const key of Object.keys(SITUATION_FEATURES) as (keyof typeof SITUATION_FEATURES)[]) {
    const f = input.features.find(x => x.key === SITUATION_FEATURES[key])
    if (!f || !rivals.length) continue
    if (f.ours.value !== 'yes' && f.ours.value !== 'no') continue
    const allowed: CellState[] = ['yes', 'no_quoted', 'not_listed', ...(DOESNT_SAY_OK.has(key) ? ['not_mentioned' as const] : [])]
    if (!rivals.every(r => f.cells[r.key] && allowed.includes(f.cells[r.key].state))) continue
    const yes = [...(f.ours.value === 'yes' ? [ourName(f.ours)] : []), ...rivals.filter(r => f.cells[r.key].state === 'yes').map(r => r.name)]
    if (!yes.length) continue
    const noQuoted = [...(f.ours.value === 'no' ? [us.name] : []), ...rivals.filter(r => f.cells[r.key].state === 'no_quoted').map(r => r.name)]
    const notListed = rivals.filter(r => f.cells[r.key].state === 'not_listed').map(r => r.name)
    const doesntSay = rivals.filter(r => f.cells[r.key].state === 'not_mentioned').map(r => r.name)
    const parts = [t(`does.${key}`, { names: list(yes), count: yes.length })]
    if (!doesntSay.length && (noQuoted.length || notListed.length)) parts.push(t('others.noneLists', { names: list(yes), count: yes.length }))
    else {
      if (noQuoted.length) parts.push(t('others.noQuoted', { names: list(noQuoted), count: noQuoted.length }))
      if (notListed.length) parts.push(t('others.notListed', { names: list(notListed), count: notListed.length, feature: t(`feat.${key}`) }))
      if (doesntSay.length) parts.push(t('others.doesntSay', { names: list(doesntSay), count: doesntSay.length }))
    }
    answer(key, t(`q.${key}`), parts.join(' '), [us.name, ...rivals.map(r => r.name)], evidenceOf(f, rivals.map(r => r.key)), null,
      rivals.map(r => f.cells[r.key].checkedOn), rivals.some(r => r.unverified))
  }

  // ── 6, 7: the lowest monthly software cost at a stated low and high volume ──
  for (const [key, calc] of [['priceLow', input.priceLow], ['priceHigh', input.priceHigh]] as const) {
    if (!calc || !rivals.length || !calc.lowest.length) continue
    const lowest = calc.lines.filter(l => calc.lowest.includes(l.key))
    // HatchGrab with its plan (Unlimited at the high volume: "a flat price with no per-order fee from HatchGrab"); a competitor by its
    // name alone — every plan is in the evidence.
    const names = lowest.map(l => (!l.us ? l.name : key === 'priceHigh' && l.unlimitedFlat ? t('price.flat', { name: l.name, plan: l.plan }) : t('price.planName', { name: l.name, plan: l.plan })))
    const a = [t('price.lead', { orders: calc.orders, names: list(names), count: names.length, amount: input.money(lowest[0].totalMinor, calc.currency) }),
      t('price.includes')].join(' ')
    answer(key, t(`q.${key}`), a, calc.lines.map(l => l.name), null, calc, calc.lines.map(l => l.checkedOn), rivals.some(r => r.unverified))
  }

  // ── 8: commission — only with a marketplace among the shown competitors ──
  if (input.commission && rivals.some(r => r.category === 'marketplace')) {
    const parts = input.commission.map(c => t('commission.part', { name: c.name, fee: c.fee }))
    answer('commission', t('q.commission'), t('commission.answer', { parts: list(parts) }), input.commission.map(c => c.name), [], null,
      input.commission.map(c => c.checkedOn), input.commission.some(c => c.unverified))
  }

  // ── 9: the signal drops — a statement about HatchGrab, compared only with a quoted "no" (or the website not saying) ──
  if (input.offlinePause.value === 'yes') {
    const f = input.offline
    const noQuoted = f ? rivals.filter(r => f.cells[r.key]?.state === 'no_quoted').map(r => r.name) : []
    const doesntSay = f ? rivals.filter(r => f.cells[r.key]?.state === 'not_mentioned').map(r => r.name) : []
    const parts = [t('offline.ours', { name: ourName(input.offlinePause) })]
    if (noQuoted.length) parts.push(t('offline.noQuoted', { names: list(noQuoted), count: noQuoted.length }))
    if (doesntSay.length) parts.push(t('offline.doesntSay', { names: list(doesntSay), count: doesntSay.length }))
    const named = [...noQuoted, ...doesntSay]
    const rows: EvidenceRow[] = [{ tool: us.name, feature: t('feat.offlinePause'), state: 'ours', answer: t('ev.ours.yes', { us: us.name }), source: null, quote: null, pages: null, helpCentre: null, checkedOn: input.today },
      ...(f ? rivals.filter(r => named.includes(r.name)).map(r => { const c = f.cells[r.key]; return { tool: r.name, feature: f.label, state: c.state, answer: t(`ev.state.${c.state}`),
        source: c.source, quote: c.state === 'no_quoted' ? c.quote : null, pages: c.pages, helpCentre: c.helpCentre, checkedOn: c.checkedOn } }) : [])]
    answer('offline', t('q.offline'), parts.join(' '), [us.name, ...named], rows, null,
      f ? rivals.filter(r => named.includes(r.name)).map(r => f.cells[r.key].checkedOn) : [], f ? rivals.some(r => named.includes(r.name) && r.unverified) : false)
  }

  // ── 10: every competitor strength — a shown competitor says yes, HatchGrab's answer is no (never a never_competitor_strength feature) ──
  for (const f of input.features) {
    if (f.neverStrength || NOT_A_STRENGTH.has(f.key) || f.ours.value !== 'no') continue
    const yes = rivals.filter(r => f.cells[r.key]?.state === 'yes')
    if (!yes.length) continue
    const names = yes.map(r => r.name)
    answer(`strength.${f.key}`, t('q.strength', { feature: f.label }),
      t(f.ours.soon ? 'strength.answerSoon' : 'strength.answer', { names: list(names), count: names.length, feature: f.label, us: us.name }),
      [...names, us.name], evidenceOf(f, yes.map(r => r.key)), null, yes.map(r => f.cells[r.key].checkedOn), yes.some(r => r.unverified))
  }
  return out
}
