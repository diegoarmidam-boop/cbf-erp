-- CreateTable: catálogos abiertos que respaldan los selects de alta de Producto
CREATE TABLE `categoriaproducto` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `categoriaproducto_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ingredienteactivo` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `ingredienteactivo_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `contenedor` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `contenedor_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed: valores base para que nada deje de ser seleccionable
INSERT INTO `categoriaproducto` (`id`, `nombre`, `activo`) VALUES
    (UUID(), 'agroquimico', true),
    (UUID(), 'fertilizante', true),
    (UUID(), 'refaccion', true),
    (UUID(), 'general', true);

INSERT INTO `contenedor` (`id`, `nombre`, `activo`) VALUES
    (UUID(), 'Saco', true),
    (UUID(), 'Bote', true),
    (UUID(), 'Garrafa', true),
    (UUID(), 'Tanque', true),
    (UUID(), 'Bolsa', true);

-- Ingrediente activo ya usado por productos reales existentes, para que siga apareciendo en el select
INSERT INTO `ingredienteactivo` (`id`, `nombre`, `activo`)
SELECT DISTINCT UUID(), `ingredienteActivo`, true FROM `producto` WHERE `ingredienteActivo` IS NOT NULL AND `ingredienteActivo` <> '';

-- AlterTable: presentación pasa de texto libre a 3 campos (contenedor/cantidad/unidad ya existía)
ALTER TABLE `producto` ADD COLUMN `contenedor` VARCHAR(191) NULL;
ALTER TABLE `producto` ADD COLUMN `presentacionCantidad` DECIMAL(10, 3) NULL;

-- Backfill de los 2 productos reales existentes a partir de su presentación anterior en texto libre
UPDATE `producto` SET `contenedor` = 'Saco', `presentacionCantidad` = 25 WHERE `nombreComercial` = 'Boromix';
UPDATE `producto` SET `contenedor` = 'bidon', `presentacionCantidad` = 1 WHERE `nombreComercial` = 'nananan';

ALTER TABLE `producto` MODIFY `contenedor` VARCHAR(191) NOT NULL;
ALTER TABLE `producto` MODIFY `presentacionCantidad` DECIMAL(10, 3) NOT NULL;

ALTER TABLE `producto` DROP COLUMN `presentacion`;
