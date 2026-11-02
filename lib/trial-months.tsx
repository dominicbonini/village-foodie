'use client'
// lib/trial-months.tsx — the trial's length (plans.trial_months) handed from a server layout to the client page under it
// (copy-truth-1, 2 November 2026). /signup's layout reads it with offerTrialMonths — the pricing pages' own read — and the
// page's subtitle says the trial starts at signup. Null = not known (no provider, or the read failed): the words then name no
// length.
import { createContext, useContext } from 'react'

const TrialMonthsContext = createContext<number | null>(null)

export function TrialMonthsProvider({ months, children }: { months: number | null; children: React.ReactNode }) {
  return <TrialMonthsContext.Provider value={months}>{children}</TrialMonthsContext.Provider>
}

export const useTrialMonths = (): number | null => useContext(TrialMonthsContext)
