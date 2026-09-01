# Reporte — actualización del documento vivo (29-ago-2026, ampliado 31-ago-2026)

Prompt maestro de 4 puntos (ajustes pendientes acumulados), ordenados por prioridad. Los 4 quedaron construidos, verificados en vivo con datos de prueba (creados y borrados por completo, cero rastro en producción), y con typecheck limpio en backend y web.

**31-ago-2026 — el prompt maestro se amplió** (misma sesión de trabajo, versión V3 del documento) con 4 sub-puntos nuevos dentro del punto 1 (1.6 a 1.9) y dos puntos nuevos (5 y 6). Los puntos 1-4 de abajo son el estado ya reportado el 29-ago — siguen vigentes tal cual. Las secciones "5", "6" y "1.6-1.9" más abajo son lo nuevo de esta ampliación, construido y verificado en la misma sesión, sin pausas, por instrucción explícita de Diego ("no te detengas, no estoy en la computadora").

## 1. CORRECCIÓN DE FONDO — Fertirriego ya no usa tanque/concentración

**Reversión:** hasta el 25-ago, Fertirriego (Camino 2 de Fertilizantes) copiaba el modelo de Aplicaciones (concentración + litros de mezcla/agua/ha + tanque completo/parcial) — esa decisión estaba mal. Ahora usa dosis directa por hectárea (kg/ha, L/ha o g/ha) × hectáreas de las Secciones de Riego elegidas, sin concentración, sin litros de agua, sin tanque.

**Construido:**
- Schema: `FertirriegoProgramacion` perdió `litrosAguaPorHa`/`capacidadTanque`. Nuevo modelo `RecetaFertirriego`/`RecetaFertirriegoProducto` — Recetario propio de Fertirriego, separado del `Receta` que sigue usando solo Aplicaciones (cero riesgo cruzado). Nueva fórmula `calcularCantidadTotalFertirriego` en `shared/src/fertilizantes/calculo.ts`.
- Backend: `backend/src/modules/fertilizantes/fertirriego.ts`, nuevo módulo `recetario-fertirriego.ts` con rutas propias bajo `/fertilizantes/fertirriego/recetario`.
- Frontend: `web/src/pages/fertilizantes/Fertirriego.tsx` — ya no pide litros de agua/ha ni capacidad de tanque; nuevo componente `RecetarioFertirriegoPanel.tsx`.

**Hallazgo que sí requirió tocar (punto 1.5 del prompt):** la Orden de Fertirriego, contrario a lo que se pensaba, **sí** dependía de concentración/litros/tanque (hasta exigía capacidad de tanque para poder generarse) — corregida en `backend/src/modules/ordenes/ordenes.ts`, ahora es dosis × hectáreas por válvula, sin tanque.

**Decisión documentada, no preguntada por no ser ambigua:** `Receta`/`ModuloReceta` de Aplicaciones quedaron intactos — el valor `fertirriego` del enum queda sin uso real, documentado aquí para que no se vea como descuido.

**Probado:** en vivo — receta de Fertirriego creada, fertirriego programado sobre una Sección real de El Sonrisal (3 kg/ha × 4 ha = 12 kg, exacto), Orden generada en pantalla y PDF con cifras correctas.

## 2. Historial de Nómina semanal — navegación y candado permanente

**Bug real corregido:** el Reporte de Nómina semanal no tenía forma de ver una semana ya pasada una vez que cambiaba el corte — Diego se quedaba sin poder ver/exportar la semana recién cerrada. El backend ya soportaba `?hoy=fecha` en los 4 endpoints; solo el frontend nunca lo mandaba.

**Construido:**
- `web/src/pages/nomina/ReporteSemanal.tsx`: flechas "< Semana anterior" / "Semana siguiente >", ventana de 12 semanas, exportar sobres de cualquier semana en la ventana.
- **Candado de solo lectura PERMANENTE** (esto no existía — "Confirmar semana" antes solo aplicaba descuentos de préstamo, no bloqueaba nada): nuevo modelo `NominaSemanaConfirmada` y módulo `backend/src/modules/nomina/semana-confirmada.ts`. Se verifica de forma **incondicional** (sin excepción de rol, ni Director General) en `guardarCapturaDelDia`, `autorizarBono`/`rechazarBono`, y `aplicarDescuento` — no se apoya en `requirePermission`, porque Director General/Encargado de Sistemas ignoran esa matriz por diseño (`ROLES_ACCESO_UNIVERSAL`).
- "Todas UPs vs. por Huerta" (punto 5 del prompt): el reporte no tenía ningún concepto de Huerta antes (agregaba destajo cruzando Huertas). **Decisión documentada, no preguntada:** agregué un filtro `?huertaId=` opcional que no cambia el default (sigue agregando todo si no se especifica) — decidí no rediseñar la semántica de pago existente, que es real y en uso.

