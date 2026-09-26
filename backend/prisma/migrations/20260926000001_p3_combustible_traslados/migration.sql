-- V1 P3 (26-sep-2026): Combustible por avance y Traslados de tractor (9.13,
-- 9.6, 9.7). Todo aditivo — Equipo (1 tractor, 1 camioneta, 1 implemento) y
-- CombustibleCarga (0 registros) no tienen datos reales que migrar.

-- Equipo: nuevos tipos (drone, motobomba) + "Rancho actual".
ALTER TABLE `Equipo` MODIFY COLUMN `tipo` ENUM('tractor', 'camioneta', 'remolque', 'implemento', 'drone', 'motobomba') NOT NULL;
ALTER TABLE `Equipo` ADD COLUMN `ranchoActualId` VARCHAR(191) NULL;
ALTER TABLE `Equipo` ADD CONSTRAINT `Equipo_ranchoActualId_fkey` FOREIGN KEY (`ranchoActualId`) REFERENCES `Huerta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Traslado de tractor entre ranchos.
CREATE TABLE `EquipoTraslado` (
    `id` VARCHAR(191) NOT NULL,
    `equipoId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `huertaOrigenId` VARCHAR(191) NULL,
    `huertaDestinoId` VARCHAR(191) NOT NULL,
    `litros` DECIMAL(10,2) NOT NULL,
    `fotoUrl` VARCHAR(191) NOT NULL,
    `registradoPorId` VARCHAR(191) NOT NULL,
    `fechaRegistro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `EquipoTraslado_equipoId_fecha_idx`(`equipoId`, `fecha`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EquipoTraslado` ADD CONSTRAINT `EquipoTraslado_equipoId_fkey` FOREIGN KEY (`equipoId`) REFERENCES `Equipo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `EquipoTraslado` ADD CONSTRAINT `EquipoTraslado_huertaOrigenId_fkey` FOREIGN KEY (`huertaOrigenId`) REFERENCES `Huerta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `EquipoTraslado` ADD CONSTRAINT `EquipoTraslado_huertaDestinoId_fkey` FOREIGN KEY (`huertaDestinoId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CombustibleCarga: nuevo tipo (gasolina_garrafa), Huerta cuyo Almacén Local
-- se descontó, foto obligatoria a nivel de aplicación, origen y trazabilidad
-- a la línea de avance que la generó.
ALTER TABLE `CombustibleCarga` MODIFY COLUMN `tipo` ENUM('diesel_garrafa', 'gasolina_garrafa', 'gasolina_externa', 'diesel_externo') NOT NULL;
ALTER TABLE `CombustibleCarga` ADD COLUMN `huertaId` VARCHAR(191) NULL;
ALTER TABLE `CombustibleCarga` ADD COLUMN `fotoUrl` VARCHAR(191) NULL;
ALTER TABLE `CombustibleCarga` ADD COLUMN `origen` ENUM('manual', 'automatico_aplicacion', 'automatico_actividad', 'automatico_fertirriego') NOT NULL DEFAULT 'manual';
ALTER TABLE `CombustibleCarga` ADD COLUMN `referenciaLineaId` VARCHAR(191) NULL;
ALTER TABLE `CombustibleCarga` ADD INDEX `CombustibleCarga_huertaId_fecha_idx`(`huertaId`, `fecha`);
ALTER TABLE `CombustibleCarga` ADD INDEX `CombustibleCarga_referenciaLineaId_idx`(`referenciaLineaId`);
ALTER TABLE `CombustibleCarga` ADD CONSTRAINT `CombustibleCarga_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Reparto de gasolina de motobomba a Secciones/Cuadros (guardado el día,
-- nunca recalculado — mismo criterio que Aplicaciones/Granular/Actividades).
CREATE TABLE `CombustibleCargaSeccion` (
    `id` VARCHAR(191) NOT NULL,
    `cargaId` VARCHAR(191) NOT NULL,
    `seccionId` VARCHAR(191) NOT NULL,
    `hectareasAtribuidas` DECIMAL(10,4) NOT NULL,
    `litrosAtribuidos` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `CombustibleCargaSeccion_cargaId_seccionId_key`(`cargaId`, `seccionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CombustibleCargaSeccion` ADD CONSTRAINT `CombustibleCargaSeccion_cargaId_fkey` FOREIGN KEY (`cargaId`) REFERENCES `CombustibleCarga`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CombustibleCargaSeccion` ADD CONSTRAINT `CombustibleCargaSeccion_seccionId_fkey` FOREIGN KEY (`seccionId`) REFERENCES `SeccionRiego`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `CombustibleCargaCuadro` (
    `id` VARCHAR(191) NOT NULL,
    `cargaSeccionId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `litrosAtribuidos` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `CombustibleCargaCuadro_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CombustibleCargaCuadro` ADD CONSTRAINT `CombustibleCargaCuadro_cargaSeccionId_fkey` FOREIGN KEY (`cargaSeccionId`) REFERENCES `CombustibleCargaSeccion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CombustibleCargaCuadro` ADD CONSTRAINT `CombustibleCargaCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Aplicaciones: 4ta modalidad "drone" (recursoSugerido y cada línea).
ALTER TABLE `Aplicacion` MODIFY COLUMN `recursoSugerido` ENUM('mochila', 'turbina', 'aguilon', 'drone') NOT NULL;
ALTER TABLE `AplicacionRealizadaLinea` MODIFY COLUMN `modalidad` ENUM('mochila', 'turbina', 'aguilon', 'drone') NOT NULL;

-- Relleno de diésel ligado a la línea de avance con tractor (Aplicaciones y
-- Actividades — Granular no captura tractor hoy, se hace a mano).
ALTER TABLE `AplicacionRealizadaLinea` ADD COLUMN `combustibleCargaId` VARCHAR(191) NULL;
ALTER TABLE `AplicacionRealizadaLinea` ADD UNIQUE INDEX `AplicacionRealizadaLinea_combustibleCargaId_key`(`combustibleCargaId`);
ALTER TABLE `AplicacionRealizadaLinea` ADD CONSTRAINT `AplicacionRealizadaLinea_combustibleCargaId_fkey` FOREIGN KEY (`combustibleCargaId`) REFERENCES `CombustibleCarga`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ActividadRealizadaLinea` ADD COLUMN `combustibleCargaId` VARCHAR(191) NULL;
ALTER TABLE `ActividadRealizadaLinea` ADD UNIQUE INDEX `ActividadRealizadaLinea_combustibleCargaId_key`(`combustibleCargaId`);
ALTER TABLE `ActividadRealizadaLinea` ADD CONSTRAINT `ActividadRealizadaLinea_combustibleCargaId_fkey` FOREIGN KEY (`combustibleCargaId`) REFERENCES `CombustibleCarga`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Configuración: % de desviación editable (reemplaza UMBRAL_DESVIACION fijo en código).
ALTER TABLE `EmpresaConfig` ADD COLUMN `umbralDesviacionCombustiblePctDefault` DECIMAL(5,2) NOT NULL DEFAULT 20;
