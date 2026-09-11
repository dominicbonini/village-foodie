// scripts/geo-validate.js
//
// Authoritative geocoding + coordinate validation for the discovery scraper.
//
// ── 🔴 WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────────
// Until 7 September 2026 the scraper's only geocoder was Gemini, asked to "find the Postcode, Latitude
// and Longitude" from its own knowledge, with NOTHING checked before the answer became a pin on a public
// map. docs/scraper-audit-report.md measured the result against the live table:
//   • 27 of 573 venues carry a FABRICATED coordinate whose decimals are a counting sequence
//     (52.1234, 0.1234 — the digits from the prompt's own FORMAT EXAMPLE).
//   • 13 venues sit at 55.378051,-3.435973 — the centroid of Great Britain, i.e. "somewhere in the UK".
//   • Median error against the model's OWN postcode is 0.76 km, but p90 is 7.1 km and the tail reaches
//     76.8 km. A whole class has the LONGITUDE SIGN FLIPPED near the meridian (Trumpington stored 15 km
//     west of Trumpington).
// And because the venues upsert uses `ignoreDuplicates`, every one of those is FROZEN: a re-run is
// ON CONFLICT DO NOTHING, so no future scrape ever corrects a wrong pin.
//
// ── ✅ THE FIX IN ONE LINE ───────────────────────────────────────────────────────────────────────────
// postcodes.io is free, keyless, authoritative and DETERMINISTIC. Gemini is a plausible-guess generator.
// So the model is demoted from geocoder to postcode SUGGESTER, and every coordinate that reaches the
// database comes from a real gazetteer — or the venue is stored with no coordinates at all.
//
// ⚠️ THIS MODULE NEVER WRITES TO THE DATABASE. It resolves and validates; the caller writes.
// ⚠️ It is a SEPARATE FILE so that every throw and every rejection can be EXERCISED BY A TEST that
//    imports the real code. `scripts/run-scraper.js` calls `main()` at import, so it can never be
//    imported by a test — which is exactly how a `throw` was once added INSIDE the geocoder's own catch
//    and still exited 0. Nothing in here is provable by reading it; it is provable by running it.

// ── THRESHOLDS. EVERY ONE DERIVED FROM THE LIVE TABLE, NOT CHOSEN. ───────────────────────────────────

/**
 * 🔴 THE BOX IS THE UNITED KINGDOM, NOT THE OPERATING AREA, AND THAT IS A MEASURED DECISION.
 *
 * The obvious move is a tight East Anglia box. It is WRONG. Excluding the 13 sentinel rows, the real
 * venues span lat 50.69→56.45 and lng −5.95→1.78, because trucks genuinely travel: Isle of Mull,
 * Isle of Wight Festival, Warwick, Silverstone, Lancaster, South Shields, Welwyn Garden City. 19 venues
 * sit outside East Anglia and they are real bookings. A tight box would reject them.
 *
 * So the box is deliberately a FLOOR, not a filter: it catches the fabrication class that lands in the
 * sea, in France, or with a sign flip big enough to leave the country. ⚠️ ZERO current venues violate
 * it — it would have caught none of today's bad rows on its own. The postcode-distance check below is
 * the sharp instrument; this one is the backstop.
 * Bounds are the UK's actual extent, padded: Scilly (49.9N) → Shetland (60.9N), Rockall-side (−8.6E) →
 * Lowestoft (1.8E).
 */
export const UK_BOUNDS = Object.freeze({ minLat: 49.8, maxLat: 61.0, minLng: -8.7, maxLng: 1.9 });

/**
 * 🔴 MAX DISTANCE A STORED COORDINATE MAY SIT FROM ITS OWN POSTCODE.
 *
 * Measured over all 409 venues that carry a postcode, against postcodes.io:
 *   p50 0.76 km · p75 2.22 km · p90 7.08 km · p95 10.98 km · p99 16.46 km · max 76.8 km
 *   >1km 42.7% · >2km 27.2% · >3km 19.0% · >5km 13.9% · >8km 9.0% · >10km 7.2% · >15km 2.6%
 *
 * 5 km is chosen because it sits well ABOVE the p75 — a rural postcode centroid legitimately sits one to
 * three kilometres from the pitch, and those must pass — while still catching EVERY failure the audit
 * named by name: Hinchingbrooke 76.8 km, Sudbourne 20.5 km, the Case is Altered 18.7 km, and the whole
 * sign-flip class at ~15 km (Trumpington ×3, Honeywell House, The Cavendish School).
 * ⚠️ A 10 km threshold would pass all five Trumpington/Cambridge sign-flips. That is why it is not 10.
 */