**Probado:** en vivo contra datos reales — navegué a la semana 21–27 ago (la de la auditoría anterior) y cargó correctamente $57,762.19 / 77 personas. El candado se probó con un script contra datos de prueba (Huerta vacía, fecha inventada): confirmé que ni siquiera con `permitirDiaCerrado:true` se puede pasar una vez confirmada la semana.

## 3. Notificaciones — pre-llenado de contexto

Audité los 11 tipos de notificación que existen (no solo los 4 de ejemplo del prompt) — todos compartían el mismo defecto: `enlace` era siempre una ruta fija sin `?query=`, aunque la función ya tenía el contexto (fecha/huertaId/id) disponible en ese momento.

**Corregido en `backend/src/core/notificaciones.ts`** (los 11 enlaces) y en cada pantalla destino:
- `cierre_pendiente` → `CierreDelDia.tsx`: ahora lee `?fecha=&huertaId=` y salta directo al detalle de esa Huerta/día (antes había que buscarlos a mano) — este era el caso confirmado roto en el prompt.
- `descuadre_almacen_local` → `AlmacenLocalPage.tsx`: `?huertaId=` preselecciona la Huerta, `?productoId=` resalta la fila.
- `orden_pendiente_autorizar`, `cxp_proxima`, `aplicacion_vencida/pendiente`, `fertilizacion_vencida/pendiente`, `cancelacion/ajuste_dosis_pendiente_bodega` → `?id=` resalta y hace scroll automático a la fila/tarjeta correspondiente en `Ordenes.tsx`, `CxP.tsx`, `Aplicaciones.tsx`, `Granular.tsx`, `Inventario.tsx`.

**Probado en vivo:** notificación real "Día de Nómina vencido sin cerrar — 2026-08-25" → clic → cayó directo en el detalle de El Sonrisal del 25/08/2026, sin ningún paso manual.

## 4. Comparador de Cotizaciones — rediseño completo

Ya existía una versión simple de esta herramienta (`backend/src/modules/compras/comparador.ts`, 0 datos reales guardados) — se reemplazó por completo, como pedía el prompt, no se creó una paralela.

**Construido:**
- Nuevo catálogo abierto **Zonas y flete** (`ZonaFlete`) — exclusivo de este comparador, con "Zona del comprador" (Campeche) forzada a flete $0 en el backend sin importar qué mande el cliente.
- Un Producto por comparación (elegido de "Órdenes pendientes de cotizar", `?estado=pendiente_cotizar` — ya existía ese endpoint, no hacía falta uno nuevo), con líneas de cotización por Proveedor: Zona, Nombre Comercial, Moneda MXN/USD + Tipo de Cambio, Presentación.
- Cálculo (`shared/src/compras/calculo.ts`): precio unitario, unidades a pedir (redondeo hacia arriba), Excedente/% Excedente con alerta "REVISAR" configurable (umbral inicial 20%, editable por comparación), Flete total (regla exclusiva: 1 L = 1 kg **solo aquí**, en ningún otro lado del sistema), Total con flete.
- Doble recomendación: Mejor opción Global (menor total con flete, cualquier Zona) vs. Mejor opción Local (menor total dentro de la Zona del comprador) — el foráneo solo se marca cuando de verdad compensa el flete, con ahorro en $ y % explícito.
- Permisos: `requirePermission("compras", "ver")` en todo, igual que ya hacía la versión vieja — sin restricción adicional, tal como pedía el punto 4.5.

**Bug real encontrado y corregido durante mis propias pruebas (no lo pidió el prompt, lo encontré yo):** el botón "+ Nueva Zona" vivía dentro de cada línea de proveedor: con 2+ proveedores capturados a la vez, crear una Zona nueva la seleccionaba en la línea equivocada (el estado se compartía entre todas las líneas). Corregido — ahora es un solo control por formulario (`GestorZonas`), no uno por línea.

**Probado en vivo, caso completo:** NKS, 100 kg necesarios, dos proveedores — uno local (Campeche, $500/presentación de 25kg, sin flete) y uno foráneo (Yucatán, $2/kg de flete). Con el foráneo a $440: ganó el foráneo, ahorro $40 (2.0%) — correcto. Agregué una tercera cotización en USD ($20 USD × 18.5 = $370 MXN, presentación de 80kg): excedente 37.5% marcado "REVISAR" (>20% umbral) correctamente, y la recomendación Global se recalculó sola a $1,060, ahorro $940 (47%) vs. local — todas las cifras exactas contra el cálculo manual.

