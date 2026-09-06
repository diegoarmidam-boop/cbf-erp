# Reporte — actualización del documento vivo (3-sep-2026, parte 2 / 4-sep-2026)

Continuación de la sesión del 3-sep: prompts `CBF_ERP_Reestructura_Completa_03092026_V12.docx` y `V13.docx`, más un incidente de despliegue resuelto el 4-sep. Commit `54f33ca` sobre `8bfebef`, rama `main`, ya subido.

## V12 — Prioridad 1: Programar/Recetario solo Ingrediente Activo, nunca marca

El selector de "producto" en Granular Programar, Fertirriego Programar, Aplicaciones Programar y Aplicaciones Recetario ya no muestra marcas comerciales — solo Ingrediente Activo. Internamente se resuelve al Producto preferido configurado en Almacén → Preferido/Sustitutos (patrón "resolver temprano" al productoId existente, evitando una migración de esquema mucho más invasiva sobre 5 tablas de producto).

Se encontró y corrigió un hueco de datos real en el camino: los 11 Ingredientes Activos autorizados no tenían Producto preferido configurado — sin eso, Programar habría quedado inutilizable de inmediato. Verificado que cada uno tenía exactamente 1 producto candidato (sin ambigüedad) antes de hacer el backfill.

Compras/Comparador y Almacén quedaron sin tocar, tal como pedía el prompt.

## V12 — Prioridad 2: Zona del proveedor

Se agregó el campo Zona al alta/edición de Proveedores, reutilizando el mismo catálogo abierto de Zonas que ya usaba el Comparador (no uno nuevo). Al cotizar con un Proveedor, la Zona se precarga sola desde la que tiene guardada — sigue siendo editable por cotización específica.

A petición directa de Diego en el chat: se agregó también un panel "Zonas (flete)" en Proveedores con lista completa administrable (crear, editar, activar/desactivar) — antes solo existía un alta rápida dentro del Comparador.

## V13 — Prioridad 1: 2 bugs reales de Fertirriego

**Causa raíz encontrada con evidencia real** (no adivinada): se cruzó el log de producción (`ops/logs/backend.log`, que sí tenía el stack trace exacto del segundo bug) con una reproducción limpia contra la base de datos real usando las funciones del backend directamente. Ambos bugs venían de la misma falla: al reducir lo que necesita una programación (Fertirriego, y por extensión Aplicaciones/Granular que comparten la función), el sistema asumía que *todo* lo que se pedía original ya estaba comprometido como stock real — pero si Almacén no tenía suficiente al programar, lo que se generó fue una compra automática pendiente, nunca una reserva real. Al reducir, intentaba "regresar" a un lote que nunca existió.

Se encontró además, en la base de datos real, la programación específica de la sesión de pruebas de Diego que se había quedado atorada en "programada" desde el 3-sep por este mismo bug — 9 de sus 10 productos tenían un movimiento de compromiso real en el historial pero su lote ya no existía.

**Corrección** en `almacen/movimientos.ts` (compartida por Aplicaciones/Granular/Fertirriego): ahora solo libera lo que de verdad estaba comprometido (verificado contra el historial de movimientos); lo que nunca se comprometió reduce/cancela la compra automática pendiente en vez de intentar liberar stock inexistente. Si el compromiso fue real pero el lote se perdió (el caso de la programación atorada), se recrea el lote en vez de tronar — mismo patrón que ya usa una entrada normal de compra.

**Probado:** reproducción exacta del bug 1 (Almacén vacío, programar 6 semanas, reducir a 5) contra la base real — confirmado el error antes del fix, confirmado que desaparece después, y confirmado que la compra automática pendiente se ajusta proporcionalmente sin crear stock fantasma. La programación atorada real se liberó de verdad: quedó "vencida", sus 10 compras automáticas se cancelaron, y el stock comprometido se devolvió a Almacén.

## V13 — Prioridad 2: Producto Comercial reemplaza texto libre en el Comparador

