// lib/i18n/onboarding-errors.ts — 🔴 AN ONBOARDING REFUSAL CARRIES A CODE AND ITS VALUES (Language Phase 1c,
// docs/language-phase-1c-report.md; .cursor/rules/language.mdc rule 7). The onboarding twin of
// lib/i18n/customer-errors.ts (Phase 1a) and lib/i18n/kitchen-errors.ts (Phase 1b), for the routes the setup wizard,
// signup, the password and email pages, the demo and the account's deletion request call: the routes under
// app/api/setup, app/api/signup, app/api/auth, app/api/demo and app/api/account.
//
//   { error: <today's English, byte for byte>, …every field the response already carried…, code, params }
//
// `code` is a key of `errorsOnboarding` in messages/en-GB.json; `params` are its values, already formatted. A screen
// reads `code` + `params` through `errorText` (lib/i18n/customer-errors.ts), so its words come from its own message
// file; `error` stays for anything that already reads it (an older tab, a log line).
// ⚠️ `code` AND `params` GO LAST, so the body each route sent before this phase is the unchanged prefix of what it
// sends now (scripts/language-phase-1c.cjs, area `api`, proves it per field).
// ⚠️ ONLY OUR OWN SENTENCES GET A CODE. A route that passes on text it did not write — Supabase's, a database error's,
// an exception's — sends it unchanged and without a code: there is no message to look up for it.
import type enGB from '@/messages/en-GB.json'
import { errorBody } from './error-body'
import '@/lib/i18n/catalog/errorsOnboarding'

export type OnboardingErrorCode = keyof (typeof enGB)['errorsOnboarding']
export type OnboardingErrorParams = Record<string, string | number>

/** The JSON body of an onboarding refusal. A wrapper over the one helper, lib/i18n/error-body.ts. */
export function onboardingErrorBody<X extends Record<string, unknown>>(
  locale: string | null | undefined,
  code: OnboardingErrorCode,
  params: OnboardingErrorParams = {},
  extra?: X,
): { error: string } & X & { code: OnboardingErrorCode; params: OnboardingErrorParams } {
  return errorBody('errorsOnboarding', locale, code, params, extra)
}
