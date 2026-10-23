# Translation check — nl-BE

5057 keys checked against en-GB's 5043. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 404 · glossary 38 · banned 0 · invariants 0 · numbers 1 · length 148 · drift 1016 · plans 0 · other 0.

## English left (404)

| Key | Flag | Text |
|---|---|---|
| `order.privacyLink` | identical to en-GB | Privacy |
| `order.closedDemo` | English word(s): open | Deze demodienst is afgelopen — het tijdvak van het evenement is verstreken, precies zoals bij een echte dienst. Open je  |
| `order.notOpenBody` | English word(s): social, media | {truck} heeft dit evenement nog niet bevestigd. Kijk dichter bij de datum nog eens of volg ze op social media voor updat |
| `order.dualNetworkNotice` | English word(s): eftpos | Ongeacht het logo van het betaalmerk dat wordt getoond wanneer je je betaalgegevens invoert, kan je betaling, telkens wa |
| `order.namePlaceholder` | English word(s): sarah | bijv. Sarah |
| `order.notesPlaceholder` | English word(s): extra | Allergieën, geen ui, extra krokant… |
| `order.payEitherLine` | English word(s): truck | Betaal met kaart of bij de truck |
| `order.cardFallback` | English word(s): truck | We konden de kaartbetaling niet starten, dus je bestelling staat nu op betalen bij de truck. Je bestelling is geplaatst  |
| `order.notePlaceholder` | English word(s): extra | bijv. geen ui, extra krokant |
| `plansPdf.omitNote` | English word(s): document | Prijzen zijn bewust niet in dit document opgenomen. |
| `plansPdf.terms` | English word(s): document, contract | De cijfers zijn de gepubliceerde abonnementsvoorwaarden op bovenstaande datum en kunnen veranderen. Kosten voor kaartver |
| `dashboard.toast.orderUrlMissing` | English word(s): slug | Bestel-URL niet beschikbaar — slug niet ingesteld |
| … | 392 more | |

## Glossary term not used (38)

| Key | Flag | Text |
|---|---|---|
| `dashboard.settings.intervalsHelp` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Hoeveel tijd er tussen de afhaaltijden zit. Dit verandert niets aan de keukencapaciteit of de bereidingstijden. |
| `dashboard.settings.capacityTitle` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Keukencapaciteit |
| `dashboard.settings.assignTruck` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Wijs een foodtruck aan dit evenement toe voordat je de keukencapaciteit instelt. |
| `dashboardBanners.kitchenCapacity` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Keukencapaciteit |
| `alertsOperator.limit100.subject` | "WhatsApp auto-reply" → expected "automatisch antwoord" | Je automatische WhatsApp-antwoorden zijn voor deze maand gepauzeerd |
| `goLive.kitchenCapacityUnset.title` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Stel je keukencapaciteit in |
| `goLive.kitchenCapacityUnset.where` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Menu → Keukencapaciteit |
| `walkthrough.stops.build.body` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Deals, upselling, aanpassingen en je keukencapaciteit vind je onder Menu — probeer gerust wat uit. |
| `manageMenu.category.countsTitle` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Telt mee voor de keukencapaciteit (in te stellen bij Menu → Keukencapaciteit) |
| `manageMenu.category.prepHelp` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Kies Direct voor items zoals drankjes of dips. Die tellen niet mee voor de keukencapaciteit. |
| `manageMenuImport.kitchen.howWorks` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Zo werkt keukencapaciteit |
| `manageMenuImport.discard.body` | "Kitchen capacity" → expected "maximaal aantal bestellingen per tijdslot" | Je wijzigingen worden niet opgeslagen — de geïmporteerde items, bereidingstijden en keukencapaciteit worden niet toegevo |
| … | 26 more | |

## Numbers, prices or brands changed (1)

| Key | Flag | Text |
|---|---|---|
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | +31 6 12345678 |

## Likely to overflow (much longer than en-GB) (148)

