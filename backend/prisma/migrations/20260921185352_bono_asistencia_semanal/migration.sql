-- V1 P7 (21-sep-2026): Bono de Asistencia Semanal.
ALTER TABLE `personal`
    ADD COLUMN `bonoAsistenciaNunca` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `bonoAsistenciaMedioTiempo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `bonoAsistenciaMontoEspecial` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `bonoasistenciaajuste` (
    `id` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `diaCompleto` BOOLEAN NOT NULL,
    `justificado` BOOLEAN NOT NULL,
    `nota` TEXT NULL,
    `capturadoPorId` VARCHAR(191) NOT NULL,
    `fechaCaptura` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bonoasistenciaajuste_fecha_idx`(`fecha`),
    UNIQUE INDEX `bonoasistenciaajuste_personalId_fecha_key`(`personalId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `bonoasistenciacongelado` (
    `id` VARCHAR(191) NOT NULL,
    `personalId` VARCHAR(191) NOT NULL,
    `semanaNominaFin` DATE NOT NULL,
    `bonoInicio` DATE NOT NULL,
    `bonoFin` DATE NOT NULL,
    `monto` DECIMAL(10, 2) NOT NULL,
    `cumple` BOOLEAN NOT NULL,
    `motivoSinBono` VARCHAR(191) NULL,
    `detalleDias` JSON NOT NULL,
    `congeladoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `congeladoPorId` VARCHAR(191) NOT NULL,

    INDEX `bonoasistenciacongelado_semanaNominaFin_idx`(`semanaNominaFin`),
    UNIQUE INDEX `bonoasistenciacongelado_personalId_semanaNominaFin_key`(`personalId`, `semanaNominaFin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `bonoasistenciaajuste` ADD CONSTRAINT `bonoasistenciaajuste_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `bonoasistenciacongelado` ADD CONSTRAINT `bonoasistenciacongelado_personalId_fkey` FOREIGN KEY (`personalId`) REFERENCES `personal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
