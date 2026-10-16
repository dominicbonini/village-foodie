// lib/i18n/manage-errors.ts — 🔴 A MANAGE REFUSAL CARRIES A CODE AND ITS VALUES (Language Phase 1d; .cursor/rules/language.mdc
// rule 1 and rule 7). The Manage twin of lib/i18n/customer-errors.ts (1a), kitchen-errors.ts (1b) and onboarding-errors.ts
// (1c), for the routes the Manage page's Menu, Schedule and Settings tabs call: the tabs' actions on app/api/manage,
// app/api/manage/{commit-menu,process-allergens,process-menu,process-schedule,verify-schedule-url}, app/api/events/…
// and app/api/event-types.
//
//   { error: <today's English, byte for byte>, …every field the response already carried…, code, params }
//
// `code` is a key of `errorsManage` in messages/en-GB.json; `params` are its values, already formatted. A screen reads
// `code` + `params` through `errorText` (lib/i18n/customer-errors.ts), so its words come from its own message file;
// `error` stays for anything that already reads it (an older tab, a log line).
// ⚠️ `code` AND `params` GO LAST, so the body each route sent before this phase is the unchanged prefix of what it sends now.
// ⚠️ ONLY OUR OWN SENTENCES GET A CODE. A route that passes on text it did not write — a database error's message, an
// exception's, the model's — sends it unchanged and without a code: there is no message to look up for it.
//
// `tradeAreaErrorBody` is the same for lib/trade-area.ts's refusals (`tradeArea` namespace), which signup
// (app/api/setup), provisioning and Manage › Settings › Where you trade share.
import type enGB from '@/messages/en-GB.json'
import { errorBody } from './error-body'
import type { TradeAreaRefusal } from '@/lib/trade-area'
import '@/lib/i18n/catalog/errorsManage'
import '@/lib/i18n/catalog/tradeArea'

export type ManageErrorCode = keyof (typeof enGB)['errorsManage']
export type ManageErrorParams = Record<string, string | number>

/** The JSON body of a Manage refusal. A wrapper over the one helper, lib/i18n/error-body.ts. */
export function manageErrorBody<X extends Record<string, unknown>>(
  locale: string | null | undefined,
  code: ManageErrorCode,
  params: ManageErrorParams = {},
  extra?: X,
): { error: string } & X & { code: ManageErrorCode; params: ManageErrorParams } {
  return errorBody('errorsManage', locale, code, params, extra)
}

/** The JSON body of a refusal from lib/trade-area.ts (country, zone, town). The same helper, the `tradeArea` namespace. */
export function tradeAreaErrorBody<X extends Record<string, unknown>>(
  locale: string | null | undefined,
  refusal: TradeAreaRefusal,
  extra?: X,
) {
  return errorBody('tradeArea', locale, refusal.code, refusal.params, extra)
}
