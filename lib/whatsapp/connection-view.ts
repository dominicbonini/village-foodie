// lib/whatsapp/connection-view.ts
// 🔴 WHAT THE WHATSAPP ROW SHOWS. One pure function: connection state and stored values in, display
// decisions out. The markup renders what this returns and decides nothing of its own.
//
// ── WHY A VIEW MODEL RATHER THAN CONDITIONALS IN THE JSX ────────────────────────────────────────────
// The row has six connection states and two nullable values, which is fourteen combinations. Expressed
// as nested ternaries in markup, "does a revoked connection with no stored name still claim Connected?"
// is a question nobody can answer without rendering it. Here it is a function call in a harness.
//
// 🔴 THE RULE THAT IS EASIEST TO BREAK: NEVER INVENT A NUMBER. The operator used to type one into a free
// text box, so the row could show a number that Meta had never linked. The only numbers shown now are
// ones Meta itself returned for the connected phone number id. A null shows nothing — not a placeholder,
// not the old typed value, not "unknown".

import type { WhatsAppConnectionState } from './connection-state'

export interface WhatsAppRowInput {
  state: WhatsAppConnectionState
  displayPhoneNumber: string | null
  verifiedName: string | null
  /** Whether the operator may reconnect — from `shouldOfferReauthorise`, not re-derived here. */
  offerReauthorise?: boolean
  /** The truck's chosen ceiling, for the "above the free allowance" note. */
  monthlyLimit?: number
  /** Meta's free allowance. Injected so this module carries no number of Meta's. */
  freeAllowance?: number
  /** 🔴 THREE-VALUED. true = added, false = confirmed absent, null/undefined = never asked. */
  paymentMethodPresent?: boolean | null
  /** 🔴 WHEN META REFUSED A REAL SEND FOR BILLING (131042), or null/undefined for "it has not". */
  paymentBlockedAt?: string | null
}

export interface WhatsAppRowFact { label: string; value: string }

export interface WhatsAppRowView {
  /** 🔴 ALWAYS FALSE. Declared, not implied: the free-text number box is gone from every live state, and
   *  a harness can assert that rather than a reader having to trust the markup. */
  showNumberInput: false
  /** Read-only facts about the linked number, in display order. Empty when Meta told us nothing. */
  facts: WhatsAppRowFact[]
  /** Shown only when a connection is working and carries no facts to show. Never invented detail. */
  showBareConnected: boolean
  /** The Set up / Reconnect control is offered whenever the operator can act. */
  showSetupControl: boolean
  /** 🔴 A green "Connected" label REPLACES the button on a working connection. */
  showConnectedLabel: boolean
  /** The pop-up instruction is only useful before a window has to open. */
  showPopupInstruction: boolean
  /** Disconnect is offered whenever there is something to disconnect. */
  showDisconnect: boolean
  /** The limit select and usage line only make sense once a connection exists. */
  showMonthlyLimit: boolean
  /** "{number} · {name}", or whichever exists, or null. 🔴 NEVER INVENTED — see the note below. */
  subtitle: string | null
  /** The "Requires a WhatsApp Business account." line: a prerequisite, so only before there is one. */
  showRequiresAccountHelper: boolean
  /** 🔴 'unknown' IS NOT 'missing'. Null means nobody asked Meta, and saying "no payment method" on
   *  the strength of a column we never populate would be inventing a fact about their account. */
  paymentStatus: 'added' | 'missing' | 'unknown' | null
  /** The amber note: a real risk only when the limit exceeds the free allowance AND we cannot say a
   *  payment method is there. 🔴 'added' silences it — that is the case with nothing to warn about. */
  showAboveAllowanceWarning: boolean
  /** 🔴 TWO VARIANTS, NOT THREE. 'missing' is the only case where we KNOW there is no payment method;
   *  everything else the warning covers is 'general', which describes the requirement without asserting
   *  anything about their account. The old 'unknown' variant said "if you haven't added a payment
   *  method", which is the same sentence wearing a guess. */
  aboveAllowanceWarningVariant: 'missing' | 'general' | null
  /** 🔴 THE "Payment method" ROW, AND IT IS NOW SILENT WHEN WE DO NOT KNOW. It showed a grey
   *  "Not checked" pill for `unknown`, which is the live state for every connection — so the row's
   *  normal appearance was an admission that we had not looked. A row that only ever says "we don't
   *  know" is worse than no row: it invites an operator to fix something we cannot tell them is wrong.
   *  Shown only for 'added' or 'missing' — the two states we can actually stand behind. */
  showBillingPaymentRow: boolean
  /** The Billing section itself. Shown even when disconnected: who charges for what is the thing an
   *  operator most needs BEFORE connecting, not after their first invoice. */
  showBillingSection: boolean
  /** 🔴 THE RED BANNER: META IS REFUSING TO SEND THIS TRUCK'S REPLIES BECAUSE OF BILLING.
   *  This is the ONE payment statement on this card that is not an inference — it is set only when a
   *  real send came back with error 131042, which is why it may be stated flatly while
   *  `paymentStatus` has to hedge.
   *  ⚠️ IT OUTRANKS THE AMBER ALLOWANCE NOTE (see `showAboveAllowanceWarning` below): "you might go
   *  over your free allowance" is noise next to "your replies are not going out right now". */
  showPaymentBlockedBanner: boolean
}

