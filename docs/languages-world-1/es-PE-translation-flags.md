# Translation check — es-PE

5785 keys checked against en-GB's 5771. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 268 · glossary 111 · banned 0 · invariants 0 · numbers 3 · length 218 · drift 986 · plans 0 · other 0.

## English left (268)

| Key | Flag | Text |
|---|---|---|
| `order.orderFailed` | English word(s): error | Error en el pedido |
| `order.dualNetworkNotice` | English word(s): uses, eftpos | Independientemente del logotipo de la marca de pago que se muestre al ingresar tus datos de pago, siempre que uses una t |
| `order.demoFormNote` | English word(s): sale | Es un formulario real, así que necesita un email para hacer el pedido, pero no se envía nada. Ni confirmación ni mensaje |
| `order.namePlaceholder` | English word(s): sarah | p. ej. Sarah |
| `dashboard.toast.orderUrlMissing` | English word(s): slug | URL de pedido no disponible: falta el slug |
| `dashboard.toast.failed` | English word(s): error | Error |
| `dashboard.demo.lockWhy` | English word(s): control | En la demo mantenemos un evento en marcha para que siempre tengas algo con lo que probar. Cuando te registres tendrás el |
| `dashboard.prep.button` | English word(s): prep | Prep. |
| `dashboard.settings.layoutTabsHelp` | English word(s): ideal | Muestra una categoría a la vez. Toca una categoría para cambiar. Ideal para cartas largas, donde cada producto se queda  |
| `dashboard.settings.layoutScrollHelp` | English word(s): ideal | Muestra todos los productos en una lista con desplazamiento, con un encabezado por categoría. No hay botones de categorí |
| `dashboard.settings.colPrep` | English word(s): prep | Prep. |
| `dashboard.stock.howItem` | English word(s): pepperoni | El <b>límite del producto</b> limita solo ese producto dentro de la reserva (p. ej. solo 8 Pepperoni). Déjalo vacío para |
| … | 256 more | |

## Glossary term not used (111)

| Key | Flag | Text |
|---|---|---|
| `order.collectionTimeTitle` | "Pickup time" → expected "hora de recogida" | Hora de recojo |
| `order.collectionTimeChosen` | "Pickup time" → expected "hora de recogida" | ✓ Hora de recojo: {time} |
| `order.collectionTime` | "Pickup time" → expected "hora de recogida" | Hora de recojo: {time} |
| `order.willConfirmTime` | "Pickup time" → expected "hora de recogida" | {truck} confirmará tu hora de recojo cuando acepte tu pedido. |
| `dashboard.toast.intervalsSaved` | "Pickup time" → expected "hora de recogida" | Horas de recojo guardadas para este evento |
| `dashboard.toast.intervalsFailed` | "Pickup time" → expected "hora de recogida" | No se han podido guardar las horas de recojo en este momento. |
| `dashboard.header.kitchenScreen` | "KDS" → expected "pantalla de cocina (KDS)" | Pantalla de cocina |
| `dashboard.settings.orderReadyHelp` | "KDS" → expected "pantalla de cocina (KDS)" | Muestra un botón “Marcar como listo” en la pantalla de pedidos. Las pantallas de cocina se configuran por separado. Los  |
| `dashboard.settings.intervalsTitle` | "Pickup time" → expected "hora de recogida" | Horas de recojo |
| `dashboard.settings.intervalsHelp` | "Pickup time" → expected "hora de recogida" | Cuánto tiempo hay entre una hora de recojo y la siguiente. No cambia la capacidad de cocina ni los tiempos de preparació |
| `dashboard.settings.intervalsHelp` | "Kitchen capacity" → expected "pedidos máximos por franja" | Cuánto tiempo hay entre una hora de recojo y la siguiente. No cambia la capacidad de cocina ni los tiempos de preparació |
| `dashboard.settings.intervalsUnavailable` | "Pickup time" → expected "hora de recogida" | Las horas de recojo no están disponibles ahora mismo. |
| … | 99 more | |

## Numbers, prices or brands changed (3)

| Key | Flag | Text |
|---|---|---|
| `errorsManage.charges_rate_decimals` | number(s) 8.875 not kept | Usa hasta 3 decimales, por ejemplo 8,875. |
| `errorsManage.wp_caption_too_long` | number(s) 4000 not kept | Ese texto es demasiado largo: 4.000 caracteres como máximo. |
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | +51 912 345 678 |

