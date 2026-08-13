/*
  Warnings:

  - You are about to drop the column `cantidadTotalCalculada` on the `aplicacion` table. All the data in the column will be lost.
  - You are about to drop the column `concentracionUnidad` on the `aplicacion` table. All the data in the column will be lost.
  - You are about to drop the column `concentracionValor` on the `aplicacion` table. All the data in the column will be lost.
  - You are about to drop the column `productoId` on the `aplicacion` table. All the data in the column will be lost.
  - You are about to drop the column `cantidadTotalCalculada` on the `fertilizaciongranular` table. All the data in the column will be lost.
  - You are about to drop the column `dosisValor` on the `fertilizaciongranular` table. All the data in the column will be lost.
  - You are about to drop the column `modoDosis` on the `fertilizaciongranular` table. All the data in the column will be lost.
  - You are about to drop the column `productoId` on the `fertilizaciongranular` table. All the data in the column will be lost.
  - You are about to drop the column `cantidadTotalCalculada` on the `fertirriegoprogramacion` table. All the data in the column will be lost.
  - You are about to drop the column `dosisUnidad` on the `fertirriegoprogramacion` table. All the data in the column will be lost.
  - You are about to drop the column `dosisValor` on the `fertirriegoprogramacion` table. All the data in the column will be lost.
  - You are about to drop the column `productoId` on the `fertirriegoprogramacion` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `aplicacion` DROP FOREIGN KEY `Aplicacion_productoId_fkey`;

-- DropForeignKey
ALTER TABLE `fertilizaciongranular` DROP FOREIGN KEY `FertilizacionGranular_productoId_fkey`;

-- DropForeignKey
ALTER TABLE `fertirriegoprogramacion` DROP FOREIGN KEY `FertirriegoProgramacion_productoId_fkey`;

-- DropIndex
DROP INDEX `Aplicacion_productoId_fkey` ON `aplicacion`;

-- DropIndex
DROP INDEX `FertilizacionGranular_productoId_fkey` ON `fertilizaciongranular`;

-- DropIndex
DROP INDEX `FertirriegoProgramacion_productoId_fkey` ON `fertirriegoprogramacion`;

-- AlterTable
ALTER TABLE `aplicacion` DROP COLUMN `cantidadTotalCalculada`,
    DROP COLUMN `concentracionUnidad`,
    DROP COLUMN `concentracionValor`,
    DROP COLUMN `productoId`;

-- AlterTable
ALTER TABLE `fertilizaciongranular` DROP COLUMN `cantidadTotalCalculada`,
    DROP COLUMN `dosisValor`,
    DROP COLUMN `modoDosis`,
    DROP COLUMN `productoId`;

-- AlterTable
ALTER TABLE `fertirriegoprogramacion` DROP COLUMN `cantidadTotalCalculada`,
    DROP COLUMN `dosisUnidad`,
    DROP COLUMN `dosisValor`,
    DROP COLUMN `productoId`;

-- CreateTable
CREATE TABLE `AplicacionProducto` (
    `id` VARCHAR(191) NOT NULL,
    `aplicacionId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `concentracionValor` DECIMAL(10, 4) NOT NULL,
    `concentracionUnidad` ENUM('ml_l', 'g_l', 'kg_l') NOT NULL,
    `cantidadTotalCalculada` DECIMAL(12, 4) NOT NULL,

    INDEX `AplicacionProducto_aplicacionId_idx`(`aplicacionId`),
    INDEX `AplicacionProducto_productoId_idx`(`productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertilizacionGranularProducto` (
    `id` VARCHAR(191) NOT NULL,
    `fertilizacionId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `modoDosis` ENUM('kg_ha', 'g_planta') NOT NULL,
    `dosisValor` DECIMAL(10, 4) NOT NULL,
    `cantidadTotalCalculada` DECIMAL(12, 4) NOT NULL,

    INDEX `FertilizacionGranularProducto_fertilizacionId_idx`(`fertilizacionId`),
    INDEX `FertilizacionGranularProducto_productoId_idx`(`productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertirriegoProgramacionProducto` (
    `id` VARCHAR(191) NOT NULL,
    `fertirriegoId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `dosisValor` DECIMAL(10, 4) NOT NULL,
    `dosisUnidad` ENUM('ml_l', 'g_l', 'kg_l') NOT NULL,
    `cantidadTotalCalculada` DECIMAL(12, 4) NOT NULL,

    INDEX `FertirriegoProgramacionProducto_fertirriegoId_idx`(`fertirriegoId`),
    INDEX `FertirriegoProgramacionProducto_productoId_idx`(`productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AplicacionProducto` ADD CONSTRAINT `AplicacionProducto_aplicacionId_fkey` FOREIGN KEY (`aplicacionId`) REFERENCES `Aplicacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AplicacionProducto` ADD CONSTRAINT `AplicacionProducto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranularProducto` ADD CONSTRAINT `FertilizacionGranularProducto_fertilizacionId_fkey` FOREIGN KEY (`fertilizacionId`) REFERENCES `FertilizacionGranular`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizacionGranularProducto` ADD CONSTRAINT `FertilizacionGranularProducto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertirriegoProgramacionProducto` ADD CONSTRAINT `FertirriegoProgramacionProducto_fertirriegoId_fkey` FOREIGN KEY (`fertirriegoId`) REFERENCES `FertirriegoProgramacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertirriegoProgramacionProducto` ADD CONSTRAINT `FertirriegoProgramacionProducto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
