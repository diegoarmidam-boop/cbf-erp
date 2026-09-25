-- V1 P2 (25-sep-2026, Bloque 3): Grupos de dosis + modo Por Cuadro/Por
-- Variedad en Fertilizacion Granular -- 0 registros en produccion (0
-- FertilizacionGranular al momento de esta migracion), asi que se
-- reemplaza el modelo viejo directo, sin backfill de datos.

ALTER TABLE `FertilizacionGranular` ADD COLUMN `modo` ENUM('por_cuadro', 'por_variedad') NOT NULL DEFAULT 'por_cuadro';
ALTER TABLE `FertilizacionGranular` ADD COLUMN `comentario` TEXT NULL;
ALTER TABLE `FertilizacionGranular` ADD COLUMN `notaCierre` TEXT NULL;

ALTER TABLE `FertilizacionGranularRealizadaCuadro` DROP FOREIGN KEY `FertilizacionGranularRealizadaCuadro_realizadaId_fkey`;
ALTER TABLE `FertilizacionGranularRealizadaCuadro` DROP FOREIGN KEY `FertilizacionGranularRealizadaCuadro_cuadroId_fkey`;
DROP TABLE `FertilizacionGranularRealizadaCuadro`;

DELETE FROM `FertilizacionGranularProducto`;

ALTER TABLE `FertilizacionGranularCuadro` DROP FOREIGN KEY `FertilizacionGranularCuadro_fertilizacionId_fkey`;
DROP TABLE `FertilizacionGranularCuadro`;

DELETE FROM `FertilizacionGranularRealizada`;
DELETE FROM `FertilizacionGranular`;

CREATE TABLE `FertilizacionGranularGrupo` (
    `id` VARCHAR(191) NOT NULL,
    `fertilizacionId` VARCHAR(191) NOT NULL,
    `orden` INTEGER NOT NULL,
    `hectareasProgramadas` DECIMAL(10,4) NOT NULL,
    `plantasProgramadas` DECIMAL(14,2) NULL,

    PRIMARY KEY (`id`),
    INDEX `FertilizacionGranularGrupo_fertilizacionId_idx`(`fertilizacionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FertilizacionGranularGrupoCuadro` (
    `id` VARCHAR(191) NOT NULL,
    `grupoId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `FertilizacionGranularGrupoCuadro_grupoId_cuadroId_key`(`grupoId`, `cuadroId`),
    INDEX `FertilizacionGranularGrupoCuadro_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FertilizacionGranularGrupoVariedad` (
    `id` VARCHAR(191) NOT NULL,
    `grupoId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `variedad` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `FertilizacionGranularGrupoVariedad_grupoId_cuadroId_varie_key`(`grupoId`, `cuadroId`, `variedad`),
    INDEX `FertilizacionGranularGrupoVariedad_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FertilizacionGranularProducto` ADD COLUMN `grupoId` VARCHAR(191) NOT NULL;

ALTER TABLE `FertilizacionGranularRealizada` ADD COLUMN `hectareas` DECIMAL(10,4) NOT NULL;
ALTER TABLE `FertilizacionGranularRealizada` ADD COLUMN `grupoPagoId` VARCHAR(191) NULL;
ALTER TABLE `FertilizacionGranularRealizada` DROP COLUMN `grupoId`;

CREATE TABLE `FertilizacionGranularRealizadaGrupo` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `grupoId` VARCHAR(191) NOT NULL,
    `hectareasAtribuidas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `FertilizacionGranularRealizadaGrupo_realizadaId_idx`(`realizadaId`),
    INDEX `FertilizacionGranularRealizadaGrupo_grupoId_idx`(`grupoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FertilizacionGranularRealizadaGrupoCuadro` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaGrupoId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `variedad` VARCHAR(191) NULL,
    `hectareasAtribuidas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `FertilizacionGranularRealizadaGrupoCuadro_realizadaGrupoI_idx`(`realizadaGrupoId`),
    INDEX `FertilizacionGranularRealizadaGrupoCuadro_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FertilizacionGranularGrupo` ADD CONSTRAINT `FertilizacionGranularGrupo_fertilizacionId_fkey` FOREIGN KEY (`fertilizacionId`) REFERENCES `FertilizacionGranular`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FertilizacionGranularGrupoCuadro` ADD CONSTRAINT `FertilizacionGranularGrupoCuadro_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `FertilizacionGranularGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FertilizacionGranularGrupoCuadro` ADD CONSTRAINT `FertilizacionGranularGrupoCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FertilizacionGranularGrupoVariedad` ADD CONSTRAINT `FertilizacionGranularGrupoVariedad_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `FertilizacionGranularGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FertilizacionGranularGrupoVariedad` ADD CONSTRAINT `FertilizacionGranularGrupoVariedad_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FertilizacionGranularProducto` ADD CONSTRAINT `FertilizacionGranularProducto_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `FertilizacionGranularGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FertilizacionGranularRealizadaGrupo` ADD CONSTRAINT `FertilizacionGranularRealizadaGrupo_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `FertilizacionGranularRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FertilizacionGranularRealizadaGrupo` ADD CONSTRAINT `FertilizacionGranularRealizadaGrupo_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `FertilizacionGranularGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FertilizacionGranularRealizadaGrupoCuadro` ADD CONSTRAINT `FertilizacionGranularRealizadaGrupoCuadro_realizadaGrupoI_fkey` FOREIGN KEY (`realizadaGrupoId`) REFERENCES `FertilizacionGranularRealizadaGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `FertilizacionGranularRealizadaGrupoCuadro` ADD CONSTRAINT `FertilizacionGranularRealizadaGrupoCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
