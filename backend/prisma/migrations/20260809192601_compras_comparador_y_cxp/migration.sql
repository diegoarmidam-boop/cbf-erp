-- AlterTable: Proveedor - días de crédito (término general de pago, alimenta CxP)
ALTER TABLE `proveedor` ADD COLUMN `diasCredito` INTEGER NULL;

-- AlterTable: OrdenCompra - fecha de formalización (base del cálculo de CxP) y estado de pago
ALTER TABLE `ordencompra` ADD COLUMN `fechaFormalizacion` DATETIME(3) NULL;
ALTER TABLE `ordencompra` ADD COLUMN `pagada` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `ordencompra` ADD COLUMN `fechaPago` DATETIME(3) NULL;

-- Backfill: órdenes que ya están generadas/recibidas se formalizaron al quedar cotizadas;
-- no hay forma de saber la fecha exacta retroactivamente, se usa fechaCreacion como mejor aproximación.
UPDATE `ordencompra` SET `fechaFormalizacion` = `fechaCreacion` WHERE `estado` IN ('generada', 'recibida') AND `fechaFormalizacion` IS NULL;

-- CreateTable: Comparador de Cotizaciones (persistido)
CREATE TABLE `comparacion` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NULL,
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `comparacionitem` (
    `id` VARCHAR(191) NOT NULL,
    `comparacionId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `cantidadNecesaria` DECIMAL(12, 3) NOT NULL,
    `unidad` VARCHAR(191) NOT NULL,

    INDEX `comparacionitem_comparacionId_idx`(`comparacionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `comparacioncotizacion` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `proveedorId` VARCHAR(191) NOT NULL,
    `precioPresentacion` DECIMAL(10, 2) NOT NULL,
    `cantidadPresentacion` DECIMAL(10, 3) NOT NULL,
    `unidadPresentacion` VARCHAR(191) NOT NULL,

    INDEX `comparacioncotizacion_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `comparacionitem` ADD CONSTRAINT `comparacionitem_comparacionId_fkey` FOREIGN KEY (`comparacionId`) REFERENCES `comparacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `comparacionitem` ADD CONSTRAINT `comparacionitem_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `comparacioncotizacion` ADD CONSTRAINT `comparacioncotizacion_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `comparacionitem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `comparacioncotizacion` ADD CONSTRAINT `comparacioncotizacion_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `proveedor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
