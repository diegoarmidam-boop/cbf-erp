-- V1 P7 addendum, 27-sep-2026 (Parte B, 9.7/9.13): plantas de luz en el
-- avance con Drone. Nuevo tipo de Equipo "planta_luz" (folio AF, sin
-- horómetro ni odómetro), y las 2 tablas para capturar 1+ plantas por línea
-- de Drone, cada una con su propia carga de combustible (mismo mecanismo de
-- garrafa que el diésel del tractor) y su reparto de litros a Cuadros.

-- AlterTable
ALTER TABLE `equipo` MODIFY `tipo` ENUM('tractor', 'camioneta', 'remolque', 'implemento', 'drone', 'motobomba', 'planta_luz') NOT NULL;

-- CreateTable
CREATE TABLE `aplicacionrealizadalineaplanta` (
    `id` VARCHAR(191) NOT NULL,
    `lineaId` VARCHAR(191) NOT NULL,
    `plantaId` VARCHAR(191) NOT NULL,
    `combustibleCargaId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `aplicacionrealizadalineaplanta_combustibleCargaId_key`(`combustibleCargaId`),
    INDEX `aplicacionrealizadalineaplanta_lineaId_idx`(`lineaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aplicacionrealizadalineaplantacuadro` (
    `id` VARCHAR(191) NOT NULL,
    `lineaPlantaId` VARCHAR(191) NOT NULL,
    `cuadroId` VARCHAR(191) NOT NULL,
    `litrosAtribuidos` DECIMAL(10, 4) NOT NULL,

    INDEX `aplicacionrealizadalineaplantacuadro_cuadroId_idx`(`cuadroId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `aplicacionrealizadalineaplanta` ADD CONSTRAINT `aplicacionrealizadalineaplanta_lineaId_fkey` FOREIGN KEY (`lineaId`) REFERENCES `AplicacionRealizadaLinea`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `aplicacionrealizadalineaplanta` ADD CONSTRAINT `aplicacionrealizadalineaplanta_plantaId_fkey` FOREIGN KEY (`plantaId`) REFERENCES `Equipo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `aplicacionrealizadalineaplanta` ADD CONSTRAINT `aplicacionrealizadalineaplanta_combustibleCargaId_fkey` FOREIGN KEY (`combustibleCargaId`) REFERENCES `CombustibleCarga`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aplicacionrealizadalineaplantacuadro` ADD CONSTRAINT `aplicacionrealizadalineaplantacuadro_lineaPlantaId_fkey` FOREIGN KEY (`lineaPlantaId`) REFERENCES `aplicacionrealizadalineaplanta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `aplicacionrealizadalineaplantacuadro` ADD CONSTRAINT `aplicacionrealizadalineaplantacuadro_cuadroId_fkey` FOREIGN KEY (`cuadroId`) REFERENCES `Cuadro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
