-- Aplicaciones (9.7, 8-ago-2026): el recurso de Paso 1 pasa de fijo
-- (Con gente/Con implemento + equipo) a sugerencia (Mochila/Turbina/Aguilón,
-- ModalidadAplicacion) — el detalle real ahora se captura por línea dentro
-- de cada reporte de avance. Fertilización Granular (9.5) NO cambia, sigue
-- con RecursoTipo — el documento no extendió esta corrección ahí.
ALTER TABLE `Aplicacion` ADD COLUMN `recursoSugerido` ENUM('mochila', 'turbina', 'aguilon') NULL;

-- Backfill: únicas Aplicaciones reales existentes al momento de esta
-- migración (verificado antes de escribirla) — traducción lo más fiel
-- posible del recurso fijo anterior (gente->mochila, implemento->turbina).
UPDATE `Aplicacion` SET `recursoSugerido` = CASE WHEN `recursoTipo` = 'implemento' THEN 'turbina' ELSE 'mochila' END;

ALTER TABLE `Aplicacion` MODIFY `recursoSugerido` ENUM('mochila', 'turbina', 'aguilon') NOT NULL;

ALTER TABLE `Aplicacion` DROP FOREIGN KEY `Aplicacion_equipoId_fkey`;
ALTER TABLE `Aplicacion` DROP COLUMN `equipoId`;
ALTER TABLE `Aplicacion` DROP COLUMN `recursoTipo`;

-- Reportes de avance (Paso 2): quién/cómo se hizo pasa de un solo
-- personalId/grupoId/horas fijo por reporte a varias líneas por modalidad
-- (aplicacionrealizadalinea) — pueden combinarse varias líneas en el mismo
-- reporte (ej. una cuadrilla con Mochila y otra con Aguilón el mismo día).
CREATE TABLE `aplicacionrealizadalinea` (
    `id` VARCHAR(191) NOT NULL,
    `realizadaId` VARCHAR(191) NOT NULL,
    `modalidad` ENUM('mochila', 'turbina', 'aguilon') NOT NULL,
    `tractorId` VARCHAR(191) NULL,
    `operadorId` VARCHAR(191) NULL,
    `implementoId` VARCHAR(191) NULL,
    `horas` DECIMAL(6, 2) NOT NULL,

    INDEX `aplicacionrealizadalinea_realizadaId_idx`(`realizadaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Lista de personas de una línea específica (Mochila: todas; Aguilón: el
-- grupo detrás del tractor, aparte del operador).
CREATE TABLE `aplicacionrealizadalineapersona` (
    `lineaId` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`lineaId`, `personalId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `aplicacionrealizadalinea` ADD CONSTRAINT `aplicacionrealizadalinea_realizadaId_fkey` FOREIGN KEY (`realizadaId`) REFERENCES `AplicacionRealizada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `aplicacionrealizadalinea` ADD CONSTRAINT `aplicacionrealizadalinea_tractorId_fkey` FOREIGN KEY (`tractorId`) REFERENCES `Equipo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `aplicacionrealizadalinea` ADD CONSTRAINT `aplicacionrealizadalinea_operadorId_fkey` FOREIGN KEY (`operadorId`) REFERENCES `Personal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `aplicacionrealizadalinea` ADD CONSTRAINT `aplicacionrealizadalinea_implementoId_fkey` FOREIGN KEY (`implementoId`) REFERENCES `Equipo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `aplicacionrealizadalineapersona` ADD CONSTRAINT `aplicacionrealizadalineapersona_lineaId_fkey` FOREIGN KEY (`lineaId`) REFERENCES `aplicacionrealizadalinea`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `aplicacionrealizadalineapersona` ADD CONSTRAINT `aplicacionrealizadalineapersona_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: únicos 2 reportes reales existentes al momento de esta
-- migración (personalId sin grupoId en ambos, verificado antes de
-- escribirla) — se traducen a UNA línea "mochila" cada uno con esa persona
-- y esas horas. El caso "implemento" (folio IA-001) no conserva qué
-- implemento se usó porque el modelo anterior nunca capturó un
-- tractor/operador separados — no hay forma fiel de reconstruirlo sin
-- inventar un dato que nunca se llegó a capturar.
INSERT INTO `aplicacionrealizadalinea` (`id`, `realizadaId`, `modalidad`, `horas`)
SELECT UUID(), `id`, 'mochila', `horas` FROM `AplicacionRealizada` WHERE `personalId` IS NOT NULL;

INSERT INTO `aplicacionrealizadalineapersona` (`lineaId`, `personalId`)
SELECT l.`id`, r.`personalId`
FROM `aplicacionrealizadalinea` l
JOIN `AplicacionRealizada` r ON r.`id` = l.`realizadaId`
WHERE r.`personalId` IS NOT NULL;

ALTER TABLE `AplicacionRealizada` DROP COLUMN `personalId`;
ALTER TABLE `AplicacionRealizada` DROP COLUMN `grupoId`;
ALTER TABLE `AplicacionRealizada` DROP COLUMN `horas`;

-- Uso diario (9.13): alimentación automática desde líneas de
-- Turbina/Aguilón de Aplicaciones — trazabilidad/idempotencia, mismo
-- patrón que `referenciaOrigenId` en RegistroNomina.
ALTER TABLE `EquipoUsoDiario` ADD COLUMN `origen` ENUM('manual', 'automatico_aplicacion') NOT NULL DEFAULT 'manual';
ALTER TABLE `EquipoUsoDiario` ADD COLUMN `referenciaLineaId` VARCHAR(191) NULL;
ALTER TABLE `EquipoUsoDiario` ADD INDEX `EquipoUsoDiario_referenciaLineaId_idx`(`referenciaLineaId`);
