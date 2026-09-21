-- V1 P6 (21-sep-2026): historial de alertas informativas ya vistas.
CREATE TABLE `notificacionvista` (
    `id` VARCHAR(191) NOT NULL,
    `usuarioId` VARCHAR(191) NOT NULL,
    `clave` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `titulo` VARCHAR(191) NOT NULL,
    `detalle` TEXT NOT NULL,
    `enlace` VARCHAR(191) NOT NULL,
    `fechaEvento` DATETIME(3) NOT NULL,
    `vistaEn` DATETIME(3) NOT NULL,
    `automatica` BOOLEAN NOT NULL DEFAULT false,

    INDEX `notificacionvista_usuarioId_vistaEn_idx`(`usuarioId`, `vistaEn`),
    UNIQUE INDEX `notificacionvista_usuarioId_clave_key`(`usuarioId`, `clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `notificacionvista` ADD CONSTRAINT `notificacionvista_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
