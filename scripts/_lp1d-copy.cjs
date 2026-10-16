// scripts/_lp1d-copy.cjs — Language Phase 1d, area `copy`: what the in-scope COPY MODULES hand a screen, and
// lib/trade-area.ts's answers — per country.
//   • every export of lib/copy/{serviceSettings,offlineProtection,stock,addressPlaceholders,scheduleVerify},
//     lib/settings-copy, lib/kitchen-capacity, lib/private-events/copy and lib/event-types/types (the name chips): a
//     string as it is, an object/array as JSON (functions shown as "[function]"), a function called with the sample
//     arguments in CALLS (a function with no sample is listed as "[function]" only).
//   • lib/trade-area.ts checkTradeArea / checkSignupCountry on every refusal and a success, GB and US facts.
// 🔴 AT 756ca09 THESE ARE CONSTANTS, the same for GB and US. Where this tree turns one into words read from the message
// files (a function of the locale, or gone from the module), ADAPT says how to read the same words on the new code,
// in the country's locale — so F proves the words moved unchanged and A shows the US words. An export that is gone and
// has no adapter fails ("still rendered").
const MODULES = {
  serviceSettings: 'lib/copy/serviceSettings',
  offlineProtection: 'lib/copy/offlineProtection',
  stock: 'lib/copy/stock',
  addressPlaceholders: 'lib/copy/addressPlaceholders',
  scheduleVerify: 'lib/copy/scheduleVerify',
  settingsCopy: 'lib/settings-copy',
  kitchenCapacity: 'lib/kitchen-capacity',
  privateEvents: 'lib/private-events/copy',
  eventTypes: 'lib/event-types/types',
}
const GBP = { currency: 'GBP', locale: 'en-GB' }, USD = { currency: 'USD', locale: 'en-US' }
/** Sample arguments per function (each a list of argument lists). `cc` is the country, for a money/locale argument. */
const CALLS = {
  offlineProtection: { offlineAutoRejectLabel: () => [[5], [15], [30]] },
  serviceSettings: {
    priceModeChoices: cc => [[cc === 'US' ? '$' : '£']], priceRoundingChoices: cc => [[cc === 'US' ? '$' : '£']], ownPriceCount: () => [[0], [1], [3]],
    eventPriceOwnNote: cc => [[9.5, 'Festival', cc === 'US' ? USD : GBP], [9.5, null, cc === 'US' ? USD : GBP]],
  },
  addressPlaceholders: { addressPlaceholders: () => [['postcode'], ['zip_state'], [null]], pastePlaceholder: () => [['postcode'], ['zip_state'], [null]] },
  kitchenCapacity: {
    categoryNeedsPrepConfig: () => [[{ prep_secs: 0, batch_size: 0 }], [{ prep_secs: 300, batch_size: 4 }]],
    kitchenCapacityNeedsPrepWarning: () => [[6, [{ prep_secs: 0, batch_size: 0, counts_toward_capacity: true }]], [null, []]],
    formatPrepSecs: () => [[0], [30], [60], [90], [480], [3600], [null]], prepTimeOptionsFor: () => [[null], [480], [95]],
  },
  eventTypes: { colourFor: () => [['amber'], [null]] },
}
/** How the NEW code gives the same words, when an export moved: { 'module.export': (mod, x) => value } where
 *  x = { locale, cc, ts, tr(ns) → translator, B (every bundled module) }. Each entry names where the words went; F
 *  (756ca09's words + as-moved) must give BEFORE's value exactly. A function export is keyed 'module.export|i' (its
 *  i-th sample call). */
// PRIVATE_CHIP, LINK_QR_BUTTON, PRIVATE_NEEDS_TIMES and PRIVATE_PREVIEW_NOTE were DELETED by SCHED-B's follow-up (dead
// exports once every reader used the namespace) — named 1d-copy-dead-exports; their words are these keys.
const PE = { PRIVATE_CHIP: 'chip', LINK_QR_BUTTON: 'link.button', PRIVATE_NEEDS_TIMES: 'form.needsTimes', PRIVATE_PREVIEW_NOTE: 'form.previewNote', CARD_BLURB: 'cards.blurb', CARD_FOOTER: 'cards.footer', CARD_SCAN: 'cards.scan', LINK_COPIED: 'link.copied', LINK_COPY: 'link.copy',
  LINK_OFF_NOTICE: 'link.offNotice', LINK_QR_TITLE: 'link.title', MAX_ONLY_TITLE: 'grid.maxOnly', NEW_LINK: 'link.newLink', NEW_LINK_CONFIRM: 'link.newLinkConfirm',
  ORDERING_SECTION: 'grid.orderingSection', PRIVATE_COLUMN_TITLE: 'grid.columnTitle', PRIVATE_LINK_PROMISE: 'form.linkPromise', PRIVATE_LINK_ROW_LABEL: 'grid.linkRowLabel',
  PRIVATE_NAME_HELP: 'form.nameHelp', PRIVATE_NAME_LABEL: 'form.nameLabel', PRIVATE_NAME_PLACEHOLDER: 'form.namePlaceholder', PRIVATE_TICK_HELP: 'form.help',
  QR_DOWNLOAD: 'link.qrDownload', TABLE_CARDS: 'link.tableCards' }
