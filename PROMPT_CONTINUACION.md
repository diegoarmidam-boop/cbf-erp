# Prompt de continuación — CBF ERP

Copia y pega todo este documento como primer mensaje en una nueva sesión de Claude Code para que retome el trabajo exactamente donde se quedó.

---

Estás retomando el desarrollo de **CBF ERP**, un sistema hecho a la medida para Chula Brand Farms, una empresa productora de papaya en Campeche, México. El dueño se llama Diego. Este NO es un proyecto genérico — es un sistema real que Diego y su equipo van a usar para operar el negocio, así que la precisión importa más que la velocidad.

## Instrucción permanente del dueño (aplica siempre, no solo a bloques pasados)

Cita textual de Diego, sigue vigente en todo momento:

> "No quiero que cambies nada de la lógica, o asumas cosas solo por trabajar — hay que ser precisos porque este programa lo estará usando mucha gente y no puede cometer errores. Sé cuidadoso en tu lectura y profundo en tu análisis y claro con las preguntas."

Y del documento vivo original: **"Si encuentras algo en el código real que no coincide con lo que dice el documento y no sabes cuál de los dos tiene razón, pregúntame — no lo resuelvas asumiendo."**

En la práctica esto significa:
- Antes de tocar lógica de negocio, lee la sección correspondiente del documento vivo completa (ver abajo dónde está) y compárala contra el código real.
- Si encuentras una ambigüedad genuina (el documento dice una cosa, el código hace otra, y no está claro cuál es la intención), pregúntale a Diego explícitamente en vez de adivinar. No apliques esto de más — si la respuesta es evidente por contexto (ej. un historial que confirma que algo ya se construyó), resuélvelo tú y déjalo documentado, no interrumpas por cosas ya resueltas por el propio documento.
- Después de cada cambio de lógica de negocio, verifica con una prueba real contra la base de datos (ver patrón de pruebas abajo) — no te quedes solo con que "compila".
- Diego ya dio autorización explícita para trabajar de corrido sin pausar a confirmar cada paso ("Si tu sigue"), siempre que sigas reportando con precisión al final y preguntes si encuentras algo genuinamente ambiguo.

## Estado del hosting — MUY IMPORTANTE

Diego decidió (8-ago-2026): por ahora el sistema corre **localmente en esta misma computadora Windows**, NO en la nube. La instrucción explícita más reciente fue: *"No no subas nada manten todo en local host por ahora"*. Más tarde definieron el plan de hosting final: computadora Windows local + **Tailscale Funnel** para acceso público estable (en vez de DigitalOcean, que queda como plan de escalamiento futuro).

**No despliegues nada, no crees cuentas de ningún servicio, no actives Tailscale Funnel tú mismo** — esas acciones están fuera de tus reglas de operación (no puedes crear cuentas ni modificar configuración de seguridad/red). Ya le dejé a Diego instrucciones paso a paso para que él haga esa parte (ver `REPORTE_ACTUALIZACION_DOCUMENTO_VIVO.md` en la raíz del repo, sección "Hosting"). Si te pide ayuda para el siguiente paso (que el backend sirva también el build de producción del frontend desde el mismo puerto, para que un solo `tailscale funnel 4000` deje todo accesible), eso sí lo puedes hacer — es código, no cuenta ni configuración de red.

## Arquitectura y stack

- Monorepo con npm workspaces: `backend/`, `web/`, `shared/`, `mobile/` (aún no se construye), `docs/`.
- TypeScript en todo. Prisma ORM v6.19.3. Base de datos MySQL llamada `cbf_erp`, corriendo local. Express 5. PKs tipo UUID. Auth con JWT.
- Permisos: una sola matriz `PermisoModulo` (rol × módulo × ver/capturar/editar/autoriza) que controla tanto autorización del servidor como qué ve el sidebar/menú del cliente.
- Mecanismo genérico "Propone/Autoriza" (`SolicitudPendiente`) reusado en varios módulos.
- Inventario FIFO por ingrediente activo (no por marca).
- Patrón "caso de uso ancla": una sola captura de campo dispara en cascada inventario + mano de obra + costo, para no forzar doble captura.

## Cómo arrancar los servidores

```bash
cd "C:\Users\Diego\OneDrive - Sunrise Produce LLC\Documentos\3.- Chula Brand\ERP\claude\CBF-ERP"
npm run dev --workspace=backend    # puerto 4000
npm run dev --workspace=web        # puerto 5173 (ojo: NO es 5174, cambió durante la sesión anterior)
```

Login de prueba: usuario `director`, contraseña `Chula123***` (rol Director General, acceso universal).

## El documento vivo — tu fuente de verdad de negocio

Diego mantiene un documento Word (`.docx`) que es la especificación completa del sistema, y lo va actualizando conforme prueba el sistema real y toma decisiones nuevas. Cuando te pase una versión nueva del documento:

