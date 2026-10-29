// lib/cost-block.ts — THE COST BLOCK's numbers and sentences (comparison-features-1, 29 October 2026;
// docs/comparison-features-1-report.md). PURE AND CLIENT-SAFE. Built once for later public use; today it is shown ONLY in
// Admin › Pricing check › Customer preview (components/comparison/CostBlock.tsx) — on no public page.
//
// For a truck size (online orders a month × the country's order value, lib/pricing-check.ts VOLUMES), each tool's bar is its
// TOTAL MONTHLY COST to the truck, split into two parts that add up exactly:
//   Software fee = the tool's own monthly price + set-up ÷ 12 + the fees the TRUCK pays per order + any overage;
//   Card fees    = the card processing on those orders (its published rate, else ours — "rate not published, assumed").
// 🔴 A fee the CUSTOMER pays is never in a bar: it is a separate note on the row. Every amount says its period; every cost
// says what it includes. The words are messages (comparison.costBlock.*, en-GB and de-DE); the numbers come from data.
import { formatAmount, formatWholeAmount, pctLabel, feeLabel, type MoneyFormat } from '@/lib/money-format'
import { VOLUMES, type Benchmark, type CountryResult, type VolumeKey } from '@/lib/pricing-check'

export type T = (key: string, values?: Record<string, string | number>) => string

export interface CostBar {
  key: string; tool: string; us: boolean
  softwareMinor: number; cardMinor: number; totalMinor: number
  /** Total as a share of the month's online sales (%). */
  sharePct: number
  cardAssumed: boolean
  /** What customers pay on top, a month (never in the bar); null when nothing. */
  customerMinor: number | null; customerFeeText: string | null
}
export interface CostBlockData {
  currency: string; locale: string
  sizes: { key: VolumeKey; orders: number; salesMinor: number }[]
  selected: VolumeKey; orders: number; salesMinor: number
  bars: CostBar[]
  summary: { kind: 'cheapest' | 'notCheapest' | 'alone'; oursMinor: number; theirsMinor: number | null; rival: string | null; cardMinor: number }
  footnote: { orderMinor: number; mealMinor: number; multiplier: number; mealSource: string | null; cardRate: string | null; assumed: string[]; checkedOn: string | null }
}

/** The block for one country and size: HatchGrab's cheapest plan there, and each VERIFIED rival's cheapest counted plan
 *  (one bar per tool, the page's filters applied), sorted by total. Null when the country has no figures. */
export function costBlockOf(result: CountryResult, size: VolumeKey, bench: Benchmark | null, locale: string): CostBlockData | null {
  const v = result.volumes.find(x => x.key === size)
  if (!v || !v.best || !bench) return null
  const money: MoneyFormat = { currency: result.currency, locale }
  const share = (minor: number) => (v.revenueMinor > 0 ? (minor / v.revenueMinor) * 100 : 0)
  const ours: CostBar = {
    key: 'hatchgrab', tool: 'HatchGrab', us: true, softwareMinor: v.best.subMinor + v.best.feeMinor, cardMinor: v.best.cardMinor,
    totalMinor: v.best.subMinor + v.best.feeMinor + v.best.cardMinor, sharePct: 0, cardAssumed: false, customerMinor: null, customerFeeText: null,
  }
  ours.sharePct = share(ours.totalMinor)
  const byTool = new Map<string, CostBar>()
  for (const r of v.rivals) {
    if (r.reason !== null || r.filteredOut || !r.plan.verifiedAt || !r.competitor) continue
    const software = r.parts.subMinor + r.parts.setupMinor + r.parts.feesMinor + r.parts.overageMinor
    const bar: CostBar = {
      key: r.competitor.id, tool: r.competitor.name, us: false, softwareMinor: software, cardMinor: r.parts.cardMinor,
      totalMinor: software + r.parts.cardMinor, sharePct: share(software + r.parts.cardMinor), cardAssumed: r.cardAssumed,
      customerMinor: r.customerMinor > 0 ? r.customerMinor : null,
      customerFeeText: r.customerMinor > 0 ? perOrder(r.plan.customerFeeBps, r.plan.customerFeeFixedMinor, { ...money, currency: r.plan.currency }) : null,
    }
    const had = byTool.get(bar.key)
    if (!had || bar.totalMinor < had.totalMinor) byTool.set(bar.key, bar)
  }
  const rivals = [...byTool.values()]
  const bars = [ours, ...rivals].sort((a, b) => a.totalMinor - b.totalMinor)
  const cheapest = rivals.length ? rivals.reduce((a, b) => (b.softwareMinor < a.softwareMinor ? b : a)) : null
  const summary = !cheapest ? { kind: 'alone' as const, oursMinor: ours.softwareMinor, theirsMinor: null, rival: null, cardMinor: ours.cardMinor }
    : { kind: ours.softwareMinor <= cheapest.softwareMinor + 1e-9 ? 'cheapest' as const : 'notCheapest' as const, oursMinor: ours.softwareMinor,
        theirsMinor: cheapest.softwareMinor, rival: cheapest.tool, cardMinor: ours.cardMinor }
  const checked = [bench.checkedOn, ...v.rivals.filter(r => byTool.has(r.competitor?.id ?? '')).map(r => r.plan.checkedOn)].filter(Boolean).sort().pop() ?? null
  return {
    currency: result.currency, locale,
    sizes: VOLUMES.map(s => ({ key: s.key, orders: s.orders, salesMinor: v.orderMinor * s.orders })),
    selected: size, orders: v.orders, salesMinor: v.revenueMinor, bars, summary,
    footnote: {
      orderMinor: v.orderMinor, mealMinor: bench.mealMinor, multiplier: bench.orderMultiplier, mealSource: bench.mealSourceLabel,
      cardRate: result.card ? (result.card.fixedMinor ? feeLabel({ pct: result.card.bps / 100, fixedMinor: result.card.fixedMinor }, money) : pctLabel(result.card.bps / 100, money)) : null,
      assumed: rivals.filter(b => b.cardAssumed).map(b => b.tool), checkedOn: checked,
    },
  }
}

