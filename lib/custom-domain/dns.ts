import { parentOf } from './apex'

/**
 * ── PRE-FLIGHT, OVER DNS-OVER-HTTPS ─────────────────────────────────────────────────────────────
 *
 * Three questions, asked BEFORE the operator is asked to do anything: can a certificate be issued at
 * all, who holds their DNS, and is the domain already spoken for. All three change what we say next,
 * and all three are cheaper to answer now than to diagnose afterwards.
 *
 * 🔴 DNS-OVER-HTTPS, NOT A DNS LIBRARY. This runs in a runtime with no UDP socket. DoH is a plain
 * HTTPS GET returning JSON, which is the only shape available — and it is a real advantage rather
 * than a workaround, because the same call works identically in every environment this code runs in.
 *
 * 🔴 EVERY CHECK FAILS OPEN. A lookup that errors, times out or returns something unexpected returns
 * `unknown` and the operator continues. **These checks exist to make setup smoother, not to gate it**
 * — refusing to let an operator proceed because Cloudflare was slow would be a worse failure than the
 * one being prevented.
 */

/** 🔴 FOUR SECONDS. Someone is watching a spinner having just typed their own address; two lookups
 *  run concurrently, so the screen waits four seconds at worst. Longer buys a prettier hint and
 *  nothing else — every answer here is advisory. */
const DNS_TIMEOUT_MS = 4_000

/**
 * Two resolvers, same response schema, tried in order.
 * ⚠️ Cloudflare needs `accept: application/dns-json`; Google's `/resolve` returns the same shape
 * without it. **The shapes match** — `{ Status, Answer?: [{ name, type, TTL, data }] }` — which is
 * what makes a fallback possible rather than a second parser.
 */
const RESOLVERS = [
  { name: 'cloudflare', url: (n: string, t: string) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${t}`, headers: { accept: 'application/dns-json' } },
  { name: 'google',     url: (n: string, t: string) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${t}`,          headers: { accept: 'application/json' } },
] as const

type DohAnswer = { name: string; type: number; TTL: number; data: string }
type DohResponse = { Status: number; Answer?: DohAnswer[] }

type DohSection = { Answer?: DohAnswer[]; Authority?: DohAnswer[] }

async function query(name: string, type: 'CAA' | 'NS' | 'SOA' | 'CNAME'): Promise<(DohResponse & DohSection) | null> {
  for (const r of RESOLVERS) {
    try {
      const res = await fetch(r.url(name, type), {
        headers: r.headers as Record<string, string>,
        signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
      })
      if (!res.ok) continue
      const json = (await res.json()) as DohResponse
      if (typeof json?.Status !== 'number') continue
      return json
    } catch {
      // Fall through to the next resolver. A failure here is never surfaced to the operator.
    }
  }
  return null
}

/**
 * 🔴 EVERY LOOKUP TARGETS THE PARENT, NEVER THE NEW SUBDOMAIN.
 * The subdomain does not exist yet, so asking about it returns NXDOMAIN — and resolvers cache a
 * negative answer for the zone's negative-TTL window, commonly minutes to an hour. **Checking early
 * would therefore poison the answer to every later check**, and the setup would look slow for a
 * reason we created. CAA is inherited down the tree and nameservers are a property of the zone, so
 * the parent is also the correct place to ask — this is not a workaround.
 */
export type CaaVerdict = { state: 'clear' | 'blocked' | 'restricted' | 'unknown'; issuers: string[]; queried: string | null }

/** Certificate authorities Vercel issues through. */
const PERMITTED_ISSUERS = ['letsencrypt.org']

export async function checkCaa(host: string): Promise<CaaVerdict> {
  const parent = parentOf(host)
  if (!parent) return { state: 'unknown', issuers: [], queried: null }

  const res = await query(parent, 'CAA')
  if (!res) return { state: 'unknown', issuers: [], queried: parent }
  // NOERROR with no answers = no CAA records = anyone may issue. This is the common case.
  if (!res.Answer || res.Answer.length === 0) return { state: 'clear', issuers: [], queried: parent }

  // A CAA rdata line looks like `0 issue "letsencrypt.org"`. Only `issue`/`issuewild` gate issuance.
  const issuers: string[] = []
  for (const a of res.Answer) {
    const m = /issue(?:wild)?\s+"([^"]*)"/i.exec(a.data || '')
    if (m) issuers.push(m[1].trim().toLowerCase())
  }
  if (issuers.length === 0) return { state: 'clear', issuers: [], queried: parent }
  // `issue ";"` means nobody may issue at all.
  if (issuers.every(i => i === ';' || i === '')) return { state: 'blocked', issuers, queried: parent }
  if (issuers.some(i => PERMITTED_ISSUERS.some(p => i === p || i.endsWith('.' + p)))) {
    return { state: 'clear', issuers, queried: parent }
  }
  // 🔴 THIS IS THE CASE WORTH CATCHING. Records exist, none of them names the authority we issue
  // through, so the certificate SILENTLY never appears — nothing errors, the domain simply never
  // starts working. Diagnosing that afterwards costs an afternoon; asking now costs one lookup.
  return { state: 'restricted', issuers, queried: parent }
}

