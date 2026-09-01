// ── 🔴 KEPT AFTER THE IFRAME REMOVAL (V11.49). ────────────────────────────────────────────────────
// Shell, TruckIdentity, PoweredBy and truckLogoUrl are the chrome of the CUSTOM-DOMAIN page
// (app/domain/page.tsx), which is their only caller now that the iframe route is gone.
/**
 * ── THE SCHEDULE PAGE'S PIECES, SHARED BY TWO ROUTES ────────────────────────────────────────────
 *
 * 🔴 EXTRACTED, NOT COPIED, AND THAT IS THE WHOLE REASON THIS FILE EXISTS. `/embed/<slug>` (inside an
 * operator's website) and `/` on an operator's own domain render the same page for different reasons.
 * Two copies would drift, and the one that drifted would be whichever nobody was looking at — the
 * §3 rule the platform records already answer for copy, applied here to markup.
 *
 * ⚠️ MOVED VERBATIM FROM `app/embed/[slug]/page.tsx`. Every class string, every element and every
 * comment is the original; only the location changed. The embed route's render is byte-identical
 * after the move, which is asserted by execution rather than assumed.
 */

/** The whole frame. White, because it sits in a box the operator sizes and styles around. */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white px-3 py-4 sm:px-4">
      <div className="mx-auto flex w-full max-w-2xl flex-col">{children}</div>
    </main>
  )
}