const perOrder = (bps: number, fixedMinor: number, f: MoneyFormat) =>
  bps && fixedMinor ? feeLabel({ pct: bps / 100, fixedMinor }, f) : bps ? pctLabel(bps / 100, f) : formatAmount(fixedMinor, f)

/** Every sentence of the block, from messages — so the component, a harness and (later) a public page say the same. */
export function costBlockWords(d: CostBlockData, t: T, extra: { countryName: string }) {
  const money: MoneyFormat = { currency: d.currency, locale: d.locale }
  const amount = (m: number) => formatWholeAmount(m, money)
  const count = (n: number) => new Intl.NumberFormat(d.locale).format(n)
  const pct = (p: number) => pctLabel(Math.round(p * 10) / 10, money)
  const list = (xs: string[]) => new Intl.ListFormat(d.locale, { style: 'long', type: 'conjunction' }).format(xs)
  const s = d.summary
  return {
    title: t('costBlock.title'),
    sizesLabel: t('costBlock.sizes'),
    sizes: d.sizes.map(z => ({ key: z.key, sales: t('costBlock.sizeSales', { sales: amount(z.salesMinor) }), orders: t('costBlock.sizeOrders', { orders: count(z.orders) }) })),
    lead: t('costBlock.lead', { sales: amount(d.salesMinor), orders: count(d.orders) }),
    legend: { software: t('costBlock.legendSoftware'), card: t('costBlock.legendCard') },
    bars: d.bars.map(b => ({
      ...b,
      software: t('costBlock.software', { amount: amount(b.softwareMinor) }),
      card: `${t('costBlock.card', { amount: amount(b.cardMinor) })}${b.cardAssumed ? ` ${t('costBlock.assumed')}` : ''}`,
      total: t('costBlock.total', { amount: amount(b.totalMinor) }),
      share: t('costBlock.share', { pct: pct(b.sharePct) }),
      customer: b.customerMinor !== null && b.customerFeeText ? t('costBlock.customerFee', { amount: amount(b.customerMinor), fee: b.customerFeeText }) : null,
    })),
    summary: s.kind === 'alone' ? t('costBlock.summaryAlone', { us: 'HatchGrab', ours: amount(s.oursMinor), card: amount(s.cardMinor) })
      : t(s.kind === 'cheapest' ? 'costBlock.summaryCheapest' : 'costBlock.summaryNotCheapest',
        { us: 'HatchGrab', ours: amount(s.oursMinor), theirs: amount(s.theirsMinor ?? 0), rival: s.rival ?? '', card: amount(s.cardMinor) }),
    footnote: [
      t('costBlock.footOrder', { order: formatAmount(d.footnote.orderMinor, money), meal: formatAmount(d.footnote.mealMinor, money),
        multiplier: new Intl.NumberFormat(d.locale, { maximumFractionDigits: 2 }).format(d.footnote.multiplier), source: d.footnote.mealSource ?? '—' }),
      ...(d.footnote.cardRate ? [t('costBlock.footCard', { rate: d.footnote.cardRate, source: t('costBlock.footCardSource', { country: extra.countryName }) })] : []),
      ...(d.footnote.assumed.length ? [t('costBlock.footAssumed', { names: list(d.footnote.assumed), count: d.footnote.assumed.length })] : []),
      ...(d.footnote.checkedOn ? [t('costBlock.footChecked', { date: d.footnote.checkedOn })] : []),
    ],
    calculator: t('costBlock.footCalculator'),
  }
}
