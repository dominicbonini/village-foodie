#!/usr/bin/env node
// scripts/about-page.cjs — THE ABOUT PAGE (about-page, 22 October 2026; docs/about-page-report.md).
//
// /about on the HatchGrab host: its words in the server HTML (no JS), self-canonical with no hreflang, the visitor's country
// in the nav/footer chrome, NO prices, NO country list and NO Village Foodie link in its content; the photo only when
// public/about/dominic.jpg exists (no placeholder otherwise); the JSON-LD (AboutPage + the Organization's founder, with an
// image only with the photo); a 404 on Village Foodie. Then what the work added elsewhere: the footer "About" link (HatchGrab
// pages only), the sitemap entry and its lastmod, the /llms.txt line and link — and the country menu, which is in the FOOTER
// only (Dominic, 22 October 2026: it left the nav). Negative controls prove each detector can fail.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const os = require('os')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'about-page' })
const { REPO, h } = kit
const NP = require('./_native-prices-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

const HG = 'www.hatchgrab.com', VF = 'www.villagefoodie.co.uk'
// ⚠️ RE-PINNED (about-page-2, 29 October 2026): Dominic's new About text — a new h1, six paragraphs, a two-line signature
// and a description to match. US English (and Canada's, over it) says "pickup times" where en-GB says "collection times".
const STORY = [
  'HatchGrab started with a simple observation: food trucks need better tools to run their businesses.',
  'After creating Village Foodie, a directory helping people discover food trucks visiting their local area, I spent more time learning about the challenges mobile food businesses face. Unlike traditional restaurants, food trucks are constantly moving, working at different locations and serving customers in changing conditions.',
  'Yet much of the software available to them is designed around businesses with a fixed address.',
  'HatchGrab was created to change that.',
  'We build practical software specifically for food trucks and mobile caterers, helping them take online orders, manage collection times, keep orders flowing smoothly and spend less time dealing with repetitive questions.',
  'Our focus is simple: make running a food truck easier, with tools designed around how these businesses actually operate.',
]
const STORY_US = STORY.map(s => s.replace('manage collection times', 'manage pickup times'))
const TITLE = 'Built around the way food trucks actually work'
const COMPANY_LINE = 'HatchGrab Ltd · registered in England and Wales · company number 17381557 · registered office: Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom'
const PHOTO_URL = 'https://www.hatchgrab.com/about/dominic.jpg'
const PHOTO_STUB = `export const aboutPhotoExists = () => true\nexport const aboutPhotoUrl = () => '${PHOTO_URL}'`

// ── The detectors (each has a negative control in §8) ──
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')
/** The About content: the <section class="about-page"> without its JSON-LD script. */
const content = html => { const m = String(html).match(/<section class="about-page">([\s\S]*?)<\/section>/); return m ? m[1].replace(/<script[\s\S]*?<\/script>/g, '') : '' }
const hasPrice = s => /[£$€]\s?\d|\d\s?(?:kr|NZD|AUD|USD|GBP|EUR)\b|\/\s?month|per month/i.test(s)
const hasCountryList = s => /cc-item|cc-menu|United States|New Zealand|Australia|Ireland/.test(s)
const hasVfLink = s => /href="[^"]*villagefoodie/i.test(s)
const hasPhoto = s => /<img[^>]*about-photo|about\/dominic\.jpg/.test(s)
const navOf = html => (String(html).match(/<nav[\s\S]*?<\/nav>/) || [''])[0]
const footOf = html => (String(html).match(/<footer[\s\S]*?<\/footer>/) || [''])[0]

