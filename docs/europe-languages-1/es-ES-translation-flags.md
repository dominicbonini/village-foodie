# Translation check — es-ES

5057 keys checked against en-GB's 5043. **Structural: 0** (missing 0 — each would show its English fallback · extra 0 · ICU 0). Flags: english 215 · glossary 64 · banned 0 · invariants 0 · numbers 2 · length 193 · drift 919 · plans 0 · other 0.

## English left (215)

| Key | Flag | Text |
|---|---|---|
| `order.orderFailed` | English word(s): error | Error en el pedido |
| `order.dualNetworkNotice` | English word(s): uses, eftpos | Independientemente del logotipo de la marca de pago que se muestre al introducir tus datos de pago, siempre que uses una |
| `order.demoFormNote` | English word(s): sale | Es un formulario real, así que necesita un email para hacer el pedido, pero no se envía nada. Ni confirmación ni mensaje |
| `order.namePlaceholder` | English word(s): sarah | p. ej. Sarah |
| `dashboard.toast.orderUrlMissing` | English word(s): slug | URL de pedido no disponible: falta el slug |
| `dashboard.toast.failed` | English word(s): error | Error |
| `dashboard.demo.lockWhy` | English word(s): control | En la demo mantenemos un evento en marcha para que siempre tengas algo con lo que probar. Cuando te registres tendrás el |
| `dashboard.prep.button` | English word(s): prep | Prep. |
| `dashboard.settings.colPrep` | English word(s): prep | Prep. |
| `dashboard.stock.howItem` | English word(s): pepperoni | El <b>límite del producto</b> limita solo ese producto dentro de la reserva (p. ej. solo 8 Pepperoni). Déjalo vacío para |
| `dashboard.edit.emailPlaceholder` | English word(s): ticket | Email para el ticket |
| `charges.subtotal` | identical to en-GB | Subtotal |
| … | 203 more | |

## Glossary term not used (64)

| Key | Flag | Text |
|---|---|---|
| `dashboard.toast.intervalsSaved` | "Pickup time" → expected "hora de recogida" | Horas de recogida guardadas para este evento |
| `dashboard.toast.intervalsFailed` | "Pickup time" → expected "hora de recogida" | No se han podido guardar las horas de recogida en este momento. |
| `dashboard.header.kitchenScreen` | "KDS" → expected "pantalla de cocina (KDS)" | Pantalla de cocina |
| `dashboard.settings.orderReadyHelp` | "KDS" → expected "pantalla de cocina (KDS)" | Muestra un botón “Marcar como listo” en la pantalla de pedidos. Las pantallas de cocina se configuran por separado. Los  |
| `dashboard.settings.intervalsTitle` | "Pickup time" → expected "hora de recogida" | Horas de recogida |
| `dashboard.settings.intervalsHelp` | "Kitchen capacity" → expected "pedidos máximos por franja" | Cuánto tiempo hay entre una hora de recogida y la siguiente. No cambia la capacidad de cocina ni los tiempos de preparac |
| `dashboard.settings.intervalsUnavailable` | "Pickup time" → expected "hora de recogida" | Las horas de recogida no están disponibles ahora mismo. |
| `dashboard.settings.customerTimes` | "Pickup time" → expected "hora de recogida" | Horas de recogida de los clientes |
| `dashboard.settings.yourTimes` | "Pickup time" → expected "hora de recogida" | Tus horas de recogida |
| `dashboard.settings.capacityTitle` | "Kitchen capacity" → expected "pedidos máximos por franja" | Capacidad de cocina |
| `dashboard.settings.assignTruck` | "Kitchen capacity" → expected "pedidos máximos por franja" | Asigna un food truck a este evento antes de fijar la capacidad de cocina. |
| `dashboard.kds.body` | "KDS" → expected "pantalla de cocina (KDS)" | Elige de qué food truck quieres abrir la pantalla de cocina: |
| … | 52 more | |

## Numbers, prices or brands changed (2)

| Key | Flag | Text |
|---|---|---|
| `errorsManage.wp_caption_too_long` | number(s) 4000 not kept | Ese texto es demasiado largo: 4.000 caracteres como máximo. |
| `manageTeam.phonePlaceholder` | number(s) 44, 7700, 900000 not kept | +34 612 345 678 |

## Likely to overflow (much longer than en-GB) (193)

