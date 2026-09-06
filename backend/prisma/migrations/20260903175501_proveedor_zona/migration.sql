-- AlterTable
ALTER TABLE `proveedor` ADD COLUMN `zonaId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Proveedor` ADD CONSTRAINT `Proveedor_zonaId_fkey` FOREIGN KEY (`zonaId`) REFERENCES `ZonaFlete`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
