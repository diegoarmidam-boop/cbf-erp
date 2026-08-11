# Reporte — actualización del documento vivo (10-ago-2026)

Leí completo el documento actualizado que subiste (`CBF_ERP_Reestructura_Completa_4.docx`), lo comparé línea por línea contra la versión anterior, y trabajé todo lo que encontré. Aquí está el detalle.

## 1. Bug confirmado: Compras → Almacén "no reflejaba" la recepción

Investigué a fondo con una prueba real de extremo a extremo. **No había ningún bug de transacción** — la cadena completa (Aplicación programada → orden automática → cotizada → recibida → Almacén Local) funciona perfectamente y de forma atómica, verificado con datos reales.

Lo que pasaba: cuando una orden automática llega y se compromete de inmediato a la misma Aplicación que la generó, el número de "Existencia" en Inventario matemáticamente da 0 (entra y se aparta en la misma operación) — por eso parecía que la recepción "no se reflejaba", aunque en realidad sí ocurrió y quedó completa en el historial de movimientos.

**Corregido:** ahora Inventario muestra por separado "Disponible" y "Comprometido pendiente de entregar", tanto en la tabla general como en el detalle de cada producto — para que una recepción que se compromete de inmediato sea visible, no parezca que no pasó nada.

## 2. Nómina — botón "Quitar persona" en Captura del día

Agregado y probado: cada tarjeta de persona en Captura del día ahora tiene un botón "Quitar persona"/"Quitar grupo" que borra la tarjeta completa (todas sus líneas), simétrico al botón "+ Agregar persona". Solo aparece cuando la tarjeta tiene al menos una línea manual editable — no oculta registros automáticos.

## 3. Aplicaciones — rediseño Mochila / Turbina / Aguilón

El más grande de los cuatro. Cambios:

- **Paso 1 (Programar):** el recurso ya no es fijo — ahora es "recurso sugerido" (Mochila/Turbina/Aguilón), solo de referencia.
- **Paso 2 (Registrar avance):** cada reporte ahora se arma con una o varias **líneas**, cada una con su propia modalidad:
  - **Mochila:** solo lista de personas.
  - **Turbina:** Tractor + Operador + Implemento (sin gente extra).
  - **Aguilón:** Tractor + Operador + Implemento + lista de personas detrás.
  - Se pueden combinar varias líneas en el mismo reporte.
- **Hectáreas restantes visibles** por Cuadro, y **confirmación explícita** antes de guardar si se marca un Cuadro como completo sin escribir hectáreas.
- **Alimenta automático "Uso diario"** (Equipos y Maquinaria) para las líneas de Turbina/Aguilón — no hay que capturar el tractor dos veces.
- Confirmé explícitamente que esto **no aplica a Fertilización Granular** — el documento mantiene esa ficha con el recurso viejo (Con gente/Con implemento), sin cambios ahí.

**Sobre tus 2 aplicaciones de prueba reales (Boromix, El Sonrisal):** no las borré — las migré. Ambas ahora tienen una línea "Mochila" con la misma persona y horas que ya tenían. La única pérdida de información: la que usaba "Con implemento" no conservó qué implemento era, porque el modelo anterior nunca guardó un tractor/operador por separado — no había forma de reconstruirlo sin inventar un dato que nunca capturaste. Si quieres, puedes editar esos 2 reportes manualmente para ponerles la línea correcta ahora que existe el campo.

Probado de extremo a extremo con datos reales: programar, entregar, registrar con líneas mixtas, mano de obra generada correctamente por persona, Uso Diario generado una sola vez (no se duplica al editar), y validaciones de forma (Turbina sin tractor, Turbina con gente de más, etc.)

## 4. Nómina — exportable "sobre" en PDF

Aquí encontré algo que vale la pena que sepas: **el exportable "sobre" y el cálculo de billetes/monedas ya estaban construidos** desde antes (con el diseño viejo — una hoja completa por persona). El documento los tenía en la lista de "Pendientes" pero esa nota estaba desactualizada — el historial del propio documento confirma que ya existían (habla de "rediseño", no de construcción nueva).

Apliqué el rediseño que pediste:
- Sobre físico de 9×15 cm exacto.
- 3 sobres por hoja carta horizontal, con un recuadro como única separación (sin líneas punteadas).
- Contenido simplificado: tabla de "ganado por día" (no detalle de actividades), sueldo fijo si aplica, subtotal, bonos, descuentos, TOTAL, y el desglose de efectivo (que ya existía, con el algoritmo goloso y redondeo hacia arriba — verifiqué que ya estaba correcto).

Encontré y corregí un bug real de traslape de texto en el "TOTAL A PAGAR" durante mis pruebas visuales — ya no se ve cruzado. Probado renderizando el PDF real y viéndolo página por página (1 persona, varias, y con salto a una segunda hoja).

## Estado técnico

- Backend y web sin errores de TypeScript.
- Los dos servidores están corriendo: backend en `:4000`, web ahora en **`:5173`** (cambió de puerto porque el proceso anterior se había caído y Vite tomó su puerto por defecto al reiniciar — usa esa URL, no la `:5174` de anoche).
- Base de datos verificada limpia: 102 Personal, sin productos/cuadros de prueba, sin Aplicaciones ni Uso Diario de prueba.

---

## Hosting — lo que sí y no pude hacer

Ya leí la decisión que tomaste: computadora Windows local + Tailscale Funnel en vez de DigitalOcean por ahora. Por mis reglas de operación no puedo:
- Crear una cuenta de Tailscale (requiere iniciar sesión).
- Activar Funnel (expone la app a internet — es un cambio de configuración de seguridad/red).

Estos dos pasos los tienes que hacer tú. Aquí está exactamente qué hacer:

1. **Instalar Tailscale** en esta misma computadora: [tailscale.com/download](https://tailscale.com/download/windows) → instalar → iniciar sesión con tu cuenta (Google/Microsoft/GitHub, la que prefieras).
2. **Activar Funnel** para el puerto del backend (4000): abre PowerShell y corre:
   ```
   tailscale funnel 4000
   ```
   Te va a dar una liga tipo `https://tu-computadora.tu-red.ts.net` — esa es la liga pública y estable.
3. **Nota importante:** el frontend (web) también necesita quedar accesible. Lo más simple es que, cuando decidamos subir esto de verdad, el backend sirva también los archivos del frontend ya compilados (`npm run build` en `web/`) desde el mismo puerto 4000 — así con un solo `tailscale funnel 4000` ya queda todo accesible. Esto es un cambio de código pequeño que sí puedo hacer yo cuando lo pidas — no lo hice todavía porque acordamos mantener todo en localhost por ahora.
4. **Desactivar suspensión/hibernación de Windows** (para que la computadora no se apague sola): Configuración → Sistema → Energía → "Suspender" y "Hibernar" en "Nunca".
5. **UPS/no-break:** eso es físico, conectar la computadora a un no-break normal.
6. **Respaldo diario de la base de datos:** puedo dejarte listo un script que haga un dump de MySQL y lo copie a una carpeta (ej. Google Drive sincronizado) — dime si lo armo y si quieres que también configure la tarea programada de Windows para que corra sola todos los días, o prefieres correrlo tú manualmente por ahora.

Cuando ya tengas Tailscale instalado y actives Funnel, avísame y seguimos con el resto (build de producción del frontend, que el backend sirva ambos, etc.).