export const POSTCODE_MAX_KM = 5;

/**
 * Max distance a POSTCODE may sit from its village's own centroid before the POSTCODE is distrusted.
 * Looser than the above on purpose: this compares a postcode against a whole-village centroid, and a
 * large parish is legitimately several km across. It exists to catch the Great Paxton failure — Gemini
 * answered PE4 7EY, which is in PETERBOROUGH, 39 km from Great Paxton.
 */
export const VILLAGE_AGREE_MAX_KM = 10;

/**
 * 🔴 THE SENTINEL RULE IS DERIVED AT RUNTIME FROM THE DATA, NOT HARD-CODED TO ONE PAIR.
 *
 * Observed histogram of "how many venues share one exact coordinate pair": {2 venues: 13 pairs,
 * 3 venues: 1 pair, 13 venues: 1 pair}. The 2s are same-village duplicates (two rows for one pub) and
 * are legitimate. The single 3 is Wintringham/St Neots — the same place under two names, also
 * legitimate. The 13 is the Great Britain centroid, used as an "I don't know" answer.
 *
 * 5 sits in the empty gap between 3 and 13. The caller passes in the counts it reads from the live
 * table, so a NEW sentinel appearing at some other coordinate is caught without anyone editing this
 * file — which is the point.
 */
export const SENTINEL_MIN_ROWS = 5;

/**
 * 🔴 VILLAGE NAMES ARE NOT UNIQUE IN THE UK, AND THIS IS WHERE A 300-KILOMETRE MISLINK WOULD COME FROM.
 *
 * 🧪 Measured against postcodes.io: "Newton" returns 20 places of that exact name spread over 576 km;
 * "Barrow" 8 over 305 km; "Bradfield" 3 over 231 km; "Hadleigh" 2 over 59 km (Suffolk and Essex — both
 * plausible for these trucks). Taking the first result is a coin flip, and the first draft of this file
 * did exactly that: it resolved "Barrow" to Barrow in LANCASHIRE.
 *
 * So: when several places share the name, a postcode is required to choose between them, and the chosen
 * one must still agree with that postcode. With no postcode, an ambiguous village yields NO COORDINATE.
 * Places closer together than this are the same settlement recorded twice, not an ambiguity.
 */
export const AMBIGUITY_MAX_KM = 10;

/** UK postcode, tolerant of a missing space. Same shape the scraper already uses to read event notes. */
export const POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

const POSTCODES_IO = 'https://api.postcodes.io';

// ── PURE HELPERS ─────────────────────────────────────────────────────────────────────────────────────

/** Great-circle distance in kilometres. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLng = r(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Normalise a postcode for lookup: upper-case, single space before the inward code. */
export function normalisePostcode(pc) {
  const s = String(pc || '').toUpperCase().replace(/\s+/g, '');
  if (s.length < 5 || s.length > 7) return null;
  return `${s.slice(0, s.length - 3)} ${s.slice(-3)}`;
}

/** First UK postcode found in free text (the venue's hints / event notes), or null. */
export function extractPostcode(text) {
  const m = String(text || '').match(POSTCODE_RE);
  return m ? normalisePostcode(m[0]) : null;
}

