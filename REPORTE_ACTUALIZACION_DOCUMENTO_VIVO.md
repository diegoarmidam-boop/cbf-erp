# Reporte — actualización del documento vivo (2-sep-2026, sesión tarde)

Prompt `CBF_ERP_Reestructura_Completa_02-09-2026_V3.docx`: 2 bugs reales que Diego encontró probando Compras/Fertirriego en vivo (Prioridad 1), más 3 puntos de rediseño (Prioridades 2, 3 y 4). El reporte del 1/2-sep (mañana) ya quedó integrado al documento vivo — este reporte empieza de cero, es solo lo de esta sesión.

Regla de trabajo que pidió Diego para este prompt: entender bien la causa raíz de cada bug antes de tocar código (no solo tapar el síntoma), y reportar qué se probó y cómo al terminar cada prioridad antes de seguir con la siguiente. Se siguió así — Prioridad 1 se reportó y Diego la validó antes de tocar Prioridad 2; luego autorizó explícitamente seguir derecho con 2, 3 y 4 sin detenerse a validar una por una ("dale derecho... después los reviso al final").

## Prioridad 1.1 — Cancelación no propagada

**Diagnóstico primero, sin tocar código.** Diego reportó que cancelar una programación de Fertirriego dejaba la orden de compra automática ligada atorada, pidiendo cotizar algo que ya nadie necesitaba. Reproduje el flujo completo por HTTP real (programar → generar compra automática → cancelar la programación → verificar la orden) contra el backend en vivo: **la cascada de cancelación (`cancelarOrdenesDeReferencia`, construida el 1/2-sep) ya funcionaba correctamente.**

La causa del síntoma que Diego veía no estaba en el código, sino en sus 2 registros reales de prueba:
- Uno se había **liberado antes de que existiera esta corrección** (1/2-sep) — no se puede arreglar en retroactivo sin un backfill, que no se justificaba solo para 1 registro de prueba.
- El otro se había quedado **atorado en estado "programada"** — el botón "Liberar" nunca llegó a ejecutarse de verdad (probable problema de completar el modal de confirmación en pantalla, no un bug de lógica del backend).

Por indicación de Diego, se borraron ambos registros reales (y sus 16 órdenes ligadas) después de confirmar que ninguno tenía movimiento de Almacén ya comprometido — cero riesgo de inventario. Diego validó esta prioridad con un fertirriego nuevo antes de seguir.

## Prioridad 1.2 — Total de campaña no reflejado en la compra automática

**Causa raíz:** `programarFertirriego`, `confirmarEntregaFertirriego` y `liberarFertirriegoVencido` comprometían/entregaban/liberaban stock usando `dosis × hectáreas` de **una sola ocasión** — nunca multiplicaban por el número de riegos de toda la campaña, aunque "Confirmar entrega" es un evento único (no existe "entregar" riego por riego), así que siempre debió cubrir la campaña completa de una sola vez. Esto es un bug de origen (construido el 31-ago), no algo nuevo que se rompió.

**Corrección:** las 4 funciones (`programarFertirriego`, `editarFertirriegoProgramada`, `confirmarEntregaFertirriego`, `liberarFertirriegoVencido`) ahora comprometen/piden/entregan/liberan `cantidadTotalCalculada × riegosEnCampaña`. El campo guardado en base de datos (`cantidadTotalCalculada`) se queda igual — sigue siendo el valor por ocasión que usan Riego 9.6 y la tabla "Total por riego" de la Orden de Fertirriego, ninguna pantalla existente se rompió por este cambio.

**Pregunta que sí le hice a Diego antes de construir esto:** si la programación se edita después (dosis/fechas/frecuencia, función 1.9), ¿la compra ya generada se debe ajustar sola? Confirmó: **sí, ajustar automático** — se reutilizó el mecanismo de ajuste que ya existía desde el 15-ago (`ajustarCantidadProducto`/`comprometerAdicional`), ahora alimentado con el total de campaña correcto en vez del de una ocasión.

