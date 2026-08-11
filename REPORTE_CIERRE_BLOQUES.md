# Reporte de cierre — Bloques 2 al 9

Buenos días, Diego. Terminé todos los bloques pendientes del documento vivo durante la noche. Aquí está el detalle de qué se construyó, qué verifiqué, y los puntos que necesito que confirmes.

**Nada se subió a ningún lado.** Todo sigue en tu máquina, en localhost (backend puerto 4000, web puerto 5174), tal como pediste. La base de datos está limpia — sin datos de prueba, 102 Personal activos, sin notificaciones falsas pendientes. Definimos cómo subirlo a una web app cuando tú quieras.

---

## Bloque 2 — Cuadros y variedades
- Se quitó `variedad` de `CuadroVersion` (ya no existe ese campo).
- Se agregó el candado de superficie por variedad y se quitó el tope de 10 filas.

## Bloque 3 — Almacén
- Catálogo e Inventario se fusionaron en una sola pantalla.
- La presentación de producto ahora son 3 campos separados (Contenedor + cantidad + unidad) en vez de un texto libre.
- Nuevos catálogos abiertos: Categoría de Producto, Ingrediente Activo, Contenedor.
- **Confirmaste:** borrar el producto de prueba "nananan" — hecho, verificado que ya no existe.

## Bloque 4 — Compras
- Nuevo Comparador de Cotizaciones (herramienta aparte, no genera órdenes — acceso abierto a todos los roles con acceso a Compras, como indica el documento).
- Nueva vista de Cuentas por Pagar con alerta de vencimiento.
- **Confirmaste:** la regla de redondeo es "viernes más próximo sin pasarse de la fecha límite" — implementada así.
- Ahora se muestra la recepción real (no solo lo solicitado) en las Órdenes.

## Bloque 5 — Aplicaciones y Fertilizantes
- Avance por Cuadro (antes era solo por Huerta completa).
- Descuento proporcional de inventario según hectáreas realmente aplicadas.
- Cancelación de aplicaciones con motivo.
- Candado de consistencia con Nómina: si el día ya cerró en Nómina para esa Huerta, no se puede crear ni editar una Aplicación/Fertilización de ese día — salvo "caso extraordinario" con permiso de `nomina:editar`.

## Bloque 6 — Riego
- Vista "Todas UPs" para ver todos los ranchos de un vistazo.
- Candado de motivo: si no se aplicó el riego programado, hay que decir por qué.
- Historial semanal visual.

## Bloque 7 — Nómina (el bloque más grande)
**7.1 — Bugs de Reporte semanal:**
- Corregido el bug de descuento de préstamo que desaparecía del reporte una vez aplicado (ahora se busca primero si ya existe el descuento real del periodo, y solo se proyecta si no se ha aplicado).
- Rediseñada la pantalla de "Aplicar descuento".
- **Revisé también** el bug que menciona el documento sobre "persona fija que también hizo destajo esa semana debe sumar destajo completo al sueldo" — confirmé en el código que esto **ya funciona correctamente** (bruto = sueldo fijo + destajo completo, siempre que corresponda pagar el fijo ese periodo). No fue necesario tocar nada ahí.

**7.2 — Grupos de Pago:**
- `GrupoPago` ya no pertenece a una sola Huerta — es global, con pestaña propia.
- Asistencia dinámica por día: puedes marcar a alguien como ausente o poner un sustituto ese día específico, sin tener que sacarlo del grupo permanentemente.
- Regla de 3 días: si alguien falta o sustituye 3 días seguidos, se ajusta el roster fijo del grupo automáticamente al 4to día.

**7.3 — Captura y Cierre del día:**
- Captura del día rediseñada: tarjeta por persona (no por Huerta), con selector de Huerta por línea.
- Vista "Todas UPs" para capturar/revisar todos los ranchos el mismo día.
- Edición de capturas ya guardadas.
- "Caso extraordinario": permite editar un día ya cerrado, solo con permiso de `nomina:editar`.

## Bloque 8 — Notificaciones
- Se amplió la pantalla de "Solicitudes" a un hub central de alertas, ahora en `/notificaciones`.
- Sigue mostrando lo de siempre (solicitudes pendientes de autorizar) y además ahora avisa de:
  - Órdenes de compra pendientes de autorizar.
  - Cuentas por pagar próximas a vencer.
  - Aplicaciones/Fertilizaciones con 15+ días sin entregar o sin terminar.
  - Descuadres de Almacén Local a 15+ días.
  - Días de Nómina vencidos o que vencen hoy sin cerrar.
- Todo filtrado por rol y por alcance de Huerta (si tu usuario ve solo un rancho, solo te avisa de ese rancho).
- Probado con datos reales: generé una alerta real de cierre de Nómina pendiente, confirmé que el sistema la detecta correctamente, y la limpié después.

## Bloque 9 — Roles que no existen
- Sin cambios de código. Confirmé contra el documento que choferes, jefes de cuadrilla, Inocuidad, Velador, Con Acceso y Auxiliar no se agregan al organigrama ni tienen permisos, tal como ya lo habías confirmado.

---

## Un pendiente que quiero que confirmes

En Grupos de Pago (bloque 7.2), la regla de "falta justificada" que exime del ajuste automático de 3 días **no la construí** — porque el módulo de Asistencia actual no tiene ningún campo o proceso para marcar una falta como "justificada" (el documento mismo dice que ese caso queda "sin proceso formal" por ahora). Implementé la regla de 3 días tal cual, sin excepción para faltas justificadas, y lo dejé comentado en el código como pendiente. Si quieres esa excepción, dime cómo definirías una "falta justificada" en el sistema y lo agrego.

---

## Estado técnico
- Backend y web sin errores de TypeScript (`npm run typecheck` limpio en ambos).
- Los dos servidores están corriendo y respondiendo (backend `:4000`, web `:5174`).
- Base de datos verificada limpia: 102 Personal, sin productos ni movimientos de prueba, sin notificaciones falsas.

Cuando quieras, platicamos cómo subir esto a una web app que puedas ver desde tu teléfono.
