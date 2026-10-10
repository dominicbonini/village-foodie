'use client'
// components/MoneyContext.tsx — the {currency, locale} the money on a screen is shown in.
//
// A page provides it from the payload it already receives (the dashboard's truck.money, the menu's
// truck.money); an order card nests its OWN order's format inside, so a card always shows its order's
// currency. Leaves (OrderLineItem, DealsModal, PaymentActionsModal) read it. Never the whole settings row,
// and never a browser read of country_settings.
//
// ⚠️ NO DEFAULT. Outside a provider useMoney() is null, and every reader prints a bare figure with one
// console warning (formatMajorOrBare) — never a £ it cannot vouch for.
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { MoneyFormat } from '@/lib/money-format'

const MoneyCtx = createContext<MoneyFormat | null>(null)

export function MoneyProvider({ fmt, children }: { fmt: MoneyFormat | null | undefined; children: ReactNode }) {
  // Keyed on the two strings, so a parent that rebuilds the object every render does not re-render readers.
  const currency = fmt?.currency || null, locale = fmt?.locale || null
  const value = useMemo(() => (currency && locale ? { currency, locale } : null), [currency, locale])
  return <MoneyCtx.Provider value={value}>{children}</MoneyCtx.Provider>
}

export function useMoney(): MoneyFormat | null {
  return useContext(MoneyCtx)
}
