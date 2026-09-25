-- V1 P2 (25-sep-2026, Bloque 3): modo Por Cuadro/Por Variedad en
-- Actividades -- 0 registros en produccion (0 ActividadProgramada),
-- reemplaza directo sin backfill de datos. Sin Grupos (regla explicita:
-- solo Aplicaciones y Granular los tienen).

ALTER TABLE `ActividadProgramada` ADD COLUMN `modo` ENUM('por_cuadro', 'por_variedad') NOT NULL DEFAULT 'por_cuadro';
ALTER TABLE `ActividadProgramada` ADD COLUMN `comentario` TEXT NULL;

DELETE FROM `ActividadRealizadaCuadro`;
ALTER TABLE `ActividadRealizadaCuadro` DROP COLUMN `hectareas`;
ALTER TABLE `ActividadRealizadaCuadro` ADD COLUMN `hectareasAtribuidas` DECIMAL(10,4) NOT NULL;
ALTER TABLE `ActividadRealizadaCuadro` ADD COLUMN `variedad` VARCHAR(191) NULL;

ALTER TABLE `ActividadRealizada` ADD COLUMN `hectareas` DECIMAL(10,4) NOT NULL;

ALTER TABLE `ActividadProgramadaCuadro` DROP FOREIGN KEY `ActividadProgramadaCuadro_actividadProgramadaId_fkey`;
ALTER TABLE `ActividadProgramadaCuadro` DROP FOREIGN KEY `ActividadProgramadaCuadro_cuadroId_fkey`;
DROP TABLE `ActividadProgramadaCuadro`;

CREATE TABLE `ActividadProgramadaCuadro` (
    `id` VARCHAR(191) NOT NULL,
    `actividadProgramadaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `ActividadProgramadaCuadro_actividadProgramadaId_cuadroId_key`(`actividadProgramadaId`, `cuadroId`),
    INDEX `ActividadProgramadaCuadro_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ActividadProgramadaVariedad` (
    `id` VARCHAR(191) NOT NULL,
    `actividadProgramadaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `variedad` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `ActividadProgramadaVariedad_actividadProgramadaId_cuadroId_key`(`actividadProgramadaId`, `cuadroId`, `variedad`),
    INDEX `ActividadProgramadaVariedad_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ActividadProgramadaCuadro` ADD CONSTRAINT `ActividadProgramadaCuadro_actividadProgramadaId_fkey` FOREIGN KEY (`actividadProgramadaId`) REFERENCES `ActividadProgramada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ActividadProgramadaCuadro` ADD CONSTRAINT `ActividadProgramadaCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ActividadProgramadaVariedad` ADD CONSTRAINT `ActividadProgramadaVariedad_actividadProgramadaId_fkey` FOREIGN KEY (`actividadProgramadaId`) REFERENCES `ActividadProgramada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ActividadProgramadaVariedad` ADD CONSTRAINT `ActividadProgramadaVariedad_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
