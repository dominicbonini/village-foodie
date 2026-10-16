// lib/i18n/error-body.ts — 🔴 ONE HELPER FOR EVERY REFUSAL A ROUTE SENDS (Language Phase 1c,
// docs/language-phase-1c-report.md; .cursor/rules/language.mdc rule 7).
//
//   { error: <today's English, byte for byte>, …every field the response already carried…, code, params }
//
// It was two copies — `customerErrorBody` (Phase 1a) and `kitchenErrorBody` (Phase 1b) — identical but for the
// namespace they read. They are now thin wrappers over this, keyed by namespace, so the output of every existing
// call site is unchanged (scripts/language-phase-1a.cjs and -1b.cjs still prove it field by field), and the
// onboarding routes (Phase 1c, `onboardingErrorBody`) use the same one instead of a third copy.
// ⚠️ `code` AND `params` GO LAST, so a body as it was before is the unchanged prefix of the body now.
// ⚠️ THE CALLING WRAPPER IMPORTS ITS NAMESPACE'S CATALOG (`import '@/lib/i18n/catalog/<ns>'`); this file reads
// whichever namespace it is handed and imports none, so it adds no words to any bundle by itself.
import type enGB from '@/messages/en-GB.json'
import { translatorFor, type AppNamespace } from './translator'

type Catalog = typeof enGB
/** The namespaces whose keys are refusal codes. ⚠️ `tradeArea` (Language Phase 1d) is one too: lib/trade-area.ts's
 *  refusals are codes shared by signup, provisioning and Manage, so they have their own namespace rather than a copy
 *  in each `errors…` one (lib/i18n/manage-errors.ts, `tradeAreaErrorBody`). */
export type ErrorNamespace = { [K in keyof Catalog]: K extends `errors${string}` | 'tradeArea' ? K : never }[keyof Catalog]
export type ErrorCode<NS extends ErrorNamespace> = Extract<keyof Catalog[NS], string>
export type ErrorParams = Record<string, string | number>

export function errorBody<NS extends ErrorNamespace, X extends Record<string, unknown> = Record<never, never>>(
  namespace: NS,
  locale: string | null | undefined,
  code: ErrorCode<NS>,
  params: ErrorParams = {},
  extra?: X,
): { error: string } & X & { code: ErrorCode<NS>; params: ErrorParams } {
  const t = translatorFor(locale, namespace as AppNamespace) as unknown as (code: string, params?: ErrorParams) => string
  return { error: t(code, params), ...(extra ?? ({} as X)), code, params }
}