const STYLES = ['postcode', 'zip_state', null]
const ADAPT = {
  // ⚠️ RE-PINNED (Language Phase 1d Part 2): lib/settings-copy.ts CONNECTING_STRIPE_NOT_A_COMMITMENT was DELETED by the
  // PAYMENTS agent — its only reader (Manage › Payments) reads `managePayments.trialNote`, which is that sentence AS MOVED
  // (its curly-apostrophe fix is a named Part 2 GB fix, set back by the as-moved overlay under every frozen catalogue).
  'settingsCopy.CONNECTING_STRIPE_NOT_A_COMMITMENT': (M, x) => x.tr('managePayments')('trialNote'),
  // lib/private-events/copy.ts → the `privateEvents` namespace (SCHED-B)
  ...Object.fromEntries(Object.entries(PE).map(([e, k]) => [`privateEvents.${e}`, (M, x) => x.tr('privateEvents')(k)])),
  // lib/copy/scheduleVerify.ts → `manageScheduleVerify`, one key per code (SCHED-A)
  'scheduleVerify.URL_MALFORMED_MSG': (M, x) => x.tr('manageScheduleVerify')('malformed'),
  'scheduleVerify.BLOCKED_DOMAIN_MSG': (M, x) => x.tr('manageScheduleVerify')('blockedDomain'),
  'scheduleVerify.VERIFY_MESSAGES': (M, x) => Object.fromEntries(M.VERIFY_CODES.map(c => [c, x.tr('manageScheduleVerify')(c)])),
  // lib/copy/addressPlaceholders.ts → `manageScheduleEvent.{address,area}Placeholder` and `manageScheduleImport.pastePlaceholder`,
  // ICU selects on {style}; the paste example's date and times from pasteExampleValues (SCHED-A)
  ...Object.fromEntries(STYLES.flatMap((st, i) => [
    [`addressPlaceholders.pastePlaceholder|${i}`, (M, x) => x.tr('manageScheduleImport')('pastePlaceholder', M.pasteExampleValues(st, x.ts))],
    [`addressPlaceholders.addressPlaceholders|${i}`, (M, x) => {
      const style = M.addressStyleOf(st), ev = x.tr('manageScheduleEvent')
      const paste = x.tr('manageScheduleImport')('pastePlaceholder', { ...M.pasteExampleValues(st, x.ts), date: '\u0000' })
      return { address: ev('addressPlaceholder', { style }), area: ev('areaPlaceholder', { style }), pasteVenue: paste.slice(paste.indexOf('\u0000, ') + 3) }
    }],
  ])),
}
/** An export that STAYED but now holds ids, read as words: (value, x) → value. */
const READ_AS_WORDS = {
  // lib/settings-copy.ts: SETTING_COPY.allowCancellation's two halves (cancelPrefix / cancelSuffix) were DELETED (SETTINGS /
  // SCHED-B; named 1d-copy-dead-exports) — the row is ONE sentence now, `settingsCopy.allowCancellation.sentence` with the
  // select as a tag (MENU-B's 1d-cancel-row-sentence). The halves are read back from that sentence, either side of its tag.
  'settingsCopy.SETTING_COPY': (v, x) => {
    const ac = v && v.allowCancellation
    if (!ac || 'cancelPrefix' in ac) return v
    const s = x.tr('settingsCopy').markup('allowCancellation.sentence', { select: () => '\u0000' })
    const [pre, suf] = s.split('\u0000')
    return { ...v, allowCancellation: { ...ac, cancelPrefix: pre.trim(), cancelSuffix: suf.trim() } }
  },
  // lib/event-types/types.ts: the name chips are ids now; their words are `eventTypes.newType.chips.<id>` (SCHED-B).
  'eventTypes.TYPE_NAME_CHIPS': (v, x) => (Array.isArray(v) && v.every(c => /^[a-z][A-Za-z]*$/.test(c)) ? v.map(id => x.tr('eventTypes')(`newType.chips.${id}`)) : v),
}
const ADAPT_NS = ['settingsCopy', 'eventTypes', 'privateEvents', 'manageScheduleVerify', 'manageScheduleEvent', 'manageScheduleImport', 'tradeArea', 'managePayments']

const show = v => {
  if (typeof v === 'string') return v
  if (v === undefined) return '[undefined]'
  return JSON.stringify(v, (k, x) => (typeof x === 'function' ? '[function]' : x))
}

