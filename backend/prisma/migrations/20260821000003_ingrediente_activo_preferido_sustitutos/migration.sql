-- AlterTable
ALTER TABLE `ingredienteactivo` ADD COLUMN `productoPreferidoId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `IngredienteActivoSustituto` (
    `id` VARCHAR(191) NOT NULL,
    `ingredienteActivoId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `orden` INTEGER NOT NULL,

    INDEX `IngredienteActivoSustituto_ingredienteActivoId_idx`(`ingredienteActivoId`),
    UNIQUE INDEX `IngredienteActivoSustituto_ingredienteActivoId_productoId_key`(`ingredienteActivoId`, `productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `IngredienteActivo` ADD CONSTRAINT `IngredienteActivo_productoPreferidoId_fkey` FOREIGN KEY (`productoPreferidoId`) REFERENCES `Producto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IngredienteActivoSustituto` ADD CONSTRAINT `IngredienteActivoSustituto_ingredienteActivoId_fkey` FOREIGN KEY (`ingredienteActivoId`) REFERENCES `IngredienteActivo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IngredienteActivoSustituto` ADD CONSTRAINT `IngredienteActivoSustituto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
