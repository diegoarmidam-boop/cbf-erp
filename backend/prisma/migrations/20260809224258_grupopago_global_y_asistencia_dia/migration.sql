-- GrupoPago se vuelve catálogo global (9.11): ya no está ligado a ninguna Huerta.
ALTER TABLE `GrupoPago` DROP FOREIGN KEY `GrupoPago_huertaId_fkey`;
ALTER TABLE `GrupoPago` DROP COLUMN `huertaId`;

-- Asistencia dinámica y sustitución dentro de un Grupo de Pago, por día.
CREATE TABLE `grupoasistenciadia` (
    `id` VARCHAR(191) NOT NULL,
    `grupoId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('ausente', 'sustituto') NOT NULL,
    `registradoPorId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `grupoasistenciadia_grupoId_fecha_personalId_key`(`grupoId`, `fecha`, `personalId`),
    INDEX `grupoasistenciadia_grupoId_fecha_idx`(`grupoId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `grupoasistenciadia` ADD CONSTRAINT `grupoasistenciadia_grupoId_fkey` FOREIGN KEY (`grupoId`) REFERENCES `GrupoPago`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `grupoasistenciadia` ADD CONSTRAINT `grupoasistenciadia_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `Personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
