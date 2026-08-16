/*
  Warnings:

  - You are about to drop the `actividadrealizadapersona` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `actividadrealizadapersona` DROP FOREIGN KEY `ActividadRealizadaPersona_personalId_fkey`;

-- DropForeignKey
ALTER TABLE `actividadrealizadapersona` DROP FOREIGN KEY `ActividadRealizadaPersona_realizadaId_fkey`;

-- AlterTable
ALTER TABLE `actividad` ADD COLUMN `tipoRecurso` ENUM('gente', 'tractor', 'mixta') NOT NULL DEFAULT 'gente';

-- DropTable
DROP TABLE `actividadrealizadapersona`;

-- CreateTable
CREATE TABLE `ActividadRealizadaLinea` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('gente', 'tractor', 'mixta') NOT NULL,
    `tractorId` VARCHAR(191) NULL,
    `operadorId` VARCHAR(191) NULL,
    `operadorHoras` DECIMAL(6, 2) NULL,
    `implementoId` VARCHAR(191) NULL,

    INDEX `ActividadRealizadaLinea_realizadaId_idx`(`realizadaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActividadRealizadaLineaPersona` (
    `lineaId` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `horas` DECIMAL(6, 2) NOT NULL,

    PRIMARY KEY (`lineaId`, `personalId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaLinea` ADD CONSTRAINT `ActividadRealizadaLinea_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `ActividadRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaLinea` ADD CONSTRAINT `ActividadRealizadaLinea_tractorId_fkey` FOREIGN KEY (`tractorId`) REFERENCES `Equipo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaLinea` ADD CONSTRAINT `ActividadRealizadaLinea_operadorId_fkey` FOREIGN KEY (`operadorId`) REFERENCES `Personal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaLinea` ADD CONSTRAINT `ActividadRealizadaLinea_implementoId_fkey` FOREIGN KEY (`implementoId`) REFERENCES `Equipo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaLineaPersona` ADD CONSTRAINT `ActividadRealizadaLineaPersona_lineaId_fkey` FOREIGN KEY (`lineaId`) REFERENCES `ActividadRealizadaLinea`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActividadRealizadaLineaPersona` ADD CONSTRAINT `ActividadRealizadaLineaPersona_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
