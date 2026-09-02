# Reporte — actualización del documento vivo (1/2-sep-2026)

Prompt maestro de 4 bloques (lo que quedaba pendiente del rediseño de Compras, más una corrección visual nueva). El reporte del 29/31-ago ya quedó integrado al documento vivo — este reporte empieza de cero, es solo lo de esta sesión.

Los 4 bloques quedaron construidos y verificados: primero con un script de prueba directo contra la base de datos (para las partes de dinero/inventario, donde un error real sería grave), y después haciendo clic en la pantalla real de principio a fin. Todos los datos de prueba se crearon y se borraron por completo — cero rastro en producción. Typecheck y build limpios en `backend`, `web` y `shared`.

## Antes de empezar — la pregunta pendiente sobre roles

El prompt preguntaba si la mejora 6 del reporte anterior (recordatorio de Fertirriego a Regador/Supervisor de Huerta/Gerente Técnico, en vez de "Encargado de Riego/Rancho" que no existe) bloqueaba algo de este prompt. **No la bloqueó** — ninguno de los 4 bloques toca Notificaciones. Sigue pendiente de que Diego confirme esos roles cuando pueda, sin prisa.

## Bloque 1 — Comparador de Cotizaciones: terminar el rediseño

El Comparador dejó de ser una herramienta de análisis aparte — ahora **es** el paso de "Cotizar" de Compras, y de ahí sale la orden de compra real.

**1.1 — Captura asíncrona, línea por línea.** Ya se podía desde antes (`+ Agregar cotización` guarda cada línea al momento, sin perder las anteriores) — no hizo falta tocar nada ahí. Lo nuevo es que la Comparación ahora nace ligada a una Orden de Compra real (`Comparacion.ordenCompraId`, único) en vez de capturar producto/cantidad sueltos.

**1.2 — Historial permanente de precios.** Una Comparación con al menos una orden real generada ya no se puede borrar (ni una cotización individual que ya generó una orden) — Diego tendría que borrar la orden real primero, y esas también se protegen (ver 1.5). El historial de precios por Proveedor queda ahí para siempre, disponible para consultar y negociar.

**1.3 — Etiqueta "(mejor precio)".** El Proveedor con menor Total con flete ya se marcaba internamente como "Mejor Global" — se agregó la etiqueta "(mejor precio)" justo junto a su nombre en la lista, como pedía el punto.

**1.4 — "Generar orden de compra" y compras parciales.** Esta fue la pieza más grande. Al elegir un Proveedor ya cotizado y decir cuánto comprarle, se genera una orden de compra real (folio consecutivo, Proveedor y precio fijos) — si no cubre todo lo necesario, la necesidad se queda abierta por el resto, mostrando una tarjeta "Necesario / Ya comprado / Pendiente" en tiempo real. Se puede seguir generando más órdenes desde otras cotizaciones hasta cubrir el total, momento en que la necesidad pasa a estado "Cubierta" sola.

Probado con un caso real de compra partida en 2 Proveedores (100 kg necesarios → 50 kg de un Proveedor, 50 kg del otro): la necesidad se quedó abierta después de la primera compra, se cubrió con la segunda, y cada compra generó su propio folio y su propia Orden de Compra en PDF (tiene que ser así — cada Proveedor recibe su propio documento, no se puede repartir un PDF entre dos).

**1.5 — Cancelación ligada a la programación de origen.** Confirmado el bug real: hasta ahora, cancelar una Aplicación/Fertilización/Fertirriego dejaba la orden de compra automática huérfana, pidiendo cotizar algo que ya nadie necesitaba — nunca se tocaba. Ahora, al liberar/cancelar la programación, cualquier orden ligada que no haya llegado a Almacén (incluso si ya tiene Proveedor y precio fijos, "en camino") se cancela junto — una ya recibida nunca se toca. Se reutilizó el mismo patrón de "ocultar sin borrar" del 31-ago: las órdenes canceladas/rechazadas ya no aparecen por default en la lista de Compras, con un botón "Mostrar canceladas/rechazadas" para consultarlas.

**1.6 — Permisos.** Sin restricción adicional, como pedía — mismo criterio que ya tenía el Comparador.

## Bloque 2 — Compras agrupadas por Ingrediente Activo + confirmar producto recibido

**2.1 — Vista agrupada.** Nueva pestaña "Por Ingrediente Activo" junto a "Por orden" en Compras — suma la cantidad pendiente de cada Ingrediente Activo entre todas las órdenes pendientes sin importar su origen, mostrando cuántas órdenes distintas la componen. Coexiste con la vista por orden, no la reemplaza.

