// lib/till/signing.ts — 🔴 till-pack-4 (25 November 2026, docs/till-pack-4-report.md): THE CLOSES' SIGNATURE (law change 11,
// docs/till-law-1-report.md §3).
//
// SERVER ONLY. Every close is signed with an Ed25519 key held OUTSIDE the database: the server-only environment variable TILL_SIGNING_KEY
// (the private key, PKCS#8 DER, base64 — made by `node scripts/till-signing-keygen.cjs`, which prints it to the terminal only). The
// database holds only the PUBLIC key and its id (till_settings.signing_public_key / signing_key_id), so a copy of the database alone can
// neither forge nor re-sign a close.
//
// WHAT IS SIGNED: the close's chain hash — the 64 lowercase hex characters of till_chain.hash for the close entry, as UTF-8 bytes. That
// hash covers the close's figures AND (through prev_hash) every entry before it, so one signature vouches for the whole chain to that point.
// KEY ID: the first 16 hex characters of sha256(the public key's SPKI DER).
//
// NO KEY SET → the close is written UNSIGNED (till_closes.signing_at_commit 'unsigned', no till_close_signatures row) and the next run with
// the key signs every close still unsigned. Nothing here sends a hash, a key or a signature anywhere.
import 'server-only'
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto'

export interface SigningKey { privateKey: KeyObject; publicKeyB64: string; keyId: string }

/** The key id of a public key (SPKI DER, base64): sha256, first 16 hex characters. */
export function keyIdOf(publicKeyB64: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('hex').slice(0, 16)
}

/** TILL_SIGNING_KEY, parsed — or null when it is not set. A value that is set but is not an Ed25519 private key THROWS (a typo must not
 *  silently leave the closes unsigned). */
export function loadSigningKey(raw: string | undefined | null = process.env.TILL_SIGNING_KEY): SigningKey | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  const privateKey = createPrivateKey({ key: Buffer.from(v, 'base64'), format: 'der', type: 'pkcs8' })
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('TILL_SIGNING_KEY is not an Ed25519 private key')
  const publicKeyB64 = (createPublicKey(privateKey).export({ format: 'der', type: 'spki' }) as Buffer).toString('base64')
  return { privateKey, publicKeyB64, keyId: keyIdOf(publicKeyB64) }
}

/** The signature (base64, 64 bytes) of a close's chain hash. */
export function signHash(key: SigningKey, hashHex: string): string {
  if (!/^[0-9a-f]{64}$/.test(hashHex)) throw new Error('not a chain hash')
  return sign(null, Buffer.from(hashHex, 'utf8'), key.privateKey).toString('base64')
}

/** Does `signatureB64` sign `hashHex` under the public key `publicKeyB64`? (What an inspector runs, with the public key from the docs.) */
export function verifySignature(publicKeyB64: string, hashHex: string, signatureB64: string): boolean {
  try {
    const pub = createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' })
    return verify(null, Buffer.from(hashHex, 'utf8'), pub, Buffer.from(signatureB64, 'base64'))
  } catch { return false }
}
