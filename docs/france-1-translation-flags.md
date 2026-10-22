# Translation check — fr-FR

5056 keys checked against en-GB's 5042. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 75 · glossary 69 · banned 0 · invariants 0 · numbers 0 · length 219 · drift 234 · plans 0 · other 0.

## English left (75)

| Key | Flag | Text |
|---|---|---|
| `order.namePlaceholder` | English word(s): sarah | ex. Sarah |
| `menuBadges.dietary.Halal` | identical to en-GB | Halal |
| `menuBadges.dietary.Lactose` | identical to en-GB | Lactose |
| `menuBadges.allergen.Lupin` | identical to en-GB | Lupin |
| `alertsOperator.paymentBlocked.payDirect` | English word(s): manager | Vous payez ces messages directement à WhatsApp : le problème se règle donc dans WhatsApp Manager, et non dans HatchGrab. |
| `alertsOperator.paymentBlocked.payDirectLink` | English word(s): manager | Vous payez ces messages directement à WhatsApp : le problème se règle donc dans WhatsApp Manager, et non dans HatchGrab. |
| `alertsOperator.paymentBlocked.button` | English word(s): manager | Ouvrir WhatsApp Manager |
| `cuisinePicker.cuisine.FishChips` | English word(s): fish | Fish & chips |
| `cuisinePicker.cuisine.Kebab` | identical to en-GB | Kebab |
| `cuisinePicker.cuisine.Tacos` | identical to en-GB | Tacos |
| `cuisinePicker.cuisine.Wraps` | identical to en-GB | Wraps |
| `emailSignup.signoffName` | identical to en-GB | Dominic |
| … | 63 more | |

## Glossary term not used (69)

| Key | Flag | Text |
|---|---|---|
| `order.privateEvent` | "Private event" → expected "privatisation" | Événement privé |
| `dashboard.settings.intervalsHelp` | "Kitchen capacity" → expected "limiter le nombre de commandes par créneau" | L’intervalle entre les heures de retrait. Cela ne modifie ni la capacité de la cuisine ni les temps de préparation. |
| `dashboard.settings.capacityTitle` | "Kitchen capacity" → expected "limiter le nombre de commandes par créneau" | Capacité de la cuisine |
| `dashboard.settings.assignTruck` | "Kitchen capacity" → expected "limiter le nombre de commandes par créneau" | Attribuez un food truck à cet événement avant de définir la capacité de la cuisine. |
| `preorder.closedPending` | "Pre-order" → expected "commander à l'avance" | Précommandes closes. En attente de validation par la cuisine. |
| `preorder.deadline` | "Pre-order" → expected "commander à l'avance" | Précommandes jusqu’à {time} |
| `preorder.deadlineOnDay` | "Pre-order" → expected "commander à l'avance" | Précommandes jusqu’à {time}, {day} |
| `preorder.opens` | "Pre-order" → expected "commander à l'avance" | Ouverture des précommandes : {day} |
| `privateLink.guestLabel` | "Private event" → expected "privatisation" | ÉVÉNEMENT PRIVÉ |
| `errorsKitchen.slot_board_not_updated` | "Kitchen capacity" → expected "limiter le nombre de commandes par créneau" | Commande enregistrée, mais le tableau de capacité de la cuisine n’a pas pu être mis à jour — vérifiez le créneau avant d |
| `printing.card.modeOnConfirmedHint` | "Pre-order" → expected "commander à l'avance" | Une précommande s’imprime lorsque vous l’acceptez, ce qui peut être plusieurs heures avant l’heure de retrait. Les comma |
| `dashboardBanners.kitchenCapacity` | "Kitchen capacity" → expected "limiter le nombre de commandes par créneau" | Capacité de la cuisine |
| … | 57 more | |