## 1.6 — Total de campaña completa en Fertirriego (NUEVO, 31-ago-2026)

Al programar (o editar) un fertirriego, además del total por cada ocasión (lo que ya existía), ahora se muestra de inmediato el total agregado de TODAS las ocasiones del rango fechaInicio-fechaFin según la Frecuencia — para poder comprar todo el volumen de un jalón.

**Construido:**
- `shared/src/ordenes/calculo.ts` ya tenía `riegosEnVentana(frecuencia, dias)` (generalización de `riegosEnSemana`, que solo se usaba con `dias=7`) — se reutilizó tal cual, sin escribir matemática de fechas nueva.
- `backend/src/modules/fertilizantes/fertirriego.ts`: `enriquecerConAlertas` ahora calcula `riegosEnCampania` y, por producto, `cantidadCampania` (dosis × hectáreas × riegos-en-campaña). Viaja en la lista y en el detalle, igual que el resto de las alertas.
- `web/src/pages/fertilizantes/Fertirriego.tsx`: cada producto muestra "X total de campaña" junto al total por riego; la tarjeta muestra "N riegos en la campaña".
- La Orden de Fertirriego (pantalla y PDF) también gana una fila "Total de campaña (hasta [fecha])" además de "Total de la semana" — `backend/src/modules/ordenes/ordenes.ts`, `pdf.ts`, `web/src/components/OrdenFertirriegoView.tsx`.

**Decisión documentada, no preguntada:** el total de campaña es **solo informativo** — no cambia cuánto se compromete en Almacén ni el tamaño de la Orden de Compra automática al programar (eso sigue siendo una sola ocasión, como ya funcionaba). Cambiar ese comportamiento (comprometer/pedir el volumen completo de la campaña de una vez) es una decisión de negocio más grande que no pedía este punto — si Diego la quiere, es un cambio acotado a partir de aquí.

**Punto 1.1 (frecuencia y rango de fechas ya disponibles):** confirmado — ya estaban en el formulario de Programar desde antes, no hizo falta construir nada ahí.

## 1.7 — Ajustar/quitar producto el día de la ejecución, en Riego 9.6 (NUEVO, 31-ago-2026)

**Hallazgo:** el modelo de datos (`RiegoRegistroDiario`/`RiegoRegistroDiarioProducto`) ya soportaba esto de fondo — es un registro POR DÍA, separado de la programación, así que "no mandar un producto" ya no lo tocaba. El único hueco era la pantalla: siempre mostraba los productos programados sin forma de excluir uno.

**Construido:** en `web/src/pages/riego/Riego.tsx`, cada producto del fertirriego del día trae ahora un checkbox "No se tuvo hoy" junto a su cantidad. Al marcarlo, ese producto se excluye del envío — el descuento de Almacén de ese día se ajusta a lo realmente aplicado (ya lo hacía el backend por diferencia), y ni la programación ni los demás días se tocan. Sin cambios de schema ni de backend — el ajuste era 100% de UI.

## 1.8 — Recordatorio diario de Fertirriego pendiente, en Notificaciones (NUEVO, 31-ago-2026)

**Ambigüedad encontrada — resuelta sin detener el trabajo, documentada aquí para que Diego la revise:** el prompt pide avisar a "Encargado de Riego" y "Encargado del Rancho" — **ninguno de los dos existe como rol en el sistema** (se auditó el enum `Rol` completo). Se usó en su lugar el permiso real del módulo `riego`, que hoy tienen: Regador, Supervisor de Huerta y Gerente Técnico de Producción (más Dirección General/Encargado de Sistemas, que ven todo). **Si Diego quiere otro conjunto de roles, es cambiar una línea en `backend/src/core/notificaciones.ts` — no una migración ni un rediseño.**

**Construido:** nuevo bloque en `obtenerNotificaciones()` que reutiliza `estadoRiegoTodasUPs(hoy)` (ya existía, se usa en la pantalla de captura) — cualquier Sección con fertirriego activo hoy y sin registro todavía dispara "Fertirriego programado hoy sin registrar", con enlace directo a `/riego?fecha=...&huertaId=...` (aplicando el mismo principio del punto 3: pre-llenar el contexto). `web/src/pages/riego/Riego.tsx` ahora lee esos parámetros de la URL, pre-selecciona la fecha y resalta/hace scroll a la Huerta correspondiente.

## 5. Orden numérico para Cuadros y Secciones de Riego/Válvulas (NUEVO, 31-ago-2026)