/**
 * ── WHO HOLDS THEIR DNS ─────────────────────────────────────────────────────────────────────────
 * 🔴 THIS IS AUTHORITATIVE REGISTRY DATA, NOT PAGE CONTENT — which makes it a far stronger signal
 * than the website-builder detection the embed wizard does. A nameserver is what the registry says
 * answers for the zone; it cannot be a coincidence, an agency's portfolio page, or a plugin's asset
 * host. Where builder detection had to require two body hits before it trusted anything, this needs
 * one match.
 * ⚠️ IT NAMES A PROVIDER, IT DOES NOT PROVE ONE. A registrar can white-label another's nameservers,
 * and `unknown` is an ordinary outcome — the screen then says "your DNS provider" and links nothing.
 */
/**
 * ── 🔴 THE PROVIDER'S OWN INSTRUCTIONS, IN THE PROVIDER'S OWN WORDS. ─────────────────────────────
 *
 * 🔴 EVERY STEP HERE WAS READ FROM THAT PROVIDER'S CURRENT HELP PAGE ON 28 AUGUST 2026, NOT WRITTEN
 * FROM MEMORY. A menu path recalled from training is the same class of stale claim as a hardcoded DNS
 * target, and it fails worse: a wrong target errors, a wrong menu name leaves the operator hunting for
 * a button that is not there. `helpUrl` is the page each was taken from — quoted in
 * docs/custom-domain-provider-steps-report.md — and it is also what the screen links to, because our
 * wording goes stale and theirs does not.
 *
 * 🔴 `fieldLabels.type` IS NULLABLE, AND THAT IS THE ENTIRE REASON THIS TYPE EXISTS. On Wix there is
 * NO type field: the record kind is decided by WHICH SECTION you add to. Showing a "Type: CNAME" row to
 * a Wix operator sends them looking for a box that does not exist. `null` means: render no type row.
 *
 * ⚠️ ONE RECORD PER PROVIDER AND ONE SOURCE. The record screen and the escape-hatch email both render
 * from this; no provider's steps are written out a second time anywhere. This is the shape the deleted
 * embed platform records used.
 */
export type ProviderSteps = {
  /** Their words for the fields the operator fills. `type: null` = this provider has no type field. */
  fieldLabels: { type: string | null; name: string; value: string }
  /** Numbered on screen. One action each. Quoted strings are the provider's own button labels. */
  steps: string[]
  /** The provider's own help page for this task. */
  helpUrl: string
  /** One thing that will otherwise catch them out, or null. */
  caveat: string | null
}

/** The three field names a provider puts on its own form. `type` is never null here — see below. */
export type RecordFieldLabels = { type: string; name: string; value: string }

/**
 * ── 🔴 ONE SOURCE PER PROVIDER, AND THE TYPE ENFORCES IT (28 August 2026). ──────────────────────
 *
 * A provider carries EITHER `steps` (its help page was read, and `steps.fieldLabels` holds the verified
 * field names) OR `recordLabels` (no verified steps, so the labels stand alone). **Never both.** The
 * union makes authoring both a compile error, and authoring neither a compile error too.
 *
 * 🔴 WHY THIS EXISTS. For a day they were both present and both authored, and they disagreed: the
 * `recordLabels` for GoDaddy said "Points to" and 123 Reg said "Hostname"/"Destination" while the
 * verified `fieldLabels` said "Value" and "Name"/"Value". Wix disagreed with itself on capitalisation
 * ("Host name" vs "Host Name"). **Two records of one fact drift, and the one that drifts is whichever
 * nobody is looking at** — here that was `recordLabels`, which for those four rendered nowhere at all.
 * ⚠️ Read `recordLabelsFor()` below rather than either field.
 */