**2.2 — Conexión al Comparador con cantidad precargada.** Desde cualquiera de las dos vistas, "Cotizar" te lleva directo al Comparador con la orden correspondiente ya elegida y su cantidad ya precargada, sin volver a capturar nada. **Decisión documentada:** una Comparación cotiza UNA orden a la vez (no varias juntas aunque estén agrupadas por el mismo Ingrediente Activo en la vista 2.1) — cotizar varias órdenes del mismo insumo a la vez habría sido un rediseño más grande del Comparador que no pedía este punto; desde la vista agrupada simplemente se elige con cuál de las órdenes empezar.

**2.3 — Confirmar producto recibido.** Al recibir una orden, ahora hay que confirmar explícitamente qué producto llegó de verdad — el pedido o alguno de sus sustitutos autorizados (Almacén → Producto preferido y sustitutos) — antes de poder confirmar la recepción.

**Pregunta que sí les hice antes de construir esto:** si llega un sustituto en vez del producto pedido, y esa orden estaba ligada a una programación en espera, ¿el sustituto cumple la programación (con la misma cantidad ya calculada) o solo entra a inventario general? Confirmaron: **el sustituto sí cumple la programación.** Para que eso funcionara de verdad (que la Aplicación/Fertilización/Fertirriego deje de verse como "esperando stock"), la fila de esa programación se actualiza para apuntar al sustituto en el momento de confirmar la recepción — la entrada de inventario siempre queda bajo el producto que de verdad llegó, nunca bajo el producto original si no fue ese el que se recibió.

**Bug real que encontré y corregí durante la prueba (no lo pidió el prompt, apareció al probar compra parcial + sustituto juntos):** si una necesidad se cubre con 2+ órdenes parciales y la primera confirma un sustituto, la fila de la programación queda apuntando a ese sustituto — la segunda orden parcial (que todavía trae el producto original en sus propios datos) dejaba de encontrar esa fila al recibirse, y el compromiso de stock para la programación nunca se completaba aunque ya hubiera llegado todo. Corregido: la búsqueda ahora reconoce la fila tanto por el producto originalmente pedido como por el que ya se confirmó antes. Verificado con el mismo caso exacto (50+50 kg, ambos como sustituto): con solo 50 no se comprometía nada (correcto, no alcanza), con los 100 completos sí se comprometió el total exacto.

## Bloque 3 — Orden de Compra en PDF + Configuración del sistema

**3.1 — Documento Orden de Compra.** Nuevo PDF con folio consecutivo (empieza en 1, un solo consecutivo para toda la empresa — verificado que no existía ningún folio atómico real en el sistema antes de esto; el de Equipos es solo una sugerencia editable, no evita duplicados por sí solo). No es comprobante fiscal — no calcula IVA/IEPS/retenciones, queda para una fase futura de Contabilidad. Trae: folio, fecha, datos de facturación de la empresa, datos del Proveedor, tabla de producto con importe, total, importe convertido a letra ("SON: ONCE MIL DOSCIENTOS PESOS 00/100 M.N.", con acentos correctos en veintiún/veintidós/etc.), y las dos firmas. Mismo estilo visual que las Órdenes de Aplicación/Fertirriego.

**Bug real que encontré y corregí durante la prueba:** el botón "Descargar PDF" (tanto en Compras como en el Comparador) usaba `window.open()`, que no manda la sesión/token de autenticación — la descarga fallaba con "no autorizado". Corregido al mismo patrón que ya usan las demás Órdenes del sistema (Aplicación/Fertirriego): pedir el PDF con el token explícito y descargarlo como archivo, no abrir la URL directa.

**3.2 — Ampliar Configuración del sistema.** Nueva sección "Datos de facturación y firmas" (razón social, RFC, domicilio fiscal, teléfono, firma "Atentamente", firma "Autorizó") — mismos roles que ya podían ver esta pantalla (Dirección General/Encargado de Sistemas), reutilizable por cualquier documento futuro que los necesite, no solo la Orden de Compra.

**Probado en vivo, caso completo:** generé una Orden de Compra real (100 kg, $20/kg) antes de llenar Configuración — el PDF salió correcto con "—" en los campos de empresa/firmas en vez de romperse. Llené Configuración, volví a descargar el mismo PDF (mismo folio) — ya salió completo con la razón social, RFC, domicilio, teléfono y ambas firmas.

## Bloque 4 — Corrección visual de las Órdenes de Fertirriego/Aplicación

