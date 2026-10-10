// lib/money-server.ts — the {currency, locale} a SERVER path formats money in. Server-only.
//
// 🔴 NEVER GUESSES GBP. An order is shown in `orders.currency` (snapshotted at insert by the 20261010
// trigger) with the locale of `orders.country`'s settings row; a truck — before there is an order — in
// `trucks.currency` with its country's locale. A row with neither is a LOUD error: a server path that
// cannot name the currency must not send an email or a reply that names one.
import 'server-only'
import { getCountrySettings } from '@/lib/country-settings'
import type { MoneyFormat, TruckMoney } from '@/lib/money-format'

function need(v: unknown, what: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`[money] ${what} is missing — was it left out of the select? Refusing to guess a currency.`)
  return v.trim()
}

/** An existing order's format — its own currency, its country's locale. */
export async function moneyFormatForOrder(order: { currency?: string | null; country?: string | null }): Promise<MoneyFormat> {
  const currency = need(order?.currency, 'orders.currency')
  const settings = await getCountrySettings(need(order?.country, 'orders.country'))
  return { currency: currency.toUpperCase(), locale: settings.locale }
}

/** A truck's format — for the menu, the Add Order panel, a reply about prices: anything not yet an order. */
export async function moneyFormatForTruck(truck: { currency?: string | null; country?: string | null }): Promise<MoneyFormat> {
  const currency = need(truck?.currency, 'trucks.currency')
  const settings = await getCountrySettings(need(truck?.country, 'trucks.country'))
  return { currency: currency.toUpperCase(), locale: settings.locale }
}

/** The truck's format plus the locale of every country its orders came from — what /api/dashboard sends. */
export async function truckMoneyWithOrders(
  truck: { currency?: string | null; country?: string | null },
  orders: Array<{ country?: string | null }>,
): Promise<TruckMoney> {
  const base = await moneyFormatForTruck(truck)
  const codes = new Set<string>([need(truck.country, 'trucks.country')])
  for (const o of orders) if (typeof o?.country === 'string' && o.country) codes.add(o.country)
  const localeByCountry: Record<string, string> = {}
  for (const c of codes) localeByCountry[c] = (await getCountrySettings(c)).locale
  return { ...base, localeByCountry }
}
