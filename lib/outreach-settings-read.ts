// lib/outreach-settings-read.ts — reading the two `outreach_settings` rows a send needs.
//
// 🔴 ONE READER, SO THE SENDER AND THE EDITOR CANNOT DISAGREE ABOUT WHAT A ROW MEANS. The send route
// reads it to build the message; the settings route reads it back after a save; the Templates tab
// previews with the same parse. A second parse would eventually differ about, say, whether a missing
// `bold` is false — and the difference would show up as a signature that previews one way and sends
// another.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SIGNATURE_KEY, OPT_OUT_KEY, FROM_NAME_KEY, parseSignature, parseOptOut, parseFromName,
  type SendTimeValues,
} from '@/lib/outreach-signature'
import { dbDetail } from '@/lib/outreach-messages-table'

export interface SettingsRead {
  values: SendTimeValues
  /** The sender's display name, or null. Never an error — see `readFromName`. */
  fromName: string | null
  /**
   * 🔴 SET WHEN THE TABLE COULD NOT BE READ AT ALL — which is NOT the same as a row being absent.
   * A missing row is `null` in `values` and refuses only if a token asks for it; an unreadable table
   * is a fault, and a send must say so with the code rather than quietly behaving as if the operator
   * had never configured a signature.
   */
  error: string | null
}

export async function readOutreachSettings(supabase: SupabaseClient): Promise<SettingsRead> {
  const empty: SendTimeValues = { signature: null, optOut: null }
  try {
    const { data, error } = await supabase
      .from('outreach_settings').select('key, value').in('key', [SIGNATURE_KEY, OPT_OUT_KEY, FROM_NAME_KEY])
    if (error) return { values: empty, fromName: null, error: dbDetail(error) }
    const byKey = new Map((data ?? []).map(r => [(r as { key: string }).key, (r as { value: unknown }).value]))
    return {
      values: {
        signature: parseSignature(byKey.get(SIGNATURE_KEY)),
        optOut: parseOptOut(byKey.get(OPT_OUT_KEY)),
      },
      fromName: parseFromName(byKey.get(FROM_NAME_KEY)),
      // ⚠️ A ROW THAT IS PRESENT BUT MALFORMED PARSES TO `null` AND IS NOT AN ERROR HERE. Nothing
      // refuses on it any more: the signature is expanded into the editor, where its absence is
      // visible, and a missing display name falls back to the bare address.
      error: null,
    }
  } catch (err) {
    return { values: empty, fromName: null, error: dbDetail(err) }
  }
}

/**
 * The sender's display name alone, for the send path.
 * 🔴 IT CANNOT FAIL. Every failure — no row, a malformed row, an unreadable table, a thrown client —
 * returns `null`, which is the bare-address behaviour that shipped before this setting existed.
 * Refusing an email because a cosmetic header could not be decorated would be the wrong trade every
 * single time.
 */
export async function readFromName(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('outreach_settings').select('value').eq('key', FROM_NAME_KEY).maybeSingle()
    if (error) return null
    return parseFromName((data as { value?: unknown } | null)?.value)
  } catch { return null }
}