type DnsProviderBase = { id: string; label: string; dashboardUrl: string }
export type DnsProvider =
  | (DnsProviderBase & { recordLabels: RecordFieldLabels; steps?: never })
  | (DnsProviderBase & { recordLabels?: never; steps: ProviderSteps })

/**
 * ⚠️ FIELD LABELS ARE THE PROVIDER'S OWN WORDS, per the plain-English rule: our sentences carry no
 * technical words, and a quoted field label is the provider's. They differ meaningfully — Cloudflare
 * says "Target", GoDaddy says "Points to", and an operator hunting for "Value" on a GoDaddy screen
 * will not find it.
 * ⚠️ THESE LABELS COME FROM THE PROVIDERS' PUBLISHED INTERFACES AND WERE NOT VERIFIED AGAINST THEIR
 * LIVE DASHBOARDS TODAY. Same standing caveat as the website-builder menu names.
 */
export const DNS_PROVIDERS: Array<DnsProvider & { nsMatch: string[] }> = [
  { id: 'cloudflare', label: 'Cloudflare', dashboardUrl: 'https://dash.cloudflare.com/', nsMatch: ['ns.cloudflare.com'],
    // Read 28 Aug 2026 from developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/
    // and .../reference/dns-record-types/ for the field names.
    // 🔴 THE CAVEAT IS THE IMPORTANT PART. Cloudflare defaults new records to PROXIED (the orange
    // cloud). Proxied, Cloudflare terminates the connection itself and the padlock never issues on our
    // side — vercel.com/kb/guide/cloudflare-with-vercel. It fails silently, which is the worst shape.
    steps: {
      fieldLabels: { type: 'Type', name: 'Name', value: 'Target' },
      steps: [
        'Open your web address, then "DNS" and "Records".',
        'Select "Add record", then pick "CNAME" as the "Type".',
        'Put the first value below in "Name".',
        'Put the second value below in "Target".',
        'Set "Proxy status" to "DNS only" — the cloud beside it must be grey, not orange.',
        'Leave "TTL" as "Auto" and select "Save".',
      ],
      helpUrl: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/',
      caveat: 'If the cloud stays orange the padlock will never appear, and nothing will say why.',
    } },
  { id: 'godaddy', label: 'GoDaddy', dashboardUrl: 'https://dcc.godaddy.com/manage/dns', nsMatch: ['domaincontrol.com'],
    // Read 28 Aug 2026 from godaddy.com/help/add-a-cname-record-19236
    // ⚠️ `recordLabels.value` ABOVE SAYS "Points to" AND THEIR CURRENT PAGE SAYS "Value". The old label
    // is left untouched because `recordRows` is byte-identical by requirement; `fieldLabels` below is
    // the verified one and is what the four-provider screen renders. See the report.
    steps: {
      fieldLabels: { type: 'Type', name: 'Name', value: 'Value' },
      steps: [
        'Open your "Domain Portfolio" and choose your web address.',
        'On "Domain Settings", select "DNS".',
        'Select "Add New Record", then pick "CNAME" from the "Type" menu.',
        'Put the first value below in "Name".',
        'Put the second value below in "Value".',
        'Leave "TTL" as it is and select "Save".',
      ],
      helpUrl: 'https://www.godaddy.com/help/add-a-cname-record-19236',
      caveat: 'If you added more than one at once, the button says "Save All Records".',
    } },
  { id: 'squarespace', label: 'Squarespace Domains', dashboardUrl: 'https://account.squarespace.com/domains', nsMatch: ['squarespacedns.com'],
    recordLabels: { type: 'Type', name: 'Host', value: 'Data' } },
  { id: 'ionos', label: 'IONOS', dashboardUrl: 'https://my.ionos.co.uk/domains', nsMatch: ['ui-dns.', 'ui-dns.com', 'ui-dns.org'],
    recordLabels: { type: 'Type', name: 'Host name', value: 'Points to' } },
  { id: '123reg', label: '123 Reg', dashboardUrl: 'https://www.123-reg.co.uk/secure/cpanel/domain', nsMatch: ['123-reg.co.uk'],
    // Read 28 Aug 2026 from 123-reg.co.uk/support/domains/how-do-i-set-up-a-cname-record-on-my-domain-name/
    // ⚠️ `recordLabels` ABOVE SAYS "Hostname"/"Destination" AND THEIR CURRENT PAGE SAYS "Name"/"Value".
    // Both are stale. Left untouched for the byte-identical requirement; `fieldLabels` is the verified pair.
    // 🔴 THE FULL STOP IS THEIRS, VERBATIM: "Be sure to add a full stop to the end … or your CNAME
    // record will not work correctly." It is the one provider where copying our value EXACTLY is wrong.
    steps: {
      fieldLabels: { type: 'Type', name: 'Name', value: 'Value' },
      steps: [
        'Sign in to your "123 Reg Control Panel".',
        'Beside "Domains", select "Manage All", then choose your web address.',
        'Select "DNS", then "Add New Record".',
        'Pick "CNAME" from the "Type" list.',
        'Put the first value below in "Name".',
        'Put the second value below in "Value", and add a full stop to the end of it.',
        'Leave "TTL" as "Default" and click "Save".',
      ],
      helpUrl: 'https://www.123-reg.co.uk/support/domains/how-do-i-set-up-a-cname-record-on-my-domain-name/',
      caveat: '123 Reg needs a full stop at the end of the second value or it will not work.',
    } },
  { id: 'namecheap', label: 'Namecheap', dashboardUrl: 'https://ap.www.namecheap.com/domains/list/', nsMatch: ['registrar-servers.com'],
    recordLabels: { type: 'Type', name: 'Host', value: 'Value' } },
  { id: 'wix', label: 'Wix', dashboardUrl: 'https://www.wix.com/my-account/sites', nsMatch: ['wixdns.net'],
    // Read 28 Aug 2026 from support.wix.com/en/article/adding-or-updating-cname-records-in-your-wix-account
    // 🔴 NO TYPE FIELD. Their page: the record kind comes from adding inside the "CNAME (Aliases)"
    // section. The "Got it" pop-up at step 3 is on their page and is the step most easily missed.
    steps: {
      fieldLabels: { type: null, name: 'Host Name', value: 'Value' },
      steps: [
        'Open "Domains", then click the "Domain Actions" icon beside your web address.',
        'Choose "Manage DNS Records".',
        'In the "CNAME (Aliases)" section, click "+ Add Record", then click "Got it".',
        'Put the first value below in "Host Name".',
        'Put the second value below in "Value".',
        'Click "Save", then click "Save Changes" in the pop-up.',
      ],
      helpUrl: 'https://support.wix.com/en/article/adding-or-updating-cname-records-in-your-wix-account',
      caveat: 'If your web address only points at Wix rather than being held there, Wix cannot make this change — whoever holds it has to.',
    } },
  { id: 'google', label: 'Google Domains or Squarespace', dashboardUrl: 'https://domains.squarespace.com/', nsMatch: ['googledomains.com'],
    recordLabels: { type: 'Type', name: 'Host name', value: 'Data' } },
  { id: 'vercel', label: 'Vercel', dashboardUrl: 'https://vercel.com/dashboard/domains', nsMatch: ['vercel-dns.com'],
    recordLabels: { type: 'Type', name: 'Name', value: 'Value' } },
]

