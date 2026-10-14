// lib/i18n/typecheck.ts — 🔴 PROOF THAT A MISSING KEY IS A COMPILE ERROR (Language Phase 0). `tsc --noEmit` fails
// if either line below STOPS being an error, i.e. if keys ever stop being checked against messages/en-GB.json.
// Never imported; it exists to be type-checked.
import { translatorFor } from './translator'

const t = translatorFor('en-GB', 'order')
// @ts-expect-error — 'notAKey' is not in messages/en-GB.json's "order" namespace
t('notAKey')
// @ts-expect-error — 'notANamespace' is not a namespace in messages/en-GB.json
translatorFor('en-GB', 'notANamespace')
export {}
