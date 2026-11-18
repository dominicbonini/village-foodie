// scripts/_named-dashboard-auth-3.cjs — dashboard-auth-3's two edits under app/(app), named so the path-freeze harnesses
// (scripts/cwv-2.cjs) can take them back EXACTLY and compare the rest byte for byte (docs/dashboard-auth-3-report.md).
//   • app/(app)/reset-password/page.tsx — the password reset's sign-out states its scope ('global': everywhere, as before);
//   • app/(app)/verify-email/VerifyEmailSuccess.tsx — the email change signs out only the confirming device ('local').
// undoCode(file, src): the source with that file's edit put back, `src` unchanged for any other file, or null when the edit is
// not there exactly once (so the caller fails rather than passing a file it cannot account for).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'

const EDITS = {
  'app/(app)/reset-password/page.tsx': [
    "      // dashboard-auth-3: a password reset still signs the account out EVERYWHERE — stated, not left to the default.\n      await createSupabaseBrowserClient().auth.signOut({ scope: 'global' })",
    '      await createSupabaseBrowserClient().auth.signOut()',
  ],
  'app/(app)/verify-email/VerifyEmailSuccess.tsx': [
    "    // dashboard-auth-3 (18 November 2026): the same screens and words (\"Signing you out…\", then log in with the new\n" +
    "    // address), but only THIS device's session ends (scope 'local'); every other device stays signed in, as Supabase leaves\n" +
    "    // them after an email change. (Was the default, 'global', which signed the account out everywhere.)\n" +
    "    supabase.auth.signOut({ scope: 'local' }).then(() => {",
    '    supabase.auth.signOut().then(() => {',
  ],
}

function undoCode(file, src) {
  const e = EDITS[file]
  if (!e) return src
  const [now, was] = e
  if (src.split(now).length !== 2) return null
  return src.replace(now, was)
}

module.exports = { EDITED_FILES: Object.keys(EDITS), undoCode }