**Bug real confirmado:** en la Orden de Fertirriego, las Válvulas salían en orden alfabético de texto ("Válvula 1", "Válvula 10", "Válvula 2"...) tanto en pantalla como en PDF — el origen era un `orderBy: { nombre: "asc" }` de MySQL (ordena como texto) en el catálogo de Secciones de Riego, que además determinaba el orden en que se guardaban al programar.

**Construido:** nuevo helper `ordenarPorNombreNumerico` en `shared/src/unidades-produccion/calculo.ts` (extrae el primer número del nombre y compara numéricamente; si no hay número, cae a alfabético — no rompe con nombres como "Cuadro 3A"). Aplicado en: el catálogo de Cuadros y de Secciones de Riego (`backend/src/modules/unidades-produccion/*.ts` — esto además corrige de raíz el orden en que se guardan al programar, ya no solo cómo se muestran), la vista "Todas UPs" y el historial semanal de Riego, la Orden de Fertirriego (pantalla + PDF, con un segundo ordenamiento ahí mismo por si una programación vieja ya quedó guardada en el orden alfabético incorrecto), y las listas de Cuadros que aparecen dentro de Aplicaciones/Granular/Actividades. Huertas, productos, proveedores y personas siguen alfabético, sin tocar — auditado explícitamente para no afectarlos.

**Probado en vivo:** pantalla de Programar Fertirriego y pantalla de Riego mostrando "Válvula 1, Válvula 2, Válvula 3... Válvula 8" en orden correcto.

## 6. Confirmación de doble paso, regla universal (NUEVO, 31-ago-2026)

**Bug real confirmado:** el botón "Liberar" de Fertirriego (y sus dos gemelos idénticos en Granular y Aplicaciones) ejecutaba sin ninguna confirmación — ni siquiera un `window.confirm`.

**Hallazgo de alcance:** en todo el sistema no existía ningún componente de confirmación reutilizable — cada pantalla lo resolvía a mano, unas con `window.confirm` (un solo clic, no son "dos pasos") y otras ya con un modal armar→confirmar (el patrón real de dos pasos, usado por ejemplo en "Confirmar semana" de Nómina). Se construyó `web/src/components/ConfirmModal.tsx` como componente compartido (no existía) y se aplicó a:
- Los 3 "Liberar" sin ninguna confirmación (Fertirriego, Granular, Aplicaciones) — el bug reportado.
- Los "Cancelar" que ya tenían `window.confirm` (Granular, Aplicaciones, Préstamos) — subidos a dos pasos de verdad.
- Los "Borrar/Eliminar" que ya tenían `window.confirm` (Grupos de pago, Puestos, Do Not Hire, documentos de Personal, Secciones de Riego, conceptos de Mantenimiento, Comparador de Cotizaciones ×2) — mismo criterio.

**Decisión de alcance, documentada:** el prompt dice literalmente "borrar, eliminar, cancelar o liberar" — se interpretó ese verbo-lista tal cual, sin extenderlo a acciones parecidas pero distintas como "Quitar" (quitar un sustituto de Preferencias, quitar a alguien de un grupo de pago — reversibles con un clic, no destruyen nada) o "Desactivar/Reactivar" (toggles reversibles de catálogos). Si Diego quiere que la regla cubra también esas, es aplicar el mismo `ConfirmModal` en unos cuantos sitios más — ya está listo para reusarse.

**Probado en vivo:** "Liberar" en Fertirriego ahora abre el modal (no ejecuta directo), "Cancelar" cierra sin acción, "Sí, confirmar" sí libera — confirmado con datos de prueba.

## 1.9 — Editar una programación ya guardada (NUEVO, 31-ago-2026)

**Hallazgo importante:** Aplicaciones y Fertilización Granular **ya tenían exactamente esto** — construido en una sesión anterior (15-ago-2026), con el candado correcto ("editable mientras no haya ningún reporte de avance") y restringido a los mismos roles que Programar. No hizo falta tocar ninguno de los dos. **Solo Fertirriego no lo tenía.**

**Construido (solo Fertirriego):**
- `backend/src/modules/fertilizantes/fertirriego.ts`: nueva `editarFertirriegoProgramada`, mismo patrón que Granular/Aplicaciones (recalcula hectáreas, ajusta stock comprometido/entregado producto por producto vía `ajustarCantidadProducto`, reemplaza Secciones y actualiza cabecera). Nueva ruta `PATCH /fertilizantes/fertirriego/:id`, mismos roles/permiso que "Programar".
- **Diferencia real con Granular/Aplicaciones, resuelta:** Fertirriego no tiene su propio modelo de "avance" — la ejecución vive por completo en Riego (`RiegoRegistroDiario`), sin relación directa al fertirriego. Se construyó `fertirriegoTieneAvanceRegistrado`: cruza por Sección + rango de fechas contra Riego. Cualquier día registrado cuenta como avance — incluso un día explícitamente "no se metió, con motivo" ya bloquea la edición, no solo los días con producto aplicado (lectura literal de "ejecutado/registrado" del prompt).
- `web/src/pages/fertilizantes/Fertirriego.tsx`: botón "Editar" junto a "Ver Orden"/"Liberar", visible solo si `programada`/`entregada` y sin avance registrado; reutiliza el mismo formulario de Programar en modo edición (Huerta bloqueada, igual que Granular/Aplicaciones).

