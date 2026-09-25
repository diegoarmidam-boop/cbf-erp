-- V1 P2 (25-sep-2026, Bloque 3): Grupos de dosis + modo Por Cuadro/Por
-- Variedad en Aplicaciones. Paso 1 de 2: agrega columnas/tablas nuevas sin
-- tocar las viejas todavía (se backfillea con script y se limpia en la
-- siguiente migración, una vez verificado).

ALTER TABLE `Aplicacion` ADD COLUMN `modo` ENUM('por_cuadro', 'por_variedad') NOT NULL DEFAULT 'por_cuadro';
ALTER TABLE `Aplicacion` ADD COLUMN `comentario` TEXT NULL;
ALTER TABLE `Aplicacion` ADD COLUMN `notaCierre` TEXT NULL;

CREATE TABLE `AplicacionGrupo` (
    `id` VARCHAR(191) NOT NULL,
    `aplicacionId` VARCHAR(191) NOT NULL,
    `orden` INTEGER NOT NULL,
    `litrosMezclaPorHa` DECIMAL(10,4) NOT NULL,
    `hectareasProgramadas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `AplicacionGrupo_aplicacionId_idx`(`aplicacionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AplicacionGrupoCuadro` (
    `id` VARCHAR(191) NOT NULL,
    `grupoId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `AplicacionGrupoCuadro_grupoId_cuadroId_key`(`grupoId`, `cuadroId`),
    INDEX `AplicacionGrupoCuadro_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AplicacionGrupoVariedad` (
    `id` VARCHAR(191) NOT NULL,
    `grupoId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `variedad` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `AplicacionGrupoVariedad_grupoId_cuadroId_variedad_key`(`grupoId`, `cuadroId`, `variedad`),
    INDEX `AplicacionGrupoVariedad_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AplicacionProducto` ADD COLUMN `grupoId` VARCHAR(191) NULL;

ALTER TABLE `AplicacionRealizada` ADD COLUMN `hectareas` DECIMAL(10,4) NOT NULL DEFAULT 0;

CREATE TABLE `AplicacionRealizadaGrupo` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `grupoId` VARCHAR(191) NOT NULL,
    `hectareasAtribuidas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `AplicacionRealizadaGrupo_realizadaId_idx`(`realizadaId`),
    INDEX `AplicacionRealizadaGrupo_grupoId_idx`(`grupoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AplicacionRealizadaGrupoCuadro` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaGrupoId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `variedad` VARCHAR(191) NULL,
    `hectareasAtribuidas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `AplicacionRealizadaGrupoCuadro_realizadaGrupoId_idx`(`realizadaGrupoId`),
    INDEX `AplicacionRealizadaGrupoCuadro_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AplicacionGrupo` ADD CONSTRAINT `AplicacionGrupo_aplicacionId_fkey` FOREIGN KEY (`aplicacionId`) REFERENCES `Aplicacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AplicacionGrupoCuadro` ADD CONSTRAINT `AplicacionGrupoCuadro_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `AplicacionGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AplicacionGrupoCuadro` ADD CONSTRAINT `AplicacionGrupoCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AplicacionGrupoVariedad` ADD CONSTRAINT `AplicacionGrupoVariedad_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `AplicacionGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AplicacionGrupoVariedad` ADD CONSTRAINT `AplicacionGrupoVariedad_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AplicacionProducto` ADD CONSTRAINT `AplicacionProducto_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `AplicacionGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AplicacionRealizadaGrupo` ADD CONSTRAINT `AplicacionRealizadaGrupo_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `AplicacionRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AplicacionRealizadaGrupo` ADD CONSTRAINT `AplicacionRealizadaGrupo_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `AplicacionGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AplicacionRealizadaGrupoCuadro` ADD CONSTRAINT `AplicacionRealizadaGrupoCuadro_realizadaGrupoId_fkey` FOREIGN KEY (`realizadaGrupoId`) REFERENCES `AplicacionRealizadaGrupo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AplicacionRealizadaGrupoCuadro` ADD CONSTRAINT `AplicacionRealizadaGrupoCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