/**
 * 🔴 THE PLACEHOLDER TEST, AND HOW IT AVOIDS REJECTING GENUINE NEARBY VALUES.
 *
 * The rule is NARROW BY DESIGN: the fractional digits must be a strictly consecutive run of length ≥ 4,
 * ascending or descending — 1234, 2345, 5678, 8765, 9876, 0123. Nothing else. Rejected alternatives:
 *   • "repeated two-digit block" (…9292, …1515) — flagged The Crown Inn and Engledow Drive, which sit
 *     0.6 km and 1.1 km from their own postcodes. Real values. Dropped.
 *   • "any of a hard-coded list of magic fractions" — would not survive the prompt example changing.
 *
 * 🔴 AND THE RULE IS NEVER THE SOLE GROUND FOR REJECTION. It fires only on an UNCORROBORATED
 * coordinate. Executed check on the live table: the 27 rows it flags have a MEDIAN error of 6.7 km
 * against their own postcode, against 0.7 km for the 546 it does not — a ten-fold separation, so the
 * rule genuinely selects wrong rows. But 4 of the 15 flagged rows that have a postcode are within 2 km
 * of it (Nayland 0.56 km, The railway arms 0.72 km, Wintringham Primary 1.21 km, Framsden 1.33 km) —
 * genuine coordinates that merely happen to land on counting digits. Because corroboration outranks the
 * pattern, those four are ACCEPTED. A coordinate this rule cannot reject is one a gazetteer agrees with.
 */
export function looksFabricated(value) {
  if (value === null || value === undefined) return false;
  const s = String(value);
  const dot = s.indexOf('.');
  if (dot < 0) return false;
  const frac = s.slice(dot + 1).replace(/0+$/, '');
  if (frac.length < 4) return false;
  let asc = true;
  let desc = true;
  for (let i = 1; i < frac.length; i++) {
    const d = Number(frac[i]) - Number(frac[i - 1]);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

/** Key a coordinate pair the same way the sentinel census does. */
export function pairKey(lat, lng) {
  return `${Number(lat)},${Number(lng)}`;
}

/**
 * Build the sentinel set from rows already in `venues`. Pass the result to validateCoordinate.
 * `rows` is [{ latitude, longitude }]. Returns a Set of pair keys used by ≥ SENTINEL_MIN_ROWS venues.
 */
export function buildSentinelSet(rows, minRows = SENTINEL_MIN_ROWS) {
  const counts = new Map();
  for (const r of rows || []) {
    if (r?.latitude === null || r?.latitude === undefined) continue;
    if (r?.longitude === null || r?.longitude === undefined) continue;
    const k = pairKey(r.latitude, r.longitude);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const out = new Set();
  for (const [k, n] of counts) if (n >= minRows) out.add(k);
  return out;
}

/**
 * The gauntlet. Returns { ok: true, lat, lng } or { ok: false, reason }.
 *
 * `corroboration` is the authoritative point this coordinate is being checked against, when one exists
 * ({ lat, lng, label }). A coordinate that agrees with a gazetteer within POSTCODE_MAX_KM is accepted
 * even if its digits look like a placeholder; a coordinate with NO corroboration must survive the
 * pattern test on its own.
 */
export function validateCoordinate(lat, lng, { corroboration = null, sentinels = null, maxKm = POSTCODE_MAX_KM } = {}) {
  // 1. TYPE. Gemini can return a string, a null, or "N/A"; `numeric` would take some of those silently.
  const nLat = typeof lat === 'number' ? lat : Number(lat);
  const nLng = typeof lng === 'number' ? lng : Number(lng);
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return { ok: false, reason: 'no coordinate supplied' };
  }
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    return { ok: false, reason: `not a finite number (lat=${JSON.stringify(lat)} lng=${JSON.stringify(lng)})` };
  }
  // 2. NULL ISLAND. 0,0 is in the Gulf of Guinea and is the classic "unset" value.
  if (nLat === 0 && nLng === 0) return { ok: false, reason: 'null island (0,0)' };

  // 3. BOUNDING BOX.
  if (nLat < UK_BOUNDS.minLat || nLat > UK_BOUNDS.maxLat || nLng < UK_BOUNDS.minLng || nLng > UK_BOUNDS.maxLng) {
    return { ok: false, reason: `outside the UK bounding box (${nLat},${nLng})` };
  }

  // 4. SENTINEL — a point already used by so many venues that it cannot be a real address.
  if (sentinels && sentinels.has(pairKey(nLat, nLng))) {
    return { ok: false, reason: `sentinel coordinate — already used by ≥${SENTINEL_MIN_ROWS} venues (${nLat},${nLng})` };
  }

  // 5. CORROBORATION vs PATTERN.
  if (corroboration && Number.isFinite(corroboration.lat) && Number.isFinite(corroboration.lng)) {
    const d = haversineKm(nLat, nLng, corroboration.lat, corroboration.lng);
    if (d > maxKm) {
      return { ok: false, reason: `${d.toFixed(1)}km from ${corroboration.label || 'its postcode'} (max ${maxKm}km)` };
    }
    // Agreed with a gazetteer → the digits do not matter. This is the false-positive escape hatch.
    return { ok: true, lat: nLat, lng: nLng, corroboratedKm: d };
  }

  if (looksFabricated(nLat) || looksFabricated(nLng)) {
    return { ok: false, reason: `placeholder decimals with nothing to corroborate them (${nLat},${nLng})` };
  }

  return { ok: true, lat: nLat, lng: nLng, corroboratedKm: null };
}

// ── AUTHORITATIVE LOOKUPS (postcodes.io) ─────────────────────────────────────────────────────────────
//
// 🔴 FAILURE BEHAVIOUR, STATED EXPLICITLY BECAUSE IT IS THE WHOLE POINT.
// Every lookup below distinguishes THREE outcomes and never conflates them:
//   { found: true,  … }                     — authoritative answer
//   { found: false, error: null }           — the service answered, and there is no such postcode/place
//   { found: false, error: '<message>' }    — the service could not be reached / returned a bad status
// The resolver treats `error` as UNKNOWN, not as "no". 🔴 A postcodes.io OUTAGE MUST NOT FALL THROUGH TO
// AN UNVALIDATED GEMINI GUESS — an unreachable gazetteer means we cannot check anything, which is
// exactly when a fabricated coordinate would sail through. On error the resolver stores NO coordinate.

async function getJson(url, fetchImpl, timeoutMs) {
  const f = fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await f(url, { signal: controller.signal });
    if (res.status === 404) return { status: 404, body: null, error: null };
    if (!res.ok) return { status: res.status, body: null, error: `HTTP ${res.status}` };
    return { status: res.status, body: await res.json(), error: null };
  } catch (err) {
    return { status: 0, body: null, error: err?.name === 'AbortError' ? 'timeout' : (err?.message || 'network error') };
  } finally {
    clearTimeout(t);
  }
}