**Probado en vivo, caso completo:** fertirriego de prueba programado (El Sonrisal, Válvula 1, NKS 0.001 kg/ha) → "Editar" cargó el formulario pre-llenado correctamente → cambié la dosis a 0.002 kg/ha → "Guardar cambios" → la tarjeta reflejó el cambio de inmediato (0.004 kg → 0.008 kg total de campaña) → "Liberar" con el nuevo modal de dos pasos → quedó "Vencida/liberada". Datos de prueba borrados por completo al terminar (fertirriego, sus productos/secciones, movimientos de Almacén, usuario de prueba).

## 7. Bug: las programaciones "Liberadas" se quedaban visibles para siempre (NUEVO, reportado por Diego 31-ago-2026)

Diego probó "Liberar" en Fertirriego (para revisar el candado del punto 6) y notó que el registro liberado se queda ahí, con la etiqueta "Vencida/liberada", sin ninguna forma de dejar de verlo — ni desaparece de la lista ni hay manera de ocultarlo.

**Aclarado con Diego antes de tocar código** (dos preguntas, para no adivinar):
1. **Alcance:** ¿solo Fertirriego, o también Granular y Aplicaciones (mismo botón "Liberar" idéntico en los 3)? → **Los 3 módulos.**
2. **Qué significa "borrar":** ¿borrado real de la base de datos, o solo ocultarlo de la lista activa conservándolo para consulta? → **Ocultar de la lista, conservar en el sistema** — importante porque los movimientos de Almacén (qué se comprometió y qué se liberó) siguen apuntando a ese registro; borrarlo de verdad rompería esa trazabilidad.

**Construido, en los 3 módulos (Fertirriego, Granular, Aplicaciones):**
- `listarFertirriego`/`listarGranular`/`listarAplicaciones` ahora excluyen `estado: { notIn: ["vencida", "cancelada"] }` por default; nuevo parámetro opcional `incluirCerradas` (query `?incluirCerradas=true`) las vuelve a traer.
- Cada pantalla (`Fertirriego.tsx`, `Granular.tsx`, `Aplicaciones.tsx`) tiene ahora un checkbox "Mostrar vencidas/canceladas" (apagado por default) junto al botón de programar.
- Nada se borra de la base de datos — el registro y todos sus movimientos de Almacén siguen intactos, solo se ocultan de la vista normal.

**Ampliado a "cancelada" el mismo día, a pedido explícito de Diego** ("aplica el mismo arreglo a canceladas") — mismo mecanismo, un solo checkbox cubre ambos estados en vez de dos toggles separados, ya que para el usuario es la misma pregunta ("¿ya terminé con esto?").

**Probado en vivo, dos veces:** primero solo con "vencida" — el fertirriego real de El Sonrisal que Diego liberó dejó de aparecer en la lista al recargar, y volvió completo al marcar el checkbox. Después de ampliar a "cancelada", repetí la prueba con el checkbox renombrado — mismo comportamiento, sigue funcionando en los 3 módulos.

## Estado técnico

- Backend, web y shared sin errores de TypeScript (`tsc --noEmit` limpio en los tres). Build de producción corrido limpio en backend y web.
- 3 migraciones de Prisma (todas del 29-ago, verificadas contra 0 filas existentes antes de aplicarse): `20260829045108_fertirriego_dosis_ha`, `20260829051008_nomina_semana_confirmada`, `20260829052922_comparador_zonas_flete`. **La ampliación del 31-ago (1.6-1.9, 5, 6) no necesitó ninguna migración nueva** — todo se resolvió con lógica de lectura/UI sobre el schema ya existente.
- Todo probado en vivo en el navegador con un usuario de prueba temporal (creado y borrado en la misma sesión), y todos los datos de prueba (Zonas, Proveedores, Comparaciones, Órdenes, la semana de prueba del candado, el fertirriego de prueba del 31-ago) borrados por completo al terminar — cero rastro en producción.
- Sin commitear todavía — pendiente de que Diego confirme antes de subir a GitHub.
