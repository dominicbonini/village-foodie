// scripts/_lp1d-named.cjs — THE NAMED CODE CHANGES of Language Phase 1d Part 1 (Manage: Menu, Schedule, Settings). A
// MODULE, read by scripts/language-phase-1d.cjs.
//
// "F" is the AFTER code rendered with the BEFORE words (756ca09's pair + the as-moved overlay). Wherever F differs from
// BEFORE, the CODE changed the output — and every such view must be claimed by an entry below (or be named difference 1,
// an API refusal's added `code`/`params`, which scripts/_lp1d-checks.cjs proves per field):
//   { id, country: 'GB' | 'US' | 'both', what, views: (viewId) => bool, expect?: (beforeValue, viewId) => value }
// • With `expect`, the entry is PRECISE: F must equal expect(BEFORE) byte for byte.
// • Without `expect` (US only), the entry LISTS its views as changed by a named US behaviour; the harness writes each one
//   to scripts/fixtures/language-phase-1d-us-changed.txt and the US-words check still reads every one.
// View ids: `<area>/<GB|US>|…` (area = menu, schedule, settings, copy, api, smoke).
const { mapStrings, mapFields, clock12, applyNamed, pendingCardEntry } = require('./_lp2-named.cjs')
const countryOf = id => (id.split('/').slice(1).join('/').split('|')[0] === 'US' ? 'US' : 'GB')