## Likely to overflow (much longer than en-GB) (218)

| Key | Flag | Text |
|---|---|---|
| `order.tipAmount` | 19 chars vs en-GB 10 (×1.90) | Monto de la propina |
| `order.backToTruckPage` | 35 chars vs en-GB 20 (×1.75) | ← Volver a la página del food truck |
| `order.notOpenTitle` | 33 chars vs en-GB 19 (×1.74) | Los pedidos aún no están abiertos |
| `order.asap` | 14 chars vs en-GB 6 (×2.33) | ⚡ Cuanto antes |
| `order.asapOnly` | 17 chars vs en-GB 9 (×1.89) | Solo cuanto antes |
| `order.noEvent` | 31 chars vs en-GB 18 (×1.72) | No hay ningún evento disponible |
| `dashboard.toast.editFailed` | 22 chars vs en-GB 11 (×2.00) | No se ha podido editar |
| `dashboard.qr.tapToClose` | 35 chars vs en-GB 21 (×1.67) | Toca en cualquier sitio para cerrar |
| `dashboard.header.screenTitle` | 76 chars vs en-GB 46 (×1.65) | {state, select, on {La pantalla se mantendrá encendida} other {Toca para mantener la pantalla encendida}} |
| `dashboard.header.screen` | 36 chars vs en-GB 21 (×1.71) | {state, select, on {Pantalla encendida} other {Pantalla apagada}} |
| `dashboard.orders.statDone` | 11 chars vs en-GB 4 (×2.75) | Completados |
| `dashboard.settings.autoAcceptTitle` | 31 chars vs en-GB 18 (×1.72) | Aceptar pedidos automáticamente |
| … | 206 more | |

## Back-translation drifts from en-GB (986)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | meaning overlap 33% — en-GB: "Add a tip for the truck?" · back: "Do you want to leave a tip for the food truck?" | ¿Quieres dejar propina al food truck? |
| `order.state.confirmNotFound` | meaning overlap 25% — en-GB: "We couldn’t find that order." · back: "We have not found that order." | No hemos encontrado ese pedido. |
| `order.state.menuUnavailable` | meaning overlap 29% — en-GB: "This truck is not currently taking orders." · back: "This food truck is not accepting orders at the moment." | Este food truck no acepta pedidos en este momento. |
| `order.confirmMissing` | meaning overlap 25% — en-GB: "We couldn’t find that order." · back: "We have not found that order." | No hemos encontrado ese pedido. |
| `order.yourNamedDeal` | meaning overlap 0% — en-GB: "your  {name}  deal" · back: "your  {name}  combo" | tu combo {name} |
| `order.noServiceFee` | meaning overlap 33% — en-GB: "No service fee." · back: "No service charges." | Sin gastos de servicio. |
| `order.tipInPerson` | meaning overlap 33% — en-GB: "Tip the truck in person if you like." · back: "If you want, you can give the tip in person." | Si quieres, puedes dar la propina en persona. |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "The tip can be up to  {amount} ." | La propina puede ser de hasta {amount}. |
| `order.tipNote` | meaning overlap 44% — en-GB: "100% of your tip goes to the truck. Worked out on the food, before tax." · back: "100 % of your tip goes to the food truck. It is calculated on the food, without taxes." | El 100 % de tu propina es para el food truck. Se calcula sobre la comida, sin impuestos. |
| `order.couldNotPlace` | meaning overlap 33% — en-GB: "We could not place your order. No money has been taken." · back: "We could not place your order. You have not been charged anything." | No hemos podido hacer tu pedido. No se te ha cobrado nada. |
| `order.paymentThrew` | meaning overlap 47% — en-GB: "Something went wrong taking that payment. No money has been taken — please try again, or c" · back: "Something went wrong processing the payment. You have not been charged anything: try again" | Algo ha fallado al procesar el pago. No se te ha cobrado nada: inténtalo de nuevo o elige Paga al recoger. |
| `order.pausedNotice` | meaning overlap 42% — en-GB: "Orders are paused right now — please check back shortly. Your order is saved here." · back: "Orders are paused right now. Try again in a while. Your order has been saved here." | Los pedidos están en pausa ahora mismo. Vuelve a intentarlo en un rato. Tu pedido se ha guardado aquí. |
| … | 974 more | |

