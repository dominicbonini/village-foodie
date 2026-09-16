// lib/whatsapp/graph-version.ts
// 🔴 ONE GRAPH VERSION FOR EVERY SERVER-SIDE CALL WE MAKE TO META.
//
// Before this file there were three, and their divergence was recorded but not fixed:
//   v19.0  the send path and the template calls   (lib/meta-whatsapp.ts)
//   v21.0  onboarding — exchange, register, subscribed_apps  (app/api/manage/whatsapp-signup/route.ts)
//   v26.0  the browser SDK                        (lib/whatsapp/embedded-signup.ts)
//
// The first two are now this constant. **The browser SDK is deliberately NOT included**: `FB.init`'s
// `version` selects the JS SDK release running in the operator's browser, which is a different artefact
// with a different lifecycle from the server's REST version. Forcing them equal would be a false tidy.
//
// 🔴 WHY v21.0 AND NOT v19.0. The send path moved UP to meet onboarding, not the reverse. Onboarding's
// version is the one that must satisfy Meta's Embedded Signup requirements, so it is the constrained
// end; the send path was on v19.0 only because it always had been, and its own header said so plainly:
// "It is the version this codebase has always sent on. Whether Meta still supports it… CANNOT BE
// DETERMINED FROM THIS REPOSITORY."
//
// ⚠️ WHAT MOVED WITH IT, AND THIS IS THE RISK TO WATCH: the two message-TEMPLATE functions in
// lib/meta-whatsapp.ts (`listMessageTemplates`, `createMessageTemplate`) share `GRAPH_BASE_URL`, so they
// move from v19.0 to v21.0 too. They are admin-only and never on a truck's path, but they are the
// consumers most likely to notice a version change, because template field shapes are what Meta
// actually revises between releases. Verify them on the admin templates page after deploying.
export const GRAPH_VERSION = 'v21.0'
