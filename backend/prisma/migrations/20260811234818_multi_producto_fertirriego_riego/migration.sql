/*
  Warnings:

  - You are about to drop the column `cantidadAplicada` on the `riegoregistrodiario` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `riegoregistrodiario` DROP COLUMN `cantidadAplicada`;

-- CreateTable
CREATE TABLE `RiegoRegistroDiarioProducto` (
    `id` VARCHAR(191) NOT NULL,
    `registroId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `cantidadAplicada` DECIMAL(12, 4) NOT NULL,

    UNIQUE INDEX `RiegoRegistroDiarioProducto_registroId_productoId_key`(`registroId`, `productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RiegoRegistroDiarioProducto` ADD CONSTRAINT `RiegoRegistroDiarioProducto_registroId_fkey` FOREIGN KEY (`registroId`) REFERENCES `RiegoRegistroDiario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RiegoRegistroDiarioProducto` ADD CONSTRAINT `RiegoRegistroDiarioProducto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
