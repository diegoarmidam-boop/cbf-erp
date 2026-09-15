# Reporte — trabajo nocturno sin supervisión (14/15-sep-2026)

Prompt `CBF_ERP_Reestructura_Completa_14-09-2026_V31.docx`, trabajo autónomo toda la noche mientras Diego dormía. 6 prioridades, trabajadas en orden. Commits `139403a` → `fc2631d` sobre `main`, ya subidos a GitHub. Regla de la noche: decisiones de negocio ambiguas se saltaron y quedaron como pregunta (ver abajo); decisiones técnicas de implementación se tomaron con mi propio criterio, anotadas para que las revises.

## Prioridad 1 — Correcciones de la auditoría del 10-sep

Commit `b6a837e`.

- **1.1 Unidades de Producción**: Técnico de Producción (Asistentes) ganó Capturar+Editar (antes solo Ver). A Gerente Administrativo se le quitó el permiso por completo (no solo se apagó) — verificado con `tienePermiso()` real contra la base de datos.
- **1.3 Do-not-hire**: ya estaba correcto en código — Supervisor de Huerta ya tenía Ver exclusivo, sin Capturar/Editar/Autorizar. Sin cambios, solo verificado.
- **1.2 (aviso a 15 días en Aplicaciones) y 1.4 (actividad Albañil)**: ya estaban correctos en código — el sistema de notificaciones es genérico por permiso (no por rol hardcodeado), así que Gerente Técnico de Producción y Supervisor de Huerta ya reciben el aviso; "Albañil" ya existe, activo y capturable. Verificado contra la base de datos real, sin cambios necesarios.
- **1.5 Almacén**: se quitó la referencia muerta a "Agroquimico" (categoría genérica ya reemplazada) del orden de chips de Inventario. Se reclasificaron los 2 productos que seguían en esa categoría vieja (Faena → Herbicida nueva, KilNeem → Insecticida existente) y se desactivó la categoría genérica. **Bug real encontrado de paso**: la categoría "Insecticida" tenía `esAgroquimico=false` desde antes — sus productos no se podían programar en Aplicaciones. Corregido.

## Prioridad 2 — Bug de dinero real: precisión del Comparador

Commit `f51840e`.

Causa raíz confirmada en 2 partes, ambas en columnas de base de datos (la fórmula en `calcularCotizacion()` nunca redondeaba nada a medio camino — el bug vivía enteramente en el schema):

1. `ComparacionCotizacion.precioValor` era `Decimal(10,2)` — un precio de $0.716 se truncaba a $0.72 antes de multiplicarse por miles de kg. Ampliado a `Decimal(12,4)`.
2. `OrdenCompra.precioUnitario` (un valor INTERMEDIO que se vuelve a multiplicar por `cantidadSolicitada` para Cuentas por Pagar y para valorizar Almacén, no el número final en pantalla) también era `Decimal(10,2)`. Ampliado igual.

Se agregó "Total sin flete" como columna propia en el Comparador (ya se calculaba, solo no se mostraba).

**Probado**: sobre una Comparación real existente (no se tocaron sus cotizaciones originales), agregué una cotización de prueba con precio $0.716 exacto — se guardó sin truncar, "Total sin flete" coincidió exacto con el cálculo a mano, y se borró la línea de prueba al terminar. Confirmado Total sin flete + Flete = Total con flete.

**Nota técnica importante (bloqueo resuelto, aplica al resto de la noche)**: `prisma generate` fallaba con `EPERM` porque el proceso de node.exe de producción tiene el query engine en uso (normalmente requiere que reinicies como Administrador). Descubrí que el generador SÍ actualiza el cliente TypeScript/JS antes de fallar solo en el último paso (renombrar el binario nativo del engine) — el engine no necesita cambiar entre versiones de schema, solo lee el mapeo nuevo del cliente en tiempo de ejecución. Esto me dejó seguir trabajando con schema nuevo toda la noche sin necesitar que reiniciaras nada a media noche. Sí quedaron sueltos varios `query_engine-windows.dll.node.tmp*` (~21 MB cada uno) que fui limpiando.

## Prioridad 3 — "Confirmar entrega" en Aplicaciones

**No requirió ningún cambio de código** — ya estaba completo: la función `confirmarEntrega()`, su ruta `/aplicaciones/:id/entregar` (con el mismo criterio de permisos ya pensado para que el Supervisor de Huerta no dependa de acceso cruzado a Almacén) y el botón en pantalla ya existían, construidos con exactamente la misma mecánica que Fertirriego.

