// lib/paperwork/share.ts — the organiser link's secret (paperwork-1, 4 November 2026). SERVER ONLY (node:crypto).
// 🔴 THE TOKEN IS THE WHOLE OF THE ACCESS to a truck's insurance and certificates, so it is made exactly as the private
// event link is (lib/private-events/token.ts): 24 random bytes from the CSPRNG = 192 bits (the floor is 128), base64url, 32
// characters. The table's CHECK accepts 22–64 base64url characters, so the floor is enforced by the database too.
// A link also EXPIRES (expires_at, at most 90 days) and can be TURNED OFF (revoked_at); paperwork_share_viewed() counts a
// view only while both hold.
import { randomBytes } from 'crypto'
import { looksLikeToken } from '@/lib/private-events/token'

export function newShareToken(): string {
  return randomBytes(24).toString('base64url')
}
/** Shaped like a token? Refuses junk before any database read; proves nothing about the token being real. */
export const looksLikeShareToken = looksLikeToken
/** The organiser page for a token. */
export const sharePageUrl = (base: string, token: string) => `${base.replace(/\/$/, '')}/docs/${encodeURIComponent(token)}`
