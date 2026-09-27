-- V1 P4 (27-sep-2026): el flete viaja con el producto (9.14). Todo aditivo
-- — no toca OrdenCompra.precioUnitario ni Cuentas por Pagar.

CREATE TABLE `OrdenCompraFlete` (
    `id` VARCHAR(191) NOT NULL,
    `numero` INTEGER NOT NULL,
    `vinoConFlete` BOOLEAN NOT NULL DEFAULT false,
    `marcadoPorId` VARCHAR(191) NULL,
    `fechaMarcado` DATETIME(3) NULL,
    `montoTotal` DECIMAL(12,2) NULL,
    `capturadoPorId` VARCHAR(191) NULL,
    `fechaCaptura` DATETIME(3) NULL,
    `fechaCreacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `OrdenCompraFlete_numero_key`(`numero`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AjusteCostoHuerta` (
    `id` VARCHAR(191) NOT NULL,
    `huertaId` VARCHAR(191) NOT NULL,
    `productoId` VARCHAR(191) NOT NULL,
    `ordenCompraFleteId` VARCHAR(191) NOT NULL,
    `loteId` VARCHAR(191) NOT NULL,
    `cantidadYaEnviada` DECIMAL(12,3) NOT NULL,
    `fletePorKg` DECIMAL(12,4) NOT NULL,
    `montoAjuste` DECIMAL(12,2) NOT NULL,
    `periodoCerrado` BOOLEAN NOT NULL DEFAULT false,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `capturadoPorId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `AjusteCostoHuerta_huertaId_productoId_idx`(`huertaId`, `productoId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AjusteCostoHuerta` ADD CONSTRAINT `AjusteCostoHuerta_huertaId_fkey` FOREIGN KEY (`huertaId`) REFERENCES `Huerta`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AjusteCostoHuerta` ADD CONSTRAINT `AjusteCostoHuerta_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AjusteCostoHuerta` ADD CONSTRAINT `AjusteCostoHuerta_ordenCompraFleteId_fkey` FOREIGN KEY (`ordenCompraFleteId`) REFERENCES `OrdenCompraFlete`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AjusteCostoHuerta` ADD CONSTRAINT `AjusteCostoHuerta_loteId_fkey` FOREIGN KEY (`loteId`) REFERENCES `ProductoLote`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
