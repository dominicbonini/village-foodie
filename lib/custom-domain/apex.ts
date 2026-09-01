import psl from 'psl'

/**
 * ── 🔴 THE APEX GUARD. IT RUNS BEFORE ANY PROVISIONING CODE, AND THAT ORDER IS THE POINT. ────────
 *
 * An operator who points their APEX at us does not lose a subdomain — they lose their website. Before
 * Stage 4 the failure was worse than blank: an apex resolving here fell through to `app/page.tsx`, so
 * a truck's homepage became our Village Foodie consumer discovery map, listing their competitors, on
 * their own address. Stage 4 closed the resolution half; **this is the entry half, and it exists so an
 * operator never gets far enough for the other one to matter.**
 *
 * ── 🔴 COUNTING LABELS DOES NOT WORK, AND IT LOOKS LIKE IT DOES ─────────────────────────────────
 * The obvious test is `labels > 2`. It passes `schedule.theirtruck.co.uk` and it ALSO passes
 * `theirtruck.co.uk`, which has three labels and IS an apex — so the naive guard waves through every
 * `.co.uk` apex in the country, which is most of this customer base. `.org.uk`, `.ac.uk`, `.gov.uk`
 * and `.me.uk` fail the same way. **There is no arithmetic that answers this**, because how many
 * labels a registrable domain has is a property of the registry, not of the string.
 *
 * ── SO IT USES THE PUBLIC SUFFIX LIST ───────────────────────────────────────────────────────────
 * `psl.parse()` returns `subdomain: null` exactly when the input IS the registrable domain — the apex
 * — and a non-null subdomain otherwise. That is the whole test, and it is right on every suffix shape
 * because the list, not this file, knows where the boundary is.
 * ⚠️ **THE LIST IS A SNAPSHOT AND WILL AGE.** `psl` vendors it, as every implementation does; new
 * suffixes arrive by updating the package. That is a maintenance fact rather than a defect — but a
 * hand-written list in this repo would be the same snapshot with no update path at all, which is why
 * a dependency was added rather than a constant.
 */

export type ApexVerdict =
  | { ok: true; host: string; registrable: string; subdomain: string }
  | { ok: false; reason: 'empty' | 'unparseable' | 'apex' | 'not_a_domain' | 'too_deep'; host: string; message: string }

/** How many labels below the registrable domain we accept. `a.b.theirs.co.uk` is fine; deeper is not. */
const MAX_SUBDOMAIN_LABELS = 3

/**
 * @param input whatever the operator typed — with or without a scheme, with or without a path.
 *
 * 🔴 THE MESSAGES ARE THE OPERATOR'S, NOT A DEVELOPER'S. "That is your whole website address" is a
 * sentence an operator can act on; "apex domain rejected" is one they can only be confused by. The
 * apex case in particular has to explain the CONSEQUENCE, because an operator who does not understand
 * why we refused will simply try again with the same thing.
 */
export function checkSubdomain(input: string | null | undefined): ApexVerdict {
  const raw = (input ?? '').trim().toLowerCase()
  if (!raw) return { ok: false, reason: 'empty', host: '', message: 'Type the address you would like to use.' }

  // Strip anything that is not the hostname — a scheme, a path, a port, a trailing dot.
  let host = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .split(':')[0]
    .replace(/\.$/, '')

  if (!host || host.includes(' ') || !host.includes('.')) {
    return { ok: false, reason: 'not_a_domain', host, message: 'That does not look like a web address.' }
  }

  const parsed = psl.parse(host) as { domain: string | null; subdomain: string | null; error?: unknown }

  if (parsed.error || !parsed.domain) {
    return {
      ok: false, reason: 'unparseable', host,
      message: 'We could not read that as a web address. Check the spelling and try again.',
    }
  }

  // 🔴 THE GUARD. `subdomain === null` means the input IS the registrable domain.
  if (!parsed.subdomain) {
    return {
      ok: false, reason: 'apex', host,
      message: `${host} is your whole website address. If you point that at us, your website is replaced by this page. Put a word in front of it instead — for example events.${host}.`,
    }
  }

  if (parsed.subdomain.split('.').length > MAX_SUBDOMAIN_LABELS) {
    return {
      ok: false, reason: 'too_deep', host,
      message: 'That address has too many parts. Something like events.' + parsed.domain + ' works best.',
    }
  }

  return { ok: true, host, registrable: parsed.domain, subdomain: parsed.subdomain }
}

/**
 * The PARENT of the address the operator chose — i.e. the registrable domain.
 * 🔴 EVERY PRE-FLIGHT LOOKUP USES THIS AND NEVER THE NEW SUBDOMAIN. A lookup of a name that does not
 * exist yet returns NXDOMAIN, and resolvers cache that negative answer for the zone's negative-TTL
 * window — so the very act of checking early makes every later check lag reality, and the setup looks
 * slower than it is for a reason we caused. See lib/custom-domain/dns.ts.
 */
export function parentOf(host: string): string | null {
  const parsed = psl.parse(host.toLowerCase()) as { domain: string | null }
  return parsed.domain ?? null
}

/**
 * ── THE OPERATOR'S OWN DOMAIN, AS THEY WOULD RECOGNISE IT, FROM `trucks.website`. ──────────────────
 *
 * `https://www.pizzacompany.com/menu` → `pizzacompany.com`. Scheme, `www.`, port, path, query and
 * fragment all removed, then reduced to the REGISTRABLE domain by the public suffix list — so
 * `shop.pizzacompany.co.uk` also yields `pizzacompany.co.uk` rather than a deeper name they do not
 * think of as theirs.
 *
 * 🔴 THIS EXISTS TO BE SHOWN AS A FIXED, UNEDITABLE PART OF THE ADDRESS FIELD, WHICH IS A GUARD AND
 * NOT A CONVENIENCE. With the domain half uneditable, an apex and a mistyped domain are both
 * unreachable through the interface: whatever the operator types can only ever become a name IN FRONT
 * of this. ⚠️ It sits IN FRONT OF the existing apex guards, never instead of them — `checkSubdomain`
 * still runs on the assembled address, client-side and again on the server.
 *
 * Returns null when there is no website on the row, or when what is there does not parse to a
 * registrable domain. The caller asks the operator to type the domain in that case.
 *
 * ⚠️ NEW EXPORT — `checkSubdomain`, `parentOf` and `suggestFromWebsite` are untouched.
 */
export function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null
  const host = website.trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .split(':')[0]
    .replace(/\.$/, '')
  if (!host) return null
  return parentOf(host)
}

/** The suggestion, from `trucks.website`. Their own registrable domain with one word in front. */
export function suggestFromWebsite(website: string | null | undefined, word = 'schedule'): string | null {
  if (!website) return null
  const host = website.trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split(/[/?#]/)[0]
    .split(':')[0]
    .replace(/\.$/, '')
  const registrable = parentOf(host)
  if (!registrable) return null
  return `${word}.${registrable}`
}