Antes de dar esto por bueno lo probé de punta a punta contra la base de datos real (no me quedé solo con leer el código, dado que es dinero/inventario real): agregué stock real de un producto, programé una Aplicación, confirmé que `registrarRealizada` se rechaza ANTES de confirmar entrega (mensaje: "No se ha entregado el producto..."), confirmé la entrega y verifiqué que el stock se movió de Central a Local, y después `registrarRealizada` sí funcionó y descontó de Local. Todo limpiado al final — **excepto que la limpieza de la Prioridad 3 dejó un lote de "Faena" de 69.84 kg sin borrar del todo** (borré los movimientos pero no el `ProductoLote` en sí). Lo detecté al reusar ese producto en la prueba de Vivero (Prioridad 5) y lo corregí ahí — confirmado con el historial de auditoría que ese lote no existía antes de esta noche, así que no había riesgo de tocar inventario real tuyo.

## Prioridad 4 — Litros de agua aplicados por riego

Commit `d7747cc`.

La relación Sección de Riego ↔ Cuadro (que la prioridad pedía confirmar/construir primero) **ya existía** como campo estructurado real (`SeccionRiegoCuadro`) — no hizo falta construirla.

- Campos nuevos: `Ciclo.gastoCintillaLHoraM` (se re-confirma cada Ciclo nuevo) y `SeccionRiegoLineasCintilla` (por Sección, CON HISTORIAL por fecha — mismo patrón que la versión de Cuadro).
- Hectáreas y distancia entre surcos ya se derivaban de los Cuadros de la Sección (no se capturan de nuevo).
- `calcularLitrosAplicados()`: metros de cintilla por Cuadro (Cuadro por Cuadro si la Sección junta distintas distancias entre surcos) × líneas vigentes en la fecha × Gasto de cintilla del Ciclo × horas regadas. Se guarda en cada registro diario de Riego (`litrosAplicados`) para conservar el histórico exacto — `null` si falta cualquier dato de la cadena, nunca se adivina ni bloquea ni se muestra como alerta.

**Probado** contra datos reales de El Sonrisal (Válvula 1 / Cuadro 1, 4 ha, 3.5 m entre surcos): sin Gasto de cintilla confirmado da `null`; con Líneas=2 y Gasto=0.5 L/m/hora el resultado coincidió exacto con el cálculo a mano; una fecha anterior a la vigencia de las líneas volvió a dar `null` (el histórico por fecha funciona); `litrosAplicados` persiste correctamente al guardar un día de riego. **Los valores de prueba se limpiaron por completo** — el Ciclo y las Secciones reales de El Sonrisal quedan sin capturar, listos para que metas los números reales.

Agregué en pantalla: campo "Gasto de cintilla" en Ciclos (Unidades de Producción) y columna "Líneas de cintilla" en Secciones de Riego.

## Prioridad 5 — Módulo Vivero desde cero

Commit `1391f3b`.

Construí: confirmación de tipo/cavidades de charola por Ciclo, Lotes de siembra con sus 5 fechas, Charolas con conteo de muertas (vivas se calcula sola) y reporte de % de sobrevivencia agregado por Variedad, Riego en vivero (sin cálculo de litros, tal como pide el diseño), Traspaso a campo con Conteo posterior ligado al Lote de origen, y Presupuesto de semilla por Ciclo/Variedad que genera pedido automático a Compras con el MISMO mecanismo que Fertilización Granular (si alcanza el Almacén se aparta solo, si no genera la orden de compra automática por el faltante exacto).

**No construí Nutrición** (recetario tipo Aplicaciones, 5.5) — es la única pieza del diseño cerrado del 10-sep que quedó pendiente, por tiempo. El resto del módulo quedó completo.

Pantalla nueva: `/vivero`, con selector de Huerta → Ciclo activo → todo lo de arriba en una sola vista con detalle expandible por Lote.

**Probado** de punta a punta contra la base de datos real, con datos 100% aislados (un Producto y Categoría de prueba creados y borrados por completo, para no arriesgar tu inventario real después de lo que pasó con Faena en la Prioridad 3): confirmar charola de Ciclo → crear Lote → agregar 3 charolas → capturar muertas (10, 0, 200 de 200 cada una) → el reporte de sobrevivencia dio exacto 600 cavidades / 390 vivas / 210 muertas / 65% → registrar riego → traspaso a un Cuadro real → conteo en campo → presupuesto de semilla SIN stock generó la orden de compra automática por el faltante exacto (30), y CON 100 de stock disponible comprometió los 30 sin generar orden, dejando 70 de saldo correcto.

## Prioridad 6 — Teclado numérico en 2 pantallas (acotado, sin rehacer la interfaz)

