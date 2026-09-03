# Reporte — actualización del documento vivo (3-sep-2026)

Sesión larga con 2 partes: (A) 2 ajustes puntuales pedidos directo en el chat (botón "Toda la Huerta" faltante en Fertirriego, y Cierre del día sin fechador), y (B) el prompt `CBF_ERP_Reestructura_Completa_03092026_V11.docx` con 3 prioridades de diseño. Commit `e5b1c5c` sobre `2409495`, rama `main`, ya subido.

## Parte A — Ajustes puntuales

**Botón "Toda la Huerta" en Fertirriego.** Diego reportó que no aparecía al seleccionar Secciones de Riego, y preguntó si se había quitado sin su autorización. Se investigó primero: se buscó la cadena "Toda la Huerta" en **todo el historial de git** de `Fertirriego.tsx` — no aparece en ningún commit desde que el archivo existe. Conclusión: nunca se construyó ahí (sí existe en Aplicaciones/Actividades/Granular desde el 16-ago-2026) — no fue una regresión ni algo removido. Se agregó siguiendo el mismo patrón que las otras 3 pantallas, adaptado a Secciones de Riego.

**Cierre del día sin fechador.** Diego pidió que la pantalla ya no obligue a elegir una fecha una por una — ahora lista automáticamente una tarjeta por cada Huerta+fecha que tenga algo capturado y sin cerrar, sin importar la fecha (útil sobre todo tras cargar nómina atrasada). Reutiliza `diasPendientesDeCierre` (ya existía para notificaciones, nunca se había conectado a esta pantalla) — no hizo falta endpoint nuevo. Probado contra datos reales: Viernes 28-ago no aparece (Diego ya lo había cerrado), sí aparecen las 4 tarjetas pendientes (Sábado/Domingo/Lunes/Martes) con el tag de plazo correcto en cada una.

## Parte B — Prompt del 3-sep: 3 prioridades

Regla de trabajo pedida por Diego para este prompt: preguntar antes de asumir cualquier cosa no definida — "seguir derecho" nunca autoriza inventar una decisión de producto. Se siguió así: 2 preguntas reales se le hicieron directo a Diego antes de construir la Prioridad 1 (ver abajo), y no se avanzó a la siguiente prioridad hasta que la anterior quedó reportada y validada.

### Prioridad 1 — Pestaña "Órdenes de Compra" (la más grande)

Nueva 5ª pestaña de primer nivel en Compras → Órdenes — el único lugar donde de verdad se arma y genera una orden de compra real. "Cotizar"/"Generar orden de compra" desde Pendientes ya no genera nada directo, redirige aquí.

**3 formas de entrada:** Por Proveedor (todo lo ya cotizado con él en toda la empresa), Por Orden (una programación completa con todos sus productos — decisión de Diego: "una orden son varios productos", distinto del "Por orden" que ya existe en Pendientes, que es individual), Por Producto (todas las necesidades pendientes de ese producto en toda la empresa).

**Pregunta 1 hecha a Diego antes de construir:** ¿"Por Orden" significa una sola necesidad (1 producto) o la programación completa (varios productos)? Confirmó: la programación completa — así quedó.

**Mecanismo de generación:** después de asignar Proveedor por producto/línea, el sistema agrupa automáticamente por el Proveedor resultante y muestra vista previa antes de generar. Decisión de arquitectura (no de producto): las filas reales de `OrdenCompra` generadas en la misma sesión hacia el mismo Proveedor **comparten un folio** a propósito (el campo `numero` dejó de ser único por fila) — un PDF = un folio = potencialmente varias filas (una por línea de origen), que el PDF combina sumando las que sean del mismo producto. Esto evita una migración de esquema mucho más invasiva (una tabla nueva de "orden generada" con líneas) sin perder nada del comportamiento pedido.

**Pregunta 2 hecha a Diego, encontrada probando el caso real que motivó esta prioridad:** cuando el mismo Proveedor+Producto se cotizó por separado en 2 necesidades distintas (cada captura con su propia "cantidad disponible"), ¿el tope al generar se agrupa por Proveedor+Producto en conjunto, o cada cotización capturada tiene su propio tope aislado? Confirmó: agrupado por Proveedor+Producto (el disponible real del Proveedor es uno solo). Se toma como vigente la cotización más reciente de ese par — esa parte específica (cuál captura manda cuando hay varias) la decidió Claude Code, tal como Diego indicó.

