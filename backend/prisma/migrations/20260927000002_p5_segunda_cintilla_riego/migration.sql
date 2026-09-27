-- V1 P5 (27-sep-2026): mover "Tirar 2da Cintilla" de Actividades a Riego
-- (9.6) — se programa por Sección, no por Cuadro. 0 registros existentes
-- de esa Actividad (nunca se usó), nada que migrar.

ALTER TABLE `RegistroNomina` MODIFY COLUMN `origen` ENUM('manual', 'automatico_aplicacion', 'automatico_fertilizacion', 'automatico_actividad', 'automatico_cosecha', 'automatico_empaque', 'automatico_segunda_cintilla') NOT NULL DEFAULT 'manual';

CREATE TABLE `SegundaCintillaProgramacion` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NOT NULL,
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SegundaCintillaProgramacionSeccion` (
    `id` VARCHAR(191) NOT NULL,
    `programacionId` VARCHAR(191) NOT NULL,
    `seccionId` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `SegundaCintillaProgramacionSeccion_programacionId_seccionId_key`(`programacionId`, `seccionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SegundaCintillaRealizada` (
    `id` VARCHAR(191) NOT NULL,
    `programacionId` VARCHAR(191) NOT NULL,
    `seccionId` VARCHAR(191) NOT NULL,
    `fechaReal` DATE NOT NULL,
    `hectareas` DECIMAL(10,4) NOT NULL,
    `registradoPorId` VARCHAR(191) NOT NULL,
    `comentario` TEXT NULL,

    PRIMARY KEY (`id`),
    INDEX `SegundaCintillaRealizada_programacionId_idx`(`programacionId`),
    INDEX `SegundaCintillaRealizada_seccionId_idx`(`seccionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SegundaCintillaRealizadaPersona` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `horas` DECIMAL(6,2) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `SegundaCintillaRealizadaPersona_realizadaId_personalId_key`(`realizadaId`, `personalId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SegundaCintillaRealizadaCuadro` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `hectareasAtribuidas` DECIMAL(10,4) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `SegundaCintillaRealizadaCuadro_realizadaId_idx`(`realizadaId`),
    INDEX `SegundaCintillaRealizadaCuadro_cuadroId_idx`(`cuadroId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SegundaCintillaProgramacion` ADD CONSTRAINT `SegundaCintillaProgramacion_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SegundaCintillaProgramacionSeccion` ADD CONSTRAINT `SegundaCintillaProgramacionSeccion_programacionId_fkey` FOREIGN KEY (`programacionId`) REFERENCES `SegundaCintillaProgramacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SegundaCintillaProgramacionSeccion` ADD CONSTRAINT `SegundaCintillaProgramacionSeccion_seccionId_fkey` FOREIGN KEY (`seccionId`) REFERENCES `SeccionRiego`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SegundaCintillaRealizada` ADD CONSTRAINT `SegundaCintillaRealizada_programacionId_fkey` FOREIGN KEY (`programacionId`) REFERENCES `SegundaCintillaProgramacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SegundaCintillaRealizada` ADD CONSTRAINT `SegundaCintillaRealizada_seccionId_fkey` FOREIGN KEY (`seccionId`) REFERENCES `SeccionRiego`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SegundaCintillaRealizadaPersona` ADD CONSTRAINT `SegundaCintillaRealizadaPersona_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `SegundaCintillaRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SegundaCintillaRealizadaPersona` ADD CONSTRAINT `SegundaCintillaRealizadaPersona_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SegundaCintillaRealizadaCuadro` ADD CONSTRAINT `SegundaCintillaRealizadaCuadro_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `SegundaCintillaRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SegundaCintillaRealizadaCuadro` ADD CONSTRAINT `SegundaCintillaRealizadaCuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