Se quitó el campo de texto libre "Nombre Comercial" de las cotizaciones — ahora es un selector que solo ofrece el Producto Comercial preferido y los sustitutos autorizados de Almacén para el Ingrediente Activo que se está cotizando (reutilizando `opcionesRecepcionDeProducto`, el mismo mecanismo que ya usaba Compras al recibir). Cada opción se ve como "Nombre + Marca". El selector también se precarga si ya se cotizó ese mismo Ingrediente Activo con ese mismo Proveedor antes — editable en ambos casos.

Se aprovechó para confirmar y corregir 2.6: Preferido/Sustitutos en Almacén no mostraba la Marca — se agregó.

**Cambio de esquema:** `ComparacionCotizacion.nombreComercial` (texto libre) se reemplazó por `productoComercialId` (FK a Producto). Solo 1 fila existente en producción — se respaldó con el productoId de su propia Comparación antes de aplicar la migración.

**Probado:** cotización real de un producto con 2 Proveedores distintos contra la base de datos — selector, marca y precarga verificados correctos; limpieza completa después.

## V13 — Prioridad 3: bug real — "Generar orden de compra" no mostraba nada

Causa raíz: al reabrir "Cotizar" sobre una orden que ya tenía una Comparación existente, el backend (`obtenerComparacionDeOrden`) regresaba la fila cruda de Prisma en vez de pasarla por el mismo cálculo que arma `ordenesGeneradas`/`cantidadComprada`/etc. — de ahí el error exacto que reportó Diego (`undefined is not an object`). La orden de compra en realidad sí se generaba bien (folio incluido); la pantalla se rompía antes de poder mostrarlo o descargar el PDF.

**Probado:** reproducción completa (generar una orden real con folio) contra la base real — confirmado que antes tronaba con el mismo error y ahora no. Esa prueba consumió el folio real #22 (salto normal en la numeración, sin efecto).

## V13 — Prioridad 4: la recepción se mueve de Compras a Almacén

Nueva pestaña "En Camino" en Almacén — mismo espejo de solo lectura que ya existía en Compras, pero aquí sí se confirma la recepción física (cantidad real, lote/caducidad). El botón "Recibir" se quitó de Compras; el permiso también se reforzó en el backend (`/recibir` ya solo acepta `almacen.capturar`, no `compras.capturar`). Las pestañas "En Camino"/"Recibidas" de Compras pasaron a ser de solo lectura. Se agregó un aviso en el centro de Notificaciones para que Compras se entere cuando Almacén confirma una recepción (ventana de 3 días, mismo criterio que otras alertas por tiempo del sistema).

**Probado:** simulación completa (orden en camino → recibida como lo haría Bodega) contra la base real — confirmado que aparece correctamente en "Recibidas" de Compras y que la notificación le llega a Compras.

## Incidente de despliegue (4-sep, resuelto)

Después de estos cambios, el backend en vivo quedó corriendo con un proceso que nunca se reinició correctamente — ni con el primer reinicio de la PC (confirmado con `CreationDate` del proceso: seguía siendo el del 3-sep 12:15 pm). Causó "Ruta de API no encontrada" en la pantalla nueva de Almacén. Diagnosticado con una prueba autenticada real (una prueba anterior sin sesión daba un falso positivo) y resuelto terminando el proceso viejo a mano — el sistema quedó sirviendo la versión correcta, verificado con una petición autenticada real después del reinicio.

## Estado técnico

- Backend y web sin errores de TypeScript; build de producción limpio en ambos.
- 2 migraciones de Prisma: `20260903175501_proveedor_zona` (aditiva) y `20260903221644_comparador_producto_comercial` (reemplaza `nombreComercial` por `productoComercialId`, con backfill de la única fila existente).
- Todo probado con scripts contra el backend real (sin credenciales de sesión de Diego), datos de prueba creados y borrados en cada caso, verificado con conteos antes/después — dos excepciones reales que se dejaron aplicadas a propósito: la liberación de la programación de Fertirriego atorada, y la recepción real que confirmó el flujo completo (ambas fueron el objeto mismo de la prueba, no efectos secundarios).
- Ya subido a GitHub — commit `54f33ca` sobre `8bfebef`, rama `main`.
