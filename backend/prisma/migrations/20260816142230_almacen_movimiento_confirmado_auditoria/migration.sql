-- AlterTable
ALTER TABLE `almacencentralmovimiento` ADD COLUMN `confirmadoPorId` VARCHAR(191) NULL,
    ADD COLUMN `fechaConfirmado` DATETIME(3) NULL;