const trimmed = (v: string | null): string | null => (v && v.trim() ? v.trim() : null)

/**
 * ⚠️ FACTS ARE SHOWN IN EVERY STATE THAT HAS A CONNECTION, INCLUDING `revoked`, AND THAT IS DELIBERATE.
 * "This account is linked to +44…" stays true when a token expires; the token is our access, not their
 * link. Hiding the number the moment a token lapses would make a reauthorisation prompt look like a
 * different truck's problem.
 *
 * 🔴 BUT ONLY `ready` MAY SAY THE BARE WORD "Connected". Every other state has something wrong with it,
 * and a one-word "Connected" beside a Reconnect button would contradict the button. Where there is
 * nothing to show and the state is not ready, the row shows nothing extra — the existing state messages
 * and the button label already carry it.
 */
export function whatsAppRowView(input: WhatsAppRowInput): WhatsAppRowView {
  const number = trimmed(input.displayPhoneNumber)
  const name = trimmed(input.verifiedName)
  const connected = input.state !== 'not_connected'

  const facts: WhatsAppRowFact[] = []
  if (connected && number) facts.push({ label: 'Connected number', value: number })
  if (connected && name) facts.push({ label: 'Business name', value: name })

  // 🔴 "CONNECTED" IS `ready` AND NOTHING ELSE. Every other state has something wrong with it, and a
  // green label beside a Reconnect button would contradict the button.
  const ready = input.state === 'ready'
  const reconnect = input.offerReauthorise === true
  const limit = input.monthlyLimit ?? 0
  const allowance = input.freeAllowance ?? 0

  // 🔴 THE SUBTITLE IS BUILT ONLY FROM VALUES META RETURNED. Two, one, or null — never a placeholder,
  // never "unknown", never the operator's old typed `whatsapp_sender`. A subtitle that invents a number
  // is worse than no subtitle, because it reads as confirmation that the right line is connected.
  // ⚠️ Gated on `connected` like the facts above it, so a stale value on a disconnected row says nothing.
  const subtitle = !connected ? null : ([number, name].filter(Boolean).join(' · ') || null)

  // 🔴 THREE-VALUED, AND THE THIRD VALUE IS THE HONEST ONE. Nothing in this codebase writes true or
  // false — both signup paths store null and the comment there says "NULL = UNREAD. Never write `false`
  // for 'we did not ask'." So 'unknown' is the live case, and collapsing it into 'missing' would put a
  // claim about the operator's Meta account on screen that we have never checked.
  const paymentStatus: WhatsAppRowView['paymentStatus'] = !connected
    ? null
    : input.paymentMethodPresent === true ? 'added'
    : input.paymentMethodPresent === false ? 'missing'
    : 'unknown'

  // 🔴 STRICTLY ABOVE, AND SILENT WHEN A METHOD IS KNOWN PRESENT. At exactly the allowance they are
  // still inside it; with a method added there is nothing to stop. Both halves must hold.
  // 🔴 AN OBSERVED REFUSAL, GATED ON `connected`. A stale timestamp on a row whose connection has since
  // been torn down must not raise a banner about a connection that no longer exists.
  const showPaymentBlockedBanner = connected && !!trimmed(input.paymentBlockedAt ?? null)

  const showAboveAllowanceWarning =
    connected && allowance > 0 && limit > allowance && paymentStatus !== 'added'
    // 🔴 SUPPRESSED BY THE BANNER. Both are about paying Meta, and showing an amber "you may exceed the
    // free allowance" hint directly above a red "your replies are being refused" banner buries the one
    // that is actually happening under the one that might.
    && !showPaymentBlockedBanner

  return {
    showNumberInput: false,
    facts,
    showBareConnected: ready && facts.length === 0,
    showConnectedLabel: ready,
    // ⚠️ HIDDEN THE MOMENT THERE IS NOTHING TO OPEN. The instruction exists to pre-empt a blocked pop-up;
    // on a working connection it is a sentence about a window that is not going to appear.
    showPopupInstruction: !ready,
    showDisconnect: connected,
    showMonthlyLimit: connected,
    // 🔴 STRICTLY ABOVE. At exactly the allowance the operator is still inside it, and telling them they
    // will be charged would be false.
    subtitle,
    // A prerequisite, not a description: once connected they plainly have one.
    showRequiresAccountHelper: !connected,
    paymentStatus,
    showAboveAllowanceWarning,
    // 🔴 'missing' ONLY WHEN WE KNOW IT IS MISSING. Everything else the warning covers — today, every
    // connection, because nothing writes the column — gets the 'general' wording.
    aboveAllowanceWarningVariant: showAboveAllowanceWarning ? (paymentStatus === 'missing' ? 'missing' : 'general') : null,
    showBillingPaymentRow: connected && (paymentStatus === 'added' || paymentStatus === 'missing'),
    showPaymentBlockedBanner,
    showBillingSection: true,
    // 🔴 THE BUTTON GOES AWAY ON A WORKING CONNECTION. It used to render in every state, so a truck that
    // was answering messages perfectly well still saw "Set up" — an invitation to redo something that
    // was done. Offered when not ready, or when a reconnect is genuinely on the table.
    showSetupControl: !ready || reconnect,
  }
}
