-- Presentación (Contenedor + Cantidad) deja de ser fija por Producto
-- Comercial (Prioridad 2, 4-sep-2026). El historial de compras/inventario
-- ya se vació a propósito en esta misma sesión (respaldo tomado antes en
-- ops/backups/) para poder empezar de cero, así que `producto` es la única
-- tabla de esta migración con filas existentes (14) que pierden un valor
-- de solo-display (contenedor/presentacionCantidad nunca se usaban en
-- ningún cálculo, confirmado antes de escribir esta migración).

-- AlterTable: Producto pierde Presentación fija (unidad base se queda)
ALTER TABLE `producto` DROP COLUMN `contenedor`,
    DROP COLUMN `presentacionCantidad`;

-- AlterTable: ProductoLote guarda la Presentación con la que llegó cada lote
ALTER TABLE `productolote` ADD COLUMN `contenedor` VARCHAR(191) NULL,
    ADD COLUMN `presentacionCantidad` DECIMAL(10, 3) NULL;

-- AlterTable: OrdenCompraRecepcion captura "X Contenedores de Y Cantidad"
ALTER TABLE `ordencomprarecepcion` ADD COLUMN `contenedor` VARCHAR(191) NOT NULL,
    ADD COLUMN `presentacionCantidad` DECIMAL(10, 3) NOT NULL,
    ADD COLUMN `numeroUnidades` DECIMAL(10, 3) NOT NULL;

-- AlterTable: ComparacionCotizacion agrega Contenedor (la cantidad ya existía)
ALTER TABLE `comparacioncotizacion` ADD COLUMN `contenedor` VARCHAR(191) NOT NULL;
