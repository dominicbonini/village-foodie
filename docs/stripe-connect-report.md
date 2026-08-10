# Payments tab — four refinements

**Date:** 10 August 2026
**Styling and copy only.** No behaviour change, no change to the connection flow.
**Prompt integrity:** nothing arrived garbled, and **no instruction contradicted another** — nothing to stop and ask about.

**One file changed:** `components/manage/PaymentsTab.tsx`.

---

## 1. The trial banner is now the page's amber notice

### The treatment I found, quoted

`app/manage/[token]/page.tsx` uses one in-card amber notice, **three times**, identically — at `:887`, `:947` and `:5226`:

```jsx
<div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
  <p className="text-sm font-bold text-amber-800">Your allergen card</p>
  <p className="text-xs text-amber-700 mt-0.5">Customers see this exactly as you write it — nothing is rewritten…</p>
</div>
```

### Reused verbatim

```jsx
<div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
  <p className="text-xs text-amber-700">{CONNECTING_STRIPE_NOT_A_CHARGE}</p>
</div>
```

**Container class-for-class identical**; the sentence uses the pattern's own body treatment, `text-xs text-amber-700`. The only addition is `mt-3`, the spacing every sibling in that card already uses.

⚠️ **The heading line is omitted, deliberately** — the pattern's heading slot needs heading copy, and you said the wording stays as built. Inventing a heading to fill the slot would have been new copy. **One sentence, in the notice's body treatment, in the notice's container.**

**It was `bg-slate-50 border-slate-200 … text-slate-600`** — grey, beside a button, which reads as fine print. **The wording is unchanged.**

## 2. The walk-up options are boxed

### The treatment I found

`bg-slate-50 border border-slate-200 rounded-xl p-3` — the page's sub-panel container for a group of related settings. Manage → Settings uses it for **Taking payment**, **Notifications** and **Opening and closing** (`:8975`, `:9021`, `:9051`).

### Reused

```jsx
<div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
```

Same three classes, plus the `space-y-1.5` the two rows already had. **Presentation only** — the rows inside are untouched.

## 3. Online payments now states the price

```jsx
<p className="text-xs text-slate-500 mt-3">
  Stripe charges {CARD_FEE_ONLINE_LABEL} per payment on standard UK cards. Cards issued outside
  the UK and EEA cost more.
</p>
```

**Renders:** *"Stripe charges **1.5% + 20p** per payment on standard UK cards. Cards issued outside the UK and EEA cost more."*

- 🔴 **Whose fee, named:** *"Stripe charges…"*. It is the payment provider's rate, not ours.
- 🔴 **The plan's platform fee on online orders is NOT restated here.** It belongs to the plan, it already appears on the Billing tab, and putting it beside a provider rate is how an operator adds the two together or mistakes one for the other. The comment at the site says exactly that.
- ⚠️ **The qualifier `CARD_FEES` demands is present** — *"Cards issued outside the UK and EEA cost more"*, because the constant's own note says quoting the domestic rate alone *"would be a claim that is untrue for some customers"*.
- ⚠️ **One line.** Detail belongs in the plan pricing.

## 4. The button label stays `Connect Stripe` — decision recorded, nothing changed

No code change. The reasoning is now a comment immediately above the button so it is not revisited:

> 🔴 *"A generic 'Connect payments' was considered and rejected. Pressing this hands the operator straight to STRIPE'S OWN embedded form asking for bank details and photo ID — and a button that did not name Stripe, opening a stranger's identity check, is MORE alarming than one that did. Naming the provider is what makes the next screen make sense."*
>
> ⚠️ *"It also costs nothing in surprise: the section copy directly above already says money goes to 'your own Stripe account', so the name is on screen either way."*

---

## VERIFY

### The walk-up options are still non-interactive after being boxed ✅

```
$ awk '/══ WALK-UP PAYMENTS/,0' components/manage/PaymentsTab.tsx \
    | grep -E "onClick|href=|<button|<input|onChange|tabIndex|role=|<a "
  (three matches, all inside my own comments telling future readers not to add them)
```

**No handler, no control, nothing focusable, in either row or in the new container.** The box is a `<div>`; the rows remain `<div>`s with drawn radio circles. The coming-soon row keeps its dimmed `opacity-60` + badge — the codebase's `coming_soon` convention — and gained nothing.

### Every rate resolves from `CARD_FEES` ✅

```
$ grep -E "1\.4%|1\.5%|20p|10p" components/manage/PaymentsTab.tsx
  NONE
```

**No literal rate anywhere in the file.** The three labels, and what they render:

| Constant | Renders | Where |
|---|---|---|
| `CARD_FEE_ONLINE_LABEL` | **1.5% + 20p** | the new online price line |
| `CARD_FEE_IN_PERSON_LABEL` | **1.4% + 10p** | the walk-up coming-soon row |
| `TAP_TO_PAY_SURCHARGE_LABEL` | **10p** | same row, stated **separately** as `CARD_FEES` instructs |

### No fact repeated across the sections ✅

| Fact | Stated once, in |
|---|---|
| Stripe's **online** rate 1.5% + 20p | Online payments |
| No HatchGrab platform fee on walk-ups | Walk-up header |
| Stripe's **in-person** rate + Tap to Pay surcharge | Walk-up coming-soon row |
| The plan's platform fee on online orders | **Neither** — it lives on Billing |

Two different Stripe rates for two different things, each in its own section. The non-UK/EEA caveat appears once per rate, which is required rather than repetition — each is a qualifier on a different figure.

### 🔴 GUSTO — owner, on trial (`trial_expires_at` 17 Oct 2026), not connected

**Online payments** — *"Customers pay by card when they order. Money goes straight to your own Stripe account — we never hold it."*

> **Not connected** · *"Takes about 10 minutes. You'll need your bank details and ID."*
>
> 🟡 **AMBER NOTICE** — *"Connecting Stripe doesn't start your subscription or charge you anything — it's how your customers pay you, not how you pay us."*
>
> **[ Connect Stripe ]**
>
> *"Stripe charges **1.5% + 20p** per payment on standard UK cards. Cards issued outside the UK and EEA cost more."* ← **new**
> *"Test mode. No real payments can be taken yet."*

**Walk-up payments** — *"How you take money at the hatch. HatchGrab charges no platform fee on walk-ups, whichever you choose."*

> **In a grey sub-panel box:** ← **new**
> ● **Your own card terminal** `Current` — *Zettle, Square, or whatever you already use. Nothing to set up — only your provider's own fees apply.*
> ○ **Through HatchGrab** `Coming soon` *(dimmed)* — *Uses the same Stripe connection as your online payments — a card reader, or contactless straight from your phone or tablet.*
> *1.4% + 10p per payment on UK and EEA cards, plus 10p for contactless taken on a phone or tablet. Cards issued outside the UK and EEA cost more.*

**Four visible changes for them:** the trial sentence is now amber rather than grey, the walk-up options sit in a box, the online rate line is new, and the button is unchanged.

### tsc and lint

```
$ npx tsc --noEmit
TSC: 0

$ npx eslint .   (rule|severity, whole repo)
  vs the immediately-previous task : IDENTICAL
```

**No rule introduced, no count changed.**

### Behaviour unchanged ✅

`createAccount`, the `status` reconcile, `fetchClientSecret`, the account-session route, the three embedded components and every server file are untouched. **The diff is class strings, one new `<p>`, one new wrapper `<div>`, one import, and comments.**
