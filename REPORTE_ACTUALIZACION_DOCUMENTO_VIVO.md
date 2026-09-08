# Reporte — actualización del documento vivo (8-sep-2026)

Prompt `CBF_ERP_Reestructura_Completa_04-09-2026_V23.docx`, tras otra ronda de pruebas en producción. 7 prioridades, cada una con causa raíz investigada antes de tocar código (2 de ellas resultaron ser causas distintas a lo que decía el prompt — se confirmó con Diego antes de corregir). Commits `747da5e` → `960b95d` sobre `27ae527`, rama `main`, ya subidos.

## Prioridad 1 — Producto generado al 100% seguía en Pendientes de Compras

Causa raíz confirmada con una reproducción real: `listarPendientesPorIngredienteActivo` y `listarPendientesPorProgramacion` incluían el estado `"generada"` en su filtro de necesidades — pero ese estado nunca pertenece a la necesidad misma, solo a la orden real que se crea aparte al cotizar/generar. Esa orden real (sin la relación `comparacionOrigen`, que solo existe en la necesidad original) se colaba y se contaba con su cantidad completa sin restar nada.

**Probado**: creé una necesidad de 100 kg, la coticé y generé la orden real por el 100% — antes seguía apareciendo en Pendientes con 100 kg; después del fix, desaparece de inmediato. Repetí con cobertura parcial (40 de 100, comprando un sustituto autorizado, no el preferido) y confirmé 60 kg pendientes correctos, emparejado por Ingrediente Activo.

## Prioridad 2 — Tope de asignación validaba contra Pendiente, no contra Disponible

En `validarYAgruparAsignaciones` había un segundo tope redundante que comparaba la cantidad asignada contra `cantidadPendiente` de la necesidad, en vez de contra `cantidadDisponible` del Proveedor (que ya se valida aparte y no bloquea nada si es "Toda"). Se quitó ese segundo tope.

**Probado**: necesidad de 100 kg con Proveedor "Toda disponible" — asigné 150 (más de lo pendiente) y ya no se bloquea; la orden se genera por 150.

## Prioridad 3 — Migración de recetas viejas: el diagnóstico no era correcto

Antes de escribir el script de migración, probé con la propia receta "TM Riego Papaya 1" (de antes del 3-sep) y confirmé que **no había ningún dato viejo que migrar** — el Ingrediente Activo vive en el catálogo de Producto, no en la receta, y ya estaba bien puesto en recetas viejas y nuevas por igual. La causa real: la tarjeta "Por Programación" en Compras mostraba siempre "Nombre Comercial (Ingrediente Activo)", para cualquier receta, vieja o nueva. Se lo planteé a Diego, confirmó quitar el Nombre Comercial de esa tarjeta — ahora muestra solo Ingrediente Activo (con respaldo al nombre comercial en productos sin uno, como Combustible).

## Prioridad 4 — Solicitud manual: Título obligatorio y varios productos

Se agregó `titulo`/`solicitudManualId` a `OrdenCompra` (migración) — el Título reemplaza el genérico "Solicitud manual" en las tarjetas de Pendientes y Órdenes de Compra, y ahora se puede pedir uno o varios productos en la misma solicitud (mismo patrón "+ Otro producto" de Aplicaciones/Fertirriego), agrupados en una sola tarjeta por `solicitudManualId`.

**Probado**: creé una solicitud "Refacciones bomba de riego" con 2 productos distintos — confirmé que quedan en la misma tarjeta, con el título correcto y ambas líneas intactas.

## Prioridad 5 — Nueva Frecuencia "Días específicos de la semana" en Fertirriego

Checkboxes Lunes a Domingo (mínimo 1), conviven con las 4 Frecuencias existentes. Riegos en la semana = número de días marcados (constante); campaña completa = fechas reales del rango que caen en esos días. El PDF y el recordatorio diario de Riego usan el mismo cálculo, y el recordatorio ya solo se dispara los días marcados.

**Encontrado de paso y corregido**: un bug real de zona horaria — `Date.getDay()` sobre una fecha `@db.Date` corría el día calculado un día completo en Campeche (UTC-6), confirmado con `new Date('2026-08-31').getDay()` dando Domingo en vez de Lunes. Mismo problema que `semanaDeFecha` ya resolvía en otro lado con el truco de anclar a mediodía — se aplicó aquí también.

