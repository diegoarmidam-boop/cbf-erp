-- AlterTable
ALTER TABLE `personal` ADD COLUMN `noDisponibleDesde` DATE NULL;

-- CreateTable
CREATE TABLE `Liquidacion` (
    `id` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFin` DATE NOT NULL,
    `bruto` DECIMAL(10, 2) NOT NULL,
    `bonos` DECIMAL(10, 2) NOT NULL,
    `descuentoPrestamos` DECIMAL(10, 2) NOT NULL,
    `neto` DECIMAL(10, 2) NOT NULL,
    `liquidadoPorId` VARCHAR(191) NOT NULL,
    `fechaLiquidacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Liquidacion_personalId_idx`(`personalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Liquidacion` ADD CONSTRAINT `Liquidacion_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
