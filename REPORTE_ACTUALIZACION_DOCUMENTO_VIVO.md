# Reporte — actualización del documento vivo (4/5-sep-2026)

Prompt `CBF_ERP_Reestructura_Completa_03-09-2026_V16.docx`, tras una prueba de ciclo completo en producción (programar → comprar → recibir → aplicar → nómina). 7 prioridades, cada una con causa raíz investigada antes de tocar código, reportada y verificada en vivo antes de seguir con la siguiente. Commits `38e38ab` → `26b40f9` sobre `9ebd4fd`, rama `main`, ya subidos (uno por prioridad).

## Prioridad 1 — URGENTE: cantidad no se precargaba redondeada a presentación completa

Ya había generado una orden real mal dimensionada (Folio 23: 0.2 L en vez de 25 L). Causa raíz: la presentación de cada cotización nunca viajaba hasta la pantalla de Órdenes de Compra — solo el Comparador la tenía, así que ahí sí calculaba bien "Cantidad comprada" redondeada, pero al asignar en Órdenes de Compra se precargaba el pendiente crudo sin redondear. Se agregó `presentacionCantidad` a `LineaOrigenCotizacion` y la asignación ahora redondea igual que el Comparador (`Math.ceil` a presentaciones completas). Probado reproduciendo el caso exacto (0.2 pendiente, presentación 25) contra el backend real: antes precargaba 0.2, ahora 25.

## Prioridad 2 — Cambio de fondo: Presentación deja de ser fija por Producto Comercial

Un mismo Producto Comercial puede llegar en presentaciones distintas entre compras. Se quitó Contenedor/Cantidad de Producto (solo queda su Unidad base) y se movió la captura a 2 momentos: cotizar (Comparador, ya con Contenedor incluido) y recibir (Almacén → En Camino, formato "X Contenedores de Y Cantidad", total calculado solo). Cada lote guarda su propia Presentación — un mismo producto en presentaciones distintas ya no se suma ciego. Inventario nuevo: tarjeta principal agrupada por Ingrediente Activo (decisión de Diego, mismo criterio "Ingrediente Activo, nunca marca"), con detalle desglosado por Nombre + Marca + Presentación.

**Antes de este cambio**, a petición de Diego, se tomó un respaldo completo de la base (`ops/backups/`) y se vació el historial de Aplicaciones/Fertilizaciones/Compras/Inventario para empezar de cero con la arquitectura correcta — catálogos de Producto/Proveedor/Huerta quedaron intactos.

Probado de punta a punta: un Producto recibido en 2 presentaciones distintas (4 Sacos de 25 kg + 10 Costales de 10 kg) suma 200 kg correcto en Inventario, con las 2 líneas separadas en el detalle.

## Prioridad 3 — Categoría con check "¿Requiere Ingrediente Activo?"

La regla vieja (`categoria === "agroquimico" || "fertilizante"`) quedó desactualizada desde que se reemplazó "Agroquímico" genérico por tipos específicos — un insecticida de extracto natural no podía llevar Ingrediente Activo. Cada Categoría ahora decide esto al darse de alta, validado también en el backend (no solo ocultando el campo en la UI). Backfill de las 7 categorías existentes: fertilizante/agroquimico/Insecticida → Sí (confirmado con Diego que "agroquimico" genérico, con 2 productos reales, se queda en Sí por ahora), el resto → No.

## Prioridad 4 — Confirmar entrega en Aplicaciones

Investigado primero: el mecanismo completo (reservar en Almacén Central → botón → mueve a Local → avance descuenta de Local) ya existía en Aplicaciones, casi idéntico a Fertirriego — no era el bug reportado. El problema real, aclarado por Diego: el Supervisor de Huerta y otros roles que programan Aplicaciones/Fertilizantes no siempre tienen acceso a Almacén como módulo aparte, y "Confirmar entrega" en los 3 módulos exigía exclusivamente `almacen.capturar`. Confirmado que el gap es real hoy (Asistente Técnico, Capturista, Ayudante de Supervisor y hasta el Gerente Técnico de Producción están en ese caso) — los 3 endpoints ahora también aceptan el permiso del propio módulo.

## Prioridad 5 — 2 bugs reales de Compras

- Columna Zona vacía en la tabla de Proveedores aunque sí estaba guardada: la consulta `?todas=true` no traía la relación `zona`, solo el `zonaId` crudo — por eso se veía bien al editar (usa `zonaId` directo) pero no en la tabla.
- "Ir a Órdenes de Compra" desde el Comparador decía "Sin necesidades pendientes cotizadas" la primera vez: el `useEffect` que resuelve el deep-link solo ponía el estado de "cuál programación" pero nunca llamaba a la función que de verdad carga las líneas. Cambiar de pestaña "arreglaba" el síntoma solo porque reiniciaba el estado y forzaba a elegir la tarjeta de nuevo a mano.

## Prioridad 6 — Pestaña "Catálogos" centralizada en Configuración del sistema

Un solo lugar para los 8 catálogos abiertos del sistema. El "+" para agregar se queda donde ya vivía en cada módulo; editar nombre o desactivar/reactivar un valor ya existente se centraliza aquí, exclusivo de Director General/Encargado de Sistemas (decisión de Diego: incluye a Encargado de Sistemas, la cuenta técnica) — reforzado también en el backend con un middleware nuevo, no solo ocultando el botón. El panel de Zonas salió de Proveedores.tsx y se movió aquí. Grupos de Pago (más rico, con miembros y sin campo "activo") se quedó administrándose completo en Nómina — aquí solo hay un acceso directo. Probado: un rol sin ser Director/Sistemas recibe 403 al intentar editar; Director General sí puede.

## Prioridad 7 — Mejoras de UI (7 puntos)

"+ Tipo nuevo" en Programar Aplicaciones ya no está siempre expandido; Fecha inicio/fin van juntas; el Recetario (Aplicaciones y Fertirriego) dejó de ser un acordeón que empuja la lista hacia abajo y ahora es su propia pantalla completa; las etiquetas "Mejor Global"/"Mejor Local" del Comparador también se ven en Órdenes de Compra; el campo de Precio aclara la Presentación completa (ej. "Precio del Saco de 25"); al generar una orden aparece un botón de "Descargar PDF" directo ahí mismo, sin tener que ir a buscarlo después. (7.7 ya había quedado resuelto en la Prioridad 2.)

## Estado técnico

- Backend y web sin errores de TypeScript en cada uno de los 7 pasos; build de producción limpio en ambos cada vez.
- 3 migraciones de Prisma: `presentacion_no_fija_por_producto` (Prioridad 2, con respaldo previo de la base), `categoria_requiere_ingrediente_activo` (Prioridad 3, aditiva).
- Todo probado con scripts contra el backend real (sin credenciales de sesión de Diego), datos de prueba creados y borrados en cada caso — excepción real y a propósito: la Prioridad 2 sí vació el historial de producción, con respaldo tomado antes.
- Incidente de despliegue recurrente: el proceso de Node en el servidor no se cae solo al detener la tarea programada (proceso "huérfano" con privilegios elevados) — cada una de las 7 prioridades necesitó que Diego terminara `node.exe` manualmente desde el Administrador de Tareas para quedar activa. Verificado cada vez con `CreationDate` del proceso y una petición autenticada real (no solo sin sesión, que puede dar falsos positivos — lección de la sesión anterior).
- Ya subido a GitHub — commits `38e38ab`, `8586037`, `36021b6`, `6575970`, `9ebd4fd`, `7f35916`, `26b40f9` sobre `9ebd4fd` (el primero de la tanda), rama `main`.
