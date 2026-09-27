# Chula ERP — Documento Vivo (reestructurado)

## ⚠️ Regla de mantenimiento de este documento — LEER ANTES DE EDITAR

> Esta regla existe para que cada dato viva en un solo lugar y el documento nunca acumule dos versiones de la misma decisión. Aplica a toda edición, sin excepción:

1.  **Cada dato vive en un solo lugar.** La ficha del módulo o bloque correspondiente es la única fuente de verdad para ese tema. Si hace falta ubicarlo rápido desde otro lado, se referencia (ej. “ver 9.11”), **nunca se copia el texto**.
2.  Un pendiente resuelto se actualiza en su lugar — la ficha del módulo se queda solo con la regla vigente en presente, sin narrar el cambio. El registro de qué cambió y cuándo vive únicamente en el Bloque 13 (Historial de modificaciones, cronología completa al final del documento) — nunca en la ficha del módulo. Así nunca se pierde el porqué de una decisión, y la ficha no se vuelve repetitiva de tocar.
3.  **No crear bloques nuevos de “resumen” o “índice de pendientes” que dupliquen detalle ya escrito en otro lado.** El único índice permitido es de referencias cortas (bloque 12), nunca una segunda copia del texto completo.
4.  **Antes de agregar algo nuevo, revisar si ya existe una decisión relacionada** en el documento, para no contradecirla ni duplicarla sin querer.
5.  Las fichas no tienen apartado de historial. Todo el historial vive junto, en orden cronológico, en el Bloque 13, cada entrada etiquetada con su origen (ej. “\[9.7 Aplicaciones\]”). Dentro de “Lógica establecida” la regla se escribe en presente puro, sin fechas, sin hashes de commit y sin narrar cómo se llegó a ella.
6.  Lo confirmado construido se registra en el Bloque 13 con su hash de commit. Si la causa raíz real de un problema resulta distinta a lo que decía el documento, se corrige la regla en su ficha — nunca conviven dos versiones.
7.  La lógica es genérica: el documento describe el sistema como si se arrancara desde cero para cualquier empresa de este tipo. Los datos propios de la operación actual (nombres de personas, superficies, códigos del Excel, inventario de equipos, empresas relacionadas) viven solo en el Apéndice A — Datos de arranque de CBF.

## 1. Resumen — qué es el sistema y sus objetivos

Qué es: ERP a la medida para Chula Brand Farms (CBF), pensado como app móvil offline-first con servidor central, para eliminar doble captura y conectar toda la operación: campo → inventario → mano de obra → maquinaria → cosecha/empaque → ventas → contabilidad. (Datos de la operación de arranque en el Apéndice A.)

**Objetivo central**: que una sola captura de campo alimente automáticamente todos los módulos relacionados (inventario, mano de obra, costos, maquinaria), evitando doble captura y dándole a Dirección General visibilidad completa y en tiempo real de la operación.

**Prioridad explícita**: “hacerlo bien” sobre “hacerlo rápido” — no hay presupuesto fijo definido.

## 2. Acuerdos generales del sistema

- **Huerta = Rancho = Unidad de Producción (UP)** — son sinónimos en todo el sistema.

- Escala: el sistema no asume un número fijo de ranchos, Huertas ni Cuadros. La subdivisión en Cuadros se captura conforme se realiza y nunca es un límite de diseño. (Escala de arranque en el Apéndice A.)

- Preparado para crecer: arquitectura multi-rancho y multi-empresa desde el diseño inicial, no como parche futuro. El diseño de datos y el desempeño soportan al menos ~200 hectáreas por empresa.

- Relación con otras empresas del grupo: Fase 1 — cada empresa opera con su propia base de datos, con la misma lógica y formato, sin compartir información. Fase 2 (a futuro) — operan “a la par”, con información conjunta pero capacidad de separar contabilidad y reportes por empresa. La arquitectura de datos lo considera desde ahora. (Empresas relacionadas en el Apéndice A.)

- Eje central del negocio: Huerta → Cuadro → Ciclo. El Ciclo de cultivo tiene 4 etapas: Preparación de Suelo, Desarrollo/Pre-cosecha, Cosecha y Empaque, y Post-cosecha (tirar plantas y limpieza). El descanso de la tierra entre dos cultivos es un Ciclo propio de tipo Descanso (ver 9.1). El costo se acumula para obtener costo por hectárea efectiva comparable entre huertas, y el sistema calcula el % de aprovechamiento del rancho (área efectiva vs. total). Detalle completo en 9.1.

- Caso de uso ancla (el modelo que se replica en Actividades, Aplicaciones, Fertilizantes y Riego): una sola captura dispara automáticamente la salida de inventario, el costo de mano de obra, el costo de Huerta/Cuadro y el consumo de maquinaria/combustible si aplica.

- **Menor número de registros posibles**: principio rector de diseño — nunca forzar una segunda captura de algo que ya se puede inferir de la primera.

## 3. Centros de costo

- “Producción” no es un centro de costo por separado — es el KPI compuesto que responde “¿cuánto costó llevar la Huerta de semilla a producción?”, medido por hectárea efectiva para poder comparar entre huertas de distinto tamaño. Se acumula sobre el eje Huerta/Cuadro, sumando tres etapas de costo:
  - **Desarrollo** — desde que se compra la semilla hasta que comienza el corte (mano de obra, fertilizantes, productos para la planta, servicios, etc. — etapas de Preparación de Suelo + Desarrollo/Pre-cosecha). Incluye lo que llega desde Vivero con la plántula y lo que acumuló un Ciclo de Descanso previo.
  - **Cosecha** — costo de cortar toda la fruta del ciclo.
  - **Empaque** — costo de empacarla.
- Cosecha y Empaque suceden al mismo tiempo y dentro del Ciclo son una sola etapa, pero como centros de costo son dos, cada uno con su propio costo.
- Corte entre etapas de costo: una vez que empieza la etapa de Cosecha, lo que la planta todavía necesite (productos, fertilización) cuenta como costo de Cosecha, no de Desarrollo. El corte sigue la transición de etapa del Ciclo (9.1), no una fecha aparte.
- Nivel de detalle: el costo baja hasta Cuadro. Hay un reporte que suma el costo por Variedad dentro de la Huerta, sin capturar dos veces ni perder el desglose por Cuadro. Bajar a Cuadro permite medir el costo real de una aplicación de prueba que no cubre toda la Huerta y compararlo después contra indicadores de Monitoreo (9.20).
- **Oficina / Administración** — gastos administrativos, prorrateados por hectáreas efectivas entre huertas.
- **Bodega (Almacén Central)** — no se prorratea a ninguna Huerta; se mide aparte como capital invertido en existencias (“dinero parado”), indicador de toda la empresa.
- **Equipos y Maquinaria** — dos tipos de gasto: Combustible y Mantenimiento/Refacciones, con detalle por unidad individual (folio AF para tractores/camionetas/remolques, folio IA para implementos) para historial y alertas por equipo. El combustible de trabajo en campo se carga a los Cuadros (ver abajo); el resto es indirecto.
- **Embarques** — centro de costo separado de Empaque, trazable a la producción de Empaque.
- **Laboratorio** — destino de gasto (catálogo de Destino de solicitudes manuales en Compras, 9.14). No prorratea a ninguna Huerta; se acumula aparte.
- **Vivero** — destino de gasto de paso, no centro de costo final: lo que se carga a Vivero se acumula en el Lote de siembra y viaja con la plántula al Ciclo y a los Cuadros de destino al trasplantar (ver 9.3).
- **Indirectos / Prorrateables** — lo que no se carga directo a una Huerta: combustible de camionetas, combustible de Traslados de tractor entre ranchos, mantenimiento y refacciones de equipo (los tractores trabajan en varios ranchos) y el prorrateo de Administración.
- **Ciclo de Descanso** — su costo se acumula en su propio Ciclo y, al cerrarlo, pasa al siguiente Ciclo de cultivo de esa Huerta (ver 9.1).

### Cuándo se carga cada costo

- **Producto:** se carga a la Huerta cuando sale del Almacén Central hacia el Almacén Local de esa Huerta (entrega confirmada), valuado al precio del lote FIFO del que sale físicamente, con su flete incluido (ver 9.15). Una devolución al Almacén Central (sobrante o cancelación) genera un abono a la Huerta al mismo precio con el que se cargó — funciona como si el rancho le comprara al almacén y le devolviera.
- **Del Almacén Local al Cuadro:** cada avance reportado descuenta del Almacén Local lo proporcional a ese avance y baja ese costo a los Cuadros con la fórmula de reparto de abajo.
- **Mano de obra:** el costo de las horas de cada avance baja a los Cuadros con la misma fórmula. Cuenta desde la captura, aunque la persona esté pendiente de autorización de RH (ver 9.11).
- **Combustible de trabajo en campo:** se captura en el avance mismo y baja a los Cuadros de ese avance con la misma fórmula — el diésel del relleno del tractor en cada avance (Actividades, Aplicaciones, Granular), la gasolina de la planta de luz en cada avance con drone, y la gasolina de la motobomba en cada Fertirriego. El combustible sale en garrafa del Almacén Central al Almacén Local del rancho como cualquier producto, y el avance lo descuenta de ahí. Mecanismo completo en 9.13.
- **Indirectos:** ver la lista de arriba — no bajan a Cuadro.

### Fórmula de reparto a Cuadro

- Peso de cada Cuadro en una programación Por Cuadro = hectáreas programadas de ese Cuadro (puede ser menos de lo que mide). Por Variedad = superficie de esa variedad en cada Cuadro, según la composición varietal del Ciclo (9.1).
- Con Grupos de dosis: proporción del grupo = hectáreas programadas del grupo ÷ hectáreas totales programadas. Hectáreas atribuidas al grupo en un avance = hectáreas reportadas en ese avance × proporción del grupo. Sin grupos, la programación es un solo grupo.
- Dentro de cada grupo, lo atribuido se reparte a cada Cuadro o variedad en proporción a sus hectáreas programadas dentro del grupo.
- El producto de cada grupo sigue su propia receta; la mano de obra y el combustible del avance se reparten por hectáreas atribuidas entre todos los grupos.
- Fertirriego: se reparte entre los Cuadros de la Sección de Riego en proporción a sus hectáreas (las Secciones se integran por Cuadros completos, ver 9.1).
- Remolque de cosecha con varios Cuadros: se reparte en proporción a las hectáreas de los Cuadros del remolque.
- El reparto se registra el día del avance. Nunca se recalculan días ni meses anteriores.

### Flete

- El flete viaja con el producto hasta la Huerta, para cualquier producto. Se captura por orden de compra y se divide entre la cantidad total de la orden, en kilos (cada litro cuenta como un kilo). El resultado se suma al costo unitario de cada lote de esa orden.
- Al confirmar la recepción, el Encargado de Bodega marca si la orden vino con flete. La orden queda pendiente en Compras → Flete hasta que se captura el costo real del flete; el flete se captura una sola vez por folio (aunque la orden traiga varios productos).
- Si parte del producto ya salió a una Huerta antes de capturar el flete real, el sistema ajusta solo la diferencia a esa Huerta, siempre que el periodo no esté cerrado.
- El flete por kilo nunca se asume: se captura el real de cada orden. (Valor de referencia de arranque en el Apéndice A.)

### Pendientes de este bloque

- Ninguno.

## 4. Permisos

Principio de acceso universal del Director General: sin importar qué rol tenga asignada la autorización de algo específico, el Director General siempre puede ver, editar y autorizar cualquier alerta, captura o registro de cualquier módulo — es un permiso de arquitectura, no una excepción caso por caso.

**Regla de permisos por rol y por módulo**: ver vs. modificar, distinto según puesto.

**Regla de cómo se refleja esto en la interfaz**: si un rol no tiene acceso a un módulo, el módulo **no aparece en ningún menú** (ni sidebar, ni bottom nav, ni grilla “Más”). No existen pantallas de “sin acceso” ni candados — la ausencia es la señal. La lista de módulos se genera siempre a partir de una única fuente de permisos por rol, y esa misma fuente alimenta sidebar (PC), bottom nav (móvil) y grilla “Más” (móvil) — nunca se mantienen listas separadas a mano.

**Un dispositivo = un usuario**. No se comparten sesiones.

Borrado/desactivación de catálogos: todo catálogo que se puede crear desde la app también se puede borrar o desactivar, con uno de estos patrones según si otros registros dependen de él:

**Desactivar** (se conserva el historial, deja de aparecer en listas activas pero no se borra de la base de datos): Productos (Almacén), Proveedores, Equipos, Actividades, Bonos, Huertas.

- **Borrar de verdad, pero bloqueado si está en uso** (no se puede borrar si hay registros que dependen de él): Puestos, Grupos de Pago, Secciones de Riego, Conceptos de mantenimiento.
- **Borrar libre, sin candado**: Lista de no-contratar y documentos de Personal.
- **Préstamos**: no se borran, se **cancelan** — bloqueado si ya tiene descuentos aplicados.

Dónde se editan los catálogos: cada catálogo se puede editar tanto en Configuración como dentro de su módulo, respetando los permisos de ese módulo. Los catálogos de uso diario (ej. Proveedores, Productos) se editan directo en su módulo; en Configuración viven sobre todo los que cambian poco (ej. Tipo de aplicación). Accesos y usuarios también vive en Configuración (ver 9.12).

Toda acción de borrar, desactivar, cancelar, rechazar o descartar pide confirmación antes de ejecutarse (ver Bloque 5, Patrones de captura).

### Quién autoriza qué (mapeo de roles reales — ver organigrama completo en sección 8)

| Propuesta                                                                                                                                        | Quién autoriza                                                                                                                                                                                    |
|--------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Nueva actividad (nombre, unidad, tarifa, tipo de pago)                                                                                           | Gerente Administrativo                                                                                                                                                                            |
| Cambio de tarifa de una actividad ya existente (destajo)                                                                                         | Gerente Administrativo                                                                                                                                                                            |
| Alta de nueva persona en Personal (la persona puede trabajar y generar costo desde el primer día; solo su pago espera la autorización, ver 9.11) | Recursos Humanos                                                                                                                                                                                  |
| Nuevo producto para aplicar a la planta (categoría que requiere Ingrediente Activo)                                                              | Gerente Técnico de Producción o Dirección General                                                                                                                                                 |
| Nuevo producto de cualquier otra categoría                                                                                                       | Lo autogestiona el Encargado de Bodega directamente                                                                                                                                               |
| Orden de compra manual (no ligada a una Aplicación)                                                                                              | Dirección General o Gerente Administrativo; el Gerente Técnico de Producción solo cuando es producto para la planta. El Encargado de Compras no autoriza mientras no exista tope (ver Pendientes) |
| Orden de compra automática (generada al programar en Aplicaciones, Fertilizantes o Vivero)                                                       | No requiere autorización adicional, sin importar quién programó (Gerente Técnico de Producción, Asistente Técnico o Ingeniero de Vivero)                                                          |
| Producto para aplicar a la planta, antes de poder comprarse                                                                                      | Dirección General o Gerente Técnico de Producción (regla más restrictiva que las demás)                                                                                                           |

### Dónde viven los permisos

Los permisos de cada módulo viven únicamente en su ficha (apartado “Personas/puestos involucrados y sus permisos”), y el alcance de cada puesto en el Bloque 8. No existe una matriz consolidada aparte, para no tener dos copias que se desincronicen.

- Todos los módulos, además de lo que se detalla en cada ficha: el **Director General** siempre tiene Ver + Capturar + Editar + Autorizar (acceso universal, ver arriba) — no se repite módulo por módulo. El **Auditor** siempre tiene Ver (solo lectura, global) — tampoco se repite.

### Mecanismo — “Propone / Autoriza”

Cuando alguien sin permiso de autorizar directamente propone algo de la tabla de arriba, se crea una **solicitud pendiente** — el elemento propuesto queda bloqueado, no se activa ni se puede usar todavía, hasta que se autorice. Esto evita el problema de tener que decidir qué hacer con información ya capturada si se llegara a rechazar — como nunca se pudo usar, no hay nada que revertir.

- Al **autorizar**: el elemento propuesto se activa de verdad — se agrega al catálogo real o la persona/producto queda activo, disponible desde ese momento.
- Al **rechazar**: la solicitud se descarta, idealmente con un motivo breve, y notificando a quien la propuso.
- **Alerta visible** para quien autoriza (contador de pendientes), para que la autorización sea rápida y no se queden solicitudes olvidadas.
- **Autorización simultánea**: si dos personas con permiso de autorizar actúan casi al mismo tiempo sobre la misma solicitud (uno aprueba, otro rechaza), aplica la regla **“primero en llegar gana”** — se notifica al segundo autorizador qué pasó, sin necesitar resolución manual.

### Pendientes de este bloque

- Nivel de acceso “Editar” todavía no distingue matices más finos por módulo (ej. editar solo lo propio vs. editar cualquier registro) — se afina conforme se construya cada pantalla.
- Auditar por qué no todo lo capturado es editable para los roles con permiso de Editar (casos reportados: una Actividad ya dada de alta, ver 9.4, y un Ciclo ya creado, ver 9.1). El Director General puede editar cualquier información de cualquier módulo, sin excepción.
- Definir si existirá un tope de autorización de Compras (y su monto por área). Mientras no exista, el Encargado de Compras no autoriza compras.

## 5. Vistas

*(Sistema de componentes visuales reutilizables — colores, formas, botones, tarjetas — que se aplican en todos los módulos por igual, para que la interfaz sea consistente sin tener que rediseñar desde cero cada vez. Nota: la arquitectura técnica y el detalle más “de marca” — logo, paleta de campaña, tipografía — quedan hasta el final del documento (bloques técnico/interfaz), junto con todo lo demás que no se modifica seguido. Aquí solo lo que un lector necesita para entender cómo se comportan las pantallas.)*

### Principio rector

Simple y funcional por fuera, potente por dentro. La interfaz nunca debe competir con la información: colores de marca usados con moderación, jerarquía clara, y toda la complejidad de cálculos/lógica invisible para quien solo necesita capturar o consultar.

**Aclaración importante**: lo que se reutiliza de un módulo a otro son los **colores, formas y componentes** (botones, tarjetas, tipografía — el sistema visual). **La información y el layout de cada módulo son propios de sus datos** — no se debe forzar la estructura de un módulo en otro solo por copiarla (ej. que Nóminas tenga 4 tarjetas de KPI no significa que todos los módulos deban tener 4 tarjetas).

### Componentes clave

- **Botón primario** — fondo rosa, texto blanco, forma de pill, solo para la acción principal de la pantalla. Un botón primario por vista.
- **Botón crítico fijo abajo** — para acciones irreversibles importantes (ej. “Cerrar el día”).
- **Botón flotante (FAB)** — círculo rosa, ícono blanco, esquina inferior derecha en móvil, para la acción de “agregar” más usada del módulo.
- **Ítem de menú** (sidebar/bottom nav) — ícono con fondo pastel del módulo + texto. Estado activo = fondo e ícono rosa. Nunca se muestra deshabilitado/candado: si no aplica, no se renderiza (ver regla de permisos, sección 4).
- **Tarjeta KPI** — fondo blanco, borde sutil, etiqueta pequeña arriba + número grande abajo.
- **Tag/badge** — pill pequeño con fondo pastel y texto del color correspondiente.
- **Buscador** — pill con fondo neutro, sin borde marcado.
- **Menú de pestañas/subnav** — cuando un módulo tiene varias pestañas internas, van en barra horizontal deslizable (scroll lateral), no en una lista que se envuelve en varias líneas. Al cambiar de pestaña, la pestaña activa se mantiene visible dentro del área visible del scroll.

### Layout por plataforma

- **Escritorio**: sidebar fijo a la izquierda con marca arriba + lista de módulos agrupados; header superior con buscador y avatar; contenido en tarjetas.
- **Móvil**: header superior con degradado de marca (título de sección); bottom nav con los módulos más usados del rol + botón “Más” que abre grilla completa; FAB circular flotante para la acción principal. En pantallas angostas, las tablas anchas con muchas columnas se reemplazan por tarjetas apiladas verticalmente, para no forzar scroll horizontal.

### Patrones de captura

- **Pre-llenado desde el día anterior**: las pantallas de captura diaria se pre-llenan automáticamente con lo capturado el día anterior, dejando solo el campo de cantidad/valor en blanco — reduce fricción de captura repetitiva.
- **Validación antes de guardar**: no se permite guardar una captura con campos obligatorios vacíos — se marca en rojo la celda faltante y se explica qué falta.
- Confirmación explícita antes de cualquier acción irreversible o destructiva, en todo el sistema: cierres de día, cierres de periodo de nómina y descuentos de préstamos muestran una pantalla de revisión con el detalle exacto de lo que se va a aplicar. Además, todo botón de borrar, eliminar, cancelar, liberar, rechazar o descartar, en cualquier módulo, pide confirmación en dos pasos (“¿Estás seguro?” con Sí/No, o equivalente) antes de ejecutarse — para reducir errores de dedo.

<!-- -->

- Color de estado: todo registro que está en un estado que requiere atención se distingue con un color propio. En particular, las personas dadas de alta desde campo y pendientes de autorización de RH se muestran con el color de “pendiente de autorización” en toda pantalla donde aparecen (captura del día, reportes de avance, Nómina), hasta que RH autoriza el alta (ver 9.11).

<!-- -->

- Ocultar (no borrar) lo liberado o cancelado, con botón para volver a verlo: una programación liberada o cancelada (Fertirriego, Granular, Aplicaciones, Actividades) se oculta de la lista activa — no se borra de la base de datos; el registro y el rastro de Almacén se conservan — y el botón “Mostrar vencidas/canceladas” las vuelve a mostrar cuando hace falta consultarlas.
- **Botón de revertir**: cuando existe un botón para “+ agregar” algo pre-cargado (ej. “+ Otra actividad”), debe existir el simétrico para quitarlo, con la regla de que nunca se puede quedar en cero cuando se requiere al menos un registro.

### Pendientes de este bloque

- Iconografía definitiva de los módulos — siguen siendo placeholders de posición/color.
- Vista móvil — prioridad confirmada: en varias pantallas el contenido se sale del ancho de la pantalla en iPhone (ej. Almacén → Movimientos, botones cortados en el borde) y el zoom automático de iOS al enfocar campos hace la captura incómoda (ej. Unidades de Producción → Cuadros). El zoom automático al capturar texto sigue sin corregirse. Pendiente que Claude Code revise viewport/responsive y el tamaño de fuente de los inputs (iOS aplica zoom automático si un input tiene menos de 16px). El teléfono es la fuente principal de captura del sistema — esto es prioritario, no cosmético.
- **Vista móvil — tablas y tarjetas se cortan horizontalmente (con ejemplos adicionales):** en Compras → Órdenes, las tarjetas se salen del ancho de pantalla y cortan botones y texto del lado derecho (ej. botón "Cotizar"/"Enviar solicitud", fechas y precios), obligando a hacer scroll lateral para ver información básica. En Nómina → Reporte semanal, la tabla de personas se corta antes de mostrar la columna de Neto completa. Pendiente que las tarjetas y tablas se adapten al ancho real de pantalla (columnas apiladas o scroll horizontal explícito con indicador, no contenido cortado sin aviso).
- **Vista móvil — texto amontonado en columnas angostas:** en Actividades → Historial de reportes, la columna "Líneas" muestra la lista de personas (nombre + horas) apretada en una columna muy angosta, con cada nombre partiéndose en varias líneas — se ve amontonado y cuesta trabajo distinguir dónde termina una persona y empieza la siguiente. Pendiente rediseñar esa columna (ej. una fila por persona, o lista con viñetas legible) en vez de forzarla dentro del ancho fijo de la tabla.

### Orden de módulos en el sidebar

El orden del sidebar se reacomoda para que siga el flujo real de cómo se llena la información en la operación, en vez del orden histórico en que se fueron construyendo los módulos:

- Unidades de Producción
- Recursos Humanos
- Nómina
- Vivero
- Actividades
- Aplicaciones
- Fertilizantes
- Riego
- Compras
- Almacén
- Equipos y Maquinaria

Panel Ejecutivo y Contabilidad quedan al final de la lista mientras no estén construidos (siguen fuera de alcance de V1, ver bloque 12). Cuando se construyan, se acomodan en las posiciones que les corresponden en el flujo (Panel Ejecutivo primero como vista consolidada, Contabilidad después de Unidades de Producción). El resto de módulos aún no diseñados se van agregando conforme se construyan, sin necesidad de volver a rediseñar el orden completo.

## 6. Reglas

*(Reglas de negocio que cruzan varios módulos a la vez — no son de un solo módulo, por eso viven aquí en vez de repetirse en cada ficha.)*

### Precisión de cálculo — regla general para TODO el sistema

Aplica a todo el sistema sin excepción: los cálculos no se redondean. Todo cálculo usa la mayor cantidad de decimales disponible, sin truncar ni redondear en ningún paso intermedio — con volúmenes altos, redondear aunque sea un decimal genera diferencias reales de dinero o de producto.

- El redondeo es solo para mostrar: el número que ve el usuario puede mostrarse redondeado (ej. 2 decimales en pantalla, o el gramo entero en una Orden de Aplicación o de Fertirriego), pero el sistema guarda y sigue usando el valor completo — nunca un valor redondeado alimenta otro cálculo. Única excepción: el neto del sobre de Nómina se redondea hacia arriba al peso entero porque es efectivo físico, y ese neto redondeado es el que se registra como pagado (ver 9.11).

- Aplica a dosis, costeo de Almacén, flete, reparto de costo a Cuadro, litros de agua, Nómina/Bono de Asistencia, Comparador de Cotizaciones (9.14) y cualquier cálculo que exista o se agregue después.

### Sincronización offline y conflictos

- Ante conflictos de sincronización (ej. bodega marca salida y huerta reporta aplicación del mismo insumo casi al mismo tiempo), el sistema debe generar **alertas grandes y visibles para ambas partes involucradas**, para que se comente y corrija manualmente — no debe intentar resolver estos casos de forma silenciosa/automática. *(Pendiente construir un catálogo extenso de posibles casos de conflicto conforme se identifiquen, módulo por módulo.)*
- La app debe intentar sincronizar de forma constante/automática en cuanto detecte conexión a internet. Es especialmente crítico no perder información de nómina, embarques (dinero) o mantenimiento no reportado.

### Evidencia visual

- Se requiere soporte de fotos como evidencia en varios módulos — a definir caso por caso (aplicaciones, mantenimiento, merma/daños, etc.).

### Clima

- Vive en el módulo de Monitoreo (ver 9.20).

### Cierre de periodo

- Los números se van cerrando mensualmente, y al final del año se cuadran los reportes anuales.
- Solo la Rama de Contabilidad (ver Bloque 8) puede modificar o acceder a información de periodos ya cerrados. Esto es distinto del “Cierre del día” operativo de cada Huerta, que es diario y lo maneja cada Supervisor (ver 9.11). Detalle del cierre contable en 9.16.

### Seguridad y auditoría (regla general — el módulo de Auditoría en sí tiene su propia ficha)

- Se requiere bitácora de auditoría completa: quién capturó y quién modificó cada registro, con fecha/hora.
- Las correcciones sí editan/reemplazan el valor, pero debe quedar registro del cambio (histórico de versiones, no solo el valor final).

### Básculas

- Las básculas usadas (para pesar fruta “1 Nacional”) son municipales y manuales — el peso se registra manualmente en el sistema, no hay integración digital de báscula por ahora.

### Códigos QR / barras

- El uso de QR/código de barras es **exclusivamente para productos del módulo de Almacén** (agroquímicos/fertilizantes) — no para remolques, cuadros ni maquinaria.
- No se usarán etiquetas físicas QR/código de barras pegadas en remolques/implementos (se desgastan y requerirían reposición constante en campo). En su lugar, cada maquinaria/remolque tiene un código/folio interno que se teclea o selecciona al momento de capturar su uso. *(Para agroquímicos con código de barras de fábrica queda abierto a evaluar más adelante, no es prioridad.)*

### Calendario laboral

- No existe calendario de días festivos predefinido; Recursos Humanos lo irá registrando conforme se necesite (no necesariamente coincide con festivos oficiales de México).

### Notificaciones

- Las alertas deben aparecer dentro de cada módulo como pendientes/burbujas (notificación in-app contextual por módulo).
- Se busca también integración con un grupo de WhatsApp para replicar alertas fuera de la app.
- **Módulo “Notificaciones”**: cambio de nombre y de alcance de lo que hoy es **“Solicitudes”** en el sidebar — conserva lo que “Solicitudes” ya hace hoy, y **además** se convierte en un centro unificado donde aparecen **todas las alertas/notificaciones ya establecidas en este documento**, filtradas según los permisos del puesto que las está viendo (cada rol solo ve las que le corresponden). Ejemplos de alertas que deben ir apareciendo ahí conforme se construyan: Cuentas por Pagar próximas a vencer (ver Compras 9.14), aplicaciones vencidas a 15 días (ver Aplicaciones 9.7), descuadres de Almacén Local a 15 días (ver Almacén 9.15), Cierres de día pendientes (ver Nómina 9.11), entre otras que ya existen en el documento o se vayan agregando.
- Ciclo de vida de las alertas — hay 2 tipos:
  - **Alertas que requieren acción** (Pendientes de autorizar, Cuentas por Pagar por vencer, aplicaciones vencidas, descuadres, cierres de día pendientes): se quedan hasta que la acción real se resuelva (autorizar, pagar, cerrar, etc.) — nunca se archivan solas por tiempo, sin importar cuántos días pasen. Archivarlas sin resolver la acción sería peligroso.
  - **Alertas informativas** (ej. "Almacén confirmó la recepción de una orden" — no hay nada que hacer con ellas después de enterarse): se pueden marcar como vistas manualmente en cualquier momento, y si nadie las marca, se marcan solas automáticamente a los 7 días. En cualquiera de los 2 casos, al marcarse desaparecen de "Otras alertas" pero quedan guardadas en un historial aparte, consultable si hace falta revisarlas después.
- Toda notificación que lleva a una acción con contexto específico (fecha, Huerta, orden de compra, etc.) pre-llena ese contexto en la pantalla de destino — el usuario nunca vuelve a buscar o seleccionar algo que la notificación ya sabía (ej. “Cierre de día pendiente” abre el Cierre del día con la fecha ya elegida).
- Fertirriego pendiente del día (ver 9.5 y 9.6): cada día que, según la frecuencia programada, toca fertirriego en una Sección y todavía no se registra, aparece un recordatorio dirigido a Regador, Supervisor de Huerta y Gerente Técnico de Producción.

<!-- -->

- Alerta de consumo de combustible (ver 9.13): cuando un reporte de consumo de un equipo supera su propio promedio por más del margen configurado, se avisa a Dirección General, Gerente Técnico de Producción y Supervisor de Huerta del rancho.

### Exportación e integración con el flujo de trabajo actual

- Se requiere exportar reportes a Excel y PDF.
- Se busca poder subir PDFs y fotografías al sistema, y conectar con WhatsApp para generar reportes o extraer información de ciertos grupos — esto responde a cómo se maneja la información hoy día a día en la empresa (mucho por WhatsApp). Principalmente para facturas y tickets de proveedores (la lectura automática — OCR — es a futuro; hoy los tickets se capturan a mano con su foto guardada).
- *(Pendiente sesión de “factibilidad técnica y de costo” una vez cerrada toda la lógica de negocio.)*

### WhatsApp — dirección del flujo

- Se busca, en orden de preferencia según factibilidad/costo: (1) idealmente ambas direcciones gratis — sistema→WhatsApp (alertas) y WhatsApp→sistema (capturar reportes/fotos); (2) si lo bidireccional no es gratis, al menos alertas salientes gratis; (3) si ni eso es viable gratis, las alertas se quedan solo dentro de la app por ahora. En cualquier caso, se debe dejar preparada la arquitectura para contratar WhatsApp Business API de pago más adelante.
- **Ejemplo de uso real ya resuelto**: hoy ya se manda un reporte estandarizado por WhatsApp — un pizarrón físico por Huerta que se llena a mano y se fotografía (uno al inicio del día, otro al cierre), con semana del año/semana del cultivo, hectáreas efectivas, tabla de Equipos (folio AF/IA, estatus falla/OK), KPI de mano de obra, personal por puesto, y tabla de Actividades (hectáreas realizadas/faltantes/avance/personal/rendimiento/pendientes). Esto es justo lo que el sistema reemplazará: las actividades se reportan día a día directo al sistema y el reporte se arma solo.

### Formato de fechas en la interfaz

- En toda la interfaz del sistema (todas las pantallas, todos los módulos), las fechas se muestran en formato DD/MM/AAAA. Aplica a cualquier fecha visible para el usuario (rangos de periodo, próximos descuentos, fechas de siembra, vencimientos, etc.). No aplica a las fechas de este documento, que usan día-mes abreviado-año.

- **Selector de fecha con calendario:** ningún campo de fecha del sistema debe requerir escribirla a mano — al tocar/dar clic en el campo, debe abrirse un calendario visual para elegir el día, en toda la interfaz, en todos los módulos. Aplica en conjunto con el pendiente de vista móvil ya documentado (Bloque 5) — un selector de calendario evita además parte del problema de zoom automático de iOS al enfocar campos de texto.

<!-- -->

- Ordenamiento: los elementos identificados por número (Cuadros, Secciones de Riego/Válvulas) se ordenan numéricamente (1, 2, 3… 10, 11), nunca alfabéticamente como texto — en pantallas y PDFs por igual. Los elementos identificados por nombre (Huertas, productos, proveedores, personas, etc.) se ordenan alfabéticamente.

### Pendientes de este bloque

- Catálogo extenso de posibles casos de conflicto de sincronización, módulo por módulo.
- Factibilidad técnica y de costo de las integraciones de WhatsApp/OCR.

## 7. Estructura del documento vivo

Este documento se organiza de lo general a lo particular:

- Resumen, acuerdos generales, centros de costo, permisos, vistas y reglas (Bloques 1 a 6) — lo que aplica a todo el sistema, sin importar el módulo.
- Estructura del documento (Bloque 7) y personas involucradas / puestos (Bloque 8).
- Descripción detallada de cada módulo (Bloque 9), en el orden en que se llena la información en la operación real. Cada ficha sigue siempre la misma plantilla: Lógica establecida actual del módulo; Vistas o submódulos; Lógica de entrada de información; Procesamiento de información; Salida de información; Personas/puestos involucrados y sus permisos; Módulos que alimentan a este; Módulos que reciben información de este; Pendientes de este módulo. Las fichas no llevan fechas, commits ni atribuciones de quién dijo qué — eso vive en el Bloque 13.
- Arquitectura técnica (Bloque 10) e identidad visual (Bloque 11) — lo que menos se modifica y lo que menos necesita ver quien solo quiere entender la lógica de negocio.
- Índice de pendientes (Bloque 12, solo referencias cortas) e historial completo de cambios con fecha (Bloque 13, único lugar del historial).
- Diagramas de flujo del sistema (Bloque 14).
- Apéndice A — Datos de arranque de CBF: los datos propios de la operación actual, separados de la lógica genérica.

Regla de fondo: ninguna sección repite la lógica completa de otra — si algo ya se explicó en un bloque general o en otro módulo, aquí solo se referencia.

## 8. Personas involucradas / puestos

(Organigrama completo. El rol de campo se llama Supervisor de Huerta. Los permisos detallados de cada módulo viven en su ficha.)

### Dirección / Sistemas (acceso total)

| Puesto                | Alcance | Permisos / Módulos                                                                                         |
|-----------------------|---------|------------------------------------------------------------------------------------------------------------|
| Director General      | Global  | Ve y edita todo. Dashboard de KPIs filtrable. Acceso y autorización universal (sección 4)                  |
| Encargado de Sistemas | Global  | Igual que Director General. Administra Accesos y usuarios (en Configuración) junto con el Director General |

### Área Técnica / Campo

| Puesto                            | Alcance                                 | Permisos / Módulos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
|-----------------------------------|-----------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Gerente Técnico de Producción     | Multi-rancho                            | Programa Actividades, Aplicaciones, Fertilizantes y Riego (incluida Tirar 2da Cintilla). Ve nóminas por rancho. Tractores e implementos. Autoriza productos para la planta y las compras manuales de producto para la planta (junto con Dirección General). Autoriza cierres por debajo de 100% (junto con Dirección General). Recibe las alertas de consumo de combustible                                                                                                                                                      |
| Asistentes Técnicos de Producción | Igual que Gerente Técnico de Producción | Programan directo en Actividades, Aplicaciones, Fertilizantes y Riego, usando la receta tal cual (no pueden cambiar la dosis). Sus compras automáticas no requieren autorización. No autorizan productos nuevos — solo los proponen                                                                                                                                                                                                                                                                                              |
| Supervisor de Huerta              | Solo su Unidad de Producción asignada   | Programa Actividades (no Aplicaciones ni Fertilizantes). Captura avances de Actividades, Aplicaciones y Granular — con el relleno de combustible del tractor o de la planta de luz —, mantenimiento (pedir servicio/reparaciones) y mano de obra de campo (no empaque). Registra el Traslado de tractor cuando llega a su rancho. Responsable del Almacén Local de su UP: confirma entregas del Almacén Central y reporta avances, lo cual descuenta su almacén local. Recibe las alertas de consumo de combustible de su rancho |
| Ayudante de Supervisor            | Misma huerta que su Supervisor          | Mismos permisos que el Supervisor. Sus acciones solo avisan al Supervisor (notificación informativa) — no requieren su confirmación para aplicarse                                                                                                                                                                                                                                                                                                                                                                               |
| Regador                           | Solo su UP asignada                     | Riego y Fertirriego — registra horas de riego, el Fertirriego del día y la gasolina de la motobomba                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Capturista de información         | Solo su UP asignada                     | Mismo alcance de captura que Supervisor de Huerta (Actividades, Aplicaciones, Fertilizantes y mano de obra de campo) — sin ningún permiso de programar ni de autorizar                                                                                                                                                                                                                                                                                                                                                           |
| Ingeniero de Vivero               | Solo Vivero                             | Captura en Vivero (programa y registra lo de sus Lotes de siembra). Sus compras automáticas no requieren autorización. No autoriza — lo que requiere autorización en Vivero lo autorizan Gerente Técnico de Producción o Dirección General                                                                                                                                                                                                                                                                                       |

### Mantenimiento

| Puesto                   | Alcance               | Permisos / Módulos                                                                                                                                                         |
|--------------------------|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Gerente de Mantenimiento | Global — todas las UP | Tractores e implementos, camionetas, combustibles                                                                                                                          |
| Mecánico                 | —                     | Módulo de mantenimiento: ver pendientes, notificar resoluciones, pedir piezas                                                                                              |
| Operador                 | Solo lo propio        | Personal sin otro rol en el sistema que solo reporta cargas de combustible de su camioneta o garrafa: ve únicamente la pantalla de cargas y su propio historial (ver 9.13) |

### Cosecha, Empaque y Logística (bajo Gerente Administrativo)

| Puesto                         | Alcance                      | Permisos / Módulos                                                                                         |
|--------------------------------|------------------------------|------------------------------------------------------------------------------------------------------------|
| Supervisor de Cosecha          | Rancho asignado              | Cosecha, tractores e implementos                                                                           |
| Supervisor de Empaque          | Empaque asignado             | Empaque y embarques                                                                                        |
| Encargado de Cosecha y Empaque | Todos los ranchos y empaques | Todo lo que ven sus supervisores (nivel consolidado)                                                       |
| Gerente de Logística           | Global                       | Ve Cosecha, Empaque y Embarques en todas las UP. Ventas y facturación / cierre de liquidación de embarques |

### RH / Nómina

| Puesto               | Alcance | Permisos / Módulos                                 |
|----------------------|---------|----------------------------------------------------|
| Recursos Humanos     | —       | Solo RH y Nóminas. Autoriza alta de nuevo Personal |
| Encargado de Nóminas | —       | Igual que RH                                       |

### Administración

*(El Contador es una línea aparte, no reporta al Gerente Administrativo.)*

| Puesto                                                                                                       | Alcance                          | Permisos / Módulos                                                                                                                                                                                                                                              |
|--------------------------------------------------------------------------------------------------------------|----------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Gerente Administrativo                                                                                       | Global                           | Compras, Almacén/Inventario, Cosecha/Empaque (consolidado), Nóminas, Recursos Humanos, Mantenimiento. Autoriza nueva actividad/cambio de tarifa de destajo                                                                                                      |
| Contador (independiente)                                                                                     | Global (financiero)              | Módulo de Contabilidad/Balance, más Compras y Nóminas                                                                                                                                                                                                           |
| Rama de Contabilidad (Director de Contaduría, Gerente Fiscal, Gerente de Contabilidad, Auditorías Contables) | Global (financiero)              | Puestos que existen; sus permisos se definen al construir Contabilidad (9.16). Son los únicos que pueden modificar o acceder a periodos ya cerrados (Bloque 6)                                                                                                  |
| Asistente Administrativo                                                                                     | Igual que Gerente Administrativo | Mismos módulos, para ayudar a capturar. Sin permiso de editar registros ya subidos/confirmados                                                                                                                                                                  |
| Encargado de Compras                                                                                         | Global — todos los ranchos       | Módulo de Compras: pedidos que le llegan de Almacén, cotiza, genera la orden de compra formal, proveedores. No autoriza compras mientras no exista tope (ver Bloque 4)                                                                                          |
| Encargado de Bodega                                                                                          | Solo Almacén Central             | Entradas y salidas de insumos, refacciones y combustible del Almacén Central. Cuando falta stock, genera un pedido que le aparece a Compras. Autoriza altas de producto que no sea para la planta. Ve (solo lectura) lo que tiene cada Almacén Local por rancho |
| └ Bodeguista                                                                                                 | Mismo almacén que su Encargado   | Mismos permisos que Encargado de Bodega, pero solo captura (reporta a él)                                                                                                                                                                                       |

### Auditoría

| Puesto  | Alcance | Permisos / Módulos                                                                   |
|---------|---------|--------------------------------------------------------------------------------------|
| Auditor | Global  | Solo lectura de todos los módulos, sin excepción — no captura, no edita, no autoriza |

Choferes, jefes de cuadrilla y los puestos vistos en el reporte de campo (Inocuidad, Velador, Con Acceso, Auxiliar) no existen hoy como puestos: no tienen permisos ni aparecen en el organigrama hasta que existan de verdad.

### Pendientes de este bloque

- Definir los permisos de la Rama de Contabilidad al construir Contabilidad (9.16).

## 9. Descripción detallada de módulos

(Orden: el orden en que se llena la información en la operación real, empezando por Unidades de Producción.)

### 9.1 Unidades de Producción

#### Lógica establecida actual del módulo

- **Huerta**: unidad mayor (rancho/predio/Unidad de Producción). **Cuadro**: subdivisión de la huerta — nivel real de análisis para costo por hectárea, pero no necesariamente para rendimiento de cosecha (ver más abajo). Normalmente estable, pero puede cambiar de superficie (recalles, ajuste de calles) o dejar de sembrarse — requiere historial de configuración por fecha (versión del cuadro vigente en cada periodo).

- **Variedad — eje adicional para rendimiento**: el Cuadro es confiable para costeo (los gastos sí se pueden cargar a un cuadro), pero el rendimiento de cosecha por cuadro basado en cajas/remolques nunca fue confiable en la práctica — se inflaba en cuadros de poca superficie. El eje que sí es confiable para rendimiento es Variedad/Híbrido: remolques totales producidos por variedad, entre la superficie sembrada de esa variedad. Se llevan **ambos**: costeo por Cuadro, y rendimiento por Variedad, sin forzar que sean el mismo eje. Cuando cuadros contiguos son de variedades distintas, se debe dar la vuelta en la calle para no mezclar frutas de una variedad con otra en el mismo remolque.

- Ciclo — vive a nivel Huerta, no por Cuadro. Tipos: Cultivo, Descanso y Prueba. Una Huerta solo puede tener un Ciclo activo a la vez. En un Ciclo de cultivo, cuando el primer Cuadro de la Huerta entra a la etapa de Cosecha, toda la Huerta entra a Cosecha junto con él — todos los Cuadros se mueven de etapa al mismo tiempo. Cada Cuadro dentro del Ciclo tiene su propia variedad (o su composición completa, si es cuadro de prueba).

- No existe el replante a media cosecha: si un Cuadro deja de ser productivo antes que el resto, se tira y se espera a que termine la producción en toda la Huerta. Cuando termina, se tira el resto y la Huerta se cierra completa de una sola vez. Si después la tierra descansa (con o sin cultivo de descanso de suelo), se abre un Ciclo de tipo Descanso para toda la Huerta: acumula su propio costo y, al cerrarlo, ese costo pasa al siguiente Ciclo de cultivo de la Huerta (ver 9.16).

- Etapas del Ciclo de cultivo (4): 1. Preparación de Suelos; 2. Plantación/Desarrollo/Pre-cosecha; 3. Cosecha y Empaque; 4. Post-cosecha (tirar plantas y limpieza). El descanso de la tierra no es etapa: es su propio Ciclo de tipo Descanso. La transición a “Cosecha” se marca automáticamente cuando empieza a haber cosecha registrada en cualquier Cuadro de la Huerta (no es fecha manual). Un Ciclo de cultivo nuevo reinicia el conteo de gastos (más lo que traiga del Ciclo de Descanso previo y de Vivero) y recorre las 4 etapas para la Huerta completa. No todas las actividades son exclusivas de una etapa — tirado de cintilla puede ocurrir en Preparación o Desarrollo; chapeo, fertilización, reparación de cercas o fumigación pueden ocurrir en cualquier etapa; corte y empaque son exclusivos de Cosecha. Cada actividad del catálogo se marca como “restringida a una etapa” o “libre en cualquier etapa”.

- **Composición varietal del ciclo**: la mayoría de los cuadros llevan una sola variedad para todo el ciclo. Los cuadros de pruebas pueden tener **varias variedades distintas dentro del mismo cuadro**, cada una con su propia superficie exacta — **sin tope numérico de variedades por cuadro**. Para cosecha, aunque un cuadro de pruebas tenga varias variedades internamente, no se necesita trazabilidad de variedad hasta el remolque — se cosechan y venden en bloque como “Híbridos”.

- **Candado de superficie por variedad**: al capturar la composición varietal de un Ciclo, la suma de las superficies de todas las variedades declaradas de un mismo Cuadro **no puede exceder** las hectáreas ya dadas de alta para ese Cuadro (candado por Cuadro individual, no un total agregado de toda la Huerta) — si se excede, el sistema **bloquea el guardado** con una alerta. La suma **sí puede ser menor** (siembra parcial de ese Cuadro en el ciclo) — en ese caso no bloquea, pero antes de guardar muestra una **alerta grande** advirtiendo que no coincide, con dos botones: (1) **“Ajustar superficie por variedad”** — regresa a la pantalla de composición varietal para corregir/completar las filas de ese Cuadro; (2) **“Modificar Hectáreas Cuadro”** — ajusta directamente las hectáreas dadas de alta del Cuadro (en esta misma ficha de Unidades de Producción) para que coincidan con la superficie real sembrada. Todas las variedades de un Cuadro se capturan juntas en un mismo registro, no de forma incremental en sesiones separadas.

- Sección de Riego: pertenece a una sola Huerta y agrupa varios Cuadros completos que comparten la misma válvula que alimenta sus mangueras — no existen Cuadros parciales dentro de una Sección. Es independiente de la sincronización de Ciclo/etapa. Al dar de alta la Sección se eligen los Cuadros que la integran (relación real, no descripción libre). De ahí se derivan automáticamente sus Hectáreas (suma de las hectáreas de esos Cuadros) y su Distancia entre surcos (del Marco de Plantación de esos Cuadros) — ninguna se captura a mano. Si una Sección junta Cuadros con distinta distancia entre surcos, todo cálculo que la use se hace Cuadro por Cuadro y se suma (ver 9.6). Esta definición vive únicamente aquí.

- **Mapas**: se requiere la distribución del rancho (hectáreas, cuadros, caminos) visualmente dentro del sistema. Ya existen croquis/planos con cuadros medidos, no hay que generarlos desde cero. El mapa es información base/estática — se descarga una vez y queda disponible offline, sin necesitar sincronizar cada vez que se consulta. Es una **capa visual de referencia, sin vínculo estructurado** a la entidad Cuadro — el Cuadro no lleva coordenadas/geometría como campo.

#### Vistas o submódulos

- **Huertas y Cuadros**: pantalla para dar de alta/editar Huertas y sus Cuadros.

- Ciclos: da de alta el Ciclo activo de la Huerta (tipo Cultivo/Descanso/Prueba, fechas) y su composición varietal por Cuadro. Al cerrar un Ciclo de Descanso, su costo pasa al siguiente Ciclo de cultivo.

- **Secciones de Riego**: agrupa Cuadros de una Huerta por válvula compartida.

- Borrar Huerta completa: botón junto al borrado/desactivación estándar de Huertas (ver Bloque 4). Diferencias frente a desactivar:

  - **Borrado real e irreversible** (desactivar solo oculta y conserva todo) — borra la Huerta y todo lo que cuelga de ella: Cuadros, Secciones de Riego, Ciclos, Aplicaciones/Fertilizantes/Actividades/Riego programados y realizados, Nómina, Almacén Local, y órdenes de compra generadas desde ahí.

  - **Permisos:** solo Director General o Encargado de Sistemas.

  - **Confirmación escrita:** pide escribir el nombre exacto de la Huerta — el botón queda apagado hasta que coincida (probado con nombre incorrecto, se queda bloqueado).

  - **Candado de seguridad — no se puede borrar una Huerta que ya operó de verdad:** si la Huerta ya tuvo algún día de Nómina cerrado, el sistema no deja borrarla — solo sirve para limpiar una Huerta de prueba o creada por error.

  - Personal y Usuarios que tuvieran esa Huerta como base no se borran, solo se les quita la referencia.

#### Lógica de entrada de información

- **Campos de Cuadro**: nombre/número, Huerta a la que pertenece, hectáreas, tipo de suelo, fecha de siembra, **Marco de plantación** (distancia entre surcos × distancia entre plantas, formato tipo “3.5 × 1.5 m”), estatus (activo/en descanso/fuera de producción). Se deja abierta la posibilidad de agregar **campos personalizados** conforme se necesiten, sin predefinir cuáles.
- La variedad no es un campo del Cuadro: vive exclusivamente en la composición varietal del Ciclo (un Cuadro de prueba puede tener varias variedades a la vez). Un Cuadro recién dado de alta no tiene variedad asignada hasta que se le crea su primer Ciclo.
- **Marco de Plantación → cálculo automático de plantas**: no se captura el número de plantas a mano — se calcula solo. Fórmula: `plantas por hectárea = 10,000 m² ÷ (distancia entre surcos × distancia entre plantas)`; `plantas totales del cuadro = plantas por hectárea × hectáreas del cuadro`. Este dato alimenta directamente el modo de dosis “g/planta” de la ficha de Fertilizantes.

#### Procesamiento de información

- El sistema calcula automáticamente el **área efectiva** del rancho (sumando las áreas de los cuadros dados de alta) y el **% de aprovechamiento** (área efectiva / área total del rancho). Lo que no es área efectiva son caminos, comedores y áreas muertas.
- Al entrar el primer Cuadro de una Huerta a la etapa de Cosecha, el sistema sincroniza automáticamente el resto de los Cuadros de esa Huerta a la misma etapa.
- El cálculo de densidad de plantación y plantas totales por cuadro (fórmula arriba) es automático a partir del Marco de Plantación.

#### Salida de información

- Hectáreas efectivas y % de aprovechamiento → alimentan Centros de Costo y el Panel Ejecutivo.
- Ciclo activo y etapa vigente de cada Huerta → determinan qué actividades se pueden capturar en cada momento (ver ficha de Actividades).
- Composición varietal → alimenta el rendimiento por Variedad (ficha de Cosecha).
- Plantas totales por cuadro → alimenta el cálculo de dosis “g/planta” (ficha de Fertilizantes).
- Secciones de Riego → alimentan la ficha de Riego.

#### Personas/puestos involucrados y sus permisos

| Rol                                | Ver                 | Capturar | Editar |
|------------------------------------|---------------------|----------|--------|
| Director General                   | ✅                  | ✅       | ✅     |
| Gerente Técnico de Producción      | ✅                  | ✅       | ✅     |
| Gerente Administrativo             | —                   | —        | —      |
| Supervisor de Huerta               | ✅ (solo su Huerta) | —        | —      |
| Contabilidad                       | ✅                  | —        | —      |
| Técnico de Producción (Asistentes) | ✅                  | ✅       | ✅     |

#### Módulos que alimentan a este

- Ninguno — es de los primeros módulos que se llenan, es la base de la que parten los demás.

#### Módulos que reciben información de este

- Prácticamente todos: Actividades, Fertilizantes, Riego, Aplicaciones, Cosecha, Empaque, Almacén (Almacén Local por Huerta), Nómina (Huerta de cada registro), Centros de Costo/Contabilidad, Panel Ejecutivo.

#### Pendientes de este módulo

- Reasignación de Huerta a otro Supervisor a mitad de operación — casi no pasa en la práctica, sin diseñar hasta que haga falta.

### 9.2 Catálogos generales

(No es un módulo operativo — es el resumen de los catálogos base que alimentan a los demás módulos. Arrancan vacíos y se llenan con el uso. El detalle de cada uno vive en la ficha de su módulo.)

- Personal — Recursos Humanos (9.12).
- Actividades (tipos de labores) — Actividades (9.4), única lista vigente.
- Productos (categorías abiertas, Ingrediente Activo, Producto Comercial) — Almacén (9.15).
- Tractores/Equipos — Equipos y Maquinaria (9.13).
- Cuadros/Huertas, Ciclos, Secciones de Riego — Unidades de Producción (9.1).
- Proveedores — Compras (9.14).
- Clientes — Embarques (9.10).

Regla general de todos los catálogos: arrancan vacíos, con un botón “+” para ir agregando conforme se necesite — no se pre-cargan con listas cerradas, y dejan la posibilidad de agregar campos personalizados donde ya se confirmó (ej. Cuadro). Dónde se edita cada catálogo: ver Bloque 4.

Datos semilla: la carga inicial de datos reales se hace con un script de carga, nunca dentro del código (datos de arranque en el Apéndice A).

#### Pendientes de este bloque

- Ninguno.

### 9.3 Vivero

#### Lógica establecida actual del módulo

- La empresa produce su propia plántula (no la compra externa). Vivero registra todo lo que pasa desde la semilla hasta que la planta sale a campo.
- Vivero tiene su propio Almacén Local (mismo mecanismo que el Almacén Local de una Huerta, ver 9.15). Lo que Vivero usa sale del Almacén Central a ese Almacén Local y de ahí se aplica a los Lotes de siembra.
- Costo de Vivero — viaja con la plántula: todo lo que se carga a Vivero (semilla, fertilizante, productos, mano de obra) se acumula en el Lote de siembra al que se aplicó. Cuando la planta se trasplanta, ese costo pasa al Ciclo y a los Cuadros de destino. Vivero no es un centro de costo final (ver Bloque 3).
- Si un Lote se reparte en varios Cuadros, su costo se divide según las plantas enviadas a cada Cuadro. El costo de las plantas que murieron en vivero se reparte entre las que sí se trasplantaron (queda dentro del costo por planta trasplantada).
- Las compras manuales pueden tener Destino = Vivero (ver 9.14); lo comprado entra al Almacén Local de Vivero y se aplica a un Lote de siembra.
- **1) Presupuesto y pedido de semilla:** al iniciar un Ciclo se captura cuánta semilla de cada Variedad se planea sembrar (presupuesto por Ciclo/Variedad). De ahí se genera el pedido de semilla, que pasa por Compras igual que una programación de Aplicaciones (solicitud → cotización → orden de compra).
- **2) Charolas — capacidad definida por Ciclo:** al iniciar el Ciclo se define el tipo de charola y su número de cavidades, constante durante todo el Ciclo. Cada charola se identifica, asociada a una Variedad y a un Lote de siembra.
- **3) Lote de siembra y sus 5 fechas:** un Lote de siembra = grupo de charolas de una misma Variedad sembradas el mismo día. Las 5 fechas se capturan por Lote: remojo de semilla, puesta a calentar, siembra en charolas, tapado y salida al vivero.
- **4) Riego en vivero:** las plántulas se riegan, pero no hay método de medición de agua (a diferencia del cálculo de campo, 9.6).
- **5) Nutrición:** mismo mecanismo que Aplicaciones (9.7) — mismo catálogo de Ingrediente Activo y Recetario, se prepara en un tanque de X litros y pasa por Compras igual.
- **6) Conteos de vivas/muertas — por charola:** se captura el número de muertas por charola; las vivas se calculan solas (cavidades − muertas). Sin frecuencia fija obligatoria. El reporte se agrega por Variedad para sacar el % real de sobrevivencia y estimar si se cumplirá el requisito de plantas al trasplante, más la resiembra.
- **7) Plantas requeridas por Cuadro:** plantas necesarias de un Cuadro = plantas por charola × posiciones a sembrar × hectáreas del Cuadro, con los datos del Marco de Plantación y del tipo de charola. Se compara contra las plantas vivas disponibles.
- **8) Traspaso a campo y resiembra:** se registra cuántas charolas de qué Lote se mandan a campo y a qué Huerta/Cuadro. La decisión de resembrar es manual, por indicación del Gerente Técnico de Producción.
- Los conteos de plantas viven en Vivero, incluido el conteo en campo de cuántas plantas de un Lote “pegaron” después del trasplante. Monitoreo (9.20) es solo para huertas ya trasplantadas y no repite este conteo.

#### Vistas o submódulos

- Presupuesto de semilla, por Ciclo y Variedad.
- Lotes de siembra (con sus 5 fechas) y sus charolas.
- Conteo de muertas por charola.
- Nutrición (recetario tipo Aplicaciones).
- Almacén Local de Vivero.
- Traspaso a campo / Resiembra, con el conteo en campo posterior.

#### Lógica de entrada de información

- Presupuesto: Variedad, cantidad de semilla, Ciclo.
- Lote de siembra: Variedad, número de charolas, tipo de charola (cavidades), las 5 fechas.
- Conteo: por charola, número de muertas, fecha del conteo.
- Traspaso: Lote de siembra, cantidad de charolas (y plantas), Huerta/Cuadro destino, fecha.
- Conteo en campo posterior al traspaso: Lote de origen, cuántas prendieron y cuántas murieron, fecha.

#### Procesamiento de información

- Vivas por charola = cavidades del tipo de charola − muertas capturadas.
- % de sobrevivencia por Variedad = suma de vivas de sus charolas ÷ suma de cavidades de esas charolas.
- Costo por planta trasplantada de un Lote = costo total acumulado del Lote ÷ plantas trasplantadas del Lote. Costo que pasa a cada Cuadro = costo por planta trasplantada × plantas enviadas a ese Cuadro.
- Plantas requeridas por Cuadro = plantas por charola × posiciones a sembrar × hectáreas del Cuadro.
- Pedidos de semilla y de productos generan pendiente automático en Compras, igual que Aplicaciones.

#### Salida de información

- Costo del Lote de siembra → Ciclo y Cuadros de destino al trasplantar (Bloque 3, Unidades de Producción).
- Compras: pendientes automáticos de semilla y productos.
- Almacén: consumo del Almacén Local de Vivero.
- Unidades de Producción: plantas trasplantadas por Cuadro, para comparar contra lo requerido.

#### Personas/puestos involucrados y sus permisos

- Ingeniero de Vivero: captura todo en Vivero (programa y registra lo de sus Lotes de siembra). Sus compras automáticas no requieren autorización. No autoriza nada.
- Gerente Técnico de Producción y Dirección General: autorizan lo que en Vivero requiere autorización; el Gerente Técnico de Producción indica la resiembra.

#### Módulos que alimentan a este

- Unidades de Producción (Variedad, Ciclo, Cuadro destino, Marco de Plantación).
- Almacén (catálogo de Ingrediente Activo, Almacén Local de Vivero).
- Compras (lo comprado con Destino = Vivero).

#### Módulos que reciben información de este

- Compras (pendientes de semilla y productos).
- Almacén (consumo del Almacén Local de Vivero).
- Unidades de Producción y Centros de Costo (costo de la plántula por Ciclo y Cuadro; plantas trasplantadas).

#### Pendientes de este módulo

- Todo el módulo está pendiente de construir.
- Método de medición de agua en el riego de vivero — sin diseño, estimado a futuro.
- Módulo futuro de conteos/pruebas de campo con alertas automáticas de resiembra — fuera de alcance por ahora.

### 9.4 Actividades

#### Lógica establecida actual del módulo

- Catálogo de Actividades: tipos de labores de campo, abierto con botón “+”. Es el único catálogo de actividades del sistema; Nómina clasifica el pago de cada persona con este mismo catálogo. El catálogo de arranque está en el Apéndice A.
- Actividades nunca lleva producto: solo mano de obra y, si aplica, tractor. Todo lo que lleva producto vive en Aplicaciones (9.7) o Fertilizantes (9.5).
- Entradas especiales del catálogo:
  - “Riego” existe para que Nómina pueda clasificar pagos, pero no se programa aquí (se programa en 9.6); Granular y Fertirriego se programan en 9.5.
  - “Herbicida” es la mano de obra de una Aplicación de herbicida, no una aplicación con producto.
  - “Fumigación” y “Fertilización” no se programan desde Actividades (quedan reservadas a Aplicaciones y Granular), pero existen en el catálogo para poder registrarlas a mano en la Captura del día de Nómina cuando haga falta, sobre todo en etapas tempranas.
  - “Virosis” es la labor de revisar la huerta en busca de plantas con virosis.
- “Tirar 2da Cintilla” se programa y registra en Riego, por Sección de Riego (ver 9.6). En el catálogo de Actividades queda solo como entrada reservada para su tarifa y para clasificar el pago en Nómina, igual que Fumigación y Fertilización: no se programa desde Actividades.
- Dos etapas separadas: Planeación (qué se va a hacer, cuándo y dónde) y Registro/Ejecución (qué se hizo realmente) — comparables como plan vs. real. Una actividad programada queda “pendiente” hasta que alguien la marca como terminada (no se autocierra ni se autoreprograma).
- Programan: Dirección General, Gerente Técnico de Producción, Asistentes Técnicos de Producción y Supervisor de Huerta, normalmente con frecuencia semanal.
- Cada actividad del catálogo se marca como “restringida a una etapa” del Ciclo o “libre en cualquier etapa” (ver 9.1).
- Recurso por actividad — gente, tractor o mixto: cada actividad del catálogo lleva su tipo de recurso: solo gente (ej. Chapeo), solo tractor (ej. Bordeo, Encamado) o mixta (ej. Acomodar cintilla). El reporte de avance usa la misma estructura de líneas que Aplicaciones (9.7): en líneas de tractor, Tractor + Operador + Implemento obligatorios; en líneas de gente o mixtas, la lista de personas.
- Combustible del tractor: al terminar cada avance con tractor se rellena el tanque y se capturan los litros con foto; ese diésel baja a los Cuadros del avance (Bloque 3, mecanismo completo en 9.13).
- Cosecha y Empaque se manejan en sus propios módulos (9.8 y 9.9), aunque comparten el motor de plan vs. real y la conexión a mano de obra.
- **Paso 1, Programar:** Huerta, modo Por Cuadro o Por Variedad (mismo mecanismo que Aplicaciones, 9.7 — casilla “Toda la Huerta”, hectáreas parciales por Cuadro), actividad, rango de fechas y Comentarios. Actividades no usa Grupos de dosis (solo aplica a programaciones con producto).
- **Paso 2, Registrar avance:** por reporte, hectáreas totales avanzadas de la programación (sin indicar Cuadro ni variedad), las líneas de gente y de tractor con personas y horas, y el relleno de combustible de cada tractor. La suma de hectáreas de todos los reportes no puede exceder las hectáreas programadas. El costo de cada avance se reparte a los Cuadros con la fórmula del Bloque 3.
- Alta de personas en el reporte por selección múltiple (checklist de Personal que excluye a quien ya está en la línea; cada persona agregada entra con horas vacías).
- Precarga del reporte del día anterior de la misma programación (mismas líneas y personas), editable cada día sin afectar días anteriores.
- Tarjeta con resumen de avance (% completado = hectáreas avanzadas ÷ hectáreas programadas, horas-hombre, costo total) e historial de reportes editable uno por uno, sujeto al candado de consistencia con Nómina (no editable si esa Huerta/fecha ya tiene el día cerrado, ver 9.11).
- Nómina deja de ser el lugar de captura de estas tareas: las líneas de mano de obra llegan automáticas desde Actividades, Aplicaciones, Fertilizantes y Riego, y Nómina queda como resumen por persona más ajustes puntuales (ver 9.11).

#### Vistas o submódulos

- Catálogo de Actividades.
- Programar.
- Registrar avance (comparado contra lo programado).
- Indicadores: pantalla propia del sistema, común a Actividades, Aplicaciones y Granular (ver Procesamiento de información).

#### Lógica de entrada de información

- Alta de actividad: nombre, tipo de recurso (gente/tractor/mixto), esquema de pago y tarifa (ver 9.11 — hoy no existe destajo por surco, planta ni Cuadro), si requiere Cuadro o solo Huerta, y restricción de etapa.
- Programar y Registrar avance: ver Pasos 1 y 2 arriba.

#### Procesamiento de información

- Comparación automática de plan vs. real para el reporte de cumplimiento.
- Costo de cada avance (mano de obra + combustible de tractor) repartido a Cuadros con la fórmula del Bloque 3.
- Costo promedio por hectárea = costo total (mano de obra + maquinaria + insumo) ÷ hectáreas reportadas, sobre los últimos 90 días (ventana móvil).
- Intervalo promedio entre pases, en días = días del periodo × hectáreas de la Huerta ÷ hectáreas trabajadas (ej. 120 ha chapeadas en 90 días en una Huerta de 20 ha = 6 pases, uno cada 15 días). Se muestra por Huerta y por actividad; no hay promedio general de la empresa. Las actividades que no se reportan por hectárea muestran “—”. Ambos indicadores viven en la pantalla Indicadores, por Huerta, junto con los de Aplicaciones y Granular. El costo de producto sale del precio real del lote consumido (9.15), no del catálogo.

#### Salida de información

- Mano de obra → Nómina (9.11), automático.
- Líneas de tractor y combustible → Equipos y Maquinaria (9.13) y Almacén Local (9.15).
- Costo → Centros de Costo (Bloque 3) / Contabilidad (9.16).

#### Personas/puestos involucrados y sus permisos

| Rol                               | Ver        | Capturar (planear) | Capturar (real) | Autoriza                                             |
|-----------------------------------|------------|--------------------|-----------------|------------------------------------------------------|
| Director General                  | ✅         | ✅                 | ✅              | ✅                                                   |
| Gerente Técnico de Producción     | ✅         | ✅                 | —               | — (nueva actividad y tarifa: Gerente Administrativo) |
| Asistentes Técnicos de Producción | ✅         | ✅                 | —               | —                                                    |
| Supervisor de Huerta              | ✅ (su UP) | ✅ (su UP)         | ✅ (su UP)      | —                                                    |
| Capturista de información         | ✅ (su UP) | —                  | ✅ (su UP)      | —                                                    |
| Gerente Administrativo            | ✅         | —                  | —               | ✅ (nueva actividad, cambio de tarifa)               |

(Capturista de información: mismo alcance de captura que Supervisor de Huerta, sin permiso de programar ni de autorizar — ver Bloque 8.)

#### Módulos que alimentan a este

- Unidades de Producción (Cuadros, variedades del Ciclo, etapa vigente — determina qué actividades se pueden programar).
- Equipos y Maquinaria (tractores, implementos) y Almacén Local (combustible del relleno).

#### Módulos que reciben información de este

- Nómina (mano de obra de cada avance, automático).
- Equipos y Maquinaria (Uso diario de las líneas de tractor y su combustible).
- Almacén (descuento del combustible del Almacén Local).
- Centros de Costo / Contabilidad (costo repartido a Cuadros).

#### Pendientes de este módulo

- Construir la restricción por etapa del Ciclo: el campo “etapa” existe en la actividad pero ningún filtro lo usa todavía.

### 9.5 Fertilizantes

#### Lógica establecida actual del módulo

- Fertilizantes tiene dos caminos, separados por el método con que el producto llega a la planta: Granular (en seco, esparcido con gente o con implemento) y Fertirriego (inyectado al sistema de riego). La aspersión con tanque vive en Aplicaciones (9.7). La frontera entre módulos es siempre el método, no la categoría del producto: un mismo producto puede tener varios métodos de aplicación y usarse en cualquiera de los tres flujos.
- Solo Ingrediente Activo al programar, nunca marca: Programar y Recetario trabajan únicamente con Ingrediente Activo + dosis. La marca se resuelve después: Compras (9.14) decide qué marca comprar (preferido vs. sustitutos autorizados) y Almacén (9.15) identifica la marca de cada lote físico al sacarlo por FIFO. Los sustitutos autorizados tienen la misma dosificación que el preferido, así que la dosis capturada aquí es válida sin importar la marca. Esta regla vive aquí y aplica igual a Aplicaciones (9.7) y Vivero (9.3).
- Cada Producto Comercial tiene un solo Ingrediente Activo. Un producto mezcla (ej. un fertilizante N-P-K) se registra con un Ingrediente Activo compuesto propio (ej. “N-P-K 17-17-17”), que funciona igual que cualquier otro para FIFO, producto preferido y programación.
- Un producto para la planta debe estar autorizado por Dirección General o Gerente Técnico de Producción antes de poder comprarse, no solo antes de aplicarse (ver Bloque 4). Solicitar compra (9.14) no deja elegir un producto sin autorizar.
- Programan: Dirección General, Gerente Técnico de Producción y Asistentes Técnicos de Producción (estos últimos usan la receta tal cual, sin cambiar la dosis).
- Si alcanza el Almacén, el producto se aparta de inmediato; si no alcanza, no se bloquea: se manda automático a Compras (9.14), sin autorización adicional, por la cantidad de toda la campaña.
- Editar una programación ya guardada: se puede editar libremente mientras no tenga ningún avance ni ningún día ejecutado; desde el primero queda bloqueada (solo se puede reprogramar aparte). Requiere el mismo permiso de programar. Aplica igual a Granular, Fertirriego y Aplicaciones (9.7).
- Las reglas de apartado, entrega, avance vencido y cierre por debajo de 100% son las mismas de Aplicaciones (9.7) y del Almacén Local (9.15).

#### Camino 1 — Granular (en seco)

- **Paso 1, Programar:** Huerta, modo Por Cuadro o Por Variedad (casilla “Toda la Huerta”), Grupos de dosis — cada grupo con sus Cuadros o variedades, su Ingrediente Activo y su dosis —, Comentarios, recurso (“Con gente” o “Con implemento”; con implemento es obligatorio elegir el equipo), modo de dosis (kg/hectárea o g/planta) y rango de fechas. Mismo mecanismo que Aplicaciones (9.7), con una diferencia: cada grupo lleva su dosis directa, sin concentración, litros de mezcla ni tanque.
- Si la dosis es g/planta, la cantidad usa las plantas a tratar: Cuadro por Cuadro, hectáreas programadas (o superficie de la variedad) × plantas por hectárea de ese Cuadro, sumado. Plantas por hectárea = 10,000 m² ÷ (distancia entre surcos × distancia entre plantas), del Marco de Plantación (9.1).
- Varios productos en la misma fertilización: se pueden revolver varios granulares antes de esparcir; cada producto conserva su propia dosis. El avance es compartido (se esparce todo junto) y el descuento de Almacén es individual por producto, proporcional a ese avance.
- **Paso 2, Registrar avance (Supervisor):** solo después de la entrega del producto a la Huerta. Por reporte: hectáreas totales avanzadas (sin Cuadro, variedad ni grupo), personas y horas, y — si fue con implemento — la línea de tractor con su relleno de combustible. Candado: la suma de hectáreas no puede exceder las programadas. Cada avance descuenta del Almacén Local lo proporcional y reparte el costo a Cuadros con la fórmula del Bloque 3.
- Precarga del reporte del día anterior de la misma programación, editable cada día sin afectar días anteriores.
- Candado de consistencia con Nómina: un avance ya registrado se puede editar mientras su Huerta/fecha no tenga el día cerrado en Nómina; si ya está cerrado, se bloquea (ver 9.11).
- Indicadores de costo promedio por hectárea e intervalo entre pases: mismo cálculo que Actividades (9.4), un indicador por Huerta, sin separar por producto, en la pantalla Indicadores. Fertirriego no tiene estos indicadores (su ejecución diaria por Sección es distinta).

#### Camino 2 — Fertirriego (se programa aquí, se ejecuta desde Riego)

- Cómo funciona físicamente: en un tanque (ej. de 1000 L) se pone agua, se agregan los productos a inyectar, se revuelven y se inyectan al sistema de riego. Es el agua del riego la que reparte el producto a las plantas. La dosis de cada producto depende de las hectáreas de la Sección de Riego, no de la capacidad del tanque — para diluir da igual si el tanque tiene 1000 u 800 litros. Por eso Fertirriego no usa concentración, litros de mezcla por hectárea ni cálculo de tanque.
- **Programar:** Huerta, Sección(es) de Riego (no Cuadros), Ingrediente Activo — cualquier producto cuya categoría requiere Ingrediente Activo (9.15), sin filtro de solubilidad: quien programa sabe qué es seguro inyectar —, dosis por hectárea (kg/ha, L/ha o g/ha), frecuencia y rango de fechas.
- Frecuencia — solo dos opciones: diario, o días fijos de la semana (casillas de lunes a domingo, mínimo 1 día; ej. lunes-miércoles-viernes). Riegos en la semana = días marcados (o 7 si es diario), constante de una semana a otra.
- Cantidad por riego = dosis por hectárea × hectáreas de las Secciones elegidas. Total de la campaña = cantidad por riego × número de riegos que caen dentro del rango de fechas según la frecuencia. Al guardar se muestran ambos, para poder comprar todo el volumen de un jalón.
- El apartado, la compra automática, la entrega y la liberación de stock usan siempre el total de la campaña (“Confirmar entrega” es un evento único para toda la campaña, no riego por riego). El valor por riego se sigue guardando porque lo usan Riego (9.6) y la Orden de Fertirriego. Si se edita la programación, la compra automática ya generada se ajusta sola.
- Varios productos en el mismo fertirriego: cada uno con su propia dosis por hectárea. Avance compartido, descuento de Almacén individual por producto.
- Una vez entregado, la ejecución diaria (cuánto se inyectó ese día y la gasolina de la motobomba) se registra desde Riego (9.6); aquí no hay “registrar como realizada”.
- Recetario de Fertirriego: cada producto de la receta lleva solo su dosis por hectárea — sin concentración, litros de mezcla, tanque ni Tipo de aplicación.
- **Orden de Fertirriego** — documento para entregar al Regador (formato basado en el Excel que ya usa la empresa): encabezado con Huerta, Semana, Fecha, Válvulas de la Huerta, Receta, Frecuencia, Riegos en la semana y Hectáreas totales.
  - Desglose por válvula (= Sección de Riego, 9.1): una fila por válvula con sus hectáreas y la cantidad de cada producto = dosis × hectáreas de esa válvula.
  - Total por riego = suma de las válvulas de cada producto (= dosis × hectáreas totales).
  - Total de la semana = total por riego × riegos en la semana, automático.
  - Columnas por Ingrediente Activo, no por nombre comercial.
  - Mismo formato de salida que la Orden de Aplicación (pantalla + PDF con identidad de marca) y misma regla de presentación de cantidades (Bloque 6: 2 decimales, o gramo entero cuando la unidad práctica es gramos; el cálculo guarda todos los decimales).

#### Análisis de laboratorio y seguimiento

- Se reciben 3 tipos de análisis: extracto de pasta saturada (suelo) y nutrición foliar de peciolo cada 60 días; savia (CARDIS) de peciolo, semanal. El de agua reporta pH, Temp, CE, RAS, Clasificación, cationes/aniones y Boro; el foliar reporta Nitrógeno Total, aniones/cationes y microelementos, cada uno con su rango de referencia. En la terminología del laboratorio, “LOTE” = Huerta y “SECTOR” = Variedad, así que los análisis se ligan al eje Huerta + Variedad. La CE en savia no debería bajar de 12 (referencia de falta de nutrientes).
- Encuesta de seguimiento post-aplicación (idea, aplica también a Aplicaciones 9.7): encuesta simple 1-2 días después de una aplicación sobre cómo se ve la planta, disparada automáticamente y contestada por el Supervisor o un técnico.

#### Vistas o submódulos

- Granular: programar, registrar avance.
- Fertirriego: programar, Recetario, Orden de Fertirriego (la ejecución vive en Riego).

#### Lógica de entrada de información

- Ver Paso 1 y Paso 2 de Granular y Programar de Fertirriego, arriba.

#### Procesamiento de información

- Cantidad total a partir de la dosis por hectárea o por planta y las hectáreas/plantas programadas (Granular) o de las Secciones (Fertirriego).
- Verificación automática de stock en Almacén, con ruteo a Compras si falta.
- Reparto del costo de cada avance a Cuadros (Bloque 3).

#### Salida de información

- Mano de obra (Granular) → Nómina.
- Consumo de producto y combustible → Almacén Local de la Huerta.
- Fertirriego programado y entregado → Riego (ejecución diaria).
- Pendientes de compra → Compras.
- Costo → Centros de Costo / Contabilidad.

#### Personas/puestos involucrados y sus permisos

| Rol                               | Ver        | Capturar (programar)                   | Capturar (realizada) | Autoriza       |
|-----------------------------------|------------|----------------------------------------|----------------------|----------------|
| Director General                  | ✅         | ✅                                     | ✅                   | ✅             |
| Gerente Técnico de Producción     | ✅         | ✅                                     | —                    | ✅ (productos) |
| Asistentes Técnicos de Producción | ✅         | ✅ (sin cambiar la dosis de la receta) | —                    | —              |
| Supervisor de Huerta              | ✅ (su UP) | —                                      | ✅                   | —              |
| Capturista de información         | ✅ (su UP) | —                                      | ✅                   | —              |

(Capturista de información: mismo alcance que Supervisor de Huerta, sin programar ni autorizar — ver Bloque 8.)

#### Módulos que alimentan a este

- Unidades de Producción (Cuadros, Marco de Plantación, variedades del Ciclo, Secciones de Riego).
- Almacén (catálogo de productos y stock).

#### Módulos que reciben información de este

- Almacén (consumo, movimientos).
- Nómina (mano de obra de Granular).
- Compras (pendientes automáticos por faltante).
- Riego (fertirriegos programados, para ejecución diaria).
- Equipos y Maquinaria (líneas de tractor de Granular con implemento).
- Centros de Costo / Contabilidad.

#### Pendientes de este módulo

- Corrección visual de la Orden de Fertirriego y de la Orden de Aplicación (diseño compartido): el logo aparece cortado por una línea en el encabezado del PDF; encabezados de columna recortados (PDF y app); contraste ilegible del encabezado en la app (en el PDF está bien); valores desalineados cuando la etiqueta de una fila ocupa dos líneas; columnas por Ingrediente Activo en lugar de nombre comercial.
- Encuesta de seguimiento post-aplicación — diseño de detalle pendiente.
- Detalle técnico de qué capturar por aplicación, ejemplos de análisis de pasta saturada y savia, unidad exacta del umbral de CE en savia, y rangos de referencia de agua y pasta saturada — pendiente de los técnicos. Prioridad baja para alertas automáticas: los ingenieros ya deciden con estos resultados.

### 9.6 Riego

#### Lógica establecida actual del módulo

- Sección de Riego: definición, alta y Cuadros que la integran viven en Unidades de Producción (9.1). Aquí se usa para la ejecución diaria de riego, el Fertirriego, el cálculo de agua aplicada y Tirar 2da Cintilla.
- Las horas de riego no son fijas por Sección: varían día a día según la necesidad de agua y se capturan a diario.
- El Fertirriego se programa en Fertilizantes (9.5) por Sección de Riego, con su dosis por hectárea y su frecuencia; aquí se ejecuta.
- Ejecución diaria: cada día, por Sección, se capturan las horas regadas. Si hay un Fertirriego programado y ya entregado a esa Huerta, el registro trae la casilla “Inyección completa”: marcada, se da por aplicado lo programado de ese día; sin marcar, al guardar se abre un diálogo para capturar la cantidad real de cada producto (0 si no se metió). Así se ajusta o quita un producto un día específico sin tocar la programación ni los demás días — por ejemplo, bajar la dosis varios días para tratar una intoxicación.
- Descuento diario y acumulativo: cada día capturado descuenta del Almacén Local lo realmente inyectado ese día. Si se edita un día ya capturado, se ajusta solo la diferencia. El costo se reparte entre los Cuadros de la Sección en proporción a sus hectáreas (Bloque 3).
- Gasolina de la motobomba: hay una motobomba fija por rancho, conectada al sistema de agua, y solo se usa cuando se inyecta fertilizante (el riego solo con agua no la usa). La gasolina que se le echa se reporta ligada a un Fertirriego, o sin ligar pero ese mismo día y en ese mismo rancho — en ese caso el sistema la liga a los Fertirriegos del día. Si ese día se fertirrigaron varias Secciones, la gasolina se reparte entre ellas según sus hectáreas. Si un Fertirriego se parte en varios días (lluvia, causa mayor), cada día lleva su propia gasolina. Mecanismo completo y alerta de consumo en 9.13.
- El riego no genera mano de obra variable: el operador es siempre el Regador del rancho, y el registro diario de riego no genera registro en Nómina. La excepción es Tirar 2da Cintilla (abajo), que sí paga nómina.
- El candado de Almacén Local a 15 días aplica igual al Fertirriego (ver 9.15).
- Recordatorio diario: cada día que, según la frecuencia, toca Fertirriego en una Sección y no se ha registrado, aparece un pendiente para Regador, Supervisor de Huerta y Gerente Técnico de Producción (Bloque 6, Notificaciones).
- La Sección de Riego es un agrupamiento de infraestructura, independiente del Ciclo y su etapa.

#### Tirar 2da Cintilla

- Es una tarea de Riego, no una Actividad: se programa por Sección de Riego. La programan el Gerente Técnico de Producción o un Asistente Técnico de Producción.
- Cada reporte de avance indica la Sección y las hectáreas avanzadas en ella, más personas y horas. Sí paga nómina (mismo registro automático de mano de obra que un avance de Actividades). El costo de mano de obra se reparte entre los Cuadros de la Sección en proporción a sus hectáreas. Candado: las hectáreas reportadas de una Sección no pueden exceder las de esa Sección.
- Cuando el avance de una Sección llega al 100%, esa Sección pasa a 2 líneas de cintilla, con la fecha de ese reporte como fecha de vigencia (alimenta el historial de Líneas de cintilla, abajo). Mismo patrón si algún día hiciera falta una 3ra línea.

#### Cálculo de litros de agua aplicados por riego

- Gasto de cintilla (L/metro/hora): se captura por Huerta, ligado a su Ciclo actual; con un Ciclo nuevo se vuelve a confirmar.
- Líneas de cintilla por surco: se captura por Sección de Riego, con historial de vigencia por fecha (puede cambiar a mitad del Ciclo). El cálculo de cualquier fecha usa las líneas vigentes en esa fecha.
- Hectáreas y distancia entre surcos: se derivan de los Cuadros de la Sección (9.1).
- Metros de cintilla de la Sección = (10,000 m² ÷ distancia entre surcos) × líneas de cintilla vigentes × hectáreas. Si la Sección junta Cuadros con distinta distancia entre surcos, se calcula Cuadro por Cuadro y se suma. La distancia entre plantas no entra.
- Litros por hora de la Sección = metros de cintilla × Gasto de cintilla. Litros aplicados en un día = litros por hora × horas regadas.
- Uso informativo y analítico (ej. correlación con cosecha o amarre de fruta): se calcula y se guarda en cada registro diario, no bloquea ni alerta.

#### Vistas o submódulos

- Captura diaria: vista “Todas UPs” con una tarjeta por Huerta; dentro, todas sus Secciones como filas de una tabla, cada una con su campo de horas y, si aplica, la casilla “Inyección completa”, más la captura de gasolina de la motobomba.
- Historial visual semanal: una tarjeta por Huerta con una tabla tipo calendario (Secciones como filas, días como columnas, horas regadas en cada celda); las celdas con Fertirriego llevan una señal verde.
- Tirar 2da Cintilla: programar por Sección y registrar avance.

#### Lógica de entrada de información

- Por Sección y por día: horas regadas; si hay Fertirriego, “Inyección completa” o cantidades reales por producto.
- Por Fertirriego del día: litros de gasolina de la motobomba, con foto.
- Tirar 2da Cintilla: Sección(es), fechas; avance con personas y horas.

#### Procesamiento de información

- Descuento diario del Almacén Local por lo realmente inyectado; costo repartido a los Cuadros de la Sección.
- Gasolina de la motobomba repartida entre las Secciones fertirrigadas ese día por hectáreas, y de ahí a sus Cuadros.
- Litros de agua aplicados por Sección y día.
- Al 100% de Tirar 2da Cintilla en una Sección, cambio automático a 2 líneas con fecha de vigencia.

#### Salida de información

- Consumo diario de producto y gasolina → Almacén Local.
- Costo del Fertirriego y de la gasolina → Cuadros de la Sección (Centros de Costo).
- Mano de obra de Tirar 2da Cintilla → Nómina.
- Horas regadas y litros de agua → histórico para análisis.
- Consumo de la motobomba → Equipos y Maquinaria (alerta de consumo).

#### Personas/puestos involucrados y sus permisos

| Rol                               | Ver               | Capturar                                                   |
|-----------------------------------|-------------------|------------------------------------------------------------|
| Director General                  | ✅                | ✅                                                         |
| Regador                           | ✅ (su UP)        | ✅ (horas, Fertirriego del día y gasolina de la motobomba) |
| Supervisor de Huerta              | ✅ (su UP)        | ✅ (avance de Tirar 2da Cintilla)                          |
| Gerente Técnico de Producción     | ✅ (multi-rancho) | ✅ (programa Tirar 2da Cintilla)                           |
| Asistentes Técnicos de Producción | ✅                | ✅ (programa Tirar 2da Cintilla)                           |

#### Módulos que alimentan a este

- Unidades de Producción (Secciones de Riego, Cuadros, Ciclo).
- Fertilizantes (Fertirriegos programados y entregados).

#### Módulos que reciben información de este

- Almacén (descuento diario del Almacén Local).
- Nómina (mano de obra de Tirar 2da Cintilla).
- Equipos y Maquinaria (consumo de la motobomba).
- Centros de Costo / Contabilidad.

#### Pendientes de este módulo

- Construir el cálculo de litros de agua aplicados (el campo de Líneas de cintilla ya existe).

### 9.7 Aplicaciones

#### Lógica establecida actual del módulo

- Aplicaciones cubre todo lo que se aplica por aspersión con tanque o recipiente (mochila, turbina, aguilón, drone), sea cual sea el tipo de producto. Lo que se aplica en seco vive en Granular y lo que se inyecta al riego en Fertirriego (9.5). La frontera es el método, no la categoría del producto.
- Solo Ingrediente Activo al programar y en el Recetario, nunca marca (regla completa en 9.5).
- No existe la categoría genérica “Agroquímico”: cada producto se da de alta con su tipo específico (fungicida, herbicida, foliar, estimulante, protector, enraizador, extracto natural, etc.), con el catálogo abierto de categorías de Almacén (9.15).
- Caso de uso ancla: una sola captura de avance genera en automático la salida de inventario del Almacén Local, la mano de obra en Nómina, el uso de maquinaria y combustible, y el costo repartido a Cuadros (Bloque 3).
- Planeación → Almacén: al programar, el sistema avisa a Almacén para preparar la salida con anticipación.
- Un producto nuevo para la planta lo autorizan únicamente Dirección General o Gerente Técnico de Producción; los Asistentes Técnicos pueden proponerlo. Un producto puede estar dado de alta sin estar autorizado, pero no se puede comprar ni programar hasta autorizarse. Modificar un producto ya autorizado sigue el mismo criterio.
- No hay periodo de reingreso ni de carencia que el sistema deba controlar.
- Las recetas se guardan y reutilizan como “paquete técnico”, pero varían por rancho (suelo, agua, temporada): no se estandarizan desde el inicio.

#### Paso 1 — Programar

- Programan: Dirección General, Gerente Técnico de Producción y Asistentes Técnicos de Producción (estos últimos, con la receta tal cual, sin cambiar la dosis).
- Se elige la Huerta y el modo, sin mezclarlos en una misma programación:
  - Por Cuadro: “Toda la Huerta” con opción de desmarcar Cuadros; a cualquier Cuadro se le pueden poner menos hectáreas de las que mide (ej. 3 de 5 ha).
  - Por Variedad: se eligen una o varias variedades de la Huerta y se toma toda la superficie de esa variedad según la composición varietal del Ciclo (9.1).
- Grupos de dosis: una programación puede tener varios grupos, cada uno con sus Cuadros o variedades, su receta (Ingredientes Activos con concentración) y sus propios litros de mezcla por hectárea. Sin grupos, la programación es un solo grupo.
- Además: recurso principal sugerido (Mochila, Turbina, Aguilón o Drone — solo referencia; lo real se captura en cada avance), Tipo de aplicación (obligatorio; catálogo abierto con botón “+”, se precarga si la receta ya lo trae), capacidad del tanque/recipiente, rango de fechas (inicio y fin) y Comentarios (campo libre, también sirve para precisar un área parcial, ej. “surcos del lado norte”; aparece en la tarjeta y en la Orden).
- Cantidad total de cada producto de un grupo = concentración × litros de mezcla por hectárea × hectáreas del grupo (conversión de unidad: ml→L o g→kg ÷ 1,000; kg/L ya está en kg).
- Plantas a tratar: Cuadro por Cuadro, hectáreas programadas (o superficie de la variedad en ese Cuadro) × plantas por hectárea del Marco de Plantación de ese Cuadro, y se suma. Es la única definición en todo el sistema.
- Varios productos en la misma mezcla: se pueden agregar varios productos a un grupo (ej. nitrato de magnesio + fierro + micromix en el mismo tanque). Cada uno lleva su concentración, pero comparten los litros de mezcla por hectárea de su grupo. Cada producto se autoriza, aparta y descuenta del Almacén por separado.
- Si alcanza el Almacén se aparta de inmediato; si no, se manda automático a Compras (9.14) sin autorización adicional.
- Editar una programación ya guardada: mismo criterio que 9.5 (libre hasta el primer avance).

#### Recetario

- Receta = nombre + lista de Ingredientes Activos con su concentración y litros de mezcla por hectárea + Tipo de aplicación. Una receta no puede repetir Ingrediente Activo entre líneas.
- Al programar con receta, la dosis de cada producto queda editable; si se modifica, el sistema pregunta si es solo para esta vez o para modificar la receta original.
- Solo Dirección General y Gerente Técnico de Producción crean o editan recetas y cambian la dosis al programar. El candado también está en el servidor: una dosis distinta enviada por otro rol se rechaza (error 403).
- Trazabilidad: siempre se guarda la receta usada como base y la dosis realmente programada, aunque se haya ajustado “solo esta vez”.

#### Cálculo de mezcla por tanque

- Aplica a toda Aplicación, use receta o no, calculado por grupo. No aplica a Fertirriego ni a Granular (9.5).
- La capacidad del tanque/recipiente se captura al programar (no es catálogo fijo: varía según el equipo disponible ese día).
- Hectáreas por tanque completo = capacidad del tanque ÷ litros de mezcla por hectárea. Tanques = hectáreas del grupo ÷ hectáreas por tanque completo (normalmente con decimales).
- Producto por tanque completo = concentración × capacidad del tanque (misma conversión de unidad). El último tanque (la fracción) lleva la parte proporcional de mezcla y de producto.
- Ejemplo de la fórmula: 50 L de mezcla/ha, tanque de 1,000 L → 20 ha por tanque. Producto a 2 ml/L → 2 L por tanque completo. Para 132 ha: 6.6 tanques → 6 completos + 1 último tanque de 600 L con 1.2 L de producto.
- Se muestra en unidades prácticas (ej. “1.2 L”, “5 kg”, “80 g”, “720 mL”) más el agua correspondiente, nunca como porcentaje del tanque.

#### Orden de Aplicación

- Documento para quien prepara y aplica la mezcla, con el contenido y el orden de los formatos que ya usa la empresa. Se genera al programar (botón “Ver Orden”), en pantalla (pensada para compartirse por foto o WhatsApp) y en PDF con la identidad de marca (Bloque 11).
- Contenido: Semana, Huerta, No. de aplicación (posición en el historial de esa Huerta, automático), Fecha programada, Capacidad del tanque/bomba, Tipo de aplicación, Hectáreas a aplicar, Gasto de agua (L/ha), Volumen total de agua, Tanques a preparar, Plantas a tratar (automático), Productos en la mezcla, Equipo de aplicación, Hectáreas por tanque y Comentarios. Una tabla de mezcla por grupo: productos con su Ingrediente Activo, Dosis, Unidad, Cantidad total, Cantidad por tanque completo y Cantidad último tanque.
- “Tanques a preparar” se muestra en lenguaje de campo (ej. “1 tanque completo de 2,000 L + 1 tanque parcial de 1,402 L”).
- Solo cuando Tipo de aplicación = Drench: mL de solución por planta = volumen total de agua (mL) ÷ plantas a tratar.
- Presentación de cantidades: 2 decimales en L o kg, y gramo entero cuando la unidad práctica es gramos; el cálculo guarda todos los decimales (Bloque 6). Misma función compartida con la Orden de Fertirriego y el cálculo de tanque.

#### Entrega y Almacén Local

- El stock queda apartado en el Almacén Central desde que se programa. Se mueve al Almacén Local de la Huerta con un solo “Confirmar entrega” por programación completa (no por Cuadro), y en ese momento el costo del producto se carga a la Huerta (Bloque 3).
- Cada avance descuenta del Almacén Local lo proporcional a ese avance, grupo por grupo (hectáreas atribuidas al grupo × dosis del grupo). Al 100% de avance, lo descontado cuadra exacto con lo programado.
- Sobrante y abono: lo que regresa al Almacén Central lo registra el Encargado de Bodega al recibirlo, y genera un abono a la Huerta al mismo precio con el que se cargó.

#### Paso 2 — Registrar avance

- Solo después de la entrega a la Huerta; si no se ha entregado, el sistema lo bloquea con aviso.
- El avance se reporta en hectáreas totales de la programación, más las líneas de trabajo del día — sin indicar Cuadro, variedad ni grupo. Candado: la suma de hectáreas de todos los reportes no puede exceder las hectáreas totales programadas.
- Líneas de trabajo — se pueden combinar en un mismo reporte (ej. una cuadrilla con Mochila y otra con Aguilón el mismo día). Lista fija de modalidades:
  - Mochila: cada persona con su mochila — solo la lista de personas.
  - Turbina: implemento jalado por tractor, manejado por un operador — Tractor + Operador + Implemento.
  - Aguilón: implemento jalado por tractor con operador, más un grupo de personas con mangueras — Tractor + Operador + Implemento + lista de personas de esa línea (cada línea de tractor lleva su propia gente).
  - Drone: el drone trabaja con baterías que se cargan con una planta de luz de gasolina — se capturan las horas del drone (van a Uso diario, 9.13) y, al final del avance, la gasolina que se le echó a la planta de luz.
- Combustible: en cada línea de tractor se captura el diésel del relleno al terminar el avance (o al cambiar de implemento), y en la línea de drone la gasolina de la planta de luz, con foto. Ese combustible baja a los Cuadros del avance (Bloque 3; mecanismo completo en 9.13).
- Las líneas con tractor alimentan “Uso diario” de Equipos y Maquinaria (9.13), sin capturarse dos veces.
- Precarga: el reporte de un nuevo día se pre-llena con las líneas del reporte anterior de la misma programación; solo se ajustan horas y litros. Editable cada día sin afectar días anteriores.
- Reparto: cada avance se reparte entre grupos y Cuadros o variedades con la fórmula del Bloque 3 — costo (producto + mano de obra + combustible), descuento de Almacén y nota de tanque, todo con el mismo cálculo, registrado ese mismo día sin recalcular días anteriores.
- Nota de tanque a medias: por grupo, proporcional al avance atribuido a ese grupo.
- % de avance = hectáreas avanzadas ÷ hectáreas totales programadas; “Terminado” = 100%.
- Historial de reportes: cada reporte diario se ve por separado y se puede editar uno específico, salvo que esa Huerta/fecha ya tenga el día cerrado en Nómina (candado de consistencia, ver 9.11). La tarjeta muestra las hectáreas restantes de la programación completa.
- Por programación se ve el total de producto, nómina, horas-hombre y días que tomó. Nómina recibe Huerta, persona y horas, como siempre.

#### Cierre, vencimiento y cancelación

- Cierre por debajo de 100%: solo Dirección General o Gerente Técnico de Producción, con nota obligatoria de qué faltó. El producto sobrante regresa al Almacén Central con abono.
- Plazo de 15 días, contado así:
  - Producto apartado que nunca salió del Almacén Central: se mantiene apartado hasta 15 días después de la fecha de inicio y luego se libera automáticamente.
  - Producto ya entregado al rancho sin aplicarse por completo: se muestra como “aplicación pendiente”; al cumplirse 15 días después de la fecha fin, se avisa al Gerente Técnico de Producción y al Supervisor de Huerta.
  - Pasados esos 15 días después de la fecha fin, la aplicación se cancela con el protocolo de abajo. Si ya tenía avance, se cancela solo el saldo no aplicado.
- Protocolo de cancelación (inverso a la salida de Almacén al campo): solo Dirección General o Gerente Técnico de Producción, con confirmación. Queda registrada como “no se hizo” (alimenta el cumplimiento plan vs. real). Se avisa a Almacén qué producto y cuánto se le regresa; se genera el abono a la Huerta; sale del Almacén Local y entra al Almacén Central. El Encargado de Bodega marca en el sistema “ya llegó” (firma digital). El ajuste contable se procesa desde la cancelación, sin esperar esa marca.
- Las programaciones liberadas o canceladas se ocultan de la lista activa (Bloque 5).

#### Indicadores

- Costo promedio por hectárea e intervalo entre pases: mismo cálculo que Actividades (9.4), por Huerta y por Tipo de aplicación, en la pantalla Indicadores. Como el Tipo de aplicación es obligatorio, toda Aplicación entra en el indicador.

#### Vistas o submódulos

- Programar (con Recetario y Orden de Aplicación).
- Registrar avance.
- Historial de Aplicaciones — solo lectura, con filtros por Huerta, fechas y producto.

#### Lógica de entrada de información

- Ver Paso 1 y Paso 2, arriba.

#### Procesamiento de información

- Cantidad total por producto y grupo a partir de concentración, litros de mezcla y hectáreas; cálculo de tanques.
- Verificación automática de stock y ruteo a Compras si falta.
- Descuento proporcional del Almacén Local en cada avance y reparto de costo a Cuadros (Bloque 3).

#### Salida de información

- Mano de obra → Nómina.
- Consumo de producto y combustible → Almacén Local.
- Líneas de tractor → Equipos y Maquinaria.
- Pendientes de compra → Compras.
- Costo → Centros de Costo / Contabilidad.

#### Personas/puestos involucrados y sus permisos

| Rol                               | Ver        | Capturar (programar)                   | Capturar (realizada)     | Autoriza                                                  |
|-----------------------------------|------------|----------------------------------------|--------------------------|-----------------------------------------------------------|
| Director General                  | ✅         | ✅                                     | ✅                       | ✅                                                        |
| Gerente Técnico de Producción     | ✅         | ✅                                     | —                        | ✅ (productos, cierres por debajo de 100%, cancelaciones) |
| Asistentes Técnicos de Producción | ✅         | ✅ (sin cambiar la dosis de la receta) | —                        | —                                                         |
| Supervisor de Huerta              | ✅ (su UP) | —                                      | ✅                       | —                                                         |
| Ayudante de Supervisor            | ✅         | —                                      | ✅ (avisa al Supervisor) | —                                                         |
| Capturista de información         | ✅ (su UP) | —                                      | ✅                       | —                                                         |

(Capturista de información: mismo alcance que Supervisor de Huerta, sin programar ni autorizar — ver Bloque 8.)

#### Módulos que alimentan a este

- Unidades de Producción (Cuadros, variedades del Ciclo, Marco de Plantación).
- Almacén (catálogo, stock).
- Equipos y Maquinaria (tractores, implementos, drone).

#### Módulos que reciben información de este

- Almacén (consumo, movimientos, pendientes de compra).
- Nómina (mano de obra).
- Compras (pendientes automáticos).
- Equipos y Maquinaria (Uso diario y combustible).
- Centros de Costo / Contabilidad.

#### Pendientes de este módulo

- Agregar la captura de gasolina de la planta de luz en la línea de Drone: la modalidad Drone ya existe, pero se construyó sin combustible.
- Verificar con Claude Code (no se mencionó en su reporte): Tipo de aplicación obligatorio; plazos de 15 días (liberación del apartado desde la fecha de inicio, aviso y cancelación del saldo desde la fecha fin); cierre por debajo de 100% solo Dirección General o Gerente Técnico; Asistentes Técnicos programan sin poder cambiar la dosis; el Supervisor programa Actividades pero no Aplicaciones ni Fertilizantes.
- Migrar las recetas viejas guardadas con Producto Comercial a Ingrediente Activo (script de una sola vez, con la relación que ya existe en Almacén).
- Mejoras de interfaz en Programar: el campo “+ Tipo nuevo” no debe estar siempre expandido; Fecha inicio y Fecha fin deben ir juntas.
- Probar con un rol distinto a Dirección General (ej. capturista) que el campo de dosis queda bloqueado.
- Precisar quién, además de Dirección General y Gerente Técnico de Producción, puede modificar productos ya autorizados.

### 9.8 Cosecha

#### Lógica establecida actual del módulo

- **Costeo**: el costo por cuadro no busca ser un costo absoluto aislado, sino permitir sacar un costo por hectárea efectiva comparable entre cuadros y a nivel rancho.
- Remolques de varios Cuadros: no hay báscula en el punto de cosecha, así que no se conoce la proporción exacta de fruta de cada Cuadro cuando un remolque junta varios Cuadros contiguos de la misma variedad. El remolque se registra asociado al conjunto de Cuadros que aportaron, y su costo se reparte entre ellos en proporción a sus hectáreas (Bloque 3).
- Un remolque contiene normalmente fruta de un solo cuadro, pero en cuadros contiguos de la misma variedad es común y deseable cosechar corrido sin dar la vuelta, mezclando fruta de varios cuadros en el mismo remolque. Cuando cuadros contiguos son de variedades distintas, sí se da la vuelta para no mezclar.
- El pago del remolque se reparte entre las personas que subieron a ese remolque ese día; la regla exacta de reparto se define al diseñar este módulo. Un Cuadro puede generar varios remolques.
- El equipo de corte no siempre se arma día a día — existen cuadrillas con nombre fijo y persistente (ej. “Corte G1”, “Corte G2”), que se reutilizan semana a semana aunque cambien los integrantes. El sistema soporta ambos casos: grupos con nombre persistente, y grupos armados el mismo día sin nombre fijo.
- **Rendimiento se lleva por Variedad**, no por Cuadro (ver Unidades de Producción, 9.1) — remolques totales por variedad entre la superficie sembrada de esa variedad.
- **Cuadros de prueba**: no se necesita trazabilidad de variedad hasta el remolque — se cosechan y venden en bloque como “Híbridos”.

#### Vistas o submódulos

- Captura de remolque (Cuadro(s) de origen, variedad, cuadrilla/grupo).

#### Lógica de entrada de información

- Remolque: Cuadro(s) de origen, tractor que lo jaló, personas que subieron, fecha, variedad y cantidad de fruta (sin báscula en el punto de cosecha).

#### Procesamiento de información

- Costo por hectárea efectiva acumulado por Cuadro.
- Rendimiento acumulado por Variedad.
- Reparto del pago del remolque entre los integrantes que subieron (regla por definir).

#### Salida de información

- Mano de obra (pago de remolque) → Nómina.
- Producción → Empaque (fruta que entra a línea).
- Rendimiento por Variedad y costo por Cuadro → Panel Ejecutivo / KPIs.

#### Personas/puestos involucrados y sus permisos

| Rol                            | Ver              | Capturar |
|--------------------------------|------------------|----------|
| Director General               | ✅               | ✅       |
| Supervisor de Cosecha          | ✅ (su rancho)   | ✅       |
| Encargado de Cosecha y Empaque | ✅ (todos)       | —        |
| Gerente Administrativo         | ✅ (consolidado) | —        |

#### Módulos que alimentan a este

- Unidades de Producción (Cuadros, Variedad).
- Equipos y Maquinaria (tractores que jalan remolques).

#### Módulos que reciben información de este

- Nómina (pago de remolque).
- Empaque (fruta cosechada).
- Panel Ejecutivo (KPIs de rendimiento y costo).

#### Pendientes de este módulo

- Diseño completo del módulo — no se construye pronto.

<!-- -->

- Regla de reparto del pago de remolque entre las personas, y del pago “Depende de Empacadores” (ver 9.11).

### 9.9 Empaque

*(El catálogo de Embarques y el de Clientes viven en la ficha de Embarques (9.10), no en Empaque.)*

#### Lógica establecida actual del módulo

- El costo de empaque (que no se puede rastrear a un cuadro específico) se **prorratea entre todas las hectáreas efectivas del rancho** y se suma al costo por hectárea ya acumulado de cosecha/cultivo.
- **No existe almacén/cámara de producto terminado** a mediano/largo plazo — la fruta se paletiza según sale de línea. Sí puede existir un saldo corto de cajas empacadas pendientes de embarcar de un día para otro, y **ese saldo necesita trazabilidad de variedad/cuadro de origen** — no es solo un conteo agregado.
- **Selección de destino de la fruta** (exportación / nacional / “1 Nacional” / merma) ocurre dentro de la línea de empaque, no en campo: se aparta la “1 Nacional”, la de exportación sigue en banda, los clientes nacionales seleccionan después ya afuera, lo que no se coloca se vuelve merma.
- Exportación y clientes grandes nacionales salen en camiones/tráilers, paletizados directo de línea o del saldo pendiente. “1 Nacional” sale en camionetas pequeñas, se pesa y factura por peso.
- Trazabilidad por variedad: no es un sistema formal de lotes, es un acuerdo operativo del día (“hoy cortamos variedad HP”).
- **Insumos de empaque** (cajas, pallets, materiales): sí se deben contabilizar como inventario/costo, para saber cuánto cuesta cada caja empacada (costo unitario real de empaque).

#### Vistas o submódulos

- Línea de empaque (captura de cajas producidas + destino).
- Saldo pendiente de embarcar (con trazabilidad de variedad).

#### Lógica de entrada de información

- Cajas producidas por día, variedad, destino (exportación/nacional/“1 Nacional”/merma).

#### Procesamiento de información

- Prorrateo del costo de empaque entre las hectáreas efectivas del rancho.
- Cálculo del saldo pendiente: cajas empacadas acumuladas − cajas ya embarcadas.
- Costo unitario real por caja empacada (incluye insumos de empaque).

#### Salida de información

- Costo por hectárea (prorrateado) → Centros de Costo.
- Saldo de cajas pendientes → Embarques.
- Mano de obra de empaque → Nómina.

#### Personas/puestos involucrados y sus permisos

| Rol                            | Ver              | Capturar |
|--------------------------------|------------------|----------|
| Director General               | ✅               | ✅       |
| Supervisor de Empaque          | ✅ (su empaque)  | ✅       |
| Encargado de Cosecha y Empaque | ✅ (todos)       | —        |
| Gerente Administrativo         | ✅ (consolidado) | —        |

#### Módulos que alimentan a este

- Cosecha (fruta que entra a línea).

#### Módulos que reciben información de este

- Embarques (saldo de cajas pendientes).
- Nómina (mano de obra de empaque).
- Centros de Costo/Contabilidad.

#### Pendientes de este módulo

- Diseño completo del módulo — no se construye pronto.

### 9.10 Embarques

*(Incluye Ventas y facturación, y el catálogo de Clientes.)*

#### Lógica establecida actual del módulo

- **Embarques es su propio centro de costo**, distinto de Empaque, pero ligado/trazable a lo que Empaque produce.
- **Saldo pendiente**: cajas empacadas acumuladas − cajas ya embarcadas = saldo disponible para el siguiente embarque (no se asume que todo lo empacado un día sale ese mismo día).
- **Confirmado: un embarque siempre es de un solo cliente** — nunca se consolidan varios clientes en un mismo camión.
- Seguimiento por embarque: cuánto se facturó a precio base al salir, cuánto ya vendido (liquidación real), total facturado final. La liquidación de la comercializadora del grupo puede tardar semanas variables (no un plazo fijo).
- Reconocido como la parte más compleja del lado comercial/logístico — se sientan las bases ahora, más adelante se buscará asesoría especializada para refinarla.

**Ventas y facturación:**

- Cliente: no siempre es la comercializadora del grupo — también hay clientes nacionales o de exportación adicionales. El esquema de “precio fijo inicial + liquidación posterior con comisión” aplica solo a las ventas con la comercializadora del grupo.
- Se factura a un precio fijo inicial por caja al embarcar; después, la liquidación posterior ajusta el ingreso según el precio real de venta menos la comisión.
- Se maneja venta en USD y MXN simultáneamente. Un embarque puede llevar mezcla de tamaños y calidades.

**Clientes:**

- Debe quedar abierto/flexible (no asumir un solo cliente fijo). Los clientes grandes son bastante fijos; los que más varían son los pequeños de mercado local. Las condiciones (precio, forma de pago, empaque) son bastante estándar entre todos, salvo la comercializadora del grupo.
- **No se necesitan cuentas por cobrar dentro del sistema** — eso lo maneja el área de cobranza aparte, decisión explícita de dejarlo fuera del alcance por ahora.
- Ventas — diseño futuro (no es cuentas por cobrar): cruzar cuánto se vendió cada tarima contra su costo real, para sacar la utilidad real y tener respaldo si hay un reclamo o descuento del cliente. El “Lote” de venta es una tarima. Ocurre semanas después de este módulo: la tarima sale del empaque hacia la comercializadora, y solo cuando la comercializadora vende la fruta se conoce el precio real y se le paga a la empresa. El protocolo completo (qué se captura, cuándo y quién) se diseña más adelante.

#### Vistas o submódulos

- Registro de embarque (cliente, cajas, destino).
- Liquidación de embarque.
- Catálogo de Clientes.

#### Lógica de entrada de información

- Por embarque: cliente (uno solo), cajas/variedad, precio base de facturación.
- Liquidación posterior: precio real de venta, comisión (si aplica comercializadora del grupo), ajuste.

#### Procesamiento de información

- Cálculo de saldo pendiente de cajas por embarcar.
- Cálculo de liquidación (ingreso inicial vs. ajuste final).
- Conversión USD/MXN (ver Contabilidad, 9.16, para el método contable exacto).

#### Salida de información

- Ingreso facturado y liquidado → Contabilidad.
- Ventas y facturación → Panel Ejecutivo.

#### Personas/puestos involucrados y sus permisos

| Rol                    | Ver              | Capturar | Editar/Autoriza          |
|------------------------|------------------|----------|--------------------------|
| Director General       | ✅               | ✅       | ✅                       |
| Gerente de Logística   | ✅ (todos)       | ✅       | ✅ (ventas, liquidación) |
| Gerente Administrativo | ✅ (consolidado) | —        | —                        |
| Contador               | ✅ (financiero)  | —        | —                        |

#### Módulos que alimentan a este

- Empaque (saldo de cajas disponibles).

#### Módulos que reciben información de este

- Contabilidad (ingresos, liquidaciones, USD/MXN).
- Panel Ejecutivo.

#### Pendientes de este módulo

- Diseño completo del módulo — no se construye pronto.
- Asesoría especializada en el proceso comercial/logístico de exportación.
- Precios de transferencia / tratamiento contable de la liquidación con la comercializadora del grupo — pregunta abierta con el contador, más matizada porque el cliente no es exclusivo.

### 9.11 Nómina

(Incluye Asistencia. Las líneas de mano de obra llegan en su mayoría automáticas desde los módulos operativos.)

#### Lógica establecida actual del módulo

#### Calendario semanal

- Periodo de Nómina: viernes a jueves. Corte: jueves. Retiro del efectivo del banco e impresión de sobres: viernes o sábado. Pago a la gente: sábado, en efectivo en el campo. Los viernes se hacen las transferencias y el pago de facturas a proveedores (Cuentas por Pagar, 9.14).
- El día de corte es un parámetro configurable por empresa. El Reporte de Nómina semanal usa ese periodo; es independiente del Cierre del día.

#### Esquemas de pago

- Hay 4 esquemas, definidos por actividad (no por persona):
  - \(1\) Individual por hora — la mayoría de las actividades de campo. Comparten una tarifa general por hora configurable; cada actividad tiene un interruptor “usar tarifa general” sí/no.
  - \(2\) Individual por caja — Empacador.
  - \(3\) Grupal por remolque, con Cuadro obligatorio — Cosecha (el único esquema que requiere Cuadro; los demás solo requieren Huerta).
  - \(4\) “Depende de Empacadores” — actividades de apoyo de empaque (ej. Pesador, Tapa Caja, Lavador, Descarga, Pasafruta, Selección, Selección Ayuda): se suman las cajas de todos los registros de Empacador ese día, se calcula la bolsa de cada actividad (cajas × tarifa) y se divide entre las personas de esa actividad ese día. Candado: si hay alguien en una de estas actividades pero ningún registro de Empacador ese día, se bloquea el guardado. Una misma persona puede ser Empacador y, el mismo día, alguna de estas actividades. Hoy se captura a mano en Nómina hasta que exista Empaque (9.9).
- No existe destajo por surco, por planta ni por Cuadro.
- Personal de nómina fija también puede hacer tareas pagadas aparte (por caja, por remolque, etc.): su bruto es sueldo fijo (cuando le toca cobrar) + lo ganado en esas tareas, siempre sumados completos — nunca se considera “ya incluido” en el sueldo.
- Tarifas: modificables en el tiempo con perfil autorizado; se guarda historial por fecha de vigencia (un cambio no altera periodos ya pagados).

#### Nómina fija y periodicidad

- Aplica a encargados, regadores y personal fijo o de confianza. Tiene un Puesto (periodicidad, rango salarial de referencia, método de asignación de costo) + sueldo individual.
- Periodicidades:
  - Semanal: se paga cada sábado.
  - Catorcenal: cada segundo sábado (26 pagos al año), contados a partir de una fecha de referencia (sábado de arranque en el Apéndice A).
  - Quincenal: 24 pagos al año, el sábado más cercano al día 15 y el sábado más cercano al fin de mes.
  - Mensual: cada persona trae configurado su día de pago — primer viernes del mes (paga el mes que empieza, por adelantado: el primer viernes de octubre paga octubre) o último viernes del mes (paga el mes que termina: el último viernes de septiembre paga septiembre). Se define al contratar y no se cambia después.
- El trabajador gana lo mismo en cualquier esquema: el sueldo individual de nómina fija se captura como sueldo anual, y el pago de cada periodo = sueldo anual ÷ número de pagos del esquema al año (semanal ÷ 52; catorcenal ÷ 26; quincenal ÷ 24; mensual ÷ 12).
- Forma de pago: efectivo o transferencia. La transferencia existe por ahora solo para personal mensual y requiere tener registrados banco, número de cuenta o CLABE y titular; el pago aparece en la lista de transferencias del viernes, junto con los proveedores. Un mensual en efectivo aparece en el Reporte de Nómina semanal de la semana en que cae su viernes de pago y se le entrega el sábado con el resto.
- Asignación de costo: directo a la Huerta (supervisores, tractoristas, riego) o prorrateado entre Huertas por hectáreas efectivas (personal administrativo).

#### Asistencia

- Personal fijo: no hay registro de asistencia como tal — se asume presente salvo vacaciones o descanso. Todos los puestos fijos siguen el mismo horario base.
- Basta con “vino/no vino” — no se necesita hora de entrada ni de salida.
- Existe la falta justificada (permiso, incapacidad, salida justificada): se captura en Ajustes de Asistencia (abajo). La falta injustificada se registra para consulta; el sistema queda preparado para activar el descuento automático más adelante (no activo todavía).
- Tira tipo calendario (L M M J V S) por persona, con color: verde = cumplió; rojo = falta injustificada; la falta justificada con su propio color; gris = sin registro todavía.
- Ajustes de Asistencia: pestaña donde se captura cualquier caso que el sistema no puede deducir solo (permisos, salidas justificadas, errores de captura conocidos): Persona + Fecha + Día completo (Sí/No) + Justificado (Sí/No) + nota. Si existe una fila para esa persona y fecha, reemplaza lo que el sistema hubiera calculado. La capturan Recursos Humanos y Supervisor de Huerta (este, solo de su UP). Alimenta el Bono de Asistencia, la Matriz de Asistencia y cualquier otro cálculo que necesite saber si un día cuenta.
- Dos vistas de asistencia: por persona (calendario semanal lunes a sábado de una persona a la vez) y Matriz de Asistencia (todas las personas contra todos los días, con los mismos colores de la tira de calendario, para revisar asistencias y resolver reclamos). La Matriz solo lee la captura diaria y Ajustes de Asistencia; no interviene en el cálculo del Bono de Asistencia.

#### Bonos

- Adicionales al pago base (asistencia, efectividad, lealtad, apoyo en domingo, día festivo o el día después). Tienen reglas objetivas, pero requieren autorización manual aunque el sistema los calcule.
- Estructura: Nómina → Bonos → \[bono\] → Configuración. Plantillas: (1) Asistencia perfecta semanal (detalle abajo); (2) Permanencia por racha — semanas consecutivas de asistencia perfecta; (3) Día doble en fechas específicas — si trabaja el día completo, se paga el doble o el multiplicador configurado.
- Bono de día especial (ej. domingo trabajado): se paga esa misma semana si ocurrió antes del corte; si fue muy cerca o después, la semana siguiente.
- **Bono de Asistencia Semanal:**
  - Semana del bono: el bono que se paga al cerrar una semana de Nómina corresponde a los días lunes a sábado de la semana calendario que contiene el viernes con que arranca ese periodo de Nómina. Ejemplo: Nómina del viernes 18 al jueves 24 de septiembre (pago el sábado 26) → el bono evalúa del lunes 14 al sábado 19 de septiembre. Por construcción, el viernes y sábado con que arranca el periodo cuentan a la vez para ese periodo de pago y para la semana del bono; no es un error. Se calcula siempre en automático a partir de la fecha real, nunca de una fecha capturada.
  - Cálculo en tiempo real: se recalcula cada vez que se agrega o edita una actividad; no hay botón de recalcular.
  - Día completo, por persona y por cada uno de los 6 días: sin registro → no completo; alguna actividad pagada por pieza ese día → completo; si no, se suman las horas del día contra el mínimo: tiempo completo 8 h entre semana y 5.33 h el sábado; medio tiempo 5.33 h entre semana y 4 h el sábado.
  - Ajustes de Asistencia tiene la última palabra sobre cualquier día.
  - Todo o nada: si cualquiera de los 6 días no cuenta y no hay ajuste que lo justifique, se pierde el bono completo.
  - Configuración por persona: lista de “nunca recibe bono” (se revisa primero), lista de monto especial y lista de medio tiempo. Monto default y monto especial editables sin tocar código (montos de arranque en el Apéndice A).
  - El bono aparece junto al pago de cada persona en el Reporte semanal. Al confirmar la semana se congelan los números (bono incluido) y se genera, junto con hojas de pago y sobres, una hoja de firma específica del bono.
  - Cada persona es un registro único del catálogo de Personal: nunca se identifica comparando texto.
  - Personal compartido con una empresa asociada: por ahora el 100% de cada bono se atribuye a esta empresa (reparto entre empresas pendiente, ver Pendientes).

#### Préstamos y anticipos

- Aplican a cualquier persona. Alta: monto total, motivo, periodicidad del descuento (semanal o quincenal), monto por descuento y fecha del primer descuento. El sistema lleva saldo e historial. Antes de aplicar los descuentos de la semana, exige revisar y confirmar.
- Visibilidad: el descuento solo se ve en el neto a pagar del Reporte de Nómina semanal (Dirección General y Gerencias), nunca en Resumen semanal ni en Cierre del día.
- En la tabla de préstamos, cada fila muestra con color si el descuento del periodo actual está pendiente, o apagada si ya se aplicó. Picar una fila ya aplicada pregunta si se quiere adelantar el descuento del siguiente periodo (“¿Quieres descontar \$X a \[persona\] correspondiente a \[periodo\]?”), con Cancelar o Confirmar.

#### Captura del día

- Se pre-llena con quién trabajó y en qué el día anterior; solo se captura la cantidad nueva. Una persona puede tener varias actividades el mismo día y en distintas Huertas (la Huerta va por línea de actividad).
- Es una pantalla de resumen por persona + ajustes puntuales: la mayoría de las tareas de campo llegan automáticas desde Actividades, Aplicaciones, Fertilizantes y Riego. Se conserva la captura directa para excepciones, correcciones y tareas sin módulo propio.
- Estructura: una tarjeta por persona; dentro, una o más líneas de actividad (Huerta + Actividad + Cantidad). “+ Otra actividad” agrega una línea a esa persona; “+ Agregar persona” agrega una tarjeta; hay botón para quitar una línea (toda persona queda con al menos 1 actividad) y para quitar una tarjeta completa.
- Filtrado por rol sin selector de Huerta: el Supervisor solo ve a las personas de su UP; los roles multi-rancho ven la vista “Todas UPs”.
- Nota gris de monto bruto acumulado del día por persona, en vivo, solo informativa (sin descuento de préstamo).
- **“+ Nueva persona (aún no dada de alta)”:** da de alta a la persona sin salir de la pantalla (como eventual, mismo proceso que Recursos Humanos, 9.12). Queda activa de inmediato y su día se registra normal; su costo cuenta para la Huerta desde la captura, porque el trabajo fue real. Lo único que espera es el pago: no sale en el cierre de semana hasta que Recursos Humanos autoriza el alta; si pasa una semana sin autorizar, lo ganado se acumula para la siguiente. Mientras tanto se muestra con el color de “pendiente de autorización” (Bloque 5).
- Grupos de Pago (cuadrillas): catálogo global, no ligado a ninguna Huerta (hay cuadrillas que se mueven entre Huertas), en su propia pestaña de Nómina. Se pueden crear sobre la marcha o reutilizar uno con nombre fijo (ej. “Corte G1”).
  - Al usar un grupo con nombre, sus integrantes aparecen como checklist editable ese día: se desmarca a quien faltó y se agrega un sustituto (cualquier persona activa), solo para ese día.
  - Quien se agrega 3 días seguidos, al 4to ya es integrante fijo; quien se desmarca 3 días seguidos, al 4to sale del grupo — salvo que tenga falta justificada registrada.
  - Quien faltó no cobra ese día; el sustituto entra al reparto como uno más; si nadie sustituyó, el pago se reparte entre quienes sí trabajaron.

#### Registro automático de mano de obra desde otros módulos

- Cuando Actividades, Aplicaciones, Fertilizantes, Riego (Tirar 2da Cintilla), Cosecha o Empaque reportan trabajo, la mano de obra entra directo a Nómina, sin volver a capturarse.
- Aparece en Captura del día y en Cierre del día marcada como automática (color o etiqueta distinta) y bloqueada para edición directa desde Nómina, sin excepción de rol.
- Si el día ya se cerró, lo que llegue después de otros módulos para esa Huerta y ese día ya no entra solo: se captura como caso extraordinario con autorización de Encargado de Nóminas, Director General o Gerente Administrativo.
- Candado de consistencia entre módulos: un registro de origen (Actividades, Aplicaciones, Fertilizantes, Riego) se puede editar mientras su Huerta/fecha no tenga el día cerrado en Nómina; si ya está cerrado, se bloquea también en el módulo de origen.

#### Cierre del día

- Cada día, por Huerta, se cierra para bloquear ediciones posteriores (distinto del cierre contable, Bloque 6).
- Periodo de gracia configurable (default 3 días) para cerrar días pasados sin autorización especial. Pasado el plazo, el día queda “vencido” y solo Dirección General o Gerencia pueden cerrarlo.
- Alerta automática un día antes del corte semanal, con cuántos días quedan pendientes de cerrar.
- En dos pasos: (1) Resumen — una fila por Huerta con número de personas, total de actividades y total a pagar bruto; (2) Detalle — al picar una Huerta, el detalle por persona (actividades, tiempo o unidades, monto bruto) y hasta abajo el botón “Cerrar día”.
- Vista “Todas UPs” en Captura y Cierre (tarjeta por Huerta, con filtro por Huerta): la ven Director General, Recursos Humanos, Encargado de Nóminas, Gerente Administrativo, Contador y Gerente Técnico de Producción. El Supervisor ve solo su UP.
- Edición: antes de cerrar, el Supervisor edita sus capturas manuales. Después de cerrar, solo Director General, Recursos Humanos, Encargado de Nóminas y Gerente Administrativo, desde un listado navegable de días cerrados. Al editar, se recalcula todo lo que depende del valor (bruto, costo de Cuadro/Huerta).

#### Reporte de Nómina semanal e historial

- Neto a pagar = bruto + bonos − descuentos de préstamo.
- Navegación con flechas “\< semana anterior / semana siguiente \>” hasta 12 semanas atrás, con la misma vista “Todas UPs” / por Huerta.
- “Confirmar semana” marca la semana como pagada: desde ese momento es solo lectura para todos, sin excepción; se pueden volver a descargar sus sobres dentro de las 12 semanas.
- Detalle semanal por persona: al picar el nombre se abre su semana agrupada por día — fecha, Huerta, actividad, horas o cantidad, monto bruto, origen (automático o manual) y quién capturó; subtotal por día y total de la semana, en todas las Huertas aunque el reporte esté filtrado. Solo consulta. Lo ven Dirección General, Gerencias y Encargado de Nóminas.

#### Sobre y desglose de efectivo

- Sobre en PDF: una hojita por persona de 9 × 15 cm, 3 por hoja carta horizontal, con recuadro de separación; muestra el total ganado por día (6-7 días), subtotal, bonos, descuentos y total.
- Redondeo del sobre: el neto a pagar se redondea siempre hacia arriba al peso entero — en la Nómina semanal y en Liquidaciones —; ese neto redondeado es el que se registra como pagado (única excepción a la regla de no redondear, Bloque 6).
- Desglose de billetes y monedas con el mínimo de piezas (algoritmo que toma siempre la denominación más grande que quepa): por persona y total por denominación para pedir en el banco.
- Prestadores de servicio externos (electricista, técnico, consultor) no son nómina: se manejan como Proveedores (9.14).

#### Vistas o submódulos

- Captura del día.
- Cierre del día (por Huerta).
- Asistencia (tira de calendario, Matriz de Asistencia y Ajustes de Asistencia).
- Préstamos y anticipos.
- Bonos (con su Configuración).
- Grupos de Pago (cuadrillas).
- Reporte de Nómina semanal (con historial y detalle por persona).
- Sobre en PDF y desglose de efectivo.
- Liquidaciones.
- (Accesos y usuarios vive en Configuración, ver 9.12.)

#### Submódulo: Liquidaciones

- Pago fuera del ciclo semanal para personal eventual que deja de venir a mitad del periodo. Se activa bajo demanda. No aplica a nómina fija.
- Antes de liquidar, el sistema obliga a cerrar los días pendientes de esa persona.
- Captura: persona(s) y rango de fechas — normalmente del día siguiente al último cierre de Nómina (que es a nivel empresa, no por Huerta) al último día trabajado. Los días trabajados se toman de lo ya capturado en todos los módulos.
- Bonos: se evalúan las mismas plantillas sobre el rango corto.
- Préstamos pendientes: alerta explícita para descontarlos de este pago.
- Sobre en PDF: se imprime el mismo día que se liquida, mismo formato.
- No dispara la Baja en Recursos Humanos (paso aparte, manual) ni afecta al Grupo de Pago.
- Permisos: Director General, Recursos Humanos, Encargado de Nóminas.

#### Lógica de entrada de información

- Captura diaria: persona + actividad + cantidad + Huerta (+ Cuadro si el esquema lo requiere).
- Alta de préstamo, configuración de bonos, Ajustes de Asistencia, forma de pago y cuenta bancaria del personal mensual.

#### Procesamiento de información

- Sueldo del día según el esquema de pago de la actividad; bonos según sus plantillas; descuentos de préstamo; neto semanal; desglose de efectivo.

#### Salida de información

- Costo de mano de obra → Centros de Costo / Contabilidad, por Huerta y Cuadro (reparto del Bloque 3).
- Reporte de Nómina semanal → Contabilidad, Panel Ejecutivo.
- Transferencias del personal mensual → lista de pagos del viernes.
- Sobre en PDF.

#### Personas/puestos involucrados y sus permisos

| Rol                           | Ver                           | Capturar                    | Editar | Autoriza              |
|-------------------------------|-------------------------------|-----------------------------|--------|-----------------------|
| Director General              | ✅                            | ✅                          | ✅     | ✅                    |
| Recursos Humanos              | ✅                            | ✅                          | ✅     | ✅ (alta de personal) |
| Encargado de Nóminas          | ✅                            | ✅                          | ✅     | —                     |
| Gerente Administrativo        | ✅                            | —                           | ✅     | —                     |
| Contador                      | ✅                            | ✅                          | —      | —                     |
| Gerente Técnico de Producción | ✅ (por rancho, solo lectura) | —                           | —      | —                     |
| Asistente Administrativo      | ✅                            | ✅ (sin editar confirmados) | —      | —                     |
| Supervisor de Huerta          | —                             | ✅ (Captura del día, su UP) | —      | —                     |

#### Módulos que alimentan a este

- Actividades, Aplicaciones, Fertilizantes, Riego (Tirar 2da Cintilla), Cosecha, Empaque — mano de obra automática.
- Unidades de Producción (Huerta/Cuadro de cada registro).
- Recursos Humanos (Personal, autorización de altas).

#### Módulos que reciben información de este

- Centros de Costo / Contabilidad.
- Compras / Cuentas por Pagar (transferencias del viernes).
- Panel Ejecutivo.

#### Pendientes de este módulo

- Probar de punta a punta “Confirmar semana” con el bono y descuentos de préstamo reales la primera vez que se cierre una semana real.
- Validar dos decisiones que tomó Claude Code al construir: (1) el sueldo individual se reinterpretó como sueldo anual — confirmar cómo quedaron los sueldos que ya estaban capturados; (2) la fecha de referencia del esquema catorcenal (sábado 3-ene-2026).
- Verificar con Claude Code que la periodicidad quincenal paga el sábado más cercano al día 15 y el más cercano al fin de mes (no se mencionó en su reporte).
- Definir qué pasa con faltas y bajas cuando el pago mensual es por adelantado (primer viernes).
- Definir el reparto de pagos grupales (remolque, “Depende de Empacadores”) al diseñar Cosecha y Empaque.
- Definir cómo se capturan “Bono, Despensa y Tortilla”: prestación fija semanal del Excel de referencia que no encaja en los Bonos actuales (no es persona ni actividad).
- Definir cómo se reparte el bono con la empresa asociada que comparte personal (y si esa empresa se maneja como una o varias Huertas).
- Blindar el servidor para aceptar cantidad como texto numérico y cuadroId nulo al guardar Captura del día, para que un cliente distinto a la web no falle.

### 9.12 Recursos Humanos

#### Lógica establecida actual del módulo

- **Datos por tipo de trabajador**: nómina fija/puestos formales — nombre completo, fecha de nacimiento, identificación, domicilio, teléfono, teléfono de emergencia, fecha de ingreso, puesto, RFC, IMSS o seguro privado, tipo de esquema. Personal eventual/destajo — versión ligera: nombre, fecha de nacimiento, residencia, teléfono, contacto de emergencia, fecha de ingreso.
- **Documentos digitales** (identificación, contrato, comprobante domicilio): se podrán subir en dos formas — foto desde celular en campo, o escaneados desde computadora — ambas disponibles.
- **Bajas y control de contrataciones**: al dar de baja, el sistema pide motivo obligatorio; se guarda el motivo y quién dio de baja.
- Lista de no contratar: la administra Recursos Humanos; la ve el Supervisor de Huerta (solo esta lista, no el resto del módulo) y muestra las condiciones de salida a los niveles gerenciales.

<!-- -->

- Externos: prestadores de servicio (electricista, técnico, consultor) se manejan en Proveedores (9.14), no en Personal.
- Alta desde campo: una persona dada de alta desde Captura del día con “+ Nueva persona” queda activa de inmediato y puede trabajar, pero queda pendiente de autorización de Recursos Humanos, que revisa y completa sus datos. Hasta que se autoriza, su pago no sale en el cierre de semana (ver 9.11) y se muestra con el color de “pendiente de autorización”.
- Accesos y usuarios: pantalla en Configuración para administrar quién tiene cuenta en el sistema y con qué rol — concepto separado del catálogo de Personal (no toda persona que trabaja tiene cuenta). La administran Dirección General y Encargado de Sistemas.
- Personal mensual con pago por transferencia: se registran banco, número de cuenta o CLABE y titular (ver 9.11).

#### Vistas o submódulos

- Catálogo de Personal.
- Lista de no contratar.

<!-- -->

- Altas pendientes de autorización (personas dadas de alta desde campo).

<!-- -->

- Documentos digitales.

#### Lógica de entrada de información

- Alta de persona con los campos según su tipo (fijo/eventual).
- Baja con motivo obligatorio.

#### Procesamiento de información

- No hay cálculos propios de este módulo — los cálculos de pago viven en Nómina (9.11).

#### Salida de información

- Catálogo de Personal → Captura del día en Nómina y selección de personas en todos los reportes de avance.
- Autorización de altas → liberación del pago en Nómina.

#### Personas/puestos involucrados y sus permisos

| Rol                    | Ver                        | Capturar | Editar | Autoriza  |
|------------------------|----------------------------|----------|--------|-----------|
| Director General       | ✅                         | ✅       | ✅     | ✅        |
| Recursos Humanos       | ✅                         | ✅       | ✅     | ✅ (alta) |
| Gerente Administrativo | ✅                         | —        | ✅     | —         |
| Supervisor de Huerta   | ✅ (solo Do-not-hire list) | —        | —      | —         |

#### Módulos que alimentan a este

- Nómina (altas hechas desde Captura del día, pendientes de autorización).

#### Módulos que reciben información de este

- Nómina, Actividades, Aplicaciones, Fertilizantes, Riego, Vivero, Cosecha, Empaque (selección de personal en captura).

#### Pendientes de este módulo

- Ninguno.

### 9.13 Equipos y Maquinaria

(Incluye Tractores, Implementos, Camionetas, Motobombas, Plantas de luz, Mantenimiento y Combustible.)

#### Lógica establecida actual del módulo

- Ficha de equipo: folio único + marca, modelo, año (placas si aplica). Dos series de folio: AF (Activo Fijo) para tractores, camionetas, remolques, motobombas y plantas de luz, e IA (Implemento Agrícola) para implementos. Los implementos se intercambian entre tractores. Motobombas y plantas de luz no llevan horómetro ni odómetro. El inventario de arranque está en el Apéndice A.
- Operador designado: campo opcional, solo para equipos AF (operador por defecto). Camionetas y equipo grande siempre lo llevan; tractores pequeños no necesariamente (el operador varía, sobre todo en cosecha). No aplica a implementos — el servidor lo rechaza.
- Rancho actual: cada tractor tiene un campo “Rancho actual” que solo cambia con un Traslado (abajo).
- Implementos llevan su propio conteo de horas de uso, tomado de las horas del tractor que los jaló.

#### Combustible — de dónde sale y a dónde se carga

- El diésel de tractores y la gasolina de motobombas y plantas de luz se surten en garrafas: el combustible entra al Almacén Central, sale en garrafa al Almacén Local del rancho (en ese momento se carga a la Huerta, como cualquier producto) y cada relleno lo descuenta del Almacén Local.
- Combustible de trabajo en campo → baja a Cuadros (Bloque 3):
  - Tractor: el tanque está lleno al iniciar el día. Al terminar cada avance (Actividades, Aplicaciones, Granular) — o al cambiar de implemento — se rellena el tanque y se capturan en ese avance los litros con foto. Si el mismo tractor hace dos avances en el día, cada uno lleva su propio relleno.
  - Planta de luz del drone: el drone trabaja con baterías que se cargan con una planta de luz de gasolina; al final de cada avance de Aplicación con drone se captura la gasolina que se le echó a la planta de luz (pendiente de construir, ver Pendientes).
  - Motobomba de Fertirriego: una fija por rancho, solo se usa al inyectar. Su gasolina se reporta ligada al Fertirriego del día (ver 9.6).
  - Cada relleno indica qué combustible (producto), litros y foto; descuenta del Almacén Local del rancho al precio del lote del que sale (9.15). Si el Almacén Local no tiene suficiente combustible, el relleno se bloquea. Si se edita el reporte de avance, el relleno se ajusta con él.
- Combustible indirecto (no baja a Cuadro): camionetas y Traslados de tractor entre ranchos.

#### Traslado de tractor

- Protocolo: al terminar el trabajo en un rancho, el tractor se rellena (queda en el avance) y sale con el tanque lleno. Al llegar al otro rancho, antes de empezar a trabajar, se rellena lo que gastó en el camino y se registra el Traslado.
- El Traslado registra: fecha, tractor, rancho origen, rancho destino y litros del relleno al llegar, con foto. Lo registra el Supervisor de Huerta del rancho destino.
- El combustible del Traslado es gasto indirecto de la empresa y no entra al consumo por hora de ningún avance.
- Al registrarse, cambia el “Rancho actual” del tractor. Si en un avance se elige un tractor cuyo Rancho actual es otro, el sistema avisa y pide registrar primero el Traslado.
- El historial de Traslados de cada tractor es la bitácora de dónde ha estado.

#### Consumo y alerta

- Indicadores de consumo por equipo: tractor — litros por hora y litros por hectárea; planta de luz del drone — litros por hectárea; motobomba — litros por hectárea fertirrigada; camioneta — kilómetros por litro.
- Cada equipo se compara contra su propio promedio histórico (cada motor gasta distinto), que se va actualizando con cada reporte: es un modelo que aprende con el uso. Al arrancar, con poco historial, es normal que salgan alertas desde los primeros reportes.
- Alerta cuando un reporte supera el promedio del equipo por más del margen configurado (20% de arranque, editable en Configuración). La reciben Dirección General, Gerente Técnico de Producción y el Supervisor de Huerta del rancho. Ejemplo: si la motobomba de un rancho gasta normalmente X litros por hectárea fertirrigada y un día gasta más de X + 20% por hectárea, no cuadra.

#### Camionetas

- La mayoría usa gasolina y carga en gasolineras externas (a crédito o con reembolso al operador); algunas usan diésel y también cargan en gasolinera. Su combustible es gasto indirecto.
- Por cada carga: odómetro, tipo de combustible (Magna, Premium o Diésel), litros, precio por litro y total — con dos de los tres últimos, el sistema calcula el tercero. Validación dura: el odómetro nunca baja (bloquea).

#### Reporte rápido de cargas de combustible

- Pantalla rápida en móvil; primero se elige el destino: Unidad o Garrafa.
- Carga a Unidad (camioneta): si la persona es Operador designado de una sola camioneta, se selecciona sola; si de varias, elige. Odómetro obligatorio (foto del tablero o a mano). Foto del ticket obligatoria, guardada con la carga; los datos se capturan a mano (la lectura automática del ticket es a futuro).
- Carga a Garrafa: mismos datos, sin camioneta ni odómetro. Genera una Entrada al Almacén Central del combustible con su precio, sin pasar por Compras y sin motivo obligatorio (flujo rutinario). Después sale al rancho por el flujo normal.
- Quién trae camioneta: el Operador designado de cada ficha. Si la persona ya tiene otro rol, se le suma el acceso a las cargas de su camioneta; si no tiene ninguno, se le da el rol Operador (Bloque 8).

#### Mantenimiento

- Esquema preventivo configurable: al dar de alta un equipo se agregan libremente conceptos de servicio con su umbral de horas (ej. “Filtro de diésel – 500 horas”). También correctivo, por mecánico interno o taller externo.
- Refacciones en catálogo separado del Almacén (mismo espacio físico, otro encargado, ver 9.15).
- El mantenimiento y las refacciones son gasto indirecto de la empresa (los tractores trabajan en varios ranchos), no bajan a Cuadro. La depreciación la maneja el contador aparte.
- El mecánico de planta es nómina fija; su tiempo se carga como gasto general de Maquinaria.

#### Uso diario

- Se alimenta en automático de las líneas de tractor de los avances de Actividades, Aplicaciones y Granular (tractor, operador, implemento, horas, rancho, relleno) y de las horas de las líneas de Drone — nunca se captura dos veces. Camionetas no capturan uso diario a detalle.

#### Vistas o submódulos

- Catálogo de equipos.
- Combustible: rellenos por avance, cargas de camioneta y garrafa, alerta de consumo.
- Traslados de tractor (bitácora).
- Mantenimiento (conceptos de servicio, correctivo).
- Uso diario de tractores.

#### Lógica de entrada de información

- Alta de equipo: tipo, folio (AF/IA automático), marca, modelo, año, operador designado (AF).
- Relleno en cada avance: litros + foto. Carga de camioneta o garrafa: ver Reporte rápido.
- Traslado: tractor, rancho origen, rancho destino, fecha, litros al llegar + foto.
- Mantenimiento: concepto de servicio con umbral de horas, o evento correctivo.

#### Procesamiento de información

- Rendimiento de consumo por equipo contra su promedio, con alerta por margen.
- Reparto del combustible de cada avance a Cuadros (Bloque 3).
- Actualización del Rancho actual con cada Traslado.
- Validación dura de odómetro creciente.

#### Salida de información

- Combustible de trabajo en campo → Cuadros (Centros de Costo).
- Combustible de camionetas y Traslados, mantenimiento → Indirectos.
- Alertas de consumo → Notificaciones.

#### Personas/puestos involucrados y sus permisos

| Rol                           | Ver                 | Capturar                                                      | Editar |
|-------------------------------|---------------------|---------------------------------------------------------------|--------|
| Director General              | ✅                  | ✅                                                            | ✅     |
| Gerente de Mantenimiento      | ✅ (global)         | ✅                                                            | ✅     |
| Mecánico                      | ✅ (pendientes)     | ✅ (resoluciones, piezas)                                     | —      |
| Gerente Técnico de Producción | ✅                  | ✅ (tractores/implementos)                                    | —      |
| Supervisor de Cosecha         | ✅ (su rancho)      | ✅ (tractores/implementos)                                    | —      |
| Supervisor de Huerta          | ✅ (su UP)          | ✅ (pide servicio, rellenos en sus avances, recibe Traslados) | —      |
| Regador                       | ✅ (su UP)          | ✅ (gasolina de la motobomba)                                 | —      |
| Operador                      | ✅ (solo lo propio) | ✅ (cargas de su camioneta y a garrafa)                       | —      |

#### Módulos que alimentan a este

- Actividades, Aplicaciones y Fertilizantes (líneas de tractor y rellenos), Riego (gasolina de motobomba).
- Almacén (combustible en Almacén Central y Local).

#### Módulos que reciben información de este

- Actividades, Aplicaciones y Fertilizantes (selección de equipo y validación del Rancho actual).
- Almacén (descuento de combustible).
- Centros de Costo / Contabilidad.
- Notificaciones (alertas de consumo).

#### Pendientes de este módulo

- Construir el Reporte rápido de cargas de combustible (camionetas y garrafa) y el rol Operador.
- Agregar la gasolina de la planta de luz en los avances con Drone (ver 9.7).
- Verificar con Claude Code (no se mencionó en su reporte): que la alerta de consumo llegue como Notificación a Dirección General, Gerente Técnico de Producción y Supervisor del rancho, y que el sistema avise si se usa un tractor cuyo Rancho actual es otro.
- Definir: forma de pago de la carga de camioneta (crédito o reembolso, y a dónde llega el reembolso) y quién puede cargarle a una camioneta que no tiene asignada.

### 9.14 Compras

*(Incluye el catálogo de Proveedores.)*

#### Lógica establecida actual del módulo

- Catálogo de Proveedores: no es fijo — se cotiza cada vez con quien dé mejor precio. Al dar de alta un proveedor se capturan crédito, datos de facturación y Zona (ver “Catálogo de Zonas y flete”). Dentro de Proveedores hay un panel “Zonas (flete)” con la lista completa editable (crear, editar, activar/desactivar).
- **Precisión del campo de crédito**: “días de crédito” es un **término general por Proveedor** (ej. “15 días de crédito”), no algo que se define orden por orden — se captura una sola vez al dar de alta o editar el Proveedor, y aplica automáticamente a todas sus órdenes.
- El listado del Comparador no muestra los productos cuya compra ya está completa; una casilla permite volver a verlos.
- El sistema NO compara precios en tiempo real — pero sí muestra un histórico de precios de los mejores 3 proveedores anteriores por producto, alimentado directamente de las órdenes de compra ya formalizadas.

#### Submódulo: Cuentas por Pagar (CxP)

Vive dentro de Compras por ahora (abierto a moverse a Contabilidad, 9.16, cuando ese módulo se construya).

- **Cálculo de fecha de pago**: fecha en que se **formaliza la orden de compra** + días de crédito del Proveedor = fecha límite de pago.
- Monto de la CxP — sin flete: lo que se debe al Proveedor es solo el precio de los productos (cantidad × precio unitario). El flete lo cobra un tercero (transportista), se paga aparte sin días de crédito ni CxP formal, y su costo viaja con el producto hasta la Huerta: se captura por orden y se reparte por kilo entre los productos de esa orden (ver Bloque 3, Flete). Al recibir una orden que vino con flete, aparece la alerta en el panel de Compras y de Dirección General para capturar el costo real.
- Ciclo de pago a Proveedores: semanal, los viernes — el día de transferencias y facturas pendientes, que incluye también las transferencias del personal mensual (9.11). La nómina en efectivo se paga el sábado.
- **Alerta con anticipación**: una orden que vence para pagarse el viernes se vuelve visible **desde el miércoles anterior**, dando tiempo de programar el pago antes de que llegue la fecha.
- **Visibilidad**: aparece dentro de Compras, y también se replica en el módulo de **Notificaciones** (ver bloque 6, Notificaciones) filtrado según los permisos del puesto que la está viendo.

**Dos orígenes de una orden de compra:**

- Automáticas: se generan solas cuando una programación de Aplicaciones, Fertilizantes o Vivero necesita más producto del que hay en Almacén — no bloquean la programación y no requieren autorización adicional, sin importar quién programó (Dirección General, Gerente Técnico de Producción, Asistente Técnico de Producción o Ingeniero de Vivero).
- Manuales: solicitudes libres, no ligadas a una programación (empaque, limpieza, herramientas, refacciones, etc.), con Título obligatorio y uno o varios productos del catálogo de Almacén. Requieren autorización de Dirección General o Gerente Administrativo; el Gerente Técnico de Producción autoriza solo las de producto para la planta. Todo producto para la planta debe estar autorizado antes de poder comprarse — el catálogo de la solicitud no deja elegir uno sin autorizar. Destino obligatorio: el Centro de Costo al que va la compra (Huerta — especificando cuál —, Vivero, Oficina/Administración, Empaque, Laboratorio, Bodega, etc.). Lo comprado para Vivero entra a su Almacén Local (9.3).
- Editar una solicitud manual — con reautorización condicional: pueden editarla tanto quien la creó (el Solicitante) como la persona de Compras — Compras puede editar directo, sin pasar por el Solicitante, por si hace falta una corrección física y se comunica con la persona directamente (fuera del sistema).
  - **Reautorización:** si la solicitud ya estaba autorizada y se edita CANTIDAD o PRODUCTO, la autorización se reinicia — hay que volver a pedirla. Editar el Título o una nota NO reinicia la autorización (no cambia el costo ni qué se compra).

  - **Trazabilidad — no se borra nada:** se debe ver quién la creó originalmente Y quién la editó después (con fecha) — el creador original nunca se sobrescribe ni se pierde de vista, aunque alguien más la haya modificado.

**Ciclo completo de una orden**: *(pendiente de autorizar, solo si es manual)* → pendiente de cotizar → se consulta el histórico de los 3 mejores proveedores, se cotiza por fuera del sistema, se formaliza la orden (proveedor, cantidad, precio unitario, fecha esperada) → la orden queda “en camino”, con vista para ver/descargar (imprimible) → Almacén la recibe (captura cantidad real recibida, lote/caducidad si aplica), lo que genera la entrada real al inventario → **si la orden estaba ligada a una Aplicación en espera, se aparta sola para esa Huerta en cuanto se recibe**, sin que nadie tenga que hacerlo a mano.

- Tope de autorización para compras manuales: por ahora no existe tope — toda compra manual requiere la autorización descrita arriba, sin importar el monto, y el Encargado de Compras no autoriza. Si en el futuro se define un tope (y su monto por área, oficina vs. campo), aplicará el patrón propone/autoriza: por debajo, el Encargado de Compras formaliza solo; por arriba, Gerencia o Dirección.

#### Submódulo: Comparador de Cotizaciones

Este Comparador es el paso de “Cotizar” del ciclo formal de Compras: de aquí sale la orden de compra real. Aplica a todas las categorías de producto; el cálculo de flete por Zona importa sobre todo en insumos para la planta — en productos que se compran siempre localmente, la Zona queda como la del comprador con flete \$0.

Construido: motor de cálculo, captura asíncrona línea por línea, historial permanente de precios, etiqueta “(mejor precio)”, generación de órdenes con compra parcial (una orden por proveedor) y Datos de Facturación y Firmas en Configuración. Pendiente: descargar de una vez los PDFs de todas las órdenes generadas.

**Fuente única de cantidades:** cada producto a comparar (nombre, unidad, cantidad necesaria) vive en un solo lugar — la lista de compra ya generada por el sistema (Almacén/planeación) — y todo lo demás la consulta, para que nunca se dupliquen ni desincronicen cantidades entre proveedores cotizados.

**Captura por producto, con líneas de proveedor debajo (más amigable que el Excel original, que repetía Producto/Cantidad/Unidad en cada fila):**

- Se elige el Ingrediente Activo de la lista (ya trae su cantidad necesaria y unidad). El Producto Comercial se elige más abajo, por línea de proveedor.

- Debajo, se agregan las líneas de cotización — una por Proveedor — sin repetir el Producto en cada una. Cada línea captura:

  - Proveedor y Zona — Zona se precarga sola desde el alta del Proveedor (antes se capturaba aquí cada vez), editable por si ese envío en particular viene de otro lado (catálogo abierto de Zonas — ver más abajo).

  - Producto Comercial: lista desplegable de los Productos Comerciales YA dados de alta en Almacén (9.15) para ese Ingrediente Activo — solo aparecen el preferido y los sustitutos autorizados, filtrados automáticamente. Muestra Nombre Comercial + Marca juntos para identificarlo (la Marca ya vive en el catálogo de Almacén se jala de ahí, no se vuelve a capturar). El Proveedor NO tiene que estar vinculado de antemano a ninguna Marca — es un catálogo global, cualquier Proveedor puede vender cualquier Producto Comercial ya registrado. Precarga automática: si ya cotizaste este mismo Ingrediente Activo con este mismo Proveedor antes, el selector viene preseleccionado con el Producto Comercial que usaste la última vez (editable por si cambió). El PDF de la Orden, la tarjeta “En Camino”, la Cuenta por Pagar y el histórico del proveedor muestran siempre el Producto Comercial que de verdad se le compró al proveedor, no el de la solicitud original. El encabezado del Comparador muestra el Ingrediente Activo.

  - Moneda: **MXN o USD** — si es USD, se captura Precio USD + Tipo de Cambio de esa cotización específica (capturado a mano cada vez, no un valor compartido del sistema: cada proveedor puede manejar un tipo de cambio distinto).

  - Presentación: tamaño del bulto/costal/bidón que vende ese proveedor, en la misma unidad del producto.

**Cálculo automático del sistema, por línea de proveedor:**

- Precio unitario (por kg/L), a partir del precio de la presentación y su tamaño.

- Unidades a comprar, redondeando siempre hacia arriba a presentaciones completas (igual que antes).

- Excedente y % Excedente — cuánto sobra por comprar en presentaciones completas. Si el % Excedente pasa del umbral configurado (20% de arranque), se marca “⚠ REVISAR”. El umbral es un parámetro único del sistema que se edita en Configuración, no un campo de la cotización.

- Flete total, según la Zona del proveedor: cantidad comprada × costo de flete \$/kg de esa Zona. Para el flete, 1 litro cuenta como 1 kg (misma equivalencia que el reparto del flete real, Bloque 3). En inventario, dosis y todo lo demás, litros y kilogramos se mantienen separados.

- Total con flete: precio de las presentaciones completas + flete total. Sirve para comparar y elegir (Global vs. Local); no es lo que se registra en la CxP al proveedor. El flete real se captura por orden al recibir (Bloque 3).

**"Total sin flete" visible también (aunque el proveedor sea foráneo):** se agrega como su propia columna/dato junto a "Flete" y "Total con flete" — Precio/unidad × Cantidad comprada, antes de sumar el flete. Sirve para ver de un vistazo cuánto es el costo del producto en sí (lo que se registra en la CxP al proveedor) separado de cuánto es puro flete, sin tener que restar a mano.

Precisión: el precio en USD se captura con todos los decimales de la factura, y ningún precio convertido se redondea antes de multiplicar por la cantidad (Bloque 6).

**Catálogo de Zonas y flete (Zona reubicada desde el Comparador):**

- Catálogo abierto (botón “+”) de Zonas con su costo de flete estimado \$/kg, editable por Zona. Cada Proveedor tiene su Zona guardada y se precarga al cotizar. La Zona del comprador siempre tiene flete \$0. Este flete estimado solo sirve para comparar; el costo real del flete se captura en cada orden (Bloque 3).

**Salida final — dos recomendaciones lado a lado, por producto (reemplaza el diseño anterior de una sola recomendación):**

- Mejor opción Global (considerando flete): el proveedor con menor Total con flete, sin importar su Zona.

- Mejor opción Local (Zona del comprador, sin flete): el proveedor con menor precio dentro de la Zona del comprador.

- Recomendación con regla explícita: el foráneo solo se recomienda si su Total con flete es menor al Total Local — "tiene que ser más barato pagar el flete que comprarlo local, sino no costea". Si no compensa, la recomendación es quedarse con el proveedor local, aunque su precio unitario sea mayor. El sistema muestra el ahorro en pesos y en porcentaje cuando el foráneo sí compensa.

**Captura de cotizaciones — asíncrona, línea por línea:**

- No se supone que todas las cotizaciones de un producto entran juntas en una sola pantalla. Se cotiza con un Proveedor, se guarda esa línea; horas después (o al día siguiente) se cotiza con otro Proveedor y se agrega — el sistema va guardando cada cotización conforme llega, sin perder las anteriores. Funciona igual de bien si solo se cotiza con un Proveedor (queda esa única opción) que si se cotiza con varios.

- **Historial permanente de precios por Proveedor:** las cotizaciones guardadas no se borran después de comprar — sirven como referencia para ver cómo se comporta un Proveedor contra los demás a través del tiempo, y para negociar con esa información.

- **Etiqueta "(mejor precio)":** en la lista de Proveedores ya cotizados, el que tenga el menor Total con flete se marca con una nota "(mejor precio)" junto a su nombre — es solo informativo, se puede elegir cualquier otro Proveedor de todos modos por logística, crédito, o preferencia.

**Botón "Generar orden de compra" y compras parciales:**

- Al picarle, se elige a cuál de los Proveedores ya cotizados se le va a generar la orden — de ahí sale la Orden de Compra en PDF (ver submódulo nuevo, más abajo).

- **Compra parcial:** si un Proveedor no tiene toda la cantidad necesaria en existencia, se le puede generar una orden por menos de lo que se necesita en total. El pendiente restante se queda visible en una tarjeta que muestra el total necesario, cuánto ya se compró (con detalle de a quién y a qué precio), y cuánto falta — ej. "100 kg necesarios · 60 kg ya comprados (Proveedor X, \$Y/kg) · 40 kg pendientes". La siguiente cotización/orden arranca sobre la cantidad restante, editable si otro Proveedor también tiene menos disponible.

**Cancelación ligada a la programación de origen:**

- Bug real detectado: si se cancela una Aplicación/Fertilización ya programada, la compra automática que había generado se quedaba como pendiente huérfana, sin cancelarse, pidiendo cotizar algo que ya no se necesita.

- **Regla:** al cancelar la programación de origen, la compra ligada se cancela junto con ella **mientras el producto todavía no haya llegado físicamente al Almacén** — sin importar si ya se cotizó o ya se formalizó/generó la orden con el Proveedor. Si el producto ya llegó al Almacén, no se deshace nada: el producto queda disponible en existencia (mismo FIFO ya documentado en 9.15) para usarse en cualquier otra Aplicación, de esa misma Huerta o de otra.

Permisos: todos los roles con acceso a Compras pueden usar el Comparador.

#### Submódulo: Orden de Compra en PDF

Documento formal que se genera al asignar proveedores y generar la orden — es una solicitud de surtido, no un comprobante fiscal (no calcula IVA, IEPS ni retenciones). Desde la pestaña “Órdenes de Compra” se puede generar más de un PDF a la vez, uno por cada proveedor resultante, cada uno con su folio. Basado en el formato de orden de compra que ya usa la empresa, con la identidad visual de marca.

- Folio consecutivo único de la empresa, empezando en 1 — no se maneja por Serie separada ni por rancho, es un solo consecutivo para toda la empresa.

- **Contenido:** Folio, Fecha; Datos de Facturación de la empresa (jalados de Configuración del sistema, ver Bloque 10 — razón social, RFC, domicilio); Datos del Proveedor (nombre, RFC, domicilio, teléfono — ya existentes en su catálogo, 9.14); tabla con Cantidad, Unidad, Descripción (Nombre comercial + Ingrediente Activo), Valor unitario, Importe; Total (suma de importes, sin desglose de impuestos); importe convertido a letra.

- **Firmas:** "Atentamente \[nombre\]" y "Autorizó \[nombre\]" — jalados de Firmas de Órdenes de Compra en Configuración del sistema (Bloque 10), **no automáticos según quién generó/autorizó la orden dentro del sistema** — son nombres fijos configurables, editables cuando cambie el personal.

- **No incluye** (queda para una futura fase de Contabilidad): Segmento/clave contable, IVA, IEPS, retenciones, tipo de cambio fiscal.

#### Vistas o submódulos

- Pendientes de autorizar (solo manuales).

- Estructura de navegación por estado (5 pestañas de primer nivel): 5 pestañas de primer nivel — Pendientes, Órdenes de Compra, En Camino, Recibidas, Rechazadas/Canceladas — con los mismos filtros disponibles en las 4 pestañas de estado (Huerta, fecha, tipo de producto, tipo de aplicación); cada filtro solo actúa si aplica al tipo de tarjeta que se está viendo, no rompe nada en las que no aplica. Solo "Pendientes" tiene sub-vistas adentro (ver abajo); "En Camino", "Recibidas" y "Rechazadas/Canceladas" son vistas simples, sin sub-pestañas. "Órdenes de Compra" no es una vista de estado — es el espacio de trabajo donde de verdad se arma y genera una orden; ver ficha completa más abajo. “Rechazadas/Canceladas” muestra las programaciones canceladas que arrastraron su compra ligada (ver “Cancelación ligada a la programación de origen”); no incluye solicitudes manuales rechazadas ni cancelaciones manuales de Compras, y no lleva campo de motivo.

- “Comparativo General” — todas las cotizaciones abiertas en una sola tabla:
  - **Una fila por Ingrediente Activo**, con las mismas columnas que ya calcula el Comparador individual: Mejor opción Global (con flete) vs. Mejor opción Local (Campeche, sin flete), proveedor de cada una, y el ahorro. Total general al final de la tabla (suma de todo lo que se compraría). No es un cálculo nuevo — es el mismo motor ya construido, mostrado para todos los productos a la vez en vez de uno por uno.

  - Cambio manual de proveedor por fila: el sistema sugiere la mejor opción por producto, pero quien compra puede cambiarla a mano en cualquier fila — por ejemplo, para consolidar varios productos con un mismo proveedor aunque ese proveedor no tenga el mejor precio en todos, si eso conviene más en conjunto (ahorro de flete al combinar en un solo envío). El sistema no calcula esa combinación óptima de forma automática por ahora — sugiere por producto individual, y quien compra decide manualmente si prefiere consolidar.

  - **Salto directo a Órdenes de Compra:** con la selección ya armada (sugerida o ajustada a mano), un botón manda directo a generar las órdenes — usa la misma agrupación automática por proveedor y vista previa que ya existe (ver "Pestaña Órdenes de Compra", abajo), como una 4ª forma de entrada, adicional a Por Proveedor/Por Orden/Por Producto — no las reemplaza, es para cuando se quiere ver y decidir todo junto de una vez.

  - Mismos supuestos ya documentados arriba (1 litro = 1 kg para efecto de flete, Zona del proveedor con su costo \$/kg) — no se inventan reglas nuevas de cálculo, solo se agregan a una vista conjunta.

- **Pestaña "Órdenes de Compra":** es el único lugar donde de verdad se arma y genera una orden de compra real — "Generar orden de compra" desde Pendientes no genera nada directo, manda aquí. Se entra de 3 formas:
  - Por Proveedor: una tarjeta por cada proveedor con al menos una cotización activa, apiladas hacia abajo, sin tener que buscarlo ni seleccionarlo.

  - **Ocultamiento automático:** en cuanto un producto de una Solicitud ya se compró (con este proveedor o con cualquier otro que haya cubierto esa misma necesidad), esa cotización desaparece de esta vista activa — ya no se necesita, no debe seguir ahí estorbando ni pudiéndose volver a seleccionar por error.

  - **Acceso a cotizaciones/compras anteriores:** además de lo activo, cada tarjeta de proveedor debe dar acceso a su histórico — cotizaciones/compras ya cerradas con él — para consulta operativa (ej. "¿a cuánto le compré esto la última vez?"). Es información distinta de la vista activa, no se mezcla con ella; se abre aparte desde la misma tarjeta.

  - Cada línea muestra en tiempo real si ese Ingrediente Activo ya está incluido en otra orden generada, o ya está seleccionado con otro proveedor en la misma sesión, con una marca visual clara (ej. “Ya cubierto con \[Proveedor\]”). Mismo criterio en “Por Producto”.

  - **Por Solicitud (ruta rápida):** a donde te manda "Cotizar" + "Generar orden de compra" desde una tarjeta de Pendientes (una Solicitud de Compra). Ves cada producto de esa Solicitud y, para cada uno, todas las cotizaciones que tiene con los distintos proveedores que lo cotizaron (marcando si es la marca preferida o un sustituto autorizado). Asignas, producto por producto, a qué proveedor se lo compras.

  - **Por Producto:** igual que "Por Solicitud" pero partiendo del producto/Ingrediente Activo — ves todas las necesidades pendientes de ese producto en toda la empresa (de distintas aplicaciones/programaciones), y asignas proveedor línea por línea.

- **Agrupación automática y vista previa:** sin importar por cuál de las 3 formas entraste, después de asignar todo el sistema agrupa automáticamente por el proveedor resultante y muestra una vista previa antes de generar (ej. "esto va a generar 2 órdenes: Proveedor A con Boro y Fosfato, Proveedor B con Nitrato"). Al aceptar, se generan los PDFs correspondientes, uno por proveedor.

- **Detalle en pantalla vs. PDF final:** en la pantalla de selección, las líneas del mismo producto+proveedor que vienen de orígenes distintos (ej. 5 L de Aplicación X + 10 L de Aplicación Y) se muestran **separadas**, para decidir si se compra una, otra, o ambas. En el PDF final que recibe el proveedor, esas líneas se **suman en una sola** (15 L) — el proveedor nunca ve de dónde salió cada parte ni que viene de programaciones distintas.

- Tope de cantidad disponible al generar: no se puede generar una orden por más de lo que el proveedor tiene disponible (campo de la cotización). La validación es contra lo disponible del proveedor, nunca contra lo pendiente de la necesidad: comprar de más por buen precio está permitido. Si la suma de varias líneas supera lo disponible, el sistema no reparte solo: obliga a ajustar cuánto entra de cada línea; la orden se genera solo por lo cubierto, con aviso de lo que no se cubrió, y la diferencia queda pendiente. Primero se redondea a presentaciones completas y solo después aplica este tope.

- **Precarga correcta:** al armar la orden en cualquiera de las 3 formas de entrada, se precarga la cantidad YA calculada por el Comparador ("Unidades a comprar", ya redondeada a presentación completa) — nunca el número crudo de lo pedido/necesitado sin redondear.

- **Campos mínimos comunes a toda tarjeta:** Destino, Solicitante y Fecha se resuelven automáticamente en toda tarjeta, sin captura manual. Para que cualquier tarjeta — de Aplicación/Fertirriego/Granular, o manual de Oficina/Empaque/Vivero/lo que sea — se pueda filtrar y buscar igual, todas comparten: **Destino, Solicitante (automático, capturado por sesión, nunca a mano), Fecha, Estado, y producto(s) + cantidad**. Todo lo demás (Ingrediente Activo, Huerta, Receta, dosis, Tipo de aplicación, etc.) queda libre según el tipo de origen — no hay un esqueleto único forzado para todas las categorías.

- Sub-vista 1 de 2 dentro de “Pendientes” — “Por Solicitud”: cada tarjeta es una Solicitud de Compra completa — una programación completa (Aplicación, Fertirriego o Granular, por el total de la campaña) o una solicitud manual completa. Colapsada muestra los campos mínimos comunes; abierta, todos sus productos con cantidad total y estado individual (Pendiente / Cotizado / Comprado parcial / Comprado completo) y el Solicitante. Desde ahí, “Cotizar” de cada producto manda al Comparador con la cantidad precargada.

- Regla de transición Pendiente → En Camino: generar la Orden de Compra (pestaña “Órdenes de Compra”) es lo que cambia el estado — no la llegada física. En cuanto se genera la orden por el 100% de lo necesitado de un producto, ese producto deja de contar como pendiente de inmediato y pasa a "En Camino" — que no haya llegado todavía es un estado distinto (En Camino), no motivo para seguir apareciendo en Pendientes. Si la orden solo cubre una parte, la parte cubierta pasa a "En Camino" y únicamente el restante sigue en Pendientes ("Comprado parcial"). Por qué esto depende de programar por Ingrediente Activo: la necesidad se registra por Ingrediente Activo (ver "Regla general", 9.5/9.7), así que comprar cualquier Producto Comercial que tenga ese mismo Ingrediente Activo —el preferido o un sustituto autorizado— cubre la necesidad igual. Si la necesidad se hubiera registrado por Nombre Comercial específico, comprar un sustituto en vez del preferido no habría hecho match contra lo pedido, y se habría quedado marcado como pendiente por error aunque ya se compró.

- Órdenes generadas — en camino. Esta es la pestaña "En Camino" de primer nivel (simple, sin sub-vistas — ver "Estructura de navegación por estado" arriba).

- Cancelar una Orden de Compra ya generada (ej. el proveedor se echa para atrás) — distinto de “Rechazadas/Canceladas”, que es para programaciones canceladas que arrastran su compra:
  - Al cancelar, el producto regresa a Pendientes (para volver a cotizarlo con alguien más) — se deshace la transición Pendiente → En Camino.

  - Caja de observaciones al cancelar — opcional, no obligatoria (a diferencia del protocolo de cancelación de Aplicación vencida, 9.7, que sí exige motivo).

  - Permiso: exclusivo de la persona de Compras (no de quien autoriza) — es quien tiene contacto directo con los proveedores y sabe cuándo de verdad se cayó una orden.

- Sub-vista 2 de 2 dentro de "Pendientes" — "Por Producto", antes "Vista agrupada por Ingrediente Activo" (renombrada y generalizada): además de las tarjetas por orden individual (útiles para priorizar una orden específica), una vista que agrupa y suma la cantidad pendiente de cada producto a través de todas las órdenes pendientes, sin importar su origen (Fertirriego, Aplicaciones, manuales, etc.) — para poder comprar en volumen. Solo suma lo PENDIENTE (no lo ya en camino ni lo ya recibido). Excepción a los filtros comunes: aquí NO se muestran los filtros de Fecha ni Tipo de aplicación — esta vista suma en todo el tiempo, no hay una fecha única que filtrar. Huerta y Tipo de producto sí siguen disponibles. Regla de agrupación: se agrupa por Ingrediente Activo cuando el producto pertenece a una categoría que requiere Ingrediente Activo; cuando no aplica Ingrediente Activo (empaque, papelería, herramientas, refacciones, etc.), se agrupa por Producto Comercial/nombre en su lugar — esto es justo lo que motivó el cambio de nombre de la vista, ya no es exclusiva de Ingrediente Activo. Ejemplo: si tres órdenes distintas necesitan Boro, la vista muestra "Boro: 260 kg pendientes entre 3 órdenes" en un solo lugar, no separado.

- Monto en dinero por cada opción de proveedor: junto al total agregado (ej. “Boro: 260 kg pendientes”), por cada proveedor que lo tiene cotizado, cuánto costaría cubrir esa cantidad con él (Total sin flete y Total con flete).

- Desglose por origen dentro del total: debajo del total de cada Ingrediente Activo se lista de dónde viene cada cantidad, con esta etiqueta:
  - Con receta (Aplicación o Fertirriego): Huerta X — Receta \[nombre\] (ej. “Huerta X — Receta \[nombre\]”).
  - Fertirriego sin receta: **Huerta X — Fertirriego**.
  - Fertilización Granular (9.5, Camino 1 — no usa Recetario): **Huerta X — Fertilización Granular**.
  - Aplicación sin receta, con Tipo de aplicación capturado (ver 9.7): **Huerta X — Aplicación \[Tipo\]** (ej. "Huerta X — Aplicación Drench").
  - Aplicación sin receta y sin Tipo capturado: **Huerta X — Aplicación**.
  - Solicitud manual (sin Huerta ni Receta): (Solicitud manual).

- Conexión directa al Comparador: desde “Por Producto” (total agregado) y desde una tarjeta de “Por Solicitud” se salta al Comparador con la cantidad precargada. Las 2 sub-vistas coexisten a propósito: resolver una Solicitud completa de un jalón, o comprar en volumen para varias a la vez.

- Recibidas — pestaña "Recibidas" de primer nivel (simple, sin sub-vistas): solo para que Compras monitoree qué ya llegó a Almacén. Detalle de lo que muestra:

- **Detalle de recepción visible en la tarjeta de la orden**: una orden marcada “Recibida” debe mostrar en su tarjeta, además de lo ya esperado (proveedor, precio, fecha esperada), **cuándo y cuánto se recibió realmente** (fecha de recepción + cantidad real recibida) — este dato ya se captura al recibir (ver “Recepción flexible” en Almacén, 9.15), pero no se estaba mostrando en la tarjeta de la orden dentro de Compras.

- Qué Producto Comercial se compra (preferido o sustituto) se decide al armar la orden, producto por producto, y queda fijo en ella. Almacén solo compara lo recibido contra la orden (“Recepción flexible”, 9.15); si no coincide, se registra como diferencia.

- Catálogo de Proveedores.

- Cuentas por Pagar (CxP) — ver detalle arriba.

#### Lógica de entrada de información

- Solicitud manual: Título obligatorio (ej. “Refacciones bomba de riego”), uno o varios productos con su cantidad (“+ Otro producto”), motivo/nota por solicitud y Destino obligatorio (validado en pantalla y en servidor), elegido del catálogo abierto de Centros de Costo (Bloque 3). Si el Destino es Huerta, un segundo selector obligatorio pide cuál.
- Cotización: proveedor, precio unitario, fecha esperada de entrega, cantidad disponible (checkbox "Cantidad total disponible": si se marca, se asume que el proveedor puede surtir todo lo que se le pida; si no se marca, es obligatorio capturar la cantidad exacta que sí tiene. No se puede guardar la cotización sin uno de los dos — ni marcar el check y dejar la cantidad vacía, ni dejar ambos sin llenar).
- Recepción: cantidad real recibida y caducidad si aplica; el número de Lote de Almacén lo asigna el sistema.

#### Procesamiento de información

- Verificación de autorización antes de permitir cotizar (solo manuales).
- Al recibir, si la orden está ligada a una Aplicación/Fertilización en espera, se genera automáticamente la salida “comprometida” para esa Huerta.
- Actualización del histórico de los 3 mejores proveedores por producto.

#### Salida de información

- Entrada real de inventario → Almacén.
- Apartado automático → Aplicaciones/Fertilizantes en espera.
- Gasto de la orden → Contabilidad.

#### Personas/puestos involucrados y sus permisos

| Rol                           | Ver                                         | Capturar                    | Editar | Autoriza                                |
|-------------------------------|---------------------------------------------|-----------------------------|--------|-----------------------------------------|
| Director General              | ✅                                          | ✅                          | ✅     | ✅                                      |
| Encargado de Compras          | ✅ (global)                                 | ✅                          | ✅     | — (no autoriza mientras no exista tope) |
| Gerente Administrativo        | ✅                                          | —                           | —      | ✅ (solicitudes manuales)               |
| Gerente Técnico de Producción | ✅ (solicitudes de producto para la planta) | —                           | —      | ✅ (solo producto para la planta)       |
| Contador                      | ✅                                          | —                           | —      | —                                       |
| Encargado de Bodega           | ✅ (sus pedidos)                            | ✅ (genera pedido)          | —      | —                                       |
| Asistente Administrativo      | ✅                                          | ✅ (sin editar confirmados) | —      | —                                       |

#### Módulos que alimentan a este

- Aplicaciones, Fertilizantes (pendientes automáticos por faltante de stock).
- Almacén (catálogo de productos, para solicitudes manuales).

#### Módulos que reciben información de este

- Almacén (entrada real de inventario al recibir).
- Aplicaciones/Fertilizantes (apartado automático cuando la orden llega).
- Contabilidad (gasto).

#### Pendientes de este módulo

- Verificar con Claude Code (no se mencionó en su reporte) que la orden pendiente de capturar flete también aparezca en Notificaciones para Dirección General, y qué significa exactamente el candado “folio incompleto”.
- Descargar de una vez los PDFs de todas las órdenes generadas en una misma asignación (hoy se genera una orden por proveedor, pero cada PDF se descarga uno por uno).
- Decidir si el mejor Local también lleva etiqueta de texto (hoy “(mejor precio)” solo marca al mejor Global; el mejor Local se distingue solo por el color de la fila).
- Mejoras de interfaz: llevar “(mejor precio)” y “Mejor Global” a la vista de Órdenes de Compra; aclarar que el precio capturado es el de la presentación completa (ej. “Precio del bulto de 25 kg”); mensaje claro de “Orden generada” y PDF fácil de encontrar después.

### 9.15 Almacén

(Incluye el Almacén Local de cada Huerta y el de Vivero.)

#### Lógica establecida actual del módulo

**Almacén Central:**

- Estructura de catálogo: Ingrediente Activo → Producto Comercial (Nombre + Marca). Cada Producto Comercial tiene un solo Ingrediente Activo; un producto mezcla se registra con un Ingrediente Activo compuesto propio (ej. “N-P-K 17-17-17”). El catálogo está abierto a cualquier categoría. La Presentación no es fija por Producto Comercial: un mismo producto puede llegar en presentaciones distintas entre compras (bulto de 25 kg o de 10 kg, garrafa de 20 L), y se define en cada cotización (Compras) y en cada recepción (Almacén). Lo único fijo por Producto Comercial es su Unidad base (kg, L, g) para dosis y consumo.
- Una sola bodega central para toda la empresa (no una por Huerta).
- Control por Lote de Almacén: cada recepción genera un lote por producto, con número, caducidad (si aplica), cantidad y precio. El número de lote es un consecutivo único para todo el Almacén Central, no uno por producto: si en una entrega llegan nitrato de potasio, nitrato de magnesio y fosfato, quedan como lote 1, lote 2 y lote 3. Lo asigna el sistema al confirmar la recepción y se lo muestra al almacenista, que lo escribe en una hoja de papel pegada al producto. Si del mismo producto llegan varias tarimas en la misma recepción, todas llevan el mismo número (mismo lote, misma llegada, mismo precio).
- **Alta de compras**: las da de alta el Encargado de Bodega al recibir físicamente el producto.
- Salidas: el producto no se da de baja al programarse, sino hasta que se entrega físicamente. Estado intermedio: “comprometido/reservado” al programar, “entregado/salida real” al entregar. Un apartado que nunca se entregó se libera automáticamente a los 15 días contados desde la fecha de inicio de la programación, con alerta (ver 9.7).
- Otros motivos de salida: préstamo a otro rancho, merma, baja por caducidad.
- FIFO obligatorio por Ingrediente Activo, por orden de llegada (no por caducidad): al registrar una salida, el sistema indica de qué lote tomar el producto — el más antiguo de ese Ingrediente Activo que tenga existencia. Si ese lote no alcanza, divide la salida entre lotes (ej. 25 kg del lote 3 + 25 kg del lote 10), cada parte a su precio. El almacenista puede sacar de otro lote (ej. porque el indicado quedó al fondo de la bodega): elige el lote real y escribe un motivo; esa salida queda marcada como “fuera de orden” y se cobra al precio del lote real. Toda salida guarda su lote de origen, y toda devolución (liberar comprometido, ajuste, cancelación, sobrante) regresa a ese mismo lote y al mismo precio.

<!-- -->

- Costeo: cada salida se valúa al precio del lote FIFO del que sale físicamente, con el flete de su orden incluido (Bloque 3). Un abono por devolución regresa al mismo precio con el que salió. Ese valor es el que se carga a la Huerta al entregar.
- Combustible: entra al Almacén Central (por compra o por Carga a Garrafa, 9.13) y sale en garrafa al Almacén Local del rancho como cualquier producto; los rellenos de cada avance lo descuentan del Almacén Local.

<!-- -->

- **Alertas de reorden inteligentes**: no solo stock mínimo fijo — el sistema analiza consumo histórico y tiempos de reorden, considerando que algunos productos solo se usan en ciertas etapas del cultivo.
- **Calculadora de dosis**: el stock se lleva internamente en la Unidad base del Ingrediente Activo (kg, L, g) — sin importar en qué presentación haya llegado cada compra (ver "Estructura de catálogo", arriba). La conversión a presentación (ej. bidón de 20 L) ocurre solo al comprar/recibir; la dosis de una aplicación siempre se calcula sobre la Unidad base según el área del cuadro/huerta.
- Campos de Presentación separados (ver "Estructura de catálogo" arriba): la presentación se captura en 3 campos separados, no como texto libre combinado — para minimizar errores de llenado. Se captura cada vez, al cotizar en Compras y al confirmar recepción en Almacén, porque un mismo producto puede llegar en presentaciones distintas según la compra:
  - Contenedor — catálogo desplegable (no texto libre), sigue el mismo patrón de catálogos abiertos con botón “+” del resto del sistema. Datos semilla iniciales: Saco, Bote, Garrafa, Tanque, Bolsa. El campo se queda obligatorio para todas las categorías por igual (incluyendo refacciones y otras categorías no consumibles) — no se distingue por tipo de producto.
  - **Cantidad** — numérico.
  - Unidad — sin valor por defecto/pre-seleccionado; obligatorio elegir explícitamente.
  - **Candado**: el sistema **no deja guardar** el producto si falta cualquiera de los tres campos.
  - Los tres datos se **combinan solo para mostrarse** en vistas (ej. “Saco 25 kg”), pero se capturan y almacenan por separado.
- Recepción flexible: la entrega no siempre coincide con lo pedido — la pantalla de recepción registra diferencias entre lo ordenado y lo recibido. Formato de captura: se captura como "X Contenedores de Y Cantidad" (ej. "10 Garrafas de 20 L" o "8 Bultos de 25 kg") — mismo patrón de 3 campos que la Presentación (Contenedor, Cantidad, Unidad, ver arriba) — el total se calcula solo (Unidades × Cantidad por unidad), no se captura como un número suelto. El número de Lote de Almacén lo asigna el sistema al confirmar (ver Control por Lote de Almacén).
- **Refacciones de maquinaria**: comparten el espacio físico con agroquímicos, pero tienen otro encargado — registros separados.
- **Almacén General** (herramientas, uniformes, equipo/material de empaque, equipo de riego): misma bodega central, pero este material (no perecedero) no necesita FIFO ni lotes — solo conteo de existencias con entradas y salidas.
- **Bajas y mermas**: requieren doble-check de Gerencia — el Encargado de Bodega no puede darlas de baja unilateralmente.

Almacén Local por Huerta (y de Vivero) — control de fugas:

- Objetivo: las salidas del Central hacia las Huertas son de los puntos con más riesgo de fuga de dinero, así que llevan candados y alarmas, con un límite honesto: el control llega hasta “salió de bodega → llegó al rancho → se reportó aplicado en tal avance con tal dosis”.
- Estructura de dos niveles: Almacén Central → sale producto hacia una Huerta. Almacén Local → cada Huerta tiene su propio mini-inventario bajo responsabilidad del Supervisor, porque las programaciones no se completan en un solo día. Vivero tiene su propio Almacén Local con el mismo mecanismo, a cargo del Ingeniero de Vivero.
- **Sin lotes ni caducidad** en el Local — solo un total simple por producto (“le mandaron 100 L, lleva reportados 60 L aplicados, le quedan 40 L”).
- **Entrega y confirmación se unifican en un solo paso**: cuando Almacén entrega físicamente el producto, esa misma acción confirma que le llegó al Supervisor — no hay paso aparte ni retraso.
- Reporte de avance: cada avance reportado (en hectáreas totales de la programación) descuenta del Almacén Local lo proporcional — por grupo, hectáreas atribuidas × dosis del grupo (Bloque 3). En Fertirriego, cada día descuenta lo realmente inyectado (9.6). El descuento es automático; el Supervisor no da de baja a mano.
- Nota estimada de tanque pendiente (exclusivo de Aplicaciones, 9.7, no aplica a Fertirriego ni Granular): no mueve inventario real ni cambia el descuento (que sigue siendo por hectárea reportada, con el mismo "límite honesto" ya documentado arriba) — es solo una nota calculada para poder verificar físicamente. Usa datos que ya existen: hectáreas por tanque completo (Recetario, 9.7) y hectáreas acumuladas atribuidas a cada grupo de esa Aplicación. Cálculo: tanques necesarios = hectáreas reportadas ÷ hectáreas por tanque completo (ej. 15 ÷ 10 = 1.5); tanques físicamente preparados = ese número redondeado hacia arriba (2, porque en la realidad no se prepara "1.5 tanques"); en tanque pendiente = la fracción sin usar del último tanque (2 − 1.5 = 0.5) × cantidad de producto por tanque completo. Ejemplo de nota: "Con 15 de 27 ha reportadas, se estima 1 tanque completo ya usado + 1 tanque a la mitad — aprox. 1,000 L pendientes en tanque, sin aplicar todavía." Se calcula por grupo (cada grupo tiene su propio tanque) y se aplica a cada producto de ese grupo con su propia cantidad. Visible aquí en Almacén Local (por producto/Huerta) y también en la tarjeta de progreso de la Aplicación (9.7), para verificar cruzado.
- El candado principal: se compara la cantidad que salió del Central hacia la Huerta contra la cantidad justificada por los avances reportados. Si a los 15 días contados desde la fecha fin de la programación no cuadran, se genera una alerta. Gerencia investiga y puede ajustar manualmente el inventario, con registro del motivo — la alarma no se cierra sola.

<!-- -->

- Recepción física: se confirma desde la pestaña “En Camino” de Almacén (cantidad real, lote y caducidad); el servidor no permite confirmarla desde Compras. Al confirmar se avisa a Compras en Notificaciones. Las pestañas “En Camino” y “Recibidas” de Compras son de solo lectura.

#### Vistas o submódulos

- **Inventario** (fusión de “Catálogo” + “Inventario”, las dos pestañas por separado no estaban bien organizadas): pestaña única que reemplaza a las dos anteriores. **“Catálogo” desaparece** como pestaña propia.
  - Tabla principal: misma estructura que tenía “Catálogo” (Nombre comercial, Marca, Ingrediente activo, Categoría, Autorizado, Estado — ya no incluye Presentación, que dejó de ser un dato único por producto, ver "Estructura de catálogo" arriba), **más la existencia/stock total (en Unidad base)** de cada producto agregada como columna — el desglose por Presentación vive en el Detalle de producto, no en esta tabla principal.

<!-- -->

- Pantalla de Inventario pensada para muchos productos. “Existencia por Ingrediente Activo” (agregado sin importar marca) y la tabla de productos (detalle por marca) son 2 niveles distintos, y la columna Existencia de la tabla siempre muestra el dato real. Orden de la pantalla:
  - **Alertas de reorden, hasta arriba de todo:** antes que el buscador, antes que cualquier otra cosa — tarjeta destacada tipo "⚠️ 3 productos por debajo de su mínimo" usando las Alertas de reorden inteligentes que ya existen (ver arriba), en vez de perderse dentro de la tabla.
  - **Buscador** — sin cambios, ya existe (nombre comercial, ingrediente).
  - Filtro por Categoría, como chips horizontales, generados automáticamente uno por cada Categoría del catálogo abierto (al dar de alta una Categoría nueva, su chip aparece solo). “Todos” es un chip fijo adicional, al final.
  - “Existencia por Ingrediente Activo”: colapsable con botón “Ocultar/Mostrar” (cerrada al recargar la pantalla) y contextual — si la categoría filtrada no requiere Ingrediente Activo, la sección no aparece.
  - Tabla de productos, filtrada por la categoría elegida, con su Existencia real — mucho más corta y manejable al estar ya filtrada.
  - Botón **“+ Nuevo producto”** se mantiene donde ya estaba.
  - **Buscar producto**: caja de búsqueda de texto libre — filtra sobre **Nombre comercial, Ingrediente Activo o Categoría** a la vez (busca en los tres campos con lo que se va escribiendo).
  - Filtro estructurado (botón aparte de la búsqueda libre): primero se elige la columna a filtrar, luego el valor — los filtros son combinables entre sí (ej. Categoría = fungicida y Estado = activo, aplicados juntos, no uno reemplaza al otro).
  - **Detalle de producto**: lo que antes era la vista individual de “Inventario” (Producto → Stock disponible → tabla de Lote/Caducidad/Cantidad) pasa a vivir **dentro de cada tarjeta de producto**, mostrando totales, lotes y movimientos atribuidos a ese producto específico. **Abre aparte** de la tabla principal (no es un acordeón inline), con navegación de regreso a la tabla.

<!-- -->

- Movimientos (entradas y salidas).
- Almacén Local (tarjetas de “reservado para Rancho X”, pendientes de entregar, consumo por Huerta).

#### Lógica de entrada de información

- Alta de producto: categoría (catálogo abierto — se pueden agregar más categorías con el mismo patrón de botón “+” del resto del sistema), nombre comercial, ingrediente activo (catálogo abierto también, propio — cada Categoría lleva su propio check "¿Requiere Ingrediente Activo?", decidido al darla de alta — no es una lista fija de 2 valores. Para cualquier categoría marcada "No" — refacciones, empaque, herramientas, etc. — este campo no aparece), Marca — catálogo abierto, independiente del Proveedor: una misma Marca puede venderla más de un Proveedor distinto, así que no deben confundirse como el mismo dato.
- Entrada: producto, lote/caducidad (si aplica), cantidad, y Precio unitario — OBLIGATORIO, sin excepción: aunque la entrada normal ya trae el precio de la Orden de Compra que la generó, una Entrada manual también debe capturar el precio a mano — si no, el costeo de cualquier Aplicación que después consuma ese lote se rompe (no habría de dónde sacar el costo unitario real). Entrada sin Orden de Compra ligada: se permite para casos extremos (ej. donación, ajuste de inventario físico, puesta al corriente del sistema) — requiere motivo obligatorio explicando por qué no viene de una Orden de Compra formal, además del Precio unitario ya exigido arriba.
- Salida: producto, motivo, cantidad, Huerta destino (si es para una programación) y lote real del que salió (precargado con el que sugiere el sistema).
- Selector de producto — solo lo que hay en existencia: en Salida y en Entregas a Huerta, el selector muestra únicamente productos con existencia mayor a 0 en el Almacén Central.
- Gasto de una Salida sin Aplicación ligada: si se registra una Salida con Huerta destino pero SIN ligarla a una Aplicación/Fertirriego específico, el gasto se atribuye de forma genérica a esa Huerta — sin desglose de a qué Cuadro o Aplicación fue. Para reflejar el consumo con detalle real (Cuadro, hectáreas), lo correcto es crear la Aplicación correspondiente (con su fecha real, aunque sea retroactiva) y reportar el avance ahí — la Salida directa sin Aplicación es solo para casos extraordinarios, no el flujo normal.

#### Producto preferido y sustitutos autorizados por Ingrediente Activo

Objetivo: homologar qué marca/producto se compra para cada Ingrediente Activo, para no comprar distintos productos del mismo ingrediente activo salvo que de verdad se necesite — no es una decisión libre de quien compra en el momento.

- **Producto preferido:** cada Ingrediente Activo (de cualquier categoría marcada "Requiere Ingrediente Activo", ver arriba) tiene definido un único producto preferido a nivel empresa — el que se prefiere comprar y mantener en existencia. Aplica igual para todos los ranchos, no varía por Huerta.

- **Sustitutos autorizados:** lista ordenada por prioridad de otros productos con el mismo Ingrediente Activo, autorizados para comprar cuando el preferido no está disponible con el proveedor. **Solo se autoriza un sustituto si tiene la misma dosificación que el preferido** — así no hace falta ajustar el cálculo de dosis en Aplicaciones (9.7) ni Fertilizantes (9.5) según qué producto se haya usado.

- **No cambia el FIFO de consumo:** el consumo del Almacén sigue siendo por antigüedad dentro del mismo Ingrediente Activo (ver FIFO obligatorio, arriba), sin importar si el producto es el preferido o un sustituto autorizado. Ejemplo: si el sustituto B llegó antes que el preferido A, se consume primero B — la preferencia solo afecta la decisión de compra, nunca cuál stock existente se usa primero.

- **Flujo en Compras — manual, no automático:** quien compra pregunta al proveedor por el producto preferido; si no hay, consulta la lista de sustitutos autorizados ya definida en el sistema y elige de ahí, sin necesidad de preguntarle a Dirección General cada vez. El sistema no verifica disponibilidad con el proveedor por su cuenta.

- **Permisos:** solo Director General y Gerente Técnico de Producción pueden definir o modificar la lista de preferido/sustitutos por Ingrediente Activo — mismo criterio base ya usado para el catálogo de productos autorizados en Aplicaciones (9.7) y Fertilizantes (9.5).

#### Procesamiento de información

- Salida por lote: lote sugerido por FIFO (orden de llegada), división entre lotes si uno no alcanza, y registro obligatorio del lote real de cada salida.
- Cálculo de disponible = stock total − comprometido.
- “Comprometido” se actualiza al editar, reducir, liberar o cancelar una programación: siempre resta lo liberado.
- Vencimiento automático de apartados a los 15 días.
- Comparación cantidad salida vs. cantidad justificada, con alarma a 15 días si no cuadra.
- Generación de la remisión al entregar, disponible de inmediato en el Almacén Local.

#### Salida de información

- Consumo justificado → costo de Cuadro/Huerta (Centros de Costo).
- Pedidos por falta de stock → Compras.
- Valor total de inventario (“dinero parado”) → Panel Ejecutivo (indicador a nivel empresa).

#### Personas/puestos involucrados y sus permisos

| Rol                           | Ver                                             | Capturar               | Editar       | Autoriza                                       |
|-------------------------------|-------------------------------------------------|------------------------|--------------|------------------------------------------------|
| Director General              | ✅                                              | ✅                     | ✅           | ✅ (alta de producto que no es para la planta) |
| Encargado de Bodega           | ✅ (Central + Locales, solo lectura en Locales) | ✅ (Central)           | ✅ (Central) | ✅ (alta de producto no-agroquímico)           |
| Bodeguista                    | ✅ (Central)                                    | ✅ (Central)           | —            | —                                              |
| Supervisor de Huerta          | ✅ (su Almacén Local)                           | ✅ (avance, su Local)  | —            | ✅ (alta de producto para la planta)           |
| Gerente Técnico de Producción | ✅                                              | —                      | —            | ✅ (alta de agroquímico/fertilizante)          |
| Gerente Administrativo        | ✅                                              | —                      | ✅           | —                                              |
| Ingeniero de Vivero           | ✅ (Almacén Local de Vivero)                    | ✅ (consumo en Vivero) | —            | —                                              |

#### Módulos que alimentan a este

- Compras (entradas al recibir una orden).
- Aplicaciones, Fertilizantes, Vivero (salidas comprometidas al programar).

<!-- -->

- Equipos y Maquinaria (Carga a Garrafa de combustible).

#### Módulos que reciben información de este

- Actividades, Aplicaciones, Fertilizantes, Riego, Vivero y Equipos y Maquinaria (Almacén Local, consumo de producto y combustible).
- Compras (pedidos automáticos por falta de stock).
- Centros de Costo/Contabilidad (valor de inventario, costo de consumo).
- Panel Ejecutivo (KPIs de inventario).

#### Pendientes de este módulo

- Construir el Almacén Local de Vivero junto con el módulo de Vivero (9.3).
- Marcar físicamente en la bodega los 13 lotes existentes con el número que les asignó la migración (pedir la lista a Claude Code).

### 9.16 Contabilidad

#### Lógica establecida actual del módulo

**Tratamiento de gastos pre-productivos:**

- Los gastos propios de preparación de tierras son **gasto corriente** del ciclo. Los gastos que sirven para **habilitar** el área de cultivo (desmonte, instalación de equipo de riego, perforación de pozos, electrificación, equipamiento del pozo) **sí se capitalizan**.
- Si se capitalizan: se amortizan en varios ciclos de cultivo, típicamente 3, a veces 5, dependiendo del monto invertido y las hectáreas habilitadas. *(Pendiente validar formalmente con el contador el método contable exacto; la vida útil y el criterio de negocio ya están definidos.)*
- Descanso de tierras: es un Ciclo propio de tipo Descanso (9.1). Su costo se acumula en ese Ciclo y, al cerrarlo, pasa al siguiente Ciclo de cultivo — nunca al anterior, para que el ciclo anterior se pueda cerrar.

**Moneda:**

- Todos los asientos contables son en **pesos**. Se usa un tipo de cambio de referencia (generalmente Diario Oficial de la Federación) y una cuenta complementaria para completar el monto de la venta en pesos. Al cobrar, se cancela el saldo en dólares y su registro complementario; la diferencia se manda a la cuenta de pérdida o utilidad cambiaria. Ventas en dólares llevan factura con el asiento en dólares más la complementaria en pesos; ventas en pesos se contabilizan directas.

**Otros:**

- Sería ideal compatibilidad con **CONTPAQ** a futuro, pero por ahora basta con que el sistema muestre y permita analizar la información.
- Existe un porcentaje de comisión acordado para las ventas con la comercializadora del grupo (dato de negocio, no se documenta aquí).
- Ya existe un catálogo de cuentas contables bien organizado en la empresa — queda pendiente revisarlo a detalle para definir cómo el sistema se adapta a él, decisión explícita de dejarlo para después.

Cierre de periodo: la regla general vive en el Bloque 6. Aquí se ejecuta: cierre mensual y cuadre de los reportes anuales. Solo la Rama de Contabilidad modifica o accede a periodos cerrados.

#### Vistas o submódulos

- Balance / Contabilidad general.
- Cierre de periodo (mensual/anual).

#### Lógica de entrada de información

- Todos los módulos alimentan su costo/ingreso automáticamente; Contabilidad también permite captura directa para lo que ningún módulo cubre todavía.

#### Procesamiento de información

- Conversión y registro USD/MXN según la regla de tipo de cambio de referencia.
- Capitalización vs. gasto corriente según etapa del ciclo.
- Consolidación de costos por Centro de Costo (bloque 3).

#### Salida de información

- Balance financiero → Panel Ejecutivo.
- Reportes contables exportables a Excel/PDF.

#### Personas/puestos involucrados y sus permisos

| Rol              | Ver | Capturar | Editar |
|------------------|-----|----------|--------|
| Director General | ✅  | ✅       | ✅     |
| Contador         | ✅  | ✅       | ✅     |

*(El Gerente Administrativo NO tiene Contabilidad en su alcance — el Contador es una línea independiente.)*

#### Módulos que alimentan a este

- Todos los módulos operativos (Nómina, Almacén, Compras, Embarques, Equipos y Maquinaria) — cada uno aporta su costo/ingreso.

#### Módulos que reciben información de este

- Panel Ejecutivo.

#### Pendientes de este módulo

- Precios de transferencia / tratamiento contable de la liquidación con la comercializadora del grupo — más matizado porque el cliente no es exclusivo.
- Revisar el catálogo de cuentas contables existente y definir la adaptación (a propósito, para después).
- Validar formalmente con el contador el método contable exacto de amortización de gastos capitalizados.

### 9.17 Auditoría

#### Lógica establecida actual del módulo

- Implementa la bitácora de la regla general de Seguridad y auditoría (Bloque 6): quién capturó y quién modificó cada registro, con fecha, hora y el histórico de versiones.
- Diseño del módulo confirmado: visible para Director General y Auditor. Permite: (1) búsqueda/filtro por módulo, tipo de registro, persona que capturó o modificó, y rango de fechas; (2) por cada resultado, qué cambió (valor anterior → valor nuevo), quién y cuándo; (3) es exclusivamente de consulta — no revierte cambios directamente desde ahí, cualquier corrección se hace en su módulo normal y deja su propio rastro; (4) vista rápida opcional de “cambios recientes” (últimas 24-48h).

#### Vistas o submódulos

- Búsqueda/filtro de bitácora.
- Vista rápida de cambios recientes.

#### Lógica de entrada de información

- No tiene entrada propia — se alimenta automáticamente de cada acción de captura/edición en todos los demás módulos.

#### Procesamiento de información

- Registro automático de cada acción con quién, qué cambió (antes/después), y cuándo.

#### Salida de información

- Reportes de auditoría filtrables, exclusivamente de consulta.

#### Personas/puestos involucrados y sus permisos

| Rol              | Ver                                                                                                   |
|------------------|-------------------------------------------------------------------------------------------------------|
| Director General | ✅ (acceso universal)                                                                                 |
| Auditor          | ✅ (solo lectura — el Auditor ve todos los módulos del sistema en solo lectura; este es uno de ellos) |

#### Módulos que alimentan a este

- Todos los módulos del sistema (cada captura/edición deja su rastro aquí).

#### Módulos que reciben información de este

- Ninguno — es exclusivamente de consulta, no alimenta otros módulos.

#### Pendientes de este módulo

- Construir el módulo completo — diseño confirmado, pendiente de programarse.

### 9.18 Panel Ejecutivo

#### Lógica establecida actual del módulo

- Se requieren reportes por módulo (cada “cabeza de área” ve el detalle de su área), y Dirección General necesita poder ver todo, entrando módulo por módulo — no necesariamente un dashboard único que lo mezcle todo.
- Reportes clave: costos (el más importante), nóminas, niveles de inventario, kg cosechados, ventas, CxP y estatus de maquinaria. Ventas no es cobranza (eso queda fuera del sistema): es saber cuánto se vendió cada tarima para cruzarlo contra su costo real (diseño futuro, ver 9.10).
- **Comparativos históricos**: sí se requieren, a nivel administrativo elevado — comparar el mismo rancho en diferentes ciclos/temporadas.

**KPIs por módulo — primera versión:**

| Módulo                     | KPI                                                                                                                    |
|----------------------------|------------------------------------------------------------------------------------------------------------------------|
| Producción (Huerta)        | Costo por hectárea efectiva (Desarrollo+Cosecha+Empaque), % de aprovechamiento del rancho, costo agregado por Variedad |
| Cosecha                    | Toneladas/kg cosechados, rendimiento por Variedad                                                                      |
| Empaque                    | Costo por caja empacada, cajas por destino                                                                             |
| Embarques                  | Cajas embarcadas vs. saldo pendiente, monto facturado vs. liquidado                                                    |
| Almacén Central            | Nivel de stock, alertas de reorden activas, valor total de inventario                                                  |
| Almacén Local (por Huerta) | Estado del candado de 15 días                                                                                          |
| Mano de Obra / Nómina      | Costo de nómina por periodo; cuántas personas trabajan en cada Huerta y cuánto se llevan en promedio por día           |
| Equipos y Maquinaria       | Consumo de diésel/gasolina por hora o km vs. histórico, % de equipos en mantenimiento vs. operando                     |
| Compras                    | Gasto total por proveedor, productos comprados, calificación de proveedores                                            |
| Fertilizantes/Aplicaciones | Cumplimiento de plan vs. real                                                                                          |

#### Vistas o submódulos

- Un tablero por módulo (no uno solo mezclado).

#### Lógica de entrada de información

- No tiene entrada propia — es un agregador de lo que ya se captura en cada módulo.

#### Procesamiento de información

- Cálculo de cada KPI según la tabla de arriba, con comparativos históricos por ciclo/temporada.

#### Salida de información

- Vista consolidada para Dirección General y Gerencias, exportable.

#### Personas/puestos involucrados y sus permisos

| Rol                                                                    | Ver             |
|------------------------------------------------------------------------|-----------------|
| Director General                                                       | ✅ (todo)       |
| Todos los Gerentes (Técnico, Administrativo, Mantenimiento, Logística) | ✅ (su alcance) |
| Contador                                                               | ✅ (financiero) |

#### Módulos que alimentan a este

- Todos los módulos del sistema.

#### Módulos que reciben información de este

- Ninguno — es la capa de consulta más alta.

#### Pendientes de este módulo

- El “KPI M.O.” visto en el reporte de campo (meta/real) sigue sin definirse con precisión — su propósito exacto no está claro todavía.
- Criterio de calificación de proveedores — pendiente de definir.
- Construir el módulo completo.

### 9.19 Módulos pendientes

*(Ningún módulo identificado queda totalmente fuera de las fichas de arriba. Este espacio queda para cuando surja alguno nuevo que todavía no tenga ficha propia.)*

- Ninguno por ahora.

### 9.20 Monitoreo

Concentra las bitácoras técnicas de cada Huerta ya trasplantada. Es registro técnico: no mueve inventario, costo ni nómina.

#### Lógica establecida actual del módulo

- Solo aplica a Huertas ya trasplantadas. Los conteos de plantas en vivero y el conteo en campo de un Lote de siembra después del trasplante viven en Vivero (9.3).
- Contempla, por ahora: Clima (precipitación, temperatura, evaporación y otros datos por definir, por día y Huerta, ligado a las actividades — relevante para Aplicaciones), vueltas de cosecha, virosis y plantas muertas, y plagas.
- Virosis: el registro técnico de plantas con virosis vive aquí; la labor de recorrer la Huerta buscándolas es la Actividad “Virosis” (9.4).
- Cada bitácora se construye a la medida, a partir de los formatos reales de la empresa — no se inventa una estructura genérica de antemano.
- Sus indicadores sirven para comparar contra el costo real de una aplicación, incluidas las de prueba sobre parte de la Huerta (el costo baja a Cuadro, Bloque 3).

#### Vistas o submódulos

- Una bitácora por tema (Clima, vueltas de cosecha, virosis y plantas muertas, plagas), cada una por Huerta y fecha.

#### Lógica de entrada de información

- Captura diaria por bitácora, por Huerta (y por Cuadro donde aplique). Datos exactos por definir con cada formato.

#### Procesamiento de información

- Por definir con cada bitácora.

#### Salida de información

- Indicadores técnicos → Panel Ejecutivo y comparación contra el costo por Cuadro.

#### Personas/puestos involucrados y sus permisos

- Capturan Supervisor de Huerta y Capturista de información; otras personas por definir según cada bitácora. Ven Dirección General, Gerente Técnico de Producción y Asistentes Técnicos. El Auditor ve en solo lectura.

#### Módulos que alimentan a este

- Unidades de Producción (Huertas, Cuadros, Ciclo).

#### Módulos que reciben información de este

- Aplicaciones (Clima como contexto), Panel Ejecutivo.

#### Pendientes de este módulo

- Todo el módulo está pendiente de construir.
- Datos, formato, nivel y uso de cada bitácora, con los formatos reales de la empresa.
- Cómo se relaciona “vueltas de cosecha” con Cosecha (9.8), que aún no está diseñado.
- Si los registros de plantas muertas deben afectar el conteo de plantas que usa el resto del sistema (plantas por hectárea del Marco de Plantación, 9.1).

## 10. Todo lo técnico

*(Arquitectura, backend, base de datos, frontend, offline. Es lo que menos se modifica y lo que menos necesita ver quien solo quiere entender la lógica de negocio — por eso va hasta acá.)*

### Enfoque general

- Dos clientes con necesidades distintas: **Teléfono (campo)** — requiere funcionar 100% offline, base de datos local propia. **PC (oficina/gerencia/contabilidad)** — se asume con internet estable la mayoría del tiempo, cliente más simple, siempre conectado al servidor.

### Teléfono — patrón “local-first + cola de sincronización”

- Base de datos local en el dispositivo (ej. SQLite) — captura instantánea sin depender de red.
- Patrón **outbox**: cada captura se apila en una cola local; en cuanto hay internet, se sube automáticamente en segundo plano.
- El servidor procesa, aplica todas las reglas de negocio (cascada de aplicación→inventario→mano de obra→costo, FIFO, prorrateos, etc.) y regresa al teléfono la versión oficial actualizada.
- Cálculos en el teléfono mientras está offline son provisionales; la verdad final la determina el servidor al sincronizar.

### PC — cliente web simple

- Aplicación web que se conecta directo al servidor/API (sin lógica offline). Para consulta de reportes, captura de oficina/contabilidad, administración de catálogos.
- **Precisión de implementación**: mientras no exista la app móvil nativa (React Native, fase posterior del plan), la app web se construyó **responsive** para poder usarse desde el navegador de un celular en campo — solución temporal, sin las capacidades offline del cliente móvil nativo (patrón local-first + cola de sincronización descrito arriba), pero utilizable mientras ese cliente no se construye.

### Servidor — dueño único de la lógica de negocio

- Toda la lógica compleja vive centralizada en el servidor (no duplicada por dispositivo).

### Manejo de errores

- Rutas de API no reconocidas devuelven 404 limpio en JSON, nunca la página HTML completa (si el frontend recibe HTML en lugar de datos, falla en silencio).

- **Error Boundary global en el frontend**: cualquier error de pantalla no controlado muestra un mensaje entendible con botón de recargar, en vez de dejar la app en blanco sin pistas.

- **Mensajes de error de base de datos nunca se muestran crudos al usuario.** Helper centralizado en el backend (`mensajeErrorCaptura`) que traduce cualquier error de Prisma a un mensaje en español entendible — aplicado en las rutas de captura de todos los módulos (aplicado en 14 rutas: Actividades, Fertilizantes Granular, Fertirriego, Aplicaciones, Equipos). Cualquier ruta de captura nueva debe usar este mismo helper, no mostrar `err.message` directo.

### Aislamiento de módulos y ambiente de pruebas

Objetivo: que modificar la lógica de un módulo no obligue a detener la operación de los demás, y que un bug a medio corregir en un módulo no tumbe el sistema completo. Son dos problemas distintos, con dos soluciones distintas:

#### A) Switch de comunicación por módulo

- **Por módulo completo,** no por integración individual — un solo switch apaga todas las comunicaciones automáticas que salen de ese módulo hacia los demás (ej. apagar Aplicaciones detiene sus cascadas hacia Almacén, Nómina, Unidades de Producción, Equipos y Compras, todas juntas).

- Pantalla “Configuración del sistema” con la lista de módulos y su switch — visible y operable solo por Director General o Encargado de Sistemas.

- **Esta misma pantalla también guarda datos reutilizables para documentos:** **Datos de Facturación de la empresa** (razón social, RFC, domicilio fiscal, teléfono) y **Firmas de Órdenes de Compra** (nombre de quien atiende / "Atentamente", y nombre de quien autoriza) — editables aquí cuando cambien, sin depender de quién generó/autorizó la orden dentro del sistema. Usados por la Orden de Compra en PDF (ver 9.14) y reutilizables en cualquier otro entregable futuro que los necesite.

- Pestaña “Catálogos” — vista consolidada de todos los catálogos abiertos del sistema, para verlos y administrarlos en un solo lugar: Tipo de aplicación (9.7), Zonas y su flete (9.14), Categoría de Almacén con su check “¿Requiere Ingrediente Activo?” (9.15), Ingrediente Activo (9.15), Contenedor (9.15), Marca (9.15), Centros de Costo (Bloque 3), Grupos de Pago (9.11) y los parámetros configurables (umbral de excedente de Compras, margen de la alerta de consumo). Cada catálogo se puede editar aquí y también en su módulo, respetando los permisos del módulo (regla completa en Bloque 4). Sin carga masiva por ahora.

<!-- -->

- Accesos y usuarios también vive en Configuración del sistema; lo administran Director General y Encargado de Sistemas (ver 9.12).

<!-- -->

- **Con el módulo apagado, los campos que normalmente se llenan automático se vuelven capturables a mano,** en la misma estructura de datos que ya existe — no es un canal aparte ni un registro paralelo, es la misma información entrando por teclado en vez de por cascada. Las etiquetas actuales en pantalla (ej. "Automático — Actividad") **no cambian** — no hace falta un indicador visual distinto de "pausado".

- **Aplica a todos los módulos,** aunque hoy algunos todavía no compartan información entre sí — se preparan desde ahora porque todos van a terminar generando cascada hacia Contabilidad y Panel Ejecutivo.

- **Es herramienta de desarrollo,** para cuando se está modificando código — no es un botón de apagar en producción por un incidente operativo.

- **Bitácora automática:** queda registrado solo, sin que nadie lo anote a mano, quién apagó/prendió cada switch y cuándo — para que un módulo no se quede apagado por accidente sin que nadie sepa por qué.

#### B) Ambiente de pruebas + manejo de errores robusto

Esto es lo que de verdad protege que un módulo roto no tumbe el resto del sistema — el switch de arriba resuelve la falta de datos automáticos, pero no evita que un bug de código tumbe el proceso completo (hoy todo corre en un solo proceso Node.js en la computadora servidor real).

- **Segunda copia del sistema en la misma computadora servidor,** corriendo en otro puerto, con su propia base de datos de prueba — no requiere otra máquina ni gasto adicional.

- La base de datos de prueba se llena con el último respaldo real (ver Respaldo de base de datos, en Stack tecnológico) — no datos inventados, para que las pruebas de Claude Code reflejen la operación real antes de tocar el servidor que se usa a diario.

- **Manejador de errores global en el backend** que atrape cualquier excepción de cualquier ruta y responda con un error controlado, sin matar el proceso completo — complementa el Error Boundary del frontend (ver Manejo de errores, arriba) desde el lado del servidor.

### Conflictos de sincronización

- El servidor intenta resolver automáticamente lo que pueda con reglas simples (ej. orden cronológico); lo que no pueda resolver de forma segura genera la alerta visible ya definida (Bloque 6), nunca decide solo cuando hay dinero/inventario de por medio.

### Stack tecnológico — decisión final

- Base de datos central: MySQL (compatibilidad con otra empresa del grupo).
- Backend/API: **Node.js** (mismo criterio).
- App móvil (Android + iPhone, un solo código): **React Native**.
- App de PC: aplicación **web en React**.
- Hosting: decisión temporal de V1 — corre en una computadora Windows local dedicada como servidor (siempre encendida), en vez de DigitalOcean, mientras el sistema lo usa un grupo reducido de personas. DigitalOcean queda como el plan de escalamiento futuro, cuando el proyecto crezca y más personas lo estén usando (ver Pendientes de este bloque).
  - **Acceso público estable sin dominio propio ni IP fija**: **Tailscale Funnel** (gratuito) — da una liga `https://[nombre].ts.net` fija que no cambia aunque la IP de internet del rancho/oficina cambie, sin necesidad de abrir puertos del router. Cualquier persona con la liga accede desde su navegador sin instalar nada.
  - **Requisitos operativos de la computadora servidor**: Windows configurado para que la aplicación se mantenga corriendo sola (se reinicia sola si la computadora se reinicia); suspensión e hibernación de Windows **desactivadas**; conectada a un **no-break (UPS)** para tolerar apagones cortos.
  - **Respaldo de base de datos**: ya no se usa el respaldo administrado de DigitalOcean (ver abajo) — se arma un respaldo diario manual, guardado en un lugar **distinto** a esa misma computadora (ej. Google Drive u otra máquina), para no perder todo si la computadora servidor falla.
  - **Claude Code se instala directamente en la computadora servidor** — la configuración del sistema operativo (Node.js, MySQL, Tailscale, arranque automático, etc.) no es código y no se puede mover por GitHub; tiene que ejecutarse físicamente en esa máquina. El acceso a esa computadora, si no está presente físicamente, es por Escritorio Remoto de Windows.
- Autenticación: usuario y contraseña simple — Dirección General (o el Encargado de Sistemas) da de alta a cada persona y resetea la contraseña si se olvida, sin flujo de recuperación automática por ahora.
- Repositorio de código: **GitHub**, con la cuenta del usuario.
- Respaldo de base de datos: ver detalle de respaldo manual arriba (reemplaza al respaldo automático de DigitalOcean mientras el hosting sea la computadora local).

### Contexto y rol de desarrollo

- Los usuarios de campo usan teléfonos mixtos (Android e iPhone) → se descarta desarrollar 2 apps nativas separadas.
- El dueño de la empresa no programará directamente — su rol es aportar la lógica de negocio, revisar y dar retroalimentación. Claude se encarga de organizar y generar el código.
- Sin presupuesto fijo definido; prioridad explícita: “hacerlo bien” sobre “hacerlo rápido”.

### Orden de construcción

- **Mockup antes que sistema real, confirmado**: mismo patrón que se usó con Nóminas — construir primero un mockup interactivo para validar el flujo completo antes de escribir el código del sistema real. Ya se construyó y validó: Nóminas, Recursos Humanos, Unidades de Producción (con Ciclos), Almacén, Compras, Equipos y Maquinaria (catálogo mínimo), Aplicaciones, Fertilizantes, Riego.

### Calidad y correcciones técnicas — revisión previa a producción

Antes de subir una versión a producción se recorren todos los módulos; los hallazgos y correcciones se registran en el Bloque 13. Reglas técnicas que quedaron de esos recorridos:

- Todas las rutas de API viven bajo /api/, para que nunca choquen con los nombres de las páginas (entrar por URL directa, refrescar o guardar como favorito siempre funciona).
- La fecha de “hoy” se calcula siempre en el huso horario de la empresa (México), nunca en horario de Greenwich.
- Los mensajes de error de formularios siempre están en español entendible, nunca en inglés ni en código.

### Pendientes de este bloque

- Detalle de cómo se manejan actualizaciones de la app en campo sin que el usuario tenga que reinstalar manualmente.

<!-- -->

- Diagnosticar la tarea programada de arranque automático del backend (CBF-ERP-Backend-Autostart), que se comporta de forma inconsistente al reiniciar; mientras tanto se usa arranque manual.

<!-- -->

- Riesgo de despliegue: reiniciar o reconstruir el backend no reconstruye el build compilado del frontend (web/dist), y un proceso viejo del backend puede quedarse corriendo tras un reinicio. Falta un checklist de despliegue (o automatización) para que Claude Code reconstruya el build y verifique el proceso en cada entrega.
- **Migración futura a DigitalOcean** (o proveedor equivalente en la nube) cuando el proyecto crezca y más personas lo estén usando — sin fecha definida todavía, revisar más adelante.

Bug conocido: el mecanismo de auditoría en core/db.ts puede dejar un dato guardado aunque el usuario vea un mensaje de error — el error mostrado no siempre refleja si de verdad se guardó. Falta decidir prioridad y corregir.

## 11. Interfaz — identidad de marca (móvil y PC)

### Identidad de marca

- **Logo**: ilustración retrato de mujer en blanco/negro dentro de arco tipo “escudo”, fondo amarillo/dorado, borde con degradado guinda/vino oscuro. Texto “CHULA” (grande) + “BRAND” (pequeño, debajo).
- **Paleta de colores de campaña**: rosa/magenta vibrante (dominante), amarillo/dorado, guinda/vino oscuro, turquesa/verde azulado, blanco y negro. Estilo tropical, vibrante, fresco — no corporativo tradicional.
- Uso en el ERP: aplicar esta paleta a la UI (botones, acentos, encabezados), manteniendo la interfaz limpia/funcional para uso diario en campo, tomando la esencia de color/identidad sin replicar el estilo de campaña al 100%.
- Archivo de logo recibido: versión limpia sobre fondo blanco (se confirmó que no se necesita la segunda versión con flores decorativas).
- **Pantalla de inicio de sesión (notas de prueba del sistema real)**: el bloque “CHULA / BRAND — ERP” va **centrado**, con el **logo arriba del texto**. El archivo del logo lo sube el usuario directo en Claude Code al construir la pantalla (no depende de este documento).

### Lineamientos de interfaz — forma y patrones de interacción

Lineamiento para todo el sistema, basado en una app de referencia de interfaz tipo “app nativa”: números grandes, formas muy redondeadas y patrones de captura de app. Claude Code lo sigue en cada pantalla nueva sin que se le pida. Se adopta la forma, no el modo oscuro: se mantiene la paleta clara (fondo \#F6F6FA, tarjetas blancas, acento rosa Chula \#E6127A).

- Teclado numérico propio — en pausa: se usa el teclado nativo del teléfono. Más adelante se evaluará rediseñar un teclado propio (basado en el patrón del teclado numérico de los teléfonos).

- **Números grandes y protagonistas:** los totales clave (Total a Pagar, Total de campaña completa, monto acumulado en vivo de Nómina — 9.11, Total con flete del Comparador — 9.14) se muestran en tipografía grande y centrada, con el resto de la información alrededor como secundaria — igual que el total en la pantalla principal de la app de referencia.

- Chips redondeados compactos, no campos de formulario que ocupan toda la fila: selectores como Fecha, Frecuencia, Huerta o Tipo de aplicación se muestran como chips pequeños tocables en línea (estilo “hoy ⌄”).

- **Iconos tipo emoji por categoría:** catálogos como Categoría de Almacén (9.15), Tipo de aplicación (9.7), Centros de Costo (Bloque 3) y Contenedor (9.15) llevan un emoji reconocible junto al nombre en listas y selectores — igual que 🚗 Auto, ☕ Antojos de la referencia — para escanear rápido visualmente en vez de leer texto.

- **Esquinas muy redondeadas en todo:** tarjetas, botones, chips, inputs — mismo lenguaje visual consistente en toda la interfaz, sin esquinas rectas.

### Paleta de color — tokens exactos

| Token              | Hex      | Uso                                                                                                                   |
|--------------------|----------|-----------------------------------------------------------------------------------------------------------------------|
| –pink (Rosa Chula) | \#E6127A | Botón principal, elemento activo del menú, FAB, ícono del Panel Ejecutivo. Reservado, no se usa en módulos regulares. |
| –pink-soft         | \#FDEBF3 | Fondo del elemento activo/seleccionado.                                                                               |
| –wine (Guinda)     | \#6B2140 | Header móvil, logo, login, ícono de Balance. No se usa en botones de uso diario.                                      |
| –wine-soft         | \#F5E9EE | Fondo de acentos guinda.                                                                                              |
| –bg                | \#F6F6FA | Fondo general de la app.                                                                                              |
| –surface           | \#FFFFFF | Tarjetas, sidebar, header, barra inferior.                                                                            |
| –border            | \#E8E8EF | Bordes y separadores, siempre sutiles.                                                                                |
| –ink               | \#22242B | Texto principal.                                                                                                      |
| –ink-soft          | \#6B7280 | Texto secundario/etiquetas.                                                                                           |
| –ink-faint         | \#9CA3AF | Texto terciario/placeholders.                                                                                         |

**Colores por módulo** (pastel de fondo + ícono sólido, ninguno usa rosa ni guinda):

| Módulo                                             | Fondo    | Ícono                                     |
|----------------------------------------------------|----------|-------------------------------------------|
| Personal/RH                                        | \#EEF1FE | \#5B6EF5 (índigo)                         |
| Asistencia (vista dentro de Nómina)                | \#FFF7E6 | \#D98F1F (ámbar)                          |
| Destajo/Nómina                                     | \#E8F8EF | \#1B8F55 (verde)                          |
| Actividades                                        | \#F3EEFE | \#8B5CF6 (violeta)                        |
| Aplicaciones                                       | \#E7F6FC | \#2AA9E0 (celeste)                        |
| Fertilizantes                                      | \#E6FBF8 | \#14B8A6 (verde azulado)                  |
| Riego                                              | \#EAF2FE | \#3B82F6 (azul de agua)                   |
| Almacén                                            | \#FFF1E6 | \#F97316 (naranja)                        |
| Combustible (vista dentro de Equipos y Maquinaria) | \#FDECEA | \#E1483F (rojo)                           |
| Equipos y Maquinaria                               | \#EEF1F4 | \#64748B (gris pizarra)                   |
| Unidades de Producción                             | \#F5EFE6 | \#8B5E34 (café/tierra)                    |
| Balance (financiero)                               | \#F5E9EE | \#6B2140 (guinda — excepción intencional) |
| Panel Ejecutivo                                    | \#FDEBF3 | \#E6127A (rosa — excepción intencional)   |

Regla al agregar un módulo nuevo: color pastel/sólido que no se repita, y que no sea rosa ni guinda salvo jerarquía especial (financiero o dashboard ejecutivo). Colores de estado (semánticos): éxito verde \#1B8F55 · alerta/crítico rojo \#E1483F · advertencia ámbar \#D98F1F · informativo celeste \#2AA9E0.

### Tipografía

- Encabezados, KPIs, nombres de módulo, botones → **Plus Jakarta Sans** (peso 600–800).
- Cuerpo de texto, tablas, datos, formularios → **Inter** (peso 400–600).
- Tamaños base: título de sección 15–16px · KPI grande 20–22px · texto de tabla 12.5–13px · etiquetas/tags 10.5–11.5px.

### Formas y espaciado

| Token       | Valor                 | Uso                                     |
|-------------|-----------------------|-----------------------------------------|
| –radius-lg  | 20px                  | Contenedores grandes                    |
| –radius-md  | 14px                  | Tarjetas, paneles, módulos              |
| –radius-sm  | 10px                  | Ítems de menú, chips                    |
| Botones/FAB | Circular/pill (999px) | Botón principal, FAB, filtros tipo pill |

Nada de esquinas cuadradas. Bordes siempre sutiles, nunca líneas duras negras.

### Layout por plataforma

*(El patrón general — sidebar, header, bottom nav, FAB — ya está descrito en el bloque 5, “Vistas”. Aquí solo lo específico de marca que no vive ahí: medida exacta del sidebar y color exacto del degradado móvil.)*

- Sidebar de escritorio: **~212px** de ancho.
- Degradado del header móvil: **guinda** (tono de marca, ver paleta de color arriba).

### Pendientes de este bloque

- Asignar color a los módulos que aún no lo tienen (Compras, Vivero, Monitoreo, Cosecha, Empaque, Embarques, Notificaciones, Auditoría).

## 12. Índice de pendientes y preguntas abiertas

(Solo apuntadores cortos. El detalle de cada punto vive únicamente en los Pendientes de su ficha o bloque.)

- Bloque 3 (Centros de costo) — sin pendientes.
- Bloque 4 (Permisos) — matices de “Editar”; auditoría de lo no editable; tope de Compras.
- Bloque 5 (Vistas) — iconografía; vista móvil (prioritaria).
- Bloque 6 (Reglas) — catálogo de conflictos de sincronización; factibilidad de WhatsApp/OCR.
- Bloque 8 (Personas) — permisos de la Rama de Contabilidad.
- 9.1 Unidades de Producción — reasignación de Huerta a otro Supervisor.
- 9.3 Vivero — construir todo el módulo; medición de agua en vivero.
- 9.4 Actividades — restricción por etapa del Ciclo.
- 9.5 Fertilizantes — corrección visual de las Órdenes; encuesta post-aplicación; pendientes de los técnicos.
- 9.6 Riego — litros de agua aplicados.
- 9.7 Aplicaciones — gasolina de la planta de luz del Drone; migración de recetas; mejoras de interfaz; verificar plazos de 15 días y permisos de programación.
- 9.8 a 9.10 Cosecha, Empaque, Embarques — diseño completo, incluido el reparto de pagos grupales.
- 9.11 Nómina — validar sueldo anual y fecha catorcenal; verificar quincenal; faltas/bajas del mensual por adelantado; Bono, Despensa y Tortilla; reparto con la empresa asociada; blindar el servidor.
- 9.12 Recursos Humanos — sin pendientes.
- 9.13 Equipos y Maquinaria — Reporte rápido de cargas y rol Operador; gasolina de la planta de luz; verificar notificación de alerta y aviso de Rancho actual; forma de pago de cargas.
- 9.14 Compras — verificar notificación de flete; descarga de varios PDFs a la vez; etiqueta del mejor Local; mejoras de interfaz.
- 9.15 Almacén — marcar físicamente los lotes existentes; Almacén Local de Vivero.
- 9.16 Contabilidad — precios de transferencia; catálogo de cuentas; amortización.
- 9.17 Auditoría y 9.18 Panel Ejecutivo — construir; KPI M.O.; calificación de proveedores.
- 9.20 Monitoreo — construir; formato de cada bitácora.
- Bloque 10 (Técnico) — actualizaciones de la app; checklist de despliegue; arranque automático; bug de core/db.ts; migración a la nube.
- Bloque 11 (Interfaz) — colores de módulos faltantes.
- Bloque 14 (Diagramas) — regenerar el diagrama del Nivel 1.

Módulos diseñados pero fuera del alcance de esta primera versión: Vivero (9.3), Cosecha (9.8), Empaque (9.9), Embarques (9.10), Contabilidad (9.16), Auditoría (9.17), Panel Ejecutivo (9.18) y Monitoreo (9.20).

## 13. Historial de modificaciones — cronología completa (todos los módulos y bloques, por fecha)

- **\[5. Vistas\]** Especificación visual validada contra el mockup interactivo conforme se fue construyendo cada módulo (Nóminas primero, después Almacén/Aplicaciones/Fertilización/Riego).

<!-- -->

- **\[6. Reglas\]** Reglas transversales confirmadas en distintas rondas de preguntas, 27/28-jul-2026.

<!-- -->

- **\[9.11 Nómina\]** Mockup interactivo construido y validado contra el Excel real de nómina de CBF — resolvió los 4 esquemas de pago, tarifa general, “Depende de Empacadores”, cierre del día con periodo de gracia, préstamos, bonos, día de corte configurable, exportable “sobre”.
- **\[9.11 Nómina\]** Sesión posterior con el Excel de nómina actualizado: 102 nombres de Personal y actividades vigentes confirmadas como datos semilla; códigos de Huerta descartados a favor de nombres reales.

<!-- -->

- **\[9.17 Auditoría\]** Requisito de bitácora completa, presente desde el diseño inicial del sistema.

<!-- -->

- **\[9.18 Panel Ejecutivo\]** Reportes y KPIs clave identificados desde el diseño inicial.

<!-- -->

- **\[10. Todo lo técnico\]** Arquitectura propuesta desde el diseño inicial (offline-first, servidor central).

<!-- -->

- **\[11. Interfaz — identidad de marca\]** Especificación visual validada contra el mockup interactivo conforme se construyó cada módulo.

<!-- -->

- **\[9.11 Nómina\]** 27-jul-2026: hueco de destajo+sueldo fijo detectado; descuento de préstamos solo visible en Nómina semanal.

<!-- -->

- **\[General (Bloque 13 original)\] 27-jul-2026**: hueco de destajo+sueldo fijo detectado; timing de bonos aclarado; decisión de visibilidad de préstamos.

<!-- -->

- **\[2. Acuerdos generales del sistema\]** 28-jul-2026: definición inicial del alcance (1 rancho, 28 ha, preparado para escalar), relación con empresa hermana.

<!-- -->

- **\[3. Centros de costo\]** 28-jul-2026: lista inicial de centros de costo identificados, y lista revisada propuesta por separado, con traslape pero sin conciliar.

<!-- -->

- **\[4. Permisos\]** 28-jul-2026: diseño original del flujo “Supervisor propone, Gerencia/Directivo autoriza”, genérico.

<!-- -->

- **\[8. Personas involucradas / puestos\]** 28-jul-2026: catálogo de roles preliminar (Encargado de Huerta, Encargado de Bodega, Personal de mantenimiento, Gerencia, Contabilidad).

<!-- -->

- **\[General (histórico bloques 1-8)\] 28-jul-2026**: definición inicial de casi todo lo de este bloque — alcance del sistema, Huerta/Cuadro/Ciclo, Centros de Costo (primera lista), catálogo de roles preliminar, retroalimentación completa del Director General.

<!-- -->

- **\[9.1 Unidades de Producción\]** 28-jul-2026: definición inicial de Huerta/Cuadro/Ciclo, campos propuestos de Cuadro (Marco de Plantación aprobado, GPS/polígono descartado a favor de campos personalizados abiertos).
- **\[9.1 Unidades de Producción\]** 28-jul-2026 (retroalimentación Director General): Variedad como eje de rendimiento (distinto de Cuadro para costeo); composición varietal de cuadros de prueba.

<!-- -->

- **\[9.3 Vivero\]** 28-jul-2026: confirmado que CBF produce su propia plántula, sin necesidad de módulo propio por ahora.

<!-- -->

- **\[9.4 Actividades\]** 28-jul-2026: lógica confirmada — catálogo, planeación vs. registro, estructura variable por tipo de actividad.

<!-- -->

- **\[9.5 Fertilizantes\]** 28-jul-2026: módulo priorizado, tipos de fertilizante, frecuencia de fertirriego.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 28-jul-2026: secuencia formal de sucesos.

<!-- -->

- **\[9.8 Cosecha\]** 28-jul-2026: reglas base de cosecha por remolque, costeo, mecánica multi-cuadro resuelta (sin báscula).
- **\[9.8 Cosecha\]** 28-jul-2026 (retroalimentación Director General): matiz de remolque multi-cuadro para variedad, cuadrillas con nombre fijo confirmadas contra Excel real.

<!-- -->

- **\[9.9 Empaque\]** 28-jul-2026: reglas de costeo (prorrateo), flujo físico, selección de destino en línea.

<!-- -->

- **\[9.10 Embarques\]** 28-jul-2026: embarques como centro de costo separado, ligado a Empaque; embarque de un solo cliente; ventas y facturación.

<!-- -->

- **\[9.11 Nómina\]** 28-jul-2026: modelo validado por el Director General (“la estructura de Nahum puede funcionar” — catálogo de empleados/actividades, tabla de tarifas bloqueada, autocálculo).
- **\[9.11 Nómina\]** 28-jul-2026 (retroalimentación Director General): matiz de tarifa de empaque (no es única), cuadrillas de corte con nombre fijo.

<!-- -->

- **\[9.12 Recursos Humanos\]** 28-jul-2026: campos base, do-not-hire list.
- **\[9.12 Recursos Humanos\]** 27/28-jul-2026: documentos digitales en dos formas.

<!-- -->

- **\[9.13 Equipos y Maquinaria\]** 28-jul-2026: reglas base, alertas de consumo, camionetas a diésel.

<!-- -->

- **\[9.14 Compras\]** 28-jul-2026: flujo completo revelado al preguntar sobre Proveedores.

<!-- -->

- **\[9.15 Almacén\]** 28-jul-2026: reglas de lote/FIFO/alertas de reorden, vencimiento a 15 días.
- **\[9.15 Almacén\]** 28-jul-2026: bodega única, calculadora de dosis, recepción flexible, refacciones compartidas, Almacén General.

<!-- -->

- **\[9.16 Contabilidad\]** 28-jul-2026: banco de preguntas contestado en su mayoría por el Director General (capitalización, USD/MXN, cierre de cuadro en descanso).

<!-- -->

- **\[General (Bloque 13 original)\] 28-jul-2026**: primera versión extensa del documento — alcance del sistema, Huerta/Cuadro/Ciclo, Centros de Costo (primera lista), catálogo de roles preliminar, mano de obra y esquemas de pago, Equipos y Maquinaria, Actividades, Fertilización priorizada, banco de preguntas contestado (Equipos, Actividades, Inventario, Cosecha/Empaque/Embarques, Contabilidad, Personal, Fertilización), retroalimentación completa del Director General (21 comentarios), segunda ronda de preguntas (Asistencia, Almacén General, Proveedores→Compras, Clientes, Vivero).

<!-- -->

- **\[4. Permisos\]** 30-jul-2026: regla de autorización simultánea.

<!-- -->

- **\[General (histórico bloques 1-8)\] 30-jul-2026**: auditoría externa de flujos y permisos — resolvió reglas de autorización y candados de control.

<!-- -->

- **\[9.1 Unidades de Producción\]** 30-jul-2026: concepto de Sección de Riego documentado.

<!-- -->

- **\[9.6 Riego\]** 30-jul-2026: concepto documentado, sin diseño de detalle.

<!-- -->

- **\[9.10 Embarques\]** 30-jul-2026: corrección de la relación Cosecha↔Nómina (dos caminos conviven).

<!-- -->

- **\[9.14 Compras\]** 30-jul-2026: tope de autorización en concepto.

<!-- -->

- **\[9.15 Almacén\]** 30-jul-2026 (auditoría externa): remisión, bajas/mermas, resolución de alarma.

<!-- -->

- **\[General (Bloque 13 original)\] 30-jul-2026**: mockup interactivo de Nóminas construido y validado contra el Excel real de CBF; auditoría externa de flujos y permisos (remisión, bajas/mermas, autorización simultánea, relación Cosecha↔Nómina); concepto de Sección de Riego y Almacén Local documentados.

<!-- -->

- **\[2. Acuerdos generales del sistema\]** 4-ago-2026: caso de uso ancla formalizado como principio general, tras validarse de punta a punta en el mockup con Aplicaciones.

<!-- -->

- **\[3. Centros de costo\]** 4-ago-2026: estructura consolidada de un jalón — Producción como KPI compuesto (Desarrollo+Cosecha+Empaque), corte de etapas de costo, nivel de detalle Cuadro+Variedad, Bodega como capital inmovilizado a nivel empresa, Indirectos/Prorrateables confirmado como paraguas.

<!-- -->

- **\[4. Permisos\]** 4-ago-2026: mapeo de cada tipo de propuesta a un rol real específico (una vez que existió el organigrama); matriz completa módulo × rol construida.

<!-- -->

- **\[5. Vistas\]** 4-ago-2026: aclaración explícita de que el sistema visual es reutilizable pero el layout/información de cada módulo no se fuerza a parecerse a otro.

<!-- -->

- **\[6. Reglas\]** 4-ago-2026: corrección del alcance de QR/código de barras; ejemplo real de WhatsApp resuelto con las fotos del pizarrón.

<!-- -->

- **\[8. Personas involucradas / puestos\]** 4-ago-2026: organigrama completo construido por el usuario, cruzado contra los módulos del documento vivo. Resuelve: nombre definitivo de Supervisor de Huerta, rol de Encargado de Compras, rol de Auditor.

<!-- -->

- **\[General (histórico bloques 1-8)\] 4-ago-2026**: ronda grande de cierre — organigrama completo de roles, matriz de permisos, Centros de Costo consolidados, corrección de fondo de Ciclo a nivel Huerta, Marco de Plantación validado en mockup.

<!-- -->

- **\[9.1 Unidades de Producción\]** 4-ago-2026: corrección de fondo — el Ciclo pasa de vivir por Cuadro a vivir a nivel Huerta (sincronización de etapas, no existe replante a media cosecha); Sección de Riego con diseño completo (agrupamiento por válvula); construcción y validación en mockup del Marco de Plantación con cálculo automático de plantas totales.

<!-- -->

- **\[9.5 Fertilizantes\]** 4-ago-2026: análisis de laboratorio, equivalencia de terminología (LOTE=Huerta, SECTOR=Variedad).
- **\[9.5 Fertilizantes\]** 4-ago-2026 (validado en mockup): flujo completo de los dos caminos construido y probado de punta a punta; fórmula de plantas totales a partir de Marco de Plantación; regla de autorización de producto antes de comprarse.

<!-- -->

- **\[9.6 Riego\]** 4-ago-2026: diseño completado (agrupamiento por válvula, horas variables, dosis por rancho o sección, sin mano de obra variable, candado aplica igual).
- **\[9.6 Riego\]** 4-ago-2026 (validado en mockup): Secciones de Riego construidas dentro de Unidades de Producción, captura diaria de horas + confirmación de fertirriego, sin generar mano de obra — confirmado y probado.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 4-ago-2026: quién autoriza productos nuevos; mecanismo de abono precisado; confirmado exclusivo de agroquímicos.
- **\[9.7 Aplicaciones (Agroquímicos)\]** 4-ago-2026 (corrección de flujo, validada en mockup): dosis rediseñada como concentración + litros de mezcla; rango de fechas; campo de recurso gente/implemento; falta de stock ya no bloquea, genera pendiente en Compras; entrega y confirmación unificadas en un paso; descuento automático del Almacén Local; candado de “no reportar sin haber entregado”.

<!-- -->

- **\[9.11 Nómina\]** 4-ago-2026: prorrateo de personal administrativo resuelto (por hectáreas efectivas).

<!-- -->

- **\[9.13 Equipos y Maquinaria\]** 4-ago-2026: folios AF/IA como series separadas — confirmado contra el reporte de campo real.

<!-- -->

- **\[9.14 Compras\]** 4-ago-2026: precisión de precio unitario obligatorio.
- **\[9.14 Compras\]** 4-ago-2026 (validado en mockup): ciclo completo construido y probado — distinción automáticas/manuales, autorización previa a compra de producto para planta, apartado automático al recibir.

<!-- -->

- **\[9.15 Almacén\]** 4-ago-2026: catálogo abierto a más categorías.
- **\[9.15 Almacén\]** 4-ago-2026 (validado en mockup): módulo completo construido y probado, incluyendo la corrección de que entrega y confirmación se unifican en un solo paso.

<!-- -->

- **\[9.17 Auditoría\]** 4-ago-2026: diseño del módulo de consulta confirmado — exclusivamente de consulta, sin función de revertir.

<!-- -->

- **\[9.18 Panel Ejecutivo\]** 4-ago-2026: primera versión de la tabla de KPIs por módulo.

<!-- -->

- **\[10. Todo lo técnico\]** 4-ago-2026: stack tecnológico confirmado como decisión final (MySQL/Node/React Native/React); infraestructura de arranque confirmada (DigitalOcean, usuario/contraseña, GitHub, respaldo a 30 días); confirmado que se construye mockup antes que sistema real.

<!-- -->

- **\[General (Bloque 13 original)\] 4-ago-2026**: ronda grande de cierre — organigrama completo de roles, matriz de permisos módulo×rol, Centros de Costo consolidados, corrección de fondo de Ciclo a nivel Huerta (no por Cuadro), Marco de Plantación con cálculo automático de plantas, infraestructura técnica de arranque confirmada (DigitalOcean/GitHub/respaldo), y — la ronda más grande — construcción y validación en mockup de Almacén, Compras, Equipos y Maquinaria, Aplicaciones (con corrección completa de flujo: dosis en concentración+mezcla, rango de fechas, recurso gente/implemento, ruteo automático a Compras sin bloquear, entrega=confirmación en un paso), Fertilizantes (Granular y Fertirriego) y Riego.

<!-- -->

- **\[4. Permisos\]** 8-ago-2026: regla general de borrado/desactivación de catálogos, confirmada durante la construcción del sistema real.

<!-- -->

- **\[6. Reglas\]** 8-ago-2026: formato de fechas en la interfaz estandarizado a DD/MM/AAAA en todo el sistema.
- **\[6. Reglas\]** 8-ago-2026 (detectado durante pruebas del sistema real): “Solicitudes” se convierte en el módulo “Notificaciones” — centro unificado de alertas filtrado por permisos de puesto.

<!-- -->

- **\[8. Personas involucradas / puestos\]** 8-ago-2026: confirmado que choferes, jefes de cuadrilla, e Inocuidad/Velador/Con Acceso/Auxiliar no existen por ahora como puestos reales en CBF — cerrado, no se agregan al organigrama.

**\[General (histórico bloques 1-8)\] 8 al 20-ago-2026:** construcción del sistema real y primera ronda extensa de pruebas piloto — organigrama cruzado contra capacitación real (Bloque 8), regla general de borrado/desactivación de catálogos, formato de fechas DD/MM/AAAA en toda la interfaz, módulo "Notificaciones" (antes "Solicitudes"), y una serie larga de bugs reales encontrados y corregidos durante las pruebas (detalle completo en cada ficha de módulo — sección 9).

- **\[9.1 Unidades de Producción\]** 8-ago-2026 (detectado durante pruebas del sistema real): corregido el campo “variedad de papaya” duplicado — se quitó de Cuadro, vive solo en Ciclo; agregado el candado de superficie por variedad (suma no puede exceder hectáreas del Cuadro); quitado el límite de “10 filas” de la interfaz.

<!-- -->

- **\[9.5 Fertilizantes\]** 8-ago-2026: agregada la actividad “Fertilización” al catálogo de Nómina (ver 9.2); nota técnica de implementación de programar/realizada; candado de consistencia con Nómina cuando el día ya está cerrado.
- **\[9.5 Fertilizantes\]** 8-ago-2026: aplicada por consistencia de diseño la misma corrección de reporte de avance por Cuadro que en Aplicaciones (9.7) — ver detalle en la ficha, marcado como pendiente de confirmar en pruebas reales de este módulo específico.

<!-- -->

- **\[9.6 Riego\]** 8-ago-2026: color de módulo asignado (azul de agua, ver bloque 11); precisión de que el descuento de fertirriego es diario/acumulativo, con ajuste por diferencia al editar un día ya capturado.
- **\[9.6 Riego\]** 8-ago-2026 (detectado durante pruebas del sistema real): rediseño de Captura diaria a vista “Todas UPs” con tabla por Huerta (Secciones como filas); candado de motivo obligatorio si un fertirriego programado/entregado no se metió; nuevo submódulo de historial visual semanal (tabla calendario por Rancho, con indicador verde de fertirriego aplicado).

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 8-ago-2026: nota técnica de implementación de programar/realizada (ver 9.5).
- **\[9.7 Aplicaciones (Agroquímicos)\]** 8-ago-2026: definido el protocolo de cancelación de aplicación vencida a 15 días (reemplaza la idea original de “Liberar”) — permiso restringido a Director General/Gerente Técnico de Producción, aviso a Almacén, abono al Rancho, ajuste de inventario en ambos lados, firma digital de recepción del Encargado de Bodega.
- **\[9.7 Aplicaciones (Agroquímicos)\]** 8-ago-2026: candado de consistencia con Nómina cuando el día ya está cerrado.
- **\[9.7 Aplicaciones (Agroquímicos)\]** 8-ago-2026 (detectado durante pruebas del sistema real): corregido el “Paso 2, Registrar como realizada” para capturar Cuadro(s) y hectáreas avanzadas por reporte, con candado de suma acumulada por Cuadro, resumen de % de avance/horas-hombre, e historial de reportes editable por separado.
- **\[9.7 Aplicaciones (Agroquímicos)\]** 8-ago-2026: recurso pasa de fijo en Paso 1 a sugerencia/principal; nuevas modalidades Mochila/Turbina/Aguilón capturadas día a día, combinables en el mismo reporte, con líneas de Tractor+Operador+ Implemento+personas; alimenta automático a Uso diario (9.13); hectáreas restantes visibles y confirmación explícita antes de guardar; bug de construcción confirmado y acotado (Inventario no refleja recepción automática desde Compras, aunque sí funciona con entrada manual).

<!-- -->

- **\[9.11 Nómina\]** 8-ago-2026: cerrado el bug de destajo+sueldo fijo (bruto = sueldo + destajo, siempre se suman completos); descartadas las ~14 actividades candidatas adicionales del Excel.
- **\[9.11 Nómina\]** 8-ago-2026: definido el flujo de registro automático de mano de obra desde Aplicaciones/Actividades/Cosecha/Empaque — aparece marcado y bloqueado en Captura del día y en Cierre del día; después del cierre, requiere autorización de Encargado(s) de Nómina, Director General o Gerente Administrativo para entrar como caso extraordinario.
- **\[9.11 Nómina\]** 8-ago-2026: construida la pantalla de Grupos de Pago dentro de Nómina \> Catálogos.
- **\[9.11 Nómina\]** 8-ago-2026 (detectado durante pruebas del sistema real): rediseño de Cierre del día en dos pasos (resumen por Rancho + detalle por persona); vista “Todas UPs” para roles multi-rancho; edición de Captura del día habilitada (Supervisor antes de cerrar, roles gerenciales después de cerrado, con listado de días cerrados); candado de consistencia con módulos de origen cuando el día ya está cerrado.
- **\[9.11 Nómina\]** 8-ago-2026 (detectado durante pruebas del sistema real): rediseño del flujo “Aplicar descuento” de préstamos con estado visual por periodo y confirmación explícita al intentar adelantar un descuento; bug de construcción confirmado (descuento no se refleja en Reporte semanal).
- **\[9.11 Nómina\]** 8-ago-2026 (detectado durante pruebas del sistema real): corregida la estructura de Captura del día a tarjeta por persona con líneas de actividad independientes (cada una con su propio Rancho) — era una regresión respecto al mockup; Grupos de Pago pasa a catálogo global sin filtro de Huerta, con su propia pestaña.
- **\[9.11 Nómina\]** 8-ago-2026: definida la asistencia dinámica y sustitución dentro de un Grupo de Pago — checklist editable por día, regla de 3 días seguidos para volverse fijo/salir del grupo (exenta con falta justificada), reparto de pago excluyendo al ausente.
- **\[9.11 Nómina\]** 8-ago-2026 (detectado durante pruebas del sistema real): agregado el botón de quitar tarjeta completa de una persona en Captura del día — faltaba, solo existía el de quitar una línea de actividad suelta.
- **\[9.11 Nómina\]** 8-ago-2026 (detectado durante pruebas del sistema real): rediseño del exportable “sobre” en PDF — de una hoja por persona a 3 sobres por hoja (medida real 9×15 cm, horizontal), con contenido simplificado a total ganado por día en vez de detalle de actividades.

<!-- -->

- **\[9.13 Equipos y Maquinaria\]** 8-ago-2026: Uso diario se alimenta automático desde el reporte de avance de Aplicaciones (ver 9.7) cuando hay línea de Turbina/Aguilón, para no capturarlo dos veces.

<!-- -->

- **\[9.14 Compras (Comparador)\]** 8-ago-2026: propuesto y diseñado por el usuario — herramienta aparte de comparación, no genera órdenes; redondeo hacia arriba con precio total real y % de aprovechamiento; ahorro contra el promedio de proveedores; acceso abierto por ahora.

<!-- -->

- **\[9.14 Compras\]** 8-ago-2026: confirmado que el rol “Encargado de Compras” ya quedó resuelto con el organigrama de la sección 8 — cerrado, sin pendiente.
- **\[9.14 Compras\]** 8-ago-2026: agregado el submódulo Comparador de Cotizaciones (ver ficha arriba).
- **\[9.14 Compras\]** 8-ago-2026: confirmado “sin tope por ahora” para el umbral de autorización de compras manuales, durante la construcción del sistema real.
- **\[9.14 Compras\]** 8-ago-2026 (detectado durante pruebas del sistema real): agregado el submódulo Cuentas por Pagar (CxP) — crédito como término general por Proveedor, ciclo de pago semanal (viernes), alerta desde el miércoles anterior, visible en Compras y en Notificaciones.
- **\[9.14 Compras\]** 8-ago-2026 (detectado durante pruebas del sistema real): la tarjeta de una orden “Recibida” ahora debe mostrar fecha y cantidad real recibida.

<!-- -->

- **\[9.15 Almacén\]** 8-ago-2026 (detectado durante pruebas del sistema real): presentación de producto separada en 3 campos (contenedor/cantidad/unidad), con candado de campos obligatorios y catálogo de contenedores.
- **\[9.15 Almacén\]** 8-ago-2026 (detectado durante pruebas del sistema real): fusión de “Catálogo” e “Inventario” en una sola pestaña “Inventario” — tabla con stock, búsqueda libre (3 campos), filtros estructurados combinables, detalle de producto (totales/lotes/movimientos) en vista aparte con navegación de regreso.
- **\[9.15 Almacén\]** 8-ago-2026: categoría e ingrediente activo confirmados como catálogos abiertos (botón “+”); ingrediente activo solo se pide si la categoría es agroquímico o fertilizante.

<!-- -->

- **\[10. Todo lo técnico\]** 8-ago-2026: app web construida como responsive, para uso temporal desde celular en campo mientras no exista la app móvil nativa.
- **\[10. Todo lo técnico\]** 8-ago-2026: hosting cambiado temporalmente de DigitalOcean a una computadora Windows local (siempre encendida) con Tailscale Funnel para acceso público estable sin dominio ni IP fija — DigitalOcean queda como plan de escalamiento futuro.

<!-- -->

- **\[11. Interfaz — identidad de marca\]** 8-ago-2026: definido el layout de la pantalla de login (texto centrado, logo arriba).

<!-- -->

- **\[8. Personas involucradas / puestos\]** 10-ago-2026: organigrama cruzado contra la lista de asistentes a una capacitación reciente. Confirmado que Director General, Gerente Técnico de Producción (antes listado como “Ingeniero Técnico de Nutrición”), Asistentes Técnicos, Gerente Administrativo, Gerente de Mantenimiento, Encargado de Sistemas, Encargado de Compras y Encargado de Bodega son los mismos puestos ya existentes, sin cambio de permisos. Agregado el puesto nuevo **Capturista de información** (mismo alcance que Supervisor de Huerta, sin autorizar). Anotada como **pendiente** la rama ampliada de Contabilidad (Director de Contaduría, Gerente Fiscal, Gerente Contabilidad, Auditorías Contables), a resolver cuando se construya el módulo de Contabilidad (9.16). **Confirmado que “Producción Limones” (Gerente y Supervisor) queda fuera del alcance de este sistema** — no es una línea de negocio que este ERP vaya a operar.

<!-- -->

- **\[9.4 Actividades\]** 10-ago-2026: diseño de construcción como módulo real con el mismo patrón de dos pasos que Aplicaciones — avance por Cuadro con candado acumulado, confirmación antes de guardar, resumen de avance, historial de reportes editable, precarga de personas. Alcance inicial: Bodega, Ahoyado, Siembra, Vivero, Chapeo, Tirar Cinta, Limpieza. Nómina cambia de rol — pasa a ser resumen + ajustes puntuales, en vez de captura principal.

<!-- -->

- **\[9.5 Fertilizantes\]** 10-ago-2026: soporte de varios productos en la misma fertilización, tanto en Granular (dosis independiente por producto, sin litros de mezcla compartido) como en Fertirriego (mismo mecanismo que Aplicaciones, litros de agua/ha compartido); avance compartido con descuento de Almacén individual por producto; precarga automática de personas/maquinaria del reporte del día anterior.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 10-ago-2026: soporte de varios productos en la misma aplicación (mismo tanque, misma densidad por hectárea, dosis propia por producto), con avance compartido y descuento de Almacén individual por producto; precarga automática de personas/maquinaria del reporte del día anterior en el reporte de avance.

<!-- -->

- **\[9.11 Nómina\]** 10-ago-2026: confirmado construido y probado el rediseño del sobre en PDF (bug de traslape de texto en TOTAL A PAGAR también corregido en el proceso). Bug de destajo+sueldo fijo confirmado cerrado — nunca fue un bug real, verificado en el código. Tarifa general por hora y esquema “Depende de Empacadores” quedan marcados como “pendiente de revisar” — Diego confirma que ya se construyeron hace varias sesiones, pero pide una revisión de confirmación contra el sistema real antes de darlos por cerrados del todo.
- **\[9.11 Nómina\]** 10-ago-2026: Captura del día cambia de rol tras la construcción de Actividades (9.4) como módulo real — pasa de ser el lugar principal de captura a ser resumen por persona + ajustes puntuales, con la mayoría de las tareas llegando automáticas.

<!-- -->

- **\[8. Personas involucradas / puestos\]** 11-ago-2026: **Capturista de información construido y confirmado** en el sistema de permisos — puede capturar en Aplicaciones, Fertilizantes y Actividades. Reconfirmado que Contabilidad y “Producción Limones” siguen fuera de alcance de esta etapa.

<!-- -->

- **\[9.4 Actividades\]** 11-ago-2026: **construido y confirmado por Claude Code** — las 7 actividades del alcance inicial, mismo patrón de dos pasos, sin producto/insumo ni maquinaria (solo personas y horas). Alimenta Nómina automático.
- **\[9.4 Actividades\]** 11-ago-2026: **confirmado con Diego** — el avance diario por Cuadro y hectáreas sí se mantiene, calcado de Aplicaciones (mismo candado de suma acumulada, hectáreas restantes visibles, confirmación antes de guardar, % de avance y costo total de la tarea calculados por ese mismo desglose). Cerrada la ambigüedad.

<!-- -->

- **\[9.5 Fertilizantes\]** 11-ago-2026: **construido y confirmado** — múltiples productos por Aplicación/Fertilización, con cambios de base de datos. **Bug real encontrado y corregido durante la construcción**: cuando dos productos comprometían stock al mismo tiempo, el sistema solo procesaba el primero correctamente y daba por hecho el segundo, sin revisar si había existencia ni generar su propia orden de compra si faltaba — ya corregido, cada producto se revisa y procesa por separado.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 11-ago-2026: **construido y confirmado, probado de punta a punta** (programar → compra automática → cotizar → recibir en Almacén → confirmar entrega → registrar avance con Turbina), reflejado correctamente en Nómina, Almacén y Equipos. Bug real de procesamiento de stock con 2 productos simultáneos encontrado y corregido — ver detalle en Fertilizantes (9.5), mismo bug y misma corrección aplica aquí.

<!-- -->

- **\[9.11 Nómina\]** 11-ago-2026: **confirmado** que Captura del día sigue funcionando correctamente para registros manuales/ajustes después de todos los cambios de la sesión (Actividades, multi-producto, precarga). Esquema “Depende de Empacadores” — bug real de división corregido (ver Pendientes). **Bug de huso horario corregido** (ver detalle técnico en bloque 10) — afectaba directamente el cierre de día, los periodos de pago y los bonos de este módulo cuando la captura se hacía aproximadamente entre las 6 p.m. y la medianoche.

<!-- -->

- **\[10. Todo lo técnico\]** 11-ago-2026: revisión de calidad a fondo previa a producción — bug de navegación (rutas bajo `/api/`), bug de huso horario (Greenwich → México, 21 lugares corregidos), y 7 problemas más de formularios y manejo de errores, todos corregidos. Ver detalle arriba.

<!-- -->

- **\[General (Bloque 13 original)\] 11 al 20-ago-2026:** revisión de calidad a fondo previa a producción (bug de navegación, bug de huso horario en 21 lugares, 7 problemas más de formularios); construcción y confirmación de Actividades como módulo real; primera prueba piloto real con bugs críticos encontrados y corregidos (pantalla en blanco de Captura del día, Operador designado en Implementos); aislamiento de módulos y ambiente de pruebas; manejo de errores robusto en todo el sistema. Detalle completo en cada ficha de módulo y en el Bloque 10.

<!-- -->

- **\[9.6 Riego\]** 12-ago-2026: confirmado construido (auditoría de código vs. documento) — la alarma de descuadre a 15 días, que el documento tenía marcada como pendiente por error.

<!-- -->

- **\[9.11 Nómina\]** 12-ago-2026: **auditoría completa de código vs. documento** (primera versión ya subida) — confirmado corregido el bug de descuentos de préstamo en \$0.00 del Reporte semanal. Confirmado que **Tarifa general por hora es el único bloqueo real que sigue pendiente** (falta capturar el valor, el mecanismo ya está construido) — ver Pendientes.

<!-- -->

- **\[9.13 Equipos y Maquinaria\]** 12-ago-2026: confirmado construido (auditoría de código vs. documento) — alertas de consumo anómalo, umbral de 30% de desviación contra histórico propio de cada equipo.

<!-- -->

- **\[9.15 Almacén\]** 12-ago-2026: confirmado construido (auditoría de código vs. documento) — la alarma de descuadre a 15 días, que el documento tenía marcada como pendiente por error.

<!-- -->

- **\[4. Permisos\]** 15-ago-2026 (detectado durante pruebas del sistema real): identificado que el catálogo de Actividades no tiene botón de agregar en la app real — pendiente de migrarlo al módulo de Actividades (ver 9.4) con el patrón abierto estándar.

<!-- -->

- **\[5. Vistas\]** 15-ago-2026 (detectado durante pruebas del sistema real): identificados problemas de viewport/zoom automático en la vista móvil (iPhone) que hacen incomoda la captura — marcado como prioridad técnica, ver Pendientes de este bloque. También confirmado el reordenamiento del sidebar (ver Layout por plataforma abajo).

<!-- -->

- **\[9.4 Actividades\]** 15-ago-2026: resuelto el bug de "El Cuadro elegido no tiene una configuración vigente para la fecha de inicio" al programar una Actividad — la causa real era la Tarifa general por hora faltante (ver 9.11), no un problema de configuración del Cuadro/Ciclo. Pendiente corregir el mensaje de error para que sea claro.
- **\[9.4 Actividades\]** 15-ago-2026: reabierta la decisión de que Actividades no maneja maquinaria — ahora sí maneja recurso gente/tractor/mixto, misma estructura que Aplicaciones. Confirmado que el catálogo de Actividades sigue viviendo en Nómina, pendiente de migrar. Reportado que algunas actividades ya dadas de alta no aparecen al programar, pendiente de diagnosticar (etapa vs. bug).

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 15-ago-2026: eliminada la categoría genérica "Agroquímico" — los productos se dan de alta con su tipo específico (fungicida, herbicida, foliar, estimulante, protector, enraizador, extracto natural, etc.), sin lista cerrada.

<!-- -->

- **\[9.11 Nómina\]** 15-ago-2026: agregado el submódulo Liquidaciones — pago fuera de ciclo para personal eventual que deja de venir a mitad del periodo, con cálculo automático de días trabajados y bonos, alerta de préstamo pendiente, rango a nivel empresa (no por Huerta), sobre en PDF aparte, sin disparar Baja automática en RH.

<!-- -->

- **\[9.13 Equipos y Maquinaria\]** 15-ago-2026 (detectado durante pruebas del sistema real): agregado el campo opcional "Operador designado" a la ficha de equipo — obligatorio en la práctica para camionetas y equipo grande, variable para tractores pequeños (sobre todo en cosecha).

<!-- -->

- **\[9.14 Compras (Comparador)\]** 15-ago-2026: confirmado el diseño como correcto — sigue pendiente de construir, y además pendiente de refinar contra un Excel real que Diego ya tiene corriendo en la operación, con modificaciones/especificaciones aún no compartidas. No se cierra hasta recibir ese Excel.

<!-- -->

- **\[9.4 Actividades\]** 16-ago-2026 (prueba piloto): confirmado el atajo "seleccionar toda la Huerta" en Programar; confirmada la selección múltiple de personas con horas vacías en Registrar avance; detectado bug de duplicados al agregar la misma persona dos veces en una línea (error crudo de base de datos al guardar).

<!-- -->

- **\[9.11 Nómina\]** 16-ago-2026 (prueba piloto): detectado bug crítico de pantalla en blanco en Captura del día al entrar después de completar el flujo de una Aplicación — bloqueó el resto de la prueba piloto. Ver detalle en Pendientes de este módulo, prioridad máxima.

<!-- -->

- **\[9.13 Equipos y Maquinaria\]** 16-ago-2026 (detectado durante la prueba piloto): confirmado que Operador designado es exclusivo de AF, no aplica a Implementos (IA). El sistema real todavía lo muestra en la ficha de Implementos — pendiente de quitarlo.

<!-- -->

- **\[5. Vistas\]** 20-ago-2026 (prueba piloto, capturas adicionales): documentados ejemplos concretos del problema de vista móvil — tarjetas/tablas cortadas horizontalmente (Compras → Órdenes, Nómina → Reporte semanal) y texto amontonado en columnas angostas (Actividades → Historial de reportes). Mismo pendiente prioritario de arriba, con evidencia adicional.

<!-- -->

- **\[9.4 Actividades\]** 20-ago-2026: construido el checkbox "Toda la Huerta" en Programar. Construido el selector múltiple de personas (checklist) en Registrar avance, reemplazando "+ Otra persona" — excluye automáticamente a quien ya está en la línea, cerrando por diseño el bug de duplicados detectado el 16-ago-2026.

<!-- -->

- **\[9.5 Fertilizantes\]** 20-ago-2026: construido el checkbox "Toda la Huerta" al programar en el Camino 1 (Granular), mismo mecanismo que Actividades (9.4) y Aplicaciones (9.7). No aplica a Fertirriego (Camino 2), que programa por Sección de Riego.
- **\[9.5 Fertilizantes\]** 20-ago-2026: diseñado el Recetario y el cálculo de mezcla por tanque/recipiente para Fertilizantes, enviado a construir. 25-ago-2026: corregido el alcance a Fertirriego (Camino 2) — Granular (Camino 1) no aplica, por incompatibilidad de modelo de dosis. Confirmado construido — ver detalle completo en 9.7 y en la ficha de Camino 2 arriba.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 20-ago-2026: construido el checkbox "Toda la Huerta" al programar, mismo mecanismo que Actividades (9.4).
- **\[9.7 Aplicaciones (Agroquímicos)\]** 20-ago-2026: diseñado el Recetario y el cálculo de mezcla por tanque/recipiente, enviado a construir a Claude Code el mismo día. 25-ago-2026: confirmado construido — alcance corregido en la sesión de construcción a Fertirriego (9.5, Camino 2), no Granular; ver detalle completo aquí mismo.

<!-- -->

- **\[9.11 Nómina\] 20-ago-2026: BUG CRÍTICO RESUELTO.** Causa raíz: una llamada del frontend a una ruta de API que ya no existía (renombrada al mover el catálogo de Actividades el 15/16-ago-2026) — el backend, al no reconocerla, servía por error la página HTML completa en vez de un 404, y el frontend tronaba silenciosamente al tratarla como datos. Corregido en tres niveles: (1) la llamada rota en el frontend, (2) el backend ahora responde 404 limpio en JSON para cualquier ruta de `/api/...` no reconocida en vez de servir el HTML (ver 10, Manejo de errores), y (3) se agregó un Error Boundary global para errores similares a futuro. Además, se corrigió de fondo el mismo patrón de error crudo de Prisma expuesto al usuario en 14 rutas de captura del sistema (Actividades, Fertilizantes Granular, Fertirriego, Aplicaciones, Equipos), centralizado en un helper que traduce a mensajes en español.

<!-- -->

- **\[9.13 Equipos y Maquinaria\]** 20-ago-2026: corregido — Operador designado quitado de la ficha de Implementos, bloqueado también del lado del servidor. AF sin cambios.
- **\[9.13 Equipos y Maquinaria\]** 20-ago-2026 (prueba piloto): detectado que el selector de producto para Diésel de garrafa muestra el catálogo completo del Almacén sin filtrar por categoría — pendiente de corregir para que solo muestre productos de combustible.

<!-- -->

- **\[9.15 Almacén\]** 20-ago-2026: agregado Producto preferido y Sustitutos autorizados por Ingrediente Activo, para homologar qué marca se compra. No afecta el FIFO de consumo, solo la decisión de compra. Sustitutos solo se autorizan con la misma dosificación que el preferido. Flujo manual en Compras. Permisos: Director General y Gerente Técnico de Producción.

<!-- -->

- **\[9.1 Unidades de Producción\]** 25-ago-2026: se detectó vacía la Sección de Riego "1" de Sonrisal, investigado como posible incidente. 26-ago-2026: aclarado — Diego la borró a propósito para reconstruirla con datos reales, no fue un bug ni una pérdida (ver Pendientes de este módulo).

<!-- -->

- **\[9.5 Fertilizantes\]** 25-ago-2026: diseñada la Orden de Fertirriego (documento para el Encargado de Riego) — desglose por válvula (Sección de Riego), Total por riego, Total de la semana calculado automático desde la Frecuencia. Mismas reglas de redondeo y salida que la Orden de Aplicación (ver 9.7).

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 25-ago-2026: diseñada la Orden de Aplicación (documento para el Encargado de Fumigación), a partir de los formatos Excel reales de la empresa — terminología actualizada (Tanques a preparar, Cantidad por tanque completo, Cantidad último tanque), dato de mL/planta exclusivo de Drench, redondeo a 2 decimales o gramo entero, salida en pantalla + PDF con identidad Chula.

<!-- -->

- **\[6. Reglas\]** 26-ago-2026: agregado el requisito de selector de fecha con calendario en todos los campos de fecha del sistema (nunca escribirla a mano) — pendiente de construir. 29-ago-2026: confirmado construido por Diego (sin reporte técnico formal de Claude Code para esta pieza).

<!-- -->

- **\[9.1 Unidades de Producción\]** 26-ago-2026: construido "Borrar Huerta completa" (borrado real e irreversible, distinto de desactivar) — permisos Director General/Encargado de Sistemas, confirmación por nombre exacto, bloqueado si la Huerta ya tuvo Nómina cerrada, probado de extremo a extremo con un bug de órdenes de compra huérfanas ya corregido.

<!-- -->

- **\[9.4 Actividades\]** 26-ago-2026: reabierta la decisión del 8-ago-2026 y agregadas al catálogo: Herbicida, Hora Extra, Descarga y Acomodo de Planta, Deshilado (confirmadas por Diego como actividades reales). Agregadas también Mantenimiento Cintilla/Riego, Supervisor y Albañil (simples, sin más diseño). El resto del catálogo descartado del Excel sigue sin agregarse. 29-ago-2026: confirmado construido por Diego (sin reporte técnico formal de Claude Code para esta pieza).

<!-- -->

- **\[9.5 Fertilizantes\]** 26-ago-2026: confirmado construido y validado a mano (8.1 ha, 3 g/L, 972 g/riego, 2.92 kg/semana, exacto). Sin probar aún con datos reales de Sonrisal por la Sección de Riego perdida (ver 9.1, Pendientes). Subido a GitHub el 26-ago-2026.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 26-ago-2026: confirmado construido — validado con caso real de Drench (27.2 ha, 26.25 mL/planta). No. de aplicación y Plantas a tratar se calculan solos. Campo Tipo de aplicación agregado al formulario de Programar. Primer PDF del sistema con identidad de marca Chula real. Subido a GitHub el 26-ago-2026.

<!-- -->

- **\[9.15 Almacén\]** 26-ago-2026: agregado el campo Marca al alta de producto, catálogo abierto e independiente del Proveedor (una Marca puede venderla más de un Proveedor) — pendiente de construir. 29-ago-2026: confirmado construido por Diego (sin reporte técnico formal de Claude Code para esta pieza).

<!-- -->

- **\[6. Reglas\]** 27-ago-2026: detectado que las notificaciones no pre-llenan el contexto (ej. fecha) de la acción a la que llevan — agregado como principio general para todas las notificaciones, no solo Cierre de día de Nómina. Pendiente de construir.

<!-- -->

- **\[9.5 Fertilizantes\] 27-ago-2026: REVERSIÓN — el Recetario de Fertirriego pierde el cálculo de tanque y el campo Tipo de aplicación.** Diego explicó que en Fertirriego se prepara un solo tanque de mezcla concentrada que se inyecta al sistema de riego — el agua del riego reparte el producto, no la del tanque, así que el tamaño del tanque no limita hectáreas. Solo se necesita dosis del producto por hectárea. Ver detalle completo en 9.7.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\] 27-ago-2026: REVERSIÓN — el cálculo de mezcla por tanque queda exclusivo de Aplicaciones, ya NO aplica a Fertirriego.** Diego explicó el proceso físico real del fertirriego (un solo tanque de mezcla concentrada, inyectado al sistema de riego, es el agua del riego la que reparte el producto — el tamaño del tanque no limita hectáreas). Fertirriego solo necesita dosis del producto por hectárea, sin concentración ni litros de mezcla ni tanque. El Recetario de Fertirriego pierde el campo Tipo de aplicación y el cálculo de tanque; conserva solo nombre + productos con su dosis por hectárea. Ver ficha de Fertirriego (9.5, Camino 2) para el detalle correspondiente.
- **\[9.11 Nómina\]** 27-ago-2026: BUG CRÍTICO RESUELTO — el guardado de Captura del día podía fallar sin avisar al agregar una persona a un día ya capturado (cantidad/cuadroId mal tipados al reenviar). Corregido: normalización de tipos, scroll automático al error, ya no se recarga la página al fallar. Agregado el botón "+ Nueva persona (aún no dada de alta)". Ver detalle completo arriba.
- **\[9.11 Nómina\]** 27-ago-2026: auditoría de nómina de la semana 21-27 de agosto contra el Excel de referencia — motor de cálculo confirmado correcto, diferencia venía de datos crudos (9 discrepancias puntuales + 1 persona no capturada). Corregido con autorización explícita de Diego, verificado contra base de datos. Detectado como pendiente de diseño abierto: "Bono, Despensa y Tortilla" — ver Pendientes de este módulo.
- **\[9.11 Nómina\]** 27-ago-2026: detectado y diseñado el arreglo de Historial de Nómina semanal (bug de fondo: no había forma de ver una semana pasada al cambiar de periodo) — navegación con flechas hasta 12 semanas atrás, solo lectura total una vez pagada la semana, sin excepción de rol. Aclarado el comportamiento de "Confirmar semana". Pendiente de construir.

<!-- -->

- **\[9.14 Compras (Comparador)\]** 27-ago-2026: refinado por completo contra el Excel real ("Cotizador CBF") — agregado flete por Zona, cotización en USD/MXN con tipo de cambio manual por cotización, excedente con alerta configurable, y las dos recomendaciones lado a lado (Global vs. Local) con la regla explícita de que el flete debe compensar contra lo local. Rediseñada la captura para no repetir Producto/Cantidad en cada línea de proveedor, a diferencia del Excel original. Pendiente de construir.

<!-- -->

- **\[5. Vistas\]** 29-ago-2026: ampliada a regla universal la confirmación explícita antes de acciones irreversibles — ya no se limita a cierres/préstamos, aplica a cualquier borrar/eliminar/cancelar/liberar en todo el sistema. Detectado como bug real: el botón "Liberar" de una programación de Fertirriego no pedía confirmación.

<!-- -->

- **\[6. Reglas\]** 29-ago-2026: agregada la regla general de ordenamiento — numérico para Cuadros y Secciones de Riego/Válvulas (en pantallas y PDFs), alfabético para elementos con nombre. Detectado como bug real en la Orden de Fertirriego (Válvula 10 antes que Válvula 2). Pendiente de construir. Agregada también la nueva alerta de "Fertirriego pendiente del día" a Notificaciones.

<!-- -->

- **\[6. Reglas\]** 29 y 31-ago-2026: CONFIRMADO CONSTRUIDO y subido a GitHub (commit ed35575) — ordenamiento numérico de Válvulas/Cuadros, las 11 notificaciones pre-llenando su contexto, la confirmación de doble paso aplicada de forma universal a cualquier borrar/eliminar/cancelar/liberar del sistema, y la nueva función de ocultar (no borrar) lo liberado/cancelado con botón "Mostrar vencidas/canceladas" (hallazgo de Diego).

<!-- -->

- **\[9.5 Fertilizantes\]** 29-ago-2026: agregado el total de campaña completa para compra por volumen. Confirmado que frecuencia/rango de fechas ya existían en el diseño y se usaron mal por error de Diego, no era un hueco real. Pendiente de construir el total de campaña.
- **\[9.5 Fertilizantes\]** 29-ago-2026: agregada la regla de editar una programación ya guardada (Granular y Fertirriego) mientras no se haya ejecutado/registrado ningún avance — bloqueada en cuanto arranca. Mismo criterio en Aplicaciones (9.7). Pendiente de construir.
- **\[9.5 Fertilizantes\]** 29-ago-2026: agregada la corrección visual de la Orden de Fertirriego (logo, columnas por Ingrediente Activo, encabezados recortados, contraste ilegible en la app, alineación de filas de dos líneas) a partir de una prueba real. Mismo diseño en Orden de Aplicación (9.7). Señalado como pendiente aparte, sin construir: organizar el Recetario por Ingrediente Activo.
- **\[9.5 Fertilizantes\]** 29 y 31-ago-2026: CONFIRMADO CONSTRUIDO y subido a GitHub (commit ed35575) todo el bloque de corrección de Fertirriego — modelo de dosis por hectárea (Programar, Recetario, Orden de Fertirriego), total de campaña completa, ajustar/quitar producto en ejecución diaria, recordatorio si falta registrar el fertirriego del día (roles confirmados en 9.6), y ordenamiento numérico de Válvulas. Editar programación ya guardada: confirmado que Aplicaciones y Granular ya lo permitían, y ahora Fertirriego también. Todo probado en pantalla real con datos de prueba borrados después.

<!-- -->

- **\[9.6 Riego\]** 29-ago-2026: agregada la posibilidad de ajustar/quitar productos individuales en la ejecución diaria de fertirriego (cuando falta alguno ese día), y el recordatorio diario a Encargado de Riego/Rancho cuando toca fertirriego según la frecuencia. Pendiente de construir.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 29-ago-2026: agregada la regla de editar una programación ya guardada mientras no se haya registrado ningún avance como realizado — bloqueada en cuanto arranca. Mismo criterio en Fertilizantes (9.5, ambos Caminos). Pendiente de construir.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 29-ago-2026: agregada la corrección visual de la Orden de Aplicación (mismo diseño que la Orden de Fertirriego — logo, columnas por Ingrediente Activo, encabezados recortados, contraste ilegible en la app, alineación de filas de dos líneas). Ver detalle completo en 9.5.

<!-- -->

- **\[9.11 Nómina\]** 29-ago-2026: CONFIRMADO CONSTRUIDO y subido a GitHub (commit ed35575). Verificado que "Confirmar semana" bloquea la semana de forma permanente, sin excepción ni para Director General.

<!-- -->

- **\[9.14 Compras\]** 29-ago-2026 (detectado durante prueba real de Fertirriego): confirmado bug — las compras automáticas de una campaña no reflejaban el total necesario, solo una ocasión (ver 9.5, punto de total de campaña). Agregada vista agrupada por Ingrediente Activo (suma entre todas las órdenes pendientes, sin importar origen), con salto directo al Comparador de Cotizaciones desde ahí o desde una orden individual. Agregada la confirmación de qué producto específico se compró (preferido o sustituto) al recibir. Pendiente de construir.

<!-- -->

- **\[9.14 Compras (Comparador)\]** 31-ago-2026: mapeado el proceso completo de compra con Diego. Confirmado que este Comparador ES el paso real de Cotizar (ya no una herramienta aparte) — captura asíncrona línea por línea, historial permanente por Proveedor, etiqueta "(mejor precio)". Agregado el botón "Generar orden de compra" con soporte de compra parcial (tarjeta de pendiente restante). Agregada la regla de cancelación ligada a la programación de origen (antes de llegar a Almacén). Agregado el submódulo nuevo "Orden de Compra en PDF". Pendiente de construir.

<!-- -->

- **\[9.14 Compras\]** 31-ago-2026: mapeado el proceso completo de compra de punta a punta con Diego (programar → revisar inventario → Comparador como paso real de Cotizar → Generar orden con soporte de compra parcial → cancelación ligada a la programación de origen → recepción en Almacén). Agregado el submódulo "Orden de Compra en PDF" y ampliada la pantalla de Configuración del sistema (Bloque 10) con Datos de Facturación y Firmas de Órdenes de Compra. Pendiente de construir.
- **\[9.14 Compras\]** 31-ago-2026: revisado con Diego el caso de compras de insumos que no son producto para planta (ej. cintilla para Fertirriego) — confirmado que el flujo ya documentado es correcto tal cual: se captura como solicitud manual (hoy solo Director General, Encargado de Compras o Encargado de Bodega pueden capturarla — Diego confirma que está bien así por ahora, "más personas van a necesitar acceso a esta función" queda anotado para revisar más adelante) y la autoriza el Gerente Administrativo — nunca el Gerente Técnico de Producción, cuya autorización es exclusiva de solicitudes de producto para planta. Sin cambios al diseño.

**\[General (histórico bloques 1-8)\] 26-ago al 1-sep-2026:** corrección de fondo de Fertirriego (dosis por hectárea, sin cálculo de tanque), Recetario y Orden de Aplicación/Fertirriego con identidad de marca, mapeo completo del proceso de Compras con Diego (Comparador como paso real de Cotizar, Orden de Compra en PDF), y regla general de ordenamiento numérico vs. alfabético — todo subido a GitHub (commit ed35575). Detalle completo en cada ficha de módulo.

- **\[9.14 Compras\]** 1-sep-2026: reporte de Claude Code (subido a GitHub commit ed35575) confirma construido solo el motor de cálculo del Comparador de Cotizaciones (flete/zona/moneda/recomendación Global vs. Local — ver 9.14, Comparador). El resto del rediseño de compras del 31-ago (captura asíncrona, generar orden con compra parcial, cancelación ligada a programación, vista agrupada por Ingrediente Activo, confirmación de producto recibido, submódulo Orden de Compra en PDF, Configuración del sistema con Datos de Facturación/Firmas) sigue sin construirse — no vino mencionado en el reporte.

<!-- -->

- **\[General (Bloque 13 original)\] 26-ago al 1-sep-2026:** corrección de fondo de Fertirriego (dosis por hectárea, sin cálculo de tanque, total de campaña completa), Recetario y Órdenes de Aplicación/Fertirriego con identidad de marca Chula, "Borrar Huerta completa", y mapeo completo del proceso de Compras con Diego (Comparador como paso real de Cotizar, Orden de Compra en PDF) — todo subido a GitHub (commit ed35575). Reporte de Claude Code del 1-sep confirma construido solo el motor de cálculo del Comparador; el resto del rediseño de Compras sigue pendiente. Detalle completo en cada ficha de módulo.

**\[14. Diagramas de flujo del sistema\]** • 1-sep-2026: bloque nuevo creado. Construido el Nivel 1 (mapa general) con Graphviz, a partir de las relaciones ya documentadas en cada ficha — vive en sección aparte al final del documento (opción elegida por Diego, en vez de insertar diagramas dentro de cada ficha). Nivel 2 (diagramas detallados por módulo) queda pendiente para más adelante, a construirse módulo por módulo.

- **\[3. Centros de costo\]** 2-sep-2026: agregado el Centro de Costo "Laboratorio" — detectado como hueco real al diseñar el campo Destino de solicitudes manuales en Compras (ver 9.14), que necesitaba poder marcar destino "Laboratorio" y no existía en el catálogo. No prorratea a Huerta; se acumula aparte, igual que Bodega de Agroquímicos.

**\[General (histórico bloques 1-8)\] 2-sep-2026:** rediseño completo de Compras (9.14) a partir de bugs reales de cancelación y total de campaña; auditoría completa del documento vivo — corregidas 2 contradicciones reales (catálogo de Clientes 9.9/9.10, roles de la alerta de Fertirriego), una referencia rota (Bloque 12), nombres de rol/módulo homologados (Gerente Técnico de Producción, Panel Ejecutivo), y las secciones de Pendientes de varios módulos puestas al día contra su propio Historial.

- **\[9.14 Compras\]** 2-sep-2026: Diego revisó en vivo la vista "Por Ingrediente Activo" y "Por orden" de Compras — confirmado bug real: programaciones canceladas de Fertirriego seguían pidiendo cotizar, y las cantidades pendientes seguían fragmentadas por ocasión/riego individual en vez de reflejar el total de campaña, a pesar de haberse marcado "confirmado construido" el 31-ago-2026 (ver bug gemelo agregado hoy en 9.5). Rediseñada la vista "Pendientes de cotizar": ahora cada tarjeta representa una programación completa (Aplicación, Fertirriego, Granular) o una solicitud manual completa, con todos sus productos y cantidades totales de campaña adentro — se cotiza producto por producto desde ahí, saltando al Comparador de Cotizaciones con la cantidad precargada. Agregado a la vista por Ingrediente Activo el desglose por origen (Huerta + Receta) debajo del total de cada ingrediente. Agregado el campo Destino, obligatorio, a las solicitudes manuales — usa el catálogo de Centros de Costo (Bloque 3), abierto, con sub-selección de Huerta específica cuando el destino es "Huerta"; se agregó "Laboratorio" a ese catálogo por no existir. Todo pendiente de construir.
- **\[9.14 Compras\]** 2-sep-2026, sesión tarde (commits 193b63c y f8dcfef sobre 9111f1d): CONFIRMADO CONSTRUIDO todo el rediseño del 2-sep — investigada y cerrada la cancelación (falso positivo, eran registros de prueba viejos, no bug de código); corregido de fondo el total de campaña en la compra automática de Fertirriego, con un bug adicional encontrado y corregido en recibirOrden que no se había pedido; pestaña nueva "Por Programación" (convive con "Por orden" y "Por Ingrediente Activo", no las reemplazó — Diego confirmó que las quiere las 3); desglose por origen en la vista por Ingrediente Activo con la regla completa de etiqueta según el caso (con/sin receta, Granular, Aplicación con/sin Tipo, solicitud manual); Destino obligatorio en solicitudes manuales, validado en pantalla y backend. Bug visual de formulario y bug de despliegue (frontend no reconstruido tras reiniciar el backend) encontrados y corregidos en el camino. Migración de Prisma aditiva, 22 filas reales existentes verificadas sin pérdida. Todo probado por HTTP real y en pantalla; datos de prueba borrados. Aclarado y cerrado: la referencia a "esta mañana" (commit 9111f1d, "Sesion 1/2-sep", 9:46 a.m. del 2-sep-2026, autor Diego) sí fue una sesión real de Diego mismo, que no llegó a reportarse en este chat — sin problema de seguridad, sin acción pendiente.
- **\[9.14 Compras\]** 2-sep-2026, tercera sesión del día: rediseñada la navegación de Compras a partir de que Diego notó falta de detalle en las vistas de "qué hay que comprar", sobre todo para quien no conoce el sistema (quien ayuda a comprar). Estructura nueva: 3 pestañas de primer nivel por estado (Pendientes, En Camino, Recibidas), con filtros comunes (Huerta, fecha, tipo de producto, tipo de aplicación). Solo "Pendientes" tiene sub-vistas: "Por Programación" (ya construida, reubicada aquí), "Por Orden" (nueva, diseñada — tarjeta por orden individual, muestra quién la solicitó), y "Por Producto" (renombrada de "Por Ingrediente Activo" y generalizada para agrupar por Producto Comercial cuando no hay Ingrediente Activo — ej. empaque, papelería). Cerrados los campos mínimos comunes a toda tarjeta (Destino, Solicitante, Fecha, Estado, producto(s)+cantidad), para que los pedidos de Oficina/Empaque/Vivero/etc. — sin Ingrediente Activo ni Huerta — se puedan filtrar y buscar igual que los de Aplicaciones/Fertilizantes, sin forzarlos a un mismo esqueleto de datos. Todo pendiente de construir.
- **\[9.14 Compras\]** 2-sep-2026, cuarta sesión del día (noche, commits b4e7b62 código y 2409495 reporte): CONFIRMADO CONSTRUIDO todo el rediseño de navegación de la tercera sesión — las 3 sub-vistas dentro de "Pendientes" (Por Programación, Por Producto, Por Orden), campos mínimos comunes resueltos automáticamente (Destino/Solicitante/Fecha), y filtros de Huerta/Fecha/Tipo de producto/Tipo de aplicación. Agregada una 4ª pestaña de primer nivel, "Rechazadas/Canceladas", por indicación directa de Diego a Claude Code en esa sesión (no venía en el prompt original) — muestra programaciones canceladas que arrastraron su compra ligada, sin campo de motivo. Cerrado con Diego, después del reporte, que "Por Producto" oculta correctamente los filtros de Fecha y Tipo de aplicación (esa vista suma en todo el tiempo, sin una fecha única que filtrar). Limpieza de datos de prueba: borrados 22 registros de compra y 3 fertirriegos de Huerta "El Sonrisal", confirmado antes que ninguno tocó Almacén real — cero descuadre de inventario.

<!-- -->

- **\[General (Bloque 13 original)\] 2-sep-2026:** rediseño completo de Compras (9.14) — bug real de cancelación y total de campaña no propagados, tarjetas de "Pendientes de cotizar" por programación completa, desglose por origen en la vista por Ingrediente Activo, campo Destino obligatorio en solicitudes manuales, nuevo Centro de Costo "Laboratorio". Auditoría completa del documento vivo — corregidas 2 contradicciones reales, 1 referencia rota, nombres homologados (Gerente Técnico de Producción, Panel Ejecutivo), y las secciones de Pendientes de varios módulos puestas al día. Ambos consolidados generales (este bloque y el de bloques 1-8) puestos al día por decisión explícita de Diego, para mantenerlos vigentes de aquí en adelante.

- **\[General (Bloque 13 original)\] 2-sep-2026, sesión de la tarde y tercera sesión del día:** cotejado y cerrado el reporte de Claude Code de la tarde (commits 193b63c/f8dcfef sobre 9111f1d) — cerrada la cancelación (falso positivo), corregido de fondo el total de campaña, construidas las sub-vistas de compras y el campo Destino. Aclarado con Claude Code el origen de la sesión "1/2-sep" (commit 9111f1d, confirmado por Diego como sesión propia no reportada, sin riesgo de seguridad). Rediseñada de fondo la navegación de Compras a partir de que Diego notó falta de detalle en las vistas de qué hay que comprar: 3 pestañas por estado (Pendientes/En Camino/Recibidas), 3 sub-vistas dentro de Pendientes (Por Programación, Por Orden nueva, Por Producto renombrada y generalizada), y campos mínimos comunes a toda tarjeta. Todo pendiente de construir. Detalle completo en 9.14.

**\[General (histórico bloques 1-8)\] 3 al 4-sep-2026:** regla general de solo Ingrediente Activo al Programar (nunca marca); Zona movida al catálogo de Proveedores; rediseño completo de Compras con la pestaña "Órdenes de Compra" (asignación de proveedor producto por producto, tope de cantidad disponible); "Confirmar entrega" agregado a Aplicaciones; cambio de fondo en Almacén — la Presentación deja de ser fija por Producto Comercial; nueva pestaña "Catálogos" en Configuración del sistema; y una segunda auditoría completa del documento — corregidas 3 contradicciones más (jerarquía de catálogo con Presentación, tabla de Inventario, flujo de confirmar producto específico ya resuelto por diseño de Órdenes de Compra) y 2 secciones de Pendientes desactualizadas (9.7, 9.15). Todo pendiente de construir salvo lo ya confirmado por Claude Code el mismo 3-sep. Detalle completo en cada ficha de módulo.

- **\[9.5 Fertilizantes\]** 3-sep-2026: cerrada la "Regla general: solo Ingrediente Activo al Programar" — Diego notó en pantalla real que Programar seguía mostrando nombre comercial (ej. "ULTRASOL MICRO REXENE FIERRO — Saco 25 kg") en vez de Ingrediente Activo, generando el riesgo de que distintos ingenieros programaran distinta marca para lo mismo. Cerrado: Programar y Recetario trabajan solo con Ingrediente Activo + dosis; la marca se resuelve después, en Compras (preferido/sustitutos) y Almacén (identificación física del lote por FIFO). Esto también resuelve de raíz el pendiente que llevaba desde el 29-ago sobre organizar el Recetario por Ingrediente Activo (ver 9.7). Pendiente de construir.

<!-- -->

- **\[9.7 Aplicaciones (Agroquímicos)\]** 3-sep-2026: diseñada la "Nota estimada de tanque pendiente" en el Resumen de avance — Diego notó que si un tanque preparado rinde para 10 ha pero el Supervisor solo reporta 15 de 27 ha en total, el sistema no tenía forma de mostrar cuánto producto ya salió de Almacén hacia un tanque sin haberse aplicado todavía (queda a medio tanque). Se decidió NO tocar el descuento real de Almacén (sigue siendo por hectárea reportada — el "límite honesto" ya documentado en 9.15 sigue vigente, decisión consciente de no perseguir precisión de tanque) y en su lugar agregar solo una nota calculada, sin mover inventario, usando datos que ya existen (hectáreas por tanque completo del Recetario + hectáreas acumuladas reportadas). Visible aquí y en Almacén Local (9.15), mismo cálculo espejo en ambos lados. Pendiente de construir.
- **\[9.7 Aplicaciones (Agroquímicos)\]** 3-sep-2026: cerrada la "Regla general: solo Ingrediente Activo al Programar y en Recetario" — ver detalle completo en 9.5 (misma regla, mismo texto, aplica igual aquí). Resuelve de raíz el pendiente que llevaba desde el 29-ago-2026 sobre organizar el Recetario por Ingrediente Activo (ver arriba, en la sección del Recetario, ahora marcado RESUELTO). Pendiente de construir.

<!-- -->

- **\[9.11 Nómina\]** 3-sep-2026: diseñada la nota de monto acumulado en vivo, por persona — Diego quería poder auditar visualmente que el monto va bien mientras se captura, sin esperar hasta el Cierre del día. Se agregó en 2 lugares: notita gris al pie de cada tarjeta de persona en Captura del día (se recalcula al momento, no editable, informativa), y el mismo monto por persona dentro del Detalle del Cierre del día (Paso 2), donde antes solo existía el total agregado por Rancho (Paso 1). Monto bruto en ambos lados, mismo criterio que el "Total a Pagar" ya existente. Pendiente de construir.

<!-- -->

- **\[9.14 Compras\]** 3-sep-2026: diseñada de fondo la pestaña "Órdenes de Compra" (5ª pestaña de primer nivel), a partir de 2 casos reales que Diego se imaginó: una programación con productos cotizados con proveedores distintos (no se le puede mandar una sola orden a 2 proveedores), y el caso contrario — el mismo producto necesitado por 2 programaciones distintas, mismo proveedor, que Diego quiere comprar junto en una sola orden (ej. 5 L + 10 L = 15 L). Solución cerrada: "Órdenes de Compra" es el único lugar donde de verdad se genera una orden, con 3 formas de entrada (Por Proveedor, Por Orden — la ruta rápida desde Pendientes —, y Por Producto), asignación de proveedor producto por producto (incluyendo casos de 2 proveedores cotizando el mismo producto, uno preferido y otro sustituto), agrupación automática por proveedor resultante con vista previa antes de generar, líneas separadas por origen en pantalla pero sumadas en una sola en el PDF final, y tope estricto de cantidad disponible del proveedor (sin repartir automático — el usuario ajusta a mano cuánto de cada línea entra si no alcanza, opción B sobre la A). Agregado campo "Cantidad disponible" (checkbox + cantidad exacta) a la captura de cotización en el Comparador, obligatorio junto con el precio. Todo pendiente de construir.
- **\[9.14 Compras\]** 3-sep-2026: 2 correcciones más, a partir de que Diego revisó en pantalla real. (1) Cerrada la regla "solo Ingrediente Activo al Programar" (ver 9.5 y 9.7) — no cambia nada de cómo ya funciona el Comparador aquí (ya cotizaba por Ingrediente Activo, con el nombre comercial capturado por línea de proveedor), solo confirma que es la forma correcta y cierra el pendiente que traía Recetario desde el 29-ago. (2) La Zona del proveedor se movió al catálogo de Proveedores (alta) — antes se preguntaba cada vez que se cotizaba (confirmado así el 27-ago), pero Diego notó que no tenía sentido repreguntarla si un proveedor casi siempre envía desde el mismo lugar. Ahora se precarga sola al elegir el proveedor en una cotización, editable por si ese envío en particular es distinto. Pendiente de construir ambos.

<!-- -->

- **\[9.15 Almacén\]** 3-sep-2026: aclarado y CONFIRMADO CONSTRUIDO cómo se elige el preferido/sustituto — de la lista de Productos Comerciales YA dados de alta en este catálogo de Almacén para ese Ingrediente Activo (no se escribe libre), mostrando Nombre Comercial + Marca juntos para identificarlos (antes esta pantalla no mostraba la Marca). El Comparador de Cotizaciones (9.14) también cambió para seleccionar de esta misma lista en vez de capturar el nombre comercial como texto libre — ver 9.14, Historial. Pendiente confirmar hash de commit. **Corrección 4-sep-2026:** esta pantalla mostraba Nombre + Presentación (ej. "KilNeem — 25 kg") — Diego confirmó que la Presentación no sirve de nada aquí (ya no es fija por producto, ver "Estructura de catálogo" arriba) y solo confunde; debe mostrar Nombre Comercial + Marca únicamente. Pendiente de corregir.

<!-- -->

- **\[9.15 Almacén\]** 3-sep-2026: diseñada la "Nota estimada de tanque pendiente" en Almacén Local — Diego notó el mismo hueco de visibilidad descrito en Aplicaciones (9.7): si un tanque preparado rinde para 10 ha pero solo se reportan 15 de 27 ha, no hay forma de ver cuánto producto ya salió hacia un tanque sin aplicarse. Se decidió mantener el "límite honesto" ya documentado arriba (el descuento real sigue siendo por hectárea reportada, sin cambio) y agregar solo una nota calculada — sin mover inventario — a partir de datos que ya existen (hectáreas por tanque completo del Recetario + hectáreas acumuladas reportadas). Exclusivo de Aplicaciones (9.7) — no aplica a Fertirriego, donde el tanque no limita hectáreas, ni a Granular, que no usa tanque. Visible aquí y en la tarjeta de progreso de la Aplicación (9.7), mismo cálculo espejo en ambos lados para poder verificar cruzado. Pendiente de construir.

<!-- -->

- **\[General (Bloque 13 original)\] 3-sep-2026 (reporte de Claude Code) y 4-sep-2026:** CONFIRMADO CONSTRUIDO por Claude Code — regla de solo Ingrediente Activo al Programar (con hueco de datos real corregido: 11 Ingredientes Activos sin Producto preferido), Zona movida a Proveedores, Producto Comercial reemplaza texto libre en el Comparador, causa raíz de los 2 bugs de Fertirriego resuelta en la lógica compartida de Almacén, y bug del PDF de orden de compra corregido (la orden sí se generaba, la pantalla se rompía al reabrir Cotizar). El mismo 4-sep, prueba de ciclo completo de Diego encontró un bug urgente (cantidad no se precarga redondeada, ya generó una orden real mal dimensionada) y varias mejoras de UI, más una propuesta de rediseño de fondo en Almacén (Presentación deja de ser fija por producto) y una nueva pestaña "Catálogos" en Configuración. Cerrando el día, segunda auditoría completa del documento — 3 contradicciones más corregidas y 2 secciones de Pendientes puestas al día. Detalle completo en cada ficha de módulo.

**\[General (histórico bloques 1-8)\] 4 al 10-sep-2026:** nueva frecuencia "Días específicos de la semana" (Fertirriego); bug del tope de cantidad disponible; migración de recetas viejas; Lineamientos de interfaz (Bloque 11, a partir de app de referencia); Título y multi-producto en solicitudes manuales; rediseño de Inventario para escalar; regla de transición Pendiente → En Camino; precisión de cálculo en el Comparador y "Total sin flete"; diseño del cálculo de litros de agua aplicados por riego (Gasto/Líneas de cintilla); y una tercera auditoría completa del documento, esta vez ejecutada por una conversación de Claude sin contexto previo, siguiendo un formato de auditoría estructurado. Encontró 20 hallazgos — 9 desincronizaciones de redacción corregidas directo, y 10 preguntas de negocio genuinamente ambiguas resueltas con Diego (regla de tanque exclusiva de Aplicaciones, actividad Albañil confirmada, categorías de Almacén sin "Agroquímico" y con chips automáticos, permisos de Asistentes Técnicos y Gerente Administrativo en Unidades de Producción, puesto inexistente "Gerente de Huerta" corregido, definición de Sección de Riego unificada en 9.1, y Do-not-hire list visible a Supervisor de Huerta). Quedaron 2 preguntas abiertas explícitamente (CxC en Panel Ejecutivo, actividad "Fertilización" en catálogo general) y se recibió información nueva y completa sobre cómo debe funcionar Vivero (9.3), pendiente de estructurar. Detalle completo en cada ficha de módulo.

- **\[9.5 Fertilizantes\]** 4-sep-2026: agregada la frecuencia "Días específicos de la semana" a Fertirriego — Diego quería programar lunes/miércoles/viernes y ninguna opción existente cae exacto sin recorrerse semana con semana. Checkboxes Lunes a Domingo; Riegos en la semana = días marcados (constante); Total de campaña completa cuenta las fechas del rango que caen en los días marcados. Exclusivo de Fertirriego. Pendiente de construir.

<!-- -->

- **\[9.6 Riego\]** 4-sep-2026: diseñado el cálculo de litros de agua aplicados por riego — Diego quería saber cuánta agua real se le echa a la planta, hoy solo se reportan horas. Nuevos campos Gasto de cintilla (L/m/hora, por Huerta/Ciclo) y Líneas de cintilla por surco (con historial por fecha porque puede cambiar a mitad de Ciclo). Uso informativo/analítico, sin alertas. También quedó como pendiente de verificar el caso real de Diego de reducir dosis de fertirriego varios días por una intoxicación — el mecanismo de ajuste diario ya existente debería cubrirlo por diseño, pendiente de confirmar en el sistema real. Corrección el mismo día (dos vueltas): primero se movieron las Líneas de cintilla de Huerta a Sección de Riego; después Diego notó que Hectáreas y Distancia entre surcos NO deben volver a capturarse en la Sección — ya existen en el Cuadro (Marco de Plantación) — se corrigió para que la Sección solo declare qué Cuadro(s) la integran, y ambos datos se deriven de ahí (sumados/tomados de los Cuadros), sin duplicar la fuente de verdad. Pendiente de construir.

<!-- -->

- **\[9.14 Compras\]** 4-sep-2026: agregado Título obligatorio a las solicitudes manuales — hoy solo aparecen genéricas como "Solicitud manual" en las tarjetas de Pendientes y Órdenes de Compra, sin forma de identificarlas de un vistazo. También corregido: el campo de captura decía "producto" en singular y nunca se había construido para varios — aunque el diseño de "Pendientes de cotizar" del 2-sep ya asumía que una solicitud manual podía traer varios productos. Ahora permite uno o varios, mismo patrón "+ Otro producto" que ya existe en Aplicaciones/Fertirriego. Pendiente de construir.
- **\[9.14 Compras\]** 4-sep-2026: cerrada la regla de transición Pendiente → En Camino — Diego notó que generar la Orden de Compra debe quitar el producto de Pendientes de inmediato (pasa a "En Camino"); que no haya llegado todavía es un estado distinto, no motivo para seguir apareciendo como pendiente. Esto solo funciona bien porque la necesidad se registra por Ingrediente Activo (no por Nombre Comercial) — comprar el preferido o cualquier sustituto autorizado cubre la necesidad igual, sin importar cuál marca específica se terminó comprando. Pendiente de construir/verificar contra el comportamiento real.
- **\[9.14 Compras\]** 4-sep-2026: corregida precisión de cálculo en el Comparador — Diego comparó una cotización real contra la factura del proveedor y encontró casi \$300 MXN de diferencia en una compra de 3,875 kg. Causa: precio capturado con solo 2 decimales, más un redondeo intermedio antes de multiplicar por la cantidad. Cerrado: el campo Precio admite 4+ decimales, y el redondeo a 2 decimales aplica solo al número final mostrado, nunca a valores intermedios. Agregada también la columna "Total sin flete" junto a Flete y Total con flete, para ver el costo del producto por separado del flete sin restar a mano. Pendiente de construir.

<!-- -->

- **\[9.15 Almacén\]** 4-sep-2026: rediseñada de fondo la vista Inventario para escalar — Diego notó que "Existencia por Ingrediente Activo" y la tabla de productos parecían mostrar lo mismo. Causa real: la columna Existencia de la tabla estaba en blanco (bug), no un diseño duplicado. Formalizado "Existencia por Ingrediente Activo" (lo había agregado Claude Code sin documentar) como colapsable y contextual a la categoría filtrada; agregados chips de categoría (Fertilizante, Agroquímico, Combustible, Refacciones, Empaque, Herramientas, Oficina, Laboratorio, Todos); alertas de reorden movidas hasta arriba de todo, antes del buscador. Pendiente de construir.

<!-- -->

- **\[10. Todo lo técnico\]** 4-sep-2026: agregada la pestaña "Catálogos" dentro de Configuración del sistema — Diego quería un solo lugar para ver/administrar todos los catálogos abiertos del sistema, en vez de entrar módulo por módulo, y poder cargar de entrada los valores que ya conoce antes de operar cada módulo. Regla cerrada: agregar un valor nuevo se sigue haciendo desde el módulo de uso (sin cambio); editar o borrar un valor ya existente se centraliza aquí, exclusivo de Director General. Sin carga masiva por ahora. Pendiente de construir.

<!-- -->

- **\[11. Interfaz — identidad de marca\]** 4-sep-2026: agregados los "Lineamientos de interfaz — forma y patrones de interacción", a partir de una app de referencia que Diego mostró — teclado numérico propio para toda captura de números, totales grandes y protagonistas, chips redondeados en vez de campos de formulario largos, iconos tipo emoji por categoría, esquinas muy redondeadas. Se adopta la forma, no el modo oscuro — sigue la paleta clara de CBF. Aplica a todo el sistema de aquí en adelante, no pantalla por pantalla, y resuelve de raíz varias mejoras de UI que ya estaban pendientes sueltas en 9.5 y 9.7. Pendiente de construir.

<!-- -->

- **\[General (Bloque 13 original)\] 4 al 10-sep-2026:** seguido diseñando sobre la marcha (frecuencia por días de la semana, bug del tope de cantidad, migración de recetas, Lineamientos de interfaz, Título/multi-producto en solicitudes manuales, rediseño de Inventario, transición Pendiente→En Camino, precisión de cálculo y Total sin flete, cálculo de litros de agua). El 10-sep, tercera auditoría completa — por primera vez ejecutada en una conversación de Claude SIN contexto previo del proyecto, usando un prompt de auditoría estructurado en 8 categorías. Encontró 20 hallazgos reales; 9 se corrigieron directo (desincronización de redacción) y 10 se resolvieron con Diego en un documento de preguntas/respuestas de ida y vuelta. 2 quedaron explícitamente abiertas (CxC en Panel Ejecutivo, actividad "Fertilización" en catálogo general de Actividades). De paso, Diego aportó el diseño completo de cómo debe funcionar Vivero (9.3) — módulo que hasta ahora no tenía casi nada documentado — pendiente de estructurar en la ficha. Detalle completo en cada ficha de módulo.

<!-- -->

- **\[9.3 Vivero\]** 10-sep-2026: diseño completo cerrado con Diego, a partir de una pregunta de auditoría sobre un diagrama que decía que Vivero alimentaba a "casi todo lo demás" (contradicción real con esta ficha, que hasta entonces no tenía nada diseñado). Diego explicó el flujo completo: presupuesto y pedido de semilla (mismo mecanismo que Aplicaciones), charolas con cavidades fijas por Ciclo, Lotes de siembra con sus 5 fechas, riego sin medición de agua todavía, nutrición con el mismo Ingrediente Activo/Recetario que Aplicaciones, conteos de vivas/muertas por charola, y un apartado de Resiembra para el traspaso a campo y su seguimiento posterior. Pendiente de construir.

<!-- -->

- **\[Varios\] 14-sep-2026:** sesión de diseño. Tirar 2da Cintilla se diseñó como Actividad que pone 2 líneas de cintilla en la Sección de Riego. Fertirriego y Aplicaciones se abren a todo producto con Ingrediente Activo (antes solo fertilizantes o agroquímicos autorizados). Bono de Asistencia Semanal diseñado a partir del Google Sheets que ya se usaba. Ciclo de vida de las alertas (acción vs. informativas). En Compras: editar solicitud manual con reautorización condicional, “Comparativo General”, tarjetas por proveedor, fusión de “Por Programación” y “Por Orden” en “Por Solicitud”, cancelar una orden ya generada y monto en dinero por proveedor en “Por Producto”; el campo “Producto” del Comparador pasa a decir Ingrediente Activo; el umbral de excedente sale de la pantalla de cotización a Configuración. En Almacén: Precio unitario obligatorio en toda Entrada y selector de salida solo con existencia. Se aclara que Ventas no es cobranza, y que Riego y Fertilización existen en el catálogo de Actividades solo para clasificar pagos. Bugs reportados: Líneas de cintilla no se veía guardado; “Comprometido” no se actualizaba al editar; compra doble del mismo Ingrediente Activo por falta de marca visual.
- **\[Varios\] 20-sep-2026:** confirmados construidos por Claude Code: 7731653 (ciclo de vida de alertas), 518a210 (Fertirriego abierto a todo producto con Ingrediente Activo), e7655eb (Líneas de cintilla — la causa real era que la pantalla comparaba mal fechas del mismo día; sí se guardaba), e76b971 (Tirar 2da Cintilla, construida como Actividad), 84a594d (casilla “Inyección completa” en Riego; resolvió el error “Debe ser mayor que 0”), efd5c0f (Aplicaciones abierto a todo producto con Ingrediente Activo), 84c3d02 (Bono de Asistencia Semanal), 6954f87 (editar solicitud manual), 7e600d0 (Ingrediente Activo en el Comparador y umbral de excedente en Configuración), 53b205b (PDF de la Orden, “En Camino”, CxP e histórico muestran el Producto Comercial realmente comprado), 01619d4 (Comparativo General; de paso se corrigió la zona del comprador), e6c196c (tarjetas por proveedor; corrigió el pedido doble), b9fec37 (sub-vista “Por Solicitud”), bd3c337 (cancelar Orden de Compra), 1a31415 (monto por proveedor en “Por Producto”), d09af02 (Precio unitario obligatorio en Entrada; quedaron 10 Entradas viejas sin precio), 3701e92 (selector solo con existencia), 0d96205 (“Comprometido” resta lo liberado al editar, liberar o cancelar), d070e3d (Historial de Aplicaciones), a695f25 (“Existencia por Ingrediente Activo” ya no se abre sola), 6fb2a72 (el Comparador oculta productos ya comprados). Se cierra la regla general de precisión de cálculo para todo el sistema. Se pausa el teclado numérico propio (se usa el nativo). Claude Code reporta como conocido el bug de auditoría en core/db.ts.
- **\[Varios\] 22-sep-2026:** diseño del modelo nuevo de programación y avance: modos Por Cuadro / Por Variedad, Grupos de dosis, Comentarios, avance solo en hectáreas totales y reparto proporcional de costo, producto y tanque (Aplicaciones, Granular y Actividades); indicadores de costo promedio por hectárea e intervalo entre pases. Nómina: detalle semanal por persona en el Reporte semanal. Equipos: Reporte rápido de cargas de combustible, rol Operador, motobombas y plantas de luz en el catálogo, umbral de la alerta de consumo configurable. Nuevo módulo Monitoreo (9.20); Clima se mueve ahí desde el Bloque 6.
- \[Documento\] 23-sep-2026: auditoría completa del documento (~120 hallazgos: contradicciones, reglas desactualizadas, términos, repetidos, referencias rotas, ambigüedades, huecos y pendientes viejos) y cuestionario de 45 decisiones. Se corrigen referencias, roles inexistentes, términos (Fertilizantes, Huerta, Lote de siembra, Lote de Almacén, tarima), duplicados y estructura (9.20 como ficha normal, Bloque 14 antes del Apéndice); las fechas, commits y narrativas que estaban dentro de las fichas se pasan a este Bloque 13; los datos propios de la operación se mueven al Apéndice A — Datos de arranque de CBF.
- **\[Bloque 3, 9.7, 9.15\] 23-sep-2026:** el costo baja hasta Cuadro (para medir aplicaciones de prueba contra Monitoreo). El producto se carga a la Huerta al salir del Almacén Central, valuado al lote FIFO del que sale; la devolución abona al mismo precio. Cada avance descuenta lo proporcional del Almacén Local (se elimina “una sola vez al marcar realizada”). Reparto dentro del grupo por hectáreas programadas; Por Variedad según la superficie de la variedad en cada Cuadro; remolques por hectáreas. Definición única de Plantas a tratar. El flete viaja con el producto hasta la Huerta, para cualquier producto, dividido entre los kilos de la orden (1 L = 1 kg), con alerta para capturarlo y ajuste de lo ya entregado. Tipo de aplicación obligatorio; se quita el promedio general de la empresa en los indicadores. Plazos de 15 días: el apartado desde la fecha de inicio; aviso y cancelación desde la fecha fin. Cierre por debajo de 100% solo Dirección General y Gerente Técnico; lo parcial vencido se cancela solo por el saldo.
- **\[9.4, 9.5, 9.6, 9.7\] 23-sep-2026:** la frontera entre módulos es el método (aspersión = Aplicaciones, en seco = Granular, inyección = Fertirriego); un producto puede tener varios métodos. Producto mezcla = Ingrediente Activo compuesto propio. Actividades nunca lleva producto; Herbicida es la mano de obra de una Aplicación; Fumigación se queda para captura manual; Virosis es la labor de revisar la huerta. Tirar 2da Cintilla se mueve de Actividades a Riego (se programa por Sección, la programan Gerente Técnico o Asistente Técnico, paga nómina, 2 líneas al 100%) — requiere cambiar lo construido en e76b971. Fertirriego: tanque de agua con los productos revueltos e inyectados; la dosis depende de las hectáreas de la Sección, no del tanque; solo quedan las frecuencias diario y días fijos. Asistentes Técnicos programan sin cambiar dosis; el Supervisor programa Actividades.
- **\[Bloques 4, 5, 8, 9.11, 9.12\] 23-sep-2026:** compras automáticas de Asistentes Técnicos o Vivero sin autorización; el Gerente Técnico autoriza solo producto para la planta; el Encargado de Compras no autoriza mientras no haya tope. Catálogos editables en Configuración y en su módulo. Auditor: todos los módulos, solo lectura. Nueva regla para todo el sistema: todo botón de borrar, cancelar, liberar, rechazar o descartar pide confirmación. “+ Nueva persona” queda activa y su costo cuenta desde la captura, pero su pago espera la autorización de RH (color de pendiente; se acumula a la siguiente semana). Accesos y usuarios pasa a Configuración. Nómina: periodo viernes a jueves, transferencias y proveedores el viernes, pago en efectivo el sábado; existe la falta justificada (Ajustes de Asistencia, que también alimenta la Matriz de Asistencia); no existe destajo por surco, planta ni Cuadro; Bordeo, Encamado, Poda, Raleo y Fumigación son actividades reales; sobre redondeado siempre hacia arriba y registrado así; catorcenal cada segundo sábado y quincenal el sábado más cercano al 15 y al fin de mes, ganando lo mismo; pago mensual por persona el primer viernes (mes que empieza) o el último viernes (mes que termina), en efectivo o por transferencia con cuenta registrada; la liquidación obliga a cerrar los días pendientes. El Bono de Asistencia debe describirse tal como está construido (ventana en verificación). Reparto de pagos grupales queda para el diseño de Cosecha y Empaque.
- **\[9.1, 9.3, 9.13\] 23-sep-2026:** existe el Ciclo de Descanso; su costo pasa al siguiente Ciclo de cultivo; la etapa 4 queda solo como Post-cosecha. Las Secciones de Riego se integran solo con Cuadros completos. Vivero con Almacén Local propio, rol Ingeniero de Vivero, costo del Lote de siembra que viaja al Ciclo y Cuadros de destino (por plantas enviadas; las muertas se reparten entre las trasplantadas). Combustible: se captura en el avance mismo con relleno a tanque lleno (tractor en cada avance o al cambiar de implemento, planta de luz del drone, motobomba ligada al Fertirriego del día); camionetas y mantenimiento siguen indirectos; captura manual con foto (OCR a futuro). Nuevo Traslado de tractor con Rancho actual (lo registra el Supervisor del rancho destino; su combustible es indirecto). Alerta de consumo por equipo contra su propio promedio, margen de 20% editable, para Dirección General, Gerente Técnico y Supervisor del rancho. Se agrega Drone como modalidad de Aplicaciones. Redondeo solo para mostrar.
- **\[Varios\] 23-sep-2026:** verificación de solo lectura de Claude Code contra el código y la base de datos. Bono de Asistencia: evalúa lunes a sábado de la semana calendario que contiene el viernes de arranque del periodo de Nómina (ejemplo: Nómina 18–24 sep → bono 14–19 sep); regla y ejemplo corregidos en 9.11. Confirmados construidos: “Confirmar entrega” de Aplicaciones (5b333a4, uno por Aplicación completa) y la recepción automática reflejada en inventario; Tarifa general por hora capturada; Historial de Nómina semanal con 12 semanas y candado sin excepción de rol; catálogo de Actividades fuera de Nómina con botón “+”; Comparador completo y Configuración con Datos de Facturación y Firmas; presentación por compra (8586037) y el resto de pendientes de Almacén. Bugs de Compras del 4-sep corregidos: cantidad sin redondear del Folio 23 (38e38ab), columna Zona en Proveedores (54f33ca), ruta rápida a Órdenes de Compra (9ebd4fd) y tope contra lo disponible del proveedor (bcb1acd). Hashes faltantes: la liberación de stock nunca comprometido, “Generar orden de compra” desde “Por Producto” y “En Camino” en Almacén están en 54f33ca. Las actividades que no aparecían al programar eran un filtro con lista fija, corregido en 13ddb71; el campo “etapa” existe pero no se usa. No construidos: Drone, Matriz de Asistencia (hoy solo la vista por persona), descarga de varios PDFs a la vez, y la alerta de combustible configurable y con notificación (hoy 30% fijo, solo consulta). Tirar 2da Cintilla y las frecuencias a eliminar no tienen datos reales.
- **\[9.15 Almacén\] 23-sep-2026:** las 10 entradas de compra sin precio unitario (recibidas el 20-sep, antes del commit d09af02 que empezó a guardar el precio en la entrada) se completaron con el precio de su Orden de Compra; desde ese commit, recibir una orden copia su precio a la entrada. Claude Code detectó que las salidas no guardan su lote de origen. Se define el Lote de Almacén: número consecutivo único para toda la bodega, asignado por el sistema al recibir (un lote por producto por recepción, aunque sean varias tarimas), escrito en papel sobre el producto; salida sugerida por FIFO de llegada, dividida entre lotes si uno no alcanza, y salida de otro lote permitida registrando el lote real.
- **\[Varios\] 27-sep-2026:** Claude Code construyó las 7 prioridades del prompt de construcción, probadas con los ejemplos del prompt: (1) 108d669 — Lote de Almacén con número consecutivo global, un lote por producto en cada recepción, salida por FIFO de llegada dividida entre lotes, salida “fuera de orden” con lote elegido y motivo, devoluciones al lote exacto de origen; migró 13 lotes y 49 movimientos sin ambigüedad. (2) 4df9aec (Aplicaciones), 52e8b86 (Granular y Actividades) y 5ba5bdc (Indicadores) — Grupos de dosis, modos Por Cuadro y Por Variedad, avance en hectáreas totales con reparto guardado (no se recalcula), Actividades sin Grupos visibles; pantalla propia de Indicadores con costo de producto al precio real del lote; de paso se corrigieron un findFirst que perdía movimientos repartidos en varios lotes y el compromiso/entrega que no sumaba por producto entre Grupos (riesgo de doble compromiso). (3) b502586 — relleno de tractor y motobomba desde el Almacén Local (bloquea si no alcanza), avance con tractor que exige producto, litros y foto, modalidad Drone (construida sin combustible), motobomba como tipo de equipo con gasolina repartida por hectáreas, Traslado de tractor con bitácora y foto (combustible indirecto), alertas también en L/ha con margen configurable (20% por default), y selector de diésel filtrado por Combustible. (4) a79e7f3 — flete: Bodega marca “¿vino con flete?” al recibir, captura por folio en Compras → Flete, reparto por kilo al precio de cada lote sin tocar la Orden ni la CxP, y ajuste a la Huerta de lo ya enviado (prueba: \$750 sobre 1,000 kg + 500 L = \$0.50/kg; ajuste de +\$100 por 200 kg ya enviados). (5) 3fb719d — Tirar 2da Cintilla en Riego, por Sección, con nómina y reparto a Cuadros; pasa a 2 líneas al 100% de cada Sección; en Actividades queda solo como entrada reservada del catálogo. (6) 2ae48b2 — altas pendientes de autorización de RH con pago acumulado (se corrigió un bug de la acumulación durante la prueba), esquema catorcenal y mensual por primer o último viernes, sueldo capturado como anual (decisión de Claude Code, por validar), forma de pago efectivo o transferencia, Matriz de Asistencia, Liquidaciones que exigen cerrar días pendientes, Accesos y usuarios en Configuración; causa raíz distinta: el redondeo del sobre sí existía en la Nómina semanal pero faltaba en Liquidaciones (corregido); el error de Tarifa general no se reprodujo tal cual, pero Aplicaciones y Granular validaban la tarifa demasiado tarde (corregido). (7) 40ca1df — el Gerente Técnico autoriza solo compras de productos con Ingrediente Activo; se confirmó que las compras automáticas no piden autorización, que el Encargado de Compras no autoriza y que el Auditor ya tenía solo lectura global; se quitaron las frecuencias “cada 2 días”, “cada 3 días” y “2 sí, 1 no”; 5 botones que no pedían confirmación la piden ahora (Rechazar solicitud, Rechazar orden manual ×2, Rechazar bono, Quitar Ajuste de Asistencia, Cerrar ciclo). Quedan por verificar los puntos del prompt que el reporte no mencionó (ver Pendientes de 9.7, 9.11, 9.13 y 9.14).

## 14. Diagramas de flujo del sistema

Mapas visuales del ERP, generados a partir de las relaciones ya documentadas en cada ficha de módulo (secciones "Módulos que alimentan a este" / "Módulos que reciben información de este") — no se inventó ninguna conexión nueva, solo se representó gráficamente lo que ya está en el texto.

### Nivel 1 — Mapa general de módulos

Objetivo: dar una vista de 30 segundos de cómo se conecta todo el sistema — para enseñarle a alguien nuevo cómo piensa el ERP, y para revisar la lógica de flujo de información entre módulos. Vive aquí, en una sección aparte, para no complicar la estructura de texto de cada ficha.

**Agrupación por nivel operativo (de abajo hacia arriba en el diagrama):**

• Catálogos base: Unidades de Producción (9.1), Recursos Humanos (9.12), Equipos y Maquinaria (9.13), Vivero (9.3) — se llenan primero y son la base de los demás. Vivero (9.3) alimenta a Compras, Almacén y Unidades de Producción (costo de la plántula).

• Operación de campo: Actividades (9.4), Aplicaciones (9.7), Fertilizantes (9.5), Riego (9.6) — captura diaria de lo que pasa en el rancho.

• Insumos y logística: Compras (9.14), Almacén (9.15) — controlan qué hay y qué falta.

• Producción y venta: Cosecha (9.8), Empaque (9.9), Embarques (9.10).

• Gente y dinero: Nómina (9.11).

• Capas superiores (reciben de todos, no alimentan a nadie): Contabilidad (9.16), Auditoría (9.17), Panel Ejecutivo (9.18) — representadas con flechas punteadas desde "Todos los módulos operativos" para no saturar el diagrama con líneas individuales de cada módulo hacia estas tres.

<img src="media/image1.png" style="width:6.1in;height:2.27469in" />

*Nivel 1 — Mapa general de módulos y su flujo de información.*

**Nota de mantenimiento:** este diagrama debe regenerarse cada vez que cambien las relaciones "alimenta/recibe" de algún módulo en su ficha de texto — el texto sigue siendo la fuente de verdad, el diagrama es su representación visual.

Pendiente: regenerar la imagen para incluir Monitoreo (9.20), Vivero → Compras/Almacén, Riego → Nómina (Tirar 2da Cintilla) y Actividades/Granular/Riego → Equipos y Maquinaria (líneas de tractor y combustible).

### Nivel 2 — Diagramas de flujo detallados por módulo

Pendiente, para más adelante — diagramas con puestos, decisiones y autorizaciones dentro de un módulo específico (ej. el ciclo completo de Compras: solicitud → autorización → cotizar → generar orden → recepción). Se construirán módulo por módulo conforme se necesiten, empezando por los que más se usan para enseñar el sistema a gente nueva — no los 19 de golpe, por el costo de mantenerlos sincronizados.

## Apéndice A — Datos de arranque de CBF

(Datos propios de la operación actual de Chula Brand Farms. La lógica del documento es genérica; esto es lo que se carga para arrancar.)

### A.1 Operación y empresas relacionadas

- Cultivo actual: papaya, en Campeche.
- Huerta de arranque: Sonrisal — 27.7 ha (rancho de ~28 ha totales, no todas efectivas). La subdivisión formal en Cuadros está pendiente. Sus Secciones de Riego se están volviendo a dar de alta con datos reales (la Sección anterior se borró a propósito); mientras no exista al menos una, no se puede programar Fertirriego ni Riego ahí.
- Tres Marini: empresa asociada con CBF que comparte personal. Pendiente decidir si se maneja como una o varias Huertas y cómo se reparte el costo del bono (9.11).
- Sunrise Produce: comercializadora (empresa hermana) a la que se envía la fruta; aplica el esquema de precio inicial + liquidación posterior con comisión (9.10, 9.16).
- Otra empresa del grupo (~200 ha) interesada en adoptar el sistema (base del requisito de escala, Bloque 2).
- Frecuencia aproximada de fertilización hoy: 3 veces por semana.

### A.2 Equipos de arranque

- 2 camionetas, 1 tractor y varios implementos (bajo volumen). El diésel de tractores llega en garrafas de 20 L.

### A.3 Catálogo de Actividades de arranque

- Vigentes: Bodega, Ahoyado, Siembra, Vivero, Chapeo, Tirar Cinta, Limpieza, Herbicida, Hora Extra, Descarga y Acomodo de Planta, Deshilado, Mantenimiento Cintilla/Riego, Supervisor, Albañil, Bordeo, Encamado, Poda, Raleo, Fumigación, Virosis, Fertilización, Riego y Tirar 2da Cintilla. Fumigación, Fertilización, Riego y Tirar 2da Cintilla no se programan desde Actividades: existen para su tarifa, para clasificar pagos y, en su caso, para registrarse a mano en la Captura del día.
- Actividades de empaque del esquema “Depende de Empacadores”: Pesador, Tapa Caja, Lavador, Descarga, Pasafruta, Selección, Selección Ayuda.
- Descartadas del Excel histórico (no se dan de alta): Abejas, Abrir Zanja, Acarfruta, Acarreo Material, Agua, Cartón, Descarga 1, Desmonte, Fitos, Fumigadores, Metecarga, Motosierra, Rastreo, Retro, Saneo, Trampas Amarillas, Transportar Gente; “Ganado”; las de café (Acarreo de Café, Descarga de Café, Poda de Planta, Flete Plantas, CFE Bugambilias); rubros contables (Bono, Intereses, Internet, Luz, Pensión, Póliza, Postgraduados, Quincena, Rentas, Seguro, Servicio Eléctrico, Tienda, Tortilla, Viáticos, Despensa, Colegiaturas, Otros Gastos, Asesoría); y “Cam H / Cam R / Cam Ran / Chofer / Mecánico / Estibador”, “Fruits”, “Granel”, “Isla”, “Nahum”, “Feli”. (“Deshije” no aplica a papaya.)

### A.4 Códigos del Excel

- Los códigos numéricos de Huerta del Excel (1000, 6800, 6801, 7027, 9115, 9116, 9117, más “FINANCIERO”) no se usan: las Huertas se dan de alta con su nombre real.
- De 106 filas de personal del Excel se descartaron 4: “Bono Sem 30 Chula”, “Despensa Sem 31”, “Indirectos Sem 30” (rubros contables) y “Velador Bodega Bethania”.
- Prestación fija semanal “Bono, Despensa y Tortilla” del Excel de referencia: \$3,665 (\$2,868 bono + \$256.50 tortilla + \$540.50 despensa) — pendiente de decidir cómo se captura (9.11).

### A.5 Parámetros de arranque (todos editables)

- Bono de Asistencia Semanal: \$400 por default; \$200 para la lista de monto especial.
- Flete estimado de referencia: \$0.50 por kilo (siempre se captura el real de cada orden).
- Margen de la alerta de consumo de combustible: 20%.
- Umbral de % Excedente en el Comparador: 20%.
- Periodo de gracia del Cierre del día: 3 días.
- Fecha de referencia del esquema catorcenal: sábado 3-ene-2026 (por validar).
- Categorías de Contenedor iniciales: Saco, Bote, Garrafa, Tanque, Bolsa.
- Zona del comprador (flete \$0): Campeche.

### A.6 Personal — 102 nombres del Excel real de nómina

(Para carga inicial en V1, con script de carga, nunca dentro del código. Nombres tal como aparecen en el Excel; algunos pueden necesitar normalizar mayúsculas o acentos al cargar.)

- ABRAHAM CANUL UC
- ADRIANA MEDINA
- ANA DEYSI FLORES
- ANGEL TAMAY ZUL
- ANTONIL HERNANDEZ SANCHEZ
- ARTEMIO PEREZ PEREZ
- AURORA CHE
- BERNARDO PACHECO CHE
- CARLOS CANCHE
- CARLOS FLORES GOMEZ
- CELSO MEDINA REDONDA
- DAMIAN ISMAEL MENDEZ SALAZAR
- DEISY MARISOL PECH VARGAS
- EDGAR RENE CHAN CHE
- EDUARD PALOMO SOTO
- ELIAS HERNANDEZ ESPINOZA
- ELIVER DE JESUS PEREZ PEREZ
- EMANUEL SANTOS PECH
- ESTEBAN HERNANDEZ GOMEZ
- ESTEBAN PEREZ PEREZ
- EVER FLORENTINO HERNANDEZ
- FABRICIO PEREZ HERNANDEZ
- FERNANDO CHABLE NAAL
- FERNANDO EK CABRERA
- FERNANDO MAQUIN RACH
- FIDELINO GOMEZ PEREZ
- FLORENTINO HERNANDEZ PEREZ
- FRANCISCO PECH PECH
- GERARDO PEREZ LOPEZ
- GERONIMO PEREZ PEREZ
- GERSON YOVANI MENDEZ
- GLADIS GONZALES
- GUADALUPE PEREZ PEREZ
- HERLINDA MAKIN RACH
- HEVER JOSE GUERRA
- HILDA CAB TUYUB
- ISAAC PANTI
- ISIDRO SANCHEZ URBINA
- ISRAEL PEREZ HERNANDEZ
- ISRAI PANTI
- JAIME RODRIGO HERNANDEZ
- JAVIER LOPEZ HERNANDEZ
- JENY NOH VARGUEZ
- JOANNA MEDINA REDONDA
- JOHAN PECH MOO
- JOSE CANUL
- JOSE ENRIQUE SALAZAR GONGORA
- JOSE MANUEL PEREZ HERNANDEZ
- JOSE ROMAN HUITZ CHE
- JOSE TOBIA GONZALEZ
- JOSEFA PEREZ PEREZ
- JOSUE HUCHIN CHAN
- JUAN PEREZ LOPEZ
- JUAN TAMAY YAC
- LAZARO PEREZ HERNANDEZ
- LEANDRO GILBERTO RAMIREZ
- LEVI N PACHECO
- LITZET TRUJILLO GONZALEZ
- LORELIS ESPINOZA CANUL
- LUIS CHAN CHE
- MANUEL MENDOZA GUTIERREZ
- MANUEL PEREZ GARCIA
- MANUEL SANCHEZ URBINA
- MANUELA HERNANDEZ PEREZ
- MANUELA PEREZ RUIZ
- MARCO ANTONIO SANCHEZ PEREZ
- MARIA DOLORES HERNANDEZ HERNANDEZ
- MARIA EK CAN
- MARIA RUIZ GUTIERREZ
- MARIANA TOBIA GONZALEZ
- MARISELA PERERA MOO
- MARVIN JESUS SALAZAR PECH
- MATILDE MAKIN RACH
- MERCEDEZ VARGUEZ CAN
- MICAELA PEREZ HERNANDEZ
- MIGUEL ANGEL CHAVEZ
- MIGUEL ARA AKE
- MIGUEL MENDOZA PEREZ
- MOISES LORENZO GURTIERREZ
- Marco Benjamin Hernández pech
- NATALIA DEL ROSARIO SALAZAR
- NAYELLI VAZQUEZ MORENO
- NICOLAS HERNANDEZ SANCHEZ
- NICOLAS PEREZ PEREZ
- NICOLAS URBINA
- PATRICIA HERNANDEZ PEREZ
- PATRICIA REDONDA TENORIO
- PETRONA GUTIERREZ LORENZO
- RIGOBERTO BALLINA
- ROGELIO CHAN TUYUB
- RONEY PEREZ GOMEZ
- ROSA PEREZ
- ROSELIA ESPINOZA ARCOS
- ROSITA LOPEZ MENDEZ
- SERGIO PEREZ HERNANDEZ
- SIMON MENDOZA
- TOMASINA GOMEZ JIMENEZ
- UDIEL HERNANDEZ PEREZ
- VICENTE PEREZ SOLORSO
- VICTORIO HERNANDEZ PEREZ
- VIRGINIA FLORES GOMEZ
- ZULEE COBOC UC