/** Authoritative point for a full postcode. */
export async function lookupPostcode(postcode, { fetchImpl, timeoutMs = 10000 } = {}) {
  const pc = normalisePostcode(postcode);
  if (!pc) return { found: false, error: null, reason: 'not a postcode-shaped string' };
  const r = await getJson(`${POSTCODES_IO}/postcodes/${encodeURIComponent(pc)}`, fetchImpl, timeoutMs);
  if (r.error) return { found: false, error: r.error };
  const res = r.body?.result;
  if (!res || typeof res.latitude !== 'number') return { found: false, error: null, reason: 'no such postcode' };
  return {
    found: true,
    error: null,
    postcode: res.postcode,
    lat: res.latitude,
    lng: res.longitude,
    labels: [res.parish, res.admin_ward, res.admin_district, res.region].filter(Boolean),
  };
}

/**
 * Authoritative point for a place name (village / town). 🧪 Resolves 294 of the 314 distinct village
 * names in the live venues table — 93.6%. The 20 that fail are counties ("Norfolk", "Cambridgeshire"),
 * literal "Unknown"/null, or sub-development names ("Trumpington Meadows", "Willow Grange Farm").
 */
export async function lookupPlace(village, { fetchImpl, timeoutMs = 10000, anchor = null } = {}) {
  const q = String(village || '').trim();
  if (!q) return { found: false, error: null, reason: 'no village' };
  const r = await getJson(`${POSTCODES_IO}/places?q=${encodeURIComponent(q)}&limit=20`, fetchImpl, timeoutMs);
  if (r.error) return { found: false, error: r.error };
  const all = (r.body?.result || []).filter((p) => typeof p?.latitude === 'number');
  if (all.length === 0) return { found: false, error: null, reason: 'no such place' };

  // Only places whose name IS the village decide the question. A fuzzy neighbour ("Barrow upon Soar"
  // for "Barrow") is a different settlement, not a spelling of this one.
  const exact = all.filter((p) => String(p.name_1 || '').trim().toLowerCase() === q.toLowerCase());
  const pool = exact.length > 0 ? exact : (all.length === 1 ? all : []);
  if (pool.length === 0) {
    return { found: false, error: null, reason: `no exact match for "${q}" among ${all.length} nearby place names` };
  }

  if (pool.length === 1) {
    const h = pool[0];
    return { found: true, error: null, name: h.name_1, lat: h.latitude, lng: h.longitude, candidates: 1 };
  }

  // Several places of the same name. How far apart are they?
  let spread = 0;
  for (let i = 0; i < pool.length; i++) {
    for (let k = i + 1; k < pool.length; k++) {
      spread = Math.max(spread, haversineKm(pool[i].latitude, pool[i].longitude, pool[k].latitude, pool[k].longitude));
    }
  }
  if (spread <= AMBIGUITY_MAX_KM) {
    const h = pool[0];
    return { found: true, error: null, name: h.name_1, lat: h.latitude, lng: h.longitude, candidates: pool.length, spreadKm: spread };
  }

  // 🔴 GENUINELY AMBIGUOUS. Only a postcode may break the tie — and the caller still re-checks that the
  // winner agrees with that postcode, so an anchor cannot smuggle a wrong place through.
  if (anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng)) {
    const best = pool
      .map((p) => ({ p, d: haversineKm(p.latitude, p.longitude, anchor.lat, anchor.lng) }))
      .sort((a, b) => a.d - b.d)[0];
    return {
      found: true, error: null, name: best.p.name_1, lat: best.p.latitude, lng: best.p.longitude,
      candidates: pool.length, spreadKm: spread, chosenByAnchorKm: best.d,
    };
  }
  return {
    found: false, error: null, ambiguous: true, candidates: pool.length, spreadKm: spread,
    reason: `"${q}" names ${pool.length} different places up to ${spread.toFixed(0)}km apart and there is no postcode to choose between them`,
  };
}