**Bug adicional encontrado y corregido durante la verificación (no lo pidió el prompt, apareció al revisar las consecuencias del fix):** `recibirOrden` (el código que aparta stock cuando llega una compra ligada a una programación en espera) seguía usando la cantidad de una sola ocasión para Fertirriego — quedó desalineado con el resto del fix. Si no se corregía, una compra automática dimensionada al total de campaña se recibiría pero solo apartaría 1/N de lo necesario, y "confirmar entrega" habría movido más stock del que en realidad se apartó (descuadre entre Almacén Central y Almacén Local). Corregido con la misma base (`cantidadTotalCalculada × riegosCampaña`).

**Probado con 2 scripts contra el backend real, por HTTP con sesión real** (no llamadas directas a funciones):
- Programar sin stock: la compra automática pidió el total de campaña (30 kg de 5 riegos), no el de una ocasión (6 kg).
- Editar la programación extendiendo la campaña (5→7 riegos): se generó automáticamente una compra adicional por el faltante, sumando el total correcto (42 kg).
- Programar con stock suficiente: se comprometió el total de campaña exacto (12 kg de 3 riegos, no 4 kg), el lote bajó lo correcto, y "confirmar entrega" movió esos 12 kg completos a Almacén Local.
- Comprometer 40 kg de campaña y liberar: el lote regresó exactamente a su cantidad original — antes del fix solo hubiera regresado 10 kg (una ocasión), dejando 30 kg reservados fantasma para siempre.
- Recibir una compra automática de 30 kg (campaña completa): se comprometieron los 30 kg completos al recibir, y "confirmar entrega" movió exactamente esos 30 kg sin descuadre.

Diego validó esta prioridad ("validado sigue") antes de continuar.

## Prioridad 2 — Tarjetas de "Pendientes de cotizar" por programación

Nueva pestaña **"Por Programación"** en Compras → Órdenes, que coexiste con "Por orden" y "Por Ingrediente Activo" (no las reemplaza):
- Una tarjeta = una Aplicación/Fertirriego/Fertilización Granular completa con **todos** sus productos adentro, o una solicitud manual completa.
- Al abrir la tarjeta se ve cada producto con su cantidad pendiente (de campaña completa cuando aplica) y su estado: **Pendiente** (nadie ha cotizado), **Cotizado** (ya hay una Comparación pero nada comprado todavía) o **Comprado parcial** (ya se generó al menos una orden real pero no cubre todo).
- "Cotizar" por producto manda al Comparador con ese producto exacto pre-cargado — mismo mecanismo que ya existía, solo reorganizado en la nueva agrupación.

**Probado:** script contra el backend real (un fertirriego con 2 productos apareció como una sola tarjeta con 2 líneas, con las cantidades de campaña correctas; una solicitud manual apareció aparte con 1 línea) y en el navegador con sesión real — se vieron correctamente la tarjeta real de Diego ("El Sonrisal", 10 productos) y la de prueba, se abrió/cerró la tarjeta, y "Cotizar" llevó al Comparador con el producto exacto pre-seleccionado.

**Incidente durante esta prioridad:** al terminar y avisar a Diego, la pestaña nueva no aparecía en su pantalla real. Causa: el backend sirve el frontend como un build ya compilado (`web/dist`), no el código fuente en vivo — se había reconstruido y reiniciado el backend, pero no se había reconstruido ese build del frontend. Corregido reconstruyéndolo (`npm run build` en `web`); no vuelve a pasar porque a partir de aquí cada cambio de frontend en esta sesión se compiló y desplegó de inmediato.

## Prioridad 3 — Desglose por origen en "Por Ingrediente Activo"

El total por Ingrediente Activo ahora se desglosa por Huerta + Receta, con el formato exacto que pidió Diego: *"Boro — 260 kg total: 160 kg (Huerta Sonrisas — Receta Frutal Boost), 100 kg (Huerta Encanto — Receta Base)"*. Fertilización Granular no maneja Receta (no existe ese campo en su modelo) — ahí el desglose queda solo "(Huerta X)".

