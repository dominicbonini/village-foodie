// lib/printing/printerText.ts — 🔴 WHAT THE PRINTER STACK TELLS THE OPERATOR, AS A CODE (Language Phase 1b).
//
// A transport (stub / wired / Bluetooth), the wired guard and the /api/printing client have no truck and no
// language: they answer from inside effects and across the transport seam. So they return a CODE — a key under
// messages/en-GB.json `printing.say` and its values — and the card (components/printing/PrintingSettings.tsx) turns
// it into words AT RENDER, in the truck's language. A plain string is text that is not ours to translate (a native
// error's own message, a server's error), shown exactly as it came.
// ⚠️ `printerMessageText` is the ONE renderer: the card, usePrinting (for the print record) and the harness
// (scripts/_lp1b-printing.cjs) all use it, so a code can never read differently in two places.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/printing'

/** The guard states that block printing (networkGuard's NetGuardState minus 'ok'). */
export type BlockedGuardState = 'other' | 'unknown' | 'unbound' | 'pin'

export type PrinterText =
  | { code: 'appOnly' | 'noPrinter' | 'noSupport' | 'notPaired' | 'statusUnchecked' | 'addressHelp' | 'netPermission'
      | 'notPrinterNoChannel' | 'notPrinterRefused' | 'couldNotConnect' | 'couldNotConnectPrinter' | 'couldNotReachPrinter'
      | 'scanFailed' | 'couldNotReachHatchGrab' | 'couldNotMove' | 'testSent' | 'testNotPrinted' | 'guardMove' }
  | { code: 'netRefused' | 'netTimeout' | 'netUnreachable' | 'netCantReach' | 'connectedTo'; address: string }
  | { code: 'connectedToSaveFailed'; address: string; error?: PrinterMessage | null }
  | { code: 'bleNotConnected'; name: string }
  | { code: 'requestFailed'; status: string }
  | { code: 'testPartial'; detail?: string | null }
  | { code: 'guard'; state: BlockedGuardState }

/** A code (ours, translated at render) or a plain string (not ours — shown as it came). */
export type PrinterMessage = PrinterText | string

/** The words for a printer message, in `locale` (the truck's; en-GB when absent). */
export function printerMessageText(locale: string | null | undefined, m: PrinterMessage): string {
  if (typeof m === 'string') return m
  const t = translatorFor(locale, 'printing')
  switch (m.code) {
    case 'guard': return t(`say.guard.${m.state}`)
    case 'netRefused': case 'netTimeout': case 'netUnreachable': case 'netCantReach': case 'connectedTo':
      return t(`say.${m.code}`, { address: m.address })
    case 'connectedToSaveFailed': {
      // `.trimEnd()`: the card used to build this as `Connected to X. ${error}`.trim().
      const error = m.error ? printerMessageText(locale, m.error).trimEnd() : ''
      return t('say.connectedToSaveFailed', { address: m.address, withError: error ? 'yes' : 'no', error })
    }
    case 'bleNotConnected': return t('say.bleNotConnected', { name: m.name })
    case 'requestFailed': return t('say.requestFailed', { status: m.status })
    case 'testPartial': return t('say.testPartial', { withDetail: m.detail ? 'yes' : 'no', detail: m.detail ?? '' })
    default: return t(`say.${m.code}`)
  }
}