/**
 * 🔴 THE RESOLVER. postcodes.io FIRST, Gemini LAST, and never an unchecked coordinate.
 *
 * Order, and why:
 *   1. POSTCODE from the venue's own hints (the event notes — the AI prompt already asks for postcodes
 *      to be put there), else the postcode Gemini SUGGESTED. Gemini is allowed to propose a postcode
 *      because a postcode is CHECKABLE; it is not allowed to propose a coordinate, which is not.
 *   2. VILLAGE via /places — authoritative, and the village comes from the scraper's own queue, not
 *      from the model.
 *   3. If both exist and DISAGREE by more than VILLAGE_AGREE_MAX_KM, the postcode is wrong for this
 *      village (the Great Paxton → Peterborough failure) → use the village point, keep no postcode.
 *   4. Gemini's own lat/lng: LAST RESORT, only when neither lookup produced a point AND the gazetteer
 *      answered (no outage), and only if it survives the full gauntlet with no corroboration.
 *   5. Otherwise: NO COORDINATE. The caller stores the venue with nulls and says so out loud.
 */
export async function resolveCoordinates({
  name,
  village,
  hints = '',
  aiPostcode = null,
  aiLat = null,
  aiLng = null,
  sentinels = null,
  fetchImpl,
  timeoutMs = 10000,
} = {}) {
  const trail = [];
  const hintPc = extractPostcode(hints);
  const candidatePc = hintPc || normalisePostcode(aiPostcode);
  const pcOrigin = hintPc ? 'hints' : (aiPostcode ? 'ai-suggested' : null);

  let pc = null;
  let lookupFailed = false;

  if (candidatePc) {
    const r = await lookupPostcode(candidatePc, { fetchImpl, timeoutMs });
    if (r.error) { lookupFailed = true; trail.push(`postcode ${candidatePc}: LOOKUP FAILED (${r.error})`); }
    else if (!r.found) trail.push(`postcode ${candidatePc} (${pcOrigin}): not a real postcode`);
    else { pc = r; trail.push(`postcode ${r.postcode} (${pcOrigin}) → ${r.lat},${r.lng}`); }
  } else {
    trail.push('no postcode available');
  }

  // The postcode (when one resolved) is the ONLY thing allowed to disambiguate a repeated village name.
  const place = await lookupPlace(village, { fetchImpl, timeoutMs, anchor: pc ? { lat: pc.lat, lng: pc.lng } : null });
  if (place.error) { lookupFailed = true; trail.push(`place "${village}": LOOKUP FAILED (${place.error})`); }
  else if (!place.found) trail.push(`place "${village}": ${place.reason}`);
  else trail.push(
    `place "${place.name}" → ${place.lat},${place.lng}` +
    (place.candidates > 1
      ? ` (${place.candidates} same-named places ${place.spreadKm?.toFixed(0)}km apart` +
        (place.chosenByAnchorKm !== undefined ? `; chosen as the one ${place.chosenByAnchorKm.toFixed(1)}km from the postcode)` : `; treated as one settlement)`)
      : '')
  );

  // 3. Cross-check the postcode against the village.
  if (pc && place.found) {
    const d = haversineKm(pc.lat, pc.lng, place.lat, place.lng);
    if (d > VILLAGE_AGREE_MAX_KM) {
      trail.push(`postcode is ${d.toFixed(1)}km from "${village}" (max ${VILLAGE_AGREE_MAX_KM}km) → postcode DISTRUSTED`);
      pc = null;
    } else {
      trail.push(`postcode agrees with village (${d.toFixed(1)}km)`);
    }
  }

  // 1. Best available authoritative point: the postcode (precise) over the village (coarse).
  if (pc) {
    const v = validateCoordinate(pc.lat, pc.lng, { sentinels });
    if (v.ok) return { ok: true, latitude: v.lat, longitude: v.lng, postcode: pc.postcode, source: 'postcodes.io/postcodes', trail };
    trail.push(`postcode point rejected: ${v.reason}`);
  }
  if (place.found) {
    const v = validateCoordinate(place.lat, place.lng, { sentinels });
    if (v.ok) {
      return {
        ok: true, latitude: v.lat, longitude: v.lng,
        // Keep a postcode only if it survived the village cross-check above.
        postcode: pc ? pc.postcode : null,
        source: 'postcodes.io/places', trail,
      };
    }
    trail.push(`place point rejected: ${v.reason}`);
  }

  // 4. Gemini's coordinate — last, and only when the gazetteer was actually reachable.
  if (lookupFailed) {
    trail.push('🔴 gazetteer unreachable — refusing to fall through to an unvalidated model guess');
    return { ok: false, latitude: null, longitude: null, postcode: null, source: null, reason: 'gazetteer lookup failed', trail };
  }
  if (aiLat !== null && aiLat !== undefined && aiLng !== null && aiLng !== undefined) {
    const v = validateCoordinate(aiLat, aiLng, { sentinels });
    if (v.ok) {
      trail.push('falling back to the model coordinate (passed every check, uncorroborated)');
      return { ok: true, latitude: v.lat, longitude: v.lng, postcode: null, source: 'gemini-fallback', trail };
    }
    trail.push(`model coordinate rejected: ${v.reason}`);
  }

  return { ok: false, latitude: null, longitude: null, postcode: null, source: null, reason: trail[trail.length - 1] || 'no usable location', trail };
}

