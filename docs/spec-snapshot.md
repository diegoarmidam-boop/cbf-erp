> **Nota:** este archivo es una extracción en texto plano de `CBF_ERP_Reestructura_Completa.docx` (snapshot al 2026-08-07), guardada aquí solo como referencia de trabajo rápida dentro del repo. El `.docx` original es el documento vivo y autoritativo — si hay una versión más reciente, esta copia queda desactualizada y debe regenerarse.

# Chula ERP — Documento Vivo (reestructurado)
(Primer bloque de la reestructura, para revisión — bloques 1 a 8, más la ficha completa de Unidades de Producción, el primer módulo de la sección 9. No se agregó ni se quitó ninguna decisión ya tomada; solo se reordenó dónde vive cada cosa, y se quitaron las atribuciones sueltas tipo “(Director General dijo X, fecha)” del cuerpo del texto — esas quedan en el Historial, al final de cada bloque/ficha.)
## 1. Resumen — qué es el sistema y sus objetivos
Qué es: ERP a la medida para Chula Brand Farms (papaya, Campeche), pensado como app móvil offline-first con servidor central, para eliminar doble captura y conectar toda la operación: campo → inventario → mano de obra → maquinaria → cosecha/empaque → ventas → contabilidad.
Objetivo central: que una sola captura de campo alimente automáticamente todos los módulos relacionados (inventario, mano de obra, costos, maquinaria), evitando doble captura y dándole a Dirección General visibilidad completa y en tiempo real de la operación.
Prioridad explícita: “hacerlo bien” sobre “hacerlo rápido” — no hay presupuesto fijo definido.
## 2. Acuerdos generales del sistema
Huerta = Rancho = Unidad de Producción (UP) — son sinónimos en todo el sistema.
Escala actual: 1 rancho de 28 hectáreas totales (no todas efectivas/cultivables). El número de cuadros aún no está definido/partido formalmente — queda como información a ingresar cuando se realice esa subdivisión; no debe ser un límite de diseño.
Preparado para crecer: arquitectura multi-rancho desde el diseño inicial (no como parche futuro). Dato de escalabilidad: una empresa hermana interesada en adoptar esta misma tecnología maneja ~200 hectáreas — el sistema debe soportar ese volumen desde el diseño de datos y desempeño.
Relación con la empresa hermana: Fase 1 (actual) — operaría con su propia base de datos separada, aunque con la misma lógica/formato que CBF; no comparten información en esta fase. Fase 2 (futuro, a varios años) — buscarían operar “a la par”, información conjunta pero con capacidad de separar contabilidad y reportes por empresa; se debe considerar en la arquitectura de datos desde ahora para no rehacer todo después.
Eje central del negocio: Huerta → Cuadro → Ciclo de cultivo (4 etapas: Preparación de Suelo, Desarrollo/Pre-cosecha, Cosecha y Empaque, Post-cosecha/Descanso). El costo se acumula para obtener costo por hectárea efectiva comparable entre huertas (no son del mismo tamaño), y el sistema calcula automáticamente el % de aprovechamiento del rancho (área efectiva vs. total). Detalle completo en la ficha de Unidades de Producción (sección 9).
Caso de uso ancla (el modelo que se replica en Aplicaciones, Fertilización, y a futuro Cosecha/Mantenimiento): una sola captura debe disparar automáticamente salida de inventario, costo de mano de obra, costo de Huerta/Cuadro, y consumo de maquinaria/combustible si aplica.
Menor número de registros posibles: principio rector de diseño — nunca forzar una segunda captura de algo que ya se puede inferir de la primera.
### Historial de este bloque
28-jul-2026: definición inicial del alcance (1 rancho, 28 ha, preparado para escalar), relación con empresa hermana.
4-ago-2026: caso de uso ancla formalizado como principio general, tras validarse de punta a punta en el mockup con Aplicaciones.
## 3. Centros de costo
“Producción” no es un centro de costo por separado — es el KPI compuesto que responde “¿cuánto costó llevar la Huerta de semilla a producción?”, medido por hectárea efectiva para poder comparar entre huertas de distinto tamaño. Se acumula sobre el eje Huerta/Cuadro (no es una etapa en sí, es la dimensión contra la que se cargan los costos), sumando estas tres etapas de costo:
Desarrollo — desde que se compra la semilla hasta que se comienza el corte (incluye mano de obra, fertilizantes, agroquímicos, servicios, etc. — etapas de Preparación de Suelo + Desarrollo/Pre-cosecha).
Cosecha — costo de cortar toda la fruta del ciclo.
Empaque — costo de empacarla.
Cosecha y Empaque suceden simultáneamente y son, dentro del ciclo de cultivo, una sola etapa “Cosecha y Empaque”. Pero como centros de costo siguen siendo dos, cada uno con su propio costo por separado, aunque ocurran al mismo tiempo.
Precisión de corte entre etapas de costo: una vez que empieza la etapa de Cosecha, si la planta todavía necesita agroquímicos/fertilización (para madurar y producir más), ese gasto ya no cuenta como Desarrollo — cuenta como costo de Cosecha. El corte entre “Desarrollo” y “Cosecha” como categorías de costo sigue la misma transición de etapa que define el Ciclo (ficha de Unidades de Producción), no una fecha aparte.
Nivel de detalle: se captura el costo a nivel Cuadro (no se pierde detalle, y cuadros distintos de la misma variedad pueden tener condiciones distintas que vale la pena distinguir), y se agrega un reporte que suma el costo por Variedad dentro de la Huerta (agrupando los cuadros que comparten esa variedad) — así se responde “cuánto se invirtió por variedad” sin capturar dos veces ni perder el desglose por Cuadro.
Oficina / Administración — gastos administrativos del ciclo de la Huerta, prorrateados por hectáreas efectivas entre huertas.
Bodega de Agroquímicos — no se prorratea a ninguna Huerta ni se acumula al costeo del ciclo; se mide aparte como capital invertido/inmovilizado (“dinero parado” en existencias). Es un indicador a nivel de toda la empresa (la Bodega es una sola central), sin desglose por Huerta.
Equipos y Maquinaria (tractores, implementos, camionetas) — dos tipos de gasto: Combustibles y Mantenimiento/Refacciones; dentro de cada uno se lleva el detalle por unidad individual (folio AF para tractores/camionetas/remolques, folio IA para implementos), para historial y alertas de consumo/rendimiento por equipo específico.
Embarques — centro de costo separado de Empaque, pero ligado/trazable a la producción de Empaque; se administra aparte.
Indirectos / Prorrateables — categoría paraguas que agrupa lo que no se carga directo a una Huerta específica: Combustibles, Mantenimiento, y el prorrateo de Administración.
Combustible: confirmado como centro de costo separado (Indirectos/Prorrateable), no cargado directo a la Huerta. Aun así, debe llevarse el detalle de consumo de diésel por Huerta para poder analizarlo.
### Pendientes de este bloque
Ninguno — Centros de Costo quedó cerrado por completo.
### Historial de este bloque
28-jul-2026: lista inicial de centros de costo identificados, y lista revisada propuesta por separado, con traslape pero sin conciliar.
4-ago-2026: estructura consolidada de un jalón — Producción como KPI compuesto (Desarrollo+Cosecha+Empaque), corte de etapas de costo, nivel de detalle Cuadro+Variedad, Bodega como capital inmovilizado a nivel empresa, Indirectos/Prorrateables confirmado como paraguas.
## 4. Permisos
Principio de acceso universal del Director General: sin importar qué rol tenga asignada la autorización de algo específico, el Director General siempre puede ver y autorizar cualquier alerta o captura pendiente de cualquier módulo — es un permiso de arquitectura, no una excepción caso por caso. Motivo práctico actual: hoy el Director General es el único puesto alto activo en el sistema, y puede dar de alta a alguien más adelante para ayudarle a capturar información, sin que eso le quite a él la capacidad de ver/autorizar todo mientras tanto.
Regla de permisos por rol y por módulo: ver vs. modificar, distinto según puesto.
Regla de cómo se refleja esto en la interfaz: si un rol no tiene acceso a un módulo, el módulo no aparece en ningún menú (ni sidebar, ni bottom nav, ni grilla “Más”). No existen pantallas de “sin acceso” ni candados — la ausencia es la señal. La lista de módulos se genera siempre a partir de una única fuente de permisos por rol, y esa misma fuente alimenta sidebar (PC), bottom nav (móvil) y grilla “Más” (móvil) — nunca se mantienen listas separadas a mano.
Un dispositivo = un usuario. No se comparten sesiones.
### Quién autoriza qué (mapeo de roles reales — ver organigrama completo en sección 8)
[TABLE]
Propuesta | Quién autoriza
Nueva actividad (nombre, unidad, tarifa, tipo de pago) | Gerente Administrativo
Cambio de tarifa de una actividad ya existente (destajo) | Gerente Administrativo
Alta de nueva persona en Personal | Recursos Humanos
Nuevo producto de almacén — agroquímico o fertilizante | Gerente Técnico de Producción (o Dirección General)
Nuevo producto de almacén — cualquier otra categoría | Lo autogestiona el Encargado de Bodega directamente
Orden de compra manual (no ligada a una Aplicación) | Dirección General, Gerente Administrativo, o Gerente Técnico
Orden de compra automática (generada desde Aplicaciones/Fertilización) | No requiere autorización adicional — ya la trae de quien programó
Producto para aplicar a la planta (agroquímico o fertilizante), antes de poder comprarse | Dirección General o Gerente Técnico de Producción (regla más restrictiva que las demás)
[/TABLE]
### Matriz de permisos módulo × rol
(Matriz completa, 22 puestos del organigrama de la sección 8 contra los módulos del sistema. Se repite en detalle dentro de la ficha de cada módulo — sección 9 — en su apartado “Personas y permisos”; aquí queda la vista consolidada.)
Todos los módulos, además de lo que se detalla en cada ficha: el Director General siempre tiene Ver + Capturar + Editar + Autorizar (acceso universal, ver arriba) — no se repite módulo por módulo. El Auditor siempre tiene Ver (solo lectura, global) — tampoco se repite.
### Mecanismo — “Propone / Autoriza”
Cuando alguien sin permiso de autorizar directamente propone algo de la tabla de arriba, se crea una solicitud pendiente — el elemento propuesto queda bloqueado, no se activa ni se puede usar todavía, hasta que se autorice. Esto evita el problema de tener que decidir qué hacer con información ya capturada si se llegara a rechazar — como nunca se pudo usar, no hay nada que revertir.
Al autorizar: el elemento propuesto se activa de verdad — se agrega al catálogo real o la persona/producto queda activo, disponible desde ese momento.
Al rechazar: la solicitud se descarta, idealmente con un motivo breve, y notificando a quien la propuso.
Alerta visible para quien autoriza (contador de pendientes), para que la autorización sea rápida y no se queden solicitudes olvidadas.
Autorización simultánea: si dos personas con permiso de autorizar actúan casi al mismo tiempo sobre la misma solicitud (uno aprueba, otro rechaza), aplica la regla “primero en llegar gana” — se notifica al segundo autorizador qué pasó, sin necesitar resolución manual.
### Pendientes de este bloque
Nivel de acceso “Editar” todavía no distingue matices más finos por módulo (ej. editar solo lo propio vs. editar cualquier registro) — se afina conforme se construya cada pantalla.
Roles aún sin ubicar en el organigrama (choferes, jefes de cuadrilla, Inocuidad/Velador/Con Acceso/Auxiliar) quedan sin permisos asignados hasta que se definan.
Montos exactos del tope de autorización de Compras por área (oficina vs. campo).
### Historial de este bloque
28-jul-2026: diseño original del flujo “Supervisor propone, Gerencia/Directivo autoriza”, genérico.
30-jul-2026: regla de autorización simultánea.
4-ago-2026: mapeo de cada tipo de propuesta a un rol real específico (una vez que existió el organigrama); matriz completa módulo × rol construida.
## 5. Vistas
(Sistema de componentes visuales reutilizables — colores, formas, botones, tarjetas — que se aplican en todos los módulos por igual, para que la interfaz sea consistente sin tener que rediseñar desde cero cada vez. Nota: la arquitectura técnica y el detalle más “de marca” — logo, paleta de campaña, tipografía — quedan hasta el final del documento (bloques técnico/interfaz), junto con todo lo demás que no se modifica seguido. Aquí solo lo que un lector necesita para entender cómo se comportan las pantallas.)
### Principio rector
Simple y funcional por fuera, potente por dentro. La interfaz nunca debe competir con la información: colores de marca usados con moderación, jerarquía clara, y toda la complejidad de cálculos/lógica invisible para quien solo necesita capturar o consultar.
Aclaración importante: lo que se reutiliza de un módulo a otro son los colores, formas y componentes (botones, tarjetas, tipografía — el sistema visual). La información y el layout de cada módulo son propios de sus datos — no se debe forzar la estructura de un módulo en otro solo por copiarla (ej. que Nóminas tenga 4 tarjetas de KPI no significa que todos los módulos deban tener 4 tarjetas).
### Componentes clave
Botón primario — fondo rosa, texto blanco, forma de pill, solo para la acción principal de la pantalla. Un botón primario por vista.
Botón crítico fijo abajo — para acciones irreversibles importantes (ej. “Cerrar el día”).
Botón flotante (FAB) — círculo rosa, ícono blanco, esquina inferior derecha en móvil, para la acción de “agregar” más usada del módulo.
Ítem de menú (sidebar/bottom nav) — ícono con fondo pastel del módulo + texto. Estado activo = fondo e ícono rosa. Nunca se muestra deshabilitado/candado: si no aplica, no se renderiza (ver regla de permisos, sección 4).
Tarjeta KPI — fondo blanco, borde sutil, etiqueta pequeña arriba + número grande abajo.
Tag/badge — pill pequeño con fondo pastel y texto del color correspondiente.
Buscador — pill con fondo neutro, sin borde marcado.
Menú de pestañas/subnav — cuando un módulo tiene varias pestañas internas, van en barra horizontal deslizable (scroll lateral), no en una lista que se envuelve en varias líneas. Al cambiar de pestaña, la pestaña activa se mantiene visible dentro del área visible del scroll.
### Layout por plataforma
Escritorio: sidebar fijo a la izquierda con marca arriba + lista de módulos agrupados; header superior con buscador y avatar; contenido en tarjetas.
Móvil: header superior con degradado de marca (título de sección); bottom nav con los módulos más usados del rol + botón “Más” que abre grilla completa; FAB circular flotante para la acción principal. En pantallas angostas, las tablas anchas con muchas columnas se reemplazan por tarjetas apiladas verticalmente, para no forzar scroll horizontal.
### Patrones de captura
Pre-llenado desde el día anterior: las pantallas de captura diaria se pre-llenan automáticamente con lo capturado el día anterior, dejando solo el campo de cantidad/valor en blanco — reduce fricción de captura repetitiva.
Validación antes de guardar: no se permite guardar una captura con campos obligatorios vacíos — se marca en rojo la celda faltante y se explica qué falta.
Confirmación explícita antes de acciones irreversibles: cierres de día, cierres de periodo de nómina, y aplicación de descuentos de préstamos siempre muestran una pantalla de revisión con el detalle exacto de lo que se va a aplicar, antes de confirmar.
Botón de revertir: cuando existe un botón para “+ agregar” algo pre-cargado (ej. “+ Otra actividad”), debe existir el simétrico para quitarlo, con la regla de que nunca se puede quedar en cero cuando se requiere al menos un registro.
### Pendientes de este bloque
Iconografía definitiva de los módulos — siguen siendo placeholders de posición/color.
Matriz completa módulo × rol × nivel de acceso más fina (ver bloque 4).
### Historial de este bloque
Especificación visual validada contra el mockup interactivo conforme se fue construyendo cada módulo (Nóminas primero, después Almacén/Aplicaciones/Fertilización/Riego).
4-ago-2026: aclaración explícita de que el sistema visual es reutilizable pero el layout/información de cada módulo no se fuerza a parecerse a otro.
## 6. Reglas
(Reglas de negocio que cruzan varios módulos a la vez — no son de un solo módulo, por eso viven aquí en vez de repetirse en cada ficha.)
### Sincronización offline y conflictos
Ante conflictos de sincronización (ej. bodega marca salida y huerta reporta aplicación del mismo insumo casi al mismo tiempo), el sistema debe generar alertas grandes y visibles para ambas partes involucradas, para que se comente y corrija manualmente — no debe intentar resolver estos casos de forma silenciosa/automática. (Pendiente construir un catálogo extenso de posibles casos de conflicto conforme se identifiquen, módulo por módulo.)
La app debe intentar sincronizar de forma constante/automática en cuanto detecte conexión a internet. Es especialmente crítico no perder información de nómina, embarques (dinero) o mantenimiento no reportado.
### Evidencia visual
Se requiere soporte de fotos como evidencia en varios módulos — a definir caso por caso (aplicaciones, mantenimiento, merma/daños, etc.).
### Clima
Se requiere registrar condiciones climáticas por día/rancho, ligado a actividades (relevante para aplicaciones).
### Cierre de periodo
Los números se van cerrando mensualmente, y al final del año se cuadran los reportes anuales.
Solo cabezas de Contabilidad pueden modificar/acceder a información de periodos ya cerrados. (Distinto del “cierre del día” operativo de cada Huerta, que es diario y lo maneja cada Supervisor — ver ficha de Nómina.)
### Seguridad y auditoría (regla general — el módulo de Auditoría en sí tiene su propia ficha)
Se requiere bitácora de auditoría completa: quién capturó y quién modificó cada registro, con fecha/hora.
Las correcciones sí editan/reemplazan el valor, pero debe quedar registro del cambio (histórico de versiones, no solo el valor final).
### Básculas
Las básculas usadas (para pesar fruta “1 Nacional”) son municipales y manuales — el peso se registra manualmente en el sistema, no hay integración digital de báscula por ahora.
### Códigos QR / barras
El uso de QR/código de barras es exclusivamente para productos del módulo de Almacén (agroquímicos/fertilizantes) — no para remolques, cuadros ni maquinaria.
No se usarán etiquetas físicas QR/código de barras pegadas en remolques/implementos (se desgastan y requerirían reposición constante en campo). En su lugar, cada maquinaria/remolque tiene un código/folio interno que se teclea o selecciona al momento de capturar su uso. (Para agroquímicos con código de barras de fábrica queda abierto a evaluar más adelante, no es prioridad.)
### Calendario laboral
No existe calendario de días festivos predefinido; Recursos Humanos lo irá registrando conforme se necesite (no necesariamente coincide con festivos oficiales de México).
### Notificaciones
Las alertas deben aparecer dentro de cada módulo como pendientes/burbujas (notificación in-app contextual por módulo).
Se busca también integración con un grupo de WhatsApp para replicar alertas fuera de la app.
### Exportación e integración con el flujo de trabajo actual
Se requiere exportar reportes a Excel y PDF.
Se busca poder subir PDFs y fotografías al sistema, y conectar con WhatsApp para generar reportes o extraer información de ciertos grupos — esto responde a cómo se maneja la información hoy día a día en la empresa (mucho por WhatsApp). Principalmente para facturas y tickets de proveedores (posible OCR a futuro).
(Pendiente sesión de “factibilidad técnica y de costo” una vez cerrada toda la lógica de negocio.)
### WhatsApp — dirección del flujo
Se busca, en orden de preferencia según factibilidad/costo: (1) idealmente ambas direcciones gratis — sistema→WhatsApp (alertas) y WhatsApp→sistema (capturar reportes/fotos); (2) si lo bidireccional no es gratis, al menos alertas salientes gratis; (3) si ni eso es viable gratis, las alertas se quedan solo dentro de la app por ahora. En cualquier caso, se debe dejar preparada la arquitectura para contratar WhatsApp Business API de pago más adelante.
Ejemplo de uso real ya resuelto: hoy ya se manda un reporte estandarizado por WhatsApp — un pizarrón físico por Huerta que se llena a mano y se fotografía (uno al inicio del día, otro al cierre), con semana del año/semana del cultivo, hectáreas efectivas, tabla de Equipos (folio AF/IA, estatus falla/OK), KPI de mano de obra, personal por puesto, y tabla de Actividades (hectáreas realizadas/faltantes/avance/personal/rendimiento/pendientes). Esto es justo lo que el sistema reemplazará: las actividades se reportan día a día directo al sistema y el reporte se arma solo.
### Pendientes de este bloque
Catálogo extenso de posibles casos de conflicto de sincronización, módulo por módulo.
Factibilidad técnica y de costo de las integraciones de WhatsApp/OCR.
KPI de mano de obra del pizarrón físico (meta/real) — su propósito exacto sigue sin definirse con precisión.
Varios puestos vistos en el pizarrón (Inocuidad, Velador, Con Acceso, Auxiliar) no están todavía en el catálogo de roles (ver sección 8).
### Historial de este bloque
Reglas transversales confirmadas en distintas rondas de preguntas, 27/28-jul-2026.
4-ago-2026: corrección del alcance de QR/código de barras; ejemplo real de WhatsApp resuelto con las fotos del pizarrón.
## 7. Estructura del documento vivo
Este documento se organiza de lo general a lo particular:
Resumen, acuerdos generales, centros de costo, permisos, vistas y reglas — lo que aplica a todo el sistema, sin importar el módulo.
Personas involucradas / puestos — el organigrama completo.
Descripción detallada de cada módulo — uno por uno, en el orden en que se llena la información en la operación real (Unidades de Producción primero, catálogos base, y de ahí siguiendo el flujo operativo hasta llegar a Contabilidad y el Panel Ejecutivo). Cada módulo sigue siempre la misma plantilla:
Lógica establecida actual del módulo
Vistas o submódulos
Lógica de entrada de información
Procesamiento de información (cómo se procesa, qué se procesa)
Salida de información
Personas/puestos involucrados y sus permisos
Módulos que alimentan a este
Módulos que reciben información de este
Pendientes de este módulo
(Sin comentarios sueltos de quién dijo qué y cuándo — esas atribuciones viven en el Historial de cada bloque/ficha, no interrumpiendo la lógica.)
Hasta el final: toda la arquitectura técnica (backend, base de datos, offline, etc.) y el detalle de identidad visual/marca — porque es lo que menos se modifica y lo que menos necesita ver quien solo quiere entender la lógica de negocio.
Y cerrando el documento: pendientes generales, qué falta, preguntas sin contestar, y el historial completo de cambios con fecha.
Regla de fondo: ninguna sección repite la lógica completa de otra — si algo ya se explicó en el bloque general (ej. el mecanismo “propone/autoriza” en Permisos) o en otro módulo, aquí solo se referencia, no se vuelve a explicar.
## 8. Personas involucradas / puestos
(Organigrama completo. El nombre correcto y definitivo del rol de campo es Supervisor de Huerta — antes aparecía como “Encargado de Huerta” en versiones preliminares del documento, ya unificado.)
### Dirección / Sistemas (acceso total)
[TABLE]
Puesto | Alcance | Permisos / Módulos
Director General | Global | Ve y edita todo. Dashboard de KPIs filtrable. Acceso y autorización universal (sección 4)
Encargado de Sistemas | Global | Igual que Director General
[/TABLE]
### Área Técnica / Campo
[TABLE]
Puesto | Alcance | Permisos / Módulos
Gerente Técnico de Producción | Multi-rancho | Programa actividades, aplicaciones y fertilizaciones. Ve nóminas por rancho. Tractores e implementos. Autoriza productos nuevos (junto con Dirección General)
Asistentes Técnicos de Producción | Igual que Gerente Técnico | Mismos permisos, excepto autorizar productos nuevos — solo pueden proponerlos
Supervisor de Huerta | Solo su Unidad de Producción asignada | Captura: aplicaciones (programar/realizadas), fertilizaciones realizadas, maquinaria e implementos realizados, mantenimiento (pedir servicio/reparaciones), mano de obra de campo (no empaque). Responsable del Almacén Local de su UP: confirma entregas del Almacén Central y reporta avance de aplicación, lo cual descuenta su almacén local
Ayudante de Supervisor | Misma huerta que su Supervisor | Mismos permisos que el Supervisor. Sus acciones solo avisan al Supervisor (notificación informativa) — no requieren su confirmación para aplicarse
Regador | Solo su UP asignada | Riegos y fertilización — registra horas de riego y especificaciones de fertirriego
[/TABLE]
### Mantenimiento
[TABLE]
Puesto | Alcance | Permisos / Módulos
Gerente de Mantenimiento | Global — todas las UP | Tractores e implementos, camionetas, combustibles
Mecánico | — | Módulo de mantenimiento: ver pendientes, notificar resoluciones, pedir piezas
[/TABLE]
### Cosecha, Empaque y Logística (bajo Gerente Administrativo)
[TABLE]
Puesto | Alcance | Permisos / Módulos
Supervisor de Cosecha | Rancho asignado | Cosecha, tractores e implementos
Supervisor de Empaque | Empaque asignado | Empaque y embarques
Encargado de Cosecha y Empaque | Todos los ranchos y empaques | Todo lo que ven sus supervisores (nivel consolidado)
Gerente de Logística | Global | Ve Cosecha, Empaque y Embarques en todas las UP. Ventas y facturación / cierre de liquidación de embarques
[/TABLE]
### RH / Nómina
[TABLE]
Puesto | Alcance | Permisos / Módulos
Recursos Humanos | — | Solo RH y Nóminas. Autoriza alta de nuevo Personal
Encargado de Nóminas | — | Igual que RH
[/TABLE]
### Administración
(El Contador es una línea aparte, no reporta al Gerente Administrativo.)
[TABLE]
Puesto | Alcance | Permisos / Módulos
Gerente Administrativo | Global | Compras, Almacén/Inventario, Cosecha/Empaque (consolidado), Nóminas, Recursos Humanos, Mantenimiento. Autoriza nueva actividad/cambio de tarifa de destajo
Contador (independiente) | Global (financiero) | Módulo de Contabilidad/Balance, más Compras y Nóminas
Asistente Administrativo | Igual que Gerente Administrativo | Mismos módulos, para ayudar a capturar. Sin permiso de editar registros ya subidos/confirmados
Encargado de Compras | Global — todos los ranchos | Módulo de Compras: pedidos que le llegan de Almacén, cotiza, genera la orden de compra formal, proveedores
Encargado de Bodega | Solo Almacén Central | Entradas y salidas de insumos/refacciones. Cuando falta stock, genera un pedido que le aparece a Compras. Autoriza altas de producto que no sean agroquímico/fertilizante. También puede ver (solo lectura) cuánto tiene reportado cada Almacén Local por rancho
└ Bodeguista | Mismo almacén que su Encargado | Mismos permisos que Encargado de Bodega, pero solo captura (reporta a él)
[/TABLE]
### Auditoría
[TABLE]
Puesto | Alcance | Permisos / Módulos
Auditor | Global | Solo lectura de todos los módulos — quinto tipo de acceso, distinto del “Global” con edición del Director
[/TABLE]
### Pendientes de este bloque
Roles adicionales que puedan faltar: choferes, jefes de cuadrilla, personal específico de empaque/cosecha/embarques — se agregan conforme se identifiquen.
Puestos vistos en el reporte de campo por WhatsApp (Inocuidad, Velador, Con Acceso, Auxiliar) todavía sin ubicar en este organigrama.
### Historial de este bloque
28-jul-2026: catálogo de roles preliminar (Encargado de Huerta, Encargado de Bodega, Personal de mantenimiento, Gerencia, Contabilidad).
4-ago-2026: organigrama completo construido por el usuario, cruzado contra los módulos del documento vivo. Resuelve: nombre definitivo de Supervisor de Huerta, rol de Encargado de Compras, rol de Auditor.
## 9. Descripción detallada de módulos
(Orden: el orden en que se llena la información en la operación real. Empieza aquí con Unidades de Producción — el resto de los módulos se van agregando en las siguientes entregas, mismo formato.)
### 9.1 Unidades de Producción
#### Lógica establecida actual del módulo
Huerta: unidad mayor (rancho/predio/Unidad de Producción). Cuadro: subdivisión de la huerta — nivel real de análisis para costo por hectárea, pero no necesariamente para rendimiento de cosecha (ver más abajo). Normalmente estable, pero puede cambiar de superficie (recalles, ajuste de calles) o dejar de sembrarse — requiere historial de configuración por fecha (versión del cuadro vigente en cada periodo).
Variedad — eje adicional para rendimiento: el Cuadro es confiable para costeo (los gastos sí se pueden cargar a un cuadro), pero el rendimiento de cosecha por cuadro basado en cajas/remolques nunca fue confiable en la práctica — se inflaba en cuadros de poca superficie. El eje que sí es confiable para rendimiento es Variedad/Híbrido: remolques totales producidos por variedad, entre la superficie sembrada de esa variedad. Se llevan ambos: costeo por Cuadro, y rendimiento por Variedad, sin forzar que sean el mismo eje. Cuando cuadros contiguos son de variedades distintas, se debe dar la vuelta en la calle para no mezclar frutas de una variedad con otra en el mismo remolque.
Ciclo de cultivo — vive a nivel Huerta, no por Cuadro: actualmente solo papaya, pero a futuro puede haber cultivos de descanso de suelo (cover crops). Cuando el primer Cuadro de una Huerta entra a la etapa de Cosecha, toda la Huerta entra a Cosecha junto con él — todos los Cuadros se mueven de etapa al mismo tiempo, sincronizados. Cada Cuadro dentro del Ciclo sigue teniendo su propia variedad (o su composición completa, si es cuadro de prueba). Una Huerta solo puede tener un Ciclo activo a la vez.
No existe el replante a media cosecha: si un Cuadro deja de ser productivo antes que el resto, se tira y se espera a que termine la producción en toda la Huerta. Cuando termina, se tira el resto, y si corresponde sembrar un cultivo de descanso, se siembra para toda la Huerta y la Huerta se cierra completa de una sola vez. (El costo de ese cultivo de descanso, si aplica, se carga al ciclo siguiente — ver ficha de Contabilidad.)
Etapas del ciclo (4): 1. Preparación de Suelos 2. Plantación/Desarrollo/Pre-cosecha 3. Cosecha y Empaque 4. Post-cosecha y descanso de tierras. La transición a “Cosecha” se marca automáticamente cuando empieza a haber cosecha registrada en cualquier Cuadro de la Huerta (no es fecha manual). Un ciclo nuevo (tras descanso y resiembra) reinicia el conteo de gastos desde cero y vuelve a recorrer las 4 etapas, para la Huerta completa. No todas las actividades son exclusivas de una etapa — tirado de cintilla puede ocurrir en Preparación o Desarrollo; chapeo/fertilización/reparación de cercas/fumigación pueden ocurrir en cualquier etapa; corte y empaque son exclusivos de Cosecha. Cada actividad del catálogo necesita poder marcarse como “restringida a una etapa” o “libre en cualquier etapa”.
Composición varietal del ciclo: la mayoría de los cuadros llevan una sola variedad para todo el ciclo. Los cuadros de pruebas pueden tener hasta 10 variedades distintas dentro del mismo cuadro, cada una con su propia hectárea o % exacto. Para cosecha, aunque un cuadro de pruebas tenga varias variedades internamente, no se necesita trazabilidad de variedad hasta el remolque — se cosechan y venden en bloque como “Híbridos”.
Sección de Riego: una Sección de Riego pertenece a UNA sola Huerta, y agrupa varios Cuadros que comparten la misma válvula que alimenta sus mangueras — no siempre coincide 1 a 1 con los límites de Cuadro. Es independiente de la sincronización de Ciclo/etapa (son dos conceptos aparte). El detalle completo de su uso vive en la ficha de Riego; aquí solo se da de alta.
Mapas: se requiere la distribución del rancho (hectáreas, cuadros, caminos) visualmente dentro del sistema. Ya existen croquis/planos con cuadros medidos, no hay que generarlos desde cero. El mapa es información base/estática — se descarga una vez y queda disponible offline, sin necesitar sincronizar cada vez que se consulta. Es una capa visual de referencia, sin vínculo estructurado a la entidad Cuadro — el Cuadro no lleva coordenadas/geometría como campo.
#### Vistas o submódulos
Huertas y Cuadros: pantalla para dar de alta/editar Huertas y sus Cuadros.
Ciclos: da de alta el Ciclo activo de la Huerta (tipo Cultivo/Descanso/Prueba, fechas) y su composición varietal por cuadro.
Secciones de Riego: agrupa Cuadros de una Huerta por válvula compartida.
#### Lógica de entrada de información
Campos de Cuadro: nombre/número, Huerta a la que pertenece, hectáreas, tipo de suelo, fecha de siembra, Marco de plantación (distancia entre surcos × distancia entre plantas, formato tipo “3.5 × 1.5 m”), variedad de papaya, estatus (activo/en descanso/fuera de producción). Se deja abierta la posibilidad de agregar campos personalizados conforme se necesiten, sin predefinir cuáles.
Marco de Plantación → cálculo automático de plantas: no se captura el número de plantas a mano — se calcula solo. Fórmula: plantas por hectárea = 10,000 m² ÷ (distancia entre surcos × distancia entre plantas); plantas totales del cuadro = plantas por hectárea × hectáreas del cuadro. Este dato alimenta directamente el modo de dosis “g/planta” de la ficha de Fertilizantes.
#### Procesamiento de información
El sistema calcula automáticamente el área efectiva del rancho (sumando las áreas de los cuadros dados de alta) y el % de aprovechamiento (área efectiva / área total del rancho). Lo que no es área efectiva son caminos, comedores y áreas muertas.
Al entrar el primer Cuadro de una Huerta a la etapa de Cosecha, el sistema sincroniza automáticamente el resto de los Cuadros de esa Huerta a la misma etapa.
El cálculo de densidad de plantación y plantas totales por cuadro (fórmula arriba) es automático a partir del Marco de Plantación.
#### Salida de información
Hectáreas efectivas y % de aprovechamiento → alimentan Centros de Costo y el Panel Ejecutivo.
Ciclo activo y etapa vigente de cada Huerta → determinan qué actividades se pueden capturar en cada momento (ver ficha de Actividades).
Composición varietal → alimenta el rendimiento por Variedad (ficha de Cosecha).
Plantas totales por cuadro → alimenta el cálculo de dosis “g/planta” (ficha de Fertilizantes).
Secciones de Riego → alimentan la ficha de Riego.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar | Editar
Director General | ✅ | ✅ | ✅
Gerente Técnico de Producción | ✅ | ✅ | ✅
Gerente Administrativo | ✅ | — | ✅
Supervisor de Huerta | ✅ (solo su Huerta) | — | —
Contabilidad | ✅ | — | —
Técnico de Producción (Asistentes) | ✅ | — | —
[/TABLE]
#### Módulos que alimentan a este
Ninguno — es de los primeros módulos que se llenan, es la base de la que parten los demás.
#### Módulos que reciben información de este
Prácticamente todos: Actividades, Fertilizantes, Riego, Aplicaciones, Cosecha, Empaque, Almacén (Almacén Local por Huerta), Nómina (Huerta de cada registro), Centros de Costo/Contabilidad, Panel Ejecutivo.
#### Pendientes de este módulo
Número real de cuadros en los que se divide el rancho de 28 hectáreas — pendiente de subdividir formalmente.
Mecánica exacta de captura para remolques de varios cuadros de la misma variedad (cosecha corrida) — decisión de fondo ya tomada (Cuadro para costeo, Variedad para rendimiento), pero falta refinar el detalle de captura.
Reasignación de Huerta a otro Supervisor a mitad de operación — casi no pasa en la práctica, sin diseñar hasta que haga falta.
#### Historial de este módulo
28-jul-2026: definición inicial de Huerta/Cuadro/Ciclo, campos propuestos de Cuadro (Marco de Plantación aprobado, GPS/polígono descartado a favor de campos personalizados abiertos).
28-jul-2026 (retroalimentación Director General): Variedad como eje de rendimiento (distinto de Cuadro para costeo); composición varietal de cuadros de prueba.
30-jul-2026: concepto de Sección de Riego documentado.
4-ago-2026: corrección de fondo — el Ciclo pasa de vivir por Cuadro a vivir a nivel Huerta (sincronización de etapas, no existe replante a media cosecha); Sección de Riego con diseño completo (agrupamiento por válvula); construcción y validación en mockup del Marco de Plantación con cálculo automático de plantas totales.
## Historial general de este bloque (1-8)
(Consolidado de las fechas clave — el detalle completo de cada cambio vive en el “Historial de este bloque/módulo” de cada sección de arriba.)
28-jul-2026: definición inicial de casi todo lo de este bloque — alcance del sistema, Huerta/Cuadro/Ciclo, Centros de Costo (primera lista), catálogo de roles preliminar, retroalimentación completa del Director General.
30-jul-2026: auditoría externa de flujos y permisos — resolvió reglas de autorización y candados de control.
4-ago-2026: ronda grande de cierre — organigrama completo de roles, matriz de permisos, Centros de Costo consolidados, corrección de fondo de Ciclo a nivel Huerta, Marco de Plantación validado en mockup.
### 9.2 Catálogos generales
(No es un módulo operativo con entrada/procesamiento/salida propio — es un resumen de los catálogos base que alimentan a todos los demás módulos y que arrancan vacíos, llenándose con el uso. El detalle completo de cada uno vive en la ficha de su módulo correspondiente.)
Personal — ficha de Recursos Humanos (9.11).
Actividades (tipos de labores) — ficha de Actividades (9.4).
Productos (agroquímicos, fertilizantes, y categorías abiertas) — ficha de Almacén (9.15).
Tractores/Equipos — ficha de Equipos y Maquinaria (9.13).
Cuadros/Huertas — ficha de Unidades de Producción (9.1).
Proveedores — dentro de la ficha de Compras (9.14).
Clientes — dentro de la ficha de Embarques (9.9).
Regla general de todos los catálogos: arrancan vacíos, con un botón “+” para ir agregando conforme se necesite — no se pre-cargan con listas cerradas, y todos dejan la posibilidad de agregar campos personalizados donde ya se confirmó (ej. Cuadro).
Datos semilla listos para V1 (NUEVO, sesión del Excel real de nómina actualizado): se identificaron 102 nombres de Personal reales, listos para precargarse en la base de datos al construir V1 — no hardcodeados en el código, sino como script de carga inicial. También quedaron confirmadas las actividades vigentes hoy: Bodega, Ahoyado, Mantenimiento, Siembra, Supervisor, Vivero, Chapeo, Riego, Riego Tirar Cinta, Fumigación, Limpieza, Virosis (“Ganado” — confirmado que no se usa). Ver el detalle completo y las decisiones de qué se descarta en la ficha de Nómina (9.11).
#### Pendientes de este bloque
Las ~14 actividades candidatas adicionales del histórico del Excel de nómina real (ver ficha de Nómina) — en espera de que el usuario las depure antes de autorizar que se agreguen.
### 9.3 Vivero
#### Lógica establecida actual del módulo
CBF sí produce su propia plántula de papaya (no la compra externa).
Por ahora no necesita su propio control de costos separado — el costo de vivero se carga directo como costo de la Huerta (UP), no como un centro de costo propio.
Confirmado: no es un módulo que se vaya a necesitar pronto — queda de baja prioridad.
#### Vistas o submódulos
Ninguna todavía — no se ha diseñado a detalle por ser baja prioridad.
#### Lógica de entrada de información
No definida — pendiente hasta que se priorice.
#### Procesamiento de información
No definido.
#### Salida de información
El costo de vivero, cuando se registre, se sumará directo al costo de la Huerta correspondiente (ver Centros de Costo, bloque 3).
#### Personas/puestos involucrados y sus permisos
No definido todavía.
#### Módulos que alimentan a este
Ninguno definido.
#### Módulos que reciben información de este
Unidades de Producción (el costo se carga ahí, sin desglose propio).
#### Pendientes de este módulo
Todo el diseño de detalle — confirmado como baja prioridad, no se necesita pronto.
#### Historial de este módulo
28-jul-2026: confirmado que CBF produce su propia plántula, sin necesidad de módulo propio por ahora.
### 9.4 Actividades
#### Lógica establecida actual del módulo
Catálogo de tipos de labores (fertilización, aplicaciones de agroquímicos, riego, raleo de fruta, sexado, fumigación, poda, control de maleza, cosecha, etc.). (“Deshije” no aplica al cultivo de papaya, se removió del catálogo.)
Tiene dos etapas separadas: Planeación (qué se va a hacer, cuándo, en qué cuadro) y Registro/Ejecución (qué se hizo realmente) — son comparables (plan vs. real), porque lo planeado puede no ejecutarse en la fecha prevista.
La planeación la generan tanto Dirección General como el Gerente Técnico/Supervisor, con frecuencia semanal.
Una actividad planeada queda en estado “pendiente” hasta que alguien la marca como terminada (no se autocierra ni se autoreprograma).
Se busca reporte de cumplimiento de plan vs. real (ideal, no solo bitácora).
No todas las actividades tienen la misma estructura: Chapeo (limpieza manual) es solo mano de obra, sin insumo ni maquinaria; hay actividades solo con maquinaria, sin mano de obra; Aplicaciones son mano de obra + insumo + (a veces) maquinaria. El módulo debe permitir marcar qué componentes aplican por tipo de actividad, no forzar los 3 siempre.
Cada actividad del catálogo puede marcarse como “restringida a una etapa” del ciclo o “libre en cualquier etapa” (ver Unidades de Producción, 9.1) — no es una relación 1 a 1 fija.
Cosecha y Empaque se manejan como módulo(s) separados de Actividades (información muy específica: remolques, cajas), aunque comparten el mismo motor de plan-vs-real y conexión a mano de obra.
Aplicaciones de agroquímicos tiene su propio flujo completo, ver ficha de Aplicaciones (9.6) — no se repite aquí.
#### Vistas o submódulos
Catálogo de Actividades (nombre + unidad de pago).
Planeación semanal.
Registro/Ejecución (comparado contra lo planeado).
#### Lógica de entrada de información
Alta de actividad: nombre, unidad de pago (día, surco, planta, remolque, caja, cuadro), tarifa, si requiere Cuadro o solo Huerta, si aplica solo en ciertas etapas del ciclo.
Planeación: qué actividad, cuándo, en qué Cuadro/Huerta.
#### Procesamiento de información
Comparación automática de plan vs. real para el reporte de cumplimiento.
Al planear una actividad que consume insumo, se avisa automáticamente a Almacén (ver ficha de Almacén, 9.15) para preparar la salida con anticipación.
#### Salida de información
Costo de mano de obra por actividad → Nómina (9.10).
Costo de la actividad → Centros de Costo (bloque 3) / Contabilidad (9.16).
Consumo de insumo planeado → Almacén (9.15).
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar (planear) | Capturar (real) | Autoriza
Director General | ✅ | ✅ | ✅ | ✅
Gerente Técnico de Producción | ✅ | ✅ | — | ✅ (nueva actividad la autoriza Gerente Administrativo)
Supervisor de Huerta | ✅ (su UP) | — | ✅ (su UP) | —
Gerente Administrativo | ✅ | — | — | ✅ (nueva actividad, cambio de tarifa)
[/TABLE]
#### Módulos que alimentan a este
Unidades de Producción (etapa vigente del Ciclo, determina qué actividades se pueden planear).
#### Módulos que reciben información de este
Nómina (mano de obra generada por cada actividad).
Almacén (aviso anticipado de consumo).
Aplicaciones y Fertilización (usan el mismo motor de plan vs. real).
Centros de Costo / Contabilidad.
#### Pendientes de este módulo
Ninguno específico — la lógica general está cerrada; el detalle fino vive en Aplicaciones y Fertilización.
#### Historial de este módulo
28-jul-2026: lógica confirmada — catálogo, planeación vs. registro, estructura variable por tipo de actividad.
### 9.5 Fertilizantes
#### Lógica establecida actual del módulo
CBF va a empezar a operar fertilización pronto — módulo priorizado.
Tiene su propio flujo de ejecución — NO pasa por el módulo de Aplicaciones, que es exclusivo de agroquímicos. Comparte catálogo con Almacén donde tiene sentido.
Tipos confirmados: granular y soluble/hidrosoluble (ej. bulto de 25 kg). El fertirriego (líquido inyectado en el riego) se maneja junto con estos, no aparte, pero se ejecuta día a día desde el módulo de Riego (9.6-bis), no desde aquí.
Debe manejarse por ingrediente activo/composición (ej. % de N-P-K) como requisito obligatorio de registro, igual que el nombre comercial — mismo patrón de catálogo que Almacén (Ingrediente Activo → Producto Comercial → Presentación).
Frecuencia estándar aproximada de fertilización en general: 3 veces por semana.
Lo programa/decide el Gerente Técnico de Producción (o Dirección General) — no hay un rol separado para fertilización.
Camino 1 — Granular (dos pasos, mismo patrón que Aplicaciones):
Paso 1, Programar: Huerta, Cuadro(s), producto (solo fertilizantes ya autorizados), recurso (“Con gente” o “Con implemento” — si es implemento, obligatorio elegir el equipo), modo de dosis — kg/hectárea o g/planta — y rango de fechas (inicio/fin).
Si es g/planta, la cantidad total se calcula usando el número de plantas del Cuadro, calculado solo a partir del Marco de Plantación (ver Unidades de Producción, 9.1): plantas/hectárea = 10,000 m² ÷ (distancia entre surcos × distancia entre plantas).
Si alcanza el Almacén se aparta de inmediato; si no alcanza, no se bloquea — se manda automático a Compras (9.14) sin requerir autorización adicional.
Entrega y confirmación: se confirma en el mismo momento de la entrega, sin paso aparte (mismo mecanismo que Almacén/Aplicaciones).
Paso 2, Registrar como realizada (Supervisor): solo después de que se haya entregado el producto a la Huerta. Genera el registro real de mano de obra en Nómina, y descuenta automático del Almacén Local — el Supervisor no lo da de baja a mano.
Camino 2 — Fertirriego (se programa aquí, se ejecuta desde Riego):
Programar: Huerta, Sección(es) de Riego (no Cuadros directamente), producto (solo fertilizantes autorizados), dosis en concentración (ml/L, g/L o kg/L) + litros de agua por hectárea, frecuencia (diario / cada 2 días / cada 3 días / patrón “2 sí, 1 no”), y rango de fechas. Misma fórmula de cálculo de cantidad total que Aplicaciones: concentración × litros de agua/ha × hectáreas de las secciones elegidas.
Igual que Granular: si no alcanza el Almacén, se manda a Compras sin bloquear.
Una vez entregado a la Huerta, la ejecución diaria (¿se metió hoy?, ¿cuánto?) se registra desde Riego (9.6-bis) — no hay “registrar como realizada” aquí, porque el fertirriego se aplica en varias sesiones a lo largo de la frecuencia programada.
Autorización de producto: la regla es la misma para fertilizantes que para agroquímicos — cualquier producto que se le vaya a echar a la planta debe estar autorizado por Dirección General o Gerente Técnico de Producción antes de poder comprarse, no solo antes de aplicarse. El catálogo de “solicitar compra” (9.14) filtra y no deja elegir un fertilizante sin autorizar.
Encuesta de seguimiento post-aplicación (aplica también a Aplicaciones, 9.6): idea para registrar la respuesta de la planta después de una aplicación, mediante una encuesta simple 1-2 días después preguntando cómo se ve la planta. Se dispararía automáticamente, la contestaría el Supervisor o un técnico. El contenido exacto de las preguntas queda pendiente de que los técnicos lo definan — el usuario pidió dejarla para después.
Análisis de suelo/agua/conductividad: se reciben 3 tipos de análisis con periodicidad propia — extracto de pasta saturada (suelo) y nutrición foliar de peciolo cada 60 días; análisis de savia (CARDIS) de peciolo, semanal. El análisis de agua reporta pH, Temp, CE, RAS, Clasificación, cationes/aniones, Boro; el foliar reporta Nitrógeno Total, aniones/cationes, microelementos, cada uno con su rango de referencia. Equivalencia de terminología del laboratorio: “LOTE” = Huerta, “SECTOR” = Variedad (no Cuadro, ni Sección de Riego) — los análisis se ligan al eje Huerta+Variedad. La CE en savia no debería bajar de 12 (referencia de falta de nutrientes) — unidad exacta pendiente de confirmar con los técnicos. El resto del detalle técnico (qué capturar exactamente por aplicación) queda pendiente de que los técnicos/ingenieros de campo lo definan directamente — no es algo que el usuario deba resolver solo.
#### Vistas o submódulos
Granular: catálogo, programar, registrar realizada.
Fertirriego: catálogo, programar (la ejecución vive en Riego).
#### Lógica de entrada de información
Ver “Paso 1, Programar” de ambos caminos arriba.
#### Procesamiento de información
Cálculo de cantidad total a partir de la dosis (kg/ha, g/planta, o concentración+agua) y las hectáreas/plantas de los cuadros o secciones elegidas.
Verificación automática de stock disponible en Almacén, con ruteo automático a Compras si falta.
#### Salida de información
Mano de obra (Granular) → Nómina.
Consumo de producto → Almacén Local de la Huerta.
Fertirriego programado y entregado → Riego (ejecución diaria).
Pendientes de compra → Compras.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar (programar) | Capturar (realizada) | Autoriza
Director General | ✅ | ✅ | ✅ | ✅
Gerente Técnico de Producción | ✅ | ✅ | — | ✅ (productos)
Asistentes Técnicos de Producción | ✅ | ✅ (proponen) | — | —
Supervisor de Huerta | ✅ (su UP) | — | ✅ | —
[/TABLE]
#### Módulos que alimentan a este
Unidades de Producción (Cuadros, Marco de Plantación/plantas, Secciones de Riego).
Almacén (catálogo de productos y stock).
#### Módulos que reciben información de este
Almacén (consumo, movimientos).
Nómina (mano de obra de Granular).
Compras (pendientes automáticos por faltante).
Riego (fertirriegos programados, para ejecución diaria).
#### Pendientes de este módulo
Encuesta de seguimiento post-aplicación — diseño de detalle pendiente, el usuario pidió dejarla para después.
Detalle técnico fino de qué capturar por aplicación — pendiente de los técnicos/ingenieros de campo (secciones 2 y 3 del cuestionario para ellos, sin contestar todavía).
Ejemplos de análisis de pasta saturada y de savia/CARDIS — el usuario no los tiene disponibles todavía.
Unidad exacta del umbral de CE en savia (¿12 en qué unidad?) — pendiente de los técnicos.
Rangos de referencia/alerta para análisis de agua y pasta saturada — pendiente de los técnicos. Prioridad baja para construir alertas automáticas con esto: los ingenieros ya analizan estos resultados y deciden con base en ellos hoy.
#### Historial de este módulo
28-jul-2026: módulo priorizado, tipos de fertilizante, frecuencia de fertirriego.
4-ago-2026: análisis de laboratorio, equivalencia de terminología (LOTE=Huerta, SECTOR=Variedad).
4-ago-2026 (validado en mockup): flujo completo de los dos caminos construido y probado de punta a punta; fórmula de plantas totales a partir de Marco de Plantación; regla de autorización de producto antes de comprarse.
### 9.6 Riego
#### Lógica establecida actual del módulo
Relevante para fertirriego — más rápido que la fertilización granular tirada con gente, pero las horas de riego pueden variar por sección.
Una Sección de Riego pertenece a UNA sola Huerta, y agrupa varios Cuadros que comparten la misma válvula que alimenta sus mangueras — no siempre coincide 1 a 1 con los límites de Cuadro. Se da de alta dentro de Unidades de Producción (9.1).
Las horas de riego no son un dato fijo por sección — varían día a día según la necesidad de agua, se capturan a diario.
La dosis de fertirriego se programa desde Fertilizantes (9.5) por Sección de Riego, con su propia concentración y frecuencia.
Ejecución diaria: cada día, por Sección, se captura cuántas horas se regó, y — si hay un fertirriego programado y ya entregado a esa Huerta — se confirma si se metió ese día y cuánto. Ese consumo diario resta directamente del Almacén Local de la Huerta (mismo mecanismo que Aplicaciones/Fertilización granular).
A diferencia de una Aplicación, el riego no se liga a mano de obra variable — el operador es siempre el mismo por rancho (rol fijo, “Regador”). El registro diario de riego no genera ningún registro de mano de obra en Nómina.
El candado de Almacén Local aplica igual al fertirriego — mismo criterio de remisión/reporte de avance/alarma a 15 días (ver Almacén, 9.15).
Independiente de la sincronización de Ciclo/etapa (Unidades de Producción) — son dos conceptos aparte, la Sección de Riego es un agrupamiento de infraestructura.
#### Vistas o submódulos
Captura diaria por Sección de Riego (horas + confirmación de fertirriego).
#### Lógica de entrada de información
Por Sección de Riego, por día: horas regadas; si aplica, “¿se metió el fertirriego programado?” (sí/no) y cantidad aplicada.
#### Procesamiento de información
El consumo diario confirmado de fertirriego descuenta directamente el saldo del Almacén Local de esa Huerta para ese producto.
#### Salida de información
Consumo diario → Almacén Local (descuento).
Horas regadas → histórico, sin impacto en costo (no genera mano de obra ni cargo por cuadro).
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar
Director General | ✅ | ✅
Regador | ✅ (su UP) | ✅ (horas, fertirriego)
Supervisor de Huerta | ✅ (su UP) | —
Gerente Técnico de Producción | ✅ (multi-rancho) | —
[/TABLE]
#### Módulos que alimentan a este
Unidades de Producción (Secciones de Riego).
Fertilizantes (fertirriegos programados y entregados).
#### Módulos que reciben información de este
Almacén (descuento diario del Almacén Local).
#### Pendientes de este módulo
Construir la alarma de descuadre a 15 días en el sistema real (el resto ya está construido y validado en el mockup).
#### Historial de este módulo
30-jul-2026: concepto documentado, sin diseño de detalle.
4-ago-2026: diseño completado (agrupamiento por válvula, horas variables, dosis por rancho o sección, sin mano de obra variable, candado aplica igual).
4-ago-2026 (validado en mockup): Secciones de Riego construidas dentro de Unidades de Producción, captura diaria de horas + confirmación de fertirriego, sin generar mano de obra — confirmado y probado.
### 9.7 Aplicaciones (Agroquímicos)
#### Lógica establecida actual del módulo
Exclusivo de agroquímicos — la fertilización granular y el fertirriego NO viven aquí, tienen su propio flujo en Fertilizantes (9.5).
Caso de uso ancla: una sola captura de “Aplicación” genera movimientos automáticos en: inventario (salida del producto), mano de obra (personas/cuadrilla, costo según esquema de pago), costo por Cuadro (agroquímico + mano de obra + maquinaria si aplica), y maquinaria/combustible (si se usó tractor+implemento, el diésel se vincula al cuadro). Validado en mockup: al registrar una aplicación como realizada, se genera el registro real de mano de obra en Nómina — el caso de uso ancla funciona de extremo a extremo.
Regla de inventario: el control se lleva por ingrediente activo, no solo por marca — evita que quede stock viejo sin usar (FIFO por ingrediente activo).
Planeación → Almacén: al planear una aplicación, el sistema avisa a Almacén para preparar la salida con anticipación.
Secuencia formal — dos pasos:
Paso 1, Programar (Gerente Técnico de Producción o Asistente Técnico): - Se elige Huerta, Cuadro(s), producto (solo agroquímicos ya autorizados), recurso (“Con gente” o “Con implemento” — si es implemento, obligatorio elegir el equipo), dosis en dos partes — concentración (ml/L, g/L, o kg/L) + litros de mezcla por hectárea — y rango de fechas (inicio/fin). - Fórmula: cantidad total = concentración × litros de mezcla por hectárea × hectáreas totales de los cuadros elegidos (con conversión de unidad: ml→L o g→kg ÷1000; kg/L ya en kg). - Si alcanza el Almacén se aparta de inmediato; si no alcanza, no se bloquea — se manda automático a Compras (9.14) sin requerir autorización adicional (ya la trae de quien programó).
Entrega y confirmación: cuando Almacén entrega físicamente el producto a la Huerta, la recepción se confirma en ese mismo momento — no hay paso aparte de confirmación posterior.
Paso 2, Registrar como realizada (Supervisor): - Solo se puede después de que Almacén haya entregado el producto a esa Huerta — si no se ha entregado, el sistema bloquea la acción con aviso explícito. Validado en mockup. - Se captura quién la hizo y cuántas horas — genera el registro real de mano de obra en Nómina, y descuenta automático del Almacén Local — el Supervisor no lo da de baja a mano.
Quién autoriza un producto nuevo: Dirección General y Gerente Técnico de Producción únicamente. Los Asistentes Técnicos pueden proponer, pero no autorizar. Flujo: “Lista de Productos → Agregar producto” dispara la señal para autorizar. Un producto puede estar dado de alta sin estar autorizado — programarlo en campo sí requiere autorización explícita primero. Modificar un producto ya autorizado sigue el mismo grupo selecto.
Sobrante y abono: el sobrante se devuelve al almacén generando un abono — lo registra el Encargado de Bodega al recibirlo físicamente de vuelta, al mismo precio unitario con el que se cargó el gasto originalmente.
Recetas/dosis: se pueden guardar y reutilizar como “paquete técnico”, pero varían por rancho (suelo, agua, temporada) — no se busca estandarizar desde el día uno.
Confirmado: NO hay periodo de reingreso ni periodo de carencia que el sistema deba controlar o alertar.
Si una aplicación planeada no se ejecuta a tiempo: si el producto nunca salió de bodega, se mantiene apartado 15 días y luego se libera automáticamente. Si ya está en el rancho sin aplicar, se muestra como “aplicación pendiente”. Si pasan 15 días sin aplicarse, se avisa a los Gerentes de Huerta (no a los Supervisores) — la alerta no se quita hasta que el producto regrese físicamente a bodega.
#### Vistas o submódulos
Programar.
Registrar como realizada.
#### Lógica de entrada de información
Ver “Paso 1, Programar” arriba.
#### Procesamiento de información
Cálculo de cantidad total a partir de concentración + litros de mezcla + hectáreas.
Verificación automática de stock, ruteo a Compras si falta.
Descuento automático del Almacén Local al reportar realizada.
#### Salida de información
Mano de obra → Nómina.
Consumo de producto → Almacén Local.
Pendientes de compra → Compras.
Costo → Centros de Costo/Contabilidad.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar (programar) | Capturar (realizada) | Autoriza
Director General | ✅ | ✅ | ✅ | ✅
Gerente Técnico de Producción | ✅ | ✅ | — | ✅ (productos)
Asistentes Técnicos de Producción | ✅ | ✅ (proponen) | — | —
Supervisor de Huerta | ✅ (su UP) | — | ✅ | —
Ayudante de Supervisor | ✅ | — | ✅ (avisa al Supervisor) | —
[/TABLE]
#### Módulos que alimentan a este
Unidades de Producción (Cuadros, hectáreas).
Almacén (catálogo, stock).
#### Módulos que reciben información de este
Almacén (consumo, movimientos, pendientes de compra).
Nómina (mano de obra).
Compras (pendientes automáticos).
Centros de Costo/Contabilidad.
#### Pendientes de este módulo
Precisar exactamente quiénes, además de Dirección General/Gerente Técnico, pueden modificar (no solo dar de alta) el catálogo de productos ya autorizados.
#### Historial de este módulo
28-jul-2026: secuencia formal de sucesos.
4-ago-2026: quién autoriza productos nuevos; mecanismo de abono precisado; confirmado exclusivo de agroquímicos.
4-ago-2026 (corrección de flujo, validada en mockup): dosis rediseñada como concentración + litros de mezcla; rango de fechas; campo de recurso gente/implemento; falta de stock ya no bloquea, genera pendiente en Compras; entrega y confirmación unificadas en un paso; descuento automático del Almacén Local; candado de “no reportar sin haber entregado”.
### 9.8 Cosecha
#### Lógica establecida actual del módulo
Costeo: el costo por cuadro no busca ser un costo absoluto aislado, sino permitir sacar un costo por hectárea efectiva comparable entre cuadros y a nivel rancho.
Mecánica de captura multi-cuadro — resuelto: CBF no tiene báscula en el punto de cosecha, por lo que no es posible conocer la proporción exacta de fruta que viene de cada cuadro cuando un remolque junta varios cuadros contiguos de la misma variedad. El sistema no fuerza un desglose proporcional preciso — se registra el remolque asociado al conjunto de cuadros que aportaron.
Un remolque contiene normalmente fruta de un solo cuadro, pero en cuadros contiguos de la misma variedad es común y deseable cosechar corrido sin dar la vuelta, mezclando fruta de varios cuadros en el mismo remolque. Cuando cuadros contiguos son de variedades distintas, sí se da la vuelta para no mezclar.
El pago del remolque se divide entre las personas que subieron a ese remolque ese día. Un cuadro puede generar varios remolques.
El equipo de corte no siempre se arma día a día — existen cuadrillas con nombre fijo y persistente (ej. “Corte G1”, “Corte G2”), que se reutilizan semana a semana aunque cambien los integrantes. El sistema soporta ambos casos: grupos con nombre persistente, y grupos armados el mismo día sin nombre fijo.
Rendimiento se lleva por Variedad, no por Cuadro (ver Unidades de Producción, 9.1) — remolques totales por variedad entre la superficie sembrada de esa variedad.
Cuadros de prueba: no se necesita trazabilidad de variedad hasta el remolque — se cosechan y venden en bloque como “Híbridos”.
#### Vistas o submódulos
Captura de remolque (Cuadro(s) de origen, variedad, cuadrilla/grupo).
#### Lógica de entrada de información
Remolque: Cuadro(s) de origen, tractor que lo jaló, personas que subieron, fecha, variedad, cantidad/peso de fruta.
#### Procesamiento de información
Costo por hectárea efectiva acumulado por Cuadro.
Rendimiento acumulado por Variedad.
El pago del remolque se divide automáticamente entre los integrantes de la cuadrilla que subieron.
#### Salida de información
Mano de obra (pago de remolque) → Nómina.
Producción → Empaque (fruta que entra a línea).
Rendimiento por Variedad y costo por Cuadro → Panel Ejecutivo / KPIs.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar
Director General | ✅ | ✅
Supervisor de Cosecha | ✅ (su rancho) | ✅
Encargado de Cosecha y Empaque | ✅ (todos) | —
Gerente Administrativo | ✅ (consolidado) | —
[/TABLE]
#### Módulos que alimentan a este
Unidades de Producción (Cuadros, Variedad).
Equipos y Maquinaria (tractores que jalan remolques).
#### Módulos que reciben información de este
Nómina (pago de remolque).
Empaque (fruta cosechada).
Panel Ejecutivo (KPIs de rendimiento y costo).
#### Pendientes de este módulo
Diseño del módulo completo — Fase 8 del plan de implementación, no se construye pronto.
#### Historial de este módulo
28-jul-2026: reglas base de cosecha por remolque, costeo, mecánica multi-cuadro resuelta (sin báscula).
28-jul-2026 (retroalimentación Director General): matiz de remolque multi-cuadro para variedad, cuadrillas con nombre fijo confirmadas contra Excel real.
### 9.9 Empaque
(Incluye el catálogo de Embarques por separado — ver más abajo — y el catálogo de Clientes, que vive dentro de esta ficha por decisión del usuario.)
#### Lógica establecida actual del módulo
El costo de empaque (que no se puede rastrear a un cuadro específico) se prorratea entre todas las hectáreas efectivas del rancho y se suma al costo por hectárea ya acumulado de cosecha/cultivo.
No existe almacén/cámara de producto terminado a mediano/largo plazo — la fruta se paletiza según sale de línea. Sí puede existir un saldo corto de cajas empacadas pendientes de embarcar de un día para otro, y ese saldo necesita trazabilidad de variedad/cuadro de origen — no es solo un conteo agregado.
Selección de destino de la fruta (exportación / nacional / “1 Nacional” / merma) ocurre dentro de la línea de empaque, no en campo: se aparta la “1 Nacional”, la de exportación sigue en banda, los clientes nacionales seleccionan después ya afuera, lo que no se coloca se vuelve merma.
Exportación y clientes grandes nacionales salen en camiones/tráilers, paletizados directo de línea o del saldo pendiente. “1 Nacional” sale en camionetas pequeñas, se pesa y factura por peso.
Trazabilidad por variedad: no es un sistema formal de lotes, es un acuerdo operativo del día (“hoy cortamos variedad HP”).
Insumos de empaque (cajas, pallets, materiales): sí se deben contabilizar como inventario/costo, para saber cuánto cuesta cada caja empacada (costo unitario real de empaque).
#### Vistas o submódulos
Línea de empaque (captura de cajas producidas + destino).
Saldo pendiente de embarcar (con trazabilidad de variedad).
#### Lógica de entrada de información
Cajas producidas por día, variedad, destino (exportación/nacional/“1 Nacional”/merma).
#### Procesamiento de información
Prorrateo del costo de empaque entre las hectáreas efectivas del rancho.
Cálculo del saldo pendiente: cajas empacadas acumuladas − cajas ya embarcadas.
Costo unitario real por caja empacada (incluye insumos de empaque).
#### Salida de información
Costo por hectárea (prorrateado) → Centros de Costo.
Saldo de cajas pendientes → Embarques.
Mano de obra de empaque → Nómina.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar
Director General | ✅ | ✅
Supervisor de Empaque | ✅ (su empaque) | ✅
Encargado de Cosecha y Empaque | ✅ (todos) | —
Gerente Administrativo | ✅ (consolidado) | —
[/TABLE]
#### Módulos que alimentan a este
Cosecha (fruta que entra a línea).
#### Módulos que reciben información de este
Embarques (saldo de cajas pendientes).
Nómina (mano de obra de empaque).
Centros de Costo/Contabilidad.
#### Pendientes de este módulo
Diseño del módulo completo — Fase 8 del plan de implementación, no se construye pronto.
#### Historial de este módulo
28-jul-2026: reglas de costeo (prorrateo), flujo físico, selección de destino en línea.
### 9.10 Embarques
(Incluye Ventas y facturación, y el catálogo de Clientes.)
#### Lógica establecida actual del módulo
Embarques es su propio centro de costo, distinto de Empaque, pero ligado/trazable a lo que Empaque produce.
Saldo pendiente: cajas empacadas acumuladas − cajas ya embarcadas = saldo disponible para el siguiente embarque (no se asume que todo lo empacado un día sale ese mismo día).
Confirmado: un embarque siempre es de un solo cliente — nunca se consolidan varios clientes en un mismo camión.
Seguimiento por embarque: cuánto se facturó a precio base al salir, cuánto ya vendido (liquidación real), total facturado final. La liquidación de la empresa hermana puede tardar semanas variables (no un plazo fijo).
Reconocido como la parte más compleja del lado comercial/logístico — se sientan las bases ahora, más adelante se buscará asesoría especializada para refinarla.
Ventas y facturación:
Cliente: no siempre es la empresa hermana — también hay clientes nacionales o de exportación adicionales. El esquema de “precio fijo inicial + liquidación posterior con comisión” aplica solo a las ventas con la empresa hermana.
Se factura a un precio fijo inicial por caja al embarcar; después, la liquidación posterior ajusta el ingreso según el precio real de venta menos la comisión.
Se maneja venta en USD y MXN simultáneamente. Un embarque puede llevar mezcla de tamaños y calidades.
Clientes:
Debe quedar abierto/flexible (no asumir un solo cliente fijo). Los clientes grandes son bastante fijos; los que más varían son los pequeños de mercado local. Las condiciones (precio, forma de pago, empaque) son bastante estándar entre todos, salvo la empresa hermana.
No se necesitan cuentas por cobrar dentro del sistema — eso lo maneja el área de cobranza aparte, decisión explícita de dejarlo fuera del alcance por ahora.
Integración con Nómina (mismo patrón que Aplicaciones/Fertilización frente a Nómina): aunque este módulo todavía no se construye pronto, Nómina ya debe estar bien definida desde ahora. Los dos caminos conviven siempre: automático (Cosecha/Empaque alimentan directo a Nómina su parte) y manual, en paralelo (captura/edición directa en Nómina, nunca se cierra). Si ambas vías capturan algo para la misma persona el mismo día, coexisten con advertencia visual, sin bloquear.
#### Vistas o submódulos
Registro de embarque (cliente, cajas, destino).
Liquidación de embarque.
Catálogo de Clientes.
#### Lógica de entrada de información
Por embarque: cliente (uno solo), cajas/variedad, precio base de facturación.
Liquidación posterior: precio real de venta, comisión (si aplica empresa hermana), ajuste.
#### Procesamiento de información
Cálculo de saldo pendiente de cajas por embarcar.
Cálculo de liquidación (ingreso inicial vs. ajuste final).
Conversión USD/MXN (ver Contabilidad, 9.16, para el método contable exacto).
#### Salida de información
Ingreso facturado y liquidado → Contabilidad.
Ventas y facturación → Panel Ejecutivo.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar | Editar/Autoriza
Director General | ✅ | ✅ | ✅
Gerente de Logística | ✅ (todos) | ✅ | ✅ (ventas, liquidación)
Gerente Administrativo | ✅ (consolidado) | — | —
Contador | ✅ (financiero) | — | —
[/TABLE]
#### Módulos que alimentan a este
Empaque (saldo de cajas disponibles).
#### Módulos que reciben información de este
Contabilidad (ingresos, liquidaciones, USD/MXN).
Nómina (integración automática + manual, mismo patrón que Aplicaciones/Fertilización).
Panel Ejecutivo.
#### Pendientes de este módulo
Diseño del módulo completo — Fase 8 del plan de implementación, no se construye pronto.
Asesoría especializada en el proceso comercial/logístico de exportación.
Precios de transferencia / tratamiento contable de la liquidación con la empresa hermana — pregunta abierta con el contador, más matizada porque el cliente no es exclusivo.
#### Historial de este módulo
28-jul-2026: embarques como centro de costo separado, ligado a Empaque; embarque de un solo cliente; ventas y facturación.
30-jul-2026: corrección de la relación Cosecha↔Nómina (dos caminos conviven).
### 9.11 Nómina
(Incluye Asistencia, por decisión del usuario. El módulo con más lógica de negocio ya probada de todo el sistema — construido y validado en mockup interactivo contra el Excel real de nómina de CBF.)
#### Lógica establecida actual del módulo
Tipos de personal y esquemas de pago:
Nómina fija y destajo/variable — ambos coexisten. Registro a veces individual, a veces por cuadrilla.
Esquemas de pago (varían por actividad, no por persona fija): por día, por tarea/destajo (surco/planta/cuadro), por remolque (cosecha), por caja (empaque).
4 esquemas de pago confirmados en el catálogo de Actividades: (1) Individual por hora — la mayoría de actividades de campo, todas comparten una sola tarifa general por hora configurable (evita editar 20+ actividades una por una; cada actividad tiene un interruptor “usar tarifa general” sí/no). (2) Individual por caja — Empacador. (3) Grupal por remolque, con cuadro obligatorio — Cosecha (solo este esquema requiere Cuadro; los demás solo requieren Huerta). (4) “Depende de Empacadores” — 7 actividades de empaque (Pesador, Tapa Caja, Lavador, Descarga, Pasafruta, Selección, Selección Ayuda): se suman las cajas de todos los registros de Empacador ese día en esa Huerta, se calcula la bolsa total por actividad (cajas × tarifa), y se divide entre cuántas personas están dadas de alta en esa actividad ese día. Candado: si alguien está en una de las 7 pero no hay ningún registro de Empacador ese día en esa Huerta, el sistema bloquea el guardado de la nómina de ese día. Una misma persona puede ser Empacador y, el mismo día, también alguna de las 7.
Destajo: tarifa fija por unidad, no varía por tiempo tomado; puede variar por tipo de labor. Cierre diario: el encargado cuenta manualmente cuánto hizo cada trabajador — la captura ES el registro fuente.
Cosecha por remolque: el pago se divide entre las personas que subieron a ese remolque. El equipo de corte puede ser una cuadrilla con nombre fijo y persistente (reutilizada semana a semana) o armada el mismo día — el sistema soporta ambos.
Nómina fija: aplica a encargados, regadores, personal fijo/de confianza. Tiene un Puesto (periodicidad semanal/quincenal/mensual, rango salarial de referencia, método de asignación de costo) + sueldo individual. Semanal: se paga cada periodo, siempre. Quincenal: semana 2 y semana 4 del mes (según periodos reales de nómina). Mensual: se paga por adelantado (el sueldo de agosto se paga el 1 de agosto). Asignación de costo: directo a Huerta (supervisores, tractoristas, riego) o prorrateo entre huertas proporcional a las hectáreas efectivas (personal administrativo).
Personal de nómina fija también puede hacer tareas de destajo adicional, pagado aparte de su sueldo — el bruto de una persona fija debe ser sueldo (cuando le toca cobrar) más cualquier destajo que haya hecho esa semana, sin que sean esquemas mutuamente excluyentes. (Hueco de cálculo pendiente de corregir — ver Pendientes.)
Tarifas: modificables en el tiempo, pero requieren perfil con autorización para cambiarlas. El sistema guarda historial de tarifas por fecha de vigencia (un cambio futuro no altera cálculos de periodos ya pagados).
Asistencia:
Personal fijo: no hay registro de asistencia como tal — se asume presente salvo que pidan vacaciones/descanso. Todos los puestos fijos siguen el mismo horario base.
Falta injustificada: por ahora solo se registra para consulta; el sistema debe quedar preparado para activar el descuento automático más adelante (no construirlo activo todavía).
Basta con “vino/no vino” — no se necesita hora exacta de entrada/salida. Incapacidades y permisos: por ahora solo se registran como falta injustificada, sin proceso formal.
Idea de interfaz confirmada: tira tipo calendario (L M M J V S) por persona, con color: 🟢 Verde = cumplió · 🔴 Rojo = falta injustificada · ⚪ Gris = sin registro todavía (no es lo mismo que falta justificada).
Identificadores y remolque:
Todo activo relevante (camionetas, tractores, remolques, implementos) debe tener folio propio. El remolque es una entidad propia — conecta con cuadro de origen, tractor que lo jaló, personas que subieron, fecha, y cantidad/peso de fruta.
Anticipos/préstamos:
Aplica tanto a destajo como a fijo. Al dar de alta: monto total, motivo, periodicidad del descuento (semanal o quincenal), monto por descuento, fecha del primer descuento. El sistema lleva saldo pendiente e historial de cada descuento. Antes de aplicar los descuentos de la semana, exige revisar y confirmar — no se aplica solo/automático.
Decisión de visibilidad confirmada: el descuento de préstamos solo debe verse en el “neto a pagar” del reporte de Nómina semanal (gated a Gerencia/Directivo), y NO en Resumen semanal ni en Cierre del día — un Supervisor no tiene por qué ver cuánto se le va a descontar a alguien, su trabajo es reportar el trabajo que sí hizo.
Bonos:
Adicionales al pago base: por asistencia, efectividad, lealtad, apoyo en domingo, día festivo o el día después. Tienen lógica y reglas objetivas, pero requieren autorización manual aunque el sistema los calcule automáticamente.
3 plantillas configurables (sin tocar código): (1) Asistencia perfecta semanal — 6 días trabajados, monto fijo, se paga en el periodo siguiente al que se ganó (no se puede confirmar hasta que termina la semana completa). Incluye “compromisos especiales”: si se ofrece un día extra y la persona acepta pero no se presenta, se rompe la racha aunque haya cumplido sus días normales. (2) Permanencia por racha de meses sin faltar — se calcula como semanas consecutivas de asistencia perfecta (“faltar” se mide contra si trabajó según Captura, no contra un horario formal). (3) Día doble en fecha(s) específicas — si trabaja el día completo, se paga el doble o el multiplicador configurado.
Bono de día especial (ej. domingo trabajado): se paga esa misma semana si ocurrió antes del corte de nómina; si fue muy cerca o después, se paga la semana siguiente.
Captura diaria:
La pantalla “Captura del día” se pre-llena automáticamente con quién trabajó y en qué ayer, agrupado por Huerta — el usuario solo captura la cantidad nueva. Una persona puede tener 2+ actividades el mismo día. Una misma persona puede trabajar en dos Huertas el mismo día (cambio de UP por línea de actividad individual, no por persona completa). Los grupos de pago grupal se pueden crear sobre la marcha, o reutilizar uno existente con nombre.
Botón de revertir actividad: simétrico a “+ Otra actividad” — quita una actividad pre-cargada de más. Regla: toda persona debe quedar con al menos 1 actividad ese día.
Cierre del día:
Cada día capturado, por Huerta, se debe cerrar para bloquear ediciones posteriores — distinto del cierre de periodo contable (mensual/anual, solo Contabilidad; este es diario y operativo).
Periodo de gracia configurable (default 3 días): permite cerrar días pasados dentro de esa ventana sin autorización especial. Pasado el plazo, el día queda “vencido” y solo Directivo/Gerencia puede cerrarlo retroactivamente.
Alerta automática un día antes del corte de nómina semanal, avisando cuántos días quedan pendientes de cerrar.
Día de corte de nómina:
Parámetro configurable por empresa (no fijo) — distintas empresas cortan en días distintos. Confirmado contra el Excel real de CBF: corta jueves, se paga viernes a jueves. El reporte “Nómina semanal” usa este periodo configurable; es independiente del cierre del día (que sigue su propio ciclo diario).
Exportable “sobre” y desglose de efectivo:
Exportable tipo “sobre” (PDF): hojita por persona para pegarse a un sobre de efectivo, con desglose de actividades por día, subtotal, descuentos, bonos, TOTAL.
Cálculo de billetes y monedas mínimos: para armar los sobres exactos al pagar destajo en efectivo. Las denominaciones del peso mexicano forman un sistema canónico — el algoritmo “goloso” (tomar siempre la denominación más grande que quepa) garantiza el mínimo número de piezas. Redondeo: cada neto a pagar se redondea al peso más cercano hacia arriba antes de calcular el desglose, los centavos se absorben. Dos salidas: desglose por persona, y total agregado por denominación para pedir en el banco.
Accesos y usuarios:
Pantalla dedicada (dentro de Recursos Humanos, solo Directivo) para administrar quién tiene acceso al sistema y con qué rol — concepto separado del catálogo de Personal (no toda la gente que trabaja tiene cuenta de acceso).
Prestadores de servicio externos (electricista, técnico, consultor): NO son nómina, se manejan como Proveedores (ver Compras, 9.14).
#### Vistas o submódulos
Captura del día.
Cierre del día (por Huerta).
Asistencia (tira de calendario por persona).
Préstamos/adelantos.
Bonos (catálogo configurable).
Reporte de Nómina semanal.
Accesos y usuarios.
Exportable “sobre” en PDF y desglose de efectivo.
#### Lógica de entrada de información
Captura diaria: persona + actividad + cantidad (según unidad de esa actividad) + Huerta (+ Cuadro si la actividad lo requiere).
Alta de préstamo, alta de bono, alta de usuario con acceso.
#### Procesamiento de información
Autocálculo del sueldo del día según esquema de pago de la actividad.
Cálculo de bonos según las 3 plantillas configurables.
Cálculo de descuentos de préstamo pendientes.
Cálculo de “Nómina semanal”: bruto + bonos − descuentos de préstamo = neto a pagar.
Cálculo de desglose de billetes/monedas.
#### Salida de información
Costo de mano de obra → Centros de Costo/Contabilidad, por Huerta/Cuadro.
Reporte de Nómina semanal → Contabilidad, Panel Ejecutivo.
Exportable “sobre” en PDF.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar | Editar | Autoriza
Director General | ✅ | ✅ | ✅ | ✅
Recursos Humanos | ✅ | ✅ | ✅ | ✅ (alta de personal)
Encargado de Nóminas | ✅ | ✅ | ✅ | —
Gerente Administrativo | ✅ | — | ✅ | —
Contador | ✅ | ✅ | — | —
Gerente Técnico de Producción | ✅ (por rancho, solo lectura) | — | — | —
Asistente Administrativo | ✅ | ✅ (sin editar confirmados) | — | —
Supervisor de Huerta | — | ✅ (Captura del día, su UP) | — | —
[/TABLE]
#### Módulos que alimentan a este
Actividades, Aplicaciones, Fertilizantes (Granular), Cosecha, Empaque — cada uno genera mano de obra automática.
Unidades de Producción (Huerta/Cuadro de cada registro).
#### Módulos que reciben información de este
Centros de Costo / Contabilidad.
Panel Ejecutivo.
#### Pendientes de este módulo
Corregir el cálculo de Nómina semanal para que a una persona fija que también hizo destajo esa semana, se le sume el destajo al sueldo — bug real, no solo diseño pendiente.
Construir en el sistema real (ya validado en mockup): tarifa general por hora, esquema “Depende de Empacadores”.
Construir: exportable “sobre” en PDF, cálculo de billetes/monedas.
Roles adicionales sin detallar permisos: choferes, jefes de cuadrilla, personal específico de empaque/cosecha/embarques.
~14 actividades candidatas adicionales del histórico del Excel de CBF (Abejas, Abrir Sanja, Acarfruta, Acarreo Material, Agua, Bordeo, Cartón, Descarga 1, Descarga y Acomodo de Planta, Deshilado, Desmonte, Fitos, Fumigadores, Herbicida, Hora Extra, Metecarga, Motosierra, Poda, Raleo, Rastreo, Retro, Saneo, Trampas Amarillas, Transportar Gente) — en espera de que el usuario las depure antes de autorizar que se agreguen.
Método de prorrateo de personal administrativo — resuelto: proporcional a hectáreas efectivas (ya no es pendiente, se deja la nota por si se revisita).
Ya resuelto, sin cambios pendientes:
Códigos numéricos de Huerta del Excel — NO se usan. Se encontraron 7 (no 6: 1000, 6800, 6801, 7027, 9115, 9116, 9117), más “FINANCIERO” que no es Huerta. Decisión del usuario: nunca se usan estos códigos — las Unidades de Producción se dan de alta con su nombre real directamente.
Personal — 102 nombres reales listos como datos semilla para V1 (no hardcodeados, precargados en la base de datos). De 106 filas originales, se descartaron 4: “Bono Sem 30 Chula”, “Despensa Sem 31”, “Indirectos Sem 30” (rubros contables) y “Velador Bodega Bethania” (descartado explícitamente por el usuario).
“Ganado” — confirmado que no se usa como actividad.
Actividades de café (Acarreo de Café, Descarga de Café, Poda de Planta, Flete Plantas, CFE Bugambilias) — de otro cultivo/rubro, se ignoran.
Rubros contables/administrativos (Bono, Intereses, Internet, Luz, Pensión, Póliza, Postgraduados, Quincena, Rentas, Seguro, Servicio Eléctrico, Tienda, Tortilla, Viáticos, Despensa, Colegiaturas, Otros Gastos, Asesoría) — ninguno se vuelve una Actividad capturable de campo.
“Cam H / Cam R / Cam Ran / Chofer / Mecánico / Estibador / Albañil” y “Fruits”/“Granel”/“Isla”/“Nahum”/“Feli” del Excel — se descartan/ignoran, no se dan de alta.
#### Historial de este módulo
28-jul-2026: modelo validado por el Director General (“la estructura de Nahum puede funcionar” — catálogo de empleados/actividades, tabla de tarifas bloqueada, autocálculo).
28-jul-2026 (retroalimentación Director General): matiz de tarifa de empaque (no es única), cuadrillas de corte con nombre fijo.
27-jul-2026: hueco de destajo+sueldo fijo detectado; descuento de préstamos solo visible en Nómina semanal.
4-ago-2026: prorrateo de personal administrativo resuelto (por hectáreas efectivas).
Mockup interactivo construido y validado contra el Excel real de nómina de CBF — resolvió los 4 esquemas de pago, tarifa general, “Depende de Empacadores”, cierre del día con periodo de gracia, préstamos, bonos, día de corte configurable, exportable “sobre”.
Sesión posterior con el Excel de nómina actualizado: 102 nombres de Personal y actividades vigentes confirmadas como datos semilla; códigos de Huerta descartados a favor de nombres reales.
### 9.12 Recursos Humanos
#### Lógica establecida actual del módulo
Datos por tipo de trabajador: nómina fija/puestos formales — nombre completo, fecha de nacimiento, identificación, domicilio, teléfono, teléfono de emergencia, fecha de ingreso, puesto, RFC, IMSS o seguro privado, tipo de esquema. Personal eventual/destajo — versión ligera: nombre, fecha de nacimiento, residencia, teléfono, contacto de emergencia, fecha de ingreso.
Documentos digitales (identificación, contrato, comprobante domicilio): se podrán subir en dos formas — foto desde celular en campo, o escaneados desde computadora — ambas disponibles.
Bajas y control de contrataciones: al dar de baja, el sistema pide motivo obligatorio; se guarda el motivo y quién dio de baja.
Do-not-hire list: administrada por RH, visible para encargados de huerta, registra/muestra condiciones de salida a niveles gerenciales superiores.
Externos: prestadores de servicio (electricista, técnico, consultor) se manejan en el catálogo de Proveedores (ver Compras, 9.14), no en Personal.
#### Vistas o submódulos
Catálogo de Personal.
Do-not-hire list.
Documentos digitales.
#### Lógica de entrada de información
Alta de persona con los campos según su tipo (fijo/eventual).
Baja con motivo obligatorio.
#### Procesamiento de información
No hay cálculos propios de este módulo — los cálculos de pago viven en Nómina (9.11).
#### Salida de información
Catálogo de Personal → alimenta la Captura del día en Nómina, y la selección de “quién la hizo” en Aplicaciones/Fertilizantes.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar | Editar | Autoriza
Director General | ✅ | ✅ | ✅ | ✅
Recursos Humanos | ✅ | ✅ | ✅ | ✅ (alta)
Gerente Administrativo | ✅ | — | ✅ | —
[/TABLE]
#### Módulos que alimentan a este
Ninguno — es un catálogo base.
#### Módulos que reciben información de este
Nómina, Aplicaciones, Fertilizantes, Cosecha, Empaque (selección de personal en captura).
#### Pendientes de este módulo
Roles adicionales sin detallar permisos: choferes, jefes de cuadrilla, personal específico de empaque/cosecha/embarques.
#### Historial de este módulo
28-jul-2026: campos base, do-not-hire list.
27/28-jul-2026: documentos digitales en dos formas.
### 9.13 Equipos y Maquinaria
(Incluye Tractores, Mantenimiento y Combustibles juntos, por decisión del usuario.)
#### Lógica establecida actual del módulo
Ficha de equipo: folio único + marca, modelo, año (placas si aplica). Los implementos sí pueden intercambiarse entre tractores. Dos series de folio separadas: AF (Activo Fijo) para tractores/camionetas/remolques, e IA (Implemento Agrícola) para implementos.
Inventario real de CBF: 2 camionetas, 1 tractor, varios implementos — bajo volumen.
Combustible:
Diésel de tractores: se abastece en garrafas de 20 L al rancho (es un ítem de inventario, como agroquímicos). El consumo no se prorratea por cuadro — gasto general de rancho. Se lleva horómetro de cada tractor.
Camionetas: la mayoría son de gasolina (se carga en gasolineras externas, a veces a crédito, a veces con reembolso al operador — identificado por camioneta específica). Algunas son de diésel, pero cargan directo en la gasolinera (no consumen del Almacén). Por cada carga de camioneta: odómetro actual, litros cargados, precio unitario por litro.
Validación dura de odómetro (bloquea, no solo alerta): el odómetro nuevo debe ser mayor o igual al último, nunca bajar.
Alertas de consumo anómalo: tractores — litros/hora por actividad contra el patrón histórico; camionetas — km recorridos ÷ litros cargados contra su propio histórico. Alerta si el rendimiento se sale mucho de lo esperado.
Mantenimiento:
Esquema preventivo configurable, no lista cerrada — al dar de alta un equipo se agregan libremente “conceptos de servicio” con su propio umbral de horas (ej. “Filtro de diésel – 500 horas”). También mantenimiento correctivo, por mecánico interno o taller externo.
Inventario de refacciones en catálogo separado (comparte espacio físico con agroquímicos pero con otro encargado — ver Almacén, 9.15).
Costo de mantenimiento = gasto indirecto de rancho, no se reparte por cuadro. No se calcula depreciación/vida útil contable, eso lo maneja el contador aparte.
Implementos llevan su propio conteo de horas de uso, tomando las horas del tractor que los jaló (aunque no tengan horómetro propio).
Uso diario:
Tractores capturan uso diario (operador, horas, actividad, rancho/huerta) — por ahora la captura la hace el dueño o el encargado del rancho. Sirve para control/trazabilidad, no genera cargo contable por cuadro. Camionetas, por ahora, no capturan uso diario a detalle.
El mecánico de planta es nómina fija, pero su tiempo se carga como gasto general de Maquinaria (no a cuadro ni huerta específica) — pasa por Mano de Obra con centro de costo distinto.
#### Vistas o submódulos
Catálogo de equipos.
Registro de combustible (tractores y camionetas).
Mantenimiento (conceptos de servicio, correctivo).
Uso diario de tractores.
#### Lógica de entrada de información
Alta de equipo: tipo, folio (AF/IA automático), marca, modelo, año.
Carga de combustible: odómetro/horómetro, litros, precio (camionetas).
Mantenimiento: concepto de servicio, umbral de horas, o evento correctivo.
#### Procesamiento de información
Cálculo de rendimiento de consumo (litros/hora o km/litro) contra histórico, generando alerta si se sale de rango.
Validación dura de odómetro creciente.
#### Salida de información
Costo de combustible y mantenimiento → Centros de Costo (Indirectos/Prorrateables).
Alertas de consumo anómalo → notificaciones del módulo.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar | Editar
Director General | ✅ | ✅ | ✅
Gerente de Mantenimiento | ✅ (global) | ✅ | ✅
Mecánico | ✅ (pendientes) | ✅ (resoluciones, piezas) | —
Gerente Técnico de Producción | ✅ | ✅ (tractores/implementos) | —
Supervisor de Cosecha | ✅ (su rancho) | ✅ (tractores/implementos) | —
Supervisor de Huerta | ✅ (su UP) | ✅ (pide servicio) | —
[/TABLE]
#### Módulos que alimentan a este
Ninguno — es un catálogo base junto con su propio registro de uso.
#### Módulos que reciben información de este
Aplicaciones y Fertilizantes (selección de equipo).
Centros de Costo/Contabilidad (combustible y mantenimiento).
#### Pendientes de este módulo
Construir las alertas de consumo anómalo de diésel/gasolina.
#### Historial de este módulo
28-jul-2026: reglas base, alertas de consumo, camionetas a diésel.
4-ago-2026: folios AF/IA como series separadas — confirmado contra el reporte de campo real.
### 9.14 Compras
(Incluye el catálogo de Proveedores.)
#### Lógica establecida actual del módulo
Catálogo de Proveedores: no es fijo/cerrado — se cotiza cada vez con quien dé mejor precio. Al dar de alta un proveedor se necesita crédito y datos de facturación (cuánto crédito, fecha de vencimiento).
El sistema NO compara precios en tiempo real — pero sí muestra un histórico de precios de los mejores 3 proveedores anteriores por producto, alimentado directamente de las órdenes de compra ya formalizadas.
Dos orígenes de una orden de compra:
Automáticas: se generan solas cuando una Aplicación o Fertilización necesita más producto del que hay disponible en Almacén al momento de programarse — no bloquean la programación, y no requieren autorización adicional, porque quien programó (Gerente Técnico o Dirección General) ya la autorizó implícitamente.
Manuales: solicitudes libres, no ligadas a ninguna Aplicación — para materiales que no dependen de una (empaque, limpieza, herramientas, refacciones, etc.), eligiendo cualquier producto del catálogo abierto de Almacén. Estas sí requieren autorización explícita de Dirección General, Gerente Administrativo o Gerente Técnico antes de poder cotizarse. Regla adicional: cualquier producto que se le vaya a echar a la planta (agroquímico o fertilizante) debe estar autorizado antes de poder comprarse — el catálogo de solicitud filtra y no deja elegir uno sin autorizar.
Ciclo completo de una orden: (pendiente de autorizar, solo si es manual) → pendiente de cotizar → se consulta el histórico de los 3 mejores proveedores, se cotiza por fuera del sistema, se formaliza la orden (proveedor, cantidad, precio unitario, fecha esperada) → la orden queda “en camino”, con vista para ver/descargar (imprimible) → Almacén la recibe (captura cantidad real recibida, lote/caducidad si aplica), lo que genera la entrada real al inventario → si la orden estaba ligada a una Aplicación en espera, se aparta sola para esa Huerta en cuanto se recibe, sin que nadie tenga que hacerlo a mano.
Tope de autorización para compras manuales: mismo patrón “propone/autoriza” — por debajo de un tope, el Encargado de Compras formaliza solo; por arriba, requiere Gerencia/Directivo. El tope exacto varía según el área/destino del gasto (oficina vs. campo).
#### Vistas o submódulos
Pendientes de autorizar (solo manuales).
Pendientes de cotizar.
Órdenes generadas — en camino.
Recibidas.
Catálogo de Proveedores.
#### Lógica de entrada de información
Solicitud manual: producto, cantidad, motivo/nota.
Cotización: proveedor, precio unitario, fecha esperada de entrega.
Recepción: cantidad real recibida, lote/caducidad si aplica.
#### Procesamiento de información
Verificación de autorización antes de permitir cotizar (solo manuales).
Al recibir, si la orden está ligada a una Aplicación/Fertilización en espera, se genera automáticamente la salida “comprometida” para esa Huerta.
Actualización del histórico de los 3 mejores proveedores por producto.
#### Salida de información
Entrada real de inventario → Almacén.
Apartado automático → Aplicaciones/Fertilizantes en espera.
Gasto de la orden → Contabilidad.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar | Editar | Autoriza
Director General | ✅ | ✅ | ✅ | ✅
Encargado de Compras | ✅ (global) | ✅ | ✅ | ✅ (abajo del tope)
Gerente Administrativo | ✅ | — | — | ✅ (arriba del tope, solicitudes manuales)
Gerente Técnico de Producción | — | — | — | ✅ (solicitudes manuales de producto para planta)
Contador | ✅ | — | — | —
Encargado de Bodega | ✅ (sus pedidos) | ✅ (genera pedido) | — | —
Asistente Administrativo | ✅ | ✅ (sin editar confirmados) | — | —
[/TABLE]
#### Módulos que alimentan a este
Aplicaciones, Fertilizantes (pendientes automáticos por faltante de stock).
Almacén (catálogo de productos, para solicitudes manuales).
#### Módulos que reciben información de este
Almacén (entrada real de inventario al recibir).
Aplicaciones/Fertilizantes (apartado automático cuando la orden llega).
Contabilidad (gasto).
#### Pendientes de este módulo
Montos exactos del tope de autorización por área.
Formalizar el rol “Encargado de Compras” — junto con la reconciliación general del catálogo de roles.
#### Historial de este módulo
28-jul-2026: flujo completo revelado al preguntar sobre Proveedores.
30-jul-2026: tope de autorización en concepto.
4-ago-2026: precisión de precio unitario obligatorio.
4-ago-2026 (validado en mockup): ciclo completo construido y probado — distinción automáticas/manuales, autorización previa a compra de producto para planta, apartado automático al recibir.
### 9.15 Almacén
(Incluye el Almacén Local por Unidad de Producción.)
#### Lógica establecida actual del módulo
Almacén Central:
Estructura de catálogo: Ingrediente Activo → Producto Comercial (marca) → Presentación. Se acepta que un producto tenga varios ingredientes activos (mezclas). El catálogo no se limita a agroquímicos y fertilizantes — queda abierto a más categorías conforme se necesiten.
Una sola bodega central para todo el rancho (no una por huerta).
Control por lote: desde el inicio, lote + fecha de caducidad + cantidad, para permitir FIFO real.
Alta de compras: las da de alta el Encargado de Bodega al recibir físicamente el producto.
Salidas: el producto NO se da de baja al planearse/aplicarse, sino hasta que se entrega físicamente. Estado intermedio: “comprometido/reservado” al planear, “entregado/salida real” al entregar. Los apartados vencen automáticamente a los 15 días si no se entregan, liberando el producto y generando alerta.
Otros motivos de salida: préstamo a otro rancho, merma, baja por caducidad.
FIFO obligatorio por ingrediente activo (regla forzada).
Alertas de reorden inteligentes: no solo stock mínimo fijo — el sistema analiza consumo histórico y tiempos de reorden, considerando que algunos productos solo se usan en ciertas etapas del cultivo.
Calculadora de dosis: la compra y el registro son en la unidad de presentación (ej. bidón de 20 L); la conversión ocurre al calcular la dosis de una aplicación específica según el área del cuadro/huerta.
Recepción flexible: la entrega no siempre coincide con lo pedido — la pantalla de recepción registra diferencias entre lo ordenado y lo recibido.
Refacciones de maquinaria: comparten el espacio físico con agroquímicos, pero tienen otro encargado — registros separados.
Almacén General (herramientas, uniformes, equipo/material de empaque, equipo de riego): misma bodega central, pero este material (no perecedero) no necesita FIFO ni lotes — solo conteo de existencias con entradas y salidas.
Bajas y mermas: requieren doble-check de Gerencia — el Encargado de Bodega no puede darlas de baja unilateralmente.
Almacén Local por Unidad de Producción — control de fugas:
Objetivo explícito: las salidas del Central hacia las huertas son de los puntos con más riesgo real de fuga de dinero — se necesitan candados y alarmas, con un límite honesto: no se puede saber si el producto llegó exactamente al tanque de aplicación; el control llega hasta “salió de bodega → llegó al rancho → se reportó aplicado a tales cuadros con tal dosis”.
Estructura de dos niveles: Almacén Central → sale producto hacia una Huerta. Almacén Local por UP → cada Huerta tiene su propio mini-inventario, bajo responsabilidad del Supervisor, porque las aplicaciones no se completan en un solo día.
Sin lotes ni caducidad en el Local — solo un total simple por producto (“le mandaron 100 L, lleva reportados 60 L aplicados, le quedan 40 L”).
Entrega y confirmación se unifican en un solo paso: cuando Almacén entrega físicamente el producto, esa misma acción confirma que le llegó al Supervisor — no hay paso aparte ni retraso.
Reporte de avance de aplicación: cada vez que el Supervisor reporta, dice qué cuadros ya aplicó — las aplicaciones casi nunca se hacen en un solo día. Ese reporte resta del almacén local como consumo justificado. El descuento es automático al reportar la aplicación como realizada (ver Aplicaciones/Fertilizantes) — el Supervisor no lo da de baja a mano.
El candado principal: se compara cantidad que salió del Central hacia la Huerta vs. cantidad justificada por aplicaciones reportadas (hectáreas de cuadros ya aplicados × dosis). Si después de 15 días no cuadran, se genera una alerta. Resolución: Gerencia investiga y puede ajustar manualmente el inventario, dejando registro del motivo — la alarma no se cierra sola.
#### Vistas o submódulos
Catálogo (productos, categorías abiertas).
Inventario (stock, lotes, comprometido/disponible).
Movimientos (entradas y salidas).
Almacén Local (tarjetas de “reservado para Rancho X”, pendientes de entregar, consumo por Huerta).
#### Lógica de entrada de información
Alta de producto: categoría, nombre comercial, ingrediente activo (si aplica), presentación, unidad.
Entrada: producto, lote/caducidad (si aplica), cantidad.
Salida: producto, motivo, cantidad, Huerta destino (si es para Aplicación).
#### Procesamiento de información
Descuento FIFO automático por ingrediente activo al entregar.
Cálculo de disponible = stock total − comprometido.
Vencimiento automático de apartados a los 15 días.
Comparación cantidad salida vs. cantidad justificada, con alarma a 15 días si no cuadra.
Generación de la remisión al entregar, disponible de inmediato en el Almacén Local.
#### Salida de información
Consumo justificado → costo de Cuadro/Huerta (Centros de Costo).
Pedidos por falta de stock → Compras.
Valor total de inventario (“dinero parado”) → Panel Ejecutivo (indicador a nivel empresa).
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar | Editar | Autoriza
Director General | ✅ | ✅ | ✅ | ✅
Encargado de Bodega | ✅ (Central + Locales, solo lectura en Locales) | ✅ (Central) | ✅ (Central) | ✅ (alta de producto no-agroquímico)
Bodeguista | ✅ (Central) | ✅ (Central) | — | —
Supervisor de Huerta | ✅ (su Almacén Local) | ✅ (avance, su Local) | — | —
Gerente Técnico de Producción | ✅ | — | — | ✅ (alta de agroquímico/fertilizante)
Gerente Administrativo | ✅ | — | ✅ | —
[/TABLE]
#### Módulos que alimentan a este
Compras (entradas al recibir una orden).
Aplicaciones, Fertilizantes (salidas comprometidas al programar).
#### Módulos que reciben información de este
Aplicaciones, Fertilizantes, Riego (Almacén Local, consumo).
Compras (pedidos automáticos por falta de stock).
Centros de Costo/Contabilidad (valor de inventario, costo de consumo).
Panel Ejecutivo (KPIs de inventario).
#### Pendientes de este módulo
Construir la alarma de descuadre a 15 días en el sistema real (el resto ya está construido y validado en el mockup).
#### Historial de este módulo
28-jul-2026: reglas de lote/FIFO/alertas de reorden, vencimiento a 15 días.
28-jul-2026: bodega única, calculadora de dosis, recepción flexible, refacciones compartidas, Almacén General.
30-jul-2026 (auditoría externa): remisión, bajas/mermas, resolución de alarma.
4-ago-2026: catálogo abierto a más categorías.
4-ago-2026 (validado en mockup): módulo completo construido y probado, incluyendo la corrección de que entrega y confirmación se unifican en un solo paso.
### 9.16 Contabilidad
#### Lógica establecida actual del módulo
Tratamiento de gastos pre-productivos:
Los gastos propios de preparación de tierras son gasto corriente del ciclo. Los gastos que sirven para habilitar el área de cultivo (desmonte, instalación de equipo de riego, perforación de pozos, electrificación, equipamiento del pozo) sí se capitalizan.
Si se capitalizan: se amortizan en varios ciclos de cultivo, típicamente 3, a veces 5, dependiendo del monto invertido y las hectáreas habilitadas. (Pendiente validar formalmente con el contador el método contable exacto; la vida útil y el criterio de negocio ya están definidos.)
Un cuadro en “descanso de tierras”: es mejor cargar ese gasto al ciclo siguiente, no al anterior — porque si no, el ciclo anterior no se puede cerrar.
Moneda:
Todos los asientos contables son en pesos. Se usa un tipo de cambio de referencia (generalmente Diario Oficial de la Federación) y una cuenta complementaria para completar el monto de la venta en pesos. Al cobrar, se cancela el saldo en dólares y su registro complementario; la diferencia se manda a la cuenta de pérdida o utilidad cambiaria. Ventas en dólares llevan factura con el asiento en dólares más la complementaria en pesos; ventas en pesos se contabilizan directas.
Otros:
Sería ideal compatibilidad con CONTPAQ a futuro, pero por ahora basta con que el sistema muestre y permita analizar la información.
Sí existe un porcentaje de comisión ya acordado para las ventas con la empresa hermana (dato de negocio, no se documenta aquí).
Ya existe un catálogo de cuentas contables bien organizado en CBF — queda pendiente revisarlo a detalle para definir cómo el sistema se adapta a él, decisión explícita de dejarlo para después.
Cierre de periodo (regla general, ver también Bloque 6): los números se cierran mensualmente, y al final del año se cuadran los reportes anuales. Solo cabezas de Contabilidad pueden modificar/acceder a información de periodos ya cerrados.
#### Vistas o submódulos
Balance / Contabilidad general.
Cierre de periodo (mensual/anual).
#### Lógica de entrada de información
Todos los módulos alimentan su costo/ingreso automáticamente; Contabilidad también permite captura directa para lo que ningún módulo cubre todavía.
#### Procesamiento de información
Conversión y registro USD/MXN según la regla de tipo de cambio de referencia.
Capitalización vs. gasto corriente según etapa del ciclo.
Consolidación de costos por Centro de Costo (bloque 3).
#### Salida de información
Balance financiero → Panel Ejecutivo.
Reportes contables exportables a Excel/PDF.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver | Capturar | Editar
Director General | ✅ | ✅ | ✅
Contador | ✅ | ✅ | ✅
[/TABLE]
(El Gerente Administrativo NO tiene Contabilidad en su alcance — el Contador es una línea independiente.)
#### Módulos que alimentan a este
Todos los módulos operativos (Nómina, Almacén, Compras, Embarques, Equipos y Maquinaria) — cada uno aporta su costo/ingreso.
#### Módulos que reciben información de este
Panel Ejecutivo.
#### Pendientes de este módulo
Precios de transferencia / tratamiento contable de la liquidación con la empresa hermana — más matizado porque el cliente no es exclusivo.
Revisar el catálogo de cuentas contables existente y definir la adaptación (a propósito, para después).
Validar formalmente con el contador el método contable exacto de amortización de gastos capitalizados.
#### Historial de este módulo
28-jul-2026: banco de preguntas contestado en su mayoría por el Director General (capitalización, USD/MXN, cierre de cuadro en descanso).
### 9.17 Auditoría
#### Lógica establecida actual del módulo
Se requiere bitácora de auditoría completa: quién capturó y quién modificó cada registro, con fecha/hora. Las correcciones sí editan/reemplazan el valor, pero debe quedar registro del cambio (histórico de versiones, no solo el valor final).
Diseño del módulo confirmado: visible para Director General (y posiblemente Contabilidad/Gerencia). Permite: (1) búsqueda/filtro por módulo, tipo de registro, persona que capturó o modificó, y rango de fechas; (2) por cada resultado, qué cambió (valor anterior → valor nuevo), quién y cuándo; (3) es exclusivamente de consulta — no revierte cambios directamente desde ahí, cualquier corrección se hace en su módulo normal y deja su propio rastro; (4) vista rápida opcional de “cambios recientes” (últimas 24-48h).
#### Vistas o submódulos
Búsqueda/filtro de bitácora.
Vista rápida de cambios recientes.
#### Lógica de entrada de información
No tiene entrada propia — se alimenta automáticamente de cada acción de captura/edición en todos los demás módulos.
#### Procesamiento de información
Registro automático de cada acción con quién, qué cambió (antes/después), y cuándo.
#### Salida de información
Reportes de auditoría filtrables, exclusivamente de consulta.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver
Director General | ✅ (acceso universal)
Auditor | ✅ (global, solo lectura — es su único módulo de trabajo)
[/TABLE]
#### Módulos que alimentan a este
Todos los módulos del sistema (cada captura/edición deja su rastro aquí).
#### Módulos que reciben información de este
Ninguno — es exclusivamente de consulta, no alimenta otros módulos.
#### Pendientes de este módulo
Construir el módulo completo — diseño confirmado, pendiente de programarse.
#### Historial de este módulo
Requisito de bitácora completa, presente desde el diseño inicial del sistema.
4-ago-2026: diseño del módulo de consulta confirmado — exclusivamente de consulta, sin función de revertir.
### 9.18 Panel Ejecutivo
#### Lógica establecida actual del módulo
Se requieren reportes por módulo (cada “cabeza de área” ve el detalle de su área), y Dirección General necesita poder ver todo, entrando módulo por módulo — no necesariamente un dashboard único que lo mezcle todo.
Reportes clave mencionados: costos (el más importante), nóminas, niveles de inventario, kg cosechados, ventas, CxC y CxP, estatus de maquinaria.
Comparativos históricos: sí se requieren, a nivel administrativo elevado — comparar el mismo rancho en diferentes ciclos/temporadas.
KPIs por módulo — primera versión:
[TABLE]
Módulo | KPI
Producción (Huerta) | Costo por hectárea efectiva (Desarrollo+Cosecha+Empaque), % de aprovechamiento del rancho, costo agregado por Variedad
Cosecha | Toneladas/kg cosechados, rendimiento por Variedad
Empaque | Costo por caja empacada, cajas por destino
Embarques | Cajas embarcadas vs. saldo pendiente, monto facturado vs. liquidado
Almacén Central | Nivel de stock, alertas de reorden activas, valor total de inventario
Almacén Local (por Huerta) | Estado del candado de 15 días
Mano de Obra / Nómina | Costo de nómina por periodo; cuántas personas trabajan en cada Huerta y cuánto se llevan en promedio por día
Equipos y Maquinaria | Consumo de diésel/gasolina por hora o km vs. histórico, % de equipos en mantenimiento vs. operando
Compras | Gasto total por proveedor, productos comprados, calificación de proveedores
Fertilizantes/Aplicaciones | Cumplimiento de plan vs. real
[/TABLE]
#### Vistas o submódulos
Un tablero por módulo (no uno solo mezclado).
#### Lógica de entrada de información
No tiene entrada propia — es un agregador de lo que ya se captura en cada módulo.
#### Procesamiento de información
Cálculo de cada KPI según la tabla de arriba, con comparativos históricos por ciclo/temporada.
#### Salida de información
Vista consolidada para Dirección General y Gerencias, exportable.
#### Personas/puestos involucrados y sus permisos
[TABLE]
Rol | Ver
Director General | ✅ (todo)
Todos los Gerentes (Técnico, Administrativo, Mantenimiento, Logística) | ✅ (su alcance)
Contador | ✅ (financiero)
[/TABLE]
#### Módulos que alimentan a este
Todos los módulos del sistema.
#### Módulos que reciben información de este
Ninguno — es la capa de consulta más alta.
#### Pendientes de este módulo
El “KPI M.O.” visto en el reporte de campo (meta/real) sigue sin definirse con precisión — su propósito exacto no está claro todavía.
Criterio de calificación de proveedores — pendiente de definir.
Construir el módulo completo.
#### Historial de este módulo
Reportes y KPIs clave identificados desde el diseño inicial.
4-ago-2026: primera versión de la tabla de KPIs por módulo.
### 9.19 Módulos pendientes
(Ningún módulo identificado queda totalmente fuera de las fichas de arriba. Este espacio queda para cuando surja alguno nuevo que todavía no tenga ficha propia.)
Ninguno por ahora.
## 10. Todo lo técnico
(Arquitectura, backend, base de datos, frontend, offline. Es lo que menos se modifica y lo que menos necesita ver quien solo quiere entender la lógica de negocio — por eso va hasta acá.)
### Enfoque general
Dos clientes con necesidades distintas: Teléfono (campo) — requiere funcionar 100% offline, base de datos local propia. PC (oficina/gerencia/contabilidad) — se asume con internet estable la mayoría del tiempo, cliente más simple, siempre conectado al servidor.
### Teléfono — patrón “local-first + cola de sincronización”
Base de datos local en el dispositivo (ej. SQLite) — captura instantánea sin depender de red.
Patrón outbox: cada captura se apila en una cola local; en cuanto hay internet, se sube automáticamente en segundo plano.
El servidor procesa, aplica todas las reglas de negocio (cascada de aplicación→inventario→mano de obra→costo, FIFO, prorrateos, etc.) y regresa al teléfono la versión oficial actualizada.
Cálculos en el teléfono mientras está offline son provisionales; la verdad final la determina el servidor al sincronizar.
### PC — cliente web simple
Aplicación web que se conecta directo al servidor/API (sin lógica offline). Para consulta de reportes, captura de oficina/contabilidad, administración de catálogos.
### Servidor — dueño único de la lógica de negocio
Toda la lógica compleja vive centralizada en el servidor (no duplicada por dispositivo).
### Conflictos de sincronización
El servidor intenta resolver automáticamente lo que pueda con reglas simples (ej. orden cronológico); lo que no pueda resolver de forma segura genera la alerta visible ya definida (Bloque 6), nunca decide solo cuando hay dinero/inventario de por medio.
### Stack tecnológico — decisión final
Base de datos central: MySQL (compatibilidad con la empresa hermana).
Backend/API: Node.js (mismo criterio).
App móvil (Android + iPhone, un solo código): React Native.
App de PC: aplicación web en React.
Hosting: DigitalOcean — el código vive en la nube desde el día uno, no depende de una computadora prendida.
Autenticación: usuario y contraseña simple — el Directivo da de alta a cada persona y resetea la contraseña si se olvida, sin flujo de recuperación automática por ahora.
Repositorio de código: GitHub, con la cuenta del usuario.
Respaldo de base de datos: automático diario, usando el respaldo administrado de DigitalOcean, retención de últimos 30 días — por los cambios frecuentes de esta primera etapa.
### Contexto y rol de desarrollo
Los usuarios de campo usan teléfonos mixtos (Android e iPhone) → se descarta desarrollar 2 apps nativas separadas.
El usuario (dueño de CBF) no programará directamente — su rol es aportar la lógica de negocio, revisar y dar retroalimentación. Claude se encarga de organizar y generar el código.
Sin presupuesto fijo definido; prioridad explícita: “hacerlo bien” sobre “hacerlo rápido”.
### Orden de construcción
Mockup antes que sistema real, confirmado: mismo patrón que se usó con Nóminas — construir primero un mockup interactivo para validar el flujo completo antes de escribir el código del sistema real. Ya se construyó y validó: Nóminas, Recursos Humanos, Unidades de Producción (con Ciclos), Almacén, Compras, Equipos y Maquinaria (catálogo mínimo), Aplicaciones, Fertilizantes, Riego.
### Pendientes de este bloque
Detalle de cómo se manejan actualizaciones de la app en campo sin que el usuario tenga que reinstalar manualmente.
Elegir entre Railway/DigitalOcean/AWS quedó resuelto (DigitalOcean); infraestructura completa de arranque (hosting, autenticación, repositorio, respaldo) ya cerrada.
### Historial de este bloque
Arquitectura propuesta desde el diseño inicial (offline-first, servidor central).
4-ago-2026: stack tecnológico confirmado como decisión final (MySQL/Node/React Native/React); infraestructura de arranque confirmada (DigitalOcean, usuario/contraseña, GitHub, respaldo a 30 días); confirmado que se construye mockup antes que sistema real.
## 11. Interfaz — identidad de marca (móvil y PC)
### Identidad de marca
Logo: ilustración retrato de mujer en blanco/negro dentro de arco tipo “escudo”, fondo amarillo/dorado, borde con degradado guinda/vino oscuro. Texto “CHULA” (grande) + “BRAND” (pequeño, debajo).
Paleta de colores de campaña: rosa/magenta vibrante (dominante), amarillo/dorado, guinda/vino oscuro, turquesa/verde azulado, blanco y negro. Estilo tropical, vibrante, fresco — no corporativo tradicional.
Uso en el ERP: aplicar esta paleta a la UI (botones, acentos, encabezados), manteniendo la interfaz limpia/funcional para uso diario en campo, tomando la esencia de color/identidad sin replicar el estilo de campaña al 100%.
Archivo de logo recibido: versión limpia sobre fondo blanco (se confirmó que no se necesita la segunda versión con flores decorativas).
### Paleta de color — tokens exactos
[TABLE]
Token | Hex | Uso
–pink (Rosa Chula) | #E6127A | Botón principal, elemento activo del menú, FAB, ícono del Panel Directivo. Reservado, no se usa en módulos regulares.
–pink-soft | #FDEBF3 | Fondo del elemento activo/seleccionado.
–wine (Guinda) | #6B2140 | Header móvil, logo, login, ícono de Balance. No se usa en botones de uso diario.
–wine-soft | #F5E9EE | Fondo de acentos guinda.
–bg | #F6F6FA | Fondo general de la app.
–surface | #FFFFFF | Tarjetas, sidebar, header, barra inferior.
–border | #E8E8EF | Bordes y separadores, siempre sutiles.
–ink | #22242B | Texto principal.
–ink-soft | #6B7280 | Texto secundario/etiquetas.
–ink-faint | #9CA3AF | Texto terciario/placeholders.
[/TABLE]
Colores por módulo (pastel de fondo + ícono sólido, ninguno usa rosa ni guinda):
[TABLE]
Módulo | Fondo | Ícono
Personal/RH | #EEF1FE | #5B6EF5 (índigo)
Asistencia | #FFF7E6 | #D98F1F (ámbar)
Destajo/Nómina | #E8F8EF | #1B8F55 (verde)
Actividades | #F3EEFE | #8B5CF6 (violeta)
Aplicaciones | #E7F6FC | #2AA9E0 (celeste)
Fertilización | #E6FBF8 | #14B8A6 (verde azulado)
Almacén | #FFF1E6 | #F97316 (naranja)
Combustible | #FDECEA | #E1483F (rojo)
Equipos y Maquinaria | #EEF1F4 | #64748B (gris pizarra)
Unidades de Producción | #F5EFE6 | #8B5E34 (café/tierra)
Balance (financiero) | #F5E9EE | #6B2140 (guinda — excepción intencional)
Panel Directivo | #FDEBF3 | #E6127A (rosa — excepción intencional)
[/TABLE]
Regla al agregar un módulo nuevo: color pastel/sólido que no se repita, y que no sea rosa ni guinda salvo jerarquía especial (financiero o dashboard ejecutivo). Colores de estado (semánticos): éxito verde #1B8F55 · alerta/crítico rojo #E1483F · advertencia ámbar #D98F1F · informativo celeste #2AA9E0.
### Tipografía
Encabezados, KPIs, nombres de módulo, botones → Plus Jakarta Sans (peso 600–800).
Cuerpo de texto, tablas, datos, formularios → Inter (peso 400–600).
Tamaños base: título de sección 15–16px · KPI grande 20–22px · texto de tabla 12.5–13px · etiquetas/tags 10.5–11.5px.
### Formas y espaciado
[TABLE]
Token | Valor | Uso
–radius-lg | 20px | Contenedores grandes
–radius-md | 14px | Tarjetas, paneles, módulos
–radius-sm | 10px | Ítems de menú, chips
Botones/FAB | Circular/pill (999px) | Botón principal, FAB, filtros tipo pill
[/TABLE]
Nada de esquinas cuadradas. Bordes siempre sutiles, nunca líneas duras negras.
### Layout por plataforma
Escritorio: sidebar fijo (~212px) con marca arriba + módulos agrupados; header superior con buscador y avatar; contenido en tarjetas.
Móvil: header superior con degradado guinda; bottom nav con los módulos más usados del rol + botón “Más”; FAB circular flotante.
### Pendientes de este bloque
Iconografía definitiva — siguen siendo placeholders de posición/color.
### Historial de este bloque
Especificación visual validada contra el mockup interactivo conforme se construyó cada módulo.
## 12. Pendientes generales del sistema
(Todo lo que sigue abierto en el sistema completo, consolidado — el detalle de cada uno vive en la ficha de su módulo o bloque correspondiente, referenciado ahí mismo.)
Roles del organigrama todavía sin mapear: choferes, jefes de cuadrilla, y los puestos vistos en el reporte de campo por WhatsApp (Inocuidad, Velador, Con Acceso, Auxiliar) — bloque 8.
Reasignación de Huerta a otro Supervisor a mitad de operación — casi no pasa en la práctica, sin diseñar hasta que haga falta — Unidades de Producción (9.1).
Nivel de acceso “Editar” todavía no distingue matices más finos por módulo — bloque 4.
Montos exactos del tope de autorización de Compras por área — Compras (9.14).
Catálogo extenso de posibles casos de conflicto de sincronización, módulo por módulo — bloque 6.
Factibilidad técnica y de costo de las integraciones de WhatsApp/OCR — bloque 6.
Bug real en el cálculo de Nómina semanal (destajo + sueldo fijo no se suman) — Nómina (9.11).
Alarma de descuadre a 15 días — construir en el sistema real, ya diseñada y validada en mockup — Almacén (9.15) y Riego (9.6).
Detalle de actualizaciones de la app en campo sin reinstalar — Bloque 10.
## 13. Descripción de qué nos falta
Mecánica exacta de captura para remolques de varios cuadros de la misma variedad — decisión de fondo tomada, falta refinar el detalle de captura — Unidades de Producción / Cosecha.
Número real de cuadros del rancho de 28 hectáreas — pendiente de subdividir formalmente.
Diseño completo de Cosecha, Empaque y Embarques — Fase 8 del plan de implementación, no se construye pronto.
Encuesta de seguimiento post-aplicación — el usuario pidió dejarla para después.
Módulos de Auditoría y Panel Ejecutivo — diseño confirmado, sin construir.
## 14. Preguntas que falta contestar
Secciones 2 y 3 del cuestionario de técnicos (qué se registra en cada aplicación, seguimiento post-aplicación) — Fertilizantes (9.5).
Unidad exacta del umbral de CE en savia, y rangos de referencia de agua y pasta saturada — pendientes de los técnicos/ingenieros de campo — Fertilizantes (9.5).
Precios de transferencia / tratamiento contable de la liquidación con la empresa hermana — pregunta abierta con el contador — Embarques (9.10) y Contabilidad (9.16).
Ejemplos de análisis de pasta saturada y de savia/CARDIS — el usuario no los tiene disponibles todavía — Fertilizantes (9.5).
Catálogo de cuentas contables de CBF — decisión explícita de revisarlo después — Contabilidad (9.16).
Criterio de calificación de proveedores — Panel Ejecutivo (9.18) / Compras (9.14).
Propósito exacto del “KPI M.O.” (meta/real) visto en el reporte de campo — Panel Ejecutivo (9.18).
## 15. Historial de modificaciones
(Consolidado general por fecha. El detalle completo de cada cambio vive en el “Historial de este bloque/módulo” de cada sección — aquí solo las fechas clave y qué tanto se movió cada una.)
28-jul-2026: primera versión extensa del documento — alcance del sistema, Huerta/Cuadro/Ciclo, Centros de Costo (primera lista), catálogo de roles preliminar, mano de obra y esquemas de pago, Equipos y Maquinaria, Actividades, Fertilización priorizada, banco de preguntas contestado (Equipos, Actividades, Inventario, Cosecha/Empaque/Embarques, Contabilidad, Personal, Fertilización), retroalimentación completa del Director General (21 comentarios), segunda ronda de preguntas (Asistencia, Almacén General, Proveedores→Compras, Clientes, Vivero).
27-jul-2026: hueco de destajo+sueldo fijo detectado; timing de bonos aclarado; decisión de visibilidad de préstamos.
30-jul-2026: mockup interactivo de Nóminas construido y validado contra el Excel real de CBF; auditoría externa de flujos y permisos (remisión, bajas/mermas, autorización simultánea, relación Cosecha↔Nómina); concepto de Sección de Riego y Almacén Local documentados.
4-ago-2026: ronda grande de cierre — organigrama completo de roles, matriz de permisos módulo×rol, Centros de Costo consolidados, corrección de fondo de Ciclo a nivel Huerta (no por Cuadro), Marco de Plantación con cálculo automático de plantas, infraestructura técnica de arranque confirmada (DigitalOcean/GitHub/respaldo), y — la ronda más grande — construcción y validación en mockup de Almacén, Compras, Equipos y Maquinaria, Aplicaciones (con corrección completa de flujo: dosis en concentración+mezcla, rango de fechas, recurso gente/implemento, ruteo automático a Compras sin bloquear, entrega=confirmación en un paso), Fertilizantes (Granular y Fertirriego) y Riego.
(esta sesión): reestructura completa del documento a la plantilla de lectura general→particular, sin agregar ni quitar ninguna decisión ya tomada.
## Apéndice A — Personal, datos semilla (102 nombres, del Excel real de nómina)
(Para carga inicial en V1, no hardcodeado en el código. Nombres tal como aparecen en el Excel, algunos con posible variación de mayúsculas/acentos a normalizar al cargar.)
ABRAHAM CANUL UC
ADRIANA MEDINA
ANA DEYSI FLORES
ANGEL TAMAY ZUL
ANTONIL HERNANDEZ SANCHEZ
ARTEMIO PEREZ PEREZ
AURORA CHE
BERNARDO PACHECO CHE
CARLOS CANCHE
CARLOS FLORES GOMEZ
CELSO MEDINA REDONDA
DAMIAN ISMAEL MENDEZ SALAZAR
DEISY MARISOL PECH VARGAS
EDGAR RENE CHAN CHE
EDUARD PALOMO SOTO
ELIAS HERNANDEZ ESPINOZA
ELIVER DE JESUS PEREZ PEREZ
EMANUEL SANTOS PECH
ESTEBAN HERNANDEZ GOMEZ
ESTEBAN PEREZ PEREZ
EVER FLORENTINO HERNANDEZ
FABRICIO PEREZ HERNANDEZ
FERNANDO CHABLE NAAL
FERNANDO EK CABRERA
FERNANDO MAQUIN RACH
FIDELINO GOMEZ PEREZ
FLORENTINO HERNANDEZ PEREZ
FRANCISCO PECH PECH
GERARDO PEREZ LOPEZ
GERONIMO PEREZ PEREZ
GERSON YOVANI MENDEZ
GLADIS GONZALES
GUADALUPE PEREZ PEREZ
HERLINDA MAKIN RACH
HEVER JOSE GUERRA
HILDA CAB TUYUB
ISAAC PANTI
ISIDRO SANCHEZ URBINA
ISRAEL PEREZ HERNANDEZ
ISRAI PANTI
JAIME RODRIGO HERNANDEZ
JAVIER LOPEZ HERNANDEZ
JENY NOH VARGUEZ
JOANNA MEDINA REDONDA
JOHAN PECH MOO
JOSE CANUL
JOSE ENRIQUE SALAZAR GONGORA
JOSE MANUEL PEREZ HERNANDEZ
JOSE ROMAN HUITZ CHE
JOSE TOBIA GONZALEZ
JOSEFA PEREZ PEREZ
JOSUE HUCHIN CHAN
JUAN PEREZ LOPEZ
JUAN TAMAY YAC
LAZARO PEREZ HERNANDEZ
LEANDRO GILBERTO RAMIREZ
LEVI N PACHECO
LITZET TRUJILLO GONZALEZ
LORELIS ESPINOZA CANUL
LUIS CHAN CHE
MANUEL MENDOZA GUTIERREZ
MANUEL PEREZ GARCIA
MANUEL SANCHEZ URBINA
MANUELA HERNANDEZ PEREZ
MANUELA PEREZ RUIZ
MARCO ANTONIO SANCHEZ PEREZ
MARIA DOLORES HERNANDEZ HERNANDEZ
MARIA EK CAN
MARIA RUIZ GUTIERREZ
MARIANA TOBIA GONZALEZ
MARISELA PERERA MOO
MARVIN JESUS SALAZAR PECH
MATILDE MAKIN RACH
MERCEDEZ VARGUEZ CAN
MICAELA PEREZ HERNANDEZ
MIGUEL ANGEL CHAVEZ
MIGUEL ARA AKE
MIGUEL MENDOZA PEREZ
MOISES LORENZO GURTIERREZ
Marco Benjamin Hernández pech
NATALIA DEL ROSARIO SALAZAR
NAYELLI VAZQUEZ MORENO
NICOLAS HERNANDEZ SANCHEZ
NICOLAS PEREZ PEREZ
NICOLAS URBINA
PATRICIA HERNANDEZ PEREZ
PATRICIA REDONDA TENORIO
PETRONA GUTIERREZ LORENZO
RIGOBERTO BALLINA
ROGELIO CHAN TUYUB
RONEY PEREZ GOMEZ
ROSA PEREZ
ROSELIA ESPINOZA ARCOS
ROSITA LOPEZ MENDEZ
SERGIO PEREZ HERNANDEZ
SIMON MENDOZA
TOMASINA GOMEZ JIMENEZ
UDIEL HERNANDEZ PEREZ
VICENTE PEREZ SOLORSO
VICTORIO HERNANDEZ PEREZ
VIRGINIA FLORES GOMEZ
ZULEE COBOC UC
(Fin del documento reestructurado.)