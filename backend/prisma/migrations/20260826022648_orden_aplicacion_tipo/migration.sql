-- AlterTable
ALTER TABLE `aplicacion` ADD COLUMN `tipoAplicacionId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Aplicacion` ADD CONSTRAINT `Aplicacion_tipoAplicacionId_fkey` FOREIGN KEY (`tipoAplicacionId`) REFERENCES `TipoAplicacion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
