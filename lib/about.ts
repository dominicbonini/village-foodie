// lib/about.ts — THE ABOUT PAGE'S FACTS (about-page, 22 October 2026, docs/about-page-report.md). PURE AND CLIENT-SAFE: the
// photo check, which reads the filesystem, is lib/about-server.ts.
//
// One page, /about, on the HatchGrab host only (Village Foodie has none — app/about/page.tsx 404s there). Its words are the
// `aboutPage` messages; its company line is lib/company.ts; the founder's name is COMPANY.founder.
//
// 🔴 THE PHOTO IS OPTIONAL AND NEVER A PLACEHOLDER. public/about/dominic.jpg is used when the file exists; until then the page
// renders no image at all (the story takes the full width) and the Organization JSON-LD names the founder without an image.
// Dropping the file into public/about/ and deploying is the whole step — no code change.

/** The page's address. */
export const ABOUT_PATH = '/about'

/** The founder's photo, as the site serves it (public/about/dominic.jpg). */
export const ABOUT_PHOTO_PATH = '/about/dominic.jpg'

/** When the page's words last changed — the sitemap's lastmod (a "D Month YYYY" date, as lib/legal.ts writes them).
 *  ⚠️ MOVE IT WHEN THE STORY CHANGES (adding the photo is a change too). */
export const ABOUT_UPDATED = '22 October 2026'
