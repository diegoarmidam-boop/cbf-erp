-- Producto Comercial reemplaza el texto libre "Nombre Comercial" en las
-- cotizaciones del Comparador (Prioridad 2, 3-sep-2026) — se elige del
-- catálogo de Almacén en vez de capturarse a mano cada vez. Verificado
-- antes de escribir esta migración: 1 sola fila existente en
-- comparacioncotizacion, se respalda con el productoId de su propia
-- Comparación (la mejor referencia disponible, ya del mismo Ingrediente
-- Activo por construcción).

ALTER TABLE `comparacioncotizacion` ADD COLUMN `productoComercialId` VARCHAR(191) NULL;

UPDATE `comparacioncotizacion` cc
JOIN `comparacion` c ON cc.comparacionId = c.id
SET cc.productoComercialId = c.productoId
WHERE cc.productoComercialId IS NULL;

ALTER TABLE `comparacioncotizacion` MODIFY COLUMN `productoComercialId` VARCHAR(191) NOT NULL;
ALTER TABLE `comparacioncotizacion` DROP COLUMN `nombreComercial`;

ALTER TABLE `comparacioncotizacion` ADD CONSTRAINT `ComparacionCotizacion_productoComercialId_fkey` FOREIGN KEY (`productoComercialId`) REFERENCES `producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
