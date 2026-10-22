import { APP_STORE_URL, APP_STORE_BADGE_SRC, GOOGLE_PLAY_URL, GOOGLE_PLAY_BADGE_SRC, appStoreUrlFor } from '@/lib/app-badges'
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/landingFooter'

/**
 * ── THE TWO STORE BADGES. ONE COMPONENT, EVERY SURFACE THAT OFFERS THE APPS. ─────────────────────
 *
 * 🔴 SHARED RATHER THAN REPEATED, AND FOR A HARDER REASON THAN TIDINESS: the ORDER and the COLOUR are
 * vendor rules, not styling. Apple: *"Place the App Store badge first in the lineup of badges"* and
 * *"whenever one or more badges for other app platforms appear in the layout, use the preferred black
 * badge."* A second hand-written copy of this markup is a second place those rules can be got wrong,
 * on a surface nobody re-reads.
 * 🟢 THE ORDER IS SATISFIED BY CONSTRUCTION: Apple's `<a>` is first in the DOM and the wrapper is a
 * plain flex row with no `order` property, so CSS cannot re-sequence it.
 *
 * 🔴 UNMODIFIED VENDOR ARTWORK. No filter, transform, shadow, radius or hover effect on either image —
 * both vendors forbid altering their badge. Height is set and width follows, so neither can be scaled
 * off-ratio.
 * ⚠️ THE TWO WIDTHS DIFFER AND THAT IS CORRECT. At height 40 Apple's is 119.66px and Google's 134.87px
 * — same height, different word count. Forcing equal widths would scale one off-ratio.
 *
 * ⚠️ NEITHER BADGE RENDERS WITHOUT ITS URL. Guarded individually, so if a listing is ever pulled the
 * other still shows. A badge pointing at nothing is worse than one badge.
 */
/**
 * ⚠️ THE WRAPPER AND LINK CLASSES ARE REPLACEABLE, NOT APPENDED. The landing footer is styled by
 * `landing.css` (`.foot-apps` sets its own flex, a 1.25rem gap that satisfies Apple's clear-space rule
 * for a pair, and centring below 760px); Settings is styled by Tailwind. Appending would put two gap
 * rules on one element and let stylesheet order decide — the "works until it doesn't" shape this
 * codebase keeps recording. Passing a class REPLACES the default so exactly one rule owns the layout.
 */
export function StoreBadges({
  className,
  linkClassName = '',
  height = 40,
  countryCode,
  locale,
}: { className?: string; linkClassName?: string; height?: number
  /** languages-1: the page's language for the badges' alt and aria words (`landingFooter.badges`); absent → en-GB. */
  locale?: string | null
  /** Language Phase 1e: the page's country. GB or absent ⇒ the UK storefront link, exactly as before; any other
   *  country ⇒ the locale-free App Store link (`appStoreUrlFor`), so a US visitor is not sent to the GB store. */
  countryCode?: string | null }) {
  const wrap = className ?? 'flex flex-wrap items-center gap-4'
  const t = translatorFor(locale, 'landingFooter')
  // seo-fixes S7 (20 October 2026): both badges sit low on the page (the landing footer, Manage › Settings), so they are
  // `loading="lazy"` — which also stops React preloading them in the <head>, where they competed with the hero image.
  // The reserved width × height above means a lazy load shifts nothing.
  // 238.96 × 70.87 and 119.66 × 40 — the two viewBoxes. Widths derived so the reserved box is right
  // before the SVGs load; the CSS height is what actually sizes them.
  const playW = Math.round((238.96 / 70.87) * height)
  const appleW = Math.round((119.66407 / 40) * height)
  return (
    <div className={wrap}>
      {APP_STORE_URL && (
        <a href={appStoreUrlFor(countryCode)} target="_blank" rel="noopener noreferrer" className={linkClassName} aria-label={t('badges.appStoreLink')}>
          <img src={APP_STORE_BADGE_SRC} alt={t('badges.appStoreAlt')} width={appleW} height={height} loading="lazy" style={{ height, width: 'auto', display: 'block' }} />
        </a>
      )}
      {GOOGLE_PLAY_URL && (
        <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer" className={linkClassName} aria-label={t('badges.googlePlayLink')}>
          <img src={GOOGLE_PLAY_BADGE_SRC} alt={t('badges.googlePlayAlt')} width={playW} height={height} loading="lazy" style={{ height, width: 'auto', display: 'block' }} />
        </a>
      )}
    </div>
  )
}