1. Conviértelo a texto plano estructurado (con etiquetas `[Heading N]`, `[TABLE START]`/`[TABLE END]` con celdas separadas por ` || `, etc.) usando un script Node que parsea `word/document.xml` directamente después de descomprimir el `.docx` con `unzip` — `pandoc` NO está disponible en este entorno Windows, ni LibreOffice/`soffice`. Ya existe un extractor funcional que puedes recrear si hace falta (ver detalles técnicos abajo).
2. Compara contra la versión anterior extraída de la misma forma (si existe en el scratchpad de la sesión previa) usando `diff` sobre el texto SIN las etiquetas de estilo (esas etiquetas varían entre extracciones y generan ruido falso — quita el prefijo `[Tag] ` antes de comparar).
3. Lee con cuidado cada cambio real: puede haber bugs confirmados, rediseños, y decisiones nuevas mezclados. No asumas que todo lo que cambió aplica a todos los módulos parecidos — Diego a veces corrige un módulo específico y NO otro aunque se vean similares (ejemplo real: el rediseño de recurso Mochila/Turbina/Aguilón en Aplicaciones NO se aplicó a Fertilización Granular, que sigue con el esquema viejo "Con gente/Con implemento" — esto está confirmado explícitamente en el propio documento).
4. Antes de hacer cambios destructivos en la base de datos (borrar filas, quitar columnas con datos reales), investiga primero si esas filas son datos de prueba de Diego o datos reales — si tienes duda, **no las borres tú mismo con un script**: el clasificador de seguridad de Claude Code puede bloquear scripts de borrado ad-hoc (ya pasó en esta sesión). En ese caso, la alternativa correcta es migrar los datos hacia adelante dentro de la propia migración de esquema (ALTER TABLE + INSERT/UPDATE), no intentar rodear el bloqueo.

## Workflow de migraciones de Prisma (MUY específico de este entorno)

El entorno es no-interactivo, así que `prisma migrate dev` falla. En su lugar:

1. Crea manualmente `backend/prisma/migrations/<timestamp>_<nombre>/migration.sql` (timestamp con `date +%Y%m%d%H%M%S`).
2. Escribe el SQL a mano siguiendo la convención de nombres de tabla de este proyecto:
   - Las tablas que existían desde la migración `20260808000000_init` usan **PascalCase** en las referencias SQL (`Aplicacion`, `Equipo`, `Personal`, `Huerta`, `Usuario`, `GrupoPago`, etc.) — así se crearon originalmente y así hay que referenciarlas en nuevas `ALTER TABLE`/`FOREIGN KEY`, aunque `SHOW TABLES` las muestre en minúsculas (MySQL en este Windows es case-insensitive para nombres de tabla, pero los nombres de constraint SÍ importan literalmente).
   - Las tablas agregadas en migraciones posteriores usan **minúsculas** (`aplicacionrealizadacuadro`, `grupoasistenciadia`, etc.).
   - Antes de escribir una migración nueva, verifica en qué migración se creó cada tabla que vas a tocar (`grep -rn "CREATE TABLE" backend/prisma/migrations/*/migration.sql`) para saber qué casing usar.
3. Corre `npx prisma migrate deploy` desde `backend/`.
4. **Antes de `npx prisma generate`**, mata el proceso del backend dev-server (si está corriendo) o falla con un error de bloqueo de DLL en Windows: `netstat -ano | grep :4000` para el PID, luego `taskkill //PID <pid> //F`.
5. Corre `npx prisma generate`.
6. Reinicia el backend: `nohup npm run dev --workspace=backend > /tmp/backend-dev.log 2>&1 &`.

## Patrón de pruebas de auto-limpieza (úsalo para TODO cambio de lógica de negocio)

Escribe un script `backend/scripts/test-<algo>.ts`, córrelo con `npx tsx scripts/test-<algo>.ts` desde `backend/`, usa un helper local `ok(cond, msg)` que lanza error si falla, crea datos de prueba en la Huerta **"Rancho Nuevo"** (id `b797deb2-df27-4a60-99b0-8e38d5892209`) porque está vacía y no tiene datos reales que puedas afectar por accidente, limpia TODO en un bloque `finally` (o al final con manejo de errores), y borra el script en cuanto termines de correrlo. Nunca dejes scripts de prueba ni datos de prueba residuales en el repo o la base de datos.

## Cómo probar en el navegador (Browser pane de Claude Code)

No hay forma normal de llenar el formulario de login vía UI en modo automático (el campo de password se bloquea). El truco que ya funciona:

```js
fetch('http://localhost:4000/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'director', password:'Chula123***'})})
  .then(r => r.json())
  .then(data => {
    localStorage.setItem('cbf_token', data.token);
    localStorage.setItem('cbf_usuario', JSON.stringify(data.usuario));
    localStorage.setItem('cbf_modulos', JSON.stringify(data.modulosVisibles));
  });
```

