// UNLISTED PREVIEW OF THE LANDING PAGE -- `/1ng7n4p5omux2gdk9kqvwz`.
//
// WHY THIS EXISTS: /landing is ADMIN-ONLY in production (app/landing/layout.tsx redirects any
// non-admin to /), so a reviewer with a link would have been bounced to the Village Foodie home page
// without ever seeing it. This route serves the SAME page with NO gate, so a link opens with no login.
//
// UNLISTED, NOT PRIVATE -- and that is accepted, not overlooked. Anyone with the link can forward it.
// There is deliberately no password, no cookie and no middleware check: the whole point is a URL that
// opens on the first tap. The path is 22 random lowercase-alphanumeric characters from
// `secrets.choice` (~113 bits) -- not a word, a date or anything derivable.
//
// IT IS THE SAME MODULE, NOT A COPY. Re-exporting means the page, its metadata (including
// `robots: { index: false, follow: false }`) and ./landing.css can never drift from /landing.
// A second copy of a 36KB page would have been the defect this avoids.
//
// TO RETIRE IT: delete this directory. Nothing links to it -- it exists only as a URL you hand out.
export { default, metadata } from '../landing/page'
