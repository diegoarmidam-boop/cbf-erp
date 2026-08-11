-- AlterTable: motivo obligatorio cuando un fertirriego programado/entregado no se metió ese día (9.6)
ALTER TABLE `riegoregistrodiario` ADD COLUMN `motivoNoAplicado` VARCHAR(191) NULL;
