// lib/i18n/customer-errors.ts — 🔴 A CUSTOMER-FACING REFUSAL CARRIES A CODE AND ITS VALUES (Language Phase 1a,
// docs/language-phase-1a-report.md; .cursor/rules/language.mdc rule 7).
//
// Every refusal the order, status and payment routes send a customer is built here:
//   { error: <today's English, byte for byte>, …every field the response already carried…, code, params }
// `error` stays for anything that already reads it (an older page still open in a browser, the native shell,
// a log line); `code` and `params` are what the screens read — `errorText` below — so the words come from the
// customer's message file. `code` is a key of the `errorsCustomer` namespace in messages/en-GB.json; `params`
// are the message's values, already formatted (lib/money-format, lib/time-utils) — numbers only where a
// plural chooses its form.
// ⚠️ `code` AND `params` GO LAST. The body's existing fields keep their order, so what the response said before
// this phase is the unchanged prefix of what it says now (scripts/language-phase-1a.cjs proves it, per field).
import type enGB from '@/messages/en-GB.json'
import { errorBody } from './error-body'
import '@/lib/i18n/catalog/errorsCustomer'

export type CustomerErrorCode = keyof (typeof enGB)['errorsCustomer']
export type CustomerErrorParams = Record<string, string | number>

/** The JSON body of a customer-facing refusal. ⚠️ Since Phase 1c a wrapper over the one helper,
 *  lib/i18n/error-body.ts — same arguments, same output. */
export function customerErrorBody<X extends Record<string, unknown>>(
  locale: string | null | undefined,
  code: CustomerErrorCode,
  params: CustomerErrorParams = {},
  extra?: X,
): { error: string } & X & { code: CustomerErrorCode; params: CustomerErrorParams } {
  return errorBody('errorsCustomer', locale, code, params, extra)
}

/** The words a screen shows for a refusal: the message for its code, or — for a body without one (a response
 *  from before this phase, or a route outside it) — the `error` it carried, or the screen's own fallback. */
export function errorText(
  t: { (key: never, values?: never): string; has: (key: never) => boolean },
  body: { error?: unknown; code?: unknown; params?: unknown } | null | undefined,
  fallback: string,
): string {
  const tr = t as unknown as { (key: string, values?: CustomerErrorParams): string; has: (key: string) => boolean }
  const code = typeof body?.code === 'string' ? body.code : null
  if (code && tr.has(code)) return tr(code, (body?.params && typeof body.params === 'object' ? body.params : {}) as CustomerErrorParams)
  return typeof body?.error === 'string' && body.error ? body.error : fallback
}

/** errorText over SEVERAL namespaces — a route that sends two families of codes (/api/setup: errorsOnboarding and
 *  tradeArea). The first namespace that has the code words it; else the body's `error`, else the fallback. */
export function errorTextIn(
  ts: { (key: never, values?: never): string; has: (key: never) => boolean }[],
  body: { error?: unknown; code?: unknown; params?: unknown } | null | undefined,
  fallback: string,
): string {
  for (const t of ts) {
    const w = errorText(t, { code: body?.code, params: body?.params }, '')
    if (w) return w
  }
  return typeof body?.error === 'string' && body.error ? body.error : fallback
}