// ── LOUD-FAILURE HELPERS ─────────────────────────────────────────────────────────────────────────────
//
// 🔴 These exist so the throw itself is testable. run-scraper.js calls main() at import, so a test can
// never import it; putting the throw in a helper means the code that actually runs in production is the
// same code the test exercises. Each is called from an un-caught position — see the report for the
// try/catch trace proving nothing swallows them.

/**
 * A Sheet read that fails returns [] today, so a dead credential looks like a quiet day and the run
 * exits 0. Four empty tabs is not a quiet day: the Trucks tab is the site list and the Events tab is the
 * dedup set, and both being empty means the scrape has no input at all.
 */
export function assertSheetTabsLoaded(tabs) {
  const empty = Object.entries(tabs).filter(([, rows]) => !Array.isArray(rows) || rows.length === 0);
  if (empty.length === Object.keys(tabs).length) {
    throw new Error(
      `Every Google Sheet tab came back empty (${Object.keys(tabs).join(', ')}). This is a credential, ` +
      `share or SPREADSHEET_ID failure, not an empty schedule — refusing to report success.`
    );
  }
  return empty.map(([n]) => n);
}

/** A scrape with no sites is a configuration failure, not a no-op. */
export function assertSitesToScrape(count) {
  if (!count) {
    throw new Error('No sites to scrape — the Trucks and Venues tabs yielded no URL and no instructions.');
  }
}

