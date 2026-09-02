-- Comparador de Cotizaciones -> paso real de "Cotizar" en Compras
-- (2-sep-2026): compra parcial en varios Proveedores, cancelación ligada a
-- la programación de origen, confirmar producto recibido (preferido o
-- sustituto), y nueva sección de Configuración del sistema (datos de
-- facturación + firmas de Orden de Compra). Verificado antes de escribir
-- esta migración: 16 filas en ordencompra (ALTER, no se pierden), 0 filas
-- en comparacion/comparacioncotizacion/ordencomprarecepcion.

-- AlterTable: OrdenCompra — nuevos estados, folio, y liga a la cotización que la generó
ALTER TABLE `ordencompra`
    MODIFY `estado` ENUM('pendiente_autorizar', 'pendiente_cotizar', 'generada', 'recibida', 'rechazada', 'cancelada', 'cubierta') NOT NULL,
    ADD COLUMN `numero` INTEGER NULL,
    ADD COLUMN `comparacionCotizacionId` VARCHAR(191) NULL;

ALTER TABLE `ordencompra` ADD UNIQUE INDEX `OrdenCompra_numero_key`(`numero`);
ALTER TABLE `ordencompra` ADD CONSTRAINT `OrdenCompra_comparacionCotizacionId_fkey` FOREIGN KEY (`comparacionCotizacionId`) REFERENCES `comparacioncotizacion`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: OrdenCompraRecepcion — producto realmente recibido (preferido o sustituto)
ALTER TABLE `ordencomprarecepcion` ADD COLUMN `productoRecibidoId` VARCHAR(191) NULL;
ALTER TABLE `ordencomprarecepcion` ADD CONSTRAINT `OrdenCompraRecepcion_productoRecibidoId_fkey` FOREIGN KEY (`productoRecibidoId`) REFERENCES `producto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Comparacion — liga a la OrdenCompra "necesidad" que está cotizando
ALTER TABLE `comparacion` ADD COLUMN `ordenCompraId` VARCHAR(191) NULL;
ALTER TABLE `comparacion` ADD UNIQUE INDEX `Comparacion_ordenCompraId_key`(`ordenCompraId`);
ALTER TABLE `comparacion` ADD CONSTRAINT `Comparacion_ordenCompraId_fkey` FOREIGN KEY (`ordenCompraId`) REFERENCES `ordencompra`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: EmpresaConfig (fila única, id = "singleton")
CREATE TABLE `empresaconfig` (
    `id` VARCHAR(191) NOT NULL,
    `razonSocial` VARCHAR(191) NULL,
    `rfc` VARCHAR(191) NULL,
    `domicilioFiscal` VARCHAR(191) NULL,
    `telefono` VARCHAR(191) NULL,
    `firmaAtiendeNombre` VARCHAR(191) NULL,
    `firmaAutorizaNombre` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Contador (contador atómico genérico, primer uso: folio de Orden de Compra)
CREATE TABLE `contador` (
    `nombre` VARCHAR(191) NOT NULL,
    `valor` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`nombre`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