async function views(ctx) {
  const { kit, GB, US } = ctx
  const out = {}
  const fs = require('fs'), path = require('path')
  const catalogs = ADAPT_NS.filter(ns => fs.existsSync(path.join(ctx.REPO, `lib/i18n/catalog/${ns}.ts`)))
  const B = await kit.bundle('lp1d-copy', Object.entries(MODULES).map(([k, m]) => `export * as ${k} from '@/${m}'`).join('\n') + "\nexport * as TA from '@/lib/trade-area'"
    + "\nexport { translatorFor } from '@/lib/i18n/translator'" + catalogs.map(ns => `\nimport '@/lib/i18n/catalog/${ns}'`).join(''))
  for (const C of [GB, US]) {
    const cc = C.cc
    const x = { locale: C.locale, cc, ts: C.time, B, tr: ns => B.translatorFor(C.locale, ns) }
    for (const name of Object.keys(MODULES)) {
      const M = B[name] || {}
      const exp = Object.keys(M).sort()
      // The names BEFORE had (756ca09) are what a view is keyed on; an adapter answers for one that moved.
      const adapted = Object.keys(ADAPT).filter(k => k.startsWith(`${name}.`)).map(k => k.slice(name.length + 1))
      for (const a of adapted) {
        const e = a.split('|')[0]
        if (e in M) continue
        const id = `${cc}|${name}|${a}`
        try { out[id] = show(ADAPT[`${name}.${a}`](M, x)) } catch (err) { out[id] = 'ERROR ' + String(err && err.message || err).slice(0, 200) }
      }
      for (const e of exp) {
        const id = `${cc}|${name}|${e}`
        try {
          const v = M[e]
          if (typeof v === 'function') {
            const calls = CALLS[name] && CALLS[name][e]
            if (!calls) { if (/^[A-Z]/.test(e)) continue; out[id] = '[function]'; continue }
            for (const [i, args] of calls(cc).entries()) out[`${id}|${i}`] = show(v(...args))
            continue
          }
          if (typeof v === 'number' || typeof v === 'boolean') continue
          out[id] = show(READ_AS_WORDS[`${name}.${e}`] ? READ_AS_WORDS[`${name}.${e}`](v, x) : v)
        } catch (err) { out[id] = 'ERROR ' + String(err && err.message || err).slice(0, 200) }
      }
    }
    // ── lib/trade-area.ts ──
    const facts = { countryCode: cc, name: cc === 'US' ? 'United States' : 'United Kingdom', enabled: true, timezones: C.settings.timezones, defaultTimezone: C.settings.defaultTimezone, addressFormat: C.settings.addressFormat }
    const ta = B.TA
    const town = cc === 'US' ? 'Springfield' : 'Harnessville'
    const cases = {
      ok: { base_place_name: town },
      okPoint: { base_place_name: town, base_place_id: 'pl-1', base_lat: 39.78, base_lng: -89.65, base_region: cc === 'US' ? 'Illinois' : 'Suffolk', base_region_code: cc === 'US' ? 'IL' : undefined },
      badZone: { base_place_name: town, timezone: 'Mars/Base' },
      noTown: { base_place_name: '  ' },
      townLong: { base_place_name: 'x'.repeat(121) },
    }
    // ⚠️ THIS TREE ANSWERS A REFUSAL AS { code, params } (API agent; words in the `tradeArea` namespace). The view is the
    // BEFORE shape with the words read in the country's language, and `code`/`params` LAST — named difference 1.
    const words = r => (r && typeof r === 'object' && typeof r.code === 'string' && !('error' in r) ? { ...(('ok' in r) ? { ok: r.ok } : {}), error: x.tr('tradeArea')(r.code, r.params || {}), code: r.code, params: r.params || {} } : r)
    for (const [k, input] of Object.entries(cases)) { try { out[`${cc}|tradeArea|check|${k}`] = JSON.stringify(words(ta.checkTradeArea(input, facts))) } catch (e) { out[`${cc}|tradeArea|check|${k}`] = 'ERROR ' + e.message } }
    for (const [k, [code, f]] of Object.entries({ ok: [cc, facts], none: ['', facts], noFacts: [cc, null], off: [cc, { ...facts, enabled: false }] })) {
      try {
        const r = ta.checkSignupCountry(code, f)
        // 756ca09 answered the sentence (or null); this tree a { code, params } refusal — its words, and its code as a view of its own.
        out[`${cc}|tradeArea|signup|${k}`] = JSON.stringify(r && typeof r === 'object' ? words(r).error : r)
        if (r && typeof r === 'object') out[`${cc}|tradeArea|signup|${k}|code`] = JSON.stringify({ code: r.code, params: r.params })
      } catch (e) { out[`${cc}|tradeArea|signup|${k}`] = 'ERROR ' + e.message }
    }
  }
  return out
}

module.exports = { views, MODULES, ADAPT }