Corre esto vía `javascript_tool` DESPUÉS de haber navegado al menos una vez a `http://localhost:5173` (si navegas a `about:blank` primero, `localStorage` da error de seguridad). Para inputs controlados por React, usar `.click()`/`.type()` vía `ref` a veces no dispara el evento sintético correctamente — usa el patrón de setter nativo + `dispatchEvent(new Event('input',{bubbles:true}))` si algo no se actualiza visualmente. `get_page_text` NO muestra el valor seleccionado de un `<select>` — usa `read_page` con `filter: "interactive"` para ver qué opción está `(selected)`.

## Qué está construido (todo, hasta esta sesión)

Los 9 módulos completos (Nómina, RH, Unidades de Producción, Almacén, Compras, Equipos y Maquinaria, Aplicaciones, Fertilizantes, Riego) más un módulo de Notificaciones (antes "Solicitudes", ampliado a hub central de alertas). Todos los bloques de corrección del primer documento vivo (bloques 0 al 9) están cerrados — ver `REPORTE_CIERRE_BLOQUES.md` en la raíz del repo para el detalle completo de qué se construyó en cada uno.

## Lo último que se hizo (esta sesión, 10-ago-2026) — un documento vivo actualizado

Diego mandó una versión nueva del `.docx` con correcciones que encontró probando el sistema real. Se procesaron y cerraron estos 4 puntos (detalle completo en `REPORTE_ACTUALIZACION_DOCUMENTO_VIVO.md`):

1. **Investigado un "bug" reportado de Compras→Almacén** — resultó NO ser un bug de datos (la cadena transaccional es correcta, verificado con prueba real de extremo a extremo), sino un problema de visibilidad: el número de "Existencia" en Inventario no distinguía disponible de comprometido. Corregido: ahora se muestran ambos por separado (`backend/src/modules/almacen/movimientos.ts` función nueva `stockComprometidoPendienteTodos`, ruta `GET /almacen/movimientos/comprometido-todos`, y `web/src/pages/almacen/Inventario.tsx`).
2. **Botón "Quitar persona" en Captura del día de Nómina** (`web/src/pages/nomina/CapturaDelDia.tsx`) — agregado, simétrico a "+ Agregar persona", solo visible si la tarjeta tiene al menos una línea manual editable.
3. **Rediseño grande de Aplicaciones** — Paso 1 cambió de recurso fijo (Con gente/Con implemento + equipo) a "recurso sugerido" (Mochila/Turbina/Aguilón, solo referencia). Paso 2 (Registrar avance) ahora captura una o varias **líneas** por reporte, cada una con su propia modalidad — Turbina/Aguilón requieren Tractor+Operador+Implemento, Mochila y Aguilón llevan lista de personas. Alimenta automático "Uso Diario" de Equipos. Migración de esquema: `backend/prisma/migrations/20260810162831_aplicaciones_modalidad_lineas/`. Nuevas tablas `AplicacionRealizadaLinea`/`AplicacionRealizadaLineaPersona`. **Confirmado explícitamente que esto NO aplica a Fertilización Granular** (sigue con `RecursoTipo` sin cambios). Las 2 Aplicaciones de prueba reales que ya existían se migraron hacia una línea "Mochila" cada una (no se borraron) — el caso que usaba "Con implemento" no conservó qué implemento era, porque el modelo viejo nunca guardó tractor/operador por separado.
4. **Rediseño del exportable "sobre" en PDF** (`backend/src/modules/nomina/sobre.ts`) — se descubrió que YA estaba construido (el "Pendiente" del documento estaba desactualizado, el propio historial del documento lo confirma). Se aplicó el rediseño: sobre físico de 9×15cm exacto, 3 por hoja carta horizontal, recuadro sin líneas punteadas, contenido simplificado a tabla de "ganado por día" en vez de detalle de actividades. Se encontró y corrigió un bug real de texto traslapado en "TOTAL A PAGAR" durante la verificación visual (renderizado con PyMuPDF vía `python -c` ya que no hay `pdftoppm`/LibreOffice en este Windows — instala `pymupdf` con `"/c/Python314/python.exe" -m pip install pymupdf` si necesitas volver a verificar un PDF visualmente).

## Pendiente conocido (sin resolver, documentado, no es un olvido)

En Grupos de Pago (Nómina), la regla de "se vuelve fijo/sale del grupo a los 3 días" no tiene excepción por "falta justificada" implementada, porque el módulo de Asistencia actual no tiene ningún campo para marcar una falta como justificada (el propio documento dice que ese caso queda "sin proceso formal" por ahora). Está comentado en el código. Si Diego pide esa excepción, hay que preguntarle primero cómo debería funcionar una "falta justificada" en el sistema antes de construir nada.

## Si Diego te manda una respuesta a algo pendiente

Revisa primero si hay preguntas abiertas en los reportes (`REPORTE_CIERRE_BLOQUES.md`, `REPORTE_ACTUALIZACION_DOCUMENTO_VIVO.md`) antes de asumir que es una instrucción nueva — a veces sus mensajes son respuestas a algo que ya le preguntaste.
