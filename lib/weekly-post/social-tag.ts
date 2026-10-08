// lib/weekly-post/social-tag.ts — a location's social media handle, normalised in ONE place.
//
// ⚠️ PURE AND BROWSER-SAFE. No `fs`, no Supabase, no `fetch` — the screen imports it to show the
// operator what will be stored and the route imports it to decide what IS stored, so the two cannot
// disagree about what "@buresmusicfest" means.
//
// 🔴 ONE NORMALISER, NOT A CHECK CONSTRAINT BESIDE IT. The database column is plain nullable text and
// deliberately carries no `check`: a constraint would be a second rule that could drift from this one,
// and the one that produced the better error message would not be the one that fired. See the column
// comment in supabase/migrations/20261020_poster_picture_tag_captions.sql.

/** The brief's ceiling. ⚠️ Counted in characters, not bytes — a handle is a handle. */
export const MAX_SOCIAL_TAG = 60

export type TagResult =
  | { ok: true; tag: string | null }
  | { ok: false; error: string }

/**
 * Normalise a tag, or refuse it with a plain sentence.
 *
 * The rules, in the brief's own order: trim it, add a leading `@` if missing, no spaces, at most 60
 * characters.
 *
 * ⚠️ AN EMPTY INPUT IS `{ ok: true, tag: null }` AND NOT AN ERROR. Clearing the field is how a truck
 * removes a tag, and a refusal there would make "I do not want one" impossible to express.
 * ⛔ THE `@` IS ADDED, NOT REQUIRED. An operator who types `buresmusicfest` means the same thing as one
 * who types `@buresmusicfest`, and refusing the first would be pedantry about a character we can
 * supply. ⚠️ A SECOND `@` IS NOT ADDED — the test is on the normalised string, not on the raw one.
 * ⛔ WHITESPACE IS REFUSED RATHER THAN STRIPPED. "@bures music fest" is not a handle with the spaces
 * taken out; it is somebody typing a NAME into a handle field, and silently turning it into
 * "@buresmusicfest" would put a handle that may not exist into a published caption.
 */
export function normaliseSocialTag(raw: unknown): TagResult {
  const s = String(raw ?? '').trim()
  if (!s) return { ok: true, tag: null }

  /* ⚠️ CHECKED BEFORE THE `@` IS ADDED, so the message names what the operator typed. Any Unicode
   * whitespace, not just the space bar — a pasted handle can carry a non-breaking space. */
  if (/\s/.test(s)) {
    return { ok: false, error: 'A tag can’t contain spaces. Use the handle on its own, like @buresmusicfest.' }
  }
  /* ⛔ ONE `@`, AND IT IS AT THE FRONT. "@bures@fest" is not a handle, and stripping the second would
   * be the same silent rewrite the whitespace rule refuses. */
  const body = s.startsWith('@') ? s.slice(1) : s
  if (body.includes('@')) {
    return { ok: false, error: 'A tag can only have one @, at the start. Try @buresmusicfest.' }
  }
  if (!body) {
    return { ok: false, error: 'That’s just an @ — add the handle after it, like @buresmusicfest.' }
  }

  const tag = `@${body}`
  /* ⚠️ MEASURED ON THE STORED VALUE, `@` INCLUDED, because that is what the column holds and what a
   * caption prints. Measuring the body would let a 60-character body become a 61-character tag. */
  if (tag.length > MAX_SOCIAL_TAG) {
    return { ok: false, error: `That tag is ${tag.length} characters. The limit is ${MAX_SOCIAL_TAG}.` }
  }
  return { ok: true, tag }
}