**Campo nuevo en el Comparador (1.4):** "Cantidad disponible" — checkbox "Cantidad total disponible" o cantidad exacta, obligatorio uno de los dos, validado en pantalla y backend.

**Probado** con un script de 6 escenarios contra el backend real (datos de prueba creados y borrados, verificado antes/después):
- Por Orden con split automático a 2 Proveedores (Boro→Proveedor A, Fosfato→Proveedor B): folios distintos, correcto.
- Por Producto con consolidación (2 programaciones piden el mismo Nitrato al mismo Proveedor, 5L+10L): vista previa consolida en 1 sola línea de 15L, se generan 2 filas en BD que comparten folio, PDF las suma en 15L.
- Por Proveedor: solo muestra lo genuinamente pendiente (lo cubierto desaparece, sin ruido de otros proveedores).
- Tope excedido: 8+8=16L pedidos contra 10L reales disponibles → rechazado; ajustado a 6+4=10L → genera correcto, deja 2L y 4L pendientes.

**Nota dejada para Diego, no bloqueante:** en "En Camino", las líneas consolidadas se ven como tarjetas separadas (una por línea de origen), cada una con "Descargar PDF" dando el mismo documento combinado correcto — si prefiere que se vean agrupadas visualmente ahí también, es un ajuste aparte.

### Prioridad 2 — Nota estimada de tanque pendiente (Aplicaciones + Almacén)

Exclusiva de Aplicaciones (no Fertirriego, no Granular). Nueva función `calcularTanquePendiente` en `shared` (junto a `calcularMezclaPorTanque` ya existente): a diferencia de esa función (que usa hectáreas totales programadas), esta usa hectáreas **ya reportadas** y redondea tanques hacia **arriba** (no se prepara "1.5 tanques" en la realidad). Puramente informativa — no toca el descuento real de Almacén.

Se muestra en ambos lados con el mismo cálculo espejo: tarjeta de Aplicaciones (junto al % de avance) y Almacén Local (columna nueva "En tanque pendiente").

**Probado:** reproducido el ejemplo exacto de Diego (tanque de 10 ha, 15 de 27 ha reportadas) contra el cálculo puro → 1.5 tanques necesarios, 2 preparados, **1000L pendientes** — coincide con su ejemplo. Probado también de punta a punta con una Aplicación real en El Sonrisal (creada, verificada, borrada): Aplicaciones y Almacén Local mostraron el mismo 1000L. Casos borde probados: número exacto de tanques → no muestra nada; cero avance → tampoco.

### Prioridad 3 — Nota de monto acumulado en vivo (Nómina)

**3.1, Captura del día:** notita gris en la esquina inferior derecha de cada tarjeta ("Estimado del día: $X"), se recalcula al vuelo con cada cambio, no editable, no afecta el guardado real.

**3.2, Cierre del día Paso 2:** cada tarjeta de persona ahora trae su monto bruto, usando `tarifaAplicada` ya congelada al capturar (no hay que recalcular tarifa).

Ambos usan el mismo criterio simple que ya usaba el "Total a Pagar" de Paso 1 (cantidad × tarifa, sin el caso especial de "Depende de Empacadores" — esquema que Paso 1 tampoco desglosa, y que ningún catálogo real usa todavía).

**Probado contra datos reales:** el sábado 29-ago (21 registros reales ya capturados) — la suma por persona con el criterio nuevo de Paso 2 coincidió **exacto** con el Total a Pagar de Paso 1 ya existente: $4,649.78 en ambos lados. Confirmado que la tarifa general por hora sí está configurada en el sistema (37.5), así que la nota de Captura del día muestra montos reales desde ya.

## Estado técnico

- Backend, web y `shared` sin errores de TypeScript, build de producción limpio en los 3. `web/dist` reconstruido, `@cbf/shared` reconstruido, backend reiniciado dos veces (antes y después de un fix de agregación de tope encontrado durante las pruebas).
- 1 migración de Prisma (`20260903141342_ordenes_compra_folio_compartido_y_disponible`): quita el `@unique` de `OrdenCompra.numero` (a propósito, ver Prioridad 1), agrega `cantidadDisponibleTotal`/`cantidadDisponible` a `ComparacionCotizacion` — ambos cambios aditivos, sin pérdida de datos.
- Todo probado con scripts contra el backend real (sin credenciales de sesión de Diego — no fue posible probar clic a clic en pantalla), datos de prueba creados y borrados en cada caso, verificado con conteos antes/después.
- Ya subido a GitHub — commit `e5b1c5c` sobre `2409495`, rama `main`.
