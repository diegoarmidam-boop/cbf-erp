-- Rediseño completo del Comparador de Cotizaciones (29-ago-2026), a partir
-- del Excel real "Cotizador CBF": precio + flete por Zona, moneda MXN/USD,
-- un producto por comparación. Sin datos existentes que preservar (0 filas
-- en comparacion/comparacionitem/comparacioncotizacion al momento de esta
-- migración, verificado antes de escribirla) — se reemplazan las tablas
-- viejas por completo en vez de ALTER incremental.

-- DropForeignKey
ALTER TABLE `comparacioncotizacion` DROP FOREIGN KEY `comparacioncotizacion_itemId_fkey`;
ALTER TABLE `comparacioncotizacion` DROP FOREIGN KEY `comparacioncotizacion_proveedorId_fkey`;
ALTER TABLE `comparacionitem` DROP FOREIGN KEY `comparacionitem_comparacionId_fkey`;
ALTER TABLE `comparacionitem` DROP FOREIGN KEY `comparacionitem_productoId_fkey`;

-- DropTable
DROP TABLE `comparacioncotizacion`;
DROP TABLE `comparacionitem`;
DROP TABLE `comparacion`;

-- CreateTable
CREATE TABLE `ZonaFlete` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `costoFleteKg` DECIMAL(10, 4) NOT NULL,
    `esZonaComprador` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `ZonaFlete_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comparacion` (
    `id` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `cantidadNecesaria` DECIMAL(12, 3) NOT NULL,
    `unidad` VARCHAR(191) NOT NULL,
    `umbralExcedentePct` DECIMAL(5, 2) NOT NULL DEFAULT 20,
    `creadoPorId` VARCHAR(191) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ComparacionCotizacion` (
    `id` VARCHAR(191) NOT NULL,
    `comparacionId` VARCHAR(191) NOT NULL,
    `proveedorId` VARCHAR(191) NOT NULL,
    `zonaId` VARCHAR(191) NOT NULL,
    `nombreComercial` VARCHAR(191) NOT NULL,
    `moneda` ENUM('MXN', 'USD') NOT NULL DEFAULT 'MXN',
    `precioValor` DECIMAL(10, 2) NOT NULL,
    `tipoCambio` DECIMAL(10, 4) NULL,
    `presentacionCantidad` DECIMAL(10, 3) NOT NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ComparacionCotizacion_comparacionId_idx`(`comparacionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Comparacion` ADD CONSTRAINT `Comparacion_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComparacionCotizacion` ADD CONSTRAINT `ComparacionCotizacion_comparacionId_fkey` FOREIGN KEY (`comparacionId`) REFERENCES `Comparacion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComparacionCotizacion` ADD CONSTRAINT `ComparacionCotizacion_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `proveedor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ComparacionCotizacion` ADD CONSTRAINT `ComparacionCotizacion_zonaId_fkey` FOREIGN KEY (`zonaId`) REFERENCES `ZonaFlete`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
