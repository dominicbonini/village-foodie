// lib/venue-signature.ts
// Venue signature matching for the scraped-event approval bridge (/api/inbound-schedule).
// These are BYTE-FOR-BYTE mirrors of scripts/run-scraper.js normalizeName (:48-57) and
// isFuzzyMatch (:60-86) so the bridge dedup matches incoming scrapes the SAME way the scraper
// dedups against the sheet. Keep them in sync if run-scraper.js's versions change.

/** Lowercase, &→and, strip punctuation + filler words, chop trailing 's', smash to one token. */
export function normalizeVenue(name: string): string {
  if (!name) return ''
  return name.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')                                  // remove punctuation, keep spaces
    .replace(/\b(the|street|st|food|ltd|co|company|and)\b/g, '')  // strip filler words
    .split(/\s+/)                                                 // split on spaces
    .map(word => word.replace(/s$/, ''))                          // chop trailing 's'
    .join('')                                                     // smash to one string
}

/** True if equal or within Levenshtein distance 1 (one substitution, insertion, or deletion). */
export function venuesFuzzyMatch(str1: string, str2: string): boolean {
  if (!str1 || !str2) return false
  if (str1 === str2) return true
  if (Math.abs(str1.length - str2.length) > 1) return false

  let diff = 0
  if (str1.length === str2.length) {
    for (let i = 0; i < str1.length; i++) {
      if (str1[i] !== str2[i]) diff++
    }
    return diff <= 1
  }

  const longStr = str1.length > str2.length ? str1 : str2
  const shortStr = str1.length > str2.length ? str2 : str1
  let i = 0, j = 0
  while (i < longStr.length && j < shortStr.length) {
    if (longStr[i] !== shortStr[j]) {
      diff++
      if (diff > 1) return false
      i++
    } else {
      i++; j++
    }
  }
  return true
}
