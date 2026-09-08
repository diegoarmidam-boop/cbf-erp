-- AlterTable
ALTER TABLE `ordencompra` ADD COLUMN `solicitudManualId` VARCHAR(191) NULL,
    ADD COLUMN `titulo` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `OrdenCompra_solicitudManualId_idx` ON `OrdenCompra`(`solicitudManualId`);
