-- DropIndex
DROP INDEX `OrdenCompra_numero_key` ON `ordencompra`;

-- AlterTable
ALTER TABLE `comparacioncotizacion` ADD COLUMN `cantidadDisponible` DECIMAL(12, 3) NULL,
    ADD COLUMN `cantidadDisponibleTotal` BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX `OrdenCompra_numero_idx` ON `OrdenCompra`(`numero`);

-- RenameIndex
ALTER TABLE `centrocosto` RENAME INDEX `centrocosto_nombre_key` TO `CentroCosto_nombre_key`;
