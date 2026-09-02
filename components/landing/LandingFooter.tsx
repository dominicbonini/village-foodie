// components/landing/LandingFooter.tsx
// 🔴 THE LANDING'S FOOTER, EXTRACTED 23 August 2026 — MOVED, NOT REWRITTEN. Byte-identical to what sat
// inline in app/landing/page.tsx apart from a uniform 4-space dedent, which JSX does not render.
//
// ── 🔴 IT MUST BE RENDERED INSIDE `.hg-landing` ────────────────────────────────────────────────────
// Every rule in app/landing/landing.css is scoped under `.hg-landing` (195 of 195), and the wrapper must
// carry the three font CSS variables too. Outside it this is unstyled markup.
// ⚠️ Unlike the nav, this has NO client dependency — no DemoCta, no state. It is a plain server
// component and needs no provider.
import { HEADER_BG } from '@/lib/brand'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/legal'

// ⚠️ `landingHref` — see the long note in LandingNav.tsx for why this is a prop and not a hardcoded
// path. Default '' keeps the bare fragment, which is the landing's own behaviour and is byte-identical.
/**
 * THE APP STORE PRODUCT-PAGE URL. Supplied by Dominic 2 September 2026 and VERIFIED LIVE, not assumed:
 * Apple's own lookup API returns resultCount 1 for id 6803543106 on the GB storefront —
 *   trackName "HatchGrab" · sellerName "HATCHGRAB LTD" · Business · Free · iOS 15.0+ · iPhone AND iPad
 *   released 2026-08-31, version 1.0(2)
 *
 * 🔴 THE `/gb/` SEGMENT IS LOAD-BEARING. DO NOT "TIDY" IT OUT.
 * The URL as first supplied had no country code — https://apps.apple.com/app/hatchgrab/id6803543106 —
 * and it **404s**. Measured with a browser user-agent following redirects:
 *     404  https://apps.apple.com/app/hatchgrab/id6803543106       <- as supplied
 *     200  https://apps.apple.com/gb/app/hatchgrab/id6803543106    <- this one
 * The reason is that the app is published to the **GB storefront only**: the same lookup returns
 * resultCount 0 for `us` and for the default storefront. A locale-less apps.apple.com link resolves
 * against the VISITOR'S storefront, so for anyone outside GB it finds nothing and 404s. Naming the
 * storefront explicitly makes the link work for every visitor, which matters because this footer is
 * served to whoever loads the page.
 * ⚠️ WHEN THE APP IS PUBLISHED TO MORE STOREFRONTS, revisit this: a locale-less URL then becomes the
 * better link, because it sends each visitor to their OWN store rather than forcing them to the UK one.
 * ⚠️ NO `?uo=4`. Apple's lookup returns the canonical URL with that affiliate parameter attached; it is
 * not needed and is deliberately not carried.
 *
 * ⚠️ IT IS THE PRODUCT PAGE, NOT A SMART/REDIRECT URL, which is what Apple requires the badge to link to.
 * See docs/landing-footer-badge-report.md 4 for what Android and desktop visitors see, and why this
 * link cannot open an already-installed app today (no associated-domains entitlement, no AASA file).
 */
export const APP_STORE_URL = 'https://apps.apple.com/gb/app/hatchgrab/id6803543106'