;(async () => {
  const R = NP.renderer(kit, REPO, 'about-page')
  const { ctx, tables } = R
  const rows = NP.LIVE()
  const ABOUT = 'export * from \'@/app/about/page\'\nexport { default } from \'@/app/about/page\''
  const about = (photo) => ctx.bundle(photo ? 'ab-about-photo' : 'ab-about', ABOUT, photo ? { stubs: { '@/lib/about-server': PHOTO_STUB } } : {})
  /** /about as a request on `host`, with ?country / cookie — { html, meta } or the thrown error. */
  async function render({ host = HG, country, cookie, photo = false } = {}) {
    const M = await about(photo)
    return ctx.withReq({ rows, tables, host, cookie }, async () => {
      const args = { searchParams: Promise.resolve(country ? { country } : {}) }
      try {
        const meta = await M.generateMetadata(args)
        const html = await ctx.prerender(h(M.default, args))
        return { html, meta }
      } catch (e) { return { error: String(e && e.message || e) } }
    })
  }

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · /about ON HATCHGRAB — every word in the server HTML, in order')
  const gb = await render()
  t('it renders on the HatchGrab host', !gb.error && gb.html.length > 1000, gb.error)
  const C = content(gb.html)
  const at = s => C.indexOf(esc(s))
  t(`the eyebrow "About" (shown in capitals by .eyebrow's text-transform) and the h1 "${TITLE}"`, C.includes(`<p class="eyebrow">About</p><h1>${TITLE}</h1>`))
  t('the six story paragraphs, verbatim and in order, each its own <p>', STORY.every((s, i) => C.includes(`<p>${esc(s)}</p>`) && (i === 0 || at(STORY[i - 1]) < at(s))), STORY.filter(s => !C.includes(`<p>${esc(s)}</p>`)))
  t('the signature: "Dominic Bonini" bold, then on its own line "Founder, HatchGrab", after the story', /<p class="about-sign"><b>Dominic Bonini<\/b><br\/>Founder, HatchGrab<\/p>/.test(C) && C.indexOf('about-sign') > at(STORY[5]), C.slice(C.indexOf('about-sign') - 10, C.indexOf('about-sign') + 120))
  t('the company line from lib/company.ts, then "Contact us" linking to the contact page', C.includes(`<p class="about-legal">${esc(COMPANY_LINE)}<!-- --> · <a href="/contact?topic=General%20Enquiry">Contact us</a></p>`), C.slice(C.indexOf('about-legal') - 20))
  t('the company line comes after the signature (above the thin rule, .about-legal\'s border-top)', C.indexOf('about-legal') > C.indexOf('about-sign'))
  t('no <script> needed for the words: they are all outside any script, in the prerendered HTML', STORY.every(s => gb.html.replace(/<script[\s\S]*?<\/script>/g, '').includes(esc(s))))

  head('2 · NO PRICES, NO COUNTRY LIST, NO VILLAGE FOODIE LINK')
  t('the About content has no price', !hasPrice(C))
  t('the About content lists no countries', !hasCountryList(C))
  t('no link to Village Foodie anywhere on the page (paragraph 2 names it in plain text)', !hasVfLink(gb.html) && C.includes(`<p>${esc(STORY[1])}</p>`))
  t('the story has no links at all', !/<a /.test(C.slice(0, C.indexOf('about-legal'))))

  head('3 · METADATA — self-canonical /about, no hreflang, the title and a plain description')
  const m = gb.meta
  t('title "About — HatchGrab" (absolute: the layout template cannot add the brand twice)', m.title && m.title.absolute === 'About — HatchGrab', m.title)
  t('a plain description of what HatchGrab builds and who founded it', m.description === 'HatchGrab builds practical software for food trucks and mobile caterers: online orders, collection times and fewer repetitive questions. Founded by Dominic Bonini.', m.description)
  t('canonical https://www.hatchgrab.com/about, and og:url the same', m.alternates && m.alternates.canonical === 'https://www.hatchgrab.com/about' && m.openGraph && m.openGraph.url === 'https://www.hatchgrab.com/about', m.alternates)
  t('no hreflang alternates (one page for every country)', !m.alternates.languages)
  t('indexable', m.robots && m.robots.index === true && m.robots.follow === true)

  head('4 · IT FEELS LOCAL — the nav and footer keep the visitor’s country; the country menu is in the FOOTER only')
  const us = await render({ country: 'US' }), ie = await render({ cookie: 'IE' })
  // ⚠️ RE-PINNED (country-picker-1, 23 October 2026, docs/country-picker-1-report.md): the footer trigger shows the flag and the
  // CODE ("GB ▾"); the country's name is its label ("Country: United Kingdom. Change country"), read here with the code.
  const curName = html => { const f = footOf(html); const m = /<span class="cc-code">([A-Z]{2})<\/span>/.exec(f), l = /class="cc-btn"[^>]*aria-label="Country: ([^".]+)\. Change country"/.exec(f); return m && l ? `${l[1]} (${m[1]})` : (f.match(/<span class="cc-name">([^<]*)<\/span>/) || [])[1] }
  t('GB visitor: the footer menu shows United Kingdom', curName(gb.html) === 'United Kingdom (GB)', curName(gb.html))
  t('?country=US: the footer menu shows United States, and the same story in US English ("pickup times")', curName(us.html) === 'United States (US)' && STORY_US.every(s => us.html.includes(esc(s))), curName(us.html))
  t('hg_country=IE: the footer menu shows Ireland', curName(ie.html) === 'Ireland (IE)', curName(ie.html))
  t('the nav has no country menu (on /about, as on every page)', ![gb, us, ie].some(r => /cc-head|cc-btn/.test(navOf(r.html))))
  t('the canonical is /about for every visitor', [us, ie].every(r => r.meta.alternates.canonical === 'https://www.hatchgrab.com/about'))
  t('the footer carries the "About" link on /about too', footOf(gb.html).includes('<a href="/about">About</a>'))

  head('5 · THE PHOTO — none without the file (no placeholder), beside/above the story with it')
  t('no photo: no <img>, no photo class, no alt text — the story takes the width', !hasPhoto(gb.html) && !/founder of HatchGrab/.test(C))
  const ph = await render({ photo: true })
  const PC = content(ph.html)
  t('with the photo: <img class="about-photo" src="/about/dominic.jpg" alt="Dominic Bonini, founder of HatchGrab">', PC.includes('<img class="about-photo" src="/about/dominic.jpg" alt="Dominic Bonini, founder of HatchGrab"/>'), PC.slice(0, 600))
  t('with the photo: it comes before the story in the HTML (above it on phones; beside it from 760px by flex-direction)', PC.indexOf('about-photo') < PC.indexOf(esc(STORY[0])))
  t('with the photo: everything else is byte-identical', PC.replace(/<img class="about-photo"[^>]*\/>/, '') === C)
  const CSS = read('app/landing/landing.css')
  t('the CSS: a column on phones, a row from 760px', /\.hg-landing \.about-body \{ display: flex; flex-direction: column;/.test(CSS) && /@media\(min-width:760px\)\{\s*\.hg-landing \.about-body \{ display: flex|@media\(min-width:760px\)\{\s*\.hg-landing \.about-body \{ flex-direction: row;/.test(CSS))
  // lib/about-server.ts's real check, against a real directory: absent, then present.
  const S = await kit.bundle('ab-server', "export { aboutPhotoExists, aboutPhotoUrl } from '@/lib/about-server'")
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'about-page-'))
  const cwd = process.cwd()
  try {
    process.chdir(tmp)
    const before = [S.aboutPhotoExists(), S.aboutPhotoUrl()]
    fs.mkdirSync(path.join(tmp, 'public/about'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'public/about/dominic.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    const after = [S.aboutPhotoExists(), S.aboutPhotoUrl()]
    t('lib/about-server.ts: no file → false / null; the file → true / its absolute URL', before[0] === false && before[1] === null && after[0] === true && after[1] === PHOTO_URL, { before, after })
  } finally { process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }) }
  t('the repo has no photo committed today (public/about/dominic.jpg absent)', !fs.existsSync(path.join(REPO, 'public/about/dominic.jpg')))

  head('6 · JSON-LD — an AboutPage, and the Organization’s founder (an image only with the photo)')
  const ld = ctx.jsonLd(gb.html), ldp = ctx.jsonLd(ph.html)
  const node = (g, type) => g[0] && g[0]['@graph'] && g[0]['@graph'].find(n => n['@type'] === type)
  const ap = node(ld, 'AboutPage'), org = node(ld, 'Organization')
  t('one JSON-LD block with an @graph', ld.length === 1 && Array.isArray(ld[0]['@graph']))
  t('AboutPage: @id …/about#page, url, name, description, inLanguage, about → the Organization', ap && ap['@id'] === 'https://www.hatchgrab.com/about#page' && ap.url === 'https://www.hatchgrab.com/about'
    && ap.name === 'About — HatchGrab' && ap.description === m.description && ap.inLanguage === 'en-GB' && ap.about['@id'] === 'https://www.hatchgrab.com/#organization', ap)
  t('Organization.founder = { Person, "Dominic Bonini" } with NO image while there is no photo', org && JSON.stringify(org.founder) === '{"@type":"Person","name":"Dominic Bonini"}', org && org.founder)
  t('with the photo: founder.image is the photo URL', JSON.stringify(node(ldp, 'Organization').founder) === `{"@type":"Person","name":"Dominic Bonini","image":"${PHOTO_URL}"}`)
  const LDS = JSON.stringify(ld) + JSON.stringify(ldp)
  t('no invented dates or roles (foundingDate, jobTitle, birthDate, worksFor…)', !/foundingDate|jobTitle|birthDate|worksFor|founded|"role"/.test(LDS))
  // The landing's Organization carries the same founder (one definition).
  const land = await R.page('landing', 'GB')
  const lorg = node(ctx.jsonLd(land.html).filter(x => x && x['@graph']), 'Organization')
  t('the landing’s Organization names the founder too (no image while there is no photo)', lorg && JSON.stringify(lorg.founder) === '{"@type":"Person","name":"Dominic Bonini"}', lorg && lorg.founder)
  const LP = await ctx.bundle('ab-landing-photo', "export * from '@/app/[country]/page'\nexport { default } from '@/app/[country]/page'\nexport { clearPlanCatalogCache as __clearPlans } from '@/lib/plans-server'", { stubs: { '@/lib/about-server': PHOTO_STUB } })
  const landPh = await ctx.withReq({ rows, tables }, async () => { LP.__clearPlans(); const args = { params: Promise.resolve({ country: 'uk' }), searchParams: Promise.resolve({}) }; return ctx.prerender(h(LP.default, args)) })
  const lorgP = node(ctx.jsonLd(landPh).filter(x => x && x['@graph']), 'Organization')
  t('with the photo: the landing’s founder carries the image', lorgP && lorgP.founder.image === PHOTO_URL, lorgP && lorgP.founder)

  head('7 · VILLAGE FOODIE — /about is a 404 there; its footer is unchanged')
  const vf = await render({ host: VF })
  t('Village Foodie host: notFound()', vf.error === 'notFound', vf)
  t('components/Footer.tsx (Village Foodie\'s footer) has no About link', !/\/about|ABOUT_PATH/.test(read('components/Footer.tsx')))
  t('LegalChrome (the legal pages\' chrome, shared by both hosts) has no About link — it would 404 on Village Foodie', !/\/about|ABOUT_PATH/.test(read('components/legal/LegalChrome.tsx')))

  head('8 · ELSEWHERE — footer link, nav, sitemap, /llms.txt')
  for (const p of ['landing', 'features', 'compare']) {
    for (const cc of ['GB', 'US']) {
      const r = p === 'landing' && cc === 'GB' ? land : await R.page(p, cc)
      t(`${cc} ${p}: footer has <a href="/about">About</a>; the nav has no country menu; the footer has it`, footOf(r.html).includes('<a href="/about">About</a>') && !/cc-head|cc-btn/.test(navOf(r.html)) && /cc cc-foot/.test(footOf(r.html)))
    }
  }
  const CONTACT = await ctx.bundle('ab-contact', "export * from '@/app/contact/page'\nexport { default } from '@/app/contact/page'")
  const contact = host => ctx.withReq({ rows, tables, host }, async () => { const args = { searchParams: Promise.resolve({}) }; return ctx.prerender(await CONTACT.default(args)) })
  t('HatchGrab /contact: its footer has the About link', (await contact(HG)).includes('<a href="/about">About</a>'))
  t('Village Foodie /contact: no About link', !(await contact(VF)).includes('/about'))
  const SM = await ctx.bundle('ab-sitemap', "export { default } from '@/app/sitemap'\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'")
  const sm = host => ctx.withReq({ rows, tables, host }, async () => { SM.__p?.(); return SM.default() })
  const hgSm = await sm(HG), vfSm = await sm(VF)
  const aboutEntry = hgSm.find(e => e.url === 'https://www.hatchgrab.com/about')
  t('HatchGrab sitemap: /about with lastmod 22 October 2026 (the page\'s words\' date, lib/about.ts), yearly', aboutEntry && new Date(aboutEntry.lastModified).toISOString() === '2026-10-22T00:00:00.000Z' && aboutEntry.changeFrequency === 'yearly', aboutEntry)
  t('HatchGrab sitemap: /about is the last entry, after /contact (nothing else moved)', hgSm[hgSm.length - 1] === aboutEntry && hgSm[hgSm.length - 2].url === 'https://www.hatchgrab.com/contact')
  t('Village Foodie sitemap: no /about', !JSON.stringify(vfSm).includes('/about'))
  const llms = await R.llms(['GB', 'US', 'IE', 'AU', 'NZ'])
  t('/llms.txt: "## About" with the line, before "## Links"', /## About\n\nHatchGrab is run by its founder, Dominic Bonini, from the UK\.\n\n## Links\n/.test(llms))
  t('/llms.txt: "- About: https://www.hatchgrab.com/about" after Privacy, last', llms.endsWith('- Privacy: https://www.hatchgrab.com/privacy\n- About: https://www.hatchgrab.com/about\n'))

  head('9 · NEGATIVE CONTROLS — every detector above can fail')
  t('a planted "£29 / month" is a price', hasPrice('<p>From £29 / month</p>') && hasPrice('<p>$29</p>') && !hasPrice(C))
  t('a planted country list is caught', hasCountryList('<ul class="cc-menu"><li>Ireland</li></ul>'))
  t('a planted Village Foodie link is caught', hasVfLink('<a href="https://www.villagefoodie.co.uk/">Village Foodie</a>'))
  t('a planted photo is caught', hasPhoto(PC) && !hasPhoto(C))
  t('the nav detector sees the old header menu', /cc-head|cc-btn/.test(navOf('<nav><div class="cc cc-head"><button class="cc-btn"></button></div></nav>')))
  t('a reworded paragraph would fail §1', !content(gb.html.replace('a simple observation', 'an observation')).includes(`<p>${esc(STORY[0])}</p>`))

  console.log(`\n${fail ? '🔴' : '✅'} about-page: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
