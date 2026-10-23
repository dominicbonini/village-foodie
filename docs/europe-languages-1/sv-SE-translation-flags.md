# Translation check — sv-SE

5057 keys checked against en-GB's 5043. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 160 · glossary 1 · banned 0 · invariants 0 · numbers 0 · length 120 · drift 964 · plans 0 · other 0.

## English left (160)

| Key | Flag | Text |
|---|---|---|
| `order.dualNetworkNotice` | English word(s): eftpos | Oavsett vilken betalmärkeslogotyp som visas när du anger dina betalningsuppgifter kan din betalning, när du använder ett |
| `order.namePlaceholder` | English word(s): sarah | t.ex. Sarah |
| `dashboard.toast.orderUrlMissing` | English word(s): slug | Beställningslänken är inte tillgänglig — slug saknas |
| `dashboard.settings.dueSoundHelp` | English word(s): orange | Låter när en bong blir orange. |
| `dashboard.stock.howItem` | English word(s): pepperoni | <b>Artikelgräns</b> sätter ett tak för just den artikeln inom potten (t.ex. bara 8 Pepperoni) — lämna tomt för att ta fr |
| `privateLink.noSlugTitle` | English word(s): redo | Den här foodtrucken är inte redo för onlinebeställning än. |
| `kitchenModals.actions.noteLabel` | English word(s): info | Info till kunderna |
| `kitchenModals.actions.saveNote` | English word(s): info | Spara info |
| `printing.card.noPrinter` | English word(s): bluetooth | <b>Ingen skrivare ansluten.</b> {withDetail, select, yes {{detail}. } other {}}Anslut en kvittoskrivare med Bluetooth fö |
| `printing.card.bluetoothOff` | English word(s): bluetooth | Bluetooth är avstängt på den här enheten. Slå på det i Inställningar och sök sedan igen. |
| `printing.card.bluetoothUnauthorised` | English word(s): bluetooth | HatchGrab behöver behörighet att använda Bluetooth. Tillåt det i Inställningar → HatchGrab → Bluetooth och sök sedan ige |
| `printing.card.addressHint` | English word(s): router | Skriv ut skrivarens inställningssida för att hitta adressen. Be den som installerade din router att låsa adressen. |
| … | 148 more | |

## Glossary term not used (1)

| Key | Flag | Text |
|---|---|---|
| `eventTypes.newType.chips.privateHire` | "Private hire" → expected "hyra en foodtruck" / "boka en foodtruck" | Hyra foodtruck |

## Likely to overflow (much longer than en-GB) (120)

| Key | Flag | Text |
|---|---|---|
| `order.orderFailed` | 26 chars vs en-GB 12 (×2.17) | Beställningen misslyckades |
| `order.retry` | 11 chars vs en-GB 5 (×2.20) | Försök igen |
| `order.notOpenTitle` | 32 chars vs en-GB 19 (×1.68) | Beställningen har inte öppnat än |
| `order.addDeal` | 16 chars vs en-GB 8 (×2.00) | Lägg till måltid |
| `order.add` | 9 chars vs en-GB 3 (×3.00) | Lägg till |
| `order.backToMyOrder` | 31 chars vs en-GB 18 (×1.72) | ← Tillbaka till min beställning |
| `order.placeOrder` | 32 chars vs en-GB 11 (×2.91) | Beställ med betalningsskyldighet |
| `order.orderReceived` | 26 chars vs en-GB 15 (×1.73) | Beställningen är mottagen! |
| `dashboard.toast.editFailed` | 22 chars vs en-GB 11 (×2.00) | Ändringen misslyckades |
| `dashboard.cancelModal.keep` | 20 chars vs en-GB 10 (×2.00) | Behåll beställningen |
| `dashboard.banner.resume` | 23 chars vs en-GB 13 (×1.77) | Återuppta beställningar |
| `dashboard.orders.prepBannerTitle` | 59 chars vs en-GB 37 (×1.59) | Ställ in tillagningstider innan du öppnar för beställningar |
| … | 108 more | |

## Back-translation drifts from en-GB (964)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | meaning overlap 33% — en-GB: "Add a tip for the truck?" · back: "Would you like to give a tip to the food truck?" | Vill du ge dricks till foodtrucken? |
| `order.state.confirmRejected` | meaning overlap 40% — en-GB: "This order was not accepted by the truck." · back: "This order was not approved by the food truck." | Den här beställningen godkändes inte av foodtrucken. |
| `order.tipInPerson` | meaning overlap 38% — en-GB: "Tip the truck in person if you like." · back: "Feel free to tip the food truck directly if you like." | Ge gärna dricks direkt till foodtrucken om du vill. |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "The tip can be at most  {amount} ." | Dricksen kan vara högst {amount}. |
| `order.pausedNotice` | meaning overlap 42% — en-GB: "Orders are paused right now — please check back shortly. Your order is saved here." · back: "Orders are paused right now — look in again in a while. Your order is saved here." | Beställningar är pausade just nu — titta in igen om en stund. Din beställning är sparad här. |
| `order.busyNotice` | meaning overlap 35% — en-GB: "We are handling a lot of orders right now — please tap Place order again in a moment. Your" · back: "We are receiving very many orders right now — tap “Order with obligation to pay” again in " | Vi tar emot väldigt många beställningar just nu — tryck på ”Beställ med betalningsskyldighet” igen om en stund. Din best |
| `order.backToTruckPage` | meaning overlap 40% — en-GB: "← Back to truck page" · back: "← Back to the food truck’s page" | ← Tillbaka till foodtruckens sida |
| `order.walkUpOnly` | meaning overlap 33% — en-GB: "This truck takes walk-up orders at the hatch." · back: "This food truck takes orders on the spot, at the counter window." | Den här foodtrucken tar emot beställningar på plats, i luckan. |
| `order.retrying` | meaning overlap 0% — en-GB: "Retrying…" · back: "Trying again…" | Försöker igen… |
| `order.retry` | meaning overlap 0% — en-GB: "Retry" · back: "Try again" | Försök igen |
| `order.timeNotSetTitle` | meaning overlap 17% — en-GB: "Ordering isn’t available for this event yet" · back: "It is not possible to order for this event yet" | Det går inte att beställa till det här evenemanget än |
| `order.timeNotSetBody` | meaning overlap 43% — en-GB: "The truck hasn’t set the event time yet — please check with them directly. You’ll be able " · back: "The food truck has not set the time for the event yet — contact them directly. You can ord" | Foodtrucken har inte angett tiden för evenemanget än — kontakta dem direkt. Du kan beställa här när tiden är satt. |
| … | 952 more | |

