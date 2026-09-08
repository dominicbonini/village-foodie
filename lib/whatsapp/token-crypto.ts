// lib/whatsapp/token-crypto.ts
// ── AES-256-GCM FOR THE PER-TRUCK META BUSINESS TOKEN. SERVER ONLY. ─────────────────────────────────
//
// 🔴 WHAT THIS DOES NOT DO, STATED FIRST SO IT IS NOT OVERSOLD. App-level encryption is NOT protection
// against a compromised process. Anything that can run our code can read `WHATSAPP_TOKEN_ENCRYPTION_KEY`
// out of the environment and decrypt every row. What it raises the bar on is DUMPS, BACKUPS AND EXPORTS
// — a stolen .sql dump, a copied backup, a support export, a screenshot of a table view, a mis-scoped
// read. ⚠️ DO NOT DESCRIBE THIS AS "encrypted at rest" AND STOP; that phrasing implies a guarantee this
// does not give. The FIRST control is that the ciphertext lives in its own table that no `select('*')`
// route reads (see the migration header). This is the second layer.
//
// 🔴 THIS MODULE MUST NEVER BE IMPORTED BY A CLIENT COMPONENT. It reads a server-only secret. The state
// machine (connection-state.ts) is the client-importable half and takes a BOOLEAN, never a token — that
// split is the whole design. If you find yourself importing this from anything under a 'use client'
// file, the reduction to a boolean has been skipped and the token is about to reach a browser.
//
// ⚠️ NODE RUNTIME. `node:crypto` is not available on the edge runtime; any route importing this must not
// declare `export const runtime = 'edge'`.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** 🔴 SERVER-ONLY. NEVER `NEXT_PUBLIC_`. A NEXT_PUBLIC_ prefix is inlined into the client bundle at
 *  build time, which would ship the decryption key to every browser. The name is deliberately not
 *  prefixed so that mistake cannot be made by copying this line. */
const KEY_ENV = 'WHATSAPP_TOKEN_ENCRYPTION_KEY'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12   // 96-bit nonce, the GCM standard
const KEY_BYTES = 32  // 256-bit

/**
 * The key, as bytes. Accepts base64 (44 chars) or hex (64 chars) so whichever a generator emits works.
 * 🔴 THROWS RATHER THAN DEFAULTING. A missing or malformed key must stop the write, not silently store
 * something unreadable — an "encrypted" column nobody can decrypt is worse than a refused write, because
 * the failure surfaces months later at the moment a truck needs to send.
 */
function readKey(): Buffer {
  const raw = process.env[KEY_ENV]
  if (!raw || !raw.trim()) {
    throw new Error(`[token-crypto] ${KEY_ENV} is not set. Refusing to encrypt or decrypt.`)
  }
  const t = raw.trim()
  const key = /^[0-9a-fA-F]{64}$/.test(t) ? Buffer.from(t, 'hex') : Buffer.from(t, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `[token-crypto] ${KEY_ENV} decoded to ${key.length} bytes; AES-256-GCM needs ${KEY_BYTES}. ` +
      `Provide 32 bytes as base64 or hex.`,
    )
  }
  return key
}

/** True when a usable key is configured. Lets a caller degrade honestly instead of throwing. */
export function encryptionKeyConfigured(): boolean {
  try { readKey(); return true } catch { return false }
}

/**
 * Encrypt a business token for storage.
 * Output format: `v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>` — a self-describing single string, so the
 * column is one text field and a future v2 (a rotated scheme) is distinguishable without a schema change.
 */
export function encryptToken(plaintext: string): string {
  const key = readKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`
}

/**
 * Decrypt a stored token. Throws on a malformed payload or a failed auth tag — GCM authenticates, so a
 * tampered or wrong-key ciphertext fails loudly rather than returning rubbish.
 * 🔴 THE RETURN VALUE IS A LIVE CREDENTIAL. Never log it, never put it in an error message, never return
 * it from a route that a browser can reach.
 */
export function decryptToken(payload: string): string {
  const key = readKey()
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('[token-crypto] unrecognised ciphertext format')
  }
  const [, ivB64, tagB64, ctB64] = parts
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
}

// ── 🔴 KEY ROTATION — READ THIS BEFORE ASSUMING THERE IS A PATH ────────────────────────────────────
// THERE IS NO ROTATION MECHANISM IN THIS MODULE TODAY, AND NONE ANYWHERE ELSE IN THE REPO. Said plainly
// rather than implied: changing WHATSAPP_TOKEN_ENCRYPTION_KEY right now makes every stored ciphertext
// undecryptable, and the only recovery is to re-onboard every truck through Embedded Signup.
//
// What a rotation would require, when it is wanted:
//   1. A second env var (WHATSAPP_TOKEN_ENCRYPTION_KEY_PREVIOUS) read by `decryptToken` as a fallback
//      when the v1 tag fails under the current key.
//   2. A re-encrypt pass over whatsapp_connections, writing each row back under the new key.
//   3. Removing the previous key once the pass is complete and verified.
// The `v1.` prefix above exists so that pass can tell schemes apart.
//
// ⚠️ THE MITIGATING FACT IS WEAKER THAN IT WAS (4 September 2026). This said "tokens expire after 60
// days, so the population re-onboards on its own cadence". That 60 came from the retired v2-era
// configuration's template; the current lifetime is whatever Meta's `expires_in` reports and HAS NOT
// BEEN OBSERVED. So the self-healing window is of UNKNOWN length — it may be shorter, it may be
// longer. 🔴 EITHER WAY IT WAS NEVER A SUBSTITUTE FOR ROTATION: a key compromise needs rotation, and
// "they will all re-onboard eventually" is not an incident response.
