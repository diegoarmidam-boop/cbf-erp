-- Reversión 27-ago-2026: Fertirriego deja de usar concentración + litros de
-- agua/ha + tanque (modelo de Aplicaciones) y pasa a dosis directa por
-- hectárea. Sin datos existentes que migrar (0 recetas de Fertirriego y 0
-- FertirriegoProgramacion al momento de esta migración, verificado antes de
-- escribirla).

-- DropForeignKey
ALTER TABLE `fertirriegoprogramacion` DROP FOREIGN KEY `FertirriegoProgramacion_recetaId_fkey`;

-- AlterTable: quita litrosAguaPorHa y capacidadTanque (ya no aplican)
ALTER TABLE `fertirriegoprogramacion` DROP COLUMN `litrosAguaPorHa`,
    DROP COLUMN `capacidadTanque`;

-- AlterTable: dosisUnidad pasa de unidad de concentración a unidad de dosis/ha
ALTER TABLE `FertirriegoProgramacionProducto` MODIFY `dosisUnidad` ENUM('kg_ha', 'l_ha', 'g_ha') NOT NULL;

-- CreateTable: Recetario propio de Fertirriego (separado del Receta de Aplicaciones)
CREATE TABLE `RecetaFertirriego` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecetaFertirriegoProducto` (
    `id` VARCHAR(191) NOT NULL,
    `recetaId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `dosisValor` DECIMAL(10, 4) NOT NULL,
    `dosisUnidad` ENUM('kg_ha', 'l_ha', 'g_ha') NOT NULL,

    INDEX `RecetaFertirriegoProducto_recetaId_idx`(`recetaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RecetaFertirriegoProducto` ADD CONSTRAINT `RecetaFertirriegoProducto_recetaId_fkey` FOREIGN KEY (`recetaId`) REFERENCES `RecetaFertirriego`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecetaFertirriegoProducto` ADD CONSTRAINT `RecetaFertirriegoProducto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: fertirriegoprogramacion.recetaId ahora apunta a RecetaFertirriego
ALTER TABLE `fertirriegoprogramacion` ADD CONSTRAINT `FertirriegoProgramacion_recetaId_fkey` FOREIGN KEY (`recetaId`) REFERENCES `RecetaFertirriego`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
