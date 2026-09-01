-- Candado de solo-lectura PERMANENTE por semana de nómina (29-ago-2026),
-- distinto de DiaCerrado (que es por día/Huerta y reversible).
CREATE TABLE `NominaSemanaConfirmada` (
    `fechaFin` DATE NOT NULL,
    `confirmadoPorId` VARCHAR(191) NOT NULL,
    `fechaConfirmacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`fechaFin`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
