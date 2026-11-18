# Translation check — bs-BA

6017 keys checked against en-GB's 6003. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 606 · glossary 58 · banned 0 · invariants 0 · numbers 2 · length 190 · drift 871 · plans 0 · other 0.

## English left (606)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | English word(s): food, truck | Želite li ostaviti napojnicu za food truck? |
| `order.submitUnconfirmedCheck` | English word(s): food | Nismo mogli potvrditi da je vaša narudžba prošla. Možda je već na ekranu food trucka — provjerite s njima prije nego što |
| `order.state.confirmRejected` | English word(s): food, truck | Food truck nije prihvatio ovu narudžbu. |
| `order.state.menuUnavailable` | English word(s): food, truck | Ovaj food truck trenutno ne prima narudžbe. |
| `order.tipInPerson` | English word(s): food | Ako želite, napojnicu možete dati food trucku lično. |
| `order.tipNote` | English word(s): food | 100% vaše napojnice ide food trucku. Računa se na iznos hrane, prije poreza. |
| `order.backToTruckPage` | English word(s): food | ← Nazad na stranicu food trucka |
| `order.walkUpOnly` | English word(s): food, truck | Ovaj food truck prima narudžbe na licu mjesta, na šalteru. |
| `order.eventsLoadFailed` | English word(s): food | Nismo uspjeli učitati događaje ovog food trucka. |
| `order.timeNotSetBody` | English word(s): food, truck | Food truck još nije odredio vrijeme događaja — provjerite direktno s njima. Moći ćete naručiti ovdje čim vrijeme bude od |
| `order.pausedOfflineBody` | English word(s): problem | Imamo problem s vezom, ali i dalje možete naručiti na šalteru. Provjerite ponovo uskoro! |
| `order.notOpenBody` | English word(s): food, truck | Food truck {truck} još nije potvrdio ovaj događaj. Provjerite ponovo bliže datumu ili ih pratite na društvenim mrežama z |
| … | 594 more | |

## Glossary term not used (58)

