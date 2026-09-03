-- Destino obligatorio en solicitudes manuales de Compras (4.1, 2-sep-2026):
-- Centro de Costo (catálogo abierto nuevo) o Huerta específica. Verificado
-- antes de escribir esta migración: 22 filas en ordencompra (ALTER, no se
-- pierden, columnas nuevas nulas), tabla centrocosto no existía todavía.

-- CreateTable: CentroCosto (catálogo abierto "+" propio de Compras)
CREATE TABLE `centrocosto` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `centrocosto_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Semilla inicial (Bloque 3 del documento vivo, + Laboratorio agregado 2-sep-2026)
INSERT INTO `centrocosto` (`id`, `nombre`, `activo`) VALUES
    (UUID(), 'Desarrollo', true),
    (UUID(), 'Cosecha', true),
    (UUID(), 'Empaque', true),
    (UUID(), 'Oficina/Administración', true),
    (UUID(), 'Bodega de Agroquímicos', true),
    (UUID(), 'Equipos y Maquinaria', true),
    (UUID(), 'Embarques', true),
    (UUID(), 'Indirectos/Prorrateables', true),
    (UUID(), 'Laboratorio', true);

-- AlterTable: OrdenCompra — Destino (obligatorio solo en manuales, ver ordenes.ts)
ALTER TABLE `ordencompra`
    ADD COLUMN `centroCostoId` VARCHAR(191) NULL,
    ADD COLUMN `huertaDestinoId` VARCHAR(191) NULL;

ALTER TABLE `ordencompra` ADD CONSTRAINT `OrdenCompra_centroCostoId_fkey` FOREIGN KEY (`centroCostoId`) REFERENCES `centrocosto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ordencompra` ADD CONSTRAINT `OrdenCompra_huertaDestinoId_fkey` FOREIGN KEY (`huertaDestinoId`) REFERENCES `huerta`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