export function LandingFooter({ landingHref = '' }: { landingHref?: string } = {}) {
  return (
  <footer className={HEADER_BG}>
    <div className="wrap">
      <div className="foot-grid">
        <div>
          {/* `block` (live at every width — the reset does not touch `display`) puts the wordmark on
              its own line instead of an inline baseline.
              `foot-logo` is the CENTRING HOOK, and it is a CSS class rather than a Tailwind utility on
              purpose: `.hg-landing * { margin: 0 }` in landing.css ties Tailwind's `mx-auto` on
              specificity and wins on source order, so `mx-auto` here was silently doing NOTHING. The
              rule lives in landing.css's existing @media(max-width:720px) block — mobile only, same
              breakpoint that collapses .foot-grid, same margin-inline:auto mechanism as .foot-tag.
              ⚠️ Desktop is untouched: above 720px no rule matches, so the wordmark keeps margin:0 and
              stays left in its space-between column. */}
          <HatchGrabWordmark variant="dark" className="block foot-logo" />
          {/* Same slogan and same line break as the hero tagline (:148), so the two agree.
              ⚠️ Deliberately WITHOUT the hero's `.lean` orange accent on "cooking." — the footer tag
              is muted #8A93A6 by design and an orange word here was not asked for. */}
          <p className="foot-tag">Less time booking.<br />More time cooking.</p>
        </div>
        {/* 🔴 THE RIGHT COLUMN — LINKS ON TOP, BADGE BENEATH THEM.
            Moved here 2 September 2026 on request, and only AFTER the middle position was built and
            measured: at 1280px the badge sat with 278.3px of empty footer on BOTH sides — more than
            twice its own width — and read as floating rather than placed. Dominic, on seeing it:
            "no that doesnt look right. move it. below the links on the right."
            🟢 A COLUMN WRAPPER IS THE WHOLE MECHANISM. .foot-grid stays the same `space-between` row
            with TWO children; this div is the second, stacking .foot-links and .foot-apps with
            `align-items: flex-end` so the badge hangs under the links' right edge rather than drifting.
            The brand block on the left is untouched and keeps its position.
            ⚠️ MOBILE: @media(max-width:720px) turns .foot-grid into a centred column and switches this
            wrapper to `align-items: center`, so the stack reads brand -> links -> badge, all centred. */}
        <div className="foot-right">
          <div className="foot-links">
            <a href={`${landingHref}#pricing`}>Pricing</a>
            <a href={PRIVACY_PATH}>Privacy</a>
            <a href={TERMS_PATH}>Terms</a>
            {/* 🔴 WAS `href="#"` — a control that went nowhere, then /support, which was deleted on
                20 August 2026. Now /contact, which serves HatchGrab chrome on this host and is the
                Support URL given to App Store review.
                ⚠️ `?topic=General%20Enquiry` IS THE TOPIC /support HARDCODED into its embed URL, and
                it is the same parameter Village Foodie's own footer Contact link sends
                (components/Footer.tsx). Carried across so this link opens the form where it always
                did rather than on an empty topic. */}
            <a href="/contact?topic=General%20Enquiry">Contact</a>
          </div>
            {/* ── 🔴 APP STORE BADGE ─────────────────────────────────────────────────────
                IN THE BRAND COLUMN, UNDER THE TAGLINE — not in .foot-base and not in .foot-links.
                Reasons, in order: (a) .foot-links is a TEXT row on a 1.4rem gap; a 40px image in it would
                break that rhythm and could not be given Apple's required clear space; (b) .foot-base is the
                legal strip (© line, Village Foodie credit) and a download control is not legal text;
                (c) wordmark → tagline → badges is the conventional footer brand block, and it inherits the
                existing mobile centring FOR FREE — @media(max-width:720px) already turns .foot-grid into a
                centred column, so no new mobile rule is needed to centre this.
                ⚠️ A PLAIN <img>, NOT next/image, DELIBERATELY. next/image will not optimise an SVG without
                `dangerouslyAllowSVG`, and Apple forbids modifying the artwork — so the file is served
                exactly as supplied and nothing in the pipeline touches it. */}
            <div className="foot-apps">
              <a href={APP_STORE_URL} className="foot-badge" aria-label="Download HatchGrab on the App Store">
                {/* 🔴 UNMODIFIED VENDOR ARTWORK. No filter, transform, shadow, radius or hover effect —
                    Apple: "Don't modify, angle, or animate the App Store badge." The CSS sets HEIGHT only
                    and lets width follow, so it can never be scaled off-ratio.
                    🟢 BLACK VARIANT, SWITCHED FROM WHITE ON 2 SEPTEMBER 2026 ON REQUEST. The white badge
                    read as a bright slab on bg-slate-900. Apple's black badge is a near-black field with a
                    #a6a6a6 border and white lettering, so on a dark footer it reads as a bordered control
                    rather than a cut-out. Both are official artwork, unmodified, and both are permitted —
                    this is a choice between two supplied files, not an edit to either.
                    🟢 AND IT PRE-SOLVES THE ANDROID SWITCH. Apple: "Whenever one or more badges for other
                    app platforms appear in the layout, use the preferred black badge." Being on black
                    already means adding the Play badge needs NO colour change and NO light panel behind the
                    pair — the rework the earlier report flagged as the unavoidable cost of the white badge.
                    ⚠️ The white file stays in public/badges/ — it is the right one if this footer ever goes
                    light. See public/badges/README.md. */}
                <img
                  src="/badges/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg"
                  alt="Download on the App Store"
                  width={120}
                  height={40}
                />
              </a>
              {/* 🟢 THE SECOND SLOT IS HERE, AND THE LAYOUT IS ALREADY SIZED FOR IT. Android is in review
                  as of 2 September 2026. When it publishes: add the Google Play badge as a SIBLING <a>
                  immediately below this comment — Apple requires ITS badge FIRST in the lineup, so the Play
                  badge goes after, never before — and swap the white Apple badge above for the black one,
                  which Apple also requires the moment another platform's badge appears. `.foot-apps` is
                  already a wrapping flex row whose gap satisfies the clear-space rule for two, so nothing
                  else in the footer has to move. See docs/landing-footer-badge-report.md §2. */}
            </div>
        </div>
      </div>
      {/* 🔴 REVERSED ON 2 SEPTEMBER 2026, ON REQUEST — THE ORIGINAL REASONING IS KEPT BELOW ON PURPOSE.
          Dominic: "the badge goes in the LANDING PAGE FOOTER... That block is about a feature; the footer
          is where people look for a download. I am aware this reverses my own 18 August instruction
          against app badges in the footer."
          🟢 WHAT CHANGED IS THE PRECONDITION, NOT THE JUDGEMENT. The 18 August rule's stated reason was
          "a badge [must] link to a LIVE listing and there is none yet". The iOS app is now live, so that
          reason is spent and the badge above is legitimate.
          ⚠️ THE REST OF THE OLD RULE STILL BINDS, and is exactly why there is no Play badge yet: Android
          is in review, Google's brand terms do not permit a Play badge for an unpublished app, and the
          page's copy must keep saying "coming soon", never "available".
          ── THE ORIGINAL NOTE, LEFT INTACT AS THE RECORD ───────────────────────────────────────
          THE APP LINE WAS REMOVED HERE — 18 August 2026, ON REQUEST. The footer no longer mentions
          the iPhone/iPad apps at all. The rule it used to satisfy still binds anything that brings it
          back: TEXT ONLY, NO APP STORE OR GOOGLE PLAY BADGE, NO LOGO, NO LINK — Apple's marketing
          guidelines require a badge to link to a LIVE listing and there is none yet — and "COMING
          SOON", NEVER "AVAILABLE".
          ⚠️ NOTHING ELSE IN THE FOOTER MOVED. `.foot-base` is a `space-between` flex row with no
          nth-child rule (landing.css:329), so the two remaining spans simply sit at the two ends. */}
      <div className="foot-base">
        <span>© 2026 HatchGrab</span>
        <span className="vf">From the people behind <b>Village Foodie</b></span>
      </div>
    </div>
  </footer>
  )
}
