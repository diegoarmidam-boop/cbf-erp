-- V1 P3 (26-sep-2026): CombustibleCarga no guardaba de qué producto salía
-- (aditivo, 0 registros existentes) — necesario para poder revertir el
-- descuento de Almacén Local si el reporte que la generó se edita/borra.
ALTER TABLE `CombustibleCarga` ADD COLUMN `productoId` VARCHAR(191) NULL;
ALTER TABLE `CombustibleCarga` ADD CONSTRAINT `CombustibleCarga_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
