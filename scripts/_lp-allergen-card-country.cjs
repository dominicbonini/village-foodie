// scripts/_lp-allergen-card-country.cjs — THE NAMED CHANGE OF allergen-card-country (21 October 2026,
// docs/allergen-card-country-report.md), shared by the harnesses that capture API bodies (language-phase-1d, -1d2). A
// MODULE. A PRECISE transform of a BEFORE capture into what the code now answers; anything else that moved still fails.
//
//   countrySettingsCardOnlyField — a country-settings object gains `allergenCardOnlyAllowed` (the new column; true in GB
//   and the US, the migration's default) right after `allergenSet` (lib/country-settings.ts mapCountryRow's order).

function onJson(v, f) {
  if (typeof v === 'string' && (v[0] === '{' || v[0] === '[') && /[}\]]$/.test(v)) {
    try { const p = JSON.parse(v); if (JSON.stringify(p) === v) return JSON.stringify(f(p)) } catch { /* not JSON */ }
  }
  return null
}

function countrySettingsCardOnlyField(v) {
  if (typeof v === 'string') return onJson(v, countrySettingsCardOnlyField) ?? v
  if (Array.isArray(v)) return v.map(countrySettingsCardOnlyField)
  if (!v || typeof v !== 'object') return v
  const isCs = 'countryCode' in v && 'allergenSet' in v && !('allergenCardOnlyAllowed' in v)
  const out = {}
  for (const [k, x] of Object.entries(v)) {
    out[k] = countrySettingsCardOnlyField(x)
    if (isCs && k === 'allergenSet') out.allergenCardOnlyAllowed = true
  }
  return out
}

module.exports = { countrySettingsCardOnlyField }
