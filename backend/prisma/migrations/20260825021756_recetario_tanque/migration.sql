-- AlterTable
ALTER TABLE `aplicacion` ADD COLUMN `capacidadTanque` DECIMAL(10, 2) NULL,
    ADD COLUMN `recetaId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `fertirriegoprogramacion` ADD COLUMN `capacidadTanque` DECIMAL(10, 2) NULL,
    ADD COLUMN `recetaId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `TipoAplicacion` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `TipoAplicacion_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Receta` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `modulo` ENUM('aplicaciones', 'fertirriego') NOT NULL,
    `tipoAplicacionId` VARCHAR(191) NULL,
    `litrosPorHa` DECIMAL(10, 4) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecetaProducto` (
    `id` VARCHAR(191) NOT NULL,
    `recetaId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `concentracionValor` DECIMAL(10, 4) NOT NULL,
    `concentracionUnidad` ENUM('ml_l', 'g_l', 'kg_l') NOT NULL,

    INDEX `RecetaProducto_recetaId_idx`(`recetaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Receta` ADD CONSTRAINT `Receta_tipoAplicacionId_fkey` FOREIGN KEY (`tipoAplicacionId`) REFERENCES `TipoAplicacion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecetaProducto` ADD CONSTRAINT `RecetaProducto_recetaId_fkey` FOREIGN KEY (`recetaId`) REFERENCES `Receta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecetaProducto` ADD CONSTRAINT `RecetaProducto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Aplicacion` ADD CONSTRAINT `Aplicacion_recetaId_fkey` FOREIGN KEY (`recetaId`) REFERENCES `Receta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertirriegoProgramacion` ADD CONSTRAINT `FertirriegoProgramacion_recetaId_fkey` FOREIGN KEY (`recetaId`) REFERENCES `Receta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
