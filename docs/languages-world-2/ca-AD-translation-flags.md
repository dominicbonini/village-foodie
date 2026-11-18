# Translation check — ca-AD

6017 keys checked against en-GB's 6003. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 951 · glossary 61 · banned 0 · invariants 0 · numbers 2 · length 471 · drift 819 · plans 0 · other 0.

## English left (951)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | English word(s): food, truck | Vols deixar propina al food truck? |
| `order.submitUnconfirmedCheck` | English word(s): food, truck | No hem pogut confirmar que la teva comanda s’hagi enviat. Potser ja apareix a la pantalla del food truck: consulta-ho am |
| `order.state.confirmCancelled` | English word(s): cancel | Aquesta comanda s’ha cancel·lat. |
| `order.state.confirmRejected` | English word(s): food, truck | El food truck no ha acceptat aquesta comanda. |
| `order.state.menuUnavailable` | English word(s): food, truck | Ara mateix aquest food truck no accepta comandes. |
| `order.tipInPerson` | English word(s): food, truck | Si vols, pots deixar la propina en persona al food truck. |
| `order.tipAmount` | English word(s): import | Import de la propina |
| `order.tipNote` | English word(s): food, truck | El 100 % de la propina és per al food truck. Es calcula sobre el menjar, abans d’impostos. |
| `order.busyNotice` | English word(s): moment | Ara mateix estem gestionant moltes comandes: d’aquí a un moment torna a tocar Fes la comanda. La teva comanda queda desa |
| `order.backToTruckPage` | English word(s): food, truck | ← Torna a la pàgina del food truck |
| `order.walkUpOnly` | English word(s): food, truck | Aquest food truck només accepta comandes presencials, directament al food truck. |
| `order.eventsLoadFailed` | English word(s): food, truck | No hem pogut carregar els esdeveniments d’aquest food truck. |
| … | 939 more | |

## Glossary term not used (61)

| Key | Flag | Text |
|---|---|---|
| `dashboard.toast.intervalsSaved` | "Pickup time" → expected "hora de recollida" | Hores de recollida desades per a aquest esdeveniment |
| `dashboard.toast.intervalsFailed` | "Pickup time" → expected "hora de recollida" | Ara mateix no s’han pogut desar les hores de recollida. |
| `dashboard.settings.orderReadyHelp` | "KDS" → expected "pantalla de cuina (KDS)" | Mostra un botó «Marca com a preparada» a la pantalla de comandes. Les pantalles de cuina es configuren a part. Els clien |
| `dashboard.settings.intervalsTitle` | "Pickup time" → expected "hora de recollida" | Hores de recollida |
| `dashboard.settings.intervalsUnavailable` | "Pickup time" → expected "hora de recollida" | Ara mateix les hores de recollida no estan disponibles. |
| `dashboard.settings.customerTimes` | "Pickup time" → expected "hora de recollida" | Hores de recollida dels clients |
| `dashboard.settings.yourTimes` | "Pickup time" → expected "hora de recollida" | Les teves hores de recollida |
| `dashboard.kds.body` | "KDS" → expected "pantalla de cuina (KDS)" | Tria de quin vehicle vols obrir la pantalla de cuina: |
| `errorsKitchen.intervals_choices` | "Pickup time" → expected "hora de recollida" | Les hores de recollida han de ser cada {choices} minuts. |
| `errorsKitchen.intervals_customer_first` | "Pickup time" → expected "hora de recollida" | Defineix les hores de recollida dels clients abans de definir les teves. |
| `errorsKitchen.intervals_save_failed` | "Pickup time" → expected "hora de recollida" | Ara mateix no s’han pogut desar les hores de recollida. |
| `kitchenModals.createEvent.toastKds` | "KDS" → expected "pantalla de cuina (KDS)" | Canvia també la pantalla de cuina a aquest esdeveniment. |
| … | 49 more | |

## Numbers, prices or brands changed (2)

