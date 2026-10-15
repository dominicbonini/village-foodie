// lib/i18n/kitchen-errors.ts — 🔴 A KITCHEN-FACING REFUSAL CARRIES A CODE AND ITS VALUES (Language Phase 1b,
// docs/language-phase-1b-report.md; .cursor/rules/language.mdc rule 7). The kitchen's twin of
// lib/i18n/customer-errors.ts (Phase 1a), for the routes the dashboard, the KDS, the printing settings and the
// native shell call: the routes under app/api/dashboard, app/api/printing and app/api/native.
//
//   { error: <today's English, byte for byte>, …every field the response already carried…, code, params }
//
// `code` is a key of `errorsKitchen` in messages/en-GB.json; `params` are its values, already formatted. A screen
// reads `code` + `params` through `errorText` (lib/i18n/customer-errors.ts), so its words come from its own message
// file; `error` stays for anything that already reads it (an older tab, the offline outbox, a log line).
// ⚠️ `code` AND `params` GO LAST, so the body each route sent before this phase is the unchanged prefix of what it
// sends now (scripts/language-phase-1b.cjs, area `api`, proves it per field).
// ⚠️ ONLY OUR OWN SENTENCES GET A CODE. A route that passes on text it did not write — a database error's message,
// an exception's, Stripe's — sends it unchanged and without a code: there is no message to look up for it.
import type enGB from '@/messages/en-GB.json'
import { errorBody } from './error-body'
import '@/lib/i18n/catalog/errorsKitchen'

export type KitchenErrorCode = keyof (typeof enGB)['errorsKitchen']
export type KitchenErrorParams = Record<string, string | number>

/** The JSON body of a kitchen-facing refusal. ⚠️ Since Phase 1c a wrapper over the one helper,
 *  lib/i18n/error-body.ts — same arguments, same output. */
export function kitchenErrorBody<X extends Record<string, unknown>>(
  locale: string | null | undefined,
  code: KitchenErrorCode,
  params: KitchenErrorParams = {},
  extra?: X,
): { error: string } & X & { code: KitchenErrorCode; params: KitchenErrorParams } {
  return errorBody('errorsKitchen', locale, code, params, extra)
}