Diego había descargado la Orden de Fertirriego real y encontró varios problemas de diseño. Los 4 se diagnosticaron con precisión antes de tocar nada:

**4.1 — Logo cortado.** La causa exacta: la línea rosa separadora vivía en y=90, dentro del rango vertical del logo (y=30 a y=100 con ese tamaño) — cruzaba justo el wordmark "CHULA BRAND" de la imagen. Se bajó la línea, ya no cruza el logo.

**4.2 — Columnas por Ingrediente Activo.** Los encabezados de la tabla de la Orden de Fertirriego (donde cada producto es una columna) ahora muestran el Ingrediente Activo ("Boro"), no el Nombre Comercial ("ULTRASOL MICRO REXENE BORO"). Revisé toda la base de datos real buscando algún caso de una programación con 2 productos del mismo Ingrediente Activo (habría dado encabezados duplicados) — no encontré ninguno, nada que reportar.

**4.3 — Encabezados recortados.** La causa: la tabla usaba una altura fija (20px encabezado, 18px filas) sin medir cuánto texto real iba a ocupar cada celda — cuando un encabezado envolvía a 2 líneas ("Nitrato de Magnesio", "Fosfato Monoamónico"), se salía de esa altura fija. Ahora la tabla mide el texto real de cada celda antes de dibujar y usa esa altura — nunca se vuelve a cortar, sin importar cuánto texto tenga.

**4.4 — Contraste ilegible en la app.** La causa: el color blanco del encabezado estaba puesto en la fila (`<tr>`) completa, pero cada celda (`<th>`) tiene su propia regla de color en el sistema que le gana a lo heredado del padre — el texto salía gris sobre fondo vino. Corregido poniendo el blanco directo en cada celda.

**4.5 — Alineación en filas de 2 líneas.** Mismo arreglo que 4.3 (altura medida, no fija) — ahora cuando la primera columna de una fila ocupa 2 líneas (ej. "Total de campaña (hasta 2026-11-30)"), el resto de las columnas de esa fila crecen junto y quedan alineadas, en vez de que la segunda línea se monte sobre la fila de abajo.

**4.6 — Aplica a ambos documentos.** El arreglo de la tabla (4.3/4.5) y el del logo (4.1) son código compartido entre Orden de Aplicación y Orden de Fertirriego — se corrigieron una sola vez, benefician a los dos. El cambio de encabezados por Ingrediente Activo (4.2) es específico de Fertirriego (Aplicación ya mostraba "Ing. Activo" como columna propia, con nombre comercial aparte — no tenía este problema). El de contraste (4.4) también es solo de Fertirriego — la vista de Aplicación no usa tabla ahí.

**Probado en vivo:** generé el PDF real de la Orden de Fertirriego de El Sonrisal después del cambio — logo limpio, columnas "Boro / Zinc / Manganeso / Micro Mix / Nitrato de Magnesio / Fosfato Monoamónico / Fosfonitrato / Nitrato de Potasio", "Nitrato de Magnesio" y "Fosfato Monoamónico" envuelven a 2 líneas sin cortarse, y la fila de "Total de campaña" (que también envuelve) no descuadra el resto.

## Estado técnico

- Backend, web y shared sin errores de TypeScript, build de producción limpio en los tres.
- 1 migración de Prisma nueva (`20260902043325_compras_orden_real_y_config_empresa`): nuevos estados `cancelada`/`cubierta` en Orden de Compra, folio, liga a la cotización que generó la orden, producto realmente recibido, liga de Comparación a su orden de origen, y las tablas nuevas `EmpresaConfig`/`Contador`. Todo aditivo — verificado contra las 16 filas reales de Orden de Compra que ya existían (ningún dato se movió ni se perdió).
- El paso de "Cotizar" simple de antes (un formulario con Proveedor+precio directo sobre la orden) se retiró por completo — quedó reemplazado por el Comparador. No quedó código muerto de esa ruta vieja.
- Todo probado en vivo: primero con un script contra la base de datos real para la parte de dinero/inventario (compra parcial + sustituto + cancelación en cascada, con aserciones explícitas en cada paso — así se encontró el bug del punto 2.3), después haciendo clic en la pantalla completa (Cotizar → Comparador → Generar orden → Descargar PDF → Configuración → Recibir con confirmación de producto). Todos los datos de prueba (productos, proveedores, zonas, comparaciones, órdenes, usuario, configuración de empresa de prueba) se borraron por completo al terminar — cero rastro en producción, verificado contando filas antes y después.
- Sin commitear todavía — pendiente de que Diego confirme antes de subir a GitHub.