**Probado**: Fertirriego con Lun/Mié/Vie del 31-ago (Lunes) al 6-sep (Domingo) — 3 riegos en campaña correctos (31, 2 y 4-sep), recordatorio activo en Lunes y Miércoles, inactivo en Martes, PDF muestra "Lunes, Miércoles, Viernes" con 3 riegos en semana y 3 en campaña.

## Bug adicional encontrado y corregido (no estaba en el prompt): Categoría huérfana bloqueaba casi todo

Al probar la Prioridad 5 encontré que `Producto.categoria` (texto libre, no una relación) seguía comparándose en 8 lugares del código contra los nombres viejos en minúscula ("fertilizante"/"agroquimico"), escritos a mano. Al borrarse y recrearse esas Categorías con otro nombre ("Fertilizante", con mayúscula) desde la pantalla de Catálogos, la comparación dejó de calzar: bloqueaba programar casi cualquier producto en Fertirriego/Fertilización Granular, dejaba vacío el selector de Ingrediente Activo en Aplicaciones, y abría un hueco real de autorización (`esCategoriaRegulada` ya no exigía el permiso especial para autorizar/editar/desactivar agroquímicos/fertilizantes). Se lo planteé a Diego, confirmó corregirlo de inmediato.

Se agregaron banderas `esFertilizante`/`esAgroquimico` a Categoría (mismo criterio que "¿Requiere Ingrediente Activo?", Prioridad 3 de la sesión anterior) en vez de comparar contra un nombre fijo, y se repararon los 5 Productos cuyo `categoria` había quedado apuntando a una Categoría ya borrada.

**Probado**: confirmé que el selector de Ingrediente Activo pasó de 1 opción (Fosfonitrato, por casualidad) a 10 para Fertirriego, que `esCategoriaRegulada` vuelve a proteger correctamente, y programé un Fertirriego con Manganeso (que antes fallaba).

## Prioridad 6 — Rediseño de Inventario para escalar

6.1 corregido: la columna Existencia de la tabla quedaba en blanco para cualquier producto sin una entrada registrada — ahora siempre muestra un número real. 6.2: espacio reservado para Alertas de reorden hasta arriba de todo — no existía ninguna lógica de "stock bajo" en el sistema (búsqueda completa, cero resultados); Diego confirmó dejar el espacio sin inventar el cálculo. 6.3: filtro por Categoría en chips horizontales (los 8 que pidió Diego + Pieza/General/Insecticida que ya existían + Todos) — se crearon las 4 Categorías que faltaban (Empaque/Herramientas/Oficina/Laboratorio). 6.4: "Existencia por Ingrediente Activo" ahora colapsable y contextual (se oculta sola en categorías sin Ingrediente Activo, usando la misma bandera de la Prioridad 3). 6.5: la tabla queda filtrada por el chip elegido.

## Prioridad 7 — Lineamientos de interfaz (Bloque 11) — parcial, resto pendiente

Es una guía permanente para toda pantalla nueva, no una pantalla propia. Se aplicó 7.5 (esquinas muy redondeadas) de inmediato vía los tokens de diseño globales, cascadeando a toda la app sin riesgo (verificado en vivo: inputs de 10px a 16px de radio). Los otros 4 puntos quedaron pendientes por decisión de Diego:
- **7.1** (teclado numérico propio): se mostró un mockup interactivo con la paleta de CBF para su aprobación antes de construir el componente real — sigue pendiente de que lo confirme.
- **7.2/7.3/7.4** (números grandes, chips en vez de campos, iconos por categoría): Diego confirmó que aplican solo a pantallas nuevas de aquí en adelante, no a un barrido retroactivo de toda la app existente — eso queda como tarea aparte para otra sesión si se decide hacerlo.

## Estado técnico

- Backend y web sin errores de TypeScript en cada paso; build de producción limpio en ambos cada vez.
- 3 migraciones de Prisma: `solicitud_manual_titulo_multiproducto` (Prioridad 4), `fertirriego_dias_semana` (Prioridad 5), `categoria_es_fertilizante_agroquimico` (bug adicional, con reparación de datos de 5 Productos).
- Todo probado con scripts contra el backend real (funciones reales, no HTTP simulado), datos de prueba creados y borrados en cada caso.
- No se pudo verificar visualmente en el navegador por falta de credenciales de acceso — las Prioridades 3, 4 y 6 (cambios de pantalla) se verificaron por código y build limpio; la 7.5 sí se verificó en vivo porque no requiere sesión (pantalla de login).
- Ya subido a GitHub — commits `747da5e`, `bcb1acd`, `ce8995a`, `598a977`, `197c2cf`, `789992b`, `27ae527`, `960b95d`, rama `main`.