| Key | Flag | Text |
|---|---|---|
| `errorsManage.wp_caption_too_long` | number(s) 4000 not kept | Aquest text de la publicació és massa llarg: 4.000 caràcters com a màxim. |
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | +376 612 345 |

## Likely to overflow (much longer than en-GB) (471)

| Key | Flag | Text |
|---|---|---|
| `order.noTip` | 13 chars vs en-GB 6 (×2.17) | Sense propina |
| `order.tipAmount` | 20 chars vs en-GB 10 (×2.00) | Import de la propina |
| `order.loadingOrder` | 33 chars vs en-GB 19 (×1.74) | S’està carregant la teva comanda… |
| `order.backToTruckPage` | 34 chars vs en-GB 20 (×1.70) | ← Torna a la pàgina del food truck |
| `order.loadingMenu` | 26 chars vs en-GB 13 (×2.00) | S’està carregant la carta… |
| `order.retrying` | 24 chars vs en-GB 9 (×2.67) | S’està tornant a provar… |
| `order.retry` | 17 chars vs en-GB 5 (×3.40) | Torna-ho a provar |
| `order.checking` | 18 chars vs en-GB 9 (×2.00) | S’està comprovant… |
| `order.checkAgain` | 20 chars vs en-GB 11 (×1.82) | Torna a comprovar-ho |
| `order.notOpenTitle` | 36 chars vs en-GB 19 (×1.89) | Les comandes encara no estan obertes |
| `order.loadingEvents` | 36 chars vs en-GB 15 (×2.40) | S’estan carregant els esdeveniments… |
| `order.loadingTimes` | 40 chars vs en-GB 24 (×1.67) | S’estan carregant les hores disponibles… |
| … | 459 more | |

## Back-translation drifts from en-GB (819)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | meaning overlap 33% — en-GB: "Add a tip for the truck?" · back: "Do you want to leave a tip for the food truck?" | Vols deixar propina al food truck? |
| `order.state.confirmRejected` | meaning overlap 33% — en-GB: "This order was not accepted by the truck." · back: "The food truck did not accept this order." | El food truck no ha acceptat aquesta comanda. |
| `order.state.menuUnavailable` | meaning overlap 25% — en-GB: "This truck is not currently taking orders." · back: "Right now this food truck isn’t accepting orders." | Ara mateix aquest food truck no accepta comandes. |
| `order.otherTip` | meaning overlap 0% — en-GB: "Other" · back: "Another" | Una altra |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "The tip can be up to  {amount} ." | La propina pot ser de fins a {amount}. |
| `order.couldNotPlace` | meaning overlap 29% — en-GB: "We could not place your order. No money has been taken." · back: "We couldn’t place your order. Nothing has been charged." | No hem pogut fer la teva comanda. No s’ha cobrat res. |
| `order.pausedNotice` | meaning overlap 46% — en-GB: "Orders are paused right now — please check back shortly. Your order is saved here." · back: "Right now orders are paused: come back in a little while. Your order stays saved here." | Ara mateix les comandes estan en pausa: torna-hi d’aquí a una estona. La teva comanda queda desada aquí. |
| `order.menuChangedFallback` | meaning overlap 38% — en-GB: "The menu has changed. Please check your order before placing it." · back: "The menu has changed. Review the order before sending it." | La carta ha canviat. Revisa la comanda abans d’enviar-la. |
| `order.backToTruckPage` | meaning overlap 40% — en-GB: "← Back to truck page" · back: "← Back to the food truck’s page" | ← Torna a la pàgina del food truck |
| `order.walkUpOnly` | meaning overlap 38% — en-GB: "This truck takes walk-up orders at the hatch." · back: "This food truck only accepts walk-up orders, directly at the food truck." | Aquest food truck només accepta comandes presencials, directament al food truck. |
| `order.retrying` | meaning overlap 0% — en-GB: "Retrying…" · back: "Trying again…" | S’està tornant a provar… |
| `order.retry` | meaning overlap 0% — en-GB: "Retry" · back: "Try again" | Torna-ho a provar |
| … | 807 more | |