## Likely to overflow (much longer than en-GB) (219)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | 41 chars vs en-GB 24 (×1.71) | Ajouter un pourboire pour le food truck ? |
| `order.privacyLink` | 15 chars vs en-GB 7 (×2.14) | Confidentialité |
| `order.tipAmount` | 20 chars vs en-GB 10 (×2.00) | Montant du pourboire |
| `order.stockSomeSoldOut` | 41 chars vs en-GB 24 (×1.71) | certains articles viennent d’être épuisés |
| `order.loadingMenu` | 23 chars vs en-GB 13 (×1.77) | Chargement de la carte… |
| `order.loadingEvents` | 26 chars vs en-GB 15 (×1.73) | Chargement des événements… |
| `order.addDeal` | 18 chars vs en-GB 8 (×2.25) | Ajouter la formule |
| `order.asap` | 13 chars vs en-GB 6 (×2.17) | ⚡ Au plus tôt |
| `order.asapOnly` | 22 chars vs en-GB 9 (×2.44) | Au plus tôt uniquement |
| `order.payNowByCard` | 26 chars vs en-GB 15 (×1.73) | Payer maintenant par carte |
| `order.placeOrder` | 29 chars vs en-GB 11 (×2.64) | Commander et payer au retrait |
| `dashboard.toast.saveFailed` | 25 chars vs en-GB 14 (×1.79) | Échec de l’enregistrement |
| … | 207 more | |

## Back-translation drifts from en-GB (234)

| Key | Flag | Text |
|---|---|---|
| `order.taxNotice` | meaning overlap 44% — en-GB: "Menu prices don’t include  {tax} . It’s added below." · back: "Menu prices are excluding  {tax} . The amount is added below." | Les prix de la carte sont hors {tax}. Le montant est ajouté ci-dessous. |
| `order.tipInPerson` | meaning overlap 43% — en-GB: "Tip the truck in person if you like." · back: "Leave a tip for the food truck in person if you wish." | Laissez un pourboire au food truck sur place si vous le souhaitez. |
| `order.noTip` | meaning overlap 0% — en-GB: "No tip" · back: "None" | Aucun |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "The tip can go up to  {amount} ." | Le pourboire peut aller jusqu’à {amount}. |
| `order.pausedNotice` | meaning overlap 38% — en-GB: "Orders are paused right now — please check back shortly. Your order is saved here." · back: "Orders are paused at the moment — come back in a few moments. Your order is saved here." | Les commandes sont suspendues pour le moment — revenez dans quelques instants. Votre commande est enregistrée ici. |
| `order.busyNotice` | meaning overlap 47% — en-GB: "We are handling a lot of orders right now — please tap Place order again in a moment. Your" · back: "We are receiving a lot of orders right now — press “Order and pay on collection” again in " | Nous recevons beaucoup de commandes en ce moment — appuyez à nouveau sur « Commander et payer au retrait » dans un insta |
| `order.somethingWrong` | meaning overlap 38% — en-GB: "Something went wrong. Please try again." · back: "A problem occurred. Please try again." | Un problème est survenu. Veuillez réessayer. |
| `order.walkUpOnly` | meaning overlap 43% — en-GB: "This truck takes walk-up orders at the hatch." · back: "This food truck takes orders only at the counter." | Ce food truck prend les commandes uniquement au comptoir. |
| `order.timeNotSetTitle` | meaning overlap 40% — en-GB: "Ordering isn’t available for this event yet" · back: "Ordering is not open yet for this event" | La commande n’est pas encore ouverte pour cet événement |
| `order.timeNotSetBody` | meaning overlap 47% — en-GB: "The truck hasn’t set the event time yet — please check with them directly. You’ll be able " · back: "The food truck has not set the event time yet — ask it directly. You will be able to order" | Le food truck n’a pas encore fixé l’horaire de l’événement — renseignez-vous directement auprès de lui. Vous pourrez com |
| `order.pausedOfflineBody` | meaning overlap 42% — en-GB: "We’re having a connection issue but you can still order at the window. Check back soon!" · back: "We are having a connection problem, but you can still order at the counter. Come back soon" | Nous rencontrons un problème de connexion, mais vous pouvez toujours commander au comptoir. Revenez bientôt ! |
| `order.pausedBody` | meaning overlap 30% — en-GB: "Check back shortly or order at the window when you arrive." · back: "Come back in a few moments or order at the counter when you arrive." | Revenez dans quelques instants ou commandez au comptoir à votre arrivée. |
| … | 222 more | |