/** The generic labels, used when we cannot name the provider. Neutral, and true everywhere. */
export const GENERIC_RECORD_LABELS: RecordFieldLabels = { type: 'Type', name: 'Name', value: 'Value' }

/**
 * ── THE ONE READER OF EITHER FIELD. ─────────────────────────────────────────────────────────────
 * 🔴 `steps.fieldLabels.type` IS NULLABLE AND THIS IS WHERE THAT ENDS. Wix has no type field, so its
 * `fieldLabels.type` is null — but the GENERIC three-row table always shows a type row, and it is the
 * one surface a Wix operator never reaches. Falling back to the generic word here keeps the generic
 * table's shape exactly as it was; the null still reaches the four-provider screen, which is the only
 * place it should change anything.
 * ⚠️ Nothing outside this function may read `recordLabels` or `fieldLabels` for this purpose.
 */
export function recordLabelsFor(provider: DnsProvider | null | undefined): RecordFieldLabels {
  if (!provider) return GENERIC_RECORD_LABELS
  if (provider.steps) {
    return {
      type: provider.steps.fieldLabels.type ?? GENERIC_RECORD_LABELS.type,
      name: provider.steps.fieldLabels.name,
      value: provider.steps.fieldLabels.value,
    }
  }
  return provider.recordLabels
}

export type ProviderVerdict = { provider: DnsProvider | null; nameservers: string[]; queried: string | null }