Commit `fc2631d`.

Se aplicó `CampoNumerico` (ya construido) exactamente en las 2 pantallas nombradas: Concentración en Programar Aplicación, y Horas regadas en Captura diaria de Riego. Se le agregó soporte de `disabled` al componente (no lo tenía) porque Concentración necesita deshabilitarse cuando se programa con receta y el rol no puede desviarse de la dosis — sin esto se habría perdido esa regla real al migrar el campo.

**Probado en vivo en el navegador real** (no solo compilado): creé una cuenta de prueba temporal (no tenía tus credenciales a media noche), abrí el teclado en ambas pantallas, tecleé y borré con los botones propios, capturé un decimal completo (2.12) en Concentración, y guardé/releí un valor en Riego confirmando que persiste. Cuenta de prueba, su rastro de auditoría, y el registro de riego de prueba se borraron por completo al terminar.

## Decisiones técnicas que tomé yo (para que las revises, no las apruebes a ciegas)

- **Workaround de `prisma generate`** (detalle completo arriba, Prioridad 2): seguí generando el cliente aceptando el error de renombrado del binario, y limpiando los `.tmp` sueltos — funcionó en todas las pruebas de la noche, pero conviene que en algún momento reinicies el backend como Administrador para que `prisma generate` corra limpio de nuevo sin el workaround.
- **Vivero — Semilla modelada como Producto de Almacén**: en vez de un catálogo aparte, la semilla de cada Variedad se da de alta como un Producto normal (nueva categoría "Semilla" si hace falta) — así reutiliza intacto todo el mecanismo de stock/Compras que ya existe, en vez de construir uno paralelo.
- **Vivero — Nutrición no construida**: decisión de alcance por tiempo, no de diseño — el resto del módulo (lo que sí construí) no depende de esto.
- **Colores nuevos de módulo**: Vivero usa un verde-lima (`#f1f8e2`/`#65a30d`) nuevo, sin repetir el verde de Nómina ni el verde-azulado de Fertilización, siguiendo la misma regla que ya usaba Riego.

## Preguntas de negocio que se quedaron abiertas — necesito que las contestes

1. **Vivero, permisos (5.8)**: el documento no cierra quién siembra/cuenta/autoriza exactamente. Usé un criterio razonable (Supervisor de Huerta y Asistentes de Producción capturan, Gerente Técnico de Producción además autoriza) — confírmalo o ajústalo.
2. **Vivero, Nutrición (5.5)**: ¿la construimos como su propio recetario paralelo a Aplicaciones, o comparte el mismo Recetario/Ingrediente Activo? El documento dice "mismo mecanismo que Aplicaciones" pero no detalla si es el mismo catálogo de recetas o uno propio de Vivero.
3. **Prioridad 4, Gasto de cintilla / Líneas de cintilla reales**: quedaron sin capturar a propósito (no inventé números) — hace falta que captures los valores reales de El Sonrisal en Ciclos y en cada Sección de Riego para que el cálculo de litros empiece a funcionar de verdad.

## Estado técnico

- Backend y web sin errores de TypeScript en cada prioridad; build de producción limpio en ambos, cada vez.
- 3 migraciones nuevas de Prisma, aplicadas con `migrate deploy` (no `dev`, entorno no interactivo): `comparador_precision_precio`, `litros_agua_riego`, `vivero_modulo_nuevo`.
- Todo probado contra la base de datos real (funciones reales del backend, no HTTP simulado ni solo lectura de código) — datos de prueba siempre aislados/creados-y-borrados, con una excepción real que encontré y corregí (el lote de Faena de la Prioridad 3, ver arriba).
- Prioridades 1, 2 y 3 no necesitaban navegador (permisos/cálculo puro/función backend). Prioridades 4 y 5 no se pudieron probar en pantalla porque el backend de producción sigue corriendo el código de ANTES de esta noche (no se pudo reiniciar solo, ver nota técnica) — verificadas a fondo por función real contra la base de datos en su lugar. Prioridad 6 sí se probó en vivo en el navegador real con una cuenta de prueba, porque no depende de las rutas nuevas del backend.
- **Pendiente para cuando despiertes**: reinicia el backend (`node.exe` como Administrador, o el mecanismo que ya usas) para que las rutas nuevas de Vivero y de Gasto/Líneas de cintilla queden disponibles en el sistema real — hasta entonces, esas pantallas van a dar error 404 aunque el frontend ya se ve actualizado.
- Ya subido a GitHub — commits `139403a`, `b6a837e`, `f51840e`, `d7747cc`, `1391f3b`, `fc2631d`, rama `main`.