const NAMED = [
  // ── SCHED-A ─────────────────────────────────────────────────────────────────────────────────────────────────
  { id: '1d-places-sept-sep', country: 'GB', agent: 'SCHED-A',
    what: 'Schedule › places (Add event picker, Tidy up, PlaceList / placeSubLine): a short month is "Sep", never Intl’s en-GB "Sept" — SchedulePlaces.shortDay now uses formatShortDate (Phase 2’s P2-sept-sep rule, reaching the places list). "Last: Sat 26 Sept" → "Last: Sat 26 Sep".',
    views: id => /^schedule\/GB\|(tab|places)\|/.test(id),
    expect: b => mapStrings(b, s => s.replace(/\bSept\b/g, 'Sep').replace(/\bSEPT\b/g, 'SEP')) },
  // ── MENU-B ──────────────────────────────────────────────────────────────────────────────────────────────────
  { id: '1d-cancel-row-sentence', country: 'both', agent: 'MENU-B',
    what: 'Setup wizard › settings review › "Allow customers to cancel orders": the prefix, the select and the suffix (three flex items) are ONE sentence now (settingsCopy.allowCancellation.sentence, rule 2), the select a rich tag inside one span; the select’s aria-label is manageMenuImport.settingsReview.cancelAria "How long before pickup customers can cancel" (was "Allow customers to cancel orders — Customers can cancel up to").',
    views: id => /^menu\/(GB|US)\|menuTab\|setup\|settings$/.test(id),
    expect: b => mapStrings(b, s => s
      .replace('<span class="text-xs text-slate-600">Customers can cancel up to</span><select aria-label="Allow customers to cancel orders — Customers can cancel up to" ', '<span class="text-xs text-slate-600">Customers can cancel up to <select aria-label="How long before pickup customers can cancel" ')
      .replace('</select><span class="text-xs text-slate-600">before their pickup ', '</select> before their pickup ')) },
  // ── US BEHAVIOUR (LISTED: each changes many small things in a view — every one of these views is in
  //    scripts/fixtures/language-phase-1d-us-changed.txt, and the US-words check reads them all) ───────────────────
  { id: '1d-us-address-style', country: 'US', agent: 'SCHED-A',
    what: 'US address style (country_settings.address_format = zip_state): "postcode" labels, sentences and example addresses are ZIP code / US examples (ICU selects on {style}); a US ZIP is not upper-cased (no `uppercase`, autoCapitalize="none").',
    views: id => /^schedule\/US\|(tab|places)\|/.test(id) || /^copy\/US\|addressPlaceholders\|addressPlaceholders\|/.test(id) },
  { id: '1d-us-hour-pickers', country: 'US', agent: 'SCHED-A',
    what: 'US 12-hour hour pickers in Add / Edit event and the import review: "12 AM … 11 PM" (were "00" … "23").',
    views: id => /^schedule\/US\|(timeSelect\||tab\|(add|edit|import)\|)/.test(id) },
  { id: '1d-us-paste-example', country: 'US', agent: 'SCHED-A',
    what: 'The paste-a-schedule example in the truck’s own date and clock: US "Saturday, June 14, … 5:00 PM – 9:00 PM" (GB unchanged "Saturday 14th June, …, 5pm-9pm").',
    views: id => /^copy\/US\|addressPlaceholders\|(pastePlaceholder|addressPlaceholders)\|/.test(id) || /^schedule\/US\|tab\|(add|import)\|/.test(id) },
  { id: '1d-us-dates-times', country: 'US', agent: 'SCHED-A / MENU-A / MENU-B',
    what: 'US dates and times on the truck’s clock where they were 24-hour / day-month: excluded-imports dates (formatNumericDate, MM/DD/YYYY), the setup wizard’s schedule read-back ("06/14/2026", "5:00 PM–9:00 PM"), DealsTab times ("11:30 AM – 2:00 PM").',
    views: id => /^menu\/US\|(deals\||menuTab\|setup\|schedule\|)/.test(id) || /^schedule\/US\|tab\|import\|/.test(id) },
  // ⚠️ RE-PINNED (Language Phase 1e): a Phase 1e US-only change reaches Part 1's Settings view — the App Store badge links a
  // US truck to the LOCALE-FREE listing (StoreBadges countryCode, lib/app-badges appStoreUrlFor). LISTED (US), like the
  // clock entry below; GB is unchanged (Part 1's GB views still equal BEFORE). Proven precisely by language-phase-1d2.
  { id: '1e-us-app-store-link', country: 'US', agent: 'CHROME + lead (Language Phase 1e)',
    what: 'Settings › the App Store badge: a US truck links https://apps.apple.com/app/id6803543106 (locale-free) instead of the UK storefront.',
    views: id => /^settings\/US\|[^|]+\|page$/.test(id) },
  { id: '1d-us-settings-clock', country: 'US', agent: 'SETTINGS',
    what: 'Settings on the US clock: the collection-time examples ("Customers can pick 18:00, 18:10, 18:20…" → "6:00 PM, 6:10 PM, 6:20 PM…") and the pre-order rule’s cutoff, via formatSlot; phoneErrorMessage gets the truck’s locale.',
    views: id => /^settings\/US\|[^|]+\|page$/.test(id) },
  // ── ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md) ─────────────────────
  //    Every Schedule tab view renders the pending card of e2 ("Market Square", an unconfirmed scraper event). Its
  //    layout and DOM order changed on purpose (type chooser below the main row, ONE action row, the desktop duplicate
  //    gone, the approveNeedsTimes sentence, location boxes hidden when private): STRUCTURAL, proven by
  //    scripts/_lp2-named.cjs pendingCardProof — the rest of the view byte-identical with the card cut out of both,
  //    the card's words BEFORE's apart from the named ones. Claims a view only when its BEFORE has a pending card.
  //    (US Schedule tab views stay LISTED by 1d-us-address-style, as before — a LISTED view is not byte-proven.)
  pendingCardEntry(id => /^schedule\/(GB|US)\|tab\|/.test(id)),
  // ── TODO: the agents' named code changes land here as they report them (SCHED-A: 12-hour hour pickers and US ZIP
  //    codes; SETTINGS / SCHED-B / MENU-A / MENU-B / API: any GB code change they list). Each one PRECISE where a
  //    transform can say it, LISTED (US only) where it cannot.
]

// ⚠️ RE-PINNED (pending-card fix, 16 Oct 2026, docs/private-event-approval-fix-report.md): through Phase 2's applyNamed,
// so the structural `pending-card-layout` entry (`prove`) is understood; every other view gets what the old loop gave.
function apply(id, before) {
  return applyNamed(NAMED, countryOf(id) === 'US', id, before)
}

module.exports = { NAMED, apply, countryOf, mapStrings, mapFields, clock12 }