export async function detectDnsProvider(host: string): Promise<ProviderVerdict> {
  const parent = parentOf(host)
  if (!parent) return { provider: null, nameservers: [], queried: null }

  const res = await query(parent, 'NS')
  if (!res || !res.Answer) return { provider: null, nameservers: [], queried: parent }

  const ns = res.Answer.map(a => (a.data || '').toLowerCase().replace(/\.$/, '')).filter(Boolean)
  for (const p of DNS_PROVIDERS) {
    if (ns.some(n => p.nsMatch.some(m => n.includes(m)))) {
      const { nsMatch, ...provider } = p
      return { provider, nameservers: ns, queried: parent }
    }
  }
  return { provider: null, nameservers: ns, queried: parent }
}


/**
 * ── 🔴 THE SECOND APEX GUARD, AND IT DOES NOT USE THE LIST ──────────────────────────────────────
 *
 * Stage 5's guard reads the bundled public suffix list, and **its failure direction is PERMISSIVE**: a
 * suffix registered after that snapshot is not in it, so an operator's apex under that suffix parses
 * as a subdomain and sails through. That is the worst direction for a guard whose failure replaces a
 * business's website.
 *
 * 🔴 SO THIS ONE ASKS THE DNS LAYER INSTEAD, AND SHARES NO DATA WITH THE FIRST. **A zone apex has an
 * SOA record at its own name; a name inside that zone does not.** That fact is published by the zone
 * itself and is true for a suffix delegated this morning, because nothing has to know about the
 * suffix at all.
 *
 * ⚠️ ANSWER VERSUS AUTHORITY IS THE WHOLE TEST, AND GETTING IT WRONG INVERTS THE GUARD. Querying SOA
 * for a name that is NOT an apex still returns an SOA — in the **AUTHORITY** section, naming the
 * enclosing zone, which is how NXDOMAIN and NODATA carry their negative-caching TTL. Treating any SOA
 * in the response as an apex would refuse every valid subdomain. Only an SOA in the **ANSWER** section
 * whose owner name matches what was asked is an apex.
 *
 * ⚠️ FAILS OPEN. The list guard remains primary and has already run; a resolver outage must not stop
 * an operator whose address the primary guard cleared. `unknown` means "carry on".
 */
export type SoaVerdict = { state: 'apex' | 'not_apex' | 'unknown'; owner: string | null; section: 'answer' | 'authority' | null }

export async function checkApexViaSoa(host: string): Promise<SoaVerdict> {
  const name = (host || '').toLowerCase().replace(/\.$/, '')
  if (!name) return { state: 'unknown', owner: null, section: null }

  // 🔴 QUERIED AT EXACTLY WHAT THE OPERATOR TYPED. This is the one lookup in this file that does NOT
  // use the parent: the question is "is THIS name a zone apex", and asking about the parent would
  // answer a different question and always say yes.
  const res = await query(name, 'SOA')
  if (!res) return { state: 'unknown', owner: null, section: null }

  const norm = (s: string) => (s || '').toLowerCase().replace(/\.$/, '')
  const SOA = 6

  const answer = (res.Answer || []).filter(a => a.type === SOA)
  if (answer.some(a => norm(a.name) === name)) {
    return { state: 'apex', owner: name, section: 'answer' }
  }
  // An SOA in AUTHORITY names the enclosing zone — the normal answer for a subdomain, and the reason
  // a naive "did we get an SOA back" test would refuse everything.
  const authority = (res.Authority || []).filter(a => a.type === SOA)
  if (authority.length > 0) {
    return { state: 'not_apex', owner: norm(authority[0].name), section: 'authority' }
  }
  // NOERROR, no SOA anywhere: the name exists inside a zone and the resolver did not include the
  // negative-cache SOA. Not an apex, but say so with less confidence than the authority case.
  if (res.Status === 0) return { state: 'not_apex', owner: null, section: null }
  return { state: 'unknown', owner: null, section: null }
}

/**
 * What is ACTUALLY resolving at the custom domain — the daily check's diagnostic.
 * ⚠️ Returns the CNAME target verbatim, or null when nothing resolves. It draws no conclusion: the
 * caller compares it to what was expected, because "wrong" and "absent" are different conversations.
 */
export async function resolveCname(host: string): Promise<{ value: string | null; reachable: boolean }> {
  const name = (host || '').toLowerCase().replace(/\.$/, '')
  if (!name) return { value: null, reachable: false }
  const res = await query(name, 'CNAME')
  if (!res) return { value: null, reachable: false }   // resolver failure — NOT "the domain is down"
  const CNAME = 5
  const hit = (res.Answer || []).find(a => a.type === CNAME)
  return { value: hit ? (hit.data || '').toLowerCase().replace(/\.$/, '') : null, reachable: true }
}