| Key | Flag | Text |
|---|---|---|
| `dashboard.toast.intervalsSaved` | "Pickup time" → expected "vrijeme preuzimanja" | Termini preuzimanja sačuvani za ovaj događaj |
| `dashboard.toast.intervalsFailed` | "Pickup time" → expected "vrijeme preuzimanja" | Termini preuzimanja trenutno se ne mogu sačuvati. |
| `dashboard.settings.intervalsTitle` | "Pickup time" → expected "vrijeme preuzimanja" | Termini preuzimanja |
| `dashboard.settings.intervalsHelp` | "Pickup time" → expected "vrijeme preuzimanja" | Koliki je razmak između termina preuzimanja. Ovo ne mijenja kapacitet kuhinje ni vremena pripreme. |
| `dashboard.settings.intervalsUnavailable` | "Pickup time" → expected "vrijeme preuzimanja" | Termini preuzimanja trenutno nisu dostupni. |
| `dashboard.settings.customerTimes` | "Pickup time" → expected "vrijeme preuzimanja" | Termini preuzimanja za kupce |
| `dashboard.settings.yourTimes` | "Pickup time" → expected "vrijeme preuzimanja" | Vaši termini preuzimanja |
| `preorder.deadline` | "Pre-order" → expected "narudžba unaprijed" | Naručite unaprijed do {time} |
| `preorder.deadlineOnDay` | "Pre-order" → expected "narudžba unaprijed" | Naručite unaprijed do {time}, {day} |
| `emailCustomer.confirmation.cancelLine` | "Pickup time" → expected "vrijeme preuzimanja" | {n, plural, one {Trebate otkazati?<link>Otkažite narudžbu</link>(najkasnije {count} minutu prije vremena preuzimanja)} f |
| `eventCard.preOrder` | "Pre-order" → expected "narudžba unaprijed" | Naruči unaprijed |
| `errorsKitchen.intervals_choices` | "Pickup time" → expected "vrijeme preuzimanja" | Termini preuzimanja moraju biti na svakih {choices} minuta. |
| … | 46 more | |

## Numbers, prices or brands changed (2)

| Key | Flag | Text |
|---|---|---|
| `errorsManage.wp_caption_too_long` | number(s) 4000 not kept | Taj opis je predug — najviše 4.000 znakova. |
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | +387 61 123 456 |

## Likely to overflow (much longer than en-GB) (190)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | 43 chars vs en-GB 24 (×1.79) | Želite li ostaviti napojnicu za food truck? |
| `order.noTip` | 13 chars vs en-GB 6 (×2.17) | Bez napojnice |
| `order.otherTip` | 11 chars vs en-GB 5 (×2.20) | Drugi iznos |
| `order.retry` | 14 chars vs en-GB 5 (×2.80) | Pokušaj ponovo |
| `order.addDeal` | 16 chars vs en-GB 8 (×2.00) | Dodaj kombo meni |
| `order.placeOrder` | 26 chars vs en-GB 11 (×2.36) | Naruči uz obavezu plaćanja |
| `dashboard.toast.editFailed` | 20 chars vs en-GB 11 (×1.82) | Izmjena nije uspjela |
| `dashboard.cancelReasons.wrong_or_missing_item` | 38 chars vs en-GB 21 (×1.81) | Pogrešan artikal ili artikal nedostaje |
| `dashboard.banner.resume` | 25 chars vs en-GB 13 (×1.92) | Nastavi primanje narudžbi |
| `dashboard.settings.autoAcceptTitle` | 31 chars vs en-GB 18 (×1.72) | Automatsko prihvatanje narudžbi |
| `dashboard.stock.colLimit` | 11 chars vs en-GB 5 (×2.20) | Ograničenje |
| `dashboard.stock.colOn` | 7 chars vs en-GB 2 (×3.50) | Aktivno |
| … | 178 more | |

## Back-translation drifts from en-GB (871)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | meaning overlap 33% — en-GB: "Add a tip for the truck?" · back: "Would you like to leave a tip for the food truck?" | Želite li ostaviti napojnicu za food truck? |
| `order.submitUnconfirmedCard` | meaning overlap 46% — en-GB: "We couldn’t place your order. You haven’t been charged and no order was created — please t" · back: "We did not manage to send your order. Nothing has been charged to you and no order was cre" | Nismo uspjeli poslati vašu narudžbu. Ništa vam nije naplaćeno i narudžba nije kreirana — pokušajte ponovo. |
| `order.state.confirmRejected` | meaning overlap 33% — en-GB: "This order was not accepted by the truck." · back: "The food truck did not accept this order." | Food truck nije prihvatio ovu narudžbu. |
| `order.state.confirmLoadFailed` | meaning overlap 40% — en-GB: "We couldn’t load that order." · back: "We did not manage to load that order." | Nismo uspjeli učitati tu narudžbu. |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "The tip can be at most  {amount} ." | Napojnica može iznositi najviše {amount}. |
| `order.couldNotPlace` | meaning overlap 11% — en-GB: "We could not place your order. No money has been taken." · back: "We did not manage to send your order. Nothing has been charged to you." | Nismo uspjeli poslati vašu narudžbu. Ništa vam nije naplaćeno. |
| `order.paymentThrew` | meaning overlap 26% — en-GB: "Something went wrong taking that payment. No money has been taken — please try again, or c" · back: "An error occurred during payment. Nothing has been charged to you — try again or choose “P" | Došlo je do greške pri plaćanju. Ništa vam nije naplaćeno — pokušajte ponovo ili odaberite „Platite pri preuzimanju“. |
| `order.pausedNotice` | meaning overlap 42% — en-GB: "Orders are paused right now — please check back shortly. Your order is saved here." · back: "Orders are currently paused — check again soon. Your order is saved here." | Narudžbe su trenutno pauzirane — provjerite ponovo uskoro. Vaša narudžba je sačuvana ovdje. |
| `order.somethingWrong` | meaning overlap 38% — en-GB: "Something went wrong. Please try again." · back: "An error occurred. Please try again." | Došlo je do greške. Pokušajte ponovo. |
| `order.backToTruckPage` | meaning overlap 40% — en-GB: "← Back to truck page" · back: "← Back to the food truck’s page" | ← Nazad na stranicu food trucka |
| `order.walkUpOnly` | meaning overlap 38% — en-GB: "This truck takes walk-up orders at the hatch." · back: "This food truck takes orders on the spot, at the counter." | Ovaj food truck prima narudžbe na licu mjesta, na šalteru. |
| `order.eventsLoadFailed` | meaning overlap 43% — en-GB: "We couldn’t load this truck’s events." · back: "We did not manage to load this food truck’s events." | Nismo uspjeli učitati događaje ovog food trucka. |
| … | 859 more | |

