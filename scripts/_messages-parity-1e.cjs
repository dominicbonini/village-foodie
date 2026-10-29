// scripts/_messages-parity-1e.cjs — messages-parity AREA for Language Phase 1e (the HatchGrab MARKETING surfaces: landing,
// /features, /compare, the plans PDF, nav and footers, contact, the legal chrome, the public truck page, the plan rows
// Billing shares): the words that moved into messages/en-GB.json, BEFORE against AFTER, and their US words.
//
// BEFORE is the phase's Step 0 commit (eb7ed44) in two forms:
//   • the SOURCE, at that commit, of every app/, components/ and lib/ file this phase changed, and
//   • what the marketing surfaces RENDERED there (scripts/fixtures/language-phase-1e-before/*.json.gz).
// AFTER is each message added since that commit, AS MOVED — a key whose en-GB text is a named GB fix is read at its
// as-moved text (scripts/fixtures/language-phase-1e-gb-moved.json).
//   1. every literal run of every such message (each select / plural branch on its own) is text the commit's source
//      carried; a run the commit BUILT from pieces is matched word by word instead and LISTED; a word that was not there fails;
//   2. a message with no values is a string the BEFORE surfaces rendered, or — on a path no fixture reaches — one the
//      commit's source held;
//   3. every en-US key added or changed since eb7ed44 exists in en-GB, differs from it, and takes the same arguments;
//      every GB fix takes the same arguments as the text it replaced — except where NAMED below;
//   4. the en-GB keys whose text differs between the frozen and the current words are exactly
//      scripts/fixtures/language-phase-1e-gb-named.json;
//   5. 🔴 a LEGAL key (quoting the law / data protection) has NO en-US override.
// ⚠️ The word pattern drops a trailing straight quote ("road'" is the word "road" at the end of a quoted string).
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const { execSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
const W = require('./_lp1e-words.cjs')
const BEFORE_REF = W.BEFORE_REF

function dropInterpolations(src) {
  let out = '', i = 0
  while (i < src.length) {
    if (src[i] === '$' && src[i + 1] === '{') {
      let d = 0, q = null
      for (i += 1; i < src.length; i++) {
        const c = src[i]
        if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
        if (c === "'" || c === '"' || c === '`') q = c
        else if (c === '{') d++
        else if (c === '}') { d--; if (d === 0) { i++; break } }
      }
    } else out += src[i++]
  }
  return out
}
const squash = s => s.replace(/\s+/g, ' ')
const joinConcats = s => s.replace(/(['"`])\s*\+\s*\1/g, '')
function variants(ast) {
  let out = [[]]
  const add = text => { for (const v of out) { if (v.length && typeof v[v.length - 1] === 'string') v[v.length - 1] += text; else v.push(text) } }
  const gap = () => { for (const v of out) v.push(null) }
  for (const el of ast) {
    if (el.type === TYPE.literal) add(el.value)
    else if ([TYPE.argument, TYPE.number, TYPE.date, TYPE.time, TYPE.pound].includes(el.type)) gap()
    else if (el.type === TYPE.tag) { gap(); const inner = variants(el.children); out = out.flatMap(v => inner.map(w => [...v, ...w, null])) }
    else if (el.type === TYPE.select || el.type === TYPE.plural) {
      const opts = Object.values(el.options).map(o => variants(o.value)).flat()
      out = out.flatMap(v => opts.map(w => [...v, null, ...w, null]))
      if (out.length > 64) out = out.slice(0, 64)
    }
  }
  return out
}
function args(ast, out = new Set()) {
  for (const el of ast) {
    if ([TYPE.argument, TYPE.number, TYPE.date, TYPE.time, TYPE.select, TYPE.plural].includes(el.type)) out.add(el.value)
    if (el.type === TYPE.tag) { out.add(`<${el.value}>`); args(el.children, out) }
    if (el.options) for (const o of Object.values(el.options)) args(o.value, out)
  }
  return out
}
const argsOf = s => { try { return [...args(parse(s))].sort().join(',') } catch { return null } }
const wordsOf = s => (s.match(/[A-Za-z][A-Za-z'’]*/g) || []).map(w => w.replace(/['’]+$/, ''))

/** GB fixes that change a message's ARGUMENTS on purpose: key → reason. */
const FIX_ARGS = {
  'compare.smallPrint.onTop': 'COMPARE’s content fix: "question 4" was stale; the number is the fee step’s own ({n} = STEP.fee, "question 5")',
  // ⚠️ RE-PINNED (US dress rehearsal fixes, 19 October 2026, docs/us-dress-rehearsal-fixes-report.md)
  'orderStatus.cancelledBody': 'US dress rehearsal fix (Finding 5): the card-refund sentence is a {card} select — dropped for a pay-at-the-truck order; every word as it was',
}
/** Moved messages whose words are NEW on purpose (a named change), so no eb7ed44 string carries them: key → reason. */
const NEW_WORDING = {
  // ⚠️ RE-PINNED (france-1, 22 October 2026): menuBadges.allergen.<id> names every allergen set's STORED label so a language can
  // show it in its own words (lib/allergen-label.ts; English shows the stored label and never reads these). The anz-1 / canada-1
  // labels below are newer than eb7ed44, so no eb7ed44 string carries them; each is its set's label verbatim (lib/allergens.ts).
  // ⚠️ RE-PINNED (france-1): planFeatures.cardRegion.<id> names each country row's card_fee_region_label (data, English by the
  // rows' convention) so a language can word it; English shows the stored label and never reads these. Newer than eb7ed44:
  'planFeatures.cardRegion.Australiancards': 'france-1: country_settings.card_fee_region_label "Australian cards", named for a language to word it',
  'planFeatures.cardRegion.NewZealandcards': 'france-1: country_settings.card_fee_region_label "New Zealand cards", named for a language to word it',
  'planFeatures.cardRegion.Canadiancards': 'france-1: country_settings.card_fee_region_label "Canadian cards", named for a language to word it',
  // ⚠️ RE-PINNED (europe-languages-1, 22 October 2026): Switzerland's row label "Swiss cards", named so German (de-CH) words it.
  'planFeatures.cardRegion.Swisscards': 'europe-languages-1: country_settings.card_fee_region_label "Swiss cards", named for a language to word it',
  'menuBadges.allergen.Barley': 'france-1: the stored allergen label "Barley" (lib/allergens.ts), named for a language to word it',
  'menuBadges.allergen.Addedsulphites': 'france-1: the stored allergen label "Added sulphites" (lib/allergens.ts), named for a language to word it',
  'menuBadges.allergen.Brazilnut': 'france-1: the stored allergen label "Brazil nut" (lib/allergens.ts), named for a language to word it',
  'menuBadges.allergen.Macadamia': 'france-1: the stored allergen label "Macadamia" (lib/allergens.ts), named for a language to word it',
  'menuBadges.allergen.Pinenut': 'france-1: the stored allergen label "Pine nut" (lib/allergens.ts), named for a language to word it',
  'menuBadges.allergen.Pistachio': 'france-1: the stored allergen label "Pistachio" (lib/allergens.ts), named for a language to word it',
  'menuBadges.allergen.Wheatandtriticale': 'france-1: the stored allergen label "Wheat and triticale" (lib/allergens.ts), named for a language to word it',
  'menuBadges.allergen.Glutenbarleyoatsrye': 'france-1: the stored allergen label "Gluten (barley, oats, rye)" (lib/allergens.ts), named for a language to word it',
  // ⚠️ RE-PINNED (US dress rehearsal fixes, 19 October 2026): the US Add / Edit event form's new State box.
  'manageScheduleEvent.statePlaceholder': 'US dress rehearsal fix (Finding 6): the State box\'s example, a two-letter state ("e.g. NJ")',
  // ⚠️ RE-PINNED (legal follow-ups, 19 October 2026, docs/legal-follow-ups-report.md): the outreach company footer and
  // the send block when no opt-out sentence is set up — both new words.
  'outreach.companyFooter': 'legal follow-ups item 1: the company footer on every outreach email ("Registered office")',
  'outreach.optOut.notSetUp': 'legal follow-ups item 1: no outreach email is sent without an opt-out sentence ("Templates tab’s Signature panel")',
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the Manage page's guard when the plan catalogue did not load
  // (app/manage/[token]/page.tsx `!planCatalog`) — a new message, so no eb7ed44 string carries "Couldn’t".
  'manageShell.noPlans': 'plans-data-model Stage A: the Manage page cannot load the truck’s plan catalogue ("Couldn’t load this truck’s plan")',
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the order submit route refuses a pay-at-the-truck order
  // on a plan without Pay at Hatch (app/api/orders/submit/route.ts) — a new message (scripts/fixtures/plans-stage-a2-messages.json
  // `added`), so no eb7ed44 string carries "isn’t taking pay-at-the-truck orders".
  'errorsCustomer.pay_at_hatch_unavailable': 'plan-features-config Stage A2: a pay-at-the-truck order refused on a plan without Pay at Hatch ("isn’t taking pay-at-the-truck orders online")',
  // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): /features' row descriptions are the pre-Stage-B
  // planFeatures.row.<id>.detail texts (c6c44c9e) restored verbatim — all rendered by eb7ed44's /features, so they pass as
  // moved — EXCEPT this one, EDITED on purpose: the first sentence only ("Will carry an additional charge (price to be
  // confirmed)." removed). Its text is held to exactly that below (RESTORED_EDITED), not just excused.
  'featuresPage.detail.sms_order_alerts': 'features-page-restore: the SMS row\'s pre-Stage-B description (c6c44c9e) cut to its first sentence ("Text customers automatically when their order’s ready.")',
  // ⚠️ RE-PINNED (anz-1, 21 October 2026): a NEW message — the card processor's dual-network debit notice, shown on an
  // Australian (AUD) checkout only (app/trucks/[slug]/order/page.tsx); its exact text is held by scripts/anz-1.cjs §7.
  'order.dualNetworkNotice': 'anz-1: the eftpos dual-network debit notice on Australian checkouts ("Notwithstanding the payment brand logo displayed …")',
  // ⚠️ RE-PINNED (allergen-card-country, 21 October 2026): two NEW messages — Manage's notice for a truck still saved as
  // "allergen card only" where its country does not allow it, and /api/manage's refusal of a change to it. Their exact
  // text and where they show are held by scripts/allergen-card-country.cjs §4 and §6.
  'manageMenu.allergens.cardNotAllowed': 'allergen-card-country: the Allergens card notice when card-only is not allowed in the truck\'s country ("An allergen card on its own can’t be used …")',
  'errorsManage.allergen_card_not_allowed': 'allergen-card-country: the refusal of a change to card-only where the country does not allow it ("Allergens must be shown against each dish …")',
  // ⚠️ RE-PINNED (address-formats-2, 21 October 2026): the address forms' labels by field variant (messages `address.*`).
  // The GB/US words moved from the `{style}` selects unchanged; THESE are the new variants' words — Ireland's Eircode, the
  // Australian/NZ suburb, Australia's "State or territory", Canada's province. Where each shows is held by
  // scripts/address-formats-2.cjs §3 (the IE / AU / NZ / CA forms) and the stage's record
  // (scripts/fixtures/address-formats-2-messages.json).
  'address.label.eircode': 'address-formats-2: the Eircode field label (Ireland)',
  'address.inSentence.eircode': 'address-formats-2: "Eircode" inside a sentence (the Places search box, the guessed-venue banner)',
  'address.withArticle.eircode': 'address-formats-2: "an Eircode" (the no-location banner, the postal-code warning)',
  'address.label.stateTerritory': 'address-formats-2: Australia\'s region label ("State or territory")',
  'address.label.province': 'address-formats-2: Canada\'s region label ("Province")',
  'address.label.suburb': 'address-formats-2: the suburb field label (Australia\'s locality, New Zealand\'s dependent locality)',
  'address.short.suburb': 'address-formats-2: "Suburb" in the import review and the Places editor',
  'address.tradeLabel.suburb': 'address-formats-2: "Suburb" on Where you trade (Australia)',
  'address.basedIn.suburb': 'address-formats-2: "Suburb you’re based in" at signup (Australia)',
  // ⚠️ RE-PINNED (canada-1, 22 October 2026, docs/canada-1-report.md): the plain refusal for a truck based in a region closed to
  // signups (Quebec, until HatchGrab is in French — data on the region, lib/address-formats.ts `signupClosed`). New words;
  // scripts/canada-1.cjs §6 holds where it shows and its exact text.
  // ⚠️ RE-PINNED (canada-2, 22 October 2026): the reason is now a select — 'language' (Quebec) or 'taxLines' (Saskatchewan and
  // Manitoba: "we’re adding separate GST and PST lines first", Dominic's words); scripts/canada-2.cjs §1 holds both sentences.
  'tradeArea.region_closed': 'canada-1 / canada-2: "Trucks based in {region} can’t sign up yet: HatchGrab isn’t available in {language} yet…" (Quebec) / "…: we’re adding separate GST and PST lines first…" (Saskatchewan, Manitoba)',
  // ⚠️ RE-PINNED (about-page, 22 October 2026, docs/about-page-report.md): the About page's words — new, Dominic's own (the brief,
  // verbatim); scripts/about-page.cjs holds each one's exact text and where it renders.
  'aboutPage.meta.description': 'about-page-2: the About page meta description (what HatchGrab builds; founded by Dominic Bonini)',
  'aboutPage.title': 'about-page-2: the About h1 ("Built around the way food trucks actually work")',
  'aboutPage.photoAlt': 'about-page: the founder photo alt ("{name}, founder of HatchGrab")',
  // ⚠️ RE-PINNED (about-page-2, 29 October 2026): Dominic's new About text — six paragraphs and a two-line signature;
  // scripts/about-page.cjs holds each one's exact text.
  'aboutPage.story.start': 'about-page-2: story paragraph 1 ("HatchGrab started with a simple observation…")',
  'aboutPage.story.villageFoodie': 'about-page-2: story paragraph 2 ("After creating Village Foodie, a directory…", plain text)',
  'aboutPage.story.fixedAddress': 'about-page-2: story paragraph 3 ("Yet much of the software… a fixed address.")',
  'aboutPage.story.change': 'about-page-2: story paragraph 4 ("HatchGrab was created to change that.")',
  'aboutPage.story.build': 'about-page-2: story paragraph 5 ("We build practical software specifically for food trucks…")',
  'aboutPage.story.focus': 'about-page-2: story paragraph 6 ("Our focus is simple…")',
  'aboutPage.signature': 'about-page-2: the signature ("<b>{name}</b><br></br>Founder, HatchGrab")',
  'aboutPage.company': 'about-page: the company line ("{company} · registered in England and Wales · company number {number} · registered office: {address}")',
}
// ⚠️ RE-PINNED (compare-de-1, 25 October 2026, docs/compare-de-1-report.md): the comparison page's words — a NEW namespace,
// `comparison` (the German page /de/vergleich/foodtruck-bestellsystem; German and the English base only,
// docs/i18n/scoped-namespaces.json). Every key in it is new wording, named here as a whole namespace;
// scripts/compare-de-1.cjs holds where each renders and what it says.
{
  const flatKeys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flatKeys(v, `${p}${k}.`) : [`${p}${k}`]))
  const enGB = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8'))
  for (const k of flatKeys(enGB.comparison || {}, 'comparison.')) NEW_WORDING[k] = 'compare-de-1: the German comparison page (a new namespace)'
}
/** ⚠️ RE-PINNED (features-page-restore, 20 October 2026): a restored message EDITED on purpose → [ref, the old key, how]:
 *  its en-GB text must be EXACTLY the old text so edited (here: the old text's first sentence). */
const RESTORED_EDITED = {
  'featuresPage.detail.sms_order_alerts': ['c6c44c9e', 'planFeatures.row.sms_order_alerts.detail', old => old.slice(0, old.indexOf('. ') + 1)],
}
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): plans are data and every plan has every
// feature, so the plan-upsell words are REMOVED (plan refusals are errorsManage.feature_switched_off now; the van-upgrade
// modal, the Reports upsell, the plan matrix toggles and the Max/Pro buttons are gone) and the Billing / QR words that
// named a tier are REWORDED ("Upgrade" → "Switch", "every Max feature" → "every feature", "part of a higher plan" →
// "switched off for your truck"). Stage A's own changes, not GB wrong-English fixes: they are named by
// scripts/fixtures/plans-stage-a-messages.json (W.LP2.stageA(), exact before → after; removed = after null), not in the 1e
// named fixture (shared with language-phase-1e and country-settings-parity). A diff is excused only when it is EXACTLY the
// recorded change; every recorded change this phase can see must have happened so.
function stageAChange(k) {
  const g = W.LP2.stageA()['en-GB']
  if (k in (g.removed || {})) return { before: g.removed[k], after: null }
  if (k in (g.reworded || {})) return { before: g.reworded[k].before, after: g.reworded[k].after }
  return null
}
const LEGAL_RE = /\bUK law\b|\blaw requires\b|\bby law\b|\blegally\b|\blegal(ly)? required\b|\bretention\b|\bHMRC\b|\bGDPR\b|data protection|tax records/i

module.exports = function area({ t, head }) {
  head(`Phase 1e · the HatchGrab marketing words that moved into messages/ — BEFORE (${BEFORE_REF}) against AFTER`)
  const F = W.catalogues('F'), A = W.catalogues('A')
  const fGB = Object.fromEntries(W.LP2.leaves(F['en-GB']))
  const added = W.newKeys().map(([k]) => [k, fGB[k]])     // the AS-MOVED text
  const changed = execSync(`git diff --name-only ${BEFORE_REF} -- app components lib`, { cwd: REPO, encoding: 'utf8' }).split('\n').filter(f => /\.(ts|tsx)$/.test(f))
  const raw = changed.map(f => { try { return execSync(`git show ${BEFORE_REF}:${JSON.stringify(f).slice(1, -1)}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return '' } }).join('\n')
  t(`the source of the ${changed.length} files this phase changed is read at ${BEFORE_REF}`, raw.length > 1000 || changed.length === 0)
  const src = joinConcats(raw).replace(/\\n/g, '\n').replace(/\\(['"`])/g, '$1').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&mdash;/g, '—').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&rsquo;/g, '’').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  const hay = [squash(raw), squash(src), squash(dropInterpolations(src)), squash(src.replace(/&apos;/g, "'")), squash(dropInterpolations(src).replace(/&apos;/g, "'"))].join('\n')
  const words = new Set(wordsOf(hay).flatMap(w => [w, w.toUpperCase()]))
  const dir = path.join(REPO, 'scripts/fixtures/language-phase-1e-before')
  const rendered = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).map(f => squash(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString())).join('\n') : ''
  const htmlish = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const composed = [], composedPlain = [], reworded = [], elsewhere = [], elsewherePieces = []
  let plainRendered = 0, plainSource = 0
  for (const [key, v] of added) {
    if (typeof v !== 'string') continue
    let ast; try { ast = parse(v) } catch { continue }   // invalid ICU is reported by messages-parity §3
    const missing = [], built = []
    for (const runs of variants(ast)) for (const run of runs) {
      if (run == null) continue
      const piece = squash(run).trim()
      if (!/[A-Za-z]{2}/.test(piece) || hay.includes(piece) || hay.includes(piece.toLowerCase())) continue
      const novel = wordsOf(piece).filter(w => w && !words.has(w) && !words.has(w.toLowerCase()) && !(w.endsWith('s') && words.has(w.slice(0, -1))))
      let inTree = false
      if (novel.length) try { execSync(`git grep -q -F ${JSON.stringify(piece)} ${BEFORE_REF} -- app components lib`, { cwd: REPO, stdio: 'ignore' }); inTree = true } catch { /* not there */ }
      if (novel.length && inTree) { elsewherePieces.push(key); continue }
      if (novel.length && NEW_WORDING[key]) { reworded.push(key); continue }
      if (novel.length) missing.push(`${JSON.stringify(piece)} (new: ${novel.join(', ')})`)
      else built.push(piece)
    }
    if (built.length) composed.push(key)
    t(`${key}: every word (as moved) was in ${BEFORE_REF}'s source`, missing.length === 0, missing.join(' · '))
    if (ast.every(el => el.type === TYPE.literal)) {
      const text = squash(v)
      if (rendered.includes(JSON.stringify(text).slice(1, -1)) || rendered.includes(JSON.stringify(htmlish(text)).slice(1, -1))) plainRendered++
      else if (hay.includes(text) || hay.includes(text.replace(/'/g, '&apos;')) || hay.includes(text.toLowerCase())) plainSource++
      else if (NEW_WORDING[key]) { plainSource++; reworded.push(key) }
      else {
        let found = false
        try { execSync(`git grep -q -F ${JSON.stringify(text)} ${BEFORE_REF} -- app components lib`, { cwd: REPO, stdio: 'ignore' }); found = true } catch { /* not there */ }
        if (found) { plainSource++; elsewhere.push(key) }
        else if (built.length) { plainSource++; composedPlain.push(key) }
        else t(`${key}: a path no fixture reaches — the exact string is in ${BEFORE_REF}'s source`, false, text)
      }
    }
  }
  // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): each restored-and-edited message is exactly its named edit.
  for (const [key, [ref, oldKey, edit]] of Object.entries(RESTORED_EDITED)) {
    let old = null; try { old = oldKey.split('.').reduce((o, k) => (o ? o[k] : undefined), JSON.parse(execSync(`git show ${ref}:messages/en-GB.json`, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }))) } catch { /* unreadable */ }
    const now = Object.fromEntries(W.LP2.leaves(W.LP2.readJson(path.join(REPO, 'messages/en-GB.json'))))[key]
    const want = typeof old === 'string' ? edit(old) : null
    t(`${key}: exactly ${ref}'s ${oldKey}, as named (${NEW_WORDING[key] || 'features-page-restore'})`, !!want && want !== old && now === want, JSON.stringify({ now, want }))
  }
  console.log(`  ${added.length} Phase 1e messages · ${plainRendered} plain ones rendered by the BEFORE surfaces · ${plainSource} matched in the source`)
  if (composedPlain.length) console.log(`  ${composedPlain.length} plain message(s) on paths no fixture reaches were BUILT from pieces at ${BEFORE_REF}: ${composedPlain.join(', ')}`)
  if (elsewherePieces.length) console.log(`  ${new Set(elsewherePieces).size} message(s) with a run found verbatim in a ${BEFORE_REF} file this phase left alone: ${[...new Set(elsewherePieces)].slice(0, 20).join(', ')}`)
  if (elsewhere.length) console.log(`  ${elsewhere.length} plain message(s) whose exact text is in a ${BEFORE_REF} file this phase left alone: ${elsewhere.join(', ')}`)
  if (reworded.length) console.log(`  ${reworded.length} NEW wording(s) named: ${[...new Set(reworded)].map(k => `${k} (${NEW_WORDING[k]})`).join('; ')}`)
  console.log(`  ${composed.length} were built from pieces at ${BEFORE_REF} and are whole sentences now (their renders are compared byte for byte by language-phase-1e): ${composed.slice(0, 30).join(', ')}${composed.length > 30 ? ' …' : ''}`)

  // ── 3 · the US words and the GB fixes keep their arguments ──
  const gb = Object.fromEntries(W.LP2.leaves(A['en-GB']))
  const us0 = Object.fromEntries(W.LP2.leaves(W.LP2.readJson(W.FROZEN_US)))
  const usNew = W.LP2.leaves(A['en-US']).filter(([k, v]) => us0[k] !== v)
  const orphan = usNew.filter(([k]) => !(k in gb)).map(([k]) => k)
  const copies = usNew.filter(([k, v]) => gb[k] === v).map(([k]) => k)
  t(`en-US: every key added or changed since ${BEFORE_REF} exists in en-GB (${usNew.length})`, orphan.length === 0, orphan.join(', '))
  t('en-US: every key added differs from its en-GB text', copies.length === 0, copies.join(', '))
  const badArgs = usNew.filter(([k, v]) => k in gb && argsOf(v) !== argsOf(gb[k])).map(([k, v]) => `${k}: en-US ${argsOf(v)} · en-GB ${argsOf(gb[k])}`)
  t(`en-US: every key added takes the same arguments as en-GB (${usNew.length})`, badArgs.length === 0, badArgs.join(' · '))
  const mv = W.moved()
  for (const [k, r] of Object.entries(FIX_ARGS)) console.log(`  GB fix ${k} changes its arguments on purpose: ${r}`)
  const fixArgs = Object.entries(mv).filter(([k, m]) => k in gb && !(k in FIX_ARGS) && argsOf(m) !== argsOf(gb[k])).map(([k, m]) => `${k}: moved ${argsOf(m)} · fixed ${argsOf(gb[k])}`)
  t(`every GB fix takes the same arguments as the text it replaced (${Object.keys(mv).length}; ${Object.keys(FIX_ARGS).length} named)`, fixArgs.length === 0, fixArgs.join(' · '))

  // ── 4 · the named list ──
  const file = path.join(REPO, 'scripts/fixtures/language-phase-1e-gb-named.json')
  const named = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  t('scripts/fixtures/language-phase-1e-gb-named.json exists', !!named)
  if (named) {
    const diff = W.gbKeyDiff()
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): a key Stage A changed is named by its fixture (exactly).
    const isStageA = k => { const c = stageAChange(k); return !!c && c.before === diff[k].before && c.after === diff[k].after }
    // ⚠️ RE-PINNED (ireland-1, 20 October 2026): ireland-1's two tradeArea rewordings (W.isIE1 — exact before / after) are
    // not Phase 1e's; both must show exactly as recorded.
    const unnamed = Object.keys(diff).filter(k => !isStageA(k) && !W.isIE1(diff[k]) && (!named[k] || named[k].before !== diff[k].before || named[k].after !== diff[k].after))
    const ie1 = Object.keys(W.IE1_REWORDED)
    t(`ireland-1's tradeArea rewordings differ exactly as recorded (${ie1.length})`, ie1.every(k => W.isIE1(diff[k])), ie1.filter(k => !W.isIE1(diff[k])).join(', '))
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): a named key a plan stage REMOVED (W.LP2.stageA().removed — Stage B
    // deleted landing.pricing.summary, planFeatures.footnote.*, planMeta.*, …) has no text left to differ; it is not stale
    // while it is absent from messages/en-GB.json (checked here).
    const removedByStage = W.LP2.stageA()['en-GB'].removed || {}
    const gbNow = Object.fromEntries(W.LP2.leaves(W.LP2.readJson(path.join(REPO, 'messages/en-GB.json'))))
    const removedNamed = Object.keys(named).filter(k => !diff[k] && k in removedByStage)
    t(`the named keys a plan stage removed are absent from messages/en-GB.json (${removedNamed.length})`, removedNamed.every(k => !(k in gbNow)), removedNamed.filter(k => k in gbNow).join(', '))
    const stale = Object.keys(named).filter(k => !diff[k] && !removedNamed.includes(k))
    const byStageA = Object.keys(diff).filter(isStageA)
    t(`every en-GB key whose text differs from ${BEFORE_REF}'s (as moved) is named, as it changed (${Object.keys(diff).length}; ${byStageA.length} by plans-data-model Stage A / plan-features-config Stage A2 — W.LP2.stageA() reads both records)`, unnamed.length === 0, unnamed.join(', '))
    t('every named key did change', stale.length === 0, stale.join(', '))
    // A Stage A change to a key eb7ed44 had (as moved) must show here exactly as recorded — unless the helper already reads
    // that key at its pre-Stage-A words (then it does not differ at all).
    const eb = Object.fromEntries([...W.LP2.leaves(W.LP2.readJson(W.FROZEN_GB)), ...W.LP2.leaves(F['en-GB'])])   // eb7ed44's keys, and the keys added since
    const g = W.LP2.stageA()['en-GB']
    const wrong = [...Object.keys(g.removed || {}), ...Object.keys(g.reworded || {})].filter(k => k in eb && diff[k] && !isStageA(k))
    t(`every plans-data-model Stage A change this phase sees is exactly as recorded (${byStageA.length})`, wrong.length === 0, wrong.map(k => `${k}: ${JSON.stringify(diff[k])}`).join(' · '))
  }
  const mp = W.movedProblems()
  t('the as-moved list (scripts/fixtures/language-phase-1e-gb-moved.json) is consistent with the catalogue', mp.length === 0, mp.join(' · '))
  const km = W.keyMoveProblems()
  t(`every Phase 1e key move keeps its words (${Object.keys(W.moves1e()).length})`, km.length === 0, km.join(' · '))

  // ── 5 · legal wording keeps GB words in the US ──
  const usAll = Object.fromEntries(W.LP2.leaves(A['en-US']))
  const legal = added.filter(([k]) => LEGAL_RE.test(gb[k] || '')).map(([k]) => k)
  const overridden = legal.filter(k => k in usAll)
  t(`LEGAL: no legal key has an en-US override (${legal.length} legal keys: ${legal.join(', ') || 'none'})`, overridden.length === 0, overridden.join(', '))
}