| Key | Flag | Text |
|---|---|---|
| `order.retrying` | 17 chars vs en-GB 9 (×1.89) | Opnieuw proberen… |
| `order.add` | 9 chars vs en-GB 3 (×3.00) | Toevoegen |
| `order.asap` | 18 chars vs en-GB 6 (×3.00) | ⚡ Zo snel mogelijk |
| `order.asapOnly` | 23 chars vs en-GB 9 (×2.56) | Alleen zo snel mogelijk |
| `order.placeOrder` | 36 chars vs en-GB 11 (×3.27) | Bestelling met betalingsverplichting |
| `dashboard.qr.alt` | 23 chars vs en-GB 13 (×1.77) | QR-code om te bestellen |
| `dashboard.extraWait.add` | 25 chars vs en-GB 14 (×1.79) | Extra wachttijd toevoegen |
| `dashboard.orders.undo` | 14 chars vs en-GB 4 (×3.50) | Ongedaan maken |
| `dashboard.prep.buttonTitle` | 31 chars vs en-GB 17 (×1.82) | Voorbereidingslijst van vandaag |
| `dashboard.prep.button` | 12 chars vs en-GB 4 (×3.00) | Voorbereiden |
| `dashboard.settings.newOrderSound` | 28 chars vs en-GB 15 (×1.87) | Geluid bij nieuwe bestelling |
| `dashboard.settings.useUsual` | 34 chars vs en-GB 20 (×1.70) | Gebruikelijke instelling gebruiken |
| … | 136 more | |

## Back-translation drifts from en-GB (1016)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | meaning overlap 40% — en-GB: "Add a tip for the truck?" · back: "Give a tip to the food truck?" | Een fooi geven aan de foodtruck? |
| `order.submitUnconfirmedCard` | meaning overlap 45% — en-GB: "We couldn’t place your order. You haven’t been charged and no order was created — please t" · back: "We could not place your order. Nothing has been debited and no order has been created — tr" | We konden je bestelling niet plaatsen. Er is niets afgeschreven en er is geen bestelling aangemaakt — probeer het opnieu |
| `order.tipInPerson` | meaning overlap 29% — en-GB: "Tip the truck in person if you like." · back: "You can also give the food truck a tip on the spot." | Je kunt de foodtruck ook ter plekke een fooi geven. |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "A tip can be at most  {amount} ." | Een fooi kan maximaal {amount} zijn. |
| `order.authFailed` | meaning overlap 0% — en-GB: "That payment could not be authorised. No money has been taken — please try another card, o" · back: "(nl-BE) Belgian wording of the nl-NL sentence" | Die betaling kon niet worden geautoriseerd. Er is geen geld afgeschreven — probeer een andere kaart of kies ‘Ter plaatse |
| `order.paymentThrew` | meaning overlap 0% — en-GB: "Something went wrong taking that payment. No money has been taken — please try again, or c" · back: "(nl-BE) Belgian wording of the nl-NL sentence" | Er ging iets mis bij die betaling. Er is geen geld afgeschreven — probeer het opnieuw of kies ‘Ter plaatse betalen’. |
| `order.busyNotice` | meaning overlap 47% — en-GB: "We are handling a lot of orders right now — please tap Place order again in a moment. Your" · back: "We are getting a lot of orders at the moment — tap ‘Order with obligation to pay’ again sh" | We krijgen op dit moment veel bestellingen — tik zo nog een keer op ‘Bestelling met betalingsverplichting’. Je bestellin |
| `order.walkUpOnly` | meaning overlap 43% — en-GB: "This truck takes walk-up orders at the hatch." · back: "This food truck only takes orders at the counter." | Deze foodtruck neemt alleen bestellingen aan het loket aan. |
| `order.retrying` | meaning overlap 0% — en-GB: "Retrying…" · back: "Trying again…" | Opnieuw proberen… |
| `order.retry` | meaning overlap 0% — en-GB: "Retry" · back: "Again" | Opnieuw |
| `order.timeNotSetTitle` | meaning overlap 40% — en-GB: "Ordering isn’t available for this event yet" · back: "Ordering is not yet possible for this event" | Bestellen is voor dit evenement nog niet mogelijk |
| `order.timeNotSetBody` | meaning overlap 33% — en-GB: "The truck hasn’t set the event time yet — please check with them directly. You’ll be able " · back: "The food truck has not set the event time yet — ask the food truck itself. Once it is set," | De foodtruck heeft de tijd van het evenement nog niet ingesteld — vraag het de foodtruck zelf. Zodra die is ingesteld, k |
| … | 1004 more | |