/** Build the public URL for an operator's uploaded logo, or null. One expression, two callers. */
export function truckLogoUrl(logoPath: string | null): string | null {
  return logoPath
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${logoPath}`
    : null
}

/**
 * The truck's OWN logo, or its name as text. Never a broken image.
 * 🔴 `trucks.logo_storage_path`, NOT `discovery_trucks.logo_url` — the operator's own upload, which is
 * the only one they control.
 * ⚠️ Plain <img>, not next/image: the bucket is public and unoptimised here on purpose — next/image
 * would put our image proxy in the request path of a third party's page.
 *
 * ── 🔴 A COLUMN, AND THE LOGO IS THE MASTHEAD (29 August 2026). ──────────────────────────────────
 * Was a 44px round logo BESIDE the name in a flex row. This page sits on the operator's own domain and
 * should read as theirs; a 44px avatar beside a 16px name read as a listing entry, not as a masthead.
 * Now `flex-col`: logo above, name beneath, both centred.
 *
 * 🔴 THE CIRCULAR CROP IS GONE, AND THAT IS A CONSEQUENCE OF THE SIZE RATHER THAN A SEPARATE TASTE
 * DECISION. `rounded-full` on an `object-contain` box letterboxes a non-square image inside a circle.
 * At 44px that is invisible. At 96px a WIDE WORDMARK — which is what most food-truck logos are —
 * becomes a thin strip floating in a large empty ring, with a border drawn around mostly nothing.
 * A height-capped `w-auto` box respects whatever shape they uploaded instead of imposing ours.
 *
 * ⚠️ HOW EACH SHAPE BEHAVES, since this is an arbitrary operator upload:
 *   • WIDE (a wordmark)  — `max-w-[80%]` binds before the height does, so it shrinks to fit the column
 *     and never touches the edges. It renders shorter than 96px, which is correct: it is still the
 *     full mark, just not artificially tall.
 *   • TALL (a badge/crest) — `h-24 sm:h-28` binds, `w-auto` keeps the aspect ratio, and it renders
 *     narrow. `object-contain` guarantees nothing is ever cropped in either case.
 *   • LOW-RESOLUTION — 🔴 THIS ONE GETS WORSE AND THERE IS NO MARKUP FIX. A 100px upload that looked
 *     acceptable at 44px is being asked to fill 96–112px and will look soft. It is the real cost of
 *     this change. Mitigated only by choosing a moderate size rather than the largest that would fit;
 *     the durable fix is a minimum-resolution check at upload, which is not this workstream.
 *
 * 🔴 BOTH BRANCHES ARE DELIBERATE, NOT ONE PLUS A FALLBACK. With no upload the name IS the identity, so
 * it renders LARGER (`text-2xl sm:text-3xl`) than it does under a logo (`text-lg sm:text-xl`). A page
 * whose only mark is a name set at the size it would take beneath a logo reads like an image failed to
 * load; set as the masthead itself, it reads as a decision.
 * ⚠️ THE `text-center` NOW ON THE h1 REVERSES AN EARLIER NOTE THAT ARGUED AGAINST IT. That note was
 * right for a ROW — a wrapped name beside a logo does read better ranged left under itself. In a
 * centred column a ranged-left second line would be visibly off-axis under the logo. The reasoning
 * changed because the layout did.
 */
export function TruckIdentity({ name, logoPath }: { name: string; logoPath: string | null }) {
  const logoUrl = truckLogoUrl(logoPath)

  return (
    <div className="mb-4 flex flex-col items-center gap-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={name}
          className="h-24 w-auto max-w-[80%] object-contain sm:h-28"
        />
      ) : null}
      <h1
        className={
          logoUrl
            ? 'text-center text-lg font-bold leading-tight text-slate-900 sm:text-xl'
            : 'text-center text-2xl font-bold leading-tight text-slate-900 sm:text-3xl'
        }
      >
        {name}
      </h1>
    </div>
  )
}

/** The only outbound brand mark on the surface, and the only link to us other than the fallback. */
export function PoweredBy() {
  return (
    /* ── 🔴 THE TREATMENT IS COPIED FROM THE ORDER EMAIL, NOT INVENTED (29 August 2026). ──────────
       lib/email.ts:416 already brands this exact line, and it is the version customers see most:

         <p style="text-align:center;margin-top:20px;font-size:11px;color:#94a3b8">
           Powered by <a href="https://hatchgrab.com"
                         style="color:#ea580c;text-decoration:none;font-weight:700">HatchGrab</a>
         </p>

       So: grey "Powered by", the WORD "HatchGrab" in brand orange at weight 700, no underline.
       A second in-app twin agrees — app/dashboard/[token]/page.tsx:5322 renders
       `Powered by <span className="font-semibold text-orange-600">HatchGrab</span>`. The two differ
       only in weight (700 vs 600); the email is the named source, so 700 wins.

       🔴 THE HEX AND THE TOKEN ARE NO LONGER THE SAME COLOUR, AND THE TOKEN IS THE RIGHT ONE HERE.
       The email hardcodes `#ea580c`, which WAS `orange-600` under Tailwind v3. This project is on
       Tailwind 4.3.1, whose `orange-600` paints `#f54a00` — measured, not assumed, by painting the
       computed colour to a canvas and reading the pixel back. So copying the email's literal hex
       would put a DIFFERENT orange on this word from every other orange on the same page:
       components/TruckListCard.tsx renders the event dates and links in `text-orange-600` too.
       ⚠️ lib/brand.ts:49 still describes "the app's orange-600 (#ea580c, 3.56:1)" — that line predates
       the v4 upgrade and is now stale. Flagged, not edited; it is outside this scope.
       ✅ WHAT IS COPIED IS THE TREATMENT — grey line, brand-orange bold word, no underline — using
       this app's own orange token, which is what "the brand orange" means on an app surface.

       ⚠️ THE SIZE IS THE ONE THING NOT TAKEN FROM THE EMAIL, AND IT IS DELIBERATE. The email is also
       11px, which is the very thing this change was asked to fix. `text-xs` (12px) with `slate-500`
       is the dashboard twin's grey and size — so the size still comes from an existing treatment
       rather than being picked. `mt-5` is the email's 20px.
       ⚠️ THE WHOLE LINE STAYS THE LINK, WHICH IS WHERE THIS DEPARTS FROM THE EMAIL'S STRUCTURE. The
       email links only the word. Narrowing the anchor would shrink the tap target to ~70×12px on a
       phone, and the brief says the link STAYS — so the extent is unchanged and only the styling is
       copied. Say the word and it becomes `Powered by <a>HatchGrab</a>` exactly as the email has it. */
    <p className="mt-5 text-center text-xs text-slate-500">
      {/* ── 🔴 `www`, NOT THE APEX. ────────────────────────────────────────────────────────────────
          This read `https://hatchgrab.com`. §43 records that the apex 307-redirects to `www`, so every
          load of an operator's custom-domain page carried a needless hop for anyone who clicked it.
          The env var with a `www` fallback is the shape app/domain/page.tsx:36 already uses — the page
          that renders this component — so the two cannot disagree about where we live.

          ── ⚠️ NO `target="_blank"`, AND NO `rel`. ───────────────────────────────────────────────────
          This sits at the foot of a page on the OPERATOR'S OWN DOMAIN. Opening in a new tab leaves our
          site sitting behind their page, which reads as an advertisement rather than an attribution —
          we are a credit here, not a destination competing for the visit. A plain link is the honest
          form, and it is also the one the visitor controls: anyone who wants a new tab can middle-click.
          ⚠️ `rel="noopener noreferrer"` goes WITH the target. It exists to stop a new tab reaching back
          through `window.opener`; a same-tab navigation has no opener to protect. Keeping it would be
          cargo — and `noreferrer` would additionally strip the referrer, hiding from our own analytics
          that the click came from an operator's domain, which is the one thing worth knowing here. */}
      <a
        href={process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'}
        className="transition-colors hover:text-slate-700"
      >
        Powered by <span className="font-bold text-orange-600">HatchGrab</span>
      </a>
    </p>
  )
}
