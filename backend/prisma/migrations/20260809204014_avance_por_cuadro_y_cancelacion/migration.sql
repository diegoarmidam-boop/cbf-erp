-- AlterTable: Aplicacion - base estable de % de avance/descuento proporcional + protocolo de cancelación
ALTER TABLE `aplicacion` ADD COLUMN `hectareasTotalesProgramadas` DECIMAL(10, 4) NULL;
ALTER TABLE `aplicacion` ADD COLUMN `canceladaPorId` VARCHAR(191) NULL;
ALTER TABLE `aplicacion` ADD COLUMN `fechaCancelacion` DATETIME(3) NULL;
ALTER TABLE `aplicacion` ADD COLUMN `confirmacionBodegaPorId` VARCHAR(191) NULL;
ALTER TABLE `aplicacion` ADD COLUMN `fechaConfirmacionBodega` DATETIME(3) NULL;

-- Backfill: únicas Aplicaciones reales existentes al momento de esta migración — hectáreas vigentes de sus Cuadros programados
UPDATE `aplicacion` a
  SET a.`hectareasTotalesProgramadas` = (
    SELECT COALESCE(SUM(cv.`hectareas`), 0)
    FROM `aplicacioncuadro` ac
    JOIN `cuadroversion` cv ON cv.`cuadroId` = ac.`cuadroId` AND cv.`vigenteHasta` IS NULL
    WHERE ac.`aplicacionId` = a.`id`
  )
WHERE a.`hectareasTotalesProgramadas` IS NULL;

ALTER TABLE `aplicacion` MODIFY `hectareasTotalesProgramadas` DECIMAL(10, 4) NOT NULL;

-- AlterTable: FertilizacionGranular - mismas columnas (sin registros existentes que migrar)
ALTER TABLE `fertilizaciongranular` ADD COLUMN `hectareasTotalesProgramadas` DECIMAL(10, 4) NOT NULL DEFAULT 0;
ALTER TABLE `fertilizaciongranular` MODIFY `hectareasTotalesProgramadas` DECIMAL(10, 4) NOT NULL;
ALTER TABLE `fertilizaciongranular` ADD COLUMN `canceladaPorId` VARCHAR(191) NULL;
ALTER TABLE `fertilizaciongranular` ADD COLUMN `fechaCancelacion` DATETIME(3) NULL;
ALTER TABLE `fertilizaciongranular` ADD COLUMN `confirmacionBodegaPorId` VARCHAR(191) NULL;
ALTER TABLE `fertilizaciongranular` ADD COLUMN `fechaConfirmacionBodega` DATETIME(3) NULL;

-- CreateTable: avance por Cuadro en cada reporte de "realizada"
CREATE TABLE `aplicacionrealizadacuadro` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10, 4) NOT NULL,

    INDEX `aplicacionrealizadacuadro_realizadaId_idx`(`realizadaId`),
    INDEX `aplicacionrealizadacuadro_cuadroId_idx`(`cuadroId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `fertilizaciongranularrealizadacuadro` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `hectareas` DECIMAL(10, 4) NOT NULL,

    INDEX `fertilizaciongranularrealizadacuadro_realizadaId_idx`(`realizadaId`),
    INDEX `fertilizaciongranularrealizadacuadro_cuadroId_idx`(`cuadroId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `aplicacionrealizadacuadro` ADD CONSTRAINT `aplicacionrealizadacuadro_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `aplicacionrealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `aplicacionrealizadacuadro` ADD CONSTRAINT `aplicacionrealizadacuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `fertilizaciongranularrealizadacuadro` ADD CONSTRAINT `fertilizaciongranularrealizadacuadro_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `fertilizaciongranularrealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `fertilizaciongranularrealizadacuadro` ADD CONSTRAINT `fertilizaciongranularrealizadacuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