**Decisión tomada sin detenerse a preguntar** (por indicación expresa de Diego de seguir derecho en esta tanda): para las cantidades que vienen de una solicitud manual (sin Huerta ni Receta), se agrupan aparte y se etiquetan **"(Solicitud manual)"** — mismo término ya usado en las tarjetas de "Por Programación" (Prioridad 2). **Diego debe confirmar si esta etiqueta es la que quiere** o si prefiere otra — esto no estaba definido de antes, como él mismo señaló.

**Probado** con un script contra el backend real reproduciendo el ejemplo de Diego: 2 fertirriegos (Huerta Sonrisas + Receta Frutal Boost = 20 kg, Huerta Encanto + Receta Base = 20 kg) más una solicitud manual de 7 kg del mismo Ingrediente Activo → el total salió 47 kg con los 3 orígenes separados y sus cantidades exactas.

## Prioridad 4 — Destino obligatorio en solicitudes manuales

Nuevo catálogo abierto **"Centros de Costo"** (botón "+" para agregar más en el futuro), sembrado con los 8 que dio Diego (Desarrollo, Cosecha, Empaque, Oficina/Administración, Bodega de Agroquímicos, Equipos y Maquinaria, Embarques, Indirectos/Prorrateables) más **Laboratorio**, que Diego pidió agregar aunque no estaba en su lista original.

El formulario de "Solicitar compra" ahora exige elegir **Destino**: Centro de Costo (del catálogo) o Huerta — si se elige Huerta, aparece un segundo selector obligatorio con las Huertas reales del sistema (para prorrateo por costo directo). Sin Destino, la solicitud no se puede guardar — validado tanto en la pantalla como en el backend (por si algún día se llama a la API directamente).

**Probado por HTTP real:** solicitud sin Destino se rechaza (409), con Centro de Costo funciona y guarda el id correcto, con Huerta funciona y guarda el id correcto, con los dos destinos a la vez se rechaza (tiene que ser exactamente uno). El catálogo trajo las 9 semillas esperadas, y agregar un Centro de Costo nuevo por API funcionó.

**Probado a mano en el navegador con sesión real:** se llenó el formulario completo, se eligió Centro de Costo → "Bodega de Agroquímicos", se guardó, y la tarjeta de "Por orden" quedó mostrando "Destino: Bodega de Agroquímicos".

**Bug visual encontrado y corregido durante esta prueba:** el formulario de "Solicitar compra" no tenía `flexWrap`, así que los campos nuevos de Destino se salían de la pantalla en vez de acomodarse en una segunda línea. Corregido agregando el wrap — se volvió a probar y ya se ve completo.

## Además — orden de las pestañas

Diego pidió reordenar las pestañas de Compras: **Por Programación → Por Ingrediente Activo → Por orden**, con "Por Programación" como la vista que se ve por default al entrar a la pantalla (antes era "Por orden"). Hecho y desplegado.

## Estado técnico

- Backend y web sin errores de TypeScript, build de producción limpio en ambos.
- 1 migración de Prisma nueva (`20260902174331_compras_destino_centro_costo`): tabla `CentroCosto` (catálogo abierto, sembrada con las 9 categorías) y columnas nuevas `centroCostoId`/`huertaDestinoId` en `OrdenCompra` (nulas, aditivo puro) — verificado antes de escribir la migración que la tabla `ordencompra` tenía 22 filas reales y no se perdió ninguna.
- Todo probado en vivo por HTTP real contra el backend corriendo (no llamadas directas a funciones) para la parte de dinero/inventario, y con clics reales en pantalla para lo visual. Todos los datos de prueba (usuarios, huertas, productos, fertirriegos, órdenes, centros de costo) se crearon y se borraron por completo al terminar cada prueba — cero rastro en producción, verificado contando filas antes y después en cada caso.
- **Pendiente de que Diego confirme:** la etiqueta "(Solicitud manual)" del desglose por origen (Prioridad 3) — no estaba definida de antes y se tomó una decisión razonable para no detener el trabajo, pero es la única pieza de esta sesión que se implementó sin su confirmación previa.
- Ya subido a GitHub — commit `193b63c` sobre `9111f1d` (el del reporte de la mañana), rama `main`.
