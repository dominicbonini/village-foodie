# Translation check — fr-SN

5785 keys checked against en-GB's 5771. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 143 · glossary 120 · banned 0 · invariants 0 · numbers 1 · length 254 · drift 364 · plans 0 · other 0.

## English left (143)

| Key | Flag | Text |
|---|---|---|
| `order.namePlaceholder` | English word(s): sarah | ex. Sarah |
| `plansPdf.terms` | English word(s): conditions | Les chiffres correspondent aux conditions publiées des offres à la date ci-dessus et peuvent évoluer. Les frais de trait |
| `dashboard.settings.colCountsTitle` | English word(s): sauces | Catégories prises en compte dans la capacité totale. Les catégories cuisinées comptent toujours ; cochez les catégories  |
| `dashboard.settings.countsTick` | English word(s): sauces | Cochez pour inclure cette catégorie instantanée (accompagnements, sauces, boissons) dans la limite commune par créneau |
| `dashboard.stock.followsCategoryTitle` | English word(s): suit | Suit le total de la catégorie — saisissez un nombre pour plafonner |
| `menuBadges.dietary.Halal` | identical to en-GB | Halal |
| `menuBadges.dietary.Lactose` | identical to en-GB | Lactose |
| `menuBadges.allergen.Lupin` | identical to en-GB | Lupin |
| `menuBadges.allergen.Kiwifruit` | English word(s): kiwi | Kiwi |
| `menuBadges.allergen.Naturallatex` | English word(s): latex | Latex naturel |
| `menuBadges.allergen.Lactose` | identical to en-GB | Lactose |
| `errorsKitchen.completed_payment_not_recorded` | English word(s): correction | Commande terminée, mais l’enregistrement du paiement n’a pas pu être sauvegardé — le montant encaissé pour cette command |
| … | 131 more | |

## Glossary term not used (120)

| Key | Flag | Text |
|---|---|---|
| `order.collectionTimeTitle` | "Pickup time" → expected "heure de retrait" | Heure de récupération |
| `order.collectionTimeChosen` | "Pickup time" → expected "heure de retrait" | ✓ Heure de récupération : {time} |
| `order.collectionTime` | "Pickup time" → expected "heure de retrait" | Heure de récupération : {time} |
| `order.willConfirmTime` | "Pickup time" → expected "heure de retrait" | {truck} confirmera votre heure de récupération en acceptant votre commande. |
| `dashboard.toast.intervalsSaved` | "Pickup time" → expected "heure de retrait" | Heures de récupération enregistrées pour cet événement |
| `dashboard.toast.intervalsFailed` | "Pickup time" → expected "heure de retrait" | Impossible d’enregistrer les heures de récupération pour le moment. |
| `dashboard.settings.intervalsTitle` | "Pickup time" → expected "heure de retrait" | Heures de récupération |
| `dashboard.settings.intervalsHelp` | "Pickup time" → expected "heure de retrait" | L’intervalle entre les heures de récupération. Cela ne modifie ni la capacité de la cuisine ni les temps de préparation. |
| `dashboard.settings.intervalsHelp` | "Kitchen capacity" → expected "limiter le nombre de commandes par créneau" | L’intervalle entre les heures de récupération. Cela ne modifie ni la capacité de la cuisine ni les temps de préparation. |
| `dashboard.settings.intervalsUnavailable` | "Pickup time" → expected "heure de retrait" | Les heures de récupération sont indisponibles pour le moment. |
| `dashboard.settings.customerTimes` | "Pickup time" → expected "heure de retrait" | Heures de récupération des clients |
| `dashboard.settings.yourTimes` | "Pickup time" → expected "heure de retrait" | Vos heures de récupération |
| … | 108 more | |

## Numbers, prices or brands changed (1)

| Key | Flag | Text |
|---|---|---|
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | +221 77 123 45 67 |

## Likely to overflow (much longer than en-GB) (254)

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
| `order.placeOrder` | 37 chars vs en-GB 11 (×3.36) | Commander avec obligation de paiement |
| `dashboard.toast.saveFailed` | 25 chars vs en-GB 14 (×1.79) | Échec de l’enregistrement |
| … | 242 more | |

## Back-translation drifts from en-GB (364)

| Key | Flag | Text |
|---|---|---|
| `order.taxNotice` | meaning overlap 44% — en-GB: "Menu prices don’t include  {tax} . It’s added below." · back: "Menu prices are excluding  {tax} . The amount is added below." | Les prix de la carte sont hors {tax}. Le montant est ajouté ci-dessous. |
| `order.tipInPerson` | meaning overlap 43% — en-GB: "Tip the truck in person if you like." · back: "Leave a tip for the food truck in person if you wish." | Laissez un pourboire au food truck sur place si vous le souhaitez. |
| `order.noTip` | meaning overlap 0% — en-GB: "No tip" · back: "None" | Aucun |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "The tip can go up to  {amount} ." | Le pourboire peut aller jusqu’à {amount}. |
| `order.pausedNotice` | meaning overlap 38% — en-GB: "Orders are paused right now — please check back shortly. Your order is saved here." · back: "Orders are paused at the moment — come back in a few moments. Your order is saved here." | Les commandes sont suspendues pour le moment — revenez dans quelques instants. Votre commande est enregistrée ici. |
| `order.busyNotice` | meaning overlap 47% — en-GB: "We are handling a lot of orders right now — please tap Place order again in a moment. Your" · back: "We are receiving a lot of orders right now — press “Order with obligation to pay” again in" | Nous recevons beaucoup de commandes en ce moment — appuyez à nouveau sur « Commander avec obligation de paiement » dans  |
| `order.somethingWrong` | meaning overlap 38% — en-GB: "Something went wrong. Please try again." · back: "A problem occurred. Please try again." | Un problème est survenu. Veuillez réessayer. |
| `order.walkUpOnly` | meaning overlap 43% — en-GB: "This truck takes walk-up orders at the hatch." · back: "This food truck takes orders only at the counter." | Ce food truck prend les commandes uniquement au comptoir. |
| `order.timeNotSetTitle` | meaning overlap 40% — en-GB: "Ordering isn’t available for this event yet" · back: "Ordering is not open yet for this event" | La commande n’est pas encore ouverte pour cet événement |
| `order.timeNotSetBody` | meaning overlap 47% — en-GB: "The truck hasn’t set the event time yet — please check with them directly. You’ll be able " · back: "The food truck has not set the event time yet — ask it directly. You will be able to order" | Le food truck n’a pas encore fixé l’horaire de l’événement — renseignez-vous directement auprès de lui. Vous pourrez com |
| `order.pausedOfflineBody` | meaning overlap 42% — en-GB: "We’re having a connection issue but you can still order at the window. Check back soon!" · back: "We are having a connection problem, but you can still order at the counter. Come back soon" | Nous rencontrons un problème de connexion, mais vous pouvez toujours commander au comptoir. Revenez bientôt ! |
| `order.pausedBody` | meaning overlap 30% — en-GB: "Check back shortly or order at the window when you arrive." · back: "Come back in a few moments or order at the counter when you arrive." | Revenez dans quelques instants ou commandez au comptoir à votre arrivée. |
| … | 352 more | |

