// lib/native/deviceSaveText.ts — the operator-facing sentence for a failed device-config write (Language Phase 1b;
// it was saveFailureMessage in lib/native/device.ts, moved here so that widely imported module reads no messages).
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/nativeShell'
import { saveFailureKey, type SaveDeviceConfigResult } from '@/lib/native/device'

/** The ONE operator-facing sentence for a failed write. 🔴 IT NEVER NAMES `reason`: the internal cause is for the
 *  console line, not for a hatch. Only the network/server split changes the wording, because only that changes
 *  what the operator should do about it. */
export function saveFailureMessage(r: Extract<SaveDeviceConfigResult, { ok: false }>, locale?: string | null): string {
  return translatorFor(locale, 'nativeShell')(saveFailureKey(r))
}
