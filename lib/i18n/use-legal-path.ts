'use client'
// lib/i18n/use-legal-path.ts — legal-languages-1 (1 November 2026): a legal document's address for a CLIENT component, in the
// language its provider speaks (lib/legal.ts legalPath) — the truck's on the order page, the dashboard and Manage; English
// (/privacy, /terms) with no provider or an English locale, exactly as before. `country` names the truck's country where the
// component knows it; without one the locale's own region does.
import { legalPath, type LegalDoc } from '@/lib/legal'
import { useAppLocale } from './use-t'

export function useLegalPath(doc: LegalDoc, country?: string | null): string {
  return legalPath(doc, { country, locale: useAppLocale() })
}
