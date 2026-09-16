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
  /** 🔴 Only when the chosen limit is ABOVE Meta's free allowance. */
  showAboveAllowanceNote: boolean
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
    showAboveAllowanceNote: connected && limit > allowance && allowance > 0,
    // 🔴 THE BUTTON GOES AWAY ON A WORKING CONNECTION. It used to render in every state, so a truck that
    // was answering messages perfectly well still saw "Set up" — an invitation to redo something that
    // was done. Offered when not ready, or when a reconnect is genuinely on the table.
    showSetupControl: !ready || reconnect,
  }
}
