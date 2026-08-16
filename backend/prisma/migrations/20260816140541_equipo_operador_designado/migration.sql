-- AlterTable
ALTER TABLE `equipo` ADD COLUMN `operadorDesignadoId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Equipo` ADD CONSTRAINT `Equipo_operadorDesignadoId_fkey` FOREIGN KEY (`operadorDesignadoId`) REFERENCES `Personal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
