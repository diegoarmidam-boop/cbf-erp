-- Prioridad 4 (14-sep-2026): litros de agua aplicados por riego.
-- Gasto de cintilla (L/m/hora) por Ciclo -- se re-confirma cada Ciclo nuevo.
ALTER TABLE `ciclo` ADD COLUMN `gastoCintillaLHoraM` DECIMAL(8, 4) NULL;

-- Líneas de cintilla por surco, por Sección de Riego, con historial por
-- fecha (mismo patrón que CuadroVersion) -- puede cambiar a mitad de Ciclo.
CREATE TABLE `seccionriegolineascintilla` (
    `id` VARCHAR(191) NOT NULL,
    `seccionId` VARCHAR(191) NOT NULL,
    `lineas` INTEGER NOT NULL,
    `vigenteDesde` DATE NOT NULL,
    `vigenteHasta` DATE NULL,

    INDEX `seccionriegolineascintilla_seccionId_vigenteDesde_idx`(`seccionId`, `vigenteDesde`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `seccionriegolineascintilla` ADD CONSTRAINT `seccionriegolineascintilla_seccionId_fkey` FOREIGN KEY (`seccionId`) REFERENCES `seccionriego`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Litros aplicados, calculado y guardado en cada registro diario de riego
-- (histórico exacto -- ver comentario en schema.prisma).
ALTER TABLE `riegoregistrodiario` ADD COLUMN `litrosAplicados` DECIMAL(12, 3) NULL;
