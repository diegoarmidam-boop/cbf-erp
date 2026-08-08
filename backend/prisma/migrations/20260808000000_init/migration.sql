-- CreateTable
CREATE TABLE `PermisoModulo` (
    `id` VARCHAR(191) NOT NULL,
    `rol` ENUM('director_general', 'encargado_sistemas', 'gerente_tecnico_produccion', 'asistente_tecnico_produccion', 'supervisor_huerta', 'ayudante_supervisor', 'regador', 'gerente_mantenimiento', 'mecanico', 'supervisor_cosecha', 'supervisor_empaque', 'encargado_cosecha_empaque', 'gerente_logistica', 'recursos_humanos', 'encargado_nominas', 'gerente_administrativo', 'contador', 'asistente_administrativo', 'encargado_compras', 'encargado_bodega', 'bodeguista', 'auditor') NOT NULL,
    `modulo` VARCHAR(191) NOT NULL,
    `ver` BOOLEAN NOT NULL DEFAULT false,
    `capturar` BOOLEAN NOT NULL DEFAULT false,
    `editar` BOOLEAN NOT NULL DEFAULT false,
    `autoriza` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `PermisoModulo_rol_modulo_key`(`rol`, `modulo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Usuario` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `rol` ENUM('director_general', 'encargado_sistemas', 'gerente_tecnico_produccion', 'asistente_tecnico_produccion', 'supervisor_huerta', 'ayudante_supervisor', 'regador', 'gerente_mantenimiento', 'mecanico', 'supervisor_cosecha', 'supervisor_empaque', 'encargado_cosecha_empaque', 'gerente_logistica', 'recursos_humanos', 'encargado_nominas', 'gerente_administrativo', 'contador', 'asistente_administrativo', 'encargado_compras', 'encargado_bodega', 'bodeguista', 'auditor') NOT NULL,
    `personalId` VARCHAR(191) NULL,
    `huertaId` VARCHAR(191) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoPorId` VARCHAR(191) NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Usuario_username_key`(`username`),
    UNIQUE INDEX `Usuario_personalId_key`(`personalId`),
    INDEX `Usuario_rol_idx`(`rol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditoriaLog` (
    `id` VARCHAR(191) NOT NULL,
    `tabla` VARCHAR(191) NOT NULL,
    `registroId` VARCHAR(191) NOT NULL,
    `accion` VARCHAR(191) NOT NULL,
    `valorAnterior` JSON NULL,
    `valorNuevo` JSON NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditoriaLog_tabla_registroId_idx`(`tabla`, `registroId`),
    INDEX `AuditoriaLog_usuarioId_idx`(`usuarioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SolicitudPendiente` (
    `id` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `entidadTabla` VARCHAR(191) NOT NULL,
    `entidadId` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `estado` ENUM('pendiente', 'autorizada', 'rechazada') NOT NULL DEFAULT 'pendiente',
    `motivoRechazo` VARCHAR(191) NULL,
    `propuestoPorId` VARCHAR(191) NOT NULL,
    `fechaPropuesta` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resueltoPorId` VARCHAR(191) NULL,
    `fechaResolucion` DATETIME(3) NULL,

    INDEX `SolicitudPendiente_tipo_estado_idx`(`tipo`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Huerta` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `hectareasTotales` DECIMAL(10, 4) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Huerta_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cuadro` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `estatus` ENUM('activo', 'en_descanso', 'fuera_produccion') NOT NULL DEFAULT 'activo',
    `camposPersonalizados` JSON NULL,

    UNIQUE INDEX `Cuadro_huertaId_nombre_key`(`huertaId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CuadroVersion` (
    `id` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `vigenteDesde` DATE NOT NULL,
    `vigenteHasta` DATE NULL,
    `hectareas` DECIMAL(10, 4) NOT NULL,
    `tipoSuelo` VARCHAR(191) NULL,
    `fechaSiembra` DATE NULL,
    `distSurcosM` DECIMAL(6, 3) NULL,
    `distPlantasM` DECIMAL(6, 3) NULL,
    `variedad` VARCHAR(191) NULL,

    INDEX `CuadroVersion_cuadroId_vigenteDesde_idx`(`cuadroId`, `vigenteDesde`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ciclo` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('cultivo', 'descanso', 'prueba') NOT NULL,
    `etapaActual` ENUM('preparacion_suelo', 'desarrollo', 'cosecha_empaque', 'post_cosecha') NOT NULL DEFAULT 'preparacion_suelo',
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    INDEX `Ciclo_huertaId_activo_idx`(`huertaId`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CicloVariedad` (
    `id` VARCHAR(191) NOT NULL,
    `cicloId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `variedad` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10, 4) NULL,
    `porcentaje` DECIMAL(5, 2) NULL,

    INDEX `CicloVariedad_cicloId_idx`(`cicloId`),
    INDEX `CicloVariedad_cuadroId_idx`(`cuadroId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SeccionRiego` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `SeccionRiego_huertaId_nombre_key`(`huertaId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SeccionRiegoCuadro` (
    `seccionId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`seccionId`, `cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Puesto` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `periodicidad` ENUM('semanal', 'quincenal', 'mensual') NOT NULL,
    `rangoSalarialMin` DECIMAL(10, 2) NULL,
    `rangoSalarialMax` DECIMAL(10, 2) NULL,
    `metodoAsignacionCosto` ENUM('directo_huerta', 'prorrateo_hectareas') NOT NULL,

    UNIQUE INDEX `Puesto_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Personal` (
    `id` VARCHAR(191) NOT NULL,
    `nombreCompleto` VARCHAR(191) NOT NULL,
    `tipo` ENUM('fijo', 'destajo') NOT NULL,
    `fechaNacimiento` DATE NULL,
    `identificacion` VARCHAR(191) NULL,
    `domicilio` VARCHAR(191) NULL,
    `telefono` VARCHAR(191) NULL,
    `telefonoEmergencia` VARCHAR(191) NULL,
    `fechaIngreso` DATE NULL,
    `puestoId` VARCHAR(191) NULL,
    `sueldo` DECIMAL(10, 2) NULL,
    `rfc` VARCHAR(191) NULL,
    `imssOSeguro` VARCHAR(191) NULL,
    `huertaId` VARCHAR(191) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fechaBaja` DATE NULL,
    `motivoBaja` VARCHAR(191) NULL,
    `dadoBajaPorId` VARCHAR(191) NULL,

    INDEX `Personal_tipo_activo_idx`(`tipo`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonalDocumento` (
    `id` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `tipoDocumento` ENUM('identificacion', 'contrato', 'comprobante_domicilio', 'otro') NOT NULL,
    `archivoUrl` VARCHAR(191) NOT NULL,
    `origen` ENUM('foto_celular', 'escaneo') NOT NULL,
    `fechaSubida` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DoNotHire` (
    `id` VARCHAR(191) NOT NULL,
    `nombreReferencia` VARCHAR(191) NOT NULL,
    `motivo` VARCHAR(191) NOT NULL,
    `condicionesSalida` VARCHAR(191) NULL,
    `registradoPorId` VARCHAR(191) NOT NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Actividad` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `unidad` VARCHAR(191) NOT NULL,
    `tarifa` DECIMAL(10, 2) NOT NULL,
    `usarTarifaGeneral` BOOLEAN NOT NULL DEFAULT false,
    `esquemaPago` ENUM('individual_hora', 'individual_caja', 'grupal_remolque', 'depende_empacadores') NOT NULL,
    `requiereCuadro` BOOLEAN NOT NULL DEFAULT false,
    `etapaRestringida` ENUM('preparacion_suelo', 'desarrollo', 'cosecha_empaque', 'post_cosecha') NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Actividad_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConfigNomina` (
    `clave` VARCHAR(191) NOT NULL,
    `valor` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrupoPago` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NULL,
    `persistente` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrupoMiembro` (
    `id` VARCHAR(191) NOT NULL,
    `grupoId` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `fechaDesde` DATE NOT NULL,
    `fechaHasta` DATE NULL,

    INDEX `GrupoMiembro_grupoId_fechaDesde_idx`(`grupoId`, `fechaDesde`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RegistroNomina` (
    `id` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NULL,
    `personalId` VARCHAR(191) NULL,
    `grupoId` VARCHAR(191) NULL,
    `actividadId` VARCHAR(191) NOT NULL,
    `cantidad` DECIMAL(10, 3) NOT NULL,
    `tarifaAplicada` DECIMAL(10, 2) NOT NULL,
    `origen` ENUM('manual', 'automatico_aplicacion', 'automatico_fertilizacion', 'automatico_cosecha', 'automatico_empaque') NOT NULL DEFAULT 'manual',
    `referenciaOrigenId` VARCHAR(191) NULL,
    `capturadoPorId` VARCHAR(191) NOT NULL,
    `fechaCaptura` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RegistroNomina_huertaId_fecha_idx`(`huertaId`, `fecha`),
    INDEX `RegistroNomina_personalId_fecha_idx`(`personalId`, `fecha`),
    INDEX `RegistroNomina_grupoId_fecha_idx`(`grupoId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiaCerrado` (
    `huertaId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `cerradoPorId` VARCHAR(191) NOT NULL,
    `fechaCierre` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`huertaId`, `fecha`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Prestamo` (
    `id` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `montoTotal` DECIMAL(10, 2) NOT NULL,
    `motivo` VARCHAR(191) NOT NULL,
    `periodicidad` ENUM('semanal', 'quincenal', 'mensual') NOT NULL,
    `montoPorDescuento` DECIMAL(10, 2) NOT NULL,
    `fechaPrimerDescuento` DATE NOT NULL,
    `proximoDescuento` DATE NOT NULL,
    `saldoPendiente` DECIMAL(10, 2) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    INDEX `Prestamo_personalId_activo_idx`(`personalId`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrestamoDescuento` (
    `id` VARCHAR(191) NOT NULL,
    `prestamoId` VARCHAR(191) NOT NULL,
    `periodoFin` DATE NOT NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `fechaAplicado` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `aplicadoPorId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BonoConfig` (
    `id` VARCHAR(191) NOT NULL,
    `tipo` ENUM('asistencia_perfecta', 'permanencia_racha', 'dia_doble') NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `parametros` JSON NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BonoDiaEspecial` (
    `id` VARCHAR(191) NOT NULL,
    `bonoId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompromisoEspecial` (
    `id` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `descripcion` VARCHAR(191) NOT NULL,
    `cumplido` BOOLEAN NULL,

    INDEX `CompromisoEspecial_personalId_fecha_idx`(`personalId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FaltaInjustificada` (
    `id` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `notas` VARCHAR(191) NULL,
    `registradoPorId` VARCHAR(191) NOT NULL,
    `fechaRegistro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FaltaInjustificada_personalId_fecha_key`(`personalId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BonoOtorgado` (
    `id` VARCHAR(191) NOT NULL,
    `bonoConfigId` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `periodoInicio` DATE NOT NULL,
    `periodoFin` DATE NOT NULL,
    `montoCalculado` DECIMAL(10, 2) NOT NULL,
    `estado` ENUM('pendiente_autorizar', 'autorizado', 'rechazado') NOT NULL DEFAULT 'pendiente_autorizar',
    `autorizadoPorId` VARCHAR(191) NULL,

    INDEX `BonoOtorgado_personalId_periodoFin_idx`(`personalId`, `periodoFin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Equipo` (
    `id` VARCHAR(191) NOT NULL,
    `tipo` ENUM('tractor', 'camioneta', 'remolque', 'implemento') NOT NULL,
    `folio` VARCHAR(191) NOT NULL,
    `marca` VARCHAR(191) NULL,
    `modelo` VARCHAR(191) NULL,
    `anio` INTEGER NULL,
    `placas` VARCHAR(191) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Equipo_folio_key`(`folio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CombustibleCarga` (
    `id` VARCHAR(191) NOT NULL,
    `equipoId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `tipo` ENUM('diesel_garrafa', 'gasolina_externa', 'diesel_externo') NOT NULL,
    `odometro` DECIMAL(10, 1) NULL,
    `horometro` DECIMAL(10, 1) NULL,
    `litros` DECIMAL(10, 2) NOT NULL,
    `precioUnitario` DECIMAL(10, 2) NULL,
    `capturadoPorId` VARCHAR(191) NOT NULL,

    INDEX `CombustibleCarga_equipoId_fecha_idx`(`equipoId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MantenimientoConcepto` (
    `id` VARCHAR(191) NOT NULL,
    `equipoId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `umbralHoras` DECIMAL(10, 1) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MantenimientoEvento` (
    `id` VARCHAR(191) NOT NULL,
    `equipoId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('preventivo', 'correctivo') NOT NULL,
    `conceptoId` VARCHAR(191) NULL,
    `descripcion` VARCHAR(191) NOT NULL,
    `mecanicoInterno` BOOLEAN NOT NULL,
    `costo` DECIMAL(10, 2) NULL,
    `fecha` DATE NOT NULL,

    INDEX `MantenimientoEvento_equipoId_fecha_idx`(`equipoId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EquipoUsoDiario` (
    `id` VARCHAR(191) NOT NULL,
    `equipoId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `operadorId` VARCHAR(191) NOT NULL,
    `horas` DECIMAL(6, 2) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,

    INDEX `EquipoUsoDiario_equipoId_fecha_idx`(`equipoId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Producto` (
    `id` VARCHAR(191) NOT NULL,
    `categoria` VARCHAR(191) NOT NULL,
    `ingredienteActivo` VARCHAR(191) NULL,
    `nombreComercial` VARCHAR(191) NOT NULL,
    `presentacion` VARCHAR(191) NOT NULL,
    `unidad` VARCHAR(191) NOT NULL,
    `requiereLote` BOOLEAN NOT NULL DEFAULT false,
    `autorizado` BOOLEAN NOT NULL DEFAULT false,
    `autorizadoPorId` VARCHAR(191) NULL,
    `fechaAutorizacion` DATETIME(3) NULL,

    INDEX `Producto_categoria_idx`(`categoria`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductoLote` (
    `id` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `lote` VARCHAR(191) NOT NULL,
    `fechaCaducidad` DATE NULL,
    `cantidadActual` DECIMAL(12, 3) NOT NULL,

    INDEX `ProductoLote_productoId_idx`(`productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlmacenCentralMovimiento` (
    `id` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `loteId` VARCHAR(191) NULL,
    `tipo` ENUM('entrada_compra', 'salida_comprometida', 'salida_real', 'prestamo_rancho', 'merma', 'baja_caducidad', 'abono_sobrante', 'ajuste_manual') NOT NULL,
    `cantidad` DECIMAL(12, 3) NOT NULL,
    `huertaDestinoId` VARCHAR(191) NULL,
    `referenciaId` VARCHAR(191) NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `capturadoPorId` VARCHAR(191) NOT NULL,
    `motivoAjuste` VARCHAR(191) NULL,

    INDEX `AlmacenCentralMovimiento_productoId_fecha_idx`(`productoId`, `fecha`),
    INDEX `AlmacenCentralMovimiento_huertaDestinoId_idx`(`huertaDestinoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlmacenLocal` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `cantidadRecibidaAcumulada` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `cantidadReportadaAcumulada` DECIMAL(12, 3) NOT NULL DEFAULT 0,

    UNIQUE INDEX `AlmacenLocal_huertaId_productoId_key`(`huertaId`, `productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AlmacenLocalMovimiento` (
    `id` VARCHAR(191) NOT NULL,
    `almacenLocalId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('entrega', 'consumo_reportado', 'ajuste_manual') NOT NULL,
    `cantidad` DECIMAL(12, 3) NOT NULL,
    `referenciaId` VARCHAR(191) NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `capturadoPorId` VARCHAR(191) NOT NULL,

    INDEX `AlmacenLocalMovimiento_almacenLocalId_fecha_idx`(`almacenLocalId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Proveedor` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `creditoMonto` DECIMAL(12, 2) NULL,
    `creditoVencimiento` DATE NULL,
    `datosFacturacion` JSON NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrdenCompra` (
    `id` VARCHAR(191) NOT NULL,
    `origen` ENUM('automatica', 'manual') NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `cantidadSolicitada` DECIMAL(12, 3) NOT NULL,
    `estado` ENUM('pendiente_autorizar', 'pendiente_cotizar', 'generada', 'recibida') NOT NULL,
    `proveedorId` VARCHAR(191) NULL,
    `precioUnitario` DECIMAL(10, 2) NULL,
    `fechaEsperada` DATE NULL,
    `referenciaAplicacionId` VARCHAR(191) NULL,
    `autorizadoPorId` VARCHAR(191) NULL,
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrdenCompra_estado_idx`(`estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrdenCompraRecepcion` (
    `id` VARCHAR(191) NOT NULL,
    `ordenId` VARCHAR(191) NOT NULL,
    `cantidadRecibida` DECIMAL(12, 3) NOT NULL,
    `lote` VARCHAR(191) NULL,
    `fechaCaducidad` DATE NULL,
    `fechaRecepcion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recibidoPorId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Aplicacion` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `recursoTipo` ENUM('gente', 'implemento') NOT NULL,
    `equipoId` VARCHAR(191) NULL,
    `concentracionValor` DECIMAL(10, 4) NOT NULL,
    `concentracionUnidad` ENUM('ml_l', 'g_l', 'kg_l') NOT NULL,
    `litrosMezclaPorHa` DECIMAL(10, 4) NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NOT NULL,
    `cantidadTotalCalculada` DECIMAL(12, 4) NOT NULL,
    `estado` ENUM('programada', 'entregada', 'realizada', 'vencida', 'cancelada') NOT NULL DEFAULT 'programada',
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AplicacionCuadro` (
    `aplicacionId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`aplicacionId`, `cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AplicacionRealizada` (
    `id` VARCHAR(191) NOT NULL,
    `aplicacionId` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NULL,
    `grupoId` VARCHAR(191) NULL,
    `horas` DECIMAL(6, 2) NOT NULL,
    `fechaReal` DATE NOT NULL,
    `registradoPorId` VARCHAR(191) NOT NULL,

    INDEX `AplicacionRealizada_aplicacionId_idx`(`aplicacionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertilizacionGranular` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `recursoTipo` ENUM('gente', 'implemento') NOT NULL,
    `equipoId` VARCHAR(191) NULL,
    `modoDosis` ENUM('kg_ha', 'g_planta') NOT NULL,
    `dosisValor` DECIMAL(10, 4) NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NOT NULL,
    `cantidadTotalCalculada` DECIMAL(12, 4) NOT NULL,
    `estado` ENUM('programada', 'entregada', 'realizada', 'vencida', 'cancelada') NOT NULL DEFAULT 'programada',
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertilizacionGranularCuadro` (
    `fertilizacionId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`fertilizacionId`, `cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertilizacionGranularRealizada` (
    `id` VARCHAR(191) NOT NULL,
    `fertilizacionId` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NULL,
    `grupoId` VARCHAR(191) NULL,
    `horas` DECIMAL(6, 2) NOT NULL,
    `fechaReal` DATE NOT NULL,
    `registradoPorId` VARCHAR(191) NOT NULL,

    INDEX `FertilizacionGranularRealizada_fertilizacionId_idx`(`fertilizacionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertirriegoProgramacion` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `dosisValor` DECIMAL(10, 4) NOT NULL,
    `dosisUnidad` ENUM('ml_l', 'g_l', 'kg_l') NOT NULL,
    `litrosAguaPorHa` DECIMAL(10, 4) NOT NULL,
    `frecuencia` ENUM('diario', 'cada_2_dias', 'cada_3_dias', 'patron_2_1') NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NOT NULL,
    `cantidadTotalCalculada` DECIMAL(12, 4) NOT NULL,
    `estado` ENUM('programada', 'entregada', 'realizada', 'vencida', 'cancelada') NOT NULL DEFAULT 'programada',
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertirriegoSeccion` (
    `fertirriegoId` VARCHAR(191) NOT NULL,
    `seccionId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`fertirriegoId`, `seccionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalisisLaboratorio` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `variedad` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `resultados` JSON NOT NULL,

    INDEX `AnalisisLaboratorio_huertaId_variedad_fecha_idx`(`huertaId`, `variedad`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiegoRegistroDiario` (
    `id` VARCHAR(191) NOT NULL,
    `seccionId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `horas` DECIMAL(6, 2) NOT NULL,
    `fertirriegoConfirmado` BOOLEAN NOT NULL DEFAULT false,
    `cantidadAplicada` DECIMAL(12, 4) NULL,
    `capturadoPorId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `RiegoRegistroDiario_seccionId_fecha_key`(`seccionId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditoriaLog` ADD CONSTRAINT `AuditoriaLog_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolicitudPendiente` ADD CONSTRAINT `SolicitudPendiente_propuestoPorId_fkey` FOREIGN KEY (`propuestoPorId`) REFERENCES `Usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SolicitudPendiente` ADD CONSTRAINT `SolicitudPendiente_resueltoPorId_fkey` FOREIGN KEY (`resueltoPorId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cuadro` ADD CONSTRAINT `Cuadro_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CuadroVersion` ADD CONSTRAINT `CuadroVersion_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ciclo` ADD CONSTRAINT `Ciclo_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CicloVariedad` ADD CONSTRAINT `CicloVariedad_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `Ciclo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CicloVariedad` ADD CONSTRAINT `CicloVariedad_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SeccionRiego` ADD CONSTRAINT `SeccionRiego_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SeccionRiegoCuadro` ADD CONSTRAINT `SeccionRiegoCuadro_seccionId_fkey` FOREIGN KEY (`seccionId`) REFERENCES `SeccionRiego`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SeccionRiegoCuadro` ADD CONSTRAINT `SeccionRiegoCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Personal` ADD CONSTRAINT `Personal_puestoId_fkey` FOREIGN KEY (`puestoId`) REFERENCES `Puesto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Personal` ADD CONSTRAINT `Personal_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonalDocumento` ADD CONSTRAINT `PersonalDocumento_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GrupoPago` ADD CONSTRAINT `GrupoPago_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GrupoMiembro` ADD CONSTRAINT `GrupoMiembro_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `GrupoPago`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GrupoMiembro` ADD CONSTRAINT `GrupoMiembro_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RegistroNomina` ADD CONSTRAINT `RegistroNomina_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RegistroNomina` ADD CONSTRAINT `RegistroNomina_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RegistroNomina` ADD CONSTRAINT `RegistroNomina_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RegistroNomina` ADD CONSTRAINT `RegistroNomina_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `GrupoPago`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RegistroNomina` ADD CONSTRAINT `RegistroNomina_actividadId_fkey` FOREIGN KEY (`actividadId`) REFERENCES `Actividad`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiaCerrado` ADD CONSTRAINT `DiaCerrado_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prestamo` ADD CONSTRAINT `Prestamo_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrestamoDescuento` ADD CONSTRAINT `PrestamoDescuento_prestamoId_fkey` FOREIGN KEY (`prestamoId`) REFERENCES `Prestamo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BonoDiaEspecial` ADD CONSTRAINT `BonoDiaEspecial_bonoId_fkey` FOREIGN KEY (`bonoId`) REFERENCES `BonoConfig`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompromisoEspecial` ADD CONSTRAINT `CompromisoEspecial_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FaltaInjustificada` ADD CONSTRAINT `FaltaInjustificada_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BonoOtorgado` ADD CONSTRAINT `BonoOtorgado_bonoConfigId_fkey` FOREIGN KEY (`bonoConfigId`) REFERENCES `BonoConfig`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BonoOtorgado` ADD CONSTRAINT `BonoOtorgado_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CombustibleCarga` ADD CONSTRAINT `CombustibleCarga_equipoId_fkey` FOREIGN KEY (`equipoId`) REFERENCES `Equipo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MantenimientoConcepto` ADD CONSTRAINT `MantenimientoConcepto_equipoId_fkey` FOREIGN KEY (`equipoId`) REFERENCES `Equipo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MantenimientoEvento` ADD CONSTRAINT `MantenimientoEvento_equipoId_fkey` FOREIGN KEY (`equipoId`) REFERENCES `Equipo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MantenimientoEvento` ADD CONSTRAINT `MantenimientoEvento_conceptoId_fkey` FOREIGN KEY (`conceptoId`) REFERENCES `MantenimientoConcepto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipoUsoDiario` ADD CONSTRAINT `EquipoUsoDiario_equipoId_fkey` FOREIGN KEY (`equipoId`) REFERENCES `Equipo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipoUsoDiario` ADD CONSTRAINT `EquipoUsoDiario_operadorId_fkey` FOREIGN KEY (`operadorId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipoUsoDiario` ADD CONSTRAINT `EquipoUsoDiario_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductoLote` ADD CONSTRAINT `ProductoLote_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlmacenCentralMovimiento` ADD CONSTRAINT `AlmacenCentralMovimiento_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlmacenCentralMovimiento` ADD CONSTRAINT `AlmacenCentralMovimiento_loteId_fkey` FOREIGN KEY (`loteId`) REFERENCES `ProductoLote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlmacenLocal` ADD CONSTRAINT `AlmacenLocal_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlmacenLocal` ADD CONSTRAINT `AlmacenLocal_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AlmacenLocalMovimiento` ADD CONSTRAINT `AlmacenLocalMovimiento_almacenLocalId_fkey` FOREIGN KEY (`almacenLocalId`) REFERENCES `AlmacenLocal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenCompra` ADD CONSTRAINT `OrdenCompra_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenCompra` ADD CONSTRAINT `OrdenCompra_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `Proveedor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenCompraRecepcion` ADD CONSTRAINT `OrdenCompraRecepcion_ordenId_fkey` FOREIGN KEY (`ordenId`) REFERENCES `OrdenCompra`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Aplicacion` ADD CONSTRAINT `Aplicacion_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Aplicacion` ADD CONSTRAINT `Aplicacion_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Aplicacion` ADD CONSTRAINT `Aplicacion_equipoId_fkey` FOREIGN KEY (`equipoId`) REFERENCES `Equipo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionCuadro` ADD CONSTRAINT `AplicacionCuadro_aplicacionId_fkey` FOREIGN KEY (`aplicacionId`) REFERENCES `Aplicacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionCuadro` ADD CONSTRAINT `AplicacionCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionRealizada` ADD CONSTRAINT `AplicacionRealizada_aplicacionId_fkey` FOREIGN KEY (`aplicacionId`) REFERENCES `Aplicacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranular` ADD CONSTRAINT `FertilizacionGranular_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranular` ADD CONSTRAINT `FertilizacionGranular_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranular` ADD CONSTRAINT `FertilizacionGranular_equipoId_fkey` FOREIGN KEY (`equipoId`) REFERENCES `Equipo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranularCuadro` ADD CONSTRAINT `FertilizacionGranularCuadro_fertilizacionId_fkey` FOREIGN KEY (`fertilizacionId`) REFERENCES `FertilizacionGranular`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranularCuadro` ADD CONSTRAINT `FertilizacionGranularCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranularRealizada` ADD CONSTRAINT `FertilizacionGranularRealizada_fertilizacionId_fkey` FOREIGN KEY (`fertilizacionId`) REFERENCES `FertilizacionGranular`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertirriegoProgramacion` ADD CONSTRAINT `FertirriegoProgramacion_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertirriegoProgramacion` ADD CONSTRAINT `FertirriegoProgramacion_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertirriegoSeccion` ADD CONSTRAINT `FertirriegoSeccion_fertirriegoId_fkey` FOREIGN KEY (`fertirriegoId`) REFERENCES `FertirriegoProgramacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertirriegoSeccion` ADD CONSTRAINT `FertirriegoSeccion_seccionId_fkey` FOREIGN KEY (`seccionId`) REFERENCES `SeccionRiego`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalisisLaboratorio` ADD CONSTRAINT `AnalisisLaboratorio_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiegoRegistroDiario` ADD CONSTRAINT `RiegoRegistroDiario_seccionId_fkey` FOREIGN KEY (`seccionId`) REFERENCES `SeccionRiego`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