/**
 * Every site failing is systemic (revoked Gemini key, no network, Chrome broken). One site failing is
 * Tuesday. The threshold is "not a single site produced an extraction", which is the shape a dead
 * credential makes and which no ordinary bad day makes.
 */
export function assertSomeSiteSucceeded(attempted, succeeded, failures) {
  if (attempted > 0 && succeeded === 0) {
    throw new Error(
      `All ${attempted} site(s) failed to produce an extraction — systemic failure, not a quiet day.\n` +
      failures.slice(0, 10).map((f) => `   • ${f}`).join('\n')
    );
  }
}

/** The inbound POST's status was never checked: a 401 from a rotated secret was logged as success. */
export function assertInboundOk(status, bodyText) {
  if (status < 200 || status >= 300) {
    throw new Error(
      `POST /api/inbound-schedule returned HTTP ${status} — the schedule was NOT delivered. ` +
      `${status === 401 ? 'INBOUND_SCHEDULE_SECRET is wrong or rotated on one side only. ' : ''}` +
      `Body: ${String(bodyText || '').slice(0, 200)}`
    );
  }
}

/** Collected per-write failures become one thrown error rather than a console.warn nobody reads. */
export function assertNoWriteFailures(label, failures) {
  if (failures && failures.length > 0) {
    throw new Error(
      `${failures.length} ${label} write(s) failed:\n` + failures.map((f) => `   • ${f}`).join('\n')
    );
  }
}

// ── 🔴 THE MIRROR ASSERTION: A VILLAGE THAT IS JUST THE VENUE NAME AGAIN ────────────────────────────
// Two extraction prompts used to demand a village with no way to decline, so when the source text had
// none the model answered with the nearest string it had — the venue name. 🧪 That produced 76 rows in
// `discovery_events` whose village is its own venue_name (71 future-dated, 62 of them from the manual
// prompt). The prompts now permit `""`, and this is what proves it stayed fixed.
//
// 🔴 NO THRESHOLD, AND NONE IS WANTED. The existing 76 are historical and will not repair themselves;
// what must never happen again is a NEW one. One is too many, so the test is `> 0` on this run's rows.
// (The ratio assertion — this run's empty-village share against a 14-day baseline — is deliberately NOT
// here: it needs a post-change run to calibrate against, and a guessed threshold fires on noise.)
//
// 🔴 IT SEES ONLY WHAT THIS RUN WROTE. Called with the rows the run is about to post; an assertion over
// the whole table would throw on the existing 76 every night and be switched off within a week.
//
// ⚠️ AN EMPTY VILLAGE IS NOT A MATCH, AND THAT IS THE WHOLE POINT OF THE CHANGE. `norm('')` is `''` on
// both sides, so a naive equality test would flag every honestly-blank row — the exact rows the prompt
// edit is meant to produce — and turn the fix into a permanently red run. The length check is load-bearing.
/**
 * @param {Array<{venue_name?: string|null, village?: string|null}>} rows  rows THIS RUN is writing
 * @param {string} label  what to call them in the failure message
 * @throws if any row's village, normalised, equals its venue name
 */
export function assertNoInventedVillages(rows, label = 'Pass A') {
  // Lowercase, strip every non-alphanumeric — the same comparison the diagnosis query uses, so a
  // difference of punctuation or case cannot let one through ("Church View" vs "church-view").
  const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const bad = (rows || []).filter((r) => {
    const v = norm(r && r.village);
    return v.length > 0 && v === norm(r && r.venue_name);
  });
  if (bad.length > 0) {
    throw new Error(
      `${bad.length} ${label} row(s) have a village that is just the venue name again — the ` +
      `invented-village behaviour is back. Check the VILLAGE rule in the extraction prompts:\n` +
      bad.map((r) => `   • "${r.venue_name}" [${r.village}]`).join('\n')
    );
  }
}