| Key | Flag | Text |
|---|---|---|
| `order.tipAmount` | 21 chars vs en-GB 10 (×2.10) | Importe de la propina |
| `order.backToTruckPage` | 35 chars vs en-GB 20 (×1.75) | ← Volver a la página del food truck |
| `order.notOpenTitle` | 33 chars vs en-GB 19 (×1.74) | Los pedidos aún no están abiertos |
| `order.asap` | 14 chars vs en-GB 6 (×2.33) | ⚡ Cuanto antes |
| `order.asapOnly` | 17 chars vs en-GB 9 (×1.89) | Solo cuanto antes |
| `order.noEvent` | 31 chars vs en-GB 18 (×1.72) | No hay ningún evento disponible |
| `order.placeOrder` | 29 chars vs en-GB 11 (×2.64) | Pedido con obligación de pago |
| `dashboard.toast.editFailed` | 22 chars vs en-GB 11 (×2.00) | No se ha podido editar |
| `dashboard.qr.tapToClose` | 35 chars vs en-GB 21 (×1.67) | Toca en cualquier sitio para cerrar |
| `dashboard.header.screenTitle` | 76 chars vs en-GB 46 (×1.65) | {state, select, on {La pantalla se mantendrá encendida} other {Toca para mantener la pantalla encendida}} |
| `dashboard.header.screen` | 36 chars vs en-GB 21 (×1.71) | {state, select, on {Pantalla encendida} other {Pantalla apagada}} |
| `dashboard.orders.statDone` | 11 chars vs en-GB 4 (×2.75) | Completados |
| … | 181 more | |

## Back-translation drifts from en-GB (919)

| Key | Flag | Text |
|---|---|---|
| `order.tipHeading` | meaning overlap 33% — en-GB: "Add a tip for the truck?" · back: "Do you want to leave a tip for the food truck?" | ¿Quieres dejar propina al food truck? |
| `order.state.confirmNotFound` | meaning overlap 25% — en-GB: "We couldn’t find that order." · back: "We have not found that order." | No hemos encontrado ese pedido. |
| `order.state.menuUnavailable` | meaning overlap 29% — en-GB: "This truck is not currently taking orders." · back: "This food truck is not accepting orders at the moment." | Este food truck no acepta pedidos en este momento. |
| `order.confirmMissing` | meaning overlap 25% — en-GB: "We couldn’t find that order." · back: "We have not found that order." | No hemos encontrado ese pedido. |
| `order.yourNamedDeal` | meaning overlap 0% — en-GB: "your  {name}  deal" · back: "your  {name}  combo" | tu menú {name} |
| `order.noServiceFee` | meaning overlap 33% — en-GB: "No service fee." · back: "No service charges." | Sin gastos de servicio. |
| `order.tipInPerson` | meaning overlap 33% — en-GB: "Tip the truck in person if you like." · back: "If you want, you can give the tip in person." | Si quieres, puedes dar la propina en persona. |
| `order.tipCap` | meaning overlap 0% — en-GB: "Tips can be up to  {amount} ." · back: "The tip can be up to  {amount} ." | La propina puede ser de hasta {amount}. |
| `order.tipNote` | meaning overlap 44% — en-GB: "100% of your tip goes to the truck. Worked out on the food, before tax." · back: "100 % of your tip goes to the food truck. It is calculated on the food, without taxes." | El 100 % de tu propina es para el food truck. Se calcula sobre la comida, sin impuestos. |
| `order.couldNotPlace` | meaning overlap 33% — en-GB: "We could not place your order. No money has been taken." · back: "We could not place your order. You have not been charged anything." | No hemos podido hacer tu pedido. No se te ha cobrado nada. |
| `order.paymentThrew` | meaning overlap 47% — en-GB: "Something went wrong taking that payment. No money has been taken — please try again, or c" · back: "Something went wrong processing the payment. You have not been charged anything: try again" | Algo ha fallado al procesar el pago. No se te ha cobrado nada: inténtalo de nuevo o elige Paga al recoger. |
| `order.pausedNotice` | meaning overlap 42% — en-GB: "Orders are paused right now — please check back shortly. Your order is saved here." · back: "Orders are paused right now. Try again in a while. Your order has been saved here." | Los pedidos están en pausa ahora mismo. Vuelve a intentarlo en un rato. Tu pedido se ha guardado aquí. |
| … | 907 more | |

